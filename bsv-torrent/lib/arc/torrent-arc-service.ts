/**
 * TorrentArcService
 * High-frequency ARC (Application Request Channel) integration for BSV torrent streaming micropayments
 * Supports batch broadcasting, rate limiting, failover, and performance monitoring
 */

import { Transaction, ARC } from '@bsv/sdk';

export interface ArcEndpoint {
  name: string;
  url: string;
  apiKey: string;
  priority: number;
  timeout: number;
  maxRetries: number;
  enabled: boolean;
  deploymentId?: string;
  callbackUrl?: string;
  callbackToken?: string;
}

export interface ArcConfig {
  endpoints: ArcEndpoint[];
  defaultTimeout: number;
  maxConcurrentBroadcasts: number;
  batchSize: number;
  retryBackoffMs: number;
  enableMetrics: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerResetTime: number;
  rateLimitPerSecond: number;
}

export interface BroadcastOptions {
  timeout?: number;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  maxRetries?: number;
  endpoint?: string;
}

export interface BroadcastResult {
  success: boolean;
  txid: string | null;
  endpoint: string | null;
  status: string | null;
  latency: number;
  retryCount?: number;
  errors?: string[];
}

export interface BatchBroadcastResult {
  totalTransactions: number;
  successfulBroadcasts: number;
  failedBroadcasts: number;
  results: BroadcastResult[];
  efficiency: number;
  throughput: number;
  averageLatency: number;
}

export interface StreamingBroadcastOptions {
  rateLimit?: number;
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  maxConcurrent?: number;
}

export interface BroadcastMetrics {
  totalBroadcasts: number;
  successfulBroadcasts: number;
  failedBroadcasts: number;
  averageLatency: number;
  requestsPerSecond: number;
  uptime: number;
}

export interface EndpointStats {
  name: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  status: 'healthy' | 'degraded' | 'failed';
  lastError?: string;
  lastErrorTime?: Date;
}

export interface ArcStatus {
  txid: string;
  status: string;
  blockHash?: string;
  blockHeight?: number;
  timestamp?: string;
}

export interface QueueStatus {
  size: number;
  priorityDistribution: {
    urgent: number;
    high: number;
    normal: number;
    low: number;
  };
  estimatedProcessingTime: number;
}

export interface PerformanceStats {
  uptime: number;
  requestsPerSecond: number;
  successRate: number;
  averageResponseTime: number;
  activeConnections: number;
}

interface QueuedTransaction {
  transaction: Transaction;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  timestamp: number;
  options?: BroadcastOptions;
  resolve: (result: BroadcastResult) => void;
  reject: (error: Error) => void;
}

interface CircuitBreaker {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime: number;
  resetTime: number;
}

export class TorrentArcService {
  private config: ArcConfig;
  private arcInstances = new Map<string, ARC>();
  private endpointStats = new Map<string, EndpointStats>();
  private metrics: BroadcastMetrics;
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private broadcastQueue: QueuedTransaction[] = [];
  private rateLimiter = new Map<number, number>(); // timestamp -> count
  private startTime: number;
  private activeConnections = 0;
  private isProcessingQueue = false;

  constructor(config: ArcConfig) {
    this.validateConfig(config);
    this.config = config;
    this.startTime = Date.now();
    this.initializeMetrics();
    this.initializeEndpointStats();
    this.initializeCircuitBreakers();
    // Queue processor is manually controlled for better testing
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: ArcConfig): void {
    if (!config.endpoints || config.endpoints.length === 0) {
      throw new Error('At least one ARC endpoint must be configured');
    }

    for (const endpoint of config.endpoints) {
      if (!this.isValidUrl(endpoint.url)) {
        throw new Error(`Invalid URL format for endpoint: ${endpoint.name}`);
      }
    }
  }

  /**
   * Check if URL is valid
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize metrics tracking
   */
  private initializeMetrics(): void {
    this.metrics = {
      totalBroadcasts: 0,
      successfulBroadcasts: 0,
      failedBroadcasts: 0,
      averageLatency: 0,
      requestsPerSecond: 0,
      uptime: 0
    };
  }

  /**
   * Initialize endpoint statistics
   */
  private initializeEndpointStats(): void {
    for (const endpoint of this.config.endpoints) {
      this.endpointStats.set(endpoint.name, {
        name: endpoint.name,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        status: 'healthy'
      });
    }
  }

  /**
   * Initialize circuit breakers
   */
  private initializeCircuitBreakers(): void {
    for (const endpoint of this.config.endpoints) {
      this.circuitBreakers.set(endpoint.name, {
        isOpen: false,
        failureCount: 0,
        lastFailureTime: 0,
        resetTime: this.config.circuitBreakerResetTime
      });
    }
  }

  /**
   * Create ARC instance for endpoint
   */
  private createArcInstance(endpoint: ArcEndpoint): ARC {
    if (this.arcInstances.has(endpoint.name)) {
      return this.arcInstances.get(endpoint.name)!;
    }

    const arcInstance = new ARC(endpoint.url, {
      apiKey: endpoint.apiKey,
      deploymentId: endpoint.deploymentId || 'torrent-service',
      callbackUrl: endpoint.callbackUrl,
      callbackToken: endpoint.callbackToken,
      timeout: endpoint.timeout
    });

    this.arcInstances.set(endpoint.name, arcInstance);
    return arcInstance;
  }

  /**
   * Get available endpoints sorted by priority
   */
  getAvailableEndpoints(): ArcEndpoint[] {
    return this.config.endpoints
      .filter(endpoint => endpoint.enabled)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get endpoint by name
   */
  private getEndpoint(name: string): ArcEndpoint | undefined {
    return this.config.endpoints.find(e => e.name === name);
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(endpointName: string): boolean {
    const breaker = this.circuitBreakers.get(endpointName);
    if (!breaker) return false;

    if (breaker.isOpen) {
      const now = Date.now();
      if (now - breaker.lastFailureTime > breaker.resetTime) {
        // Reset circuit breaker
        breaker.isOpen = false;
        breaker.failureCount = 0;
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Record failure for circuit breaker
   */
  private recordFailure(endpointName: string): void {
    const breaker = this.circuitBreakers.get(endpointName);
    if (!breaker) return;

    breaker.failureCount++;
    breaker.lastFailureTime = Date.now();

    if (breaker.failureCount >= this.config.circuitBreakerThreshold) {
      breaker.isOpen = true;
    }
  }

  /**
   * Record success for circuit breaker
   */
  private recordSuccess(endpointName: string): void {
    const breaker = this.circuitBreakers.get(endpointName);
    if (!breaker) return;

    breaker.failureCount = 0;
    breaker.isOpen = false;
  }

  /**
   * Check rate limit
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000);

    const currentCount = this.rateLimiter.get(currentSecond) || 0;
    if (currentCount >= this.config.rateLimitPerSecond) {
      return false;
    }

    this.rateLimiter.set(currentSecond, currentCount + 1);

    // Clean up old entries
    const cutoff = currentSecond - 60; // Keep last minute
    for (const [timestamp] of this.rateLimiter) {
      if (timestamp < cutoff) {
        this.rateLimiter.delete(timestamp);
      }
    }

    return true;
  }

  /**
   * Broadcast single transaction
   */
  async broadcast(transaction: Transaction, options: BroadcastOptions = {}): Promise<BroadcastResult> {
    if (!transaction) {
      throw new Error('Invalid transaction provided');
    }

    // Check rate limit
    if (!this.checkRateLimit()) {
      return {
        success: false,
        txid: null,
        endpoint: null,
        status: null,
        latency: 0,
        errors: ['Rate limit exceeded']
      };
    }

    const startTime = Date.now();
    const errors: string[] = [];
    let totalRetryCount = 0;

    // Get available endpoints
    const endpoints = this.getAvailableEndpoints();

    // Filter by specific endpoint if requested
    const targetEndpoints = options.endpoint
      ? endpoints.filter(e => e.name === options.endpoint)
      : endpoints;

    for (const endpoint of targetEndpoints) {
      // Check circuit breaker
      if (this.isCircuitBreakerOpen(endpoint.name)) {
        errors.push(`Circuit breaker open for endpoint: ${endpoint.name}`);
        continue;
      }

      const maxRetries = options.maxRetries ?? endpoint.maxRetries;
      let endpointSuccess = false;

      for (let attempt = 0; attempt <= maxRetries && !endpointSuccess; attempt++) {
        const attemptStartTime = Date.now();
        try {
          this.activeConnections++;
          const arc = this.createArcInstance(endpoint);

          const response = await Promise.race([
            arc.broadcast(transaction),
            this.timeoutPromise(options.timeout ?? endpoint.timeout)
          ]);

          // Success
          const latency = Math.max(1, Date.now() - startTime); // Ensure latency is at least 1ms
          this.recordSuccess(endpoint.name);
          this.updateStats(endpoint.name, true, latency);
          this.updateMetrics(true, latency);

          return {
            success: true,
            txid: response.txid,
            endpoint: endpoint.name,
            status: response.status,
            latency,
            retryCount: totalRetryCount,
            errors: errors.length > 0 ? errors : undefined
          };

        } catch (error: any) {
          totalRetryCount++;
          const errorMessage = this.formatError(error, endpoint.name);

          // Only add error message once per endpoint (not per retry)
          if (attempt === 0) {
            errors.push(errorMessage);
          }

          if (attempt < maxRetries) {
            // Exponential backoff
            await this.delay(this.config.retryBackoffMs * Math.pow(2, attempt));
          }
        } finally {
          this.activeConnections--;
        }
      }

      // All retries failed for this endpoint
      this.recordFailure(endpoint.name);
      this.updateStats(endpoint.name, false, Date.now() - startTime);
    }

    // All endpoints failed
    const latency = Math.max(1, Date.now() - startTime); // Ensure latency is at least 1ms
    this.updateMetrics(false, latency);

    return {
      success: false,
      txid: null,
      endpoint: null,
      status: null,
      latency,
      retryCount: totalRetryCount,
      errors
    };
  }

  /**
   * Batch broadcast multiple transactions
   */
  async batchBroadcast(
    transactions: Transaction[],
    options: { maxConcurrent?: number; optimizeForThroughput?: boolean } = {}
  ): Promise<BatchBroadcastResult> {
    if (transactions.length === 0) {
      return {
        totalTransactions: 0,
        successfulBroadcasts: 0,
        failedBroadcasts: 0,
        results: [],
        efficiency: 0,
        throughput: 0,
        averageLatency: 0
      };
    }

    const startTime = Date.now();
    const maxConcurrent = options.maxConcurrent ?? this.config.maxConcurrentBroadcasts;

    // Split into batches
    const batches = this.createBatches(transactions, this.config.batchSize);
    const results: BroadcastResult[] = [];

    // Process batches with concurrency control
    for (const batch of batches) {
      const batchResults = await this.processBatch(batch, maxConcurrent);
      results.push(...batchResults);
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // seconds
    const successfulBroadcasts = results.filter(r => r.success).length;
    const failedBroadcasts = results.length - successfulBroadcasts;
    const averageLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;

    return {
      totalTransactions: transactions.length,
      successfulBroadcasts,
      failedBroadcasts,
      results,
      efficiency: successfulBroadcasts / transactions.length,
      throughput: transactions.length / duration,
      averageLatency
    };
  }

  /**
   * Process a batch of transactions with concurrency control
   */
  private async processBatch(transactions: Transaction[], maxConcurrent: number): Promise<BroadcastResult[]> {
    const semaphore = new Semaphore(maxConcurrent);

    const promises = transactions.map(async (tx) => {
      const release = await semaphore.acquire();
      try {
        return await this.broadcast(tx);
      } finally {
        release();
      }
    });

    return Promise.all(promises);
  }

  /**
   * Create batches from transactions
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Streaming broadcast with rate limiting
   */
  async streamingBroadcast(
    transactions: Transaction[],
    options: StreamingBroadcastOptions = {}
  ): Promise<BatchBroadcastResult> {
    const rateLimit = options.rateLimit ?? this.config.rateLimitPerSecond;
    const maxConcurrent = options.maxConcurrent ?? this.config.maxConcurrentBroadcasts;

    const results: BroadcastResult[] = [];
    const startTime = Date.now();
    const delayBetweenBatches = 1000 / rateLimit; // ms per transaction

    // Process with rate limiting
    for (let i = 0; i < transactions.length; i += maxConcurrent) {
      const batch = transactions.slice(i, i + maxConcurrent);
      const batchResults = await this.processBatch(batch, maxConcurrent);
      results.push(...batchResults);

      // Rate limiting delay
      if (i + maxConcurrent < transactions.length) {
        await this.delay(delayBetweenBatches * batch.length);
      }
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const successfulBroadcasts = results.filter(r => r.success).length;
    const failedBroadcasts = results.length - successfulBroadcasts;
    const averageLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;

    return {
      totalTransactions: transactions.length,
      successfulBroadcasts,
      failedBroadcasts,
      results,
      efficiency: successfulBroadcasts / transactions.length,
      throughput: transactions.length / duration,
      averageLatency
    };
  }

  /**
   * Queue broadcast for processing
   */
  queueBroadcast(transaction: Transaction, options: BroadcastOptions = {}): Promise<BroadcastResult> {
    return new Promise((resolve, reject) => {
      const queuedTx: QueuedTransaction = {
        transaction,
        priority: options.priority ?? 'normal',
        timestamp: Date.now(),
        options,
        resolve,
        reject
      };

      // Check queue size limit
      const maxQueueSize = 1000; // Configurable limit
      if (this.broadcastQueue.length >= maxQueueSize) {
        reject(new Error('Broadcast queue is full'));
        return;
      }

      // Insert in priority order
      this.insertByPriority(queuedTx);
    });
  }

  /**
   * Insert transaction in queue by priority
   */
  private insertByPriority(queuedTx: QueuedTransaction): void {
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    const targetPriority = priorityOrder[queuedTx.priority];

    let insertIndex = this.broadcastQueue.length;
    for (let i = 0; i < this.broadcastQueue.length; i++) {
      const currentPriority = priorityOrder[this.broadcastQueue[i].priority];
      if (targetPriority < currentPriority) {
        insertIndex = i;
        break;
      }
    }

    this.broadcastQueue.splice(insertIndex, 0, queuedTx);
  }

  /**
   * Start queue processor (can be called manually for controlled processing)
   */
  startQueueProcessor(): void {
    if (this.isProcessingQueue) return;

    const processLoop = () => {
      if (!this.isProcessingQueue && this.broadcastQueue.length > 0) {
        this.processQueue().then(() => {
          if (this.broadcastQueue.length > 0) {
            setTimeout(processLoop, 100);
          }
        });
      }
    };

    processLoop();
  }

  /**
   * Process broadcast queue
   */
  async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;

    this.isProcessingQueue = true;

    try {
      while (this.broadcastQueue.length > 0) {
        const queuedTx = this.broadcastQueue.shift()!;

        try {
          const result = await this.broadcast(queuedTx.transaction, queuedTx.options);
          queuedTx.resolve(result);
        } catch (error) {
          queuedTx.reject(error as Error);
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(): QueueStatus {
    const priorityDistribution = {
      urgent: 0,
      high: 0,
      normal: 0,
      low: 0
    };

    for (const queuedTx of this.broadcastQueue) {
      priorityDistribution[queuedTx.priority]++;
    }

    const estimatedProcessingTime = this.broadcastQueue.length * 100; // rough estimate

    return {
      size: this.broadcastQueue.length,
      priorityDistribution,
      estimatedProcessingTime
    };
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(txid: string): Promise<ArcStatus> {
    const endpoints = this.getAvailableEndpoints();

    for (const endpoint of endpoints) {
      if (this.isCircuitBreakerOpen(endpoint.name)) continue;

      try {
        const arc = this.createArcInstance(endpoint);
        const status = await arc.getStatus(txid);
        return status;
      } catch (error) {
        // Try next endpoint
        continue;
      }
    }

    throw new Error(`Unable to get status for transaction: ${txid}`);
  }

  /**
   * Get batch transaction status
   */
  async getBatchTransactionStatus(txids: string[]): Promise<ArcStatus[]> {
    const promises = txids.map(txid => this.getTransactionStatus(txid));
    return Promise.all(promises);
  }

  /**
   * Monitor transaction with callbacks
   */
  async monitorTransaction(
    txid: string,
    options: {
      onStatusChange: (status: string, timestamp: Date) => void;
      pollInterval?: number;
      timeout?: number;
    }
  ): Promise<void> {
    const pollInterval = options.pollInterval ?? 1000;
    const timeout = options.timeout ?? 60000;
    const startTime = Date.now();

    const poll = async (): Promise<void> => {
      try {
        const status = await this.getTransactionStatus(txid);
        options.onStatusChange(status.status, new Date());

        if (status.status === 'CONFIRMED' || status.status === 'REJECTED') {
          return; // Stop polling
        }

        if (Date.now() - startTime < timeout) {
          setTimeout(poll, pollInterval);
        }
      } catch (error) {
        // Continue polling on error
        if (Date.now() - startTime < timeout) {
          setTimeout(poll, pollInterval);
        }
      }
    };

    await poll();
  }

  /**
   * Endpoint management methods
   */
  enableEndpoint(name: string): void {
    const endpoint = this.getEndpoint(name);
    if (endpoint) {
      endpoint.enabled = true;
    }
  }

  disableEndpoint(name: string): void {
    const endpoint = this.getEndpoint(name);
    if (endpoint) {
      endpoint.enabled = false;
    }
  }

  addEndpoint(endpoint: ArcEndpoint): void {
    this.config.endpoints.push(endpoint);
    this.initializeEndpointStats();
    this.initializeCircuitBreakers();
  }

  removeEndpoint(name: string): void {
    this.config.endpoints = this.config.endpoints.filter(e => e.name !== name);
    this.endpointStats.delete(name);
    this.circuitBreakers.delete(name);
    this.arcInstances.delete(name);
  }

  updateEndpoint(name: string, updates: Partial<ArcEndpoint>): void {
    const endpoint = this.getEndpoint(name);
    if (endpoint) {
      Object.assign(endpoint, updates);
      // Remove cached ARC instance to force recreation with new config
      this.arcInstances.delete(name);
    }
  }

  /**
   * Metrics and statistics
   */
  getMetrics(): BroadcastMetrics {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      requestsPerSecond: this.calculateRequestsPerSecond()
    };
  }

  getEndpointStats(): EndpointStats[] {
    return Array.from(this.endpointStats.values());
  }

  getPerformanceStats(): PerformanceStats {
    const now = Date.now();
    const uptime = now - this.startTime;
    const successRate = this.metrics.totalBroadcasts > 0
      ? this.metrics.successfulBroadcasts / this.metrics.totalBroadcasts
      : 0;

    return {
      uptime: uptime / 1000, // seconds
      requestsPerSecond: this.calculateRequestsPerSecond(),
      successRate,
      averageResponseTime: this.metrics.averageLatency,
      activeConnections: this.activeConnections
    };
  }

  getConfig(): ArcConfig {
    return { ...this.config };
  }

  /**
   * Private utility methods
   */
  private calculateRequestsPerSecond(): number {
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000);
    return this.rateLimiter.get(currentSecond) || 0;
  }

  private updateStats(endpointName: string, success: boolean, latency: number): void {
    const stats = this.endpointStats.get(endpointName);
    if (!stats) return;

    stats.totalRequests++;
    if (success) {
      stats.successfulRequests++;
      stats.status = 'healthy';
    } else {
      stats.failedRequests++;
      stats.status = stats.failedRequests / stats.totalRequests > 0.1 ? 'degraded' : 'healthy';
    }

    // Update average latency
    const totalLatency = stats.averageLatency * (stats.totalRequests - 1) + latency;
    stats.averageLatency = totalLatency / stats.totalRequests;
  }

  private updateMetrics(success: boolean, latency: number): void {
    this.metrics.totalBroadcasts++;
    if (success) {
      this.metrics.successfulBroadcasts++;
    } else {
      this.metrics.failedBroadcasts++;
    }

    // Update average latency
    const totalLatency = this.metrics.averageLatency * (this.metrics.totalBroadcasts - 1) + latency;
    this.metrics.averageLatency = totalLatency / this.metrics.totalBroadcasts;
  }

  private formatError(error: any, endpointName: string): string {
    if (error.message?.includes('timeout')) {
      return `Timeout error on ${endpointName}: ${error.message}`;
    } else if (error.message?.includes('ECONNREFUSED')) {
      return `Network connectivity issue with ${endpointName}`;
    } else {
      return `Error on ${endpointName}: ${error.message}`;
    }
  }

  private timeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Semaphore for concurrency control
 */
class Semaphore {
  private tasks: (() => void)[] = [];
  private count: number;

  constructor(count: number) {
    this.count = count;
  }

  acquire(): Promise<() => void> {
    return new Promise(resolve => {
      const task = () => {
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.count++;
            if (this.tasks.length > 0) {
              this.tasks.shift()!();
            }
          }
        });
      };

      if (this.count > 0) {
        this.count--;
        task();
      } else {
        this.tasks.push(task);
      }
    });
  }
}
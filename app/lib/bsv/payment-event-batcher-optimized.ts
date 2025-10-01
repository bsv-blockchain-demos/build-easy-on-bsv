import { EventEmitter } from 'events';

export interface PaymentEvent {
  torrentId: string;
  pieceIndex: number;
  amount: number;
  txId: string;
  timestamp: number;
  direction: 'sent' | 'received';
  peerId: string;
  chunkSize: number;
}

// Internal type with processing metadata
interface PaymentEventWithMetadata extends PaymentEvent {
  _processingStartTime: number;
}

export interface BatchMetrics {
  count: number;
  totalAmount: number;
  avgAmount: number;
  timespan: number;
  uniquePeers: number;
  piecesProgress: number;
  throughput: number; // events per second
}

// Extended metrics with flush reason
interface BatchMetricsExtended extends BatchMetrics {
  flushReason: 'overflow' | 'size' | 'timeout';
}

export interface PaymentBatch {
  batchKey: string;
  events: PaymentEvent[];
  metrics: BatchMetricsExtended;
  timestamp: number;
}

export interface OptimizedBatcherConfig {
  // Adaptive batching parameters
  minBatchSize: number;
  maxBatchSize: number;
  minBatchTimeout: number;
  maxBatchTimeout: number;

  // Performance thresholds
  highLoadEventsPerSec: number;
  lowLoadEventsPerSec: number;
  targetLatencyMs: number;

  // Memory management
  maxQueueSize: number;
  maxBatchesInMemory: number;

  // Auto-tuning sensitivity
  tuningIntervalMs: number;
  aggressiveTuning: boolean;
}

export class OptimizedPaymentEventBatcher extends EventEmitter {
  private batches = new Map<string, PaymentEventWithMetadata[]>();
  private batchTimers = new Map<string, NodeJS.Timeout>();
  private recentBatches: PaymentBatch[] = [];

  // Adaptive parameters (modified based on performance)
  private currentBatchSize: number;
  private currentBatchTimeout: number;

  // Performance monitoring
  private totalEventsProcessed = 0;
  private batchesEmitted = 0;
  private startTime = Date.now();
  private lastTuningTime = Date.now();
  private recentLatencies: number[] = [];
  private tuningTimer?: NodeJS.Timeout;

  // Configuration
  private config: OptimizedBatcherConfig;

  constructor(config?: Partial<OptimizedBatcherConfig>) {
    super();

    this.config = {
      minBatchSize: 10,
      maxBatchSize: 100,
      minBatchTimeout: 50,
      maxBatchTimeout: 500,
      highLoadEventsPerSec: 500,
      lowLoadEventsPerSec: 50,
      targetLatencyMs: 80,
      maxQueueSize: 2000,
      maxBatchesInMemory: 100,
      tuningIntervalMs: 2000,
      aggressiveTuning: true,
      ...config
    };

    // Start with balanced defaults
    this.currentBatchSize = Math.floor((this.config.minBatchSize + this.config.maxBatchSize) / 2);
    this.currentBatchTimeout = Math.floor((this.config.minBatchTimeout + this.config.maxBatchTimeout) / 2);

    this.setupOptimizedMonitoring();
  }

  addPaymentEvent(event: PaymentEvent): void {
    const eventStartTime = Date.now();
    const batchKey = `${event.torrentId}:${event.direction}`;

    if (!this.batches.has(batchKey)) {
      this.batches.set(batchKey, []);
    }

    const batch = this.batches.get(batchKey)!;

    // Enhanced memory overflow protection
    if (batch.length >= this.config.maxQueueSize) {
      console.warn(`Payment batch queue overflow for ${batchKey}, flushing immediately`);
      this.flushBatch(batchKey, true); // Force flush
    }

    // Add processing timestamp for latency tracking
    const enhancedEvent: PaymentEventWithMetadata = {
      ...event,
      _processingStartTime: eventStartTime
    };

    batch.push(enhancedEvent);
    this.totalEventsProcessed++;

    // Adaptive batch size check
    if (batch.length >= this.currentBatchSize) {
      this.flushBatch(batchKey);
      return;
    }

    // Set adaptive timeout
    if (!this.batchTimers.has(batchKey)) {
      const timer = setTimeout(() => {
        this.flushBatch(batchKey);
      }, this.currentBatchTimeout);

      this.batchTimers.set(batchKey, timer);
    }
  }

  private flushBatch(batchKey: string, forced = false): void {
    const batch = this.batches.get(batchKey);
    if (!batch || batch.length === 0) return;

    const flushTime = Date.now();

    // Clear timeout if exists
    const timer = this.batchTimers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(batchKey);
    }

    // Calculate latencies for optimization
    batch.forEach((event) => {
      const latency = flushTime - event._processingStartTime;
      this.recentLatencies.push(latency);
    });

    // Limit latency tracking array size
    if (this.recentLatencies.length > 1000) {
      this.recentLatencies = this.recentLatencies.slice(-500);
    }

    // Clean events before processing (remove internal metadata)
    const cleanEvents: PaymentEvent[] = batch.map((event) => {
      const { _processingStartTime, ...cleanEvent } = event;
      return cleanEvent;
    });

    // Calculate metrics
    const aggregatedMetrics = this.calculateBatchMetrics(cleanEvents);

    // Create optimized batch object
    const paymentBatch: PaymentBatch = {
      batchKey,
      events: cleanEvents,
      metrics: {
        ...aggregatedMetrics,
        flushReason: forced ? 'overflow' : (cleanEvents.length >= this.currentBatchSize ? 'size' : 'timeout')
      },
      timestamp: flushTime
    };

    // Emit batched payment events
    this.emit('payments:batch', paymentBatch);

    // Memory management for recent batches
    this.recentBatches.push(paymentBatch);
    if (this.recentBatches.length > this.config.maxBatchesInMemory) {
      this.recentBatches = this.recentBatches.slice(-this.config.maxBatchesInMemory);
    }

    // Update statistics
    this.batchesEmitted++;

    // Clear the batch
    this.batches.set(batchKey, []);

    // Emit performance-optimized individual events for specific listeners
    if (this.listenerCount('payment:single') > 0) {
      cleanEvents.forEach(event => {
        this.emit('payment:single', event);
      });
    }
  }

  private calculateBatchMetrics(batch: PaymentEvent[]): BatchMetrics {
    if (batch.length === 0) {
      return {
        count: 0,
        totalAmount: 0,
        avgAmount: 0,
        timespan: 0,
        uniquePeers: 0,
        piecesProgress: 0,
        throughput: 0
      };
    }

    const timestamps = batch.map(e => e.timestamp);
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const timespan = maxTime - minTime;

    const totalAmount = batch.reduce((sum, event) => sum + event.amount, 0);
    const uniquePeers = new Set(batch.map(e => e.peerId)).size;
    const piecesProgress = new Set(batch.map(e => e.pieceIndex)).size;

    return {
      count: batch.length,
      totalAmount,
      avgAmount: totalAmount / batch.length,
      timespan,
      uniquePeers,
      piecesProgress,
      throughput: timespan > 0 ? (batch.length / (timespan / 1000)) : batch.length
    };
  }

  // Enhanced performance monitoring
  private setupOptimizedMonitoring(): void {
    this.tuningTimer = setInterval(() => {
      this.performAdvancedTuning();
    }, this.config.tuningIntervalMs);
  }

  private performAdvancedTuning(): void {
    const metrics = this.getPerformanceMetrics();
    const { eventsPerSecond, queueDepth } = metrics;

    // Calculate average latency from recent measurements
    const avgLatency = this.recentLatencies.length > 0
      ? this.recentLatencies.reduce((sum, lat) => sum + lat, 0) / this.recentLatencies.length
      : 0;

    const adjustmentFactor = this.config.aggressiveTuning ? 1.5 : 1.2;
    let tuningAction = 'no_change';

    // High-frequency scenario optimizations
    if (eventsPerSecond > this.config.highLoadEventsPerSec) {
      // Under high load, prioritize throughput
      if (avgLatency > this.config.targetLatencyMs * 1.5) {
        // Latency too high - increase batch size, decrease timeout
        this.currentBatchSize = Math.min(
          this.config.maxBatchSize,
          Math.floor(this.currentBatchSize * adjustmentFactor)
        );
        this.currentBatchTimeout = Math.max(
          this.config.minBatchTimeout,
          Math.floor(this.currentBatchTimeout / adjustmentFactor)
        );
        tuningAction = 'high_load_latency_optimization';
      }

      if (queueDepth > this.currentBatchSize * 2) {
        // Queue building up - be more aggressive
        this.currentBatchSize = Math.min(
          this.config.maxBatchSize,
          this.currentBatchSize + 10
        );
        tuningAction = 'high_load_queue_optimization';
      }
    }
    // Low-frequency scenario optimizations
    else if (eventsPerSecond < this.config.lowLoadEventsPerSec) {
      // Under low load, prioritize responsiveness
      if (avgLatency > this.config.targetLatencyMs) {
        // Reduce timeout for better responsiveness
        this.currentBatchTimeout = Math.max(
          this.config.minBatchTimeout,
          Math.floor(this.currentBatchTimeout / 1.3)
        );
        tuningAction = 'low_load_responsiveness_optimization';
      }

      // Smaller batches for low load
      this.currentBatchSize = Math.max(
        this.config.minBatchSize,
        Math.floor(this.currentBatchSize / 1.2)
      );
    }
    // Medium load - balanced optimization
    else {
      // Target optimal latency
      if (avgLatency > this.config.targetLatencyMs * 1.2) {
        this.currentBatchTimeout = Math.max(
          this.config.minBatchTimeout,
          this.currentBatchTimeout - 10
        );
        tuningAction = 'medium_load_latency_tuning';
      } else if (avgLatency < this.config.targetLatencyMs * 0.5) {
        // Can afford slightly higher latency for better throughput
        this.currentBatchSize = Math.min(
          this.config.maxBatchSize,
          this.currentBatchSize + 5
        );
        tuningAction = 'medium_load_throughput_tuning';
      }
    }

    // Emit detailed tuning information
    this.emit('auto-tune:advanced', {
      action: tuningAction,
      currentBatchSize: this.currentBatchSize,
      currentBatchTimeout: this.currentBatchTimeout,
      avgLatency,
      eventsPerSecond,
      queueDepth,
      targetLatency: this.config.targetLatencyMs,
      timestamp: Date.now()
    });

    // Clear recent latencies periodically to avoid memory buildup
    if (this.recentLatencies.length > 100) {
      this.recentLatencies = this.recentLatencies.slice(-50);
    }
  }

  // Force flush all batches with optimization tracking
  flushAllBatches(): void {
    const startTime = Date.now();
    let totalFlushed = 0;

    for (const batchKey of this.batches.keys()) {
      const batchSize = this.batches.get(batchKey)?.length || 0;
      this.flushBatch(batchKey, true);
      totalFlushed += batchSize;
    }

    const flushTime = Date.now() - startTime;

    this.emit('flush:all', {
      totalEventsFlushed: totalFlushed,
      flushTimeMs: flushTime,
      batchesCount: this.batches.size,
      timestamp: Date.now()
    });
  }

  // Enhanced queue status with optimization info
  getQueueStatus(): Record<string, any> {
    const status: Record<string, any> = {};

    for (const [batchKey, batch] of this.batches.entries()) {
      status[batchKey] = {
        queueSize: batch.length,
        oldestEventAge: batch.length > 0 ? Date.now() - batch[0].timestamp : 0,
        willFlushIn: this.batchTimers.has(batchKey) ? 'timer_active' : 'no_timer'
      };
    }

    return status;
  }

  // Enhanced performance metrics
  getPerformanceMetrics() {
    const runTime = (Date.now() - this.startTime) / 1000;
    const avgLatency = this.recentLatencies.length > 0
      ? this.recentLatencies.reduce((sum, lat) => sum + lat, 0) / this.recentLatencies.length
      : 0;

    return {
      totalEventsProcessed: this.totalEventsProcessed,
      batchesEmitted: this.batchesEmitted,
      eventsPerSecond: this.totalEventsProcessed / runTime,
      batchesPerSecond: this.batchesEmitted / runTime,
      avgEventsPerBatch: this.batchesEmitted > 0 ? this.totalEventsProcessed / this.batchesEmitted : 0,
      runTime,
      queueDepth: Array.from(this.batches.values()).reduce((total, batch) => total + batch.length, 0),

      // Optimization metrics
      currentBatchSize: this.currentBatchSize,
      currentBatchTimeout: this.currentBatchTimeout,
      avgLatencyMs: avgLatency,
      recentBatchesCount: this.recentBatches.length,
      latencySamples: this.recentLatencies.length,

      // Performance targets
      targetLatencyMs: this.config.targetLatencyMs,
      latencyPerformance: avgLatency > 0 ? (this.config.targetLatencyMs / avgLatency) : 1,
      throughputTarget: this.config.highLoadEventsPerSec,
      throughputPerformance: (this.totalEventsProcessed / runTime) / this.config.highLoadEventsPerSec
    };
  }

  // Dynamic configuration updates
  updateConfig(newConfig: Partial<OptimizedBatcherConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Validate new parameters are within bounds
    this.currentBatchSize = Math.max(
      this.config.minBatchSize,
      Math.min(this.config.maxBatchSize, this.currentBatchSize)
    );

    this.currentBatchTimeout = Math.max(
      this.config.minBatchTimeout,
      Math.min(this.config.maxBatchTimeout, this.currentBatchTimeout)
    );

    // Restart active batch timers with new timeout values
    for (const [batchKey, timer] of this.batchTimers.entries()) {
      clearTimeout(timer);
      const newTimer = setTimeout(() => {
        this.flushBatch(batchKey);
      }, this.currentBatchTimeout);
      this.batchTimers.set(batchKey, newTimer);
    }

    // Restart tuning timer if interval changed
    if (newConfig.tuningIntervalMs !== undefined && this.tuningTimer) {
      clearInterval(this.tuningTimer);
      this.tuningTimer = setInterval(() => {
        this.performAdvancedTuning();
      }, this.config.tuningIntervalMs);
    }

    this.emit('config:updated', {
      oldConfig,
      newConfig: this.config,
      adjustedBatchSize: this.currentBatchSize,
      adjustedBatchTimeout: this.currentBatchTimeout,
      activeTimersRestarted: this.batchTimers.size,
      timestamp: Date.now()
    });
  }

  // Get recent performance trends
  getPerformanceTrends(): any {
    const recentBatchMetrics = this.recentBatches.slice(-20).map(batch => ({
      timestamp: batch.timestamp,
      eventCount: batch.events.length,
      totalAmount: batch.metrics.totalAmount,
      throughput: batch.metrics.throughput,
      uniquePeers: batch.metrics.uniquePeers
    }));

    const recentLatencyTrend = this.recentLatencies.slice(-50);

    return {
      recentBatches: recentBatchMetrics,
      latencyTrend: recentLatencyTrend,
      avgBatchSize: recentBatchMetrics.length > 0
        ? recentBatchMetrics.reduce((sum, b) => sum + b.eventCount, 0) / recentBatchMetrics.length
        : 0,
      latencyTrendDirection: this.calculateTrend(recentLatencyTrend)
    };
  }

  private calculateTrend(values: number[]): 'improving' | 'degrading' | 'stable' {
    if (values.length < 10) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;

    const change = (secondAvg - firstAvg) / firstAvg;

    if (change < -0.1) return 'improving'; // Latency decreased by >10%
    if (change > 0.1) return 'degrading';  // Latency increased by >10%
    return 'stable';
  }

  // Clean shutdown with enhanced cleanup
  shutdown(): void {
    // Clear tuning timer
    if (this.tuningTimer) {
      clearInterval(this.tuningTimer);
      this.tuningTimer = undefined;
    }

    // Flush all remaining batches
    this.flushAllBatches();

    // Clear all timers
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }
    this.batchTimers.clear();

    // Clear all data structures
    this.batches.clear();
    this.recentBatches = [];
    this.recentLatencies = [];

    // Remove all listeners
    this.removeAllListeners();

    this.emit('shutdown:complete', {
      finalMetrics: this.getPerformanceMetrics(),
      timestamp: Date.now()
    });
  }
}
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

export interface BatchMetrics {
  count: number;
  totalAmount: number;
  avgAmount: number;
  timespan: number;
  uniquePeers: number;
  piecesProgress: number;
  throughput: number; // events per second
}

export interface PaymentBatch {
  batchKey: string;
  events: PaymentEvent[];
  metrics: BatchMetrics;
  timestamp: number;
}

export class PaymentEventBatcher extends EventEmitter {
  private batches = new Map<string, PaymentEvent[]>();
  private batchTimers = new Map<string, NodeJS.Timeout>();
  private readonly BATCH_SIZE = 50; // 50 payments per batch
  private readonly BATCH_TIMEOUT = 250; // 250ms maximum batch time
  private readonly MAX_QUEUE_SIZE = 1000; // Prevent memory overflow

  // Performance monitoring
  private totalEventsProcessed = 0;
  private batchesEmitted = 0;
  private startTime = Date.now();

  constructor() {
    super();
    this.setupPerformanceMonitoring();
  }

  addPaymentEvent(event: PaymentEvent): void {
    const batchKey = `${event.torrentId}:${event.direction}`;

    if (!this.batches.has(batchKey)) {
      this.batches.set(batchKey, []);
    }

    const batch = this.batches.get(batchKey)!;

    // Prevent memory overflow with too many queued events
    if (batch.length >= this.MAX_QUEUE_SIZE) {
      console.warn(`Payment batch queue overflow for ${batchKey}, flushing immediately`);
      this.flushBatch(batchKey);
    }

    batch.push(event);
    this.totalEventsProcessed++;

    // Flush batch if it reaches the size limit
    if (batch.length >= this.BATCH_SIZE) {
      this.flushBatch(batchKey);
      return;
    }

    // Set timeout to flush batch if it hasn't reached size limit
    if (!this.batchTimers.has(batchKey)) {
      const timer = setTimeout(() => {
        this.flushBatch(batchKey);
      }, this.BATCH_TIMEOUT);

      this.batchTimers.set(batchKey, timer);
    }
  }

  private flushBatch(batchKey: string): void {
    const batch = this.batches.get(batchKey);
    if (!batch || batch.length === 0) return;

    // Clear timeout if exists
    const timer = this.batchTimers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(batchKey);
    }

    // Calculate aggregated metrics for the batch
    const aggregatedMetrics = this.calculateBatchMetrics(batch);

    // Create batch object
    const paymentBatch: PaymentBatch = {
      batchKey,
      events: [...batch], // Create a copy
      metrics: aggregatedMetrics,
      timestamp: Date.now()
    };

    // Emit batched payment events
    this.emit('payments:batch', paymentBatch);

    // Update statistics
    this.batchesEmitted++;

    // Clear the batch
    this.batches.set(batchKey, []);

    // Emit individual events for specific listeners
    for (const event of batch) {
      this.emit('payment:single', event);
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

  // Force flush all batches (useful for shutdown or urgent updates)
  flushAllBatches(): void {
    for (const batchKey of this.batches.keys()) {
      this.flushBatch(batchKey);
    }
  }

  // Get current queue status
  getQueueStatus(): Record<string, number> {
    const status: Record<string, number> = {};
    for (const [batchKey, batch] of this.batches.entries()) {
      status[batchKey] = batch.length;
    }
    return status;
  }

  // Get performance metrics
  getPerformanceMetrics() {
    const runTime = (Date.now() - this.startTime) / 1000; // in seconds
    return {
      totalEventsProcessed: this.totalEventsProcessed,
      batchesEmitted: this.batchesEmitted,
      eventsPerSecond: this.totalEventsProcessed / runTime,
      batchesPerSecond: this.batchesEmitted / runTime,
      avgEventsPerBatch: this.batchesEmitted > 0 ? this.totalEventsProcessed / this.batchesEmitted : 0,
      runTime,
      queueDepth: Array.from(this.batches.values()).reduce((total, batch) => total + batch.length, 0)
    };
  }

  // Configure batch settings dynamically
  configureBatching(options: {
    batchSize?: number;
    batchTimeout?: number;
    maxQueueSize?: number;
  }): void {
    if (options.batchSize !== undefined) {
      (this as any).BATCH_SIZE = Math.max(1, Math.min(1000, options.batchSize));
    }
    if (options.batchTimeout !== undefined) {
      (this as any).BATCH_TIMEOUT = Math.max(50, Math.min(5000, options.batchTimeout));
    }
    if (options.maxQueueSize !== undefined) {
      (this as any).MAX_QUEUE_SIZE = Math.max(100, Math.min(10000, options.maxQueueSize));
    }

    this.emit('config:updated', {
      batchSize: (this as any).BATCH_SIZE,
      batchTimeout: (this as any).BATCH_TIMEOUT,
      maxQueueSize: (this as any).MAX_QUEUE_SIZE
    });
  }

  // Set up periodic performance monitoring
  private setupPerformanceMonitoring(): void {
    setInterval(() => {
      const metrics = this.getPerformanceMetrics();
      const queueStatus = this.getQueueStatus();

      this.emit('performance:metrics', {
        ...metrics,
        queueStatus,
        timestamp: Date.now()
      });

      // Auto-tune batch settings based on performance
      this.autoTuneBatching(metrics);
    }, 5000); // Every 5 seconds
  }

  // Auto-tune batching parameters based on performance
  private autoTuneBatching(metrics: any): void {
    const { eventsPerSecond, queueDepth } = metrics;

    // If we're processing a lot of events, reduce batch timeout for lower latency
    if (eventsPerSecond > 100 && (this as any).BATCH_TIMEOUT > 100) {
      (this as any).BATCH_TIMEOUT = Math.max(100, (this as any).BATCH_TIMEOUT - 25);
      this.emit('auto-tune', { action: 'reduced_timeout', newTimeout: (this as any).BATCH_TIMEOUT });
    }

    // If queue is building up, increase batch size to process more efficiently
    if (queueDepth > 200 && (this as any).BATCH_SIZE < 100) {
      (this as any).BATCH_SIZE = Math.min(100, (this as any).BATCH_SIZE + 10);
      this.emit('auto-tune', { action: 'increased_batch_size', newBatchSize: (this as any).BATCH_SIZE });
    }

    // If load is low, optimize for responsiveness
    if (eventsPerSecond < 10 && queueDepth < 10) {
      (this as any).BATCH_TIMEOUT = Math.min(250, (this as any).BATCH_TIMEOUT + 25);
      (this as any).BATCH_SIZE = Math.max(10, (this as any).BATCH_SIZE - 5);
      this.emit('auto-tune', {
        action: 'optimized_for_low_load',
        newTimeout: (this as any).BATCH_TIMEOUT,
        newBatchSize: (this as any).BATCH_SIZE
      });
    }
  }

  // Clean shutdown
  shutdown(): void {
    // Flush all remaining batches
    this.flushAllBatches();

    // Clear all timers
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }
    this.batchTimers.clear();

    // Clear all batches
    this.batches.clear();

    // Remove all listeners
    this.removeAllListeners();
  }

  // Filter events by criteria (useful for debugging/monitoring)
  getFilteredEvents(filter: {
    torrentId?: string;
    direction?: 'sent' | 'received';
    minAmount?: number;
    maxAmount?: number;
    peerId?: string;
  }): PaymentEvent[] {
    const allEvents: PaymentEvent[] = [];

    for (const batch of this.batches.values()) {
      allEvents.push(...batch);
    }

    return allEvents.filter(event => {
      if (filter.torrentId && event.torrentId !== filter.torrentId) return false;
      if (filter.direction && event.direction !== filter.direction) return false;
      if (filter.minAmount && event.amount < filter.minAmount) return false;
      if (filter.maxAmount && event.amount > filter.maxAmount) return false;
      if (filter.peerId && event.peerId !== filter.peerId) return false;
      return true;
    });
  }
}
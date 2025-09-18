/**
 * Optimized Payment Event Batcher Performance Tests
 * Validates the enhanced batcher meets BSV Torrent performance requirements
 */

import { OptimizedPaymentEventBatcher, PaymentEvent } from '../../lib/bsv/payment-event-batcher-optimized';

describe('Optimized Payment Event Batcher', () => {
  let batcher: OptimizedPaymentEventBatcher;
  let processedBatches: any[] = [];
  let tuningEvents: any[] = [];

  beforeEach(() => {
    batcher = new OptimizedPaymentEventBatcher({
      targetLatencyMs: 80,
      aggressiveTuning: true,
      tuningIntervalMs: 1000
    });

    processedBatches = [];
    tuningEvents = [];

    batcher.on('payments:batch', (batch) => {
      processedBatches.push({
        ...batch,
        receivedAt: Date.now()
      });
    });

    batcher.on('auto-tune:advanced', (tuning) => {
      tuningEvents.push(tuning);
    });
  });

  afterEach(() => {
    batcher.shutdown();
  });

  const createOptimizedEvent = (index: number, torrentId = 'test-torrent'): PaymentEvent => ({
    txId: `optimized-tx-${index}-${Date.now()}`,
    amount: 17,
    direction: index % 2 === 0 ? 'sent' : 'received',
    peerId: `peer-${Math.floor(index / 10)}`,
    torrentId,
    timestamp: Date.now(),
    pieceIndex: index % 100,
    chunkSize: 16384
  });

  describe('Latency Optimization', () => {
    test('should achieve target latency under normal load', async () => {
      const targetLatency = 80; // 80ms target
      const events: PaymentEvent[] = [];

      // Send 500 events at moderate pace
      for (let i = 0; i < 500; i++) {
        const event = createOptimizedEvent(i);
        events.push(event);
        batcher.addPaymentEvent(event);

        if (i % 50 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Wait for processing and auto-tuning
      await new Promise(resolve => setTimeout(resolve, 2000));

      const metrics = batcher.getPerformanceMetrics();
      const processedEvents = processedBatches.reduce((sum, batch) => sum + batch.events.length, 0);

      console.log(`Latency test: ${metrics.avgLatencyMs.toFixed(2)}ms avg latency`);
      console.log(`Target: ${targetLatency}ms, Performance ratio: ${metrics.latencyPerformance.toFixed(2)}`);

      expect(processedEvents).toBe(500);
      expect(metrics.avgLatencyMs).toBeLessThan(targetLatency * 1.2); // Allow 20% tolerance
      expect(metrics.latencyPerformance).toBeGreaterThan(0.8); // 80% of target performance
    });

    test('should adapt batch parameters under high load', async () => {
      const initialMetrics = batcher.getPerformanceMetrics();

      // Generate high-frequency load: 2000 events rapidly
      for (let i = 0; i < 2000; i++) {
        batcher.addPaymentEvent(createOptimizedEvent(i));
      }

      // Wait for auto-tuning to activate
      await new Promise(resolve => setTimeout(resolve, 3000));

      const finalMetrics = batcher.getPerformanceMetrics();
      const hasAutoTuned = tuningEvents.length > 0;

      console.log('Initial batch size:', initialMetrics.currentBatchSize);
      console.log('Final batch size:', finalMetrics.currentBatchSize);
      console.log('Auto-tuning events:', tuningEvents.length);

      expect(hasAutoTuned).toBe(true);
      expect(finalMetrics.eventsPerSecond).toBeGreaterThan(initialMetrics.eventsPerSecond);
      expect(finalMetrics.avgLatencyMs).toBeLessThan(150); // Should stay reasonable under load
    });
  });

  describe('Throughput Optimization', () => {
    test('should exceed 1000 events/sec throughput target', async () => {
      const startTime = Date.now();
      const eventCount = 3000;

      // Send events as fast as possible
      for (let i = 0; i < eventCount; i++) {
        batcher.addPaymentEvent(createOptimizedEvent(i));
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 4000));

      const totalTime = (Date.now() - startTime) / 1000; // in seconds
      const metrics = batcher.getPerformanceMetrics();
      const processedEvents = processedBatches.reduce((sum, batch) => sum + batch.events.length, 0);

      console.log(`Throughput test: ${metrics.eventsPerSecond.toFixed(2)} events/sec`);
      console.log(`Target: 1000 events/sec, Performance: ${metrics.throughputPerformance.toFixed(2)}`);

      expect(processedEvents).toBe(eventCount);
      expect(metrics.eventsPerSecond).toBeGreaterThan(1000);
      expect(metrics.throughputPerformance).toBeGreaterThan(1.0);
    });

    test('should maintain performance with multiple torrent streams', async () => {
      const torrentCount = 10;
      const eventsPerTorrent = 200;

      // Generate events for multiple torrents simultaneously
      const promises = Array.from({ length: torrentCount }, async (_, torrentIndex) => {
        for (let eventIndex = 0; eventIndex < eventsPerTorrent; eventIndex++) {
          const event = createOptimizedEvent(eventIndex, `torrent-${torrentIndex}`);
          batcher.addPaymentEvent(event);

          if (eventIndex % 25 === 0) {
            await new Promise(resolve => setTimeout(resolve, 5));
          }
        }
      });

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 2000));

      const metrics = batcher.getPerformanceMetrics();
      const processedEvents = processedBatches.reduce((sum, batch) => sum + batch.events.length, 0);

      // Verify events were properly separated by torrent
      const eventsByTorrent = new Map();
      processedBatches.forEach(batch => {
        batch.events.forEach((event: PaymentEvent) => {
          if (!eventsByTorrent.has(event.torrentId)) {
            eventsByTorrent.set(event.torrentId, 0);
          }
          eventsByTorrent.set(event.torrentId, eventsByTorrent.get(event.torrentId) + 1);
        });
      });

      console.log(`Multi-torrent: ${processedEvents} events across ${eventsByTorrent.size} torrents`);
      console.log(`Average events per torrent:`, Array.from(eventsByTorrent.values()).reduce((a, b) => a + b, 0) / eventsByTorrent.size);

      expect(processedEvents).toBe(torrentCount * eventsPerTorrent);
      expect(eventsByTorrent.size).toBe(torrentCount);
      expect(metrics.eventsPerSecond).toBeGreaterThan(500); // Should maintain good throughput
    });
  });

  describe('Memory and Efficiency', () => {
    test('should maintain stable memory usage under sustained load', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Sustained load: 10 waves of 300 events each
      for (let wave = 0; wave < 10; wave++) {
        for (let i = 0; i < 300; i++) {
          batcher.addPaymentEvent(createOptimizedEvent(wave * 300 + i));
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Wait for all processing to complete
      await new Promise(resolve => setTimeout(resolve, 1500));

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      const processedEvents = processedBatches.reduce((sum, batch) => sum + batch.events.length, 0);

      console.log(`Memory test: ${processedEvents} events, ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB increase`);

      expect(processedEvents).toBe(3000);
      expect(memoryIncrease).toBeLessThan(30 * 1024 * 1024); // <30MB increase
    });

    test('should cleanup resources properly on shutdown', async () => {
      // Add some events and let processing begin
      for (let i = 0; i < 100; i++) {
        batcher.addPaymentEvent(createOptimizedEvent(i));
      }

      const metrics = batcher.getPerformanceMetrics();
      expect(metrics.queueDepth).toBeGreaterThan(0);

      // Shutdown and verify cleanup
      batcher.shutdown();

      // Should have flushed all remaining events
      const finalProcessed = processedBatches.reduce((sum, batch) => sum + batch.events.length, 0);
      expect(finalProcessed).toBe(100);

      // Adding events after shutdown should be safe (no crashes)
      expect(() => {
        batcher.addPaymentEvent(createOptimizedEvent(999));
      }).not.toThrow();
    });
  });

  describe('Auto-Tuning Validation', () => {
    test('should adjust parameters based on load patterns', async () => {
      const config = {
        targetLatencyMs: 60,
        aggressiveTuning: true,
        tuningIntervalMs: 500
      };

      batcher.updateConfig(config);

      // Simulate varying load patterns
      // Phase 1: Low load
      for (let i = 0; i < 50; i++) {
        batcher.addPaymentEvent(createOptimizedEvent(i));
        await new Promise(resolve => setTimeout(resolve, 20)); // Slow pace
      }

      await new Promise(resolve => setTimeout(resolve, 600)); // Wait for tuning

      const lowLoadMetrics = batcher.getPerformanceMetrics();

      // Phase 2: High load
      for (let i = 50; i < 550; i++) {
        batcher.addPaymentEvent(createOptimizedEvent(i));
      }

      await new Promise(resolve => setTimeout(resolve, 1200)); // Wait for tuning

      const highLoadMetrics = batcher.getPerformanceMetrics();

      console.log('Low load - batch size:', lowLoadMetrics.currentBatchSize, 'timeout:', lowLoadMetrics.currentBatchTimeout);
      console.log('High load - batch size:', highLoadMetrics.currentBatchSize, 'timeout:', highLoadMetrics.currentBatchTimeout);
      console.log('Tuning events captured:', tuningEvents.length);

      expect(tuningEvents.length).toBeGreaterThan(0);
      expect(highLoadMetrics.eventsPerSecond).toBeGreaterThan(lowLoadMetrics.eventsPerSecond);

      // Should have adapted to high load with larger batches or shorter timeouts
      const hasAdapted =
        highLoadMetrics.currentBatchSize > lowLoadMetrics.currentBatchSize ||
        highLoadMetrics.currentBatchTimeout < lowLoadMetrics.currentBatchTimeout;

      expect(hasAdapted).toBe(true);
    });

    test('should provide detailed performance trends', async () => {
      // Generate events over time to create trends
      for (let batch = 0; batch < 5; batch++) {
        for (let i = 0; i < 100; i++) {
          batcher.addPaymentEvent(createOptimizedEvent(batch * 100 + i));
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      const trends = batcher.getPerformanceTrends();
      const metrics = batcher.getPerformanceMetrics();

      console.log('Performance trends:', {
        avgBatchSize: trends.avgBatchSize,
        latencyTrend: trends.latencyTrendDirection,
        recentBatches: trends.recentBatches.length,
        latencySamples: trends.latencyTrend.length
      });

      expect(trends.recentBatches.length).toBeGreaterThan(0);
      expect(trends.avgBatchSize).toBeGreaterThan(0);
      expect(['improving', 'degrading', 'stable']).toContain(trends.latencyTrendDirection);
      expect(metrics.latencySamples).toBeGreaterThan(0);
    });
  });

  describe('Real-world BSV Torrent Scenarios', () => {
    test('should handle realistic download payment stream', async () => {
      // Simulate 50MB file download: 3,200 chunks at realistic speed
      const fileSize = 50 * 1024 * 1024;
      const chunkSize = 16384;
      const totalChunks = Math.ceil(fileSize / chunkSize);
      const chunksPerSecond = 80; // 1.25 MB/s download speed

      console.log(`Simulating ${totalChunks} chunk download (${fileSize / 1024 / 1024}MB file)`);

      let chunksProcessed = 0;
      const startTime = Date.now();

      const downloadSimulation = setInterval(() => {
        if (chunksProcessed >= totalChunks) {
          clearInterval(downloadSimulation);
          return;
        }

        const event = createOptimizedEvent(chunksProcessed, 'download-torrent');
        event.direction = 'sent'; // Paying for download
        batcher.addPaymentEvent(event);
        chunksProcessed++;
      }, 1000 / chunksPerSecond);

      // Wait for download to complete plus processing
      await new Promise(resolve => setTimeout(resolve, (totalChunks / chunksPerSecond * 1000) + 2000));

      const totalTime = Date.now() - startTime;
      const metrics = batcher.getPerformanceMetrics();
      const processedEvents = processedBatches.reduce((sum, batch) => sum + batch.events.length, 0);

      console.log(`Download completed: ${processedEvents} payments in ${totalTime}ms`);
      console.log(`Average latency: ${metrics.avgLatencyMs.toFixed(2)}ms`);
      console.log(`Payment rate: ${metrics.eventsPerSecond.toFixed(2)} payments/sec`);

      expect(processedEvents).toBe(totalChunks);
      expect(metrics.avgLatencyMs).toBeLessThan(100); // Good responsiveness for downloads
      expect(totalTime).toBeLessThan((totalChunks / chunksPerSecond * 1000) * 1.5); // Efficient processing
    });

    test('should handle earning payments from seeding', async () => {
      // Simulate earning from 15 leechers downloading different parts
      const leechers = 15;
      const avgChunksPerLeecher = 150;

      const seedingPromises = Array.from({ length: leechers }, async (_, leecherIndex) => {
        for (let chunk = 0; chunk < avgChunksPerLeecher; chunk++) {
          const event = createOptimizedEvent(chunk, 'seeding-torrent');
          event.direction = 'received'; // Earning from seeding
          event.peerId = `leecher-${leecherIndex}`;
          batcher.addPaymentEvent(event);

          // Realistic serving pace
          if (chunk % 20 === 0) {
            await new Promise(resolve => setTimeout(resolve, Math.random() * 30 + 10));
          }
        }
      });

      await Promise.all(seedingPromises);
      await new Promise(resolve => setTimeout(resolve, 1500));

      const metrics = batcher.getPerformanceMetrics();
      const processedEvents = processedBatches.reduce((sum, batch) => sum + batch.events.length, 0);
      const totalEarnings = processedBatches.reduce((sum, batch) =>
        sum + batch.events.reduce((batchSum: number, event: PaymentEvent) =>
          batchSum + (event.direction === 'received' ? event.amount : 0), 0), 0);

      console.log(`Seeding simulation: ${processedEvents} earning events`);
      console.log(`Total earned: ${totalEarnings} sats (${totalEarnings / 100000000} BSV)`);
      console.log(`Throughput: ${metrics.eventsPerSecond.toFixed(2)} events/sec`);

      expect(processedEvents).toBe(leechers * avgChunksPerLeecher);
      expect(totalEarnings).toBe(leechers * avgChunksPerLeecher * 17); // 17 sats per chunk
      expect(metrics.avgLatencyMs).toBeLessThan(120); // Good for earning scenarios
    });
  });
});
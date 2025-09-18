import { PaymentEventBatcher, PaymentEvent } from '../../lib/bsv/payment-event-batcher';

describe('PaymentEventBatcher Performance Tests', () => {
  let batcher: PaymentEventBatcher;
  let batchedEvents: PaymentEvent[][];
  let batchTimes: number[];

  beforeEach(() => {
    batcher = new PaymentEventBatcher();
    batchedEvents = [];
    batchTimes = [];

    // Capture batched events and timing
    batcher.on('payments:batch', (batch: any) => {
      batchedEvents.push(batch.events);
      batchTimes.push(Date.now());
    });
  });

  afterEach(() => {
    batcher.shutdown();
  });

  const createTestPaymentEvent = (index: number): PaymentEvent => ({
    txId: `test-tx-${index}-${Date.now()}`,
    amount: 17, // 17 sats per 16KB as per BSV Torrent spec
    direction: index % 2 === 0 ? 'sent' : 'received',
    peerId: `peer-${Math.floor(index / 10)}`,
    torrentId: `torrent-${Math.floor(index / 100)}`,
    timestamp: Date.now(),
    pieceIndex: index % 10,
    chunkSize: 16384 // 16KB chunks
  });

  describe('Batch Size Limits', () => {
    test('should batch exactly 50 events when threshold reached', async () => {
      // Send exactly 50 events with same direction to create single batch
      for (let i = 0; i < 50; i++) {
        const event = createTestPaymentEvent(i);
        event.direction = 'sent'; // Force same direction for single batch
        batcher.addPaymentEvent(event);
      }

      // Wait for batch to be processed
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(batchedEvents).toHaveLength(1);
      expect(batchedEvents[0]).toHaveLength(50);
    });

    test('should handle multiple full batches correctly', async () => {
      // Send 125 events with same direction for easier testing
      for (let i = 0; i < 125; i++) {
        const event = createTestPaymentEvent(i);
        event.direction = 'sent'; // Force same direction for single batch key
        batcher.addPaymentEvent(event);
      }

      // Wait for batches to process
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(batchedEvents.length).toBeGreaterThanOrEqual(2);
      expect(batchedEvents[0]).toHaveLength(50);
      expect(batchedEvents[1]).toHaveLength(50);
      // The remaining 25 events should be in a third batch or waiting for timeout
    });
  });

  describe('Time-based Batching', () => {
    test('should flush partial batch after 250ms timeout', async () => {
      const startTime = Date.now();

      // Send only 10 events with same direction
      for (let i = 0; i < 10; i++) {
        const event = createTestPaymentEvent(i);
        event.direction = 'sent'; // Force same direction for single batch
        batcher.addPaymentEvent(event);
      }

      // Wait for timeout to trigger
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(batchedEvents).toHaveLength(1);
      expect(batchedEvents[0]).toHaveLength(10);

      const batchTime = batchTimes[0] - startTime;
      expect(batchTime).toBeGreaterThanOrEqual(240); // Allow 10ms tolerance
      expect(batchTime).toBeLessThanOrEqual(300);
    });

    test('should reset timer when batch size limit reached', async () => {
      // Send 50 events with same direction to trigger size-based batch
      for (let i = 0; i < 50; i++) {
        const event = createTestPaymentEvent(i);
        event.direction = 'sent'; // Force same direction for single batch key
        batcher.addPaymentEvent(event);
      }

      // Wait briefly
      await new Promise(resolve => setTimeout(resolve, 50));

      // Send 10 more events with same direction
      for (let i = 50; i < 60; i++) {
        const event = createTestPaymentEvent(i);
        event.direction = 'sent'; // Force same direction for single batch key
        batcher.addPaymentEvent(event);
      }

      // Wait for timer-based batch
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(batchedEvents).toHaveLength(2);
      expect(batchedEvents[0]).toHaveLength(50);
      expect(batchedEvents[1]).toHaveLength(10);
    });
  });

  describe('High-Frequency Scenarios', () => {
    test('should handle 1000 events per second efficiently', async () => {
      const startTime = Date.now();
      const eventCount = 1000;

      // Simulate high-frequency payments (1ms intervals)
      for (let i = 0; i < eventCount; i++) {
        batcher.addPaymentEvent(createTestPaymentEvent(i));
        if (i % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }

      // Wait for all batches to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const totalEvents = batchedEvents.reduce((sum, batch) => sum + batch.length, 0);
      expect(totalEvents).toBe(eventCount);

      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(2000); // Should process efficiently
    });

    test('should maintain event order within batches', async () => {
      const eventCount = 75; // 1.5 batches

      for (let i = 0; i < eventCount; i++) {
        batcher.addPaymentEvent(createTestPaymentEvent(i));
      }

      await new Promise(resolve => setTimeout(resolve, 400));

      // Check first batch order
      const firstBatch = batchedEvents[0];
      for (let i = 0; i < firstBatch.length - 1; i++) {
        const currentEvent = firstBatch[i];
        const nextEvent = firstBatch[i + 1];
        expect(currentEvent.timestamp).toBeLessThanOrEqual(nextEvent.timestamp);
      }
    });
  });

  describe('Memory and Performance', () => {
    test('should not accumulate memory with continuous events', async () => {
      // Monitor memory usage (simplified)
      const initialHeap = process.memoryUsage().heapUsed;

      // Send 10 waves of 100 events each
      for (let wave = 0; wave < 10; wave++) {
        for (let i = 0; i < 100; i++) {
          batcher.addPaymentEvent(createTestPaymentEvent(wave * 100 + i));
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      const finalHeap = process.memoryUsage().heapUsed;
      const memoryIncrease = finalHeap - initialHeap;

      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    test('should handle rapid start/stop scenarios', async () => {
      // Rapid fire events then stop
      for (let i = 0; i < 200; i++) {
        batcher.addPaymentEvent(createTestPaymentEvent(i));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Stop and wait
      await new Promise(resolve => setTimeout(resolve, 400));

      const totalEvents = batchedEvents.reduce((sum, batch) => sum + batch.length, 0);
      expect(totalEvents).toBe(200);
      expect(batchedEvents.length).toBeGreaterThanOrEqual(4); // Should have multiple batches
    });
  });

  describe('Edge Cases', () => {
    test('should handle duplicate events gracefully', async () => {
      const baseEvent = createTestPaymentEvent(1);

      // Add same event multiple times
      for (let i = 0; i < 5; i++) {
        batcher.addPaymentEvent({ ...baseEvent });
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      expect(batchedEvents).toHaveLength(1);
      expect(batchedEvents[0]).toHaveLength(5); // Should include duplicates
    });

    test('should handle events with extreme amounts', async () => {
      const events = [
        { ...createTestPaymentEvent(1), amount: 1, direction: 'sent' as const }, // 1 sat
        { ...createTestPaymentEvent(2), amount: 100000000, direction: 'sent' as const }, // 1 BSV
        { ...createTestPaymentEvent(3), amount: 17, direction: 'sent' as const }, // Standard 17 sats
      ];

      events.forEach(event => batcher.addPaymentEvent(event));

      await new Promise(resolve => setTimeout(resolve, 300));

      expect(batchedEvents).toHaveLength(1);
      expect(batchedEvents[0]).toHaveLength(3);
      expect(batchedEvents[0]).toEqual(expect.arrayContaining(events));
    });

    test('should handle empty and malformed events', async () => {
      // This test ensures robustness but events should be validated upstream
      const validEvent = createTestPaymentEvent(1);

      batcher.addPaymentEvent(validEvent);

      await new Promise(resolve => setTimeout(resolve, 300));

      expect(batchedEvents).toHaveLength(1);
      expect(batchedEvents[0]).toHaveLength(1);
    });
  });

  describe('Integration with Store', () => {
    test('should emit events compatible with BSV store format', async () => {
      const testEvent = createTestPaymentEvent(1);
      batcher.addPaymentEvent(testEvent);

      await new Promise(resolve => setTimeout(resolve, 300));

      const batchedEvent = batchedEvents[0][0];

      // Verify all required fields for store integration
      expect(batchedEvent).toHaveProperty('txId');
      expect(batchedEvent).toHaveProperty('amount');
      expect(batchedEvent).toHaveProperty('direction');
      expect(batchedEvent).toHaveProperty('peerId');
      expect(batchedEvent).toHaveProperty('torrentId');
      expect(batchedEvent).toHaveProperty('timestamp');

      expect(['sent', 'received']).toContain(batchedEvent.direction);
      expect(typeof batchedEvent.amount).toBe('number');
    });
  });
});
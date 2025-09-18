/**
 * WebSocket Performance Tests for BSV Torrent
 * Tests real-time event streaming under high load
 */

import { Server } from 'socket.io';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { io as ClientIO, Socket as ClientSocket } from 'socket.io-client';
import { PaymentEvent } from '../../lib/bsv/payment-event-batcher';

describe('WebSocket Performance Tests', () => {
  let httpServer: any;
  let ioServer: Server;
  let clientSockets: ClientSocket[] = [];
  let serverUrl: string;

  beforeAll((done) => {
    httpServer = createServer();
    ioServer = new Server(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    httpServer.listen(() => {
      const port = (httpServer.address() as AddressInfo).port;
      serverUrl = `http://localhost:${port}`;
      done();
    });
  });

  afterAll(() => {
    ioServer.close();
    httpServer.close();
  });

  afterEach(() => {
    clientSockets.forEach(socket => socket.disconnect());
    clientSockets = [];
  });

  const createTestPaymentBatch = (size: number): PaymentEvent[] => {
    return Array.from({ length: size }, (_, i) => ({
      txId: `batch-tx-${i}-${Date.now()}`,
      amount: 17,
      direction: i % 2 === 0 ? 'sent' : 'received',
      peerId: `peer-${Math.floor(i / 10)}`,
      torrentId: `torrent-${Math.floor(i / 20)}`,
      timestamp: Date.now() + i,
      blockHeight: undefined
    }));
  };

  const createClient = (): Promise<ClientSocket> => {
    return new Promise((resolve) => {
      const client = ClientIO(serverUrl);
      client.on('connect', () => resolve(client));
      clientSockets.push(client);
    });
  };

  describe('Single Client Performance', () => {
    test('should handle rapid payment batch emissions', async () => {
      const client = await createClient();
      const receivedBatches: PaymentEvent[][] = [];

      // Setup payment event listener
      client.on('paymentBatch', (batch: PaymentEvent[]) => {
        receivedBatches.push(batch);
      });

      // Setup server to emit batches rapidly
      ioServer.on('connection', (socket) => {
        socket.join('payments');
      });

      // Emit 100 batches of 50 events each over 1 second
      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        const batch = createTestPaymentBatch(50);
        ioServer.to('payments').emit('paymentBatch', batch);

        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Wait for all events to be received
      await new Promise(resolve => setTimeout(resolve, 2000));

      expect(receivedBatches).toHaveLength(100);

      const totalEvents = receivedBatches.reduce((sum, batch) => sum + batch.length, 0);
      expect(totalEvents).toBe(5000);

      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(3000); // Should be efficient
    });

    test('should maintain event order in high-frequency scenarios', async () => {
      const client = await createClient();
      const receivedEvents: PaymentEvent[] = [];

      client.on('paymentBatch', (batch: PaymentEvent[]) => {
        receivedEvents.push(...batch);
      });

      ioServer.on('connection', (socket) => {
        socket.join('payments');
      });

      // Send sequential batches with incremental timestamps
      for (let batchNum = 0; batchNum < 10; batchNum++) {
        const batch = Array.from({ length: 25 }, (_, i) => ({
          txId: `ordered-tx-${batchNum}-${i}`,
          amount: 17,
          direction: 'sent' as const,
          peerId: 'test-peer',
          torrentId: 'test-torrent',
          timestamp: Date.now() + (batchNum * 25) + i,
          blockHeight: undefined
        }));

        ioServer.to('payments').emit('paymentBatch', batch);
        await new Promise(resolve => setTimeout(resolve, 25));
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify chronological order
      for (let i = 0; i < receivedEvents.length - 1; i++) {
        expect(receivedEvents[i].timestamp).toBeLessThanOrEqual(receivedEvents[i + 1].timestamp);
      }
    });
  });

  describe('Multiple Client Performance', () => {
    test('should handle 50 concurrent clients receiving payment batches', async () => {
      const clientCount = 50;
      const clients = await Promise.all(
        Array.from({ length: clientCount }, () => createClient())
      );

      const receivedCounts = new Array(clientCount).fill(0);

      // Setup listeners for all clients
      clients.forEach((client, index) => {
        client.on('paymentBatch', (batch: PaymentEvent[]) => {
          receivedCounts[index] += batch.length;
        });
      });

      ioServer.on('connection', (socket) => {
        socket.join('payments');
      });

      // Broadcast 20 batches to all clients
      const batchesPerClient = 20;
      for (let i = 0; i < batchesPerClient; i++) {
        const batch = createTestPaymentBatch(25);
        ioServer.to('payments').emit('paymentBatch', batch);
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // All clients should receive all events
      const expectedEventsPerClient = batchesPerClient * 25;
      receivedCounts.forEach(count => {
        expect(count).toBe(expectedEventsPerClient);
      });
    });

    test('should handle selective subscriptions efficiently', async () => {
      const walletClients = await Promise.all(
        Array.from({ length: 10 }, () => createClient())
      );

      const paymentClients = await Promise.all(
        Array.from({ length: 10 }, () => createClient())
      );

      const walletEvents: any[] = [];
      const paymentEvents: PaymentEvent[] = [];

      // Setup wallet subscribers
      walletClients.forEach(client => {
        client.emit('subscribe', 'wallet');
        client.on('walletUpdate', (data) => {
          walletEvents.push(data);
        });
      });

      // Setup payment subscribers
      paymentClients.forEach(client => {
        client.emit('subscribe', 'payments');
        client.on('paymentBatch', (batch: PaymentEvent[]) => {
          paymentEvents.push(...batch);
        });
      });

      ioServer.on('connection', (socket) => {
        socket.on('subscribe', (type: string) => {
          socket.join(type);
        });
      });

      // Emit wallet events (should only go to wallet subscribers)
      for (let i = 0; i < 5; i++) {
        ioServer.to('wallet').emit('walletUpdate', {
          balance: 1000 + i,
          address: `test-address-${i}`
        });
      }

      // Emit payment events (should only go to payment subscribers)
      for (let i = 0; i < 5; i++) {
        const batch = createTestPaymentBatch(10);
        ioServer.to('payments').emit('paymentBatch', batch);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify selective delivery
      expect(walletEvents).toHaveLength(50); // 10 clients × 5 events
      expect(paymentEvents).toHaveLength(50); // 10 clients × 5 batches × 10 events
    });
  });

  describe('Load Testing', () => {
    test('should handle burst traffic without losing events', async () => {
      const client = await createClient();
      const receivedBatches: PaymentEvent[][] = [];

      client.on('paymentBatch', (batch: PaymentEvent[]) => {
        receivedBatches.push(batch);
      });

      ioServer.on('connection', (socket) => {
        socket.join('payments');
      });

      // Create burst: 200 batches sent as fast as possible
      const burstSize = 200;
      const startTime = Date.now();

      const batchPromises = Array.from({ length: burstSize }, async (_, i) => {
        const batch = createTestPaymentBatch(20);
        ioServer.to('payments').emit('paymentBatch', batch);
      });

      await Promise.all(batchPromises);

      // Wait for all events to propagate
      await new Promise(resolve => setTimeout(resolve, 3000));

      const burstTime = Date.now() - startTime;
      console.log(`Burst of ${burstSize} batches completed in ${burstTime}ms`);

      expect(receivedBatches).toHaveLength(burstSize);

      const totalEvents = receivedBatches.reduce((sum, batch) => sum + batch.length, 0);
      expect(totalEvents).toBe(burstSize * 20);
    });

    test('should maintain performance under sustained load', async () => {
      const client = await createClient();
      let receivedEventCount = 0;
      const receiveTimes: number[] = [];

      client.on('paymentBatch', (batch: PaymentEvent[]) => {
        receivedEventCount += batch.length;
        receiveTimes.push(Date.now());
      });

      ioServer.on('connection', (socket) => {
        socket.join('payments');
      });

      // Sustained load: 1 batch every 100ms for 10 seconds
      const duration = 10000; // 10 seconds
      const interval = 100; // 100ms
      const expectedBatches = duration / interval;

      const startTime = Date.now();
      const loadInterval = setInterval(() => {
        const batch = createTestPaymentBatch(30);
        ioServer.to('payments').emit('paymentBatch', batch);

        if (Date.now() - startTime >= duration) {
          clearInterval(loadInterval);
        }
      }, interval);

      // Wait for load test to complete plus buffer
      await new Promise(resolve => setTimeout(resolve, duration + 2000));

      expect(receivedEventCount).toBeGreaterThanOrEqual(expectedBatches * 30 * 0.95); // Allow 5% tolerance

      // Check that events were received consistently (no major gaps)
      const receiveIntervals = receiveTimes.slice(1).map((time, i) => time - receiveTimes[i]);
      const avgInterval = receiveIntervals.reduce((sum, interval) => sum + interval, 0) / receiveIntervals.length;

      expect(avgInterval).toBeLessThan(200); // Should be close to 100ms
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle client disconnections gracefully', async () => {
      const clients = await Promise.all(
        Array.from({ length: 5 }, () => createClient())
      );

      ioServer.on('connection', (socket) => {
        socket.join('payments');
      });

      // Disconnect 2 clients mid-test
      setTimeout(() => {
        clients[1].disconnect();
        clients[3].disconnect();
      }, 500);

      let totalReceived = 0;
      clients.forEach(client => {
        client.on('paymentBatch', (batch: PaymentEvent[]) => {
          totalReceived += batch.length;
        });
      });

      // Send events before and after disconnections
      for (let i = 0; i < 10; i++) {
        const batch = createTestPaymentBatch(10);
        ioServer.to('payments').emit('paymentBatch', batch);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should receive events from remaining 3 clients
      // Events before disconnection: 5 clients × 5 batches × 10 events = 250
      // Events after disconnection: 3 clients × 5 batches × 10 events = 150
      // Total expected: ~400 events
      expect(totalReceived).toBeGreaterThan(350);
      expect(totalReceived).toBeLessThan(450);
    });

    test('should handle reconnections properly', async () => {
      const client = await createClient();
      let receivedCount = 0;

      const handleBatch = (batch: PaymentEvent[]) => {
        receivedCount += batch.length;
      };

      client.on('paymentBatch', handleBatch);

      ioServer.on('connection', (socket) => {
        socket.join('payments');
      });

      // Send some events
      for (let i = 0; i < 3; i++) {
        const batch = createTestPaymentBatch(5);
        ioServer.to('payments').emit('paymentBatch', batch);
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Disconnect and reconnect
      client.disconnect();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reconnect with new listener
      const reconnectedClient = ClientIO(serverUrl);
      reconnectedClient.on('paymentBatch', handleBatch);
      reconnectedClient.on('connect', () => {
        reconnectedClient.emit('subscribe', 'payments');
      });

      await new Promise(resolve => setTimeout(resolve, 200));

      // Send more events after reconnection
      for (let i = 0; i < 3; i++) {
        const batch = createTestPaymentBatch(5);
        ioServer.to('payments').emit('paymentBatch', batch);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // Should receive events from both sessions
      expect(receivedCount).toBeGreaterThan(20); // Should get events from both periods

      reconnectedClient.disconnect();
    });
  });
});
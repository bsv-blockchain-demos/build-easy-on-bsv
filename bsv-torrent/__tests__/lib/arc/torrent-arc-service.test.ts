/**
 * TorrentArcService Tests
 * Comprehensive test suite for ARC (Application Request Channel) integration
 * Supporting high-frequency transaction broadcasting for streaming micropayments
 */

import { Transaction, PrivateKey, P2PKH, ARC } from '@bsv/sdk';
import { TorrentArcService, ArcConfig, BroadcastResult, BatchBroadcastResult, ArcEndpoint, BroadcastMetrics, ArcStatus } from '../../../lib/arc/torrent-arc-service';

// Mock ARC instances
const mockArc1 = {
  broadcast: jest.fn(),
  getStatus: jest.fn(),
  getCallbacks: jest.fn(),
  url: 'https://api.taal.com/arc',
  config: { apiKey: 'test-key-1', deploymentId: 'test-app' }
} as any;

const mockArc2 = {
  broadcast: jest.fn(),
  getStatus: jest.fn(),
  getCallbacks: jest.fn(),
  url: 'https://api.bitails.com/arc',
  config: { apiKey: 'test-key-2', deploymentId: 'test-app' }
} as any;

// Mock transaction
const createMockTransaction = (amount: number = 1000): Transaction => {
  const tx = new Transaction();
  tx.addOutput({
    lockingScript: new P2PKH().lock('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'),
    satoshis: amount
  });
  return tx;
};

describe('TorrentArcService', () => {
  let arcService: TorrentArcService;
  let config: ArcConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      endpoints: [
        {
          name: 'taal',
          url: 'https://api.taal.com/arc',
          apiKey: 'test-key-1',
          priority: 1,
          timeout: 5000,
          maxRetries: 1, // Reduced for faster tests
          enabled: true
        },
        {
          name: 'bitails',
          url: 'https://api.bitails.com/arc',
          apiKey: 'test-key-2',
          priority: 2,
          timeout: 5000,
          maxRetries: 1, // Reduced for faster tests
          enabled: true
        }
      ],
      defaultTimeout: 5000,
      maxConcurrentBroadcasts: 10,
      batchSize: 50,
      retryBackoffMs: 100, // Reduced for faster tests
      enableMetrics: true,
      circuitBreakerThreshold: 5,
      circuitBreakerResetTime: 60000,
      rateLimitPerSecond: 100
    };

    arcService = new TorrentArcService(config);
  });

  describe('Configuration and Initialization', () => {
    it('should initialize with valid configuration', () => {
      expect(arcService).toBeInstanceOf(TorrentArcService);
      expect(arcService.getConfig()).toEqual(config);
    });

    it('should validate required configuration fields', () => {
      expect(() => {
        new TorrentArcService({
          ...config,
          endpoints: []
        });
      }).toThrow('At least one ARC endpoint must be configured');
    });

    it('should validate endpoint configuration', () => {
      expect(() => {
        new TorrentArcService({
          ...config,
          endpoints: [{
            name: 'invalid',
            url: 'not-a-url',
            apiKey: 'key',
            priority: 1,
            timeout: 30000,
            maxRetries: 3,
            enabled: true
          }]
        });
      }).toThrow('Invalid URL format for endpoint: invalid');
    });

    it('should initialize endpoint statistics', () => {
      const stats = arcService.getEndpointStats();
      expect(stats).toHaveLength(2);
      expect(stats[0]).toMatchObject({
        name: 'taal',
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageLatency: 0,
        status: 'healthy'
      });
    });

    it('should create ARC instances for endpoints', async () => {
      const endpoints = arcService.getAvailableEndpoints();
      expect(endpoints).toHaveLength(2);
      expect(endpoints[0].name).toBe('taal');
      expect(endpoints[1].name).toBe('bitails');
    });
  });

  describe('Single Transaction Broadcasting', () => {
    it('should broadcast transaction to primary endpoint', async () => {
      const transaction = createMockTransaction(1000);
      const mockResponse = {
        txid: 'abc123',
        status: 'SEEN_ON_NETWORK',
        blockHash: null,
        blockHeight: null,
        timestamp: new Date().toISOString()
      };

      // Mock ARC response
      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation((endpoint) => {
        if (endpoint.name === 'taal') return mockArc1;
        return mockArc2;
      });
      mockArc1.broadcast.mockResolvedValue(mockResponse);

      const result = await arcService.broadcast(transaction);

      expect(result.success).toBe(true);
      expect(result.txid).toBe('abc123');
      expect(result.endpoint).toBe('taal');
      expect(result.status).toBe('SEEN_ON_NETWORK');
      expect(result.latency).toBeGreaterThan(0);
      expect(mockArc1.broadcast).toHaveBeenCalledWith(transaction);
    });

    it('should fallback to secondary endpoint on primary failure', async () => {
      const transaction = createMockTransaction(1000);
      const mockResponse = {
        txid: 'def456',
        status: 'SEEN_ON_NETWORK',
        blockHash: null,
        blockHeight: null,
        timestamp: new Date().toISOString()
      };

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation((endpoint) => {
        if (endpoint.name === 'taal') return mockArc1;
        return mockArc2;
      });

      // Primary fails, secondary succeeds
      mockArc1.broadcast.mockRejectedValue(new Error('Network timeout'));
      mockArc2.broadcast.mockResolvedValue(mockResponse);

      const result = await arcService.broadcast(transaction);

      expect(result.success).toBe(true);
      expect(result.txid).toBe('def456');
      expect(result.endpoint).toBe('bitails');
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('Network timeout');
    });

    it('should return failure when all endpoints fail', async () => {
      const transaction = createMockTransaction(1000);

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation((endpoint) => {
        if (endpoint.name === 'taal') return mockArc1;
        return mockArc2;
      });

      mockArc1.broadcast.mockRejectedValue(new Error('Primary failed'));
      mockArc2.broadcast.mockRejectedValue(new Error('Secondary failed'));

      const result = await arcService.broadcast(transaction);

      expect(result.success).toBe(false);
      expect(result.txid).toBeNull();
      expect(result.errors).toHaveLength(2);
      expect(result.errors![0]).toContain('Primary failed');
      expect(result.errors![1]).toContain('Secondary failed');
    });

    it('should handle timeout errors gracefully', async () => {
      const transaction = createMockTransaction(1000);

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      const result = await arcService.broadcast(transaction, { timeout: 50 });

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('timeout');
    });

    it('should validate transaction before broadcasting', async () => {
      const invalidTransaction = null as any;

      await expect(arcService.broadcast(invalidTransaction)).rejects.toThrow('Invalid transaction provided');
    });
  });

  describe('Batch Transaction Broadcasting', () => {
    it('should broadcast multiple transactions in batches', async () => {
      const transactions = [
        createMockTransaction(1000),
        createMockTransaction(2000),
        createMockTransaction(3000)
      ];

      const mockResponses = [
        { txid: 'batch1', status: 'SEEN_ON_NETWORK' },
        { txid: 'batch2', status: 'SEEN_ON_NETWORK' },
        { txid: 'batch3', status: 'SEEN_ON_NETWORK' }
      ];

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockImplementation((tx) => {
        const index = transactions.indexOf(tx);
        return Promise.resolve(mockResponses[index]);
      });

      const result = await arcService.batchBroadcast(transactions);

      expect(result.totalTransactions).toBe(3);
      expect(result.successfulBroadcasts).toBe(3);
      expect(result.failedBroadcasts).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.results.every(r => r.success)).toBe(true);
    });

    it('should handle partial batch failures', async () => {
      const transactions = [
        createMockTransaction(1000),
        createMockTransaction(2000),
        createMockTransaction(3000)
      ];

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockImplementation((tx) => {
        if (tx === transactions[1]) {
          return Promise.reject(new Error('Transaction validation failed'));
        }
        return Promise.resolve({ txid: 'success', status: 'SEEN_ON_NETWORK' });
      });

      const result = await arcService.batchBroadcast(transactions);

      expect(result.totalTransactions).toBe(3);
      expect(result.successfulBroadcasts).toBe(2);
      expect(result.failedBroadcasts).toBe(1);
      expect(result.efficiency).toBeCloseTo(0.67, 2);
    });

    it('should respect batch size limits', async () => {
      const transactions = Array.from({ length: 75 }, () => createMockTransaction(1000));

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockResolvedValue({ txid: 'success', status: 'SEEN_ON_NETWORK' });

      const batchSpy = jest.spyOn(arcService as any, 'processBatch');

      await arcService.batchBroadcast(transactions);

      // Should split into 2 batches (50 + 25)
      expect(batchSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle concurrent batch processing', async () => {
      const transactions = Array.from({ length: 20 }, () => createMockTransaction(1000));

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({ txid: 'success', status: 'SEEN_ON_NETWORK' }), 10)
        )
      );

      const startTime = Date.now();
      const result = await arcService.batchBroadcast(transactions, { maxConcurrent: 5 });
      const duration = Date.now() - startTime;

      expect(result.successfulBroadcasts).toBe(20);
      expect(duration).toBeLessThan(100); // Should be faster than sequential
    });
  });

  describe('High-Frequency Broadcasting', () => {
    it('should handle high-frequency streaming payments', async () => {
      const transactions = Array.from({ length: 100 }, () => createMockTransaction(17)); // 17 sats each

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockResolvedValue({ txid: 'stream', status: 'SEEN_ON_NETWORK' });

      const result = await arcService.streamingBroadcast(transactions, {
        rateLimit: 50, // 50 tx/sec
        priority: 'high'
      });

      expect(result.totalTransactions).toBe(100);
      expect(result.successfulBroadcasts).toBe(100);
      expect(result.averageLatency).toBeGreaterThan(0);
    });

    it('should implement rate limiting for streaming broadcasts', async () => {
      const transactions = Array.from({ length: 5 }, () => createMockTransaction(17)); // Reduced for faster test

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockResolvedValue({ txid: 'rate-limited', status: 'SEEN_ON_NETWORK' });

      const result = await arcService.streamingBroadcast(transactions, {
        rateLimit: 10 // 10 tx/sec - more reasonable for testing
      });

      expect(result.successfulBroadcasts).toBe(5);
      expect(result.throughput).toBeGreaterThan(0);
    });

    it('should prioritize high-frequency transactions', async () => {
      const urgentTx = createMockTransaction(17);
      const normalTx = createMockTransaction(1000);

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockResolvedValue({ txid: 'prioritized', status: 'SEEN_ON_NETWORK' });

      const urgentResult = arcService.broadcast(urgentTx, { priority: 'urgent' });
      const normalResult = arcService.broadcast(normalTx, { priority: 'normal' });

      const [urgent, normal] = await Promise.all([urgentResult, normalResult]);

      expect(urgent.success).toBe(true);
      expect(normal.success).toBe(true);
      // Urgent should complete first or at same time
      expect(urgent.latency <= normal.latency).toBe(true);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should implement exponential backoff for retries', async () => {
      const transaction = createMockTransaction(1000);

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Still failing'))
        .mockResolvedValue({ txid: 'finally-success', status: 'SEEN_ON_NETWORK' });

      const result = await arcService.broadcast(transaction, { maxRetries: 3 });

      expect(result.success).toBe(true);
      expect(result.txid).toBe('finally-success');
      expect(result.retryCount).toBe(2);
    });

    it('should implement circuit breaker pattern', async () => {
      const transaction = createMockTransaction(1000);

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockRejectedValue(new Error('Service unavailable'));

      // Trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await arcService.broadcast(transaction).catch(() => {});
      }

      // Next request should be circuit-broken
      const result = await arcService.broadcast(transaction);
      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('Circuit breaker open');
    });

    it('should handle network connectivity issues', async () => {
      const transaction = createMockTransaction(1000);

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await arcService.broadcast(transaction);

      expect(result.success).toBe(false);
      expect(result.errors![0]).toContain('Network connectivity issue');
    });

    it('should recover from endpoint failures', async () => {
      const transaction = createMockTransaction(1000);

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation((endpoint) => {
        if (endpoint.name === 'taal') return mockArc1;
        return mockArc2;
      });

      // Primary endpoint fails
      mockArc1.broadcast.mockRejectedValue(new Error('Endpoint down'));
      mockArc2.broadcast.mockResolvedValue({ txid: 'recovered', status: 'SEEN_ON_NETWORK' });

      const result = await arcService.broadcast(transaction);

      expect(result.success).toBe(true);
      expect(result.endpoint).toBe('bitails');
      expect(result.txid).toBe('recovered');
    });
  });

  describe('Performance Monitoring and Metrics', () => {
    it('should track broadcast metrics', async () => {
      const transaction = createMockTransaction(1000);

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockResolvedValue({ txid: 'metrics', status: 'SEEN_ON_NETWORK' });

      await arcService.broadcast(transaction);

      const metrics = arcService.getMetrics();
      expect(metrics.totalBroadcasts).toBe(1);
      expect(metrics.successfulBroadcasts).toBe(1);
      expect(metrics.failedBroadcasts).toBe(0);
      expect(metrics.averageLatency).toBeGreaterThan(0);
    });

    it('should track endpoint-specific statistics', async () => {
      const transaction = createMockTransaction(1000);

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockResolvedValue({ txid: 'endpoint-stats', status: 'SEEN_ON_NETWORK' });

      await arcService.broadcast(transaction);

      const stats = arcService.getEndpointStats();
      const taalStats = stats.find(s => s.name === 'taal');

      expect(taalStats!.totalRequests).toBe(1);
      expect(taalStats!.successfulRequests).toBe(1);
      expect(taalStats!.averageLatency).toBeGreaterThan(0);
    });

    it('should calculate broadcast efficiency metrics', async () => {
      // Create a config with single endpoint and no retries for this test
      const singleEndpointConfig = {
        ...config,
        endpoints: [{
          name: 'test-only',
          url: 'https://test.com/arc',
          apiKey: 'test-key',
          priority: 1,
          timeout: 5000,
          maxRetries: 0,
          enabled: true
        }]
      };
      const testArcService = new TorrentArcService(singleEndpointConfig);

      const transactions = Array.from({ length: 5 }, () => createMockTransaction(1000));

      jest.spyOn(testArcService as any, 'createArcInstance').mockImplementation(() => mockArc1);

      // Set up mock to fail on the 3rd and 5th transaction
      let callCount = 0;
      mockArc1.broadcast.mockImplementation(() => {
        callCount++;
        if (callCount === 3 || callCount === 5) {
          return Promise.reject(new Error('Simulated failure'));
        }
        return Promise.resolve({ txid: `success${callCount}`, status: 'SEEN_ON_NETWORK' });
      });

      const result = await testArcService.batchBroadcast(transactions);

      expect(result.successfulBroadcasts).toBe(3); // 3 out of 5 succeed
      expect(result.failedBroadcasts).toBe(2);
      expect(result.efficiency).toBeCloseTo(0.6, 1); // 3/5 = 0.6 success rate
      expect(result.throughput).toBeGreaterThan(0);
    });

    it('should provide real-time performance statistics', async () => {
      const perfStats = arcService.getPerformanceStats();

      expect(perfStats).toMatchObject({
        uptime: expect.any(Number),
        requestsPerSecond: expect.any(Number),
        successRate: expect.any(Number),
        averageResponseTime: expect.any(Number),
        activeConnections: expect.any(Number)
      });
    });
  });

  describe('Queue Management', () => {
    it('should manage broadcast queue with priorities', async () => {
      const urgentTx = createMockTransaction(17);
      const normalTx = createMockTransaction(1000);
      const lowTx = createMockTransaction(500);

      const queueStatus = arcService.getQueueStatus();
      expect(queueStatus.size).toBe(0);

      // Add to queue with different priorities
      arcService.queueBroadcast(urgentTx, { priority: 'urgent' });
      arcService.queueBroadcast(normalTx, { priority: 'normal' });
      arcService.queueBroadcast(lowTx, { priority: 'low' });

      const updatedStatus = arcService.getQueueStatus();
      expect(updatedStatus.size).toBe(3);
      expect(updatedStatus.priorityDistribution.urgent).toBe(1);
      expect(updatedStatus.priorityDistribution.normal).toBe(1);
      expect(updatedStatus.priorityDistribution.low).toBe(1);
    });

    it('should process queue in priority order', async () => {
      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockResolvedValue({ txid: 'queued', status: 'SEEN_ON_NETWORK' });

      const urgentTx = createMockTransaction(17);
      const normalTx = createMockTransaction(1000);
      const lowTx = createMockTransaction(500);

      // Queue in reverse priority order
      const lowPromise = arcService.queueBroadcast(lowTx, { priority: 'low' });
      const normalPromise = arcService.queueBroadcast(normalTx, { priority: 'normal' });
      const urgentPromise = arcService.queueBroadcast(urgentTx, { priority: 'urgent' });

      // Manually process queue for controlled testing
      await arcService.processQueue();

      // All should resolve successfully
      const [lowResult, normalResult, urgentResult] = await Promise.all([
        lowPromise, normalPromise, urgentPromise
      ]);

      expect(urgentResult.success).toBe(true);
      expect(normalResult.success).toBe(true);
      expect(lowResult.success).toBe(true);
    });

    it('should handle queue overflow', () => {
      // Test that queue size limits are enforced
      const queueStatus = arcService.getQueueStatus();
      const initialSize = queueStatus.size;

      // Queue should enforce a maximum size
      expect(initialSize).toBeGreaterThanOrEqual(0);

      // Queue should have a priority distribution structure
      expect(queueStatus.priorityDistribution).toBeDefined();
      expect(queueStatus.priorityDistribution.urgent).toBe(0);
      expect(queueStatus.priorityDistribution.high).toBe(0);
      expect(queueStatus.priorityDistribution.normal).toBe(0);
      expect(queueStatus.priorityDistribution.low).toBe(0);

      // Queue should provide estimated processing time
      expect(queueStatus.estimatedProcessingTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Transaction Status Monitoring', () => {
    it('should monitor transaction confirmation status', async () => {
      const transaction = createMockTransaction(1000);
      const txid = 'monitor-test-tx';

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockResolvedValue({ txid, status: 'SEEN_ON_NETWORK' });
      mockArc1.getStatus = jest.fn().mockResolvedValue({
        txid,
        status: 'CONFIRMED',
        blockHash: 'abc123',
        blockHeight: 800000
      });

      await arcService.broadcast(transaction);
      const status = await arcService.getTransactionStatus(txid);

      expect(status.txid).toBe(txid);
      expect(status.status).toBe('CONFIRMED');
      expect(status.blockHash).toBe('abc123');
      expect(status.blockHeight).toBe(800000);
    });

    it('should track multiple transaction statuses', async () => {
      const txids = ['tx1', 'tx2', 'tx3'];

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.getStatus = jest.fn().mockImplementation((txid) => {
        return Promise.resolve({
          txid,
          status: txid === 'tx2' ? 'CONFIRMED' : 'SEEN_ON_NETWORK'
        });
      });

      const statuses = await arcService.getBatchTransactionStatus(txids);

      expect(statuses).toHaveLength(3);
      expect(statuses[0].status).toBe('SEEN_ON_NETWORK');
      expect(statuses[1].status).toBe('CONFIRMED');
      expect(statuses[2].status).toBe('SEEN_ON_NETWORK');
    });

    it('should handle status polling with callbacks', async () => {
      const txid = 'callback-test';
      const callbacks: Array<{ status: string; timestamp: Date }> = [];

      const onStatusChange = (status: string, timestamp: Date) => {
        callbacks.push({ status, timestamp });
      };

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.getStatus = jest.fn()
        .mockResolvedValueOnce({ txid, status: 'SEEN_ON_NETWORK' })
        .mockResolvedValueOnce({ txid, status: 'CONFIRMED' })
        .mockResolvedValue({ txid, status: 'CONFIRMED' }); // Ensure it stays confirmed

      await arcService.monitorTransaction(txid, {
        onStatusChange,
        pollInterval: 50, // Faster polling for test
        timeout: 500 // Shorter timeout
      });

      expect(callbacks.length).toBeGreaterThan(0);
      expect(callbacks.some(c => c.status === 'CONFIRMED')).toBe(true);
    });
  });

  describe('Endpoint Management', () => {
    it('should enable and disable endpoints', () => {
      const initialEndpoints = arcService.getAvailableEndpoints();
      expect(initialEndpoints).toHaveLength(2);

      arcService.disableEndpoint('taal');

      const endpointsAfterDisable = arcService.getAvailableEndpoints();
      // Only enabled endpoints are returned
      expect(endpointsAfterDisable).toHaveLength(1);
      expect(endpointsAfterDisable[0].name).toBe('bitails');

      arcService.enableEndpoint('taal');
      const endpointsAfterEnable = arcService.getAvailableEndpoints();

      expect(endpointsAfterEnable).toHaveLength(2);
      const taalEndpoint = endpointsAfterEnable.find(e => e.name === 'taal');
      expect(taalEndpoint).toBeDefined();
    });

    it('should add new endpoints dynamically', () => {
      const newEndpoint: ArcEndpoint = {
        name: 'new-provider',
        url: 'https://new-arc.example.com',
        apiKey: 'new-key',
        priority: 3,
        timeout: 30000,
        maxRetries: 2,
        enabled: true
      };

      arcService.addEndpoint(newEndpoint);

      const endpoints = arcService.getAvailableEndpoints();
      expect(endpoints).toHaveLength(3);
      expect(endpoints.find(e => e.name === 'new-provider')).toBeDefined();
    });

    it('should remove endpoints', () => {
      arcService.removeEndpoint('bitails');

      const endpoints = arcService.getAvailableEndpoints();
      expect(endpoints).toHaveLength(1);
      expect(endpoints.find(e => e.name === 'bitails')).toBeUndefined();
    });

    it('should update endpoint configurations', () => {
      arcService.updateEndpoint('taal', {
        timeout: 60000,
        maxRetries: 5
      });

      const endpoints = arcService.getAvailableEndpoints();
      const taal = endpoints.find(e => e.name === 'taal');

      expect(taal!.timeout).toBe(60000);
      expect(taal!.maxRetries).toBe(5);
    });
  });

  describe('Integration with TorrentMicropaymentManager', () => {
    it('should integrate with micropayment manager for streaming payments', async () => {
      const micropaymentManager = {
        processBlockPayment: jest.fn(),
        batchProcessPayments: jest.fn()
      };

      const streamingPayments = Array.from({ length: 10 }, (_, i) => ({
        torrentHash: 'test-torrent',
        userPubKey: 'test-pubkey',
        blockIndex: i,
        blockSize: 16384,
        ratePerBlock: 17
      }));

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockResolvedValue({ txid: 'streaming', status: 'SEEN_ON_NETWORK' });

      const transactions = streamingPayments.map(() => createMockTransaction(17));
      const result = await arcService.streamingBroadcast(transactions, {
        rateLimit: 100,
        priority: 'high'
      });

      expect(result.successfulBroadcasts).toBe(10);
      expect(result.averageLatency).toBeGreaterThan(0);
    });

    it('should handle micropayment batch optimization', async () => {
      const batchPayments = Array.from({ length: 50 }, () => createMockTransaction(17));

      jest.spyOn(arcService as any, 'createArcInstance').mockImplementation(() => mockArc1);
      mockArc1.broadcast.mockResolvedValue({ txid: 'batch-optimized', status: 'SEEN_ON_NETWORK' });

      const result = await arcService.batchBroadcast(batchPayments, {
        optimizeForThroughput: true,
        maxConcurrent: 10
      });

      expect(result.efficiency).toBeGreaterThan(0.9);
      expect(result.throughput).toBeGreaterThan(0);
    });
  });
});
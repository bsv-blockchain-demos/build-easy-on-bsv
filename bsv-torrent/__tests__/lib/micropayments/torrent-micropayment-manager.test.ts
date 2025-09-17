/**
 * TorrentMicropaymentManager Tests
 * Test-driven development for streaming BSV micropayments (17 sats per 16KB)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TorrentMicropaymentManager } from '../../../lib/micropayments/torrent-micropayment-manager.js';
import BSVTestUtils from '../../utils/bsv-test-utils.js';
import MockFactories from '../../utils/mock-factories.js';

describe('TorrentMicropaymentManager', () => {
  let micropaymentManager: TorrentMicropaymentManager;
  let mockServerWallet: any;
  let mockWalletClient: any;
  let mockStorageProvider: any;
  let mockARCService: any;

  beforeEach(async () => {
    mockServerWallet = MockFactories.createMockServerWallet();
    mockWalletClient = MockFactories.createMockWalletClient();
    mockStorageProvider = MockFactories.createMockStorageProvider();
    mockARCService = MockFactories.createMockARCService();

    micropaymentManager = new TorrentMicropaymentManager({
      serverWallet: mockServerWallet,
      walletClient: mockWalletClient,
      storageProvider: mockStorageProvider,
      arcService: mockARCService,
    });

    await micropaymentManager.initialize();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Streaming Micropayments (17 sats per 16KB)', () => {
    it('should process single block payment correctly', async () => {
      const torrentHash = 'a'.repeat(40);
      const userPubKey = BSVTestUtils.generateTestPrivateKey('user').toPublicKey();
      const blockIndex = 0;

      const payment = await micropaymentManager.processBlockPayment({
        torrentHash,
        userPubKey: userPubKey.toString(),
        blockIndex,
        blockSize: 16384, // 16KB
        ratePerBlock: 17, // 17 sats
      });

      expect(payment.txid).toBeDefined();
      expect(payment.amount).toBe(17);
      expect(payment.blockIndex).toBe(0);
      expect(payment.confirmed).toBe(true);
    });

    it('should handle variable block sizes with proportional payments', async () => {
      const torrentHash = 'b'.repeat(40);
      const userPubKey = BSVTestUtils.generateTestPrivateKey('user').toPublicKey();

      // Test half-size block (8KB)
      const halfBlockPayment = await micropaymentManager.processBlockPayment({
        torrentHash,
        userPubKey: userPubKey.toString(),
        blockIndex: 0,
        blockSize: 8192, // 8KB = half block
        ratePerBlock: 17,
      });

      expect(halfBlockPayment.amount).toBe(8); // 17 / 2 = 8.5, rounded down

      // Test double-size block (32KB)
      const doubleBlockPayment = await micropaymentManager.processBlockPayment({
        torrentHash,
        userPubKey: userPubKey.toString(),
        blockIndex: 1,
        blockSize: 32768, // 32KB = double block
        ratePerBlock: 17,
      });

      expect(doubleBlockPayment.amount).toBe(34); // 17 * 2
    });

    it('should create streaming payment channel for continuous transfers', async () => {
      const torrentHash = 'c'.repeat(40);
      const userPubKey = BSVTestUtils.generateTestPrivateKey('user').toPublicKey();
      const expectedBlocks = 1000;
      const totalAmount = expectedBlocks * 17; // 17,000 sats

      const channel = await micropaymentManager.createStreamingChannel({
        torrentHash,
        userPubKey: userPubKey.toString(),
        expectedBlocks,
        ratePerBlock: 17,
        maxChannelBalance: totalAmount,
      });

      expect(channel.channelId).toBeDefined();
      expect(channel.maxBalance).toBe(totalAmount);
      expect(channel.ratePerBlock).toBe(17);
      expect(channel.status).toBe('open');
    });

    it('should batch multiple micropayments for efficiency', async () => {
      const torrentHash = 'd'.repeat(40);
      const userPubKey = BSVTestUtils.generateTestPrivateKey('user').toPublicKey();

      // Create multiple small payments
      const payments = Array.from({ length: 100 }, (_, i) => ({
        torrentHash,
        userPubKey: userPubKey.toString(),
        blockIndex: i,
        blockSize: 16384,
        ratePerBlock: 17,
      }));

      const batchResult = await micropaymentManager.batchProcessPayments(payments);

      expect(batchResult.totalAmount).toBe(1700); // 100 * 17
      expect(batchResult.transactionCount).toBeLessThan(100); // Should be batched
      expect(batchResult.efficiency).toBeGreaterThan(0.5); // Better than individual payments
    });
  });

  describe('Payment Channel Management', () => {
    it('should manage channel balance updates during streaming', async () => {
      const channelId = 'channel-123';
      const initialBalance = 10000;

      const channel = await micropaymentManager.initializeChannel({
        channelId,
        initialBalance,
        ratePerBlock: 17,
      });

      // Process several payments
      await micropaymentManager.streamPayment(channelId, { amount: 17, blockIndex: 0 });
      await micropaymentManager.streamPayment(channelId, { amount: 17, blockIndex: 1 });
      await micropaymentManager.streamPayment(channelId, { amount: 17, blockIndex: 2 });

      const updatedChannel = await micropaymentManager.getChannelStatus(channelId);
      expect(updatedChannel.remainingBalance).toBe(9949); // 10000 - (3 * 17)
      expect(updatedChannel.paymentsProcessed).toBe(3);
    });

    it('should prevent overspending in payment channels', async () => {
      const channelId = 'channel-456';
      const initialBalance = 50; // Only enough for 2 payments

      await micropaymentManager.initializeChannel({
        channelId,
        initialBalance,
        ratePerBlock: 17,
      });

      // Process 2 successful payments
      await micropaymentManager.streamPayment(channelId, { amount: 17, blockIndex: 0 });
      await micropaymentManager.streamPayment(channelId, { amount: 17, blockIndex: 1 });

      // Third payment should fail
      await expect(
        micropaymentManager.streamPayment(channelId, { amount: 17, blockIndex: 2 })
      ).rejects.toThrow('Insufficient channel balance');
    });

    it('should handle channel closure and settlement', async () => {
      const channelId = 'channel-789';
      const initialBalance = 1000;

      await micropaymentManager.initializeChannel({
        channelId,
        initialBalance,
        ratePerBlock: 17,
      });

      // Process some payments
      await micropaymentManager.streamPayment(channelId, { amount: 17, blockIndex: 0 });
      await micropaymentManager.streamPayment(channelId, { amount: 17, blockIndex: 1 });

      const settlement = await micropaymentManager.settleChannel(channelId);

      expect(settlement.settled).toBe(true);
      expect(settlement.finalAmount).toBe(34); // 2 * 17
      expect(settlement.refundAmount).toBe(966); // 1000 - 34
    });
  });

  describe('Real-time Payment Processing', () => {
    it('should process payments in real-time during torrent download', async () => {
      const torrentHash = 'e'.repeat(40);
      const userPubKey = BSVTestUtils.generateTestPrivateKey('user').toPublicKey();

      const realtimeProcessor = await micropaymentManager.createRealtimeProcessor({
        torrentHash,
        userPubKey: userPubKey.toString(),
        ratePerBlock: 17,
        bufferSize: 10, // Buffer 10 blocks worth of payments
      });

      // Simulate real-time block reception
      const blocks = Array.from({ length: 5 }, (_, i) => ({
        index: i,
        size: 16384,
        hash: `block-${i}-hash`,
        timestamp: Date.now() + i * 100,
      }));

      for (const block of blocks) {
        const payment = await realtimeProcessor.processBlock(block);
        expect(payment.amount).toBe(17);
        expect(payment.blockIndex).toBe(block.index);
      }

      const stats = await realtimeProcessor.getStats();
      expect(stats.totalProcessed).toBe(5);
      expect(stats.totalAmount).toBe(85); // 5 * 17
    });

    it('should handle payment failures gracefully', async () => {
      const torrentHash = 'f'.repeat(40);
      const userPubKey = BSVTestUtils.generateTestPrivateKey('user').toPublicKey();

      // Mock a payment failure
      mockServerWallet.createTransaction.mockRejectedValueOnce(new Error('Insufficient funds'));

      const payment = await micropaymentManager.processBlockPayment({
        torrentHash,
        userPubKey: userPubKey.toString(),
        blockIndex: 0,
        blockSize: 16384,
        ratePerBlock: 17,
      });

      expect(payment.success).toBe(false);
      expect(payment.error).toBe('Insufficient funds');
      expect(payment.retryable).toBe(true);
    });

    it('should implement payment retry logic', async () => {
      const torrentHash = 'g'.repeat(40);
      const userPubKey = BSVTestUtils.generateTestPrivateKey('user').toPublicKey();

      // Mock payment failure then success
      mockServerWallet.createTransaction
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          txid: 'success-txid',
          rawTransaction: Buffer.from('success-tx'),
          inputs: [],
          outputs: [],
          satoshis: 17,
        });

      const payment = await micropaymentManager.processBlockPaymentWithRetry({
        torrentHash,
        userPubKey: userPubKey.toString(),
        blockIndex: 0,
        blockSize: 16384,
        ratePerBlock: 17,
        maxRetries: 3,
      });

      expect(payment.success).toBe(true);
      expect(payment.txid).toBe('success-txid');
      expect(payment.retryCount).toBe(1);
    });
  });

  describe('Payment Optimization', () => {
    it('should optimize payment frequency based on network conditions', async () => {
      const optimizer = await micropaymentManager.createPaymentOptimizer({
        networkFeeRate: 1, // 1 sat/byte
        minBatchSize: 5,   // Minimum 5 payments per batch
        maxDelay: 1000,    // Maximum 1 second delay
      });

      // Add payments to optimizer
      for (let i = 0; i < 10; i++) {
        await optimizer.addPendingPayment({
          amount: 17,
          blockIndex: i,
          timestamp: Date.now(),
        });
      }

      const optimization = await optimizer.optimize();

      expect(optimization.batchCount).toBeLessThan(10); // Should batch payments
      expect(optimization.totalFees).toBeLessThan(10 * 1); // Lower fees than individual
      expect(optimization.efficiency).toBeGreaterThan(0.8); // High efficiency
    });

    it('should adjust payment rates based on peer performance', async () => {
      const peerPubKey = BSVTestUtils.generateTestPrivateKey('peer').toPublicKey();

      const rateAdjuster = await micropaymentManager.createDynamicRateAdjuster({
        basePeerPubKey: peerPubKey.toString(),
        baseRate: 17,
        performanceWindow: 60000, // 1 minute window
      });

      // Report peer performance metrics
      await rateAdjuster.updatePeerPerformance({
        uploadSpeed: 10000000, // 10 MB/s - fast
        reliability: 0.98,     // 98% reliability
        latency: 50,           // 50ms latency
      });

      const adjustedRate = await rateAdjuster.getAdjustedRate();

      expect(adjustedRate).toBeGreaterThan(17); // Bonus for good performance
      expect(adjustedRate).toBeLessThan(30);    // Reasonable upper bound
    });

    it('should implement incentive bonuses for seeders', async () => {
      const seederPubKey = BSVTestUtils.generateTestPrivateKey('seeder').toPublicKey();
      const torrentHash = 'h'.repeat(40);

      const incentive = await micropaymentManager.calculateSeederIncentive({
        seederPubKey: seederPubKey.toString(),
        torrentHash,
        uploadsCompleted: 1000,
        averageSpeed: 5000000, // 5 MB/s
        reputationScore: 95,
      });

      expect(incentive.bonusAmount).toBeGreaterThan(0);
      expect(incentive.bonusRate).toBeGreaterThan(1.0); // Bonus multiplier
      expect(incentive.totalIncentive).toBeGreaterThan(incentive.bonusAmount);
    });
  });

  describe('Analytics and Monitoring', () => {
    it('should track payment analytics', async () => {
      const torrentHash = 'i'.repeat(40);

      // Process several payments
      for (let i = 0; i < 50; i++) {
        await micropaymentManager.processBlockPayment({
          torrentHash,
          userPubKey: BSVTestUtils.generateTestPrivateKey('user').toPublicKey().toString(),
          blockIndex: i,
          blockSize: 16384,
          ratePerBlock: 17,
        });
      }

      const analytics = await micropaymentManager.getPaymentAnalytics(torrentHash);

      expect(analytics.totalPayments).toBe(50);
      expect(analytics.totalAmount).toBe(850); // 50 * 17
      expect(analytics.averagePayment).toBe(17);
      expect(analytics.paymentRate).toBeGreaterThan(0); // Payments per second
    });

    it('should monitor system performance', async () => {
      const monitor = await micropaymentManager.getPerformanceMonitor();

      // Simulate some load
      const promises = Array.from({ length: 100 }, (_, i) =>
        micropaymentManager.processBlockPayment({
          torrentHash: 'j'.repeat(40),
          userPubKey: BSVTestUtils.generateTestPrivateKey(`user-${i}`).toPublicKey().toString(),
          blockIndex: i,
          blockSize: 16384,
          ratePerBlock: 17,
        })
      );

      await Promise.all(promises);

      const metrics = await monitor.getMetrics();

      expect(metrics.paymentsPerSecond).toBeGreaterThan(0);
      expect(metrics.averageLatency).toBeLessThan(1000); // Under 1 second
      expect(metrics.successRate).toBeGreaterThan(0.95); // 95%+ success rate
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle blockchain network disruptions', async () => {
      // Mock network failure
      mockARCService.broadcast.mockRejectedValue(new Error('Network unavailable'));

      const payment = await micropaymentManager.processBlockPayment({
        torrentHash: 'k'.repeat(40),
        userPubKey: BSVTestUtils.generateTestPrivateKey('user').toPublicKey().toString(),
        blockIndex: 0,
        blockSize: 16384,
        ratePerBlock: 17,
      });

      expect(payment.success).toBe(false);
      expect(payment.error).toContain('Network unavailable');
      expect(payment.queued).toBe(true); // Should queue for retry
    });

    it('should recover from temporary failures', async () => {
      const recoveryManager = await micropaymentManager.getRecoveryManager();

      // Simulate failures and recovery
      await recoveryManager.handleFailure({
        type: 'network-timeout',
        payment: {
          amount: 17,
          blockIndex: 0,
          timestamp: Date.now(),
        },
      });

      // Mock network recovery
      mockARCService.broadcast.mockResolvedValue({
        txid: 'recovered-txid',
        status: 'broadcasted',
        timestamp: new Date().toISOString(),
      });

      const recovery = await recoveryManager.attemptRecovery();

      expect(recovery.recovered).toBe(true);
      expect(recovery.paymentsProcessed).toBe(1);
      expect(recovery.newTxids).toContain('recovered-txid');
    });
  });

  describe('Performance Benchmarks', () => {
    it('should process high-frequency micropayments efficiently', async () => {
      const { averageTime } = await BSVTestUtils.measurePerformance(
        async () => {
          return await micropaymentManager.processBlockPayment({
            torrentHash: 'l'.repeat(40),
            userPubKey: BSVTestUtils.generateTestPrivateKey('user').toPublicKey().toString(),
            blockIndex: 0,
            blockSize: 16384,
            ratePerBlock: 17,
          });
        },
        100 // 100 iterations
      );

      // Should process each payment in under 50ms on average
      expect(averageTime).toBeLessThan(50);
    });

    it('should handle concurrent payment streams', async () => {
      const concurrentStreams = 20;
      const paymentsPerStream = 50;

      const streamPromises = Array.from({ length: concurrentStreams }, async (_, streamId) => {
        const torrentHash = streamId.toString().padStart(40, '0');
        const payments = [];

        for (let i = 0; i < paymentsPerStream; i++) {
          payments.push(
            micropaymentManager.processBlockPayment({
              torrentHash,
              userPubKey: BSVTestUtils.generateTestPrivateKey(`user-${streamId}`).toPublicKey().toString(),
              blockIndex: i,
              blockSize: 16384,
              ratePerBlock: 17,
            })
          );
        }

        return Promise.all(payments);
      });

      const results = await Promise.all(streamPromises);

      // All streams should complete successfully
      expect(results).toHaveLength(concurrentStreams);
      results.forEach(streamResults => {
        expect(streamResults).toHaveLength(paymentsPerStream);
        streamResults.forEach(payment => {
          expect(payment.amount).toBe(17);
        });
      });
    });
  });
});
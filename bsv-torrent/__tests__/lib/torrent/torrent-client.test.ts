/**
 * Comprehensive test suite for TorrentClient
 * Tests WebTorrent integration with BSV micropayments
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TorrentClient } from '../../../lib/torrent/torrent-client';
import type { TorrentMicropaymentManager } from '../../../lib/micropayments/torrent-micropayment-manager';
import type { TorrentOverlayService } from '../../../lib/overlay/torrent-overlay-service';
import type { TorrentWalletManager } from '../../../lib/wallet/torrent-wallet-manager';
import { MockFactories } from '../../utils/mock-factories';

// Mock WebTorrent
jest.mock('webtorrent');

describe('TorrentClient', () => {
  let client: TorrentClient;
  let mockMicropaymentManager: jest.Mocked<TorrentMicropaymentManager>;
  let mockOverlayService: jest.Mocked<TorrentOverlayService>;
  let mockWalletManager: jest.Mocked<TorrentWalletManager>;

  const defaultConfig = {
    paymentRate: 17, // sats per 16KB
    blockSize: 16384, // 16KB
    maxConcurrentDownloads: 5,
    peerTimeout: 30000,
    enableSeeding: true,
    maxUploadSlots: 10
  };

  beforeEach(() => {
    mockMicropaymentManager = MockFactories.createMockMicropaymentManager() as any;
    mockOverlayService = MockFactories.createMockOverlayService() as any;
    mockWalletManager = MockFactories.createMockServerWallet() as any;

    client = new TorrentClient({
      micropaymentManager: mockMicropaymentManager,
      overlayService: mockOverlayService,
      walletManager: mockWalletManager,
      config: defaultConfig
    });
  });

  afterEach(async () => {
    await client.destroy();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(client).toBeDefined();
      expect(client.isReady()).toBe(false);
    });

    it('should validate required dependencies', () => {
      expect(() => new TorrentClient({
        config: defaultConfig,
        micropaymentManager: null as any,
        overlayService: mockOverlayService,
        walletManager: mockWalletManager
      })).toThrow('MicropaymentManager is required');
    });

    it('should validate configuration parameters', () => {
      expect(() => new TorrentClient({
        config: { ...defaultConfig, paymentRate: -1 },
        micropaymentManager: mockMicropaymentManager,
        overlayService: mockOverlayService,
        walletManager: mockWalletManager
      })).toThrow('Payment rate must be positive');
    });

    it('should initialize WebTorrent instance', async () => {
      await client.initialize();
      expect(client.isReady()).toBe(true);
    });
  });

  describe('Torrent Adding and Management', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it('should add torrent with payment verification', async () => {
      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';

      mockOverlayService.discoverPeers.mockResolvedValue([
        { peerId: 'peer1', address: '192.168.1.1', port: 6881, publicKey: 'pub1', reputation: 85 }
      ]);

      const torrent = await client.addTorrent(magnetURI);

      expect(torrent).toBeDefined();
      expect(torrent.infoHash).toBe('1234567890abcdef1234567890abcdef12345678');
      expect(mockOverlayService.discoverPeers).toHaveBeenCalledWith(torrent.infoHash);
    });

    it('should register content in overlay network when seeding', async () => {
      const fileBuffer = Buffer.alloc(32768, 'test data');
      const metadata = {
        name: 'test-file.txt',
        description: 'Test file for seeding',
        tags: ['test', 'demo']
      };

      mockOverlayService.registerContent.mockResolvedValue('content-id-123');

      const torrent = await client.seedTorrent(fileBuffer, metadata);

      expect(torrent).toBeDefined();
      expect(mockOverlayService.registerContent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: metadata.name,
          description: metadata.description,
          tags: metadata.tags
        })
      );
    });

    it('should remove torrent and clean up resources', async () => {
      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const torrent = await client.addTorrent(magnetURI);

      await client.removeTorrent(torrent.infoHash);

      expect(client.getTorrent(torrent.infoHash)).toBeNull();
      expect(mockMicropaymentManager.closeChannel).toHaveBeenCalled();
    });
  });

  describe('Payment-Gated Chunk Delivery', () => {
    let torrent: any;

    beforeEach(async () => {
      await client.initialize();
      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      torrent = await client.addTorrent(magnetURI);
    });

    it('should verify payment before serving chunks', async () => {
      const peerId = 'peer1';
      const chunkIndex = 0;
      const paymentAmount = 17; // sats

      mockMicropaymentManager.verifyPayment.mockResolvedValue(true);

      const result = await client.verifyChunkPayment(torrent.infoHash, peerId, chunkIndex, paymentAmount);

      expect(result).toBe(true);
      expect(mockMicropaymentManager.verifyPayment).toHaveBeenCalledWith(
        peerId,
        paymentAmount,
        expect.objectContaining({
          torrentHash: torrent.infoHash,
          chunkIndex,
          timestamp: expect.any(Number)
        })
      );
    });

    it('should reject chunk delivery for insufficient payment', async () => {
      const peerId = 'peer1';
      const chunkIndex = 0;
      const paymentAmount = 10; // Insufficient

      mockMicropaymentManager.verifyPayment.mockResolvedValue(false);

      const result = await client.verifyChunkPayment(torrent.infoHash, peerId, chunkIndex, paymentAmount);

      expect(result).toBe(false);
    });

    it('should process payment when downloading chunks', async () => {
      const peerId = 'peer1';
      const chunkIndex = 0;
      const chunkData = Buffer.alloc(16384, 'chunk data');

      mockMicropaymentManager.processPayment.mockResolvedValue({
        txid: 'payment-tx-123',
        amount: 17,
        confirmed: false
      });

      const result = await client.downloadChunk(torrent.infoHash, peerId, chunkIndex);

      expect(result).toBeDefined();
      expect(mockMicropaymentManager.processPayment).toHaveBeenCalledWith(
        peerId,
        17,
        expect.objectContaining({
          torrentHash: torrent.infoHash,
          chunkIndex
        })
      );
    });

    it('should handle payment failures gracefully', async () => {
      const peerId = 'peer1';
      const chunkIndex = 0;

      mockMicropaymentManager.processPayment.mockRejectedValue(new Error('Insufficient funds'));

      await expect(client.downloadChunk(torrent.infoHash, peerId, chunkIndex))
        .rejects.toThrow('Payment failed for chunk');
    });
  });

  describe('Seeder Incentivization', () => {
    let torrent: any;

    beforeEach(async () => {
      await client.initialize();
      const fileBuffer = Buffer.alloc(32768, 'test data');
      torrent = await client.seedTorrent(fileBuffer, { name: 'test-file.txt' });
    });

    it('should collect payments when serving chunks', async () => {
      const peerId = 'downloader1';
      const chunkIndex = 0;
      const paymentAmount = 17;

      mockMicropaymentManager.collectPayment.mockResolvedValue({
        txid: 'collection-tx-123',
        amount: paymentAmount,
        confirmed: false
      });

      const result = await client.serveChunk(torrent.infoHash, peerId, chunkIndex, paymentAmount);

      expect(result.success).toBe(true);
      expect(mockMicropaymentManager.collectPayment).toHaveBeenCalledWith(
        peerId,
        paymentAmount,
        expect.objectContaining({
          torrentHash: torrent.infoHash,
          chunkIndex
        })
      );
    });

    it('should track seeding statistics', async () => {
      const peerId = 'downloader1';
      const chunkIndex = 0;
      const paymentAmount = 17;

      mockMicropaymentManager.collectPayment.mockResolvedValue({
        txid: 'collection-tx-123',
        amount: paymentAmount,
        confirmed: false
      });

      await client.serveChunk(torrent.infoHash, peerId, chunkIndex, paymentAmount);

      const stats = client.getSeedingStats(torrent.infoHash);
      expect(stats.chunksServed).toBe(1);
      expect(stats.totalEarnings).toBe(paymentAmount);
    });

    it('should handle automatic payment channel optimization', async () => {
      const peerId = 'frequent-downloader';

      // Simulate multiple chunk requests
      for (let i = 0; i < 5; i++) {
        mockMicropaymentManager.collectPayment.mockResolvedValueOnce({
          txid: `collection-tx-${i}`,
          amount: 17,
          confirmed: false
        });

        await client.serveChunk(torrent.infoHash, peerId, i, 17);
      }

      expect(mockMicropaymentManager.optimizeChannel).toHaveBeenCalledWith(peerId);
    });
  });

  describe('Download Progress and Payment Reconciliation', () => {
    let torrent: any;

    beforeEach(async () => {
      await client.initialize();
      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      torrent = await client.addTorrent(magnetURI);
    });

    it('should track download progress with payment reconciliation', async () => {
      const totalChunks = 4;
      const downloadedChunks = 2;

      // Simulate partial download
      for (let i = 0; i < downloadedChunks; i++) {
        mockMicropaymentManager.processPayment.mockResolvedValueOnce({
          txid: `payment-tx-${i}`,
          amount: 17,
          confirmed: false
        });

        await client.downloadChunk(torrent.infoHash, `peer${i}`, i);
      }

      const progress = client.getDownloadProgress(torrent.infoHash);
      expect(progress.totalChunks).toBe(totalChunks);
      expect(progress.downloadedChunks).toBe(downloadedChunks);
      expect(progress.totalPaid).toBe(downloadedChunks * 17);
      expect(progress.progressPercentage).toBe(50);
    });

    it('should handle payment verification failures', async () => {
      mockMicropaymentManager.processPayment.mockRejectedValue(new Error('Payment verification failed'));

      await expect(client.downloadChunk(torrent.infoHash, 'peer1', 0))
        .rejects.toThrow('Payment failed for chunk');

      const progress = client.getDownloadProgress(torrent.infoHash);
      expect(progress.downloadedChunks).toBe(0);
      expect(progress.failedPayments).toBe(1);
    });
  });

  describe('Pause/Resume with Payment State Preservation', () => {
    let torrent: any;

    beforeEach(async () => {
      await client.initialize();
      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      torrent = await client.addTorrent(magnetURI);
    });

    it('should pause torrent and preserve payment state', async () => {
      // Make some payments first
      mockMicropaymentManager.processPayment.mockResolvedValue({
        txid: 'payment-tx-123',
        amount: 17,
        confirmed: false
      });

      await client.downloadChunk(torrent.infoHash, 'peer1', 0);

      await client.pauseTorrent(torrent.infoHash);

      const state = client.getPaymentState(torrent.infoHash);
      expect(state.isPaused).toBe(true);
      expect(state.totalPaid).toBe(17);
      expect(mockMicropaymentManager.pauseChannel).toHaveBeenCalled();
    });

    it('should resume torrent with preserved payment state', async () => {
      // Pause first
      await client.pauseTorrent(torrent.infoHash);

      // Resume
      await client.resumeTorrent(torrent.infoHash);

      const state = client.getPaymentState(torrent.infoHash);
      expect(state.isPaused).toBe(false);
      expect(mockMicropaymentManager.resumeChannel).toHaveBeenCalled();
    });

    it('should handle graceful shutdown with state persistence', async () => {
      // Make some payments
      mockMicropaymentManager.processPayment.mockResolvedValue({
        txid: 'payment-tx-123',
        amount: 17,
        confirmed: false
      });

      await client.downloadChunk(torrent.infoHash, 'peer1', 0);

      await client.shutdown();

      expect(mockMicropaymentManager.persistState).toHaveBeenCalled();
    });
  });

  describe('Content Verification and Authenticity', () => {
    let torrent: any;

    beforeEach(async () => {
      await client.initialize();
      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      torrent = await client.addTorrent(magnetURI);
    });

    it('should verify chunk hashes after download', async () => {
      const chunkData = Buffer.alloc(16384, 'valid chunk data');
      const expectedHash = 'expected-chunk-hash';

      mockMicropaymentManager.processPayment.mockResolvedValue({
        txid: 'payment-tx-123',
        amount: 17,
        confirmed: false
      });

      jest.spyOn(client, 'verifyChunkHash').mockReturnValue(true);

      const result = await client.downloadChunk(torrent.infoHash, 'peer1', 0);

      expect(result).toBeDefined();
    });

    it('should report malicious peers for invalid chunks', async () => {
      const peerId = 'malicious-peer';

      mockMicropaymentManager.processPayment.mockResolvedValue({
        txid: 'payment-tx-123',
        amount: 17,
        confirmed: false
      });

      // Mock hash verification to fail
      jest.spyOn(client, 'verifyChunkHash').mockReturnValue(false);

      await expect(client.downloadChunk(torrent.infoHash, peerId, 0))
        .rejects.toThrow('Invalid chunk hash');

      expect(mockOverlayService.reportMaliciousPeer).toHaveBeenCalledWith(
        peerId,
        'invalid_chunk_hash',
        expect.objectContaining({
          torrentHash: torrent.infoHash,
          chunkIndex: 0
        })
      );
    });

    it('should verify content authenticity through overlay registry', async () => {
      mockOverlayService.verifyContent.mockResolvedValue({
        isValid: true,
        registeredBy: 'content-creator-key',
        registrationTx: 'registration-tx-123'
      });

      const result = await client.verifyContentAuthenticity(torrent.infoHash);

      expect(result.isValid).toBe(true);
      expect(mockOverlayService.verifyContent).toHaveBeenCalledWith(torrent.infoHash);
    });
  });

  describe('Performance and Monitoring', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it('should track performance metrics', async () => {
      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const torrent = await client.addTorrent(magnetURI);

      const metrics = client.getPerformanceMetrics();

      expect(metrics).toEqual({
        activeTorrents: 1,
        totalDownloadSpeed: expect.any(Number),
        totalUploadSpeed: expect.any(Number),
        totalPaymentsSent: expect.any(Number),
        totalPaymentsReceived: expect.any(Number),
        averageChunkTime: expect.any(Number),
        paymentSuccessRate: expect.any(Number)
      });
    });

    it('should provide real-time statistics', async () => {
      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const torrent = await client.addTorrent(magnetURI);

      // Simulate some activity
      mockMicropaymentManager.processPayment.mockResolvedValue({
        txid: 'payment-tx-123',
        amount: 17,
        confirmed: false
      });

      await client.downloadChunk(torrent.infoHash, 'peer1', 0);

      const stats = client.getRealTimeStats();
      expect(stats.recentPayments).toHaveLength(1);
      expect(stats.activeConnections).toBeGreaterThan(0);
    });

    it('should handle dynamic rate adjustment based on peer performance', async () => {
      const slowPeer = 'slow-peer';
      const fastPeer = 'fast-peer';

      // Simulate slow peer (high latency)
      jest.spyOn(client, 'measurePeerLatency').mockResolvedValueOnce(5000); // 5 seconds
      jest.spyOn(client, 'measurePeerLatency').mockResolvedValueOnce(100);  // 100ms

      await client.adjustPaymentRate(slowPeer);
      await client.adjustPaymentRate(fastPeer);

      const slowPeerRate = client.getPeerPaymentRate(slowPeer);
      const fastPeerRate = client.getPeerPaymentRate(fastPeer);

      expect(slowPeerRate).toBeLessThan(fastPeerRate);
    });
  });

  describe('Error Handling and Recovery', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it('should handle network interruptions gracefully', async () => {
      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const torrent = await client.addTorrent(magnetURI);

      // Simulate network failure
      mockMicropaymentManager.processPayment.mockRejectedValue(new Error('Network timeout'));

      await expect(client.downloadChunk(torrent.infoHash, 'peer1', 0))
        .rejects.toThrow('Payment failed for chunk');

      // Verify retry mechanism was triggered
      expect(mockMicropaymentManager.retryPayment).toHaveBeenCalled();
    });

    it('should recover from payment channel failures', async () => {
      const peerId = 'peer1';

      mockMicropaymentManager.processPayment.mockRejectedValueOnce(new Error('Channel closed'));
      mockMicropaymentManager.reopenChannel.mockResolvedValue(true);
      mockMicropaymentManager.processPayment.mockResolvedValueOnce({
        txid: 'payment-tx-123',
        amount: 17,
        confirmed: false
      });

      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const torrent = await client.addTorrent(magnetURI);

      const result = await client.downloadChunk(torrent.infoHash, peerId, 0);

      expect(result).toBeDefined();
      expect(mockMicropaymentManager.reopenChannel).toHaveBeenCalledWith(peerId);
    });

    it('should handle overlay service failures with fallback', async () => {
      mockOverlayService.discoverPeers.mockRejectedValueOnce(new Error('Overlay network down'));
      mockOverlayService.discoverPeers.mockResolvedValueOnce([
        { peerId: 'backup-peer', address: '192.168.1.2', port: 6881, publicKey: 'pub2', reputation: 90 }
      ]);

      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const torrent = await client.addTorrent(magnetURI);

      expect(torrent).toBeDefined();
      expect(mockOverlayService.discoverPeers).toHaveBeenCalledTimes(2);
    });
  });

  describe('Integration with Existing Services', () => {
    beforeEach(async () => {
      await client.initialize();
    });

    it('should integrate with TorrentMicropaymentManager for all payments', async () => {
      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const torrent = await client.addTorrent(magnetURI);

      mockMicropaymentManager.processPayment.mockResolvedValue({
        txid: 'payment-tx-123',
        amount: 17,
        confirmed: false
      });

      await client.downloadChunk(torrent.infoHash, 'peer1', 0);

      expect(mockMicropaymentManager.processPayment).toHaveBeenCalledWith(
        'peer1',
        17,
        expect.objectContaining({
          torrentHash: torrent.infoHash,
          chunkIndex: 0
        })
      );
    });

    it('should integrate with TorrentOverlayService for peer discovery', async () => {
      mockOverlayService.discoverPeers.mockResolvedValue([
        { peerId: 'peer1', address: '192.168.1.1', port: 6881, publicKey: 'pub1', reputation: 85 },
        { peerId: 'peer2', address: '192.168.1.2', port: 6882, publicKey: 'pub2', reputation: 92 }
      ]);

      const magnetURI = 'magnet:?xt=urn:btih:1234567890abcdef1234567890abcdef12345678';
      const torrent = await client.addTorrent(magnetURI);

      expect(mockOverlayService.discoverPeers).toHaveBeenCalledWith(torrent.infoHash);
    });

    it('should integrate with TorrentWalletManager for key derivation', async () => {
      const fileBuffer = Buffer.alloc(32768, 'test data');
      const torrent = await client.seedTorrent(fileBuffer, { name: 'test-file.txt' });

      expect(mockWalletManager.deriveKey).toHaveBeenCalledWith(
        expect.stringMatching(/torrent\/.*\/seeding/),
        'BRC-42'
      );
    });
  });
});
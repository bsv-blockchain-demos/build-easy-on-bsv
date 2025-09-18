/**
 * TorrentOverlayService Tests
 * Test-driven development for BSV overlay-based peer discovery and content registration
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TorrentOverlayService } from '../../../lib/overlay/torrent-overlay-service';
import BSVTestUtils from '../../utils/bsv-test-utils';
import MockFactories from '../../utils/mock-factories';

describe('TorrentOverlayService', () => {
  let overlayService: TorrentOverlayService;
  let mockKeyManager: any;
  let mockMicropaymentManager: any;
  let mockOverlayNetwork: any;
  let mockStorageProvider: any;
  let mockReputationSystem: any;

  beforeEach(async () => {
    mockKeyManager = {
      getMasterPublicKey: jest.fn().mockReturnValue(
        BSVTestUtils.generateTestPrivateKey('master').toPublicKey()
      ),
      derivePeerCommunicationKey: jest.fn().mockResolvedValue({
        privateKey: BSVTestUtils.generateTestPrivateKey('peer-comm'),
        publicKey: BSVTestUtils.generateTestPrivateKey('peer-comm').toPublicKey(),
        sharedSecret: 'mock-shared-secret',
      }),
      deriveAttestationKey: jest.fn().mockResolvedValue(
        BSVTestUtils.generateTestPrivateKey('attestation')
      ),
    };

    mockMicropaymentManager = MockFactories.createMockMicropaymentManager();
    mockOverlayNetwork = MockFactories.createMockOverlayService();
    mockStorageProvider = MockFactories.createMockMongoCollection();
    mockReputationSystem = MockFactories.createMockReputationSystem();

    overlayService = new TorrentOverlayService({
      keyManager: mockKeyManager,
      micropaymentManager: mockMicropaymentManager,
      overlayNetwork: mockOverlayNetwork,
      storageProvider: mockStorageProvider,
      reputationSystem: mockReputationSystem,
    });

    await overlayService.initialize();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should initialize overlay service with all dependencies', async () => {
      expect(overlayService.isInitialized()).toBe(true);
      expect(mockOverlayNetwork.subscribe).toHaveBeenCalledWith(
        'torrent-peer-discovery',
        expect.any(Function)
      );
      expect(mockOverlayNetwork.subscribe).toHaveBeenCalledWith(
        'torrent-content-registry',
        expect.any(Function)
      );
      expect(mockOverlayNetwork.subscribe).toHaveBeenCalledWith(
        'torrent-peer-reputation',
        expect.any(Function)
      );
    });

    it('should handle initialization failures gracefully', async () => {
      const failingOverlayService = new TorrentOverlayService({
        keyManager: null,
        micropaymentManager: null,
        overlayNetwork: null,
        storageProvider: null,
        reputationSystem: null,
      });

      await expect(failingOverlayService.initialize()).rejects.toThrow(
        'Failed to initialize overlay service'
      );
    });

    it('should validate required dependencies', () => {
      expect(() => {
        new TorrentOverlayService({} as any);
      }).toThrow('Missing required dependencies');
    });
  });

  describe('Peer Discovery and Announcement', () => {
    it('should announce peer availability for torrent content', async () => {
      const torrentHash = 'a'.repeat(40);
      const peerInfo = {
        peerId: 'peer-123',
        address: '192.168.1.100',
        port: 6881,
        capabilities: ['seeding', 'downloading'],
        bandwidth: 1000000, // 1 MB/s
      };

      const announcement = await overlayService.announcePeer(torrentHash, peerInfo);

      expect(announcement.messageId).toBeDefined();
      expect(announcement.timestamp).toBeDefined();
      expect(mockOverlayNetwork.publish).toHaveBeenCalledWith(
        'torrent-peer-discovery',
        expect.objectContaining({
          torrentHash,
          peerId: peerInfo.peerId,
          address: peerInfo.address,
          port: peerInfo.port,
          capabilities: peerInfo.capabilities,
          bandwidth: peerInfo.bandwidth,
          signature: expect.any(String),
        })
      );
    });

    it('should discover peers for specific torrent content', async () => {
      const torrentHash = 'b'.repeat(40);
      const maxPeers = 50;

      // Mock discovered peers
      const mockPeers = [
        BSVTestUtils.generateTestPeerData('peer1'),
        BSVTestUtils.generateTestPeerData('peer2'),
        BSVTestUtils.generateTestPeerData('peer3'),
      ];
      mockOverlayNetwork.lookup.mockResolvedValue(mockPeers);

      const discoveredPeers = await overlayService.discoverPeers(torrentHash, maxPeers);

      expect(discoveredPeers).toHaveLength(3);
      expect(discoveredPeers[0]).toMatchObject({
        peerId: expect.any(String),
        address: expect.any(String),
        port: expect.any(Number),
        reputationScore: expect.any(Number),
      });
      expect(mockOverlayNetwork.lookup).toHaveBeenCalledWith({
        topic: 'torrent-peer-discovery',
        torrentHash,
        maxResults: maxPeers,
      });
    });

    it('should filter peers by minimum reputation score', async () => {
      const torrentHash = 'c'.repeat(40);
      const minReputationScore = 75;

      const mockPeers = [
        { ...BSVTestUtils.generateTestPeerData('peer1'), reputationScore: 85 },
        { ...BSVTestUtils.generateTestPeerData('peer2'), reputationScore: 65 }, // Below threshold
        { ...BSVTestUtils.generateTestPeerData('peer3'), reputationScore: 90 },
      ];
      mockOverlayNetwork.lookup.mockResolvedValue(mockPeers);

      const discoveredPeers = await overlayService.discoverPeers(
        torrentHash,
        50,
        { minReputationScore }
      );

      expect(discoveredPeers).toHaveLength(2);
      expect(discoveredPeers.every(peer => peer.reputationScore >= minReputationScore)).toBe(true);
    });

    it('should prioritize peers by bandwidth and reputation', async () => {
      const torrentHash = 'd'.repeat(40);

      const mockPeers = [
        { ...BSVTestUtils.generateTestPeerData('slow-peer'), bandwidth: 100000, reputationScore: 60 },
        { ...BSVTestUtils.generateTestPeerData('fast-peer'), bandwidth: 10000000, reputationScore: 95 },
        { ...BSVTestUtils.generateTestPeerData('medium-peer'), bandwidth: 1000000, reputationScore: 80 },
      ];
      mockOverlayNetwork.lookup.mockResolvedValue(mockPeers);

      const discoveredPeers = await overlayService.discoverPeers(torrentHash, 50);

      // Should be sorted by combined score (bandwidth + reputation)
      expect(discoveredPeers[0].peerId).toBe('fast-peer');
      expect(discoveredPeers[1].peerId).toBe('medium-peer');
      expect(discoveredPeers[2].peerId).toBe('slow-peer');
    });

    it('should handle peer announcement failures gracefully', async () => {
      const torrentHash = 'e'.repeat(40);
      const peerInfo = BSVTestUtils.generateTestPeerData('failing-peer');

      mockOverlayNetwork.publish.mockRejectedValue(new Error('Network unavailable'));

      const result = await overlayService.announcePeer(torrentHash, peerInfo);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network unavailable');
      expect(result.retryable).toBe(true);
    });
  });

  describe('Content Hash Registration and Lookup', () => {
    it('should register torrent content hash on overlay network', async () => {
      const torrentData = {
        infoHash: 'f'.repeat(40),
        name: 'Test Movie.mkv',
        size: 1073741824, // 1 GB
        pieceLength: 524288, // 512 KB
        pieces: 2048,
        files: [
          { path: 'Test Movie.mkv', size: 1073741824 },
        ],
        seeders: ['seeder1', 'seeder2'],
        tags: ['movie', 'action', 'hd'],
      };

      const registration = await overlayService.registerContent(torrentData);

      expect(registration.contentId).toBeDefined();
      expect(registration.timestamp).toBeDefined();
      expect(mockOverlayNetwork.publish).toHaveBeenCalledWith(
        'torrent-content-registry',
        expect.objectContaining({
          infoHash: torrentData.infoHash,
          name: torrentData.name,
          size: torrentData.size,
          files: torrentData.files,
          seeders: torrentData.seeders,
          tags: torrentData.tags,
          registrationSignature: expect.any(String),
        })
      );
    });

    it('should lookup content by hash with metadata', async () => {
      const infoHash = 'g'.repeat(40);

      const mockContent = {
        infoHash,
        name: 'Another Movie.mp4',
        size: 2147483648, // 2 GB
        seeders: ['seeder3', 'seeder4'],
        tags: ['movie', 'comedy'],
        timestamp: new Date().toISOString(),
      };
      mockOverlayNetwork.lookup.mockResolvedValue([mockContent]);

      const contentInfo = await overlayService.lookupContent(infoHash);

      expect(contentInfo).toMatchObject({
        infoHash,
        name: 'Another Movie.mp4',
        size: 2147483648,
        seeders: expect.arrayContaining(['seeder3', 'seeder4']),
        tags: expect.arrayContaining(['movie', 'comedy']),
      });
      expect(mockOverlayNetwork.lookup).toHaveBeenCalledWith({
        topic: 'torrent-content-registry',
        infoHash,
      });
    });

    it('should search content by tags and name patterns', async () => {
      const searchCriteria = {
        tags: ['movie', 'action'],
        namePattern: 'Test',
        minSize: 1000000000, // 1 GB minimum
        maxSize: 5000000000, // 5 GB maximum
      };

      const mockResults = [
        {
          infoHash: 'h'.repeat(40),
          name: 'Test Action Movie.mkv',
          size: 2000000000,
          tags: ['movie', 'action'],
        },
        {
          infoHash: 'i'.repeat(40),
          name: 'Another Test Film.mp4',
          size: 1500000000,
          tags: ['movie', 'action', 'thriller'],
        },
      ];
      mockOverlayNetwork.lookup.mockResolvedValue(mockResults);

      const searchResults = await overlayService.searchContent(searchCriteria);

      expect(searchResults).toHaveLength(2);
      expect(searchResults[0].tags).toEqual(expect.arrayContaining(['movie', 'action']));
      expect(searchResults[0].name).toContain('Test');
    });

    it('should validate content registration data', async () => {
      const invalidTorrentData = {
        // Missing required fields
        name: 'Invalid Torrent',
      };

      await expect(
        overlayService.registerContent(invalidTorrentData as any)
      ).rejects.toThrow('Invalid torrent data');
    });
  });

  describe('Peer Reputation Tracking and Verification', () => {
    it('should track peer upload/download activity', async () => {
      const peerId = 'peer-456';
      const torrentHash = 'j'.repeat(40);
      const activity = {
        type: 'upload',
        bytes: 16777216, // 16 MB
        duration: 60000, // 1 minute
        recipient: 'peer-789',
      };

      await overlayService.recordPeerActivity(peerId, torrentHash, activity);

      expect(mockReputationSystem.updateReputation).toHaveBeenCalledWith(
        peerId,
        expect.objectContaining({
          type: 'upload',
          bytes: 16777216,
          torrentHash,
          timestamp: expect.any(Number),
        })
      );
      expect(mockStorageProvider.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'peer-activity',
          peerId,
          torrentHash,
          activity: expect.objectContaining(activity),
        })
      );
    });

    it('should calculate peer reputation scores based on activity', async () => {
      const peerId = 'peer-789';

      const mockReputation = {
        score: 85,
        uploads: 1073741824, // 1 GB uploaded
        downloads: 536870912, // 512 MB downloaded
        ratio: 2.0,
        consistency: 0.95,
      };
      mockReputationSystem.getReputation.mockResolvedValue(mockReputation);

      const reputation = await overlayService.getPeerReputation(peerId);

      expect(reputation).toMatchObject({
        score: 85,
        uploads: 1073741824,
        downloads: 536870912,
        ratio: 2.0,
        consistency: 0.95,
      });
    });

    it('should verify peer attestations and certificates', async () => {
      const peerId = 'peer-101';
      const attestation = {
        type: 'upload-verification',
        torrentHash: 'k'.repeat(40),
        uploadBytes: 33554432, // 32 MB
        timestamp: Date.now(),
        witness: 'peer-102',
        signature: 'mock-attestation-signature',
      };

      const verification = await overlayService.verifyPeerAttestation(peerId, attestation);

      expect(verification.verified).toBe(true);
      expect(verification.score).toBeGreaterThan(0);
      expect(mockKeyManager.deriveAttestationKey).toHaveBeenCalledWith(
        peerId,
        attestation.type
      );
    });

    it('should handle malicious peer detection and reporting', async () => {
      const suspiciousPeerId = 'malicious-peer';
      const evidence = {
        type: 'fake-chunks',
        torrentHash: 'l'.repeat(40),
        corruptedPieces: [5, 12, 18],
        reporter: 'honest-peer',
        timestamp: Date.now(),
      };

      await overlayService.reportMaliciousPeer(suspiciousPeerId, evidence);

      expect(mockOverlayNetwork.publish).toHaveBeenCalledWith(
        'torrent-peer-reputation',
        expect.objectContaining({
          type: 'malicious-report',
          peerId: suspiciousPeerId,
          evidence,
          reporter: evidence.reporter,
        })
      );
      expect(mockReputationSystem.updateReputation).toHaveBeenCalledWith(
        suspiciousPeerId,
        expect.objectContaining({
          type: 'penalty',
          reason: 'malicious-behavior',
        })
      );
    });
  });

  describe('Incentivized Peer Discovery', () => {
    it('should reward peers for successful referrals', async () => {
      const referrerPeerId = 'referrer-peer';
      const referredPeerId = 'referred-peer';
      const torrentHash = 'm'.repeat(40);
      const referralBonus = 17; // sats

      // Mock successful peer referral
      mockMicropaymentManager.processBlockPayment.mockResolvedValue({
        txid: 'referral-payment-txid',
        amount: referralBonus,
        success: true,
      });

      const referralResult = await overlayService.processSuccessfulReferral(
        referrerPeerId,
        referredPeerId,
        torrentHash
      );

      expect(referralResult.success).toBe(true);
      expect(referralResult.payment.amount).toBe(referralBonus);
      expect(mockMicropaymentManager.processBlockPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          torrentHash,
          userPubKey: expect.any(String),
          blockSize: 16384, // Standard block size for referral
          ratePerBlock: referralBonus,
        })
      );
    });

    it('should track referral statistics and success rates', async () => {
      const referrerPeerId = 'tracker-peer';

      // Record multiple referrals
      const referrals = [
        { referred: 'peer1', successful: true },
        { referred: 'peer2', successful: true },
        { referred: 'peer3', successful: false },
        { referred: 'peer4', successful: true },
      ];

      for (const referral of referrals) {
        await overlayService.recordReferralAttempt(
          referrerPeerId,
          referral.referred,
          'n'.repeat(40),
          referral.successful
        );
      }

      const stats = await overlayService.getReferralStats(referrerPeerId);

      expect(stats.totalReferrals).toBe(4);
      expect(stats.successfulReferrals).toBe(3);
      expect(stats.successRate).toBe(0.75);
      expect(stats.totalEarnings).toBeGreaterThan(0);
    });

    it('should implement anti-abuse measures for referral system', async () => {
      const suspiciousReferrer = 'suspicious-referrer';
      const fakeReferred = 'fake-peer';

      // Simulate rapid referral attempts (potential abuse)
      const rapidReferrals = Array.from({ length: 50 }, (_, i) => ({
        referrerPeerId: suspiciousReferrer,
        referredPeerId: `fake-peer-${i}`,
        torrentHash: 'o'.repeat(40),
      }));

      const results = await Promise.all(
        rapidReferrals.map(r =>
          overlayService.processSuccessfulReferral(
            r.referrerPeerId,
            r.referredPeerId,
            r.torrentHash
          )
        )
      );

      // Should implement rate limiting after suspicious activity
      const failedReferrals = results.filter(r => !r.success);
      expect(failedReferrals.length).toBeGreaterThan(0);
      expect(failedReferrals[0].error).toContain('rate limit');
    });
  });

  describe('Multiple Overlay Network Support', () => {
    it('should manage connections to multiple overlay networks', async () => {
      const networks = ['network-a', 'network-b', 'network-c'];

      await overlayService.connectToNetworks(networks);

      const connectedNetworks = await overlayService.getConnectedNetworks();
      expect(connectedNetworks).toHaveLength(3);
      expect(connectedNetworks).toEqual(expect.arrayContaining(networks));
    });

    it('should aggregate peer discovery across multiple networks', async () => {
      const torrentHash = 'p'.repeat(40);

      // Mock peers from different networks
      const networkAPeers = [BSVTestUtils.generateTestPeerData('net-a-peer1')];
      const networkBPeers = [
        BSVTestUtils.generateTestPeerData('net-b-peer1'),
        BSVTestUtils.generateTestPeerData('net-b-peer2'),
      ];

      mockOverlayNetwork.lookup
        .mockResolvedValueOnce(networkAPeers)
        .mockResolvedValueOnce(networkBPeers);

      const aggregatedPeers = await overlayService.discoverPeersAcrossNetworks(torrentHash);

      expect(aggregatedPeers).toHaveLength(3);
      expect(aggregatedPeers.map(p => p.peerId)).toEqual(
        expect.arrayContaining(['net-a-peer1', 'net-b-peer1', 'net-b-peer2'])
      );
    });

    it('should handle network failures with fallback mechanisms', async () => {
      const torrentHash = 'q'.repeat(40);

      // Simulate one network failing
      mockOverlayNetwork.lookup
        .mockRejectedValueOnce(new Error('Network A unavailable'))
        .mockResolvedValueOnce([BSVTestUtils.generateTestPeerData('fallback-peer')]);

      const peers = await overlayService.discoverPeersWithFallback(torrentHash);

      expect(peers).toHaveLength(1);
      expect(peers[0].peerId).toBe('fallback-peer');
    });
  });

  describe('Integration with Topic Managers', () => {
    it('should implement topic manager for peer discovery messages', async () => {
      const topicManager = await overlayService.createPeerDiscoveryTopicManager();

      const mockMessage = {
        type: 'peer-announcement',
        torrentHash: 'r'.repeat(40),
        peerId: 'topic-peer',
        signature: 'valid-signature',
      };

      const admissionResult = await topicManager.identifyAdmissibleOutputs(
        Buffer.from(JSON.stringify(mockMessage)),
        []
      );

      expect(admissionResult.outputsToAdmit).toHaveLength(1);
      expect(topicManager.getDocumentation()).resolves.toContain('Peer Discovery Topic Manager');
    });

    it('should implement topic manager for content registration', async () => {
      const topicManager = await overlayService.createContentRegistryTopicManager();

      const mockContent = {
        type: 'content-registration',
        infoHash: 's'.repeat(40),
        name: 'Test Content',
        registrationSignature: 'valid-content-signature',
      };

      const admissionResult = await topicManager.identifyAdmissibleOutputs(
        Buffer.from(JSON.stringify(mockContent)),
        []
      );

      expect(admissionResult.outputsToAdmit).toHaveLength(1);
    });

    it('should validate message signatures in topic managers', async () => {
      const topicManager = await overlayService.createPeerDiscoveryTopicManager();

      const invalidMessage = {
        type: 'peer-announcement',
        torrentHash: 't'.repeat(40),
        peerId: 'invalid-peer',
        signature: 'invalid-signature',
      };

      const admissionResult = await topicManager.identifyAdmissibleOutputs(
        Buffer.from(JSON.stringify(invalidMessage)),
        []
      );

      expect(admissionResult.outputsToAdmit).toHaveLength(0);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle overlay network disconnections gracefully', async () => {
      mockOverlayNetwork.publish.mockRejectedValue(new Error('Connection lost'));

      const torrentHash = 'u'.repeat(40);
      const peerInfo = BSVTestUtils.generateTestPeerData('resilient-peer');

      const result = await overlayService.announcePeer(torrentHash, peerInfo);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection lost');
      expect(result.retryable).toBe(true);

      // Should queue for retry
      const queuedMessages = await overlayService.getQueuedMessages();
      expect(queuedMessages).toHaveLength(1);
    });

    it('should implement exponential backoff for failed operations', async () => {
      const torrentHash = 'v'.repeat(40);
      let attemptCount = 0;

      mockOverlayNetwork.publish.mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return Promise.resolve({ messageId: 'success', timestamp: Date.now() });
      });

      const result = await overlayService.announceWithRetry(
        torrentHash,
        BSVTestUtils.generateTestPeerData('retry-peer'),
        { maxRetries: 3, backoffBase: 100 }
      );

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('should recover from storage provider failures', async () => {
      const peerId = 'storage-fail-peer';

      mockStorageProvider.insertOne.mockRejectedValue(new Error('Database unavailable'));

      const activity = {
        type: 'upload',
        bytes: 1048576,
        duration: 30000,
      };

      // Should handle storage failure without crashing
      await expect(
        overlayService.recordPeerActivity(peerId, 'w'.repeat(40), activity)
      ).resolves.not.toThrow();

      // Should queue for later retry
      const queuedOperations = await overlayService.getQueuedStorageOperations();
      expect(queuedOperations).toHaveLength(1);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle high-frequency peer announcements efficiently', async () => {
      const torrentHash = 'x'.repeat(40);
      const announcements = Array.from({ length: 100 }, (_, i) => ({
        torrentHash,
        peerInfo: BSVTestUtils.generateTestPeerData(`bulk-peer-${i}`),
      }));

      const { averageTime } = await BSVTestUtils.measurePerformance(
        async () => {
          const promises = announcements.map(({ torrentHash, peerInfo }) =>
            overlayService.announcePeer(torrentHash, peerInfo)
          );
          return Promise.all(promises);
        },
        1 // Single iteration with 100 concurrent announcements
      );

      // Should process announcements efficiently
      expect(averageTime).toBeLessThan(5000); // Under 5 seconds for 100 announcements
    });

    it('should implement efficient peer caching mechanisms', async () => {
      const torrentHash = 'y'.repeat(40);

      // First lookup should hit the network
      await overlayService.discoverPeers(torrentHash, 50);
      expect(mockOverlayNetwork.lookup).toHaveBeenCalledTimes(1);

      // Second lookup within cache time should use cache
      await overlayService.discoverPeers(torrentHash, 50);
      expect(mockOverlayNetwork.lookup).toHaveBeenCalledTimes(1); // No additional call

      // Clear cache and verify network is hit again
      await overlayService.clearPeerCache();
      await overlayService.discoverPeers(torrentHash, 50);
      expect(mockOverlayNetwork.lookup).toHaveBeenCalledTimes(2);
    });

    it('should optimize batch operations for better performance', async () => {
      const activities = Array.from({ length: 50 }, (_, i) => ({
        peerId: `batch-peer-${i}`,
        torrentHash: 'z'.repeat(40),
        activity: {
          type: 'upload',
          bytes: 1048576,
          duration: 30000,
        },
      }));

      const batchResult = await overlayService.batchRecordPeerActivities(activities);

      expect(batchResult.processed).toBe(50);
      expect(batchResult.batches).toBeLessThan(50); // Should batch for efficiency
      expect(batchResult.efficiency).toBeGreaterThan(0.8);
    });
  });
});
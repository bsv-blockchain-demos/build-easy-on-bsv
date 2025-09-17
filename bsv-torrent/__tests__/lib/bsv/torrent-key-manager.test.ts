/**
 * TorrentKeyManager Tests
 * Test-driven development for BRC-42 hierarchical key derivation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TorrentKeyManager } from '../../../lib/bsv/torrent-key-manager.js';
import BSVTestUtils from '../../utils/bsv-test-utils.js';

describe('TorrentKeyManager', () => {
  let keyManager: TorrentKeyManager;
  let masterPrivateKey: string;

  beforeEach(() => {
    masterPrivateKey = BSVTestUtils.generateTestPrivateKey('master').toString();
    keyManager = new TorrentKeyManager(masterPrivateKey);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('BRC-42 Compliance', () => {
    it('should initialize with valid master key', () => {
      expect(keyManager).toBeDefined();
      expect(keyManager.getMasterPublicKey()).toBeDefined();
    });

    it('should generate BRC-42 compliant derivation paths', () => {
      const path = keyManager.generateBRC42Path({
        purpose: 2,
        protocol: 'torrent-session',
        keyIds: ['test-torrent-hash', 'payment'],
      });

      expect(path).toMatch(/^m\/42'\/2'\/[a-fA-F0-9]+'\/[a-fA-F0-9]+'\/[a-fA-F0-9]+'/);
      expect(path).toContain("42'"); // BRC-42 standard
      expect(path).toContain("2'");  // Purpose: payment
    });

    it('should derive consistent keys for same path', async () => {
      const torrentHash = 'a'.repeat(40);
      const path = keyManager.generateBRC42Path({
        purpose: 2,
        protocol: 'torrent-session',
        keyIds: [torrentHash, 'payment'],
      });

      const key1 = await keyManager.derivePrivateKey(path);
      const key2 = await keyManager.derivePrivateKey(path);

      expect(key1.toString()).toBe(key2.toString());
    });

    it('should derive different keys for different paths', async () => {
      const torrentHash1 = 'a'.repeat(40);
      const torrentHash2 = 'b'.repeat(40);

      const key1 = await keyManager.deriveTorrentSessionKey(torrentHash1, 'payment');
      const key2 = await keyManager.deriveTorrentSessionKey(torrentHash2, 'payment');

      expect(key1.toString()).not.toBe(key2.toString());
    });
  });

  describe('Torrent Session Keys', () => {
    it('should derive payment keys for torrent sessions', async () => {
      const torrentHash = 'c'.repeat(40);
      const paymentKey = await keyManager.deriveTorrentSessionKey(torrentHash, 'payment');

      expect(paymentKey).toBeDefined();
      expect(paymentKey.toPublicKey()).toBeDefined();
    });

    it('should derive identity keys for torrent sessions', async () => {
      const torrentHash = 'd'.repeat(40);
      const identityKey = await keyManager.deriveTorrentSessionKey(torrentHash, 'identity');

      expect(identityKey).toBeDefined();
      expect(identityKey.toString()).not.toBe(
        (await keyManager.deriveTorrentSessionKey(torrentHash, 'payment')).toString()
      );
    });

    it('should derive communication keys for torrent sessions', async () => {
      const torrentHash = 'e'.repeat(40);
      const commKey = await keyManager.deriveTorrentSessionKey(torrentHash, 'communication');

      expect(commKey).toBeDefined();
      expect(commKey.toPublicKey().toString()).toMatch(/^[a-fA-F0-9]+$/);
    });

    it('should cache derived session keys for performance', async () => {
      const torrentHash = 'f'.repeat(40);

      // Spy on the actual derivation method
      const derivePrivateKeySpy = jest.spyOn(keyManager, 'derivePrivateKey');

      // First call should derive the key
      const key1 = await keyManager.deriveTorrentSessionKey(torrentHash, 'payment');
      expect(derivePrivateKeySpy).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const key2 = await keyManager.deriveTorrentSessionKey(torrentHash, 'payment');
      expect(derivePrivateKeySpy).toHaveBeenCalledTimes(1); // No additional calls
      expect(key1.toString()).toBe(key2.toString());
    });
  });

  describe('Content Encryption Keys', () => {
    it('should derive encryption keys for content chunks', async () => {
      const torrentHash = 'g'.repeat(40);
      const chunkIndex = 42;

      const encryptionKey = await keyManager.deriveContentEncryptionKey(torrentHash, chunkIndex);

      expect(encryptionKey.key).toBeDefined();
      expect(encryptionKey.iv).toBeDefined();
      expect(encryptionKey.algorithm).toBe('aes-256-gcm');
      expect(encryptionKey.key).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(encryptionKey.iv).toHaveLength(32);  // 16 bytes hex = 32 chars
    });

    it('should derive different keys for different chunks', async () => {
      const torrentHash = 'h'.repeat(40);

      const key1 = await keyManager.deriveContentEncryptionKey(torrentHash, 0);
      const key2 = await keyManager.deriveContentEncryptionKey(torrentHash, 1);

      expect(key1.key).not.toBe(key2.key);
      expect(key1.iv).not.toBe(key2.iv);
    });

    it('should support different encryption algorithms', async () => {
      const torrentHash = 'i'.repeat(40);

      const aesKey = await keyManager.deriveContentEncryptionKey(torrentHash, 0, 'aes-256-gcm');
      const chachaKey = await keyManager.deriveContentEncryptionKey(torrentHash, 0, 'chacha20-poly1305');

      expect(aesKey.algorithm).toBe('aes-256-gcm');
      expect(chachaKey.algorithm).toBe('chacha20-poly1305');
      expect(aesKey.key).not.toBe(chachaKey.key);
    });
  });

  describe('Peer Communication Keys', () => {
    it('should derive shared keys for peer communication', async () => {
      const peerPubKey = BSVTestUtils.generateTestPrivateKey('peer').toPublicKey();
      const sessionId = 'session-123';

      const sharedKey = await keyManager.derivePeerCommunicationKey(
        peerPubKey.toString(),
        sessionId
      );

      expect(sharedKey.privateKey).toBeDefined();
      expect(sharedKey.publicKey).toBeDefined();
      expect(sharedKey.sharedSecret).toBeDefined();
    });

    it('should create deterministic shared secrets', async () => {
      const peerPubKey = BSVTestUtils.generateTestPrivateKey('peer').toPublicKey();
      const sessionId = 'session-456';

      const shared1 = await keyManager.derivePeerCommunicationKey(
        peerPubKey.toString(),
        sessionId
      );
      const shared2 = await keyManager.derivePeerCommunicationKey(
        peerPubKey.toString(),
        sessionId
      );

      expect(shared1.sharedSecret).toBe(shared2.sharedSecret);
    });

    it('should support ECDH key exchange', async () => {
      const peerPrivKey = BSVTestUtils.generateTestPrivateKey('peer');
      const sessionId = 'session-ecdh';

      const commKey = await keyManager.derivePeerCommunicationKey(
        peerPrivKey.toPublicKey().toString(),
        sessionId
      );

      // Verify ECDH properties
      expect(commKey.sharedSecret).toBeDefined();
      expect(commKey.sharedSecret.length).toBeGreaterThan(0);
    });
  });

  describe('Reputation and Certificate Keys', () => {
    it('should derive keys for reputation certificates', async () => {
      const peerId = 'peer-789';
      const certType = 'upload-reputation';

      const certKey = await keyManager.deriveReputationCertificateKey(peerId, certType);

      expect(certKey).toBeDefined();
      expect(certKey.toPublicKey()).toBeDefined();
    });

    it('should derive attestation signing keys', async () => {
      const peerId = 'peer-abc';
      const attestationType = 'speed-verification';

      const attestKey = await keyManager.deriveAttestationKey(peerId, attestationType);

      expect(attestKey).toBeDefined();
      expect(attestKey.toString()).toMatch(/^[a-fA-F0-9]+$/);
    });

    it('should support hierarchical reputation levels', async () => {
      const peerId = 'peer-def';

      const level1Key = await keyManager.deriveReputationCertificateKey(peerId, 'level-1');
      const level2Key = await keyManager.deriveReputationCertificateKey(peerId, 'level-2');

      expect(level1Key.toString()).not.toBe(level2Key.toString());
    });
  });

  describe('Payment Authorization Keys', () => {
    it('should derive payment authorization keys', async () => {
      const torrentHash = 'j'.repeat(40);
      const amount = 50000;

      const authKey = await keyManager.derivePaymentAuthorizationKey(torrentHash, amount);

      expect(authKey).toBeDefined();
      expect(authKey.toPublicKey()).toBeDefined();
    });

    it('should derive channel-specific keys', async () => {
      const channelId = 'channel-123';
      const userPubKey = BSVTestUtils.generateTestPrivateKey('user').toPublicKey();

      const channelKey = await keyManager.derivePaymentChannelKey(
        channelId,
        userPubKey.toString()
      );

      expect(channelKey.localKey).toBeDefined();
      expect(channelKey.escrowKey).toBeDefined();
      expect(channelKey.settlementKey).toBeDefined();
    });

    it('should support micropayment batch keys', async () => {
      const batchId = 'batch-456';
      const recipientPubKey = BSVTestUtils.generateTestPrivateKey('recipient').toPublicKey();

      const batchKey = await keyManager.deriveMicropaymentBatchKey(
        batchId,
        recipientPubKey.toString()
      );

      expect(batchKey).toBeDefined();
      expect(batchKey.toString()).toMatch(/^[a-fA-F0-9]+$/);
    });
  });

  describe('Cross-Application Compatibility', () => {
    it('should generate keys compatible with other BRC-42 applications', async () => {
      const protocol = 'torrent-protocol-v1';
      const appContext = 'cross-app-sharing';

      const compatKey = await keyManager.deriveCrossApplicationKey(protocol, appContext);

      expect(compatKey).toBeDefined();
      expect(compatKey.protocol).toBe(protocol);
      expect(compatKey.privateKey).toBeDefined();
      expect(compatKey.publicKey).toBeDefined();
    });

    it('should support key migration between applications', async () => {
      const legacyPath = "m/44'/0'/0'/0/0"; // Legacy BIP-44 path
      const modernPath = keyManager.generateBRC42Path({
        purpose: 2,
        protocol: 'torrent-migration',
        keyIds: ['legacy-migration'],
      });

      const migration = await keyManager.migrateKey(legacyPath, modernPath);

      expect(migration.success).toBe(true);
      expect(migration.newKey).toBeDefined();
      expect(migration.migrationProof).toBeDefined();
    });

    it('should validate key derivation paths', () => {
      const validPath = "m/42'/2'/746f7272656e742d73657373696f6e'/68617368'/7061796d656e74'";
      const invalidPath = "m/44'/0'/0'/0/0"; // Not BRC-42

      expect(keyManager.validateBRC42Path(validPath)).toBe(true);
      expect(keyManager.validateBRC42Path(invalidPath)).toBe(false);
    });
  });

  describe('Security and Performance', () => {
    it('should prevent key reuse across different contexts', async () => {
      const torrentHash = 'k'.repeat(40);

      const sessionKey = await keyManager.deriveTorrentSessionKey(torrentHash, 'payment');
      const encryptionKey = await keyManager.deriveContentEncryptionKey(torrentHash, 0);

      expect(sessionKey.toString()).not.toBe(encryptionKey.key);
    });

    it('should secure key material in memory', () => {
      const keyData = keyManager.getKeySecurityInfo();

      expect(keyData.memoryProtection).toBe(true);
      expect(keyData.keyWiping).toBe(true);
      expect(keyData.entropySource).toBe('secure');
    });

    it('should handle concurrent key derivation efficiently', async () => {
      const torrentHashes = Array.from({ length: 100 }, (_, i) =>
        i.toString().padStart(40, '0')
      );

      const { averageTime } = await BSVTestUtils.measurePerformance(
        async () => {
          return Promise.all(
            torrentHashes.map(hash =>
              keyManager.deriveTorrentSessionKey(hash, 'payment')
            )
          );
        }
      );

      // Should derive 100 keys in under 100ms total
      expect(averageTime).toBeLessThan(100);
    });

    it('should implement proper key caching', async () => {
      const torrentHash = 'l'.repeat(40);

      // Clear any existing cache
      keyManager.clearCache();

      // First derivation should be slower (actual computation)
      const start1 = performance.now();
      await keyManager.deriveTorrentSessionKey(torrentHash, 'payment');
      const time1 = performance.now() - start1;

      // Second derivation should be faster (from cache)
      const start2 = performance.now();
      await keyManager.deriveTorrentSessionKey(torrentHash, 'payment');
      const time2 = performance.now() - start2;

      expect(time2).toBeLessThan(time1);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid master key', () => {
      expect(() => new TorrentKeyManager('invalid-key')).toThrow('Invalid master private key');
    });

    it('should validate torrent hash format', async () => {
      const invalidHash = 'invalid-hash';

      await expect(
        keyManager.deriveTorrentSessionKey(invalidHash, 'payment')
      ).rejects.toThrow('Invalid torrent hash format');
    });

    it('should handle invalid derivation parameters', async () => {
      await expect(
        keyManager.generateBRC42Path({
          purpose: -1, // Invalid purpose
          protocol: '',
          keyIds: [],
        })
      ).toThrow('Invalid derivation parameters');
    });

    it('should handle memory pressure gracefully', async () => {
      // Simulate memory pressure by creating many keys
      const promises = Array.from({ length: 1000 }, (_, i) =>
        keyManager.deriveTorrentSessionKey(`${'0'.repeat(39)}${i}`, 'payment')
      );

      const keys = await Promise.all(promises);
      expect(keys).toHaveLength(1000);

      // Cache should automatically cleanup under pressure
      const cacheSize = keyManager.getCacheSize();
      expect(cacheSize).toBeLessThan(1000); // Some cleanup occurred
    });
  });
});
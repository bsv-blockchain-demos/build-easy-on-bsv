/**
 * TorrentWalletManager Tests
 * Test-driven development for server wallet management and user wallet communication
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TorrentWalletManager } from '../../../lib/wallet/torrent-wallet-manager.js';
import BSVTestUtils from '../../utils/bsv-test-utils.js';
import MockFactories from '../../utils/mock-factories.js';

describe('TorrentWalletManager', () => {
  let walletManager: TorrentWalletManager;
  let mockServerWallet: any;
  let mockWalletClient: any;
  let mockStorageProvider: any;

  beforeEach(async () => {
    mockServerWallet = MockFactories.createMockServerWallet();
    mockWalletClient = MockFactories.createMockWalletClient();
    mockStorageProvider = MockFactories.createMockStorageProvider();

    walletManager = new TorrentWalletManager({
      serverWallet: mockServerWallet,
      walletClient: mockWalletClient,
      storageProvider: mockStorageProvider,
      chain: 'test',
      storageURL: 'https://test-storage.example.com',
    });

    await walletManager.initialize();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Server Wallet Management', () => {
    it('should initialize server wallet with proper configuration', async () => {
      expect(walletManager.isInitialized).toBe(true);
      expect(mockServerWallet.isAuthenticated).toHaveBeenCalled();
      expect(mockServerWallet.getNetwork).toHaveBeenCalled();
    });

    it('should create server wallet for torrent operations', async () => {
      const privateKey = BSVTestUtils.generateTestPrivateKey('server').toString();

      const serverWallet = await walletManager.createServerWallet({
        chain: 'test',
        storageURL: 'https://test-storage.example.com',
        privateKey,
      });

      expect(serverWallet).toBeDefined();
      expect(serverWallet.signer).toBeDefined();
      expect(serverWallet.services).toBeDefined();
    });

    it('should manage torrent session payments through server wallet', async () => {
      const torrentHash = 'a'.repeat(40);
      const userPubKey = BSVTestUtils.generateTestPrivateKey('user').toPublicKey();

      const paymentTx = await walletManager.createTorrentPaymentTransaction({
        torrentHash,
        userPubKey: userPubKey.toString(),
        amount: 1700, // 17 sats per 16KB block * 100 blocks
        blockCount: 100,
      });

      expect(paymentTx.txid).toBeDefined();
      expect(paymentTx.satoshis).toBe(1700);
      expect(mockServerWallet.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          outputs: expect.arrayContaining([
            expect.objectContaining({
              satoshis: 1700,
              script: expect.any(String),
            }),
          ]),
        })
      );
    });

    it('should handle escrow transactions for premium content', async () => {
      const torrentHash = 'b'.repeat(40);
      const userPubKey = BSVTestUtils.generateTestPrivateKey('user').toPublicKey();
      const creatorPubKey = BSVTestUtils.generateTestPrivateKey('creator').toPublicKey();

      const escrowTx = await walletManager.createEscrowTransaction({
        torrentHash,
        userPubKey: userPubKey.toString(),
        creatorPubKey: creatorPubKey.toString(),
        totalAmount: 100000,
        royaltyPercentage: 0.1, // 10% to creator
      });

      expect(escrowTx.txid).toBeDefined();
      expect(escrowTx.outputs).toHaveLength(2); // One for creator, one for server
      expect(mockServerWallet.createTransaction).toHaveBeenCalled();
    });
  });

  describe('User Wallet Communication', () => {
    it('should communicate with user wallet for payment authorization', async () => {
      const userIdentityKey = BSVTestUtils.generateTestPrivateKey('user-identity').toPublicKey();

      const authRequest = await walletManager.requestPaymentAuthorization({
        userIdentityKey: userIdentityKey.toString(),
        torrentHash: 'c'.repeat(40),
        maxAmount: 50000,
        duration: 3600,
        purpose: 'torrent-download',
      });

      expect(authRequest.requestId).toBeDefined();
      expect(authRequest.status).toBe('pending');
      expect(mockWalletClient.sendRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment-authorization',
          payload: expect.objectContaining({
            maxAmount: 50000,
            duration: 3600,
            purpose: 'torrent-download',
          }),
        })
      );
    });

    it('should handle user wallet payment responses', async () => {
      const mockResponse = {
        requestId: 'test-request-id',
        approved: true,
        signedTransaction: 'mock-signed-tx',
        authToken: 'mock-auth-token',
      };

      const result = await walletManager.handleUserPaymentResponse(mockResponse);

      expect(result.accepted).toBe(true);
      expect(result.authToken).toBe('mock-auth-token');
      expect(result.transaction).toBeDefined();
    });

    it('should process micropayments with user authorization', async () => {
      const authToken = 'valid-auth-token';
      const userPubKey = BSVTestUtils.generateTestPrivateKey('user').toPublicKey();

      const micropayment = await walletManager.processMicropayment({
        authToken,
        userPubKey: userPubKey.toString(),
        amount: 17, // 17 sats for 16KB block
        blockIndex: 0,
        torrentHash: 'd'.repeat(40),
      });

      expect(micropayment.txid).toBeDefined();
      expect(micropayment.amount).toBe(17);
      expect(micropayment.confirmed).toBe(true);
    });

    it('should validate user authorization tokens', async () => {
      const validToken = 'valid-token-123';
      const invalidToken = 'invalid-token-456';

      const validResult = await walletManager.validateAuthToken(validToken);
      const invalidResult = await walletManager.validateAuthToken(invalidToken);

      expect(validResult.valid).toBe(true);
      expect(validResult.permissions).toBeDefined();
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('BRC-42 Key Derivation Integration', () => {
    it('should derive torrent-specific keys using BRC-42', async () => {
      const torrentHash = 'e'.repeat(40);
      const purpose = 2; // Payment keys
      const protocol = 'torrent-session';

      const derivedKey = await walletManager.deriveTorrentKey({
        purpose,
        protocol,
        torrentHash,
        keyType: 'payment',
      });

      expect(derivedKey).toBeDefined();
      expect(mockServerWallet.derivePrivateKey).toHaveBeenCalledWith(
        expect.stringContaining(`m/42'/${purpose}'`),
        expect.stringContaining(protocol)
      );
    });

    it('should derive peer communication keys', async () => {
      const peerPubKey = BSVTestUtils.generateTestPrivateKey('peer').toPublicKey();
      const sessionId = 'session-123';

      const commKey = await walletManager.derivePeerCommKey({
        peerPubKey: peerPubKey.toString(),
        sessionId,
        purpose: 'encrypted-communication',
      });

      expect(commKey).toBeDefined();
      expect(commKey.publicKey).toBeDefined();
      expect(commKey.sharedSecret).toBeDefined();
    });

    it('should derive content encryption keys per chunk', async () => {
      const torrentHash = 'f'.repeat(40);
      const chunkIndex = 42;

      const encKey = await walletManager.deriveContentEncryptionKey({
        torrentHash,
        chunkIndex,
        algorithm: 'aes-256-gcm',
      });

      expect(encKey.key).toBeDefined();
      expect(encKey.iv).toBeDefined();
      expect(encKey.algorithm).toBe('aes-256-gcm');
    });
  });

  describe('Payment Channel Management', () => {
    it('should create payment channel with user', async () => {
      const userPubKey = BSVTestUtils.generateTestPrivateKey('user').toPublicKey();
      const initialBalance = 100000;

      const channel = await walletManager.createPaymentChannel({
        userPubKey: userPubKey.toString(),
        initialBalance,
        channelDuration: 3600,
      });

      expect(channel.channelId).toBeDefined();
      expect(channel.localBalance).toBe(initialBalance / 2);
      expect(channel.remoteBalance).toBe(initialBalance / 2);
      expect(channel.status).toBe('open');
    });

    it('should process streaming micropayments through channel', async () => {
      const channelId = 'channel-123';
      const amount = 17; // 17 sats per 16KB

      const payment = await walletManager.streamingMicropayment({
        channelId,
        amount,
        memo: 'Block download payment',
      });

      expect(payment.success).toBe(true);
      expect(payment.newBalance).toBeDefined();
      expect(payment.transactionId).toBeDefined();
    });

    it('should settle payment channel on completion', async () => {
      const channelId = 'channel-456';

      const settlement = await walletManager.settlePaymentChannel(channelId);

      expect(settlement.txid).toBeDefined();
      expect(settlement.finalBalances).toBeDefined();
      expect(settlement.settled).toBe(true);
    });
  });

  describe('Reputation and Incentives', () => {
    it('should create reputation certificate for peer', async () => {
      const peerPubKey = BSVTestUtils.generateTestPrivateKey('peer').toPublicKey();
      const reputationData = {
        uploadsCompleted: 150,
        downloadRatio: 2.5,
        averageSpeed: 5000000, // 5 MB/s
        reliability: 0.98,
      };

      const certificate = await walletManager.createReputationCertificate({
        peerPubKey: peerPubKey.toString(),
        reputationData,
        validityPeriod: 30 * 24 * 3600, // 30 days
      });

      expect(certificate.certificateId).toBeDefined();
      expect(certificate.signature).toBeDefined();
      expect(certificate.issuer).toBe(mockServerWallet.getPublicKey());
    });

    it('should process seeder incentive payments', async () => {
      const seederPubKey = BSVTestUtils.generateTestPrivateKey('seeder').toPublicKey();
      const torrentHash = 'g'.repeat(40);

      const incentive = await walletManager.processSeederIncentive({
        seederPubKey: seederPubKey.toString(),
        torrentHash,
        bytesUploaded: 1073741824, // 1 GB
        ratePerGB: 1000, // 1000 sats per GB
      });

      expect(incentive.txid).toBeDefined();
      expect(incentive.amount).toBe(1000);
      expect(incentive.recipient).toBe(seederPubKey.toString());
    });
  });

  describe('Error Handling and Security', () => {
    it('should handle invalid user authorization', async () => {
      const invalidAuth = {
        authToken: 'invalid-token',
        userPubKey: 'invalid-key',
        amount: 17,
        blockIndex: 0,
        torrentHash: 'h'.repeat(40),
      };

      await expect(
        walletManager.processMicropayment(invalidAuth)
      ).rejects.toThrow('Invalid authorization token');
    });

    it('should prevent double-spending in payment channels', async () => {
      const channelId = 'channel-789';
      const amount = 50000; // Exceeds channel balance

      await expect(
        walletManager.streamingMicropayment({
          channelId,
          amount,
          memo: 'Excessive payment',
        })
      ).rejects.toThrow('Insufficient channel balance');
    });

    it('should validate torrent hash format', async () => {
      const invalidHash = 'invalid-hash';

      await expect(
        walletManager.createTorrentPaymentTransaction({
          torrentHash: invalidHash,
          userPubKey: 'valid-pubkey',
          amount: 1000,
          blockCount: 100,
        })
      ).rejects.toThrow('Invalid torrent hash format');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent micropayment processing', async () => {
      const channelId = 'channel-concurrent';
      const payments = Array.from({ length: 100 }, (_, i) => ({
        channelId,
        amount: 17,
        memo: `Block ${i} payment`,
      }));

      const results = await Promise.all(
        payments.map(payment => walletManager.streamingMicropayment(payment))
      );

      expect(results).toHaveLength(100);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    it('should efficiently manage multiple user connections', async () => {
      const users = Array.from({ length: 50 }, (_, i) =>
        BSVTestUtils.generateTestPrivateKey(`user-${i}`).toPublicKey()
      );

      const channels = await Promise.all(
        users.map(userPubKey =>
          walletManager.createPaymentChannel({
            userPubKey: userPubKey.toString(),
            initialBalance: 10000,
            channelDuration: 3600,
          })
        )
      );

      expect(channels).toHaveLength(50);
      channels.forEach(channel => {
        expect(channel.channelId).toBeDefined();
        expect(channel.status).toBe('open');
      });
    });
  });
});
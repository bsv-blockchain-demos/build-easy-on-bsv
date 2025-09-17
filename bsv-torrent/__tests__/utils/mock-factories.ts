/**
 * Mock Factories for BSV Torrent Testing
 * Provides comprehensive mocking for all BSV and torrent operations
 */

import { jest } from '@jest/globals';
import { PrivateKey, PublicKey, Transaction } from '@bsv/sdk';
import BSVTestUtils from './bsv-test-utils.js';

export class MockFactories {
  /**
   * Mock Server Wallet (manages its own keys and operations)
   */
  static createMockServerWallet() {
    const mockWallet = {
      isAuthenticated: jest.fn().mockReturnValue(true),
      getNetwork: jest.fn().mockReturnValue('testnet'),
      getPublicKey: jest.fn().mockReturnValue(
        BSVTestUtils.generateTestPrivateKey('server').toPublicKey().toString()
      ),

      // Core wallet operations
      createTransaction: jest.fn().mockResolvedValue({
        txid: 'mock-server-txid',
        rawTransaction: Buffer.from('mock-raw-tx'),
        inputs: [],
        outputs: [],
        satoshis: 1000,
      }),

      signTransaction: jest.fn().mockResolvedValue({
        txid: 'mock-signed-txid',
        rawTransaction: Buffer.from('mock-signed-tx'),
        signature: 'mock-signature',
      }),

      broadcastTransaction: jest.fn().mockResolvedValue({
        txid: 'mock-broadcast-txid',
        status: 'broadcasted',
        timestamp: new Date().toISOString(),
      }),

      // BRC-42 key derivation
      derivePrivateKey: jest.fn().mockImplementation((path: string, context?: string) => {
        const seed = path + (context || '');
        return BSVTestUtils.generateTestPrivateKey(seed);
      }),

      derivePublicKey: jest.fn().mockImplementation((path: string, context?: string) => {
        const seed = path + (context || '');
        return BSVTestUtils.generateTestPrivateKey(seed).toPublicKey();
      }),

      // Storage and services
      signer: {
        sign: jest.fn().mockResolvedValue('mock-signature'),
        getPublicKey: jest.fn().mockReturnValue('mock-pubkey'),
      },

      services: {
        getChainTracker: jest.fn().mockReturnValue({
          isValidRootForHeight: jest.fn().mockReturnValue(true),
        }),
        getUtxoLookup: jest.fn().mockReturnValue({
          findByAddress: jest.fn().mockResolvedValue([]),
        }),
      },

      storageManager: {
        addWalletStorageProvider: jest.fn().mockResolvedValue(undefined),
        getStorageProviders: jest.fn().mockReturnValue([]),
      },
    };

    return mockWallet;
  }

  /**
   * Mock Wallet Client (communicates with user wallets)
   */
  static createMockWalletClient() {
    const pendingRequests = new Map<string, any>();

    return {
      // Send requests to user wallets
      sendRequest: jest.fn().mockImplementation(async (request: any) => {
        const requestId = `req-${Date.now()}`;
        pendingRequests.set(requestId, {
          ...request,
          requestId,
          status: 'pending',
          timestamp: new Date().toISOString(),
        });

        // Mock automatic approval for tests
        setTimeout(() => {
          const req = pendingRequests.get(requestId);
          if (req) {
            req.status = 'approved';
            req.response = {
              approved: true,
              signedTransaction: 'mock-user-signed-tx',
              authToken: `auth-${requestId}`,
            };
          }
        }, 100);

        return { requestId, status: 'sent' };
      }),

      // Get request status
      getRequestStatus: jest.fn().mockImplementation(async (requestId: string) => {
        const request = pendingRequests.get(requestId);
        return request || { status: 'not_found' };
      }),

      // Handle user responses
      handleResponse: jest.fn().mockImplementation(async (requestId: string, response: any) => {
        const request = pendingRequests.get(requestId);
        if (request) {
          request.status = 'completed';
          request.response = response;
          return { success: true, request };
        }
        return { success: false, error: 'Request not found' };
      }),

      // Validate authorization tokens
      validateAuthToken: jest.fn().mockImplementation(async (token: string) => {
        if (token.startsWith('auth-')) {
          return {
            valid: true,
            permissions: {
              maxAmount: 50000,
              duration: 3600,
              purposes: ['torrent-download', 'micropayment'],
            },
            userPubKey: BSVTestUtils.generateTestPrivateKey('user').toPublicKey().toString(),
          };
        }
        return { valid: false };
      }),

      // Payment channel operations
      createPaymentChannel: jest.fn().mockResolvedValue({
        channelId: `channel-${Date.now()}`,
        status: 'open',
        localBalance: 50000,
        remoteBalance: 50000,
        fundingTxId: 'mock-funding-txid',
      }),

      processChannelPayment: jest.fn().mockResolvedValue({
        success: true,
        paymentId: `payment-${Date.now()}`,
        newBalance: 49983, // 50000 - 17
        transactionId: 'mock-payment-txid',
      }),

      // Connection management
      connect: jest.fn().mockResolvedValue({
        connected: true,
        userIdentity: 'mock-user-identity',
      }),

      disconnect: jest.fn().mockResolvedValue({
        disconnected: true,
      }),

      isConnected: jest.fn().mockReturnValue(true),
    };
  }

  /**
   * Mock @bsv/wallet-toolbox ProtoWallet (legacy - keeping for compatibility)
   */
  static createMockProtoWallet() {
    return {
      isAuthenticated: jest.fn().mockReturnValue(true),
      authenticate: jest.fn().mockResolvedValue(true),
      getPublicKey: jest.fn().mockResolvedValue({
        publicKey: BSVTestUtils.generateTestPrivateKey().toPublicKey().toString(),
        identityKey: true,
      }),
      createAction: jest.fn().mockResolvedValue({
        txid: 'mock-txid',
        inputs: [],
        outputs: [],
        note: 'Mock transaction',
      }),
      signAction: jest.fn().mockResolvedValue({
        rawTransaction: Buffer.from('mock-raw-tx'),
        inputs: [],
        outputs: [],
      }),
      getNetwork: jest.fn().mockReturnValue('testnet'),
      derivePrivateKey: jest.fn().mockImplementation((derivationPrefix, derivationSuffix) => {
        return BSVTestUtils.generateTestPrivateKey(derivationPrefix + derivationSuffix);
      }),
      derivePublicKey: jest.fn().mockImplementation((derivationPrefix, derivationSuffix) => {
        const privKey = BSVTestUtils.generateTestPrivateKey(derivationPrefix + derivationSuffix);
        return privKey.toPublicKey();
      }),
      encrypt: jest.fn().mockResolvedValue(Buffer.from('encrypted-data')),
      decrypt: jest.fn().mockResolvedValue(Buffer.from('decrypted-data')),
    };
  }

  /**
   * Mock WebTorrent client
   */
  static createMockWebTorrentClient() {
    const mockTorrents = new Map();

    return {
      add: jest.fn().mockImplementation((magnetURI: string, options: any) => {
        const torrentData = BSVTestUtils.generateTestTorrentData();
        const mockTorrent = {
          infoHash: torrentData.infoHash,
          magnetURI,
          files: torrentData.files,
          pieces: torrentData.pieces,
          length: torrentData.totalSize,
          downloaded: 0,
          uploaded: 0,
          downloadSpeed: 0,
          uploadSpeed: 0,
          progress: 0,
          ready: false,
          done: false,
          paused: false,
          peers: [],
          wires: [],

          on: jest.fn().mockImplementation((event: string, callback: Function) => {
            if (event === 'ready') {
              setTimeout(() => {
                mockTorrent.ready = true;
                callback();
              }, 100);
            }
          }),
          off: jest.fn(),
          pause: jest.fn(),
          resume: jest.fn(),
          destroy: jest.fn(),
          addPeer: jest.fn(),
          removePeer: jest.fn(),

          // Mock file operations
          select: jest.fn(),
          deselect: jest.fn(),
        };

        mockTorrents.set(torrentData.infoHash, mockTorrent);
        return mockTorrent;
      }),

      get: jest.fn().mockImplementation((infoHash: string) => {
        return mockTorrents.get(infoHash);
      }),

      remove: jest.fn().mockImplementation((torrent: any) => {
        mockTorrents.delete(torrent.infoHash);
      }),

      seed: jest.fn().mockImplementation((files: any[], options: any) => {
        const torrentData = BSVTestUtils.generateTestTorrentData();
        return {
          ...torrentData,
          files: files,
          ready: true,
          done: true,
        };
      }),

      torrents: Array.from(mockTorrents.values()),
      downloadSpeed: 0,
      uploadSpeed: 0,
      progress: 0,
      ratio: 0,

      on: jest.fn(),
      off: jest.fn(),
      destroy: jest.fn(),
    };
  }

  /**
   * Mock ARC service
   */
  static createMockARCService() {
    const transactions = new Map<string, any>();

    return {
      broadcast: jest.fn().mockImplementation(async (rawTx: Buffer | string) => {
        const txid = Buffer.from(`mock-txid-${Date.now()}`).toString('hex').slice(0, 64);
        const transaction = {
          txid,
          status: 'SEEN_ON_NETWORK',
          timestamp: new Date().toISOString(),
          rawTransaction: typeof rawTx === 'string' ? rawTx : rawTx.toString('hex'),
        };
        transactions.set(txid, transaction);

        // Simulate async processing
        setTimeout(() => {
          transaction.status = 'MINED';
        }, 100);

        return transaction;
      }),

      getTransaction: jest.fn().mockImplementation(async (txid: string) => {
        return transactions.get(txid) || null;
      }),

      getTransactionStatus: jest.fn().mockImplementation(async (txid: string) => {
        const tx = transactions.get(txid);
        return tx ? tx.status : 'NOT_FOUND';
      }),

      batchBroadcast: jest.fn().mockImplementation(async (transactions: any[]) => {
        return Promise.all(transactions.map(tx => this.broadcast(tx)));
      }),
    };
  }

  /**
   * Mock MongoDB collection
   */
  static createMockMongoCollection() {
    const documents = new Map<string, any>();
    let idCounter = 1;

    return {
      findOne: jest.fn().mockImplementation(async (query: any) => {
        for (const doc of documents.values()) {
          if (this.matchesQuery(doc, query)) {
            return doc;
          }
        }
        return null;
      }),

      find: jest.fn().mockImplementation((query: any) => ({
        toArray: async () => {
          const results = [];
          for (const doc of documents.values()) {
            if (this.matchesQuery(doc, query)) {
              results.push(doc);
            }
          }
          return results;
        },
        limit: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
      })),

      insertOne: jest.fn().mockImplementation(async (doc: any) => {
        const _id = doc._id || (idCounter++).toString();
        const newDoc = { ...doc, _id };
        documents.set(_id, newDoc);
        return { insertedId: _id, acknowledged: true };
      }),

      updateOne: jest.fn().mockImplementation(async (query: any, update: any) => {
        for (const [id, doc] of documents.entries()) {
          if (this.matchesQuery(doc, query)) {
            const updatedDoc = { ...doc, ...update.$set };
            documents.set(id, updatedDoc);
            return { modifiedCount: 1, acknowledged: true };
          }
        }
        return { modifiedCount: 0, acknowledged: true };
      }),

      deleteOne: jest.fn().mockImplementation(async (query: any) => {
        for (const [id, doc] of documents.entries()) {
          if (this.matchesQuery(doc, query)) {
            documents.delete(id);
            return { deletedCount: 1, acknowledged: true };
          }
        }
        return { deletedCount: 0, acknowledged: true };
      }),

      createIndex: jest.fn().mockResolvedValue('mock-index'),
      countDocuments: jest.fn().mockImplementation(async (query: any) => {
        let count = 0;
        for (const doc of documents.values()) {
          if (this.matchesQuery(doc, query)) {
            count++;
          }
        }
        return count;
      }),
    };
  }

  /**
   * Mock overlay network service
   */
  static createMockOverlayService() {
    const subscriptions = new Map<string, Function[]>();
    const messages = new Map<string, any[]>();

    return {
      subscribe: jest.fn().mockImplementation((topic: string, callback: Function) => {
        if (!subscriptions.has(topic)) {
          subscriptions.set(topic, []);
        }
        subscriptions.get(topic)!.push(callback);
      }),

      unsubscribe: jest.fn().mockImplementation((topic: string, callback: Function) => {
        const callbacks = subscriptions.get(topic);
        if (callbacks) {
          const index = callbacks.indexOf(callback);
          if (index > -1) {
            callbacks.splice(index, 1);
          }
        }
      }),

      publish: jest.fn().mockImplementation(async (topic: string, message: any) => {
        if (!messages.has(topic)) {
          messages.set(topic, []);
        }
        messages.get(topic)!.push(message);

        // Notify subscribers
        const callbacks = subscriptions.get(topic) || [];
        callbacks.forEach(callback => callback(message));

        return { messageId: `msg-${Date.now()}`, timestamp: Date.now() };
      }),

      getMessages: jest.fn().mockImplementation((topic: string) => {
        return messages.get(topic) || [];
      }),

      lookup: jest.fn().mockImplementation(async (criteria: any) => {
        // Mock peer lookup based on criteria
        return [
          BSVTestUtils.generateTestPeerData('peer1'),
          BSVTestUtils.generateTestPeerData('peer2'),
        ];
      }),
    };
  }

  /**
   * Helper method to match MongoDB queries
   */
  private static matchesQuery(doc: any, query: any): boolean {
    for (const [key, value] of Object.entries(query)) {
      if (doc[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Mock reputation system
   */
  static createMockReputationSystem() {
    const reputations = new Map<string, any>();

    return {
      calculateScore: jest.fn().mockImplementation((peerId: string, history: any) => {
        const base = 50;
        const uploads = history.uploads || 0;
        const downloads = history.downloads || 0;
        const ratio = downloads > 0 ? uploads / downloads : 1;
        return Math.min(100, base + Math.floor(ratio * 25));
      }),

      updateReputation: jest.fn().mockImplementation(async (peerId: string, action: any) => {
        const current = reputations.get(peerId) || { score: 50, uploads: 0, downloads: 0 };

        if (action.type === 'upload') {
          current.uploads += action.bytes;
          current.score = Math.min(100, current.score + 1);
        } else if (action.type === 'download') {
          current.downloads += action.bytes;
        }

        reputations.set(peerId, current);
        return current;
      }),

      getReputation: jest.fn().mockImplementation(async (peerId: string) => {
        return reputations.get(peerId) || { score: 50, uploads: 0, downloads: 0 };
      }),
    };
  }
}

export default MockFactories;
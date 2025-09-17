/**
 * BSV Test Utilities
 * Comprehensive testing utilities for BSV operations
 */

import { PrivateKey, PublicKey, Transaction, P2PKH } from '@bsv/sdk';
import { jest } from '@jest/globals';

export interface TorrentTestData {
  infoHash: string;
  magnetURI: string;
  pieces: string[];
  totalSize: number;
  files: Array<{
    name: string;
    size: number;
    path: string;
  }>;
}

export interface PaymentChannelTestData {
  channelId: string;
  localBalance: number;
  remoteBalance: number;
  localPrivKey: PrivateKey;
  remotePrivKey: PrivateKey;
  fundingTxId: string;
}

export interface PeerTestData {
  peerId: string;
  publicKey: PublicKey;
  privateKey: PrivateKey;
  endpoint: {
    ip: string;
    port: number;
  };
  capabilities: string[];
  reputation: {
    score: number;
    uploads: number;
    downloads: number;
  };
}

export class BSVTestUtils {
  /**
   * Generate deterministic test private keys
   */
  static generateTestPrivateKey(seed: string = 'test'): PrivateKey {
    const seedBuffer = Buffer.from(seed.padEnd(32, '0'), 'utf8');
    return PrivateKey.fromString(seedBuffer.toString('hex'), 16);
  }

  /**
   * Generate test torrent data
   */
  static generateTestTorrentData(size: number = 1024): TorrentTestData {
    const infoHash = Buffer.from(`test-torrent-${size}`).toString('hex').padEnd(40, '0');
    const pieces = [];
    const pieceSize = 16384; // 16KB pieces
    const numPieces = Math.ceil(size / pieceSize);

    for (let i = 0; i < numPieces; i++) {
      pieces.push(Buffer.from(`piece-${i}`).toString('hex').padEnd(40, '0'));
    }

    return {
      infoHash,
      magnetURI: `magnet:?xt=urn:btih:${infoHash}&dn=test-file&tr=udp%3A%2F%2Ftracker.example.com%3A8080`,
      pieces,
      totalSize: size,
      files: [
        {
          name: 'test-file.dat',
          size,
          path: 'test-file.dat',
        },
      ],
    };
  }

  /**
   * Create test payment channel
   */
  static async createTestPaymentChannel(
    initialBalance: number = 100000
  ): Promise<PaymentChannelTestData> {
    const localPrivKey = this.generateTestPrivateKey('local');
    const remotePrivKey = this.generateTestPrivateKey('remote');
    const channelId = Buffer.from(`channel-${Date.now()}`).toString('hex');

    // Create mock funding transaction
    const fundingTx = new Transaction();
    fundingTx.addInput({
      sourceTransaction: new Transaction(),
      sourceOutputIndex: 0,
      unlockingScript: P2PKH.unlock(localPrivKey, 'all'),
    });
    fundingTx.addOutput({
      lockingScript: P2PKH.lock(localPrivKey.toPublicKey().toHash()),
      satoshis: initialBalance,
    });

    return {
      channelId,
      localBalance: initialBalance / 2,
      remoteBalance: initialBalance / 2,
      localPrivKey,
      remotePrivKey,
      fundingTxId: fundingTx.id(),
    };
  }

  /**
   * Generate test peer data
   */
  static generateTestPeerData(peerId?: string): PeerTestData {
    const id = peerId || `peer-${Math.random().toString(36).substr(2, 9)}`;
    const privateKey = this.generateTestPrivateKey(id);
    const publicKey = privateKey.toPublicKey();

    return {
      peerId: id,
      publicKey,
      privateKey,
      endpoint: {
        ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
        port: 6881 + Math.floor(Math.random() * 100),
      },
      capabilities: ['seed', 'leech', 'webrtc'],
      reputation: {
        score: 50 + Math.floor(Math.random() * 50),
        uploads: Math.floor(Math.random() * 1000),
        downloads: Math.floor(Math.random() * 500),
      },
    };
  }

  /**
   * Mock ARC broadcaster
   */
  static createMockARC() {
    return {
      broadcast: jest.fn().mockResolvedValue({
        txid: 'mock-txid',
        status: 'SEEN_ON_NETWORK',
        timestamp: new Date().toISOString(),
      }),
      getTransaction: jest.fn().mockResolvedValue({
        txid: 'mock-txid',
        status: 'MINED',
        blockHeight: 800000,
      }),
    };
  }

  /**
   * Mock wallet-toolbox storage provider
   */
  static createMockStorageProvider() {
    const storage = new Map<string, any>();

    return {
      findByAttributes: jest.fn().mockImplementation(async (attributes: any) => {
        const results = Array.from(storage.values()).filter((item) =>
          Object.entries(attributes).every(([key, value]) => item[key] === value)
        );
        return results;
      }),
      insertOne: jest.fn().mockImplementation(async (data: any) => {
        const id = Date.now().toString();
        storage.set(id, { ...data, _id: id });
        return { _id: id, ...data };
      }),
      findOne: jest.fn().mockImplementation(async (query: any) => {
        if (query._id) {
          return storage.get(query._id) || null;
        }
        return Array.from(storage.values()).find((item) =>
          Object.entries(query).every(([key, value]) => item[key] === value)
        ) || null;
      }),
      updateOne: jest.fn().mockImplementation(async (query: any, update: any) => {
        const item = await this.findOne(query);
        if (item) {
          Object.assign(item, update);
          storage.set(item._id, item);
        }
        return { modifiedCount: item ? 1 : 0 };
      }),
      deleteOne: jest.fn().mockImplementation(async (query: any) => {
        const item = await this.findOne(query);
        if (item) {
          storage.delete(item._id);
        }
        return { deletedCount: item ? 1 : 0 };
      }),
    };
  }

  /**
   * Mock SPV verification
   */
  static mockSPVVerification(shouldPass: boolean = true): jest.SpyInstance {
    return jest.fn().mockResolvedValue({
      valid: shouldPass,
      blockHeight: shouldPass ? 800000 : undefined,
      merkleProof: shouldPass ? 'mock-merkle-proof' : undefined,
    });
  }

  /**
   * Performance monitoring utility
   */
  static async measurePerformance<T>(
    operation: () => Promise<T>,
    iterations: number = 1
  ): Promise<{
    result: T;
    averageTime: number;
    totalTime: number;
    iterations: number;
  }> {
    const times: number[] = [];
    let result: T;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      result = await operation();
      const end = performance.now();
      times.push(end - start);
    }

    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / iterations;

    return {
      result: result!,
      averageTime,
      totalTime,
      iterations,
    };
  }

  /**
   * Create mock blockchain state
   */
  static createMockBlockchainState() {
    return {
      currentHeight: 800000,
      bestBlockHash: 'mock-best-block-hash',
      difficulty: 1,
      chainWork: 'mock-chain-work',
      transactions: new Map<string, Transaction>(),
    };
  }

  /**
   * Wait for a condition to be true
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  /**
   * Generate test BRC-42 key derivation path
   */
  static generateBRC42Path(
    purpose: number,
    protocol: string,
    ...keyIds: string[]
  ): string {
    return `m/42'/${purpose}'/${Buffer.from(protocol).toString('hex')}'/${keyIds
      .map((id) => Buffer.from(id).toString('hex'))
      .join("'/")}`;
  }

  /**
   * Create mock overlay network message
   */
  static createMockOverlayMessage(type: string, data: any) {
    return {
      type,
      timestamp: Date.now(),
      data,
      signature: 'mock-signature',
      pubkey: 'mock-pubkey',
    };
  }
}

export default BSVTestUtils;
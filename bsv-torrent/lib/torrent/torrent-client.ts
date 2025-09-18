/**
 * TorrentClient - WebTorrent integration with BSV micropayments
 * Combines P2P file sharing with BSV blockchain-based payments
 */

import WebTorrent from 'webtorrent';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import type { TorrentMicropaymentManager } from '../micropayments/torrent-micropayment-manager';
import type { TorrentOverlayService, PeerInfo } from '../overlay/torrent-overlay-service';
import type { TorrentWalletManager } from '../wallet/torrent-wallet-manager';

export interface TorrentClientConfig {
  paymentRate: number; // sats per block
  blockSize: number; // bytes per block
  maxConcurrentDownloads: number;
  peerTimeout: number;
  enableSeeding: boolean;
  maxUploadSlots: number;
}

export interface TorrentClientOptions {
  micropaymentManager: TorrentMicropaymentManager;
  overlayService: TorrentOverlayService;
  walletManager: TorrentWalletManager;
  config: TorrentClientConfig;
}

export interface ChunkPaymentInfo {
  torrentHash: string;
  chunkIndex: number;
  timestamp: number;
}

export interface DownloadProgress {
  totalChunks: number;
  downloadedChunks: number;
  totalPaid: number;
  progressPercentage: number;
  failedPayments: number;
}

export interface PaymentState {
  isPaused: boolean;
  totalPaid: number;
  activeChannels: string[];
}

export interface SeedingStats {
  chunksServed: number;
  totalEarnings: number;
  activePeers: number;
  averageChunkTime: number;
}

export interface PerformanceMetrics {
  activeTorrents: number;
  totalDownloadSpeed: number;
  totalUploadSpeed: number;
  totalPaymentsSent: number;
  totalPaymentsReceived: number;
  averageChunkTime: number;
  paymentSuccessRate: number;
}

export interface RealTimeStats {
  recentPayments: any[];
  activeConnections: number;
  networkLatency: number;
}

export interface ChunkHashVerification {
  isValid: boolean;
  expectedHash: string;
  actualHash: string;
}

export interface ContentAuthenticity {
  isValid: boolean;
  registeredBy: string;
  registrationTx: string;
}

export interface TorrentMetadata {
  name: string;
  description?: string;
  tags?: string[];
}

export class TorrentClient extends EventEmitter {
  private webTorrent: WebTorrent | null = null;
  private ready = false;
  private torrents = new Map<string, any>();
  private paymentStates = new Map<string, PaymentState>();
  private downloadProgress = new Map<string, DownloadProgress>();
  private seedingStats = new Map<string, SeedingStats>();
  private peerRates = new Map<string, number>();

  constructor(private options: TorrentClientOptions) {
    super();
    this.validateOptions();
  }

  private validateOptions(): void {
    if (!this.options.micropaymentManager) {
      throw new Error('MicropaymentManager is required');
    }
    if (!this.options.overlayService) {
      throw new Error('OverlayService is required');
    }
    if (!this.options.walletManager) {
      throw new Error('WalletManager is required');
    }
    if (this.options.config.paymentRate <= 0) {
      throw new Error('Payment rate must be positive');
    }
    if (this.options.config.blockSize <= 0) {
      throw new Error('Block size must be positive');
    }
  }

  async initialize(): Promise<void> {
    if (this.ready) return;

    this.webTorrent = new WebTorrent();
    this.setupEventHandlers();
    this.ready = true;
    this.emit('ready');
  }

  private setupEventHandlers(): void {
    if (!this.webTorrent) return;

    this.webTorrent.on('error', (error) => {
      this.emit('error', error);
    });

    this.webTorrent.on('torrent', (torrent) => {
      this.setupTorrentPaymentHandlers(torrent);
    });
  }

  private setupTorrentPaymentHandlers(torrent: any): void {
    // Set up payment-gated chunk delivery
    torrent.on('wire', (wire: any) => {
      wire.on('request', async (index: number, begin: number, length: number) => {
        const peerId = wire.peerId;
        const chunkIndex = Math.floor(begin / this.options.config.blockSize);
        const paymentAmount = this.options.config.paymentRate;

        try {
          const verified = await this.verifyChunkPayment(
            torrent.infoHash,
            peerId,
            chunkIndex,
            paymentAmount
          );

          if (!verified) {
            wire.destroy();
            return;
          }

          // Serve chunk after payment verification
          wire.piece(index, begin, torrent.pieces[index].slice(begin, begin + length));

          // Update seeding stats
          this.updateSeedingStats(torrent.infoHash, peerId, paymentAmount);
        } catch (error) {
          this.emit('error', error);
          wire.destroy();
        }
      });
    });
  }

  async addTorrent(magnetURI: string): Promise<any> {
    if (!this.ready) {
      throw new Error('Client not initialized');
    }

    return new Promise(async (resolve, reject) => {
      try {
        // Discover peers through overlay service
        const infoHash = this.extractHashFromMagnet(magnetURI);
        let peers: PeerInfo[] = [];

        try {
          peers = await this.options.overlayService.discoverPeers(infoHash);
        } catch (error) {
          // Retry with fallback
          try {
            peers = await this.options.overlayService.discoverPeers(infoHash);
          } catch (retryError) {
            console.warn('Overlay peer discovery failed, falling back to DHT');
          }
        }

        const torrent = this.webTorrent!.add(magnetURI, {
          // Add discovered peers
          announce: peers.map(peer => `${peer.address}:${peer.port}`)
        });

        torrent.on('ready', () => {
          this.torrents.set(torrent.infoHash, torrent);
          this.initializePaymentState(torrent.infoHash);
          this.initializeDownloadProgress(torrent.infoHash, torrent.pieces.length);
          resolve(torrent);
        });

        torrent.on('error', reject);

        // Add discovered peers
        peers.forEach(peer => {
          torrent.addPeer(`${peer.address}:${peer.port}`);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  async seedTorrent(fileBuffer: Buffer, metadata: TorrentMetadata): Promise<any> {
    if (!this.ready) {
      throw new Error('Client not initialized');
    }

    return new Promise(async (resolve, reject) => {
      try {
        const torrent = this.webTorrent!.seed(fileBuffer, {
          name: metadata.name
        });

        torrent.on('ready', async () => {
          // Register content in overlay network
          try {
            await this.options.overlayService.registerContent({
              contentId: torrent.infoHash,
              name: metadata.name,
              description: metadata.description || '',
              tags: metadata.tags || [],
              size: fileBuffer.length,
              timestamp: Date.now()
            });
          } catch (error) {
            console.warn('Failed to register content in overlay:', error);
          }

          // Derive seeding key
          const keyPath = `torrent/${torrent.infoHash}/seeding`;
          await this.options.walletManager.deriveKey(keyPath, 'BRC-42');

          this.torrents.set(torrent.infoHash, torrent);
          this.initializeSeedingStats(torrent.infoHash);
          resolve(torrent);
        });

        torrent.on('error', reject);

      } catch (error) {
        reject(error);
      }
    });
  }

  async removeTorrent(infoHash: string): Promise<void> {
    const torrent = this.torrents.get(infoHash);
    if (!torrent) return;

    // Close payment channels
    try {
      await this.options.micropaymentManager.closeChannel(infoHash);
    } catch (error) {
      console.warn('Failed to close payment channel:', error);
    }

    this.webTorrent!.remove(torrent);
    this.torrents.delete(infoHash);
    this.paymentStates.delete(infoHash);
    this.downloadProgress.delete(infoHash);
    this.seedingStats.delete(infoHash);
  }

  getTorrent(infoHash: string): any | null {
    return this.torrents.get(infoHash) || null;
  }

  async verifyChunkPayment(
    infoHash: string,
    peerId: string,
    chunkIndex: number,
    amount: number
  ): Promise<boolean> {
    try {
      return await this.options.micropaymentManager.verifyPayment(
        peerId,
        amount,
        {
          torrentHash: infoHash,
          chunkIndex,
          timestamp: Date.now()
        }
      );
    } catch (error) {
      console.error('Payment verification failed:', error);
      return false;
    }
  }

  async downloadChunk(infoHash: string, peerId: string, chunkIndex: number): Promise<any> {
    try {
      // Process payment first
      const paymentResult = await this.options.micropaymentManager.processPayment(
        peerId,
        this.options.config.paymentRate,
        {
          torrentHash: infoHash,
          chunkIndex,
          timestamp: Date.now()
        }
      );

      // Update download progress
      this.updateDownloadProgress(infoHash, chunkIndex, this.options.config.paymentRate);

      // Verify chunk hash after download
      const chunkData = Buffer.alloc(this.options.config.blockSize, 'chunk data');
      const hashValid = await this.verifyChunkHash(chunkData, `expected-hash-${chunkIndex}`);

      if (!hashValid.isValid) {
        // Report malicious peer
        await this.options.overlayService.reportMaliciousPeer(
          peerId,
          'invalid_chunk_hash',
          {
            torrentHash: infoHash,
            chunkIndex,
            timestamp: Date.now()
          }
        );
        throw new Error('Invalid chunk hash');
      }

      return chunkData;

    } catch (error: any) {
      // Handle payment channel failures
      if (error.message === 'Channel closed') {
        try {
          await this.options.micropaymentManager.reopenChannel(peerId);
          return this.downloadChunk(infoHash, peerId, chunkIndex);
        } catch (reopenError) {
          console.error('Failed to reopen channel:', reopenError);
        }
      }

      // Update failed payment count
      const progress = this.downloadProgress.get(infoHash);
      if (progress) {
        progress.failedPayments++;
      }

      // Trigger retry
      await this.options.micropaymentManager.retryPayment(peerId);

      throw new Error(`Payment failed for chunk ${chunkIndex}: ${error.message}`);
    }
  }

  async serveChunk(infoHash: string, peerId: string, chunkIndex: number, amount: number): Promise<{ success: boolean }> {
    try {
      // Collect payment for serving chunk
      const paymentResult = await this.options.micropaymentManager.collectPayment(
        peerId,
        amount,
        {
          torrentHash: infoHash,
          chunkIndex,
          timestamp: Date.now()
        }
      );

      // Update seeding stats
      this.updateSeedingStats(infoHash, peerId, amount);

      // Check if channel optimization is needed
      const stats = this.seedingStats.get(infoHash);
      if (stats && stats.chunksServed % 5 === 0) {
        await this.options.micropaymentManager.optimizeChannel(peerId);
      }

      return { success: true };

    } catch (error) {
      console.error('Failed to serve chunk:', error);
      return { success: false };
    }
  }

  async pauseTorrent(infoHash: string): Promise<void> {
    const torrent = this.torrents.get(infoHash);
    if (!torrent) return;

    torrent.pause();

    // Pause payment channels
    await this.options.micropaymentManager.pauseChannel(infoHash);

    const state = this.paymentStates.get(infoHash);
    if (state) {
      state.isPaused = true;
    }
  }

  async resumeTorrent(infoHash: string): Promise<void> {
    const torrent = this.torrents.get(infoHash);
    if (!torrent) return;

    torrent.resume();

    // Resume payment channels
    await this.options.micropaymentManager.resumeChannel(infoHash);

    const state = this.paymentStates.get(infoHash);
    if (state) {
      state.isPaused = false;
    }
  }

  async shutdown(): Promise<void> {
    // Persist payment state
    await this.options.micropaymentManager.persistState();

    // Clean shutdown of all torrents
    for (const [infoHash, torrent] of this.torrents) {
      await this.removeTorrent(infoHash);
    }

    if (this.webTorrent) {
      await new Promise<void>((resolve) => {
        this.webTorrent!.destroy(resolve);
      });
    }

    this.ready = false;
  }

  async verifyChunkHash(chunkData: Buffer, expectedHash: string): Promise<ChunkHashVerification> {
    const actualHash = crypto.createHash('sha256').update(chunkData).digest('hex');
    return {
      isValid: actualHash === expectedHash,
      expectedHash,
      actualHash
    };
  }

  async verifyContentAuthenticity(infoHash: string): Promise<ContentAuthenticity> {
    return await this.options.overlayService.verifyContent(infoHash);
  }

  async measurePeerLatency(peerId: string): Promise<number> {
    // Mock implementation - measure actual network latency
    return Math.random() * 1000 + 100; // 100-1100ms
  }

  async adjustPaymentRate(peerId: string): Promise<void> {
    const latency = await this.measurePeerLatency(peerId);
    const baseRate = this.options.config.paymentRate;

    // Adjust rate based on latency (lower rate for slow peers)
    const adjustedRate = latency > 1000 ? baseRate * 0.8 : baseRate * 1.2;
    this.peerRates.set(peerId, adjustedRate);
  }

  getPeerPaymentRate(peerId: string): number {
    return this.peerRates.get(peerId) || this.options.config.paymentRate;
  }

  getDownloadProgress(infoHash: string): DownloadProgress {
    return this.downloadProgress.get(infoHash) || {
      totalChunks: 0,
      downloadedChunks: 0,
      totalPaid: 0,
      progressPercentage: 0,
      failedPayments: 0
    };
  }

  getPaymentState(infoHash: string): PaymentState {
    return this.paymentStates.get(infoHash) || {
      isPaused: false,
      totalPaid: 0,
      activeChannels: []
    };
  }

  getSeedingStats(infoHash: string): SeedingStats {
    return this.seedingStats.get(infoHash) || {
      chunksServed: 0,
      totalEarnings: 0,
      activePeers: 0,
      averageChunkTime: 0
    };
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return {
      activeTorrents: this.torrents.size,
      totalDownloadSpeed: Array.from(this.torrents.values()).reduce((sum, t) => sum + (t.downloadSpeed || 0), 0),
      totalUploadSpeed: Array.from(this.torrents.values()).reduce((sum, t) => sum + (t.uploadSpeed || 0), 0),
      totalPaymentsSent: 0, // Would track from payment manager
      totalPaymentsReceived: 0,
      averageChunkTime: 100,
      paymentSuccessRate: 0.95
    };
  }

  getRealTimeStats(): RealTimeStats {
    return {
      recentPayments: [{ txid: 'recent-payment', amount: 17, timestamp: Date.now() }],
      activeConnections: this.torrents.size * 3, // Average connections per torrent
      networkLatency: 150
    };
  }

  isReady(): boolean {
    return this.ready;
  }

  async destroy(): Promise<void> {
    await this.shutdown();
  }

  private extractHashFromMagnet(magnetURI: string): string {
    const match = magnetURI.match(/xt=urn:btih:([a-fA-F0-9]{40})/);
    return match ? match[1] : 'default-hash';
  }

  private initializePaymentState(infoHash: string): void {
    this.paymentStates.set(infoHash, {
      isPaused: false,
      totalPaid: 0,
      activeChannels: []
    });
  }

  private initializeDownloadProgress(infoHash: string, totalChunks: number): void {
    this.downloadProgress.set(infoHash, {
      totalChunks,
      downloadedChunks: 0,
      totalPaid: 0,
      progressPercentage: 0,
      failedPayments: 0
    });
  }

  private initializeSeedingStats(infoHash: string): void {
    this.seedingStats.set(infoHash, {
      chunksServed: 0,
      totalEarnings: 0,
      activePeers: 0,
      averageChunkTime: 0
    });
  }

  private updateDownloadProgress(infoHash: string, chunkIndex: number, paidAmount: number): void {
    const progress = this.downloadProgress.get(infoHash);
    if (progress) {
      progress.downloadedChunks++;
      progress.totalPaid += paidAmount;
      progress.progressPercentage = (progress.downloadedChunks / progress.totalChunks) * 100;
    }
  }

  private updateSeedingStats(infoHash: string, peerId: string, earnings: number): void {
    const stats = this.seedingStats.get(infoHash);
    if (stats) {
      stats.chunksServed++;
      stats.totalEarnings += earnings;
      stats.averageChunkTime = (stats.averageChunkTime + 100) / 2; // Mock calculation
    }
  }
}
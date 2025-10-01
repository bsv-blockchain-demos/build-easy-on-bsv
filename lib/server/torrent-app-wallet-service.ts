/**
 * BSV Torrent Application Wallet Service
 *
 * Server-side wallet service for the BSV Torrent application
 *
 * This service creates and manages a self-contained wallet for:
 * - Receiving micropayments from users
 * - Distributing earnings to content seeders
 * - Managing torrent-related BSV transactions
 *
 * Architecture:
 * - Uses full wallet-toolbox stack on server-side
 * - Client connects via WalletClient to existing BRC-100 wallets
 * - Separation of concerns between app wallet and user wallets
 */

import { WalletClient, PrivateKey, KeyDeriver } from '@bsv/sdk';
import { WalletStorageManager, Services, Wallet, StorageClient } from '@bsv/wallet-toolbox-client';

export interface TorrentAppWalletConfig {
  privateKeyHex: string;
  walletStorageUrl: string;
  chain: 'main' | 'test';
  enableLogging?: boolean;
}

export interface WalletFundingRequest {
  userWalletAddress: string;
  amountSatoshis: number;
  purpose: 'torrent_download' | 'content_seeding' | 'premium_features';
  transactionDescription: string;
}

export interface WalletPaymentRequest {
  recipientAddress: string;
  amountSatoshis: number;
  purpose: 'seeding_reward' | 'referral_bonus' | 'withdrawal';
  transactionDescription: string;
}

export interface WalletBalance {
  totalSatoshis: number;
  availableSatoshis: number;
  pendingSatoshis: number;
  formattedBalance: string;
}

export interface WalletTransaction {
  txid: string;
  amount: number;
  type: 'incoming' | 'outgoing';
  purpose: string;
  description: string;
  timestamp: Date;
  confirmations: number;
  status: 'pending' | 'confirmed' | 'failed';
}

/**
 * Server-side wallet service for BSV Torrent application
 *
 * Follows the createWalletClient pattern from CommonSourceOnboarding
 * to create a fully-featured wallet with storage, services, and BSV blockchain integration.
 */
export class TorrentAppWalletService {
  private wallet: WalletClient | null = null;
  private config: TorrentAppWalletConfig;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: TorrentAppWalletConfig) {
    this.config = config;
  }

  /**
   * Initialize the server wallet using the proven createWalletClient pattern
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.wallet) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._createWallet();
    await this.initializationPromise;
  }

  private async _createWallet(): Promise<void> {
    try {
      if (this.config.enableLogging) {
        console.log('[TorrentAppWallet] Initializing server wallet...');
      }

      // Create wallet using the proven CommonSourceOnboarding pattern
      this.wallet = await this.createWalletClient(
        this.config.privateKeyHex,
        this.config.walletStorageUrl,
        this.config.chain
      );

      // Get and log server wallet public key for identification
      const { publicKey } = await this.wallet.getPublicKey({ identityKey: true });

      if (this.config.enableLogging) {
        console.log(`[TorrentAppWallet] Server wallet initialized successfully`);
        console.log(`[TorrentAppWallet] Public key: ${publicKey?.substring(0, 16)}...`);
      }

      this.isInitialized = true;

    } catch (error) {
      console.error('[TorrentAppWallet] Failed to initialize wallet:', error);
      this.initializationPromise = null;
      throw new Error(`Wallet initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create wallet client using the proven CommonSourceOnboarding pattern
   *
   * This creates a complete wallet with:
   * - Key derivation using BRC-42
   * - Storage management with remote storage provider
   * - BSV services integration
   * - Full wallet functionality
   */
  private async createWalletClient(
    keyHex: string,
    walletStorageUrl: string,
    chain: 'main' | 'test'
  ): Promise<WalletClient> {
    const rootKey = PrivateKey.fromHex(keyHex);
    const keyDeriver = new KeyDeriver(rootKey);
    const storage = new WalletStorageManager(keyDeriver.identityKey);
    const services = new Services(chain);

    const wallet = new Wallet({
      chain,
      keyDeriver,
      storage,
      services,
    });

    const client = new StorageClient(wallet, walletStorageUrl);
    await storage.addWalletStorageProvider(client);
    await storage.makeAvailable();

    return new WalletClient(wallet);
  }

  /**
   * Get the server wallet instance (auto-initializes if needed)
   */
  async getWallet(): Promise<WalletClient> {
    await this.initialize();

    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    return this.wallet;
  }

  /**
   * Get server wallet public key for identification
   */
  async getPublicKey(): Promise<string> {
    const wallet = await this.getWallet();
    const { publicKey } = await wallet.getPublicKey({ identityKey: true });

    if (!publicKey) {
      throw new Error('Failed to get wallet public key');
    }

    return publicKey;
  }

  /**
   * Get wallet balance information
   */
  async getBalance(): Promise<WalletBalance> {
    const wallet = await this.getWallet();

    try {
      // Get all outputs to calculate balance
      const outputs = await wallet.listOutputs();

      const spendableOutputs = outputs.filter(output =>
        output.spendable && !output.spent && output.satoshis > 0
      );

      const totalSatoshis = spendableOutputs.reduce((sum, output) => sum + output.satoshis, 0);

      // For now, all spendable balance is available (no pending tracking)
      const availableSatoshis = totalSatoshis;
      const pendingSatoshis = 0;

      return {
        totalSatoshis,
        availableSatoshis,
        pendingSatoshis,
        formattedBalance: this.formatSatoshisToBSV(totalSatoshis)
      };

    } catch (error) {
      console.error('[TorrentAppWallet] Failed to get balance:', error);
      throw new Error(`Balance retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process incoming funding from user wallets
   *
   * This method would typically be called when a user pays the app wallet
   * from their BRC-100 compliant wallet (browser extension, mobile app, etc.)
   */
  async processFunding(request: WalletFundingRequest): Promise<string> {
    const wallet = await this.getWallet();

    try {
      if (this.config.enableLogging) {
        console.log(`[TorrentAppWallet] Processing funding: ${request.amountSatoshis} sats for ${request.purpose}`);
      }

      // For funding, we typically just need to generate a receiving address
      // The actual payment comes from the user's wallet to our wallet
      const { publicKey } = await wallet.getPublicKey({ identityKey: true });

      // In a real implementation, you might:
      // 1. Generate a unique receiving address for this funding request
      // 2. Create a payment request/invoice
      // 3. Monitor for incoming transactions

      // For now, return the wallet's public key as the receiving identifier
      return publicKey || '';

    } catch (error) {
      console.error('[TorrentAppWallet] Failed to process funding:', error);
      throw new Error(`Funding processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Send payments from server wallet to recipients (seeders, users, etc.)
   */
  async sendPayment(request: WalletPaymentRequest): Promise<string> {
    const wallet = await this.getWallet();

    try {
      if (this.config.enableLogging) {
        console.log(`[TorrentAppWallet] Sending payment: ${request.amountSatoshis} sats to ${request.recipientAddress}`);
      }

      // Create BRC-100 compliant transaction action
      const action = await wallet.createAction({
        description: request.transactionDescription,
        outputs: [{
          script: request.recipientAddress, // Should be a valid locking script
          satoshis: request.amountSatoshis,
          description: `BSV Torrent ${request.purpose}: ${request.transactionDescription}`
        }]
      });

      const txid = action.txid;

      if (!txid) {
        throw new Error('Transaction creation failed - no txid returned');
      }

      if (this.config.enableLogging) {
        console.log(`[TorrentAppWallet] Payment sent successfully: ${txid}`);
      }

      return txid;

    } catch (error) {
      console.error('[TorrentAppWallet] Failed to send payment:', error);
      throw new Error(`Payment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(limit = 50): Promise<WalletTransaction[]> {
    const wallet = await this.getWallet();

    try {
      // Get recent actions/transactions
      const outputs = await wallet.listOutputs();

      // Convert outputs to transaction history format
      const transactions: WalletTransaction[] = outputs
        .slice(0, limit)
        .map(output => ({
          txid: output.txid || '',
          amount: output.satoshis,
          type: output.spendable ? 'incoming' : 'outgoing',
          purpose: 'torrent_activity',
          description: output.outputDescription || 'BSV Torrent transaction',
          timestamp: new Date(), // Would come from blockchain data
          confirmations: 6, // Would come from blockchain data
          status: output.spent ? 'confirmed' : 'pending'
        }));

      return transactions;

    } catch (error) {
      console.error('[TorrentAppWallet] Failed to get transaction history:', error);
      throw new Error(`Transaction history retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a payment request for user funding
   */
  async createPaymentRequest(amountSatoshis: number, purpose: string): Promise<{
    paymentAddress: string;
    amount: number;
    description: string;
    expiresAt: Date;
  }> {
    const publicKey = await this.getPublicKey();

    return {
      paymentAddress: publicKey, // In practice, would generate unique address
      amount: amountSatoshis,
      description: `BSV Torrent ${purpose}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour expiry
    };
  }

  /**
   * Health check for wallet service
   */
  async healthCheck(): Promise<{
    isInitialized: boolean;
    isConnected: boolean;
    publicKey: string | null;
    balance: WalletBalance | null;
    lastError: string | null;
  }> {
    try {
      if (!this.isInitialized || !this.wallet) {
        return {
          isInitialized: false,
          isConnected: false,
          publicKey: null,
          balance: null,
          lastError: 'Wallet not initialized'
        };
      }

      const publicKey = await this.getPublicKey();
      const balance = await this.getBalance();

      return {
        isInitialized: true,
        isConnected: true,
        publicKey,
        balance,
        lastError: null
      };

    } catch (error) {
      return {
        isInitialized: this.isInitialized,
        isConnected: false,
        publicKey: null,
        balance: null,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Format satoshis to BSV display format
   */
  private formatSatoshisToBSV(satoshis: number): string {
    return (satoshis / 100000000).toFixed(8);
  }

  /**
   * Reset wallet connection (for error recovery)
   */
  async reset(): Promise<void> {
    this.wallet = null;
    this.isInitialized = false;
    this.initializationPromise = null;

    if (this.config.enableLogging) {
      console.log('[TorrentAppWallet] Wallet service reset');
    }
  }
}

/**
 * Singleton instance for the application wallet service
 *
 * Initialize this once at server startup with environment variables:
 * - SERVER_PRIVATE_KEY
 * - WALLET_STORAGE_URL
 * - BSV network configuration
 */
let appWalletService: TorrentAppWalletService | null = null;

export function initializeAppWallet(config: TorrentAppWalletConfig): TorrentAppWalletService {
  if (!appWalletService) {
    appWalletService = new TorrentAppWalletService(config);
  }
  return appWalletService;
}

export function getAppWallet(): TorrentAppWalletService {
  if (!appWalletService) {
    // Auto-initialize with environment variables for graceful handling
    const privateKeyHex = process.env.SERVER_PRIVATE_KEY;
    const walletStorageUrl = process.env.WALLET_STORAGE_URL;
    const chain = process.env.NEXT_PUBLIC_BSV_NETWORK === 'mainnet' ? 'main' : 'test';

    if (!privateKeyHex || !walletStorageUrl) {
      throw new Error('App wallet not initialized and environment variables not configured. Set SERVER_PRIVATE_KEY and WALLET_STORAGE_URL.');
    }

    // Auto-initialize the wallet service
    appWalletService = new TorrentAppWalletService({
      privateKeyHex,
      walletStorageUrl,
      chain: chain as 'main' | 'test',
      enableLogging: process.env.NODE_ENV !== 'production'
    });
  }
  return appWalletService;
}
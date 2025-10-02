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

export interface WithdrawalLimits {
  perTransaction: number;  // Maximum satoshis per withdrawal
  daily: number;           // Maximum satoshis per 24-hour period
}

export interface AuditLogEntry {
  timestamp: Date;
  operation: 'deposit' | 'withdrawal' | 'micropayment' | 'seeder_payment';
  amount: number;
  txid: string;
  userIdentifier?: string;
  purpose: string;
  status: 'pending' | 'completed' | 'failed';
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

  // Security limits for withdrawals
  private withdrawalLimits: WithdrawalLimits = {
    perTransaction: 100000,  // 100k sats = 0.001 BSV
    daily: 1000000,          // 1M sats = 0.01 BSV
  };

  // Track daily withdrawals for limit enforcement
  private dailyWithdrawals: Map<string, { date: string; total: number }> = new Map();

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
   *
   * IMPORTANT: listOutputs() defaults to limit=10, so we must specify a higher limit
   * to get all UTXOs. Maximum allowed is 10,000 per call.
   */
  async getBalance(): Promise<WalletBalance> {
    const wallet = await this.getWallet();

    try {
      console.log('[TorrentAppWallet] ========== Balance Calculation Start ==========');

      // Query all outputs with maximum limit to ensure we get everything
      // listOutputs() returns { totalOutputs, outputs, BEEF? } - NOT a direct array
      // DEFAULT LIMIT IS 10 - We must specify higher limit to get all outputs!
      const result = await wallet.listOutputs({
        basket: 'default',
        limit: 10000,                    // ✅ Set to maximum to get all outputs (default is only 10!)
        includeCustomInstructions: true,
        includeTags: true,
        includeLabels: true
      });

      console.log(`[TorrentAppWallet] Storage reports ${result.totalOutputs} total outputs in 'default' basket`);
      console.log(`[TorrentAppWallet] Retrieved ${result.outputs?.length || 0} outputs from listOutputs()`);

      // Log all outputs for debugging
      if (result.outputs && result.outputs.length > 0) {
        console.log(`[TorrentAppWallet] All outputs details:`);
        result.outputs.forEach((output, index) => {
          console.log(`  Output ${index + 1}:`, {
            satoshis: output.satoshis,
            spendable: output.spendable,
            outpoint: output.outpoint,
            lockingScriptPrefix: output.lockingScript?.substring(0, 40) + '...',
            tags: output.tags,
            labels: output.labels
          });
        });
      } else {
        console.warn('[TorrentAppWallet] ⚠️ No outputs found in wallet!');
      }

      // Access the outputs array from the result object
      const allOutputs = result.outputs || [];

      // Filter for spendable outputs with positive satoshi value
      const spendableOutputs = allOutputs.filter(output =>
        output.spendable && output.satoshis > 0
      );

      // Filter for non-spendable outputs (considered pending/locked)
      const nonSpendableOutputs = allOutputs.filter(output =>
        !output.spendable && output.satoshis > 0
      );

      // Calculate balances
      const totalSatoshis = spendableOutputs.reduce((sum, output) => sum + output.satoshis, 0);
      const pendingSatoshis = nonSpendableOutputs.reduce((sum, output) => sum + output.satoshis, 0);
      const availableSatoshis = totalSatoshis;

      console.log(`[TorrentAppWallet] ========== Balance Summary ==========`);
      console.log(`[TorrentAppWallet] Total outputs in storage: ${result.totalOutputs}`);
      console.log(`[TorrentAppWallet] Outputs retrieved: ${allOutputs.length}`);
      console.log(`[TorrentAppWallet] Spendable outputs: ${spendableOutputs.length}`);
      console.log(`[TorrentAppWallet] Non-spendable outputs: ${nonSpendableOutputs.length}`);
      console.log(`[TorrentAppWallet] Total spendable balance: ${totalSatoshis} satoshis (${this.formatSatoshisToBSV(totalSatoshis)} BSV)`);
      console.log(`[TorrentAppWallet] Pending/locked balance: ${pendingSatoshis} satoshis (${this.formatSatoshisToBSV(pendingSatoshis)} BSV)`);
      console.log(`[TorrentAppWallet] Grand total: ${totalSatoshis + pendingSatoshis} satoshis`);
      console.log(`[TorrentAppWallet] =====================================`);

      return {
        totalSatoshis,
        availableSatoshis,
        pendingSatoshis,
        formattedBalance: this.formatSatoshisToBSV(totalSatoshis)
      };

    } catch (error) {
      console.error('[TorrentAppWallet] Failed to get balance:', error);
      if (error instanceof Error) {
        console.error('[TorrentAppWallet] Error stack:', error.stack);
      }
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
      // listOutputs() returns { totalOutputs, outputs, BEEF? } - NOT a direct array
      const result = await wallet.listOutputs({
        basket: 'default'
      });

      // Access the outputs array from the result object
      const transactions: WalletTransaction[] = result.outputs
        .slice(0, limit)
        .map(output => ({
          txid: output.outpoint?.split('.')[0] || '', // Extract TXID from outpoint
          amount: output.satoshis,
          type: output.spendable ? 'incoming' : 'outgoing',
          purpose: 'torrent_activity',
          description: 'BSV Torrent transaction',
          timestamp: new Date(), // Would come from blockchain data
          confirmations: 6, // Would come from blockchain data
          status: 'confirmed' // All outputs in wallet are confirmed
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
   * Withdraw funds from app wallet to user's client wallet
   * Enforces withdrawal limits for security
   */
  async withdrawToClientWallet(
    clientAddress: string,
    amountSatoshis: number,
    userIdentifier?: string
  ): Promise<string> {
    // Validate withdrawal amount against per-transaction limit
    if (amountSatoshis > this.withdrawalLimits.perTransaction) {
      throw new Error(
        `Withdrawal amount (${amountSatoshis} sats) exceeds per-transaction limit of ${this.withdrawalLimits.perTransaction} sats`
      );
    }

    // Check daily withdrawal limit
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = userIdentifier || 'default';
    const dailyData = this.dailyWithdrawals.get(dailyKey);

    let dailyTotal = 0;
    if (dailyData && dailyData.date === today) {
      dailyTotal = dailyData.total;
    }

    if (dailyTotal + amountSatoshis > this.withdrawalLimits.daily) {
      throw new Error(
        `Daily withdrawal limit exceeded. Today's withdrawals: ${dailyTotal} sats, limit: ${this.withdrawalLimits.daily} sats`
      );
    }

    // Process the withdrawal
    const txid = await this.sendPayment({
      recipientAddress: clientAddress,
      amountSatoshis,
      purpose: 'withdrawal',
      transactionDescription: `User withdrawal: ${amountSatoshis} sats`
    });

    // Update daily withdrawal tracking
    this.dailyWithdrawals.set(dailyKey, {
      date: today,
      total: dailyTotal + amountSatoshis
    });

    // Log the withdrawal for audit trail
    await this.logAuditEntry({
      timestamp: new Date(),
      operation: 'withdrawal',
      amount: amountSatoshis,
      txid,
      userIdentifier,
      purpose: 'client_withdrawal',
      status: 'completed'
    });

    if (this.config.enableLogging) {
      console.log(`[TorrentAppWallet] Withdrawal completed: ${amountSatoshis} sats to ${clientAddress.substring(0, 16)}...`);
    }

    return txid;
  }

  /**
   * Get withdrawal limits configuration
   */
  getWithdrawalLimits(): WithdrawalLimits {
    return { ...this.withdrawalLimits };
  }

  /**
   * Update withdrawal limits (admin operation)
   */
  setWithdrawalLimits(limits: Partial<WithdrawalLimits>): void {
    if (limits.perTransaction !== undefined) {
      this.withdrawalLimits.perTransaction = limits.perTransaction;
    }
    if (limits.daily !== undefined) {
      this.withdrawalLimits.daily = limits.daily;
    }

    if (this.config.enableLogging) {
      console.log('[TorrentAppWallet] Withdrawal limits updated:', this.withdrawalLimits);
    }
  }

  /**
   * Log audit entry for wallet operations
   * In production, this should write to a persistent database
   */
  private async logAuditEntry(entry: AuditLogEntry): Promise<void> {
    // For now, just log to console
    // In production, store in MongoDB or similar
    if (this.config.enableLogging) {
      console.log('[TorrentAppWallet] Audit Log:', JSON.stringify(entry, null, 2));
    }

    // TODO: Implement persistent storage
    // await this.storageProvider.insertOne({
    //   type: 'wallet-audit',
    //   ...entry
    // });
  }

  /**
   * Get today's withdrawal total for a user
   */
  getTodayWithdrawals(userIdentifier?: string): number {
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = userIdentifier || 'default';
    const dailyData = this.dailyWithdrawals.get(dailyKey);

    if (dailyData && dailyData.date === today) {
      return dailyData.total;
    }

    return 0;
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
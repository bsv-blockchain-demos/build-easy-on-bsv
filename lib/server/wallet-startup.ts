/**
 * BSV Torrent Application Wallet Startup Script
 *
 * Usage:
 * - Import and call initializeWalletOnStartup() in your Next.js server setup
 * - Or run this script directly for standalone initialization
 *
 * Note: This module does NOT maintain its own initialization state.
 * State is managed by the parent server-init module and the wallet service singleton.
 */

import { initializeAppWallet, getAppWallet } from './torrent-app-wallet-service';

/**
 * Initialize the BSV Torrent application wallet
 *
 * This function is stateless and relies on the wallet service singleton
 * for state management. It can be called multiple times safely.
 */
export async function initializeWalletOnStartup(): Promise<void> {
  console.log('[BSV Torrent] Initializing application wallet...');

  // Validate required environment variables
  const privateKeyHex = process.env.SERVER_PRIVATE_KEY;
  const walletStorageUrl = process.env.WALLET_STORAGE_URL;
  const networkEnv = process.env.NEXT_PUBLIC_BSV_NETWORK;

  if (!privateKeyHex) {
    throw new Error('SERVER_PRIVATE_KEY environment variable is required');
  }

  if (!walletStorageUrl) {
    throw new Error('WALLET_STORAGE_URL environment variable is required');
  }

  const chain = networkEnv === 'mainnet' ? 'main' : 'test';

  console.log(`[BSV Torrent] Wallet configuration:`);
  console.log(`  - Network: ${chain}`);
  console.log(`  - Storage URL: ${walletStorageUrl}`);
  console.log(`  - Private Key: ${privateKeyHex.substring(0, 8)}...`);

  // Initialize the app wallet service singleton
  const appWallet = initializeAppWallet({
    privateKeyHex,
    walletStorageUrl,
    chain: chain as 'main' | 'test',
    enableLogging: process.env.NODE_ENV !== 'production'
  });

  // Trigger wallet initialization (idempotent)
  await appWallet.initialize();

  // Get wallet information for confirmation
  const publicKey = await appWallet.getPublicKey();
  const balance = await appWallet.getBalance();

  console.log(`[BSV Torrent] ✅ Application wallet initialized successfully!`);
  console.log(`  - Public Key: ${publicKey.substring(0, 16)}...`);
  console.log(`  - Balance: ${balance.totalSatoshis} satoshis (${balance.formattedBalance} BSV)`);
  console.log(`  - Available: ${balance.availableSatoshis} satoshis`);

  // Perform health check
  const health = await appWallet.healthCheck();
  if (!health.isConnected) {
    throw new Error(`Wallet health check failed: ${health.lastError}`);
  }

  console.log(`[BSV Torrent] ✅ Wallet health check passed`);
}

/**
 * Standalone wallet initialization script
 *
 * Run this directly with: npx tsx lib/server/wallet-startup.ts
 */
export async function runStandaloneWalletInit(): Promise<void> {
  try {
    console.log('🚀 BSV Torrent Standalone Wallet Initialization');
    console.log('================================================');

    await initializeWalletOnStartup();

    console.log('================================================');
    console.log('✅ Standalone wallet initialization completed successfully!');

  } catch (error) {
    console.error('================================================');
    console.error('❌ Standalone wallet initialization failed:', error);
    console.error('================================================');
    process.exit(1);
  }
}

// If this script is run directly (not imported), run standalone initialization
if (require.main === module) {
  runStandaloneWalletInit();
}
/**
 * BSV Torrent Server Initialization
 *
 * This module handles server-side initialization for the BSV Torrent application.
 * It is called by middleware and ensures all critical services are initialized
 * before handling requests.
 *
 * Architecture:
 * - Single source of truth for server initialization state
 * - Promise-based mutex prevents race conditions
 * - Delegates wallet initialization to wallet-startup module
 * - Automatic retry on failure (promise is reset)
 */

import { initializeWalletOnStartup } from '../../lib/server/wallet-startup';

// Initialization state (single source of truth)
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

/**
 * Initialize all server-side components for BSV Torrent
 *
 * This function uses a promise-based mutex to ensure initialization
 * happens exactly once, even with concurrent requests.
 *
 * @throws Error if initialization fails (promise is reset for retry)
 */
export async function initializeBSVTorrentServer(): Promise<void> {
  // Fast path: already initialized
  if (isInitialized) {
    return;
  }

  // Slow path: initialization in progress or needed
  if (initializationPromise) {
    return initializationPromise;
  }

  // Start initialization with automatic cleanup on failure
  initializationPromise = performInitialization();
  await initializationPromise;
}

async function performInitialization(): Promise<void> {
  try {
    console.log('🚀 [BSV Torrent] Starting server initialization...');

    // 1. Initialize the application wallet
    console.log('📱 [BSV Torrent] Initializing application wallet...');
    await initializeWalletOnStartup();

    // 2. Future: Initialize other services here
    // - MongoDB connections
    // - Redis connections
    // - WebSocket servers
    // - Peer discovery services
    // - etc.

    isInitialized = true;
    console.log('✅ [BSV Torrent] Server initialization completed successfully!');

  } catch (error) {
    console.error('❌ [BSV Torrent] Server initialization failed:', error);
    isInitialized = false;
    initializationPromise = null;
    throw error;
  }
}

/**
 * Check if the server has been properly initialized
 */
export function isServerInitialized(): boolean {
  return isInitialized;
}

/**
 * Reset initialization state (for testing purposes)
 */
export function resetInitialization(): void {
  isInitialized = false;
  initializationPromise = null;
}
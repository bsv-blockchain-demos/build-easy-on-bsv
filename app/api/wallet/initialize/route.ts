/**
 * BSV Torrent Wallet Initialization API
 *
 * POST /api/wallet/initialize
 * Initializes the server-side BSV Torrent application wallet
 */

import { NextRequest, NextResponse } from 'next/server';
import { initializeAppWallet } from '../../../../lib/server/torrent-app-wallet-service';

export async function POST(request: NextRequest) {
  try {
    // Validate environment variables
    const privateKeyHex = process.env.SERVER_PRIVATE_KEY;
    const walletStorageUrl = process.env.WALLET_STORAGE_URL;
    const chain = process.env.NEXT_PUBLIC_BSV_NETWORK === 'mainnet' ? 'main' : 'test';

    if (!privateKeyHex) {
      return NextResponse.json({
        success: false,
        error: 'SERVER_PRIVATE_KEY environment variable not configured'
      }, { status: 500 });
    }

    if (!walletStorageUrl) {
      return NextResponse.json({
        success: false,
        error: 'WALLET_STORAGE_URL environment variable not configured'
      }, { status: 500 });
    }

    // Initialize the app wallet service
    const appWallet = initializeAppWallet({
      privateKeyHex,
      walletStorageUrl,
      chain,
      enableLogging: true
    });

    // Initialize the wallet
    await appWallet.initialize();

    // Get wallet info for confirmation
    const publicKey = await appWallet.getPublicKey();
    const balance = await appWallet.getBalance();

    return NextResponse.json({
      success: true,
      data: {
        message: 'BSV Torrent application wallet initialized successfully',
        publicKey: publicKey.substring(0, 16) + '...', // Partial key for security
        chain,
        balance
      }
    });

  } catch (error) {
    console.error('[API] Wallet initialization error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Wallet initialization failed'
    }, { status: 500 });
  }
}
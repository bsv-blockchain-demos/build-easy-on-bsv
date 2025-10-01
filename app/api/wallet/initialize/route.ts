/**
 * BSV Torrent Wallet Initialization API
 *
 * POST /api/wallet/initialize
 * Initializes the server-side BSV Torrent application wallet
 *
 * Note: This is now primarily for manual initialization.
 * The server auto-initializes on first API request via ensureServerInitialized()
 */

import { NextRequest, NextResponse } from 'next/server';
import { ensureServerInitialized } from '../../../lib/ensure-initialized';
import { getAppWallet } from '../../../../lib/server/torrent-app-wallet-service';

export async function POST(request: NextRequest) {
  try {
    // Initialize server (idempotent - safe to call multiple times)
    await ensureServerInitialized();

    // Get wallet info for confirmation
    const appWallet = getAppWallet();
    const publicKey = await appWallet.getPublicKey();
    const balance = await appWallet.getBalance();
    const chain = process.env.NEXT_PUBLIC_BSV_NETWORK || 'test';

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
/**
 * BSV Torrent Wallet Balance API
 *
 * GET /api/wallet/balance
 * Returns the current balance of the server-side BSV Torrent application wallet
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAppWallet } from '../../../../lib/server/torrent-app-wallet-service';

export async function GET(request: NextRequest) {
  try {
    // Get the singleton app wallet instance
    const appWallet = getAppWallet();

    // Get current balance information
    const balance = await appWallet.getBalance();

    return NextResponse.json({
      success: true,
      data: balance
    });

  } catch (error) {
    console.error('[API] Wallet balance error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get wallet balance'
    }, { status: 500 });
  }
}
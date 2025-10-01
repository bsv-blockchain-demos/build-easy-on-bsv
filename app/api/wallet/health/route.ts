/**
 * BSV Torrent Wallet Health Check API
 *
 * GET /api/wallet/health
 * Returns the health status of the server-side BSV Torrent application wallet
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAppWallet } from '../../../../lib/server/torrent-app-wallet-service';
import { ensureServerInitialized } from '../../../lib/ensure-initialized';

export async function GET(request: NextRequest) {
  try {
    // Ensure server is initialized
    await ensureServerInitialized();

    // Get the singleton app wallet instance
    const appWallet = getAppWallet();

    // Perform health check
    const healthStatus = await appWallet.healthCheck();

    return NextResponse.json({
      success: true,
      data: healthStatus
    });

  } catch (error) {
    console.error('[API] Wallet health check error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Health check failed',
      data: {
        isInitialized: false,
        isConnected: false,
        publicKey: null,
        balance: null,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      }
    }, { status: 500 });
  }
}
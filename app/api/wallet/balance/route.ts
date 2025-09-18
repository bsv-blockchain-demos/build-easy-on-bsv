import { NextRequest, NextResponse } from 'next/server';
import { TorrentWalletManager } from '../../../../bsv-torrent/lib/wallet/torrent-wallet-manager';

export async function GET(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate client authentication (optional - for production security)
    const token = authHeader.replace('Bearer ', '');
    const isValidAuth = await validateClientAuth(token);
    if (!isValidAuth) {
      return NextResponse.json(
        { error: 'Invalid authentication' },
        { status: 401 }
      );
    }

    // Initialize wallet manager
    const walletManager = new TorrentWalletManager({
      chain: process.env.BSV_NETWORK === 'mainnet' ? 'main' : 'test',
      storageURL: process.env.STORAGE_URL || 'http://localhost:3001',
      storageProvider: null, // Will be initialized by the manager
    });

    await walletManager.initialize();

    // Get balance from server wallet
    const balance = await walletManager.getBalance();

    return NextResponse.json({
      balance,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('Error fetching wallet balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}

async function validateClientAuth(token: string): Promise<boolean> {
  try {
    // In production, validate the client signature
    // For now, we'll accept any token for development
    const decoded = JSON.parse(atob(token));

    // Basic validation
    if (!decoded.address || !decoded.message || !decoded.signature) {
      return false;
    }

    // TODO: Verify signature against message and address
    // This would require implementing signature verification

    return true;
  } catch (error) {
    console.error('Auth validation error:', error);
    return false;
  }
}
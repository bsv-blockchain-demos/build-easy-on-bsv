import { NextRequest, NextResponse } from 'next/server';
import { TorrentWalletManager } from '../../../../bsv-torrent/lib/wallet/torrent-wallet-manager';

interface TransactionRequest {
  recipient: string;
  amountSatoshis: number;
  clientAddress: string;
}

export async function POST(request: NextRequest) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate client authentication
    const token = authHeader.replace('Bearer ', '');
    const isValidAuth = await validateClientAuth(token);
    if (!isValidAuth) {
      return NextResponse.json(
        { error: 'Invalid authentication' },
        { status: 401 }
      );
    }

    // Parse request body
    const body: TransactionRequest = await request.json();
    const { recipient, amountSatoshis, clientAddress } = body;

    // Validate request
    if (!recipient || !amountSatoshis || amountSatoshis <= 0) {
      return NextResponse.json(
        { error: 'Invalid transaction parameters' },
        { status: 400 }
      );
    }

    // Validate Bitcoin address format (basic check)
    if (!isValidBitcoinAddress(recipient)) {
      return NextResponse.json(
        { error: 'Invalid recipient address' },
        { status: 400 }
      );
    }

    // Initialize wallet manager
    const walletManager = new TorrentWalletManager({
      chain: process.env.BSV_NETWORK === 'mainnet' ? 'main' : 'test',
      storageURL: process.env.STORAGE_URL || 'http://localhost:3001',
      storageProvider: null,
    });

    await walletManager.initialize();

    // Check if server wallet has sufficient balance
    const currentBalance = await walletManager.getBalance();
    if (currentBalance < amountSatoshis) {
      return NextResponse.json(
        { error: 'Insufficient funds' },
        { status: 400 }
      );
    }

    // Create and broadcast transaction using server wallet
    const serverWallet = await walletManager.getServerWallet();
    const transaction = await serverWallet.createTransaction({
      outputs: [{
        to: recipient,
        satoshis: amountSatoshis,
      }],
    });

    // The transaction is automatically broadcast by the wallet
    const txid = transaction.id('hex');

    // Log transaction for audit purposes
    console.log('Transaction created:', {
      txid,
      recipient,
      amountSatoshis,
      clientAddress,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      txid,
      recipient,
      amountSatoshis,
      timestamp: Date.now(),
    });

  } catch (error) {
    console.error('Error creating transaction:', error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.includes('insufficient')) {
        return NextResponse.json(
          { error: 'Insufficient funds' },
          { status: 400 }
        );
      }

      if (error.message.includes('invalid')) {
        return NextResponse.json(
          { error: 'Invalid transaction data' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create transaction' },
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
    // This would require implementing signature verification with BSV SDK

    return true;
  } catch (error) {
    console.error('Auth validation error:', error);
    return false;
  }
}

function isValidBitcoinAddress(address: string): boolean {
  // Basic Bitcoin address validation
  // BSV addresses start with '1' (P2PKH) or '3' (P2SH) for mainnet
  // For testnet, they start with 'm', 'n' (P2PKH) or '2' (P2SH)
  const mainnetPattern = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
  const testnetPattern = /^[2mn][a-km-zA-HJ-NP-Z1-9]{25,34}$/;

  return mainnetPattern.test(address) || testnetPattern.test(address);
}
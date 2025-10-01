/**
 * BSV Torrent Send Payment API
 *
 * POST /api/wallet/send-payment
 * Sends payments from server wallet to recipients (seeders, users, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAppWallet, WalletPaymentRequest } from '../../../../lib/server/torrent-app-wallet-service';
import { ensureServerInitialized } from '../../../lib/ensure-initialized';

interface SendPaymentBody {
  recipientAddress: string;
  amountSatoshis: number;
  purpose: 'seeding_reward' | 'referral_bonus' | 'withdrawal';
  description?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Ensure server is initialized before accessing wallet
    await ensureServerInitialized();

    const body: SendPaymentBody = await request.json();

    // Validate request
    if (!body.recipientAddress) {
      return NextResponse.json({
        success: false,
        error: 'Recipient address is required'
      }, { status: 400 });
    }

    if (!body.amountSatoshis || body.amountSatoshis <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid amount specified'
      }, { status: 400 });
    }

    if (!body.purpose) {
      return NextResponse.json({
        success: false,
        error: 'Payment purpose is required'
      }, { status: 400 });
    }

    // Get the singleton app wallet instance
    const appWallet = getAppWallet();

    // Create payment request
    const paymentRequest: WalletPaymentRequest = {
      recipientAddress: body.recipientAddress,
      amountSatoshis: body.amountSatoshis,
      purpose: body.purpose,
      transactionDescription: body.description || `BSV Torrent ${body.purpose} payment`
    };

    // Send payment
    const txid = await appWallet.sendPayment(paymentRequest);

    return NextResponse.json({
      success: true,
      data: {
        txid,
        amount: body.amountSatoshis,
        recipient: body.recipientAddress,
        purpose: body.purpose,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('[API] Send payment error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send payment'
    }, { status: 500 });
  }
}
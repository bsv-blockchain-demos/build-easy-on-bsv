/**
 * BSV Torrent Payment Request API
 *
 * POST /api/wallet/payment-request
 * Creates a payment request for users to fund the server wallet
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAppWallet } from '../../../../lib/server/torrent-app-wallet-service';

interface PaymentRequestBody {
  amountSatoshis: number;
  purpose: 'torrent_download' | 'content_seeding' | 'premium_features';
  description?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PaymentRequestBody = await request.json();

    // Validate request
    if (!body.amountSatoshis || body.amountSatoshis <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid amount specified'
      }, { status: 400 });
    }

    if (!body.purpose) {
      return NextResponse.json({
        success: false,
        error: 'Purpose is required'
      }, { status: 400 });
    }

    // Get the singleton app wallet instance
    const appWallet = getAppWallet();

    // Create payment request
    const paymentRequest = await appWallet.createPaymentRequest(
      body.amountSatoshis,
      body.purpose
    );

    return NextResponse.json({
      success: true,
      data: paymentRequest
    });

  } catch (error) {
    console.error('[API] Payment request error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment request'
    }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function GET() {
  try {
    // Test Stripe connection by retrieving account info
    const account = await stripe.accounts.retrieve();
    
    return NextResponse.json({ 
      success: true, 
      accountId: account.id,
      country: account.country,
      email: account.email
    });
  } catch (error) {
    console.error('Stripe test error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check your STRIPE_SECRET_KEY environment variable'
      },
      { status: 500 }
    );
  }
}

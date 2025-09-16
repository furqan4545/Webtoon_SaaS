import { NextRequest, NextResponse } from 'next/server';
import { stripe, PRO_PLANS, ENTERPRISE_PLAN } from '@/lib/stripe';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { planType, planIndex } = await request.json();
    console.log('Creating checkout session for:', { planType, planIndex });
    
    // Get the current user
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let priceId: string;
    let credits: number | string;

    if (planType === 'pro') {
      const selectedPlan = PRO_PLANS[planIndex];
      if (!selectedPlan) {
        console.error('Invalid plan selection:', { planIndex, availablePlans: PRO_PLANS.length });
        return NextResponse.json({ error: 'Invalid plan selection' }, { status: 400 });
      }
      
      priceId = selectedPlan.priceId;
      credits = selectedPlan.credits;
      console.log('Selected PRO plan:', selectedPlan);
    } else if (planType === 'enterprise') {
      priceId = ENTERPRISE_PLAN.priceId;
      credits = ENTERPRISE_PLAN.credits;
      console.log('Selected ENTERPRISE plan:', ENTERPRISE_PLAN);
    } else {
      console.error('Invalid plan type:', planType);
      return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 });
    }

    // Create Stripe checkout session
    console.log('Creating Stripe session with priceId:', priceId);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/?upgraded=true&plan=${planType}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing?canceled=true`,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        planType,
        credits: credits.toString(),
      },
    });

    console.log('Stripe session created successfully:', session.id);
    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { 
        error: 'Failed to create checkout session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

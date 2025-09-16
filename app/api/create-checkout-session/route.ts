import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { planType, planIndex } = await request.json();
    
    // Get the current user
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let priceId: string;
    let credits: number | string;

    if (planType === 'pro') {
      const PRO_PLANS = [
        { price: 25, credits: 100, priceId: "price_starter" },
        { price: 75, credits: 300, priceId: "price_creator" },
        { price: 199, credits: 800, priceId: "price_professional" },
        { price: 349, credits: 1500, priceId: "price_studio" },
      ];
      
      const selectedPlan = PRO_PLANS[planIndex];
      if (!selectedPlan) {
        return NextResponse.json({ error: 'Invalid plan selection' }, { status: 400 });
      }
      
      priceId = selectedPlan.priceId;
      credits = selectedPlan.credits;
    } else if (planType === 'enterprise') {
      priceId = "price_enterprise";
      credits = "unlimited";
    } else {
      return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard?success=true&plan=${planType}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing?canceled=true`,
      customer_email: user.email,
      metadata: {
        userId: user.id,
        planType,
        credits: credits.toString(),
      },
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

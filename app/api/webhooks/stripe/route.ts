import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createClient } from '@/utils/supabase/server';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const planType = session.metadata?.planType;
        const credits = session.metadata?.credits;

        if (!userId || !planType || !credits) {
          console.error('Missing metadata in checkout session:', session.metadata);
          return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
        }

        // Update user's plan and credits in Supabase
        const supabase = createClient();
        
        // Update the user's profile with new plan and credits
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            plan: planType === 'pro' ? 'pro' : 'enterprise',
            monthly_base_limit: credits === 'unlimited' ? 999999 : parseInt(credits),
            monthly_used: 0, // Reset usage
            month_start: new Date().toISOString(), // Reset monthly cycle
          })
          .eq('user_id', userId);

        if (updateError) {
          console.error('Error updating user profile:', updateError);
          return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
        }

        console.log(`Updated user ${userId} to ${planType} plan with ${credits} credits`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        
        // Handle subscription updates (plan changes, cancellations, etc.)
        console.log('Subscription updated:', subscription.id);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        
        // Handle subscription cancellation - downgrade to free plan
        const supabase = createClient();
        
        // Find user by customer ID (you might need to store this mapping)
        // For now, we'll need to add customer_id to profiles table
        console.log('Subscription cancelled:', subscription.id);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }
}

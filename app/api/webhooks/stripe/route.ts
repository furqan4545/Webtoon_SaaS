import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createServiceClient } from '@/utils/supabase/server';
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

        // Update user's plan and credits in Supabase using service role (bypasses RLS)
        const supabase = createServiceClient();
        
        // First, get the current profile to append credits
        console.log('🔍 DEBUG: About to update user profile');
        console.log('🔍 User ID:', userId);
        console.log('🔍 Plan Type:', planType);
        console.log('🔍 Credits:', credits);
        
        const { data: currentProfile, error: fetchError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .single();
          
        console.log('🔍 Current profile:', currentProfile);
        
        // Calculate new values (ALWAYS increment credits, never replace)
        const newCredits = credits === 'unlimited' ? 999999 : parseInt(credits);
        const currentMonthlyLimit = currentProfile?.monthly_base_limit || 50;
        const currentBonusCredits = currentProfile?.monthly_bonus_credits || 0;
        const currentLifetimePurchased = currentProfile?.lifetime_credits_purchased || 0;
        
        // SIMPLE CREDIT SYSTEM: Just append credits to monthly_base_limit
        // monthly_base_limit: Add new credits to existing total
        // current_plan_credits: Store the plan's credits for monthly deposits
        // lifetime_credits_purchased: Add new credits to lifetime total
        const newMonthlyLimit = currentMonthlyLimit + newCredits; // ALWAYS ADD to existing credits
        const newLifetimePurchased = currentLifetimePurchased + newCredits; // Always increment lifetime

        const upsertData = {
          user_id: userId,
          plan: planType === 'pro' ? 'pro' : 'enterprise',
          monthly_base_limit: newMonthlyLimit, // Total credits accumulated
          monthly_used: currentProfile?.monthly_used || 0, // Keep current usage
          monthly_bonus_credits: 0, // Ignore bonus credits
          current_plan_credits: newCredits, // Store plan credits for monthly deposits
          lifetime_credits_purchased: newLifetimePurchased,
          month_start: currentProfile?.month_start || new Date().toISOString().split('T')[0],
        };
        
        console.log('🔍 Upsert data (appending credits):', upsertData);
        console.log('🔍 Credit calculation (ALWAYS INCREMENT):', {
          newCredits,
          currentMonthlyLimit,
          currentLifetimePurchased,
          newMonthlyLimit: `${currentMonthlyLimit} + ${newCredits} = ${newMonthlyLimit}`,
          newLifetimePurchased: `${currentLifetimePurchased} + ${newCredits} = ${newLifetimePurchased}`
        });
        
        const { data: upsertResult, error: upsertError } = await supabase
          .from('profiles')
          .upsert(upsertData, { onConflict: 'user_id' })
          .select();
          
        console.log('🔍 Upsert result:', upsertResult);
        console.log('🔍 Upsert error:', upsertError);

        if (upsertError) {
          console.error('❌ Error upserting user profile:', upsertError);
          return NextResponse.json({ error: 'Database upsert failed' }, { status: 500 });
        }

        console.log(`✅ Upserted user ${userId} to ${planType} plan with ${credits} credits`);
        console.log(`📅 Monthly deposit: User will receive ${newCredits} credits every month based on their ${planType} plan`);
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
        const supabase = createServiceClient();
        
        // TODO: We need to store customer_id in profiles table to map back to user
        // For now, just log the cancellation
        console.log('Subscription cancelled:', subscription.id, 'Customer:', customerId);
        console.log('⚠️ Need to implement customer_id mapping to downgrade user to free plan');
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

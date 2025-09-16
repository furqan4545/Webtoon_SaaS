import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { stripe } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // First, get user's current profile to find their Stripe customer ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching user profile:', profileError);
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // TODO: We need to store Stripe customer_id in profiles table
    // For now, we'll search for the customer by email
    const customers = await stripe.customers.list({
      email: user.email!,
      limit: 1,
    });

    if (customers.data.length === 0) {
      console.error('No Stripe customer found for user:', user.email);
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    const customer = customers.data[0];

    // Get active subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      console.error('No active subscription found for customer:', customer.id);
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    const subscription = subscriptions.data[0];

    // Cancel the Stripe subscription
    const canceledSubscription = await stripe.subscriptions.cancel(subscription.id);
    console.log('✅ Stripe subscription canceled:', canceledSubscription.id);

    // Update user's profile to free plan
    const { data: updateResult, error: updateError } = await supabase
      .from('profiles')
      .update({
        plan: 'free',
        current_plan_credits: 50, // Free tier gets 50 credits per month
        // Keep existing monthly_base_limit (don't touch their accumulated credits)
        // Keep existing monthly_used, lifetime_credits_purchased, etc.
      })
      .eq('user_id', user.id)
      .select();

    if (updateError) {
      console.error('Error updating profile to free plan:', updateError);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    console.log(`✅ User ${user.id} moved to free plan. Credits preserved: ${updateResult?.[0]?.monthly_base_limit || 0}`);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Successfully canceled subscription and moved to free plan. Your credits have been preserved.',
      credits: updateResult?.[0]?.monthly_base_limit || 0
    });

  } catch (error) {
    console.error('Error canceling subscription:', error);
    return NextResponse.json(
      { 
        error: 'Failed to cancel subscription',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

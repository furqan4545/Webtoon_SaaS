import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/utils/supabase/server';

// This endpoint should be called monthly via a cron job
// It deposits credits to all active subscribers based on their plan
export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron job call (add your own auth logic)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceClient();
    
    // Get all users with paid plans
    const { data: profiles, error: fetchError } = await supabase
      .from('profiles')
      .select('user_id, plan, monthly_base_limit, current_plan_credits, lifetime_credits_purchased')
      .in('plan', ['pro', 'enterprise']);
      
    if (fetchError) {
      console.error('Error fetching profiles:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
    }

    console.log(`🔄 Processing monthly deposit for ${profiles?.length || 0} users`);

    const results = [];
    
    for (const profile of profiles || []) {
      try {
        // Calculate monthly credits based on current plan
        let monthlyCredits = 0;
        if (profile.plan === 'pro') {
          monthlyCredits = profile.current_plan_credits || 0;
        } else if (profile.plan === 'enterprise') {
          monthlyCredits = 999999; // Unlimited
        }

        // Add monthly credits to total credits
        const newMonthlyLimit = (profile.monthly_base_limit || 0) + monthlyCredits;
        const newLifetimePurchased = (profile.lifetime_credits_purchased || 0) + monthlyCredits;

        // Update the profile
        const { data: updateResult, error: updateError } = await supabase
          .from('profiles')
          .update({
            monthly_base_limit: newMonthlyLimit,
            lifetime_credits_purchased: newLifetimePurchased,
            month_start: new Date().toISOString().split('T')[0], // Reset month start
            monthly_used: 0, // Reset monthly usage
          })
          .eq('user_id', profile.user_id)
          .select();

        if (updateError) {
          console.error(`Error updating user ${profile.user_id}:`, updateError);
          results.push({ userId: profile.user_id, success: false, error: updateError.message });
        } else {
          console.log(`✅ Deposited ${monthlyCredits} credits to user ${profile.user_id} (${profile.plan} plan)`);
          results.push({ 
            userId: profile.user_id, 
            success: true, 
            creditsDeposited: monthlyCredits,
            plan: profile.plan 
          });
        }
      } catch (error) {
        console.error(`Error processing user ${profile.user_id}:`, error);
        results.push({ userId: profile.user_id, success: false, error: 'Processing error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`📊 Monthly deposit completed: ${successCount} successful, ${failureCount} failed`);

    return NextResponse.json({
      success: true,
      message: `Monthly deposit completed for ${profiles?.length || 0} users`,
      results: {
        total: profiles?.length || 0,
        successful: successCount,
        failed: failureCount,
        details: results
      }
    });

  } catch (error) {
    console.error('Error in monthly deposit:', error);
    return NextResponse.json(
      { error: 'Monthly deposit failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

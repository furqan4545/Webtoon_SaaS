"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { loadStripe } from '@stripe/stripe-js';
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";
import CreditSlider from "@/components/CreditSlider";

const PRO_PLANS = [
  { price: 25, credits: 100, label: "Starter" },
  { price: 75, credits: 300, label: "Creator" },
  { price: 199, credits: 1000, label: "Professional" },
  { price: 349, credits: 2000, label: "Studio" },
];

const PRO_FEATURES = [
  "50+ virtual models",
  "Unlimited art style presets",
  "4K resolution exports",
  "Access to bleeding-edge AI models",
  "No webtoon AI watermark",
  "Priority email support",
];

const ENTERPRISE_FEATURES = [
  "Dedicated AI model training",
  "Team collaboration (10+ seats)",
  "API access",
  "Custom watermark designs",
  "Carbon-neutral AI badge",
  "Enterprise SSO",
  "24/7 VIP support",
];

export default function ManageAccountPage() {
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const [currentPlanCredits, setCurrentPlanCredits] = useState<number>(50);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [showUnsubscribeConfirm, setShowUnsubscribeConfirm] = useState(false);
  const supabase = createClient();
  
  const selectedPlan = PRO_PLANS[selectedPlanIndex];

  // Helper functions to check if plan is different
  const isProPlanDifferent = () => {
    if (currentPlan !== 'pro') return true; // If not on PRO, any PRO selection is different
    return selectedPlan.credits !== currentPlanCredits; // If on PRO, check if credits are different
  };

  const isEnterprisePlanDifferent = () => {
    return currentPlan !== 'enterprise'; // Enterprise is different if not currently on enterprise
  };

  useEffect(() => {
    const loadUserProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('plan, monthly_base_limit, current_plan_credits, lifetime_credits_purchased')
            .eq('user_id', user.id)
            .single();
          
          if (profile) {
            setCurrentPlan(profile.plan || 'free');
            
            // Set current plan credits and slider position
            if (profile.plan === 'pro') {
              const planCredits = profile.current_plan_credits || 100;
              setCurrentPlanCredits(planCredits);
              
              // Find the plan that matches the current plan credits
              const planIndex = PRO_PLANS.findIndex(plan => plan.credits === planCredits);
              if (planIndex !== -1) {
                setSelectedPlanIndex(planIndex);
              }
            } else if (profile.plan === 'enterprise') {
              setCurrentPlanCredits(999999); // Unlimited
            } else {
              setCurrentPlanCredits(50); // Free plan
            }
          }
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadUserProfile();
  }, [supabase]);

  const handleSliderChange = (value: number) => {
    setSelectedPlanIndex(value);
  };

  const handlePlanUpdate = async (planType: 'pro' | 'enterprise') => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planType,
          planIndex: planType === 'pro' ? selectedPlanIndex : 0,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
      if (stripe) {
        const { error } = await stripe.redirectToCheckout({
          sessionId: data.sessionId,
        });

        if (error) {
          throw new Error(error.message);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to update plan. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel subscription');
      }

      toast.success('Successfully unsubscribed! You have been moved to the free plan.');
      setCurrentPlan('free');
      setCurrentPlanCredits(50);
      setShowUnsubscribeConfirm(false);
      
      // Refresh the page to update the UI
      window.location.reload();
    } catch (error) {
      console.error('Error unsubscribing:', error);
      toast.error('Failed to unsubscribe. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-900 via-black to-neutral-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 via-black to-neutral-900">
      
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            Manage Your Account
          </h1>
          <p className="text-xl text-white/70 max-w-2xl mx-auto">
            Update your subscription plan or manage your account settings
          </p>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full">
            <span className="text-white/70">Current Plan:</span>
            <span className="text-fuchsia-400 font-semibold uppercase">{currentPlan}</span>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* PRO Plan Card */}
          <Card className={`bg-neutral-900/80 border-white/10 backdrop-blur-sm flex flex-col h-full relative ${
            currentPlan === 'pro' ? 'ring-2 ring-fuchsia-500' : ''
          }`}>
            {currentPlan === 'pro' && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <div className="bg-fuchsia-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                  Current Plan
                </div>
              </div>
            )}
            
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold text-white">PRO</CardTitle>
              <CardDescription className="text-white/70">
                best for webtoon artists and creatives
              </CardDescription>
              
              {/* Dynamic Pricing */}
              <div className="mt-6">
                <div className="text-4xl font-bold text-fuchsia-500 mb-2">
                  ${selectedPlan.price}
                  <span className="text-lg text-white/70 font-normal">/month</span>
                </div>
                <p className="text-white/70 text-sm">{selectedPlan.credits} credits/month</p>
              </div>

              {/* Credit Slider */}
              <div className="mt-6">
                <CreditSlider
                  value={selectedPlanIndex}
                  onChange={handleSliderChange}
                  min={0}
                  max={PRO_PLANS.length - 1}
                  step={1}
                  plans={PRO_PLANS}
                />
              </div>
            </CardHeader>

            <CardContent className="flex flex-col flex-1 mt-8">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wide">
                  Features Included:
                </h3>
                <ul className="space-y-3">
                  {PRO_FEATURES.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3 text-white/90">
                      <Check className="h-4 w-4 text-fuchsia-500 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <Button
                onClick={() => handlePlanUpdate('pro')}
                disabled={isLoading || !isProPlanDifferent()}
                className="w-full h-12 bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-400 hover:to-indigo-400 text-white font-medium rounded-lg disabled:opacity-50 mt-6"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : !isProPlanDifferent() ? (
                  'Current Plan'
                ) : (
                  'Update Plan'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* ENTERPRISE Plan Card */}
          <Card className={`bg-neutral-900/80 border-white/10 backdrop-blur-sm flex flex-col h-full relative ${
            currentPlan === 'enterprise' ? 'ring-2 ring-fuchsia-500' : ''
          }`}>
            {currentPlan === 'enterprise' && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <div className="bg-fuchsia-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                  Current Plan
                </div>
              </div>
            )}
            
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold text-white">ENTERPRISE</CardTitle>
              <CardDescription className="text-white/70">
                best for studios and high-volume webtoon artists
              </CardDescription>
              
              <div className="mt-6">
                <div className="text-4xl font-bold text-fuchsia-500 mb-2">
                  $899
                  <span className="text-lg text-white/70 font-normal">/month</span>
                </div>
                <p className="text-white/70 text-sm">Unlimited credits</p>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col flex-1">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-4 text-sm uppercase tracking-wide">
                  Features Included:
                </h3>
                <ul className="space-y-3">
                  {ENTERPRISE_FEATURES.map((feature, index) => (
                    <li key={index} className="flex items-center gap-3 text-white/90">
                      <Check className="h-4 w-4 text-fuchsia-500 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <Button
                onClick={() => handlePlanUpdate('enterprise')}
                disabled={isLoading || !isEnterprisePlanDifferent()}
                className="w-full h-12 bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-400 hover:to-indigo-400 text-white font-medium rounded-lg disabled:opacity-50 mt-6"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : !isEnterprisePlanDifferent() ? (
                  'Current Plan'
                ) : (
                  'Update to Enterprise'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Unsubscribe Section */}
        {currentPlan !== 'free' && (
          <div className="max-w-2xl mx-auto mt-16">
            <Card className="bg-red-900/20 border-red-500/20 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-red-400 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Cancel Subscription
                </CardTitle>
                <CardDescription className="text-red-300/70">
                  Cancel your subscription and return to the free plan. Your credits will be preserved.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!showUnsubscribeConfirm ? (
                  <Button
                    onClick={() => setShowUnsubscribeConfirm(true)}
                    variant="destructive"
                    className="w-full"
                  >
                    Cancel Subscription
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <p className="text-red-300 text-sm">
                      Are you sure you want to cancel your subscription? You will be moved to the free plan.
                    </p>
                    <div className="flex gap-3">
                      <Button
                        onClick={handleUnsubscribe}
                        disabled={isLoading}
                        variant="destructive"
                        className="flex-1"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Canceling...
                          </>
                        ) : (
                          'Yes, Cancel Subscription'
                        )}
                      </Button>
                      <Button
                        onClick={() => setShowUnsubscribeConfirm(false)}
                        variant="outline"
                        className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                      >
                        Keep Subscription
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Additional Info */}
        <div className="text-center mt-16">
          <p className="text-white/50 text-sm">
            All plan changes take effect immediately. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}

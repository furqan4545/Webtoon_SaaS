"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Check, Loader2 } from "lucide-react";
import { loadStripe } from '@stripe/stripe-js';

const PRO_PLANS = [
  { price: 25, credits: 100, label: "Starter" },
  { price: 75, credits: 300, label: "Creator" },
  { price: 199, credits: 800, label: "Professional" },
  { price: 349, credits: 1500, label: "Studio" },
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

export default function PricingPage() {
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const selectedPlan = PRO_PLANS[selectedPlanIndex];

  const handleSliderChange = (value: number[]) => {
    setSelectedPlanIndex(value[0]);
  };

  const handleProUpgrade = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planType: 'pro',
          planIndex: selectedPlanIndex,
        }),
      });

      const { sessionId } = await response.json();
      
      if (sessionId) {
        const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
        if (stripe) {
          await stripe.redirectToCheckout({ sessionId });
        }
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnterpriseContact = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planType: 'enterprise',
        }),
      });

      const { sessionId } = await response.json();
      
      if (sessionId) {
        const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
        if (stripe) {
          await stripe.redirectToCheckout({ sessionId });
        }
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-900 via-black to-neutral-900">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-white/70 max-w-2xl mx-auto">
            Unlock the full potential of AI-powered webtoon creation with our flexible pricing plans
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* PRO Plan Card */}
          <Card className="bg-neutral-900/80 border-white/10 backdrop-blur-sm">
            <CardHeader className="text-center pb-8">
              <CardTitle className="text-3xl font-bold text-white mb-2">PRO</CardTitle>
              <p className="text-white/70 text-sm">best for webtoon artists and creatives</p>
              
              {/* Dynamic Pricing */}
              <div className="mt-6">
                <div className="text-4xl font-bold text-fuchsia-500 mb-2">
                  ${selectedPlan.price}
                  <span className="text-lg text-white/70 font-normal">/month</span>
                </div>
                <p className="text-white/70 text-sm">{selectedPlan.credits} credits/month</p>
              </div>

              {/* Credit Slider */}
              <div className="mt-6 px-4">
                <div className="mb-4">
                  <Slider
                    value={[selectedPlanIndex]}
                    onValueChange={handleSliderChange}
                    max={PRO_PLANS.length - 1}
                    step={1}
                    className="w-full"
                  />
                </div>
                <div className="flex justify-between text-xs text-white/50">
                  {PRO_PLANS.map((plan, index) => (
                    <div key={index} className="text-center">
                      <div className="w-2 h-2 rounded-full bg-white/30 mx-auto mb-1"></div>
                      <div className="text-xs">${plan.price}</div>
                    </div>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <Button
                onClick={handleProUpgrade}
                disabled={isLoading}
                className="w-full h-12 bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-400 hover:to-indigo-400 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Go Pro'
                )}
              </Button>

              <div>
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
            </CardContent>
          </Card>

          {/* ENTERPRISE Plan Card */}
          <Card className="bg-neutral-900/80 border-white/10 backdrop-blur-sm">
            <CardHeader className="text-center pb-8">
              <CardTitle className="text-3xl font-bold text-white mb-2">ENTERPRISE</CardTitle>
              <p className="text-white/70 text-sm">best for studios and high-volume webtoon artists</p>
              
              <div className="mt-6">
                <div className="text-4xl font-bold text-fuchsia-500 mb-2">
                  $899
                  <span className="text-lg text-white/70 font-normal">/month</span>
                </div>
                <p className="text-white/70 text-sm">Unlimited credits</p>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <Button
                onClick={handleEnterpriseContact}
                disabled={isLoading}
                className="w-full h-12 bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-400 hover:to-indigo-400 text-white font-medium rounded-lg disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Contact our team'
                )}
              </Button>

              <div>
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
            </CardContent>
          </Card>
        </div>

        {/* Additional Info */}
        <div className="text-center mt-16">
          <p className="text-white/50 text-sm">
            All plans include a 14-day free trial. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}

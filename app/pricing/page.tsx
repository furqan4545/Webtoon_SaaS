"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

  const handleSliderChange = (value: number) => {
    setSelectedPlanIndex(value);
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
      <style jsx global>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #d946ef;
          cursor: pointer;
          border: 3px solid #000;
          box-shadow: 0 4px 12px rgba(217, 70, 239, 0.4);
          transition: all 0.2s ease;
        }
        
        .slider-thumb::-webkit-slider-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(217, 70, 239, 0.6);
        }
        
        .slider-thumb::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #d946ef;
          cursor: pointer;
          border: 3px solid #000;
          box-shadow: 0 4px 12px rgba(217, 70, 239, 0.4);
          transition: all 0.2s ease;
        }
        
        .slider-thumb::-moz-range-thumb:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(217, 70, 239, 0.6);
        }
      `}</style>
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
          <Card className="bg-neutral-900/80 border-white/10 backdrop-blur-sm flex flex-col h-full">
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
              <div className="mt-6 space-y-4">
                <div className="px-1">
                  <Slider
                    value={selectedPlanIndex}
                    onChange={handleSliderChange}
                    min={0}
                    max={PRO_PLANS.length - 1}
                    step={1}
                    className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer slider-thumb"
                    style={{
                      background: `linear-gradient(to right, #d946ef 0%, #d946ef ${(selectedPlanIndex / (PRO_PLANS.length - 1)) * 100}%, rgba(255,255,255,0.2) ${(selectedPlanIndex / (PRO_PLANS.length - 1)) * 100}%, rgba(255,255,255,0.2) 100%)`
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-white/60 px-1">
                  {PRO_PLANS.map((plan, index) => (
                    <div key={index} className="text-center flex-1 relative">
                      <div className={`w-3 h-3 rounded-full mx-auto mb-2 transition-all duration-200 ${
                        index === selectedPlanIndex 
                          ? 'bg-fuchsia-500 scale-110 shadow-lg shadow-fuchsia-500/30' 
                          : 'bg-white/40 hover:bg-white/60'
                      }`}></div>
                      <div className={`text-xs font-medium transition-colors duration-200 ${
                        index === selectedPlanIndex ? 'text-fuchsia-400' : 'text-white/60'
                      }`}>
                        ${plan.price}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col flex-1">
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
                onClick={handleProUpgrade}
                disabled={isLoading}
                className="w-full h-12 bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-400 hover:to-indigo-400 text-white font-medium rounded-lg disabled:opacity-50 mt-6"
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
            </CardContent>
          </Card>

          {/* ENTERPRISE Plan Card */}
          <Card className="bg-neutral-900/80 border-white/10 backdrop-blur-sm flex flex-col h-full">
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
                onClick={handleEnterpriseContact}
                disabled={isLoading}
                className="w-full h-12 bg-gradient-to-r from-fuchsia-500 to-indigo-500 hover:from-fuchsia-400 hover:to-indigo-400 text-white font-medium rounded-lg disabled:opacity-50 mt-6"
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

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

export const PRO_PLANS = [
  { price: 25, credits: 100, label: "Starter", priceId: "price_starter" },
  { price: 75, credits: 300, label: "Creator", priceId: "price_creator" },
  { price: 199, credits: 800, label: "Professional", priceId: "price_professional" },
  { price: 349, credits: 1500, label: "Studio", priceId: "price_studio" },
];

export const ENTERPRISE_PLAN = {
  price: 899,
  credits: "unlimited",
  label: "Enterprise",
  priceId: "price_enterprise"
};

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  typescript: true,
});

export const PRO_PLANS = [
  { price: 25, credits: 100, label: "Starter", priceId: "price_1S7oIoF2Fxc4hY9ldumtTjlv" },
  { price: 75, credits: 300, label: "Creator", priceId: "price_1S7oJNF2Fxc4hY9lru05LO0f" },
  { price: 199, credits: 1000, label: "Professional", priceId: "price_1S7oK2F2Fxc4hY9lNdqfSi00" },
  { price: 349, credits: 2000, label: "Studio", priceId: "price_1S7oKRF2Fxc4hY9l7KQSsgk0" },
];

export const ENTERPRISE_PLAN = {
  price: 899,
  credits: "unlimited",
  label: "Enterprise",
  priceId: "price_1S7oSCF2Fxc4hY9lgyMriF31"
};

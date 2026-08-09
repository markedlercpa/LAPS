import Stripe from "stripe";

/**
 * True when Stripe is configured. When false the app runs "sign-only": proposals
 * can still be signed, no deposit is collected. Mirrors graphConfigured().
 */
export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let _stripe: Stripe | null = null;

/** Lazy Stripe client. Returns null when no secret key is configured. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

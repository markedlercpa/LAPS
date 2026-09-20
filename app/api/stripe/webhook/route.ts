import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { finalizeDepositPaid } from "@/lib/proposals";

/**
 * Stripe webhook — the reliable backstop for deposit confirmation (covers a
 * client who pays then closes the tab before the success redirect). The
 * success-return `confirmPayment` action covers the common case and works even
 * before this endpoint is configured. Requires STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return new Response("Stripe webhook not configured", { status: 400 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return new Response("Signature verification failed", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await finalizeDepositPaid(session.id);
  }

  return new Response("ok", { status: 200 });
}

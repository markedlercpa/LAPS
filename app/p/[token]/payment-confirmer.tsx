"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { confirmPayment } from "./actions";

/** On return from Stripe Checkout, confirm the deposit then refresh the page. */
export function PaymentConfirmer({
  token,
  sessionId,
}: {
  token: string;
  sessionId: string;
}) {
  const router = useRouter();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    confirmPayment(token, sessionId).then(() => router.refresh());
  }, [token, sessionId, router]);
  return null;
}

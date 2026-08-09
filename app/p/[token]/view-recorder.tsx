"use client";

import { useEffect, useRef } from "react";
import { recordProposalView } from "./actions";

/** Fires once on mount to record that the client opened the proposal. */
export function ViewRecorder({ token }: { token: string }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void recordProposalView(token);
  }, [token]);
  return null;
}

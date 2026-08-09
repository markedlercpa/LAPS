"use client";

import { useEffect, useRef } from "react";
import { recordMagnetViewAction } from "@/app/lm/[slug]/actions";

/**
 * Invisible view beacon. Fires once per page load to record a landing-page view
 * (the conversion denominator). Client-side, so crawlers that don't run JS
 * don't inflate the count; a ref guards against React's double-effect in dev.
 */
export function MagnetView({ slug, source, contentItemId }: { slug: string; source: string | null; contentItemId: string | null }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void recordMagnetViewAction({ slug, source, contentItemId });
  }, [slug, source, contentItemId]);
  return null;
}

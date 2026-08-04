"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export type SegOption = { value: string; label: string };

/**
 * Modernist segmented control synced to a URL search param, so the choice
 * survives refresh and is linkable. Checked state is pure CSS (`.seg-opt:has`).
 */
export function SegToggle({
  param,
  options,
  defaultValue,
}: {
  param: string;
  options: SegOption[];
  defaultValue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param) ?? defaultValue;

  const select = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value === defaultValue) next.delete(param);
      else next.set(param, value);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, param, defaultValue],
  );

  return (
    <div className="seg">
      {options.map((o) => (
        <label key={o.value} className="seg-opt">
          <input
            type="radio"
            name={param}
            checked={current === o.value}
            onChange={() => select(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

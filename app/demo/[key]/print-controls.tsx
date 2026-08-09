"use client";

import { useEffect } from "react";

export function PrintControls({ auto }: { auto: boolean }) {
  useEffect(() => {
    if (auto) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [auto]);
  return (
    <button className="btn btn-secondary no-print" onClick={() => window.print()}>
      Download PDF
    </button>
  );
}

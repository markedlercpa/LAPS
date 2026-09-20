"use client";

export function PrintButton() {
  return (
    <button className="btn btn-secondary no-print" onClick={() => window.print()}>
      Print / Save PDF
    </button>
  );
}

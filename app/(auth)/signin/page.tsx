"use client";

import { signIn } from "next-auth/react";

const LAPS_ROWS = [
  { letter: "L", label: "Lead Generation" },
  { letter: "A", label: "Appointments" },
  { letter: "P", label: "Proposals" },
  { letter: "S", label: "Sales Closed" },
];

export default function SignInPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      {/* Poster */}
      <div className="hidden flex-col justify-between bg-accent p-8 text-bg md:flex">
        <div className="font-heading text-[34px] font-extrabold tracking-[-0.03em]">LAPS</div>
        <div>
          <div className="micro-label text-bg/80">Sales Cycle</div>
          <div className="mt-4">
            {LAPS_ROWS.map((r) => (
              <div
                key={r.letter}
                className="grid grid-cols-[28px_1fr] items-baseline gap-2 border-t-2 border-bg pt-3"
              >
                <span className="font-heading text-[15px] font-extrabold">{r.letter}</span>
                <span className="font-heading text-[22px] font-extrabold">{r.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="text-[12px] opacity-80">Edler Zain · internal</div>
      </div>

      {/* Sign-in */}
      <div className="flex items-center justify-center bg-bg p-8">
        <div className="w-full max-w-[400px]">
          <div className="micro-label">Restricted</div>
          <h1 className="mb-2 mt-3">Sign in</h1>
          <p className="text-muted">Use your Microsoft 365 account.</p>

          <button
            className="btn btn-primary btn-block"
            style={{ minHeight: 44 }}
            onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/home" })}
          >
            Sign in with Microsoft 365
          </button>
        </div>
      </div>
    </div>
  );
}

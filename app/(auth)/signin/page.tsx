"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

const DEV_USERS = ["mark@edlerzain.com", "jordan@edlerzain.com", "sam@edlerzain.com"];
const LAPS_ROWS = [
  { letter: "L", label: "Lead Generation" },
  { letter: "A", label: "Appointments" },
  { letter: "P", label: "Proposals" },
  { letter: "S", label: "Sales Closed" },
];

export default function SignInPage() {
  const [email, setEmail] = useState("mark@edlerzain.com");
  const [loading, setLoading] = useState(false);
  const devEnabled = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN !== "false";

  const doDevLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    await signIn("dev-login", { email, callbackUrl: "/pipeline" });
  };

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      {/* Poster */}
      <div className="hidden flex-col justify-between bg-accent p-8 text-bg md:flex">
        <div className="font-heading text-[34px] font-extrabold tracking-[-0.03em]">
          LAPS
        </div>
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
            onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/pipeline" })}
          >
            Sign in with Microsoft 365
          </button>

          {devEnabled && (
            <>
              <div className="my-6 flex items-center gap-3">
                <span className="h-0.5 flex-1 bg-divider" />
                <span className="micro-label">Dev login</span>
                <span className="h-0.5 flex-1 bg-divider" />
              </div>

              <form onSubmit={doDevLogin} className="field space-y-3">
                <div>
                  <label htmlFor="email">Email (seeded user)</label>
                  <input
                    id="email"
                    type="email"
                    className="input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {DEV_USERS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setEmail(u)}
                    >
                      {u.split("@")[0]}
                    </button>
                  ))}
                </div>
                <button type="submit" className="btn btn-secondary btn-block" disabled={loading}>
                  {loading ? "Signing in…" : "Continue"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

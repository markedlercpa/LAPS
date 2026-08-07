import { PageHeader } from "@/components/page-header";
import { getRateCard } from "@/lib/rate-card";
import { RateCardEditor } from "@/components/settings/rate-card-editor";
import { ConnectorSettings } from "@/components/settings/connector-settings";
import { auth } from "@/lib/auth";
import { listMcpTokens } from "@/lib/agent/mcp-auth";

export const dynamic = "force-dynamic";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export default async function SettingsPage() {
  const rows = await getRateCard();
  const session = await auth();
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";
  const tokens = await listMcpTokens();

  return (
    <div>
      <PageHeader
        eyebrow="06 — Settings"
        title="Settings"
        description="Firm configuration used across the app."
      />

      <section>
        <h2 className="mb-1 text-[22px]">Rate card</h2>
        <p className="mb-4 max-w-[60ch] text-muted">
          Standard hourly cost and billing rates by staff level. Every proposal&apos;s scoping
          card defaults its rates from here (overridable per deal). These are illustrative
          starters — set your real rates.
        </p>
        <RateCardEditor
          rows={rows.map((r) => ({ level: r.level, cost: r.cost, bill: r.bill }))}
        />
      </section>

      <section className="mt-10 border-t-2 border-divider pt-8">
        <h2 className="mb-1 text-[22px]">Claude connector (MCP)</h2>
        <p className="mb-4 max-w-[60ch] text-muted">
          Connect Pulse to Claude as a custom connector so you can read and act on your pipeline
          from a Claude chat. Each token acts as one Pulse user; Claude asks you to approve every
          write. Store tokens like passwords — only the hash is kept, and a token is shown once.
        </p>
        <ConnectorSettings
          appUrl={appUrl()}
          isAdmin={isAdmin}
          tokens={tokens.map((t) => ({
            id: t.id,
            name: t.name,
            createdAt: t.createdAt.toISOString(),
            lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
            revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
            user: t.user?.name ?? t.user?.email ?? "—",
          }))}
        />
      </section>
    </div>
  );
}

import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { listBannedPhrases } from "@/lib/echo";
import {
  PILLAR_LABELS,
  CARD_CATEGORY_LABELS,
  CARD_STATUS_LABELS,
} from "@/lib/echo-taxonomy";
import { NewCallingCard } from "@/components/echo/new-calling-card";

export const dynamic = "force-dynamic";

const STATUS_TAG: Record<string, string> = {
  ACTIVE: "tag-accent",
  CANDIDATE: "tag-outline",
  RETIRED: "tag-neutral",
};

export default async function CallingCardsPage() {
  const [cards, banned] = await Promise.all([
    prisma.callingCard.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 300 }),
    listBannedPhrases(),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="ECHO — Calling Cards"
        title="Calling card bank"
        description="Repeatable, ownable language. Every published piece should carry at least one active card."
      >
        <NewCallingCard bannedPhrases={banned.map((b) => b.phrase)} />
      </PageHeader>

      {/* Banned phrases guardrail */}
      <div className="mb-6 border-2 border-divider bg-surface p-3">
        <div className="micro-label">Retired / banned language (never allowed)</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {banned.map((b) => (
            <span key={b.phrase} className="tag tag-neutral line-through" title={b.reason ?? ""}>
              {b.phrase}
            </span>
          ))}
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="border-2 border-divider bg-surface p-8 text-center text-muted">
          No calling cards yet. Add the language you want to own.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {cards.map((c) => (
            <div key={c.id} className="border border-divider bg-bg p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`tag ${STATUS_TAG[c.status] ?? "tag-outline"}`}>
                  {CARD_STATUS_LABELS[c.status]}
                </span>
                <span className="tag tag-outline">{CARD_CATEGORY_LABELS[c.category]}</span>
              </div>
              <p className="mt-2 text-[16px] leading-relaxed">“{c.cardText}”</p>
              {c.pillarTags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {c.pillarTags.map((p) => (
                    <span key={p} className="tag tag-outline text-[11px]">{PILLAR_LABELS[p]}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

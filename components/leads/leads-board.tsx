import Link from "next/link";
import type { Stage } from "@prisma/client";
import { STAGE_LABELS } from "@/lib/constants";
import { TrustBadge } from "@/components/leads/trust-badge";
import { cn, initials } from "@/lib/utils";

export type BoardLead = {
  id: string;
  stage: Stage;
  firstName: string;
  lastName: string;
  companyName: string | null;
  leadSource: string | null;
  ownerName: string;
  trustScore: number;
};

const STAGE_ORDER: Stage[] = ["NEW", "APPOINTMENT", "PROPOSAL", "CLOSED_WON", "CLOSED_LOST"];

const HEAD_TONE: Record<Stage, string> = {
  NEW: "text-neutral-700",
  APPOINTMENT: "text-ink",
  PROPOSAL: "text-ink",
  CLOSED_WON: "text-accent-700",
  CLOSED_LOST: "text-neutral-700",
};

export function LeadsBoard({ leads }: { leads: BoardLead[] }) {
  return (
    <div className="grid grid-cols-5 border-t-2 border-divider max-lg:grid-cols-3 max-sm:grid-cols-1">
      {STAGE_ORDER.map((stage) => {
        const items = leads.filter((l) => l.stage === stage);
        return (
          <div
            key={stage}
            className="min-h-[440px] border-r border-divider px-3 pb-6 pt-4 last:border-r-0"
          >
            <div className="flex items-baseline justify-between border-b-2 border-divider pb-2">
              <span className={cn("micro-label", HEAD_TONE[stage])}>
                {STAGE_LABELS[stage]}
              </span>
              <span className="font-heading text-[13px] font-extrabold">{items.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {items.map((l) => (
                <Link key={l.id} href={`/leads/${l.id}`} className="card block no-underline">
                  <div className="card-title text-ink">
                    {l.companyName ?? `${l.firstName} ${l.lastName}`}
                  </div>
                  <div className="card-body text-ink">
                    {l.firstName} {l.lastName}
                  </div>
                  <div className="card-meta justify-between">
                    <span>{l.leadSource ?? "—"}</span>
                    <span className="flex items-center gap-1.5">
                      {l.trustScore > 0 && <TrustBadge score={l.trustScore} showScore={false} />}
                      {initials(l.ownerName)}
                    </span>
                  </div>
                </Link>
              ))}
              {items.length === 0 && (
                <p className="text-[13px] text-muted">—</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import type { Prisma, QoOPillar, EvidenceType } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import {
  PILLARS,
  PILLAR_LABELS,
  EVIDENCE_TYPES,
  EVIDENCE_TYPE_LABELS,
  EVIDENCE_SOURCE_LABELS,
  CONSENT_LABELS,
} from "@/lib/echo-taxonomy";
import { NewEvidence } from "@/components/echo/new-evidence";
import { FirefliesImport } from "@/components/echo/fireflies-import";
import { firefliesConfigured } from "@/lib/fireflies";

export const dynamic = "force-dynamic";

export default async function EvidenceVaultPage({
  searchParams,
}: {
  searchParams: Promise<{ pillar?: string; type?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const pillar = PILLARS.includes(sp.pillar as QoOPillar) ? (sp.pillar as QoOPillar) : undefined;
  const type = EVIDENCE_TYPES.includes(sp.type as EvidenceType)
    ? (sp.type as EvidenceType)
    : undefined;
  const q = sp.q?.trim();

  const where: Prisma.EvidenceRecordWhereInput = {
    ...(pillar ? { pillarTags: { has: pillar } } : {}),
    ...(type ? { type } : {}),
    ...(q
      ? {
          OR: [
            { rawText: { contains: q, mode: "insensitive" } },
            { distilled: { contains: q, mode: "insensitive" } },
            { clientRef: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const records = await prisma.evidenceRecord.findMany({
    where,
    orderBy: [{ strength: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  return (
    <div>
      <PageHeader
        eyebrow="ECHO — Evidence"
        title="Evidence vault"
        description="The foundation. Every piece of content must trace back to at least one record here."
      >
        {firefliesConfigured() && <FirefliesImport />}
        <NewEvidence />
      </PageHeader>

      {/* Filters */}
      <form className="mb-6 flex flex-wrap items-end gap-2" method="get">
        <div className="field">
          <label>Pillar</label>
          <select name="pillar" className="input" defaultValue={pillar ?? ""}>
            <option value="">All pillars</option>
            {PILLARS.map((p) => (
              <option key={p} value={p}>{PILLAR_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Type</label>
          <select name="type" className="input" defaultValue={type ?? ""}>
            <option value="">All types</option>
            {EVIDENCE_TYPES.map((t) => (
              <option key={t} value={t}>{EVIDENCE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="field flex-1" style={{ minWidth: 200 }}>
          <label>Search</label>
          <input name="q" className="input" defaultValue={q ?? ""} placeholder="Search text or client…" />
        </div>
        <button className="btn btn-secondary" type="submit">Filter</button>
      </form>

      {records.length === 0 ? (
        <div className="border-2 border-divider bg-surface p-8 text-center text-muted">
          No evidence yet. Capture your first record to seed the vault.
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <div key={r.id} className="border border-divider bg-bg p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tag tag-accent">{EVIDENCE_TYPE_LABELS[r.type]}</span>
                <span className="tag tag-outline">{EVIDENCE_SOURCE_LABELS[r.source]}</span>
                <span className="micro-label">Strength {r.strength}/5</span>
                {r.icpFit && <span className="tag tag-neutral">ICP fit</span>}
                <span className="micro-label ml-auto">{CONSENT_LABELS[r.consent]}</span>
              </div>
              <p className="mt-2 text-[15px] leading-relaxed">
                {r.distilled || r.rawText}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {r.pillarTags.map((p) => (
                  <span key={p} className="tag tag-outline text-[11px]">{PILLAR_LABELS[p]}</span>
                ))}
                <span className="micro-label ml-auto text-neutral-500">
                  {r.clientRef ? `${r.clientRef} · ` : ""}
                  {formatDate(r.createdAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

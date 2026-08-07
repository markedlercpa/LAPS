import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { MicroLabel } from "@/components/micro-label";
import { StageControl } from "@/components/staple/stage-control";
import { InfoRegistry, type InfoRow } from "@/components/staple/info-registry";
import { gateFor } from "@/lib/staple/gates";
import { nextStage, STAGE_LABELS, serviceLineLabel, INFO_STATUS_LABELS, INFO_SOURCE_LABELS, OWNER_SIDE_LABELS } from "@/lib/staple-taxonomy";
import { storageConfigured } from "@/lib/staple/storage";
import { formatDate, formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type HandoffSummary = { sold?: string[]; promised?: string[]; know?: string[]; have?: string[] };

export default async function EngagementDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const engagement = await prisma.engagement.findUnique({
    where: { id },
    include: {
      client: true,
      terms: { orderBy: { version: "desc" } },
      infoItems: { orderBy: { createdAt: "asc" } },
      files: { orderBy: { createdAt: "desc" } },
      transitions: { orderBy: { at: "desc" }, take: 10 },
    },
  });
  if (!engagement) notFound();

  const next = nextStage(engagement.stage);
  const gate = next ? gateFor(engagement, next) : { ok: false, reasons: ["Final stage."] };
  const terms = engagement.terms[0] ?? null;
  const summary = (engagement.handoffSummary ?? {}) as HandoffSummary;

  const infoRows: InfoRow[] = engagement.infoItems.map((i) => ({
    id: i.id,
    label: i.label,
    status: i.status,
    statusLabel: INFO_STATUS_LABELS[i.status],
    source: INFO_SOURCE_LABELS[i.source],
    ownerSide: OWNER_SIDE_LABELS[i.ownerSide],
  }));

  return (
    <div>
      <Link href="/staple/engagements" className="btn btn-ghost mb-4 -ml-1">
        <ArrowLeft className="h-4 w-4" /> Back to engagements
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1">{engagement.client.legalName}</h1>
          <p className="mb-0 flex items-center gap-1.5 text-muted">
            <Building2 className="h-4 w-4" />
            {serviceLineLabel(engagement.serviceLine)}
            <span className="tag tag-outline ml-2">{STAGE_LABELS[engagement.stage]}</span>
          </p>
        </div>
        <StageControl
          engagementId={engagement.id}
          stageLabel={STAGE_LABELS[engagement.stage]}
          nextStage={next}
          nextStageLabel={next ? STAGE_LABELS[next] : null}
          accepted={engagement.accepted}
          gateOk={gate.ok}
          gateReasons={gate.reasons}
        />
      </div>

      <div className="grid grid-cols-[360px_1fr] gap-8 border-t-2 border-divider pt-6 max-lg:grid-cols-1">
        {/* Left: handoff summary + terms */}
        <div className="space-y-6">
          <div>
            <MicroLabel>Handoff summary</MicroLabel>
            <div className="mt-2 space-y-3 text-[13px]">
              {(["sold", "promised", "know", "have"] as const).map((k) => (
                <div key={k}>
                  <div className="micro-label">{k === "sold" ? "What we sold" : k === "promised" ? "What we promised" : k === "know" ? "What we know" : "What we have"}</div>
                  {summary[k]?.length ? (
                    <ul className="mt-1 list-disc pl-4">
                      {summary[k]!.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-muted">—</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <MicroLabel>Terms {terms ? `(v${terms.version})` : ""}</MicroLabel>
            {terms ? (
              <dl className="mt-2">
                <Row k="Title" v={terms.title ?? "—"} />
                <Row k="Fee" v={terms.fee != null ? formatCurrency(Number(terms.fee)) : "—"} />
                <Row k="Confirmed" v={terms.mutuallyAgreed ? "Yes" : "Not yet (Takeoff)"} />
                {terms.scopeNarrative && (
                  <div className="border-b border-divider py-2.5">
                    <dt className="micro-label">Scope</dt>
                    <dd className="m-0 mt-1 whitespace-pre-wrap text-[13px]">{terms.scopeNarrative}</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-2 text-[13px] text-muted">No terms recorded.</p>
            )}
            {engagement.terms.length > 1 && (
              <p className="mt-1 text-[12px] text-muted">{engagement.terms.length} versions</p>
            )}
          </div>

          <div>
            <MicroLabel>Stage history</MicroLabel>
            {engagement.transitions.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">No transitions yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-[13px]">
                {engagement.transitions.map((t) => (
                  <li key={t.id} className="flex justify-between border-b border-divider py-1.5">
                    <span>{t.fromStage ? `${STAGE_LABELS[t.fromStage]} → ` : ""}{STAGE_LABELS[t.toStage]}</span>
                    <span className="micro-label text-neutral-500">{formatDate(t.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: information registry + files */}
        <div className="space-y-6">
          <InfoRegistry engagementId={engagement.id} clientId={engagement.clientId} rows={infoRows} />

          <div>
            <MicroLabel>Files ({engagement.files.length})</MicroLabel>
            {!storageConfigured() && (
              <p className="mt-2 text-[12px] text-accent-700">
                File storage not configured — records are metadata-only until S3 credentials are set.
              </p>
            )}
            {engagement.files.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">No files yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {engagement.files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between border-b border-divider py-2 text-[14px]">
                    <span>{f.name}</span>
                    <span className="micro-label text-neutral-500">v{f.version}{f.storageKey ? "" : " · metadata"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 border-b border-divider py-2.5">
      <dt className="micro-label">{k}</dt>
      <dd className="m-0 text-[13px]">{v}</dd>
    </div>
  );
}

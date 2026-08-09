import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { MagnetEditor } from "@/components/leadmagnets/magnet-editor";
import { QuizBuilder } from "@/components/leadmagnets/quiz-builder";
import { AuditBuilder } from "@/components/leadmagnets/audit-builder";
import { CalculatorBuilder } from "@/components/leadmagnets/calculator-builder";
import { SnapshotBuilder } from "@/components/leadmagnets/snapshot-builder";
import { getMagnet, magnetSubmissions, linkedContent } from "@/lib/leadmagnets/magnets";
import { storageConfigured } from "@/lib/staple/storage";
import { KIND_LABELS, type LeadMagnetKindKey } from "@/lib/leadmagnets/taxonomy";

export const dynamic = "force-dynamic";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
}

export default async function LeadMagnetDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const magnet = await getMagnet(id);
  if (!magnet) notFound();

  const [subs, content] = await Promise.all([magnetSubmissions(id), linkedContent(id)]);
  const leadCount = new Set(subs.map((s) => s.leadId).filter(Boolean)).size;
  const publicUrl = `${appUrl()}/lm/${magnet.slug}`;

  return (
    <div>
      <PageHeader
        eyebrow={KIND_LABELS[magnet.kind as LeadMagnetKindKey] ?? magnet.kind}
        title={magnet.title}
        description="Edit the landing page, manage the download, and see the leads it’s generating."
      >
        <Link href="/marketing/lead-magnets" className="btn btn-secondary">All magnets</Link>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <MagnetEditor
          m={{
            id: magnet.id, slug: magnet.slug, kind: magnet.kind, status: magnet.status,
            title: magnet.title, headline: magnet.headline, subhead: magnet.subhead, body: magnet.body,
            ctaLabel: magnet.ctaLabel, baseScore: magnet.baseScore, downloadUrl: magnet.downloadUrl,
            deliverByEmail: magnet.deliverByEmail, fileName: magnet.fileName, storageConfigured: storageConfigured(),
          }}
          publicUrl={publicUrl}
        />

        <div className="space-y-6">
          {magnet.kind === "QUIZ" && <QuizBuilder magnetId={magnet.id} initial={magnet.config} />}
          {magnet.kind === "AUDIT_CALL" && <AuditBuilder magnetId={magnet.id} initial={magnet.config} />}
          {magnet.kind === "CALCULATOR" && <CalculatorBuilder magnetId={magnet.id} initial={magnet.config} />}
          {magnet.kind === "QBO_SNAPSHOT" && <SnapshotBuilder magnetId={magnet.id} initial={magnet.config} />}
          {/* Attribution / performance */}
          <div className="card p-4">
            <div className="micro-label mb-2">Performance</div>
            <div className="flex gap-6">
              <div><div className="font-heading text-2xl font-extrabold">{subs.length}</div><div className="text-[12px] text-muted">Submissions</div></div>
              <div><div className="font-heading text-2xl font-extrabold">{leadCount}</div><div className="text-[12px] text-muted">Leads created</div></div>
            </div>
          </div>

          {/* Content that CTAs here (Content → magnet bridge) */}
          <div className="card p-4">
            <div className="micro-label mb-2">Linked content</div>
            {content.length === 0 ? (
              <p className="text-[13px] text-muted">No content CTAs to this magnet yet. Set its “CTA magnet” on a post in Content Builder.</p>
            ) : (
              <ul className="space-y-1 text-[13px]">
                {content.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <Link href={`/marketing/content?item=${c.id}`} className="text-accent-700">{c.title}</Link>
                    <span className="tag tag-neutral">{c.channel}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent submissions */}
          <div className="card p-4">
            <div className="micro-label mb-2">Recent submissions</div>
            {subs.length === 0 ? (
              <p className="text-[13px] text-muted">No submissions yet.</p>
            ) : (
              <table className="table text-[13px]">
                <thead><tr><th>Email</th><th>Lead</th><th className="num">Score</th></tr></thead>
                <tbody>
                  {subs.slice(0, 25).map((s) => (
                    <tr key={s.id}>
                      <td>{s.email}</td>
                      <td>{s.lead ? <Link href={`/leads/${s.lead.id}`} className="text-accent-700">{s.lead.firstName} {s.lead.lastName}</Link> : <span className="text-muted">—</span>}</td>
                      <td className="num">+{s.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { ProspectDetail, type TouchRow } from "@/components/prospecting/prospect-detail";
import { PROSPECT_STATUS_LABELS } from "@/components/prospecting/prospects-table";

export const dynamic = "force-dynamic";

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.prospect.findUnique({
    where: { id },
    include: { owner: { select: { name: true, email: true } }, touches: { orderBy: { occurredAt: "desc" } } },
  });
  if (!p) notFound();

  // Dedupe hint: is this email already a Lead in the CRM pipeline?
  const dup = p.email
    ? await prisma.lead.findFirst({ where: { email: { equals: p.email, mode: "insensitive" } }, select: { id: true } })
    : null;

  // Resolve touch authors in one query.
  const userIds = [...new Set(p.touches.map((t) => t.byUserId).filter((x): x is string => !!x))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const nameById = new Map(users.map((u) => [u.id, u.name ?? u.email ?? "Someone"]));
  const touches: TouchRow[] = p.touches.map((t) => ({
    id: t.id,
    kind: t.kind,
    body: t.body,
    who: t.byUserId ? nameById.get(t.byUserId) ?? "Someone" : "System",
    occurredAt: t.occurredAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }),
  }));

  return (
    <div>
      <Link href="/prospecting" className="btn btn-ghost mb-4 -ml-1"><ArrowLeft className="h-4 w-4" /> Back to prospecting</Link>
      <PageHeader
        eyebrow={`Dream ${p.tier} · ${PROSPECT_STATUS_LABELS[p.status]}${p.source ? ` · ${p.source}` : ""}`}
        title={p.companyName}
        description="Top-of-funnel research on a cold account. Nothing here touches HubSpot until you promote it to a Lead."
      />
      <ProspectDetail
        p={{
          id: p.id, companyName: p.companyName, contactName: p.contactName, title: p.title, email: p.email, phone: p.phone,
          website: p.website, linkedinUrl: p.linkedinUrl, industry: p.industry, tier: p.tier,
          revenueEstimate: p.revenueEstimate != null ? Number(p.revenueEstimate) : null, headcountEstimate: p.headcountEstimate,
          researchStatus: p.researchStatus, signal: p.signal, fitNotes: p.fitNotes, tags: p.tags, notes: p.notes,
          source: p.source, promotedLeadId: p.promotedLeadId,
        }}
        touches={touches}
        dupLeadId={dup?.id ?? null}
      />
    </div>
  );
}

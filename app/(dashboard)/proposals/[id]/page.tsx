import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { ProposalStatusBadge } from "@/components/status-badge";
import { ProposalEditor } from "@/components/proposals/proposal-editor";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const proposal = await prisma.proposal.findUnique({
    where: { id },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, companyName: true, email: true } },
      owner: { select: { name: true, email: true } },
      lineItems: { orderBy: { sortOrder: "asc" } },
      payments: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!proposal) notFound();

  const client =
    proposal.lead.companyName ??
    `${proposal.lead.firstName} ${proposal.lead.lastName}`;

  const base = (
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
  const shareUrl = proposal.publicToken ? `${base}/p/${proposal.publicToken}` : null;

  return (
    <div>
      <Link href="/proposals">
        <Button variant="ghost" size="sm" className="mb-4 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back to proposals
        </Button>
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{proposal.title}</h1>
            <ProposalStatusBadge status={proposal.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href={`/leads/${proposal.lead.id}`} className="hover:underline">
              {client}
            </Link>{" "}
            · Owner {proposal.owner?.name ?? proposal.owner?.email ?? "—"} · Created{" "}
            {formatDate(proposal.createdAt)}
          </p>
        </div>
      </div>

      <ProposalEditor
        shareUrl={shareUrl}
        proposal={{
          id: proposal.id,
          status: proposal.status,
          estimatedDeliveryCost: Number(proposal.estimatedDeliveryCost),
          coverLetter: proposal.coverLetter,
          scopeNarrative: proposal.scopeNarrative,
          termsText: proposal.termsText,
          paymentScheduleType: proposal.paymentScheduleType,
          recurringInterval: proposal.recurringInterval,
          sentAt: proposal.sentAt?.toISOString() ?? null,
          viewedAt: proposal.viewedAt?.toISOString() ?? null,
          signedAt: proposal.signedAt?.toISOString() ?? null,
          signerName: proposal.signerName,
          leadHasEmail: Boolean(proposal.lead.email),
          lineItems: proposal.lineItems.map((li) => ({
            id: li.id,
            description: li.description,
            quantity: Number(li.quantity),
            unitPrice: Number(li.unitPrice),
          })),
          payments: proposal.payments.map((p) => ({
            id: p.id,
            description: p.description,
            amount: Number(p.amount),
            dueOn: p.dueOn,
          })),
        }}
      />
    </div>
  );
}

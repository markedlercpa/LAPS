import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { MagnetCreate } from "@/components/leadmagnets/magnet-create";
import { listMagnets } from "@/lib/leadmagnets/magnets";
import { KIND_LABELS, STATUS_LABELS, type LeadMagnetKindKey } from "@/lib/leadmagnets/taxonomy";

export const dynamic = "force-dynamic";

export default async function LeadMagnetsPage() {
  const magnets = await listMagnets();

  return (
    <div>
      <PageHeader
        eyebrow="Marketing"
        title="Lead Magnets"
        description="Create, manage, and distribute lead magnets. Content CTAs point here; every download or completion creates and scores a lead."
      />

      <MagnetCreate />

      {magnets.length === 0 ? (
        <p className="text-[14px] text-muted">No lead magnets yet. Create one above — start with an e-book, template, or tool download.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Magnet</th>
                <th>Type</th>
                <th>Status</th>
                <th className="num">Submissions</th>
                <th className="num">Leads</th>
                <th className="num">Score</th>
              </tr>
            </thead>
            <tbody>
              {magnets.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/marketing/lead-magnets/${m.id}`} className="font-heading font-extrabold text-accent-700">{m.title}</Link>
                    <div className="text-[11px] text-muted">/lm/{m.slug}</div>
                  </td>
                  <td className="text-muted">{KIND_LABELS[m.kind as LeadMagnetKindKey] ?? m.kind}</td>
                  <td><span className={`tag ${m.status === "PUBLISHED" ? "tag-accent" : "tag-neutral"}`}>{STATUS_LABELS[m.status]}</span></td>
                  <td className="num">{m.submissions.toLocaleString()}</td>
                  <td className="num">{m.leads.toLocaleString()}</td>
                  <td className="num text-muted">+{m.baseScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

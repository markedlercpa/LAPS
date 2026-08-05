import Link from "next/link";
import { Vault, Megaphone, PenLine, LineChart } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const LAYERS = [
  { letter: "E", name: "Evidence", body: "Real language from calls, engagements, and emails — pains, objections, myths, prize states, and our methodology." },
  { letter: "C", name: "Calling Cards", body: "The repeatable, ownable language bank that etches our understanding into the reader's mind." },
  { letter: "H", name: "Housed Content", body: "The content builder + repurposing engine across every channel — every piece traced to evidence." },
  { letter: "O", name: "Optics", body: "How content performed once published — resonance tracking, aggregated manually for now." },
];

export default async function EchoOverviewPage() {
  const [evidenceCount, cardCount, activeCards, contentCount, publishedCount, snapshotCount] =
    await Promise.all([
      prisma.evidenceRecord.count(),
      prisma.callingCard.count(),
      prisma.callingCard.count({ where: { status: "ACTIVE" } }),
      prisma.contentItem.count(),
      prisma.contentItem.count({ where: { status: "PUBLISHED" } }),
      prisma.metricSnapshot.count(),
    ]);

  return (
    <div>
      <PageHeader
        eyebrow="ECHO — Content engine"
        title="ECHO"
        description="Evidence → Calling Cards → Housed Content → Optics → LAPS. Trust is earned here; LAPS converts it."
      />

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        <Link href="/echo/evidence" className="border-2 border-ink bg-surface p-5 hover:bg-bg">
          <div className="flex items-center gap-2">
            <Vault className="h-5 w-5" />
            <div className="micro-label">Evidence vault</div>
          </div>
          <div className="mt-2 font-heading text-[34px] font-extrabold [font-variant-numeric:tabular-nums]">
            {evidenceCount}
          </div>
          <div className="text-[13px] text-muted">records</div>
        </Link>
        <Link href="/echo/calling-cards" className="border-2 border-ink bg-surface p-5 hover:bg-bg">
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            <div className="micro-label">Calling cards</div>
          </div>
          <div className="mt-2 font-heading text-[34px] font-extrabold [font-variant-numeric:tabular-nums]">
            {cardCount}
          </div>
          <div className="text-[13px] text-muted">{activeCards} active</div>
        </Link>
        <Link href="/echo/content" className="border-2 border-ink bg-surface p-5 hover:bg-bg">
          <div className="flex items-center gap-2">
            <PenLine className="h-5 w-5" />
            <div className="micro-label">Housed content</div>
          </div>
          <div className="mt-2 font-heading text-[34px] font-extrabold [font-variant-numeric:tabular-nums]">
            {contentCount}
          </div>
          <div className="text-[13px] text-muted">{publishedCount} published</div>
        </Link>
        <Link href="/echo/optics" className="border-2 border-ink bg-surface p-5 hover:bg-bg">
          <div className="flex items-center gap-2">
            <LineChart className="h-5 w-5" />
            <div className="micro-label">Optics</div>
          </div>
          <div className="mt-2 font-heading text-[34px] font-extrabold [font-variant-numeric:tabular-nums]">
            {snapshotCount}
          </div>
          <div className="text-[13px] text-muted">snapshots</div>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {LAYERS.map((l) => (
          <div key={l.letter} className="grid grid-cols-[44px_1fr] gap-3 border-t-2 border-divider pt-4">
            <div className="font-heading text-[30px] font-extrabold text-accent">{l.letter}</div>
            <div>
              <div className="font-heading text-[17px] font-extrabold">{l.name}</div>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{l.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

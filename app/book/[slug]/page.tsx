import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Video, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const LOCATION_LABELS: Record<string, string> = {
  ZOOM: "Zoom",
  PHONE: "Phone",
  IN_PERSON: "In person",
  CUSTOM: "Meeting",
};

export default async function BookLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await prisma.bookingHost.findUnique({
    where: { slug },
    include: {
      user: { select: { name: true } },
      eventTypes: { where: { active: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!host || !host.active) notFound();

  const name = host.displayName || host.user?.name || "Book a time";

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 py-12">
      <div className="mb-8 border-b-2 border-divider pb-6">
        <div className="micro-label">Book a meeting</div>
        <h1 className="mt-1">{name}</h1>
        {host.welcome && <p className="mt-2 text-muted">{host.welcome}</p>}
      </div>

      {host.eventTypes.length === 0 ? (
        <p className="text-muted">No meeting types are available right now.</p>
      ) : (
        <div className="space-y-3">
          {host.eventTypes.map((ev) => (
            <Link
              key={ev.id}
              href={`/book/${host.slug}/${ev.slug}`}
              className="group flex items-center justify-between gap-4 border-2 border-divider bg-surface p-5 no-underline hover:border-accent"
            >
              <div className="min-w-0">
                <div className="font-heading text-[19px] font-extrabold text-ink">{ev.name}</div>
                {ev.description && <p className="mt-1 line-clamp-2 text-[14px] text-muted">{ev.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-muted">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{ev.durationMin} min</span>
                  <span className="inline-flex items-center gap-1"><Video className="h-3.5 w-3.5" />{LOCATION_LABELS[ev.locationType] ?? "Meeting"}</span>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0 text-neutral-500 group-hover:text-accent" />
            </Link>
          ))}
        </div>
      )}

      <p className="mt-10 text-center text-[12px] text-neutral-500">Powered by LAPS</p>
    </div>
  );
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureHost } from "@/lib/booking";
import { HostSettings } from "@/components/scheduling/host-settings";
import { AvailabilityEditor } from "@/components/scheduling/availability-editor";
import { EventTypeManager, type EventTypeData } from "@/components/scheduling/event-type-manager";

export const dynamic = "force-dynamic";

async function originFromHeaders(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export default async function SchedulingPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");

  const host = await ensureHost(userId);
  const [rules, events] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { hostId: host.id } }),
    prisma.bookingEventType.findMany({ where: { hostId: host.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const baseUrl = await originFromHeaders();

  const eventData: EventTypeData[] = events.map((e) => ({
    id: e.id,
    slug: e.slug,
    name: e.name,
    description: e.description,
    durationMin: e.durationMin,
    locationType: e.locationType,
    location: e.location,
    bufferBeforeMin: e.bufferBeforeMin,
    bufferAfterMin: e.bufferAfterMin,
    minNoticeMin: e.minNoticeMin,
    rollingDays: e.rollingDays,
    maxPerDay: e.maxPerDay,
    active: e.active,
    questions: Array.isArray(e.questions) ? (e.questions as EventTypeData["questions"]) : [],
  }));

  return (
    <div>
      <PageHeader
        eyebrow="07 — Scheduling"
        title="Scheduling"
        description="Your own booking pages — event types, availability, and a public link to turn leads into booked calls."
      />

      <div className="space-y-6">
        <HostSettings
          host={{
            slug: host.slug,
            displayName: host.displayName,
            timezone: host.timezone,
            zoomLink: host.zoomLink,
            welcome: host.welcome,
            active: host.active,
          }}
          baseUrl={baseUrl}
        />

        <EventTypeManager events={eventData} hostSlug={host.slug} baseUrl={baseUrl} />

        <AvailabilityEditor initial={rules.map((r) => ({ weekday: r.weekday, startMin: r.startMin, endMin: r.endMin }))} />
      </div>
    </div>
  );
}

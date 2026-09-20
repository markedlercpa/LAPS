import {
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  addWeeks,
  addMonths,
  addQuarters,
  format,
  isWithinInterval,
} from "date-fns";
import { prisma } from "@/lib/prisma";
import { daysBetween } from "@/lib/utils";

export type Period = "week" | "month" | "quarter";

type Bucket = {
  key: string;
  label: string;
  start: Date;
  end: Date;
};

/** Selectable pipeline windows (days). */
export const PIPELINE_WINDOWS = [30, 60, 90, 180, 365] as const;

function buildBuckets(period: Period, count: number): Bucket[] {
  const now = new Date();
  const buckets: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    let start: Date;
    let end: Date;
    let label: string;
    if (period === "week") {
      start = startOfWeek(addWeeks(now, -i), { weekStartsOn: 1 });
      end = addWeeks(start, 1);
      label = format(start, "MMM d");
    } else if (period === "month") {
      start = startOfMonth(addMonths(now, -i));
      end = addMonths(start, 1);
      label = format(start, "MMM yyyy");
    } else {
      start = startOfQuarter(addQuarters(now, -i));
      end = addQuarters(start, 1);
      label = `Q${Math.floor(start.getMonth() / 3) + 1} ${format(start, "yyyy")}`;
    }
    buckets.push({ key: `${period}-${i}`, label, start, end });
  }
  return buckets;
}

function inBucket(date: Date | null | undefined, b: Bucket) {
  if (!date) return false;
  return isWithinInterval(date, { start: b.start, end: b.end });
}

export type LapsRow = {
  label: string;
  newLeads: number;
  apptsBooked: number;
  apptsCompleted: number;
  proposalsSent: number;
  dealsWon: number;
  wonValue: number;
};

export function lineItemsTotal(
  items: { quantity: unknown; unitPrice: unknown }[],
): number {
  return items.reduce(
    (sum, li) => sum + Number(li.quantity) * Number(li.unitPrice),
    0,
  );
}

/** Weekly / monthly / quarterly LAPS throughput. */
export async function getLapsPerformance(
  period: Period,
  count = 8,
): Promise<LapsRow[]> {
  const buckets = buildBuckets(period, count);
  const windowStart = buckets[0].start;

  const [leads, appts, proposals] = await Promise.all([
    prisma.lead.findMany({
      where: { createdAt: { gte: windowStart } },
      select: { createdAt: true },
    }),
    prisma.appointment.findMany({
      where: { scheduledAt: { gte: windowStart } },
      select: { scheduledAt: true, status: true },
    }),
    prisma.proposal.findMany({
      where: {},
      select: {
        sentAt: true,
        wonAt: true,
        status: true,
        lineItems: { select: { quantity: true, unitPrice: true } },
      },
    }),
  ]);

  return buckets.map((b) => {
    const wonProposals = proposals.filter(
      (p) => p.status === "WON" && inBucket(p.wonAt, b),
    );
    return {
      label: b.label,
      newLeads: leads.filter((l) => inBucket(l.createdAt, b)).length,
      apptsBooked: appts.filter((a) => inBucket(a.scheduledAt, b)).length,
      apptsCompleted: appts.filter(
        (a) => a.status === "COMPLETED" && inBucket(a.scheduledAt, b),
      ).length,
      proposalsSent: proposals.filter((p) => inBucket(p.sentAt, b)).length,
      dealsWon: wonProposals.length,
      wonValue: wonProposals.reduce(
        (s, p) => s + lineItemsTotal(p.lineItems),
        0,
      ),
    };
  });
}

export type PipelineStageRow = {
  status: string;
  count: number;
  value: number;
};

/** Open pipeline: proposals not yet won/lost, by status, with total value. */
export async function getOpenPipeline(): Promise<{
  rows: PipelineStageRow[];
  totalCount: number;
  totalValue: number;
}> {
  const open = await prisma.proposal.findMany({
    where: { status: { in: ["DRAFT", "SENT", "VIEWED", "SIGNED"] } },
    select: {
      status: true,
      lineItems: { select: { quantity: true, unitPrice: true } },
    },
  });

  const map = new Map<string, PipelineStageRow>();
  for (const p of open) {
    const row = map.get(p.status) ?? { status: p.status, count: 0, value: 0 };
    row.count += 1;
    row.value += lineItemsTotal(p.lineItems);
    map.set(p.status, row);
  }
  const order = ["DRAFT", "SENT", "VIEWED", "SIGNED"];
  const rows = order
    .map((s) => map.get(s))
    .filter((r): r is PipelineStageRow => Boolean(r));

  return {
    rows,
    totalCount: open.length,
    totalValue: rows.reduce((s, r) => s + r.value, 0),
  };
}

export type FunnelRow = {
  letter: string;
  label: string;
  count: number;
  convNote: string;
  tone: "ink" | "n800" | "n600" | "accent";
};

export type PipelineOverview = {
  openValue: number;
  openCount: number;
  wonValue90d: number;
  wonCount90d: number;
  lostCount90d: number;
  winRate: number; // won / (won + lost) over 90d
  avgCycleDays: number | null;
  funnel: FunnelRow[];
};

/** Owner-facing pipeline overview — headline metrics + windowed funnel. Derived. */
export async function getPipelineOverview(windowDays = 90): Promise<PipelineOverview> {
  const start = new Date(Date.now() - windowDays * 86_400_000);

  const [open, leadsCreated, apptsBooked, proposals] = await Promise.all([
    getOpenPipeline(),
    prisma.lead.count({ where: { createdAt: { gte: start } } }),
    prisma.appointment.count({ where: { scheduledAt: { gte: start } } }),
    prisma.proposal.findMany({
      select: {
        status: true,
        sentAt: true,
        wonAt: true,
        lostAt: true,
        lead: { select: { createdAt: true } },
        lineItems: { select: { quantity: true, unitPrice: true } },
      },
    }),
  ]);

  const sent90 = proposals.filter((p) => p.sentAt && p.sentAt >= start);
  const won90 = proposals.filter((p) => p.status === "WON" && p.wonAt && p.wonAt >= start);
  const lost90 = proposals.filter((p) => p.status === "LOST" && p.lostAt && p.lostAt >= start);

  const wonValue90d = won90.reduce((s, p) => s + lineItemsTotal(p.lineItems), 0);
  const cycles = won90
    .filter((p) => p.wonAt && p.lead?.createdAt)
    .map((p) => daysBetween(p.wonAt as Date, p.lead!.createdAt));
  const avgCycleDays =
    cycles.length > 0 ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null;

  const pct = (num: number, den: number) =>
    den > 0 ? `${Math.round((num / den) * 100)}%` : "—";

  const funnel: FunnelRow[] = [
    { letter: "L", label: "Leads created", count: leadsCreated, convNote: "—", tone: "ink" },
    {
      letter: "A",
      label: "Appointments booked",
      count: apptsBooked,
      convNote: `${pct(apptsBooked, leadsCreated)} of leads`,
      tone: "n800",
    },
    {
      letter: "P",
      label: "Proposals sent",
      count: sent90.length,
      convNote: `${pct(sent90.length, apptsBooked)} of appts`,
      tone: "n600",
    },
    {
      letter: "S",
      label: "Closed won",
      count: won90.length,
      convNote: `${pct(won90.length, sent90.length)} of proposals`,
      tone: "accent",
    },
  ];

  return {
    openValue: open.totalValue,
    openCount: open.totalCount,
    wonValue90d,
    wonCount90d: won90.length,
    lostCount90d: lost90.length,
    winRate: won90.length + lost90.length > 0 ? won90.length / (won90.length + lost90.length) : 0,
    avgCycleDays,
    funnel,
  };
}

export type RepRow = {
  repId: string;
  repName: string;
  wonCount: number;
  wonValue: number;
  proposalsCount: number;
  closeRate: number; // won / proposals
  avgCycleDays: number | null; // lead created -> proposal won
};

/** Per-rep performance: closed-won volume, close rate, avg sales cycle.
 * `windowDays` restricts to proposals created in the window; omit for all time. */
export async function getRepReport(windowDays?: number): Promise<RepRow[]> {
  const reps = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
  });

  const proposals = await prisma.proposal.findMany({
    where: windowDays ? { createdAt: { gte: new Date(Date.now() - windowDays * 86_400_000) } } : {},
    select: {
      ownerId: true,
      status: true,
      wonAt: true,
      lead: { select: { createdAt: true } },
      lineItems: { select: { quantity: true, unitPrice: true } },
    },
  });

  return reps
    .map((rep) => {
      const own = proposals.filter((p) => p.ownerId === rep.id);
      const won = own.filter((p) => p.status === "WON");
      const cycles = won
        .filter((p) => p.wonAt && p.lead?.createdAt)
        .map((p) => daysBetween(p.wonAt as Date, p.lead!.createdAt));
      const avgCycleDays =
        cycles.length > 0
          ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length)
          : null;
      return {
        repId: rep.id,
        repName: rep.name ?? rep.email,
        wonCount: won.length,
        wonValue: won.reduce((s, p) => s + lineItemsTotal(p.lineItems), 0),
        proposalsCount: own.length,
        closeRate: own.length > 0 ? won.length / own.length : 0,
        avgCycleDays,
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue);
}

// ── Detailed performance (drill-down + targets) ─────────────────────────────

export type DetailItem = { id: string; label: string; href: string; sub: string };

export type PeriodDetail = {
  leads: DetailItem[];
  appts: DetailItem[];
  proposals: DetailItem[];
  deals: DetailItem[];
};

export type TargetSet = {
  leads: number | null;
  apptsBooked: number | null;
  proposalsSent: number | null;
  dealsWon: number | null;
  wonValue: number | null;
};

export type LapsRowDetailed = LapsRow & {
  /** "YYYY-MM-DD" of the bucket start — the key targets are stored under. */
  startKey: string;
  detail: PeriodDetail;
  targets: TargetSet | null;
};

function leadLabel(l: { firstName: string; lastName: string; companyName: string | null }) {
  return l.companyName ?? `${l.firstName} ${l.lastName}`;
}

/**
 * LAPS throughput with, per bucket, the underlying records (drill-down) and
 * the period's targets. Powers the expandable reporting table.
 */
export async function getLapsPerformanceDetailed(
  period: Period,
  count = 8,
): Promise<LapsRowDetailed[]> {
  const buckets = buildBuckets(period, count);
  const windowStart = buckets[0].start;

  const [leads, appts, proposals, targets] = await Promise.all([
    prisma.lead.findMany({
      where: { createdAt: { gte: windowStart } },
      select: { id: true, firstName: true, lastName: true, companyName: true, leadSource: true, createdAt: true },
    }),
    prisma.appointment.findMany({
      where: { scheduledAt: { gte: windowStart } },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        status: true,
        lead: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      },
    }),
    prisma.proposal.findMany({
      select: {
        id: true,
        title: true,
        status: true,
        sentAt: true,
        wonAt: true,
        lead: { select: { firstName: true, lastName: true, companyName: true } },
        lineItems: { select: { quantity: true, unitPrice: true } },
      },
    }),
    prisma.salesTarget.findMany({ where: { granularity: period } }),
  ]);

  const targetByKey = new Map(
    targets.map((t) => [
      t.periodStart.toISOString().slice(0, 10),
      {
        leads: t.leads,
        apptsBooked: t.apptsBooked,
        proposalsSent: t.proposalsSent,
        dealsWon: t.dealsWon,
        wonValue: t.wonValue == null ? null : Number(t.wonValue),
      } satisfies TargetSet,
    ]),
  );

  return buckets.map((b) => {
    const startKey = format(b.start, "yyyy-MM-dd");
    const bLeads = leads.filter((l) => inBucket(l.createdAt, b));
    const bAppts = appts.filter((a) => inBucket(a.scheduledAt, b));
    const bSent = proposals.filter((p) => inBucket(p.sentAt, b));
    const bWon = proposals.filter((p) => p.status === "WON" && inBucket(p.wonAt, b));

    const detail: PeriodDetail = {
      leads: bLeads.map((l) => ({
        id: l.id,
        label: leadLabel(l),
        href: `/leads/${l.id}`,
        sub: l.leadSource ?? format(l.createdAt, "MMM d"),
      })),
      appts: bAppts.map((a) => ({
        id: a.id,
        label: leadLabel(a.lead),
        href: `/leads/${a.lead.id}`,
        sub: `${a.title} · ${format(a.scheduledAt, "MMM d")}${a.status === "COMPLETED" ? " · done" : ""}`,
      })),
      proposals: bSent.map((p) => ({
        id: p.id,
        label: leadLabel(p.lead),
        href: `/proposals/${p.id}`,
        sub: p.title,
      })),
      deals: bWon.map((p) => ({
        id: p.id,
        label: leadLabel(p.lead),
        href: `/sales/${p.id}`,
        sub: `${p.title} · ${lineItemsTotal(p.lineItems).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}`,
      })),
    };

    return {
      label: b.label,
      startKey,
      newLeads: bLeads.length,
      apptsBooked: bAppts.length,
      apptsCompleted: bAppts.filter((a) => a.status === "COMPLETED").length,
      proposalsSent: bSent.length,
      dealsWon: bWon.length,
      wonValue: bWon.reduce((s, p) => s + lineItemsTotal(p.lineItems), 0),
      detail,
      targets: targetByKey.get(startKey) ?? null,
    };
  });
}

/** Upsert one period's targets (null clears a metric). */
export async function saveSalesTarget(
  granularity: Period,
  startKey: string, // "YYYY-MM-DD"
  values: TargetSet,
) {
  const periodStart = new Date(`${startKey}T00:00:00Z`);
  await prisma.salesTarget.upsert({
    where: { granularity_periodStart: { granularity, periodStart } },
    update: values,
    create: { granularity, periodStart, ...values },
  });
  return { ok: true as const };
}

import { prisma } from "@/lib/prisma";
import { isoWeekOf } from "@/lib/work-taxonomy";

/**
 * Karbon → Pulse actuals sync (one-directional; Pulse never writes to Karbon in
 * v1). Pulls time entries, buckets them into ISO weeks, and upserts
 * `hours_consumed` onto the matching CapacityBooking. Entries with no matching
 * booking create a zero-booked, consumed-only row flagged `unbookedConsumption`.
 *
 * Entirely behind karbonConfigured(); the network client degrades gracefully
 * and the matching logic is a pure function (unit-tested) so it works with the
 * live pull or a fixture.
 */

const KARBON_BASE = process.env.KARBON_API_BASE || "https://api.karbonhq.com/v3";

export function karbonConfigured(): boolean {
  return Boolean(process.env.KARBON_BEARER_TOKEN && process.env.KARBON_ACCESS_KEY);
}

// ── Normalized entry + pure matcher ─────────────────────────────────────────

export type KarbonTimeEntry = {
  userEmail?: string | null;
  karbonUserId?: string | null;
  workItemKey?: string | null;
  hours: number;
  date: string; // ISO date "YYYY-MM-DD"
};

/** Defensive normalizer for a raw Karbon time-entry (field names vary by API version). */
export function normalizeKarbonEntry(raw: Record<string, unknown>): KarbonTimeEntry | null {
  const g = (...keys: string[]): unknown => {
    for (const k of keys) if (raw[k] != null) return raw[k];
    return undefined;
  };
  const minutes = g("Minutes", "minutes");
  const hoursRaw = g("Hours", "hours", "Duration", "duration");
  const hours =
    typeof minutes === "number" ? minutes / 60 : Number(String(hoursRaw ?? "0").replace(/,/g, "")) || 0;
  const dateRaw = g("Date", "date", "WorkDate", "EntryDate");
  const date = dateRaw ? String(dateRaw).slice(0, 10) : "";
  if (!date || hours <= 0) return null;
  return {
    userEmail: (g("UserEmail", "userEmail", "Email") as string) ?? null,
    karbonUserId: (g("UserKey", "UserId", "userId", "karbonUserId") as string) ?? null,
    workItemKey: (g("WorkItemKey", "WorkItemId", "workItemKey", "EngagementKey") as string) ?? null,
    hours,
    date,
  };
}

export type MatchMaps = {
  resourcesByEmail: Map<string, { id: string; roleBandId: string }>;
  resourcesByKarbonId: Map<string, { id: string; roleBandId: string }>;
  engagementsByWorkItem: Map<string, { id: string; portfolioId: string }>;
};

export type ConsumedUpsert = {
  engagementId: string;
  portfolioId: string;
  resourceId: string;
  roleBandId: string;
  isoWeek: string;
  hoursConsumed: number;
};

export type MatchResult = {
  upserts: ConsumedUpsert[];
  unmatchedResources: string[]; // emails / ids with entries but no PoolResource
  unmatchedWorkItems: string[]; // work-item keys with entries but no engagement
  weeks: string[];
};

/**
 * Pure matcher: bucket entries by (engagement, resource, ISO week), summing
 * hours. Entries whose resource or work item can't be resolved are reported as
 * unmatched (surfaced on the admin screen) rather than dropped silently.
 */
export function matchTimeEntries(entries: KarbonTimeEntry[], maps: MatchMaps): MatchResult {
  const bucket = new Map<string, ConsumedUpsert>();
  const unmatchedResources = new Set<string>();
  const unmatchedWorkItems = new Set<string>();
  const weeks = new Set<string>();

  for (const e of entries) {
    const resource =
      (e.userEmail ? maps.resourcesByEmail.get(e.userEmail.toLowerCase()) : undefined) ??
      (e.karbonUserId ? maps.resourcesByKarbonId.get(e.karbonUserId) : undefined);
    const engagement = e.workItemKey ? maps.engagementsByWorkItem.get(e.workItemKey) : undefined;

    if (!resource) {
      unmatchedResources.add(e.userEmail || e.karbonUserId || "(unknown)");
      continue;
    }
    if (!engagement) {
      unmatchedWorkItems.add(e.workItemKey || "(none)");
      continue;
    }

    const isoWeek = isoWeekOf(new Date(`${e.date}T00:00:00Z`));
    weeks.add(isoWeek);
    const key = `${engagement.id}|${resource.id}|${isoWeek}`;
    const existing = bucket.get(key);
    if (existing) {
      existing.hoursConsumed += e.hours;
    } else {
      bucket.set(key, {
        engagementId: engagement.id,
        portfolioId: engagement.portfolioId,
        resourceId: resource.id,
        roleBandId: resource.roleBandId,
        isoWeek,
        hoursConsumed: e.hours,
      });
    }
  }

  return {
    upserts: Array.from(bucket.values()).map((u) => ({ ...u, hoursConsumed: Math.round(u.hoursConsumed * 100) / 100 })),
    unmatchedResources: Array.from(unmatchedResources),
    unmatchedWorkItems: Array.from(unmatchedWorkItems),
    weeks: Array.from(weeks).sort(),
  };
}

/** Apply matched consumed-hour upserts to CapacityBooking rows. */
export async function applyConsumedUpserts(upserts: ConsumedUpsert[]): Promise<number> {
  let n = 0;
  for (const u of upserts) {
    await prisma.capacityBooking.upsert({
      where: { engagementId_resourceId_isoWeek: { engagementId: u.engagementId, resourceId: u.resourceId, isoWeek: u.isoWeek } },
      update: { hoursConsumed: u.hoursConsumed },
      create: {
        engagementId: u.engagementId,
        portfolioId: u.portfolioId,
        resourceId: u.resourceId,
        roleBandId: u.roleBandId,
        isoWeek: u.isoWeek,
        hoursBooked: 0,
        hoursConsumed: u.hoursConsumed,
        status: "CONSUMED_CLOSED",
        unbookedConsumption: true,
      },
    });
    n += 1;
  }
  return n;
}

// ── Network client (flag-gated) ─────────────────────────────────────────────

async function karbonFetch(path: string): Promise<unknown | null> {
  try {
    const res = await fetch(`${KARBON_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${process.env.KARBON_BEARER_TOKEN}`,
        AccessKey: process.env.KARBON_ACCESS_KEY as string,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      console.error("Karbon fetch failed:", res.status, path);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("Karbon fetch error:", err);
    return null;
  }
}

/** Pull + normalize time entries since a date (best-effort; null when unconfigured). */
export async function pullTimeEntries(sinceISO: string): Promise<KarbonTimeEntry[] | null> {
  if (!karbonConfigured()) return null;
  const payload = (await karbonFetch(`/TimeEntries?WorkDate=ge=${sinceISO}`)) as
    | { value?: Record<string, unknown>[] }
    | Record<string, unknown>[]
    | null;
  if (!payload) return null;
  const rows = Array.isArray(payload) ? payload : (payload.value ?? []);
  return rows.map(normalizeKarbonEntry).filter((e): e is KarbonTimeEntry => e !== null);
}

/**
 * Full sync: pull the trailing `weeksBack` weeks of time entries and land them
 * as consumed hours. Returns stats + any unmatched rows for the admin screen.
 */
export async function syncKarbonActuals(weeksBack = 8) {
  if (!karbonConfigured()) return { ok: false as const, error: "Karbon is not configured (set KARBON_BEARER_TOKEN / KARBON_ACCESS_KEY)." };

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - weeksBack * 7);
  const entries = await pullTimeEntries(since.toISOString().slice(0, 10));
  if (entries === null) return { ok: false as const, error: "Karbon pull failed — check credentials/connectivity." };

  const [resources, engagements] = await Promise.all([
    prisma.poolResource.findMany({ where: { active: true }, select: { id: true, email: true, karbonUserId: true, roleBandId: true } }),
    prisma.portfolioEngagement.findMany({ where: { karbonWorkItemKey: { not: null } }, select: { id: true, portfolioId: true, karbonWorkItemKey: true } }),
  ]);
  const maps: MatchMaps = {
    resourcesByEmail: new Map(resources.map((r) => [r.email.toLowerCase(), { id: r.id, roleBandId: r.roleBandId }])),
    resourcesByKarbonId: new Map(resources.filter((r) => r.karbonUserId).map((r) => [r.karbonUserId as string, { id: r.id, roleBandId: r.roleBandId }])),
    engagementsByWorkItem: new Map(engagements.map((e) => [e.karbonWorkItemKey as string, { id: e.id, portfolioId: e.portfolioId }])),
  };

  const match = matchTimeEntries(entries, maps);
  const applied = await applyConsumedUpserts(match.upserts);

  return {
    ok: true as const,
    entries: entries.length,
    applied,
    weeks: match.weeks,
    unmatchedResources: match.unmatchedResources,
    unmatchedWorkItems: match.unmatchedWorkItems,
  };
}

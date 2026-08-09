import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { pullTrialBalance, pullGeneralLedger, syncLedgerAccounts, pullChangedMonths, CDC_MAX_LOOKBACK_DAYS } from "@/lib/pace/qbo";
import { importTrialBalance } from "@/lib/pace/import";
import { importGeneralLedger } from "@/lib/pace/gl";
import { AGING_CACHE_TAG } from "@/lib/pace/aging";

/**
 * QBO actuals sync — incremental by default. Shared by the interactive "Sync
 * from QBO" button and the nightly cron so both advance `lastSyncAt` and use the
 * same change-detection. No auth here; callers gate access.
 *
 * On a routine refresh it asks QBO (ChangeDataCapture) which posting
 * transactions changed since the last sync and re-pulls the TB/GL *reports* for
 * only the affected months (plus the current month). CDC is just the
 * change-detector — QBO's reports stay the source of truth for balances, so we
 * never re-derive double-entry from raw transactions. Falls back to a full
 * trailing-N-month backfill on the first sync, when the last sync predates CDC's
 * ~30-day window, or when `full` is forced.
 */

/** First-of-month ISO strings for the trailing `count` months, oldest → newest. */
export function trailingMonths(count: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Pull TB + GL for a set of months and import each. `fatal` = the first pull
 * came back null (not connected / auth), so nothing could be synced. */
async function syncMonths(entityId: string, months: string[]) {
  let imported = 0;
  let empty = 0;
  let failed = 0;
  let glLines = 0;
  const importedMonths: string[] = [];
  for (const month of months) {
    const rows = await pullTrialBalance(entityId, month);
    if (rows === null) {
      if (imported === 0 && empty === 0) return { fatal: true as const };
      failed += 1;
      continue;
    }
    if (rows.length === 0) {
      empty += 1;
      continue;
    }
    await importTrialBalance({ entityId, periodMonth: month, rows, source: "qbo" });
    imported += 1;
    importedMonths.push(month.slice(0, 7));

    const start = new Date(month);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const gl = await pullGeneralLedger(entityId, month, end).catch(() => null);
    if (gl && gl.length) {
      const res = await importGeneralLedger({ entityId, periodMonthISO: month, lines: gl }).catch(() => null);
      if (res) glLines += res.count;
    }
  }
  importedMonths.sort();
  return { fatal: false as const, imported, empty, failed, glLines, importedMonths };
}

export type SyncActualsResult =
  | { ok: false; error: string }
  | {
      ok: true;
      mode: "full" | "incremental";
      monthsChecked: number;
      imported: number;
      empty: number;
      failed: number;
      glLines: number;
      firstMonth: string | null;
      lastMonth: string | null;
    };

export async function syncEntityActuals(entityId: string, opts?: { monthsBack?: number; full?: boolean }): Promise<SyncActualsResult> {
  const monthsBack = opts?.monthsBack ?? 24;
  await syncLedgerAccounts(entityId).catch(() => null);

  const conn = await prisma.ledgerConnection.findUnique({ where: { entityId }, select: { lastSyncAt: true } });
  const window = trailingMonths(monthsBack);
  const earliest = window[0];
  const currentMonth = window[window.length - 1];

  const lastSync = conn?.lastSyncAt ?? null;
  const staleMs = CDC_MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const canIncremental = !opts?.full && lastSync != null && Date.now() - lastSync.getTime() < staleMs;

  let mode: "full" | "incremental" = "full";
  let months: string[] = window;

  if (canIncremental) {
    // Small overlap back from lastSyncAt so an edit landing in the same minute
    // as the previous sync is never missed.
    const sinceISO = new Date(lastSync!.getTime() - 5 * 60 * 1000).toISOString();
    const changed = await pullChangedMonths(entityId, sinceISO);
    if (changed) {
      mode = "incremental";
      const set = new Set<string>();
      for (const m of changed.months) if (m >= earliest) set.add(m);
      // Deleted txns often arrive without a date — resolve their month(s) from
      // the GL lines we already imported for them.
      if (changed.deletedIds.length) {
        const rows = await prisma.generalLedgerLine.findMany({
          where: { entityId, externalTxnId: { in: changed.deletedIds } },
          select: { periodMonth: true },
          distinct: ["periodMonth"],
        });
        for (const r of rows) {
          const iso = r.periodMonth.toISOString().slice(0, 10);
          if (iso >= earliest) set.add(iso);
        }
      }
      // Always refresh the in-progress current month (cheap; catches same-day activity).
      set.add(currentMonth);
      months = [...set].sort();
    }
    // changed === null → fall through to a full sync (mode stays "full").
  }

  const result = await syncMonths(entityId, months);
  if (result.fatal) {
    await prisma.ledgerConnection.update({ where: { entityId }, data: { lastSyncStatus: "failed" } }).catch(() => null);
    return { ok: false, error: "QBO not connected for this entity, or the pull failed." };
  }

  await prisma.ledgerConnection
    .update({ where: { entityId }, data: { lastSyncAt: new Date(), lastSyncStatus: "ok" } })
    .catch(() => null);

  // Fresh ledger data → drop the cached AR/AP aging so the next render re-pulls.
  try { revalidateTag(AGING_CACHE_TAG); } catch { /* not in a request context (rare) */ }

  return {
    ok: true,
    mode,
    monthsChecked: months.length,
    imported: result.imported,
    empty: result.empty,
    failed: result.failed,
    glLines: result.glLines,
    firstMonth: result.importedMonths[0] ?? null,
    lastMonth: result.importedMonths[result.importedMonths.length - 1] ?? null,
  };
}

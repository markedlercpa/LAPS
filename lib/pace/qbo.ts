import { prisma } from "@/lib/prisma";
import type { TbRow } from "@/lib/pace/import";

/**
 * QuickBooks Online adapter — one-way ingest into PACE (QBO stays the ledger of
 * record; PACE never writes back). Hand-rolled OAuth2 over `fetch`, mirroring
 * lib/graph.ts (store tokens on the entity's LedgerConnection → refresh on
 * expiry → persist). Entirely behind qboConfigured(); every function degrades
 * gracefully when unconfigured/disconnected so the rest of PACE works on the
 * manual import path.
 *
 * Live end-to-end use requires an Intuit developer app + a completed connect on
 * the deployed host; this scaffolding is verified there, not in local/CI.
 */

const AUTH_BASE = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const SCOPE = "com.intuit.quickbooks.accounting";

export function qboConfigured(): boolean {
  return Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
}

function apiBase(): string {
  return process.env.QBO_ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

function redirectUri(): string {
  return (
    process.env.QBO_REDIRECT_URI ||
    `${(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "")}/api/pace/qbo/callback`
  );
}

/** Step 1 of connect: the Intuit authorize URL. `state` carries the entityId. */
export function authorizeUrl(entityId: string): string | null {
  if (!qboConfigured()) return null;
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID as string,
    response_type: "code",
    scope: SCOPE,
    redirect_uri: redirectUri(),
    state: entityId,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

function basicAuthHeader(): string {
  const raw = `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

/** Step 2 of connect: exchange the auth code + realmId, persist to the entity. */
export async function exchangeCode(entityId: string, code: string, realmId: string): Promise<boolean> {
  if (!qboConfigured()) return false;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri() }),
    });
    if (!res.ok) {
      console.error("QBO token exchange failed:", res.status, await res.text());
      return false;
    }
    const t = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    await prisma.ledgerConnection.upsert({
      where: { entityId },
      update: {
        provider: "QBO",
        status: "connected",
        realmId,
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: new Date(Date.now() + t.expires_in * 1000),
      },
      create: {
        entityId,
        provider: "QBO",
        status: "connected",
        realmId,
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: new Date(Date.now() + t.expires_in * 1000),
      },
    });
    return true;
  } catch (err) {
    console.error("QBO exchangeCode error:", err);
    return false;
  }
}

/** Valid access token for an entity, refreshing + persisting when near expiry. */
async function getAccessToken(entityId: string): Promise<{ token: string; realmId: string } | null> {
  const conn = await prisma.ledgerConnection.findUnique({ where: { entityId } });
  if (!conn || conn.provider !== "QBO" || !conn.refreshToken || !conn.realmId) return null;

  const stillValid = conn.accessToken && conn.expiresAt && conn.expiresAt.getTime() - 60_000 > Date.now();
  if (stillValid) return { token: conn.accessToken as string, realmId: conn.realmId };

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refreshToken }),
    });
    if (!res.ok) {
      console.error("QBO refresh failed:", res.status);
      return conn.accessToken ? { token: conn.accessToken, realmId: conn.realmId } : null;
    }
    const t = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    await prisma.ledgerConnection.update({
      where: { entityId },
      data: {
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: new Date(Date.now() + t.expires_in * 1000),
      },
    });
    return { token: t.access_token, realmId: conn.realmId };
  } catch (err) {
    console.error("QBO getAccessToken error:", err);
    return null;
  }
}

/**
 * Pull a month's Trial Balance report from QBO and normalize to signed TB rows
 * (debit +, credit -). Returns null when not connected. The caller feeds these
 * into importTrialBalance with source="qbo".
 */
export async function pullTrialBalance(entityId: string, periodMonthISO: string): Promise<TbRow[] | null> {
  const auth = await getAccessToken(entityId);
  if (!auth) return null;

  const month = new Date(periodMonthISO);
  const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const url = `${apiBase()}/v3/company/${auth.realmId}/reports/TrialBalance?start_date=${fmt(start)}&end_date=${fmt(end)}&minorversion=70`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } });
    if (!res.ok) {
      console.error("QBO TrialBalance failed:", res.status, await res.text());
      return null;
    }
    const report = (await res.json()) as QboReport;
    return parseTrialBalance(report);
  } catch (err) {
    console.error("QBO pullTrialBalance error:", err);
    return null;
  }
}

// ── QBO report parsing ────────────────────────────────────────────────────
// The TrialBalance report is a nested Rows structure; each data row has
// ColData [account, debit, credit]. We flatten to signed rows.

type QboColData = { value?: string; id?: string };
type QboRow = { type?: string; ColData?: QboColData[]; Rows?: { Row?: QboRow[] } };
type QboReport = { Rows?: { Row?: QboRow[] } };

function parseTrialBalance(report: QboReport): TbRow[] {
  const out: TbRow[] = [];
  const walk = (rows?: QboRow[]) => {
    for (const r of rows ?? []) {
      if (r.ColData && r.ColData.length >= 3) {
        const name = r.ColData[0]?.value?.trim();
        const externalId = r.ColData[0]?.id;
        const debit = parseFloat(r.ColData[1]?.value || "0") || 0;
        const credit = parseFloat(r.ColData[2]?.value || "0") || 0;
        if (name) out.push({ externalId, name, amount: debit - credit });
      }
      if (r.Rows?.Row) walk(r.Rows.Row);
    }
  };
  walk(report.Rows?.Row);
  return out;
}

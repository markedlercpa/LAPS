import { createHmac, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { TbRow } from "@/lib/pace/import";

/**
 * QuickBooks Online adapter — one-way ingest into PACE (QBO stays the ledger of
 * record; PACE never writes back). Hand-rolled OAuth2 over `fetch`, mirroring
 * lib/graph.ts. Entirely behind qboConfigured(); every function degrades
 * gracefully when unconfigured/disconnected so the rest of PACE works on the
 * manual import path.
 *
 * Production-hardening (Intuit OAuth readiness):
 *  - endpoints come from Intuit's OpenID discovery document (cached), not
 *    hardcoded, so they stay current;
 *  - token + API calls retry transient failures (network/429/5xx) with backoff,
 *    but never retry a 4xx such as invalid_grant;
 *  - a failed refresh / invalid_grant marks the connection disconnected and
 *    clears tokens, so the UI prompts the user to reconnect;
 *  - the OAuth `state` is a signed, time-boxed token (CSRF protection), verified
 *    on callback — not a predictable id.
 */

const FALLBACK = {
  authorization_endpoint: "https://appcenter.intuit.com/connect/oauth2",
  token_endpoint: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
  revocation_endpoint: "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
};
const SCOPE = "com.intuit.quickbooks.accounting";
const STATE_TTL_MS = 10 * 60 * 1000;

export function qboConfigured(): boolean {
  return Boolean(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
}

function isProd(): boolean {
  return process.env.QBO_ENVIRONMENT === "production";
}

function apiBase(): string {
  return isProd() ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
}

function redirectUri(): string {
  return (
    process.env.QBO_REDIRECT_URI ||
    `${(process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "")}/api/pace/qbo/callback`
  );
}

// ── Discovery document (Q5) ─────────────────────────────────────────────────
let discoveryCache: typeof FALLBACK | null = null;

async function discovery(): Promise<typeof FALLBACK> {
  if (discoveryCache) return discoveryCache;
  const url = isProd()
    ? "https://developer.api.intuit.com/.well-known/openid_configuration"
    : "https://developer.api.intuit.com/.well-known/openid_sandbox_configuration";
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const doc = (await res.json()) as Partial<typeof FALLBACK>;
      discoveryCache = {
        authorization_endpoint: doc.authorization_endpoint || FALLBACK.authorization_endpoint,
        token_endpoint: doc.token_endpoint || FALLBACK.token_endpoint,
        revocation_endpoint: doc.revocation_endpoint || FALLBACK.revocation_endpoint,
      };
      return discoveryCache;
    }
  } catch (err) {
    console.error("QBO discovery fetch failed, using fallback endpoints:", err);
  }
  return FALLBACK;
}

// ── Signed CSRF state (Q6d) ─────────────────────────────────────────────────
function stateSecret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "laps-dev-secret";
}

/** state = base64url(entityId.nonce.ts).hmac — verified + time-boxed on callback. */
export function makeState(entityId: string): string {
  const payload = `${entityId}.${randomBytes(12).toString("hex")}.${Date.now()}`;
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

/** Returns the entityId if the state is authentic and fresh, else null. */
export function verifyState(state: string | null): string | null {
  if (!state) return null;
  const [b64, sig] = state.split(".");
  if (!b64 || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(b64).digest("base64url");
  if (sig !== expected) return null;
  const [entityId, , tsRaw] = Buffer.from(b64, "base64url").toString().split(".");
  const ts = Number(tsRaw);
  if (!entityId || !Number.isFinite(ts) || Date.now() - ts > STATE_TTL_MS) return null;
  return entityId;
}

// ── Transient-retry fetch (Q3) ──────────────────────────────────────────────
async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(url, init);
      // Retry only transient server-side conditions; never a 4xx (e.g. invalid_grant).
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(300 * 2 ** attempt);
        attempt += 1;
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        await sleep(300 * 2 ** attempt);
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function basicAuthHeader(): string {
  const raw = `${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

// ── OAuth ───────────────────────────────────────────────────────────────────

/** Step 1 of connect: the Intuit authorize URL with a signed state token. */
export async function authorizeUrl(entityId: string): Promise<string | null> {
  if (!qboConfigured()) return null;
  const d = await discovery();
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID as string,
    response_type: "code",
    scope: SCOPE,
    redirect_uri: redirectUri(),
    state: makeState(entityId),
  });
  return `${d.authorization_endpoint}?${params.toString()}`;
}

/** Step 2 of connect: exchange the auth code + realmId, persist to the entity. */
export async function exchangeCode(entityId: string, code: string, realmId: string): Promise<boolean> {
  if (!qboConfigured()) return false;
  try {
    const d = await discovery();
    const res = await fetchWithRetry(d.token_endpoint, {
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
      update: connData(realmId, t),
      create: { entityId, ...connData(realmId, t) },
    });
    return true;
  } catch (err) {
    console.error("QBO exchangeCode error:", err);
    return false;
  }
}

function connData(realmId: string, t: { access_token: string; refresh_token: string; expires_in: number }) {
  return {
    provider: "QBO" as const,
    status: "connected",
    realmId,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
  };
}

/** Mark a connection as needing reconnection (invalid_grant / expired refresh). */
async function markNeedsReconnect(entityId: string): Promise<void> {
  await prisma.ledgerConnection.updateMany({
    where: { entityId },
    data: { status: "reauth_required", accessToken: null, expiresAt: null },
  });
}

/**
 * Valid access token for an entity, refreshing + persisting near expiry.
 * On invalid_grant / expired refresh token (Q6b, Q6c), marks the connection
 * reauth_required so the UI prompts the customer to reconnect (Q4), and returns
 * null.
 */
async function getAccessToken(entityId: string): Promise<{ token: string; realmId: string } | null> {
  const conn = await prisma.ledgerConnection.findUnique({ where: { entityId } });
  if (!conn || conn.provider !== "QBO" || !conn.refreshToken || !conn.realmId) return null;

  const stillValid = conn.accessToken && conn.expiresAt && conn.expiresAt.getTime() - 60_000 > Date.now();
  if (stillValid) return { token: conn.accessToken as string, realmId: conn.realmId };

  try {
    const d = await discovery();
    const res = await fetchWithRetry(d.token_endpoint, {
      method: "POST",
      headers: { Authorization: basicAuthHeader(), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refreshToken }),
    });
    if (!res.ok) {
      // 400 invalid_grant = refresh token expired/revoked → force reconnect.
      if (res.status === 400) {
        console.error("QBO refresh invalid_grant — marking reauth_required");
        await markNeedsReconnect(entityId);
        return null;
      }
      console.error("QBO refresh failed:", res.status);
      return conn.accessToken ? { token: conn.accessToken, realmId: conn.realmId } : null;
    }
    const t = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    await prisma.ledgerConnection.update({
      where: { entityId },
      data: {
        status: "connected",
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
 * (debit +, credit -). Returns null when not connected. On an auth failure the
 * connection is flagged reauth_required by getAccessToken.
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
    const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } });
    if (res.status === 401) {
      await markNeedsReconnect(entityId);
      return null;
    }
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

// ── QBO report parsing ──────────────────────────────────────────────────────
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

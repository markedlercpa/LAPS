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
    const rows = parseTrialBalance(report);
    // Enrich with QBO's descriptive metadata from the Account list (the TB
    // report carries only id + name + balance). AccountType/SubType/
    // Classification + account number let the statements rebuild natively and
    // sort/read by account number — no manual mapping.
    const accts = await fetchAccountMap(auth);
    if (accts) {
      for (const r of rows) {
        const meta = r.externalId ? accts.get(r.externalId) : undefined;
        if (!meta) continue;
        if (meta.acctNum) r.acctNum = meta.acctNum;
        r.accountType = meta.type;
        r.accountSubType = meta.subType;
        r.classification = meta.classification;
        r.fqName = meta.fqName;
        r.parentExternalId = meta.parentExternalId;
      }
    }
    return rows;
  } catch (err) {
    console.error("QBO pullTrialBalance error:", err);
    return null;
  }
}

// ── General Ledger (transaction detail) ─────────────────────────────────────
export type GlLine = {
  externalAccountId?: string; // QBO account id (section header)
  accountName?: string;
  txnDate: string; // "YYYY-MM-DD"
  txnType?: string;
  docNumber?: string;
  name?: string;
  memo?: string;
  splitAccount?: string;
  amount: number; // signed: debit +, credit -
  externalTxnId?: string;
};

type QboColumnMeta = { Name?: string; Value?: string };
type QboColumn = { ColTitle?: string; ColType?: string; MetaData?: QboColumnMeta[] };
type QboReportFull = { Columns?: { Column?: QboColumn[] }; Rows?: { Row?: QboRow[] } };

/** Build a colKey → index map from the report's Columns (by ColType + ColKey). */
function columnIndex(columns: QboColumn[]): Record<string, number> {
  const idx: Record<string, number> = {};
  columns.forEach((c, i) => {
    if (c.ColType) idx[c.ColType.toLowerCase()] = i;
    const key = c.MetaData?.find((m) => m.Name === "ColKey")?.Value;
    if (key) idx[key.toLowerCase()] = i;
  });
  return idx;
}

/**
 * Parse a QBO GeneralLedger report into flat, signed GL lines. Columns are
 * matched by key (order varies), transactions are grouped under account section
 * headers, and amounts prefer explicit debit/credit columns (debit − credit),
 * falling back to the single signed natural-amount column. Pure — unit-testable.
 */
export function parseGeneralLedger(report: QboReportFull): GlLine[] {
  const cols = report.Columns?.Column ?? [];
  const idx = columnIndex(cols);
  const pick = (keys: string[]): number | undefined => {
    for (const k of keys) if (idx[k] !== undefined) return idx[k];
    return undefined;
  };
  const iDate = pick(["tx_date"]);
  const iType = pick(["txn_type"]);
  const iDoc = pick(["doc_num"]);
  const iName = pick(["name"]);
  const iMemo = pick(["memo", "memo_desc"]);
  const iSplit = pick(["split_acc"]);
  const iAmt = pick(["subt_nat_amount", "nat_amount", "amount", "subt_nat_home_amount"]);
  const iDebit = pick(["debt_amt", "debit", "nat_debit"]);
  const iCredit = pick(["credt_amt", "credit", "nat_credit"]);

  const num = (s?: string) => Number(String(s ?? "").replace(/,/g, "")) || 0;
  const out: GlLine[] = [];

  const walk = (rows: QboRow[] | undefined, acct: { id?: string; name?: string }) => {
    for (const r of rows ?? []) {
      // A section: header names the account; recurse into its rows with that account.
      const header = (r as { Header?: { ColData?: QboColData[] } }).Header;
      let current = acct;
      if (header?.ColData?.length) {
        const h0 = header.ColData[0];
        current = { id: h0?.id ?? acct.id, name: h0?.value?.trim() || acct.name };
      }
      // A data row: has ColData with a date value.
      if (r.ColData && iDate !== undefined) {
        const date = r.ColData[iDate]?.value?.trim();
        if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
          const amount =
            iDebit !== undefined || iCredit !== undefined
              ? num(iDebit !== undefined ? r.ColData[iDebit]?.value : undefined) -
                num(iCredit !== undefined ? r.ColData[iCredit]?.value : undefined)
              : num(iAmt !== undefined ? r.ColData[iAmt]?.value : undefined);
          out.push({
            externalAccountId: current.id,
            accountName: current.name,
            txnDate: date.slice(0, 10),
            txnType: iType !== undefined ? r.ColData[iType]?.value?.trim() || undefined : undefined,
            docNumber: iDoc !== undefined ? r.ColData[iDoc]?.value?.trim() || undefined : undefined,
            name: iName !== undefined ? r.ColData[iName]?.value?.trim() || undefined : undefined,
            memo: iMemo !== undefined ? r.ColData[iMemo]?.value?.trim() || undefined : undefined,
            splitAccount: iSplit !== undefined ? r.ColData[iSplit]?.value?.trim() || undefined : undefined,
            amount,
            externalTxnId: iType !== undefined ? r.ColData[iType]?.id : r.ColData[iDate]?.id,
          });
        }
      }
      if (r.Rows?.Row) walk(r.Rows.Row, current);
    }
  };
  walk(report.Rows?.Row, {});
  return out;
}

/**
 * Pull a date range's General Ledger from QBO. Returns flat signed GL lines, or
 * null when not connected / the pull fails.
 */
export async function pullGeneralLedger(entityId: string, startISO: string, endISO: string): Promise<GlLine[] | null> {
  const auth = await getAccessToken(entityId);
  if (!auth) return null;
  const fmt = (iso: string) => iso.slice(0, 10);
  const url = `${apiBase()}/v3/company/${auth.realmId}/reports/GeneralLedger?start_date=${fmt(startISO)}&end_date=${fmt(endISO)}&minorversion=70`;
  try {
    const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } });
    if (res.status === 401) {
      await markNeedsReconnect(entityId);
      return null;
    }
    if (!res.ok) {
      console.error("QBO GeneralLedger failed:", res.status, await res.text());
      return null;
    }
    const report = (await res.json()) as QboReportFull;
    const lines = parseGeneralLedger(report);
    console.error(`QBO pullGeneralLedger ${fmt(startISO)}..${fmt(endISO)}: ${lines.length} GL lines`);
    return lines;
  } catch (err) {
    console.error("QBO pullGeneralLedger error:", err);
    return null;
  }
}

// ── Account list (QBO's descriptive chart of accounts) ──────────────────────
type QboAccount = {
  Id?: string;
  Name?: string;
  FullyQualifiedName?: string;
  AcctNum?: string;
  AccountType?: string;
  AccountSubType?: string;
  Classification?: string;
  Active?: boolean;
  ParentRef?: { value?: string };
};
type QboAccountResponse = { QueryResponse?: { Account?: QboAccount[] } };

/** The descriptive metadata QBO carries for one account — the whole point of
 * the native rebuild: AccountType/SubType/Classification + parent hierarchy. */
export type QboAccountMeta = {
  acctNum?: string;
  name: string;
  fqName?: string;
  type?: string; // AccountType
  subType?: string; // AccountSubType
  classification?: string; // Asset | Liability | Equity | Revenue | Expense
  parentExternalId?: string;
  active: boolean;
};

/** Fetch id → descriptive metadata for a company's chart of accounts. */
async function fetchAccountMap(auth: { token: string; realmId: string }): Promise<Map<string, QboAccountMeta> | null> {
  const query = encodeURIComponent("select * from Account maxresults 1000");
  const url = `${apiBase()}/v3/company/${auth.realmId}/query?query=${query}&minorversion=70`;
  try {
    const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } });
    if (!res.ok) {
      console.error("QBO Account query failed:", res.status);
      return null;
    }
    const payload = (await res.json()) as QboAccountResponse;
    const list = payload?.QueryResponse?.Account ?? [];
    const map = new Map<string, QboAccountMeta>();
    for (const a of list) {
      if (!a.Id) continue;
      map.set(a.Id, {
        acctNum: a.AcctNum || undefined,
        name: a.Name || a.Id,
        fqName: a.FullyQualifiedName || undefined,
        type: a.AccountType || undefined,
        subType: a.AccountSubType || undefined,
        classification: a.Classification || undefined,
        parentExternalId: a.ParentRef?.value || undefined,
        active: a.Active !== false,
      });
    }
    return map;
  } catch (err) {
    console.error("QBO fetchAccountMap error:", err);
    return null;
  }
}

/**
 * Sync a QBO company's chart of accounts into LedgerAccounts, capturing QBO's
 * descriptive metadata (AccountType/SubType/Classification + parent hierarchy)
 * so the statements can be rebuilt natively — no manual mapping. Returns the
 * count synced, or null when not connected.
 */
export async function syncLedgerAccounts(entityId: string): Promise<number | null> {
  const auth = await getAccessToken(entityId);
  if (!auth) return null;
  const accts = await fetchAccountMap(auth);
  if (!accts) return null;
  let n = 0;
  for (const [qboId, meta] of accts) {
    const data = {
      name: meta.name,
      acctNum: meta.acctNum ?? null,
      sourceType: meta.type ?? null,
      accountSubType: meta.subType ?? null,
      classification: meta.classification ?? null,
      fqName: meta.fqName ?? null,
      parentExternalId: meta.parentExternalId ?? null,
      active: meta.active,
    };
    await prisma.ledgerAccount.upsert({
      where: { entityId_externalId: { entityId, externalId: qboId } },
      update: data,
      create: { entityId, externalId: qboId, ...data },
    });
    n += 1;
  }
  return n;
}

/**
 * Pull budgets from QBO (read-only — QBO's Budget API cannot be written).
 * Returns each budget with its lines normalized to { accountId, accountName,
 * month "YYYY-MM", amount } (amount as QBO stores it: natural-side positive).
 * Null when not connected.
 */
export type QboBudget = {
  name: string;
  lines: { accountId: string; accountName: string; month: string; amount: number }[];
};

export async function pullBudget(entityId: string): Promise<QboBudget[] | null> {
  const auth = await getAccessToken(entityId);
  if (!auth) return null;
  const query = encodeURIComponent("select * from Budget");
  const url = `${apiBase()}/v3/company/${auth.realmId}/query?query=${query}&minorversion=70`;
  try {
    const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } });
    if (res.status === 401) {
      await markNeedsReconnect(entityId);
      return null;
    }
    if (!res.ok) {
      console.error("QBO Budget query failed:", res.status, await res.text());
      return null;
    }
    const payload = (await res.json()) as QboQueryResponse;
    const entities = payload?.QueryResponse?.Budget ?? [];

    // Some QBO companies return budget headers/detail from the query WITHOUT the
    // Amount populated. When a budget's detail is missing or all-zero, re-fetch
    // it by Id (the read endpoint returns full detail with amounts).
    const resolved: QboBudgetEntity[] = [];
    for (const b of entities) {
      const hasAmounts = (b.BudgetDetail ?? []).some((d) => Number(String(d.Amount ?? "").replace(/,/g, "")) !== 0);
      if (hasAmounts || !b.Id) {
        resolved.push(b);
        continue;
      }
      const full = await readBudgetById(auth, b.Id);
      resolved.push(full ?? b);
    }

    const parsed = resolved.map(parseBudgetEntity);
    const totalLines = parsed.reduce((s, p) => s + p.lines.length, 0);
    const totalAmt = parsed.reduce((s, p) => s + p.lines.reduce((a, l) => a + Math.abs(l.amount), 0), 0);
    console.error(`QBO pullBudget: ${parsed.length} budget(s), ${totalLines} detail lines, $${totalAmt.toFixed(0)} total`);
    return parsed;
  } catch (err) {
    console.error("QBO pullBudget error:", err);
    return null;
  }
}

/** Read a single budget by Id — returns its full detail (with amounts). */
async function readBudgetById(auth: { token: string; realmId: string }, id: string): Promise<QboBudgetEntity | null> {
  const url = `${apiBase()}/v3/company/${auth.realmId}/budget/${id}?minorversion=70`;
  try {
    const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } });
    if (!res.ok) {
      console.error("QBO budget read-by-id failed:", res.status);
      return null;
    }
    const doc = (await res.json()) as { Budget?: QboBudgetEntity };
    return doc.Budget ?? null;
  } catch (err) {
    console.error("QBO readBudgetById error:", err);
    return null;
  }
}

type QboBudgetDetail = { BudgetDate?: string; Amount?: number | string; AccountRef?: { value?: string; name?: string } };
type QboBudgetEntity = { Id?: string; Name?: string; BudgetDetail?: QboBudgetDetail[] };
type QboQueryResponse = { QueryResponse?: { Budget?: QboBudgetEntity[] } };

/** Parse one QBO budget entity into normalized lines (robust amount coercion). */
export function parseBudgetEntity(b: QboBudgetEntity, i = 0): QboBudget {
  return {
    name: b.Name || `QBO Budget ${i + 1}`,
    lines: (b.BudgetDetail ?? [])
      .map((d) => {
        const accountId = d.AccountRef?.value;
        const date = d.BudgetDate; // "YYYY-MM-DD"
        if (!accountId || !date) return null;
        return {
          accountId,
          accountName: d.AccountRef?.name || accountId,
          month: date.slice(0, 7), // "YYYY-MM"
          amount: Number(String(d.Amount ?? "0").replace(/,/g, "")) || 0,
        };
      })
      .filter((x): x is QboBudget["lines"][number] => x !== null),
  };
}

/** Pure parser for the QBO Budget query response (array form). */
export function parseQboBudgets(payload: unknown): QboBudget[] {
  const budgets = (payload as QboQueryResponse)?.QueryResponse?.Budget ?? [];
  return budgets.map((b, i) => parseBudgetEntity(b, i));
}

// ── AR / AP aging detail (cash-forecast collections + disbursements) ─────────
export type AgingItem = {
  name: string; // customer (AR) or vendor (AP)
  docNumber?: string;
  txnDate?: string; // "YYYY-MM-DD"
  dueDate?: string; // "YYYY-MM-DD" — drives which cash column it lands in
  amount: number; // open balance, positive
};

/**
 * Parse a QBO AgedReceivableDetail / AgedPayableDetail report into flat open
 * items with their due dates. Columns are matched by key (order varies); the
 * open amount prefers the "open_bal"/"subt_open_bal" column, else "amount".
 */
export function parseAgingDetail(report: QboReportFull): AgingItem[] {
  const cols = report.Columns?.Column ?? [];
  const idx = columnIndex(cols);
  const pick = (keys: string[]): number | undefined => {
    for (const k of keys) if (idx[k] !== undefined) return idx[k];
    return undefined;
  };
  const iDate = pick(["tx_date", "date"]);
  const iDue = pick(["due_date", "duedate"]);
  const iName = pick(["cust_name", "name", "vend_name", "customer", "vendor"]);
  const iDoc = pick(["doc_num"]);
  const iAmt = pick(["open_bal", "subt_open_bal", "amount", "subt_nat_amount", "nat_open_bal"]);
  const num = (s?: string) => Number(String(s ?? "").replace(/,/g, "")) || 0;
  const out: AgingItem[] = [];

  const walk = (rows?: QboRow[]) => {
    for (const r of rows ?? []) {
      if (r.ColData && iAmt !== undefined) {
        const amount = num(r.ColData[iAmt]?.value);
        const date = iDate !== undefined ? r.ColData[iDate]?.value?.trim() : undefined;
        if (Math.abs(amount) >= 0.005 && (date === undefined || /^\d{4}-\d{2}-\d{2}/.test(date ?? ""))) {
          out.push({
            name: (iName !== undefined ? r.ColData[iName]?.value?.trim() : "") || "—",
            docNumber: iDoc !== undefined ? r.ColData[iDoc]?.value?.trim() || undefined : undefined,
            txnDate: date ? date.slice(0, 10) : undefined,
            dueDate: iDue !== undefined ? r.ColData[iDue]?.value?.trim()?.slice(0, 10) || undefined : undefined,
            amount,
          });
        }
      }
      if (r.Rows?.Row) walk(r.Rows.Row);
    }
  };
  walk(report.Rows?.Row);
  return out;
}

async function pullAgingReport(entityId: string, report: "AgedReceivableDetail" | "AgedPayableDetail"): Promise<AgingItem[] | null> {
  const auth = await getAccessToken(entityId);
  if (!auth) return null;
  const url = `${apiBase()}/v3/company/${auth.realmId}/reports/${report}?minorversion=70`;
  try {
    const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/json" } });
    if (res.status === 401) {
      await markNeedsReconnect(entityId);
      return null;
    }
    if (!res.ok) {
      console.error(`QBO ${report} failed:`, res.status);
      return null;
    }
    return parseAgingDetail((await res.json()) as QboReportFull);
  } catch (err) {
    console.error(`QBO ${report} error:`, err);
    return null;
  }
}

/** Open AR invoices with due dates (for cash collections). Null when not connected. */
export function pullArAging(entityId: string): Promise<AgingItem[] | null> {
  return pullAgingReport(entityId, "AgedReceivableDetail");
}
/** Open AP bills with due dates (for cash disbursements). Null when not connected. */
export function pullApAging(entityId: string): Promise<AgingItem[] | null> {
  return pullAgingReport(entityId, "AgedPayableDetail");
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

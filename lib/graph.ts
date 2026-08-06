import { prisma } from "@/lib/prisma";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_URL_TEMPLATE =
  "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token";

/**
 * Returns true when the Microsoft Entra integration is configured. When false,
 * the app runs in "offline" mode: email/calendar features are visible but
 * report that Graph is not connected instead of throwing.
 */
export function graphConfigured() {
  return Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);
}

function tenantFromIssuer(): string {
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ?? "";
  const m = issuer.match(/login\.microsoftonline\.com\/([^/]+)/);
  return m?.[1] ?? "common";
}

/**
 * Fetch a valid delegated Graph access token for a user, refreshing via the
 * stored refresh_token when the current access_token is expired.
 * Returns null when the user has no linked Microsoft account.
 */
export async function getUserGraphToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "microsoft-entra-id" },
  });
  if (!account?.access_token) return null;

  const now = Math.floor(Date.now() / 1000);
  const notExpired = account.expires_at && account.expires_at - 60 > now;
  if (notExpired) return account.access_token;

  if (!account.refresh_token) return account.access_token;

  // Refresh
  const tokenUrl = TOKEN_URL_TEMPLATE.replace("{tenant}", tenantFromIssuer());
  const body = new URLSearchParams({
    client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "",
    client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: account.refresh_token,
    // Must mirror the delegated scopes in lib/auth.ts — Azure only grants the
    // scopes requested here on refresh, so a stale value silently downgrades
    // the token (e.g. dropping Calendars.ReadWrite → no calendar writes).
    scope: "offline_access User.Read Mail.Send Mail.ReadWrite Calendars.ReadWrite",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) return account.access_token; // fall back to (possibly stale) token
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: json.access_token,
      refresh_token: json.refresh_token ?? account.refresh_token,
      expires_at: now + json.expires_in,
    },
  });
  return json.access_token;
}

async function graphFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph ${res.status}: ${text}`);
  }
  return res;
}

/** Send an email as the given user via Graph and save it to Sent Items. */
export async function sendMailAsUser(opts: {
  userId: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const token = await getUserGraphToken(opts.userId);
  if (!token) return { ok: false, error: "Microsoft 365 account not connected." };

  try {
    await graphFetch(token, "/me/sendMail", {
      method: "POST",
      body: JSON.stringify({
        message: {
          subject: opts.subject,
          body: { contentType: "HTML", content: opts.html },
          toRecipients: [{ emailAddress: { address: opts.to } }],
        },
        saveToSentItems: true,
      }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}

export type GraphMessage = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  from?: { emailAddress?: { address?: string } };
};

/** Pull recent inbound messages from a specific sender address. */
export async function fetchInboundFrom(
  userId: string,
  senderEmail: string,
): Promise<GraphMessage[]> {
  const token = await getUserGraphToken(userId);
  if (!token) return [];
  const filter = encodeURIComponent(`from/emailAddress/address eq '${senderEmail}'`);
  const res = await graphFetch(
    token,
    `/me/messages?$filter=${filter}&$top=20&$select=id,subject,bodyPreview,receivedDateTime,from&$orderby=receivedDateTime desc`,
  );
  const json = (await res.json()) as { value: GraphMessage[] };
  return json.value ?? [];
}

export type GraphEvent = {
  id: string;
  subject?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  attendees?: { emailAddress?: { address?: string; name?: string } }[];
};

/** Pull calendar events in a date window for a user. */
export async function fetchCalendarEvents(
  userId: string,
  startISO: string,
  endISO: string,
): Promise<GraphEvent[]> {
  const token = await getUserGraphToken(userId);
  if (!token) return [];
  const res = await graphFetch(
    token,
    `/me/calendarView?startDateTime=${startISO}&endDateTime=${endISO}&$top=100&$select=id,subject,start,end,attendees&$orderby=start/dateTime`,
  );
  const json = (await res.json()) as { value: GraphEvent[] };
  return json.value ?? [];
}

export type BusyWindow = { start: Date; end: Date };

/**
 * Fetch busy intervals from the user's Outlook calendar in a window, in UTC.
 * Uses the Prefer header so Graph returns UTC times (calendarView is otherwise
 * in the mailbox timezone). Free/tentative-hidden events are excluded. Returns
 * [] when the user isn't connected — callers treat that as "no known conflicts".
 */
export async function fetchBusyWindows(
  userId: string,
  startISO: string,
  endISO: string,
): Promise<BusyWindow[]> {
  const token = await getUserGraphToken(userId);
  if (!token) return [];
  const res = await graphFetch(
    token,
    `/me/calendarView?startDateTime=${startISO}&endDateTime=${endISO}&$top=200&$select=start,end,showAs&$orderby=start/dateTime`,
    { headers: { Prefer: 'outlook.timezone="UTC"' } },
  );
  const json = (await res.json()) as {
    value: { start?: { dateTime?: string }; end?: { dateTime?: string }; showAs?: string }[];
  };
  const out: BusyWindow[] = [];
  for (const ev of json.value ?? []) {
    if (ev.showAs === "free") continue;
    if (!ev.start?.dateTime || !ev.end?.dateTime) continue;
    // Graph returns UTC without a "Z"; append it so Date parses as UTC.
    const s = new Date(`${ev.start.dateTime}Z`.replace("ZZ", "Z"));
    const e = new Date(`${ev.end.dateTime}Z`.replace("ZZ", "Z"));
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) out.push({ start: s, end: e });
  }
  return out;
}

/**
 * Create a calendar event on the host's Outlook calendar (no Teams meeting —
 * we carry a Zoom link in the location/body). Returns the event id, or null if
 * the host isn't connected or the call fails. Best-effort: never throws.
 */
export async function createCalendarEvent(
  userId: string,
  opts: {
    subject: string;
    startISO: string; // UTC ISO
    endISO: string; // UTC ISO
    bodyHtml?: string;
    location?: string;
    attendees?: { email: string; name?: string }[];
  },
): Promise<string | null> {
  const token = await getUserGraphToken(userId);
  if (!token) return null;
  try {
    const res = await graphFetch(token, "/me/events", {
      method: "POST",
      body: JSON.stringify({
        subject: opts.subject,
        body: { contentType: "HTML", content: opts.bodyHtml ?? "" },
        start: { dateTime: opts.startISO, timeZone: "UTC" },
        end: { dateTime: opts.endISO, timeZone: "UTC" },
        ...(opts.location ? { location: { displayName: opts.location } } : {}),
        attendees: (opts.attendees ?? []).map((a) => ({
          emailAddress: { address: a.email, name: a.name ?? a.email },
          type: "required",
        })),
      }),
    });
    const json = (await res.json()) as { id?: string };
    return json.id ?? null;
  } catch (e) {
    // Best-effort: never break the booking, but surface why in the logs
    // (e.g. a missing Calendars.ReadWrite scope shows up as Graph 403 here).
    console.error("createCalendarEvent failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Delete a calendar event by id. Best-effort. */
export async function deleteCalendarEvent(userId: string, eventId: string): Promise<boolean> {
  const token = await getUserGraphToken(userId);
  if (!token) return false;
  try {
    await graphFetch(token, `/me/events/${eventId}`, { method: "DELETE" });
    return true;
  } catch (e) {
    console.error("deleteCalendarEvent failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

// ── Mail triage (Karbon-style inbox) ──────────────────────────────────────

export type MailAddress = { name?: string; address?: string };

export type MailListItem = {
  id: string;
  conversationId?: string;
  subject: string;
  from: MailAddress | null;
  toRecipients: MailAddress[];
  receivedDateTime: string | null;
  bodyPreview: string;
  isRead: boolean;
  hasAttachments: boolean;
  categories: string[];
};

export type MailFull = MailListItem & {
  ccRecipients: MailAddress[];
  bodyHtml: string;
  bodyContentType: string;
  webLink?: string;
};

const MAIL_LIST_SELECT =
  "id,conversationId,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,hasAttachments,categories";

function addr(a?: { emailAddress?: { name?: string; address?: string } }): MailAddress | null {
  if (!a?.emailAddress) return null;
  return { name: a.emailAddress.name, address: a.emailAddress.address };
}
function addrs(list?: { emailAddress?: { name?: string; address?: string } }[]): MailAddress[] {
  return (list ?? []).map((a) => addr(a)).filter((x): x is MailAddress => Boolean(x));
}

/** List messages from a well-known folder (default Inbox), newest first. */
export async function listMailMessages(
  userId: string,
  opts: { folder?: string; top?: number; unreadOnly?: boolean; search?: string } = {},
): Promise<MailListItem[]> {
  const token = await getUserGraphToken(userId);
  if (!token) return [];
  const folder = opts.folder || "inbox";
  const top = Math.min(Math.max(opts.top ?? 40, 1), 100);
  const params = new URLSearchParams();
  params.set("$top", String(top));
  params.set("$select", MAIL_LIST_SELECT);

  // $search can't be combined with $orderby/$filter; branch accordingly.
  const headers: Record<string, string> = {};
  if (opts.search) {
    params.set("$search", `"${opts.search.replace(/"/g, '')}"`);
  } else {
    params.set("$orderby", "receivedDateTime desc");
    if (opts.unreadOnly) params.set("$filter", "isRead eq false");
  }

  const res = await graphFetch(
    token,
    `/me/mailFolders/${folder}/messages?${params.toString()}`,
    { headers },
  );
  const json = (await res.json()) as { value: RawMessage[] };
  return (json.value ?? []).map(toListItem);
}

type RawMessage = {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  ccRecipients?: { emailAddress?: { name?: string; address?: string } }[];
  receivedDateTime?: string;
  bodyPreview?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  categories?: string[];
  body?: { contentType?: string; content?: string };
  webLink?: string;
};

function toListItem(m: RawMessage): MailListItem {
  return {
    id: m.id,
    conversationId: m.conversationId,
    subject: m.subject || "(no subject)",
    from: addr(m.from),
    toRecipients: addrs(m.toRecipients),
    receivedDateTime: m.receivedDateTime ?? null,
    bodyPreview: m.bodyPreview ?? "",
    isRead: Boolean(m.isRead),
    hasAttachments: Boolean(m.hasAttachments),
    categories: m.categories ?? [],
  };
}

/** Fetch a single message with its full HTML body. */
export async function getMailMessage(userId: string, id: string): Promise<MailFull | null> {
  const token = await getUserGraphToken(userId);
  if (!token) return null;
  const res = await graphFetch(
    token,
    `/me/messages/${id}?$select=${MAIL_LIST_SELECT},ccRecipients,body,webLink`,
  );
  const m = (await res.json()) as RawMessage;
  return {
    ...toListItem(m),
    ccRecipients: addrs(m.ccRecipients),
    bodyHtml: m.body?.content ?? "",
    bodyContentType: m.body?.contentType ?? "html",
    webLink: m.webLink,
  };
}

/** Reply to a message in-thread with an HTML body. Best-effort. */
export async function replyToMail(
  userId: string,
  id: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = await getUserGraphToken(userId);
  if (!token) return { ok: false, error: "Microsoft 365 account not connected." };
  try {
    // Create a reply draft, set its HTML body, then send — preserves threading.
    const draftRes = await graphFetch(token, `/me/messages/${id}/createReply`, { method: "POST" });
    const draft = (await draftRes.json()) as { id: string };
    await graphFetch(token, `/me/messages/${draft.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: { contentType: "HTML", content: html } }),
    });
    await graphFetch(token, `/me/messages/${draft.id}/send`, { method: "POST" });
    return { ok: true };
  } catch (e) {
    console.error("replyToMail failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof Error ? e.message : "Reply failed" };
  }
}

/** Move a message to a well-known folder (default Archive). Best-effort. */
export async function moveMail(
  userId: string,
  id: string,
  destinationId = "archive",
): Promise<{ ok: boolean; error?: string }> {
  const token = await getUserGraphToken(userId);
  if (!token) return { ok: false, error: "Not connected." };
  try {
    await graphFetch(token, `/me/messages/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ destinationId }),
    });
    return { ok: true };
  } catch (e) {
    console.error("moveMail failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof Error ? e.message : "Move failed" };
  }
}

/** Set the categories (tags) on a message. Syncs to Outlook. Best-effort. */
export async function setMailCategories(
  userId: string,
  id: string,
  categories: string[],
): Promise<{ ok: boolean; error?: string }> {
  const token = await getUserGraphToken(userId);
  if (!token) return { ok: false, error: "Not connected." };
  try {
    await graphFetch(token, `/me/messages/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ categories }),
    });
    return { ok: true };
  } catch (e) {
    console.error("setMailCategories failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof Error ? e.message : "Tag failed" };
  }
}

/** Mark a message read/unread. Best-effort. */
export async function setMailRead(
  userId: string,
  id: string,
  isRead: boolean,
): Promise<{ ok: boolean }> {
  const token = await getUserGraphToken(userId);
  if (!token) return { ok: false };
  try {
    await graphFetch(token, `/me/messages/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ isRead }),
    });
    return { ok: true };
  } catch (e) {
    console.error("setMailRead failed:", e instanceof Error ? e.message : e);
    return { ok: false };
  }
}

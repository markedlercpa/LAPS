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
    scope: "offline_access User.Read Mail.Send Mail.Read Calendars.Read",
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

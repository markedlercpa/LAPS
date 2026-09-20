import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { auth } from "@/lib/auth";
import { graphConfigured, listMailMessages, type MailListItem } from "@/lib/graph";
import { InboxClient } from "@/components/inbox/inbox-client";

export const dynamic = "force-dynamic";

async function originFromHeaders(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "localhost:3000"}`;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; unread?: string; q?: string }>;
}) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/signin");

  const sp = await searchParams;
  const folder = sp.folder === "archive" ? "archive" : "inbox";
  const unreadOnly = sp.unread === "1";
  const search = sp.q?.trim() || undefined;

  const connected = graphConfigured();
  let messages: MailListItem[] = [];
  let loadError: string | null = null;
  if (connected) {
    try {
      messages = await listMailMessages(userId, { folder, unreadOnly, search, top: 50 });
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Couldn't load mail.";
    }
  }
  const baseUrl = await originFromHeaders();

  return (
    <div>
      <PageHeader
        eyebrow="Inbox — Triage"
        title="Email triage"
        description="Your Microsoft 365 mail. Read, reply, archive, tag, and turn messages into work."
      />

      {!connected ? (
        <div className="border-2 border-divider bg-surface p-8 text-center text-muted">
          Microsoft 365 isn&apos;t connected. Sign in with Microsoft to load your inbox.
        </div>
      ) : (
        <>
          {/* Filters */}
          <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
            <div className="seg" role="tablist">
              <label className="seg-opt">
                <input type="radio" name="folder" value="inbox" defaultChecked={folder === "inbox"} />
                Inbox
              </label>
              <label className="seg-opt">
                <input type="radio" name="folder" value="archive" defaultChecked={folder === "archive"} />
                Archive
              </label>
            </div>
            <label className="flex items-center gap-1.5 text-[13px] text-muted">
              <input type="checkbox" name="unread" value="1" defaultChecked={unreadOnly} /> Unread only
            </label>
            <div className="field flex-1" style={{ minWidth: 200 }}>
              <input name="q" className="input" defaultValue={search ?? ""} placeholder="Search mail…" />
            </div>
            <button className="btn btn-secondary" type="submit">Apply</button>
          </form>

          {loadError ? (
            <div className="border-2 border-divider bg-surface p-6 text-center text-accent-700">
              {loadError}
            </div>
          ) : (
            <InboxClient messages={messages} folder={folder} baseUrl={baseUrl} />
          )}
        </>
      )}
    </div>
  );
}

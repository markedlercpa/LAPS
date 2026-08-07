"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Plus, Loader2 } from "lucide-react";
import { createConnectorToken, revokeConnectorToken } from "@/app/(dashboard)/settings/actions";
import { formatDate } from "@/lib/utils";

export type TokenRow = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  user: string;
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-2">
      <div className="micro-label mb-1">{label}</div>
      <div className="flex items-stretch gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap border border-divider bg-bg px-2 py-1.5 text-[12px]">
          {value}
        </code>
        <button
          className="btn btn-secondary text-[12px]"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function ConnectorSettings({
  appUrl,
  tokens,
  isAdmin,
}: {
  appUrl: string;
  tokens: TokenRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mcpUrl = `${appUrl.replace(/\/$/, "")}/api/mcp`;

  function generate() {
    if (!name.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await createConnectorToken({ name });
      if (res.ok) {
        setNewToken(res.token);
        setName("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      await revokeConnectorToken(id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="card mb-6">
        <div className="micro-label mb-2">How to connect</div>
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-[14px]">
          <li>In claude.ai, open <strong>Settings → Connectors → Add custom connector</strong>.</li>
          <li>Paste the URL below.</li>
          <li>Open <strong>Advanced → request headers</strong> and add an <code>Authorization</code> header with the value <code>Bearer &lt;your token&gt;</code>.</li>
          <li>Save, then enable LAPS in a chat&apos;s tools. (Custom connectors need a paid Claude plan.)</li>
        </ol>
        <CopyField label="Connector URL" value={mcpUrl} />
      </div>

      {isAdmin ? (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <label className="field flex-1" style={{ minWidth: 220 }}>
              <span className="micro-label">New token name</span>
              <input
                className="input"
                placeholder="e.g. Mark’s laptop"
                value={name}
                disabled={pending}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && generate()}
              />
            </label>
            <button className="btn btn-primary" onClick={generate} disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Generate token
            </button>
          </div>
          {error && <p className="mb-3 text-[13px] text-accent-700">{error}</p>}

          {newToken && (
            <div className="card mb-6 border-2 border-ink">
              <div className="micro-label mb-1 text-accent-700">Copy this token now — it won&apos;t be shown again</div>
              <CopyField label="Authorization header value" value={`Bearer ${newToken}`} />
              <button className="btn btn-ghost text-[12px]" onClick={() => setNewToken(null)}>
                Done
              </button>
            </div>
          )}

          {tokens.length === 0 ? (
            <p className="text-[13px] text-muted">No connector tokens yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Acts as</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td className="font-heading font-extrabold">{t.name}</td>
                    <td className="text-muted">{t.user}</td>
                    <td className="whitespace-nowrap">{formatDate(t.createdAt)}</td>
                    <td className="whitespace-nowrap text-muted">
                      {t.lastUsedAt ? formatDate(t.lastUsedAt) : "—"}
                    </td>
                    <td>
                      {t.revokedAt ? (
                        <span className="tag tag-neutral">Revoked</span>
                      ) : (
                        <span className="tag tag-accent">Active</span>
                      )}
                    </td>
                    <td className="text-right">
                      {!t.revokedAt && (
                        <button
                          className="btn btn-ghost text-[12px] text-accent-700"
                          onClick={() => revoke(t.id)}
                          disabled={pending}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <p className="text-[13px] text-muted">Only admins can create connector tokens.</p>
      )}
    </div>
  );
}

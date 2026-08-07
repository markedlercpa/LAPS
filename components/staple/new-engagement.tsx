"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { createEngagement } from "@/app/(dashboard)/staple/actions";
import { SERVICE_LINES, SERVICE_LINE_LABELS } from "@/lib/staple-taxonomy";

export function NewEngagementButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    const input = {
      legalName: formData.get("legalName"),
      serviceLine: formData.get("serviceLine"),
      contactName: formData.get("contactName") || undefined,
      contactEmail: formData.get("contactEmail") || undefined,
      fee: formData.get("fee") || undefined,
      scopeNarrative: formData.get("scopeNarrative") || undefined,
    };
    startTransition(async () => {
      const res = await createEngagement(input);
      if (res.ok) {
        setOpen(false);
        router.push(`/staple/engagements/${res.id}`);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New engagement
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="New engagement">
        <form action={submit} className="space-y-3">
          <label className="field">
            <span className="micro-label">Client legal name</span>
            <input name="legalName" className="input" required placeholder="Acme Holdings, LLC" />
          </label>
          <label className="field">
            <span className="micro-label">Service line</span>
            <select name="serviceLine" className="input" defaultValue="qofe_buyside">
              {SERVICE_LINES.map((s) => (
                <option key={s} value={s}>
                  {SERVICE_LINE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span className="micro-label">Primary contact</span>
              <input name="contactName" className="input" placeholder="Jane Doe" />
            </label>
            <label className="field">
              <span className="micro-label">Contact email</span>
              <input name="contactEmail" className="input" type="email" placeholder="jane@acme.com" />
            </label>
          </div>
          <label className="field">
            <span className="micro-label">Fee (optional)</span>
            <input name="fee" className="input" type="number" min="0" step="0.01" placeholder="25000" />
          </label>
          <label className="field">
            <span className="micro-label">Scope notes (optional)</span>
            <textarea name="scopeNarrative" className="input" rows={3} />
          </label>
          {error && <p className="text-[13px] text-accent-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Creating…" : "Create engagement"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { createEntity } from "@/app/(dashboard)/pace/actions";
import { ENTITY_KINDS, ENTITY_KIND_LABELS } from "@/lib/pace-taxonomy";

export function NewEntityButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createEntity({ name: formData.get("name"), kind: formData.get("kind") });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add entity
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add entity">
        <form action={submit} className="space-y-3">
          <label className="field">
            <span className="micro-label">Entity name</span>
            <input name="name" className="input" required placeholder="Edler Zain, LLC" />
          </label>
          <label className="field">
            <span className="micro-label">Kind</span>
            <select name="kind" className="input" defaultValue="operating">
              {ENTITY_KINDS.map((k) => (
                <option key={k} value={k}>{ENTITY_KIND_LABELS[k]}</option>
              ))}
            </select>
          </label>
          {error && <p className="text-[13px] text-accent-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Adding…" : "Add entity"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

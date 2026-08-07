"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { createResourceAction } from "@/app/(dashboard)/work/capacity/actions";
import { SKILL_TAGS } from "@/lib/work-taxonomy";

export function NewResourceButton({ bands }: { bands: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  function toggle(tag: string) {
    setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  }

  function submit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createResourceAction({
        personName: fd.get("personName"),
        email: fd.get("email"),
        roleBandId: fd.get("roleBandId"),
        weeklyCapacityHours: fd.get("weeklyCapacityHours"),
        skillTags: tags,
        location: fd.get("location") || undefined,
      });
      if (res.ok) {
        setOpen(false);
        setTags([]);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)} disabled={bands.length === 0}>
        <Plus className="h-4 w-4" /> Add resource
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add pool resource">
        <form action={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span className="micro-label">Name</span>
              <input name="personName" className="input" required />
            </label>
            <label className="field">
              <span className="micro-label">Email (Karbon match key)</span>
              <input name="email" type="email" className="input" required />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span className="micro-label">Role band</span>
              <select name="roleBandId" className="input" required>
                {bands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="micro-label">Weekly capacity (hrs)</span>
              <input name="weeklyCapacityHours" type="number" min="0" max="80" step="1" className="input" defaultValue={40} />
            </label>
          </div>
          <label className="field">
            <span className="micro-label">Location (optional)</span>
            <input name="location" className="input" placeholder="LatAm / US" />
          </label>
          <div className="field">
            <span className="micro-label">Skill tags</span>
            <div className="flex flex-wrap gap-1.5">
              {SKILL_TAGS.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => toggle(t)}
                  className={`tag ${tags.includes(t) ? "tag-accent" : "tag-outline"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-[13px] text-accent-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Add"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

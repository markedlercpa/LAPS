"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createProposal } from "@/app/(dashboard)/proposals/actions";

export type LeadOption = { id: string; name: string };

export function NewProposalButton({ leads }: { leads: LeadOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [leadId, setLeadId] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createProposal({ leadId, title });
      if (res.ok && "id" in res) {
        setOpen(false);
        router.push(`/proposals/${res.id}`);
      } else setError(res.error ?? "Failed");
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New Proposal
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New Proposal">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Client / Lead *</Label>
            <Select value={leadId} onChange={(e) => setLeadId(e.target.value)} required>
              <option value="">Select a lead…</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Proposal title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. CAS Engagement"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create & edit"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

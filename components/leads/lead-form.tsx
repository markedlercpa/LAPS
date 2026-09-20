"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LEAD_SOURCES } from "@/lib/constants";
import { createLead, updateLead } from "@/app/(dashboard)/leads/actions";

export type LeadFormValues = {
  firstName: string;
  lastName: string;
  companyName: string;
  leadSource: string;
  email: string;
  phone: string;
  notes: string;
  revenueEstimate: string;
  headcountEstimate: string;
};

const EMPTY: LeadFormValues = {
  firstName: "",
  lastName: "",
  companyName: "",
  leadSource: "",
  email: "",
  phone: "",
  notes: "",
  revenueEstimate: "",
  headcountEstimate: "",
};

export function LeadForm({
  leadId,
  initial,
  onDone,
}: {
  leadId?: string;
  initial?: Partial<LeadFormValues>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<LeadFormValues>({ ...EMPTY, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (k: keyof LeadFormValues, v: string) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = leadId
        ? await updateLead(leadId, values)
        : await createLead(values);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong");
        return;
      }
      onDone?.();
      router.refresh();
      if (!leadId && "id" in res && res.id) router.push(`/leads/${res.id}`);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>First name *</Label>
          <Input value={values.firstName} onChange={(e) => set("firstName", e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Last name *</Label>
          <Input value={values.lastName} onChange={(e) => set("lastName", e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Company</Label>
        <Input value={values.companyName} onChange={(e) => set("companyName", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Lead source</Label>
          <Select value={values.leadSource} onChange={(e) => set("leadSource", e.target.value)}>
            <option value="">Select…</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={values.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Est. revenue ($)</Label>
          <Input
            type="number"
            min={0}
            step={1000}
            placeholder="e.g. 5000000"
            value={values.revenueEstimate}
            onChange={(e) => set("revenueEstimate", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Est. headcount</Label>
          <Input
            type="number"
            min={0}
            placeholder="e.g. 40"
            value={values.headcountEstimate}
            onChange={(e) => set("headcountEstimate", e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : leadId ? "Save changes" : "Create lead"}
        </Button>
      </div>
    </form>
  );
}

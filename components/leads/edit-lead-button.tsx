"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { LeadForm, type LeadFormValues } from "@/components/leads/lead-form";

export function EditLeadButton({
  leadId,
  initial,
}: {
  leadId: string;
  initial: Partial<LeadFormValues>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit Lead">
        <LeadForm leadId={leadId} initial={initial} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { LeadForm } from "@/components/leads/lead-form";

export function NewLeadButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New Lead
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New Lead">
        <LeadForm onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

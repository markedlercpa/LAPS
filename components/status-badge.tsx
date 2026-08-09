import type { Stage, ProposalStatus, AppointmentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import {
  STAGE_LABELS,
  STAGE_COLORS,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_COLORS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_COLORS,
} from "@/lib/constants";

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge className={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Badge>;
}

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <Badge className={PROPOSAL_STATUS_COLORS[status]}>
      {PROPOSAL_STATUS_LABELS[status]}
    </Badge>
  );
}

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <Badge className={APPOINTMENT_STATUS_COLORS[status]}>
      {APPOINTMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

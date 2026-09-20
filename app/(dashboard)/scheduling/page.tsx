import { redirect } from "next/navigation";

// Scheduling is now the "Booking setup" tab of Appointments.
export default function SchedulingRedirect() {
  redirect("/appointments?view=setup");
}

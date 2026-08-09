"use server";

import { captureSubmission, type CaptureInput, type CaptureResult } from "@/lib/leadmagnets/capture";

/** Public (unauthenticated) lead-magnet capture. Runs the Content → Leads
 * bridge and returns download access for file magnets. */
export async function captureMagnetAction(input: CaptureInput): Promise<CaptureResult> {
  return captureSubmission(input);
}

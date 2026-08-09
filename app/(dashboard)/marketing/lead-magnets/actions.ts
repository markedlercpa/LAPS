"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { createMagnet, updateMagnet, setMagnetStatus, deleteMagnet } from "@/lib/leadmagnets/magnets";
import { putObject, storageConfigured } from "@/lib/staple/storage";
import { asQuizConfig } from "@/lib/leadmagnets/quiz";
import { asAuditConfig } from "@/lib/leadmagnets/audit";

async function requireUser() {
  const session = await auth();
  return session?.user?.id ?? null;
}

const KINDS = ["EBOOK", "TEMPLATE", "TOOL", "QUIZ", "AUDIT_CALL", "CALCULATOR", "QBO_SNAPSHOT", "WEBINAR", "EMAIL_COURSE"] as const;

const createSchema = z.object({
  title: z.string().min(1, "Title is required"),
  kind: z.enum(KINDS),
  baseScore: z.coerce.number().int().min(0).max(500).default(15),
});

export async function createMagnetAction(input: unknown) {
  const userId = await requireUser();
  if (!userId) return { ok: false as const, error: "Not signed in" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const m = await createMagnet({ ...parsed.data, createdBy: userId });
  revalidatePath("/marketing/lead-magnets");
  return { ok: true as const, id: m.id };
}

const updateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  kind: z.enum(KINDS).optional(),
  baseScore: z.coerce.number().int().min(0).max(500).optional(),
  headline: z.string().optional().nullable(),
  subhead: z.string().optional().nullable(),
  body: z.string().optional().nullable(),
  ctaLabel: z.string().optional().nullable(),
  downloadUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")).nullable(),
  deliverByEmail: z.coerce.boolean().optional(),
});

export async function updateMagnetAction(input: unknown) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const { id, downloadUrl, ...rest } = parsed.data;
  await updateMagnet(id, { ...rest, ...(downloadUrl !== undefined ? { downloadUrl: downloadUrl || null } : {}) });
  revalidatePath("/marketing/lead-magnets");
  revalidatePath(`/marketing/lead-magnets/${id}`);
  return { ok: true as const };
}

export async function setMagnetStatusAction(id: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  await setMagnetStatus(id, status);
  revalidatePath("/marketing/lead-magnets");
  revalidatePath(`/marketing/lead-magnets/${id}`);
  return { ok: true as const };
}

export async function deleteMagnetAction(id: string) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  await deleteMagnet(id);
  revalidatePath("/marketing/lead-magnets");
  return { ok: true as const };
}

/** Save the quiz/scorecard config (questions, option weights, score bands). */
export async function saveQuizConfigAction(id: string, config: unknown) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  const clean = asQuizConfig(config);
  await updateMagnet(id, { config: clean as unknown as object });
  revalidatePath(`/marketing/lead-magnets/${id}`);
  return { ok: true as const };
}

/** Save the diagnostic/audit-call application config (questions + qualify rule). */
export async function saveAuditConfigAction(id: string, config: unknown) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  await updateMagnet(id, { config: asAuditConfig(config) as unknown as object });
  revalidatePath(`/marketing/lead-magnets/${id}`);
  return { ok: true as const };
}

/** Upload the downloadable file to S3 and attach it to the magnet. */
export async function uploadMagnetFileAction(formData: FormData) {
  if (!(await requireUser())) return { ok: false as const, error: "Not signed in" };
  if (!storageConfigured()) return { ok: false as const, error: "File storage isn’t configured. Set the S3 env vars, or use an external download URL instead." };
  const id = String(formData.get("id") ?? "");
  const file = formData.get("file");
  if (!id) return { ok: false as const, error: "Missing magnet id" };
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Choose a file to upload" };
  if (file.size > 50 * 1024 * 1024) return { ok: false as const, error: "File is over the 50 MB limit" };

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `leadmagnets/${id}/${safe}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const put = await putObject(key, bytes, file.type || "application/octet-stream");
  if (!put.ok) return { ok: false as const, error: put.error ?? "Upload failed" };

  await updateMagnet(id, { fileStorageKey: key, fileName: file.name, fileContentType: file.type || null, fileSizeBytes: file.size });
  revalidatePath(`/marketing/lead-magnets/${id}`);
  return { ok: true as const, fileName: file.name };
}

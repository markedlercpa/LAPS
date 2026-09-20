import { prisma } from "@/lib/prisma";
import type { LeadMagnet, TrustSignalKind } from "@prisma/client";
import { signedGetUrl } from "@/lib/staple/storage";
import { graphConfigured, sendMailAsUser } from "@/lib/graph";
import { isDownloadKind } from "@/lib/leadmagnets/taxonomy";

/**
 * The Content → Leads bridge. Every lead-magnet consumption event runs through
 * here: match-or-create a Lead by email, score it (magnet base + any computed
 * component), record an auditable TrustSignal + a timeline Activity, store the
 * submission, and return download access for file magnets. Best-effort email
 * delivery via the magnet owner's mailbox when Microsoft 365 is connected.
 */

export type CaptureInput = {
  slug: string;
  email: string;
  name?: string | null;
  company?: string | null;
  source?: string | null; // free-form / UTM
  contentItemId?: string | null;
  answers?: unknown; // quiz/calculator payload (later kinds)
  computedScore?: number; // added on top of the magnet's base score
};

export type CaptureResult =
  | { ok: false; error: string }
  | {
      ok: true;
      leadId: string;
      score: number;
      download: { url: string; fileName: string | null } | null;
    };

function splitName(name: string | null | undefined, email: string): { first: string; last: string } {
  const n = (name ?? "").trim();
  if (n) {
    const parts = n.split(/\s+/);
    return { first: parts[0], last: parts.slice(1).join(" ") };
  }
  return { first: email.split("@")[0] || "Lead", last: "" };
}

function signalKind(kind: LeadMagnet["kind"]): TrustSignalKind {
  switch (kind) {
    case "EBOOK":
    case "TEMPLATE":
    case "TOOL":
      return "DOWNLOAD";
    case "WEBINAR":
      return "WEBINAR";
    case "AUDIT_CALL":
    case "QBO_SNAPSHOT":
      return "INBOUND_INQUIRY";
    default:
      return "CONTENT_ENGAGE";
  }
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function captureSubmission(input: CaptureInput): Promise<CaptureResult> {
  const email = input.email.trim().toLowerCase();
  if (!isEmail(email)) return { ok: false, error: "Enter a valid email address." };

  const magnet = await prisma.leadMagnet.findFirst({ where: { slug: input.slug, status: "PUBLISHED" } });
  if (!magnet) return { ok: false, error: "This resource isn’t available." };

  const score = magnet.baseScore + Math.max(0, Math.round(input.computedScore ?? 0));

  // Match an existing lead by email (case-insensitive), else create one.
  const existing = await prisma.lead.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  let leadId: string;
  if (existing) {
    const { first, last } = splitName(input.name, email);
    leadId = existing.id;
    await prisma.lead.update({
      where: { id: existing.id },
      data: {
        trustScore: { increment: score },
        // Backfill blanks only — never overwrite known values.
        companyName: existing.companyName ?? input.company ?? undefined,
        firstName: existing.firstName || first,
        lastName: existing.lastName || last,
      },
    });
  } else {
    const { first, last } = splitName(input.name, email);
    const created = await prisma.lead.create({
      data: {
        firstName: first,
        lastName: last,
        email,
        companyName: input.company ?? null,
        leadSource: `lead_magnet:${magnet.slug}`,
        stage: "NEW",
        trustScore: score,
      },
    });
    leadId = created.id;
  }

  await prisma.trustSignal.create({
    data: {
      leadId,
      kind: signalKind(magnet.kind),
      weight: score,
      note: `Lead magnet: ${magnet.title}`,
      source: `lead_magnet:${magnet.slug}`,
      contentRef: input.contentItemId ?? input.source ?? null,
    },
  });

  await prisma.activity.create({
    data: {
      leadId,
      type: "OTHER",
      direction: "IN",
      subject: `Lead magnet: ${magnet.title}`,
      body: `Consumed “${magnet.title}” (${magnet.kind}). Score +${score}.`,
      metadata: { magnetId: magnet.id, magnetSlug: magnet.slug, source: input.source ?? null, contentItemId: input.contentItemId ?? null },
    },
  });

  await prisma.leadMagnetSubmission.create({
    data: {
      magnetId: magnet.id,
      email,
      name: input.name ?? null,
      company: input.company ?? null,
      answers: input.answers ? (input.answers as object) : undefined,
      score,
      source: input.source ?? null,
      contentItemId: input.contentItemId ?? null,
      leadId,
    },
  });

  // Download access for file magnets: signed S3 link, else the external URL.
  let download: { url: string; fileName: string | null } | null = null;
  if (isDownloadKind(magnet.kind)) {
    const url = magnet.fileStorageKey ? await signedGetUrl(magnet.fileStorageKey, 24 * 3600) : magnet.downloadUrl;
    if (url) download = { url, fileName: magnet.fileName ?? null };
  }

  // Best-effort email delivery of the download link.
  if (download && magnet.deliverByEmail && magnet.createdBy && graphConfigured()) {
    const html = `<p>Thanks for grabbing <strong>${magnet.title}</strong>.</p>
      <p><a href="${download.url}">Download it here</a>${magnet.fileName ? ` (${magnet.fileName})` : ""}.</p>
      <p>The link is valid for 24 hours.</p>`;
    await sendMailAsUser({ userId: magnet.createdBy, to: email, subject: `Your download: ${magnet.title}`, html }).catch(() => null);
  }

  return { ok: true, leadId, score, download };
}

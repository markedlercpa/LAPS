import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage for STAPLE FileAssets, behind a feature flag (mirrors the
 * graphConfigured()/stripeConfigured() idiom). Works with any S3-compatible
 * store (AWS S3, Cloudflare R2, Backblaze B2, MinIO). When unconfigured, the
 * whole module degrades gracefully: FileAssets can still be recorded as
 * metadata; only byte upload/download is disabled.
 *
 * Env: STAPLE_S3_BUCKET, STAPLE_S3_REGION, STAPLE_S3_ACCESS_KEY_ID,
 * STAPLE_S3_SECRET_ACCESS_KEY, and optional STAPLE_S3_ENDPOINT (for R2/B2/MinIO).
 */

export function storageConfigured(): boolean {
  return Boolean(
    process.env.STAPLE_S3_BUCKET &&
      process.env.STAPLE_S3_ACCESS_KEY_ID &&
      process.env.STAPLE_S3_SECRET_ACCESS_KEY,
  );
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: process.env.STAPLE_S3_REGION || "us-east-1",
    endpoint: process.env.STAPLE_S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.STAPLE_S3_ENDPOINT), // R2/B2/MinIO need path-style
    credentials: {
      accessKeyId: process.env.STAPLE_S3_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.STAPLE_S3_SECRET_ACCESS_KEY as string,
    },
  });
  return client;
}

function bucket(): string {
  return process.env.STAPLE_S3_BUCKET as string;
}

/** Upload bytes to a key. Returns { ok } — never throws to the caller. */
export async function putObject(
  key: string,
  body: Uint8Array | Buffer,
  contentType?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!storageConfigured()) return { ok: false, error: "File storage not configured" };
  try {
    await getClient().send(
      new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
  }
}

/** Presigned URL to download an object (default 1h). */
export async function signedGetUrl(key: string, expiresIn = 3600): Promise<string | null> {
  if (!storageConfigured()) return null;
  try {
    return await getSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
      expiresIn,
    });
  } catch {
    return null;
  }
}

/** Presigned URL for a direct client upload (default 1h). */
export async function signedPutUrl(
  key: string,
  contentType?: string,
  expiresIn = 3600,
): Promise<string | null> {
  if (!storageConfigured()) return null;
  try {
    return await getSignedUrl(
      getClient(),
      new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
      { expiresIn },
    );
  } catch {
    return null;
  }
}

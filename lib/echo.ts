import { prisma } from "@/lib/prisma";

export * from "@/lib/echo-taxonomy";

/** ECHO server-side guardrails (banned phrases). */

const BANNED_SEEDS: { phrase: string; reason: string }[] = [
  { phrase: "Wounded Treadmill", reason: "Retired" },
  { phrase: "the valley", reason: "Retired from all content" },
  {
    phrase: "Enhancing confidence in accounting decisions",
    reason: "Permanently retired",
  },
];

let seeded = false;

export async function ensureBannedPhrasesSeeded() {
  if (seeded) return;
  for (const b of BANNED_SEEDS) {
    await prisma.bannedPhrase.upsert({
      where: { phrase: b.phrase },
      update: { reason: b.reason },
      create: b,
    });
  }
  seeded = true;
}

export async function listBannedPhrases(): Promise<{ phrase: string; reason: string | null }[]> {
  await ensureBannedPhrasesSeeded();
  return prisma.bannedPhrase.findMany({ orderBy: { phrase: "asc" } });
}

/** Returns the banned phrases found in `text` (case-insensitive), or []. */
export async function findBannedPhrases(text: string): Promise<string[]> {
  const all = await listBannedPhrases();
  const lower = text.toLowerCase();
  return all.filter((b) => lower.includes(b.phrase.toLowerCase())).map((b) => b.phrase);
}

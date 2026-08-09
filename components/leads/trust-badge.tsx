import { trustBand } from "@/lib/trust-taxonomy";
import { cn } from "@/lib/utils";

/** Compact warmth badge: score + band. Server-safe (no client hooks). */
export function TrustBadge({
  score,
  showScore = true,
  className,
}: {
  score: number;
  showScore?: boolean;
  className?: string;
}) {
  const band = trustBand(score);
  return (
    <span className={cn("tag", band.tag, className)} title={`Trust score ${score}/100`}>
      {band.label}
      {showScore ? ` · ${score}` : ""}
    </span>
  );
}

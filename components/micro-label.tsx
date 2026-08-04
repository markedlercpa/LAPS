import { cn } from "@/lib/utils";

/** 11px uppercase .08em/600 kicker used for section headings and metric labels. */
export function MicroLabel({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "span" | "h2" | "h3";
}) {
  return <Tag className={cn("micro-label", className)}>{children}</Tag>;
}

import * as React from "react";
import { cn } from "@/lib/utils";

/** Modernist tag. Pass a `.tag-accent | .tag-neutral | .tag-outline` in className. */
export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("tag", className)} {...props} />;
}

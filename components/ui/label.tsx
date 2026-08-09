import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Field label — matches Modernist `.field > label` (12px, 70% ink). Callers wrap
 * label + control; we emit the same visual without requiring the `.field` parent.
 */
export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "block text-[12px] text-[color:color-mix(in_srgb,var(--color-text)_70%,transparent)]",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

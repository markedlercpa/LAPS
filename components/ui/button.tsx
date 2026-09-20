import * as React from "react";
import { cn } from "@/lib/utils";

// `default` is the primary (solid accent) action — matches how call sites use
// a bare <Button>. Legacy shadcn variant names alias onto the Modernist set.
type Variant =
  | "default"
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";
type Size = "default" | "sm" | "icon" | "block";

const variants: Record<Variant, string> = {
  default: "btn-primary",
  primary: "btn-primary",
  secondary: "btn-secondary",
  outline: "btn-secondary",
  ghost: "btn-ghost",
  destructive: "btn-primary",
};

const sizes: Record<Size, string> = {
  default: "",
  sm: "text-[13px] px-2 py-1.5 min-h-8",
  icon: "btn-icon",
  block: "btn-block",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn("btn", variants[variant], sizes[size], className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

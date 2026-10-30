import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * `Badge` — a short status or category label. Sans caption face, never mono.
 * Replaces `status-badge` and the per-page chips as surfaces migrate.
 */
export const badgeVariants = cva("ui-badge", {
  variants: {
    tone: {
      neutral: "",
      info: "ui-badge--info",
      success: "ui-badge--success",
      warning: "ui-badge--warning",
      risk: "ui-badge--risk",
      accent: "ui-badge--accent",
    },
    size: {
      sm: "ui-badge--sm",
      md: "",
    },
  },
  defaultVariants: { tone: "neutral", size: "md" },
});

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ tone, size, className, ...rest }: BadgeProps) {
  return <span {...rest} className={cn(badgeVariants({ tone, size }), className)} />;
}

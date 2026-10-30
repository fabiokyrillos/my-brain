import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * `Card` — the only card box in new code. Border + `--elevation-1`, which
 * stays visible in dark mode since A.0. `interactive` adds the hover/focus
 * affordance; the caller still decides what makes it interactive (a wrapping
 * link or a button inside), because a `<div onClick>` is not a control.
 */
export const cardVariants = cva("ui-card", {
  variants: {
    padding: {
      default: "",
      compact: "ui-card--compact",
      none: "ui-card--none",
    },
    tone: {
      default: "",
      subtle: "ui-card--subtle",
      accent: "ui-card--accent",
      inverse: "ui-card--inverse",
    },
    interactive: {
      true: "ui-card--interactive",
      false: "",
    },
  },
  defaultVariants: { padding: "default", tone: "default", interactive: false },
});

export type CardProps = HTMLAttributes<HTMLElement>
  & VariantProps<typeof cardVariants>
  & { readonly as?: "div" | "section" | "article" | "li" | "aside" };

export function Card({ as: Tag = "div", padding, tone, interactive, className, ...rest }: CardProps) {
  return <Tag {...rest} className={cn(cardVariants({ padding, tone, interactive }), className)} />;
}

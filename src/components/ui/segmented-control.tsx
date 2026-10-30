import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * `SegmentedControl` — the single selection control for 2–4 exclusive views.
 *
 * URL-driven on purpose: every view in this product is a route or a query
 * (`?view=`), so the options are links and the active one carries
 * `aria-current="page"`. That keeps the control a server component and the
 * selection shareable. Replaces the per-page pill groups as surfaces migrate.
 */
export const segmentedVariants = cva("ui-segmented", {
  variants: {
    size: {
      sm: "ui-segmented--sm",
      md: "",
    },
  },
  defaultVariants: { size: "md" },
});

export type SegmentedOption = {
  readonly value: string;
  readonly label: ReactNode;
  readonly href: string;
};

export type SegmentedControlProps = VariantProps<typeof segmentedVariants> & {
  readonly options: readonly SegmentedOption[];
  readonly value: string;
  /** Accessible name of the group, e.g. "Visão". */
  readonly label: string;
  readonly prefetch?: boolean;
  readonly className?: string;
};

export function SegmentedControl({ options, value, label, prefetch, size, className }: SegmentedControlProps) {
  return (
    <nav aria-label={label} className={cn(segmentedVariants({ size }), className)}>
      {options.map((option) => (
        <Link
          aria-current={option.value === value ? "page" : undefined}
          className="ui-segmented__option"
          href={option.href}
          key={option.value}
          prefetch={prefetch}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}

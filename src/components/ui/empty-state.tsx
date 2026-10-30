import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * `EmptyState` — quiet by default. The blue information box (`tone="info"`)
 * is reserved for a fact the user must act on; an empty list is not one.
 */
export const emptyStateVariants = cva("ui-empty", {
  variants: {
    size: {
      default: "",
      compact: "ui-empty--compact",
    },
    tone: {
      quiet: "",
      info: "ui-empty--info",
    },
  },
  defaultVariants: { size: "default", tone: "quiet" },
});

export type EmptyStateProps = VariantProps<typeof emptyStateVariants> & {
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** One action at most — a `Button` or `ButtonLink`. */
  readonly action?: ReactNode;
  readonly className?: string;
};

export function EmptyState({ icon, title, description, action, size, tone, className }: EmptyStateProps) {
  return (
    <div className={cn(emptyStateVariants({ size, tone }), className)}>
      {icon ? <span aria-hidden="true" className="ui-empty__icon">{icon}</span> : null}
      <p className="ui-empty__title">{title}</p>
      {description ? <p className="ui-empty__body">{description}</p> : null}
      {action ? <div className="ui-empty__action">{action}</div> : null}
    </div>
  );
}

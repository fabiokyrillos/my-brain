import { cva, type VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * `PageHeader` — title, optional one-line description, optional actions.
 *
 * There is deliberately **no eyebrow slot**: the baseline opened every page
 * with eyebrow + display title + lead and spent 30–40% of an iPhone screen
 * before any content (DESIGN_DIRECTION.md §1). `compact` hides the description
 * on phones; a page that needs the explanation puts it in an empty state or a
 * disclosure, not above the content.
 */
export const pageHeaderVariants = cva("ui-page-header", {
  variants: {
    size: {
      default: "",
      compact: "ui-page-header--compact",
    },
  },
  defaultVariants: { size: "default" },
});

export type PageHeaderProps = VariantProps<typeof pageHeaderVariants> & {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  /** `h1` on a route page; `h2` when the header opens a section inside one. */
  readonly headingLevel?: 1 | 2;
  readonly className?: string;
};

export function PageHeader({ title, description, actions, headingLevel = 1, size, className }: PageHeaderProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <header className={cn(pageHeaderVariants({ size }), className)}>
      <div className="ui-page-header__text">
        <Heading className="ui-page-header__title">{title}</Heading>
        {description ? <p className="ui-page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </header>
  );
}

import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * `ListItem` — one row: leading slot, title, meta line, trailing slot.
 *
 * With `href` the whole row is the link (a `next/link`), which is what a
 * phone wants: the row is the target, not a 29px "Abrir" inside it. Without
 * `href` it is a plain row and the caller puts controls in the slots.
 * `List` is the bare `<ul>`; items without `href` render as `<li>`, items with
 * `href` render `<li><a/></li>` so list semantics survive.
 */
export const listItemVariants = cva("ui-list-item", {
  variants: {
    density: {
      comfortable: "",
      compact: "ui-list-item--compact",
    },
    interactive: {
      true: "ui-list-item--interactive",
      false: "",
    },
  },
  defaultVariants: { density: "comfortable", interactive: false },
});

export type ListItemProps = VariantProps<typeof listItemVariants> & {
  readonly title: ReactNode;
  readonly meta?: ReactNode;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly href?: string;
  readonly prefetch?: boolean;
  readonly className?: string;
  readonly "aria-current"?: HTMLAttributes<HTMLElement>["aria-current"];
};

function Body({ title, meta }: Pick<ListItemProps, "title" | "meta">) {
  return (
    <span className="ui-list-item__body">
      <span className="ui-list-item__title">{title}</span>
      {meta ? <span className="ui-list-item__meta">{meta}</span> : null}
    </span>
  );
}

export function ListItem({ title, meta, leading, trailing, href, prefetch, density, interactive, className, ...rest }: ListItemProps) {
  const classes = cn(listItemVariants({ density, interactive: interactive ?? Boolean(href) }), className);
  const content = (
    <>
      {leading ? <span className="ui-list-item__leading">{leading}</span> : null}
      <Body meta={meta} title={title} />
      {trailing ? <span className="ui-list-item__trailing">{trailing}</span> : null}
    </>
  );
  if (href) {
    return (
      <li>
        <Link aria-current={rest["aria-current"]} className={classes} href={href} prefetch={prefetch}>{content}</Link>
      </li>
    );
  }
  return <li aria-current={rest["aria-current"]} className={classes}>{content}</li>;
}

export function List({ className, ...rest }: HTMLAttributes<HTMLUListElement>) {
  return <ul {...rest} className={cn("ui-list", className)} />;
}

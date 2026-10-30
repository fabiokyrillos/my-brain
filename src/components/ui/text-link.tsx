import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * `TextLink` — an inline navigation. Inline links in prose use
 * `underline="always"`; links that sit in rows or lists use the hover default.
 * For a navigation that must look like a call to action use `ButtonLink`.
 */
export const textLinkVariants = cva("ui-link", {
  variants: {
    tone: {
      default: "",
      muted: "ui-link--muted",
      inherit: "ui-link--inherit",
    },
    underline: {
      hover: "",
      always: "ui-link--underline-always",
    },
  },
  defaultVariants: { tone: "default", underline: "hover" },
});

export type TextLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">
  & VariantProps<typeof textLinkVariants>
  & { readonly href: string; readonly prefetch?: boolean; readonly children: ReactNode };

export function TextLink({ href, prefetch, tone, underline, className, children, ...rest }: TextLinkProps) {
  return (
    <Link {...rest} className={cn(textLinkVariants({ tone, underline }), className)} href={href} prefetch={prefetch}>
      {children}
    </Link>
  );
}

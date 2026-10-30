import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * `Button` — the one button of the product (ADR-145 Decision 2).
 *
 * A control that changes data or starts an operation. A control that moves to
 * another page is `ButtonLink` (same look, renders `next/link`) or `TextLink`.
 * Never a `<button>` that pushes a route, never an `<a>` that submits.
 *
 * Styles live in `src/app/ui.css`; the classes below are the whole contract.
 * One `variant="primary"` per view.
 */
export const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      primary: "ui-button--primary",
      secondary: "ui-button--secondary",
      ghost: "ui-button--ghost",
      danger: "ui-button--danger",
      link: "ui-button--link",
    },
    size: {
      sm: "ui-button--sm",
      md: "ui-button--md",
      lg: "ui-button--lg",
    },
    width: {
      auto: "",
      full: "ui-button--full",
    },
  },
  defaultVariants: { variant: "secondary", size: "md", width: "auto" },
});

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

type ButtonContentProps = {
  /** Leading (default) or trailing icon, a lucide element sized by the primitive. */
  readonly icon?: ReactNode;
  readonly iconPosition?: "start" | "end";
  /** Shows a spinner in the icon slot, sets `aria-busy`, and disables the control. */
  readonly loading?: boolean;
  readonly children?: ReactNode;
};

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">
  & ButtonVariantProps
  & ButtonContentProps;

function ButtonContent({ icon, iconPosition = "start", loading = false, children }: ButtonContentProps) {
  const spinner = loading
    ? <LoaderCircle aria-hidden="true" className="ui-spin" />
    : null;
  const leading = spinner ?? (icon && iconPosition === "start" ? icon : null);
  const trailing = !loading && icon && iconPosition === "end" ? icon : null;
  return (
    <>
      {leading ? <span aria-hidden="true" className="ui-button__icon">{leading}</span> : null}
      {children !== undefined && children !== null ? <span className="ui-button__label">{children}</span> : null}
      {trailing ? <span aria-hidden="true" className="ui-button__icon">{trailing}</span> : null}
    </>
  );
}

export function Button({
  variant,
  size,
  width,
  icon,
  iconPosition,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, width }), className)}
      disabled={disabled || loading}
      type={type}
    >
      <ButtonContent icon={icon} iconPosition={iconPosition} loading={loading}>{children}</ButtonContent>
    </button>
  );
}

export type ButtonLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children">
  & ButtonVariantProps
  & Omit<ButtonContentProps, "loading">
  & { readonly href: string; readonly prefetch?: boolean };

/** A navigation that must read as a call to action. */
export function ButtonLink({
  href,
  prefetch,
  variant,
  size,
  width,
  icon,
  iconPosition,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      {...rest}
      className={cn(buttonVariants({ variant, size, width }), className)}
      href={href}
      prefetch={prefetch}
    >
      <ButtonContent icon={icon} iconPosition={iconPosition}>{children}</ButtonContent>
    </Link>
  );
}

export type IconButtonProps = Omit<ButtonProps, "icon" | "iconPosition" | "children" | "width" | "aria-label"> & {
  /** Required: an icon-only control has no visible name. */
  readonly "aria-label": string;
  readonly icon: ReactNode;
};

/** A square, icon-only `Button`. The accessible name is mandatory by type. */
export function IconButton({ icon, className, variant = "ghost", loading = false, ...rest }: IconButtonProps) {
  return (
    <Button
      {...rest}
      className={cn("ui-icon-button", className)}
      icon={icon}
      loading={loading}
      variant={variant}
    />
  );
}

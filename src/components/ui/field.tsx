import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

/**
 * `Field` composes a label, a control, a hint and an error with the ARIA
 * wiring done once. The control is the child; the caller passes the same `id`
 * to both so the label resolves. `describedBy` ids are exposed for the control
 * through `fieldDescribedBy`.
 */
export type FieldProps = {
  readonly id: string;
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly required?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
};

export function fieldDescribedBy(id: string, { hint, error }: { hint?: unknown; error?: unknown }): string | undefined {
  const ids = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter((v): v is string => v !== null);
  return ids.length ? ids.join(" ") : undefined;
}

export function Field({ id, label, hint, error, required = false, className, children }: FieldProps) {
  return (
    <div className={cn("ui-field", className)}>
      <label className="ui-field__label" htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {error ? <p className="ui-field__error" id={`${id}-error`} role="alert">{error}</p> : null}
      {hint ? <p className="ui-field__hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

type ControlSize = "md" | "lg";

function inputClasses(size: ControlSize | undefined, invalid: boolean | undefined, className: string | undefined) {
  return cn("ui-input", size === "lg" && "ui-input--lg", invalid && "ui-input--invalid", className);
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { readonly size?: ControlSize; readonly invalid?: boolean };

export function Input({ size, invalid, className, ...rest }: InputProps) {
  return <input {...rest} aria-invalid={invalid || rest["aria-invalid"]} className={inputClasses(size, invalid, className)} />;
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { readonly size?: ControlSize; readonly invalid?: boolean };

export function Textarea({ size, invalid, className, ...rest }: TextareaProps) {
  return <textarea {...rest} aria-invalid={invalid || rest["aria-invalid"]} className={inputClasses(size, invalid, className)} />;
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { readonly size?: ControlSize; readonly invalid?: boolean };

export function Select({ size, invalid, className, ...rest }: SelectProps) {
  return <select {...rest} aria-invalid={invalid || rest["aria-invalid"]} className={inputClasses(size, invalid, className)} />;
}

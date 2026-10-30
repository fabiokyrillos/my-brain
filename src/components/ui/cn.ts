import { clsx, type ClassValue } from "clsx";

/**
 * The one class-name joiner the primitive layer uses. `clsx` only: the
 * primitives emit `ui-*` BEM classes, not Tailwind utilities, so there is no
 * utility conflict for `tailwind-merge` to resolve.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

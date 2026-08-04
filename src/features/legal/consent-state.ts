/**
 * The consent action's state shape and its idle value.
 *
 * A module of its own because `actions.ts` carries `"use server"` and such a
 * module may export **only async functions** — the split
 * `auth/sign-out-state.ts` and `account/deletion-request-state.ts` both use, for
 * the same reason and enforced by the same repository guard.
 *
 * There is no `accepted` member: a successful acceptance **redirects** into the
 * product, so it never comes to rest at a state. The only state this action can
 * hand back is a failure.
 */

export type ConsentState = {
  readonly status: "idle" | "failed";
  /** Localized, and never a database or provider message. */
  readonly message: string;
};

export const idleConsentState: ConsentState = { status: "idle", message: "" };

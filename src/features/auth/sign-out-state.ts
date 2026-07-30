/**
 * The rendered state a sign-out attempt comes to rest at.
 *
 * A module of its own rather than an export of `actions.ts`, for the reason
 * `work-action-state.ts` and `detail-action-state.ts` both record: `actions.ts`
 * is `"use server"` and reaches `@/lib/supabase/server`, which carries the
 * `server-only` guard. A Client Component importing the type from there would
 * pull the server module into the browser graph and the jsdom gate could not
 * import it at all.
 *
 * There is no `signed_out` member, and that absence is the contract: a
 * successful sign-out **redirects**, so it never returns a state at all. The only
 * state this action can hand back is a failure — which is why the union is this
 * small and why the component can treat any non-idle status as "tell the user it
 * did not work".
 */

export type SignOutStatus = "idle" | "failed";

export type SignOutState = {
  readonly status: SignOutStatus;
  /** Localized, and never the provider's own message. */
  readonly message: string;
};

export const idleSignOutState: SignOutState = { status: "idle", message: "" };

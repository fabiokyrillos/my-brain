/**
 * The deletion request's state shape and its idle value.
 *
 * A separate module because `actions.ts` carries `"use server"`, and such a
 * module may export **only async functions** — a constant there is a build
 * error waiting to happen, and a repository guard fails on it. This is the
 * same split `auth/sign-out-state.ts` uses for the same reason.
 */

/**
 * The refusal vocabulary, closed.
 *
 * Every one of these is a *different fact about why nothing was deleted*, and
 * they are kept distinct because collapsing any two sends someone to fix the
 * wrong thing — the same reasoning `isCaptchaError` records for the login form,
 * where a failed challenge reported as `invalid-credentials` sends a user to
 * reset a password that was never wrong.
 *
 * `captcha-missing` and `captcha-failed` are two facts, not one: the first is a
 * submission that carried no token at all — a tampered form, a blocked script,
 * a challenge that never ran — and the second is a token the **provider**
 * rejected. Only GoTrue can produce the second, which is why nothing here
 * verifies a token.
 */
export const DELETION_REFUSAL_CODES = [
  "session",
  "captcha-missing",
  "captcha-failed",
  "password",
  "phrase",
  "lifecycle",
  "throttled",
  "unavailable",
  "failed",
] as const;

export type DeletionRefusalCode = (typeof DELETION_REFUSAL_CODES)[number];

export type DeletionRequestState = {
  readonly status: "idle" | "error" | "started";
  readonly code: null | DeletionRefusalCode;
  readonly message: string | null;
};

export const idleDeletionRequestState: DeletionRequestState = {
  status: "idle",
  code: null,
  message: null,
};

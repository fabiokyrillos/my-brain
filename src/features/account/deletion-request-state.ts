/**
 * The deletion request's state shape and its idle value.
 *
 * A separate module because `actions.ts` carries `"use server"`, and such a
 * module may export **only async functions** — a constant there is a build
 * error waiting to happen, and a repository guard fails on it. This is the
 * same split `auth/sign-out-state.ts` uses for the same reason.
 */

export type DeletionRequestState = {
  readonly status: "idle" | "error" | "started";
  readonly code: null | "session" | "password" | "phrase" | "lifecycle" | "failed";
  readonly message: string | null;
};

export const idleDeletionRequestState: DeletionRequestState = {
  status: "idle",
  code: null,
  message: null,
};

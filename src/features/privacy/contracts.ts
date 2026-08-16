import type { ExportRefusalReason } from "./export";

/**
 * The action states, held apart from `actions.ts` — and the separation is a
 * framework rule rather than a taste.
 *
 * **A `"use server"` module may export only async functions.** Every export
 * becomes a server-action reference the client can call, so a plain `const`
 * there is not a smaller version of the same thing — it is a build error.
 * `reminders/actions.test.ts` holds that rule across the whole repository, and
 * it caught this file's contents living in `actions.ts`: `typecheck` cannot see
 * it, because TypeScript has no opinion about what a directive means.
 */

export type ExportState =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "ready";
      filename: string;
      archive: string;
      rows: number;
      generatedAt: string;
    }>
  | Readonly<{ status: "refused"; reason: ExportRefusalReason; message: string }>
  | Readonly<{ status: "failed"; message: string }>;

export const idleExportState: ExportState = Object.freeze({ status: "idle" });

export type GlobalSignOutState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "failed"; message: string }>;

export const idleGlobalSignOutState: GlobalSignOutState = Object.freeze({ status: "idle" });

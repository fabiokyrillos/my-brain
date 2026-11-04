import type { SensitivityLevel } from "./contracts";

/** The override form's state. Kept out of the `"use server"` module, which may export only actions. */
export type EntrySensitivityState = {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
  /** The level now stored, after a success; `null` otherwise. */
  readonly sensitivity: SensitivityLevel | null;
};

export const idleEntrySensitivityState: EntrySensitivityState = { status: "idle", message: "", sensitivity: null };

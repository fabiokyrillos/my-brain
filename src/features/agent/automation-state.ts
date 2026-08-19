import type { AutomationCategory } from "./automation-policy";

/**
 * What the two automation controls return, and why they return anything at all.
 *
 * ## They used to throw
 *
 * Slice 2P.4 made both actions `throw` on failure, and the comment beside the
 * first one said why: a `<form action>` re-renders the server tree when the
 * action resolves, so a **swallowed** error would put the stored value back in
 * the select with no explanation. The owner would believe they had changed who
 * may write without asking them, and nothing would have changed. That is the
 * worst failure mode an authority control has.
 *
 * That reasoning was right and the remedy was temporary. Throwing replaces the
 * whole page with the error boundary — the reader loses the section, the
 * history, the undo control and any other section's unsaved input, and the
 * message they get is the generic one. The comment named its own successor:
 * *"`2P-SETTINGS-007` … belongs to slice 2P.5, which introduces the settings
 * sections this will live in."*
 *
 * ## So the failure is rendered instead, in the section that produced it
 *
 * A returned state keeps everything the throw destroyed and is strictly louder
 * than a swallowed error, because the message is specific: which category, and
 * what actually happened. `55P03` is not "something went wrong" — it is *the
 * category moved since you pressed undo*, which tells the owner to look before
 * pressing again.
 *
 * ## The category travels with the outcome
 *
 * Six categories share one section. A message with no category would attach
 * itself to all six, so the state names the one it belongs to and the row
 * renders only its own.
 */
export type AutomationActionStatus = "idle" | "success" | "error";

export type AutomationActionState = Readonly<{
  status: AutomationActionStatus;
  message: string;
  /** Absent on `idle`, and on an undo whose category could not be resolved. */
  category?: AutomationCategory;
}>;

export const idleAutomationState: AutomationActionState = { status: "idle", message: "" };

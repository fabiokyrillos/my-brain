/**
 * Life Brain C.2 (`LIFE_DATA_MODEL.md` §1, ADR-151) — whether a record's page
 * offers to keep it as a memory, and with what.
 *
 * The extraction has always tagged "prefiro…" and "Ana faz aniversário…" as
 * `lasting_preference` and `personal_memory`, and the product showed them as
 * chips and did nothing else. Now those two concepts produce a **proposal**:
 * the assistant's existing `MemoryProposalCard`, prefilled with the owner's own
 * words, which persists nothing until the owner confirms it.
 *
 * Deterministic, like `buildMemoryProposal`, which it reuses: no model call, no
 * confidence. The concepts only decide *whether* to offer; the content is the
 * record's text and the kind is the same guess the composer makes, nudged to
 * `preference` when the reading called it one.
 */

import { buildMemoryProposal, type MemoryProposal } from "@/features/assistant/memory-proposal";
import { AI_INPUT_BOUNDS } from "@/lib/ai-input-bounds";

export const MEMORY_PROPOSING_CONCEPTS = ["lasting_preference", "personal_memory"] as const;

export function recordMemoryProposal(input: {
  readonly concepts: readonly string[];
  readonly content: string;
  /** A memory already names this record, so it was kept (or deliberately archived). */
  readonly alreadyKept: boolean;
}): MemoryProposal | null {
  if (input.alreadyKept) return null;
  const preference = input.concepts.includes("lasting_preference");
  if (!preference && !input.concepts.includes("personal_memory")) return null;
  const proposal = buildMemoryProposal(input.content);
  // A long record is not one memory; the owner can still write one by hand.
  if (proposal === null || proposal.content.length > AI_INPUT_BOUNDS.memoryContent) return null;
  return preference && proposal.kind === "fact" ? { ...proposal, kind: "preference" } : proposal;
}

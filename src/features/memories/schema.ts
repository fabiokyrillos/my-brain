import { z } from "zod";
import { AI_INPUT_BOUNDS } from "@/lib/ai-input-bounds";

/**
 * The validated shape of every memory write this slice adds (UX-10, DEC-5).
 *
 * Each bound mirrors a column constraint from
 * `202607160006_chat_memory.sql:3-20` rather than a UI preference, so a value
 * these schemas accept is a value the database accepts. Where the two would
 * disagree the form shows a generic failure it cannot explain — which is the
 * failure mode this module exists to prevent.
 *
 * Pure and synchronous — no clock, no I/O, no Supabase.
 */

/** `memories_kind_check`: ten literals, and no eleventh. */
export const MEMORY_KINDS = [
  "preference",
  "relationship",
  "responsibility",
  "rule",
  "recurring_info",
  "professional_context",
  "habit",
  "restriction",
  "goal",
  "fact",
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** `memories_sensitivity_check`: three literals. */
export const MEMORY_SENSITIVITIES = ["normal", "private", "highly_sensitive"] as const;

export type MemorySensitivity = (typeof MEMORY_SENSITIVITIES)[number];

/** `char_length(content) between 1 and 4000`. */
const memoryContent = z.string().trim().min(1).max(AI_INPUT_BOUNDS.memoryContent);

/**
 * A relation that may be cleared.
 *
 * The empty string is what an unselected `<select>` submits and it means "not
 * related to anyone" — which both columns model as `null`, since each is
 * `on delete set null`.
 */
const optionalRelation = z
  .union([z.string().uuid(), z.literal("")])
  .transform((value) => (value === "" ? null : value));

/**
 * An HTML checkbox submits `"on"` when ticked and **omits the key entirely**
 * when not. `z.coerce.boolean()` would read the absent value as `undefined` and
 * fail a required field, so the presence of the key *is* the value.
 */
const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((value) => value === "on" || value === "true");

export const memoryUpdateSchema = z.object({
  memoryId: z.string().uuid(),
  locale: z.enum(["pt-BR", "en"]),
  content: memoryContent,
  kind: z.enum(MEMORY_KINDS),
  sensitivity: z.enum(MEMORY_SENSITIVITIES),
  important: checkbox,
  personId: optionalRelation,
  projectId: optionalRelation,
}).strict();

/**
 * Archive and restore are the same shape, distinguished by an explicit verb.
 *
 * Named transitions rather than a raw `valid_until` field: the owner is choosing
 * "this stopped being true", not authoring a timestamp, and letting the client
 * post an arbitrary instant would make the audit row's meaning depend on input
 * nobody validated.
 */
export const memoryLifecycleSchema = z.object({
  memoryId: z.string().uuid(),
  locale: z.enum(["pt-BR", "en"]),
  transition: z.enum(["archive", "restore"]),
}).strict();

/**
 * The confirmed-memory contract (DEC-5).
 *
 * `content` and `kind` are what the composer *proposed* and the owner then
 * accepted — the confirmation is the authorization, so the payload is
 * re-validated here rather than trusted because a proposal produced it.
 *
 * `sourceEntryId` is deliberately absent: a memory born in the composer has no
 * originating entry, and `memories.source_entry_id` references `entries`. Naming
 * a provenance that does not exist would be worse than admitting there is none.
 */
/**
 * Where a confirmed memory was written, for the **audit reason and nothing
 * else** (`2P-MEMORY-003`).
 *
 * Slice 2P.6 gave `createProposedMemory` a second caller: the memories page's
 * own composer, where the owner types the sentence themselves rather than
 * confirming one the assistant proposed. The write is identical and must stay
 * identical — a second creation path would be a second place for the
 * idempotency rule, the embedding contract and the ownership predicate to
 * disagree. What is *not* identical is the audit row's sentence, and leaving it
 * saying the assistant proposed the memory would have made the trail untrue for
 * every memory written from that page.
 *
 * So this reaches exactly one expression, the same way `origin` does in
 * `associations.ts`: **it selects no table, no predicate, no payload and no
 * revalidation.** Optional because the composer that predates it sends no such
 * field and must keep working unchanged.
 */
export const MEMORY_ORIGINS = ["composer", "memories"] as const;
export type MemoryOrigin = (typeof MEMORY_ORIGINS)[number];

export const memoryProposalSchema = z.object({
  locale: z.enum(["pt-BR", "en"]),
  content: memoryContent,
  kind: z.enum(MEMORY_KINDS),
  origin: z.enum(MEMORY_ORIGINS).optional(),
}).strict();

export type MemoryUpdateInput = z.infer<typeof memoryUpdateSchema>;
export type MemoryLifecycleInput = z.infer<typeof memoryLifecycleSchema>;
export type MemoryProposalInput = z.infer<typeof memoryProposalSchema>;

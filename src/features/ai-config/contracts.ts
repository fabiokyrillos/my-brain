import { MODEL_PROFILES, type AIProfilePreset, type AIRoutes } from "@/lib/ai/model-routing";
import type { AIOperation } from "@/lib/ai/usage";

/**
 * What the product does with a model, and what the owner may say about it —
 * `2O-AICONFIG-001`, `-003`, `-005` and `2O-COST-004`.
 *
 * ## Why this is a contract and not a paragraph
 *
 * `2O-AICONFIG-003` says the surface states which operations route to which
 * model **"reading the routing the product actually uses rather than a second
 * list"**. A hand-written table on a page is exactly the second list, and this
 * repository has already paid for one: `product_events` carried three copies of
 * its vocabulary and the writer's copy silently froze for weeks.
 *
 * So the route table below carries, per operation, the **column the call sites
 * really read** and **where they read it**. `ai-config-contracts.test.ts` checks
 * every `callSites` entry against the tree: a path that stops reading its column
 * fails, and a column that acquires a reader with no entry here fails too. The
 * page renders this, so the statement and the routing cannot drift apart
 * without the build saying so.
 *
 * ## The three dispositions, and why `unconsumed` is not `uncontrolled`
 *
 * They are the distinction ADR-117 turned on, one layer down from the
 * capability registry:
 *
 * - `controlled` — the product reads the column **and** the preferences centre
 *   offers a control for it.
 * - `uncontrolled` — the product reads the column and **no control is
 *   authorized**. `embedding_model`, and only it: `OD-2O-6` **A**'s *only*
 *   reaches it and ADR-117 Decision 1 made that the owner's.
 * - `unconsumed` — **nothing reads the column at all**, so a control would
 *   change nothing (`R-24`, `R-2O-12`). `reasoning_model` and
 *   `background_model`.
 *
 * Collapsing the last two would restate the ambiguity `2O-ACTIVATION-006`
 * existed to remove: *"no control"* is true of both, and only one of them also
 * means *"nothing happens differently because of this value"*.
 */
export type AiRouteDisposition = "controlled" | "uncontrolled" | "unconsumed";

export type AiRouteContract = Readonly<{
  /** The `agent_preferences` column, in the schema's own spelling. */
  column: string;
  /** The `AIRoutes` key the profile presets carry for this column. */
  routeKey: keyof AIRoutes;
  /**
   * The ledger operation this route pays for, or `null`.
   *
   * `null` is not "unknown" — it is `unconsumed`: nothing calls a model through
   * this column, so no `ai_usage_events` row can ever name it. Making the field
   * required rather than optional is deliberate: an optional one would let a
   * future route omit it and quietly claim a spend nobody can find.
   */
  operation: AIOperation | null;
  disposition: AiRouteDisposition;
  /**
   * Repository paths that read this column, relative to the repository root.
   *
   * Empty **only** for `unconsumed`, and the guard asserts that equivalence in
   * both directions — a route with sites is not `unconsumed`, and one without
   * them is not anything else.
   */
  callSites: readonly string[];
  /**
   * The model an operation uses when the column holds nothing, or `null` for a
   * route nothing calls.
   *
   * This is what makes `2O-AICONFIG-003` checkable rather than merely written:
   * the guard asserts each call site really names this model, so a default
   * changed in the code without changing the statement fails the build. It is
   * also the only honest thing the surface can say about `embedding_model`,
   * whose value is written as a literal and therefore never differs from it.
   *
   * **`file_model`'s chain has three links, not two** — `preferences ??
   * Deno.env.get("OPENAI_FILE_MODEL") ?? "gpt-5.6-luna"` — so this names the
   * last one. A deployment that sets that variable routes file analysis
   * somewhere this field does not know about, and that is recorded here rather
   * than smoothed over, because the surface would then be stating the wrong
   * model for an account with no stored preference.
   */
  fallbackModel: string | null;
}>;

/**
 * Every model route in the product, in the order the surface states them.
 *
 * Controlled first, because those are the ones an owner came to change; then
 * the two the product cannot honour a control for, so the page's last word is
 * about what it deliberately does **not** offer rather than what it does.
 */
export const AI_ROUTE_CONTRACTS = [
  {
    column: "chat_model",
    routeKey: "chatModel",
    operation: "chat",
    disposition: "controlled",
    callSites: ["src/features/chat/actions.ts", "src/features/task-commands/actions.ts"],
    fallbackModel: "gpt-5.6-terra",
  },
  {
    column: "extraction_model",
    routeKey: "extractionModel",
    operation: "capture_extraction",
    disposition: "controlled",
    callSites: ["supabase/functions/process-jobs/entry.ts"],
    fallbackModel: "gpt-5.6-luna",
  },
  {
    column: "review_model",
    routeKey: "reviewModel",
    operation: "review",
    disposition: "controlled",
    callSites: ["src/features/agent/actions.ts"],
    fallbackModel: "gpt-5.6-terra",
  },
  {
    column: "file_model",
    routeKey: "fileModel",
    operation: "file_analysis",
    disposition: "controlled",
    callSites: ["supabase/functions/process-jobs/attachment.ts"],
    fallbackModel: "gpt-5.6-luna",
  },
  /*
   * `2O-AICONFIG-004`, and the one row in this table the owner signed a refusal
   * for.
   *
   * Four readers, three of them on authenticated paths and one in the worker.
   * ADR-117 Decision 1 confirms it gains **no control in Phase 2O**, and
   * Decision 4 forbids removing, altering, renaming, re-defaulting or migrating
   * the column to tidy the asymmetry away. So the honest statement is the one
   * the capability registry makes: real consumers, no authorized control.
   */
  {
    column: "embedding_model",
    routeKey: "embeddingModel",
    operation: "semantic_search",
    disposition: "uncontrolled",
    /*
     * Three, not four, since slice 2P.6. `src/features/operations/actions.ts`
     * was a reader because `createRecord`'s memory branch embedded the sentence
     * it inserted. That branch is deleted — the memories page writes through
     * `createProposedMemory`, whose `embedMemory` performs the identical call
     * with the identical gate — so the route lost a call site rather than a
     * behaviour, and the census says so rather than keeping a name that no
     * longer reads the column.
     */
    callSites: [
      "src/features/chat/actions.ts",
      "src/features/memories/actions.ts",
      "supabase/functions/process-jobs/entry.ts",
    ],
    fallbackModel: "text-embedding-3-small",
  },
  /*
   * `2O-AICONFIG-005`. Both columns exist, both are written on every save, and
   * **nothing reads either of them** — which is why they have `future` rows in
   * `capabilityRegistry` and why neither gains a control here.
   *
   * `-005` asks for their rows to *say so*. They already said it to the
   * repository; what they had never done is say it to the owner, because until
   * this slice nothing rendered them.
   */
  {
    column: "reasoning_model",
    routeKey: "reasoningModel",
    operation: null,
    disposition: "unconsumed",
    callSites: [],
    fallbackModel: null,
  },
  {
    column: "background_model",
    routeKey: "backgroundModel",
    operation: null,
    disposition: "unconsumed",
    callSites: [],
    fallbackModel: null,
  },
] as const satisfies readonly AiRouteContract[];

export type AiRouteColumn = (typeof AI_ROUTE_CONTRACTS)[number]["column"];

/**
 * Where AI is used, in the product's own terms — `2O-AICONFIG-001`.
 *
 * Derived from the routes rather than listed again, so a route that stops being
 * consumed leaves this list automatically. The PRD names five sites —
 * interpretation of entries, chat answers, file analysis, review generation and
 * embeddings — and those are exactly the five routes with a real reader.
 */
export const AI_USE_SITES = AI_ROUTE_CONTRACTS.filter(
  (route) => route.disposition !== "unconsumed",
);

/**
 * What model each operation is actually using right now — `2O-AICONFIG-003`.
 *
 * `null` means **nothing is routed**, which is only ever true of `unconsumed`,
 * and the surface says so in words rather than rendering an empty cell.
 *
 * The four controlled routes take the values the settings loader already read,
 * so this introduces **no new reader** of any preference column. That matters
 * for `embedding_model` specifically: a display read of it here would look
 * exactly like a behavioural one to the direction-B census, and the honest
 * answer is available without one — every call site falls back to the same
 * literal `buildSettingsPayload` writes, so `fallbackModel` *is* the value.
 */
export function resolveRoutedModels(
  saved: Readonly<Record<"chatModel" | "extractionModel" | "reviewModel" | "fileModel", string>>,
): Readonly<Record<AiRouteColumn, string | null>> {
  return Object.fromEntries(
    AI_ROUTE_CONTRACTS.map((route) => [
      route.column,
      route.disposition === "controlled"
        ? saved[route.routeKey as keyof typeof saved]
        : route.fallbackModel,
    ]),
  ) as Record<AiRouteColumn, string | null>;
}

/**
 * The models a preset routes each column to — `2O-COST-004`.
 *
 * Read straight out of `MODEL_PROFILES`, which is the same constant
 * `buildSettingsPayload` writes from, so what the surface says a profile does
 * and what saving it actually stores have one source.
 */
export function routeModelsForProfile(profile: AIProfilePreset): Readonly<Record<AiRouteColumn, string>> {
  const preset = MODEL_PROFILES[profile];
  return Object.fromEntries(
    AI_ROUTE_CONTRACTS.map((route) => [route.column, preset[route.routeKey]]),
  ) as Record<AiRouteColumn, string>;
}

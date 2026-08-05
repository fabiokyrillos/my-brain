# Phase 2E — Slice 2E.1 Report: Bounded Task Command Contract

## 1. Status

| Field | Value |
|---|---|
| Slice | 2E.1 — Bounded task command contract (Epic 2E-A) |
| Status | **READY WITH NON-BLOCKING NOTES** |
| Date | 2026-07-25 |
| Repository | `github.com/fabiokyrillos/my-brain` |
| Branch | `codex/phase-2e-natural-language-task-updates` |
| Phase base | `2e2acfd` (Pre-Phase-2E Foundation Hardening, PR #17) |
| Slice base | `350c7ad` (pre-2E hardening cutover verification) |
| Commits | `a2e4d87` (PRD), `6db7827` (deterministic core), `837ae60` (provider, ledger, bounds), `6c4a907` (review corrections) |
| Migrations | `202607250055_phase_2e_task_command_ai_usage.sql` — **local only, not applied to the linked project** |
| Generated types | Unchanged, and unchangeable by this migration (see §7) |
| Publication | Draft PR [#18](https://github.com/fabiokyrillos/my-brain/pull/18), CI evidence only. Not merged, not deployed, not tagged. |
| Governing documents | `docs/initiatives/phase-2e/PHASE_2E_PRD.md` §9 (Epic 2E-A), §11.2, §13.1, §19.1; `docs/ENGINEERING_STANDARDS.md`; ADR-035–ADR-039 |

Slices 2E.2–2E.8 have not started. They proceed under the approved PRD without further authorization.

## 2. Objective, and what this slice deliberately is not

A user's natural-language task instruction becomes a closed, validated, explainable task-command proposal **without searching for a task and without mutating anything**.

The negative space is the point, and Epic 2E-A's acceptance criteria end by requiring it explicitly ("no search or mutation exists in this slice"). This slice contains:

- no task search, no candidate query, no ranking, no scoring, no matching policy;
- no mutation, no RPC that writes a task, no undo handler, no confirmation token;
- no UI, no Server Action, no route, no copy module, no Playwright journey;
- no product event, and therefore no product-event allowlist change (2E-ANALYTICS-005 attaches to the first emitting code, which is Slice 2E.7);
- no user-visible behaviour change of any kind.

`AIProvider.parseTaskCommand` is implemented and has **no production caller**. That is deliberate: the contract is the deliverable, and its first consumer is the Server Action of Slice 2E.7.

## 3. Requirement coverage

| Requirement | Where satisfied |
|---|---|
| 2E-COMMAND-001 closed `{action, targetHints, patch, operationKey}`, unknown keys rejected | `schema.ts` `proposalSchema` (`.strict()` at every level); `schema.test.ts` "closed shape" |
| 2E-COMMAND-002 closed enum of exactly fifteen actions | `taxonomy.ts` `TASK_COMMAND_ACTIONS`; `policy-lock.test.ts` |
| 2E-COMMAND-003 required/optional/forbidden patch fields per action | `taxonomy.ts` `requiredPatchFields`/`allowedPatchFields`; rejection before any search at `schema.ts` |
| 2E-COMMAND-004 taxonomy as data, all seven §11.2 columns | `taxonomy.ts` `POLICIES`; **row-for-row** transcription in `policy-lock.test.ts` |
| 2E-COMMAND-005 bounded hints, each capped **and** a capped total | `MAX_HINT_LENGTH`, `MAX_TITLE_WORDS`, `MAX_TARGET_HINTS_SERIALIZED` measured on the canonical form |
| 2E-COMMAND-006 no id, table, column or SQL representable | no such field exists in either schema; asserted over the wire JSON Schema too |
| 2E-COMMAND-007 each unsupported case has its own reason code | `TASK_COMMAND_MODEL_UNSUPPORTED_REASONS` (7 codes); see the honest note below |
| 2E-COMMAND-008 values validated against the **action's own** allowed set | `schema.ts` via `policy.targetValueField` + `isAllowedTargetValue` |
| 2E-COMMAND-017 legal-for-column-but-not-for-action refused, never coerced | `value_not_allowed_for_action`, distinct from `unrecognized_value` |
| 2E-COMMAND-009 command text fenced; no task row in any prompt | `buildTaskCommandUserMessage`, asserted by **exact equality**; delimiters stripped |
| 2E-COMMAND-010 prompt/schema/versions exist once, held by test | single-declaration counts + value-based check; **ADR-039** records the substituted mechanism |
| 2E-COMMAND-011 command parsing recordable in `ai_usage_events` | migration `202607250055`; `phase_2e_task_command_ai_usage.sql` |
| 2E-COMMAND-012 prompt and strategy version carried to the operation | `TaskCommandParseResult.promptVersion`/`.strategyVersion` |
| 2E-COMMAND-013 classified, content-free failure, never a partial command | `TASK_COMMAND_PROVIDER_ERROR_CODES`; `normalizeTaskCommandProposal` returns `invalid` rather than repairing |
| 2E-COMMAND-014 declared closed bilingual lexicon, entries state their rule | `TEMPORAL_LEXICON` (exported, enumerable, each entry carries `rule`) |
| 2E-COMMAND-015 local→instant by the proven rules, fail-closed | `resolveLocal` reused, not copied |
| 2E-COMMAND-016 outside-lexicon or ambiguous ⇒ clarification, never a guess | `unsupported` ⇒ `needs_clarification`; complete instants refused |
| 2E-PROVENANCE-001/002 (groundwork) | versions on the result; ledger literal exists; ordering enforceable because the provider holds no Supabase client |
| 2E-ANALYTICS-005 | **not yet due** — no emitting code in this slice |

**Honest qualifications.** Two rows above are partial, and are recorded as such rather than claimed green:

- **2E-COMMAND-007 `multiple_targets` is model-reported, not deterministically enforced.** The closed schema makes a *second action* unrepresentable, but a two-target sentence is representable as a one-target proposal. The deterministic backstop is the matcher's ambiguity rule (2E-MATCH-011), which is Slice 2E.2. The taxonomy comment previously overclaimed this; it has been corrected, and the test that appeared to cover it was replaced (it actually asserted only that strict mode rejects an unknown key).
- **2E-COMMAND-010 is discharged as single declaration, not cross-runtime comparison.** Command parsing has no Deno counterpart — the PRD itself states Phase 2E enqueues no jobs — so "held identical" has nothing to compare against. ADR-039 records the decision, the rejected alternative (building a consumer-less Deno parser), and the obligation to convert to the parity shape the day a Deno consumer appears.

## 4. Implementation

**`src/features/task-commands/taxonomy.ts`** — PRD §11.2 as data. The *allowed target values* column is load-bearing: without it `{action: set_status, patch: {status: 'cancelled'}}` would be classified non-destructive, one-step and unconfirmed, defeating the entire destructive-action contract. Also carries `changedFields` and `undoStrategy`, so `assign_person` and `set_waiting_on` are not byte-identical policies distinguished only by their names — the preview (2E.3) and the mutation RPC (2E.4) read the role from the taxonomy instead of each re-deriving it.

**`src/features/task-commands/temporal.ts`** — the lexicon is an exported array whose entries state their own resolution rules, so supported phrases can be enumerated by a test, by clarification copy, and by documentation. The declared week convention is Monday-first. `resolveLocal` from the shared worker module does the wall-time→instant conversion — reused, not copied, making that module dual-runtime for the first time (see §9).

**`src/features/task-commands/vocabulary.ts`** — the declared closed bilingual status/priority table. The two terminal statuses are present even though no action may patch them, precisely so `set_status` carrying `cancelled` is refused as `value_not_allowed_for_action` (true) rather than `unrecognized_value` (false, and it would hide the destructive guard behind a claim that the product has no such status).

**`src/features/task-commands/schema.ts`** — the only thing between untrusted model output and the matcher. Every rejection is a closed code; nothing is coerced into a neighbouring action.

**`src/lib/ai/task-command-schema.ts`** — prompt, response schema, versions, bounded-input classifier, error vocabulary. Not in the `server-only` provider, so the fencing and no-task-row promises are asserted against real values.

**`OpenAIProvider.parseTaskCommand`** — transport only. It decides nothing.

## 5. Migration, security and rollback

`202607250055` widens the `ai_usage_events` operation vocabulary to eight literals in **both** guards — the table CHECK and the `record_ai_usage` list — and then asserts, in a fail-closed `DO` block, that exactly one operation CHECK survives and that it mentions `task_command`. That block exists because `drop constraint if exists` is fail-open: if the auto-generated constraint name were ever wrong, the DROP would no-op, the ADD would succeed under a free name, the old seven-value constraint would survive, and every `task_command` insert would fail at runtime — where `src/lib/ai/usage.ts` swallows the error into a console line. CI proves the chain from an empty database; the assertion proves the swap on whatever database the migration is actually applied to.

The function body is otherwise byte-identical to `202607170018`: the signature, `SECURITY DEFINER`, `set search_path = ''`, the cost calculation, the partial `on conflict`, and both grants are unchanged, and pgTAP now asserts `prosecdef` and `proconfig` after the rewrite so a replacement that silently dropped either would fail.

`source_type` is deliberately not widened. At parse time no task is selected, by construction, so `null` is the truthful classification; `'task'` is a Phase 2F decision (PRD §22) and is still refused with `22023`.

**Rollback** is "stop routing to the new operation". Narrowing the CHECK would fail against rows already written under the new literal, and no applied migration is reverted (PRD §21, 2E-OPERATIONS-005).

## 6. Independent review

Five reviewers across the nine required dimensions. Every Critical and Important finding is fixed; nothing was refuted as a false positive.

**Critical — both proven by executing the code, both introduced in this slice, neither ever released:**

1. **`lastDayOfMonth` returned 1 February in every non-leap year.** The base date was built in the year 2000 — a leap year — so `Date.UTC(2000, 2, 0)` is 29 February, and `setUTCFullYear` on a non-leap target rolled forward to 1 March, leaving day 1. "Fim do mês" produced a deadline **up to 27 days in the past**, reported as `resolved`; "mês que vem" landed two days into the current month. Verified across 2026/2027/2028/2100/2000 and every month. No test covered February, a leap year, or "next month" at all.
2. **A model-supplied instant was accepted verbatim.** The fast path returned the caller's own string before `resolveLocal` ever saw it, so `2026-13-45T99:99:99Z`, `2026-02-30T12:00:00Z` and `9999-12-31T23:59:59+14:00` were all `resolved` — on their way to a `timestamptz` column, where they would surface as an unclassified `22007`/`22008` rather than the bounded clarification 2E-COMMAND-016 requires. The module's own header records that the Gate 1 cutover *measured this model ignoring this exact instruction*, so the passthrough trusted the one input the module exists not to trust.

**Important, all fixed:** `responses.parse` misclassifying schema failures as `provider_unavailable` and discarding billed usage; an empty command reported as `command_text_too_long`; the §10.4 version coupling unenforced (every version constant could be bumped, and the production prompt semantically inverted, with a green suite); eligibility pinned for only three of fifteen actions, so `set_status` could be widened onto `completed` undetected; `isAllowedTargetValue` fail-open with no invariant test; the validator hardcoding `["status","priority"]`; the validation-reason vocabulary leaking Zod's library-owned codes; Portuguese status/priority words refused, and refused with the wrong code; the "no task row" promise asserted by an evadable substring denylist; `zodTextFormat` never exercised on the schema; the fake multi-target test; the missing per-hint cap test; the pgTAP guard asymmetry; the fail-open constraint swap with no deploy-time proof; no remote smoke sending `task_command`; the falsified `deno-parity` rationale.

**Minor, fixed:** consumer-less export removed; overclaiming taxonomy comment corrected; self-referential canonical-form test given a named verdict; the dead `TemporalContext.locale` removed; connector list made symmetric across both languages; `this <weekday>` refused as ambiguous rather than silently collapsed; explicit dates bounded; a bare time-of-day already past treated as ambiguous.

## 7. Verification

| Gate | Result |
|---|---|
| `npm run lint` | **0 errors, 0 warnings** |
| `npm run typecheck` | **0 errors** |
| `npm test` | **1225 passed / 102 files** (1125 at slice base) |
| `npm run build` | clean |
| `deno check` (both deployed entrypoints) | clean |
| `deno test supabase/functions/` | **46 passed** |
| `supabase db reset` from zero + full pgTAP + `db lint` | **green in CI** — run 30173859074, and re-run after corrections. Cannot run locally: Docker is unavailable on this workstation. |
| `supabase/tests/phase_2e_task_command_ai_usage.sql` | executed by name in CI, **13 assertions** |
| Remote migration parity | local == remote through `202607250054`; `055` correctly local-only |
| Deployed worker | `process-jobs` v15 unchanged; this slice touches no worker code |
| Generated-types parity | **proven by content**, not asserted: `database.types.ts` contains zero occurrences of any `operation` CHECK literal, because `operation` is `text`. A regeneration would be a zero diff. |

CI evidence for the database gate, quoted from the run log:

```
Applying migration 202607250055_phase_2e_task_command_ai_usage.sql...
supabase/tests/phase_2e_task_command_ai_usage.sql ............. ok
supabase db lint --local --schema public,private --fail-on error   → clean
foundation e2e (desktop + Pixel 7)                                → 6 passed
```

This is what settles the migration's highest-risk item — whether `ai_usage_events_operation_check` is the correct auto-generated constraint name. If it were not, either the pgTAP `task_command` insert would have failed `23514` or the `ADD` would have errored on a duplicate name. Neither happened, against a database built from zero.

**Remote evidence: none, and none is owed yet.** 2E-OPERATIONS-003 requires a focused disposable remote smoke per slice. This slice adds no owner-scoped surface to smoke — its only remote-visible artifact is the ledger literal, and a `task_command` round-trip plus a `'task'` source-type rejection were added to `scripts/remote-supabase-smoke.mjs`. Those run when the migration is deployed, which happens with the first slice that needs it.

**Playwright: none.** There is no UI surface in this slice.

## 8. Deferred, with owners

| Item | Why deferred | Completion condition |
|---|---|---|
| `parseTaskCommand` has no behavioural test | `import "server-only"` makes the module unimportable by Vitest; a behavioural test needs an injectable client, which is its own change | Slice 2E.7, when the Server Action gives it a real consumer. `classifyCommandText` was extracted to the importable module to shrink the untestable surface. |
| 2E-ANALYTICS-005 surface allowlists | The PRD requires them in the same migration and commit as the **first emitting code** | Slice 2E.7 |
| `multiple_targets` deterministic backstop | Needs candidate ranking to exist | Slice 2E.2 (2E-MATCH-011) |
| 2E-I18N copy modules for the declared codes | No user-facing surface exists yet; the vocabularies are declared const arrays so the exhaustiveness test can iterate them | Slices 2E.3 / 2E.7 |
| `recordAIUsage` swallows a ledger failure | Ordering, not a precondition — harmless while no domain write exists | Slice 2E.4 must decide whether a failed ledger write may be followed by a task mutation |
| ADR-037 inventory entry for `record_ai_usage` | It is not a versioned `_vN` family, so the inventory does not cover it; the retirement-policy test stays green | Recorded instead in `docs/DATABASE.md` under the operation vocabulary, per the PRD's "or record why" |

## 9. Architectural consequence recorded

`supabase/functions/_shared/extraction-normalization.ts` was Deno-owned; `temporal.ts` now imports `resolveLocal` from it, making it dual-runtime. That is the outcome the parity guard wants — one proven implementation reused rather than copied — but it invalidated the written rationale in `deno-parity.test.ts`, which has been corrected and given a guard keeping the module Node-importable. Neither existing gate would have caught a regression: `vitest.config.ts` includes only `src/**`, and `deno check` accepts Deno globals, `https:` imports and `.ts` specifiers that would all break `next build`.

## 10. Verdict

**READY WITH NON-BLOCKING NOTES.**

Every Epic 2E-A requirement is satisfied or explicitly and truthfully qualified in §3. All Critical and Important review findings are fixed. Every gate that can run in this environment is green, and the one that cannot — the database gate — is green in CI, which is what draft PR #18 exists to provide.

The non-blocking notes are the deferrals in §8, each with an owning slice and a completion condition. None of them is a defect in what this slice ships; each is work that a later slice's first real consumer will make possible.

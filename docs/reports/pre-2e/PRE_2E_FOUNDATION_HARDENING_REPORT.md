# Pre-Phase-2E Foundation Hardening — Report

- **Date:** 2026-07-25
- **Branch:** `codex/pre-2e-foundation-hardening`
- **Base:** `28252a9` (Phase 2D complete through Slice 2D.6, PR #16)
- **Input:** `docs/reviews/ARCHITECTURE_REVIEW_2026_07.md` (GOOD WITH RECOMMENDATIONS, 6.8/10)
- **Scope:** the minimum architectural hardening the review names as pre-Phase-2E, plus selected low-risk quick wins. **No Phase 2E product functionality.**
- **New migrations:** `202607250052`, `202607250053`, `202607250054` (all additive; no prior migration edited)
- **ADRs:** ADR-035 (undo handler architecture), ADR-036 (canonical localization), ADR-037 (RPC retirement policy), ADR-038 (CI database/worker verification)

The architecture review was treated as an input, not a specification. Every finding was verified against the code before anything was implemented, and four were modified or rejected on the evidence. Six read-only investigations ran in parallel before any change was made; their raw findings drove the decisions recorded below.

---

## 1. Architecture-review disposition

Only findings this initiative addressed are listed. Everything else is deferred by design and enumerated in §5.

| ID | Finding | Decision | Implementation | Evidence |
|---|---|---|---|---|
| **H1** | DB/worker/journey layer has no automated gate | **ACCEPTED** | `verify` workflow gained `worker` and `database` jobs (ADR-038) | `.github/workflows/ci.yml`; `supabase/seed.sql`; `playwright.config.ts` |
| **H2** | `undo_operation` is a ~470-line monolith re-pasted in 11 migrations | **ACCEPTED** | Router + registered private handlers (ADR-035) | migration `202607250052`; `supabase/tests/undo_operation_routing.sql` |
| **H3** | Nine superseded mutation RPCs granted with no retirement policy | **ACCEPTED WITH MODIFICATIONS** | Policy written; **one** evidence-backed revocation, not nine (ADR-037) | `docs/DATABASE.md` policy + inventory; migration `202607250054`; `supabase/tests/rpc_version_retirement.sql` |
| **H4** | Node/Deno AI seam duplicated by hand with no parity enforcement | **ACCEPTED WITH MODIFICATIONS** | Schema parity enforced; prompt/version parity **deferred** | `src/lib/ai/extraction-parity.test.ts`; `src/features/interpretations/deno-parity.test.ts` |
| **H5** | Production extraction persisted through a bare type cast | **ACCEPTED WITH MODIFICATIONS** | Worker validation + narrowed SQL bounds (not a third schema) | `supabase/functions/_shared/extraction-validation.ts`; migration `202607250053`; `supabase/tests/ai_interpretation_bounds.sql` |
| **H6** | i18n fragmented; `next-intl` unused; Portuguese-only errors in English flows | **ACCEPTED** | Canonical mechanism, dependency removed, 30 strings fixed (ADR-036) | `docs/ENGINEERING_STANDARDS.md`; `src/features/chat/actions.test.ts` |
| **H7** | Error boundary claims recording while recording nothing | **ACCEPTED WITH MODIFICATIONS** | Boundary made truthful; **error sink deferred** | `src/app/[locale]/app/error.tsx` |
| **H9** | Chat grounding pipeline entirely untested, incl. its citation invariant | **ACCEPTED WITH MODIFICATIONS** | Assertion removed + first chat tests; `answerFromKnowledge` **deferred** | `src/features/chat/actions.ts`, `actions.test.ts` |
| **H10** | The only production extraction path has zero executed tests | **ACCEPTED** | Deno CI job; 28 tests execute; both entrypoints type-check | `.github/workflows/ci.yml` `worker` job |
| **M9** | Model routing half-dead | **ACCEPTED WITH MODIFICATIONS** | Dead surface deleted; consolidation **deferred** (needs a Deno mirror) | `src/lib/ai/model-routing.ts` |
| **M15** | Hand-synchronized Deno copies have no parity guard | **ACCEPTED** | Source-parity locks for all three pairs | `src/features/interpretations/deno-parity.test.ts` |
| **L3** | `retryProcessingJob` consumer-less two phases on | **ACCEPTED** | Removed, with its test | `src/features/agent/actions.ts` |
| **L4** | `STATE.md` internal contradictions | **ACCEPTED WITH MODIFICATIONS** | Current-truth section + 3 factual corrections; full restructure **deferred** | `docs/STATE.md` |
| **L5** | `DATABASE.md` omits the versioned RPC surface | **ACCEPTED** | Policy, inventory, and four new sections added | `docs/DATABASE.md` |
| **L6** | Dead TS mirrors of DB cost logic | **ACCEPTED** | `cost-calculator` deleted; `summarizeAIUsage` and helpers removed surgically | `src/lib/ai/cost-summary.ts` |
| **L7** | Node OpenAI client runs with SDK defaults | **ACCEPTED** | `timeout: 120_000`, `maxRetries: 2` | `src/lib/ai/openai-provider.ts` |
| **L8** | Embedding usage records `provider_request_id: null` | **ACCEPTED** | Reads `x-request-id` from the response header | `supabase/functions/process-jobs/entry.ts` |
| **L9** | Chat citation non-null assertion | **ACCEPTED** | Defensive `flatMap` | `src/features/chat/actions.ts` |
| **L10** | Coverage collected but never enforced | **DEFERRED** | Not in this initiative's scope; must be measured, not guessed | `docs/TODO.md` |
| **L11** | Raw exception text rendered on the Jobs page | **ACCEPTED WITH MODIFICATIONS** | Worst leak closed at the source; **render change deferred** | `supabase/functions/process-jobs/entry.ts` |
| **L13** | Two index gaps | **DEFERRED — one premise corrected** | See §2 | `docs/TODO.md` |
| **M23** | HNSW indexes never used by the retrieval RPC | **ACCEPTED (documentation only)** | Docs corrected; the keep-or-restructure decision **deferred** | `docs/DATABASE.md`, `docs/STATE.md` |
| **M6** | Declared retention unimplemented | **ACCEPTED (documentation only)** | `STATE.md` no longer lists it as shipped; purge job **deferred** | `docs/STATE.md` |
| — | CLAUDE.md misdescribes `messages.ts`; omits `reviews` | **ACCEPTED** | Both corrected | `CLAUDE.md` |
| **C1** | No rate limiting or AI spend caps | **DEFERRED** | Explicitly excluded from this initiative; blocks public production, not Phase 2E | `docs/TODO.md`, `docs/SECURITY.md` |
| **H8, M1–M5, M7, M8, M10–M14, M16–M22, M24, L1, L2, L12, O1, O2** | — | **DEFERRED** | Enumerated with reasons in `docs/TODO.md` | §5 |

### Findings modified or rejected on the evidence

Four review claims did not survive verification unchanged.

1. **H3 — "immediately revoke versions with no live caller and no rollback claim."** Nine superseded versions have no live caller, but only one has no retention claim. `confirm_entry_task_candidates_v5` is an undo/replay dependency (`202607230050` dispatches its `action_type` and applies a v5/v6-only integrity gate); GATE-03 in `docs/reports/phase-2c/PHASE_2C_TRACEABILITY_MATRIX.md` claims the whole `confirm_entry_task_candidates` family remains callable; and `resolve_pending_question_v1`/`_v2` retirement is explicitly deferred to a separately authorized step by `PHASE_2D_PRD.md` §21 item 7, ADR-034 decision 2, and `STATE.md`. **Modified to:** policy plus exactly one revocation — `confirm_entry_tasks(uuid, integer[])`, which no layer has ever called and which no retention claim names.

2. **H5 — "extend `persist_entry_interpretation` to enforce what `correct_entry_interpretation` already enforces."** Encoding the extraction contract in SQL would put the model schema in a third place, the exact triplication the same review criticises in M5 — and a worker/DB disagreement would strand real entries in `failed`. Existing pgTAP fixtures also prove partial candidates (`[{"title":"Candidate"}]`) are legitimate inputs to that RPC, so a completeness contract in SQL would break the suite. **Modified to:** the worker validates the full contract; the database bounds only values a downstream domain object already constrains, only for fields that are present, via a trigger covering both AI persistence RPCs rather than two re-pasted ~150-line bodies. Every SQL check is at least as permissive as the worker validator by construction (`char_length` counts characters where JS `.length` counts UTF-16 units; SQL `trim` removes fewer characters than JS `.trim()`; `::timestamptz` accepts more shapes than a strict ISO instant), so no worker-accepted output can be refused.

3. **L13 second gap — "add a GIN index for `undo_operations` JSONB containment lookups."** The premise is right (no GIN index exists; `interpretations/data.ts` runs four `.contains("after_state", …)` queries per entry-detail view) but the remedy is wrong: `undo_operations_entry_idx (user_id, source_entry_id, created_at desc)` already exists and modern RPCs populate `source_entry_id`, so switching the query is better than adding an index. It cannot be done safely yet: the legacy `confirm_entry_tasks` path never populated `source_entry_id`, so without a backfill first the undo button would silently disappear for old rows. **Deferred with the corrected remedy recorded** rather than implemented as specified.

4. **A `TODO.md` line the investigation flagged as false is in fact true.** "Expose failed/exhausted jobs, attempts, retry window, sanitized state, and a backoff-gated retry action to the owning user" was reported as unfulfilled because the Jobs page has no retry control. `retryAttachmentJob` is wired — on the Files page (`src/app/[locale]/app/files/page.tsx:252`). The line does not name the Jobs page. **Left unchanged**; correcting it would have introduced an error.

### Rejected outright

- **A `case`-based dispatcher for H2.** It would shorten the router but still require editing it per new operation, so the router would still be re-pasted. The registry makes the router permanently closed to change.
- **`SECURITY DEFINER` undo handlers.** Handlers take the owner as an explicit parameter, so a definer handler exposed by a future grant mistake would be a cross-tenant write primitive. `SECURITY INVOKER` handlers behave identically through the definer router and fail closed on table grants if ever exposed.
- **Adopting `next-intl` for real.** It needs request-scoped locale, which this architecture does not have — `src/proxy.ts` sets no header or cookie and there is no `[locale]/layout.tsx` — so locale would still travel by hidden form field and the defect would remain. Its runtime lookup is also weaker than `satisfies` for exhaustiveness.
- **`no_plan()` to make the pgTAP suite unable to fail on count drift.** The explicit plan is what catches a silently skipped assertion. The drift it exposed was a real bug.
- **`--fail-on warning` on `supabase db lint`.** Two long-standing `42804` warnings in `run_user_heartbeat` are recorded in `SECURITY.md` and unrelated to this work; the gate would be red on arrival. `--fail-on error` still catches the defect class the gate exists for — the `pg_catalog.greatest(` lookup is an error-level finding.
- **A foreign key binding `undo_operations.action_type` to the handler registry.** Written first, then replaced by a trigger: an FK to a table in the unexposed `private` schema is metadata the Supabase type generator reads, so it risked a generated-types diff this repository cannot verify without applying the migration. A trigger gives the identical guarantee with no type-generation surface, which is also the `202607170027` precedent.

---

## 2. Workstream results

### A — CI database and worker gate (H1, H10)

**Investigation.** Confirmed CI ran exactly five app-layer steps. Read `supabase/config.toml`, all 51 migrations for apply-time hazards, all 21 pgTAP files, both `deno.json` files, `playwright.config.ts`, and every `e2e/` spec. Findings that changed the plan: `[db.seed] sql_paths = ["./seed.sql"]` pointed at a file that did not exist; all 21 suites call pgTAP assertions unqualified, so pgTAP must be installed *and* on the `search_path`; the three `cron.schedule` migrations create `pg_cron`/`pg_net` themselves and are therefore safe on a clean local database; Vault is not an apply-time dependency (the `net.http_post` call lives inside a `$cron$` string literal, unparsed at migration time); `e2e/foundation.spec.ts` needs no OpenAI key and no seeded user; all other e2e specs are credential-gated and skip cleanly; `deno test` needs **zero** `--allow-*` flags because every `Deno.env.get` is inside a function body.

**Implementation.** Three jobs in one workflow. `worker`: `deno check` on both deployed entrypoints, `deno test supabase/functions/`. `database`: `supabase start` (Studio, imgproxy and the edge runtime excluded to stay inside the timeout; `db`, `kong`, `rest`, `meta`, Auth and the log pipeline kept) → `supabase db reset` → `supabase test db --local supabase/tests` → `supabase db lint --local --schema public,private --level warning --fail-on error` → local credentials exported to `GITHUB_ENV` *before* the build (`NEXT_PUBLIC_*` are inlined at build time) → `npm run build` → `e2e/foundation.spec.ts` on desktop and Pixel 7. Failure uploads the Playwright report and 200 lines of every Supabase container log; the stack always stops. `supabase/seed.sql` installs pgTAP into `extensions` and sets the database `search_path`, local/CI only.

**Test-infrastructure defect found and fixed.** A static assertion counter written for this workstream matched declared plans to counted assertions across all 21 files: 20 matched exactly, and `resolve_pending_question_v3.sql` declared `plan(34)` for 37 assertions. pgTAP fails a whole file on plan mismatch, so this file could never have passed — invisible for as long as the suite never ran anywhere. Corrected to 37. All 24 files (21 existing + 3 added here) now match.

**Independent review corrections.** Two: `playwright.config.ts` was not CI-shaped (`reuseExistingServer: true` unconditional, dev server rather than the production build, no `webServer.timeout`) — fixed; and the `supabase status -o env` key name is not guaranteed across CLI versions — the export step now accepts `ANON_KEY` or `PUBLISHABLE_KEY` and fails loudly with a named reason if neither is present.

**Acceptance.** Accepted. The `worker` job was executed locally (Deno 2.9.4 installed for the purpose): 28 tests pass, both entrypoints type-check clean. The `database` job's first real execution is on the pull request, because Docker is unavailable on this workstation — named as evidence debt in §3, not claimed as local verification.

### B — Split `undo_operation` (H2)

**Investigation.** The current definition is 414 lines at `202607230050:593-1006`; ten migrations `create or replace` it and one `alter`s it. Characterised the full contract: signature, `SECURITY DEFINER`, `search_path = ''`, grants, the shared preamble *in order* (auth `42501` → owner `for update` lock on `undo_operations` → `P0002` → replay short-circuit on `status = 'undone'` → status validation → expiry), the flat `if/return` dispatch over eight `action_type` values, lock order on the only multi-lock paths (v2/v3-with-`reinterpret`: `undo_operations` → `entries` *before* the questions UPDATE → `jobs`; correction: `undo_operations` → `entries`), all 15 raises with their SQLSTATEs, the absence of any shared epilogue (each branch writes its own `undo_operations` update, its own branch-specific `audit_logs` row, and its own asymmetric return shape), and the unknown-key fall-through (raises `P0001` `Unsupported undo operation` via an inverted guard).

**Coverage matrix.** Exactly eight `action_type` values can be recorded by any shipped RPC, and all eight were dispatched — zero orphans in either direction. The wrinkle that mattered: `confirm_entry_task_candidates_v2`/`_v3`/`_v4` all record the **unversioned** `'confirm_entry_task_candidates'`, and only `_v5`/`_v6` record versioned strings and get the `after_state -> 'resolutions'` integrity gate. Applying that gate to the unversioned key would have broken v2–v4 undo.

| Operation key | Compensation | Tables touched | Handler | Tests |
|---|---|---|---|---|
| `resolve_pending_question_v1` | reopen answered question, integrity-check row count | `pending_questions`, `undo_operations`, `audit_logs` | `private.undo_resolve_pending_question_v1` | `resolve_pending_question.sql` |
| `resolve_pending_question_v2`, `_v3` | reopen from the exact recorded status; compensate a queued reinterpretation (cancel if unclaimed, leave a running one) | + `entries` (lock), `jobs` | `private.undo_resolve_pending_question_v2_v3` | `resolve_pending_question_v2.sql`, `_v3.sql` |
| `confirm_entry_tasks`, `confirm_entry_task_candidates`, `_v5`, `_v6` | cancel (never delete) tasks, remove resolution rows, v5/v6-only count gate | `tasks`, `entry_task_candidate_resolutions`, `undo_operations`, `audit_logs` | `private.undo_confirm_entry_tasks` | `candidate_action_consistency.sql`, `editable_candidate_confirmation{,_race}.sql`, `phase_2c_slice_4.sql`, `phase_2c_slice_5.sql` |
| `correct_entry_interpretation` | append a compensating revision, restore the entry pointer, `55P03` on a newer revision | `entry_interpretations`, `entry_entities`, `pending_questions`, `entries`, `undo_operations`, `audit_logs` | `private.undo_correct_entry_interpretation` | `interpretation_revisions.sql` |

**Implementation.** Migration `202607250052`. Bodies moved verbatim (only `current_user_id` → `p_user_id`). Handlers are `SECURITY INVOKER`, `search_path = ''`, `execute` revoked from every role, each refusing an `action_type` it does not own. Dynamic dispatch through `format('select private.%I($1, $2)', …)` on a name from a private, fully-revoked registry table — not user input, and `%I` quotes it. Handlers run in the router's transaction, so a failed integrity check still leaves the row `available`.

**Independent review corrections.** Three. (1) Four existing pgTAP assertions inspect `pg_get_functiondef('public.undo_operation(uuid)')` as source text — the 2C-UNDO-004 "no `40001`" guard, the "`55P03` present" guard, the `pg_catalog.greatest(` recurrence guard, and "undo supports interpretation compensation". Three would have passed *vacuously* after the split and one would have failed. `private.undo_operation_definition_bundle()` was added and all four re-pointed at it, so they are now stronger than before and cover handlers added later without further edits. (2) The registry table must not have forced RLS — it would make the router's own lookup return zero rows; it is unreachable via the `private` schema and `revoke all` instead. (3) The FK was replaced by a trigger for the generated-types reason in §1.

**Acceptance.** Accepted. Signature, grants, preamble order, lock order, replay mechanism, every SQLSTATE and every return shape are byte-compatible. `supabase/tests/undo_operation_routing.sql` (19 assertions) covers router posture, registry integrity, handler posture, the structural guarantee, and the router's own fail-closed fallback (reached by disabling the guard inside the test transaction). Adding a Phase 2E undoable operation is one handler plus one registry row.

### C — Production extraction validation (H5, H4 partial)

**Investigation.** Confirmed `entry.ts:288` did `JSON.parse(outputText(responseJson)) as Extraction`, and that the local `Extraction` type left `taskCandidates`/`pendingQuestions` as `unknown[]` — the two riskiest arrays were not typed at all. Built a field-by-field diff of the Node Zod schema, the hand-written Deno JSON Schema, and what `persist_entry_interpretation` validates (four `jsonb_typeof` checks). Two findings beyond the review: the read side (`interpretations/data.ts:282`) maps a Zod parse failure to `extraction: null`, so divergence means **silent total loss of the interpretation in the UI** with no error anywhere; and a `JSON.parse` `SyntaxError` message embeds an excerpt of the offending input, which flowed into `jobs.error` and was rendered verbatim on the Jobs page.

**Implementation.** A dependency-free validator in `_shared/`, chosen over `npm:zod` specifically so Vitest can import it — that is what makes continuous behavioural parity possible in the *existing* CI job; a `npm:` specifier would have been verifiable only by a manual deploy. The worker parses, validates, and throws value-free classified errors; retry behaviour is unchanged (a nondeterministic model may succeed on the next attempt). `usage-order.test.ts` was extended in the same commit — it pins the literal `JSON.parse(outputText(responseJson))` and now also asserts the ledger write precedes validation, so rejecting invalid output cannot skip cost already incurred.

**Parity result, and the lesson in it.** The corpus stands at 114 cases; its history is the point. The first 77 cases passed on the first run with zero disagreements, which was reported here as evidence of parity. It was not — it was evidence of corpus selection. Two independent reviewers, working separately from a throwaway probe rather than from the corpus, each found the *same* four divergence classes it missed:

| Divergence | Direction | Consequence |
|---|---|---|
| Timezone offset range — `[+-]\d{2}:\d{2}` accepted `+99:99`, `+05:99`, `-24:00` | worker accepted, Zod rejected | persisted, then the read-side `safeParse` fails → interpretation renders `null` with no error anywhere: **exactly the failure this module exists to close** |
| `parentIndex` — `Number.isInteger` accepts `2**53`, `1e21`, `1e300`; `.int()` is safe-integer | worker accepted, Zod rejected | same silent-degradation path |
| Years `0000`–`0099` — `Date.UTC` maps them to `1900+year`, so the round-trip check failed | worker rejected, Zod accepted | valid output refused |
| Array holes — `Array.prototype.forEach` skips them, so `concepts` with a hole was accepted as a shorter array, defeating `.min(1)` | worker accepted, Zod rejected | unreachable through `JSON.parse`, but the exported validator's invariant was broken |

All four are fixed: an arithmetic leap-year rule replaces `Date`, the offset is range-checked, `Number.isSafeInteger` replaces `Number.isInteger`, and every element loop indexes explicitly. All four classes are now in the committed corpus, so none can regress silently.

One nuance that a later check surfaced and that is easy to misread: the `isStorableInstant` refinement is **invisible to the model**. `zodTextFormat` converts this schema for OpenAI Structured Outputs and silently drops `.refine()` — the emitted `pattern` is Zod's own datetime regex, which still allows ±23:59. The conversion does not throw (verified: `strict: true`, all twelve properties present), so nothing is broken; but the provider may still return an unstorable offset. What changed is that the worker now refuses it before any write, instead of the database refusing it after one. Enforcement lives in the two validators, not in the response schema, and the code says so.

The review also surfaced a **Critical** consequence of the first fix. PostgreSQL caps a `timestamptz` UTC offset at ±15:59, while Zod's grammar allows ±23:59 — so an offset of `+16:00` would have been accepted by *both* the worker and the source-of-truth schema and then refused by migration `202607250053`'s `::timestamptz` cast. That is precisely the "worker/DB disagreement strands real entries in `failed`" failure the migration header claims to avoid, and it would have burned the job's retry budget on an error retrying cannot fix. The storable bound now lives in all three layers — `isStorableInstant` in the Zod schema, `isIsoInstant` in the worker validator, and an assertion in `ai_interpretation_bounds.sql` — and the corpus pins ±15:59 versus ±16:00 on both sides.

**Acceptance.** Accepted after that second round. Malformed model output cannot reach domain tables; valid output is unchanged; boundary cases are covered deterministically in both runtimes; the worker tests execute in CI; failure and retry behaviour are preserved. The honest reading of this workstream is that the mechanism (a parity test in the existing CI job) was right and the first corpus was not adversarial enough — which is what an independent review is for.

### D — i18n canonical direction (H6)

**Investigation.** Seven mechanisms, not five: `src/i18n/messages.ts` (3 consumers), typed copy modules with `satisfies` (9 consumers), copy modules with only `as const`, action-local records, component-local records, 77 inline `{ "pt-BR": …, en: … }` literals across 5 files, and 180 `pt ? … : …` ternaries across 36 files, plus 13 duplicate locale-union declarations. `next-intl` had zero imports anywhere. The defect was larger than the review's two files: 30 Portuguese-only strings across four action files, including 14 in `agent/actions.ts` (reminders and upload) that the review did not flag. A fifth file surfaced during review — `capture/actions.ts` surfaced `capture/schema.ts`'s Portuguese-only Zod messages verbatim through `issues[0].message` — and is fixed too, by never showing a raw validator message.

**Implementation.** ADR-036. All 30 strings localized. `resolveLocale` (already in `src/lib/preferences.ts`) resolves locale first and independently, which removes the defect class rather than the 34 instances. `next-intl` removed from `package.json` and the lockfile (706 lines of transitive entries). `interpretations/actions.ts`'s three branches use the file's existing `localized()` idiom per the opportunistic-migration rule rather than being rewritten.

**Independent review correction.** Two Vitest files mock `@/lib/preferences` with only `defaultAgentPreferences`; adding a `resolveLocale` import to `agent/actions.ts` would have made them fail. Both mocks were updated in the same change.

**Acceptance.** Accepted. English users no longer receive known Portuguese-only action errors; one mechanism is canonical and compile-enforced; the rule is documented in the binding standards document with an explicit incremental-migration policy.

### E — RPC version retirement policy (H3)

**Investigation.** Exactly two versioned families exist (`_v\d` scan of all 51 migrations); `guard_v2_*` is a trigger guard, not a version. **No `revoke ... from authenticated` exists anywhere** in the history — all 19 revokes target only `public`/`anon`. Traced every consumer across TypeScript, SQL, Edge Functions, pgTAP, Vitest, e2e, scripts, docs and generated types. Established that no SQL function *calls* a superseded version — `undo_operation` only dispatches on recorded `action_type` strings — so a grant revoke cannot break undo. Established that generated types are ACL-blind (`run_all_heartbeats` and `claim_attachment_job` are in the committed file with `execute` revoked), so a revoke is a zero-diff change and therefore invisible to every existing gate.

**Implementation.** An eight-point policy in `docs/DATABASE.md` plus the full inventory table, ADR-037, and exactly one revocation. `supabase/tests/rpc_version_retirement.sql` (24 assertions) encodes the inventory as an executable contract — which is now the only gate that can catch a grant change at all.

**Acceptance.** Accepted. The policy is explicit; all ten current mutation RPC versions are inventoried with a written classification; the one revocation is evidence-backed and one-line reversible; rollback remains possible; the Phase 2D deferral is upheld untouched.

### F — Approved quick wins

Verified and implemented: truthful error boundary with `error.digest` and a structured log line; explicit OpenAI `timeout`/`maxRetries`; embedding `x-request-id` for ledger idempotency; defensive chat citation hydration plus the chat slice's first tests; deleted `cost-calculator`, `summarizeAIUsage` and helpers, and `resolveAIRoutes` (all test-only consumers, deleted with their tests; `parseAICostSummary` and `MODEL_PROFILES` verified live and kept); `retryProcessingJob` removed; four documentation claims corrected; `next-intl` removed; source-parity locks for the three `_shared` pairs.

Verified and **not** implemented, with reasons in §5: coverage thresholds (not in scope, and must be measured); the Jobs-page render change for `jobs.error` (worst leak closed at the source); both L13 index gaps (one premise corrected — see §1).

---

## 3. Verification

| Gate | Result | Notes |
|---|---|---|
| `npm ci` / lockfile integrity | **PASS** | Lockfile updated for the `next-intl` removal; the only version changes are removed transitive entries |
| `npm run lint` | **PASS** — 0 errors, 0 warnings | Four unused imports left by the `retryProcessingJob` removal were found by lint and removed |
| `npm run typecheck` | **PASS** — 0 errors | |
| `npm test` (Vitest) | **PASS** — 1020 tests, 94 files | Baseline was 902/93. Net +118 after 3 new files and 2 deletions |
| `npm run build` | **PASS** | Also green in CI |
| `deno check` (both deployed entrypoints) | **PASS** | First static gate this code has ever had. Run with the exact CI flags |
| `deno test` over every function directory | **PASS** — 28 tests | Deno 2.9.4; the pre-existing `dispatch.test.ts` header admitting it had never executed is now false |
| Offline Playwright | **PASS** — 6 passed, 66 skipped | The 66 are credential-gated online journeys that skip cleanly (review M12) |
| **Migration reset from zero** | **PASS — executed in CI** | `supabase db reset` applied all 54 migrations to an empty database. Nothing had ever checked this. This is the single most important result on the branch, and it could not be produced locally |
| **Full pgTAP suite** | **PASS — executed in CI** | `Files=24, Tests=821`. The first execution of this suite as a suite in any environment. It found exactly one failure — a pre-existing test defect, fixed (§3.1) |
| **`supabase db lint`** | **PASS — executed in CI** | `--schema public,private --level warning --fail-on error`. Zero findings in `private`; one in `public` (the long-standing `run_user_heartbeat` 42804 warning, tolerated); the 30 findings in `extensions` are pgTAP's own internals, which is why the lint is schema-scoped |
| **Foundation journey on the built app** | **PASS — executed in CI** | Desktop and Pixel 7, against the production build and a real local Supabase |
| Generated types parity | **NON-BLOCKING WITH REASONED PARITY** | No exposed-schema signature changed: `undo_operation(uuid)` keeps its exact signature, `confirm_entry_tasks` still exists (only its grant changed, and the generator is ACL-blind), and every new object is in the unexposed `private` schema or is a trigger. The FK that *could* have altered relationship metadata was deliberately replaced by a trigger for this reason. Regeneration is ENVIRONMENT-GATED: `gen types --linked` reads the remote schema, which does not have these migrations, so running it now would prove nothing. |
| Migration parity | **N/A this branch** | Three additive migrations, not applied to the linked project. No prior migration edited. Local/remote parity remains at `202607230051` until a separately authorized deploy. |
| Remote smokes | **ENVIRONMENT-GATED** | Require an authenticated session against the shared linked project and create real Auth users. Unchanged by this work: no RPC signature, payload contract or grant a smoke exercises was altered, except the `confirm_entry_tasks` grant, which no smoke calls. |
| Architecture-boundary tests | **PASS** | Included in Vitest; `daily-cycle/architecture.test.ts` and the page-scoped variants are green |
| Documentation consistency | **PASS** | Four verified false claims corrected; one reported-false claim verified as true and left alone (§1) |

### 3.1 What the new gate found on its first three runs

The gate justified itself immediately. Each of these was invisible to every check that existed before this branch, and none could have been found locally.

1. **`deno check` failed** with `Could not find "@supabase/supabase-js" in a node_modules folder`. Run from the repository root, Deno discovers the root `package.json`, adopts the entire Next.js dependency tree as its own manifest, and then expects a populated `node_modules/`. It passed locally only because `node_modules/` happened to exist. Fixed by scoping every Deno command to the function's own `deno.json` with `--node-modules-dir=none --no-lock`; verified by running the exact CI commands with a cold `DENO_DIR` and no `node_modules`.
2. **The pgTAP suite failed on exactly one assertion out of 821** — `resolve_pending_question_v3.sql` test 37, `have: NULL, want: none`. A pre-existing defect: the assertion resolved a question the same file had answered 160 lines earlier, using a *fresh* operation key, so the RPC correctly refused it as no longer open, the test helper returned its error object, and `consequence` came back `NULL`. It could never have passed anywhere; the `plan(34)`-vs-37 mismatch had been masking the per-test result. Fixed to replay the *same* key without the consequence, which is what the section header ("Absent consequence canonicalizes to none") actually meant to prove and is strictly stronger — a broken canonicalization now raises `2D_IDEMPOTENCY_MISMATCH` and the assertion fails.
3. **`supabase db lint` failed** on 7 error-level findings, all in `extensions.*` — pgTAP's own internals, installed by `seed.sql` to run the suite. A gate that exists to check code this project owns must not fail on its own test harness, so the lint is scoped to `public,private`. The same run also surfaced `The following container names are not valid to exclude: inbucket, analytics, functions` — three names `supabase start --help` advertises but the implementation rejects.

All three jobs are green as of the third run.

### 3.2 The two gates that could not be verified locally, and why that is now moot

Docker Desktop is not installed on this workstation — documented in `CHANGELOG.md` since Phase 2A and in `TODO.md` under external dependencies. The point of Workstream A is precisely that these gates should not depend on one machine: they run on `ubuntu-latest`, where Docker is free. Their first real execution was therefore this pull request's own CI, which is where all three findings above came from. Earlier drafts of this report classified migration-reset, pgTAP and `db lint` as ENVIRONMENT-GATED; they are now **PASS — executed in CI**, and the classification above reflects that rather than the pre-push state. Deno was the mirror case: also unavailable, so it was installed (2.9.4), and that gate was additionally executed locally.

### 3.3 Amendments made after this report was first written

Two of the three new migrations were edited after their first commit, which is worth stating plainly rather than leaving to the diff. `202607250052` gained a corrected comment (eight `action_type` values, not seven), a distinct error for a handler returning NULL, and a `to_regprocedure`-based definition bundle that fails cleanly instead of raising on an unresolvable handler name; `supabase/seed.sql` gained an explanatory comment. Editing them is correct rather than a violation of the append-only rule: they have only ever been applied to an ephemeral CI database, never to a shared environment. Once this branch merges and is deployed, they are frozen like every other migration.

---

## 4. Security and compatibility

- **RLS.** No policy added, removed or altered. The one new table (`private.undo_operation_handlers`) is not user-owned, has no `user_id` and no user content; forcing RLS on it would make the router's own lookup return zero rows, so it is protected by the unexposed `private` schema plus `revoke all` — the same posture as the private validator functions since `202607170024`.
- **Grants.** Four new private functions and one new private table, all `revoke all` from `public`, `anon`, `authenticated`, `service_role`. One deliberate revocation (`confirm_entry_tasks` from `authenticated`). No grant widened anywhere.
- **RPC compatibility.** `undo_operation(uuid)` keeps its signature, security posture, grants, preamble order, error codes and per-branch return shapes. Its three Server Action callers inspect neither SQLSTATE nor the returned JSON, so they are unaffected either way. Nine retained versions keep `authenticated` execute, now asserted by pgTAP.
- **Undo compatibility.** All seven recordable `action_type` values route to a handler; every existing undo record remains undoable. The v5/v6-only resolution-count gate stays v5/v6-only, so v2–v4 undo is unchanged. Compensation still cancels rather than deletes, still never rewrites an interpretation revision, and still copies `is_record_only`.
- **Replay.** The `status = 'undone'` short-circuit stays in the router, returning the same idempotent shape including `interpretation_id` read back from `after_state`. Canonical replay fingerprints are untouched.
- **Concurrency.** Lock order preserved exactly, including the `entries` lock taken *before* the pending-questions UPDATE on the reinterpret path that `202607230051` depends on. Handlers run in the router's transaction, so a failed integrity check rolls the whole undo back and leaves the row `available`.
- **Worker validation.** Model output is validated before any persistence. Errors carry field paths and machine codes only, never values; the `SyntaxError` path that leaked a model-output excerpt into `jobs.error` (rendered on a user-facing page) no longer propagates. Ledger-before-domain-write ordering is preserved and now additionally asserted against validation.
- **Rollback.** Every change is one line or one migration to revert: re-create the monolith and drop the registration trigger (B); drop the bounds trigger (C); re-grant `confirm_entry_tasks` (E). The worker change reverts by redeploying the prior function version, whose bundle must be preserved first, per the v12/v13 precedent. No destructive down migration anywhere; no prior migration edited.
- **Deploy order (when a deploy is separately authorized).** Worker first, then migrations `202607250052`–`202607250054`. Reversed, an in-flight worker running the old unvalidated code could burn its retry budget on a `P0001` it cannot fix.

---

## 5. Deferred items

Recorded in full in `docs/TODO.md` under "Pre-Phase-2E hardening — deferred follow-ups", with the reason for each: C1 (rate limiting and spend caps — the review's only Critical, and it blocks public production rather than Phase 2E), H7's error sink, H8/M21 (cron dead-man's switch and cost alerting), M6 (retention purges), M19/M20 (deploy runbook, backup verification), H4's prompt/version artifact, the remaining H9/M14/M16 test gaps, M1–M5 structural work, M7/M8, M9/M10 model routing and catalog, M11, M12/M13, M17, M18, M22/M25, M23's pgvector decision, M24/L12/L13, L10, L11's render change, L1/L2/L4/L5 remainders, O1, O2.

Nothing on that list is required to start Phase 2E. Two items are required before a pilot (H7 and H8) and one before public production (C1), exactly as the review's own production-readiness assessment states.

---

## 6. Exact gate output

Reproduced verbatim in the pull request description and in the branch's commit messages. Summary:

- `npm run lint` → `eslint .`, exit 0, no output.
- `npm run typecheck` → `tsc --noEmit`, exit 0, no output.
- `npm test` → `Test Files 94 passed (94) / Tests 1020 passed (1020)`.
- `deno check --config supabase/functions/<fn>/deno.json --node-modules-dir=none --no-lock <entrypoint>` → exit 0 for both.
- `deno test --config supabase/functions/process-jobs/deno.json --node-modules-dir=none --no-lock $(ls -d supabase/functions/*/)` → `ok | 28 passed | 0 failed`.
- pgTAP static plan verification → `files with delta != 0: 0 / 24`, `total planned: 822 total counted: 822`.
- pgTAP in CI → `Files=24, Tests=821` on the run before the final assertion was added; all green.

---

## 7. Full-branch review loop

After every workstream was individually accepted, three independent reviewers — none of which wrote any of the code — reviewed the **complete branch diff** across nine dimensions: database and migrations, security and RLS, undo and replay semantics, AI validation and worker behaviour, CI and test reliability, i18n and user-facing behaviour, compatibility and hidden consumers, documentation and ADR consistency, and maintainability. They ran the gates themselves and wrote throwaway probes rather than trusting the committed tests.

**Critical (2) — both fixed.**

1. The PostgreSQL ±15:59 `timestamptz` offset ceiling versus Zod's ±23:59 grammar, which would have stranded entries in `failed` — §2C.
2. `SECURITY.md` asserted a foreign key that had been deliberately rejected in favour of a trigger. A permanent security document claiming a structural guarantee by the wrong mechanism.

**Important (14) — all fixed.** Four validator/Zod divergence classes (§2C). Three self-contradictions in ADR-035 left behind by the FK→trigger switch. Wrong counts in four documents (assertions 18→19, corpus 79→114, localized strings 34→30, `action_type` values seven→eight). ADR-038 and the report describing a `db lint` command and a container-exclusion list that the CI fixes had since changed. `agent/actions.ts` using bare `as const` copy records in the very commit that made `satisfies Record<Locale, …>` canonical — the reviewer tested the claim and confirmed a missing key was caught only because it happened to be read. A false comment in `error.tsx` claiming a structured line reached "the host's stdout" when an error boundary is a Client Component and reaches the browser console, and Next redacts `error.message` for Server Component errors in production anyway. The report's verification table understating its own evidence after CI had actually run everything. A `-x vector` exclusion left in place while `[analytics]` cannot be excluded and consumes the vector pipeline. `--no-lock` documented as if `package-lock.json` governed Deno resolution, which it does not. `STATE.md` history still describing `retryProcessingJob` as live.

**Minor (7) — 6 fixed, 1 recorded.** The `deno-parity` normalizer's import-stripping regex over-stripped (demonstrated: a semicolon-less import swallowed the following statement, so the suite compared less while still passing) — narrowed to an anchored prologue requiring a `from "…"` terminator. `operational-copy.test.ts` did not audit `error.tsx`, so the removed "the problem was recorded" promise could silently return — the file and two patterns are now in that audit. `undo_operation_definition_bundle()` used a `::regprocedure` cast that raises rather than `to_regprocedure`, so an unresolvable handler would have thrown for its four pgTAP callers instead of failing cleanly. `usage-order.test.ts` scanned the whole worker for `p_provider_request_id: null` — scoped to the embedding block. A fifth Portuguese-only path in `capture/actions.ts`. Two imprecise characterisations in ADR-035. Recorded rather than fixed: `ci.yml` applies `process-jobs/deno.json` to the other function directories, harmless while both configs are `{"imports": {}}`.

**Not actionable / refuted (notable).** One reviewer predicted `rpc_version_retirement.sql` would fail because Supabase's default privileges leave `service_role` with EXECUTE on the retired `confirm_entry_tasks` — **refuted by execution**: that file passes in CI. Another reproduced a Vitest forks-pool worker timeout locally and flagged CI flake risk; recorded in `TODO.md` as a watch item rather than tuned, because the observation came from a machine running several concurrent Vitest instances and the suite has since passed three CI runs and repeated local runs cleanly. A third confirmed the handler bodies are byte-identical to the monolith line by line, and that every `pg_catalog.` qualifier in the three migrations resolves — with the special forms (`coalesce`, `greatest`, `least`, `char_length`, `trim`, `nullif`, `position`) correctly left bare, which is the exact class of defect `202607220042`/`045` had to fix twice.

**One review claim was itself corrected.** ADR-035's "moved verbatim, only `current_user_id` → `p_user_id`" was too strong: each handler also gains a three-statement preamble with no monolith analogue (a re-`select` of the already-locked row, a `P0002` guard, and an ownership guard). The *compensation logic*, lock order, every SQLSTATE, every `detail` code and every return shape are byte-identical; the ADR now says that precisely instead of overstating it.

## 8. Verdict

The branch delivers all seven objectives of the initiative: a real CI gate for database and worker correctness; a safer and extensible undo architecture; strict validation on the production extraction path; one documented i18n direction; a formal RPC-version retirement policy applied once on evidence; selected low-risk quick wins; and updated permanent documentation with complete verification evidence.

Two gates — migration reset from zero and the pgTAP suite — are the gates this initiative *introduces*, and their first execution is this pull request's own CI rather than a local run, because Docker is unavailable on the development workstation. That is stated as evidence debt, not as verification. Phase 2E is not started and is not authorized by this work.

# Phase 2F — Slice 2F.5 PRD (definitive)

**Status:** definitive. Supersedes the initial draft after one independent adversarial review cycle (§23).
**Owns:** `2F-MEASURE-001` … `2F-MEASURE-007` (epic 2F-E) plus the cross-cutting `2F-OPERATIONS-002`.
**Authority:** `docs/PHASE_2F_PRD.md` Revision 4.2 §6.9, §7, §8, §10, §11, §12; `docs/DECISIONS.md` ADR-052, ADR-055.
**Excludes:** every Slice 2F.6 requirement (`2F-OPERATIONS-003…006` and the whole-phase convergence audit) — see §22.

---

## 1. Problem statement

Phase 2E shipped a complete task-command surface and, in Slice 2E.7, seventeen product events with **zero application readers**. Phase 2E §22 deferred semantic task retrieval to "should the measured baseline later justify" it; Slice 2F.1 replaced that undefined gate with a measurable one (ADR-055, `2F-MEASURE-002…006`). Three things are still missing, and all three are 2F.5's:

1. **Nothing can compute the gate.** ADR-055 names nine thresholds over qualifying commands, active days, observation windows, distinct users, `no_match` rate and no-match-to-creation rate. No code in the repository aggregates a single `task_command_*` event. The gate is currently decided by taste — the exact failure ADR-055 exists to prevent.
2. **The only published match baseline is scope-caveated.** `2E-MATCH-018` was delivered as a **scoring-layer** measurement over a 14-scenario corpus whose `prefilterTier`, `tokenOverlap` and `queryTokenCount` are hand-written (`src/features/task-commands/match-baseline.test.ts`; `docs/reports/PHASE_2E_FINAL_REPORT.md` §3, lines 56–70, and line 145). Its caveat forbids comparing a future end-to-end number against it. `2F-MEASURE-007` discharges the caveat by measuring the same rates **end-to-end against the deployed contract**.
3. **ADR-055's 90-day expiry is undated.** `docs/TODO.md:30` carries a placeholder that names Slice 2F.5 as its dater. An undated expiry is the "permanently pending gate" ADR-055 itself rejects.

## 2. Current system behaviour

| Concern | Today (verified) |
|---|---|
| `task_command_*` emitters | **Five sites.** `src/features/task-commands/actions.ts:132` (`task_command_previewed`), `:766` (`task_command_disambiguated`), `:875` and `:981` (`task_command_applied`), `:1070` (`task_command_undone`) — all carrying `commandOrigin: context.origin`. Plus `src/features/operations/actions.ts:386` (`task_command_applied`, hard-coded `origin: "work"`, `route: "direct"`), added by Slice 2F.2. |
| Which origins reach which events | The command console is mounted **twice**: `src/app/[locale]/app/chat/page.tsx` and `chat/[conversationId]/page.tsx` with `origin="chat"`, and `src/features/daily-cycle/work-view.tsx:77` with `origin="work"`. So **all four** event names occur with **both** origins. Additionally, Work-surface *direct-action buttons* emit `task_command_applied`/`work`/`direct` with **no preceding `task_command_previewed`** (`operations/actions.ts:386`), and there is **no** Work-surface direct-action undo event. |
| Storage | `public.product_events` (`202607170024:8-51`): `user_id` → `auth.users(id) on delete cascade` (`:10`), `event_name`, `surface`, `locale`, `viewport_class`, `app_version`, `properties jsonb` (≤4096 bytes), `subject_type`/`subject_id`, `session_id`, `idempotency_key`, `is_synthetic boolean not null default false`, `created_at`. |
| Read authorization | `enable row level security` + `force row level security` (`:60-61`); policy `product_events_select_own` — `for select to authenticated using ((select auth.uid()) = user_id)` (`:63-64`); `revoke all … from public, anon, authenticated, service_role` (`:76`) then `grant select on public.product_events to authenticated` (`:77`). No later migration re-grants (verified across the whole chain). **An owner-scoped reader needs no migration and no new grant.** |
| Write authorization | `record_product_event` / `record_product_event_for_user` only; the per-event-name key allowlist is enforced in the recorder guard (`202607280061:304-317`) with value validators at `:394-446`; the four names enter the table CHECK at `:113-116`. |
| Existing readers | **No application reader.** One *executed* owner-scoped script read already exists: `scripts/remote-product-events-smoke.mjs:364,370` selects from `product_events` through an owner-authenticated client (`:58-64`) against the deployed project — prior evidence that the `authenticated` select works remotely, not only in the migration text. |
| Match baseline | `match-baseline.test.ts`, pinned at `policyVersion 2026-07-25.3`, 14 scenarios, oneStep `0.429`, matchedNeedsDeliberateness `0.071`, confirmationRequired `0.071`, ambiguous `0.214`, noMatch `0.214` — **scoring layer only**. |
| Expiry entry | `docs/TODO.md:30`, undated placeholder. |
| Candidate loading | `loadTaskCandidates(input)` (`candidates.ts:205`) takes a **single object** whose `client` is a duck-typed `TaskCandidateQueryClient` (`:39`); production passes a real `@supabase/ssr` client (`actions.ts:384`). It calls the deployed `list_task_command_candidates` (`:233`) and validates shape, reachability and ownership. `rankTaskCandidates` (`matching.ts`) scores the rows. |
| Task seeding | `service_role` is untouched by Slice 2F.4: `202607300063:38-40` states "no table grant to it exists anywhere in the chain … Nothing here touches it"; `:90` revokes `insert, update, delete` from `authenticated` only. `scripts/remote-phase-2e-smoke.mjs:154-158` seeds tasks with the service-role client and still passes (2F.4's acceptance ran the full remote suite green). |
| Timezone | `public.profiles.timezone text not null default 'America/Sao_Paulo'` (`202607160001:12`). Production tolerates a **missing profile row**: `task-commands/actions.ts:214-224` uses `.maybeSingle()` and falls back to `defaultAgentPreferences.timezone`. Precedent for a timezone-parameterised owner-scoped aggregate: `get_ai_cost_summary(p_timezone)`. |

## 3. Repository evidence

| # | Evidence | Used for |
|---|---|---|
| E1 | `supabase/migrations/202607170024_phase_2x_product_events.sql:10,60-64,66-68,76-77` — cascade FK, RLS + force, owner policy, the synthetic index, revoke-then-grant | §7, §8, §9, §12, §15 |
| E2 | `supabase/migrations/202607280061_*.sql:113-116` (names in the table CHECK), `:304-317` (per-name key allowlists), `:394-446` (value validators) | §6, §10 |
| E3 | `src/features/product-analytics/contracts.ts:22-82` (task-command vocabularies, non-exported `readonly T[]`, one a spread; `taskCommandAnalyticsVocabularies` exported `as const` as an **object**), `:117` (`productEventNames`), `:267,300,507,521` (`synthetic` is a client-supplied payload field) | §9, §11, D2, D4 |
| E4 | `src/features/task-commands/outcomes.ts:24-49` — the twelve outcome members (`still_unmatched:38`, `creation_offered:40`, `unsupported:42`) | §6, §10 |
| E5 | `src/features/task-commands/analytics.ts` — `TASK_COMMAND_APPLY_ROUTES`, `TASK_COMMAND_ORIGINS`, `TASK_COMMAND_UNDO_RESULTS`, `TASK_COMMAND_PREVIEWED_OUTCOMES:121-124` (a spread) | §6, §10 |
| E6 | `docs/DECISIONS.md` ADR-055 — both tiers, the nine numbers, the **final-outcome** `no_match` definition, the five permanent non-authorizers, the expiry mechanism | §6, §17, §23 |
| E7 | `docs/PHASE_2F_PRD.md` §6.9 (`:178-184`), §7 (`:214,217`), §8 2F.5 (`:229`), §10 (`:263-278`), §11 (`:286`), §12 (`:290-296`) | all |
| E8 | `src/features/task-commands/match-baseline.test.ts` + `docs/reports/PHASE_2E_FINAL_REPORT.md` §3 (lines 56–70) and line 145 — the retained scoring-layer baseline and its cross-scope prohibition | §6, §10, D5 |
| E9 | `scripts/product-event-vocabulary.mjs:42-45,60-66,74-82` — the parser accepts only `export const X = [ … ] as const` flat string arrays and **throws** on a spread; `readProductEventVocabulary` returns exactly `{eventNames, surfaces}`. `src/features/task-commands/smoke-taxonomy-reader.test.ts:25,31,41,54` — Vitest importing `scripts/*.mjs` | §9, §11, D2, M2 |
| E10 | `scripts/remote-product-events-smoke.mjs:41,284,367,379` — every smoke marks its traffic `p_is_synthetic: true` and asserts it; `:426-428` names its controls; `:431-434` deletes fixture users | D4, §18 |
| E11 | `scripts/remote-phase-2e-smoke.mjs:1-70` (preflight, exit-2 vs exit-1, drain-safe rationale, fail-closed cleanup), `:52,154-158` (service-role seeding) | §11, §18, M1 |
| E12 | `src/features/task-commands/candidates.ts:39,195-208,233` — single-object signature; a real supabase-js client satisfies `TaskCandidateQueryClient` because production already passes one (`actions.ts:384`) | D5 |
| E13 | `vitest.config.ts:9-10` — `include: ["src/**/*.test.{ts,tsx}"]`, so a new `*.test.ts` under `src/` runs in the `app` job (`.github/workflows/ci.yml:31`) unless excluded. `eslint.config.mjs` ignores only build output; `tsconfig.json:25-32` covers `**/*.ts` with `allowJs` | D5, §13, K6 |
| E14 | `docs/TODO.md:30` — the undated expiry placeholder naming Slice 2F.5 as its dater | §6, §17, D7 |
| E15 | `docs/reports/PHASE_2F_SLICE_04_ACCEPTANCE.md:182,188-189` — 2F.5 and 2F.6 confirmed not started; no reader, no baseline, no traceability generator, no cleanup verifier exists | §1, §22 |
| E16 | `docs/PHASE_2F_PRD.md:292` + `202607300063:90` — after 2F.4 `authenticated` holds **SELECT only** on `public.tasks`, so nothing this slice adds may attempt an authenticated task write | §7, §18 |
| E17 | `src/features/task-commands/actions.ts:347-358` and `:719-726` — both `unsupported` paths return **before** any emit exists (`report` is defined at `:400`; the second returns before a session exists) | §6, §10, B3 |
| E18 | `src/features/task-commands/actions.ts:411,466,546,558,573,615-623,979-989` — the emitted preview categories and the `applyRoute: 'created'` apply; `:746-777` — the disambiguation re-round emits a **second** previewed row | §6, §10, B2, M6 |
| E19 | `supabase/tests/product_events.sql` — the existing pgTAP file for this table, where the cascade assertion belongs | §18, B4 |
| E20 | `src/lib/supabase/direct-write-guard.test.ts`, `sql-grammar-guard.test.ts`, `work-surface-reuse.test.ts` — the CI tests behind the two §10 gate cells 2F.5 carries (`docs/PHASE_2F_PRD.md:265-266`) | §17, §18, Mo9 |

## 4. Goals

1. Ship a minimal, internal, owner-scoped, content-free **command-funnel reader** computing every measure `2F-MEASURE-001` names, over the events that actually exist.
2. Make **both ADR-055 tiers and the 90-day expiry mechanically computable**, with `no_match` computed on ADR-055's **final-outcome** definition and the distinct-user count explicitly out of range.
3. Prove the exclusion mechanisms **non-vacuously**, and record precisely what remains unprovable with the credentials this repository holds.
4. Publish the **end-to-end match baseline**, pinned, labelled `end-to-end`, beside the retained scoring-layer baseline, cross-scope comparison prohibited.
5. **Date** the `TODO.md` expiry entry from go-live.
6. Add **no migration**: the phase's count stays at exactly two.
7. State every structural limitation of the measurement in the reader's own output, so a pasted number cannot be over-read.

## 5. Non-goals

1. No dashboard, chart, BI surface, external exposure, route, page, nav entry, or user-facing copy.
2. No new product event, no new event property, no allowlist widening, no new storage, table, view, RPC, or migration.
3. No reason-level refusal granularity (`2F-MEASURE-001` puts it out of phase).
4. No change to matching policy, thresholds, weights, or `TASK_COMMAND_POLICY_VERSION` / `TASK_MATCH_POLICY_VERSION`.
5. No semantic retrieval, embedding index, offline replay spike, or `source_type` widening.
6. No new emitter, and **no fix** for the unreachable categories B3 names — the reader reports the gap; it does not close it.
7. No Slice 2F.6 artifact (§22).
8. No `product_events` retention/purge implementation.

## 6. Functional requirements

**S5-R1 — Measures.** For one owner over one window: `qualifyingCommands`, `activeDays`, `windowDays`, `outcomeDistribution` (every `TASK_COMMAND_PREVIEWED_OUTCOMES` member, zeros included), `refusalOutcomeClasses` (S5-R12), `noMatchRate`, `noMatchToCreationRate`, `originSplit`, `appliedRoutesByOrigin`, `undoResultsByOrigin`, `disambiguationsByOrigin`, `oneStepRate`, `ambiguityRate`, `unsupportedRefusals`, `excludedSynthetic`, `appliedWithoutPreview`, `reachability`, `nonAuthorizing`.

**S5-R2 — Qualifying command.** One qualifying command is one `task_command_previewed` row that survives S5-R4 and whose `outcomeCategory ≠ 'unsupported'`. `unsupported` rows are counted as `unsupportedRefusals` and excluded from **every** denominator (ADR-055; `2F-MEASURE-002`). The unit is a **qualifying preview round**, not a user intent — see S5-R11.

**S5-R3 — `no_match`, on ADR-055's final-outcome definition.** ADR-055 defines `no_match` as a qualifying command whose **final outcome** is `still_unmatched` or `creation_offered`. `creation_offered` is emitted at **preview** time (`actions.ts:623`), and a command that goes on to create emits `task_command_applied` with `applyRoute: 'created'` (`:981`), making its final outcome `applied`. The allowlist carries no command identifier, so no per-row join exists — but the correction is exact at aggregate level:

```
finalNoMatch      = stillUnmatched + max(0, creationOffered − created)
noMatchRate       = finalNoMatch / qualifyingCommands
previewNoMatchRate= (stillUnmatched + creationOffered) / qualifyingCommands   // diagnostic, non-authorizing
windowBoundarySkew= max(0, created − creationOffered)                          // reported when nonzero
```

`created > creationOffered` is only possible when a creation crosses the window boundary; the reader reports the skew rather than clamping silently. `noMatchRate` is the authorizing figure; `previewNoMatchRate` is reported for diagnosis and is listed in `nonAuthorizing`.

**S5-R4 — Exclusion.** Rows with `is_synthetic = true` are excluded and counted in `excludedSynthetic`. Foreign owners' rows are excluded by RLS, never by predicate. **No email-pattern or name-pattern heuristic exists anywhere in the reader** (`2F-MEASURE-002` is explicit on this).

**S5-R5 — `no-match-to-creation`.** `noMatchToCreationRate = |{applied : applyRoute = 'created'}| / qualifyingCommands` (E5, E6).

**S5-R6 — Active days.** The count of distinct calendar dates, in an **explicitly supplied** IANA time zone, carrying at least one qualifying command. The time zone is required with no default; the runner resolves it from `public.profiles.timezone` and **fails closed** when the row is absent. Production deliberately differs — `actions.ts:214-224` falls back to `America/Sao_Paulo` for a missing profile — because a command still has to run, while a *measurement* that silently picks a zone can inflate `activeDays` across a UTC−3 midnight and pass a gate by accident. The divergence is recorded so a non-zero exit is understood rather than debugged.

**S5-R7 — Window.** `(windowEnd − windowDays, windowEnd]`: half-open at the start so no row is counted in two adjacent windows.

**S5-R8 — Tier evaluation.** `evaluateEvidenceTiers(report)` returns, per tier, every threshold, its measured value, a per-threshold boolean, and a verdict from the closed vocabulary `not_met | met | met_pending_privileged_read`. The **spike tier** (50 qualifying commands / 10 active days / 14-day window) is fully computable and may return `met`. The **planning tier** (150 / 20 / 30-day window / ≥2 distinct real users, with `noMatchRate ≥ 0.20` **or** `noMatchToCreationRate ≥ 0.15`) reports `distinctUsers: null` and `privilegedReadRequired: true`; its verdict is **structurally unable to be `met`** — at most `met_pending_privileged_read`. The reader never infers `distinctUsers: 1` from its own owner-scoped range (`2F-MEASURE-004`).

**S5-R9 — Non-authorizing set, in the output.** ADR-055's five permanent non-authorizers (unsupported-refusal volume, adoption/command volume, one-step rate, ambiguity rate, latency) plus `previewNoMatchRate` are listed under `nonAuthorizing`, naming ADR-055 (`2F-MEASURE-005`).

**S5-R10 — Expiry.** `expiryDateFromGoLive(goLive)` returns `goLive + 90 days` as an ISO date; `docs/TODO.md:30` carries that concrete date, computed from this slice's merge date (`2F-MEASURE-006`, D7).

**S5-R11 — Reachability and counting-unit disclosure, in the output.** The reader carries a `reachability` block stating, as data:

| Fact | Value | Evidence |
|---|---|---|
| `unsupported` on a previewed event | **unreachable** in deployed code | E17 (`:347-358`, `:719-726`; `report` defined at `:400`) |
| `applied`, `rejected_conflict` on a previewed event | **unreachable** (allowlisted, no emitter) | E18 emit-site enumeration |
| Preview rounds per user intent | **1–3** | first round (`:411`/`:466`/`:546`/`:558`/`:573`/`:623`), disambiguation re-round (`:746-777` → `:466`), clarification re-round (`:573` then `:546`/`:558`/`:623`) |
| Intents that emit **no** previewed row | possible | `creationRound` returns `presentFailure` before `report("creation_offered")` when the preview or the confirmation issue fails (`:615-622`) |
| `task_command_applied` without a preceding previewed row | Work direct-action path | `operations/actions.ts:386` |
| Work direct-action undo | **no event** | only emitter is `actions.ts:1070` |

Consequence, stated rather than papered over: `qualifyingCommands` counts **qualifying preview rounds**, which over-counts intents by up to 3× on the disambiguation/clarification paths and under-counts on the failed-creation path; `appliedWithoutPreview` reconciles the applied population against the previewed one. `unsupportedRefusals` is structurally `0` against production data until an emitter exists, so `2F-MEASURE-005`'s "unsupported-command refusal volume" is **not measurable this phase** — the exclusion rule is implemented and unit-tested, and is vacuous against production. The acceptance report repeats all of this.

**S5-R12 — Refusal outcome classes.** `refusalOutcomeClasses` is the subset of `TASK_COMMAND_PREVIEWED_OUTCOMES` where the system understood the request and declined to complete it: **`unsupported`, `refused`, `rejected_stale`, `rejected_conflict`**. Excluded, with reasons: `still_unmatched`/`creation_offered` are *no-match* outcomes and are already S5-R3's set (double-classifying would make two measures move together); `ambiguous`/`ambiguous_overflow`/`clarification_requested`/`matched_requires_confirmation` are *unresolved*, not refused; `no_change` is a successful no-op; `applied`/`previewed` are successes. It is **derived in code** as a filter over the imported vocabulary, so the parity test (§18.7) still fails when a member is added.

**S5-R13 — Content-free.** No title, command text, task id, entry id, user id, email, or free-text field of any kind. Only counts, rates, bounded category names, ISO dates and the reachability booleans above (`2F-ANALYTICS-003`).

**S5-R14 — End-to-end match baseline.** A committed corpus is measured against the **deployed** project: tasks are seeded with the **service-role** client exactly as `remote-phase-2e-smoke.mjs:154-158` does (seeding is fixture setup, not the contract under measurement — E11, M1); each corpus command is resolved through the **real** `loadTaskCandidates` against the deployed `list_task_command_candidates`; the **real** `rankTaskCandidates` scores the rows SQL actually returned. The measured one-step / needs-deliberateness / confirmation-required / ambiguity / no-match rates are published **pinned** and labelled `end-to-end`, beside the retained scoring-layer numbers, with cross-scope comparison prohibited (`2F-MEASURE-007`, E8).

**S5-R15 — Fail-closed fixtures.** Every remote artifact creates only disposable fixtures, creates no entries (drain-safe, E11), deletes fixture users inside a `finally`, **asserts the deletion succeeded before the process may exit 0**, and fails if any fixture survives. A preflight distinguishes "not deployed" (exit 2) from "deployed and broken" (exit 1).

## 7. Security and ownership requirements

**S5-S1** Every **measurement** read goes through an **authenticated** PostgREST session and relies on `product_events_select_own` for scoping. The service-role key is used **only** for fixture lifecycle — creating and deleting disposable users, seeding fixture tasks (S5-R14), and the single denial probe of §18.14 — and **never** to read events for a measurement.

**S5-S2** No grant, policy, role or privilege is created, widened or revoked. §12's phase-end permission posture is unchanged.

**S5-S3** The reader is unreachable from the browser: not imported by any client component, route, Server Action, or `src/proxy.ts`. Its only entry points are a Node runner and Vitest.

**S5-S4** No new stored secret. The proof creates its own disposable owners, so acceptance evidence needs no real-owner password. A real-owner read takes credentials supplied at run time and fails closed without them. `.env.example` is untouched; no key is echoed (E11's convention).

**S5-S5** Content-freedom is structural: the aggregator's input carries only `{eventName, createdAt, isSynthetic, properties}` with `properties` narrowed to the allowlisted keys it reads. What it cannot see, it cannot leak.

**S5-S6** Fixture events written by the proof belong to **disposable fixture users**. Even in the worst case — a run killed before cleanup — those rows are outside the real owner's range by mechanism (iii), so they can never enter the real owner's gate computation. This is why the fixture corpus may be non-synthetic where an assertion requires it (§18.12).

## 8. Authorization and RLS behaviour

| Actor | Operation | Expected | Proven by |
|---|---|---|---|
| `anon` | `select product_events` | **denied** (`202607170024:76`; no policy applies) | §18.13 |
| `authenticated` owner A | `select` own rows | permitted, RLS-scoped | §18.12 |
| `authenticated` owner A | `select` owner B's rows | **zero rows** | §18.12 |
| `authenticated` owner A | reader run | exactly A's non-synthetic `task_command_*` rows | §18.12 |
| `service_role` | `select product_events` | **denied** — asserted, not assumed | §18.14 |
| deleted owner | re-authentication | fails; no rows, no partial report | §18.15 |
| owner with zero events | reader run | empty report, all rates `0`, both tiers `not_met` | §18.4, §18.12 |
| any actor | write to `product_events` | only through the recorder RPCs; the reader writes nothing | §16.4 |

Cross-owner denial is asserted **non-vacuously** per `2F-OWNERSHIP-001`: A's **positive** count is asserted **before** B-invisibility, so a zero-row bug cannot pass the isolation check.

## 9. Data sources and source of truth

| Fact | Single source | How the reader obtains it |
|---|---|---|
| Event rows | `public.product_events` | authenticated select |
| The four event names | `productEventNames` in `contracts.ts:117` | **read**, via the existing `readProductEventVocabulary` (E9) — never restated |
| Outcome / origin / apply-route / undo-result vocabularies | `outcomes.ts`, `analytics.ts` (mirrored in `contracts.ts:22-58` and pinned by `contracts.test.ts`) | **mirrored, not read.** `product-event-vocabulary.mjs` parses only flat `export const X = [ … ] as const` arrays and throws on a spread (E9); these four are non-exported `readonly T[]` and one is a spread, so the parser cannot reach them. The aggregator restates them and is held to the imported TypeScript constants by **exact-equality** Vitest cases (§18.7). That is a mirror with a CI gate, materially weaker than a read, and it is labelled as such rather than presented as ADR-052's mechanism. The existing shared script is **not** modified, and `contracts.ts` is **not** re-shaped to suit a test. |
| Thresholds, the `no_match` member set, the non-authorizing set, the refusal subset, the 90-day horizon | declared **once** in the reader module | pinned by exact-equality Vitest assertions against ADR-055's nine numbers (§18.6) |
| Match policy | `match-policy.ts` / `TASK_MATCH_POLICY_VERSION` | read by the end-to-end baseline; never restated |
| Candidate rows | deployed `list_task_command_candidates` through the real `loadTaskCandidates` | E12 |
| Owner time zone | `public.profiles.timezone` | runner, fail-closed (S5-R6) |

## 10. Read model

```
CommandFunnelEventRow = {
  eventName: 'task_command_previewed' | 'task_command_disambiguated'
           | 'task_command_applied'  | 'task_command_undone',
  createdAt: ISO instant,
  isSynthetic: boolean,
  properties: {
    commandOrigin?: 'chat' | 'work',
    outcomeCategory?: <TASK_COMMAND_PREVIEWED_OUTCOMES member>,
    applyRoute?: 'direct' | 'confirmed' | 'created',
    undoResult?: 'undone' | 'unavailable' | 'expired' | 'refused',
    oneStep?: boolean,
    candidateCount?: number,
  }
}

CommandFunnelReport = {
  readerVersion, adr: 'ADR-055',
  window: { start, end, days }, timeZone,
  countingUnit: 'qualifying_preview_round',
  qualifyingCommands, activeDays, unsupportedRefusals, excludedSynthetic,
  outcomeDistribution:   { <every previewed-outcome member>: count },
  refusalOutcomeClasses: { unsupported, refused, rejected_stale, rejected_conflict },
  originSplit:           { chat, work },
  appliedRoutesByOrigin: { chat: {direct, confirmed, created}, work: {…} },
  undoResultsByOrigin:   { chat: {undone, unavailable, expired, refused}, work: {…} },
  disambiguationsByOrigin: { chat, work },
  appliedWithoutPreview,        // applied count − previewed count, per origin, when positive
  rates: { noMatch, noMatchToCreation, oneStep, ambiguity, previewNoMatch },
  windowBoundarySkew,
  reachability: { … S5-R11's table, as data … },
  nonAuthorizing: [ … ADR-055's five, plus previewNoMatch … ],
  distinctUsers: null, privilegedReadRequired: true,
}

EvidenceTierEvaluation = {
  spike:    { verdict: 'not_met'|'met',
              thresholds: { qualifyingCommands: {required: 50,  measured, met},
                            activeDays:         {required: 10,  measured, met},
                            windowDays:         {required: 14,  measured, met} } },
  planning: { verdict: 'not_met'|'met_pending_privileged_read',
              thresholds: { qualifyingCommands: {required: 150, measured, met},
                            activeDays:         {required: 20,  measured, met},
                            windowDays:         {required: 30,  measured, met},
                            distinctUsers:      {required: 2,   measured: null, met: null,
                                                 privilegedReadRequired: true},
                            rateGate:           {either: {noMatch: 0.20, noMatchToCreation: 0.15},
                                                 measured, met} } },
  expiry:   { goLive, expiresOn, horizonDays: 90 },
}
```

Every category key is present with a zero value when unobserved, so a consumer never distinguishes "absent" from "zero" and a vocabulary member cannot silently vanish.

## 11. Expected application interfaces

**No application interface changes.** No route, page, component, Server Action, hook, or i18n key is added or modified. `src/` gains **exactly two test files** — the aggregator's input type is declared inside its test file, since tests are its only consumer, so no consumer-less production contract is created.

| Artifact | Kind | Why here |
|---|---|---|
| `scripts/phase-2f-command-funnel.mjs` | pure logic: aggregator, tier evaluator, expiry, thresholds, refusal subset, reachability constants | One implementation reachable from **both** Vitest (CI, no network) and the Node runner (deployed project). Reimplementing the arithmetic on each side would duplicate business logic. |
| `scripts/phase-2f-command-funnel-reader.mjs` | runner: credentials, session, paginated fetch, report printing, `--json`, `--proof` | Mirrors E11: preflight, disposable owners, `finally` cleanup asserted before exit 0, exit-2 vs exit-1. |
| `src/features/product-analytics/command-funnel.test.ts` | Vitest: aggregator behaviour, exclusions, boundaries, empty state, threshold pinning, vocabulary parity by exact equality | Runs in CI's `app` job, so a vocabulary addition or a threshold edit fails there, not in a manual run nobody watches. |
| `src/features/task-commands/end-to-end-match-baseline.remote.test.ts` | opt-in remote Vitest: the end-to-end baseline | The scorer is TypeScript; measuring end-to-end needs the **real** loader and **real** scorer against deployed SQL (E12). |
| `supabase/tests/product_events.sql` (append) | pgTAP: the `product_events.user_id` FK's delete action is `cascade` | Makes exclusion mechanism (i) **proven schema truth** in CI rather than assumed (B4). One catalog assertion; no migration, no schema change. |
| `vitest.remote.config.ts` + one `exclude` line in `vitest.config.ts` + npm scripts | wiring | Keeps the credentialed lane out of CI (E13) with no new dependency. |

## 12. Database implications

**No migration.** No function, view, RPC, grant, policy, index, or type regeneration. `supabase/migrations/` is untouched and `src/lib/supabase/database.types.ts` is untouched. The only SQL added is **one read-only pgTAP catalog assertion** appended to the existing `supabase/tests/product_events.sql`; pgTAP files are tests, not schema, and `supabase db reset` applies the identical chain before and after. The phase's migration count stays at exactly two. Remote parity is `202607300063` before and after, and this slice carries **no parity cell** (§10) because it deploys nothing.

## 13. Application implications

`src/` gains exactly two test files (§11). No production module changes, no bundle-size change (the reader is plain Node under `scripts/`, never imported by application code — S5-S3). `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` stay green; ESLint and `tsconfig` already cover the new files (E13).

## 14. Error and empty-state behaviour

| Condition | Behaviour |
|---|---|
| Zero rows in window | Full report, every count `0`, every rate `0`, both tiers `not_met`, exit 0. An empty measurement is a valid measurement. |
| `qualifyingCommands = 0` | No division occurs; rates are `0`, never `NaN`/`Infinity`/`null`. |
| Unknown `event_name` | **Throws.** Silently ignoring a fifth name would under-report after the next slice adds one. |
| Unknown `outcomeCategory`/`applyRoute`/`undoResult`/`commandOrigin` | **Throws**, naming the value and the source-of-truth file. |
| A required property missing on an event that must carry it | **Throws.** The recorder guard makes such a row impossible; tolerating it would hide a real regression. |
| Missing time zone / missing profile row | **Throws** / runner fails closed, before any aggregation (S5-R6). |
| Invalid IANA time zone | **Throws** — surfaced from `Intl.DateTimeFormat`, not swallowed. |
| `created > creationOffered` | `windowBoundarySkew` reported; `finalNoMatch` clamped at `0` with the skew visible (S5-R3). |
| Credentials unavailable | Non-zero exit with a diagnostic containing no key material. |
| Chain not deployed / RPC absent | Preflight exits **2**, distinguishable from an assertion failure. |
| Fixture survives cleanup | **Fails** (fail-closed, S5-R15). |
| Fetch page size reached | Paginates to exhaustion and asserts exhaustion; never silently truncates. |

## 15. Performance expectations

A manual, internal, single-owner measurement — not a request-path surface, so no latency budget applies. It reads `event_name in (…4 names…)` for one user over a bounded window, served by `product_events_user_name_created_idx (user_id, event_name, created_at desc)` (E1). Fetching is paginated (1000 rows/page) and window-bounded; aggregation is one pass, `O(rows)`. At ADR-055's volumes (tens to low hundreds of rows) the whole run is one round trip.

## 16. Observability expectations

1. A deterministic, ordered, human-readable report plus `--json` for the acceptance record.
2. Every run prints the window, the time zone, rows fetched, rows excluded and the exclusion reason breakdown, so an aggregate is always reconcilable against its inputs.
3. `--proof` prints one `ok <name>` line per assertion and a closing summary naming the controls exercised (E11's convention).
4. **The reader writes nothing and emits no product event** — measuring must not perturb what is measured. `--proof` is not the reader: it *writes fixtures it then deletes*, and says so in its own banner.
5. The report names ADR-055 and the reader's version string, so a pasted number is traceable to the definition that produced it.

## 17. Acceptance criteria

| # | Criterion | Requirement |
|---|---|---|
| A1 | Reader exists, runs, owner-scoped through an authenticated session; no service-role measurement read | 2F-MEASURE-001; S5-S1 |
| A2 | Every measure in S5-R1 computed, content-free, zeros present, origin-cross-tabulated where the property exists | 2F-MEASURE-001, 2F-ANALYTICS-003 |
| A3 | `unsupported` excluded from every denominator and counted separately — **implemented and unit-tested; recorded as vacuous against production** until an emitter exists (E17) | 2F-MEASURE-002 |
| A4 | Exclusions proven: synthetic (unit + remote); owner-scoping cross-owner, non-vacuous; anon denied; service-role select denied (asserted); FK cascade proven in CI pgTAP; fixture users proven deleted remotely | 2F-MEASURE-002 |
| A5 | Residuals stated and owned: orphan non-synthetic events from a killed run (mitigated by 2F.6's cleanup verifier, and harmless to the real owner's gate by S5-S6); direct event-row absence after user deletion not readable with available credentials | 2F-MEASURE-002 |
| A6 | Spike tier fully computable; all three thresholds reported with measured values | 2F-MEASURE-003 |
| A7 | Planning tier computable except `distinctUsers`, which is `null` + `privilegedReadRequired`; verdict structurally unable to read `met` | 2F-MEASURE-004 |
| A8 | All **nine** ADR-055 numbers plus the 90-day horizon pinned by exact equality; `no_match` computed on the **final-outcome** definition | 2F-MEASURE-003/004 |
| A9 | The five non-authorizing measures (plus `previewNoMatch`) named in the output | 2F-MEASURE-005 |
| A10 | Expiry mechanically computed; `docs/TODO.md:30` carries a concrete date derived from go-live | 2F-MEASURE-006 |
| A11 | End-to-end baseline measured against the deployed contract, published pinned, labelled `end-to-end`, beside the scoring-layer numbers, cross-scope comparison prohibited | 2F-MEASURE-007 |
| A12 | Fixtures cleaned, proven by a fail-closed assertion inside the run | 2F-MEASURE-007, §8 2F.5 |
| A13 | All three CI jobs green on the exact merge SHA, including the two §10 cells 2F.5 carries: the grammar-trap/architecture gate (`direct-write-guard.test.ts`, `sql-grammar-guard.test.ts`) and the preserved Gate 3 suite (`work-surface-reuse.test.ts`) | 2F-OPERATIONS-002; E20 |
| A14 | No migration; parity `202607300063` unchanged; no grant change; no production semantic change | §7, §11, §12 |
| A15 | Slice 2F.6 not started; no 2F.6 artifact exists | §22 |
| A16 | Every structural limitation in S5-R11 stated in the reader output, the slice report and the acceptance report | 2F-MEASURE-001, honesty of measurement |

## 18. Test strategy

**CI (`app` job) — Vitest, no network:**
1. Aggregator over designed fixture corpora with **exact** expected reports (no `toMatchObject` on the aggregate).
2. Exclusions: synthetic excluded and counted; `unsupported` out of every denominator but counted; an assertion that the reader applies **no** email/name-pattern predicate.
3. Boundaries: half-open window start; a row exactly at `windowEnd` included; a row exactly at `windowEnd − windowDays` excluded; day bucketing across a local midnight in `America/Sao_Paulo` vs UTC yielding **different** `activeDays`, pinned.
4. Empty state: zero rows → zero rates, no `NaN`, both tiers `not_met`.
5. Tier evaluation: at / one-below / one-above for **each of the nine** thresholds; the planning `or` proven in both branches; the planning verdict proven never `met`; `distinctUsers` proven never inferred.
6. Pinning: one exact-equality assertion carrying ADR-055's nine numbers and the 90-day horizon.
7. Vocabulary parity by **exact equality** against imported TypeScript: `TASK_COMMAND_PREVIEWED_OUTCOMES`, `TASK_COMMAND_APPLY_ROUTES`, `TASK_COMMAND_UNDO_RESULTS`, `TASK_COMMAND_ORIGINS`, and `productEventNames` **read** through `readProductEventVocabulary`; plus `refusalOutcomeClasses ⊂ TASK_COMMAND_PREVIEWED_OUTCOMES` with its exact membership pinned.
8. `no_match` arithmetic: `finalNoMatch` correct when `created < creationOffered`, `= creationOffered`, and `> creationOffered` (skew reported, clamped, never negative); `previewNoMatchRate` present and listed non-authorizing.
9. Fail-loud: unknown event name, unknown category, missing property, missing/invalid time zone each throw with a message naming the source file.
10. Expiry across a month boundary and a leap-adjacent date.
11. Reachability block asserted to match the code's real emit sites, so a future emitter for `unsupported` makes this test fail and force the claim to be updated.
12. Regression: `match-baseline.test.ts`'s pin untouched and green; `contracts.test.ts`, `analytics.test.ts`, `direct-write-guard.test.ts`, `sql-grammar-guard.test.ts`, `work-surface-reuse.test.ts` unchanged and green.

**CI (`database` job):** the appended pgTAP assertion proves `product_events.user_id`'s FK delete action is `cascade` — exclusion mechanism (i) as schema truth. The rest of the suite and `supabase db lint` unchanged and green.

**CI (`worker` job):** untouched; green as regression.

**Deployed project (manual, recorded in the acceptance report):**
13. Reader proof (`--proof`): two disposable owners; a designed corpus emitted through the real `record_product_event` (synthetic decoys **and** the minimum non-synthetic rows the assertions require, justified by S5-S6); owner A's report asserted to **exact** expected values; A's **positive** count asserted **before** B-invisibility; B's own report asserted exact; **anon select denied**.
14. **Service-role select denial asserted** on `product_events` (Mo6) — the fact B4's proof design depends on, executed rather than assumed. If it were permitted, that is itself reported as a finding.
15. Cascade: A's positive own-session count captured pre-delete; both owners deleted; deletion asserted successful via the admin API; re-authentication proven to fail. Combined with §18's pgTAP cascade assertion this proves mechanism (i); the residual (direct event-row absence is unreadable with available credentials) is recorded in A5, not claimed away.
16. Fail-closed residue assertion; `finally` cleanup asserted before exit 0.
17. End-to-end baseline (`vitest --config vitest.remote.config.ts`): disposable owner; tasks seeded with the service-role client (S5-R14); each corpus command through the real `loadTaskCandidates` + real `rankTaskCandidates`; rates asserted against the pinned constants; fixtures deleted; residue asserted.
18. Regression: `npm run test:remote` green in the validation session, proving a read-only slice disturbs nothing from 2F.1–2F.4.

**Explicitly not run, with reasons:** authenticated Playwright journeys (§10 gives 2F.5 no journey cell; no UI changed); parity re-check (nothing deployed); the reminder census (2F.6); any authenticated task write (E16 forbids it).

## 19. Migration and rollback posture

No migration; nothing applied to any environment. Per phase PRD §11 (`:286`), 2F.5 is **read-only; nothing to roll back**. The code rollback is a plain revert of a PR containing only scripts, tests, a pgTAP assertion, config wiring and documentation. The only production writes are disposable fixtures the run itself deletes, so no data effect survives a revert.

## 20. Risks and deferred work

| # | Risk | Disposition |
|---|---|---|
| K1 | Scope creep into a dashboard (the phase proposal's own named risk) | §5 non-goals are explicit and checkable: no route, page, copy, or migration. The reader has no HTTP surface. |
| K2 | The `.mjs` mirror drifts from the TypeScript vocabularies | Exact-equality parity in CI (§18.7). Acknowledged as a **mirror**, not a read (§9), because the existing parser cannot reach these declarations. |
| K3 | Pinned end-to-end rates nondeterministic against a live database | The corpus is designed for determinism (fixed seeded titles, pinned `now`, no reliance on `recent_activity`). If a rate proves unstable, the **corpus** is redesigned — the assertion is never loosened. |
| K4 | Orphan non-synthetic events from a killed run | Owned (A5). Harmless to the real owner's gate by S5-S6 (owner-scoping). 2F-OPERATIONS-004's cleanup verifier (2F.6) is the stated phase-wide mitigation, exactly as `2F-MEASURE-002` says. |
| K5 | Counting unit is preview rounds, not intents (1–3 per intent, and some intents emit none) | Stated in S5-R11, in the reader's own output (`countingUnit`, `reachability`), in the slice report and in the acceptance report. No allowlist widening is available this phase. |
| K6 | The new remote Vitest lane accidentally enters CI | Own config; the default config **excludes** the pattern; a Vitest case asserts the exclusion, so a future config edit dragging credentialed tests into CI fails in CI. |
| K7 | `distinctUsers` defaulting to 1 would let the planning tier read `met` | Structural: the field is `null` and the verdict vocabulary has no reachable `met` without a privileged read (S5-R8). Pinned by test. |
| K8 | `is_synthetic` is client-influenced (`recordProductInteraction` accepts `synthetic` from the client — E3) | Recorded in ADR: it is a **hygiene filter, not a trust boundary**, unlike mechanisms (i)–(iii) which are enforced by the database. It is never the only thing separating fixture data from the gate; owner-scoping is. |
| K9 | `2F-MEASURE-005`'s unsupported-volume measure is unmeasurable | Reported as a named partial (A3, S5-R11) rather than silently satisfied by a structurally-zero counter. |

**Deferred (named so they are not silently absorbed):** reason-level refusal granularity; an emitter for `unsupported`/`rejected_conflict` on preview events; a UI surface for the funnel; the offline replay spike the spike tier may authorize; the privileged distinct-user read (performed at evaluation time); a command identifier that would make per-intent counting possible; `product_events` retention/purge; every 2F.6 item.

## 21. Exact Slice 2F.5 completion boundary

Complete when, and only when:

1. `2F-MEASURE-001…007` are satisfied and evidenced (A1–A12, A16), with every partial named as a partial.
2. All three CI jobs green on the merge SHA, including the two §10 cells 2F.5 carries (A13).
3. The reader proof and the end-to-end baseline executed against the deployed project, transcripts recorded, fixtures proven gone.
4. `docs/TODO.md:30` carries a concrete expiry date derived from go-live.
5. `STATE.md`, `CHANGELOG.md`, `TODO.md`, `DECISIONS.md`, the slice report and the acceptance report updated; ADRs recorded for D4, D5 and D7.
6. Local `main` clean, synchronized with `origin/main`; remote parity still `202607300063`.

## 22. Explicit exclusion of Slice 2F.6

Slice 2F.6 (`2F-OPERATIONS-003…006` + the whole-phase convergence audit) is **not started**. Specifically not created, not modified, not begun:

- `scripts/generate-phase-2f-traceability.mjs` (2F-OPERATIONS-003) — does not exist; not added.
- `scripts/verify-phase-2f-cleanup.mjs` (2F-OPERATIONS-004) — does not exist; not added. This slice's fixtures are proven gone by **its own** fail-closed assertions, which is not the phase-wide verifier. **Handover, not work done:** the verifier's scope must include this slice's `product_events` fixtures for fixture owners of the `--proof` run.
- The reminder census (2F-OPERATIONS-005) — `scripts/phase-2f-reminder-census.mjs` not executed, not edited.
- Closeout documentation reconciliation (2F-OPERATIONS-006) — this slice updates only what its own change requires. The stale Phase-2F `TODO.md` line, `SECURITY.md`, `DATABASE.md` and `PHASE_2_PLAN.md` reconciliation items remain 2F.6's.
- The whole-phase convergence audit — not performed.

## 23. Review cycle

One independent adversarial review of the initial draft produced 23 findings (4 BLOCKING, 7 MAJOR, 9 MODERATE, 3 MINOR). Every finding was independently verified against the repository. Outcome:

| Finding | Verdict | Resolution |
|---|---|---|
| **B1** — "Work surface emits only `task_command_applied`, so `originSplit` is degenerate" | **REJECTED (factual error)** | `src/features/daily-cycle/work-view.tsx:77` mounts `CommandConsole` with `origin="work"`, so **all four** events occur with `work`. The review inspected `operations/actions.ts` (2F.2's direct-action emitter) and missed the console mount. `originSplit` is not degenerate; A2 is satisfiable. **Valid residual accepted:** Work direct-action applies have no preceding previewed row, so the applied population is a superset — handled by `appliedWithoutPreview` and origin cross-tabulation (folded into M7). |
| **B2** — "`no_match` measured on preview disposition, not ADR-055's final outcome" | **CONFIRMED** | Fixed more strongly than proposed: rather than declaring a deviation, S5-R3 computes ADR-055's **final-outcome** definition exactly at aggregate level (`stillUnmatched + max(0, creationOffered − created)`), reports `previewNoMatchRate` as a non-authorizing diagnostic, and reports `windowBoundarySkew` instead of clamping silently. No ADR amendment is needed because the definition is now honoured. |
| **B3** — "`unsupported` never emitted; A3 vacuous" | **CONFIRMED** | Verified: `actions.ts:347-358` and `:719-726` both return before any emit (`report` defined at `:400`). The exclusion is kept (it is ADR-055's normative denominator rule and guards a future emitter) and is now explicitly recorded as **vacuous against production** in S5-R11, A3, K9, the reader's own `reachability` block, and the acceptance report. `2F-MEASURE-005`'s unsupported-volume measure is declared **not measurable this phase** rather than silently satisfied. `applied`/`rejected_conflict` receive the same treatment. §18.11 makes a future emitter break the test. |
| **B4** — "Cascade exclusion unprovable; no privileged read exists" | **CONFIRMED** | Fixed with a composite proof rather than a downgrade: (a) A's positive own-session count captured pre-delete; (b) service-role select denial **asserted** (§18.14); (c) the FK's `cascade` delete action proven in CI pgTAP (`supabase/tests/product_events.sql`); (d) fixture-user deletion asserted via the admin API. (c)+(d) compose into a real proof of mechanism (i). The review's alternative — *use* a service-role read if the deployed project happens to permit one — is **rejected**: that would rest the proof on an unversioned dashboard grant. The narrow residual (direct event-row absence is unreadable with available credentials) is recorded in A5. |
| **M1** — "`create_task_command` seeding unnecessary and insufficient" | **CONFIRMED** | Verified: `202607300063:38-40,90` revokes from `authenticated` only; `remote-phase-2e-smoke.mjs:154-158` seeds with the service-role client and passes. S5-R14 now seeds via service role; the E16-derived rationale is deleted; S5-S1 explicitly permits service-role **fixture** use while forbidding a service-role **measurement** read. E16 is retained for the still-true statement it supports (no authenticated task write). |
| **M2** — "§9's 'read by `product-event-vocabulary.mjs`' is false" | **CONFIRMED** | Verified: `readProductEventVocabulary` returns only `{eventNames, surfaces}`; the four category vocabularies are non-exported `readonly T[]` and one is a spread the parser throws on. §9 now says event **names** are read and categories are **mirrored** with a CI gate, labelled as materially weaker than a read. The review's alternative of exporting the members `as const` is **rejected**: re-shaping a production module to suit a test is exactly the tail-wagging §13 forbids. |
| **M3** — "`--proof` writing non-synthetic production events contradicts §16.4" | **CONFIRMED (contradiction) / PARTIALLY ACCEPTED (design)** | §16.4 now distinguishes the **reader** (writes nothing) from `--proof` (writes fixtures it deletes). The non-synthetic set is held to the minimum the assertions require, and S5-R15 adds `finally` cleanup with the deletion **asserted before exit 0**. The design objection is answered by S5-S6: fixture rows belong to disposable fixture users and are outside the real owner's range by mechanism (iii) even if they survived, so they can never enter the real gate. The verifier-scope item is recorded in §22 as a **handover**, not as work done here. |
| **M4** — "§11 vs §13 contradiction over a consumer-less contract" | **CONFIRMED** | The input type is declared inside its test file; §11 and §13 now agree that `src/` gains exactly two test files. |
| **M5** — "`refusalOutcomeClasses` required but undefined" | **CONFIRMED** | S5-R12 enumerates the subset (`unsupported`, `refused`, `rejected_stale`, `rejected_conflict`) with a per-member justification and per-exclusion reason, derived in code as a filter over the imported vocabulary so the parity test still bites. |
| **M6** — "Limitation omits the disambiguation re-round" | **CONFIRMED** | Verified `actions.ts:746-777` → `:466`. S5-R11 names both re-round paths with anchors and states the worst case (3 previewed rows per intent). **Added by this adjudication:** `creationRound` can return `presentFailure` before `report("creation_offered")` (`:615-622`), so some intents emit **no** previewed row — an under-count in the opposite direction, now also stated. |
| **M7** — "`appliedRoutes`/`undoResults` origin-blind; Work undo emits nothing" | **CONFIRMED as refined** | Both are cross-tabulated by `commandOrigin` (free — the property is on every event). The precise fact is recorded: the only `task_command_undone` emitter is `actions.ts:1070` (console, either origin), and the Work **direct-action** path has no undo event. |
| **Mo1** — "six thresholds; ADR-055 has nine" | **CONFIRMED** | Nine enumerated in §10 and boundary-tested in §18.5; A8 says nine. |
| **Mo2** — "E2's `280-420` truncates the allowlists" | **CONFIRMED** | E2 now cites `113-116`, `304-317`, `394-446`. |
| **Mo3** — "`loadTaskCandidates(client, input)` is wrong" | **CONFIRMED** | `loadTaskCandidates(input)`; §2 and E12 corrected. |
| **Mo4** — "E4's line range off" | **CONFIRMED** | `outcomes.ts:24-49`. |
| **Mo5** — "'Readers: None' discards the repo's own proof" | **CONFIRMED** | §2 now cites `remote-product-events-smoke.mjs:364,370` as executed remote evidence that the `authenticated` select works. |
| **Mo6** — "service-role denial load-bearing, never executed" | **CONFIRMED** | §18.14 asserts it. |
| **Mo7** — "fail-closed timezone diverges from production's fallback" | **CONFIRMED** | S5-R6 records `actions.ts:214-224`'s fallback and why the reader deliberately does not copy it. |
| **Mo8** — "D4 widens a merged requirement; `is_synthetic` is client-settable" | **CONFIRMED** | The ADR is recorded **before** implementation, and K8 states that `is_synthetic` is a hygiene filter rather than a trust boundary, unlike mechanisms (i)–(iii). |
| **Mo9** — "2F.5 carries §10 gate cells the PRD never claims" | **CONFIRMED** | Verified `docs/PHASE_2F_PRD.md:265-266` both show ● for 2F.5. A13 and §18.12 now name `direct-write-guard.test.ts`, `sql-grammar-guard.test.ts` and `work-surface-reuse.test.ts`. |
| **Mi1** — "'§145' is a line number" | **CONFIRMED** | Cited as §3 (lines 56–70) and line 145. |
| **Mi2** — "D7 deserves an ADR" | **CONFIRMED** | D7 joins D4 and D5 as a recorded ADR (§21.5). |
| **Mi3** — "tier verdict vocabulary has no shape in §10" | **CONFIRMED** | §10 now declares `EvidenceTierEvaluation`. |

**Did the review introduce drift?** Three of its proposed fixes were narrowed or rejected on evidence: B4's "use a service-role read if the deployed project permits it" (rests on an unversioned grant), M2's "export the vocabularies `as const`" (production change to serve a test), and B2's "declare a deviation from ADR-055" (the definition is computable exactly, so no deviation is needed). No accepted recommendation expands into Slice 2F.6; the single new SQL artifact is a read-only pgTAP assertion serving `2F-MEASURE-002`, not `2F-OPERATIONS-*`.

## 24. Traceability matrix

| Requirement | Evidence / decision | Implementation component | Test coverage | Acceptance evidence |
|---|---|---|---|---|
| 2F-MEASURE-001 (measures, content-free, no new events/storage) | E1–E5, E7, E18; §6 S5-R1/R2/R11/R12/R13 | `scripts/phase-2f-command-funnel.mjs`; `phase-2f-command-funnel-reader.mjs` | §18.1, .2, .7, .11, .12 | A1, A2, A16 |
| 2F-MEASURE-002 (exclusion by construction; residual owned) | E1, E3, E10, E17, E19; D4, K4, K8, S5-S6 | S5-R4 filter; `supabase/tests/product_events.sql` cascade assertion; `--proof` mode | §18.2, .13, .14, .15, .16; pgTAP | A3, A4, A5 |
| 2F-MEASURE-003 (spike tier) | E6; S5-R8 | `evaluateEvidenceTiers` | §18.5, .6 | A6, A8 |
| 2F-MEASURE-004 (planning tier; distinct users out of range) | E6; S5-R8, K7 | `evaluateEvidenceTiers`, `distinctUsers: null` | §18.5, .6 | A7, A8 |
| 2F-MEASURE-005 (permanent non-authorizers) | E6; S5-R9, K9 | `nonAuthorizing` block | §18.6, .8 | A9, A3 |
| 2F-MEASURE-006 (dated expiry) | E6, E14; D7 | `expiryDateFromGoLive`; `docs/TODO.md:30` edit | §18.10 | A10 |
| 2F-MEASURE-007 (end-to-end baseline) | E8, E11, E12; D5, S5-R14, K3 | `end-to-end-match-baseline.remote.test.ts`; `vitest.remote.config.ts` | §18.17 (remote), §18.12 regression | A11, A12 |
| 2F-OPERATIONS-002 (three CI jobs green on merge SHA) | E13, E20 | none (wiring only) | all CI jobs; §18.12 | A13 |
| Phase §7/§11/§12 (no migration, parity, posture) | E7, E16 | §12 | §18 database job | A14 |
| Phase §7 (2F.6 not started) | E15; §22 | none | — | A15 |

## Appendix — design decisions

| # | Decision | Alternatives rejected | Evidence |
|---|---|---|---|
| **D1** | The reader is an internal Node runner + pure module, **not** a UI page. | A `/app/funnel` page (§10 gives 2F.5 no journey cell; the phase PRD says "internal", "no external exposure", "not a BI surface"; a page needs i18n, nav, and journeys in two locales — all outside 2F.5's gates). A Server Action with no caller (consumer-less contract). | E7 §10/§8 |
| **D2** | The aggregator's single implementation lives in `scripts/*.mjs`, imported by both the runner and Vitest. Event **names** are read from `contracts.ts`; category vocabularies are **mirrored** with an exact-equality CI gate. | Implementing in TypeScript and restating in Node (duplicated business logic). Adding `tsx`/`ts-node` (a dependency for one script). Re-shaping `contracts.ts` so the existing parser could read the categories (production change to serve a test). | E9, E3 |
| **D3** | Thresholds, the `no_match` member set, the refusal subset and the horizon are declared once and pinned against ADR-055 by exact equality. | Restating them in the test (a threshold computable two ways is decided twice — ADR-055's own words). | E6 |
| **D4** | **`is_synthetic = true` is excluded as a fourth mechanism** §6.9 does not name — recorded as an ADR **before** implementation, since it amends a merged requirement, and labelled a *hygiene filter, not a trust boundary*. | Naming only the PRD's three (the column exists since `202607170024` and every smoke sets it — ignoring a real exclusion). Claiming it removes the residual (the authenticated journeys drive the real app and emit **non-synthetic** events under disposable users, so the residual survives, narrowed). Treating it as structural (it is client-influenced via `recordProductInteraction` — E3). | E1, E3, E10 |
| **D5** | The end-to-end baseline runs in a committed **opt-in** Vitest lane using the real loader and real scorer, with service-role fixture seeding. | Reimplementing the scorer in `.mjs` (the duplicate would be the thing measured). A throwaway harness ("published pinned" needs a reproducible pin). A Playwright journey (no journey cell; a browser adds nothing the RPC path lacks). Seeding through `create_task_command` (needs a server-issued confirmation per task and yields title-only tasks, narrowing the corpus below the baseline it must discharge — M1). | E8, E11, E12, E13 |
| **D6** | `activeDays` requires an explicit time zone from `profiles.timezone`, no default, fail-closed — deliberately unlike production's fallback. | UTC bucketing (splits a local day at UTC−3 and biases the gate **toward** passing). Copying production's fallback (a measurement that silently picks a zone can pass a gate by accident). | `202607160001:12`; `actions.ts:214-224` |
| **D7** | Go-live = the merge date of this slice's PR; expiry = go-live + 90 days. Recorded as an ADR because it fixes a dated roadmap commitment `2F-OPERATIONS-006` will verify. | The reader's first-run date (unrecorded and unverifiable at closeout). | E6, E14 |

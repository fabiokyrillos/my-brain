# Phase 2E — Slice 2E.2 Report: Deterministic Matching and Margins

## 1. Status

| Field | Value |
|---|---|
| Slice | 2E.2 — Deterministic matching and margins (Epic 2E-B) |
| Status | **READY WITH NON-BLOCKING NOTES** |
| Date | 2026-07-25 |
| Repository | `github.com/fabiokyrillos/my-brain` |
| Branch | `codex/phase-2e-natural-language-task-updates` |
| Phase base | `2e2acfd` (Pre-Phase-2E Foundation Hardening, PR #17) |
| Slice base | `79a3021` (Slice 2E.1 accepted) |
| HEAD at acceptance | `56111ac` |
| Commits | `b143b42`, `5de68eb`, `d7b4eb3`, `a2c263d`, `c32a5bd` (correction pass over four reviews), `120e4a1` (the fifth review's Critical), `6177f81` (progress record), `958d50e` (mutation hardening), plus the acceptance-review corrections |
| Migration | `202607250056_phase_2e_task_command_matching.sql` — **local only, not applied to the linked project** |
| Remote migration parity | `202607250054`, unchanged since the pre-2E cutover |
| Deployed workers | `process-jobs` v15, `heartbeat` v4 — unchanged; this slice touches no worker code |
| Generated types | `list_task_command_candidates` added **by hand**. Not regenerated — see §7 and ADR-041 |
| Publication | Draft PR [#18](https://github.com/fabiokyrillos/my-brain/pull/18), CI evidence only. Not merged, not deployed, not tagged. |
| Governing documents | `docs/initiatives/phase-2e/PHASE_2E_PRD.md` §9 (Epic 2E-B), §13.2, §19.1, §21; `docs/ENGINEERING_STANDARDS.md`; ADR-037, ADR-040, ADR-041 |

Slices 2E.3–2E.8 have not started. They proceed under the approved PRD without further authorization.

## 2. Objective, and what this slice deliberately is not

The objective is the **read** half of natural-language task matching: given a validated command from Slice 2E.1, produce a deterministic, owner-scoped, overflow-aware, explainable ranking of candidate tasks, and classify the outcome.

What this slice deliberately is not, per Epic 2E-B's own acceptance criteria ("no mutation exists in this slice"):

- **No mutation.** The migration adds one `stable` function that writes nothing. The first task-mutation RPC this codebase has ever had arrives in Slice 2E.4.
- **No UI, no Server Action, no product event, no user-visible behaviour change.** Nothing calls `list_task_command_candidates` in production. Its first consumer is Slice 2E.3's preview.
- **No model call.** `rankTaskCandidates` is pure: no AI, no network, no clock read, no Supabase client.
- **No semantic retrieval.** PRD §23.1 chose deterministic matching on evidence; the embedding-driven signal is Phase 2F, and §22 makes this slice's baseline the bar it must beat.

## 3. What shipped

| Artifact | Responsibility |
|---|---|
| `supabase/migrations/202607250056_phase_2e_task_command_matching.sql` | `public.list_task_command_candidates` — owner-scoped, filtered on the action's declared eligible statuses, ordered totally and deterministically **before** truncating, returning one row beyond the limit so truncation is detectable, projecting the full observed pre-state of every field §11.2 can change |
| `supabase/tests/phase_2e_task_command_matching.sql` | **48 pgTAP assertions**, executed against a from-zero database in CI |
| `src/features/task-commands/match-policy.ts` | Every weight, threshold, limit, tier and band, at `TASK_MATCH_POLICY_VERSION = 2026-07-25.3`, pinned by digest |
| `src/features/task-commands/matching.ts` | The pure scorer, comparator, outcome classifier, and the SQL-reachability invariant |
| `src/features/task-commands/candidates.ts` | The injectable data-access layer: argument assembly, row validation, reachability check, cross-owner raise |
| `src/lib/supabase/database.types.ts` | The RPC's hand-written type entry (ADR-041) |
| Tests | `matching.test.ts`, `candidates.test.ts`, `match-baseline.test.ts`, `sql-reachability.test.ts`, `normalizer-divergence.test.ts`, `database-types-parity.test.ts`, `status-vocabulary-parity.test.ts`, `policy-lock.test.ts` additions |

## 4. The matching formula

Score is the sum of the signals that fired, published as `min(1, score)` rounded to three decimals, and **ordered on the uncapped value** so that clamping cannot reverse two candidates' order.

| Signal | Weight | Fires when |
|---|---|---|
| `exactTitle` | 0.6 | normalized title equals normalized hint (tier 0) |
| `titlePhrase` | 0.4 | whole normalized hint appears in title as complete words (tier 1) |
| `tokenOverlap` | 0.22 × (overlap / queryTokens) | any shared token |
| `referencedProject` / `referencedContext` / `referencedPerson` | 0.1 each | the hint names a relation the task holds **and the requested action does not write that relation** |
| `statusMatch` | 0.08 | hint names the task's current status, and is not describing the patch's destination |
| `temporalProximity` | 0.1, or 0.05 in the near band | nearer of due/planned within 24h, or within 72h |
| `recency` | 0.06 decayed linearly over 14 days | last audited state change, strictly older than the observation instant |

The title ladder is **graded, not additive** — a title that *is* the hint has not also separately contained it.

### Thresholds, margins, and the calibration that matters

| Threshold | Value | Meaning |
|---|---|---|
| `topScore` | 0.55 | at or above this, the top candidate is confident enough |
| `minMargin` | 0.12 | at or above this, the top two are separable |
| `minCandidateScore` | 0.1 | below this a row is **not a candidate at all** (2E-MATCH-015) |
| `candidates` | 25 (+1 probe) | overflow is read from the data, not assumed |
| `ranked` | 5 | presentation cap for a disambiguation list |

**No single non-lexical signal may reach `minMargin`.** `referencedProject` and `referencedPerson` were 0.12 — exactly the margin — and a review proved that let one relation hint carry a pair from ambiguous straight to a one-step apply. They are now 0.1. `recency` (0.06) likewise cannot resolve the canonical PRD §12.2 ambiguity of two identically-titled tasks, and a test asserts that inequality directly rather than trusting the arithmetic.

Outcome order is load-bearing: overflow outranks confidence (a truncated set cannot support "nothing matched", because the row that would have won may be the one that was cut), but `ambiguous_overflow` is only returned when something actually qualified — otherwise the truthful outcome is `unmatched` with `overflowed` still true, because "too many, narrow this down" pointing at an empty list is copy 2E-DISAMBIG-001 cannot render.

## 5. The measured 2E-MATCH-018 baseline, with its scope

From the committed 14-scenario corpus in `match-baseline.test.ts`, at policy version `2026-07-25.3`:

| Rate | Value |
|---|---|
| one-step | 0.429 |
| matched, needs deliberateness (`restore_task`) | 0.071 |
| confirmation required | 0.071 |
| ambiguous (incl. overflow) | 0.214 |
| no match | 0.214 |

**The caveat travels with the number.** The corpus supplies `prefilterTier`, `tokenOverlap` and `queryTokenCount` by hand, so these rates measure **the scoring layer against declared SQL verdicts**, not end-to-end matching. Slice 2E.8 must carry them into the phase report with that scope attached, and §22's Phase 2F comparison must be made against the same scope or a re-measured one.

What changed since that caveat was first written: every hand-written triple is now **proven reachable**. `describeUnreachableCandidates` states what `list_task_command_candidates` can emit, `sql-reachability.test.ts` pins those rules against the migration text that implements them, and both corpora assert every fixture satisfies them. The rates are still scoped to the scoring layer, but they are no longer measured over inputs SQL has no execution that produces — one fixture was exactly that, and was corrected.

## 6. Security

Full posture in `docs/SECURITY.md` and ADR-040. In summary:

- **`SECURITY DEFINER`, by necessity.** `security invoker` was written first and cannot run: `202607170020:314` revokes EXECUTE on `normalize_entity_alias` from `authenticated`, and its non-null `proconfig` stops the planner inlining it, so every lexical decision would raise `42501` for the only role that calls it.
- **No grant widened.** Granting `authenticated` EXECUTE on the normalizer would also have worked and was **rejected**: 2E-OWNERSHIP-003 and PRD §14 say this phase widens no grant.
- **`set search_path = ''`**, pinned against `pg_proc.proconfig`.
- **Inside the function, the `auth.uid()` predicate is the only ownership control**, because the definer owns the tables. Stated, not papered over. RLS still forces the boundary on every other path.
- **Cross-owner denial is indistinguishable from no result** — the other owner's identically-titled task is absent, not outranked — proven symmetrically, plus a null-caller case.
- **The projection carries `title` and `description`.** The application asks for 26 rows (`TASK_MATCH_LIMITS.candidates` 25 plus the 2E-MATCH-004 probe), but the *server* bound is what governs a direct PostgREST caller, and it is `least(greatest(coalesce(p_limit,25),1),100)` then `limit lim + 1` — **101 rows**. An earlier draft of this section said "up to 26", which is the application default rather than the exposed bound; the same passage reasons about direct PostgREST exposure for the hint lengths, and the row cap deserved the same treatment. All of it is the caller's own data. The width is deliberate: `42P13` means a `RETURNS TABLE` shape cannot be widened later without a `_v2`.
- **No content reaches analytics or a model.** This slice emits no product event and makes no model call; `TASK_MATCH_EVIDENCE` names the signal that fired, never the value.
- **Residual, named:** if the ownership predicate regresses, nothing else inside the function stops a cross-owner read. That is why the pgTAP cross-owner assertions are symmetric and run from zero on every push.

## 7. The generated-types situation

`supabase gen types typescript` cannot run here: Docker is unavailable on this workstation, and in CI the CLI refuses to start without an access token even when pointed at a local `--db-url` it never leaves. Satisfying that offline required a credential-shaped literal in the workflow, which GitHub push protection rejected — correctly. The whole-file regeneration check was **withdrawn** and recorded in `docs/TODO.md`.

**No claim of regeneration is made anywhere.** The entry is hand-written, and parity is proven three ways instead, all green:

1. the migration declares the signature;
2. `database-types-parity.test.ts` compares the generated types against that declaration by content — names, ordering, optionality, type mapping;
3. `phase_2e_task_command_matching.sql` pins both against `pg_proc.proargnames` and `pronargdefaults` from the **real catalog**, in a database built from zero.

The third is stronger than regeneration in the respect that matters: regeneration proves the file matches whatever schema the generator was pointed at, while `pg_proc` proves it matches the schema the migration chain actually builds. See ADR-041.

## 8. Independent review, and what it found

Five reviewers across SQL/database, matching correctness, PRD conformance, architecture/operations, and security/test-rigour. Three ran code and proved defects by execution. **Five Criticals, all fixed:**

1. **The RPC could never have run.** `security invoker` + the `normalize_entity_alias` revoke = `42501` for the only role that calls it. Now `security definer` (ADR-040).
2. **The expression index would have broken task creation.** Index maintenance evaluates the expression as the *writing* role, and `createRecord` inserts as `authenticated` — the same `42501`, on a live path. It was also unusable (never sargable). Removed.
3. **A bad clock manufactured a one-step apply.** `instantMs(now) ?? 0` fell back to the epoch and the age clamp awarded full recency to everything; a designator-less instant made the outcome host-dependent. The instant is now a hard precondition (`TaskMatchInputError`), and an audit newer than it scores nothing.
4. **A relation hint rewarded the task that already held the relation.** For `set_waiting_on` that wrote a real `waiting_on` row on the wrong task, one step, unconfirmed. No single non-lexical signal now reaches the margin, and `scoreRow` refuses to score the relation the requested action writes.
5. **Two NUL bytes made the whole pgTAP file unrunnable.** A scripted edit turned `\00F3` into `0x00`; Postgres refuses it (`22021`) and the *file* aborted, silently voiding every SQL-side proof while TypeScript stayed green. Fixed, and `status-vocabulary-parity.test.ts` now fails on a NUL byte or any raw non-ASCII outside a comment.

Also fixed from Important findings: the projection widened to carry the full pre-state (because `create or replace` cannot add a `RETURNS TABLE` column — `42P13` — which would have forced a `_v2` in Slice 2E.3); relation ids and person roles travel so 2E-PREVIEW-005 can detect an already-held relation without re-normalizing names in TypeScript; hints bounded server-side; `ambiguous_overflow` can no longer be returned with an empty candidate list; ordering uses the uncapped score; `effectiveLimit` is the minimum across rows; the temporal signal takes the nearer of due and planned and distinguishes its two bands; `resolveHintInstant` hoisted out of the per-row map; prefilter tiers declared as constants inside the policy digest; consumer-less band functions removed; the cross-owner proof made symmetric and a null-caller case added.

### The sixth review: mutation testing

A mutation run (whose author reported it covered 41 mutations) arrived after the correction pass and found the suite **green under fifteen changes that alter what the matcher decides**. Every one is now killed; each was applied, confirmed to fail the focused suite, and reverted.

| # | Mutation | Why it mattered |
|---|---|---|
| 1 | `overflowed` `>` → `>=` | every full page reports a truncation, which 2E-MATCH-004 turns into a refusal to one-step apply |
| 2 | `topScore <` → `<=` | 2E-MATCH-011 says "at or above"; a confident match becomes ambiguous |
| 3 | `margin <` → `<=` | the clearest separation the policy expresses becomes a disambiguation list |
| 4 | delete `TASK_MATCH_LIMITS.ranked` | the presentation cap disappears |
| 5 | `temporalExactHours <=` → `<` | a task due exactly a day out stops being "on that day" |
| 6 | `temporalNearHours <=` → `<` | the near band loses its own edge |
| 7 | title tie-break → `localeCompare` | ordering resolves against the host's ICU data |
| 8 | `token_overlap` loses `.min(0)` | a negative count scores as a fraction |
| 9 | `prefilter_tier` → `z.any()` | the weakest possible schema passes the test written to defend it |
| 10 | `prefilter_tier` loses `.min(0).max(3)` | a tier outside the vocabulary decodes as "no title signal" |
| 11 | `effective_limit` loses `.min(1)` | a zero limit makes every set look truncated |
| 12 | `owner_id` loses `.uuid()` | a malformed owner reaches the cross-owner comparison |
| 13 | reachability check removed | impossible triples are scored rather than caught |
| 14 | a pgTAP corpus assertion commented out | the SQL-side proof silently shrinks |
| 15 | a pgTAP corpus expected value changed | single-sided drift between the two corpora |

Fixtures 1–7 are in `matching.test.ts`, 8–13 in `candidates.test.ts` (table-driven over 17 invalid values and 14 missing keys, asserting the **specific** error code so a removed refinement cannot pass on the strength of a different layer), and 14–15 are killed by the anchored `select is(...)` form plus the requirement that the executed assertion count equal `CORPUS.length`.

Two findings from that review are **accepted as scope, not defects**: the baseline's hand-written triples (now proven reachable, §5) and the fact that co-drift in the normalizer corpus — changing both files to a value the real function does not return — is caught by the pgTAP run rather than by the cross-file test. pgTAP is the authoritative runtime proof and it executes from zero on every push.

### The acceptance review: three Criticals, and one live defect

Three further reviewers ran at acceptance. They confirmed the fifteen above are genuinely killed, confirmed the reachability rules against the SQL in both directions (including the dangerous direction — a row the rules *reject* that SQL can produce, which would be a production raise — and found none), confirmed the owner predicate airtight through every lateral, and verified the injection expected-counts by hand. They also found the following, all now fixed.

**Critical — the correction pass's own fixes were untested.** Four of the five Criticals fixed earlier in this slice could be deleted with the suite still green:

1. **The `writesRelation` guards** (three call sites plus the helper). Removing the person guard made `set_waiting_on` with a person hint score 0.60 instead of 0.50 on a task that already held that person — `matched`, `oneStep`, an unconfirmed `waiting_on` write on the wrong task. That is verbatim the defect the guard was added to fix.
2. **The future-audit clamp and the ISO designator precondition.** Removing the clamp turned a `now + 14d` audit timestamp into a margin of exactly `minMargin` — a garbage clock manufacturing a one-step apply, again verbatim the original defect.
3. **The outcome branch order.** Hoisting the confirmation branch above the ambiguity branch survived, because no fixture ever exercised a destructive action with *two* candidates. Two identical `cancel_task` candidates would have produced a single confirm control for an arbitrary one of them.

**Important — a live defect, not a coverage gap.** The status hint was tautological for `reopen_task` and `restore_task`. `describesDestination` only suppresses a hint equal to `patch.status`, which only `set_status` can carry — but `isEligibleStatus` already guarantees every candidate holds an eligible status, and those two actions have single-element eligible sets. So the hint fired on every candidate, separated none, and only inflated the score against the threshold. Proven by execution: "reopen the completed report task" reached `matched` + one-step at 0.60 where "reopen the report task" was `ambiguous` at 0.52. **Fixed** — the hint is now skipped when the action's eligible set cannot distinguish candidates — and `TASK_MATCH_POLICY_VERSION` moved to `2026-07-25.3`, because the scorer's behaviour changed without any number in the policy module changing, and §10.4 exists so a recorded decision is attributable to the rules that produced it.

**Important — cross-row defences applied inconsistently.** `observedBefore` was read from `rows[0]` on trust — the value that will guard 2E-UPDATE-003's TOCTOU check and feed 2E-PREVIEW-004's fingerprint — even when that row is dropped moments later as cross-owner. Two reviewers found this independently. It is now the *earliest* observation across the set, and `describeUnreachableCandidates` refuses a set whose rows disagree on `observed_before` or `effective_limit`, not only on `query_token_count`.

**Important — the data-access layer accepted a zone-less instant** that `rankTaskCandidates` refuses as a 2E-MATCH-017 violation. `Date.parse("2026-07-26T00:30")` resolves in the host's zone, so `p_observed_before` — and the recency window and audit cut-off derived from it — were machine-dependent. That the ranker threw afterwards was no defence: the query had already run. `ISO_INSTANT` is now exported from `matching.ts` and applied in `candidates.ts` **before** the RPC call, rather than copied.

**Minor, also fixed:** the `localeCompare` structural guard was defeatable by moving the comparator to a new module, and now enumerates the feature directory instead of a hard-coded list; the normalizer count assertion's comment claimed a guarantee it does not deliver (it catches SQL-side extras and deletions, *not* co-drift) and now says so; `scoreDecimals` was documented as governing the margin, which `trust-policy.ts` actually rounds with a hard-coded `1_000` outside the policy digest — the seam is now named; `p_eligible_statuses` was the one argument with no server-side bound and is now sliced before the `distinct`; the second cross-owner direction asserted only a count and now asserts absence like the first; the relation laterals had no same-name-different-owner fixture and now do; the limit clamp was exercised only at 1 and is now proven at 0, 101 and null; and one metacharacter assertion compared two counts against each other, which zero would have satisfied, and is now pinned.

All of these were re-verified by mutation: **21 further mutations applied, 21 killed.**

## 9. Verification

| Gate | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | 0 errors |
| `npm test` | **1462 passed / 109 files** |
| `npx vitest run src/features/task-commands` | **373 passed / 11 files** |
| `npm run build` | clean |
| `deno check` (both entrypoints) | clean |
| `deno test supabase/functions/` | 46 passed |
| Mutation verification | 36 applied across three rounds, **36 killed**, all reverted |
| CI `application` | pass (run 30182925282) |
| CI `edge worker` | pass (run 30182925282) |
| CI `database and journey` | pass (run 30182925282) — the whole migration chain applied from an empty database, the full pgTAP suite `Files=26, Tests=883, Result: PASS` with this slice's 48 assertions among them, `db lint`, and the foundation journey on desktop and Pixel 7 |

Docker is unavailable on this workstation, so `supabase db reset`, `supabase test db` and `supabase db lint --local` **cannot run locally**. Draft PR #18's `database` job is the only execution path for them, and it is the evidence cited above — not a local run reported as one.

## 10. Migrations, deployment, and rollback

**Migration.** `202607250056` is additive and forward-only: one `create or replace function`, one `comment`, one `grant`, one `revoke`. No table, column, index, trigger, constraint or existing function is touched. It applies from an empty database in CI.

**Deployment: deliberately deferred, and the reason is not convenience.**

`202607250055` and `202607250056` remain local/branch-only; remote parity stays at `202607250054`. The decision is to deploy both at the point the contract is proven by its first consumer, rather than now:

- **Nothing calls the RPC.** Deploying yields no user-visible capability and reduces no risk.
- **Deploying makes the contract permanent.** `create or replace` cannot add, rename or retype a `RETURNS TABLE` column (`42P13`). While `202607250056` has only ever been applied to ephemeral CI databases — which are not a shared environment under the repository's append-only rule — the projection can still be corrected **in place** if Slice 2E.3's preview proves it insufficient. Deploying now forfeits that and buys a `_v2` in the very next slice, which is exactly the versioned-RPC sprawl ADR-037 exists to contain. The projection was widened in this slice specifically to avoid that outcome; the honest way to confirm it worked is to let the first consumer try.
- **It is a `security definer` function exposed through PostgREST.** Deploying it before any consumer means carrying that surface with no compensating benefit.
- **PRD §21's deployment order does not apply.** "Worker first, then migrations" governs slices touching both; this one touches no worker.

The amendment window closes at merge (Slice 2E.8) or at deployment, whichever comes first. Nothing merges before 2E.8.

**Rollback is routing-level, and there is nothing to route.** Per PRD §21 and 2E-OPERATIONS-005: no applied migration is reverted. Concretely, for this slice:

- nothing calls the function, so "stop routing to the new surface" is already the state;
- no index and no trigger was created, so no existing write path changed behaviour — this is the residual the removed expression index *would* have left, and it is gone;
- the function can remain dormant indefinitely at zero cost; it is `stable` and writes nothing;
- if it ever needs to be disabled after deployment, `revoke execute ... from authenticated` is sufficient and is itself additive;
- no destructive down migration is required, or provided.

**Grant posture on rollback:** revoking EXECUTE removes the only grant this slice adds. Because the slice widened no other grant, there is no second privilege to unwind, and `normalize_entity_alias` is left exactly as `202607170020` and `202607170022` left it.

## 11. 2E-OPERATIONS-003 — the focused remote smoke

**Owed, not skipped, and it did not run. No claim is made that it passed.**

The focused disposable remote smoke for this slice is **blocked on deployment**: it would exercise `list_task_command_candidates`, which does not exist in the linked project. Since deployment is deliberately deferred (§10), so is the smoke.

This is classified as a **non-blocking deployment dependency** for the slice verdict, and the PRD permits that classification:

- **Epic 2E-B's acceptance criteria (PRD §19.1) do not name a remote smoke.** They require every `2E-MATCH` requirement to pass; ranking deterministic, owner-scoped, ordered before truncation, overflow-aware and explainable; thresholds and margins in one versioned module; adversarial fixtures covering identical titles, near-equal candidates, cross-owner rows, ineligible statuses, overflowing sets and injection strings; a measured baseline; and no mutation. All of those are met.
- The contrast is deliberate and visible in the PRD's own text: **Epic 2E-D explicitly requires "a disposable remote smoke and authenticated desktop/mobile journeys"**, and Epic 2E-B does not.
- `2E-OPERATIONS-003` is an **Epic 2E-H** convergence requirement, and PRD §19.3 lists "every focused remote smoke" as a **phase-level** Definition of Done item, not a per-slice acceptance gate.

The requirement's own text is per-slice ("Each slice has a focused disposable remote smoke"), and that is not disputed here — what is argued is only that Epic 2E-B's acceptance does not gate on it. **Slice 2E.1 is a related but weaker precedent, not the same one**, and an earlier draft of this section overstated it: 2E.1 recorded "none is owed yet" because it added no owner-scoped surface to smoke, and it still added executable `task_command` assertions to `scripts/remote-supabase-smoke.mjs` against a literal that already existed remotely. This slice's smoke is *owed* and blocked, and no executable assertions exist for it — `scripts/` contains no reference to `list_task_command_candidates`. What follows is therefore a specification, not deferred code.

**What the smoke must prove when it runs** — recorded here so Slice 2E.8 inherits a specification rather than a reminder: disposable and owner-isolated with two owners; cross-owner non-disclosure (the other owner's identically-titled task **absent**, not outranked); `limit + 1` overflow detection; deterministic ordering across repeated executions; injection-pattern hints (`%`, `_`, embedded and trailing backslash) neither widening results nor raising `22025`; and complete fixture cleanup. Every one of these is already proven by pgTAP against a from-zero database; the smoke's distinct value is proving them against the **real project's** RLS, roles, and PostgREST exposure.

## 12. Requirement disposition

| Requirement | Status |
|---|---|
| 2E-MATCH-001 (ownership: predicate, and by RLS) | **Met with a documented deviation.** RLS is unavailable inside a `definer` function; the three layers are the `auth.uid()` predicate, the ranking filter, and the data-access raise, with cross-owner denial proven by execution. ADR-040. |
| 2E-MATCH-002 (eligibility from the taxonomy) | Met — the RPC filters on the array the taxonomy supplies; `rankTaskCandidates` re-filters as defence in depth |
| 2E-MATCH-003 (ordered before truncation) | Met — total order ending in `id`, repeated after the joins, proven by pgTAP |
| 2E-MATCH-004 (overflow detectable) | Met — `limit + 1` probe row; overflow read from the data; boundary fixtures |
| 2E-MATCH-005 (declared signals) | Met |
| 2E-MATCH-006 (recency) | Met — audit rows strictly older than the injected instant; declared blind spot (the audit trigger does not watch title/description until 2E.4) |
| 2E-MATCH-007 (authoritative normalizer) | Met — every lexical decision in SQL; nothing re-normalizes in TypeScript, enforced structurally |
| 2E-MATCH-008 (divergence characterized) | Met — 8-entry corpus, pinned in both files, executed in pgTAP, count-anchored |
| 2E-MATCH-009 (deterministic order) | Met — code-point tie-break, `localeCompare` forbidden structurally and behaviourally |
| 2E-MATCH-010/011 (margins, thresholds) | Met — inclusive at both boundaries, with fixtures on them |
| 2E-MATCH-012/013 (gravity independent of confidence) | Met — no destructive action is one-step at any score |
| 2E-MATCH-014 (closed evidence vocabulary) | Met |
| 2E-MATCH-015 (no fallback to "first result") | Met — a floor, not a preference |
| 2E-MATCH-016 (one policy module) | Met — pinned by digest |
| 2E-MATCH-017 (pure) | Met — instant and timezone injected; a designator-less instant is refused |
| 2E-MATCH-018 (measured baseline) | Met, with the §5 scope stated. Rates unchanged at `2026-07-25.3`: no corpus scenario carries a status hint |
| 2E-OWNERSHIP-003 (no grant widened) | Met — and the tempting violation was explicitly rejected |
| 2E-OPERATIONS-001 (additive, resets from zero) | Met — proven by the CI `database` job |
| 2E-OPERATIONS-002 (generated-type parity) | **Met by a substituted mechanism.** Not regenerated; proven three ways. ADR-041 |
| 2E-OPERATIONS-003 (focused remote smoke) | **Not run — blocked on deployment.** Non-blocking for this slice's verdict; owed at Epic 2E-H. §11 |
| 2E-OPERATIONS-005 (rollback documented) | Met — §10 |

## 13. Limitations that remain

1. **The baseline measures the scoring layer, not end-to-end matching** (§5). Every triple is proven reachable, but the corpus still supplies them rather than obtaining them from SQL. An end-to-end corpus needs a database, and therefore needs the remote smoke or a pgTAP-driven fixture set; it is a reasonable Slice 2E.8 addition.
2. **Normalizer co-drift is caught by pgTAP, not by the cross-file test** (§8). Accepted: pgTAP is the runtime authority and runs from zero on every push.
3. **The recency signal has a declared blind spot.** `audit_task_change` watches status, due_at, manual_priority, planned_at and parent_task_id — so a rename or an appended note leaves no historical row. Slice 2E.4 extends it to title and description (2E-UPDATE-010), after which Phase 2E's own writes are fully covered.
4. **Nothing is deployed, so nothing is proven against the real project** (§10, §11).
5. **`OpenAIProvider.parseTaskCommand` remains untestable by import** — inherited from Slice 2E.1, unchanged here.

## 14. Verdict

**READY WITH NON-BLOCKING NOTES.**

Every Epic 2E-B acceptance criterion is met. The five Criticals from the first review round and all fifteen mutation survivors from the sixth are closed, each verified by execution rather than by inspection. The two open items — the focused remote smoke (§11) and the end-to-end baseline (§13.1) — are deployment-dependent, are recorded as owed at Epic 2E-H, and neither is claimed to have passed.

## 15. Next slice

**Slice 2E.3 — Disambiguation and read-only preview (Epic 2E-C).** PRD §13.3 and §13.4.

Dependencies already satisfied: `TaskMatchResult` carries `ownerId`, `observedBefore`, `qualifyingCount` and each candidate's full `preState`, so 2E-PREVIEW-004's fingerprint needs no second read of the task — that was deliberate, and re-querying would reopen the TOCTOU window the injected `observedBefore` exists to close. Relation ids and person roles travel, so 2E-PREVIEW-005 can detect an already-held relation without re-normalizing names in TypeScript.

Gates still required: `qualifyingCount === 1` with outcome `ambiguous` means "I found one but I am not sure" and **not** a disambiguation list of one (2E-MATCH-012 forbids that rendering); the preview is read-only and carries `willMutate: false`, mirroring `src/features/agent/question-preview-projection.ts`; it must detect relation-aware `no_change`, show linked reminder effects, and disclose the 24-hour undo window; `mapResolutionRpcError` (`src/features/tasks/actions.ts:542-593`) is the error-to-copy precedent. **Any change to the RPC's result columns needs a `_v2`** — `create or replace` raises `42P13` — so the first task is to confirm the widened projection really is sufficient before writing the preview. It is also the last slice in which correcting `202607250056` in place remains possible.

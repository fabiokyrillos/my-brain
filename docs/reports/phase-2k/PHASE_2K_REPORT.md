# Phase 2K — Conversar as the primary interface · closing report

**Status.** **CONCLUDED — after an extraordinary post-phase correction, and not before it.** Seven slices executed and merged (2K.0–2K.6, 2K.8); **2K.7 not built, by rule**. **79 requirements declared · 79 classified · 0 unclassified.** Migration budget **`1 allocated · 1 spent`** — unchanged, and **not** retroactively reclassified.

**The phase reached closeout with its telemetry inert on the deployed project.** The probe run immediately after deploying `202608090088` found that every Conversar event was refused `22023 Unsupported product surface` by a hardcoded surface allowlist inside `private.record_product_event`, inside producers that swallow the failure. The owner then authorized **one exclusively corrective migration outside this phase's budget** — `202608090089`, which **deletes** that copy rather than adding to it. It is charged to **no phase**, and in particular not to the roadmap successor, which has not started. §7a carries the full record; it is deliberately not smoothed away.

**A second correction was appended on 2026-08-11 and it moves a row downward.** Phase 2M found that this phase's **declared consumer** for `2K-METRICS-007` could never have executed — it read a ledger column that does not exist and authenticated through a grant Turnstile has refused since SH.5. The row is now **`partial`**, the classification counts are regenerated from source, and **no historical execution is claimed**. §7b carries it.

**What the phase set out to do.** Not "build conversational actions" — the audit proved those largely existed. **Make the conversation truthful about itself, and stop destroying pending work when the user goes to check.**

---

## 1. The correction this phase owes its own record

**The PRD declares 79 requirements, not the 68 stated in five places.**

ADR-097, ADR-098, `docs/STATE.md`, `docs/reports/README.md` and the PRD's own §4 preamble all say *"68 requirements across eleven families"*. Extracting the declarations from the PRD gives **79**, across those same eleven families, with no duplicate and nothing outside the `2K-` namespace. The undercount is `2K-A11Y`'s seven members, whose family name contains digits and which every prose count missed.

This is the failure the traceability contract was written against, in its own words: *"if a single table produced the PRD, the plan and the matrix, one wrong premise would propagate into all three and appear confirmed three times."* It propagated into five.

**Corrected by appending, never by rewriting** — ADR-097 and ADR-098 are accepted and append-only, and this is the same protocol ADR-097 itself used when its "eight executed slices" claim was corrected in four documents. **All 79 are classified.** Classifying 68 and reporting completeness would have been the comfortable option.

---

## 2. Classification

**66 built · 9 baseline · 4 partial · 0 not-built-by-rule in the declared set · 0 undelivered · 0 unclassified.**

**These numbers are emitted, never typed.** At closeout the same generator read **64 built · 6 partial**; three rows moved after the post-phase correction was deployed and proved hosted — `2K-METRICS-004`, `2K-METRICS-007` and `2K-SUGG-005` — and the reading became **67 built · 9 baseline · 3 partial**. **On 2026-08-11 one row moved back**: `2K-METRICS-007` was reclassified **`built` → `partial`** after Phase 2M found that this phase's declared consumer could never have executed. §7b carries the correction. Nothing was reclassified by editing a number, in either direction.

Every row is in `PHASE_2K_TRACEABILITY_MATRIX.md`, emitted by a generator that refuses to write anything when a requirement is unclassified, classified twice, classified without a resolvable citation, or classified in a way that contradicts a signed decision. It refused four times on real findings before it emitted.

### The four partials that remain, each with its remainder and destination

| Id | Remainder | Destination |
|---|---|---|
| `2K-AUDIT-002` | The prose a zero-source answer produces | Narrowed by 2K.4 to what the provider *says*; carried past close |
| `2K-EXPL-007` | An interpretation-correction domain — a record, a consumer, a surface | The roadmap successor's own audit |
| `2K-A11Y-007` | A real-device mobile session | Carried past close, same standing as G-2J.4b |
| `2K-METRICS-007` | One execution of the repaired consumer against the deployed project, on a real owner session | A post-phase obligation in `docs/TODO.md`; the repair itself is Phase 2M's and is charged to no phase. §7b |

### The three that closed after the phase, and what each was actually waiting on

| Id | What it was waiting on | How it closed |
|---|---|---|
| `2K-METRICS-004` | The **surface** allowlist in `private.record_product_event` — a third live gate the probe found, plus an undersized table CHECK the writer's copy was masking | `202608090089` **deleted** the writer's copy and widened the CHECK, preserving `22023` with no second list |
| `2K-METRICS-007` | The producer was **inert** on the deployed project | A hosted producer→consumer proof, **13/13**, after the correction was deployed. **Superseded on 2026-08-11 and moved back to `partial`** — the writer-side and RLS evidence stands, but the proof reached the aggregation through a query written for the occasion, and the *declared* consumer could never have executed. §7b |
| `2K-SUGG-005` | **Not "pending wiring".** 2K.8 wired the event; what outlived that was the **global writer refusal**, a defect in `private.record_product_event` rather than in this requirement | Same correction, same hosted proof |

### 2K.7 — not built, by rule

Every candidate requirement closes `not-built-by-rule`, naming **ADR-055**, **OD-2K-A** and **ADR-099**. What was refused, and what was *not*:

- **Refused:** `source_type` widening beyond `entry` and `memory`; embedding backfill; any retrieval pipeline; any new job type; any new index; any new semantic infrastructure. **None was built, and the matrix carries no migration, job or index attributable to any of them.**
- **Not refused, and untouched:** `public.match_internal_knowledge` still serves every grounded answer over `entry_embeddings` and `memories`. It was not removed, disabled, degraded or deprecated. Embedding generation continues. The `semantic_search` operation continues.
- **The spike** remains permitted by ADR-055 for as long as ADR-055 stands, is not a Phase 2K deliverable, authorizes no infrastructure, and needs its own authorization. **It was not run.**
- **Resumption conditions**, as a closed list: a new measurable demand signal, a new current-experience audit, a new accepted ADR, its own migration budget, and explicit owner authorization. **No renewal date is written, deliberately.**

---

## 3. What was actually built

**One closed card grammar** — ten server-decided states, seven object types partitioned into the two OD-2K-B lets mutate and the five it does not, with `mayRenderMutatingControl` as the single decision site. A control passed for a read-only type is **dropped**, not trusted.

**Conversar governed for sensitivity, for the first time.** `chat` joined `GOVERNED_SURFACES`; `search` stayed out, so ADR-093 was not re-opened.

**The persisted excerpt is gone.** This was the audit's sharpest finding and it was **live**: a 220-character copy of every cited source, in a second table, whose classification did not travel with it. New messages persist a structured reference with nowhere to put content, and the source is re-read at render time against its **current** classification. Legacy rows keep their references and their excerpts are dropped on the floor — never read.

**A pending action survives looking at its own evidence.** Continuity re-derives with a **new clock** and **always** re-asks. The handle is five identifiers, twelve names refused by name, `.strict()` for anything else.

**An answer can say it found nothing.** Insufficiency comes from the **retrieval result**, not the citation count — the ambiguity 2K.0 measured. And the reach is stated on both branches.

**The memory undo archives**, delegating to the existing audited transition, and the archived memory leaves the window chat retrieval reads — so it stops answering questions rather than merely leaving a list.

**Two exclusions the answer path computed and threw away now reach the user** — bounded as two booleans, because a rate is a count over repeated queries.

**One hard-coded example replaced by at most three deterministic suggestions**, costing nothing.

---

## 4. What the phase spent, and what it did not

- **Migrations: `1 allocated · 1 spent`**, reconciled per slice — 2K.0–2K.6 spent none, 2K.8 spent one. The three pressures the plan pre-excluded were all refused: no `undo_operation` handler, no lifecycle window in `match_internal_knowledge`, no persisted pending confirmation.
- **No new RLS policy, grant, secret, external service, or second write path**, across seven slices.
- **No new AI operation kind.** Every operation was already in the eight-value ledger vocabulary.
- **No service-role client on any product path.**
- **No backfill.** Historical excerpts are a named residual, contained by a renderer that never reads one.

---

## 5. Proved by execution, versus asserted by document

**Executed:** tests-first on every slice; lint and typecheck zero-error throughout; `npm test` ending at **4914 passing, 0 failing tests**; production build; the accessibility lane at desktop **and** Pixel 7 on every Conversar surface; the migration chain rebuilt from empty and the full pgTAP suite, in CI, on every PR head and every merge SHA; the traceability generator, including its refusals against a mutated repository.

**NOT PROVED — never inferred, and never upgraded to a pass:**

| Check | Status |
|---|---|
| Screen-reader session on Conversar | **Never executed.** An axe pass is not one |
| Real-device mobile | **Never executed.** An emulated Pixel 7 is not a phone |
| Hydrated interactivity in a browser | **Not executed.** Proved in jsdom; markup proved in a browser; the two are not the third thing |
| Zero-source provider prose | **Not executed.** Needs a real OpenAI call; ADR-101 does not authorize spending the owner's credential, and no slice did so silently |
| Authenticated online journeys | **Not executed.** The `online-*` lane needs live credentials and is manual |

---

## 6. Defects found in this phase's own work

Recorded because the pattern is the point: **most were in guards, probes and tooling, not in the product.**

1. A guard fired on the module written to satisfy it — a *quoted refusal list* read as a use (2K.3).
2. `requiresFreshConfirmation` contains "confirmation" and is the **opposite** of the refused thing (2K.3).
3. Two 2K.1 guards said "not **yet**", and both *yets* arrived. **A guard whose premise expires fails on correct work** (2K.3, 2K.6).
4. A telemetry guard scanned past its own arms into another event's enum **value** (2K.8).
5. The traceability generator flagged a record for *upholding* a signed decision — a guard that fires there teaches authors to soften the record until the check goes quiet (2K.8).
6. The requirement count was wrong in five documents (2K.8).
7. Two test expectations were wrong rather than the contract — `unavailable` correctly suppresses controls, and a planted excerpt correctly refuses the **whole** envelope (2K.1, 2K.4).

---

## 7. Residuals, each with an owner or a destination

| Residual | Destination |
|---|---|
| Historical citation excerpts | Named by OD-2K-2; contained by a renderer that never reads one; carried to the roadmap successor |
| No screen-reader session | Owner-run, or an evidenced negative |
| No real-device mobile session | Owner-run; same standing as G-2J.4b |
| Zero-source provider prose | A credentialed environment, under a separate authorization |
| Relation references not editable from a card | Whichever later phase models entity-resolution outcomes as card states |
| Interpretation correction has no domain effect | The roadmap successor's own audit |
| Old task-command confirmation rows may persist as history | Separate residual, no owner yet (ADR-100) |
| Semantic-retrieval widening | **Settled, not open** — retired by ADR-099; resumption needs all five conditions |

---

## 7a. The phase did not close clean, and this is why

**Left in the past tense deliberately.** Everything in this section was true when the phase reached closeout, and the resolution is appended below rather than written over it.

**The single authorized migration is deployed and hosted parity is `202608090088`. The telemetry it carries is INERT.**

`private.record_product_event` holds a hardcoded **surface** allowlist of ten values, and `conversation` is not among them — so every Phase 2K event is refused `22023 Unsupported product surface`, inside a call site that swallows it.

**It is `202608080087`'s defect one field over.** That correction deleted the frozen **event-name** copy from this same function and left the **surface** list. `2K-METRICS-004` asked for all live enforcement points to be audited; I audited the two the previous defect had taught the repository to watch and missed a third inside the very function that correction edited. The threat model named this risk (`T-2K-06`) and the mitigation was insufficient.

**CI could not have caught it.** The write-path suite writes every declared name with `surface = 'server'`, uniformly and deliberately — its own comment explains that the writer does not couple surface to event name. Correct for its subject, blind to this one. **A Phase 2K event on the `conversation` surface was never exercised anywhere.** The deployment probe is what found it, which is the argument for probing after a green migration rather than trusting one.

**No user-facing capability is affected.** Every product deliverable is deployed and working; telemetry is fail-open. What is lost is the measurement — the funnel will report zeros, indistinguishable from a quiet week, which is exactly the confusion SH.6 cost weeks to.

**Fixing it needs a second migration, and ADR-101's ceiling is one.** Its stop conditions name this case first, so none was created. The choice — widen the list, or delete the third copy the way `202608080087` deleted the second — is the owner's. `PHASE_2K_DEPLOYMENT.md` states both options and recommends the second, because the first leaves a guard-less duplicate in the one function that has now caused this defect twice.

### 7a.1 Resolution — the owner chose deletion, and authorized one extraordinary migration

**The owner chose the second option and authorized `202608090089` explicitly OUTSIDE this phase's budget.** Phase 2K's authorized implementation stays **`1 allocated · 1 spent`**; the correction is charged to **no phase**. The block above is not deleted, and this phase's record permanently says it reached closeout with inert telemetry.

**A second undersized gate was found while fixing the first.** `product_events_surface_check`, on the table, also stopped at `task_command` — `202608090088` widened the event-name CHECK and the property validator and not that one. The writer's hardcoded copy refused first and **masked** it, so fixing only the writer would have moved the refusal rather than removed it. Both were corrected together.

**The `22023` contract survives with no second list.** Deleting the writer's copy alone would have downgraded the refusal to a raw `23514`. The insert is wrapped and only `product_events_surface_check` violations are translated, through `GET STACKED DIAGNOSTICS`, so message and errcode are unchanged and no caller can tell the gate moved. Surface is now validated **after** the event name — an improvement, because surface-first ordering is exactly what made this phase's own negative controls vacuous.

**The regression that could not have caught it now does.** `post_2j_product_event_write_path.sql` was **extended from 20 to 29 assertions**, never weakened and never duplicated, with the surface vocabulary derived from the CHECK at test time. It plants the historical gate to prove the refusal returns and restores it to prove it disappears, and asserts from the catalog that the writer names **no** declared surface.

**Proved on the deployed project, 13/13**, through the authenticated write path, read back under the owner's own RLS session, aggregated by the real consumer, with non-vacuous negative controls exercised on a **valid** surface and zero residue. No BYOK credential, no provider call, no signup. Full table in `PHASE_2K_SLICE_08_ACCEPTANCE.md` and `PHASE_2K_DEPLOYMENT.md`. **One clause of that sentence was corrected on 2026-08-11 — see §7b.**

## 7b. The declared consumer could never have executed (appended 2026-08-11)

**§7a stands. This section neither revises it nor closes anything; it records a defect found after the phase and moves one requirement downward because of it.**

### The fact, and when it was found

**Discovered on 2026-08-11, during Phase 2M**, by running a probe rather than reading it. `scripts/phase-2k-conversation-funnel-reader.mjs` — the consumer this phase *declared* for `2K-METRICS-007` — carried two independent, invocation-fatal defects:

1. it selected, filtered and ordered by **`product_events.occurred_at`**, a column the ledger has never had. `202607170024:51` declares `created_at` and nothing else, so every invocation would have died on *"column product_events.occurred_at does not exist"*;
2. it authenticated with **`grant_type=password`**, which hosted Turnstile has refused since SH.5 — four days before this phase closed.

**So Phase 2K's declared consumer could not have executed at closeout, and it never was executed.**

### What survives, stated precisely

§7a's 13/13 stands. The events were accepted through the authenticated writer, read back under the owner's own RLS session, and aggregated by the real `aggregateConversationFunnel`, which has no defect and is unchanged. **What does not survive is one clause**: the rows reached that aggregation through a query written for the occasion, not through the consumer's own code path — which is exactly why the broken reader stayed invisible. A probe that reconstructs the path it is meant to exercise measures the reconstruction.

So the half of `2K-METRICS-007` that says *a consumer exists* — something an owner can run to ask a question of the events — **was not true**, and the phase closed saying it was.

### What changed here, and what deliberately did not

- **`2K-METRICS-007`: `built` → `partial`.** Remainder: one execution of the repaired reader against the deployed project, on a real owner session. Destination: `docs/TODO.md`, carried past close. Counts regenerated from the slice record, never typed — **66 built · 9 baseline · 4 partial**.
- **No historical execution is claimed or invented.** The requirement is not closed by a later repair.
- **The repair is Phase 2M's**, landed in PR #169 (merge `611dd01`, commit `d456571`): `created_at`, and `--access-token` in place of the password grant. **It is charged to no phase, and Phase 2K is not credited with it.**
- **The repaired reader has still not been run.** Corrected and executable is not executed.
- **The budget is not reclassified**: `1 allocated · 1 spent`, `202608090089` still charged to no phase. This correction spends nothing and deploys nothing; hosted parity is untouched by it.

### The lesson, which is this phase's own lesson one level up

**A producer with no consumer is invisible on both sides** — ADR-084, which this phase quoted while closing. Here the *consumer* was the invisible half, and every guard over it was true of a file that could not run: `phase-2k-telemetry-guard.test.ts` asserted the reader's shape thoroughly and could not assert its executability. `2E-ANALYTICS-006` stopped the probes **drifting**; nothing stopped them being **abandoned**. The structural half is now guarded — `phase-2m-telemetry-guard.test.ts` derives the ledger's real columns from the create-table migration and fails any consumer that reads one the table does not have — and the other half is not structural: only running it proves it runs.

## 8. Posture at close

- **ADR-055:** retired unmet by ADR-099. Its expiry, **2026-10-27**, had **not** been reached at close. No renewal date written. The retrieval that ships today is untouched.
- **Signup:** closed. The rollout gate reads **25 pass · 3 fail · 2 owner-signature** and is untouched. **Phase 2K is not progress toward it.**
- **A13:** still targets Phase 2L, which is **not started**, not authorized and not scoped by anything in this phase.
- **Hosted parity:** `202608090088`, 88 migrations, local = remote.

---

## 9. What this phase does not authorize

Phase 2L or any successor. Public signup. SMTP. A restore drill. Retention scheduling. RG-DEP-4. External integrations. Semantic widening, backfill, or the ADR-055 spike. A second migration. Any deployment beyond the single telemetry migration ADR-101 named.

**A contract produced here does not authorize its consumer.** The card grammar, the continuity contract, the source-provenance typing and the Conversar telemetry surface are all reusable; a later phase adopting any of them needs its own authorization.

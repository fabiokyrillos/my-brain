# Phase 2K — Conversar as the primary interface · closing report

**Status.** Seven slices executed and merged; **ONE OWNER DECISION OUTSTANDING** — the deployed telemetry is inert and needs a second migration (§7a). Slices (2K.0–2K.6, 2K.8); **2K.7 not built, by rule**. **79 requirements declared · 79 classified · 0 unclassified.** Migration budget **`1 allocated · 1 spent`**.

**What the phase set out to do.** Not "build conversational actions" — the audit proved those largely existed. **Make the conversation truthful about itself, and stop destroying pending work when the user goes to check.**

---

## 1. The correction this phase owes its own record

**The PRD declares 79 requirements, not the 68 stated in five places.**

ADR-097, ADR-098, `docs/STATE.md`, `docs/reports/README.md` and the PRD's own §4 preamble all say *"68 requirements across eleven families"*. Extracting the declarations from the PRD gives **79**, across those same eleven families, with no duplicate and nothing outside the `2K-` namespace. The undercount is `2K-A11Y`'s seven members, whose family name contains digits and which every prose count missed.

This is the failure the traceability contract was written against, in its own words: *"if a single table produced the PRD, the plan and the matrix, one wrong premise would propagate into all three and appear confirmed three times."* It propagated into five.

**Corrected by appending, never by rewriting** — ADR-097 and ADR-098 are accepted and append-only, and this is the same protocol ADR-097 itself used when its "eight executed slices" claim was corrected in four documents. **All 79 are classified.** Classifying 68 and reporting completeness would have been the comfortable option.

---

## 2. Classification

**64 built · 9 baseline · 6 partial · 0 not-built-by-rule in the declared set · 0 undelivered · 0 unclassified.**

Every row is in `PHASE_2K_TRACEABILITY_MATRIX.md`, emitted by a generator that refuses to write anything when a requirement is unclassified, classified twice, classified without a resolvable citation, or classified in a way that contradicts a signed decision. It refused four times on real findings before it emitted.

### The six partials, each with its remainder and destination

| Id | Remainder | Destination |
|---|---|---|
| `2K-AUDIT-002` | The prose a zero-source answer produces | Narrowed by 2K.4 to what the provider *says*; carried past close |
| `2K-EXPL-007` | An interpretation-correction domain — a record, a consumer, a surface | The roadmap successor's own audit |
| `2K-SUGG-005` | The telemetry event itself | **Discharged in 2K.8** |
| `2K-A11Y-007` | A real-device mobile session | Carried past close, same standing as G-2J.4b |
| `2K-METRICS-004` | The **surface** allowlist in `private.record_product_event` — a third live gate the probe found | An owner decision on a second migration |
| `2K-METRICS-007` | The surface allowlist admitting `conversation`; the producer is **inert** on the deployed project | The same owner decision |

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

## 7a. The phase does not close clean, and this is why

**The single authorized migration is deployed and hosted parity is `202608090088`. The telemetry it carries is INERT.**

`private.record_product_event` holds a hardcoded **surface** allowlist of ten values, and `conversation` is not among them — so every Phase 2K event is refused `22023 Unsupported product surface`, inside a call site that swallows it.

**It is `202608080087`'s defect one field over.** That correction deleted the frozen **event-name** copy from this same function and left the **surface** list. `2K-METRICS-004` asked for all live enforcement points to be audited; I audited the two the previous defect had taught the repository to watch and missed a third inside the very function that correction edited. The threat model named this risk (`T-2K-06`) and the mitigation was insufficient.

**CI could not have caught it.** The write-path suite writes every declared name with `surface = 'server'`, uniformly and deliberately — its own comment explains that the writer does not couple surface to event name. Correct for its subject, blind to this one. **A Phase 2K event on the `conversation` surface was never exercised anywhere.** The deployment probe is what found it, which is the argument for probing after a green migration rather than trusting one.

**No user-facing capability is affected.** Every product deliverable is deployed and working; telemetry is fail-open. What is lost is the measurement — the funnel will report zeros, indistinguishable from a quiet week, which is exactly the confusion SH.6 cost weeks to.

**Fixing it needs a second migration, and ADR-101's ceiling is one.** Its stop conditions name this case first, so none was created. The choice — widen the list, or delete the third copy the way `202608080087` deleted the second — is the owner's. `PHASE_2K_DEPLOYMENT.md` states both options and recommends the second, because the first leaves a guard-less duplicate in the one function that has now caused this defect twice.

## 8. Posture at close

- **ADR-055:** retired unmet by ADR-099. Its expiry, **2026-10-27**, had **not** been reached at close. No renewal date written. The retrieval that ships today is untouched.
- **Signup:** closed. The rollout gate reads **25 pass · 3 fail · 2 owner-signature** and is untouched. **Phase 2K is not progress toward it.**
- **A13:** still targets Phase 2L, which is **not started**, not authorized and not scoped by anything in this phase.
- **Hosted parity:** `202608090088`, 88 migrations, local = remote.

---

## 9. What this phase does not authorize

Phase 2L or any successor. Public signup. SMTP. A restore drill. Retention scheduling. RG-DEP-4. External integrations. Semantic widening, backfill, or the ADR-055 spike. A second migration. Any deployment beyond the single telemetry migration ADR-101 named.

**A contract produced here does not authorize its consumer.** The card grammar, the continuity contract, the source-provenance typing and the Conversar telemetry surface are all reusable; a later phase adopting any of them needs its own authorization.

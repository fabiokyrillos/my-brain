# Phase 2L — Slice 2L.2 · acceptance record

**Status:** executed. **Zero migrations. No new RPC, no new write path, no new
grant, policy or telemetry event.** Hosted parity remains `202608090089`.

**Baseline:** `main` at `fb08dfc81dea397ed7f4e2693424ceb60d13264f` — the 2L.1
merge commit, CI green on all three jobs at that exact SHA. Branch
`codex/phase-2l-slice-2`.
**Requirements covered:** `2L-BULK-001…012`; `2L-ACCESS-001…006` for the
selection bar, the preview and the result; `2L-PRIVACY-004`, `2L-PRIVACY-008`.

---

## 1. The mandatory pre-slice review

Re-read against the merged product. **Three premises moved, none of them a
decision, and one plan test line was refined with its argument recorded.**

| The plan said | What is actually there | Reconciliation |
|---|---|---|
| Modify `operations/actions.ts` — one Server Action iterating the existing apply path | `applyDetailCommand` is exactly that path and takes a caller-supplied patch | `applyBulkWorkCommand` iterates it. `apply_task_command` still has **one** call site; the authority census is unchanged. |
| The bulk-eligible set is "derived from `actionPolicy`" | `actionPolicy` alone cannot express "bounded value" — that is the *control's* shape, which `detailControlFor` derives from the same policy | Derived from **both**: non-destructive, and control kind ∈ {choice, date, relation}. The result is exactly OD-2L-3 A's eight verbs, asserted both by re-derivation and by name. |
| `WORK_PAGE_SIZE` is importable for the ceiling | It lived in `work-projection.ts`, which is `server-only`; the selection model runs in the browser | The constant moved to `work-page-size.ts` and the projection re-exports it. **One declaration** — two would let a page of sixty rows sit under a ceiling of fifty. |

### The refined test line, and why

The plan's 2L.2 test list says *"A foreign, deleted or ineligible id produces an
outcome that is byte-identical across those three causes."* The requirement it
implements, `2L-BULK-011`, says the outcome must reveal **no differentiable
existence signal**.

Foreign and deleted are byte-identical here, and that is asserted: both resolve
to `unresolvable`, because an owner-scoped candidate query returns neither, and
there is no branch that could tell them apart.

`ineligible` is kept **distinct**, and it leaks nothing. It is reachable only for
a row that *did* come back from the caller's own resolution — which means the
caller already knew it existed and was theirs. A foreign id can never produce it.
Collapsing it would cost the user the one refusal they can act on — "this task
changed while you were choosing" — to protect a fact they already have, and it
would make `2L-BULK-005`'s required *reason class* meaningless.

Recorded here rather than absorbed. No signed decision is touched.

**Post-closeout correction (2026-08-09).** This slice originally classified
`2L-BULK-011` as **partial** with the remainder "none in behaviour" — which is
not a remainder at all, and the traceability vocabulary has no room for a
`partial` that has nothing outstanding. The re-assessment found one thing that
was genuinely argued rather than proved: that `ineligible` is **unreachable** for
an id the caller does not own. That is the only place a differentiable existence
signal could have hidden, and it is now driven as two runs over the same id —
present in the owner-scoped resolution it yields `ineligible`, absent from it the
same id yields `unresolvable` — alongside a proof that no refusal carries task
content whatever its cause.

With that proof executed, the requirement's own text is satisfied with **no
behaviour, no proof and no decision pending**, and the classification is
**built**. The divergence from the plan's stronger *phrasing* stays recorded
above, because it is a fact about the plan rather than a debt against the
product.

---

## 2. `2L-BULK-001…012`

| Requirement | How, and where it is proved |
|---|---|
| `-001` explicit, visible, countable, dismissible | `selection.ts` + `bulk-bar.tsx`; the bar renders nothing until something is selected |
| `-002` never a set the user did not see | `selectAllShown` takes **the page's own ids** as its argument; there is no arm that could mean "everything matching" |
| `-003` bounded at 50, stated before reached, refused not truncated | ceiling derived from `WORK_PAGE_SIZE`; a refusal returns the **unchanged** selection; the hint is on screen from the first selection |
| `-004` derived; `cancel_task` excluded by name | `bulk-eligibility.ts`; the test re-derives the set *and* names the eight |
| `-005` preview states operation, counts and reason class | `previewBulk`, rendered **continuously** — there is no state in which Apply is reachable and the counts are not on screen |
| `-006` confirmation derived from policy; destructive arm unreachable | nothing bulk-eligible is destructive, so `requiresConfirmation` is computed false; the Server Action refuses a destructive verb **before reading anything** |
| `-007` a confirmation authorizes one set and one operation | vacuous by construction under OD-2L-3 A — no bulk operation issues one; recorded as **not-built-by-rule** rather than claimed |
| `-008` one refusal does not abort the rest | the loop catches per item; the canonical test drives A/B/C with B absent and asserts the **RPC calls that happened** |
| `-009` counts on both sides; never a partial as a success or a total failure | `summariseBulk`'s four kinds, with `no_change` counted apart from both |
| `-010` one operation key per item | minted per `(task, verb)`, asserted distinct at the RPC |
| `-011` no differentiable existence signal | §1 above |
| `-012` undo for the applied subset only | derived from the presence of an `undoId`, not from the outcome label |

**The cost is the one 2L.0 measured.** Two round trips per item, one
`undo_operations` row and one `audit_logs` row per applied item, bounded at
fifty. The loop is **sequential** rather than concurrent: each iteration is its
own transaction with its own observation instant, and fifty concurrent writes
against one account would contend on the rows the audit trigger and the reaper
touch.

**Refusals that cost nothing are taken at the boundary, once.** A set above the
ceiling, a duplicated task id, a destructive or free-text verb, and a value the
control cannot represent are all refused before the first read — fifty identical
refusals for one bad date would be fifty rows of noise about one mistake.

---

## 3. Privacy and telemetry

**`2L-PRIVACY-008`.** A masked task is selectable and operable without being
revealed: the checkbox's accessible name is the **protected stub**, not the
withheld title, and the result names reasons rather than tasks. No classification
and no content reaches any event.

**No event was declared.** A bulk apply reports through the **existing**
`task_command_applied`, once per applied item, with `origin: "work"` and no new
property — the same event a single apply reports through. Emitting nothing would
have made the funnel wrong rather than quiet; emitting something new would have
been a vocabulary change this slice has no mandate for. `2L-METRICS-*` remains
slice 2L.5's subject.

---

## 4. Accessibility

Entered in this slice, not at closeout. One fixture added to
`e2e/accessibility.spec.ts` — the bar in its **result** state, which is the state
with the most to get wrong — plus the row checkbox added to the existing Work
list fixture.

| Check | Desktop | Mobile |
|---|---|---|
| axe, no serious or critical | ✅ | ✅ |
| visible focus, from paint | ✅ | ✅ |
| rendered touch targets ≥ minimum (incl. the checkbox) | skipped by design | ✅ |

`accessibility-mirror-guard.test.ts` pins every load-bearing class back to the
component that emits it.

---

## 5. Executed, and not executed

**Executed locally:** focused suites green; lint and typecheck zero-error;
`npm test` — **5119 passing, 0 failing tests** (3 test *files* fail to load on
the documented Windows shebang-parse baseline, green in CI); build green;
`git diff --check` clean; accessibility lane green at both viewports.

**NOT executed, and not inferred:** any hosted probe; any real-device or
screen-reader session; any authenticated online journey; hydrated interactivity
in a browser. In particular **no bulk run has been executed against a real
database** — the partial-result behaviour is proved against an injected client
that answers per task id, which is stronger than a stub and weaker than a hosted
probe, and this record does not round it up.

---

## 6. Budget and posture

| Item | Before | After |
|---|---|---|
| Migrations | 89 | 89 |
| Hosted parity | `202608090089` | `202608090089` |
| `apply_task_command` call sites | 1 | 1 |
| `undo_operation` caller modules | 4 | 4 |
| Product events declared | none | none |
| RLS policies, grants, roles, secrets | — | none touched |

---

## 7. Claims

| id | classification | evidence |
|---|---|---|
| `2L-BULK-001` | **built** | Section 2 - `selection.ts` plus the bar: visible, countable and dismissible without applying, proved in `selection.test.ts` and `bulk-bar.test.tsx` |
| `2L-BULK-002` | **built** | Section 2 - `selectAllShown` takes the page's own ids as its argument, so no arm of it can mean "everything matching" |
| `2L-BULK-003` | **built** | Section 2 - the ceiling derives from `WORK_PAGE_SIZE`; a refusal returns the unchanged selection, `selectAllShown` refuses whole, and the bound is on screen from the first selection |
| `2L-BULK-004` | **built** | Section 2 - derived from two predicates and asserted both by re-derivation and by name; `cancel_task` excluded by name and by test |
| `2L-BULK-005` | **built** | Section 2 - `previewBulk` partitions by the same predicate the apply path asks, driven over one set of fixtures; rendered continuously so Apply is never reachable without it |
| `2L-BULK-006` | **built** | Section 2 - `requiresConfirmation` is computed from the set membership, and the Server Action refuses a destructive verb before reading anything |
| `2L-BULK-007` | **not-built-by-rule** | Section 2 - under OD-2L-3 option A no bulk-eligible operation requires a confirmation, so a confirmation authorizing exactly one previewed set has no subject. A rule-driven absence, signed by ADR-103 |
| `2L-BULK-008` | **built** | Section 2 - the loop catches per item; the canonical test drives three items with the middle one absent and asserts the RPC calls that actually happened |
| `2L-BULK-009` | **built** | Section 2 - four kinds with no-change counted apart from both applied and refused; a partial is reachable from exactly one condition |
| `2L-BULK-010` | **built** | Section 2 - one key per task and verb, asserted distinct at the RPC in `bulk-actions.test.ts` |
| `2L-BULK-011` | **built** | Section 1 - foreign and deleted are byte-identical, asserted end to end; and `ineligible` is now PROVED unreachable for an id the caller does not own, by driving the same id twice - present in the owner-scoped resolution it yields ineligible, absent from it the same id yields unresolvable - plus a proof that no refusal carries task content. Nothing in behaviour, proof or decision is outstanding |
| `2L-BULK-012` | **built** | Section 2 - the undoable subset is derived from the presence of an undo id, never from the outcome label, so an item the domain wrote no reversal for cannot appear |

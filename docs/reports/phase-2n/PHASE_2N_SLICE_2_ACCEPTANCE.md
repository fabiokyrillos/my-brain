# Phase 2N — Slice 2N.2 acceptance: the project page

**Status:** delivered.
**Base:** `main` at `7e27b53`.
**Migrations created: 0.** 92 total, parity `202608120092`. M1/M3 remain
allocated to 2N.3 and M2 to 2N.7, unspent and non-transferable.

## 1. Re-audit against `main`, before anything was written

The slice was re-derived from source rather than from its plan entry. Three of
its seven requirements were **already satisfied** on `main` by earlier work, and
are recorded as baseline rather than re-claimed.

| requirement | state on `main` at `7e27b53` | classification |
|---|---|---|
| `2N-PROJECT-001` identity, status, links, same ownership property | hero, `requireUser` + RLS, `notFound()` on a miss | **baseline** |
| `2N-PROJECT-002` people **with their roles** | `AssociationPanel` already received `role` from `person_projects` and rendered it; delivered by UX-08/EGC.2 | **baseline**, re-verified by journey |
| `2N-PROJECT-003` current state from records that exist | status ✓, recent entries ✓, **open commitments absent** | **built** |
| `2N-PROJECT-004` recent changes from audit/interpretation history | nothing | **built** |
| `2N-PROJECT-005` decisions and risks, only if representable | nothing | **decisions built · risks `not-built-by-rule`** |
| `2N-PROJECT-006` bounds exactly as `2N-PERSON-003` | three lists bounded by 2N.0 and PR #205 | **baseline** for those, **built** for the four lists this slice adds |
| `2N-PROJECT-007` every mutation reuses an existing authority path | true, and **unasserted** | **built** (the assertion) |

Four further things were built because the truth contract requires them on any
surface that renders derived claims, and the project page had none of them:
per-task provenance, per-memory provenance, section origin notes, and `?back=`
return anchors. All four reuse 2N.1's module unchanged.

**Totals: 7 requirements — 4 built, 3 baseline.** Plus `2N-MOBILE-001`/`-003`
and `2N-ACCESS-001`/`-002`/`-003`/`-005` validated on this surface, and
`2N-ACCESS-004` **N/A** (this slice ships no graph; it belongs to 2N.6).

## 2. The risk half of `2N-PROJECT-005` closes `not-built-by-rule`

**Decisions are representable.** `entry_interpretations.concepts` is a stored
`text[]` whose vocabulary contains `decision`, declared in
`src/lib/ai/extraction-schema.ts` and written by the worker under the same
validated contract.

**Risks are not.** There is no risk concept, no risk column and no risk table
anywhere in the schema, the app vocabulary or the worker vocabulary. The nearest
concepts are `blocker`, `dependency` and `waiting_for_third_party`, and none of
them means a risk: **a blocker is something that is stopping work; a risk is
something that might.** Mapping one to the other would mint a vocabulary the
product does not have and present an inference as a record.

The classification is **asserted, not narrated.** `phase-2n-project-guard`
scans all three vocabularies for a risk concept and the migrations for a
risk-named schema object, with a non-vacuity control proving the same scan finds
the `decision` concept that did ship. A later phase that makes risks
representable fails this guard in the same change, which reopens the
requirement rather than leaving it closed by an old sentence.

**Mutation control executed:** adding `"project_risk"` to the extraction
vocabulary made the guard fail by name; reverted.

## 3. What was built, and the rule each thing obeys

**State (`-003`).** One line, from three records that already exist: the
project's stored status, how many linked tasks are still open, and when the most
recent linked entry happened. No new status vocabulary — the status word is the
stored `check` literal's label, "em aberto"/"open" is what `work-filters-copy.ts`
already prints for the same set, and the terminal pair is asserted against the
`tasks_status_check` constraint.

**A count from a bounded list says "at least N".** The rows the limit dropped
may hold further open tasks, so a bare number would state a total nobody read.
The two phrasings are separate copy strings so a caller cannot print the
confident one over the uncertain number.

**Recent changes (`-004`).** `audit_logs`, described by the same
`describeHistoryEvent` the History surface uses. No change-log table, and no
second label for any action type — the guard forbids the surface from naming one.
The section's explainer states the two things the trail carries for a project
(project edits, person links), so a change the trail never records — linking a
task, for instance — reads as outside this list rather than as an absence of
history.

The audit `reason` is **not selected**, matching UX-28: it is free text every
writer fills with a restatement of the localized sentence.

**Decisions (`-005`).** Read from the entry's **current** interpretation, via
`entries.current_interpretation_id`, so a reading the owner has since corrected
cannot resurface as a decision. A query on `entry_interpretations.entry_id` would
have matched every superseded version. The heading says these are a *reading*,
not decisions the product holds, and every row opens to the record.

**Memories.** `memories.project_id` gains its first reader. The column has
existed since `202607160006` and this page never looked at it, so a memory the
owner recorded about a project was reachable only through a person it also
mentioned, or not at all.

## 4. Three defects found in the diff review, not by a test

- **A third hop carried no bound.** `associationIds` is read under
  `CONTEXTUAL_LIMIT` and feeds the association-change lookup. A project with
  more than a hundred association rows in its whole history would have left some
  unqueried, and their changes missing from a list that otherwise looked
  complete — the same silent truncation `2N-PROJECT-006` exists to end, one hop
  further out. It now joins the `upstreamBounded` disjunction.
- **A section that vanished when empty.** The memories block copied the person
  page's `length > 0 &&` guard, which left `projectMemoriesEmpty` declared and
  unreachable. A section that disappears leaves the reader unable to tell an
  empty answer from a surface that never had the question — the distinction
  every other section on this page states. It now renders its empty state.
- **A failed read that would have read as an answer.** The interpretation query
  originally took `.data` directly, copying `sourceResult` above it. That is
  right *there* — a row that does not arrive stays absent from the levels map
  and lands in the most-protective arm, so the failure closes. It is wrong
  *here*: an empty result renders a sentence that **asserts** something about
  the readings ("no entry on this project was read as a decision"), so
  swallowing an error would turn *we could not look* into *there are none*. It
  now uses `requireSupabaseData`, the posture every other list on the page
  already takes. **Two reads, two opposite correct answers, from one apparent
  pattern.**

## 5. Proofs

### Unit and guard

- `src/features/entities/project-context.test.ts` — **18 tests.** Includes the
  mutation control for the risk classification: `blocker`, `dependency` and
  `waiting_for_third_party` yield no decision, so a quiet remapping fails.
- `src/lib/closeout/phase-2n-project-guard.test.ts` — **26 tests.**
- **Suite 6760 → 6807 (+47)**, measured against `7e27b53` in a throwaway
  worktree rather than attributed by assumption. 44 are the two files above; the
  other 3 are existing guards that picked the new code up automatically —
  `client-boundary-serializability-guard` (+2) and `local-day-correction-guard`
  (+1, the new `lastEntryAt` formatting, which it confirms goes through the
  timezone-aware path).
- **Local run: 3 failed FILES, 0 failed tests** — the Windows-only
  `RolldownError: Parse failure` baseline recorded since 2026-08-05, green in CI.

**Mutation controls executed, each reverted:**

| mutation | guard that failed |
|---|---|
| add a risk concept to the extraction vocabulary | `finds no risk concept in either extraction vocabulary` |
| feed the change list from the untrimmed array (type-checks!) | `feeds every list on the page from a bounded list` |
| drop one section's origin note | `marks each section as persisted or derived` |
| select `confidence` into the memories projection | `does not select the column into a project-page projection` |
| name an action type in the page | `mints no second label for any action type` |

### Journeys — `e2e/online-phase-2n-project.spec.ts`, **28/28**

Both locales × desktop and Pixel 7, run with **`--workers=1`**. That is not a
detail: the parallel run saturated the local production server, and a hosted
write was caught still showing "Saving…" at 45 s with every control disabled and
no error. Serial execution completed the same case in **10.6 s**. Four fixtures
of one page — one of them rendering a hundred masked entries — is more than one
Node server answers concurrently, and shortening the wait instead would have
turned a slow path into a red test.

Three fixtures, because one would contaminate itself:

- **STATE** is read-only. Two linked tasks, one completed — a count of *linked*
  tasks would read 2 where the state line reads 1. Two linked people, one with a
  stored role and one without — a surface that invented roles would fill both.
  Three linked entries: one read as a decision, one as a blocker, one whose
  decision reading is **not current**. The last two appear in the timeline while
  being absent from the decisions section, which is what makes the absence a
  statement about the section rather than about the fixture.
- **CHANGE** is edited **through the product's own form**. The empty state is
  asserted first on the untouched project, then the edit is made and the
  sentence appears. A fixture row written behind the surface would have proved
  the reader and left the writer untested.
- **BOUND** carries 101 linked entries: exactly **100** render and the notice
  appears, so the probe row is counted rather than shown.

Also asserted: focus is visible on the source link, no `.provenance-note`
carries a `title`, no `aria-label` anywhere repeats a row's content, exactly one
`h1`, and no horizontal overflow.

The fixture recorded two schema facts the first run found the hard way:
`entry_entities.interpretation_id` and `.mention` are both `not null`, so a
project link cannot be fabricated without a reading to attribute it to.

### Regression — executed, not assumed

`online-phase-2n-foundations` **12/12** and `online-phase-2n-person` **14/14**,
both serial, both against this build. No regression.

**Zero owner-scoped residue**, proved two independent ways and never by a global
count: **0** accounts under each of `codex-2n0-`, `codex-2n1-` and `codex-2n2-`,
and **0** rows for each of **19** synthetic markers across `projects`, `people`,
`memories`, `entries` and `tasks` — with a control asserting the probe can read
`projects` at all, so an empty answer cannot come from a probe that matches
nothing.

Shared modules touched are **additive only**:
`bounds/contracts.ts` gained one constant, `entities/copy.ts` gained keys.
`AssociationPanel`, `RelationshipPanel`, `src/features/provenance/**`,
`src/features/sensitivity/**` and the person page are **unchanged** — the diff
touches 7 files and none of them is on the caution list.

### Gates

`lint` ✓ · `typecheck` ✓ · full suite ✓ (baseline above) · `build` ✓ ·
`git diff --check` clean · every file `i/lf` in the index.

## 6. Honest limits

- **Mobile is a viewport simulation on Pixel 7 metrics, not a physical device.**
  No screen-reader run is claimed (`2N-ACCESS-006`).
- **The lane is a local production build against the hosted Supabase**
  (database, auth, RLS). It is **not** the Vercel deployment.
- **`OPEN_TASK_STATUSES` is duplicated in three projections** (`calendar`,
  `day-review`, `planning`). This slice did not consolidate them: that is a
  Work-domain refactor beyond the project page, and expansion past this surface
  is a stop condition. `TERMINAL_TASK_STATUSES` expresses the complement, which
  is the form `work-projection.ts` itself uses.
- **A change row about the project renders a link to the project.** The shared
  `HistoryList` offers "Abrir" for any resolved subject, and on this page the
  subject is the page. It is truthful and mildly redundant; suppressing it would
  mean editing a component `/app/history` depends on, for a cosmetic gain.
- **"pelo menos 0 em aberto" is reachable** — a project whose 100 most recently
  updated linked tasks are all closed while more exist. It is awkward and true;
  the alternative ("nada em aberto") would be false.
- **Interpretation history is surfaced as the timeline, not as change rows.**
  `entry_interpreted` audit rows exist for every linked entry and are
  deliberately excluded: they describe the entry, not the project, and would
  bury the changes the reader is looking for. Recorded as a scope decision, and
  the section's explainer states its coverage so the omission is visible.
- **`element_classifications.concepts` is available and not surfaced.** The
  stored value would let each decision row say whether its concepts were
  classified `fact`, `interpretation`, `inference` or `suggestion`. It is not
  rendered because no requirement asks for it and it would mint user-facing copy
  for a four-value vocabulary that has none. Recorded for a later slice.

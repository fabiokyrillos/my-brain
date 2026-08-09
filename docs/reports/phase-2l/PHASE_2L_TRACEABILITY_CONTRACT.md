# Phase 2L — Work and execution · traceability contract

**Status:** planning evidence. Declares no requirement and authorizes nothing.

**What this document is.** The list of conditions under which Phase 2L **may not
close**, written before any of them can be embarrassing. It is the specification for
`scripts/generate-phase-2l-traceability.mjs` and
`src/lib/closeout/phase-2l-traceability.test.ts`, neither of which exists yet and
neither of which this planning pass creates.

**Why it is a separate document.** Phase 2K's own contract said it: *"if a single table
produced the PRD, the plan and the matrix, one wrong premise would propagate into all
three and appear confirmed three times."* It then propagated into **five** — the
requirement count — and was found only when the declarations were extracted
mechanically. So the contract is written against the PRD, not derived from it, and the
matrix is emitted, never typed.

---

## 1. The generator's operating rule

**It refuses rather than prints an unresolved claim.** A refusal writes nothing at all —
not a partial matrix, not a matrix with a warning banner. A matrix that exists is a
matrix in which every row survived every refusal below.

**It emits the counts.** No document in this phase may state a requirement count that
was typed by a human. The PRD's "76" is a claim the generator must reproduce; if it
does not, the PRD is wrong, not the generator.

**It reads declarations, not prose.** A requirement is a line matching
`^- \*\*2L-[A-Z]+-\d{3}:\*\*` in `PHASE_2L_PRD.md`. Nothing else is a requirement.
This is deliberately the same shape the A13 detector uses, so the two can never
disagree about what a declaration is.

> **The family-name trap, closed by construction.** `2K-A11Y` does **not** match
> `2L-[A-Z]+-\d{3}` — its family name contains digits — which is why every prose count
> of Phase 2K missed seven requirements and why the A13 detector could not have seen
> them either. Phase 2L's accessibility family is named **`2L-ACCESS`** for that reason
> alone. **R-14 below asserts the property directly rather than trusting the naming.**

---

## 2. The refusals

Each is a condition under which the generator writes nothing and the phase cannot
close. Each must be **proved to refuse** against a deliberately mutated repository
before its passing run is believed — a refusal that has never fired is a refusal
nobody has tested.

### R-01 — An unclassified requirement
Every declared `2L-*` id must carry exactly one of `built`, `baseline`, `partial`,
`not-built-by-rule`, `undelivered`. A requirement with no classification refuses.

### R-02 — A duplicated requirement
An id declared twice, or classified twice, refuses. Two rows for one id is how a
generous classification hides beside an honest one.

### R-03 — A requirement with no resolvable evidence
Every classification cites a file, route, action, RPC, table, constraint, migration,
test or acceptance record **that exists at the SHA being classified**. A citation that
does not resolve refuses. A citation to a document that merely *asserts* the behaviour
is not evidence for `built`.

### R-04 — A partial with no remainder or no destination
`partial` and `undelivered` both require the exact missing behaviour or proof **and** an
owner or destination. "Partially delivered" with no remainder refuses.

### R-05 — A destructive operation with no contract
Any operation classified as delivered that the taxonomy marks `destructive` must cite,
in one row: its preview, its server-issued confirmation, its truthful result and its
undo-or-recovery semantics. A missing element refuses.

### R-06 — A bulk action with no partial-result truth
Any `2L-BULK` requirement classified `built` must cite a **behavioural** test over a
**mixed** set — at least one applied and at least one refused — that asserts the
reported counts and the reported per-item reasons. A test asserting only that the word
"partial" appears refuses.

### R-07 — A gesture with no visible alternative
If any gesture ships, every `2L-MOBILE` classification must cite the visible control
that performs the identical operation and the test proving the visible control works
with the gesture unavailable. A gesture with no cited alternative refuses.

### R-08 — Telemetry carrying content
Any declared event whose property schema admits free text, or any test fixture in which
a title, description, note, person name, project name, context name, filter value or
search term reaches a property, refuses. The check is over the **schema**, not over the
fixtures alone: a free-text property that happens to be empty today is a free-text
property.

### R-09 — A migration outside the budget
More than one migration attributed to this phase refuses. A migration attributed to a
slice other than 2L.3 refuses. A migration reclassified after the fact — "it was really
a correction" — refuses; the post-2J and post-2K corrections were each charged to **no
phase** by an explicit owner decision, and only an owner decision can do that again.

### R-10 — A hosted claim that was not executed
Any row citing hosted behaviour, a deployed function, hosted parity or a live probe must
cite the execution. A hosted claim derived from a filename, a migration's presence in
the chain, or a green CI run refuses. **Hosted parity is read from hosted state, never
inferred from `ls supabase/migrations`.**

### R-11 — A limitation classified as a pass
A requirement whose evidence names an unexecuted check — real device, screen reader,
hydrated interactivity, authenticated online journey, provider prose — may not be
classified `built`. It is `partial` with the missing proof named, or it is an evidenced
negative that says what was measured *instead*. This is the refusal that exists because
"an axe pass is not a screen-reader session".

### R-12 — A classification contradicting a signed decision
A row claiming a capability an owner decision excluded refuses. Concretely: a bulk
`cancel_task` under OD-2L-3 option A; a persisted saved view under `2L-VIEW-007`; a
task sensitivity column under OD-2L-1 options A or B; a second task-mutation write path
under `2L-EDIT-002`; a set-valued RPC under any option.

**And its inverse, which Phase 2K had to learn.** A row must **not** be flagged for
*upholding* a signed decision. A guard that fires on a record for saying "this was
deliberately not built" teaches authors to soften the record until the check goes
quiet. R-12 tests the claim against the decision, never the presence of the decision's
vocabulary.

### R-13 — A successor phase started
Any declared `2M-` requirement, any governing artifact named for the successor, any
accepted ADR whose heading names it, or any migration or source file marked as its
implementation refuses **and** is an A13 failure independently. Closing Phase 2L does
not authorize its successor, and the A13 retarget belongs to the successor's own
authorizing commit — never to this phase's closeout.

### R-14 — A declaration the detectors cannot see
Every declared id must match **both** the generator's pattern and the A13 detector's
pattern. A family whose name the shared `[A-Z]+` cannot express refuses at declaration
time rather than being discovered as an undercount at closeout. This is `2K-A11Y`'s
lesson, mechanised.

### R-15 — A count that was typed
Any count of requirements, families, migrations, built rows, partials or slices that
appears in `PHASE_2L_PRD.md`, `PHASE_2L_IMPLEMENTATION_PLAN.md`, the ADRs, `STATE.md`,
`TODO.md`, `docs/reports/README.md` or the closing report and **disagrees with the
generator's own extraction** refuses. The generator does not update the prose; it
refuses until the prose is corrected. Five documents agreeing with each other is not
evidence — Phase 2K proved that exactly.

### R-16 — An accessibility claim with no lane entry
Any `2L-ACCESS` requirement classified `built` must cite the surface's entry in
`e2e/accessibility.spec.ts` **and** a green run at both viewports. A component-level
assertion is not a lane entry; Phase 2I's `2I-CLOSE-002` is the precedent for why.

### R-17 — An event with no consumer
Any declared event classified `built` must cite a consumer that reads it. A producer
with no consumer refuses. SH.6's quota refusals recorded nothing for weeks and nobody
noticed; `2J-METRICS-007` made this a rule; `202608080087` and `202608090089` are what
it costs when the rule is satisfied on paper and not in the deployed writer.

### R-18 — A vocabulary with an unenumerated enforcement point
Any `2L-METRICS` requirement classified `built` must cite every enforcement point of the
affected vocabulary **by name** — application constant, table CHECK, property validator
— and a test proving they name one vocabulary. **A count of enforcement points is not
the citation.** This repository has now paid twice for a third copy nobody enumerated,
and the second time it was one field over from the first.

---

## 3. What the matrix must contain

One row per declared requirement, and nothing that is not a declared requirement:

| Column | Rule |
|---|---|
| Id | Exactly as declared; the generator's extraction, never retyped. |
| Family | Derived from the id. |
| Slice | Exactly one, from the plan's traceability table. |
| Classification | One of the five. |
| Evidence | At least one resolvable citation. |
| Remainder | Required and non-empty for `partial` and `undelivered`; forbidden otherwise. |
| Destination | Required for `partial` and `undelivered`. |

**Emitted totals, at the foot of the matrix:** declared, classified, and one count per
classification, each computed by the generator. If declared ≠ classified, the generator
has already refused.

---

## 4. What may not be created before its gate

| Artifact | Earliest gate |
|---|---|
| Per-slice acceptance record | That slice's G6, from executed evidence |
| `PHASE_2L_TRACEABILITY_MATRIX.md` | G7 |
| `PHASE_2L_REPORT.md` | G7 |
| A deployment record | After an authorized deployment, from a live reading |
| Any successor artifact | Never in this phase |

**Creating any of them during planning is itself a contract violation**, and this
planning pass creates none of them.

---

## 5. The three properties this contract is really protecting

1. **A number nobody typed.** Every count in every Phase 2L document is reproducible by
   extraction, and disagreement refuses rather than being reconciled by editing prose.
2. **A classification no more generous than its evidence.** `baseline`, `partial` and
   `not-built-by-rule` exist so that a phase can be honest about what it did not do;
   R-11 and R-12 are what stop them being decorative.
3. **A phase that cannot end by starting the next one.** R-13 and A13 hold the same
   invariant from two directions, and neither of them is discharged by this phase
   closing well.

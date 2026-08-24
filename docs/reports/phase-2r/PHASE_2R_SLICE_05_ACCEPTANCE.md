# Phase 2R — slice 2R.5 acceptance: closeout

**Delivers** `2R-CLOSE-001` … `-012`, and closes `2R-TRUST-001` … `-007`.
**Zero migrations.** No product code.

- **Migrations created: none.** 101 local = **101 hosted**, parity
  `202608230101`, re-read live at closeout.
- **Hosted writes: none.** One read-only query, quoted in §2.
- **AI calls: none. BYOK credit spent: none.**

> **The phase is not closed by this record.** `2R-CLOSE-012` requires an owner
> decision recorded as an ADR, after a device checkpoint — and a green pipeline
> is explicitly not that. This slice builds the machinery, classifies every
> requirement, and **stops**.

## 1. The generator, and the six refusals that fired on its first run

`scripts/generate-phase-2r-traceability.mjs` reads the PRD, the coverage report
and the slice acceptance records, and either writes the matrix or **writes
nothing at all**. A matrix that is 72 of 73 correct reads as complete, which is
why a refusal produces no file.

Its first run refused, and every refusal was a real defect in the records rather
than a bug in the generator:

| What it refused | The defect |
|---|---|
| `2R-MOBILE-003` classified `**delivered**` | **a class that does not exist.** The contract names five; "delivered" is prose I had written into the class column. Corrected to `built` |
| `2R-NOTIFY-007` classified `**rule — enforced**` | the same mistake in the other direction — the vocabulary's word is `not-built-by-rule` |
| `2R-MOBILE-003` **classified twice**, once as `undelivered` | **the transition table.** Slice 2R.3's record carries a `\| Requirement \| Was \| Now \| Why \|` table showing how the class moved between checkpoint runs, and reading rows by shape alone put its `Was` column where the class goes. This repository already had the failure written down; the generator reproduced it exactly |
| `2R-SURFACE-001` and `2R-MOBILE-001` classified twice | the same transition table, same cause |
| nineteen requirements unclassified | `2R-TRUST-*` and `2R-CLOSE-*`, which are this slice's own — §3 |

The parser now reads **only tables that announce themselves** with the heading
`| Requirement | Class | … |`. A transition table's second heading is `Was`, and
it is skipped entirely.

### The finding that outlives the slice: five requirements took credit for work nobody did

Reconciling the class counts against the PRD's declared **kinds** produced
**57 `built` against 55 declared `build`** — two more than the phase ever asked
for. The generator gained a refusal for it, and the refusal named six rows:

```
2R-FOUNDATION-001 … -004, -006 are declared baseline and classified built
2R-ACCESS-005 is declared a rule and classified built
```

**Five of them had been wrong since slice 2R.0**, the phase's first slice. Those
requirements ask for a property to be *measured and recorded* — *"re-proved at
slice start"*, *"measured before anything touches it"*, *"re-checked against the
live database"* — and the contract's §1 is unambiguous: **"`baseline` may never
be recorded as `built`."** Phase 2Q's ADR-129 Decision 7 established the rule
because classifying a property that already held as newly built **claims a change
that did not happen**. Only `2R-FOUNDATION-005` is declared `build`, and only it
stays `built`.

`2R-ACCESS-005` was the same mistake in the third direction: a rule's delivery is
its recorded refusal, not a build.

**The evidence in every one of those rows is unchanged.** What was wrong was the
column it was filed under, and it survived five slices, two device checkpoints
and thirteen green CI runs — because nothing had ever compared a delivered class
against its declared kind. The contract stated the rule in prose and no code read
it.

The opposite direction is deliberately **not** refused: `2R-SURFACE-005` and
`2R-NOTIFY-005` are declared `build` and delivered `baseline`, which is a phase
discovering the property already held. That correction has to stay sayable, and
both records carry the reason.

**Final counts, reconciled against the declarations:** 51 `built` · 17 `baseline`
· 2 `partial` · 3 `not-built-by-rule` · **0 `undelivered`** = 73. Declared kinds
were build 55 · baseline 15 · rule 3; the four `build` requirements not delivered
as `built` are the two reclassified to `baseline` and the two `partial`, and the
three rules match exactly.

**A correction to the contract, made openly.** The contract says the generator
reads *"the five slice acceptance records"*. There are **six** — 2R.0 through
2R.5 — and reading five would leave the twelve `2R-CLOSE-*` unclassified, which
the generator would then report as a phase failure. The contract was written
during planning, when this record did not exist to be counted. Six are read, and
the generator's own header carries the correction rather than diverging quietly.

## 2. The hosted read, and what it settled

One query, read-only, at closeout:

```
policy_rows 0 · series_rows 2 · hosted_migrations 101 · parity 202608230101
```

- **`automation_category_policies` holds zero rows.** All six categories read
  through the computed default, `suggest_only` — exactly the phase's baseline as
  §115 recorded it. `2R-TRUST-003` asks for that comparison at closeout, and this
  is it, re-read rather than remembered.
- **101 hosted migrations, parity `202608230101`.** One allocated by `OD-2R-7`,
  one spent in 2R.1, and **none created by 2R.2, 2R.3, 2R.4, 2R.5 or either
  corrective round.**
- **Two series rows exist**, written by the owner's own device checkpoints. The
  phase's subject is in real use rather than only in tests.

## 3. Classification

| Requirement | Class | Evidence |
|---|---|---|
| `2R-TRUST-001` | **built** | the materialisation trigger writes an `audit_logs` row carrying actor `system`, the completed reminder as before-state, the new instant, sequence and timezone as after-state, and a reason — and writes it **only when a row actually appeared**, so the audit records writes rather than attempts |
| `2R-TRUST-002` | **built** | the migration contains **zero** occurrences of `automation_categ`; materialisation carries no policy state and is reported nowhere as autonomy |
| `2R-TRUST-003` | **baseline** | §2 — re-read live at closeout: `automation_category_policies` holds **zero** rows, so all six categories read through the computed default, unchanged from the phase's baseline. **No change was made** |
| `2R-TRUST-004` | **baseline** | the one migration the phase spent moved no grant, RLS policy, retention rule or authority beyond its own new relation, asserted against its own diff in `PHASE_2R_SLICE_01_DEPLOYMENT.md`; the five slices after it created no migration to move anything with. **No change was made** |
| `2R-TRUST-005` | **built** | `public.reminder_series` grants `authenticated` **select and nothing else** — no insert, update or delete grant and no delete policy for anyone — so every write goes through a `security definer` RPC validating `auth.uid()`. A browser could not write these rows if it tried |
| `2R-TRUST-006` | **built** | where the rule reaches no next instant the trigger returns **without inserting**, and the preview renders the RPC's own sentence instead of a date. Neither surface shows a guess |
| `2R-TRUST-007` | **not-built-by-rule** | the signed rule is the requirement's own: no AI call is made by this phase. Zero credentials spent across six slices and two corrective rounds; the destination for anything needing one is a later initiative, and no half of this phase was recorded as passing on an unspent credential |
| `2R-CLOSE-001` | **built** | `scripts/generate-phase-2r-traceability.mjs` emits **73 classified, 0 unclassified**, and refuses rather than emitting a partial matrix |
| `2R-CLOSE-002` | **built** | the generator refuses a `partial`, `undelivered` or `not-built-by-rule` row whose evidence — with its own identifier **stripped first** — names no remainder and no destination |
| `2R-CLOSE-003` | **built** | classifications are read from the slices' records, never typed; `--check` refuses a matrix that differs from a fresh generation byte for byte |
| `2R-CLOSE-004` | **built** | the generator refuses a requirement the coverage report assigns to no slice |
| `2R-CLOSE-005` | **built** | the generator refuses a requirement whose declared criterion cell is empty or trivial |
| `2R-CLOSE-006` | **built** | a second, looser declaration pattern admitting digits finds anything the strict one cannot see, and refuses it by name. The two-sided control lives in the declaration guard |
| `2R-CLOSE-007` | **built** | the generator refuses a phase that spent a migration without a deployment record naming it, and the record names `202608230101` |
| `2R-CLOSE-008` | **built** | the declaration guard refuses an `OD-2R-*` marked signed with no accepted ADR naming it; ADR-132 signs all nine |
| `2R-CLOSE-009` | **built** | the guard refuses a record marking `2R-MOBILE-003` satisfied with no owner device session, and the generator refuses evidence that names none. The checkpoint took **three runs** and a person closed it |
| `2R-CLOSE-010` | **built** | the generator refuses a successor requirement anywhere in this phase's PRD; Phase 2S is not started, not planned and not named as active |
| `2R-CLOSE-011` | **built** | the generator refuses a closing record that drops any of audit §7's inherited remainders, checked by name |
| `2R-CLOSE-012` | **built** | the mechanism exists and **the phase is not closed by it**: closure requires an owner decision recorded as an ADR after a device checkpoint, and this record explicitly does not perform one |

**19 of 19 classified. 73 of 73 for the phase.**

## 4. What this slice deliberately did not do

- **It did not close the phase.** `2R-CLOSE-012` reserves that for the owner,
  after a device checkpoint, recorded as an ADR.
- **It created no migration** and touched no product code.
- **It wrote nothing to the hosted database.** One read-only query.
- **It discharged no remainder.** Every one is carried in the closing report with
  its destination.

## 5. Remainders carried, none discharged

- **`2R-TZ-SECOND-AUTHORITY`** — eight inline zone sites plus the missing CHECK
  on `profiles.timezone`. Routed by ADR-134; used by 2R.4 as a forced failure,
  which is not the same as fixing it.
- **`2R-OCCURRENCE-CANCEL-IRREVERSIBLE`** — needs DDL.
- **`2R-UNDO-LEDGER-NOT-CLOSED`** — measured, not repaired. 1 of 20 handlers.
- **`2R-AXE-MANUAL-LANE`**, **`2R-RECURRENCE-LANE-UNRUNNABLE`**,
  **`2R-DRAWER-NOT-LOCKED`**, **`2R-TASK-RECURRENCE`**, `OD-2R-9`'s two defects,
  the interval gap.
- **Inherited, reproduced with no item dropped:** `2P-ACCESS-005` **NOT EXECUTED
  — OWNER WAIVED**; `2P-ATTENTION-008`; `RG-DEP-3`; `2P-CHAT-007-JOURNEY`;
  ADR-055 expiring 2026-10-27. Push HTTP 403 is not resumed and is now guarded
  against being claimed.

## 6. Where this stops

**At the owner, with the device.** The phase's own closing checkpoint is the last
thing between here and an ADR, and `2R-CLOSE-012` exists so that a green
pipeline cannot stand in for it.

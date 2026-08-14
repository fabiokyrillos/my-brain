# Phase 2N slice 2N.3 — unit M1 acceptance: validity-aware retrieval

**Partial acceptance for one unit of a two-unit slice.** M1 is complete,
deployed and proved. **M3 is not written and is not authorized** — the
intermediate deletion re-audit is what authorizes it, and it runs against the
tree and database this unit produced.

**PR [#211](https://github.com/fabiokyrillos/my-brain/pull/211)**, merged at
`ab86208`, **CI green on that exact SHA**. Head at review was `87e8d98`, also
green. Base was `main` at `9334705`.
Re-audit: `docs/reports/phase-2n/PHASE_2N_SLICE_3_REAUDIT.md`.

**Migrations: 1 created — the phase's first.**
`202608130093_phase_2n_slice_3_validity_aware_retrieval.sql`, **M1** of the
three ADR-109 allocated. **93 total.** Budget `3 allocated · 1 spent`; **M3**
stays with 2N.3 and **M2** with 2N.7, both unspent and non-transferable, and a
**fourth is a STOP CONDITION**.

## 1. Requirements carried by this unit

| Id | Outcome |
| --- | --- |
| `2N-CORRECT-003` | **built** — M1 |
| `2N-KNOWS-003` | **built** — two live defects repaired, one gap closed |
| `2N-KNOWS-004` | **built** — three freshness facts where the page showed two |
| `2N-KNOWS-008` | **built** — the two pickers state their bound |
| `2N-KNOWS-005` | **`not-built-by-rule`**, guarded with a control — closed **by rule**: the epistemic three-way is not representable for a memory (§110) |
| `2N-IDENTITY-005`, `-006`, `-007` | **`not-built-by-rule`**, guarded with a control |
| `2N-KNOWS-001`, `-002`, `-006`, `-007` | **baseline** — re-verified, not re-claimed |
| `2N-KNOWS-009` | **baseline + guard** — true by construction, now asserted |
| `2N-CORRECT-001`, `-002`, `-006`(correction/archival), `-007`(memory undo), `-008` | **baseline** |
| `2N-CORRECT-004`, `-005`, `-009`…`-012` | **not started** — M3 |
| `2N-CORRECT-013` | **governs the intermediate re-audit**, which has not run |

## 2. The defect, and why no amount of TypeScript could fix it

`match_internal_knowledge` applied

```
limit least(greatest(coalesce(p_match_count, 8), 1), 20)
```

**before anything read `valid_from` or `valid_until`.** Neither column appeared
in the function as a predicate. Validity was applied afterwards, in TypeScript.

That filter removed an archived memory from the **citation list**. It could not
undo what the bound had already done: `chat/actions.ts` asks for **8**, so an
archived memory ranking in the top eight **consumed one of the eight slots**,
and the live memory ranked ninth was never sent. **No downstream code can
recover a row the database did not return** — which is why the requirement
demands eviction *at the bound* as the proof, and why the no-migration
alternative fails in principle rather than in practice.

### Both halves, or a scheduled memory is retrieved

The predicate is the exact negation of `isMemoryInForce`:

| `lifecycle.ts` | SQL |
| --- | --- |
| `archived` when `until <= at` | retrieved when `valid_until > now()` |
| `scheduled` when `from > at` | retrieved when `valid_from <= now()` |

A `valid_until`-only predicate — the shape `phase_2k_memory_undo.sql` uses for
its own, narrower purpose — would still retrieve a **scheduled** memory, one
the product tells the owner is not in use yet. That is the same lie in the
other direction, and it is why the guard asserts the SQL against the TypeScript
rather than against itself.

Entries are deliberately unfiltered: they carry no validity window.

### The TypeScript filter is kept, and is no longer the enforcement

M1's documented rollback is *re-declare the prior definition*. If the
TypeScript filter had been removed in the same change, that rollback would also
silently re-admit archived memories into **citations** — a larger regression
than the displacement it was meant to undo. It costs one indexed lookup over at
most 20 ids.

`resolve-sources.ts` keeps its own check for a different reason, now stated in
the file: retrieval decides what may answer a **new** question; that module
decides what an **already-answered** message may still show, and a memory
archived after the answer was written was legitimately retrieved at the time.

## 3. The re-audit found a live defect the plan did not carry

`2N-KNOWS-003`. The memory detail page resolved provenance in three arms of its
own, and **both non-link arms were false**:

- **`null` printed *"Criada por você" / "Created by you"***. The column is
  `on delete set null`, so a memory whose source entry the owner deleted holds
  `null` — and the page manufactured a positive claim about the origin of
  knowledge out of an absence.
- **An unresolvable id printed *"the originating record no longer exists"***.
  `memories.source_entry_id` is a plain FK to `entries(id)` with **no composite
  `(user_id, id)`**, so a foreign id is storable; under RLS the row simply does
  not come back, and the sentence then asserts the non-existence of a record
  that exists. It is also a probe for whether an entry id is real.

Slice 2N.1 had already written the contract that refuses both, around this
exact table — `ownerAuthored("memories")` is a **type error** — and the memory
page predates it. Both surfaces now derive through `deriveClaimProvenance`, so
removed, foreign, unreadable and never-set are **one arm with no branch that
could separate them**. The three copy strings are **deleted**, not deprecated.

Third, the **list showed no source at all** while already selecting
`source_entry_id`. It now shows one per row.

## 4. Two classifications close by rule, and the rules are executable

**`2N-KNOWS-005` — the epistemic three-way is not representable for a memory.**
`memories` carries no classification column and no interpretation pointer.
`element_classifications` is a jsonb on `entry_interpretations`, classifying the
elements of a *reading of an entry*; a memory is not one of those and holds no
pointer to one. `memories.kind` contains a value spelled `fact` beside
`preference`, `habit`, `goal` and six more — a **category of subject matter**,
not an epistemic level. Rendering it as one would mint a vocabulary out of a
taxonomy that never meant one, which is the move slice 2N.2 refused when it
declined to map `blocker` onto `risk`. What the data *does* substantiate is
origin, and `2N-KNOWS-003` now ships it.

**`2N-IDENTITY-005…007` — merge and duplicate surfacing stay unbuilt**
(`OD-2N-3` A). `-005` and `-006` are refusals this unit keeps; `-007` is a
contract recorded for a future phase and implements nothing.

Both are asserted against schema, generated types and app, **each with a
non-vacuity control** — the `2N-KNOWS-005` scan must still find
`element_classifications` where it does exist, and the merge scan must still
find `confirm_entry_task_candidates` and `undo_operation`. A `not-built-by-rule`
whose only evidence is a sentence is a classification nobody re-checks.

## 5. Proofs

### pgTAP — `phase_2n_validity_aware_retrieval.sql`, 15 assertions

Ran in CI against a **database built from the whole migration chain from
empty**: `phase_2n_validity_aware_retrieval.sql .......... ok`.

The fixture is built to a **strict, controlled ranking**, because the defect
being repaired is *displacement* and displacement is only observable when the
loser is the row that should have been kept:

| row | k | similarity | in force? |
| --- | --- | --- | --- |
| archived | 1 | 1.0000 | no |
| scheduled | 1 | 1.0000 | no |
| **live** | 2 | 0.7071 | **yes** |
| entry | 3 | 0.5774 | n/a |
| boundary-from | 4 | 0.5000 | yes |
| boundary-until | 5 | 0.4472 | no |

`order by similarity desc` **carries no tiebreaker**, and M1 deliberately adds
none — ordering was not the requirement. So the fixture must not create a tie it
then depends on: the live memory is the **unique** highest-scoring in-force row.
A first draft of this suite gave three in-force memories the same vector and
would have flaked; static scrutiny caught it before CI, along with a plan count
of 14 for 15 assertions.

- **Section 4 is the requirement itself.** One slot; the live memory is what
  comes back. **Section 0 asserts the ranking premise directly against the
  table**, so the eviction assertion cannot pass because the archived row merely
  ranked low.
- Both **inclusive boundaries** are exact — a row stamped `valid_until = now()`
  is compared against the identical instant, because `now()` is transaction time.
- Owner isolation re-asserted, with a **positive control on the other side**.

### Mutation controls — six, each failing exactly its own assertion

| mutation | assertion that failed |
| --- | --- |
| drop the `valid_from` half | *uses both halves of the window* |
| apply validity after the bound | *applies validity ahead of the bound* |
| flip the TypeScript archived boundary | *inverts exactly the boundaries `isMemoryInForce` declares* |
| restore `provenanceManual` | *retired the three copy strings* |
| rename the migration without its slice | *creates no migration* **and** *names the allocation and the slice* |
| understate the spend in the plan | *a spend count that matches the tree* |

### Two traps in this unit's own instruments, caught before CI

Both are the same shape, one level apart, and both are worth carrying forward:
**a scan that reads prose finds the thing the prose is about.**

- The migration's verification block searched the function definition for
  `limit` to check ordering — and the body's own comment contained the word,
  so the check would have raised on a correct migration. Narrowed to
  `limit least(`.
- The guard read the **whole migration file**, whose header quotes the offending
  `limit least(…)` clause while explaining the defect. It concluded the bound
  preceded the predicate. Narrowed to the function **body**.

### Recorded, not smoothed: one check in the migration reads stronger than it is

The verification block raises if `valid_from` is absent from the definition.
**That check would have passed against the pre-M1 function**, because
`coalesce(public.memories.valid_from, public.memories.created_at)` already
mentioned the column as an **output projection**. A read against the hosted
project before deploy confirmed it: `reads_valid_from = true`,
`reads_valid_until = false`.

The checks that actually discriminate are the `valid_until is null` one and the
ordering one, and both are correct. This is an accuracy defect in one check's
message, not in the block's verdict, and the precise assertions live in
`phase-2n-knowledge-guard.test.ts`. **It is not worth a migration** — and after
merge and deploy a new migration is a stop condition, not a convenience.

### Hosted — deployed, and the deploy is measured rather than assumed

**Deployed 2026-08-13.** `supabase migration list --linked` reads
`202608130093 | 202608130093 | 202608130093` — **local = remote on the row that
moved**, and **hosted parity is `202608130093`** across **93** migrations.

The function was read on the live project **before and after**, read-only:

| | before | after |
| --- | --- | --- |
| filters `valid_until` ahead of the bound | **false** | **true** |
| filters `valid_from` ahead of the bound | **false** | **true** |
| `validity_precedes_bound` | — | **true** |
| `prosecdef` (SECURITY DEFINER) | false | **false** |
| `authenticated` may EXECUTE | — | **true** |
| definition length | 1358 | **1742** |

### Journeys — `online-phase-2n-knowledge.spec.ts`, **12/12**

Both locales × desktop and mobile (Pixel 7), **`--workers=1`**, in **2.0 min**.
The archive case runs the whole chain: it creates two competing memories,
asserts the **candidate wins the single slot** (the control), archives it
**through the product's own form**, and then asserts the **live memory** is what
one slot returns and that the candidate is absent from the widest bound. Then it
**reloads**, because a badge asserted only after the click could be optimistic
rather than read.

### Regressions — executed, not assumed

| suite | result |
| --- | --- |
| `online-phase-2n-foundations` (2N.0) | **12/12** — including *"the memory listing and its detail withhold the same content"*, which is the masking contract on the exact two surfaces this unit rewrote |
| `online-phase-2n-person` (2N.1) | **14/14** — the shared provenance module, unchanged by this unit and re-proved |
| `online-memories` (G3/UX-10) | **11 passed, 1 failed** — see below |
| `online-phase-2n-project` (2N.2) | **NOT RUN** — see §6 |

### The one failure, and why it is not this unit's

`online-memories.spec.ts:85`, `[mobile]` only:

```
expect((await row.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
Received: 21
```

**It is pre-existing.** It was reproduced by checking out `289f1f8` — the commit
*before* this unit's surface change — rebuilding, and running the same single
test, which failed identically. This unit did not cause it and does not repair
it.

The cause is in `operations.css`: `.list-row-main strong` is `display:block`
at `font-size:14px`, and the anchor wrapping it carries **no sizing rule at
all**. The row's `padding:17px 18px` makes the **row** exceed 44 px while the
**link** — which is the touch target — is 21 px. The assertion was written on
2026-07-31 and the online lane was unrunnable for much of the window since
(SH.4's consent gate, then SH.5's hosted CAPTCHA), so it is very likely this is
the first time it has actually been executed rather than a recent regression.

**Not fixed here, deliberately.** The repair is a rule on `.list-row-main a`,
which every list surface renders — Work, Reminders, People, Projects and
Memories. That is the `2N-MOBILE` family, and this unit's requirements are
`2N-KNOWS`, `2N-CORRECT` and `2N-IDENTITY-005…007`. ADR-112 rejected exactly
this reasoning — *"while we are here" is how a phase acquires scope no one
authorized* — and recorded a remainder with a destination instead.
**Destination: the `2N-MOBILE` family.** The assertion is left failing rather
than weakened, skipped or deleted: it describes a real defect and is doing its
job.

Two assertions in that spec **were** updated, because this unit made them false:
lines 95 and 218 asserted `"Criada por você"` on the memory detail page. Line
218's own comment said *"provenance is honest: this memory has no originating
entry, so it says the owner created it"* — which is the defect, written down. In
that test the owner really had just created the memory, so the string was true
**of that fixture**; the page still may not say it, because it reads a null
column and a null is equally a source the owner deleted. **A claim that happens
to be true is not one the product can substantiate.**

### Zero residue — owner-scoped, with a control that is not vacuous

`npm run verify:online-residue` → **0 fixture accounts** (2 accounts on the
project, both the owner's). Then `npm run test:remote:2n3:cleanup`:

- **7 markers at 0** — four memory strings, two entry strings, and
  `vigenciaphrase`, which would only appear if the pgTAP suite had failed to
  roll back;
- **0 accounts** under each of `codex-2n0-`, `codex-2n1-`, `codex-2n2-`,
  `codex-2n3-`, `codex-memories-`.

**The first pass of this proof was vacuous and was rejected.** Every marker read
zero — and `public.memories` holds **no rows at all** on this project, so zero
was also what a broken probe, a revoked grant or a typo would have returned. So
the script does a round trip instead: it plants a memory under a disposable
account, **asserts the probe finds it (1)**, deletes **only the account**, and
asserts the probe now finds **0**. That second half also proves the thing every
spec's `afterAll` silently relies on and none of them checks — that deleting the
account removes the **data**, not merely the login.

## 6. Honest limits

- **Mobile is a viewport simulation on Pixel 7 metrics, not a device**, and **no
  screen-reader run is claimed.**
- The lane is a **local production build against the hosted Supabase**, not the
  Vercel deployment.
- **No chat journey was run, deliberately.** Proving eviction through the chat
  surface would require an embedding call, and this slice may not spend
  provider budget. It would also be the *weaker* signal — chat reports a
  citation list, which is precisely what `2N-CORRECT-003` refuses as proof. The
  journey calls the RPC directly, as the owner, with a synthetic vector.
- **`match_internal_knowledge` still has no ORDER BY tiebreaker.** Rows with
  exactly equal similarity come back in an arbitrary order, and at the bound
  that decides which one is returned. Pre-existing, unchanged by M1, and out of
  scope — ordering is not what `2N-CORRECT-003` asks about. Recorded because the
  test fixtures had to be designed around it.
- **`online-phase-2n-project` (2N.2, 28 tests) was NOT re-run.** GoTrue answers
  `429 over_request_rate_limit` at around 28 sign-ins, and a re-run costs a ~25
  minute cooldown; this session had already spent 51 across four suites. It was
  the lowest-value of the four — the project page renders no memory surface and
  shares no code this unit changed — but it is **not run**, and that is stated
  rather than implied by an unqualified "regressions pass".
- The generated types declare `p_query_embedding: string` while the product
  passes `number[]`. The type generator maps unknown Postgres types to `string`;
  the runtime accepts both. The journey sends the **array**, matching the
  product, so it exercises the shape chat actually uses.

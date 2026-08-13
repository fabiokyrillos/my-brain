# Phase 2N slice 2N.0 — re-audit against `main` after the Local Day Correction

**This re-audits. It does not implement.** ADR-111 authorizes no Phase 2N work,
and none was done: no 2N requirement was implemented, amended, added or removed,
and no 2N contract was changed. What follows is a reading of slice 2N.0's signed
plan against the `main` the initiative leaves behind, so the owner can decide
what to correct **before** 2N.0 begins.

**Verdict: the 2N.0 plan is still sound in its privacy, bounds and identity
halves, and its time half is now partly obsolete.** Three requirements need
correcting and one stop condition is moot. None of this is a defect in the
planning; it is the expected consequence of a dependency completing.

---

## 1. The gate 2N.1 was waiting on is now open

`OD-2N-13` **B** and `2N-TIME-006` made the timezone initiative a **mandatory
dependency of slice 2N.1**: *"2N.1 does not begin until this initiative is
authorized, executed and merged."*

Authorized by ADR-111, executed in five units, merged. **The gate is satisfied.**
2N.3 was explicitly never gated on it and is unaffected.

## 2. Requirement-by-requirement

| requirement | verdict | why |
|---|---|---|
| `2N-TIME-001` — every dated value routes through `local-day.ts` and carries the owner's zone | **VALID, unchanged** | An obligation on code 2N.0 has not written yet. The initiative makes it cheaper to honour, not unnecessary. |
| `2N-TIME-002` — extend the `2M-TIME-007` guard corpus to this phase's directories | **OBSOLETE AS WRITTEN — needs restating** | See §3.1. |
| `2N-TIME-003` — no fixed offset, no fixed day length, no host-zone reader in this phase's code | **VALID, and now mechanically enforced** | `local-day-correction-guard.test.ts` holds `host-zone-field` at **zero tree-wide**, so 2N.0's directories are covered the moment they exist. |
| `2N-TIME-004` — the four `daily-cycle` exemptions are *not repaired here*; re-state them as residuals and preserve the self-cleaning half | **MOOT — must be marked discharged** | See §3.2. |
| `2N-TIME-005` — enumerate the wider population: 13 call sites across 12 files, *"or the count this phase's re-audit re-derives, whichever is current"* | **SATISFIED, with a corrected population** | See §3.3. |
| `2N-TIME-006` — the repair belongs to a separate initiative, completed before 2N.1 | **SATISFIED** | §1. |

Everything outside `2N-TIME` — `2N-PRIVACY-001…011`, `2N-PERSON-003`,
`2N-PROJECT-006`, `2N-KNOWS-007…008`, `2N-SEC-002`, `2N-SEC-003`,
`2N-IDENTITY-001…004`, `2N-IDENTITY-008…009` — is **untouched by this
initiative** and its planning stands as signed. ADR-110's field taxonomy and
`people.notes` posture are likewise unaffected.

## 3. The three corrections 2N.0 needs before implementation

### 3.1 `2N-TIME-002` — the guard 2N.0 planned to extend has been superseded by a wider one

**What 2N.0 planned.** Extend `src/lib/closeout/phase-2m-fixed-offset-guard.test.ts`'s
**named corpus** with Phase 2N's directories, *"so a new zone-less formatter
cannot be added to them"*, and guard **this phase's directories only**.

**What exists now.** `src/lib/closeout/local-day-correction-guard.test.ts` takes
**`src/` itself** as its corpus — 400+ files — across four families
(`formatter-without-zone`, `host-zone-field`, `utc-day-slice`,
`zone-round-trip`), with `OPEN_OCCURRENCES` **empty** and a per-file budget of
**zero**. Phase 2N's directories are already inside it, and so are directories
Phase 2N has not thought of.

**Why this is not merely redundant but actively worth correcting.** A slice that
adds Phase 2N's directories to a *named* list, next to a tree-wide rule that
already covers them at zero, produces **two guards with different reaches for the
same defect**. The narrower one then looks authoritative to the next author, and
the whole lesson of `2M-TIME-007` — recorded in §59 as *"a guard whose corpus is
a list is a guard that is exactly as wide as somebody remembered to make it"* —
gets re-learned.

**Recommended restatement, for the owner to accept or reject:** `2N-TIME-002`
becomes *"the tree-wide guard's `formatter-without-zone` family remains at zero
after this slice's routes are added, asserted rather than assumed"* — an
obligation 2N.0 discharges by **not regressing** the existing guard, and which
costs it no new guard at all.

**Note.** `phase-2m-fixed-offset-guard.test.ts` still exists and is still the
authority on **fixed offsets and fixed day lengths** over its eight named
surfaces. It is not redundant; only the *corpus-extension* half of `2N-TIME-002`
is.

### 3.2 `2N-TIME-004` — the exemptions it protects no longer exist

`2N-TIME-004` obliges 2N.0 to leave the four `daily-cycle` exemptions unrepaired,
re-state them as residuals, and **preserve the self-cleaning half of that
exemption**.

All four were repaired in **Unit 2** (`entry-review.tsx`, `inbox-item.tsx`,
`needs-attention-item.tsx`, `technical-details.tsx`), and
`HOST_ZONE_FORMATTERS_CARRIED_PAST_CLOSE` was **emptied and retired** — verified
against `main`: the symbol is absent from `phase-2m-fixed-offset-guard.test.ts`.
Phase 2M's carry-past-close debt is discharged.

**A 2N.0 implemented against this requirement as written would be preserving a
list that no longer exists**, and the most likely way to satisfy it literally is
to re-create one. `2N-TIME-004` should be marked **discharged by the initiative**,
with the discharge pointing at Unit 2's merge SHA `1734d34`.

### 3.3 `2N-TIME-005` — the population was materially larger than the estimate

| source | population |
|---|---|
| `2N-TIME-005` as signed | 13 zone-less formatters across 12 files (≈27 call sites with components) |
| the initiative's census, re-derived mechanically against `main` | **17 formatters across 16 files**, plus **14** occurrences in three families the phase audit never looked for — **31 total** |

The requirement anticipated exactly this with *"or the count this phase's
re-audit re-derives, whichever is current"*, so it is **satisfied rather than
violated**. It is recorded because the gap is instructive: the three extra
families (`host-zone-field` ×7, all inside `generateReview`'s period;
`utc-day-slice` ×4; `zone-round-trip` ×3) were invisible to an audit that was
counting *formatters*, and the worst of them was the review-period computation —
which changed **what a review contained**, not merely how a date was printed.

The enumeration is preserved in `LOCAL_DAY_CORRECTION_AUDIT.md` and, more
durably, in the guard itself.

### 3.4 The moot stop condition

2N.0's stop conditions include *"the four `daily-cycle` exemptions turning out to
be load-bearing for a 2N surface"*. There are no exemptions; the condition can no
longer trigger. Its neighbours — any need for a migration, alias reading needing
schema, and `2N-PRIVACY-011`'s removal of `people.notes` needing a migration,
column or new authority — are **unaffected and still live**.

## 4. What 2N.0 no longer has to deliver

2N.0's *Experience delivered* reads: *"Sensitive content stops being printed in
full… **Dates stop being wrong for anyone not living in UTC**… Truncated lists
start saying they are truncated."*

**The middle clause is already delivered**, and now proved to render — on the
deployed application, in two zones on different calendar dates, in both
hemispheres across a DST transition. 2N.0's scope is correspondingly smaller: it
inherits correct dates rather than producing them, and its remaining obligation
is to **not reintroduce** the defect on routes it opens, which the tree-wide
guard enforces for free.

Its `Files` list should drop `phase-2m-fixed-offset-guard.test.ts (corpus
extension)` for the reason in §3.1.

## 5. Does the 2N planning remain valid?

**Yes, with the three corrections above applied first.**

- **Sound and unchanged:** the privacy half (the substance of 2N.0), bounds
  vocabulary, alias reading, identity, the slice ordering, the dependency graph,
  the migration budget (M1/M2/M3 **untouched and still non-transferable**), and
  every non-`2N-TIME` requirement.
- **Needs correcting before implementation:** `2N-TIME-002` restated,
  `2N-TIME-004` marked discharged, `2N-TIME-005` recorded at 31, the moot stop
  condition removed, and the `Files` list amended.
- **Not a re-plan.** These are five edits to one slice's time half, each a direct
  consequence of a dependency completing exactly as designed. Nothing about the
  phase's shape, budget or ordering changes.

**Corrections are the owner's to authorize.** ADR-111 does not permit amending a
signed Phase 2N contract — Decision 8 makes that an explicit **stop condition** —
so this document proposes and does not edit. `PHASE_2N_IMPLEMENTATION_PLAN.md`
and `PHASE_2N_PRD.md` are **unchanged by this initiative**.

## 6. Phase 2O

**Not started, not planned, not re-targeted, and not named here beyond this
line.** A13 continues to guard the roadmap successor.

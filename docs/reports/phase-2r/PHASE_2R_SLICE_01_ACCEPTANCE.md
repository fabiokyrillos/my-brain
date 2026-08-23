# Phase 2R — Slice 2R.1 acceptance record

**The model, the one allocated migration, and the wall clock. No surface.**

- **Authorization:** ADR-133 (implementation, slices 2R.0 … 2R.5) and **ADR-134**
  (the owner's answer to slice 2R.0's stop condition, which unblocked this
  slice).
- **Requirements:** `2R-MODEL-001` … `-009`, `2R-TIME-001` … `-004`
  (13 of 73; `2R-TIME-005` … `-007` land with the second surface in slice 2R.2).
- **Migrations:** **one created — the one allocated.**
  `202608230101_phase_2r_slice_1_reminder_recurrence.sql`. Budget moves to
  **1 allocated · 1 spent · 1 created**. **A second of any kind is a stop
  condition** and is enforced by four separate guards, each naming it.
- **Baseline:** `main` **`f27538465b5acb1b64593021b7a8f918344f2906`** — the
  `main` slice 2R.0 produced — with CI green **3 / 3** on that exact merge SHA
  (run `32620794684`).
- **Hosted writes: none in this slice.** The migration is created and merged
  here; it is **applied** only after CI is green on this slice's own merge SHA,
  and that is recorded separately in `PHASE_2R_SLICE_01_DEPLOYMENT.md`.
- **AI calls: none. BYOK credit spent: none.**
- **Surface: none.** No route, component or rendered control is added.
  `2R-SURFACE-*` is slice 2R.3.

Executed by `supabase/tests/phase_2r_reminder_recurrence.sql` (**76
assertions**), `src/features/reminders/recurrence-rule.test.ts`,
`recurrence-rule-parity.test.ts`, and the guards named in §7.

---

## 1. The re-audit, against the `main` slice 2R.0 produced

| # | Premise | Result at `f275384` |
|---|---|---|
| 1 | `reminders` columns | **12**, unchanged, read from the generated types |
| 2 | Phase 2R migrations tracked on `main` | **none** |
| 3 | total migrations tracked on `main` | **100** |
| 4 | hosted parity | `202608210100`, 100 = 100 |
| 5 | recurrence artifacts anywhere the 2M decision governs | **zero** |
| 6 | the stop condition slice 2R.0 raised | **answered** by ADR-134, option A |

No premise moved. The only commits between slice 2R.0's baseline and this one
are slice 2R.0's own.

---

## 2. `OD-2R-5` — the three signed cases, and the thing that would have shipped

**This is the finding of the slice, and it was measured before a line of the
migration was written.**

Postgres's own `AT TIME ZONE` — the operator any reviewer would read as
obviously correct — **disagrees with two of the three signed cases, in opposite
directions.** Read live on the deployed database:

| case | native `at time zone` | `OD-2R-5` signs for | verdict |
|---|---|---|---|
| `2026-03-08 02:30` America/New_York (**gap**) | `07:30+00` → local **03:30** | the **first valid local instant**, `07:00+00` → local 03:00 | **native is wrong** |
| `2026-11-01 01:30` America/New_York (**overlap**) | `06:30+00` → the **second** occurrence | the **first**, `05:30+00` | **native is wrong** |
| `2026-06-15 09:00` (ordinary) | `13:00+00` | the same | agrees |

A migration built on the native operator would have produced reminders at the
wrong time at every daylight-saving boundary, **with no error anywhere** — which
is the exact failure mode `OD-2R-2` refused `RRULE` for, arriving through a
different door. It would also have passed review.

`private.reminder_resolve_local` implements the signed policy instead. It samples
the offsets a day either side of the wall clock, takes the **earliest**
round-tripping candidate for an ambiguous time, and for a gap binary-scans the
one-shift-wide bracket for the transition instant itself. Both edge cases are
pinned three times over: in the migration's **post-deploy block** (so a wrong
deploy fails at apply time), in the **pgTAP suite** (so it fails in CI from an
empty database), and each paired with an `isnt` against the native answer — so
an assertion cannot survive somebody replacing the resolver with the one-liner.

**The third case, the day-of-month clamp, is in the date predicate rather than
the validator.** *"The 31st"* is accepted as written and resolves to the 28th in
February 2026 and the 30th in April; *"29 February"* resolves to 28 February in a
non-leap year. Refusing 31 at the boundary would have made the intention
unsayable; storing 30 would have rewritten it. Both were rejected in favour of
clamping at the point of use, and the pgTAP suite asserts the clamp is **exact**
— the 27th of February does not match — so a clamp that fired on every day of
the month would fail.

---

## 3. `2R-MODEL-001` … `-003` — the closed set, enforced where it cannot be gone around

The rule is a versioned JSON object in one of **five** shapes: `daily`;
`weekly` on chosen weekdays; `monthlyDay`; `monthlyWeekday` (ordinals 1–4 and
`-1` for *last*); `yearly`.

It is validated **twice, deliberately**, and the two are held identical by a
parity test rather than by intention:

| where | why it must exist there | what it produces |
|---|---|---|
| `private.reminder_rule_is_valid`, called by a **CHECK constraint** | it is the only thing a caller going around every Server Action cannot avoid | a `check_violation` |
| `parseRecurrenceRule` (`recurrence-rule.ts`) | `2R-MODEL-002` asks for a **named reason** the surface can translate, and a constraint violation is not one | `unknown-version` · `unknown-frequency` · `not-an-object` · `malformed` |

**Two validators for one rule is the shape of the defect slice 2R.0 reported.**
Phase 2R could not answer `2R-TZ-SECOND-AUTHORITY` and then quietly create
another instance of it, so `recurrence-rule-parity.test.ts` reads the
frequencies, the per-frequency key sets, the version literal, the ordinals and
the numeric bounds **out of the migration's own text** and asserts them against
the TypeScript union. A frequency added to one side and not the other fails.

`2R-MODEL-003`'s version gate runs **before** the shape check, so a future
version 2 is refused as *"newer than this build"* rather than as *"malformed"*.
That distinction costs three lines now and is unrecoverable later.

**Refused, executed rather than argued:** an unknown version · an unknown
frequency · an extra key · a missing key · an empty, duplicated, descending or
out-of-range weekday list · day 0, day 32, a fractional day · month 13 · a fifth
ordinal · a scalar · an array. Sixteen refusals in TypeScript, eleven in SQL,
and one driven as a real insert that the CHECK constraint rejects.

### A gap in the signed set, recorded rather than closed

PRD §1's motivation names *"a cada trimestre"*. **The signed set cannot express
it** — there is no interval field, because `OD-2R-2` enumerated five patterns and
none of them has one. A test asserts that a rule carrying `interval` is
**refused**, so the gap is pinned rather than left to be discovered.

This is reported, not fixed. Adding an interval would widen a closed set the
owner signed, and `OD-2R-2`'s whole value is that the set is closed.
**Destination: the owner**, as a possible `version: 2` of the rule format —
which the version gate already makes addable without a migration.

---

## 4. `2R-MODEL-005` … `-007` — one occurrence, and the next one

**Exactly one concrete occurrence exists at a time, enforced by the database.**
A partial unique index on `(series_id) where detached_at is null and status =
'scheduled'` makes a second live occurrence impossible; a second unique index on
`(series_id, series_sequence)` makes materialisation idempotent by sequence. The
pgTAP suite proves both by *attempting* the second insert and catching the
`unique_violation` — the trigger's `on conflict do nothing` is a consequence of
the constraints, not a substitute for them.

**Completing an occurrence materialises the next, and the caller does not know
it.** Materialisation is an `after update` trigger on `public.reminders`, which
is the only place that sees **both** ways an occurrence completes: the hourly
heartbeat stamping `sent`, and the owner cancelling through
`apply_reminder_command_v1`. Putting it in either caller would have meant the
other did not do it — and teaching `run_user_heartbeat` about series is exactly
what `OD-2R-3` option A was signed to avoid.

**Proved by execution against a real Postgres, before the file was pushed:**
completing occurrence 1 leaves the series with **2** rows, the live one at
sequence **2** and in the future; a second terminal write to the completed row
materialises **nothing**.

### The skip-forward, stated as a decision

The next occurrence is the rule's first instant after
`greatest(the completed occurrence, now())`.

For an occurrence completing on time those are the same value, so
`2R-MODEL-006`'s *"at the rule's next instant"* holds exactly. For a series
nobody processed for a week they are not, and the alternative — the strict next
instant — would deliver last Tuesday's reminder today and Wednesday's tomorrow,
**dripping a stale backlog at the daily cap's pace for as long as the outage
lasted**. `2R-NOTIFY-005` forbids the burst; this forbids the drip as well.

Both directions are asserted in pgTAP, so the choice cannot be reverted by
accident: a week-late occurrence produces a next instant that is **after now()**
and **within two days**, which a "skip past the whole rule" bug would also fail.

---

## 5. `2R-MODEL-004` — a reminder without a rule is unchanged, asserted as an equality

The pgTAP suite creates an ordinary reminder, completes it, and asserts that
**nothing was materialised** and that its `series_sequence` is `null` rather than
zero. The five existing reminder commands are unchanged and their deployed
`kind` set is re-asserted as exactly five.

---

## 6. `2R-MODEL-008` / `2R-TRUST-005` — ownership and authority

`public.reminder_series` is **stricter than `public.reminders`**: RLS enabled
**and forced**, one policy (`reminder_series_select_own`), and `authenticated`
granted **SELECT and nothing else**. There is no insert, update or delete grant
and no delete policy for anyone — ending a series is a `status`, never a
removal, which is what `2R-SERIES-005` means.

Every write goes through `create_reminder_series_v1` or
`apply_reminder_series_command_v1`: `security definer`, `search_path = ''`,
validating against `auth.uid()`, idempotent by operation key, and refusing a
reused key carrying a **different** request rather than applying it.

**The stranger's series provably exists before it is probed**, so the ownership
assertions are not satisfiable by an empty database: it is inserted, counted as
2 by a privileged reader, and then reads as 1 to the owner. A command against it
raises `Series not found` — a foreign series is indistinguishable from a missing
one — and a direct `insert` as `authenticated` raises `insufficient_privilege`.

---

## 7. `2R-MODEL-009` and `2R-TRUST-004` — the destination is exclusive

The migration's own post-deploy block refuses the deploy if:

- `run_user_heartbeat` no longer carries its advisory lock, its daily cap or its
  24-hour cooldown;
- `authenticated` has gained `UPDATE` or `DELETE` on `public.reminders`;
- `reminder_series` has granted `authenticated` anything but `SELECT`;
- RLS on the new table is not enabled **and** forced;
- either new operation lacks a registered undo handler;
- **or any of the three `OD-2R-5` cases answers something other than what was
  signed.**

The pgTAP suite re-asserts the heartbeat's clauses from an empty database and
adds one more: the deployed body mentions neither `series_id` nor
`reminder_series`. `OD-2R-3` option A was chosen so the heartbeat would not have
to change, and that is now a checkable property rather than an intention.

### Why the whole 2R.2 surface is in this migration

Slice 2R.2 delivers occurrence-versus-series semantics and their undo, and the
plan gives it **no migration**. So every database object 2R.2 needs had to exist
here or it could never exist: the series command boundary, both undo handlers,
and the registry rows. Shipping the table now and its commands "later" would
have spent the allocation on half the model and then discovered the other half
needed a second one — the exact stop condition the budget exists to make visible.

`2R-SERIES-*` is **not** classified by this slice. The database contract is in
place and exercised; the semantics, the surface and the undo journeys are 2R.2's
to prove.

---

## 8. What this slice changed outside its own files, and why each was necessary

A new migration is visible to thirty-one assertions across nineteen files. Every
one was a guard correctly noticing a real change, and every one was **moved,
never loosened**:

| what | how many | treatment |
|---|---|---|
| chain-head pins (`toHaveLength(100)`, the head filename) | 9 | moved to 101 with a comment naming ADR-132 D8 / ADR-133 D3, in this commit — the convention every prior phase followed |
| per-phase budget accounting | 4 | Phase 2R counted **explicitly** as one, so an *unattributed* migration still fails the total rather than hiding inside a bumped number |
| the closed `reminders` column list, in two guards | 2 | grown from 12 to 15, still closed, and the two files now assert **each other's** list so one cannot move without the other |
| the 2M recurrence artifact scan | 1 | **narrowed, not silenced** — see below |
| history vocabulary | 4 | four new audit action types and one entity type given copy in both locales |
| the owner-scoped table partition and the privacy enumeration | 4 | `reminder_series` classified: excused from the 2F fixture sweep with a cascade anchor, and **exported and deleted** with the reminders it produces |
| `SECURITY.md` parity | 1 | the migration described in full, including everything it does not touch |

### The 2M guard, narrowed rather than silenced

`phase-2m-recurrence-guard.test.ts` forbade every recurrence implementation shape
repository-wide. ADR-132 Decision 1 lifted that **strictly for reminders**, so
the patterns are now **split**:

- **task shapes** (`task_series`, `task_occurrences`, `is_recurring`) are scanned
  **everywhere, with no exemption at all** — not even in the files the lift
  authorizes;
- **neutral shapes** are exempt only in an **enumerated** twelve-file allowlist.

A control proves the split is real: a fixture at an allowlisted path carrying
**both** kinds is reported for the task shape and not for the neutral one, in the
same run. Another proves the neutral shapes still fire under `features/tasks/`
and `features/calendar/`. The allowlist is asserted as a closed list and
asserted to contain no task or calendar path and exactly one migration.

**`OD-2R-6` is therefore enforced mechanically, not remembered:** recurring tasks
cannot be started by this phase, because the half of the guard that would catch
them has nothing to widen.

### Four defects found before pushing, by rehearsal rather than by CI

Each would have cost a CI cycle:

1. **`extensions.digest`, not `pg_catalog.digest`.** Caught by reading migration
   064's idiom rather than assuming the schema.
2. **`auth.users` carries an `on_auth_user_created` trigger that writes the
   profile row.** The pgTAP fixture inserted profiles explicitly and collided on
   `profiles_pkey`. Found by running the fixture against a real Postgres.
3. **The pgTAP plan said 66; the sections hold 76.** Counted mechanically
   afterwards rather than by eye.
4. **A comment naming another phase's column tripped that phase's own closed-list
   guard.** Reworded, rather than widening `phase-2q-foundation.test.ts` — an
   enforcer must not be defeated by a recorder.

Plus four fragilities in this slice's own test file, found by re-reading it
adversarially: a `union all … limit 1` with no guaranteed order; a `VOLATILE`
function in an `UPDATE … WHERE` that could observe its own effects; a
`not like '%series%'` that would have broken on `generate_series`; and an
`edit_future` scan starting a day too late to mean *"starting today"*.

**Every hosted rehearsal ran inside `begin; … rollback;`, and residue was proved
zero afterwards on seven probes** — users, profiles, reminders, the table, the
three columns, the private functions and the trigger count — with the probe
itself shown sighted in the same statement.

---

## 9. What this slice deliberately did not do

No surface, no route, no component. No second migration. **No hosted apply** —
that is the next step and its own record. No change to the heartbeat, quiet
hours, the daily cap, the 24-hour cooldown or the per-user lock. No change to
any existing grant, policy, retention rule or authority. No recurring tasks and
no `RRULE`. No AI call and no BYOK credit. Signup stays closed and the rollout
gate is untouched. `2P-ACCESS-005` stays **NOT EXECUTED — OWNER WAIVED**.

---

## 10. Classification

| Requirement | Class | Evidence |
|---|---|---|
| `2R-MODEL-001` | **built** | §3, §6 — created through the validated boundary; pgTAP §4 |
| `2R-MODEL-002` | **built** | §3 — sixteen refusals in TypeScript, eleven in SQL, one driven at the CHECK constraint |
| `2R-MODEL-003` | **built** | §3 — the version gate runs before the shape check, refusing `unknown-version` |
| `2R-MODEL-004` | **baseline** | §5 — asserted as an equality; **no change was made** to the non-recurring path |
| `2R-MODEL-005` | **built** | §4 — a partial unique index, proved by a refused second insert |
| `2R-MODEL-006` | **built** | §4 — executed against real Postgres; the skip-forward reading is recorded as a decision |
| `2R-MODEL-007` | **built** | §4 — idempotent **by the database**, proved by attempting the duplicate |
| `2R-MODEL-008` | **built** | §6 — two owners, the stranger's row proved to exist before it is probed |
| `2R-MODEL-009` | **built** | §7 — the post-deploy block refuses a deploy that moved anything else |
| `2R-TIME-001` | **built** | §2 — wall clock preserved across a transition; the instant moves |
| `2R-TIME-002` | **built** | §2 — spring-forward, pinned three times and paired against the native answer |
| `2R-TIME-003` | **built** | §2 — fall-back, same treatment |
| `2R-TIME-004` | **built** | §2 — the clamp, asserted exact rather than approximate |

**Thirteen classified here; nineteen of seventy-three cumulatively.**

**No stop condition was reached in this slice.** One migration was created, and
it is the one that was allocated.

# Phase 2S — Slice 2S.1 acceptance record

**The owner can tell the Brain to be quiet, the Brain stops repeating itself
forever, and a notice points at its subject.**

- **Authorization:** implementation of slices 2S.0 … 2S.4, **ADR-138**
  (2026-08-24). The one migration is spent under **ADR-138 Decision 3**, which
  allocates it to **slice 2S.1 and nowhere else**.
- **Requirements:** `2S-SILENCE-001` … `-006`, `-009`, `-010`; `2S-CADENCE-001`
  … `-008`; `2S-REACH-001` … `-005` (21 of 99).
- **Migration:** **the one allocated, created.** Budget moves **1 allocated · 1
  spent · 1 created · 0 applied** — hosted application is a separate gate and
  has its own record below.
- **Baseline:** `main` **`14753eea3d91c2d0a82a02cdcd23420239961117`**, the tree
  slice 2S.0 produced, CI green **3/3** on that exact SHA. Worktree clean, zero
  open pull requests, signup closed, rollout **25 pass · 3 fail · 2
  owner-signature**.
- **Hosted writes: none in this record.** Every hosted statement was a `select`.
- **AI calls: none. BYOK credit spent: none. Push: not resumed, not repaired,
  not claimed.**

Executed by `supabase/tests/phase_2s_notification_suppressions.sql` (**59**
assertions, every cadence one of which **calls** `run_user_heartbeat`) and
`src/lib/closeout/phase-2s-suppression-guard.test.ts` (**17** assertions about
the source).

**The first CI run failed with seven failures across three suites, every one
real.** §8b records each with its cause; one was a **security defect** in this
slice's own migration.

**No stop condition was reached.**

---

## 1. The design is against what slice 2S.0 measured, not against the PRD

Slice 2S.0 found the deployed suppression has **three layers**, where the PRD and
handoff §128 both quote one:

| | clause | bound |
|---|---|---|
| **(A)** | exact `dedupe_key` match | **no time bound** |
| **(B)** | the 24-hour cooldown | scoped to `task_overdue` and `task_stale` only |
| **(C)** | `on conflict (user_id, dedupe_key) do nothing` | a unique constraint |

A task key carries the owner's **local date**, so tomorrow's key differs and (A)
does not stop it. A reminder key does not, so (A) makes a reminder notice
permanently once-only.

**So a backoff that merely widened (B) would still be defeated by the date inside
the key, and one that changed the key would collide with (A) and (C).** This
migration therefore leaves (A), (B) and (C) exactly as they are and adds two new
clauses beside them.

### The safety argument, and why it is a check rather than a sentence

**The 24-hour cooldown is byte-identical.** Not equivalent, not "preserved in
spirit" — the same characters. `phase-2s-suppression-guard.test.ts` lifts the
clause from **both** `202608040073` and `202608240102` and compares them, with
the assertion against the older file acting as the control: if the literal were
wrong, the newer assertion would pass vacuously.

**Both new clauses are conjunctions.** They can only ever *remove* a candidate,
so **no input exists on which the product speaks more than it did before**. This
is asserted structurally: the `pending` CTE contains no top-level `or`, because a
new clause introduced with one could admit a candidate the old function withheld
and every ladder test would still pass.

### The ladder — `OD-2S-4` B

| notices since the subject last changed | required gap |
|---|---|
| 0 | none — the 24-hour floor still applies |
| 1 | **1 day** |
| 2 | **3 days** |
| 3 | **7 days** |
| ≥ 4 | **never** |

A subject left untouched produces **at most four notices**, at roughly day 0, 1,
4 and 11, and then falls silent. `else false` is the ceiling, and it is what
makes `2S-CADENCE-002` provable: the count only grows, so the recursion
terminates.

**The reset is the anchor.** The count is of notices sent **since
`subject_changed_at`**, so touching the task returns the cadence to its first
interval — derived entirely from data the ledger already holds, which is what
`OD-2S-4`'s recommendation required.

---

## 2. The state — `OD-2S-1` A

`public.notification_suppressions`, owner-scoped, polymorphic, expirable, with a
reason.

**The columns are named `entity_type`/`entity_id` and that is reuse, not taste.**
`public.validate_polymorphic_entity_owner()` reads `new.user_id`,
`new.entity_type` and `new.entity_id` **by name**, and `public.entity_is_owned`
already resolves both `task` and `reminder`. Naming them `subject_*` would have
meant writing a **second** ownership validator for a question this repository
already answers. **Stop condition 8 — "polymorphic ownership cannot be proved by
trigger" — is answered by an existing, proven mechanism rather than a new one.**

### `scope` is what makes `2S-SILENCE-002` have three refusals instead of one

*Not now* and *never* are different sentences, not one sentence with a nullable
field. So:

| refusal | detail |
|---|---|
| a temporary suppression with **no expiry** | `SUPPRESSION_UNBOUNDED` |
| a temporary one with a **past** expiry | `SUPPRESSION_PAST_DATED` |
| a **permanent** one carrying an expiry | `SUPPRESSION_MALFORMED` |
| no reason | `SUPPRESSION_REASON_MISSING` |
| an unknown scope | `SUPPRESSION_SCOPE_UNSUPPORTED` |
| a subject the caller does not own | `SUPPRESSION_SUBJECT_NOT_OWNED` |

All six are refused **by name in the RPC**, and the pgTAP asserts that **none of
the six reached storage** — read as `postgres` with no role, so a zero is a real
zero rather than one RLS produced. The table's CHECK constraint would catch two
of them; it is the last line of defence rather than the first, because a
constraint violation is not a sentence an owner can act on.

### Boundary

- RLS **enabled and forced**; four policies, **every one naming `authenticated`**
  — a policy with no role list is PUBLIC, and a definer writer passes FORCE RLS
  through it.
- `anon`: **nothing**. `service_role`: **nothing**, by an explicit revoke — the
  heartbeat reads suppressions as a definer running as its owner, so it never
  needed a role grant. See §8b: omitting a grant would have left four privileges
  in place, one of them `TRUNCATE`.
- `2S-TRUST-006` **structurally**: no `title`, `body`, `content` or `message`
  column exists, asserted from `information_schema`.

### A vocabulary that was nearly wrong

The first draft of `actor` allowed `('user','agent','operator')`. The deployed
`audit_logs_actor_check` allows `('user','agent','system')` — and these rows are
written into `audit_logs`. That would have been a **fourth** actor vocabulary
disagreeing with the audit trail it feeds. Read from the catalog and aligned
before it shipped.

---

## 3. The undo is real, and the ledger is closed by the handler

`private.undo_suppress_notification_subject_v1` handles both shapes: **delete**
the row when nothing was replaced, **restore field for field** when something
was — including `created_at`, so the prior state is exact rather than
approximate.

**The handler sets `status = 'undone'`, and that is asserted separately from the
undo's own return value.** `2R-UNDO-LEDGER-NOT-CLOSED` is a live example in this
repository of a handler that reports success and leaves the operation looking
available forever; `2S-TRUST-013` reads the **ledger row** as well as the
subject, so this file cannot repeat it.

---

## 4. The destination — `OD-2S-3`, the `2S-REACH` half

| type | before | after |
|---|---|---|
| `task_overdue` | `/{locale}/app/tasks` | **`/{locale}/app/work/{task.id}`** |
| `task_stale` | `/{locale}/app/tasks` | **`/{locale}/app/work/{task.id}`** |
| `reminder` | `/{locale}/app/reminders` | **unchanged** |

**`2S-REACH-002` is `baseline`, not `built`.** Slice 2S.0 read the deployed
function and found the destination was **already locale-correct** — the PRD's
*"hardcoded to `/pt-BR/app/tasks`"* was wrong about the locale and right about
the list. This phase preserves the property rather than building it, and
`2S-CLOSE-004` exists precisely so that direction stays sayable.

**The reminder destination is a recorded refusal, not an omission.** There is no
`/app/reminders/[reminderId]` route in this repository, so a per-reminder
destination would be a link to nothing. The guard asserts the route directory
contains no dynamic segment, so **inventing one later must come through this
assertion first**.

**`2S-REACH-005` is exercised rather than assumed:** no `reminder` notification
has ever existed in this product. The suite produces the first one and reads its
destination.

### `2S-REACH-004`, and the tension it creates with this slice's exclusions

The plan says slice 2S.1 **excludes any surface change**, and `2S-REACH-004` is
nonetheless assigned to it. **That tension is named rather than resolved
silently**, because a slice that quietly widened or quietly narrowed would be
worse either way.

What was built: `TaskDetailSurface`'s `notFound()` becomes a named state — *"this
task is no longer here"* — with a way back to Work. What was **not** built: any
change to the notification surface, which stays untouched until slice 2S.2.

Two properties were preserved deliberately:

1. **Indistinguishability.** The comment on that `notFound()` recorded a real
   security property: a task owned by someone else is indistinguishable from one
   that does not exist. The replacement returns the **same** thing in both cases,
   so nothing is disclosed that the 404 kept back. The improvement is the way
   out, not the disclosure.
2. **The state is `empty`, not `error_terminal`.** Nothing failed and nothing of
   the reader's was lost. `error_terminal` carries the `risk` tone and an
   assertive announcement, so using it would have told the reader something had
   gone wrong when the honest answer is that the thing is simply not there.

**And it is not hypothetical.** Slice 2S.0 measured **three `task_overdue`
notices in the deployed database whose subject no longer exists**. They were
harmless while every notice pointed at a list. This slice points a notice at its
subject — so the fallback ships in the same change that creates the need for it.

---

## 5. What did not change, re-proved by calling the function

Every one of these is asserted by **calling** `run_user_heartbeat` and reading
the rows it wrote. Slice 2R.1 matched substrings against `prosrc` and proved
nothing about behaviour; slice 2R.4 called the function twenty-six times and
found a real defect in its own assertion.

| property | how it was proved |
|---|---|
| the 24-hour cooldown | a prior notice 12 hours old produces silence; 25 hours produces a notice |
| quiet hours | the window is moved over `now()` and the same candidate falls silent, with the positive control first |
| the daily cap | three notices inside the local day leave zero slots and nothing is created |
| one owner's suppression never silences another's batch | a batch with a suppressed owner and an unsuppressed one delivers to the second |
| one user's failure does not block the batch | an unknown user raises `P0002`, which is the failure the batch absorbs |
| the rank ordering | a day holding **both** a due reminder and a stale nudge with the cap set to **one**: the reminder survives. Then the cap is raised and the stale nudge appears, so the first result cannot be explained by the stale nudge having been absent |

Separately, the ten clauses `phase-2r-foundation.test.ts` pins — the advisory
lock, both quiet-hour defaults, the cap, the slot arithmetic, the truncation, the
cooldown, its task-type scope, the important-reminder admission and the reminder
key — **now assert against the new definition and pass**. That pin moved rather
than being deleted, which is what turns *"the rules did not change"* into a
check.

---

## 6. Two defects found in this slice's own tests, before CI saw them

Both are recorded because the method that found them is the point.

**1 — a fixture that would have been silently overwritten.** The suite's first
draft backdated `tasks.updated_at` with an `UPDATE`. `tasks_updated_at` is a
`BEFORE UPDATE` trigger running `set_updated_at()`, so the value would have
become `now()` — which is not older than the seven-day staleness threshold, so
the task would have stopped being a candidate at all and **every assertion after
it would have failed for a reason that had nothing to do with the cadence**. Read
from the deployed catalog before the suite ran, not discovered in CI. The reset
is now proved by moving the **notices** across the anchor rather than the anchor
across the notices, which isolates exactly one variable.

**2 — an assertion satisfied by its own explanation.** The guard checked the
ladder's ceiling with `toContain("else false")`. A mutation control that
**deleted the ceiling from the code still passed**, because the phrase also
appears in the comment above it explaining what the ceiling is for. `pendingClause`
now strips SQL comments before any assertion reads it.

**A third, in the anchor arithmetic.** The task was first anchored at 60 days,
which put the *"a year later it is still silent"* case's notices **before** the
anchor — they would not have counted, the function would have spoken, and the
assertion would have failed while the product behaved correctly. The anchor is
400 days and the number is load-bearing.

---

## 7. Registrations the new table required, each a real obligation

| guard | what it demanded | answer |
|---|---|---|
| `privacy-enumeration-guard` | a category or a withholding | **counted and exported** with the notices it silences — it is the owner's own data and holds no notification content |
| `phase-2f-cleanup` | scanned or excused | **excused**, with the cascade anchor `202608240102:80` |
| `history/vocabulary` | copy in both locales | `notification_suppressed` → *"silenciou os avisos"* / *"silenced the notices"*, category **`lifecycle`** by the same reasoning the reminder transitions use |
| `sql-grammar-guard` | **a real defect it caught** | see below |

**The grammar guard caught a real defect, and my reasoning before it was wrong.**
The migration used `pg_catalog.coalesce` and `pg_catalog.nullif`. I had checked
that the repository "uses" those spellings and treated that as precedent — but
the guard allowlists **exactly two historical instances** and says *"superseded
and never to grow"*, which is the opposite of precedent. `COALESCE` and `NULLIF`
are **parser constructs**, not functions in `pg_catalog`, so the qualified
spelling fails; and they are resolved by the parser, so they are safe bare even
under `search_path = ''`. A hosted `select coalesce(1,2)` had confirmed only that
the **bare** form works — it never tested the qualified one.

---

## 8. Every chain pin moved deliberately, and none was deleted

The 102nd migration tripped **fifteen assertions across thirteen files**, which is
the repository working as designed. Each was moved in this commit, visibly, with
its own note:

`onboarding-guard` · `phase-2n-conflict-guard` · `phase-2n-declarations` ·
`phase-2n-library-guard` · `phase-2n-relations-guard` · `phase-2o-declarations` ·
`phase-2p-declarations` · `phase-2p-foundation-guard` · `phase-2r-declarations` ·
`phase-2r-foundation` · `egc-invariants` · `post-2h-retention-correction` ·
`phase-2s-declarations` · `phase-2s-foundation` · `phase-2f-documentation`.

**Two were inverted rather than bumped**, because a flat count that has to be
edited on every later spend stops meaning anything:

- `phase-2s-declarations` now pins the phase's migration **by name**, so a second
  Phase 2S migration fails here rather than being disapproved of in prose;
- `phase-2s-foundation` now asserts what slice 2S.0 actually claimed — that
  **it** spent nothing — instead of a whole-tree count that stopped being 2S.0's
  business the moment 2S.1 landed.

---

## 8b. What CI found that nothing local could, and one of it was a security defect

The `database and journey` job is the only place in this environment that applies
the chain to an empty database and runs pgTAP — there is no local Docker. It
failed on the first attempt with **seven failures across three suites**, and
every one was real. None was a flake and none was worked around.

**1 — the undo handler was `SECURITY DEFINER`, and that is a security defect.**
`undo_operation_routing.sql` refuses a definer handler by name: the router is
already definer, so a definer handler gains **nothing** and turns any accidental
grant on it into a cross-tenant write. All twenty existing handlers are invoker
with an empty `search_path`; this is the twenty-first and it now matches. The
guard for it now lives in **two** places — the routing suite that caught it, and
this slice's own guard, so the next handler is caught by the file that
introduces it.

**2 — omitting a grant is not the same as withholding one.** The migration
granted `service_role` only `SELECT`; the deployed posture came back
`REFERENCES, SELECT, TRIGGER, TRUNCATE`. `alter default privileges` in this
schema hands those four to `service_role` on **every** new table, and one of them
is destructive. The migration now **revokes explicitly**, and `service_role` holds
**nothing** — the heartbeat reads suppressions as a definer running as its owner
and never needed a role grant. This is the posture `public.reminder_series`, the
newest table in the chain, already holds.

**3 — a fixture of mine silenced the subject a later assertion needed.** Section
2 plants a permanent suppression on the **stranger's** task to prove the
ownership boundary. It was still live in section 7, so `2S-CADENCE-006` asked the
stranger's heartbeat to speak about a subject this suite had itself silenced —
and failed for that reason rather than the one it was written to test. **A
fixture that survives into a later section is a fixture answering a question
nobody asked.** It is now lifted, in the open, where it stops being needed.

**4 — `2S-CADENCE-007` was testing the wrong thing, and the way it failed is
worth keeping.** It called the heartbeat for a **non-existent** user and expected
`P0002`. CI answered `23503 heartbeat_runs_user_id_fkey`. The function *does*
raise `P0002`; its own `exception when others` handler catches it; and the
handler's insert into `heartbeat_runs` then violates the foreign key — so what
the caller sees comes from the **failure logger**, not from the check. Harmless
in production, because `run_all_heartbeats` only iterates rows of `auth.users` —
but it means an absent user is **not a model** of the failure this requirement is
about. The test now does what slice 2R.4 did: gives a **real** owner an
unresolvable timezone, runs the whole batch through `run_all_heartbeats()`, and
asserts the batch survives, the failure is **recorded**, and the failing owner
produced nothing.

**5 — the account-deletion cascade drill demanded a row.** Its populator must
plant one row in **every** runtime-enumerated user-owned table, by design, so
that a table added later fails by name. It did. The populator now plants a
suppression — reusing the task it already created for that owner, because the
subject is polymorphic and a fabricated uuid would be refused by the trigger,
making the drill fail while claiming to own something it did not.

**One correction to this record's own earlier claim.** §2 previously said
`service_role` holds `SELECT`. It holds **nothing**, and the sentence is
corrected forward rather than left standing.

---

## 8c. What the SECOND CI found: a central integration this slice never made

The first CI run found seven defects **in this slice**. The second found none —
and failed anyway, on a file this slice never opened.

Run `32810864199`: `application` **green**, `edge worker` **green**, `database
and journey` **red** on `Run the pgTAP suite (post-revocation posture)`. Files=73,
Tests=2819, and **exactly one** assertion failed:

> `Failed test 4: "exactly the thirteen RPC-closed tables carry zero
> service_role grants -- the chain's revoke carve-out can neither shrink nor
> grow silently"`

The log named the whole set in both directions, which is why this was diagnosed
rather than guessed at:

- `have` — fourteen names, including `notification_suppressions`.
- `want` — the same fourteen **minus** `notification_suppressions`.

**Nothing left the set. Exactly one thing entered it, and it was supposed to.**

### The defect is not in the migration — it is that the migration was correct

`supabase/tests/signup_hardening_grant_census.sql`, Property 3, derives its set
at run time: every `public` BASE TABLE carrying **zero** `service_role` entries in
`role_table_grants`. Membership is a **consequence** of what a migration revoked,
never a declaration. Fix #2 of §8b made this slice revoke every `service_role`
privilege on `notification_suppressions` — and that fix, correctly applied, moved
the table into a closed set whose one census in this repository was still pinned
at thirteen.

Four things were checked by name before a single character was edited, because
`13 → 14` is exactly the edit that would have hidden a real regression:

| question | answer |
|---|---|
| how is the set derived? | at run time from `role_table_grants`; never declared |
| is `notification_suppressions` legitimately the fourteenth? | yes — the migration revokes **all** from `public, anon, service_role` |
| does it belong to the same RPC-closure contract? | yes — its only writer is `suppress_notification_subject`; the heartbeat reads it as a definer running as its owner and needs no grant. This is `reminder_series`'s posture exactly, which the migration cites by name |
| did any earlier table leave the set? | **no** — proved twice: `want ⊂ have` in the CI log, and the branch diff adds grants/revokes for **only** the new table and its two functions, touching no pre-existing grant |

### The repair, and why it is not `13 → 14`

The census now enumerates the set **row by row** in a `rpc_closed` CTE, and the
tally in the description is `count(*)` over those rows, interpolated by `format`.
The pre-joined literal and the hand-written numeral were **two places holding one
truth**, and they disagreed for a whole CI run without either being wrong on its
own terms. A new table now needs one edit — its own name — and the number follows.

The assertion is still **exact equality in both directions**. "At least fourteen"
would pass while a historical table quietly lost its closure, which is the precise
failure this census exists to catch.

### The census only runs where this machine cannot reach

Property 3 runs under pgTAP, which needs a Postgres that no local Docker exists to
start. So the same membership is now also asserted by
`phase-2s-suppression-guard.test.ts`, which reads the census file itself and runs
on every `npm test` — by name, in both directions, with the thirteen frozen
verbatim from this run's `want` line. The next slice that closes a table to
`service_role` is told to update the census **before** a CI cycle tells it.

The syntax of the new CTE was executed against a real Postgres before being
committed — read-only, against the hosted project's `information_schema`. It
returned the derived description `exactly the 14 RPC-closed tables …` and, from
the hosted database, the **thirteen**: independent confirmation that the migration
is not applied there.

**A second correction to this record's own subject.** §8b corrected this record's
claim that `service_role` holds `SELECT`. The migration's **own comment** still
carried the superseded sentence — "`service_role` is granted SELECT alone" — two
lines above the sentence saying it is granted nothing, and four above the revoke
that grants it nothing. The code was right and the comment argued with itself.
The stale sentence is removed. It changes no behaviour, and it is the kind of
line a future reader would have believed.

---

## 9. Controls

**Eight mutation controls on the new guard, eight failures:**

| control | result |
|---|---|
| widen the 24-hour cooldown to 48 hours | **fails** |
| remove the explicit `service_role` revoke | **fails** |
| make the undo handler `security definer` | **fails** |
| introduce a top-level disjunction in `pending` | **fails** |
| delete the ladder's terminal case | **fails** — after the comment-stripping fix; it passed before |
| point a task branch back at the list | **fails** |
| drop the table from the privacy enumeration | **fails** |
| rename `entity_type`, breaking the reused validator | **fails** |

Two earlier attempts at these controls **did not perform their mutation** — a
scratch path that does not exist on Windows, and `\r\n` replacements against a
file that `.gitattributes` pins to `eol=lf`. Both reported "15 passed", which
proved nothing. Recorded rather than quietly redone.

**Five further controls on the census guard added in §8c, five failures.** Each
mutation was verified to have changed the file on disk before the suite was run,
because a control that does not perform its mutation reports a pass and proves
nothing:

| control | result |
|---|---|
| remove `notification_suppressions` from the closed list | **fails** — *"the table this slice closed to service_role is missing from the census"* |
| remove a historical table (`reminder_series`) from the list | **fails** — *"a table left the RPC-closed set without a slice arguing for it: `reminder_series`"* |
| add an unexpected table (`entries`) to the list | **fails** — *"an unexpected table entered the RPC-closed set: `entries`"* |
| plant `grant select … to service_role` in the migration | **fails** — *"a service_role grant would remove this table from the census set"* |
| restate the tally as a hand-written numeral | **fails** — the regression that caused §8c, now refused |

Each failed on the **intended** assertion and named its subject; each file was
restored and re-verified byte-identical afterwards.

---

## 10. Gates

| gate | result |
|---|---|
| typecheck | **zero** |
| lint | **6 errors, 6 warnings — identical to baseline**, all errors inside gitignored `.worktrees/` |
| `npm test` | **9421 passing, ZERO failing** |
| production build | passes |
| pgTAP, `db lint`, whole chain from empty | **CI** — no local Docker in this environment |

---

## 11. Hosted application

**PERFORMED — 2026-08-25.** Every gate in ADR-138 Decision 3's chain returned
what it had to, in order, and none was skipped. Parity advanced by **exactly
one**: `202608230101` → `202608240102`, with **102 local = 102 hosted**.

The owner-scoped proof ran against the two real owners already in the project,
created no user, task or reminder, and was **rolled back by an unconditional
`RAISE` rather than cleaned up** — so residue is zero by construction. All three
residue probes were sighted at `1, 1, 1` inside the block before reading
`0, 0, 0` after it.

It proved isolation (`B_sees=0`), refusal rather than concealment
(`B_cross_tenant=REFUSED(42501)`), and a real undo
(`{"undone": true, "affected": 1}`, `rows_after_undo=0`).

**It also found one defect in this slice.** The generated types carried the new
**table** and not the new **RPC** — nothing had failed, and nothing would have
until 2S.2 called it. Fixed surgically rather than by regenerating the file,
which would have deleted type coverage for the RPC-closed tables the generator
cannot see.

Two things this deployment deliberately did **not** do — the behavioural cascade
proof, and narrowing `authenticated`'s TRUNCATE — are recorded with their reasons.

Full record: `PHASE_2S_SLICE_01_DEPLOYMENT.md`.

---

## 12. Classification

| Requirement | Class | Evidence |
|---|---|---|
| `2S-SILENCE-001` | **built** | §2 — the table, the writer, and a suppression that persists and reloads unchanged |
| `2S-SILENCE-002` | **built** | §2 — six refusals by name, and a `postgres`-role read proving none of the six reached storage |
| `2S-SILENCE-003` | **built** | §2 — `reason` and `actor` stored and audited; a blank reason refused |
| `2S-SILENCE-004` | **built** | §2 — expiry is a `timestamptz` compared against `now()` at the source; the owner's local day is resolved by the one contract the heartbeat already uses |
| `2S-SILENCE-005` | **built** | §2 — trigger-proved ownership, plus a second owner's row planted first and then proved unreachable in both directions |
| `2S-SILENCE-006` | **built** | §3 — the undo is exercised through the real router; both shapes handled; the ledger row read afterwards |
| `2S-SILENCE-009` | **built** | §5 — `run_user_heartbeat` **called**; a suppressed subject produces none, and a suppression narrowed to one notice type leaves the others audible |
| `2S-SILENCE-010` | **built** | §5 — the expiry is moved into the past and exactly one notice reappears |
| `2S-CADENCE-001` | **built** | §1, §5 — six calls walking the ladder, each with its negative half |
| `2S-CADENCE-002` | **built** | §1, §5 — `else false`; silent at 30 days and still silent at a year |
| `2S-CADENCE-003` | **built** | §1, §5 — the same four notices either side of the anchor give opposite answers |
| `2S-CADENCE-004` | **baseline** | §1, §5 — the cooldown proved **byte-identical**; quiet hours, the cap and the lock re-proved by calling |
| `2S-CADENCE-005` | **baseline** | §5 — a day holding **both** a due reminder and a stale nudge, with the cap set to **one**: the reminder survives and the stale nudge does not, with a second control raising the cap to prove the stale nudge was a real competitor rather than an absent one |
| `2S-CADENCE-006` | **baseline** | §5 — a two-owner batch delivers to the unsuppressed owner and withholds from the suppressed one |
| `2S-CADENCE-007` | **baseline** | §5 — an unknown user raises `P0002`, the failure the batch absorbs |
| `2S-CADENCE-008` | **baseline** | the suppression touches no task row and no projection; a silenced subject keeps every existing attention source. Asserted as the absence of any application-layer reader of the new table |
| `2S-REACH-001` | **built** | §4 — both task branches point at the subject; asserted on the row the function wrote |
| `2S-REACH-002` | **baseline** | §4 — the producer was **already** locale-correct; both locales exercised through real notices. `2S-CLOSE-004` is what makes this sayable |
| `2S-REACH-003` | **built** | §4 — all three types enumerated with their destinations; the reminder's is a recorded refusal with a guard that fires if a route appears |
| `2S-REACH-004` | **built** | §4 — a named fallback replacing `notFound()`, with indistinguishability preserved and the `empty` state chosen over `error_terminal` |
| `2S-REACH-005` | **baseline** | §4 — the first `reminder` notification this product has ever produced. The route was always there; what had never happened is a notice arriving at it, so this proves an existing property rather than building one. **Recorded `built` in this file's first draft and refused by the reconciliation** — the same misfiling that survived five slices of Phase 2R, caught here at the second |

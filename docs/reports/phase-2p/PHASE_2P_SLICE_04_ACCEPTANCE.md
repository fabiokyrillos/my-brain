# Phase 2P — slice 2P.4 acceptance record

**Slice 2P.4 delivers its structure and STOPS at the owner's calibration
checkpoint.** Nothing is automatic, nothing was enabled, and no dataset,
approval or threshold was fabricated. The contract, the threat model and the
insufficiency finding were written **before any SQL**, in
`PHASE_2P_SLICE_04_CONTRACT.md`.

Baseline: `main` `02c41d13c318039b13beefc368de4a07f8fe3e64`, 98 local = 98
hosted, parity `202608180098`, read live. Authorization: **ADR-123**.

---

## 1. Why the existing schema could not carry this

Measured against the deployed database, not quoted:

| Object | Measured |
|---|---|
| `agent_preferences.autonomy_level` | `text`, `not null`, default `'autonomous'`, **no check constraint** |
| its behavioural consumers | **none** — one `select` list, one payload pass-through, no branch |
| `trust-builders.ts:55,88` | passes `autonomyAllowed: true` **as a literal** |
| `capabilities.ts:148` | `state: "future"`, `consumerEvidence: []`, `visible: false` |
| `product_events.event_name` | closed `CHECK`, 39 values, none about automation |
| `audit_logs.action_type` | **no** check constraint |
| automatic domain writes in the product | **zero** |

One scalar cannot express six policies, and `-010` requires disabling one
category while the others stand. Its default is a value nobody chose, so
reading authority out of `'autonomous'` would turn `create table` into consent.
`privacy_preferences` was refused as a store for the reason `element_trust` and
`element_policy` had to be normalized in slice 2P.1: one vocabulary serving two
authorities.

## 2. What was built — one migration, `202608190099`

**The phase's second and final migration.** A third is a stop condition.

| Object | Purpose |
|---|---|
| `public.automation_category_policies` | policy per `(user_id, category)`; `authenticated` holds **SELECT only** |
| `public.automation_calibration_observations` | append-only evidence; **no free-text content column exists on it** |
| `private.automation_calibration_thresholds()` | the six proposed thresholds, as constants |
| `private.automation_calibration_freshness()` | recency window and the undo-block window |
| `private.automation_category_has_producer()` | which categories can gather evidence **at all** |
| `private.automation_calibration_summary()` | the measurement, latest-verdict-per-subject |
| `private.automation_category_decision()` | **the single authority** |
| `public.automation_category_status()` | the owner's read — always six rows |
| `public.set_automation_category_policy()` | the owner's control — audited, idempotent, undoable |
| `private.undo_set_automation_category_policy()` | the reversal, registered in the deployed handler registry |
| three `after` triggers | the producer, bound to the tables the owner's decisions land in |

**No policy row is written for anybody.** Absence *computes* as `suggest_only`,
so the default is not a stored value a later reader could mistake for consent —
which is precisely what `autonomy_level` already demonstrates.

### The producer binds to tables, not to function bodies

Inherited from slice 2P.1's reasoning, and for the same reason: a superseded
resolver version, a route the application never calls, and direct DML all
produce evidence, and a route added later inherits the rule without being told
it exists. `undo_operations` is `after update` rather than `after insert`,
because the signal is the owner taking an acceptance back — a status
transition, not a new row.

It carries **no exception handler**, deliberately. It performs no lookup that
can raise and inserts `on conflict do nothing`, so it cannot fail on valid
input; if it ever does, a real defect must surface in CI rather than be
swallowed into silence.

### `2P-AUTONOMY-002` is discharged structurally

The decision reads no confidence, no score and no `element_trust`. There is
nothing in it for a model score to be compared against, so the requirement
cannot regress by a threshold being edited. Asserted in pgTAP and in the
closeout guard, both with the comments stripped first — see §6.

## 3. The proposed calibration contract, and the checkpoint it reaches

The repository defined no minimum sample size and no calibration criterion, so
ADR-123 Decision 5 applies: propose a measurable contract and stop before the
first category is enabled.

| Category | Min. reviewed | Min. precision | Why |
|---|---|---|---|
| `task` | 50 | 0.90 | fully reversible; the smallest blast radius and the only real review volume |
| `project` | 60 | 0.95 | nominal duplication propagates through associations |
| `organization` | 60 | 0.95 | company names collide across contexts |
| `person` | 80 | 0.97 | identity collision, and **no merge exists** |
| `memory` | 80 | 0.97 | durable by definition, and it enters retrieval |
| `relation` | 100 | 0.98 | `2N-RELATION-TRIGGER` is a hard boundary |

Freshness: ≥10 reviewed subjects within 90 days and the newest within 30.
Blocking: any `undone` among the 20 most recent observations.

Eligibility requires **both** the owner's arming and the measurement. Neither is
sufficient alone, and the thresholds are code constants rather than rows because
a threshold the running system can write is a threshold it can lower.

## 4. Verification

### Proved against the deployed schema, before CI, in transactions that were rolled back

Rollback semantics were proved **first** — a probe schema created inside a
transaction (`1`) and absent outside it (`0`). The migration file's exact bytes
were then read from disk and executed, never retyped: a harness that retypes its
subject tests a different artifact.

`sha256 36d65188056a400c7c6f9db5125c66484a1f3c4d136130c79f56db100a1c1b79`, 35 536 bytes.

| # | Probe | Result |
|---|---|---|
| 1 | six categories by default | all `suggest_only` / `suggest_only_by_owner` / `eligible=false` |
| 2 | armed but uncalibrated | `insufficient_calibration`, `eligible=false` |
| 3 | stored state `'autonomous'` — the value `autonomy_level` really holds | degrades to `suggest_only`, **does not raise** |
| 4 | producer | `approved` / `corrected` / `rejected`; **`retained` and `dismissed` produce nothing** — 5 resolutions, 3 observations |
| 5 | replay | no-op |
| 6 | another owner | A=3, B=1 |
| 7 | append-only | UPDATE refused, `42501` — **and this probe's first cut also asserted DELETE was refused, which is the defect §5a records** |
| 8 | **non-vacuity** | at 63 reviewed and 0.9683 precision the gate says **yes** |
| 9 | recent undo | blocks an otherwise eligible category |
| 10 | disable | immediate, outranks the calibration |
| 11 | inheritance | `person` reads 0 while `task` reads 63 |
| 12 | undo of an acceptance | records the distinct `undone` signal |
| 13 | unknown category | refused `P0002` |

Zero residue after each, **with a non-vacuity control**: 0 `automation%` tables,
0 probe users — while the real data stayed visible (2 users, 3 entries, 9 tasks,
15 undo operations, 98 migrations, parity unchanged).

### The pgTAP suite, dry-run before CI

pgTAP is not installed on the hosted project, so the suite itself is CI-only.
`phase_2p_automation_policy.sql` — **48 assertions** — was nevertheless executed
verbatim against the deployed schema with minimal shims for `is`, `has_table`,
`lives_ok`, `ok` and `throws_ok`, inside a rolled-back transaction. **48 run, 0
failed.** CI remains the authority — and §5a is what that sentence is for: this
dry run passed while two real defects were still in the tree, because it never
deleted a user.

Its first cut failed on two assertions, and the failure is recorded because the
correction is the interesting part — see §6.

### How the producer writes past `force row level security`, measured rather than assumed

Both tables carry `force row level security` and **only a SELECT policy**, so
there is no policy that would admit the producer's `INSERT`. It works because
`postgres` — which owns the `SECURITY DEFINER` producer and the tables — carries
`rolbypassrls = true`, read from `pg_roles` rather than assumed:
`authenticated` **false**, `service_role` **true**, `postgres` **true**,
`supabase_admin` **true**.

This is the same mechanism every other definer writer in this tree relies on,
and it is recorded here because the alternative reading — *"there must be an
INSERT policy somewhere"* — is false and would send the next reader looking for
one. If the attribute ever changed, the producer would **raise** rather than
silently drop evidence: it carries no exception handler, so the owner's own
resolution would fail loudly.

### Local gates

| Gate | Result |
|---|---|
| `npm run typecheck` | **0 errors** |
| `npx eslint src` | **0 errors** (1 pre-existing warning in `costs/page.tsx`, untouched) |
| new unit tests | 39 — 18 contract, 13 surface, 8 projection |
| closeout guard | 18 assertions |
| `git diff --check` | clean; the CSS append is 258 insertions and **0 deletions**, so no line-ending flip |

## 5. Threats dispositioned

| Threat | Disposition |
|---|---|
| **T-5** raw confidence authorizes a wrong mutation | **Closed structurally.** The decision reads no score column; asserted with comments stripped, plus a non-vacuity control. |
| **T-6** automation creates duplicate people | **Unreachable.** No category is eligible and no create path exists; `-006`'s rule is encoded and classified as such, not claimed. |
| **T-7** co-mention becomes a relationship fact | **Unreachable, and hardest-gated.** `relation` carries the strictest thresholds; `2N-RELATION-TRIGGER` untouched. |
| **T-8** an automatic write cannot be explained or undone | **Closed for the one write this slice ships** — the policy change itself, which audits and registers a handler-backed undo. |
| **T-20** the slice absorbs residuals | **Refused** — §7. |
| **T-2P4-a** a schema default read as consent | **Closed.** No policy row written; absence computes; `autonomy_level` excluded by guard. |
| **T-2P4-b** calibration evidence leaks content | **Closed in the schema.** The table's only text columns are `category`, `outcome`, `source_kind`, `subject_key`, `observation_key` — pinned by a pgTAP assertion on the exact column list. |
| **T-2P4-c** another owner's reviews calibrate this owner | **Closed.** Producer derives `user_id` from the source row; RLS forced; proved hosted (A=3, B=1) and in pgTAP with both numbers in view. |
| **T-2P4-d** replay or concurrency double-counts | **Closed.** Unique `(user_id, observation_key)` on the source row's identity; the summary reduces to latest-per-subject. |
| **T-2P4-e** a failing producer destroys the owner's resolution | **Closed by construction**, and with no exception handler, so a real defect fails loudly. |
| **T-2P4-f** arming is mistaken for authorization | **Closed.** The gate re-measures on every read; proved by probe 2. |
| **T-2P4-g** a stale calibration keeps a category armed | **Closed.** Freshness is part of eligibility, proved load-bearing in both directions in pgTAP. |
| **T-2P4-h** the new tables escape the deletion cascade | **Closed.** `on delete cascade` to `auth.users`, both joined to the cascade drill's populator in this same change, and both added to the privacy enumeration. |

### What changed outside the new objects, and why

Three existing files had to move, and each would have failed CI otherwise:

1. **`signup_hardening_cascade_drill.sql`** enumerates user-owned tables at run
   time and fails **by name** for any that holds no row for its fixture. Both
   new tables join the populator explicitly, rather than relying on the person
   candidate insert firing the producer as a side effect a later edit could
   remove.
2. **`signup_hardening_grant_census.sql`** pins the exact deviation list. Both
   new lines were placed **where the database actually sorts them** — measured,
   not assumed, because collation decides where an underscore sorts. Its prose
   said *"thirty-four of the fifty-three"* while the literal already listed
   thirty-six; the count was re-taken from the database and is now thirty-eight
   of fifty-seven.
3. **`src/features/privacy/enumeration.ts`** — both tables joined the `account`
   category, so the census counts them and the export carries them. Neither
   needs a `withheldColumns` entry, which is a property of the schema rather
   than an omission.

**No existing grant, RLS policy, retention rule or `EXECUTE` privilege changed.**
The only new privileges are `SELECT` on the two new tables and `EXECUTE` on the
two new `public` functions, all to `authenticated`. Nothing in `private` is
granted to anyone. No `product_events` vocabulary value, name or surface was
added.

## 5a. CI found two defects the hosted dry run could not, and one was severe

**The append-only trigger blocked account deletion.** Its first cut covered
`update or delete`, and its comment claimed *"the account cascade deletes rows
through the foreign key, which does not fire this trigger"*. **That is false.**
An `on delete cascade` performs a real DELETE on the child table, row triggers
fire, and this refused it — so no account could be deleted at all. The failure
surfaced in `signup_hardening_cascade_drill.sql` as
`42501: automation_calibration_observations is append-only` inside
`DELETE FROM ONLY "public"."automation_calibration_observations"`.

**This repository had already paid for the identical defect**, and had written
it down. `202608070081_phase_2h_rate_limiting.sql:182-188` says in as many
words: *"2H.2's cascade defect was an append-only trigger on a table whose rows
cascade: the cascade **is** a delete, so the trigger refused it and no account
could be deleted at all."* The comment I wrote asserted the opposite of a fact
the tree already recorded.

The trigger now covers **UPDATE only**. Deletion is governed where it is
governed on every other append-only table here — by grants: `authenticated`
holds `SELECT` and nothing else, so no client can update or delete a row, and
the cascade stays the complete cleanup story.

**Why the hosted dry run missed it, and what changed because of that.** Thirteen
probes ran against the deployed schema and none of them deleted a user, so none
of them could reach the cascade. The suite now proves it directly: an account is
created, given a policy row and an observation, deleted, and both tables are
measured empty afterwards — the assertion whose absence let the defect through.
The suite is 47 assertions, not 44.

**The SELECT policies did not name `authenticated`.** A policy with no role list
applies to `PUBLIC`, and `phase_2o_privacy_enumeration.sql` requires every
counted table to carry a SELECT policy naming `authenticated` — because a PUBLIC
policy is not evidence that the *owner* can read their own rows, which is the
property that assertion exists to establish. Both policies now say
`to authenticated`, and the suite pins it.

## 6. Two corrections worth recording

**A guard must forbid the act, not the word.** The first cut of both the pgTAP
assertion and the closeout guard scanned for the identifier `autonomy_level` —
and failed on the migration's own comment explaining why reading it is
forbidden. The fix strips comments before scanning, and each scan now carries a
non-vacuity control proving it still sees real code. Weakening the pattern, or
deleting the sentence, would each have traded a real property for a passing
test.

**An assertion of mine was malformed and CI would have caught it later.** The
closeout guard originally asserted `after insert on public.undo_operations`,
which is not what the migration does or should do — that producer is `after
update`, because the signal is a status transition. It is now a table-plus-
timing pair list with a negative control on the wrong timing.

**And the full-diff review found two more, in my own new code.** Neither was a
test failure; both were found by reading.

1. **The actions swallowed a failed save.** A `<form action>` re-renders the
   server tree when the action resolves, so a swallowed error would have put the
   stored value back in the select with no explanation — the owner would believe
   they had changed *who may write without asking them*, and nothing would have
   changed. For an authority control that is the worst available failure mode,
   and worse than an error the user can see. Both actions now raise.
   `2P-SETTINGS-007` — a failed save preserves input and names its section —
   belongs to slice 2P.5, which introduces the sections; until then, refusing
   loudly is the honest behaviour.
2. **Six identical accessible names.** Six categories mean six forms whose
   submit buttons all read *"Salvar política"*, so a screen-reader user would
   hear the same name six times with nothing to tell them apart. The **form**
   now carries `aria-labelledby` pointing at its category heading, rather than
   the button carrying an `aria-label` — which would override the visible label
   and break voice control, since *"click Salvar política"* would no longer
   match anything on screen.

## 7. Where this stops

### `CHECKPOINT DO DONO — CALIBRAÇÃO REAL NECESSÁRIA`

The structure is complete and **no category can be enabled**, because the
reference set does not exist.

**The calibration evidence is zero for all six**, and that is stronger than it
first looks. The producer is an `after insert` trigger, so it cannot see rows
that already existed: the owner's pre-existing hosted resolutions produce **no**
observations, and none are backfilled. Manufacturing evidence for reviews that
predate the contract is the fabrication ADR-123 Decision 4 forbids.

The two numbers are therefore different things and are stated separately, so
neither can be read as the other:

| Category | **Calibration evidence** | Pre-existing reviews (not evidence) | Needed | Still missing | Producer exists? |
|---|---|---|---|---|---|
| tasks | **0** | 2 — 1 confirmed, 1 dismissed¹ | 50 | **50** | yes |
| people | **0** | 3 — 2 confirmed, 1 rejected | 80 | **80** | yes |
| projects | **0** | 0 | 60 | **60** | **no** |
| companies | **0** | 0 | 60 | **60** | **no** |
| memories | **0** | 0 | 80 | **80** | **no** |
| relations | **0** | 0 | 100 | **100** | **no** |

¹ And under the corrected semantics that dismissal would not have counted as a
rejection anyway — see §6.

*(The task and person counts are the pre-existing hosted resolutions. The
producer is new, so those rows will be created for decisions made from now on;
the historical resolutions are not backfilled, because manufacturing evidence
for reviews that predate the contract is exactly the fabrication ADR-123
Decision 4 forbids.)*

**Four of the six categories have no producer at all**, because the product has
no review flow for projects, companies, memories or relations. That is a
measured fact about the product, not an omission here, and the surface reports
it in those words rather than showing a zero that would read as "not enough
yet".

**What would be automated if the owner signed the thresholds today: nothing.**
**What stays in "Precisa de você": everything, in all six categories.**

### Requirement classification

| Requirement | Class | Note |
|---|---|---|
| `2P-AUTONOMY-001` per-category policy | **built** | store, decision, control and surface |
| `-002` a raw score cannot authorize | **built** | structurally, and guarded |
| `-003` calibration against an owner-reviewed set | **partial** | mechanism, producer and measurement ship; **the reference set does not exist** — remainder: the owner's checkpoint |
| `-004` ambiguity → Needs You | **baseline** | delivered by slice 2P.1's contract, re-proved |
| `-005` high-trust task creation validates | **not-built-by-rule** | no automatic writer exists and none may be authorized; the rule is recorded in the contract |
| `-006` high-trust person creation resolves first | **not-built-by-rule** | same, and additionally blocked by 2P.1's decision (ii) |
| `-007` memories need durable-language evidence | **not-built-by-rule** | same |
| `-008` relations never from co-mention | **not-built-by-rule** | `2N-RELATION-TRIGGER` stands |
| `-009` content-minimal audit + bounded undo | **built** | exercised end to end by the policy change itself |
| `-010` disable by category | **built** | immediate, and it outranks the calibration |

**5 built, 1 baseline, 1 partial, 4 not-built-by-rule. Cumulative: 42 of 87.**

### The authenticated browser journey, executed — and the defect it found

`e2e/online-phase-2p-automation.spec.ts` signs a disposable account into the
**deployed** database and drives the real surface. **6 of 6 pass on desktop and
6 of 6 on mobile.** This is the first time the surface has been rendered in a
real authenticated browser, which is the defect class this repository has
shipped twice.

**It found one, and no local test could have.** The write always committed; the
**page never re-rendered**. The category's reason still read
`suggest_only_by_owner`, the history list stayed empty, and the undo control
never appeared until the owner reloaded by hand — while the `<select>` *looked*
updated, because it is uncontrolled and what was on screen was the owner's own
click. A failed save would have looked identical.

Four mechanisms were measured against the deployed app:

| Mechanism | Result |
|---|---|
| `revalidatePath` with the **resolved** path — the shape every other action here uses | **no refresh at all**; `/app/settings` is under a dynamic `[locale]` segment, and Next matches those by route pattern plus a type |
| `redirect` back to the same URL | **nothing** — a navigation to the current route is a no-op |
| `revalidatePath("/[locale]/app/settings", "page")` | fixed the **save** on desktop; kept |
| `router.refresh()` on top | request sent, server answers, screen still one generation behind — for the undo on desktop, and for the **save** on a phone viewport |

Both controls now navigate for real. An asymmetry briefly stood — `router.refresh()`
for the save, a reload for the undo — and was **removed rather than documented**,
because it rested on the save's refresh being reliable and the mobile lane
falsified that. A claim that survives one project and not the other is not a
property.

**The test's own first cut was vacuous** and is recorded because that is the
more useful half: it asserted the select's value as evidence the save persisted,
and passed over a stale DOM while the page had not re-rendered at all. It now
asserts only server-rendered facts.

**The cascade fix was re-proved on production.** Three disposable probe accounts
holding policy rows, undo rows and audit rows were deleted through
`admin/users/{id}`; all three returned `200` and `audit_logs` returned to
exactly **342**. That is the append-only defect proved closed on the deployed
database, not only in CI.

### Deliberately not claimed

1. **No category was enabled**, and none may be until the owner signs the
   thresholds and the reference set exists.
2. **No automatic write has ever executed**, so `-005` … `-008` are encoded
   rules rather than proved behaviours. They are classified `not-built-by-rule`
   rather than `built`.
3. **No live two-session race** on the policy control.
4. **No real device.** The mobile lane is a Pixel 7 emulation, which
   `2P-MOBILE-005` distinguishes from hardware; `2P-MOBILE-005`'s own rule that
   hardware-dependent claims stay NOT EXECUTED is untouched by this slice.

### Remainders preserved, not absorbed

`2P-ATTENTION-008`'s browser half; `2P-CHAT-004-MOBILE` (slice 2P.5);
`2P-CHAT-007-JOURNEY` (slice 2P.8); `RG-DEP-3`. Push HTTP 403 is not resumed,
signup stays closed, rollout stays 25 pass · 3 fail · 2 owner-signature, no BYOK
credential was read or spent, and no audio is persisted.

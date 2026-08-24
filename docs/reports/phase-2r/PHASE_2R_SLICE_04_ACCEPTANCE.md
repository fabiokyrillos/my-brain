# Phase 2R — slice 2R.4 acceptance: delivery, without multiplying it

**Delivers** `2R-NOTIFY-001` … `-007`. **Zero migrations.** No change to the
heartbeat, to quiet hours, to the daily cap or to the 24-hour cooldown.

- **Migrations created: none.** 101 local = 101 hosted, parity `202608230101`.
- **Hosted writes: none. AI calls: none. BYOK credit spent: none.**
- **Product code changed: none.** The slice adds a pgTAP suite and one guard.

> **The one thing this slice had to decide was whether it had anything to
> build.** Six of its seven requirements are baseline and the seventh — *a
> missed occurrence does not produce a burst* — was classified **build** at
> planning time. It turned out to be satisfied by slice 2R.1's design, and the
> honest thing was to prove that rather than to manufacture work that would make
> the classification look right. §2 is that proof, and §5 is the reclassification
> with its reason.

## 1. The standard this slice was held to

The implementation plan does not ask for tests of the heartbeat. It asks for
something narrower and harder:

> **Closes on: the heartbeat's rules re-proved, not re-read.**

That sentence exists because slice 2R.1 already re-read them. Its suite asserts
the heartbeat is unchanged by reading `pg_proc.prosrc` and matching two
substrings — a good guard against an accidental edit, and **not a proof of
behaviour**. It would pass just as happily if a series occurrence were a row
shape the heartbeat's predicates never matched, or if materialisation quietly
produced five due rows where one belongs.

So `supabase/tests/phase_2r_notify.sql` **calls `run_user_heartbeat` and reads
what it did**, twenty-six times.

## 2. `2R-NOTIFY-005` — the burst that cannot happen, proved

The requirement: *a series unprocessed for days delivers at most what the cap
allows, never a backlog at once.*

Two independent things have to hold, and they are different claims:

| Claim | Mechanism | Where it came from |
|---|---|---|
| a series never holds more than one due occurrence | the partial unique index on the live occurrence | slice 2R.1 |
| the occurrence it does hold advances to the **future**, not to the next missed instant | `boundary := greatest(new.remind_at, now())` in the materialisation trigger | slice 2R.1 |

A single row that materialised *backwards* would satisfy the first and fail the
second, which is exactly why reading the migration was not enough. The suite
drags a live occurrence eight days into the past and then:

1. asserts there is still **exactly one** live occurrence;
2. runs the heartbeat and asserts it created **one** notification, not eight;
3. asserts the next occurrence's `remind_at` **is in the future**;
4. asserts there is *still* exactly one, so nothing accumulated behind it;
5. runs the heartbeat again immediately and asserts **zero** — there is no queue
   to drain.

Step 3 is the one that distinguishes the two claims, and step 5 is the one that
distinguishes "no burst" from "the burst is waiting for the next run".

## 3. The denials are not vacuous, and the suite says why

*"No notification was created inside quiet hours"* is satisfied by a broken
heartbeat, by a fixture that was never due, and by an empty database. Every
denial here is therefore preceded by its own positive control:

- **quiet hours** — the same series through the same heartbeat **outside** the
  window delivers first; then the window is moved over the present and the
  silence is asserted; then the window is moved away again and the withheld
  occurrence delivers, proving it was withheld rather than lost;
- **the cap** — three arriving is asserted before the fourth and fifth not
  arriving, and the two over the cap are shown **still scheduled and still due**, beside the three future successors the deliveries created;
- **isolation** — the other user's notifications are **deleted first**, so the
  rows counted after the batch can only have come from the run that followed the
  failure. Without that the assertion would have passed on section 1's leftovers
  while the batch delivered nothing;
- **fixtures** — section 0 asserts the account is `active` and the cap is the
  product default, because a suite whose users were silently skipped as
  `account-not-active` would report every denial as a pass.

Two of those controls were added after the first draft, where the isolation
assertion was vacuous and a content control counted one delivery where the
fixture produces two. Both were found by reading the suite against its own
fixtures rather than by CI.

**A third was found by CI, and it is the most interesting of them.** The cap
section asserted that after three of five deliveries the remaining two were
"still scheduled" — and the count came back **five**. Marking three occurrences
`sent` fires the materialisation trigger three times, so each of those series
immediately gains its next occurrence. Those three are in the *future* and are
not what "over the cap" means. The assertion now says what it meant — scheduled
**and still due** — and a second one was added for the three future successors,
so the number that surprised me is now itself asserted rather than filtered out
of view. The suite is a better description of the system than it was before it
failed.

## 4. `2R-NOTIFY-004` — the failure is forced, not simulated

*"A failure in one series leaves other users' deliveries unaffected."*

`run_all_heartbeats` wraps each user in its own `begin … exception when others`
block, so the mechanism is visible in the source. Reading it is not proof that a
real failure is survivable, so the suite **causes one**: `profiles.timezone`
carries no CHECK constraint — the gap `2R-TZ-SECOND-AUTHORITY` already records —
so an unresolvable zone makes `now() at time zone timezone` raise inside that
user's heartbeat. The batch is then asserted to live, and the user *after* the
broken one in the loop is asserted to have been delivered to.

**The remainder is used, not discharged.** That the missing constraint made this
test possible is not an argument for leaving it missing.

## 5. `2R-NOTIFY-006` — the distinction that is easy to get backwards

`public.notifications` carries `title` and `body` **on purpose**: it is the
in-app surface `2M-NOTIFY-008` requires to be left untouched. The content-free
requirement is about the **delivery audit**, `public.notification_deliveries`,
whose `dedupe_hash` is constrained to 64 hex characters precisely so it *cannot*
hold a title.

A slice that asserted "no notification contains the reminder's text" would have
been asserting the opposite of the product's contract, and it would have passed
only if the in-app surface were broken. So the suite asserts three things
instead: the delivery audit still has **no column that could hold content**; a
series delivery wrote **no row into it at all** (push is not on this path); and —
as a control — the in-app notification **does** carry the reminder text.

## 6. Classification

| Requirement | Class | Evidence |
|---|---|---|
| `2R-NOTIFY-001` | **baseline — re-proved** | §3 — withheld inside the window, delivered outside it, delivered again once it passed, and never marked `sent` while withheld |
| `2R-NOTIFY-002` | **baseline — re-proved** | §3 — five due occurrences across five series deliver three; the two over the cap stay scheduled and due; the three delivered each materialise one future successor; a second run the same day adds nothing |
| `2R-NOTIFY-003` | **baseline — re-read, and said so** | the cooldown is scoped to `task_overdue`/`task_stale` **by name** and the heartbeat contains no series concept. Asserted on the deployed function rather than on a fixture, because the requirement is about what the rule *covers*. **This one is a read, and the record does not call it a proof** |
| `2R-NOTIFY-004` | **baseline — re-proved** | §4 — a forced failure, survived, with the next user still delivered to |
| `2R-NOTIFY-005` | **baseline by 2R.1's design — proved here, reclassified from build** | §2. The plan expected code; the mechanism already existed. Manufacturing a change to justify the label would have been the dishonest option |
| `2R-NOTIFY-006` | **baseline — re-proved** | §5 — no content column, no delivery row, and a control proving the in-app surface is untouched |
| `2R-NOTIFY-007` | **not-built-by-rule** | a new guard in `phase-2r-declarations.test.ts` forbids a **push claim** across the phase's records, with a mutation control planting the forbidden sentence and the permitted refusal. It forbids the act, not the word, because the HTTP 403 remainder has to stay nameable |

**7 of 7 classified. 54 of 73 for the phase.**

## 7. What this slice deliberately did not do

- **No migration.** The budget stays 1 allocated · 1 spent.
- **No change to the heartbeat**, to quiet hours, to the daily cap, to the
  24-hour cooldown, or to `run_all_heartbeats`. `OD-2R-3` option A was signed so
  that recurrence would not have to touch them, and the value of that decision is
  only real if it is still true at the end.
- **No push.** Nothing was sent to a device, nothing about push was repaired, and
  no assertion in this slice may ever be cited as evidence that push works.
- **No calendar or agenda surface**, so the plan's conditional parallelism
  question is moot: this slice touches neither.

## 8. Remainders carried, none discharged

- **`2R-TZ-SECOND-AUTHORITY`** — used by §4 as the mechanism for a forced
  failure. Using it is not fixing it.
- **`2R-OCCURRENCE-CANCEL-IRREVERSIBLE`**, **`2R-UNDO-LEDGER-NOT-CLOSED`**,
  **`2R-AXE-MANUAL-LANE`**, **`2R-RECURRENCE-LANE-UNRUNNABLE`**,
  **`2R-DRAWER-NOT-LOCKED`**, **`2R-TASK-RECURRENCE`**, `OD-2R-9`'s two defects.
- **Push HTTP 403** — not resumed, not repaired, and now guarded against being
  claimed.
- **Unchanged:** `2P-ACCESS-005` **NOT EXECUTED — OWNER WAIVED**;
  `2P-ATTENTION-008`; `RG-DEP-3`; `2P-CHAT-007-JOURNEY`; ADR-055 expiring
  2026-10-27.

## 9. Where the next slice starts

**2R.5 — closeout.** The traceability matrix is generated from the five slice
acceptance records rather than typed, the threat model is re-dispositioned
against what was built, and the phase stops at an **owner device checkpoint**
(`2R-CLOSE-012`) rather than on a green pipeline.

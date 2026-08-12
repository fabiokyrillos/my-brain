# Phase 2M — closing report

**Closed 2026-08-12.** Calendar, daily planning, the day review and
notifications. Six slices, **94 requirements**, **89 built · 4 partial · 1
not-built-by-rule · 0 undelivered**, classified by a generator from the slice
records and never typed.

**Migration budget closes at `3 allocated · 3 spent`, all three
non-transferable.** A fourth was a stop condition throughout and none was
created. Hosted parity, read live and read-only on the closing date:
**`202608120092` across 92 migrations, local = remote on every row.** Signup
closed. Rollout gate untouched at **25 pass · 3 fail · 2 owner-signature**.

---

## 1. The sentence this phase must be read with

**Push notifications are implemented and hosted. They fail on the owner's real
iPhone with `HTTP 403` from Apple Web Push. They have never been validated on
Android.**

That is not a caveat at the end of a success. It is the state of the feature, and
every other claim in this report is made next to it.

- **Implemented**: RFC 8291 message encryption and RFC 8292 VAPID on WebCrypto
  with no dependency, encryption proved **byte for byte against RFC 8291 section
  5's published vector** rather than by a round trip that would have agreed with
  itself.
- **Hosted**: migration `202608120092` applied; the `send-push` Edge Function
  deployed with edge parity green; **47 of 47 hosted claims passed** through real
  PostgREST under real roles with RLS enforced; zero residue proved owner-scoped
  and then confirmed globally.
- **Failing**: two runs on a real iPhone with the PWA installed, notifications
  active and the app in the background. Both answered
  `delivered=0 · failed=1 · diagnostics:[{category:"unauthorized", status:403}]`.
  The second ran after `VAPID_SUBJECT` was corrected to a real operational
  address, so it reported `subject: "operational"` — **the subject is not the
  cause**.
- **Unexplained**: the deployed sender's configuration self-check answers
  `pair: "consistent"`, and the application's public key was proved byte-identical
  to the Edge Function's by digest. **A consistent pair eliminates a key
  mismatch. It does not explain the 403.** No root cause is asserted anywhere in
  this repository.

**ADR-107** deferred the remaining device work out of this phase. It is an
amendment to OD-2M-5's closeout gate, dated and layered over the original rather
than rewriting it, and it is **governance rather than a success claim**. The
residual lives in `docs/initiatives/push-hardware-validation/` and may not be
deleted, reclassified as passing, or discharged by any offline test.

---

## 2. What shipped

**The calendar** (`/app/calendar`) — day, week and month, every item derived from
records that already existed, no new commitment type, and sensitivity **derived
from the source entry** rather than persisted. **The planner**
(`/app/calendar/plan`) — two lists, no composer, overload reported as a count and
the hours the user actually declared, three conflict kinds each proved reachable
and stated as facts with no button in the region. **The day review**
(`/app/reviews`) — five verbs mapped as data onto the existing task-command
taxonomy, confirmation and reversibility read from `actionPolicy` rather than
restated. **Notifications** — opt-in, content-free, six governance controls
applied in SQL before anything is sent.

**`planned_at` acquired one declared meaning and a guard that keeps it one.** It
had been written by nothing and read by nothing; it is now an *intention* under
OD-2M-3 A, distinct from a deadline, reduced to a local day by one contract, with
five filter members and two orderings inside the three existing views — costing
no migration.

**One local-day contract replaced three implementations**, two of which were
wrong in opposite directions.

---

## 3. The defects this phase found, and which of them only execution could find

Fifteen defects were found and fixed. The ones worth carrying forward are the
ones no amount of reading would have produced.

**Two surfaces had never rendered.** `/app/reviews` and `/app/calendar/plan` were
shipped, merged with CI green, and deployed — and both answered with their error
boundary from the day they landed, because each handed a plain arrow function to
a `"use client"` component and React cannot serialize a function into the RSC
payload. Found in slice 2M.5 by the authenticated journey slice 2M.3 had said it
owed. **Every component test was correct**: a test mounts the client component
directly and hands it a function, which is valid in that context. Both browser
lanes compose the surfaces with `setContent`, which never runs a server render.
*A boundary that only exists in production is only tested in production.*

**A migration that would have applied cleanly and failed on first use.**
`pg_catalog.coalesce` / `.least` / `.greatest` cannot resolve — they are SQL
grammar with no `pg_proc` entry — and the defect was found by a guard rather than
by review. Its sibling, `pg_catalog.position('x' in y)`, is a **parse-time**
error and was found by CI, because careful reading catches what fails later and
only execution catches what fails immediately.

**The undo button had never rendered on any surface since Phase 2L shipped it.**
`apply_task_command` returns its window through `to_char(..., 'OF')`, Postgres
emits `+00` for UTC, ECMAScript accepts only `Z` or `+HH:MM`, so `Date.parse`
answered `NaN` and the fail-closed branch was the only reachable one. Every 2E
and 2L test passed throughout — all of them wrote `...Z`, and none asserted the
button.

**The authenticated gates had stopped being server-side.** A `loading.tsx` added
for perceived performance moved every `/{locale}/app/**` gate below a Suspense
boundary, so an unconsented account got `200` and 63 KB of shell where the
specification says `307`.

**A silent sender.** The first real iPhone run answered `delivered=0, failed=1`
and the function's logs held only boot and shutdown: both failure paths appended
to `failed` and said nothing. *A suite that always supplies the failure it is
testing cannot detect that the system never reports which failure occurred.*

**A runtime that signs with a key it was not given.** Deno's WebCrypto imports an
EC private JWK from `d` alone and never consults `x`/`y`, so a mismatched VAPID
pair signs cleanly and produces a token that verifies against nothing. The sender
now asks the question the push service asks, offline, at no cost to a device.

---

## 4. The four partials, each with a remainder and a destination

| requirement | remainder | destination |
|---|---|---|
| `2M-DEVICE-004` | the device evidence itself — delivery, foreground, background, lock screen, tap destination, revocation, and the controls observed on a device | `docs/initiatives/push-hardware-validation/` §3 |
| `2M-DEVICE-005` | `2L-MOBILE-008` and `2L-ACCESS-008`, re-stated as still open rather than absorbed | §3.5 |
| `2M-ACCESS-007` | VoiceOver on iOS and TalkBack on Android over the notification surface and the five consent states | §3.4 |
| `2M-TIME-007` | four `daily-cycle` surfaces still format an instant with no `timeZone` — enumerated in the guard, length asserted, each asserted to still carry the defect | §4 |

`2M-RECUR-004` closes **not-built-by-rule** against OD-2M-7: recurrence is a
separately authorized initiative with its own decision, not a deferred slice of
this phase.

---

## 5. What is not proved, said plainly

- **That a push notification reaches any device.** It does not reach the only one
  it has been tried on.
- **Anything about Android.** The owner has no Android device and none was
  borrowed.
- **Anything a real screen reader would report.**
- **The four `daily-cycle` timezone renderings**, which are a live defect
  recorded with a destination rather than repaired.

No emulated run is recorded anywhere in this phase as satisfying a real-device
claim, and `2M-DEVICE-004` refuses a closeout that says otherwise.

---

## 6. Successor

The roadmap successor is **re-audited and not started**: no successor artifact,
no successor requirement, no successor ADR, and the phase-start guard is
retargeted only by the successor's own authorizing commit. The re-audit is
`PHASE_2M_SUCCESSOR_REAUDIT.md` in this directory, and it reports what this phase
changed underneath the successor without scoping or authorizing it.

ADR-055's expiry of **2026-10-27** is neither satisfied nor superseded.

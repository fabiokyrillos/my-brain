# Phase 2S — Slice 2S.2 acceptance record

**The verbs the owner can say back to the Brain, on both surfaces, through one
authority neither of them can bypass.**

- **Authorization:** implementation of slices 2S.0 … 2S.4, **ADR-138**
  (2026-08-24). `OD-2S-3` **B** — the three-verb option that overrode the
  recommendation on purpose — is what makes this slice twenty-three
  requirements instead of eight.
- **Requirements:** `2S-SILENCE-007`, `-008`, `-011`; `2S-ANSWER-001` … `-008`;
  `2S-ACT-001` … `-012` (**23** of 99).
- **Migration:** **none, and none was needed.** The phase's one migration was
  spent and applied by slice 2S.1. Hosted parity is untouched at
  `202608240102`, **102 local = 102 hosted**, read directly this session.
- **Baseline:** `main` **`d0b086cd02f9c63fcd325f2bb7042d8dd2eaea71`**, the tree
  slice 2S.1's closeout produced. Worktree clean at every commit.
- **Hosted writes: none.** No statement of any kind was issued against the
  deployed project except the read that confirmed parity.
- **AI calls: none. BYOK credit spent: none. Push: not resumed, not repaired,
  not claimed. Signup unchanged. Rollout unchanged.**

**No stop condition was reached.** The two this slice could have hit —
*an inline verb needs a new write authority* and *an inline verb needs schema of
its own* — are both refused by executable census rather than by assertion in
prose.

---

## 1. What the owner can now do, and what each verb promises not to touch

| verb | changes | leaves alone | dispatches to |
|---|---|---|---|
| *Concluir tarefa* | **the task** | every message | `applyWorkItemAction` |
| *Reagendar tarefa* | **the task** | every message | `applyTaskDetailCommand` |
| *Marcar aviso como lido* | this message's status | the subject, and every other message about it | `markNotification` |
| *Descartar aviso* | this message's presence | the subject, and the cadence | `markNotification` |
| *Silenciar por um tempo* | the cadence, until an instant | the subject, and this message | `suppressNotificationSubject` |
| *Silenciar este assunto* | the cadence | the subject, and this message | `suppressNotificationSubject` |

One primary action derived from the subject's own state, plus **one** compact
menu holding the rest. Only *descartar* asks first, because it is the one verb
here that removes something with no way back — the list filters `dismissed` out.

**Absence of a task verb is the correct outcome of an invalid link**, never a
hidden failure. A notice whose `dedupe_key` is unreadable, whose subject was
deleted, or whose subject belongs to someone else keeps its message verbs and
offers no task verb at all — and never reveals that the foreign subject exists.

---

## 2. Convergence is structural, not asserted

`2S-ACT-011` requires the verb set and its copy to be read from **one** source
and to be **equal** across `/app/notifications` and the attention surface.

**One shared vocabulary is necessary and not sufficient.** Two surfaces could
each mount the row component and pass different things into `primaryVerb` and
`menuVerbs` — one filtered, one re-ordered, one assembled by hand — and
`verbs.ts` would be intact while the rendered rows disagreed. The notifications
page did exactly that for one commit of this slice: it spelled out `primaryVerb`,
`menuVerbs`, `subject` and `subjectLabel` at the call site.

So neither surface builds those props any more:

| layer | one of them | what a second one would mean |
|---|---|---|
| vocabulary | `verbs.ts` | two lists that agree until one is edited |
| eligibility | `isEligibleStatus`, imported once | two rules that agree until one is edited |
| projection | `projectNotificationRows` | two ways to resolve a subject |
| mount | `NotificationVerbs` | two ways to turn a row into controls |
| authorities | `NOTIFICATION_VERB_HANDLERS` | two places the five destinations are chosen |

`src/lib/closeout/phase-2s-verb-authority.test.ts` is the census `2S-ACT-011`
and `2S-TRUST-010` ask for. **Fourteen assertions**, in four properties, each
with a control that can fail.

### The non-vacuity control, because every other clause is a negative

Every remaining clause in that file is about what surfaces do **not** do — do
not assemble props, do not build a bundle, do not spell out a label, do not
reach past the mount — and **an empty set satisfies all of them**. So the
surface list is derived from the tree first, asserted to hold at least two
members, and both known members are named. A scan whose result set is empty
fails before any closed-set assertion runs.

### A guard must forbid the act, not the word

The census's own first run produced two failures, and **neither was a defect**.
Every module in the notification feature describes `isEligibleStatus` in prose,
and `page.tsx` carries a JSX comment naming `<NotificationRowActions>`. Failing
on those would have taught the next author to delete an accurate comment to make
a guard pass.

Every scan now runs over the source with its comments removed, and the
eligibility scan looks for an **import** rather than for the identifier.

---

## 3. The three requirements that needed a database

`2S-ANSWER-004`, `-008` and `2S-SILENCE-011` each contain a verb no component
test can perform. Claiming them from TypeScript would have been the defect slice
2R.1 already paid for: matching a substring against a function's source proves
the text and never the behaviour.

`supabase/tests/phase_2s_slice_2_dispositions.sql` — **42 assertions, no
migration**, against the schema slice 2S.1 deployed.

### The two dismissal requirements are each other's control

The deployed cadence has four clauses. Two of them decide this:

- **(A)** `notification.dedupe_key = candidate.dedupe_key`, exact and unbounded.
- **(B)** a 24-hour cooldown on `task_overdue` and `task_stale`.

| section | arrangement | expected | what it proves |
|---|---|---|---|
| §1 | a **dismissed** notice carrying **today's** key, two days old | the heartbeat adds nothing | (A) reads the key, never the status — a dismissal is **not a reset** (`2S-ANSWER-004`) |
| §2 | the **same** dismissal, five days back, carrying that day's key | the heartbeat adds **one** | a dismissal is **not a suppression** either (`2S-ANSWER-008`) |

If dismissal had silenced the subject rather than the message, §2 returns 1
instead of 2 and the suite says so. If the exact-key clause consulted status,
§1 returns 2. Neither section can pass by accident, because the other one is
the same arrangement with one variable moved.

### The four scopes, one at a time

§3a … §3d apply exactly one verb each and then read **the other three subjects
of change**: this message, the other message about the same subject, the
suppression ledger, and the task. A control that moved two of them fails.

The two message verbs are applied **as the owner**, through the same `UPDATE`
the Server Action issues, so RLS is part of the proof rather than bypassed by
running as `postgres`. Every suppression count is read **after `reset role`**,
so a zero is a real zero rather than a zero RLS produced.

### `2S-ANSWER-006` is proved by writing, not by parsing

A first draft read `pg_get_constraintdef` and counted the quoted literals in it.
That measures how this PostgreSQL version happens to deparse a check constraint,
not what the constraint does. §5 **writes** each of the three members, then
writes a fourth, and reads the refusal — and then reads the row to prove the
refusal changed nothing.

### Two drafting errors, caught by reading rather than by CI

1. **`reset_state() + plant(...)` relies on an evaluation order SQL does not
   guarantee.** The plant could have run first and been deleted by the reset,
   and the suite would have failed for a reason having nothing to do with the
   product. Both are now statements inside one plpgsql function.
2. **"the task is unchanged" cannot be proved by touching the task.**
   `tasks_updated_at` is a `BEFORE UPDATE` trigger, so any write rewrites
   `updated_at` to `now()` and the subject stops being stale — every assertion
   after it would fail while the product behaved correctly. The task is only
   ever read, against a baseline captured before the first verb runs.

### This file is written blind, and the record says so

There is no local Docker in this environment. **The pgTAP suite in this slice
has never been executed on this machine; CI is the first thing to run it.**
`src/lib/closeout/phase-2s-dispositions-guard.test.ts` therefore makes every
check that can be made from the text — the plan matching the assertion count,
the transaction opening and rolling back, pure ASCII, the heartbeat being
**called** with no `prosrc` anywhere, each scope block re-reading the subject,
no denial read while RLS is filtering.

It is **not** a substitute for running it, and nothing in it proves a behaviour.

---

## 4. Accessibility, and the defect three fixes did not find

Carried from this slice's first half and re-proved on the attention surface.

- **One announceable node, and it is the visible one.** The row had an
  `sr-only` `role="status"` and a separate visible `<p>` carrying the same
  sentence. That did not produce two announcements — the paragraph had no role —
  but it put the text in the accessibility tree **twice**. The visible paragraph
  **is** the live region now: always rendered, empty at rest, `:empty`-collapsed
  in CSS rather than hidden, because `display:none` would take it out of the
  tree and break the announcement.
- **ESCAPE DID NOT CLOSE THE COMPACT MENU, AND FOUR GREEN FOCUS TESTS DID NOT
  NOTICE.** The handler sat on the `<ul role="menu">`. Opening the menu leaves
  focus on the **trigger**, which is that list's *sibling* — so the keydown
  never reached the handler and Escape did nothing. A menu a keyboard user can
  open and cannot close is the whole of what `2S-ACCESS-006` is about, and it
  shipped for three commits of this slice while every panel focus test passed,
  because they test the panel. The handler is now on the container, where a
  keydown on the trigger and a keydown on any item both reach it.
- **The test written for that fix was itself vacuous, and a mutation control
  said so.** Deleting the `focus()` call from `closeMenu` still passed —
  because the reader was standing on the trigger when Escape arrived, so
  `activeElement === trigger` was true either way. **Focus has to LEAVE before
  "returns focus" means anything**, so the test now tabs into the menu first and
  asserts focus really entered it.
- **Focus into the question took three wrong diagnoses.** `queueMicrotask` fired
  before React had rendered the panel; a callback ref fired before the node was
  connected to the document; an effect with a plain `input` selector found the
  **hidden** field naming the verb first, and a hidden input cannot be focused.
  Hence `FOCUSABLE`, which excludes `input[type="hidden"]`.
- **Openness is derived, not stored.** This repository has already shipped a
  dialog that closed mid-transition and froze because its openness was state.
  The applied outcome simply wins over the stored intent.
- **The CSS is proved loaded**, not assumed: the feature's rules live in
  `settings-extended.css`, which `globals.css` imports, and the attention row's
  own rules live beside `.needs-attention-row` in `operations.css`.

`.attention-notice` already existed in `operations.css` as a card tone. It
**cannot** match `.attention-notice-row` — a class selector matches the whole
token — but the row was renamed `notice-attention-row` anyway, because the next
author reads the name before the selector engine does.

---

## 5. What did not change

| | |
|---|---|
| **The writer of `notifications`** | still the heartbeat for inserts, still `markNotification` for status. The census finds no second one. |
| **The suppression RPC** | called, not modified. Slice 2S.1 deployed it; this slice is the caller it shipped without. |
| **The attention projection** | `loadAttentionProjection` and `loadMemoryConflicts` are untouched. The notices are a **separate field** on the view model, appended **after** the entry rows — a new kind of row displacing the expanded lead would have changed the existing projection's behaviour while claiming only to add to it. |
| **The `dismissed` filter** | `.neq("status", "dismissed")` on the page is byte-identical, and now guards a state the product can produce. |
| **`agent_preferences`** | not read as consent for anything here. |

---

## 6. Controls

**Twenty-three mutation controls, twenty-three failures.** Every mutation was verified to
have changed the file on disk before the suite ran, and every file was restored
and re-verified afterwards — because a control that does not perform its
mutation reports a pass and proves nothing.

### Fourteen on the surface

| control | result |
|---|---|
| `verbs.ts` stops carrying `R-24`, so a read notice keeps *marcar como lido* | **fails** |
| the loader stops filtering on the unanswered status | **fails** |
| the loader stops scoping the read to the owner | **fails** |
| the loader stops reading one row beyond the bound | **fails** |
| Home stops counting the notices | **fails** |
| Home stops rendering the notice rows | **fails** |
| a second announceable node reappears beside the visible one | **fails** |
| a sixth destination joins the handler bundle | **fails** |
| the attention row assembles its own verb props | **fails** |
| a verb label is spelled out outside the one vocabulary | **fails** |
| the attention row falls back to the host's zone | **fails** |
| *descartar* stops asking | **fails** |
| *marcar como lido* starts asking too | **fails** |
| eligibility stops asking the command taxonomy | **fails** |

### Three more on the compact menu, added after the defect above was found

| control | result |
|---|---|
| the Escape handler moves back onto the list, where the trigger's keydown never reaches it | **fails** |
| Escape closes the menu but does not give focus back | **fails** — *after* the test was repaired; it passed before |
| the trigger stops toggling, so the menu has one way in and none out by pointer | **fails** |

### Six on the pgTAP guard — two of which found the guard, not the product

| control | result |
|---|---|
| the plan disagrees with the assertion count | **fails** |
| the suite reads the function's source instead of calling it | **fails** |
| a scope block stops re-reading the subject | **fails** — *after* the guard was repaired; it passed before |
| a denial is read while RLS is still filtering | **fails** |
| a scope is dropped from the suite | **fails** — *after* the guard was repaired; it passed before |
| an arrangement is dropped, so an absence is asserted over an empty table | **fails** |

**The two repairs are the finding, and both are rules this repository already
owns:**

1. **A threshold with slack passes the defect it exists to catch.** The guard
   asserted "at least five readings of the task"; deleting one left five. It now
   derives the four scope blocks from the suite's own section markers and
   asserts each one individually.
2. **A check can pass by containing its own subject.** The scope check was
   satisfied by the section **header comment** naming the scope, so renaming the
   assertion's own message left the guard green. It now scans the file with its
   `--` commentary removed.

### One control found a defect in a fixture

The shared fixture defaulted `subjectStatus` to `"pending"`, which is **not a
member of the task status vocabulary at all** — so `isEligibleStatus` refused
both task verbs and every default row silently exercised the
unresolvable-subject branch. Home's own test caught it. *A fixture whose status
the authority does not recognise is a fixture that tests the wrong thing.*

---

## 7. Guards retargeted, none weakened

| guard | what moved | why it is a retarget |
|---|---|---|
| `2S-FOUNDATION-003` | the page mounts `<NotificationVerbs>`, not `<NotificationRowActions>` | the chain is asserted end to end — the page mounts the shared function, and that function mounts the shared component. Weakening either link breaks it. |
| `2S-FOUNDATION-004` | the caller census follows the path through `verb-handlers.ts` | the requirement is *a writer reachable **from the surface***; asserting only the first hop would let the page stop importing it and still pass. The non-vacuity control — the caller proved to exist before anything is claimed about it — is kept. |
| `page-outline.test.ts` | `subjectLabel=` moved off the page | the chain is asserted instead: the page passes the row, the mount reads `subjectLabel` off it, the control's accessible name is built from it. |
| `phase-2m-notification-boundary-guard` | three new modules classified | its **discovery sweep** caught them; no file in the feature belongs to neither list. |
| `phase-2l-no-gesture-guard` | the attention row registered | its discovery assertion caught it — **the sixth time** that sweep has found a surface that would otherwise have shipped unscanned. It is a scrolling list on a phone, which is exactly where a swipe is easiest to add and worst to have. |

---

## 8. Gates

| gate | result |
|---|---|
| typecheck | **zero** |
| lint | **at baseline** — the only errors are `@typescript-eslint/no-explicit-any` inside `.worktrees/suggest-new-people/`, which `.gitignore:22` excludes and CI never checks out. No file this slice touched reports an error or a new warning. |
| `npm test` | **9581+ passing, zero failing.** Three test **files** fail to load, all three with the same rolldown shebang parse error on `.mjs` scripts this slice never touched — the recorded local baseline. |
| production build | **passes** |
| pgTAP · `supabase db lint` · the whole chain from empty | **CI.** No local Docker in this environment. |
| Playwright | **CI** (`foundation.spec.ts`, desktop + Pixel 7). |

**Two lanes are deliberately not claimed here.** The rendered-route proof and
the axe run belong to slice 2S.3, whose requirements they are.

---

## 9. What this slice does NOT claim

| | |
|---|---|
| `2S-ATTENTION-001` … `-008` | **slice 2S.3's**, and their evidence bar is the rendered route: planted rows, dedupe against a subject the list already holds from its own source, a count proved derived, an empty state reached after planting, "opening marks it seen", the pre-slice projection asserted equal, and the cross-surface readback. **Nothing here stands in for any of that.** What 2S.2 owed was that the verbs are reachable from the attention surface at all. |
| `2S-ACCESS-*`, `2S-MOBILE-*` | 2S.3's, including the owner's device checkpoint. |
| a hosted proof | **not performed, and not needed** — this slice writes no schema. |
| a screen-reader run | **not performed.** The announcement contract is asserted in the accessibility tree, which is not the same thing and is not claimed to be. |

### One inconsistency this slice introduces, named rather than buried

Home's attention count now includes the notices, because the heading, the
"view all" link and the quiet state all read the same number and a surface that
says *"Nada precisa de você agora."* above an unanswered notice is making a
claim. **But the destination that link points at — `/app/inbox?view=needs-you` —
does not show them.** So a day with one entry item and one notice reads **2** on
Home and lists **1** on the queue.

Choosing the other side would have been worse: a count that excluded the rows
below it is a count that contradicts what the reader can see on the same screen.

**It is not fixed here on purpose.** The needs-you queue carries filter chips
whose interaction with a third kind of row is a **product decision**, and taking
it would be scope this slice was not given. It is `2S-ATTENTION`'s to close —
`2S-ATTENTION-002` and `-003` are exactly about what that surface counts and
shows — and slice 2S.3 must either mount the notices there or change what the
link says.

### One ordering tension in the plan, recorded rather than resolved silently

`2S-SILENCE-008` (*"the same action is reachable from home"*) and `2S-ACT-011`
(*"asserted equal across `/app/notifications` and the attention surface"*) are
assigned to **2S.2**, while `2S-ATTENTION-001` (*"the home attention surface
shows unanswered notices"*) is assigned to **2S.3**. Measured against the tree,
the first two cannot be satisfied without the third: before this slice the queue
held only entry-derived and memory-derived rows, and `notification_suppressions`
accepts only `task` and `reminder` subjects — so no row already on that surface
could carry a suppression.

**This slice therefore delivers the mount and the shared authority on `/app`,
and does not claim any `2S-ATTENTION` requirement.** The plan's own summary of
2S.2 says the verbs land *"on `/app/notifications` and with the same meanings on
the attention surface"*, so this is the reading the plan already carried; what
was missing was a record saying which half of the overlap each slice owns.

---

## 10. Classification

| Requirement | Class | Evidence |
|---|---|---|
| `2S-SILENCE-007` | **built** | §1 — the control exists on `/app/notifications` and the suppression it creates is read back; pgTAP §3c calls the RPC and reads the row |
| `2S-SILENCE-008` | **built** | §1, §2 — the same mount on `/app`, from the same handler bundle; pgTAP §3d calls the identical RPC |
| `2S-SILENCE-011` | **built** | §3 — pgTAP §3a … §3d, each verb alone, the other three read and asserted unchanged |
| `2S-ANSWER-001` | **built** | the verb sends `status="dismissed"`; pgTAP §3b writes it and reads it back |
| `2S-ANSWER-002` | **built** | `action-copy.ts` names what is lost, both locales; pgTAP §2 proves the behaviour the sentence promises — a future notice can still arrive |
| `2S-ANSWER-003` | **built** | two controls, two outcomes (pgTAP §3a vs §3b), two sentences (`verbs.test.ts`, both locales) |
| `2S-ANSWER-004` | **built** | pgTAP §1 — the heartbeat **called** after a dismissal, no duplicate, exactly one row on the key |
| `2S-ANSWER-005` | **baseline** | the page's filter is byte-identical and now guards a state §3b produces |
| `2S-ANSWER-006` | **rule** | pgTAP §5 — each member written and accepted, a fourth written and refused, the row read after the refusal |
| `2S-ANSWER-007` | **built** | pgTAP §3a — the subject re-read unchanged, the other notice re-read unread, no suppression, read after `reset role` |
| `2S-ANSWER-008` | **built** | pgTAP §2 — proved by **calling** `run_user_heartbeat`, not by reading the rule |
| `2S-ACT-001` | **built** | `primaryVerbFor` over `verbsForRow`; two subjects in different states render different primaries **in one rendered list** (`home-notices.test.tsx`) |
| `2S-ACT-002` | **built** | the rendered row carries exactly two controls at rest, asserted against the DOM and not against the source |
| `2S-ACT-003` | **built** | §2's census — `applyWorkItemAction`, named, pre-existing, and the only completion path |
| `2S-ACT-004` | **built** | §2's census — `applyTaskDetailCommand` with `reschedule_due`; the owner's zone resolves through the one contract |
| `2S-ACT-005` | **built** | the census proves `isEligibleStatus` is imported in exactly one module; a completed subject offers no *concluir* |
| `2S-ACT-006` | **built** | the two groups are worded around different nouns, asserted in both locales |
| `2S-ACT-007` | **built** | *its limit is stated rather than absorbed* — the control is disabled while pending **and** a forced second click dispatches once — asserted at the authority, by call count. The row-reading half of the requirement's wording rests on the deployed per-row-per-action operation key, which this surface **reuses** rather than reimplements (`2S-TRUST-011`); the key is minted in a ref rather than in the render body, so StrictMode's double render cannot make a legitimate action look like a replay. |
| `2S-ACT-008` | **built** | the row survives a thrown action with its content intact; the reason is a closed-set sentence; a stale refusal says so and offers its reload |
| `2S-ACT-009` | **built** | the affordance is `UndoAffordance`, the one the Work surfaces mount; the offer comes from the database's own answer and is `null` for both message dispositions. The suppression undo was **exercised against the deployed database** in slice 2S.1's deployment record; the task undo is the Work surfaces' own, already exercised |
| `2S-ACT-010` | **built** | the question is in the same panel, names what is lost, and cancelling issues no request — asserted on both surfaces |
| `2S-ACT-011` | **built** | §2 — the census, fourteen assertions, with a derived surface list asserted non-empty |
| `2S-ACT-012` | **built** | every control is followed by a read of the state it claims to have changed — in the component tests at the dispatch boundary, and in pgTAP §3a … §3d at the row |

**23 built or accounted for. 0 undelivered. 0 deferred.**

---

## 11. Where the next session starts

Slice **2S.3**, re-audited against the `main` this slice produces. It owns the
`2S-ATTENTION`, `2S-ACCESS` and `2S-MOBILE` requirements, and it **stops at the
owner's `2S-MOBILE-003` device checkpoint**, which no automated lane
substitutes.

**A guard must forbid the act, not the word — and a threshold with slack passes
the defect it exists to catch.**

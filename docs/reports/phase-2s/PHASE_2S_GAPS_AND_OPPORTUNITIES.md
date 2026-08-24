# Phase 2S — gaps and opportunities

**Companion to [`PHASE_2S_CURRENT_EXPERIENCE_AUDIT.md`](./PHASE_2S_CURRENT_EXPERIENCE_AUDIT.md).**
The audit says what is true. This says what is missing, what it would be worth,
and — for most of it — **why it should not be built next.**

Nothing here declares a requirement or allocates anything.

---

## 1. The gap the phase is named for

**The product can speak. It cannot be answered.**

Every autonomous thing the product does arrives in one direction. The heartbeat
computes, the ledger fills, the surface lists — and the owner's only reply is to
mark a row read, which changes nothing at all about what arrives tomorrow.

Measured: **54 `task_stale` notices about 3 tasks in 18 unbroken days, 0 read, 0
dismissed, dismissal unreachable, and the suppression window never reads
`status`.** The three tasks were last touched on 2026-07-30.

**The asymmetry is the argument.** `pending_questions` can be snoozed.
`reminders` can be snoozed. `notifications` — the only one that fires daily —
cannot. The product built *"not now"* twice, deliberately, and skipped the place
it was most needed.

This is the largest gap between what the product does and what a *contextual
agent* implies, and it is the only large gap that is **buildable against evidence
that already exists** (audit §4).

---

## 2. Gaps that are real and should not be next

Each is genuinely missing. Each has a reason it loses to §1.

### 2.1 Nobody talks to the Brain

**Zero conversations. Zero `chat` rows in `ai_usage_events`. With a validated
BYOK credential active since 2026-08-02.**

The product's headline promise has never been exercised once, and — measured —
`2P-CHAT-007-JOURNEY`'s standing classification of *"unspendable"* is now
**false**. The credential is there.

**Why not next:** the corpus is **one entry and one memory**. A correctly
grounded agent would answer *"I don't know"*, truthfully, and the phase would
close on a thin honest sentence. This is the same disqualification Phase 2R's
audit applied to autonomy, and the numbers have moved **down** since, not up.

**One thing whoever takes this must know:** the classification correction stands
independently of the theme. Do not inherit *"unspendable"* from a document again
— read `user_ai_credentials`.

### 2.2 Nothing has ever been finished

**Zero tasks have ever reached `completed`.** All eight statuses are reachable in
code; only `inbox` and `cancelled` have ever been used, and the two cancellations
on 2026-08-15 are the only status changes in the product's history.

**Why not next:** this is not a missing control, and building one would be
building against a diagnosis nobody has made. It is *evidence for* §1 rather than
a theme of its own: a backlog nobody advances and a nag nobody can stop are the
same fact seen from two ends.

### 2.3 Recurring tasks

The natural sequel to Phase 2R, and a different object. Tasks carry a
confirmation lifecycle, dependencies, projects, people and an undo-compensation
contract, each of which acquires a recurrence dimension.

**Why not next:** `OD-2R-6` prices it at **+6 to +9 days and a further
migration**, and §2.2 is the sharper objection — recurrence repeats a completion
that has never once happened.

### 2.4 A search cannot be returned to

Re-verified 2026-08-24. `/app/search` reads **no** `searchParams`; **24** other
route files do. A search cannot be linked, shared or bookmarked, and navigating
to a result and back loses query, filters and results.

**Why not next:** `OD-2R-9` already routed it to a small separate initiative, and
the census sharpens the objection — with **one** entry there is almost nothing to
search for. Carried as `OD-2S-8` option C.

### 2.5 *Precisa de você* forgets the filter

`needs-attention-list.tsx:169` holds `activeFilter` in component `useState` with
no URL backing, so back navigation resets it. This is `2P-ATTENTION-008`'s open
half.

**Why it is uncomfortable rather than simply excluded:** slice 2S.3 will have
**that exact file** open. Leaving a known defect in a file you are editing is a
real cost, and `OD-2S-8` puts it in front of the owner rather than deciding it
silently. The recommendation is still **out**, on the standing instruction that
the successor must not become a debt container — but the recommendation is a
close call and says so.

### 2.6 A review cannot cite its sources

`2P-REVIEW-CITATIONS` was named a **priority pendency for the roadmap successor**
by Phase 2P's closing report. The minimal model is one `jsonb` column in the shape
`conversation_messages.citations` already ships. It costs one migration.

**Why not next:** `summaries` holds **zero rows**. There is no review to cite
from, and the phase would deliver a column nothing fills. It travels with §2.1.

### 2.7 The dark accessibility scan runs against fixtures

`e2e/accessibility.spec.ts` uses `page.setContent`, and axe otherwise runs only
in the manual lane behind auth (`2R-AXE-MANUAL-LANE`).

**Why not next:** test infrastructure. `2S-ACCESS-004` narrows it for the routes
this phase changes and **does not close it**, which is the honest classification.

---

## 3. Gaps that are not this project's to close

| gap | why it is not ours to close next |
|---|---|
| Push delivers nothing (**HTTP 403**), `notification_deliveries` = **0** | an **unexplained third-party refusal** after a self-consistent VAPID pair. It has its own initiative, and folding it into a product phase would make that phase's completion depend on Apple. `OD-2S-6` and `2S-TRUST-008` |
| Push on **Android**: never executed | the owner has **no Android device**. An owner decision |
| **`RG-DEP-3`** restore drill | rollout track, and **destructive**: the environment is the whole problem. **It cannot be closed by writing a file** |
| **VoiceOver** | **NOT EXECUTED — OWNER WAIVED.** Not a gap to close; a waiver to respect. Never to be described as approved, tested or passing |
| **`RG-DEP-1`** production SMTP | rollout track |
| **`RG-QUO-3`** sweeps not scheduled | rollout track, ADR-082 |

### 3.1 ADR-055 expires inside this phase's window — **dated, and named so it is not missed**

ADR-055 set a **90-day expiry** on the semantic-retrieval evidence standard: at
expiry without a met threshold, *"an ADR removes semantic retrieval from the
active roadmap until a new demand signal appears."* The date is **2026-10-27** —
**64 days** from this package.

Measured: the spike tier needs **50 qualifying commands** across 10 distinct
active days. `task_command_applied` holds **2**. **The threshold will not be
met.**

**Nothing in this repository fires on a date** — ADR-055 says so itself — so this
is an owner action with a deadline. `OD-2S-10` recommends it stays **out** of the
phase, and this package does not resolve it.

### 3.2 The dead-man switch still cannot see a gateway 401 — **operations, carried from Phase 2R**

Surfaced by PR #289. A gateway 401 is answered before the function body runs, so
neither `record_scheduled_job_run` nor `record_scheduled_job_failure` fires and
`scheduled_job_health` reads `failure_count: 0` throughout — **frozen, not red**,
and indistinguishable from a healthy idle job. It answered 401 for ten days.

The repair is sound and unchanged: **alert on staleness of `last_success_at`
rather than on a failure count.**

**Classification: operations — not a Phase 2S requirement.** It needs no product
surface and belongs with the deploy-and-operate track. **This phase does not
close it, and no document here may report it as closed.**

---

## 4. Opportunities that cost almost nothing

Listed because they are cheap and real, **not** as an argument to widen the
phase.

1. **`PHASE_2R_THREAT_MODEL.md` still reads 10 of 12 closed.** The final
   disposition of `T-2R-11` and `T-2R-12` lives only in ADR-135. One appended
   section would make the document of record agree with the ADR. **Outside this
   authorization**; named in audit §1.1.
2. **`STATE.md`'s tail sections remain ~1 month stale**, describing Phase 2C
   slices as unpushed. The prepended head is current, so severity is low, but a
   reader who scrolls is misled. Carried from Phase 2R's list, still open.
3. **A13's signal 2 is inert** (audit §8). **Repaired in this package**, because
   it is one of the guards this authorization covers and carrying it forward dead
   through a retarget would be indefensible.
4. **The `dismissed` filter guards an unproducible state.** One line, and it
   becomes real the moment `2S-ANSWER-001` ships. Not a separate opportunity —
   named so it is not mistaken for one.

**None of items 1, 2 is phase scope.**

---

## 5. The shape of the recommendation

| | |
|---|---|
| **Build** | the answer to what the product says — §1 |
| **Do not build yet** | chat and citations (§2.1, §2.6), recurring tasks (§2.3) |
| **Route out** | search continuity (§2.4) → `OD-2S-8` |
| **Decide, do not build** | the *Precisa de você* filter (§2.5) → `OD-2S-8`, **a close call** |
| **Leave alone** | push, Android, `RG-DEP-3`, `RG-DEP-1`, `RG-QUO-3`, VoiceOver — §3 |
| **Owner action with a date** | ADR-055, 2026-10-27 — §3.1 |
| **Prove, do not build** | voice end to end — audit §5.2 |
| **Fix in passing, because it is one of this package's own guards** | A13's inert signal — §4.3 |

**And the standing instruction that shaped all of it:** the successor must not
become a container for the project's accumulated debt. Every item above is named
with a destination, which is what keeps *"excluded"* different from *"forgotten"*.

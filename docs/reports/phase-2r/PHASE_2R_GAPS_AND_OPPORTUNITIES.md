# Phase 2R — gaps and opportunities

**Companion to [`PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md`](./PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md).**
The audit says what is true. This says what is missing, what it would be worth,
and — for most of it — **why it should not be built next.**

Nothing here declares a requirement or allocates anything.

---

## 1. The gap the phase is named for

**The product can hold a moment. It cannot hold a rhythm.**

Everything the product does well is *episodic*: capture something, interpret it,
confirm a task, answer a question, review a day. Every one of those is a
**single point in time**, and the schema says so — `reminders.remind_at` is one
`timestamptz`, and there is no column anywhere expressing repetition.

But most of a life is not episodic. *Every Monday. The first of the month. Every
quarter.* A contextual agent that cannot hold those is a very good notebook.

This is the largest gap between what the product is and what its own name
claims, and it is the only large gap that is **buildable with the data that
exists** (audit §4).

---

## 2. Gaps that are real and should not be next

Each is genuinely missing. Each has a reason it loses to §1.

### 2.1 The agent never acts

The most valuable missing thing, and **unbuildable today**. The entire policy
framework exists — per-category state, thresholds, freshness, an undo-block rule,
an audited policy writer — and nothing acts, correctly, because
`automation_calibration_observations` holds **2 rows** against a `task` threshold
of 50 at 0.90 precision. *(Revalidated 2026-08-23; it read zero on 2026-08-22 and
the producers have since fired for the first time — audit §10.2. The conclusion
is unchanged; the reason is now "far below the rate", not "nothing can be
recorded".)*

Four of the six categories have **no producer at all**, so they cannot accumulate
evidence even in principle.

**Why not next:** it would mean building the product's most dangerous
component — a writer that acts unasked — with **no evidence to validate it
against**, and shipping something that most likely never fires.

**One thing whoever takes this must know**, from audit §5 **as superseded by
§10.3**: the owner set `task` and `person` to `automatic_when_eligible` on
2026-08-20 and **undid it** before 2026-08-23, so the table is empty and the
computed default governs. **Read the rows, never a document** — including this
one. That instruction is the durable part; the state it described has now moved
twice in three days, which is exactly why the instruction exists.

### 2.2 A search cannot be returned to

Proved in audit §8. `/app/search` reads **no** `searchParams`; ten of the twelve
comparable routes do. A search cannot be linked, shared or bookmarked, and
navigating to a result and back loses query, filters and results.

**Why not next:** it is one surface brought into line with ten others — a slice,
not a phase. Offered as `OD-2R-9`, recommended as a small separate initiative.

### 2.3 *Precisa de você* forgets the filter

Proved in audit §3.1, with the mechanism: `activeFilter` is component-local
`useState` with no URL backing, so back navigation resets it. This is
`2P-ATTENTION-008`'s open half, now understood precisely.

**Why not next:** same reason as §2.2, and it travels with it.

### 2.4 Recurring **tasks**

The natural next question after recurring reminders — and a different object.
Tasks carry a confirmation lifecycle, dependencies, projects, people and an undo
compensation contract, every one of which would acquire a recurrence dimension.

**Why not next:** `OD-2R-6` prices it at **+6 to +9 days and a further
migration**. That is a second phase wearing a requirement's clothes.

### 2.5 `project` and `organization` review flows

The two the audit sized **medium** — `extraction-schema.ts` already emits both
arrays, so the candidates exist and only the review flow is missing.

**Why not next:** ADR-127 Decision 8 already routed all four flows to a separate
initiative, and this one would end with the honest but thin sentence *"nothing is
eligible yet"*, because `project` needs 60 reviewed subjects.

### 2.6 The dark accessibility scan runs against fixtures

`e2e/accessibility.spec.ts` uses `page.setContent`. Real-route lanes **already
exist** for mobile accessibility, so this is one spec's mechanism, not a coverage
hole.

**Why not next:** it is test infrastructure. ADR-129 already recorded it as *"the
more robust shape"*, available later.

---

## 3. Gaps that are not this project's to close

| gap | why it is not ours to close next |
|---|---|
| Push delivers nothing on the iPhone (**HTTP 403**) | an **unexplained third-party refusal** after a self-consistent VAPID pair. It has its own initiative, and folding it into a product phase would make that phase's completion depend on Apple |
| Push on **Android**: never executed | the owner has **no Android device**. A device, a borrowed one, or a decision to accept it unvalidated — an owner decision |
| **`RG-DEP-3`** restore drill | rollout track, and **destructive**: the environment is the whole problem. **It cannot be closed by writing a file** |
| **VoiceOver** | **NOT EXECUTED — OWNER WAIVED.** Not a gap to close; a waiver to respect. Never to be described as approved, tested or passing |
| A real BYOK conversation journey | **unspendable** — it needs the owner's own credential. Not declined, not failed |

### 3.1 The dead-man switch cannot see a gateway 401 — **operations, added 2026-08-23**

Surfaced by PR #289 and confirmed in audit §10.4. The unattended entry-dispatch
cron answered **401 for ten days** and the liveness monitor never went red,
because a gateway 401 is answered **before the function body runs** — so
`reportDispatchRun` fires neither `record_scheduled_job_run` nor
`record_scheduled_job_failure`, and `scheduled_job_health` read
`failure_count: 0` throughout: **frozen, not red**, and indistinguishable from a
healthy idle job.

The candidate repair is sound and is the right shape: **alert on staleness of
`last_success_at` rather than on a failure count.** A liveness check that
requires the watched thing to report its own death cannot detect the deaths that
prevent reporting.

**Classification: operations — not a Phase 2R requirement and not an
opportunity to widen this phase into.** It needs no product surface, it belongs
with the deploy-and-operate track, and folding an observability repair into a
phase about recurring reminders would be exactly the debt-container this phase
was told not to become. It is named here so that excluding it is a decision on
the record rather than an omission. **This phase does not close it, and no
document here may report it as closed.**

---

## 4. Opportunities that cost almost nothing

Listed because they are cheap and real, **not** as an argument to widen the
phase. Each would fit anywhere.

1. ~~**Correct the automation record.**~~ **Resolved by the owner, not by this
   package.** Three ADRs stated all six categories were `suggest_only` while two
   were `automatic_when_eligible`; ADR-131 Decision 6 corrected the record on
   2026-08-22. The owner has since **undone the opt-in** through the product's
   own audited undo, so the table is empty and those three ADRs describe the
   deployed state accurately again. Audit §10.3 records both facts — that they
   were wrong for a window, and that they are right now. Neither is tidied away.
2. **`STATE.md`'s tail sections are ~1 month stale.** *"Next priorities"* still
   describes Phase 2C slices as unpushed and Phases 2D–2F as future work. The
   prepended head — which is what every process reads — is current, so the
   severity is low, but a reader who scrolls is misled.
3. **The nested residual worktree pollutes local lint.** All six local ESLint
   errors come from `.worktrees/suggest-new-people/`, which ESLint walks into and
   CI never sees. ADR-128 Decision 9 says the worktrees stay; an ignore entry
   would cost one line and save the next reader an iteration.
4. **ADR-055 expires 2026-10-27** — 66 days out. **Nothing in this repository
   fires on a date**, by ADR-055's own admission, so it needs a human. Named here
   so it is not discovered late.

**None of these is phase scope.** Items 2–4 are backlog; item 1 is documentary
and rides with the ADR.

---

## 5. The shape of the recommendation

| | |
|---|---|
| **Build** | recurrence for reminders — §1 |
| **Do not build yet** | autonomy (§2.1), recurring tasks (§2.4), the review flows (§2.5) |
| **Route out** | search and attention continuity (§2.2, §2.3) → `OD-2R-9` |
| **Leave alone** | push, Android, `RG-DEP-3`, VoiceOver, the BYOK journey — §3 |
| **Fix in passing, at no cost** | the automation record — §4.1 |

**And the standing instruction that shaped all of it:** the successor must not
become a container for the project's accumulated debt. Every item above is named
with a destination, which is what keeps *"excluded"* different from *"forgotten"*.

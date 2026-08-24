# Phase 2S — theme options, measured against each other

**The owner chose A on 2026-08-24.** This document is retained as the record of
what was compared and why, because a choice whose alternatives are not written
down is indistinguishable from a preference.

Every number here was measured live on 2026-08-24 against the deployed project.
The full census is
[`PHASE_2S_CURRENT_EXPERIENCE_AUDIT.md`](../../reports/phase-2s/PHASE_2S_CURRENT_EXPERIENCE_AUDIT.md).

---

## The constraint applied before any preference

**The product is opened constantly and used almost never.**

| | |
|---|---|
| `needs_attention_viewed` on home | **170**, 2026-07-30 → **2026-08-24** |
| `entries` | **1**, created 2026-08-22 |
| `conversations` · `summaries` · `attachments` | **0 · 0 · 0** |
| `projects` · `contexts` · `organizations` · `tags` | **0 each** |
| tasks ever reaching `completed` | **zero** |
| AI operations ever invoked | **2 of 9** |

**Any theme whose completion depends on accumulated usage is not buildable now.**
That is the same constraint Phase 2R's audit applied to autonomy, and it applies
here with more force, not less: the counts have fallen since, not risen.

---

## The four options

| | theme | user value | risk | migrations | volume-dependent? | coherent as one phase? |
|---|---|---|---|---|---|---|
| **A** | **Responder ao Brain** — the notification and attention loop | **high** | medium | **1** | **no** | **yes** |
| B | Voltar ao que você estava fazendo — continuity | medium | low | **0** | no | **no** |
| C | Conversar com o Brain, com fontes | high on paper | **disqualifying** | 1 | **yes** | yes, against absent evidence |
| D | Rotina parte dois — recurring tasks | medium | medium-high | ≥1 | yes | yes |

---

## A — *Responder ao Brain*

**The user problem.** The product tells the owner the same three things every day
and gives them no way to answer, defer, or silence it from where it is said.

**The current experience, measured.** 57 notifications — 54 `task_stale`, 3
`task_overdue`. **0 read.** **0 dismissed**, and the disposition is unreachable.
**Exactly 3 per day for 18 unbroken days**, about **3 tasks** last touched
**2026-07-30**. The notice's destination is hardcoded to the task *list*. Marking
read suppresses nothing, because the heartbeat's suppression window never reads
`status` and the dedupe key carries the local date.

**Value.** The only candidate whose evidence is rows rather than argument. It
also decides whether Phase 2R shipped into anything: the first recurring reminder
fires **2026-08-26**, into a channel where push has delivered **zero** and 57
unread notices already sit.

**Pages and features.** `/app/notifications`, `/app` (*Precisa de você*),
`/app/work/[taskId]`, `run_user_heartbeat`, `markNotification`, the attention
projection.

**Dependencies.** None external. Independent of push by design (`OD-2S-6`).

**Plausible migrations.** **One.** Necessity proved in PRD §5: neither
`notifications` nor `tasks` has a `jsonb` column or any suppression vocabulary,
and the function change is itself a migration.

**Risks.** It touches `run_user_heartbeat`, deliberately untouched since Phase
2M. That is the phase's principal risk and the threat model treats it as such. A
silencing control that silences too much is worse than the nag it replaces.

**Remainders it would resolve.** None of the named list directly. It narrows
`2R-AXE-MANUAL-LANE` and would make Phase 2R's delivery reachable.

**Remainders that stay out.** All of PRD §7.1.

**Estimate.** ~5–7 working days, five slices.

**Why it belongs to one coherent phase.** One question — *what can the owner say
back?* — one surface family, one migration, one function.

---

## B — *Voltar ao que você estava fazendo*

**The user problem.** A search cannot be linked, shared or returned to; the
*Precisa de você* filter is lost on back navigation.

**The current experience, measured 2026-08-24.** `/app/search` reads **no**
`searchParams`; **24** other route files do. `needs-attention-list.tsx:169` holds
`activeFilter` in component `useState` with no URL backing.

**Value.** Medium. Real, cheap, low-risk.

**Plausible migrations.** **Zero.**

**Remainders it would resolve.** `OD-2R-9`'s two defects; `2P-ATTENTION-008`'s
open half.

**Estimate.** ~2–3 working days.

**Why it does not belong to one coherent phase.** Phase 2R's own audit said it in
terms: *"one surface brought into line with ten others — a slice, not a phase."*
And the census sharpens the objection: with **one** entry in the database, there
is almost nothing to search for and almost nothing to come back to. It would fix
a mechanism the owner has no occasion to exercise.

---

## C — *Conversar com o Brain, com fontes*

**The user problem.** The product's headline promise — an agent you converse with
— has had **zero** conversations; and a review still cannot link to the records
it was written from.

**The current experience, measured.** `conversations` = **0**,
`conversation_messages` = **0**, `summaries` = **0**, and `ai_usage_events` holds
no `chat` row — **with a validated BYOK credential active since 2026-08-02**.

**This corrects a standing classification.** `2P-CHAT-007-JOURNEY` is recorded
across three phases as *"unspendable — it needs the owner's own credential."*
`user_ai_credentials` holds one row: `openai`, `status = active`,
`validated_at = 2026-08-02`, no failure code. **It is spendable.** That
correction stands whether or not this theme is chosen.

**Plausible migrations.** One — `summaries.citations` `jsonb`, the shape
`conversation_messages.citations` already ships, named a priority pendency for
the successor by Phase 2P's closing report.

**Why it loses.** The corpus to converse over is **one entry and one memory**. A
correctly grounded agent would answer *"I don't know"*, truthfully, and the phase
would close on a thin honest sentence. This is the same disqualification the 2R
audit applied to autonomy, and it is not weaker here.

**Remainders it would resolve.** `2P-CHAT-007-JOURNEY`, `2P-REVIEW-CITATIONS`.

**Estimate.** ~4–6 working days.

---

## D — *Rotina parte dois: tarefas que se repetem*

**The user problem.** Reminders repeat; tasks do not.

**The current experience.** `reminder_series` ships from Phase 2R. Tasks have no
recurrence dimension.

**Plausible migrations.** At least one. `OD-2R-6` priced the whole item at **+6
to +9 days and a further migration**.

**Risks.** Tasks carry a confirmation lifecycle, dependencies, projects, people
and an undo-compensation contract; each acquires a recurrence dimension.

**Why it loses, and the counter-evidence is blunt.** **Zero tasks have ever
reached `completed`** in the product's history — the only status changes ever
made are two cancellations on 2026-08-15. Recurrence repeats a completion that
has never once happened. It is also the sequel to a feature that has not yet
delivered a single notification.

**Remainders it would resolve.** `2R-TASK-RECURRENCE`.

**Estimate.** 6–9 working days, ≥1 migration.

---

## Named and deliberately not offered as a phase

**Proving what already exists.** Three items are real, cheap, and are
**checkpoints or a decision rather than a phase**:

1. **Voice, end to end.** `voice-composer.tsx` ships and is mounted at
   `composer.tsx:575`; its contract is *record → transcribe → **the composer's
   editable field** → type more → submit*, inserting at the caret — which is
   exactly the capability the owner named as a future priority. `captureMode:
   "voice"` was selected **once**, on 2026-08-22, and `ai_usage_events` holds
   **zero** `transcription` rows. **It is built and has never run end to end.**
   What is owed is a proof on the owner's device, or a defect report if it fails.
2. **ADR-055's expiry**, 2026-10-27, 64 days out. The spike tier needs 50
   qualifying commands; `task_command_applied` holds **2**. The threshold will
   not be met and the ADR removing semantic retrieval from the roadmap is owed.
3. **`2R-RECURRENCE-LANE-UNRUNNABLE`** — operations.

Named so that excluding them is a decision on the record rather than an omission.

---

## The recommendation, and the reason it is not a preference

**A**, alone, and **B routed out rather than folded in.**

1. **It is the only candidate whose evidence already exists.** 54 rows, 18
   unbroken days, 0 reads. B, C and D are argued; C and D are volume-dependent in
   the way this repository has already ruled disqualifying.
2. **It is the loop the product is currently failing.** 170 home views against 1
   capture is not a missing feature. It is a product whose daily output its only
   user has rationally learned to ignore.
3. **It decides whether Phase 2R shipped into anything.**

**B is routed out** because `OD-2R-9` already gave it a destination and the
owner's standing instruction is that the successor must not become a container
for the project's accumulated debt. `OD-2S-8` puts that choice in front of the
owner rather than making it silently, because slice 2S.3 will have the file open.

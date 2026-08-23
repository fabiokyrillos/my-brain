# Phase 2R — the theme, and the three it is not

**This document exists because the objective was derived, not inherited.** The
published roadmap — `PHASE_2K_2O_ROADMAP_DESIGN.md` — **ends at Phase 2O**.
Phase 2P and Phase 2Q were each derived from a measured census of the product,
and this phase is derived the same way. There is no roadmap entry to obey and
**no predefined theme for the letter after 2Q.**

Everything below rests on
[`PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md`](../../reports/phase-2r/PHASE_2R_CURRENT_EXPERIENCE_AUDIT.md).
Read §4 of that audit first: it contains the one fact that decides the ranking.

**The choice is `OD-2R-1` and it is the owner's.** A recommendation is not a
signature. Option A is recommended; the PRD is written for option A; and if the
owner picks another, **the requirement set is replaced rather than amended** —
which is why the cost of each alternative is stated here rather than implied.

---

## The constraint that ranks them

| table | rows, read live |
|---|---|
| `automation_calibration_observations` | **2** *(was 0 on 2026-08-22)* |
| `reminders` | **1** |
| `summaries` | **0** |
| `automation_category_policies` | **0** *(was 4; the owner undid them)* |

*Re-read live on 2026-08-23 against `main` `73f30b39`. The movement is explained
in audit §10.2 and §10.3 and changes one argument below without changing the
ranking.*

**This is a pre-MVP with one user and almost no accumulated data.** So the first
question asked of every option is not *"how valuable is it?"* but **"can it be
finished at all with the data that exists?"** Two of the four fail that question
before their value is even weighed.

---

## Option A — **Rotina: o que se repete** · *Routine: what repeats* — RECOMMENDED

**The product has no concept of anything that recurs.** `public.reminders` has
columns `id · user_id · task_id · entry_id · title · remind_at · important ·
status · snoozed_until · sent_at · created_at · updated_at` and **no recurrence
column of any kind** — verified in the migration that creates it and in the one
migration that has ever altered it.

A personal contextual agent that cannot hold *"every Monday"*, *"on the first of
the month"* or *"every quarter"* cannot hold the part of a life that is
routine — which is most of it. The owner already met this edge: Phase 2P's
`2P-REMINDER-002` named recurrence, recurrence needed a third migration that
phase had not budgeted, and it was **refused by name** as
`2P-REMINDER-RECURRENCE`. The refusal was a budget decision, not a judgement
that recurrence is unwanted.

**Why it wins.** It is the only option that is simultaneously high-value,
**independent of usage volume**, self-contained (no external provider, no owner
hardware in the critical path), and closes a remainder the owner has already
seen and felt.

**Why it is not free.** Recurrence is a **wall-clock intention**, and this
repository has scar tissue exactly there: three different local-day
implementations existed at once, two of them wrong in opposite directions, and a
fixed instant lands in the previous day where local midnight does not exist.
Daylight saving is the hard part of this phase, not a footnote.

- **User value:** high, immediate, perceptible on the first use.
- **Risk:** medium — concentrated in time semantics, which is where this
  repository has historically been wrong.
- **Migrations:** 1 near-certain, a 2nd plausible. `OD-2R-7`.
- **Owner needed for:** lifting the `2P-REMINDER-RECURRENCE` refusal (`OD-2R-8`),
  the model, the DST policy, and a device checkpoint.
- **Explicitly out:** recurring **tasks** — a different object with a different
  lifecycle. Offered as `OD-2R-6` with its cost, not smuggled in.

---

## Option B — **Autonomia: o agente age** · *the agent acts*

Close the loop the whole product points at: let the Brain act on its own, having
earned the right. Phase 2P built the entire policy framework — per-category
policy, calibration thresholds, freshness rules, an undo-block rule, an audited
writer for the policy itself — and **enabled nothing**, correctly, because the
evidence to enable it did not exist.

**It is the most valuable thing on this list and it is the one that cannot be
built now.**

- `automation_calibration_observations` holds **2 rows** — one `task`, one
  `person`, both written 2026-08-23. *(This read **zero** on 2026-08-22, and the
  correction matters: the producers **do** fire. See audit §10.2.)*
- `task` alone needs **50** reviewed subjects at **0.90** precision, **≥10**
  inside 90 days, newest inside 30. `person` needs 80 at 0.97. Evidence accrues
  at **two rows per reviewed entry**, so the gap is a rate problem, not an
  impossibility — and a rate this far below the threshold is still
  disqualifying **today**.
- **Four of the six categories have no producer at all** —
  `private.automation_category_has_producer` returns true only for `'task'` and
  `'person'`, so `project`, `organization`, `memory` and `relation` can never
  accumulate anything.

A phase choosing this would build **the most dangerous component in the product —
a writer that acts without being asked — against zero evidence to validate it**,
and would most likely ship something that never fires. That is not a reason to
abandon it; it is a reason it is not next.

- **User value:** highest.
- **Risk:** **high**, and the failure mode is silent.
- **Migrations:** 1–2.
- **Blocked by:** data volume that does not exist. **Disqualifying today.**
- **Note:** §5 of the audit found that the owner has **already** set `task` and
  `person` to `automatic_when_eligible`. Whoever eventually takes this theme
  must start from that fact, not from the ADRs that say otherwise.

---

## Option C — **Encontrar e voltar** · *find it, and come back to it*

Fix the two proved defects in §8 of the audit and close an inherited remainder:
make a search linkable and restorable, and make *Precisa de você* remember the
filter you chose.

The measurement that makes this coherent: **ten of the twelve list routes already
put their state in the URL** — `history`, `work`, `tasks`, `people`, `projects`,
`memories`, `files`, `reviews`, `calendar`, `notifications`. **`search` and
`library` are the only two that do not**, and `search` is a primary surface whose
query, filters *and results* live in `useState`.

So this is not new behaviour. It is **one surface brought into line with ten
others**, plus `2P-ATTENTION-008`'s back-navigation half, whose mechanism §3.1 of
the audit now proves.

- **User value:** medium — real, modest, and felt every time.
- **Risk:** **low.**
- **Migrations:** **zero.**
- **Honest assessment:** this is **a slice, not a phase.** As a phase it would be
  thin; as the first slice of something else, or as a standalone small
  initiative, it is well-shaped. It is offered because it is the cheapest real
  improvement available and because the owner should be able to choose it.

---

## Option D — **Evidência para autonomia** · a narrow half of B

Build review flows for `project` and `organization` only — the two the audit
sized as **medium**, because `extraction-schema.ts` already emits both arrays —
plus a surface that shows honest progress toward eligibility. **No automatic
writer.**

This is the sanctioned first step of B, and ADR-127 Decision 8 already routed the
four flows to *"a separate initiative"*, which this would be.

- **User value:** medium — the visible part is a review flow and a progress
  surface.
- **Risk:** medium-low.
- **Migrations:** 0–1.
- **The problem:** it inherits B's volume dependency in weaker form. It would let
  evidence *begin* accumulating; it would not let anything become eligible, and
  at current usage `project` would need **60** reviewed subjects. The phase would
  end with the honest sentence *"nothing is eligible yet"*, which is true but is
  a thin thing to show for a phase.
- **`memory` and `relation` stay out regardless:** `memory` changes the AI
  extraction contract and the Deno worker with it; `relation` is blocked by
  `2N-RELATION-TRIGGER`, which needs an owner decision and a migration of its own.

---

## Side by side

| | **A · Rotina** | B · Autonomia | C · Encontrar e voltar | D · Evidência |
|---|---|---|---|---|
| user value | **high** | highest | medium | medium |
| perceptible on first use | **yes** | no | yes | partly |
| risk | medium | **high** | low | medium-low |
| where the risk lives | DST / wall-clock time | a writer nothing can validate | — | thresholds never met |
| migrations | 1–2 | 1–2 | **0** | 0–1 |
| depends on usage volume | **no** | **yes, disqualifying** | no | yes, weakly |
| external dependency | none | none | none | none |
| owner hardware in critical path | checkpoint only | checkpoint only | checkpoint only | checkpoint only |
| closes a named remainder | **`2P-REMINDER-RECURRENCE`** | `2P-AUTONOMY-003` | `2P-ATTENTION-008` | `OD-2Q-8`'s two medium flows |
| phase-sized? | **yes** | yes | **no — a slice** | marginal |
| owner signature needed beyond the theme | lift the refusal | — | — | — |

---

## The recommendation, and what it excludes

**Option A.** It is the only option that is phase-sized, high-value,
volume-independent, free of external and hardware dependencies in its critical
path, and closes a remainder the owner has already run into.

**Explicitly excluded from Phase 2R if A is chosen**, each with a destination
rather than a silence:

| excluded | destination |
|---|---|
| recurring **tasks** | `OD-2R-6` — offered with its cost; out by default |
| autonomy / the automatic writer (option B) | a later phase, once evidence exists |
| the four automation review flows | separate initiative, `OD-2Q-8` unchanged |
| search URL state · *Precisa de você* filter (option C) | `OD-2R-9` — a small separate initiative by default |
| push HTTP 403 · Android | `push-hardware-validation`; external + hardware |
| `RG-DEP-3` restore drill | rollout track; **not closable by writing a file** |
| dark accessibility scan on real routes | backlog, test infrastructure |
| `2P-CHAT-007-JOURNEY` | unspendable until the owner spends their credential |
| VoiceOver `2P-ACCESS-005` | **NOT EXECUTED — OWNER WAIVED**; never a priority, never reported as passing |
| ADR-055 expiry, 2026-10-27 | owner, dated, 66 days out |

**This phase is not a container for the project's debt.** Every line above is
named so that excluding it is a recorded decision rather than an omission.

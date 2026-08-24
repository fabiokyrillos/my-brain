# Phase 2S — Responder ao Brain: o que o produto diz, e o que você pode dizer de volta

**Status: PLANNING ONLY.** Authorized by **ADR-136**, which authorizes this
package and nothing else. **No implementation, no migration, no deployment, no
hosted write, no BYOK spend, no AI call, no push work, no signup change, no
rollout change, and no successor phase.**

**The theme was chosen by the owner** on 2026-08-24 from four costed options in
[`PHASE_2S_THEME_OPTIONS.md`](./PHASE_2S_THEME_OPTIONS.md), against the measured
census in
[`PHASE_2S_CURRENT_EXPERIENCE_AUDIT.md`](../../reports/phase-2s/PHASE_2S_CURRENT_EXPERIENCE_AUDIT.md).

**ALL TEN DECISIONS ARE SIGNED — ADR-137, 2026-08-24.** `OD-2S-1` A · `OD-2S-2`
A · **`OD-2S-3` B** · `OD-2S-4` B · `OD-2S-5` B · `OD-2S-6` A · `OD-2S-7` A ·
`OD-2S-8` A · `OD-2S-9` A · `OD-2S-10` A.

**`OD-2S-3` was signed B, against this package's recommendation of A**, and the
owner gave the reason: *"apenas corrigir o link para a tarefa não entrega o
objetivo que escolhi."* The recommendation is **kept in §2 exactly as written**
rather than rewritten into agreement — a package that quietly revises what it
recommended after the answer is a package whose recommendations mean nothing.
What changed is the requirement set: **§3.5 `2S-ACT` is a new family of twelve**,
and thirteen requirements were appended to six existing families. **No
identifier was renumbered, reused or removed.**

The companion documents are the implementation plan
([`PHASE_2S_IMPLEMENTATION_PLAN.md`](./PHASE_2S_IMPLEMENTATION_PLAN.md)) and,
under `docs/reports/phase-2s/`, the audit, the gaps report, the threat model,
the traceability contract and the requirement coverage.

---

## 1. The subject

**The product speaks every day, and it cannot be answered.**

Measured on 2026-08-24 against the deployed database:

| | |
|---|---|
| notifications | **57** — 54 `task_stale`, 3 `task_overdue` |
| read | **0 of 57** |
| dismissed | **0** — and the disposition is unreachable |
| rate | **exactly 3 per day**, 2026-08-17 → 2026-08-24, unbroken |
| subject | **3 tasks**, `inbox`, no due date, `updated_at` **2026-07-30** |
| delivered by push | **0** |

Three tasks nobody has touched in twenty-five days have generated fifty-four
notices in eighteen days, and not one has been read. That is not a failure of
attention. It is the only rational response to a message that cannot be
answered:

- the notice's **`action_url` is hardcoded to `/pt-BR/app/tasks`** — the whole
  list, not the task;
- the surface offers **two controls**, *Abrir* and *Lida*;
- **marking read suppresses nothing.** The heartbeat's suppression is
  `created_at > now() - interval '24 hours'` and never reads `status`, and the
  `dedupe_key` carries the **local date** — so the same subject re-notifies every
  day, forever;
- **`dismissed` is unreachable.** `markNotification` accepts
  `z.enum(["read","dismissed"])` and has exactly one caller, which always sends
  `"read"`. The list then filters `.neq("status","dismissed")` — a filter
  guarding a state nothing in the product can produce.

The only escapes are inside the task: complete it, cancel it, defer it, mark it
waiting, or give it a due date. Five steps, on a surface the owner would have to
reach through a link that points somewhere else, to stop a message they receive
three times a day.

**The product already knows how to be told "not now" — twice.** This is what
makes the gap an asymmetry rather than a missing feature:

| object | statuses | can it be deferred? |
|---|---|---|
| `pending_questions` | `open, answered, dismissed, snoozed` + `snoozed_until` | **yes** — Phase 2D built it |
| `reminders` | `scheduled, sent, snoozed, cancelled` + `snoozed_until` | **yes** |
| **`notifications`** | `unread, read, dismissed` — **no snooze, no `snoozed_until`** | **no** |

**Two of the three things the agent says to its owner can be answered. The third
— the only one that fires daily — cannot.**

### 1.1 Why this and not something else

The census measured a second fact that decides the shape of any phase chosen
now: **the product is opened constantly and used almost never.** 170
`needs_attention_viewed` on home, from 2026-07-30 through today, against **one**
captured entry; zero conversations; zero summaries; zero attachments; seven of
the nine AI operations never once invoked; and **no task ever reaching
`completed`.**

Every other candidate theme either needs accumulated usage the product does not
have, or is a slice wearing a phase's clothes. This one does not: **its evidence
is fifty-four rows that already exist**, and it is the only candidate whose
completion can be measured against a number that is already true.

### 1.2 What this phase is not

- **It is not push.** `notification_deliveries` holds **zero** rows and the HTTP
  403 is an unexplained third-party refusal with its own initiative. This phase
  is **in-app only** and **must not resume, repair, or claim** push. `2S-TRUST-008`
  is that requirement.
- **It is not a second task lifecycle — and `OD-2S-3` B makes that harder, not
  moot.** The task detail already carries the full vocabulary — `inbox, todo,
  in_progress, waiting, blocked, deferred, completed, cancelled`, reachable in
  code including natural-language *adiada* and *postergada*. The signed decision
  brings two of those verbs onto the notification surface, so the rule sharpens
  rather than relaxes: **the surface may dispatch to the lifecycle, and may not
  reimplement it.** `2S-ACT-003` and `2S-ACT-004` name the destinations,
  `2S-TRUST-010` censuses them, and a new writer is a **stop condition**.
  `detail-controls.ts:66` already carries this discipline — `RENDERED_ELSEWHERE`
  exists so that one transition never has two routes on one screen — and the
  inline row is a third mount of a component the product already shares twice,
  not a fourth implementation.
- **It is not autonomy.** `automation_calibration_observations` holds **2** rows
  against a `task` threshold of **50** at 0.90 precision, and
  `automation_category_policies` holds **zero** rows. Nothing here reads
  `eligible`, and no automation category's state may be treated as consent for
  anything in this phase.
- **It is not a debt container.** Every remainder that stays out is named in §7.1
  with a destination.

---

## 2. Owner decisions — ALL TEN SIGNED (ADR-137, 2026-08-24)

Each states the measured context, mutually exclusive options, a recommendation,
the consequence, and the effect on budget and schedule.

**The recommendations below are preserved verbatim, including the one the owner
did not take.** ADR-137 records what was signed; this section records what was
proposed, and the two are deliberately allowed to disagree in the open.

| decision | signed | recommendation | agreed? |
|---|---|---|---|
| `OD-2S-1` — where the silence is stored | **A** | A | yes |
| `OD-2S-2` — what the owner can say | **A** | A | yes |
| **`OD-2S-3` — a link, or inline controls** | **B** | A | **NO — the owner's deliberate override** |
| `OD-2S-4` — how often the Brain may repeat itself | **B** | B | yes |
| `OD-2S-5` — where the unanswered appear | **B** | B | yes |
| `OD-2S-6` — push | **A** | A | yes |
| `OD-2S-7` — the migration budget | **A** | A | yes |
| `OD-2S-8` — `OD-2R-9`'s defects | **A** | A | yes |
| `OD-2S-9` — does the heartbeat change | **A** | A | yes |
| `OD-2S-10` — ADR-055 | **A** | A | yes |

**Signed is not authorized.** Implementation still needs a separate owner
decision, and until it exists no slice may start, no product code may be written
and no migration file may be made.

### `OD-2S-1` — where the silence is stored

**Context.** `notifications` has eleven columns and **no `jsonb`**; `tasks` has
twenty-three and **no `jsonb`**. There is no column anywhere that could hold a
suppression, and no `suppress`, `mute` or `nudge` vocabulary exists in
`supabase/migrations/`. Whatever is chosen, `run_user_heartbeat` changes — and in
this repository a function change **is** a migration.

| | option | cost | consequence |
|---|---|---|---|
| **A** | `notification_suppressions (user_id, subject_type, subject_id, notice_type, until, reason, created_at)` — a first-class, expirable, owner-scoped row | **1 migration** | generic: `task_stale`, `task_overdue` and the reminder notice all use one mechanism. Carries a reason, so the audit contract has something to record. Expirable, so *"not now"* is different from *"never"*. Polymorphic, so ownership must be proved by trigger — the shape `entry_entities` already uses |
| B | `tasks.nudge_muted_until timestamptz` | 1 migration | smaller, and **only works for tasks**. The next notice type needs a second column. Couples how the agent speaks to the subject's own row |
| C | reuse `notifications.status = 'dismissed'` as the suppression signal, adding no state | 1 migration (function only) | cheapest. But `dismissed` means *"I am done with this message"*, and the product's own copy says so; overloading it as *"never tell me again"* makes the word mean two things. **It also has no expiry**, so the only silence available is permanent |

**Recommendation: A.** It is the only option in which *"not now"* and *"never"*
are different sentences, and the only one that can carry a reason into the audit
log. **Effect on budget:** one migration either way; A and B create schema, C
does not.

**SIGNED: A — ADR-137.**

### `OD-2S-2` — what the owner can say

| | option | consequence |
|---|---|---|
| **A** | **two verbs** — *silenciar por um tempo* and *silenciar este assunto* | maps exactly onto `OD-2S-1` A's `until`. Two words, two meanings, no overlap |
| B | three verbs — add *não é relevante*, which also changes the task | starts re-implementing the task lifecycle on the notification surface; see §1.2 |
| C | one verb — *silenciar*, with a fixed window | fewest controls, but the owner cannot express *"never"* without cancelling a real task |

**Recommendation: A.** **Consequence of B:** two authorities over a task's status,
which the product has never had and should not acquire here.

**SIGNED: A — ADR-137.** Note that `OD-2S-3` B brings task verbs onto the
notification surface anyway; what `OD-2S-2` A settles is that the **silencing**
vocabulary stays two words, and what stops the task verbs becoming a second
authority is `2S-ACT-003`/`-004` routing them to the Server Actions that already
own them. The two decisions are compatible, and §3.5 is where that is made
checkable rather than assumed.

### `OD-2S-3` — acting on the subject: a link, or inline controls

**Context.** The notice's destination is hardcoded in the migration to
`/pt-BR/app/tasks`. The task detail at `/app/work/[taskId]` already carries every
status control.

| | option | consequence |
|---|---|---|
| **A** | fix the destination to point at the **subject**, and let the existing controls act | no second surface, no duplicated authority. The `action_url` fix rides in the same migration that changes the function |
| B | inline task controls on the notification row, calling the existing Server Actions | fastest for the owner, and the largest surface this phase would add. Every control needs its own accessibility, mobile and undo proof |
| C | both | widest, and the only option whose cost exceeds the phase |

**Recommendation: A.** **Consequence:** the owner still leaves the notification
to act, but arrives **at the task** rather than at a list of tasks — which is the
measured defect.

**SIGNED: B — ADR-137. This contradicts the recommendation, deliberately.** The
owner's reason, recorded verbatim: *"O tema 'Responder ao Brain' precisa permitir
agir no próprio aviso. Apenas corrigir o link para a tarefa não entrega o
objetivo que escolhi."*

**The recommendation above is not revised.** Its objection — that inline controls
risk a second authority over a task's status — was not wrong, and it is now a
**requirement and a stop condition** rather than an argument: `2S-TRUST-010`
forbids a new writer and makes one a stop condition, and `2S-ACT-003`/`-004`
name the existing Server Actions the verbs must route to.

**`2S-REACH` survives unchanged.** The owner said *merely* fixing the link does
not deliver the objective — not that the link stays broken. A row still needs a
destination for *ver a tarefa*, and `2S-REACH-004` (a subject that no longer
exists) matters **more** under B, not less. B adds actions beside the
destination; it does not replace it.

**Effect on schedule: +2 to +3.5 working days**, concentrated in slice 2S.2, and
the estimate in the implementation plan is recomputed rather than adjusted.

### `OD-2S-4` — how often the Brain may repeat itself

**Context.** Today: every day, forever, per subject, capped at three a day
overall. Measured: 3/day for 18 unbroken days.

| | option | consequence |
|---|---|---|
| A | **escalate then fall silent** — after N unanswered notices, stop | simplest. A subject that genuinely matters goes quiet permanently |
| **B** | **back off** — 1 day, then 3, then 7, then stop repeating | fixes the measured defect **without requiring the owner to do anything**, which matters when the evidence is that the owner does nothing |
| C | keep daily; rely on the owner silencing it | leaves the defect in place and makes silence the owner's chore |

**Recommendation: B, with a floor and a named ceiling.** **Consequence:** the
backoff must be derived from data the ledger already holds, and must be proved by
**calling** `run_user_heartbeat`, never by reading its source — the standard
slice 2R.4 set.

**SIGNED: B — ADR-137.**

### `OD-2S-5` — where the unanswered appear

**Context.** 170 `needs_attention_viewed` on home. Zero evidence of
`/app/notifications` ever being opened; 0 of 57 read.

| | option | consequence |
|---|---|---|
| A | an unread badge in the shell navigation | a number, not an item. Cheap |
| **B** | the unanswered notices appear **inside *Precisa de você*** on home | puts the item where the owner already is. Risk: duplicating a subject the attention list already shows from its own source, which `2S-ATTENTION-002` exists to refuse |
| C | both | widest |

**Recommendation: B.** **Consequence:** the attention projection gains a source
and must prove it does not double-count.

**SIGNED: B — ADR-137.** With `OD-2S-3` B signed alongside it, the attention
surface must offer the **same verbs with the same meanings** as the notification
page — `2S-ACT-011` — and acting in one must be reflected in the other —
`2S-ATTENTION-008`. Two surfaces that drift apart would be worse than one
surface, and the owner's contract names that risk directly.

### `OD-2S-6` — push

| | option | consequence |
|---|---|---|
| **A** | **out, by rule.** In-app only; push not resumed, not repaired, not claimed | the phase's value does not depend on Apple. `2S-TRUST-008` makes it a refusal with a name |
| B | attempt the 403 as part of delivery | the phase's completion becomes contingent on an unexplained third-party refusal |

**Recommendation: A.** **Consequence:** the owner will still not receive a
notification on the lock screen when this phase closes, and the closing record
must say so plainly.

**SIGNED: A — ADR-137.**

### `OD-2S-7` — the migration budget

**Proposed: exactly ONE.** Necessity is proved in §5, not asserted.

| | option | consequence |
|---|---|---|
| **A** | **one, allocated** | enough for `OD-2S-1` A **or** B **or** C. A second of any kind is a stop condition |
| B | two — one for the state, one for the function | invites the state and the rule to drift apart across slices |
| C | zero — hide the noise at read time in the application | the ledger keeps filling at 3/day forever; the defect becomes cosmetic and the audit trail stays noise |

**Recommendation: A.** **SIGNED: A — ADR-137: one migration is ALLOCATED.**

**Allocated is not created, and it is not permission to create.** No migration
file exists, none may be written, and the allocation is spent only when
implementation is separately authorized and slice 2S.1 runs. **`OD-2S-3` B does
not raise the ceiling** — every inline verb routes to an authority that already
exists, so the schema it needs is the one `OD-2S-1` A already buys. **A second
migration of any kind remains a stop condition**, and a requirement that needs
one halts the phase.

### `OD-2S-8` — `OD-2R-9`'s two defects and `2P-ATTENTION-008`

**Context.** *Precisa de você*'s `activeFilter` is component-local `useState`
with no URL backing (`needs-attention-list.tsx:169`), lost on back navigation.
`/app/search` reads **no** `searchParams` while **24** other route files do.
Slice 2S.3 will have the first of those files open.

| | option | consequence |
|---|---|---|
| **A** | **out** — `OD-2R-9`'s routing to a separate small initiative stands | honours the standing instruction that the successor must not become a debt container. The file is edited for another reason and the defect stays |
| B | in, the attention half only | one requirement, and the file is open anyway. Widens the phase by a real but small amount |
| C | in, both halves | `/app/search` has nothing to do with this phase's subject |

**Recommendation: A**, and it is the least comfortable recommendation in this
document: the phase will touch the exact file, and leaving a known defect in a
file you are editing is a real cost. **The owner's call.**

**SIGNED: A — ADR-137, and restated by the owner after `OD-2S-3` B widened the
work on that very file:** *"Mesmo que o arquivo de 'Precisa de você' seja
alterado, não absorva agora."* Filter preservation on navigation, and a linkable
search that can be returned to, **stay out** and stay in a short separate
initiative. `2P-ATTENTION-008` and `OD-2R-9`'s two defects are **not** discharged
by this phase editing their file.

### `OD-2S-9` — does the heartbeat itself change

| | option | consequence |
|---|---|---|
| **A** | **yes** — `run_user_heartbeat`'s candidate and suppression rules change | the function has been deliberately untouched since Phase 2M. **This is the phase's principal risk** and the threat model treats it as such |
| B | no — filter at read time in the application | the ledger keeps filling; the defect is hidden rather than fixed; and the notification count the owner sees stops matching the rows that exist |

**Recommendation: A.** **Consequence:** every rule the function already
enforces — quiet hours, the daily cap, the 24-hour cooldown, the per-user lock,
and one owner's failure not blocking the batch — becomes a `baseline`
requirement that must be **re-proved by execution**, not by reading the source.
`2S-CADENCE-004` … `-007` are that obligation.

**SIGNED: A — ADR-137.**

### `OD-2S-10` — ADR-055, which expires inside this phase's window

**Context.** ADR-055 set a 90-day expiry on the semantic-retrieval evidence
standard: at expiry without a met threshold, *"an ADR removes semantic retrieval
from the active roadmap until a new demand signal appears."* The date is
**2026-10-27**, **64 days** from this package. Its spike tier needs **50
qualifying commands**; `task_command_applied` holds **2**. **The threshold will
not be met.**

| | option | consequence |
|---|---|---|
| **A** | **out** — named with its date, and the ADR is the owner's to write | correct in principle: an ADR expiring is not phase scope |
| B | this phase carries the ADR | absorbs an unrelated decision into a phase about notifications |

**Recommendation: A.** **Consequence:** nothing in this repository fires on a
date — ADR-055 says so itself — so it is named here, in the audit, and in the
closing record, and it still needs a person.

**SIGNED: A — ADR-137.**

---

## 3. Requirements

**Ninety-nine requirements across eleven families.** Every one has a stable
identifier, belongs to exactly one family, is sequential within it, states an
**observable** criterion, names the slice that delivers it, and declares its
dependencies and the decisions it rests on.

**Twenty-five of them were added after the signatures, and every one was
appended.** `OD-2S-3` B changed the scope materially: `2S-ACT` is a new family of
twelve, and thirteen requirements were appended to the ends of `2S-SILENCE`,
`2S-ANSWER`, `2S-ATTENTION`, `2S-TRUST`, `2S-ACCESS`, `2S-MOBILE` and `2S-CLOSE`.
**No identifier was renumbered, reused or removed**, so a reference written
against the pre-signature package still resolves to the same requirement.
`src/lib/closeout/phase-2s-declarations.test.ts` asserts that property directly:
every pre-signature identifier is still present, and still means what it meant.

**No requirement carries a delivery class.** Classification happens at closeout,
from the slices' own acceptance records, and never from this document.

**Family names contain letters only.** `2K-A11Y` was invisible to every prose
count *and* to the phase-start detector because its family name contained
digits. This phase names its accessibility family **`2S-ACCESS`**, and
`2S-CLOSE-006` makes the property checkable rather than remembered.

**Legend for the *Kind* column — what the requirement asks for, not what
happened:** **build** = new behaviour; **baseline** = an existing property this
phase must prove still holds; **rule** = something deliberately not built, whose
delivery is the recorded refusal.

**`baseline` may never be recorded as `built`.** The contract has said so since
Phase 2Q, and nothing read it until Phase 2R's closeout generator compared
delivered classes against declared kinds and found **five requirements misfiled
since the phase's first slice**. `2S-CLOSE-003` and `-004` make the rule
executable here.

### `2S-FOUNDATION` — measure before changing anything · slice 2S.0

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2S-FOUNDATION-001` | The notification ledger's state is re-measured at slice start, not inherited from this PRD | A record shows the live counts by type, status and day, taken at the slice's own baseline SHA, **whatever they are** | baseline | — |
| `2S-FOUNDATION-002` | `run_user_heartbeat`'s current candidate and suppression rules are recorded from the deployed function | The `dedupe_key` construction, the 24-hour window, the rank ordering and the cap are quoted from `pg_get_functiondef`, not from a migration file | baseline | — |
| `2S-FOUNDATION-003` | The notification surface's current controls are listed from the component | Every control on `/app/notifications` enumerated from the source, with its destination | baseline | — |
| `2S-FOUNDATION-004` | The `dismissed` disposition's reachability is re-derived from the source tree | Every caller of `markNotification` listed with the `status` it sends; the finding confirmed or corrected | baseline | — |
| `2S-FOUNDATION-005` | Push delivery is re-read and recorded, whatever it says | `notification_deliveries` counted live; a non-zero count corrects this PRD rather than being filtered out | baseline | — |
| `2S-FOUNDATION-006` | The subjects currently generating notices are re-read, whatever their count | The stale-candidate predicate is run live; the record names the count it found rather than the count this PRD names | baseline | — |
| `2S-FOUNDATION-007` | Zero product behaviour changes in this slice | The slice's diff contains no change under `src/features/**` or `supabase/migrations/**` that alters behaviour | build | — |

### `2S-SILENCE` — the owner can say *not now* and *not this* · slices 2S.1 and 2S.2

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2S-SILENCE-001` | A notice's subject can carry a suppression | A suppression persists and reloads unchanged | build | `OD-2S-1`, `OD-2S-7` |
| `2S-SILENCE-002` | The suppression is validated at the boundary, and an invalid one is refused | A past-dated, unbounded or malformed suppression is rejected with a named reason; none reaches storage | build | `OD-2S-1` |
| `2S-SILENCE-003` | A suppression records a reason and an actor | Every stored row names who suppressed, why, and against what | build | `OD-2S-1` |
| `2S-SILENCE-004` | A suppression expires, and expiry is computed from the owner's local day | An expiry crossing a daylight-saving boundary lands on the intended local instant, asserted against the one timezone contract | build | `OD-2S-1` |
| `2S-SILENCE-005` | A suppression is owner-scoped, and proved so against a second owner | A second owner can neither read, create nor lift another owner's suppression; asserted through real roles with RLS forced | build | `OD-2S-1` |
| `2S-SILENCE-006` | A suppression is undoable, and the undo restores the prior state exactly | The registered handler is exercised, not asserted; a replay is refused | build | `OD-2S-1` |
| `2S-SILENCE-007` | The owner can suppress from the notification itself | The control exists on `/app/notifications` and the suppression it creates is readable afterwards | build | `OD-2S-2` |
| `2S-SILENCE-008` | The owner can suppress from the attention surface | The same action is reachable from home, and produces the same row | build | `OD-2S-2`, `OD-2S-5` |
| `2S-SILENCE-009` | A suppressed subject stops producing notices for the duration | `run_user_heartbeat` is **called** and produces none for that subject; the assertion reads rows, not source | build | `OD-2S-9` |
| `2S-SILENCE-010` | An expired suppression resumes notices | The clock is advanced past the expiry, the function is called again, and exactly one notice appears | build | `OD-2S-9` |
| `2S-SILENCE-011` | The four scopes are four different things, and each leaves the other three untouched | *Lida*, *descartar*, *silenciar por um tempo* and *silenciar este assunto* are exercised one at a time; after each, the other three subjects of change are read and asserted **unchanged**. A control that moved two of them fails | build | `OD-2S-2`, `OD-2S-3` |

### `2S-CADENCE` — the Brain does not repeat itself daily forever · slice 2S.1

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2S-CADENCE-001` | A repeated unanswered notice about the same subject backs off | The interval between successive notices for one subject grows; measured by calling the function across simulated days | build | `OD-2S-4`, `OD-2S-9` |
| `2S-CADENCE-002` | The backoff is bounded and terminates | A subject left untouched stops producing notices after the named ceiling; the ceiling is asserted, not assumed | build | `OD-2S-4` |
| `2S-CADENCE-003` | The backoff resets when the subject changes | Touching the task returns the cadence to its first interval | build | `OD-2S-4` |
| `2S-CADENCE-004` | Quiet hours, the daily cap, the 24-hour cooldown and the per-user lock are unchanged | Each is exercised by calling `run_user_heartbeat` and reading what it did — never by matching a substring against `prosrc` | baseline | `OD-2S-9` |
| `2S-CADENCE-005` | A reminder still outranks a stale nudge for a capped slot | A day holding both produces the reminder; asserted rather than inherited from the rank literal | baseline | `OD-2S-9` |
| `2S-CADENCE-006` | One owner's suppression or backoff never affects another's batch | A batch containing a suppressed owner and an unsuppressed one delivers correctly to both | baseline | `OD-2S-9` |
| `2S-CADENCE-007` | One user's failure still does not block the batch | A forced failure is logged and the batch continues, as slice 2R.4 proved for the timezone case | baseline | `OD-2S-9` |
| `2S-CADENCE-008` | Nothing is lost to silence | A subject that has stopped notifying is still present in the attention surface; silence is a change of channel, never a deletion | build | `OD-2S-4`, `OD-2S-5` |

### `2S-REACH` — a notice points at its subject, not at a list · slice 2S.1

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2S-REACH-001` | A task notice links to that task | Following the notice's destination lands on the subject's own page | build | `OD-2S-3` |
| `2S-REACH-002` | The destination is locale-correct and survives a locale switch | Both locales resolve; switching locale preserves the route | build | `OD-2S-3` |
| `2S-REACH-003` | Every notice type's destination is enumerated and each is proved to resolve | A table names every `type` the function can emit and the route it targets; each is exercised | build | `OD-2S-3` |
| `2S-REACH-004` | A notice whose subject no longer exists degrades to a named destination | The route resolves to a stated fallback rather than a 404, and the record says which | build | `OD-2S-3` |
| `2S-REACH-005` | The reminder notice's destination is proved for the first time | No `reminder`-type notification has ever existed; this exercises one rather than assuming the route | baseline | `OD-2S-3` |

### `2S-ANSWER` — the disposition the schema already has becomes reachable · slice 2S.2

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2S-ANSWER-001` | `dismissed` has a writer reachable from the surface | A control sends `status="dismissed"`, and the row reads back dismissed | build | `OD-2S-2` |
| `2S-ANSWER-002` | The copy says what dismissing means, and it matches what it does | The user-visible sentence is checked against the behaviour, in both locales | build | `OD-2S-2` |
| `2S-ANSWER-003` | Marking read and dismissing are distinct, and neither is described as the other | Two controls, two outcomes, two sentences; a control that did both would fail | build | `OD-2S-2` |
| `2S-ANSWER-004` | A dismissed notice is not re-created for the same subject-day | Calling the function again after a dismissal produces no duplicate | build | `OD-2S-9` |
| `2S-ANSWER-005` | The list's `dismissed` filter now guards a producible state | The filter is exercised against a row the product itself created | baseline | — |
| `2S-ANSWER-006` | Every disposition the schema allows is either reachable or refused by name | The `notifications_status_check` members are enumerated; any unreachable member is a recorded refusal, never an omission | rule | — |
| `2S-ANSWER-007` | *Lida* acts on the current message and nothing else | After marking one notice read, the subject task is re-read **unchanged**, any other notice about the same subject is re-read **unread**, and no suppression exists | build | `OD-2S-2` |
| `2S-ANSWER-008` | *Descartar* removes the current message from the experience and nothing else | After dismissing one notice, the subject still produces a notice when the cadence next permits one — proved by **calling** `run_user_heartbeat` rather than by reading the rule | build | `OD-2S-2`, `OD-2S-9` |

### `2S-ACT` — acting on the subject, from the notice itself · slice 2S.2

**Added by `OD-2S-3` B.** The whole family exists because the owner overrode the
recommendation, and the recommendation's objection — a second authority over a
task's status — is answered here by **routing rather than by rebuilding**.
`2S-ACT-003` and `-004` name the Server Actions the verbs must use, and
`2S-TRUST-010` makes a new writer a stop condition.

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2S-ACT-001` | A notice offers exactly one primary action, and which one is contextual | The primary action is derived from the subject's own state, not fixed in the component; two subjects in different states render different primaries in the same list | build | `OD-2S-3` |
| `2S-ACT-002` | Every other action lives in one compact menu | A row renders the primary action plus one menu trigger and nothing else; the count is asserted against the rendered row, not against the component's source | build | `OD-2S-3` |
| `2S-ACT-003` | Completing a task from a notice uses the authority that already owns completion | The dispatch reaches `WorkItemActions`' handler; a second implementation of the completion path fails the reuse census in `2S-TRUST-010` | build | `OD-2S-3` |
| `2S-ACT-004` | Rescheduling from a notice uses the authority that already owns rescheduling | The dispatch reaches `applyTaskDetailCommand` with `reschedule_due`; the owner's own timezone resolves through the one contract, not a second one | build | `OD-2S-3` |
| `2S-ACT-005` | An action is offered only where the subject's status admits it | Eligibility comes from `isEligibleStatus`, so no control can be rendered whose only possible outcome is a refusal; a completed subject offers no *concluir* | build | `OD-2S-3` |
| `2S-ACT-006` | An action that changes the task says so; an action that changes only the message says that | The two groups carry visibly different copy in both locales, and a control describing a task change in message words fails | build | `OD-2S-2`, `OD-2S-3` |
| `2S-ACT-007` | A pending action refuses a second submission of itself | The control is disabled while pending, and a forced double dispatch produces **one** write — asserted by reading rows, not by reading the disabled attribute | build | `OD-2S-3` |
| `2S-ACT-008` | A failed action preserves the item and permits a retry | The row survives the failure with its content intact, the reason is shown, and the retry succeeds. A refusal caused by stale state says so and offers the reload it needs | build | `OD-2S-3` |
| `2S-ACT-009` | A reversible action offers the product's existing undo | The undo affordance is the one the Work surfaces already mount, and the undo is **exercised** against the database rather than asserted | build | `OD-2S-3` |
| `2S-ACT-010` | An irreversible action asks first | The question appears in the same panel, names what will be lost, and cancelling it leaves everything unchanged | build | `OD-2S-3` |
| `2S-ACT-011` | The two surfaces offer the same verbs with the same meanings | The verb set and its copy are read from **one** source and asserted equal across `/app/notifications` and the attention surface; a verb present in one and absent from the other fails | build | `OD-2S-3`, `OD-2S-5` |
| `2S-ACT-012` | No action hides an item without changing state | Every control is followed by a read of the state it claims to have changed; a control whose only effect is that the row stopped rendering fails | build | `OD-2S-3` |

### `2S-ATTENTION` — the unanswered appear where the owner looks · slice 2S.3

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2S-ATTENTION-001` | The home attention surface shows unanswered notices | They render on `/app`, on a real rendered page | build | `OD-2S-5` |
| `2S-ATTENTION-002` | A subject the attention list already shows is not shown twice | A task present from its own source and from a notice appears once; the control plants both | build | `OD-2S-5` |
| `2S-ATTENTION-003` | The count is derived, never typed | The number rendered is computed from the items; a hand-edited count fails | build | `OD-2S-5` |
| `2S-ATTENTION-004` | The empty state is reachable and is a real empty state | The control plants rows first, so a zero that could never be false would fail | build | `OD-2S-5` |
| `2S-ATTENTION-005` | The surface is proved on a rendered page, not a fixture | Asserted against the real route, because a fixture lane measures the fixture | build | `OD-2S-5` |
| `2S-ATTENTION-006` | Opening a notice from home marks it seen | The row's state moves, and the assertion reads the row after the interaction | build | `OD-2S-5` |
| `2S-ATTENTION-007` | The attention surface's existing sources are unchanged | Every source it had before still contributes, asserted as an equality against the pre-slice projection | baseline | — |
| `2S-ATTENTION-008` | Acting in one surface is reflected in the other | An action taken on `/app/notifications` is read back from the attention surface, and the reverse; neither surface can hold a state the other contradicts | build | `OD-2S-3`, `OD-2S-5` |

### `2S-TRUST` — authority, audit, undo and honesty · across slices

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2S-TRUST-001` | Every suppression is auditable | Actor, source, reason, target, time and resulting state recorded for each | build | `OD-2S-1` |
| `2S-TRUST-002` | Every reversible action this phase adds has a real, tested undo | Each has a registered handler exercised against the database, not asserted in prose | build | — |
| `2S-TRUST-003` | The migration grants no authority it does not need | A grant census names every new object explicitly and refuses an unenumerated one | build | `OD-2S-7` |
| `2S-TRUST-004` | Any new object has forced RLS, an owner-scoped policy and least-privilege grants | Asserted in pgTAP through real roles, with a **negative control that plants a second owner's row first** | build | `OD-2S-7` |
| `2S-TRUST-005` | The heartbeat remains the only writer of `notifications` | Every writer enumerated; a second one is a defect, not a finding | baseline | `OD-2S-9` |
| `2S-TRUST-006` | No notification content reaches any new store | The suppression row has no column capable of holding a title or body, asserted from the generated types | build | `OD-2S-1` |
| `2S-TRUST-007` | Zero AI calls and zero credential spend across the phase | `ai_usage_events` gains no row attributable to this phase | rule | — |
| `2S-TRUST-008` | Push is not resumed, not repaired, and **not claimed** | No document produced by this phase states or implies that push works; a guard refuses the claim rather than the word | rule | `OD-2S-6` |
| `2S-TRUST-009` | No automation category's state is read as consent for anything here | Nothing in this phase consumes `eligible`, and the record says so after re-reading the rows | baseline | — |
| `2S-TRUST-010` | No new write authority is created by the inline actions | A census names every Server Action the new surface dispatches to, and each already existed before this phase. **A requirement that needs a new writer is a stop condition** that halts the phase | build | `OD-2S-3` |
| `2S-TRUST-011` | One action cannot be applied twice | The existing per-row-per-action operation key and its idempotency refusal are reused and **exercised** from this surface; a replay produces one write and a named refusal | baseline | `OD-2S-3` |
| `2S-TRUST-012` | A control rendered against a stale row refuses rather than writing | The existing `stale_pre_state` refusal is reached **from this surface**: a row is changed underneath a rendered control, the control is submitted, and the refusal is returned with its reload affordance | baseline | `OD-2S-3` |
| `2S-TRUST-013` | An undo offered here is a real undo | Every undo the surface offers is followed by a read of the ledger row **and** of the restored subject. A control reporting success with no ledger row is a defect, not a finding | build | `OD-2S-3` |

### `2S-ACCESS` — reachable by everyone · slice 2S.3

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2S-ACCESS-001` | Every new control has an accessible name that distinguishes it from its neighbours | Twenty rows do not yield twenty identically named buttons | build | `OD-2S-2` |
| `2S-ACCESS-002` | A control whose effect is silence announces its consequence before acting | The owner is told what stops, and for how long, before it stops | build | `OD-2S-2` |
| `2S-ACCESS-003` | The live region for a result exists before the result does | The region is present and empty on first render, so the first announcement is announced | build | — |
| `2S-ACCESS-004` | axe passes on the rendered pages this phase changes | Run against the real routes; the manual-lane limitation is named rather than implied | build | — |
| `2S-ACCESS-005` | VoiceOver is **NOT EXECUTED — OWNER WAIVED** | Recorded verbatim; nothing in this phase may be reported as screen-reader evidence, including a lane on a third engine | rule | — |
| `2S-ACCESS-006` | The compact menu is fully operable by keyboard | It opens, moves, activates and closes by keyboard alone, focus returns to the trigger, and every item's accessible name states **whose** state it changes — the message's or the task's | build | `OD-2S-3` |
| `2S-ACCESS-007` | The result of an inline action is announced | The live region exists, empty, before the first result — so the first announcement is announced rather than lost | build | `OD-2S-3` |

### `2S-MOBILE` — on the device it is used on · slice 2S.3

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2S-MOBILE-001` | Every new control is reachable with one thumb on a phone | Measured against the rendered page at a phone viewport, not against a media query | build | — |
| `2S-MOBILE-002` | No new control causes a zoom on focus | Asserted on the rendered page | build | — |
| `2S-MOBILE-003` | The owner validates this phase's surfaces on their own device | A person with the device, on a named list of items. **No automated lane substitutes**, including an emulated WebKit project | build | — |
| `2S-MOBILE-004` | No page scrolls behind an open dialog, and nothing is lost on dismissal | The Phase 2R properties still hold on the surfaces this phase changes | baseline | — |
| `2S-MOBILE-005` | The side drawer's lock question is not answered here | `2R-DRAWER-NOT-LOCKED` stays an owner design decision and is carried, not resolved | rule | — |
| `2S-MOBILE-006` | The primary action and the menu trigger are both reachable with one thumb | Measured against the **rendered page** at a phone viewport — never against a media query, because headless Chromium reports `pointer: coarse` at 1280px and a pointer query is not a device | build | `OD-2S-3` |
| `2S-MOBILE-007` | The open menu does not cover the row it acts on, and dismissing it loses nothing | Asserted on the rendered page at a phone viewport, with the row still readable behind the open menu | build | `OD-2S-3` |

### `2S-CLOSE` — the phase can be audited after it ends · slice 2S.4

| ID | Requirement | Observable criterion | Kind | Depends on |
|---|---|---|---|---|
| `2S-CLOSE-001` | Every declared requirement is classified exactly once | A generated matrix that **refuses rather than emitting a partial one**, with `--check` proving the committed file byte for byte | build | — |
| `2S-CLOSE-002` | Every `partial` and `not-built-by-rule` names a concrete remainder and a destination | The generator refuses a row that names neither | build | — |
| `2S-CLOSE-003` | `baseline` is never recorded as `built` | The generator compares delivered classes against declared kinds and refuses the disagreement. **Stating the rule in prose is what failed in Phase 2R** | build | — |
| `2S-CLOSE-004` | The opposite direction stays sayable | A requirement declared `build` and delivered `baseline` is a phase discovering the property already held, and must not be refused | build | — |
| `2S-CLOSE-005` | The migration budget is reconciled: allocated, spent, applied, with live parity | Local and hosted counts re-read at closeout; a mismatch halts closeout | build | `OD-2S-7` |
| `2S-CLOSE-006` | Every family name is checked for the property that made `2K-A11Y` invisible | A two-sided control: the declared families pass, and a digit-bearing family is proved invisible | build | — |
| `2S-CLOSE-007` | The threat model is re-dispositioned against what was built | A threat closes only when its mitigation exists **and has been exercised** | build | — |
| `2S-CLOSE-008` | Every inherited remainder is reproduced with no item dropped | The closing record's list is compared against this PRD §7.1; a missing item refuses | build | — |
| `2S-CLOSE-009` | A hardware proof is never discharged by a document | `2S-MOBILE-003` cannot be closed by any automated lane, and no record may say it was | rule | — |
| `2S-CLOSE-010` | Closure is an owner decision recorded as an ADR after a device checkpoint | A green pipeline is not that, and the requirement says so | build | — |
| `2S-CLOSE-011` | The successor is not started, not planned and not named as active | The generator refuses a successor requirement anywhere in this PRD, and the declaration guard refuses successor directories | build | — |
| `2S-CLOSE-012` | The defect this phase exists for is re-measured at closeout | The same query that produced §1's table is run again, and the closing record states what moved — **including if nothing did** | build | — |
| `2S-CLOSE-013` | The reuse claim is proved rather than asserted | The closing record names every Server Action each inline verb dispatched to, and the generator **refuses** if the phase introduced a writer that did not exist at slice 2S.0's baseline | build | `OD-2S-3` |

---

## 4. Traceability

The contract is
[`PHASE_2S_TRACEABILITY_CONTRACT.md`](../../reports/phase-2s/PHASE_2S_TRACEABILITY_CONTRACT.md).
It defines the classification vocabulary, the refusals, and the shape a slice's
acceptance record must have for the generator to read it.

**The package fails closed** for: a requirement with no slice; a requirement with
no observable criterion; a decision hidden as a recommendation; a migration with
no destination; a `partial` with no remainder; a `baseline` recorded as `built`;
a hardware proof replaced by a document; a claim that push works; a successor
phase started; and a requirement made invisible by the family regex.

---

## 5. The migration, and why the schema cannot carry this

**Proved, not asserted.** Read live from the deployed database on 2026-08-24.

`public.notifications` holds eleven columns:

```
id · user_id · type · title · body · action_url
priority · status · dedupe_key · read_at · created_at
```

`public.tasks` holds twenty-three, none of which expresses a suppression:

```
id · user_id · source_entry_id · parent_task_id · candidate_index · title
description · status · manual_priority · dynamic_priority · due_at · planned_at
confidence · created_by · completed_at · cancelled_at · created_at · updated_at
waiting_on_person_id · no_due_reason · intentional_no_due
source_interpretation_id · operation_key
```

**Neither table has a `jsonb` column**, so — unlike Phase 2Q's
`summaries.citations` — there is not even an unused column to repurpose. No
`suppress`, `mute` or `nudge` vocabulary exists anywhere in
`supabase/migrations/`.

**And the asymmetry is in the schema itself.** `pending_questions` has
`snoozed_until` and a `snoozed` status; `reminders` has `snoozed_until` and a
`snoozed` status; **`notifications` has neither**, and its status check allows
only `unread, read, dismissed`. The product built *"not now"* twice and did not
build it for the one thing that speaks daily.

Whatever `OD-2S-1` is answered, **`run_user_heartbeat` changes**, and in this
repository a function change is a migration.

**Candidate migration — one.**

| | |
|---|---|
| **Problem it solves** | the product cannot be told to be quiet, and repeats itself daily forever |
| **Why the schema cannot carry it** | proved above — no column, no `jsonb`, no vocabulary |
| **Exclusive destination** | the suppression state chosen by `OD-2S-1`, the cadence rule chosen by `OD-2S-4`, and the notice destination fixed by `OD-2S-3`. Nothing else |
| **Order** | migration → writer → consumer. The state exists before anything writes it; the surface reads only what the writer produced |
| **Risks** | a polymorphic suppression must prove ownership by **trigger**, because a relationship row's own `user_id` is never sufficient proof; the cadence rule must terminate; and the function is the one every phase since 2M has left alone |
| **pgTAP** | ownership, forced RLS, least-privilege grants, expiry across a daylight-saving boundary, cadence termination, and a **negative control that plants a second owner's row before asserting the refusal** |
| **Hosted proof** | parity advances by exactly one; the new object is readable only by its owner; a two-sided control proves residue gone |
| **Stop condition** | **a second migration of any kind halts the phase** and returns to the owner |

**Budget: 1 allocated · 0 spent · 0 created — `OD-2S-7` A, signed by ADR-137.**

Migrations stand at **101 local = 101 hosted, parity `202608230101`**, re-read
live on 2026-08-24 with the version **sets** compared by diff rather than the
counts alone. This package adds none.

**`OD-2S-3` B does not raise the ceiling, and that is a claim this phase has to
keep.** Every inline verb routes to an authority that already exists —
completion to the Work handler, rescheduling to `applyTaskDetailCommand`, the two
message verbs to `markNotification` — so the only schema the surface needs is the
suppression state `OD-2S-1` A already buys. **If an inline action turns out to
need schema of its own, that is a second migration and therefore a stop
condition**, not a budget revision.

**Allocated is not created, and it is not permission to create.** No migration
file exists and none may be written. The allocation is spent only when
implementation is separately authorized and slice 2S.1 runs. **A second migration
of any kind is a stop condition** that halts the phase and returns to the owner —
a budget whose ceiling is not also its stop condition is not a budget.

---

## 6. Slices

Detail, dependencies and estimates are in the implementation plan.

| slice | requirements | delivers | migration | closes on |
|---|---|---|---|---|
| **2S.0** | 7 | measurement; zero behaviour change | none | the baseline record |
| **2S.1** | 21 | the suppression model, the cadence rule, the notice's destination | **the one allocated** | hosted proof, parity +1 |
| **2S.2** | 23 | the verbs the owner can say, **and the actions they can take** | none | both locales, undo exercised, the reuse census |
| **2S.3** | 22 | where it appears: home, accessibility, mobile | none | the owner's device checkpoint |
| **2S.4** | 13 | closeout and traceability | none | **the owner's closing device checkpoint** |
| across | 13 | `2S-TRUST` | — | — |

**Slice 2S.2 carries 23 of the 99 requirements** — it grew from 8 to 23, nearly
tripling, and that is `OD-2S-3` B's cost stated rather than absorbed. The implementation plan keeps it as one slice
because splitting it would put the message verbs and the task verbs in different
pull requests, and `2S-SILENCE-011` — the four scopes leaving one another
untouched — can only be proved when all four exist.

**Each slice is re-audited against the `main` the previous one produced** before
it begins. That has caught a false premise in four consecutive phases and is not
optional.

---

## 7. What this phase does not touch

Stated so that each exclusion is a recorded decision rather than an omission.

Signup stays **closed**. The rollout gate stays **25 pass · 3 fail · 2
owner-signature**. No automation category's state changes. No grant, RLS policy,
retention rule or authority moves except as `OD-2S-7`'s one migration requires
and `2S-TRUST-003` proves. No BYOK credit is spent and **no AI call is made**. No
audio is persisted. Push is **not resumed**. The task lifecycle gains no second
authority. `/app/search` is not touched.

### 7.1 Out of the phase, each with a destination

| item | state | destination |
|---|---|---|
| `2R-TZ-SECOND-AUTHORITY` | eight inline zone sites, no CHECK on `profiles.timezone` | carried; routed by ADR-134. `2S-SILENCE-004` **uses** the one contract and does not repair the second authority |
| `2R-UNDO-LEDGER-NOT-CLOSED` | `private.undo_apply_reminder_command_v1` never sets `status='undone'`; 1 of 20 handlers | carried; needs a migration this phase's budget does not have |
| `2R-OCCURRENCE-CANCEL-IRREVERSIBLE` | needs DDL | carried |
| `2R-AXE-MANUAL-LANE` | axe runs only in the manual lane behind auth | narrowed by `2S-ACCESS-004`, **not closed** |
| `2R-RECURRENCE-LANE-UNRUNNABLE` | the spec cannot be listed or run in this environment, and opens by the wrong label | operations |
| `2R-DRAWER-NOT-LOCKED` | `.ux-detail` declares `aria-modal` and does not lock | an owner design decision — `2S-MOBILE-005` |
| `2R-TASK-RECURRENCE` | out by `OD-2R-6`, priced at +6 to +9 days and a further migration | a later phase |
| `OD-2R-9`'s two defects | verified again 2026-08-24 | `OD-2S-8`, recommended **out** |
| the interval gap | *every N days* inexpressible; refusal still pinned | `OD-2R-2`'s closed set |
| push HTTP 403 | unresolved; `notification_deliveries` = **0** | `OD-2S-6` — out by rule, and `2S-TRUST-008` refuses the claim |
| `2P-ATTENTION-008` | open half, mechanism proved | `OD-2S-8` |
| `RG-DEP-3` | **FAIL**, re-verified 2026-08-24 | rollout track; **cannot be closed by writing a file** |
| `2P-CHAT-007-JOURNEY` | **no longer unspendable** — the credential is `active`, validated 2026-08-02 | a later phase; the classification is corrected, not discharged |
| `2P-REVIEW-CITATIONS` | not delivered; one `jsonb` column | a later phase |
| `2P-ACCESS-005` (VoiceOver) | **NOT EXECUTED — OWNER WAIVED** | stays waived; never reported as passing |
| `2P-MOBILE-002` keyboard / IME | open | owner hardware |
| the four automation review flows | out under `OD-2Q-8` | separate initiative |
| voice transcription end to end | **built and never once run** — zero `transcription` rows in the ledger | a device checkpoint or a defect report, not a build |
| ADR-055 | expires **2026-10-27**; the threshold will not be met | `OD-2S-10` — the owner's ADR |

**Closing a phase does not close what it carried, and neither does opening one.**

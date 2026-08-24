# Phase 2S — implementation plan

**Status: PLANNING ONLY.** ADR-136 authorizes this document and nothing else.
**No slice may start.** The governing requirement set is
[`PHASE_2S_PRD.md`](./PHASE_2S_PRD.md); nothing here declares a requirement, and
nothing here allocates a migration.

**ALL TEN DECISIONS ARE SIGNED — ADR-137, 2026-08-24.** `OD-2S-3` was signed
**B** against this plan's recommendation, deliberately, and the estimate below is
**recomputed from the new requirement set** rather than adjusted upward from the
old one. **Signed is not authorized:** implementation still needs a separate
owner decision, and until it exists no slice may start.

---

## 1. The rule every slice obeys

1. **Re-audit against the `main` the previous slice produced**, before starting.
   Not against this plan. This has caught a false premise in four consecutive
   phases — most recently in Phase 2R, where a defect *reported as visual* turned
   out to be a wrong write, and where five requirements had been misfiled since
   the phase's first slice.
2. **Reproduce before fixing.** And when a browser test fails, **suspect the
   harness before changing the product** — Phase 2R changed the product twice to
   chase a failure that was `locator.click()` scrolling the page.
3. **One pull request per slice**, CI green **on the exact merge SHA**, not on
   the branch head.
4. **Everything goes through a pull request, including documentation.**
5. **A second migration of any kind is a stop condition** that halts the phase
   and returns to the owner.
6. **No AI call, no BYOK credit.** A half that can only be proved by spending the
   owner's credential is recorded **unspendable**, never as a pass.
7. **Fixtures are synthetic, owner-scoped and removed**, with a **two-sided**
   residue control: plant a row, prove the probe sees it, remove it, prove the
   probe no longer does. **A zero count over an empty table is not a control**,
   and neither is a negative assertion whose positive half was never planted.
8. **Hardware proof is never discharged by a document.**
9. **A rule about the heartbeat is proved by calling it**, never by matching a
   substring against `pg_proc.prosrc`. Slice 2R.1 did the latter and it proved
   nothing about behaviour; slice 2R.4 called `run_user_heartbeat` twenty-six
   times and found a real defect in the assertion.
10. **A mutation control accompanies every guard.** A guard that has never been
    seen to fail is a guard nobody has tested.

---

## 2. Slices

### Slice 2S.0 — measure, change nothing

**Delivers** `2S-FOUNDATION-001` … `-007`.

Re-measure the notification ledger at the slice's own baseline SHA — counts by
type, status and day, **whatever they are**. Record `run_user_heartbeat`'s
candidate and suppression rules by quoting `pg_get_functiondef`, not a migration
file, because the deployed function is the authority. Enumerate every control on
`/app/notifications` from the component with its destination. List every caller
of `markNotification` and the `status` each sends. Re-read
`notification_deliveries` **whatever it says** — a non-zero count corrects the
PRD rather than being filtered out. Run the stale-candidate predicate live and
record the count it found.

**Zero product behaviour changes.** The slice's own diff is the evidence.

- **Migration:** none. **Dependencies:** none. **Parallel with:** nothing.
- **Closes on:** the baseline record, reviewed against the diff.
- **Stop conditions:** `notification_deliveries` is non-zero → push has begun
  working and `OD-2S-6` must be re-answered before anything is built; a second
  writer of `notifications` exists → report before building on either; the live
  ledger contradicts PRD §1 in **direction** rather than in magnitude → **stop
  and tell the owner rather than adjusting the record.**
- **Excludes:** any change to `notifications`, `tasks`, the heartbeat or any
  surface.

**A criterion that names a count cannot survive the count changing.** Phase 2R
learned this when `2R-FOUNDATION-006` named "the four rows" and there were none.
Every criterion in this slice therefore names the *reading*, not the number.

### Slice 2S.1 — the model, the cadence and the destination

**Delivers** `2S-SILENCE-001` … `-006`, `-009`, `-010`; `2S-CADENCE-001` …
`-008`; `2S-REACH-001` … `-005`.

The suppression state chosen by `OD-2S-1`; the boundary validation that refuses
an invalid one; the expiry computed through the **one** timezone contract; the
owner scope proved against a second owner through real roles with RLS forced; the
registered undo, exercised rather than asserted. The cadence rule chosen by
`OD-2S-4`, bounded and terminating. The notice's destination fixed to its subject
by `OD-2S-3`.

**This is where the one allocated migration is spent** — `OD-2S-7` A, signed by
ADR-137. Allocated is still not created: the file may be written only once
implementation is separately authorized.

- **Migration:** **the one allocated.** **Dependencies:** 2S.0.
- **Closes on:** the hosted proof — parity advances by exactly one, the new
  object is readable only by its owner, and a two-sided residue control passes.
- **Stop conditions:** a second migration is needed; the cadence rule cannot be
  proved to terminate; the suppression cannot be expressed without changing a
  rule `2S-CADENCE-004` protects; the polymorphic ownership cannot be proved by
  trigger.
- **Excludes:** any surface change. The state exists before anything writes it,
  and nothing reads it yet.

**The order is migration → writer → consumer, and it is not negotiable.** A
column that a surface reads before a writer fills it is a column whose emptiness
looks like a product decision.

### Slice 2S.2 — the verbs the owner can say, and the actions they can take

**Delivers** `2S-SILENCE-007`, `-008`, `-011`; `2S-ANSWER-001` … `-008`;
**`2S-ACT-001` … `-012`.** Twenty-three requirements — the slice grew from 8 to
23, nearly tripling, and that is `OD-2S-3` B's cost stated rather than absorbed.

The two silencing verbs from `OD-2S-2`, the two message verbs from `2S-ANSWER`,
and the two **task** verbs `OD-2S-3` B adds — on `/app/notifications` and with
the same meanings on the attention surface.

**It stays one slice.** Splitting it would put the message verbs and the task
verbs in different pull requests, and `2S-SILENCE-011` — the four scopes leaving
one another untouched — can only be proved once all four exist.

**The count in this heading is derived, not typed.** It was written as
"thirty-one" first, and re-deriving it from the PRD's own tables gave 23. The
rule this repository paid for in Phase 2R applies to its own planning documents
too: a number in prose that nothing recomputes is a number that will be wrong.

**The four scopes, which is the whole of what this slice must not blur:**

| verb | what it changes | what it must leave alone |
|---|---|---|
| *Lida* | this message's `status` | the subject, and every other message about it |
| *Descartar* | this message's presence in the experience | the subject, and the cadence — the next notice still arrives when the rule permits |
| *Silenciar por um tempo* | equivalent notices about this subject, until an instant | the subject, and this message |
| *Silenciar este assunto* | equivalent notices about this subject | the subject, and this message |
| *Concluir* · *Reagendar* | **the task**, and it says so | every message |

- **Migration:** none. **Dependencies:** 2S.1.
- **Closes on:** both locales; the undo **exercised** against the database; a
  dismissal proved not to re-create the same subject-day notice by **calling**
  the function again; and **the reuse census in `2S-TRUST-010`**, which is the
  gate that makes `OD-2S-3` B safe rather than merely delivered.
- **Stop conditions:** an inline verb cannot be expressed without a **new write
  authority** — halt, the ceiling is the existing Server Actions; an inline verb
  needs schema of its own — halt, that is a second migration; the copy for a
  disposition cannot be made to match its behaviour without changing the
  behaviour, in which case the behaviour changes and the record says so.
- **Excludes:** any *reimplementation* of a task transition. Dispatching to one
  is the requirement; owning one is the stop condition.

**Read the product's own copy before assigning meaning to a word.** `dismissed`
already has a sentence elsewhere in this product; `2S-ANSWER-002` exists because
a disposition whose copy and behaviour disagree is worse than one with no copy.

### Slice 2S.3 — where it appears, and on what

**Delivers** `2S-ATTENTION-001` … `-008`; `2S-ACCESS-001` … `-007`;
`2S-MOBILE-001` … `-007`. Twenty-two requirements.

**`OD-2S-3` B lands here too.** The compact menu must be operable by keyboard
with focus returning to its trigger (`2S-ACCESS-006`), its result announced
through a region that exists before the result does (`2S-ACCESS-007`), its
trigger and primary action both reachable with one thumb (`2S-MOBILE-006`), and
the open menu must not cover the row it acts on (`2S-MOBILE-007`). Acting in
either surface must be readable from the other (`2S-ATTENTION-008`).

The unanswered notices appear inside *Precisa de você* per `OD-2S-5`, without
double-counting a subject the list already holds from its own source. Accessible
names that distinguish twenty rows from one another. A live region that exists
**before** the result it will announce. axe on the **rendered** routes. One-thumb
reach and no zoom on focus, measured against the rendered page at a phone
viewport — **not against a media query**, because headless Chromium reports
`pointer: coarse` at 1280px and a pointer query is not a device.

- **Migration:** none. **Dependencies:** 2S.2.
- **Closes on:** **the owner's device checkpoint**, `2S-MOBILE-003`, run by a
  person with the device.
- **Stop conditions:** the attention projection cannot avoid double-counting
  without changing an existing source; a control cannot be given a distinguishing
  accessible name without restructuring the row.
- **Excludes:** `/app/search`; and — unless `OD-2S-8` is answered B — the
  `activeFilter` continuity defect in the very file this slice edits. **That
  exclusion is deliberately uncomfortable and is named rather than hidden.**

### Slice 2S.4 — closeout

**Delivers** `2S-CLOSE-001` … `-013`, and the `2S-TRUST` family's final
disposition. Twenty-six requirements.

**`2S-CLOSE-013` is `OD-2S-3` B's closing gate:** the record names every Server
Action each inline verb dispatched to, and the generator **refuses** if the phase
introduced a writer that did not exist at slice 2S.0's baseline. A reuse claim
nobody can fail is a reuse claim nobody checked.

The traceability generator — which **refuses rather than emitting a partial
matrix**, with `--check` proving the committed file byte for byte and a mutation
control proving `--check` can fail. The reconciliation of delivered classes
against declared kinds, in both directions. The migration budget reconciled
against live parity. The threat model re-dispositioned against what was built.
Every inherited remainder reproduced and compared against PRD §7.1. And
`2S-CLOSE-012`: the query that produced PRD §1's table, run again.

- **Migration:** none. **Dependencies:** 2S.3.
- **Closes on:** **the owner's closing device checkpoint, and then an ADR.**
- **Stop conditions:** the matrix cannot be generated without a hand edit; a
  requirement cannot be classified; `undelivered` is non-zero — which is a phase
  failure, not a category; local and hosted migration counts disagree.

**The generator carries no shebang.** The local Rolldown transform refuses one,
which is why Phase 2R's generator test could not load until the shebang was
removed. Its siblings carry none.

---

## 2b. What `OD-2S-3` B reuses, measured before the plan claimed it

**The owner's contract requires this to be proved, not asserted.** Every row was
read from the source on 2026-08-24, at `885f7f7`.

| the owner's verb | the authority it dispatches to | where it already lives | what comes with it, free |
|---|---|---|---|
| **concluir a tarefa** | `WorkItemActions`' injected handler (`WorkItemActionHandler`) | `src/features/operations/work-item-actions.tsx:38`, already mounted **twice** — `operations/task-list.tsx:364` and `daily-cycle/task-detail-surface.tsx:99` | per-(row, action) operation keys minted in a ref, the `2E_IDEMPOTENCY_MISMATCH` refusal, the pending state, the outcome rendering |
| **adiar / reagendar** | `applyTaskDetailCommand` with `reschedule_due` | `src/features/task-commands/detail-actions.ts:208` | boundary validation, the owner's timezone through **one** contract (`resolveOwnerTimeZone`), the `stale_pre_state` refusal with `refreshable: true`, and the destructive/confirmation pairing |
| **marcar como lida** · **descartar** | `markNotification` | `src/features/agent/actions.ts:501`, already accepting `z.enum(["read","dismissed"])` | the owner check, `assertActiveAccount`, and the route-pattern revalidation Phase 2P repaired |
| **undo** | `undoWorkOperation` through `UndoAffordance` | `src/features/operations/undo-affordance.tsx:54`, supplied at four call sites today | the expiry boundary, the ledger read, the real compensation |
| **which verbs a row may offer** | `isEligibleStatus` / `detailControlsFor` | `src/features/task-commands/detail-controls.ts:113` | a control can only exist for a transition the command path would also accept — `2F-SURFACE-009` |
| **silenciar** (both) | **new**, and the only new authority in the phase | `2S-SILENCE`, on the one allocated migration | — |

**One existing guard already states this slice's central rule.**
`detail-controls.ts:66-71` declares `RENDERED_ELSEWHERE` — `complete_task`,
`reopen_task`, `set_status` — with the comment that rendering them again *"would
put two routes to one transition on one screen."* The notification row is a
**third mount of the shared component**, not a fourth implementation, and that
distinction is what `2S-TRUST-010` measures.

**The cost this reuse carries, named rather than discovered.** `WorkItemActions`
takes a `WorkItemView`. A notification row does not have one, so the slice must
**project** it — and a projection read at render time is exactly the stale-state
risk `T-2S-17` describes. `2S-TRUST-012` requires the existing `stale_pre_state`
refusal to be reached **from this surface**, with a row changed underneath a
rendered control. That is the assertion that turns a reused guard into a proved
one.

---

## 3. Estimate

**Recomputed from the signed requirement set — 99 requirements and 5 slices.** It
is a recomputation, not an adjustment: `OD-2S-3` B added a family and thirteen
appended requirements, so the per-slice numbers are re-derived rather than nudged
upward. No prior phase's numbers are recycled.

Working days.

| slice | requirements | optimistic | probable | pessimistic |
|---|---|---|---|---|
| 2S.0 — measure | 7 | 0.5 | 1 | 1.5 |
| 2S.1 — model, cadence, destination | 21 | 2 | 3.5 | 5.5 |
| 2S.2 — **the verbs and the actions** | **23** | 2 | 4.5 | 7 |
| 2S.3 — where it appears | 22 | 2 | 4 | 6.5 |
| 2S.4 — closeout | 13 + 13 | 1 | 2 | 3.5 |
| **total** | **99** | **7.5** | **15** | **24** |

**Critical path: ~13.5 working days.** Every slice depends on its predecessor and
**no two are parallelisable** — 2S.2 reads what 2S.1 writes, and 2S.3 places what
2S.2 built. Parallelism is not claimed because the condition for it does not
hold.

**What `OD-2S-3` B cost, stated against the pre-signature package:** **+25
requirements and +3.5 probable days** (11.5 → 15), of which +2.5 fall in slice
2S.2 and +1 in 2S.3. The estimate offered before the signature was *+2 to +3
days*; the recomputation lands at **+3.5**, and the difference is the four
trust requirements the owner's own contract asked for — duplicated authority,
double action, stale state and false undo — which the pre-signature estimate had
not priced because it had not been asked to model them.

**What moves the estimate, by open decision:**

| decision | answer | effect |
|---|---|---|
| `OD-2S-1` | **C** (reuse `dismissed`) | **−1 to −1.5 days** — no schema, but `2S-SILENCE-004` and `-010` lose their subject and the expiry requirements are struck rather than delivered |
| `OD-2S-1` | **B** (task column) | −0.5 days, and `2S-REACH-003`/`2S-SILENCE-001` narrow to tasks only |
| `OD-2S-2` | **B** (three verbs) | **+1.5 to +2.5 days** — a second authority over task status, with its own undo, accessibility and mobile proofs |
| `OD-2S-3` | **B or C** (inline controls) | **+2 to +3 days** — a new control surface, each control needing its own proof |
| `OD-2S-4` | **A** (escalate then silent) | −0.5 days; `2S-CADENCE-003` loses its subject |
| `OD-2S-4` | **C** (keep daily) | **−2 days, and the phase loses its subject.** The measured defect stays |
| `OD-2S-5` | **A** (badge only) | −1.5 days; the `2S-ATTENTION` family shrinks to two requirements and the phase stops answering *"where does the owner actually look?"* |
| `OD-2S-5` | **C** (both) | +0.5 days |
| `OD-2S-6` | **B** (attempt push) | **unbounded** — the phase's completion becomes contingent on an unexplained third-party refusal. Not estimable, which is itself the argument |
| `OD-2S-7` | **B** (two migrations) | +0.5 days and a standing risk of state and rule drifting apart |
| `OD-2S-7` | **C** (zero, hide at read time) | −2 days, and the ledger keeps filling at 3/day forever |
| `OD-2S-8` | **B** (attention half in) | +0.5 days, one requirement |
| `OD-2S-8` | **C** (both halves in) | +2 days, and the phase becomes two things |
| `OD-2S-9` | **B** (no heartbeat change) | −2.5 days, and the defect is hidden rather than fixed |

**What moves it regardless of any signature:**

| driver | effect |
|---|---|
| **the migration** | ~1 day of slice 2S.1 is gates, not code: pgTAP, `db lint`, the whole chain on an empty database, dry run, application, hosted proof, parity, residue |
| **the heartbeat** | it has been deliberately untouched since Phase 2M. Every rule it already enforces becomes a `baseline` requirement re-proved **by execution** |
| **hardware** | `2S-MOBILE-003` and the closing checkpoint are **owner wall-clock**, not agent time — historically the largest source of elapsed-time variance in this repository. Phase 2R's device checkpoint took **three runs and found five defects** |
| **the implementation authorization** | slice 2S.0 cannot start without it, and its duration is the owner's |

**Owner actions remaining, in order:** sign `OD-2S-1` … `OD-2S-10`; authorize
implementation in a separate ADR; run the `2S-MOBILE-003` device item; run the
closing checkpoint; decide closure.

**Principal risks:**

| risk | why it is real here | mitigation |
|---|---|---|
| **changing `run_user_heartbeat`** | untouched by decision since Phase 2M; it holds quiet hours, the cap, the cooldown, the lock and the batch's failure isolation | `2S-CADENCE-004` … `-007` re-prove each **by calling the function**, the standard slice 2R.4 set |
| **silencing too much** | a control that quiets a real obligation is worse than the nag | `2S-CADENCE-008` — silence is a change of channel, never a deletion |
| **a second migration** | suppression tends to grow a second table once it acquires reasons and history | exclusive destination named in advance; a second is a **stop condition** |
| **double-counting on the attention surface** | the same task can arrive from its own source and from a notice | `2S-ATTENTION-002`, with a control that **plants both** |
| **a fixture measuring what the product does not do** | ADR-129's whole finding, and Phase 2O's repeated one | `2S-ATTENTION-005` and `2S-ACCESS-004` assert against **rendered routes** |
| **a control that cannot fail** | Phase 2R found three "passing" controls that changed nothing | every mutation control proves its guard fails when the property is broken |
| **a second authority over a task's status** | `OD-2S-3` B puts task verbs on a surface that does not own them; `detail-controls.ts:66` shows the product has met this before and chose sharing over copying | `2S-ACT-003`/`-004` name the destinations; `2S-TRUST-010` censuses them and makes a new writer a **stop condition** |
| **a stale projection writing anyway** | `WorkItemActions` needs a `WorkItemView` the notification row must project, read at render time | `2S-TRUST-012` reaches the existing `stale_pre_state` refusal **from this surface**, with the row changed underneath |
| **an undo that reports success and restores nothing** | `2R-UNDO-LEDGER-NOT-CLOSED` is a live example of a handler that never marks itself undone | `2S-TRUST-013` reads the ledger row **and** the restored subject after every undo |
| **the two surfaces drifting apart** | the same verb, maintained twice, is the defect the owner named directly | `2S-ACT-011` reads the verb set from **one** source and asserts equality across both surfaces |
| **the phase closing on green CI** | every gate green is when a wrong claim is easiest | `2S-CLOSE-010` — closure needs the owner and a device |

---

## 4. The blocker

**One, and it is not optional.**

1. ~~**Sign the ten open decisions.**~~ **Done — ADR-137, 2026-08-24.** The
   requirement set is no longer provisional: `OD-2S-3` B added `2S-ACT` and
   thirteen appended requirements, and the other nine took their recommendation.
2. **Record an implementation authorization ADR.** Separate from the signatures.
   Until it exists:
   - **no slice may start**, including 2S.0;
   - **no product code may be written**;
   - **no migration file may be created**, notwithstanding that one is
     *proposed*;
   - **nothing is deployed and no hosted data is written.**

**Proposed is not allocated, allocated is not created, and signed is not
authorized.** All three distinctions are the reason this section exists.

---

## 5. Stop conditions, consolidated

Gathered here because a stop condition scattered across five slices is one nobody
finds in time. Each halts the phase and returns to the owner.

| # | condition | source |
|---|---|---|
| 1 | **A second migration of any kind is needed** | `OD-2S-7` |
| 2 | **`notification_deliveries` is non-zero at slice 2S.0** — push has begun working and `OD-2S-6` must be re-answered | `2S-FOUNDATION-005` |
| 3 | **A second writer of `notifications` is found** | `2S-TRUST-005` |
| 4 | **The live ledger contradicts PRD §1 in direction** — stop and tell the owner rather than adjusting the record | `2S-FOUNDATION-001`, `-006` |
| 5 | **The cadence rule cannot be proved to terminate** | `2S-CADENCE-002` |
| 6 | **A rule `2S-CADENCE-004` protects would have to change** — quiet hours, the cap, the cooldown or the per-user lock | `OD-2S-9` |
| 7 | **An inline verb needs a NEW WRITE AUTHORITY** — a Server Action, RPC or mutation path that did not exist at slice 2S.0's baseline | `OD-2S-3` B · `2S-TRUST-010` |
| 7b | **An inline verb needs schema of its own** — that is a second migration, and condition 1 applies | `OD-2S-3` B · `OD-2S-7` |
| 7c | **The two surfaces cannot be made to offer the same verbs from one source** — a divergence maintained by hand is the defect `2S-ACT-011` exists to refuse | `OD-2S-3` B · `OD-2S-5` |
| 8 | **Polymorphic ownership cannot be proved by trigger** — a relationship row's own `user_id` is never sufficient proof | `2S-TRUST-004` |
| 9 | **Any half can only be proved by spending the owner's AI credential** — recorded **unspendable**, never a pass | `2S-TRUST-007` |
| 10 | **Push would have to be resumed, repaired or claimed** to complete a requirement | `OD-2S-6`, `2S-TRUST-008` |
| 11 | **`undelivered` is non-zero at closeout** — a phase failure, not a category | `2S-CLOSE-001` |
| 12 | **A start signal for the roadmap successor appears** | ADR-136 |

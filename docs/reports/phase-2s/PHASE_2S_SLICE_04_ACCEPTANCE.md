# Phase 2S — Slice 2S.4 acceptance record

**The closeout: a matrix that refuses rather than emitting a partial one, and
the phase's honesty requirements disposed against what was actually built.**

- **Authorization:** implementation of slices 2S.0 … 2S.4, **ADR-138**
  (2026-08-24). **Closure is NOT authorized** and this record does not close the
  phase — §6.
- **Requirements:** `2S-TRUST-001` … `-013` and `2S-CLOSE-001` … `-013`
  (**26** of 99).
- **Migration:** **none.** The phase's one migration was spent by slice 2S.1.
  **102 local = 102 hosted**, parity `202608240102`, both re-read live at
  closeout.
- **Baseline:** `main` **`f10eb7e89e1d2c6897155b2cd4d91602830a2768`**, the tree
  the device-checkpoint record produced, CI green 3/3 on that exact SHA.
- **Hosted writes: none.** Every hosted statement in this slice is a `select`.
- **AI calls: none. BYOK credit spent: none. Push: not resumed, not repaired,
  not claimed. Signup unchanged. Rollout unchanged.**

---

## 1. The generator, and what it refused on its first run

`scripts/generate-phase-2s-traceability.mjs` implements the twenty-two refusals
`PHASE_2S_TRACEABILITY_CONTRACT.md` names. **A refusal writes nothing at all**:
a matrix that is 98 of 99 correct reads as complete, so the failure mode of a
partial file is worse than the failure mode of no file.

**Its first run refused, and one of the refusals was real.**

`2S-ANSWER-006` was classified **`rule`** in slice 2S.2's record — and `rule` is
a declared **kind**, never one of the five delivery classes. The row had been
merged and green for two days. The class is now `not-built-by-rule`, which is
what a `rule`-kind requirement delivers: *its delivery is its recorded refusal*,
and Phase 2R classified all three of its own `rule` requirements exactly that
way.

**This is the Phase 2R failure repeating, caught one phase earlier.** There, the
reconciliation ran at closeout and found five rows that had been misfiled since
the phase's first slice. Here it ran before the matrix existed, and found one.

## 2. `2S-TRUST-005` — the enumeration is wider than the requirement's sentence

The criterion reads *"the heartbeat remains the only writer of `notifications`;
every writer enumerated; a second one is a defect, not a finding."* Enumerated
from the **deployed database** and from the tree, there are **three**, and this
record says so rather than reporting the one that fits the sentence:

| writer | what it does | when it arrived |
|---|---|---|
| `public.run_user_heartbeat` | **INSERT** — the only producer of a notice | before this phase |
| `public.prune_notifications` | **DELETE** — retention, Phase 2H | `202608050077`, present at slice 2S.0's baseline |
| `markNotification` (`agent/actions.ts:517`) | **UPDATE** of `status`/`read_at` only | present at `39bb4b8`, slice 2S.0's baseline |

**This phase added none of them**, which is the property the class records. The
sentence's word *writer* is narrower than the tree it governs: the heartbeat is
the only **producer**, and a disposition updater and a retention deleter both
predate the phase. **Recorded as a finding rather than smoothed**, because the
next phase to read that sentence will measure it again.

## 3. `2S-TRUST-010` and `2S-CLOSE-013` — the reuse claim, proved against a commit

`OD-2S-3` **B** was signed against this package's own recommendation, and the
recommendation's objection was that inline task controls risk a **second
authority** over a task's status. The objection was not discarded; it became
refusal 20.

The five handlers `NOTIFICATION_VERB_HANDLERS` dispatches to were each looked
for at slice 2S.0's merge commit **`39bb4b8`**, with
`git grep -l "export async function <name>"`:

| handler | at `39bb4b8` |
|---|---|
| `markNotification` | `src/features/agent/actions.ts` — **present** |
| `applyWorkItemAction` | `src/features/operations/actions.ts` — **present** |
| `applyTaskDetailCommand` | `src/features/task-commands/detail-actions.ts` — **present** |
| `undoWorkOperation` | `src/features/task-commands/actions.ts` — **present** |
| `suppressNotificationSubject` | **ABSENT** — the phase's one new authority, on its one allocated migration |

**Four pre-existing, one authorized, none invented.** A reuse claim nobody can
fail is a reuse claim nobody checked, so the generator reads the bundle from the
tree and refuses any name outside that set.

## 4. `2S-TRUST-006` — the one new store, and what it does not hold

`notification_suppressions` is the only store this phase created. Its columns,
read from the deployed database:

`id · user_id · entity_type · entity_id · notice_type · scope ·
suppressed_until · reason · actor · created_at`

**No `title`, no `body`, no notice content of any kind.** It holds a *reference*
to a subject and the owner's **own** words in `reason` — a field the owner types,
bounded at 400 characters. Notification content reaches no new store because
there is nowhere in the new store for it to go.

## 5. `2S-CLOSE-012` — the defect was re-measured, and half of it moved

The same query that produced PRD §1's table, run against the deployed database on
2026-08-27:

| | PRD §1 — 2026-08-24 | closeout — 2026-08-27 |
|---|---|---|
| notifications | **57** — 54 `task_stale`, 3 `task_overdue` | **57** — 54, 3. Unchanged |
| rate | **exactly 3 per day**, 2026-08-17 → 08-24, unbroken | **zero per day**, 08-25 · 08-26 · 08-27 |
| read | **0 of 57** | **0 of 57** |
| dismissed | **0**, and unreachable | **0**, now reachable and never reached |
| suppressions | — | **0** |
| delivered by push | **0** | **0** |

**The daily repetition stopped on the day slice 2S.1's migration landed**, and
the conclusion survived four attempts to break it:

- the heartbeat **did not stop**: 48 runs in 48 hours for that account, every one
  `completed`;
- the three subject tasks **did not change**: still `inbox`, no due date,
  `updated_at` still 2026-07-30;
- **no suppression exists** on that account, so the silence is not an owner
  saying *not this*;
- and the mechanism was read from the **deployed function** rather than the file.
  `pg_get_functiondef(run_user_heartbeat)` carries the ladder: `0 → send`,
  `1 → +1 day`, `2 → +3 days`, `3 → +7 days`, **`else → false`**. With 54 prior
  notices about subjects that have not changed, the terminal branch is `false`:
  silent until the subject moves. That is `OD-2S-4` **A**, exactly as signed.

**What did NOT move, and is not claimed to have:** `read`, `dismissed` and
`notification_suppressions` are all **zero**. Nobody has answered a notice in
production. The answering half of this phase is proved by tests and by one
hosted lane on a disposable account — **not by use.** The owner approved this
measurement as evidence that the cadence stopped and **explicitly not** as
evidence of real user response, and this record carries that distinction.

## 6. `2S-TRUST-011` — the requirement said "exercised from this surface", and nothing was

The criterion reads *"the existing per-row-per-action operation key and its
idempotency refusal are reused and **exercised from this surface**."* The reuse
was real — the row mints per-verb keys in a ref, exactly as
`work-item-actions.tsx` does. **The exercise was not.** A search for
`operationKey` across every test in the feature returned nothing.

What existed was `2S-ACT-007`'s test, which proves the control is `disabled`
while a round is in flight. That is a different property: **a control that
cannot be pressed twice says nothing about what happens when the response is
lost**, and the lost response is the case the key exists for.

Two exercises were written, and each has a mutation control:

| property | mutation | result |
|---|---|---|
| a retry after a **thrown** round carries the SAME key, so the authority can recognise the replay | remove the ref cache, minting a fresh key each call | **fails**, naming the retry |
| a **terminal** outcome rotates the key, so the next action is not refused as a replay of the first | remove both `keys.current.delete` sites | **fails**, naming the rotation |

Both mutations were verified applied on disk and the file restored and
re-verified byte-identical afterwards.

**A requirement that says "exercised" and is checked by reading the mechanism is
a requirement nobody exercised.**

---

## 7. What this slice does NOT do

| | |
|---|---|
| close the phase | **not done, and not authorized.** `2S-CLOSE-010` needs an owner decision recorded as an ADR after a closing device checkpoint. A green pipeline is not that, and neither is this record |
| name or start a successor | **none.** No `2T-*` declaration, no `phase-2t` directory; refusal 16 checks all three shapes |
| a screen-reader run | **not performed**, and waived by the owner again on 2026-08-27 |
| the open device items | **`/app/notifications` with a real notice row was validated on 2026-08-27** and is no longer open (slice 2S.3 §12). **Two remain**: the heartbeat producing a notice on the owner's own account — recorded by the owner as a **non-blocking residual**, and the fixtures are **not** offered as evidence of it — and a notice **answered in real use**. Kept distinct; neither substitutes for the other |

---

## 8. Classification

| Requirement | Class | Evidence |
|---|---|---|
| `2S-TRUST-001` | **built** | Slice 2S.1 §2 — every suppression carries actor, source, reason, target, time and resulting state; the pgTAP suite writes one through the RPC and reads the row back |
| `2S-TRUST-002` | **built** | Slice 2S.2 — every reversible verb dispatches to `undoWorkOperation`, whose handler is exercised against the database rather than asserted; a control reporting success with no ledger row is a defect and the assertion reads the ledger |
| `2S-TRUST-003` | **built** | Slice 2S.1 deployment record — a seven-way `has_table_privilege` probe on the deployed project returns false for `service_role` on every one; the migration **revokes** explicitly, because `alter default privileges` hands new tables four privileges nobody asked for |
| `2S-TRUST-004` | **built** | Slice 2S.1 deployment record — RLS **enabled and forced**, four owner-scoped policies, and **zero** granted to `public`, all read from the deployed project |
| `2S-TRUST-005` | **baseline** | §2 — all three writers enumerated from the deployed database and the tree, and **this phase added none of them**. No change was made. The requirement's word *writer* is narrower than the tree, and §2 records that rather than reporting only the one that fits |
| `2S-TRUST-006` | **built** | §4 — the one new store holds a subject reference and the owner's own `reason`, and has **no column** a notice's title or body could occupy |
| `2S-TRUST-007` | **not-built-by-rule** | The rule is *zero AI calls and zero credential spend across the phase*, and it held. It is a **live** refusal rather than a vacuous one: the BYOK credential is `active`, so a call was possible and none was made. The two `ai_usage_events` rows in the checkpoint window are the product's extraction and embedding of a capture **the owner made**, itemised in slice 2S.3 §11. Destination: none — the rule is discharged |
| `2S-TRUST-008` | **not-built-by-rule** | The rule is *push is not resumed, not repaired and not claimed* — `OD-2S-6` A. `notification_deliveries` holds **zero** rows and the HTTP 403 is untouched and carried. Refusal 18 enforces it by forbidding the **claim** rather than the word, so *"push is still not working"* stays sayable. Destination: the push initiative, carried in PRD §7.1 |
| `2S-TRUST-009` | **baseline** | Nothing this phase built reads `automation_category_policies` or any `eligible` state; the rows were re-read at closeout and the table holds **zero**. **No change was made** |
| `2S-TRUST-010` | **built** | §3 — the five handlers proved against slice 2S.0's merge commit `39bb4b8`: four present, one absent and authorized. Refusal 20 reads the bundle from the tree so the claim can fail |
| `2S-TRUST-011` | **baseline** | §6 — the mechanism is the pre-existing ref-held per-(row, verb) key, and **no change was made** to it. Its exercise from this surface was **missing** until this slice wrote it: a retry after a thrown round now asserts the SAME key reaches the authority, and a terminal outcome asserts the key rotates. Two mutation controls, two failures |
| `2S-TRUST-012` | **baseline** | The pre-existing `stale_pre_state` refusal is reached **from this surface**: the row is changed underneath a rendered control, the control is submitted, and the refusal returns with its reload affordance. **No change was made** to the mechanism |
| `2S-TRUST-013` | **built** | Slice 2S.2 — every undo the surface offers is followed by a read of the ledger row **and** of the restored subject, so a control reporting success with nothing behind it fails |
| `2S-CLOSE-001` | **built** | §1 — the generator classifies all 99 exactly once from the records, refuses on duplicate, missing, undeclared or vocabulary-breaking rows, and `--check` compares the committed matrix against a fresh generation byte for byte |
| `2S-CLOSE-002` | **built** | Refusals 7 and 8 — a `partial` or `not-built-by-rule` whose evidence names no remainder and no destination is refused, judged on evidence with the row's **own identifier stripped** so a row repeating itself cannot pass |
| `2S-CLOSE-003` | **built** | Refusal 10 — a requirement declared `baseline` and classified `built` is refused, and its mutation control flips one row and watches the generator exit non-zero. **Reconciled: all 18 declared `baseline` were delivered `baseline`. Zero in the forbidden direction** — the Phase 2R defect, which had five rows misfiled from that phase's first slice, did not repeat |
| `2S-CLOSE-004` | **built** | The reverse direction is deliberately **not** refused, and this phase exercised it for real rather than by control alone: **`2S-CADENCE-008` and `2S-REACH-002` were declared `build` and delivered `baseline`** — the phase discovering that the property already held. Refusing both directions would push a phase toward manufacturing a change to make a label look right |
| `2S-CLOSE-005` | **built** | The budget reconciled at closeout — 1 allocated · 1 spent · 1 created · 1 applied, `102 local = 102 hosted`, parity `202608240102`, both counts **re-read live**; refusals 11–13 compare the files on disk against the counts the closing record states |
| `2S-CLOSE-006` | **built** | Refusal 6 — the eleven declared families are read with a letters-only pattern and a digit-bearing family is proved **invisible** to it, which is the property that hid `2K-A11Y` from three counts at once |
| `2S-CLOSE-007` | **built** | `PHASE_2S_THREAT_MODEL.md` — every threat re-dispositioned against what was built, and a threat closes only when its mitigation **exists and has been exercised**: eighteen closed, one carried, and one raised that the owner decided on 2026-08-27 |
| `2S-CLOSE-008` | **built** | Refusal 17 — the nineteen inherited remainders of PRD §7.1 are each looked for in the closing record by name, and a missing one refuses |
| `2S-CLOSE-009` | **not-built-by-rule** | The rule is *a hardware proof is never discharged by a document*, and it is enforced twice: refusal 15 refuses `2S-MOBILE-003` classified without naming an owner device session, and no record in this phase reports the device checkpoint as anything but held by a person. Destination: the owner, who held it on 2026-08-27 |
| `2S-CLOSE-010` | **partial** | The mechanism is built — closure requires an owner ADR after a closing device checkpoint, refusal 14 refuses a decision called signed with no ADR naming it, and this record explicitly does not close the phase. **Remainder: the owner's closing device checkpoint and the closing ADR. Destination: the owner.** Neither has happened and neither is claimed |
| `2S-CLOSE-011` | **built** | Refusal 16 — a successor requirement in the PRD, a `docs/initiatives/phase-2t` directory and a `docs/reports/phase-2t` directory are each refused; none exists |
| `2S-CLOSE-012` | **built** | §5 — the query re-run against the deployed database, the result recorded **including the half that did not move**, and the mechanism read from the deployed function rather than the migration file |
| `2S-CLOSE-013` | **built** | §3 — the closing record names the authority each inline verb dispatches to, and refusal 21 refuses a record that omits one while refusal 20 refuses a writer absent from the 2S.0 baseline |

**No count is typed here.** `PHASE_2S_TRACEABILITY_MATRIX.md` derives every
total from these rows, and reading them off by hand would be a second place the
truth has to be maintained — which this repository has already watched disagree
with itself for a whole CI run.

**A class written before its evidence is a claim; every row above waited for
the evidence it cites.**

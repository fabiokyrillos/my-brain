# Phase 2S — implementation plan

**Status: PLANNING ONLY.** ADR-136 authorizes this document and nothing else.
**No slice may start.** The governing requirement set is
[`PHASE_2S_PRD.md`](./PHASE_2S_PRD.md); nothing here declares a requirement, and
nothing here allocates a migration.

**Ten decisions are open** and **none is signed**. Requirements depending on an
unsigned decision are not buildable, and the pull request carrying this package
stays a **draft** until they are answered.

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

**This is where the one migration is spent, if the owner allocates it.**

- **Migration:** **the one proposed**, if allocated. **Dependencies:** 2S.0.
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

### Slice 2S.2 — the verbs the owner can say

**Delivers** `2S-SILENCE-007`, `-008`; `2S-ANSWER-001` … `-006`.

The two verbs chosen by `OD-2S-2`, on `/app/notifications` and reachable from the
attention surface. `dismissed` gains a writer and the copy that says what it
means — checked against what it does, in both locales. Read and dismiss become
two controls with two outcomes and two sentences.

- **Migration:** none. **Dependencies:** 2S.1.
- **Closes on:** both locales; the undo exercised against the database; a
  dismissal proved not to re-create the same subject-day notice by **calling**
  the function again.
- **Stop conditions:** a verb cannot be expressed without a second authority over
  the task's status; the copy for a disposition cannot be made to match its
  behaviour without changing the behaviour — in which case the behaviour changes
  and the record says so.
- **Excludes:** any task status control on the notification surface.

**Read the product's own copy before assigning meaning to a word.** `dismissed`
already has a sentence elsewhere in this product; `2S-ANSWER-002` exists because
a disposition whose copy and behaviour disagree is worse than one with no copy.

### Slice 2S.3 — where it appears, and on what

**Delivers** `2S-ATTENTION-001` … `-007`; `2S-ACCESS-001` … `-005`;
`2S-MOBILE-001` … `-005`.

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

**Delivers** `2S-CLOSE-001` … `-012`, and the `2S-TRUST` family's final
disposition.

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

## 3. Estimate

**Derived for this phase from its own 74 requirements and 5 slices.** No prior
phase's numbers are recycled: Phase 2R's 6.5 / 13.5 / 21.5 covered 73
requirements across a migration-heavy recurrence model with three signed
daylight-saving edge cases, and reusing it would be a guess wearing a number's
clothes.

Working days.

| slice | requirements | optimistic | probable | pessimistic |
|---|---|---|---|---|
| 2S.0 — measure | 7 | 0.5 | 1 | 1.5 |
| 2S.1 — model, cadence, destination | 21 | 2 | 3.5 | 5.5 |
| 2S.2 — the verbs | 8 | 1 | 2 | 3 |
| 2S.3 — where it appears | 17 | 1.5 | 3 | 5 |
| 2S.4 — closeout | 12 + 9 | 1 | 2 | 3.5 |
| **total** | **74** | **6** | **11.5** | **18.5** |

**Critical path: ~10.5 working days.** Every slice depends on its predecessor and
**no two are parallelisable** — 2S.2 reads what 2S.1 writes, and 2S.3 places what
2S.2 built. Parallelism is not claimed because the condition for it does not
hold.

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
| **the phase closing on green CI** | every gate green is when a wrong claim is easiest | `2S-CLOSE-010` — closure needs the owner and a device |

---

## 4. The blockers

**Two, in order, and neither is optional.**

1. **Sign the ten open decisions.** `OD-2S-1` … `OD-2S-10`. Until then the
   requirement set is provisional: `OD-2S-1`, `OD-2S-4`, `OD-2S-5` and `OD-2S-9`
   each **add or strike requirements** rather than amending them.
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
| 7 | **A verb needs a second authority over a task's status** | `OD-2S-2` |
| 8 | **Polymorphic ownership cannot be proved by trigger** — a relationship row's own `user_id` is never sufficient proof | `2S-TRUST-004` |
| 9 | **Any half can only be proved by spending the owner's AI credential** — recorded **unspendable**, never a pass | `2S-TRUST-007` |
| 10 | **Push would have to be resumed, repaired or claimed** to complete a requirement | `OD-2S-6`, `2S-TRUST-008` |
| 11 | **`undelivered` is non-zero at closeout** — a phase failure, not a category | `2S-CLOSE-001` |
| 12 | **A start signal for the roadmap successor appears** | ADR-136 |

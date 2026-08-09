# Phase 2K — deployment record

**The single authorized migration is deployed. The telemetry it carries is INERT on the deployed project, and this record says so.**

**Date.** 2026-08-09. **Authorization.** ADR-101, for `202608090088` and nothing else.

---

## 1. What was deployed, and how it was gated

| Step | Result |
|---|---|
| Exact merge SHA | `e9997f13fa544a75e7502b5b84e1effe3c42790a` (PR #153) |
| CI on that merge SHA | **Green, all three jobs** — application, database and journey, edge worker |
| Working tree | Clean |
| Local bytes vs the merge SHA | **Byte-identical** — `git diff <sha> -- <migration>` empty |
| Hosted pre-head | `202608080087` |
| Dry run | **Exactly one** pending migration: `202608090088_phase_2k_conversation_telemetry.sql` |
| Apply | **Succeeded.** Its four embedded verification blocks passed — they abort the transaction otherwise |
| Hosted parity after | **local = remote = `202608090088`, 88 migrations** |

The migration is correct and its own gates hold. What follows is about a gate it did not know existed.

---

## 2. The defect the deployment probe found

**Every Phase 2K event is refused on the deployed project with `22023 Unsupported product surface`.**

`private.record_product_event` carries a **hardcoded surface allowlist**:

```
'home', 'capture', 'inbox', 'needs_attention', 'interpretation_review',
'technical_details', 'work', 'questions', 'server', 'task_command'
```

`conversation` is not in it. So the producers ship, the application validator accepts, the table CHECK accepts the event name, `validate_product_event_properties` accepts the properties — and the write is refused at the last step, inside a call site that wraps emission in `.catch(() => {})`. **Silently.**

### This is `202608080087`'s defect, one field over

That correction deleted the frozen **event-name** copy from this same function, because it had been silently rejecting `rate_limit_refused` since `202608070081`. It left the **surface** list in place, and nothing guards it: `2K-METRICS-004` asked for "all live enforcement points audited", and I audited the two the previous defect had taught the repository to look at — the table CHECK and the property validator — and missed a third that was in the very function the previous correction edited.

The phase's own threat model names this risk (`T-2K-06`, "a third vocabulary copy appears again") and its mitigation was `2K-METRICS-004/005`. **The mitigation was insufficient, and the probe is what found it.** That is the argument for probing after deployment rather than trusting a green migration.

### Why CI did not catch it

`post_2j_product_event_write_path.sql` writes every declared name through the real writer with `surface = 'server'` — uniform, and deliberately so: its own comment says the writer "does not couple surface to event name, so varying it here would test nothing this file is about". That reasoning was correct for its subject and blind to this one. **A Phase 2K event written on the `conversation` surface was never exercised anywhere.**

---

## 3. Probe results, in full

| Check | Result |
|---|---|
| `conversation_answer_shown` through the real writer | **FAIL** — `22023 Unsupported product surface` |
| `conversation_memory_resolved` through the real writer | **FAIL** — `22023 Unsupported product surface` |
| `conversation_suggestion_shown` through the real writer | **FAIL** — `22023 Unsupported product surface` |
| Negative control: undeclared event name refused | Refused — **but for the wrong reason** (the surface gate fired first), so it is a **vacuous pass** and is not counted |
| Negative control: content-shaped property refused | Refused — **same vacuity**, not counted |
| Producer → writer → consumer | **NOT PROVED** — nothing was written, and `service_role` cannot `SELECT product_events` (RLS scopes it to the owning `authenticated` user) |
| **Zero residue** | **PROVED, by construction.** Every write was refused, so no row was created. The probe file was deleted |

The two negative controls are reported as **vacuous**, not as passes. A control that fires for a different reason than the one under test proves nothing about the gate it claims to cover — which is the failure this repository recorded as *"a control must not be exempt"*.

---

## 4. What this costs, and what it does not

**It does not affect any user-facing behaviour.** Every Phase 2K product capability — the card grammar, the sensitivity policy, continuity, sources, the explanation panel, suggestions, the memory undo — is deployed and working. Telemetry emission is fail-open by design, so a refused event is swallowed and nothing breaks.

**What is lost is the measurement.** `2K-METRICS-007` requires producer → writer → RLS consumer proved end to end. On the deployed project the producer reaches the writer and is refused, so the funnel will report zeros — indistinguishable from a quiet week, which is the exact confusion SH.6 cost weeks to.

---

## 5. Why this stops here

**Fixing it requires a second migration** — widening the surface allowlist inside `private.record_product_event`, or removing that third copy the way `202608080087` removed the second.

ADR-101's ceiling is **one**, and its stop conditions name this case first: *"work stops and returns to the owner if any of these becomes necessary: **a second migration**"*. So no second migration was created, and none should be until the owner decides.

**Two options exist and the choice is the owner's**, not this record's:

1. **Widen the list** — add `'conversation'`. Smallest change; leaves the third copy in place for the next phase to trip over.
2. **Delete the copy** — take the surface vocabulary from a single source the way the event-name vocabulary now is. Larger, and it is the change that stops this recurring. It is what `202608080087` did for the other half, and its reasoning applies unchanged.

Recommendation, stated as a recommendation: **option 2**, because option 1 leaves a guard-less duplicate in the one function that has now caused this defect twice.

---

## 6. Posture after deployment

- **Hosted parity: `202608090088`, 88 migrations, local = remote.**
- **RLS, grants, policies:** unchanged. The migration alters one CHECK constraint and re-declares one `security invoker` function.
- **No cron, retention, storage or audio change.**
- **Signup:** closed. **Rollout gate:** 25 pass · 3 fail · 2 owner-signature, untouched.
- **Zero fixture residue**, proved by construction: no probe write succeeded.

---

## 7. Requirement status this record settles

| Id | Status after deployment |
|---|---|
| `2K-METRICS-008` | **built** — zero residue proved |
| `2K-METRICS-007` | **partial, and now with a known cause.** Remainder: the surface allowlist admits `conversation`. Destination: an owner decision on a second migration |
| `2K-METRICS-004` | **partial, corrected downward from built.** It claimed all live enforcement points were audited. **A third existed.** Remainder: the surface allowlist in `private.record_product_event`. Destination: the same owner decision |
| `2K-METRICS-005` / `2K-METRICS-006` | **unchanged.** Both are true of the vocabulary they cover — the write path proves every declared *name*, and the refusals are real. Neither claimed anything about the surface gate |

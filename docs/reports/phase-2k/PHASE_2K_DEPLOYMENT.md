# Phase 2K — deployment record

**The single authorized migration was deployed, and the telemetry it carried was INERT on the deployed project. This record said so then and still says so.** §8, appended after the owner's decision, records the extraordinary correction that made it operational.

**Date.** 2026-08-09. **Authorization.** ADR-101, for `202608090088` and nothing else. **Then, separately:** an owner decision of 2026-08-09 authorizing **one exclusively corrective migration, `202608090089`, outside Phase 2K's budget** — see §8.

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

---

## 8. The extraordinary correction — `202608090089` (appended 2026-08-09)

**Everything above stands. The phase reached closeout with inert telemetry, and this section does not revise that; it ends it.**

### 8.1 The decision

The owner chose **deletion over addition**: remove from `private.record_product_event` the hardcoded copy of the surface vocabulary, rather than merely adding `conversation` to it. One **exclusively corrective** migration was authorized **outside** the original ceiling.

**The budget is not retroactively reclassified.** Phase 2K's authorized implementation remains **`1 allocated · 1 spent`**. `202608090089` is a **post-phase correction**, charged to **no phase** — in particular not to the roadmap successor, which has not started.

### 8.2 The second gate, found while fixing the first

`product_events_surface_check` on the table also stopped at `task_command`. `202608090088` widened the event-name CHECK and the property validator and left that one. **The writer's copy refused first and masked it** — so deleting only the writer's list would have moved the refusal from `22023` to a raw `23514` rather than removing it. Both gates were corrected in the same migration.

### 8.3 What the migration does, and what it deliberately does not

- **Deletes** the writer's surface list. **No equivalent list is introduced in any other format**, and the migration refuses to run unless it can extract at least ten surfaces from the CHECK and prove **none of them appears in the writer's body**.
- **Widens** `product_events_surface_check` by exactly one value, `conversation`, already declared by the application since `202608090088`. Nothing else was widened — no event, no property, no surface beyond the already-declared vocabulary.
- **Preserves the refusal contract**: `22023 Unsupported product surface`, same message, via `GET STACKED DIAGNOSTICS` on the constraint name. A caller cannot tell the gate moved.
- **Preserves** the signature, arguments, return shape, `security definer`, `set search_path = ''`, event/property/locale/viewport/app-version/idempotency validation, ownership and subject assertions, the idempotent insert, and all grants and revokes.
- **Changes no RLS policy, no grant, no security posture, and no product code.** The diff touches five files: the migration, the pgTAP suite, two closeout chain-head pins and `docs/SECURITY.md`.
- **No visible Phase 2K functionality changed.**

### 8.4 The regression

`post_2j_product_event_write_path.sql` **extended from 20 to 29 assertions** — extended, never weakened, never duplicated into a second file. The surface vocabulary is derived from the CHECK **at test time**; a list restated in the test would be the third copy this correction exists to delete.

It proves: at least ten surfaces were actually extracted (non-vacuity); every declared surface is writable through the real writer; `conversation` is accepted; all three Phase 2K events are writable **on** the `conversation` surface; an undeclared surface is still refused with the same errcode **and** message; and the writer names **no** declared surface, read from the catalog. It then **plants** the historical gate — proving the refusal returns — and **restores** the corrected writer, proving it disappears.

### 8.5 Deployment

| Step | Result |
| --- | --- |
| Merge SHA | `eaf98b6`, PR #155 |
| CI on the **merge SHA** (not the PR head) | green — application, database and journey, edge worker |
| Local bytes vs merge SHA | identical |
| Dry run | exactly **one** pending migration, `202608090089` |
| Apply | succeeded; every in-migration verification block passed, including the writer-names-no-surface assertion |
| Parity | **89 local · 89 remote**, head `202608090089`, no pending and no remote-only |

### 8.6 Hosted producer → consumer proof, 13/13

A **disposable account** created through the admin API. **Signup was never opened. No BYOK credential was used. No provider was called.** The hosted CAPTCHA refuses scripted password sign-in, so the session came from an admin-minted one-time code redeemed at the ordinary verify endpoint — a real `authenticated` session, not a service-role impersonation, because RLS is the boundary being tested.

Writes went through the **authenticated** `public.record_product_event`, the path the browser producers actually reach, so the owner comes from `auth.uid()` and never from an argument.

| Proof | Result |
| --- | --- |
| `conversation_answer_shown` / `_memory_resolved` / `_suggestion_shown` on `conversation` | accepted, event ids returned |
| **Negative control** — undeclared surface | refused `22023 Unsupported product surface` |
| **Negative control** — undeclared event, on a **valid** surface | refused `22023 Unsupported product event` |
| **Negative control** — a person's name in the payload | refused `22023 Unsupported product event property` |
| Idempotency replay | same id, `recorded` true then false |
| Owner reads its own events under **RLS** | 4 rows |
| Real `aggregateConversationFunnel` | answers 2 / memories 1 / suggestions 1, **0 unrecognised** |
| An event outside the consumer's set (`work_view_viewed`) | ignored by the funnel |
| **Zero residue** | 5 owned rows before the account delete, **0 after the same read replayed** |

**The negative controls are non-vacuous by construction.** The undeclared event and the forbidden property are exercised on a **valid** surface, so the surface gate cannot be the thing that answers — the exact vacuity that let this defect through the first time.

**A global ledger count is impossible here, and that is correct rather than a gap.** `service_role` holds no `SELECT` on `product_events`; it is append-only and written only through the RPC. Residue is therefore proved owner-scoped, which is the stronger claim: a brand-new account starts at zero, and after deletion the **same authenticated read** returns to zero via `on delete cascade`.

### 8.7 Requirement status this section settles

`2K-METRICS-004`, `2K-METRICS-007` and `2K-SUGG-005` move from **partial** to **built**. The matrix was **regenerated from source**, not hand-edited: **79 declared · 79 classified — 67 built, 9 baseline, 3 partial.**

**`2K-SUGG-005` is recorded precisely.** Its event was **already wired in 2K.8**. What outlived that was the global writer refusal — a defect in `private.record_product_event`, not a missing piece of this requirement.

### 8.8 Still not proved, and still not inferred

Screen reader; real-device mobile; hydrated interactivity; zero-source provider prose; authenticated online journeys. **None of these sessions was executed and none is claimed.** `2K-A11Y-007`, `2K-AUDIT-002` and `2K-EXPL-007` remain partial with their remainders and destinations unchanged.

**Phase 2L is not started.** No successor phase is authorized, planned, or given artifacts. The rollout gate reads **25/3/2** and signup remains closed; this correction is not progress toward either.

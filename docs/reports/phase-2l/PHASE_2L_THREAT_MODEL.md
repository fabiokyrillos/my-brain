# Phase 2L — Work and execution · threat model

**Status:** planning evidence. Declares no requirement and authorizes nothing. Written
independently enough of the PRD to catch an unsupported claim in it; where the two
disagree, that disagreement is a finding, not a formatting problem.

**Scope of the assessment.** The surfaces Phase 2L would build — the Work list with
quick edit, multi-selection, bulk preview/apply/result, the responsive task detail, the
undo affordance, the view taxonomy and the return payload — plus the parts of the
existing Work surface those changes touch.

**Trust boundaries, restated.** Ownership comes from the authenticated Supabase session
plus forced RLS, and from nothing else. Selection, filtering, preview, masking and
every list projection are **presentation**; a reviewer who finds any of them
load-bearing for isolation has found a bug, not a feature.

**Existing posture inherited, not re-litigated:** a foreign task 404s rather than 403s
(`work/[taskId]/page.tsx:46-48`); the clicked id is authoritative and the rendered
title is a hint (`2F-SURFACE-004`); no Work verb reaches `cancelled`
(`2F-SURFACE-012`); the apply path enforces a twelve-column staleness gate and a
server-issued confirmation for the one destructive verb; no service-role client exists
on any product path (ADR-075).

---

## T-2L-01 — Editing a task that is not yours

**Threat.** A crafted submission carries another account's `taskId` to a quick-edit or
bulk endpoint.

**Why the existing shape resists it.** `apply_task_command` resolves the target through
`list_task_command_candidates` under the caller's own session; RLS on `tasks` is
forced; a non-owned id produces no candidate and the apply refuses.

**What Phase 2L adds to the attack surface.** Nothing, *provided* the new controls
submit an id and nothing else that could widen resolution. The risk is a "quick edit"
Server Action that takes a convenience shortcut — a direct `.from("tasks").update()`
for a title, because it is "just a rename".

**Mitigation.** `2L-EDIT-002` plus the 2L.0 guard proved **red against a planted second
write path before any slice writes one**. `2L-BULK-011` requires the same for every
item in a set.

**Residual risk.** None beyond the existing path's.

---

## T-2L-02 — Client-supplied parameters widening what is read

**Threat.** `?view=`, `?filter=`, `?order=`, `?group=` or `?page=` is crafted to widen
the result set — to reach cancelled work from a view that should not show it, to defeat
a mask, or to inject into an ordering clause.

**Mitigation.** `2L-VIEW-008` requires every parameter to fail closed to a declared
default and explicitly forbids resolving to an unfiltered or wider set. Ordering comes
from a **declared closed set** (`2L-VIEW-005`), never from user text — the current
`parseWorkView` fallback is the right shape and the new parameters must copy it.
Filtering is restricted to attributes the projection already loads
(`2L-VIEW-004`, `2L-VIEW-006`), so no filter can reach a column the page does not
already read under RLS.

**Residual risk.** A permissive parameter would be a *visibility* defect, not an
isolation one — RLS still scopes every row to the owner. Stated so the mitigation is
not credited with more than it does.

---

## T-2L-03 — A selection containing objects the user may not act on

**Threat.** The selection is a client-held list of ids. A crafted submission includes an
id the user does not own, an id that no longer exists, or an id whose current status
makes the operation ineligible.

**Mitigation.** Every item is resolved and re-authorized **server-side, per item**
(`2L-BULK-011`), through the same path a single click takes. Eligibility is re-decided
against the resolved row, never against what the client believed (the property
`detailControlsFor` already establishes for single edits).

**The subtle half — an existence oracle.** If a foreign id refused differently from a
deleted id or from an ineligible one, a bulk endpoint becomes a fast enumeration
primitive: submit ids, read the reason classes. `2L-BULK-011` therefore requires the
outcomes to be **byte-identical** across foreign, deleted and unreadable, and the plan
makes that a test rather than a convention.

**Residual risk.** *Timing* remains a theoretical distinguisher. Not mitigated, and
recorded rather than claimed: the same exposure already exists on the single-item path
and this phase does not make it worse.

---

## T-2L-04 — A confirmation reused for a different set or a different operation

**Threat.** A bulk confirmation is captured and replayed against a larger set, a
different operation, or a second time.

**Why this is sharp here.** Confirmations have **no TTL** by ADR-047 — staleness is
decided by facts, not by a clock. So a bulk confirmation cannot be made safe by
expiring it.

**Mitigation.** `2L-BULK-007` requires the confirmation to authorize exactly the
previewed set and exactly the previewed operation and to be unusable for anything else
or a second time — which means the set is a **fingerprint input**, exactly as the
canonical patch already is for a single command. The existing single-use consumption
`UPDATE` and the `2E_IDEMPOTENCY_MISMATCH` refusal are the mechanism, not a new one.

**Design consequence, now settled.** OD-2L-3 is **signed as option A**: no destructive
verb is bulk-eligible, so no bulk confirmation is ever minted and this threat's surface
is **empty by construction**. It is kept in the model rather than deleted because the
emptiness is a property of a signed decision, not of the code — adding one destructive
operation to the bulk set would restore the whole threat, and `2L-BULK-004` is what
stops that happening quietly.

---

## T-2L-05 — TOCTOU between preview and apply

**Threat.** The preview says "eight will change, two will refuse". Between the preview
and the apply, a task's status changes — from another tab, from the console, from the
worker. The apply now changes something the user never previewed.

**Mitigation.** `2L-BULK-005` requires the preview to be computed from **the same
eligibility rules the apply path uses**, and the plan tests that by driving both over
the same fixtures rather than re-implementing the rule. The apply path's own
twelve-column staleness gate then refuses per item, and `2L-BULK-008`/`009` report that
item as refused rather than aborting the batch.

**Residual risk, stated rather than mitigated away.** The window cannot be closed
without locking, which this phase does not do. The honest guarantee is: *a change that
happened after the preview is refused, not silently applied* — and the result says so.
A preview is a forecast; the result is the fact. **Copy that presents the preview as a
promise is the defect**, and `2L-BULK-009` is written against exactly that.

---

## T-2L-06 — A partial result presented as a complete success

**Threat.** Eight of ten applied; the surface says "done". The user believes ten
changed and acts on that belief.

**Why this is the phase's signature risk.** It is the one failure that leaves the user
with a *false model of their own data*, and the product already has a precedent for
producing it: `NeedsAttentionList` breaks out of its loop on the first failure and
renders one generic sentence, with the `succeeded` array never reaching the screen
(audit §4).

**Mitigation.** `2L-BULK-008` (continue past a refusal), `2L-BULK-009` (state applied
count, refused count and each reason), and the plan's release-blocking test: *n* items,
item *k* refused, result reports *n-1* applied and 1 refused **and the applied items
are actually applied**. The universal-state table gives `partial` its own state so it
cannot be rendered as `applied`.

**Residual risk.** None structural, but the guard must be behavioural. A test that only
asserts the *string* "partial" would pass over a surface that renders the count wrong.

---

## T-2L-07 — Undo applied to the wrong state

**Threat.** The user changes a task, changes it again, then presses undo — and the
first change is reverted over the second. Or a bulk undo reverses items that were never
applied.

**Mitigation.** Undo is not a UI concept here: `public.undo_operation` reverses a
**recorded operation** through a registered handler using recorded pre-state, and
`loadTaskCommandUndoOperation` reads the row before trusting any client-supplied id, so
an id that is not the caller's, not a Phase 2E operation, or already spent never
reaches the router. `2L-BULK-012` restricts a bulk undo to the **applied subset** and
forbids claiming an item that was not applied.

**The copy risk is the real one.** `2L-EDIT-008` requires the affordance to state the
window and to **disappear** rather than fail when the operation is spent or expired —
the two states `undo-listing.ts` already distinguishes from data. `2L-EDIT-009` forbids
offering undo where the domain has none, and forbids implying reversal when only a
recovery path exists.

**Residual risk.** A second operation on the same task can make an earlier undo's
`restore_fields` strategy semantically surprising even when it is mechanically
correct. The domain's answer is the staleness gate; the surface's answer must be to
stop offering the older undo once a newer operation exists on the same task. **This is
a design requirement the implementer must not skip**, and it is the sharpest thing in
this document that the PRD states only implicitly.

---

## T-2L-08 — A duplicated bulk application

**Threat.** A double tap, a retried transition or a resubmitted form applies a bulk
operation twice.

**Mitigation.** `2L-BULK-010` — each item carries its own operation key, so a repeat
replays per item rather than duplicating any write, reusing the property
`2F-SURFACE-006` established. Keys are minted lazily in a ref, never in a render body
(the existing `work-item-actions.tsx` pattern), because `useActionState`'s
pending→settled transition re-renders and StrictMode double-renders in development.

**Residual risk.** A *new* set submitted under old keys would produce
`2E_IDEMPOTENCY_MISMATCH` refusals rather than duplicate writes — safe, but confusing
if the copy does not explain it. Key rotation after every terminal outcome is what
prevents it.

---

## T-2L-09 — An accidental gesture applying a change

**Threat.** A swipe fires during a scroll, or a stray touch on a crowded row applies
something.

**Mitigation.** `2L-MOBILE-004` forbids any gesture handler on a Work surface and
proves the absence with a guard. `2L-MOBILE-005` then covers what remains once gestures
are gone: a control that changes state is spatially distinct from scrolling
affordances, a control mid-flight is disabled rather than re-triggerable, and the one
destructive verb stays behind its server-issued confirmation.

**Residual risk: zero, because OD-2L-5 is signed as option A and no gesture exists.**
The mitigation is an absence enforced by a guard rather than a behaviour that has to be
got right — the strongest form available. `2L-MOBILE-004` proves the absence against a
planted handler.

---

## T-2L-10 — Accidental destruction

**Threat.** A user cancels work they did not mean to cancel.

**Mitigation.** Inherited and unchanged: `cancel_task` is `destructive`, not
`oneStepEligible`, and `requiresConfirmation` with a server-minted row. `2L-EDIT-010`
forbids any quick-edit control from applying it directly. `/app/work/cancelled` remains
the recovery path, and `2L-VIEW-003` makes it findable from a named destination rather
than only from a trailing link.

**Residual risk.** The 24-hour undo window and the indefinite recovery surface are
different guarantees; conflating them in copy is the risk, and §5.2 of the PRD says so
in the words the implementer will read.

---

## T-2L-11 — Stale state rendered as current

**Threat.** A returned-to list renders what was there before the task was opened, so a
user acts on a row whose status has changed.

**Mitigation.** `2L-RETURN-004` requires the return to re-authorize and re-read — a
fresh owner-scoped query, never a replay. `2L-RETURN-005` requires a no-longer-valid
position to resolve to the nearest valid one **and say so**.

**Residual risk.** None new. The apply path's staleness gate is the backstop for
anything the render missed.

---

## T-2L-12 — A filter or a view leaking information

**Threat.** A filter chip reading "3 hidden" is an existence oracle wearing a helpful
hat. A grouping that shows a project name the user cannot read leaks a name.

**Mitigation.** `2L-PRIVACY-003` requires withholding **in place**: the row, the count,
the filter and the selection stay truthful and only content is masked — the reasoning
the central sensitivity contract already records for every other surface.
`2L-VIEW-006` restricts grouping to attributes the page's own projection already loads
under RLS, so a group label can only name something the user can already read.

**Residual risk, and it is the signed decision's cost rather than a mitigation gap.**
OD-2L-1 is signed as **option B**, so masking now exists on Work — which means the
leak channels above become live and `2L-PRIVACY-003` is load-bearing rather than
conditional. The residual B leaves is different and narrower: **a manually created task
has no derivable classification at all**, so a user who writes sensitive text directly
into a task title gets no protection. `2L-PRIVACY-004` makes stating that a
requirement, and option C — classifying tasks — is explicitly out of this phase.

---

## T-2L-13 — Saved state shared or leaked between users

**Threat.** A stored per-user "last view" leaks between accounts, survives account
deletion, or becomes an unowned row.

**Mitigation by construction.** `2L-VIEW-007` and `2L-RETURN-002` forbid stored
per-user view state entirely. There is no row, so there is no policy to get wrong, no
retention class to forget and no deletion-cascade entry to miss. This is the strongest
mitigation in the document precisely because it is an absence.

**Residual risk.** None. The temptation is the risk: a saved-view table is the most
likely scope creep in the phase, and it is listed as an explicit refusal in the budget.

---

## T-2L-14 — User content in telemetry

**Threat.** A Work event carries a task title, a note, a person or project name, or a
filter value.

**Why the risk is higher here than it looks.** A filter value is *user-chosen* and
feels like a setting rather than content — but a free-text filter is user content, and
a person or project name in a grouping property is a name.

**Mitigation.** `2L-METRICS-001` bans free text by construction: closed enums, booleans
and bounded counts only. `2L-PRIVACY-004` forbids withheld content from reaching a
preview, a result, an undo affordance or an event. The boundary must be **in the type**
— Phase 2K's suggestion slice proved the pattern by returning a `{category, name}` pair
and narrowing telemetry through a return type with no field a name could occupy.

**Residual risk.** A *count* is a weaker disclosure than a name and is permitted;
`2L-METRICS-005` bounds the counts. Recorded because a rate is a count over repeated
queries, which is the reasoning `2K-EXPL` had to apply.

---

## T-2L-15 — A return-navigation payload that re-applies authorization

**Threat.** The return payload grows a field that lets a pending confirmation survive a
navigation — the exact defect ADR-100 corrected for Conversar, where transporting
`issuedAt` would have transported an authorization because the clock is a hashed
fingerprint input.

**Mitigation.** `2L-RETURN-003` restricts the payload to navigation position and
requires it to be **refused rather than ignored** if it carries anything else. The plan
requires `.strict()` plus refusal **by name** of confirmation id, operation key,
`issuedAt`, `observedBefore`, fingerprint, patch, preview, mutation, session and
expected — each proved against a planted instance.

**Why refuse rather than strip.** A payload that silently drops an unexpected field
teaches a future contributor that adding one is harmless. The property required is that
the payload is **incapable** of authorizing, not that it is hard to forge.

**Residual risk.** None, if the refusal is by name and by `.strict()` together. One
alone is not enough: a name list misses what nobody listed, and `.strict()` alone gives
no signal about *which* names are dangerous.

---

## T-2L-16 — Service-role or grant widening as a shortcut

**Threat.** Bulk feels slow, so someone reaches for a service-role client, a
`security definer` helper with a loose `search_path`, or a widened grant.

**Mitigation.** ADR-075 and `operator-surface-boundary.test.ts` already walk `src/app`
for the key and for an admin route. The PRD forbids new grants, roles and policies
outright, and the budget lists a set-valued RPC as an explicit refusal.

**Residual risk.** The pressure is real and will arrive at `2L-BULK` if the ceiling
(OD-2L-4) is set too high. **The ceiling is a security control, not a performance
setting** — that is the sentence this entry exists to add.

---

## T-2L-17 — RLS regression through a new query shape

**Threat.** A grouped or filtered projection introduces a join or an embedded select
that bypasses a policy, or a relation read that is scoped by `task_id` alone.

**Mitigation.** Relationship rows prove ownership by composite key, and the existing
`loadTaskRelations` scopes **both** `user_id` and `task_id` on every relation read — the
pattern any new query must copy. `2L-VIEW-006` forbids grouping from adding an
unbounded per-user query. The pgTAP suite runs the whole migration chain from empty in
CI on every PR head and merge SHA.

**Residual risk.** A new query shape is the most likely place for a quiet regression,
and this phase is where several appear. If any new SQL is written at all, it needs a
pgTAP assertion with **two accounts and a positive control** — a denial test that
passes because the fixture was empty proves nothing.

---

## T-2L-18 — Unexpected AI consumption

**Threat.** A "smart" grouping, an inferred priority or a natural-language filter
quietly calls the provider on the user's own BYOK credential, on a surface they did not
ask to be intelligent.

**Mitigation.** `2L-METRICS-007` and the PRD's cost section: nothing this phase builds
constructs a provider, records an `ai_usage_events` row or requests a rate-limit slot.
The pattern Phase 2K proved is stronger than a promise — assert the module is
**incapable**: no provider construction, no usage recording, no admission call, and no
`async` where none is needed, because an `async` export is the first sign something has
started reaching for a network.

**Residual risk.** The command console remains the AI path on the surface and is
untouched by this phase. Stated so a reviewer does not read "no AI on Work" as "no AI
anywhere near Work".

---

## T-2L-19 — Accessibility available only through a gesture or only through hover

**Threat.** An action is reachable only by swiping, or only by hovering a row.

**Mitigation.** `2L-MOBILE-003` (no hover dependency), `2L-MOBILE-004` (a gesture is
never a sole route), `2L-ACCESS-005` (selection, quick edit, preview, confirmation and
result fully keyboard operable). Work enters the automated lane in the slice that
builds each surface (`2L-ACCESS-001`).

**Residual risk, named rather than mitigated.** The lane renders **static fixtures**,
so it proves markup and computed style; it does not prove hydrated interactivity and it
does not simulate a screen reader. `2L-ACCESS-008` requires both to be reported as
executed or not executed. A phase that reported an axe pass as a screen-reader session
would be repeating the exact over-claim `baseline` and `partial` exist to prevent.

---

## T-2L-20 — The phase quietly acquiring schema

**Threat.** A saved view, a task sensitivity column, a second event name, an index "for
the new ordering" — each individually defensible, together a schema phase wearing a UX
phase's name.

**Mitigation.** A ceiling of one migration, allocated to one slice, non-transferable,
with the reason named (`workView` is an enum inside the property validator) rather than
reserved; five explicit refusals in the budget; and per-slice reconciliation so an
unspent allocation cannot migrate to a later slice.

**Residual risk.** Two pressures remain, both now explicitly refused rather than open.
OD-2L-1 **option C** (classify tasks) is a genuinely better product and is **outside
this phase**; it must reach the owner as a separate authorization, never as an
implementation detail discovered mid-slice. And OD-2L-2 **option B** (widen `workView`)
is the one thing the single allocation was ever for — signing option A means the
allocation lapses, and **drifting back to B during 2L.3 is a stop condition**, not a
budget the implementer may spend.

---

## Summary — what the implementer should be most afraid of

1. **T-2L-06** — a partial reported as a success. It is the only failure that leaves the
   user with a false model of their own data, and the product has already shipped the
   loop-and-break shape that produces it.
2. **T-2L-07** — an undo affordance that outlives its operation, or copy that promises
   reversal where only recovery exists.
3. **T-2L-03** — a bulk endpoint that distinguishes foreign from deleted from
   ineligible, turning selection into an enumeration primitive.
4. **T-2L-15** — a return payload that grows one convenient field and becomes
   transportable authorization.
5. **T-2L-20** — a UX phase that ends up owning schema because five small decisions
   each looked reasonable alone.

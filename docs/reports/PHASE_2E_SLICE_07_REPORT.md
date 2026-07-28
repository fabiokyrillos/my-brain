# Phase 2E — Slice 2E.7 report (Epic 2E-G, conversational and task-surface integration)

**Status: ACCEPTED — READY WITH NON-BLOCKING NOTES.**

The first slice of Phase 2E with any user-visible behaviour. Slices 2E.1–2E.6 built the command
schema, the deterministic matcher, the read-only preview, the mutation RPC, the confirmation ledger
and the creation RPC, and left every one of them without a production caller. This slice is that
caller.

Nothing is merged, deployed, tagged or released. Remote migration parity remains `202607250054`;
`202607250055`–`202607280061` are branch-only.

## 1. What shipped

| Artifact | Responsibility |
|---|---|
| `session.ts` (new) | The command envelope: the normalized proposal, the **pinned** issuing instant, the explicit selection, the staleness witness, and the one bounded clarification. Every step re-derives from it. |
| `console-state.ts` (new) | The state contract and the closed control/intent vocabularies. Separate because a `"use server"` module may export only async functions. |
| `actions.ts` (new) | Eight Server Actions behind one `runTaskCommand` dispatcher. Authentication, the caller's own timezone, AI-usage ordering, confirmation placement, fault mapping and analytics all live here. |
| `analytics.ts` (new) | The score/margin band mapper `match-policy.ts` deliberately deferred until a caller existed, and four content-free payload builders. |
| `undo-listing.ts` (new) | The task-scoped undo projection (2E-UNDO-005), and how 2E-UNDO-007's two outcomes are told apart without widening the SQL error vocabulary. |
| `recovery.ts` (new) | The cancelled-task listing, read through `list_task_command_candidates`. |
| `command-console.tsx`, `confirm-dialog.tsx`, `cancelled-tasks-view.tsx` (new) | The surface, the hand-rolled modal, and the recovery view. |
| `202607280061` (new) | The `task_command` surface and four event names in all three allowlists, plus three new property validators. |
| `scripts/product-event-vocabulary.mjs` (new) | The reader that makes 2E-ANALYTICS-006 true. |
| `e2e/task-command.spec.ts` (new), named in `ci.yml` | Credential-free, so it actually gates. |
| `contracts.ts`, `copy.ts`, `outcomes.ts`, `work-view.tsx`, both chat pages, `architecture.test.ts` | Extended. |

## 2. The four properties this slice is actually about

Each is stated here because each is easy to lose in a later edit and expensive when lost.

**1. The clock is pinned once per command.** `loadTaskCandidates` derives `p_observed_before` from
the instant it is given (`candidates.ts:231`); the RPC echoes it onto every row;
`buildTaskCommandPreview` carries it into `preview.observedBefore`; `buildApplyPayload` hashes it.
Minting a fresh instant per step would therefore move the fingerprint on **every step of one
operation key**, and three guarantees break at once: 2E-IDEMPOTENCY-004's replay returns
`2E_IDEMPOTENCY_MISMATCH` instead of the original outcome, a double-submit is refused rather than
replayed, and a destructive retry after a `2E_TRANSITION_INTEGRITY` can never succeed because the
surviving confirmation is bound to the first attempt's digest. See ADR-050.

**2. The destructive confirmation is issued by the round that renders the preview.** Issuing it
inside the Confirm action — which the first design did — binds the token to whatever the envelope
says at Confirm time rather than to the preview the user saw, leaving 2E-DESTRUCTIVE-003 with no
prior confirmation to invalidate. The same placement applies to the creation confirmation. See
ADR-051.

**3. The staleness witness travels, and a write refuses without it.** Every render records
`{taskId, updatedAt}`; every write passes it back as `buildTaskCommandPreview`'s `expected`. An
envelope that reached a write without one is an envelope no server render produced, and honouring it
would make 2E-PREVIEW-006 structurally unreachable and turn the apply into the silent
recompute-and-apply PRD §12.6 forbids by name. The database's twelve-column gate is still the wall;
this is what lets the user be *told* rather than refused.

**4. Nothing throws out of a Server Action.** `creation.ts:192`, `confirmation.ts:112`,
`apply.ts:132,181`, `candidates.ts:222,229`, `matching.ts` and `preview.ts` all signal precondition
faults by throwing. An uncaught one escapes the action, React renders the error boundary, and the
user's pending command is gone — which 2E-UX-002 forbids by name.

## 3. What the pre-implementation design review had wrong, and what verification found

The design was reviewed before any code was written (`PHASE_2E_SLICE_07_DESIGN.md`), and its twelve
critical corrections were **re-verified against the tree** at the start of this session rather than
taken on trust. All twelve held. Three were verified by execution rather than by reading:

- **jsdom 29.1.1 has no `showModal`, `show` or `close`** on `HTMLDialogElement.prototype`. Confirmed
  by running jsdom. A native `<dialog>` would have made 2E-A11Y-004 unassertable in the only
  accessibility gate CI runs.
- **`undeclared_failure` is `refused` *and* `retryable: true`** (`errors.ts:335-340`), so retry must
  key off `TASK_COMMAND_FAILURE_POLICY`, never off the outcome.
- **`capabilities.ts`'s `nested: true` drives active-state highlighting only.** Links render from
  `primaryNavigationKeys`/`moreNavigationGroups`, so `/app/work/cancelled` needed a rendered entry
  point or 2E-DESTRUCTIVE-006 would be unmet. It is linked from the Work page rather than added to
  the navigation, which would have made a Phase 2E recovery surface a change to the daily-cycle
  product contract.

**One documented drift:** the design's §4 says "the complete finding set — 42 findings, with evidence
and remedies — is reproduced in §6", and §6 does not reproduce them. Only the twelve critical
corrections and the follow-on paragraph survived. This report records that rather than pretending the
detail existed; the twelve are what the implementation was verified against.

Two review lenses the design session never ran — executable gates and design alternatives — were run
here. The gate lens produced the list in §6. The alternatives lens changed one decision: the analytics
apply-route literal was renamed `one_step` → `direct`, because a preview reached through an explicit
disambiguation also applies through that route and only the first is "one step"; whether the match was
one-step eligible is already carried, truthfully, on the preview event.

## 4. What the post-implementation review changed

A shipped-code, integration and accessibility pass ran over the whole slice after it was working and
green. Four findings were acted on; the first is the one that mattered.

- **Critical — the preview event reported a match verdict and called it an outcome.** A plain
  `matched` result was emitted as `outcomeCategory: "matched_requires_confirmation"`, and an
  `unmatched` result as `still_unmatched`, because the outcome vocabulary has no member for "a
  preview waiting for the user". That would have corrupted the exact measurement PRD §18 asks for
  first — how often a command matched in one step — and would have reported a `creation_offered` or
  `clarification_requested` round as terminally unmatched. Fixed by reporting the **resolved**
  category: the preview's own disposition for a matched round, and the no-match branch's real
  decision for an unmatched one. That required one member, `previewed`, which is the single
  `TASK_COMMAND_PREVIEW_DISPOSITIONS` entry the outcome vocabulary deliberately excludes; the twelve
  outcomes are untouched, and a test pins both halves. The migration was not yet deployed, so the
  CHECK could still be corrected.
- **Important — a successful command left the surrounding surface stale.** Nothing revalidated after
  a write, so a user applied a change from the Work page, read "Done", and the task list beside the
  console still showed the old state until they navigated. Both mounts are now revalidated after an
  apply, a creation and an undo, and a test asserts that a *refused* write revalidates nothing.
- **Minor — the undo event's idempotency key was a clock bucket** (`Math.floor(Date.now()/60_000)`),
  so two clicks in one minute deduped and two clicks either side of a minute boundary did not. It is
  now keyed on the operation and its result, which is what "one undo, one event" actually means.
- **Minor — the before/after list was labelled with the evidence label.** "Why this one" named a list
  of field changes. It has its own key now, in both locales.

One finding was **rejected**: that `applyTaskCommandAction` should require `preview.oneStep`. It must
not. `restore_task` is deliberately not one-step eligible (PRD §11.2) yet needs no confirmation, so
its preview rests at `previewed` with `oneStep: false` — requiring the flag would make the phase's
only escape from `cancelled` unreachable. The destructive guarantee does not depend on it: a
confirmation-requiring action never reaches the `previewed` disposition at all, and the database
refuses it regardless.

## 5. Defects found by this slice's own tests

Both were found by tests written for a requirement, not by reading the code.

- **The dialog focus trap selected unfocusable elements.** `input:not([disabled])` matches
  `type="hidden"`, and every form inside the dialog carries hidden locale, origin and session fields.
  "The first focusable element" therefore resolved to a hidden input, `.focus()` on it was a silent
  no-op, and the dialog opened with focus still on the page behind it; the Tab cycle failed
  identically. This is precisely the class of defect a native `<dialog>` would have hidden, since
  `showModal()` would have handled focus and the test could not have run at all.
- **The result region had no role.** A bare `div` with an `aria-label` has no implicit role, so its
  accessible name was announced only if focus happened to land there. It is now an explicit named
  `region`, which also makes it reachable by landmark navigation.

One more was found by the **production build**, and by nothing else: a `"use server"` module may
export only async functions, so the state vocabulary and the idle value could not live beside the
actions. Lint and typecheck both passed with them there.

## 6. Gates that constrained this slice, and how each is satisfied

| Gate | How it is met |
|---|---|
| `copy.test.ts` exhaustiveness | Four new vocabulary-backed sections registered in `VOCABULARIES`; two chrome sections registered in `FREE_FORM_SECTIONS`. A section in neither fails the coverage assertion. |
| `contracts.test.ts` exact equality | Surfaces and event names updated; a new case holds every restated Phase 2E vocabulary to its declaring module. |
| `preview.test.ts:1532-1543` | No preview DTO field was added. |
| `errors.test.ts` ↔ `phase_2e_task_command_apply.sql` | The error vocabulary is untouched. 2E-UNDO-007 is answered by reading the operation row instead. |
| `policy-lock.test.ts` | No policy value changed; the band mapper lives in `analytics.ts`, outside the digest. |
| `ci.yml` Playwright list | `e2e/task-command.spec.ts` is named there and is credential-free, so it gates rather than skipping. |
| `normalizer-divergence.test.ts` | No new module in the feature directory calls `normalizeEntityName`. |

## 7. Verification

**Local, on the accepted tree:**

`lint` 0 errors 0 warnings · `typecheck` 0 errors · `npm test` **2254 passed / 124 files**
(baseline before this slice: 2110 / 118) · focused `src/features/task-commands`
**1152 passed / 26 files** · `build` clean, with `/[locale]/app/work/cancelled` registered ·
`deno check` on both deployed entrypoints clean · `deno test` **46/46** ·
`npx playwright test e2e/foundation.spec.ts e2e/task-command.spec.ts --project=desktop --project=mobile`
**12 passed**.

**CI, the authoritative database evidence** — run `30369501161` on the exact accepted SHA `4af285d`,
all three jobs `success` (Docker is unavailable on this workstation, so no local pgTAP run is
reported):

- Migration chain applies from an **empty database**: `Applying migration 202607280061_phase_2e_task_command_analytics.sql` appears in both the stack start and the explicit from-zero reset.
- pgTAP `Files=30, Tests=1277, Result: PASS` — **unchanged from the Slice 2E.6 baseline, which is
  the correct arithmetic**: this slice adds no pgTAP file and alters no RPC that one asserts. Its
  database change is the analytics allowlist, whose guard is the migration's own post-deploy `DO`
  block plus `contracts.test.ts`.
- `supabase db lint --schema public,private` clean.
- The two-session creation race still passes.
- Playwright `12 passed` — `foundation.spec.ts` and `task-command.spec.ts` across desktop and mobile.

**A failure worth recording rather than hiding.** The first CI run on this slice was red, and the
failure was **this slice's own new e2e assertion**, not the database. It claimed a locale-less
`/app/work/cancelled` would redirect to a locale; it 404s, because `src/proxy.ts` reads the section
from `parts[2]`, so a locale-less `/app/...` path is not an app path to the proxy at all. The
assertion was wrong about a pre-existing contract. It now asserts the invariant that actually
matters — the new route answers identically to an existing one — rather than a status literal, so it
cannot pass by accident if that contract is ever deliberately changed. Migrations, pgTAP and database
lint were green on that same run.

## 8. Requirements this slice discharges

- **Fully:** `2E-UX-002`, `2E-A11Y-001`, `2E-A11Y-002`, `2E-A11Y-003`, `2E-A11Y-004`,
  `2E-ANALYTICS-001`, `2E-ANALYTICS-003`, `2E-ANALYTICS-004`, `2E-ANALYTICS-005`,
  `2E-ANALYTICS-006`, `2E-UNDO-005`.
- **Completed here, having been partially open:** `2E-UX-001` (presentation), `2E-UNDO-006`
  (rendering), `2E-UNDO-007` (surface handling), `2E-DESTRUCTIVE-006` (rendered affordance).
- **Physically discharged here under Epic 2E-A's acceptance:** `2E-PROVENANCE-002` (the ledger write
  precedes every dependent domain write, and a parse billed-then-failed is still recorded),
  `2E-COMMAND-011`.
- **Non-regression proofs only:** `2E-I18N-001`, `2E-I18N-002`, `2E-I18N-003`, `2E-COMMAND-009`,
  `2E-OWNERSHIP-005`, `2E-ANALYTICS-002`.

`2E-COMMAND-012` is **not** discharged here and the design's reclassification stands: prompt and
strategy versions travel on the session and are available to the operation, but no Phase 2E RPC has a
column for them, so recording them *on the operation* needs a schema change this slice has no mandate
to make. It is Slice 2E.8's, and is listed in §9.

## 9. Open items after accepted Slice 2E.7

1. **No deployment.** The linked project is at `202607250054`, so every Phase 2E RPC — including the
   three this slice calls — is unreachable online. **Every authenticated journey for this epic is
   blocked on that**, not on code: typing a command, resolving a disambiguation, confirming a
   cancellation, creating from a no-match, undoing, and restoring from the recovery page. The
   credential-free route/auth/locale journeys do run in CI.
2. **`2E-COMMAND-012` remains open**, as above.
3. **No focused remote smoke for this slice.** 2E-OPERATIONS-003 asks for one per slice; it is
   blocked on the same deployment.
4. **No mutation-testing round ran.** The evidence used here is the adversarial design review, the
   re-verification of its twelve corrections, 141 new unit/component assertions, the architecture
   boundary gates, and CI's database job.
5. **The `restore_task` recovery path depends on the task being ranked by its own title.** The
   listing renders the title and the restore command is built from it, so an exact-title tier-0 match
   is essentially certain — but a user with more than 25 cancelled tasks sharing one title could see
   a stale-shell preview instead. Disclosed rather than hidden; `hasMore` already tells the user the
   list is truncated.
6. **Draft PR #18 remains open and unmerged.** Nothing was deployed, tagged or released.

## 10. Continuation point for Slice 2E.8

Slice 2E.8 is Epic 2E-H — convergence and closeout. Its inputs from here:

- **One taxonomy, one matching policy, one preview contract, one mutation contract, one error
  vocabulary, one undo registry and one analytics allowlist** now all have exactly one consumer each;
  the convergence audit has a real surface to audit for the first time.
- **The traceability generator, the cleanup verifier and the aggregate remote smoke** do not exist.
- **`2E-MATCH-018`'s baseline** is computed by `match-baseline.test.ts` and needs transcribing into
  the phase report.
- **`2E-COMMAND-012`** needs a decision: a column on the operation, or a reclassification recorded in
  the PRD.
- **Deployment authorization** is the gate on everything in §9. Deployment order for this slice is
  migrations only — it touches no worker code.

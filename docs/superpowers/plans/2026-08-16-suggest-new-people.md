# Confirmable New-Person Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Always surface an explicit, editable create-or-ignore suggestion when an entry interpretation mentions a person that cannot be resolved to an existing owner-scoped person or alias.

**Architecture:** Keep extraction immutable and derive pending person suggestions from the current interpretation, existing entry links, and version-scoped candidate resolutions. A single owner-scoped Supabase RPC validates authoritative candidate indexes, reuses unambiguous existing people, creates only explicitly confirmed new people, records rejection and undo state atomically, and returns typed outcomes to a focused Server Action and client form.

**Tech Stack:** PostgreSQL/Supabase migrations and pgTAP, generated Supabase TypeScript types, Next.js 16 App Router Server Actions, React 19 `useActionState`, Zod, Vitest/Testing Library, Playwright, Node.js linked-project smoke scripts.

**Spec:** `docs/superpowers/specs/2026-08-16-suggest-new-people-design.md`

## Global Constraints

- Scope is limited to extracted people; do not generalize this slice to contexts, organizations, projects, or other entity types.
- An unmatched extracted person must remain a suggestion until the owner explicitly confirms creation or explicitly ignores it.
- Nothing is preselected and no permanent person or alias is created during interpretation persistence.
- Exact owner-scoped canonical-name or alias matches reuse the existing person; ambiguous matches fail closed with a typed error.
- The database derives each authoritative candidate from the current interpretation by `candidateIndex`; client-submitted original names are never authoritative.
- An edited `resolvedName` is allowed only for confirmed candidates and must be normalized, non-empty, and length-bounded before persistence.
- Candidate resolutions are version-scoped by `interpretation_id`; reinterpretation must not inherit stale decisions.
- Confirmation, person reuse/creation, entry linking, resolution storage, audit logging, idempotency, and undo registration are one transaction.
- Undo removes the source entry link and resolution; a newly created person is deleted only when it has no later references, while a preexisting or subsequently reused person remains.
- Do not infer or create an alias from parenthetical text such as `Giovanna (Gigi)` in this slice.
- Enforce owner isolation with `auth.uid()`, forced RLS, closed grants, bounded JSON input, and content-free analytics/audit metadata.
- Read `node_modules/next/dist/docs/01-app/02-guides/forms.md`, `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`, and `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md` before changing the page, form, or Server Action.
- Work only in `D:\Projetos\GitHub\my-brain\.worktrees\suggest-new-people` on branch `codex/suggest-new-people`; do not push, open a PR, merge, or deploy without a separate publication/deployment gate.
- The initial full `npm test` baseline timed out with preexisting React/DOM failures and zero-test suites; every focused test added here must pass, and the final report must separate new regressions from baseline failures rather than claiming a clean global baseline.

---

### Task 1: Pure person-candidate contract and pending projection

**Files:**
- Create: `src/features/interpretations/person-candidate-contract.ts`
- Create: `src/features/interpretations/person-candidate-contract.test.ts`

**Interfaces:**
- Consumes: `ExtractedPerson` values shaped as `{ name: string; evidence?: string; confidence?: number }` from the current interpretation.
- Produces: `PersonCandidateDisposition`, `PersonCandidateResolutionInput`, `PersonCandidateResolutionView`, `PendingPersonCandidate`, `parseExtractedPeople(value: unknown)`, and `derivePendingPersonCandidates(input)`.
- Invariant: array position is the stable `candidateIndex` within one immutable interpretation revision.

- [ ] **Step 1: Write failing parsing and derivation tests**

Cover malformed extraction payloads, whitespace normalization, duplicate extracted names, already-linked canonical names, alias-resolved names supplied by the loader, confirmed/rejected resolution removal, and version-local candidate indexes. Pin this example:

```ts
expect(derivePendingPersonCandidates({
  extractedPeople: [
    { name: "Jaime", evidence: "para Jaime", confidence: 1 },
    { name: "Giovanna (Gigi)", evidence: "pra Giovanna(gigi)", confidence: 1 },
  ],
  resolvedCandidateIndexes: new Set([0]),
  linkedNormalizedNames: new Set(["jaime"]),
})).toEqual([{
  candidateIndex: 1,
  originalName: "Giovanna (Gigi)",
  proposedName: "Giovanna (Gigi)",
  evidence: "pra Giovanna(gigi)",
  confidence: 1,
}]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/features/interpretations/person-candidate-contract.test.ts`

Expected: FAIL because the module and exported contract do not exist.

- [ ] **Step 3: Implement the smallest pure contract**

Use deterministic Unicode-aware trim/collapse normalization for display values and a case-folded comparison key. Reject blank names and cap display/evidence strings to the same limits later enforced by SQL. Keep the helper free of React, Supabase, and database-generated types.

- [ ] **Step 4: Run the focused test and typecheck**

Run: `npm test -- src/features/interpretations/person-candidate-contract.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS, or only explicitly documented baseline errors unrelated to these two files.

- [ ] **Step 5: Commit**

```bash
git add src/features/interpretations/person-candidate-contract.ts src/features/interpretations/person-candidate-contract.test.ts
git commit -m "feat: derive pending person candidates"
```

### Task 2: Owner-scoped resolution table, atomic RPC, and undo handler

**Files:**
- Create: `supabase/migrations/202608160095_entry_person_candidate_suggestions.sql`
- Create: `supabase/tests/entry_person_candidate_suggestions.sql`
- Modify: `supabase/tests/undo_operation_routing.sql`

**Interfaces:**
- Consumes: the current `entry_interpretations.extracted_people`, `people`, `person_aliases`, `entry_entities`, `undo_operations`, `audit_logs`, and `private.undo_operation_handlers` contracts.
- Produces: table `public.entry_person_candidate_resolutions` and RPC `public.resolve_entry_person_candidates(p_entry_id uuid, p_expected_interpretation_id uuid, p_resolutions jsonb, p_operation_key uuid)`.
- RPC result: one JSON object containing `operationKey`, `undoId`, and ordered `results` entries shaped as `{ candidateIndex, disposition, personId, outcome: "created" | "linked_existing" | "ignored" }`.
- Produces undo action type `resolve_entry_person_candidates` registered in `private.undo_operation_handlers`.

- [ ] **Step 1: Write the failing pgTAP contract**

Test schema, constraints, forced RLS, grants, function volatility/security/search path, and both owners. Behavioral assertions must prove:

- exact canonical and alias matches link the existing person without inserting another;
- an unmatched candidate is created only when disposition is `confirmed`;
- `rejected` stores a decision without creating/linking a person;
- mixed decisions are atomic and ordered by candidate index;
- stale interpretation IDs, unknown indexes, duplicates, oversized batches, blank/oversized edited names, cross-owner access, and ambiguous matches fail closed;
- retry with the same operation key returns the same result without duplicate rows;
- concurrent equivalent confirmation cannot create duplicate canonical people;
- undo restores the suggestion, removes the entry link, deletes an unused newly created person, preserves a preexisting/reused person, and cannot cross owners.

- [ ] **Step 2: Run pgTAP and verify RED**

Run the repository's established local Supabase pgTAP command for `supabase/tests/entry_person_candidate_suggestions.sql` from an empty migration chain.

Expected: FAIL because migration `202608160095` and its RPC are absent. If Docker/Supabase CLI is unavailable, record the command as an environmental skip and continue only with static SQL guards until the remote gate.

- [ ] **Step 3: Implement the table and policies**

Create a row keyed by `(interpretation_id, candidate_index)` with `user_id`, `entry_id`, `disposition check (disposition in ('confirmed','rejected'))`, `original_name`, nullable `resolved_name`, nullable `person_id`, `operation_key`, and `created_at`. Add ownership-consistency foreign keys/indexes where current composite keys permit them, enable and force RLS, expose SELECT only to the owning authenticated user, and keep writes RPC-only.

- [ ] **Step 4: Implement the authoritative RPC**

Use `security definer set search_path = ''`, require `auth.uid()`, lock the entry/current interpretation, validate a bounded JSON array, and derive each candidate from `extracted_people -> candidateIndex`. Normalize the confirmed edited name server-side; exact-match canonical names and aliases under the owner; reject ambiguity; otherwise insert a person using the repository's canonical uniqueness strategy; then insert the `entry_entities` link and resolution.

Record a content-free audit event and one `undo_operations` row whose `before_state`/`after_state` contain only identifiers, dispositions, creation provenance, and operation metadata needed for compensation. Do not place entry text, evidence, or names in analytics/audit payloads.

- [ ] **Step 5: Implement and register compensation**

Add a private handler with the registry's exact signature. It must delete source `entry_entities` links and candidate-resolution rows, delete only people marked as created by this operation that have no remaining references or aliases, mark the undo row consumed, and emit the standard undo audit record.

- [ ] **Step 6: Run focused SQL verification**

Run the focused pgTAP file, `supabase/tests/undo_operation_routing.sql`, and the repository SQL grammar/security guards.

Expected: all focused assertions PASS; environmental skips remain explicitly labeled.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/202608160095_entry_person_candidate_suggestions.sql supabase/tests/entry_person_candidate_suggestions.sql supabase/tests/undo_operation_routing.sql
git commit -m "feat: resolve person candidates atomically"
```

### Task 3: Generated database types and loader data

**Files:**
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `src/features/interpretations/data.ts`
- Modify: `src/features/daily-cycle/review-projection.ts`
- Modify: `src/features/daily-cycle/review-projection.test.ts`
- Modify: `src/features/daily-cycle/lifecycle-consistency.test.ts`

**Interfaces:**
- Consumes: Task 1 `parseExtractedPeople`/`derivePendingPersonCandidates` and Task 2 table/RPC schema.
- Produces: `EntryReviewProjection.pendingPersonCandidates: readonly PendingPersonCandidate[]` and `EntryReviewProjection.personCandidateUndoId: string | null`.
- Loader query: current interpretation resolutions only, owner access enforced by RLS; existing entry person links include canonical and alias resolution keys needed to suppress already-resolved candidates.

- [ ] **Step 1: Extend projection tests first**

Add failing tests that assert Jaime is absent when already linked, Giovanna remains pending when unmatched, confirmed/rejected rows remove only their matching index, an older interpretation's resolutions do not suppress the current revision, and loader errors fail safely without inventing suggestions.

- [ ] **Step 2: Run the focused projection tests and verify RED**

Run: `npm test -- src/features/daily-cycle/review-projection.test.ts src/features/daily-cycle/lifecycle-consistency.test.ts`

Expected: FAIL because the new projection properties and loader query are absent.

- [ ] **Step 3: Regenerate or faithfully update Supabase types**

Prefer the repository's established generation command against a database with migration `202608160095` applied. If generation is unavailable locally, add the table and RPC signatures by following the generated file's exact shape, then verify them with a compile-time parity assertion in the focused tests. Do not hand-edit unrelated generated definitions.

- [ ] **Step 4: Load resolution and linked-person inputs**

Extend the existing `Promise.all` in `src/features/interpretations/data.ts` with the current interpretation's candidate resolutions and the canonical/alias information for person links already attached to the entry. Preserve existing error aggregation and owner-scoped query patterns.

- [ ] **Step 5: Derive the projection**

Call the pure Task 1 helper from `toEntryReviewProjection`. Return an empty list when there is no current valid interpretation, extraction is malformed, or the loader cannot establish authoritative inputs. Expose the active undo ID without coupling person actions to task-candidate undo state.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npm test -- src/features/interpretations/person-candidate-contract.test.ts src/features/daily-cycle/review-projection.test.ts src/features/daily-cycle/lifecycle-consistency.test.ts`

Run: `npm run typecheck`

Expected: focused tests PASS and no new type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/database.types.ts src/features/interpretations/data.ts src/features/daily-cycle/review-projection.ts src/features/daily-cycle/review-projection.test.ts src/features/daily-cycle/lifecycle-consistency.test.ts
git commit -m "feat: project unresolved person mentions"
```

### Task 4: Server Action for confirm, edit, ignore, and undo

**Files:**
- Create: `src/features/interpretations/person-candidate-actions.ts`
- Create: `src/features/interpretations/person-candidate-actions.test.ts`
- Modify: `src/features/daily-cycle/action-result.ts`

**Interfaces:**
- Consumes: form fields `entryId`, `expectedInterpretationId`, `operationKey`, and serialized `resolutions`; Task 2 RPC; existing authenticated Supabase server client.
- Produces: `resolvePersonCandidates(previousState, formData)` and uses existing `undoAgentAction` for returned `undoId`, unless the shared action result requires a person-specific thin undo wrapper.
- Success state includes `status: "success"`, localized message, `undoId`, and per-candidate outcomes; typed database errors map to localized actionable messages.

- [ ] **Step 1: Write failing action tests**

Mock authentication, RPC, and `revalidatePath`. Cover unauthenticated access, malformed UUIDs/JSON, duplicate candidate indexes, rejected candidates carrying `resolvedName`, RPC typed errors (`stale_interpretation`, `ambiguous_person_match`, `candidate_not_found`, `invalid_person_name`), success results, and idempotent retry.

- [ ] **Step 2: Run the action test and verify RED**

Run: `npm test -- src/features/interpretations/person-candidate-actions.test.ts`

Expected: FAIL because the action does not exist.

- [ ] **Step 3: Read the required local Next.js guides**

Read the three files listed in Global Constraints in full. Confirm the current Server Action form signature, pending-state model, and `revalidatePath` behavior before writing code; record any version-specific constraint directly in a code comment only where it prevents misuse.

- [ ] **Step 4: Implement validation and RPC mapping**

Use Zod to accept at most the SQL batch limit, coerce no values silently, require UUID operation keys, and send `p_resolutions` as the generated `Json` type. Never trust names not paired with an authoritative candidate index. Map typed SQL errors without leaking database details.

- [ ] **Step 5: Revalidate affected routes**

On success revalidate both locales for `/app/inbox`, `/app/inbox/{entryId}`, and `/app/people`. Keep task/work route invalidation unchanged unless a reused person changes an existing surface proven by a focused test.

- [ ] **Step 6: Run action tests and typecheck**

Run: `npm test -- src/features/interpretations/person-candidate-actions.test.ts src/features/tasks/actions.test.ts`

Run: `npm run typecheck`

Expected: PASS with existing task action behavior unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/features/interpretations/person-candidate-actions.ts src/features/interpretations/person-candidate-actions.test.ts src/features/daily-cycle/action-result.ts
git commit -m "feat: add person candidate actions"
```

### Task 5: Accessible person-suggestion form in entry review

**Files:**
- Create: `src/features/interpretations/person-candidate-form.tsx`
- Create: `src/features/interpretations/person-candidate-form.test.tsx`
- Modify: `src/app/[locale]/app/inbox/[entryId]/page.tsx`
- Modify: `src/features/daily-cycle/entry-review.tsx`
- Modify: `src/features/daily-cycle/entry-review.test.tsx`
- Modify: `src/features/daily-cycle/copy.ts`
- Modify: `src/features/daily-cycle/contracts.ts`

**Interfaces:**
- Consumes: `pendingPersonCandidates`, current `entryId`/`interpretationId`, Task 4 action, and a fresh client-generated UUID operation key.
- Produces: a separate `Pessoas mencionadas` / `People mentioned` review group with per-candidate create, editable name, and ignore controls plus one explicit submit action.
- Accessibility: fieldset/legend grouping, labels tied to inputs, keyboard-operable controls, pending/disabled state, `aria-live` result feedback, and focusable error summary.

- [ ] **Step 1: Write failing component tests**

Cover Portuguese and English copy, zero-candidate absence, no default selection, edit enabled only for create, ignore without name submission, multiple independent candidates, pending state, action error retention, success/undo rendering, and mobile-width DOM semantics. Assert task confirmation remains a distinct form.

- [ ] **Step 2: Run focused UI tests and verify RED**

Run: `npm test -- src/features/interpretations/person-candidate-form.test.tsx src/features/daily-cycle/entry-review.test.tsx`

Expected: FAIL because the form/slot/copy do not exist.

- [ ] **Step 3: Implement the client form**

Use `useActionState` according to the checked-in Next.js 16 guide. Render each candidate with an initially unanswered create/ignore choice. Preserve the proposed name locally, permit correction before submission, serialize only answered candidates, and prevent submitting an empty decision set. Regenerate the operation key only after a successful completed operation.

- [ ] **Step 4: Compose it on the entry page**

Add the person form after the existing task-candidate form within `EntryReview`'s next-actions area. Do not merge candidate arrays or reuse task confirmation state. Hide the group when `pendingPersonCandidates` is empty; keep historical outcomes visible in the existing “what came to exist”/decisions sections through current linked people and undo presentation.

- [ ] **Step 5: Run UI, projection, action, and accessibility-focused tests**

Run: `npm test -- src/features/interpretations/person-candidate-form.test.tsx src/features/interpretations/person-candidate-actions.test.ts src/features/daily-cycle/entry-review.test.tsx src/features/daily-cycle/review-projection.test.ts`

Expected: PASS.

Run: `npm run lint`

Expected: no new lint or accessibility errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/[locale]/app/inbox/[entryId]/page.tsx" src/features/interpretations/person-candidate-form.tsx src/features/interpretations/person-candidate-form.test.tsx src/features/daily-cycle/entry-review.tsx src/features/daily-cycle/entry-review.test.tsx src/features/daily-cycle/copy.ts src/features/daily-cycle/contracts.ts
git commit -m "feat: show confirmable person suggestions"
```

### Task 6: Disposable linked-project proof and responsive end-to-end coverage

**Files:**
- Create: `scripts/remote-person-candidate-suggestions-smoke.mjs`
- Create: `scripts/verify-person-candidate-suggestions-cleanup.mjs`
- Create: `e2e/online-person-candidate-suggestions.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: linked Supabase credentials through `scripts/linked-supabase.mjs`, disposable authenticated users, migration `202608160095`, and the deployed/local online app convention.
- Produces: `test:remote:person-candidates`, `test:remote:person-candidates:cleanup`, and a Playwright scenario proving the visible review flow.
- Cleanup contract: every inserted row/user is tagged or ID-tracked and verified absent after cleanup, even when the smoke test fails midway.

- [ ] **Step 1: Write the remote smoke assertions before implementation**

Model two isolated owners and capture the returned IDs. Assert unmatched suggestion data, explicit creation, exact-name reuse, ignore, idempotent replay, stale-revision rejection, cross-owner non-disclosure, undo of newly created vs reused people, and zero residual rows after cleanup.

- [ ] **Step 2: Add cleanup verification and package scripts**

Follow existing linked smoke conventions. Use `try/finally`; make cleanup independently runnable and fail if any tracked `entries`, `entry_interpretations`, resolutions, links, people, undo rows, or test auth users remain.

- [ ] **Step 3: Add Playwright coverage**

At a mobile viewport, create an entry containing an existing Jaime and missing Giovanna, wait for interpretation completion, verify only Giovanna is suggested, correct the name, confirm creation, inspect the People surface, undo, and verify the suggestion returns. Add an ignore path and assert task suggestions are still independently actionable.

- [ ] **Step 4: Run static/local focused checks**

Run: `node --check scripts/remote-person-candidate-suggestions-smoke.mjs`

Run: `node --check scripts/verify-person-candidate-suggestions-cleanup.mjs`

Run: `npx playwright test e2e/online-person-candidate-suggestions.spec.ts --list`

Expected: scripts parse and Playwright discovers the intended tests.

- [ ] **Step 5: Run the hosted gates only after deployment authority is confirmed**

Preflight the linked project and exact migration status. Apply migration `202608160095` through the repository's normal non-destructive migration flow only when the deployment gate is authorized. Then run:

```bash
npm run test:remote:person-candidates
npm run test:remote:person-candidates:cleanup
npm run test:e2e:online -- e2e/online-person-candidate-suggestions.spec.ts
```

Expected: all assertions PASS and cleanup reports zero residue. A local code implementation is not evidence that the hosted schema or Vercel app has been updated.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/remote-person-candidate-suggestions-smoke.mjs scripts/verify-person-candidate-suggestions-cleanup.mjs e2e/online-person-candidate-suggestions.spec.ts
git commit -m "test: prove person candidate suggestions remotely"
```

### Task 7: Final regression gate, adversarial review, and handoff

**Files:**
- Modify only if verification finds a feature-scoped defect: files already owned by Tasks 1-6.
- Review: `docs/superpowers/specs/2026-08-16-suggest-new-people-design.md`
- Review: `docs/superpowers/plans/2026-08-16-suggest-new-people.md`

**Interfaces:**
- Consumes: all prior commits and the approved spec.
- Produces: a verified local branch ready for a separate publish/deploy decision, with exact pass/fail/skip evidence and no uncommitted feature changes.

- [ ] **Step 1: Run the complete focused feature matrix**

```bash
npm test -- src/features/interpretations/person-candidate-contract.test.ts src/features/interpretations/person-candidate-actions.test.ts src/features/interpretations/person-candidate-form.test.tsx src/features/daily-cycle/review-projection.test.ts src/features/daily-cycle/lifecycle-consistency.test.ts src/features/daily-cycle/entry-review.test.tsx src/features/tasks/actions.test.ts
npm run typecheck
npm run lint
git diff --check
```

Expected: all feature-focused tests PASS, no new type/lint errors, and clean whitespace.

- [ ] **Step 2: Attempt the broad regression suite with baseline comparison**

Run: `npm test`

Expected: either PASS or the same classified environmental/preexisting failures observed before implementation. Any new failure touching this feature is a blocker; do not relabel it as baseline.

- [ ] **Step 3: Review security and behavioral invariants adversarially**

Trace these paths from UI to SQL and back: forged name/index, stale interpretation, cross-owner entry, ambiguous alias, same operation replay, concurrent create, partial mixed batch, undo after later person reuse, reinterpretation after rejection, and analytics/audit payload inspection. Add a failing regression test before correcting any discovered defect.

- [ ] **Step 4: Re-run affected gates after the last edit**

Repeat every focused test changed by the fix plus `npm run typecheck`, `npm run lint`, and `git diff --check`. If hosted validation was authorized, repeat the remote smoke and cleanup verification after the final SQL/script edit.

- [ ] **Step 5: Verify repository state and spec coverage**

Run `git status --short`, `git log --oneline --decorate -8`, and map every approved spec requirement to at least one implementation location and one assertion. Scan changed files for unfinished-marker comments, temporary values, disabled or exclusively filtered focused tests, and leaked credentials/content.

- [ ] **Step 6: Commit any final test-backed correction**

If Step 3 found a defect, commit only the related fix and regression test:

Stage only the exact implementation file and its regression-test file changed in Step 3 with `git add -p`, inspect the staged diff, then run `git commit -m "fix: harden person candidate resolution"`.

If no defect was found, create no empty commit.

- [ ] **Step 7: Stop at the publication gate**

Report the branch, commit list, focused and broad test evidence, hosted migration/deployment status, remaining environmental skips, and cleanup result. Do not push, open a PR, merge, or deploy until the user explicitly authorizes that next step.

# Phase 2C Slice 01 — CandidateEditor GREEN Report

## Status

- Date: 2026-07-19
- Branch: `codex/phase-2c-editable-candidate-tasks`
- Starting commit: `a8005ee0a04bbb0b3cdc107c369784e737ef54d5`
- Outcome: `CandidateEditor` is GREEN in isolation.
- Scope: local component rendering, editing, validation, accessibility, and
  canonical callback emission only.

## Files changed

- `src/features/tasks/candidate-editor.tsx`
- `docs/reports/PHASE_2C_SLICE_01_CANDIDATE_EDITOR_GREEN.md`

The approved RED test was not modified. No helper, stylesheet, route, form,
Server Action, database, migration, generated type, or dependency file changed.

## Public API

The existing named export and prop contract were preserved:

```text
CandidateEditor({
  candidate: ActionableCandidateView,
  locale: "pt-BR" | "en",
  onEditChange: (edit: CandidateEditCommand | null) => void,
  selected: boolean,
  timezone: string,
})
```

No edit or due-date contract type was duplicated. The component imports the
existing types, schema, normalizer, serializer, and conversion utilities.

## Rendering and state model

One component instance owns one candidate. It starts collapsed and always shows
the immutable title, optional description, localized due date, and explicit
profile-timezone context. Expanding reveals controlled title, description, and
native `datetime-local` fields.

Local state is keyed conceptually by the candidate's stable `key` plus immutable
title/description/due-date signature. Ordinary parent rerenders do not replace
local state. A materially replaced suggestion resets the transient editor and
clears the previous parent override. A timezone-only change preserves title and
description edits and translates a valid retained due-date edit through the old
and new profile timezones.

The implementation remains a narrow Next.js Client Component, consistent with
the installed `use client` guidance: state and event handling stay at the
interactive leaf rather than widening a server/client boundary.

## Selection behavior

- `selected=true` enables editing and canonical callback emission.
- `selected=false` sets `aria-disabled` on the fieldset and uses native
  `disabled` semantics on every control.
- Deselection does not clear, mutate, or resubmit retained local values.
- Reselection in the same mounted session restores the same local values.
- The selected prop is never mutated and no edit is emitted while suspended.

## Field behavior

### Title

- Starts with the immutable suggestion title.
- Trimming, required validation, the 240-character bound, unchanged-field
  elimination, and canonical output come from the shared edit schema/normalizer.
- Blank or overlong values show localized field errors and never emit malformed
  commands.
- A changed field shows its immutable original beside the control.

### Description

- `null` suggestions render as an empty control without leaking `null` or
  `undefined` copy.
- Whitespace and empty semantics flow through the shared normalizer.
- Overlong values use the shared schema decision and a localized field error.
- Explicit clear, unchanged original null, and omitted change remain distinct.

### Due date

- Immutable instants are formatted with
  `formatInstantForDateTimeLocal(instant, timezone)`.
- Edited wall times are converted with
  `localDateTimeToOffsetInstant(localValue, timezone)`.
- No timezone conversion is reimplemented in the component.
- Empty values map to explicit `null` only when the immutable suggestion had a
  due date.
- DST gap, DST overlap, malformed local values, and invalid timezones produce
  application-owned localized field errors; invalid values emit no command.
- Display formatting always supplies the profile timezone, so the browser or
  workstation timezone cannot change the result.

## Clear and reset semantics

- Clear description emits `description: null` when the original is populated.
- Clear due date emits `dueAt: null` when the original is populated.
- Clearing an already-null original normalizes to no edit.
- Reset restores exact immutable title, description, and profile-local due-date
  values, clears field validation, removes the complete parent override, removes
  the edited badge, and announces the result through a polite live region.
- Reset and clear controls have distinct localized accessible names.

## Callback emission strategy

Callbacks occur in user-event handlers, never during render. Each proposed
state is passed through `normalizeCandidateEdits`; malformed state is replaced
with a safe `null` override rather than an invalid command.

Before invoking the callback, the component serializes the single canonical edit
with `serializeCandidateEdits`. A ref stores the last serialized semantic value,
so equivalent inputs—such as additional trim-only whitespace—do not produce
duplicate callbacks. There is no effect-driven edit emission, callback loop, or
React Strict Mode double emission.

## Validation and accessibility

- A native `fieldset` and first-child `legend` name each candidate group.
- Every input has a programmatic localized label.
- Field errors have stable IDs, `role="alert"`, localized accessible names,
  `aria-invalid`, and `aria-describedby` associations.
- The reset result uses `role="status"` with `aria-live="polite"`.
- All actions use `type="button"`; none can submit an enclosing form.
- Native keyboard order is edit, title, description, clear description, due
  date, clear due date, reset.
- Reset does not replace its DOM control, so focus remains on the activated
  button.
- Every actionable control has an explicit 44-by-44-pixel minimum target.
- No icon-only action, click-only container, confidence score, or hidden
  implementation selector is required.

The visual treatment reuses existing field, secondary-button, status-badge,
border, blue-wash, typography, and spacing conventions. No new design system or
global CSS was introduced.

## Verification results

### TDD RED baseline

Command:

```text
npx vitest run src/features/tasks/candidate-editor.test.tsx
```

- Before implementation: 1 file failed; 36 failed and 1 passed of 37 tests.

### Focused GREEN

Command:

```text
npx vitest run src/features/tasks/candidate-editor.test.tsx
```

- 1 file passed; 37 passed of 37 tests; 0 failed; 0 skipped; exit code 0.

### Combined contract regression

Command:

```text
npx vitest run src/features/tasks/candidate-edit-contract.test.ts src/features/tasks/candidate-due-date.test.ts src/features/tasks/candidate-editor.test.tsx
```

- 3 files passed; 106 passed of 106 tests; exit code 0.
- Candidate edit contract: 51 passed.
- Due-date utilities: 18 passed.
- CandidateEditor: 37 passed.

### Complete suite

Command: `npm test`

- 83 test files passed of 83.
- 549 tests passed of 549.
- Exit code 0; no intentional or unrelated RED remains in the current suite.

### Static gates

- `npm run lint`: passed; exit code 0.
- `npm run typecheck`: passed; exit code 0.
- `git diff --check`: passed; exit code 0.

## Dependency decision

No dependency was added. React 19 state primitives, native HTML controls, the
existing Zod-backed edit contract, existing due-date utilities, and existing CSS
classes satisfy the isolated component contract.

## Independent review findings

### React state and component API

The review found that semantically equivalent event-time values could initially
repeat callbacks. Emission was deduplicated using canonical serialization. The
final design has no render-time state update, effect-driven edit emission,
unstable list key, prop mutation, stale candidate state, cross-candidate state,
or deselection callback. No critical or important finding remains.

### Accessibility

All 37 focused tests, including semantic grouping, programmatic labels, field
error association, keyboard ordering, form-safe buttons, live reset
announcement, retained focus, disabled semantics, and 44-pixel targets, pass.
No critical or important finding remains.

### Task-domain contract

The first review also found duplicated numeric validation limits. Those checks
now delegate to `candidateEditArraySchema`; canonical field elimination, clear,
reset, order, and edit shape delegate to `normalizeCandidateEdits` and
`serializeCandidateEdits`. Invalid edits never reach the callback. No critical
or important finding remains.

### Date/time integration

Formatting and conversion delegate to the already-GREEN due-date utilities.
The component supplies the profile timezone explicitly for Portuguese, English,
UTC-compatible, São Paulo, New York, clear/reset, and invalid DST behavior. No
browser-timezone fallback or independent offset logic exists. No critical or
important finding remains.

## Remaining Phase 2C.1 scope

CandidateEditor is GREEN only as an isolated component. It is not integrated
with the production confirmation form. Server Action integration has not
started, and the UI does not call `confirm_entry_task_candidates_v2`.

The exact next task is to integrate CandidateEditor into the real confirmation
form and implement the Phase 2C.1 Server Action using
`confirm_entry_task_candidates_v2`.

No database or Supabase remote change, deployment, push, or pull request
occurred in this slice.

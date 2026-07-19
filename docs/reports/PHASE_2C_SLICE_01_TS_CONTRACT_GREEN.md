# Phase 2C Slice 01 — TypeScript Contract GREEN Report

## Status

- Date: 2026-07-19
- Branch: `codex/phase-2c-editable-candidate-tasks`
- Starting commit: `f3f310544474501f65eae3f3b6ce8be863566b33`
- Outcome: the isolated TypeScript candidate-edit contract is GREEN.
- Scope: pure, framework-independent TypeScript only; no UI, React, Server Action,
  due-date conversion, timezone logic, Supabase call, database change, or migration.

## Files changed

- `src/features/tasks/candidate-edit-contract.ts`
- `docs/reports/PHASE_2C_SLICE_01_TS_CONTRACT_GREEN.md`

No adjacent helper module was required. The approved RED test was not modified.

## Exported API

- `CandidateEditableField`
- `CandidateChanges`
- `CandidateEditCommand`
- `CandidateEditSuggestion`
- `CanonicalCandidateEdits`
- `candidateEditArraySchema`
- `normalizeCandidateEdits`
- `serializeCandidateEdits`

## Normalization rules

- Title and description strings are trimmed before comparison and output.
- A title must remain non-empty after trimming.
- An empty or whitespace-only description becomes explicit `null`.
- Explicit description and due-date clears remain `null` unless the immutable
  suggestion already has the same value.
- `dueAt` is validated as an offset-bearing ISO-8601 datetime and otherwise
  passed through unchanged. This slice performs no timezone conversion.
- Omitted fields remain omitted.
- Values equal to their immutable suggestion after normalization are removed.
- An edit with no remaining changed fields is removed.
- Candidate edits are returned in ascending `candidateIndex` order.
- Change properties are constructed in canonical `title`, `description`,
  `dueAt` order.
- Edited-candidate and edited-field counts are calculated only after
  canonicalization.
- Inputs are never sorted or rewritten in place; all returned edits and change
  objects are newly constructed.

## Validation rules

- The edit payload must be an array containing at most 50 closed edit objects.
- Every candidate index must be a unique, non-negative integer.
- Every edit requires a closed `changes` object; unknown edit or change keys are
  rejected.
- Title accepts strings only, with a post-trim length of 1–240 characters.
- Description accepts string or `null`, with a post-trim maximum of 2,000
  characters.
- Due date accepts an offset-bearing ISO-8601 string or `null`.
- Wrong scalar types, malformed or offsetless due dates, and duplicate edit
  indices are rejected.
- The selected-index list must contain 1–50 unique, non-negative integers.
- Every selected index must have one unique immutable suggestion.
- An edit for an unselected candidate is rejected.
- Immutable suggestions are runtime-validated as closed objects before they are
  used for unchanged-field comparison.

## Serialization rules

- Serialization reparses the edit array through the strict schema.
- Candidates are sorted by ascending index without mutating the caller's array.
- Each serialized object contains only `candidateIndex` and `changes`.
- Each `changes` object is rebuilt in `title`, `description`, `dueAt` order.
- `JSON.stringify` receives only this canonical edit array, producing stable,
  compact JSON independent of caller object insertion order.

## UTF-8 byte limit

The serializer calculates the UTF-8 size of the final JSON with a pure
ECMAScript code-unit walk. ASCII, two-byte code points, three-byte code points,
and valid surrogate pairs are counted explicitly, so neither Node's `Buffer`
nor the browser's `TextEncoder` is required. Payloads up to and including
131,072 bytes are accepted; larger payloads are rejected before return.

An independent runtime review compared the serializer against Node's UTF-8
byte count using frozen inputs: an exact 131,072-byte payload was accepted and
the corresponding 131,073-byte payload was rejected.

## Verification results

### Relevant RED/GREEN test

Command:

```text
npx vitest run src/features/tasks/candidate-edit-contract.test.ts
```

- Before implementation: 1 file failed; 50 failed and 1 passed of 51 tests.
- After implementation: 1 file passed; 51 passed of 51 tests; exit code 0.

### Lint

Command: `npm run lint`

- Result: passed; exit code 0.

### Typecheck

Command: `npm run typecheck`

- Result: passed; exit code 0.

### Repository regression check

Command: `npm test`

- 83 test files: 81 passed and 2 failed.
- 549 tests: 495 passed and 54 failed.
- `candidate-edit-contract.test.ts`: 51 passed.
- No unrelated test file regressed.

The only failing files are the approved, intentionally RED future slices:

- `src/features/tasks/candidate-due-date.test.ts`: 18 failed of 18.
- `src/features/tasks/candidate-editor.test.tsx`: 36 failed and 1 passed of 37.

The full-suite command therefore exits with code 1 by design until those
separate slices are implemented.

## Review findings

### TypeScript API designer

No blocking or important finding. The public API matches the approved RED
imports and types. Validation, normalization, and serialization remain separate
pure boundaries, and no framework dependency was introduced.

### Validation and security reviewer

No blocking or important finding. Object shapes are closed; edit, selection,
and suggestion indices are bounded and unambiguous; scalar and datetime inputs
are validated; oversized serialized payloads are rejected; and error messages
do not include candidate content.

### Deterministic serialization reviewer

No blocking or important finding. Frozen-input runtime checks found no hidden
mutation. Candidate and field ordering is explicit, unchanged fields are
eliminated before serialization, output is stable for equivalent caller key
orders, and the byte limit is applied to the final canonical UTF-8 JSON.

## Remaining scope

This slice stops here. Due-date utilities, timezone and DST behavior,
`CandidateEditor`, React/form integration, Server Actions, RPC calls, analytics,
and Supabase work remain separate slices.

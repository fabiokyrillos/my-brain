# Phase 2C Slice 01 — Due-Date Utilities GREEN Report

## Status

- Date: 2026-07-19
- Branch: `codex/phase-2c-editable-candidate-tasks`
- Starting commit: `0fefe9bfe01dd643a5bf37a59682da374382a4ab`
- Outcome: the isolated, framework-independent due-date contract is GREEN.
- Scope: pure TypeScript conversion only; `CandidateEditor`, React, form
  integration, Server Actions, Supabase, database code, migrations, analytics,
  and product UI were not changed or started.

## Files changed

- `src/features/tasks/candidate-due-date.ts`
- `docs/reports/PHASE_2C_SLICE_01_DUE_DATE_GREEN.md`

No adjacent helper module was needed. The approved RED test was not modified.

## Exported API

- `formatInstantForDateTimeLocal(instant, timezone): string`
- `localDateTimeToOffsetInstant(localValue, timezone): string | null`

No export was renamed or added.

## Accepted input and output formats

`formatInstantForDateTimeLocal` accepts:

- `null`, `undefined`, or an empty string, returning an empty control value;
- a minute-aligned ISO instant in `YYYY-MM-DDTHH:mm:00Z` form; or
- a minute-aligned ISO instant in `YYYY-MM-DDTHH:mm:00±HH:MM` form.

It returns the target-zone HTML `datetime-local` value as
`YYYY-MM-DDTHH:mm`.

`localDateTimeToOffsetInstant` accepts:

- `null` or an empty string, returning explicit `null`; or
- one exact `YYYY-MM-DDTHH:mm` wall-time value.

It returns `YYYY-MM-DDTHH:mm:00±HH:MM`. UTC is emitted as `+00:00`, matching
the RED contract. Unsupported seconds/fraction precision and offsetless instant
inputs are rejected rather than silently truncated or interpreted locally.

## Validation rules

- Local wall time is matched against an anchored numeric shape before any date
  construction.
- Instants require an anchored shape with seconds fixed at `00` and an explicit
  `Z` or numeric offset.
- Year, month, day, hour, and minute are reconstructed with UTC setters and then
  compared component-by-component. JavaScript rollover therefore cannot turn an
  impossible input into a different accepted date.
- Year zero, invalid leap days, impossible month/day combinations, invalid
  hours/minutes, and invalid numeric offsets are rejected.
- No input string is passed to `Date.parse` or `new Date(string)`.

## Invalid timezone handling

Timezone names follow the existing profile convention: `UTC` or an IANA name
with a region segment. Each value is passed to `Intl.DateTimeFormat` with an
explicit ISO-8601 calendar and Latin numbering. Constructor failure is mapped
to the stable application error `Invalid IANA timezone`; engine-specific
`RangeError` text is not exposed and no fallback timezone is used.

## Conversion and offset calculation

Instant formatting first converts the strictly parsed offset representation to
an epoch value using UTC components and the supplied numeric offset. It then
formats that epoch with `Intl.DateTimeFormat.formatToParts` in the explicit
profile timezone. Numeric parts are assembled directly, so locale punctuation
and workstation timezone cannot affect the result.

Wall-time conversion treats the validated components as a UTC-shaped search
anchor. It examines the bounded 48-hour interval around that anchor: exactly
2,881 minute-aligned candidate instants from -24 hours through +24 hours. Each
candidate is formatted in the requested timezone and retained only if every
year/month/day/hour/minute component equals the requested wall time.

The final numeric offset is the exact minute difference between the UTC-shaped
wall value and its unique matching instant. No timezone-specific offset is
hard-coded and no static timezone map is maintained.

## DST behavior

- Zero matching instants is rejected as a nonexistent local time/DST gap.
- More than one matching instant is rejected as an ambiguous local time/DST
  overlap; the implementation never guesses the earlier or later occurrence.
- Exactly one matching instant succeeds.

Supplementary review covered New York immediately before and after the 2026
spring gap and autumn overlap. Both adjacent valid offsets were correct, while
the gap and overlap values were rejected.

## Round-trip guarantees and workstation independence

For every accepted, unambiguous minute wall time, conversion to an offset
instant and formatting back in the same timezone reproduces the exact input.
The automated contract covers UTC, `America/Sao_Paulo`, and
`America/New_York`; supplementary review also covered `Asia/Kathmandu` and its
positive 05:45 offset.

The verification runtime reported workstation timezone `America/Cayenne`.
Despite that environment, the exact UTC, São Paulo, New York, and Kathmandu
results passed without setting or changing `process.env.TZ`. All date component
access uses UTC methods or an explicit `Intl` timezone.

## Dependency decision

No dependency was added. The project has no direct Temporal, date-fns, Luxon,
or Moment dependency, and the installed Node 22.18.0 runtime exposes ICU 77.1.
Standard `Date` UTC component methods plus `Intl.DateTimeFormat` satisfy the
approved deterministic contract without bundle or maintenance cost.

## Verification results

### TDD RED baseline

Command:

```text
npx vitest run src/features/tasks/candidate-due-date.test.ts
```

- Before implementation: 1 file failed; 18 failed of 18 tests; exit code 1.

### Focused GREEN

Command:

```text
npx vitest run src/features/tasks/candidate-due-date.test.ts
```

- 1 file passed; 18 passed of 18 tests; no skips; exit code 0.

### Combined regression

Command:

```text
npx vitest run src/features/tasks/candidate-edit-contract.test.ts src/features/tasks/candidate-due-date.test.ts
```

- 2 files passed; 69 passed of 69 tests; exit code 0.
- Candidate edit contract: 51 passed.
- Due-date contract: 18 passed.

### Complete suite

Command: `npm test`

- 83 test files: 82 passed and 1 failed.
- 549 tests: 513 passed and 36 failed.
- The only failing file is the approved intentional RED
  `src/features/tasks/candidate-editor.test.tsx`: 36 failed and 1 passed of 37.
- No unrelated test failure occurred. The complete-suite command exits with
  code 1 only because `CandidateEditor` is still intentionally unimplemented.

### Static gates

- `npm run lint`: passed; exit code 0.
- `npm run typecheck`: passed; exit code 0.
- `git diff --check`: passed; exit code 0.

## Independent review findings

### Date/time correctness reviewer

The first review found one important edge case: the accepted `Z` suffix had no
numeric offset capture, which could produce `NaN`. The implementation was
corrected before final verification. The post-fix matrix passed UTC `Z`,
positive and negative input offsets, a positive 05:45 zone offset, valid and
invalid leap days, impossible-date rollover rejection, both DST boundaries,
and four exact round trips. No critical or important finding remains.

### TypeScript API reviewer

No remaining finding. The two approved exports and their null/empty semantics
are unchanged. Helpers are private, inputs are primitive and never mutated, the
loop bound is explicit, and no React, Supabase, Node-only, or browser DOM import
was introduced.

### Cross-runtime determinism reviewer

No remaining finding. Parsing is structural, calendar validation uses UTC
components, formatting always supplies `timeZone`, calendar, numbering system,
and hour cycle, and conversion has no current-time, random, locale punctuation,
or machine-timezone dependency. Errors are application-owned strings rather
than leaked engine messages.

## Remaining RED scope

`CandidateEditor` remains RED and was not modified. Server Action integration
has not started. No database, migration, generated type, linked Supabase,
remote environment, deployment, push, or pull request was changed or invoked.

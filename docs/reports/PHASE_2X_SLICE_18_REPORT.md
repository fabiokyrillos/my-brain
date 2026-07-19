# Slice 2X.18 — Remote Gate, Permanent Documentation, and Closeout

Date: 2026-07-19

Status: complete with documented external limitations
Commit: `docs(phase-2x): close product convergence evidence` (this commit)

## Scope

This slice executed the approved Phase 2X closeout only:

- preserved rollback input and deployed only the accumulated committed `process-jobs` function;
- proved local/deployed worker parity and outcome ordering;
- created the fail-fast `test:remote:2x` aggregate and strengthened entry-worker smoke coverage;
- ran linked database, remote smoke, local quality, desktop/mobile, locale/navigation, and cleanup gates;
- reconciled the complete PRD/epic/slice/evidence matrix and permanent documentation;
- did not start Phase 2C–2F.

The only remote infrastructure mutation was:

```text
npx supabase functions deploy process-jobs --project-ref ulvwzqlpsjyrnqzfxmck
```

No migration, secret, schedule, grant, RLS policy, Auth/email configuration, other Edge Function, or branch push occurred. No non-disposable production data was modified.

## Files changed by the closeout

- `package.json`: adds `test:remote:2x`, `test:remote:2x:cleanup`, and the reproducible traceability generator command.
- `scripts/remote-supabase-smoke.mjs`: adds the sequential, fail-fast Phase 2X aggregate while retaining the baseline command; storage/user cleanup failures now fail the gate.
- `scripts/remote-entry-processing-smoke.mjs`: uses job-scoped claims, refuses the shared-queue reaper unless its fixture is the only running job, verifies the existing scheduled drain without manually invoking it, and asserts persisted worker completion events, same-attempt deduplication, distinct attempts, current interpretation, all successful entry states, and matching fixture job/event outcome.
- `scripts/remote-job-reliability-smoke.mjs`: makes its disposable fixture deterministically first, preflights the shared queue, and limits the global reaper to one row.
- all six remote smokes make cleanup failure non-zero; the product-events smoke additionally proves owner-row cascade after Auth deletion.
- `scripts/verify-phase-2x-cleanup.mjs`: read-only linked cleanup verification for disposable Auth prefixes, orphaned owner rows, and storage leftovers.
- `scripts/generate-phase-2x-traceability.mjs`: validates the PRD inventory and regenerates the 283-row per-ID annex.
- `e2e/online-auth.spec.ts`: classifies the newly observed reserved-domain provider restriction without retrying email delivery and keeps the disposable admin-link recovery core independently executable.
- permanent Phase 2X/project documents, the per-ID traceability annex, the sanitized evidence manifest, and this report.

No application source, migration, worker runtime source, generated database type, or dependency version changed in Slice 2X.18.

## Pre-deployment gate

### Repository and scope

- branch: `codex/phase-2-intelligent-capture`;
- starting HEAD: `1880a66afc5481342d6b83c36656e07aada03092`;
- branch was zero commits behind and ten commits ahead of `origin` after fetch;
- worktree was clean;
- Slice 2X.17 existed; Slice 2X.18 did not;
- Deno was unavailable and is not claimed.

### Remote v12 and rollback preservation

- prior `process-jobs`: version 12, updated 2026-07-17 20:48:38 UTC;
- downloaded remote source first captured under a disposable Temp directory, then its complete rollback zip copied to stable `C:\Users\fabin\.codex\artifacts\my-brain\phase-2x18\process-jobs-v12-20260717T204838Z.zip`;
- zip SHA-256: `345680E42AC248375EF1EBB67B83147257E6F2D8A76C0FD1889EBBEF00BE6C2F`.

### Accumulated worker delta

Comparison against downloaded v12 found:

- modified runtime `entry.ts` only (49 additions, 36 removals);
- new runtime `product-events.ts` only (74 lines);
- new non-runtime `dispatch.test.ts` only (36 lines);
- zero unexpected changes in `_shared`, attachment, dispatch, index, or Deno configuration.

The complete function, not a reconstructed or partial bundle, was deployed. Required secret names were present without printing values. Focused worker/instrumentation Vitest passed 21 files / 151 tests before deployment. `dispatch.test.ts` is Deno-only and was not falsely reported as executed.

An independent read-only pre-deploy review returned GO with no blocking concern.

## Deployment result

The authorized command exited 0. Supabase uploaded the complete local function and reported no bundling, import-resolution, configuration, authorization, or dependency error.

- new `process-jobs`: version 13, `ACTIVE`;
- updated: 2026-07-19 15:06:50 UTC;
- deployed function fingerprint reported by Supabase: `e49daf34258012ce8ed9a244a79e348888dfb2b9f76ddf5b787f1c7a48542f91`;
- fresh downloaded source fingerprint after normalized path/content composition: `7a75dc48a12f3bd2453c4057279c24d7a72ab40a01dbcfeef85063ae19fe2a41`.

A fresh v13 download contained 10 runtime/dependency files, with zero content mismatch, zero missing local runtime file, and zero unexpected remote runtime file. `dispatch.test.ts` was not present remotely.

## Post-deployment worker verification

No regression attributable to v13 was found, so rollback was not triggered.

- completion emission follows successful `complete_job` persistence;
- failure emission follows successful `fail_job` persistence;
- `processing_retry_requested` is restricted to a recoverable/non-terminal failure;
- keys include job id and attempt;
- the recorder is `record_product_event_for_user`, restricted to the worker/service role;
- recorder failure remains fail-open;
- same-attempt reinvocation creates no duplicate event;
- reprocessing creates exactly one additional completion event with a distinct attempt key;
- direct initial/reprocessing and unattended drain passed;
- attachment job reliability and the deployed file worker passed.

The remote smoke did not force a production worker failure by changing a secret or dependency. Failure/retry ordering is supported by source-equivalent v13 inspection plus focused tests and linked job behavior.

## Complete gate results

### Remote aggregate

`npm run test:remote:2x` passed in this order:

1. jobs;
2. interpretations;
3. product events;
4. entry processing;
5. daily cycle;
6. complete Supabase baseline;
7. residual-data cleanup verification.

The entry smoke no longer skips unattended dispatch when `WORKER_DISPATCH_SECRET` is absent locally: it creates a disposable fixture and polls the already-configured scheduled drain until persisted completion.

### Local quality

- `npm test`: 80 files / 443 tests passed;
- `npm run lint`: passed;
- `npm run typecheck`: passed;
- `npm run build`: Next.js 16.2.10 production build passed;
- `git diff --check`: passed, with only Git LF/CRLF advisories.

### Browser

- Foundation: desktop 3/3, mobile 3/3.
- Authenticated daily journey: desktop 18/18, mobile 18/18.
- Authenticated navigation/locales: desktop 1/1, mobile 1/1.
- Auth: sign-in/profile desktop+mobile 2/2; password-reset core desktop+mobile 2/2; signup desktop+mobile 2 explicit skips.

The first Auth run returned public `signup-failed` and `recovery-failed` states. A read-only, redacted Auth-log query established the exact upstream cause: HTTP 400 `email_address_invalid` for reserved `example.com` addresses. No signup request was repeated. The harness was corrected to avoid known-invalid provider requests, mark signup as an external skip, and still verify recovery link exchange/session/password/login without changing Auth code or provider settings. A future provider-routable catch-all domain can be supplied as `ONLINE_AUTH_TEST_EMAIL_DOMAIN` to re-enable real delivery paths. Provider-delivered email remains unverified and is not called green.

The initial Foundation run also hit a one-time Playwright web-server timeout. Port/process/diff checks showed no conflict or configuration change; a manually started Next server was ready in 628 ms, and the exact Foundation tests then passed. No timeout/configuration workaround was committed.

### Linked database

- migration history: exact local/remote match through `202607180031`;
- DB lint: exit 0 with the same two pre-existing `run_user_heartbeat` SQLSTATE `42804` text-to-time warnings;
- generated linked TypeScript: normalized exact match to the committed file, SHA-256 `925f15d9a1400c16231bfabe08fee8249a6d7c656846fc34283cf891535209de`;
- no schema or migration was changed.

### Cleanup

`npm run test:remote:2x:cleanup` found zero users for every disposable prefix and retained only the two non-disposable users. It found zero orphaned entries, jobs, attachments, pending questions, or tasks and zero `remote-smoke.txt` objects among six current storage objects. The deliberately private product ledger rejects service-role reads (`42501`), so its own smoke checks each owner JWT after Auth deletion and found zero owner-visible product events. Every remote cleanup failure is process-fatal.

## Deno and Docker substitutions

Deno is unavailable. No `deno check` or Deno test pass is claimed. Executed substitutes were:

- successful Supabase server-side bundling/deployment;
- fresh remote v13 download and normalized source parity;
- focused worker Vitest (21 files / 151 tests);
- complete linked entry/jobs/product-events/baseline behavior.

Docker is unavailable, so local pgTAP was not run. Linked DB lint, migration/type synchronization, and disposable authenticated remote smokes exercised the actual hosted roles and runtime. This remains an explicit CI/preproduction follow-up.

## Traceability and completion

The summary PRD/epic/slice/evidence crosswalk is in `docs/PHASE_2X_REPORT.md`; `docs/reports/PHASE_2X_TRACEABILITY_MATRIX.md` provides the durable per-ID annex for all 195 functional/non-functional IDs, 58 family acceptance IDs, and 30 global criteria (283 rows). The conceptual seven PRD delivery groups are explicitly reconciled to the implementation plan's 18 official slices. Seventeen prior official slice commits plus this closeout form the official sequence; five supporting/hotfix commits remain separately identified. Deployment, parity, redacted Auth diagnosis, and cleanup evidence is retained in `docs/reports/PHASE_2X_SLICE_18_EVIDENCE.md`.

Phase 2X is complete with documented external limitations. The provider-email skip, absent Deno/Docker execution, existing heartbeat lint warnings, and lack of static screenshots are not represented as green. No next phase was started.

XG-026's client/server p95 reference targets were not measured as percentile datasets. Duration events exist, but no p95/SLO pass is claimed.

## Rollback readiness

The preserved v12 bundle remains immediately deployable. The required rollback sequence is documented and was not needed:

1. redeploy the preserved complete v12 bundle;
2. confirm the new rollback version is `ACTIVE`;
3. rerun minimum entry-processing and jobs health smoke;
4. leave Phase 2X open and report the regression.

Because v13 passed all attributable smokes and complete parity checks, the active version remains 13.

## Independent review

- Pre-deploy reviewer: GO.
- Final closeout reviewer: READY after two remediation rounds, with no critical or important finding remaining. The final read-only review checked sole-running-job reaper isolation, aggregate cleanup, scheduled-drain status/outcome parity, 283 unique traceability IDs with 76 evidence tuples, explicit non-green XG-026, stable v12 artifact evidence, and scope integrity.

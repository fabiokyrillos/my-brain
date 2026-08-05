# Phase 2X Slice 18 evidence manifest

Date: 2026-07-19
Linked project: `ulvwzqlpsjyrnqzfxmck`
Authorized remote function: `process-jobs` only

This manifest is deliberately sanitized. It contains source hashes, version metadata, redacted provider diagnostics, command outcomes, and cleanup counts. It contains no access token, API key, dispatch secret, service-role key, email address, recovery token, IP address, or personal content.

## Remote change ledger

The only infrastructure mutation performed by Slice 2X.18 was:

```text
npx supabase functions deploy process-jobs --project-ref ulvwzqlpsjyrnqzfxmck
```

No other Edge Function was deployed. No migration was applied. No secret, schedule, grant, RLS policy, Auth setting, email configuration, or other infrastructure was modified. The branch was not pushed. Remote test mutations used disposable users/data and were cleaned up.

| State | Version | Status | Remote timestamp (UTC) | Supabase archive SHA-256 |
| --- | ---: | --- | --- | --- |
| before deploy | 12 | active before cutover | 2026-07-17 20:48:38 | not exposed in the preserved predeploy listing |
| after deploy/current verification | 13 | `ACTIVE` | 2026-07-19 15:06:50 | `e49daf34258012ce8ed9a244a79e348888dfb2b9f76ddf5b787f1c7a48542f91` |

The current v13 listing was rechecked after the final review started; no later `process-jobs` version existed.

## Rollback preservation

The complete downloaded remote v12 bundle is retained outside the repository at:

```text
C:\Users\fabin\.codex\artifacts\my-brain\phase-2x18\process-jobs-v12-20260717T204838Z.zip
```

| Property | Value |
| --- | --- |
| archive bytes | `24168` |
| archive SHA-256 | `345680e42ac248375ef1ebb67b83147257e6f2d8a76c0fd1889ebbef00be6c2f` |
| archive contents | linked-project marker, `config.toml`, four referenced `_shared` modules, and the complete v12 `process-jobs` source |

Rollback was ready but not invoked because no attributable worker regression occurred. If required by the authorization, the preserved archive is expanded to a new disposable directory and that complete v12 workdir is deployed as `process-jobs`; the minimum entry-processing and jobs health smokes then run before any further gate. The function is not reconstructed from fragments.

## Exact accumulated worker input

Comparison of the preserved v12 source to committed local HEAD before deployment found only:

- modified runtime `supabase/functions/process-jobs/entry.ts` (`49` additions, `36` deletions in the source comparison);
- new runtime `supabase/functions/process-jobs/product-events.ts` (`74` source lines);
- local-only, non-runtime `supabase/functions/process-jobs/dispatch.test.ts` (`36` source lines), excluded from the downloaded deployment bundle.

There was no unexpected `_shared`, `attachment.ts`, `dispatch.ts`, `index.ts`, or `deno.json` difference. The complete committed local function was deployed; no partial/reconstructed emitter was used.

### v12-to-v13 runtime delta hashes

| Path | v12 SHA-256 | v13/local SHA-256 | Classification |
| --- | --- | --- | --- |
| `entry.ts` | `1aa59e4ecf15229c160bca1fe5988a5af944af6de25cf4ada2162afb79a54e71` | `f6e89bc12d376797e213f1c34ec890b13d56d888978b030b483b75f7b774e2c2` | expected modification |
| `product-events.ts` | absent | `e786273b4b2b4522f15c1aa121ee268152c68dce55dafeced1351b5fc43bef1b` | expected new runtime helper |

### v13 downloaded-source parity

The fresh v13 download contained ten compared source/config files. Local and remote hashes matched for every row; there were zero missing, extra, or mismatched runtime files. The local-only `dispatch.test.ts` was not bundled.

| Deployed path | SHA-256 (local = downloaded v13) |
| --- | --- |
| `_shared/entity-resolution.ts` | `d447403f52d104ba2d48423cd5aa19c35bf0116c6eda162c0c6c01bba6227454` |
| `_shared/result.ts` | `7cee98e134d9241add762fc2e22e412047a03e1e96c0cff88cd8be0f1bc13809` |
| `_shared/trust-builders.ts` | `96c63aba3985723afaa5f0d6cdcf2968536b93de53a3bd1d797a13a1a324cade` |
| `_shared/trust-policy.ts` | `83323526cf6c6a2c9706c6ad5f2ff685cada728b5fae4d12420257d78265994e` |
| `process-jobs/attachment.ts` | `72e75b4773ec1e0b9934be30bd7e9d5a7b1d5f8475c78bbafcadf92d931db2ff` |
| `process-jobs/deno.json` | `5f1c69e365acfb48147f4f9c2806b4228ba91f920fc7723b25185e275bd29537` |
| `process-jobs/dispatch.ts` | `f1405546df5925218799fda3af6d6bd8a875aedc27ac03b27d8cc2cc86f78c22` |
| `process-jobs/entry.ts` | `f6e89bc12d376797e213f1c34ec890b13d56d888978b030b483b75f7b774e2c2` |
| `process-jobs/index.ts` | `61f6fcdeddf0cbd81c5554a6fce8c106efcb7dc5931f26cfe8a4adbd3e5f1b11` |
| `process-jobs/product-events.ts` | `e786273b4b2b4522f15c1aa121ee268152c68dce55dafeced1351b5fc43bef1b` |

Normalized composed source SHA-256: `7a75dc48a12f3bd2453c4057279c24d7a72ab40a01dbcfeef85063ae19fe2a41`.

## Predeploy validation and secret-name check

- focused worker/instrumentation Vitest: `21` files / `151` tests passed;
- required existing secret names confirmed present: `OPENAI_API_KEY`, `WORKER_DISPATCH_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`;
- secret values were never printed or changed;
- Deno was unavailable, so no `deno check` or Deno-test pass is claimed;
- substitutes actually executed: focused Vitest, Supabase deployment bundling/import resolution, fresh downloaded-source parity, complete remote behavior, full local test/lint/typecheck/build gates.

## Redacted provider-auth diagnostic transcript

The first provider-dependent Playwright execution reached the linked Auth service once for each required path and surfaced public `signup-failed` and `recovery-failed` states. A read-only Auth-log query classified the failures as follows:

```text
source=linked Supabase Auth log
request_path=/signup
http_status=400
error_code=email_address_invalid
classification=reserved example.com test domain rejected by provider

source=linked Supabase Auth log
request_path=/recover
http_status=400
error_code=email_address_invalid
classification=reserved example.com test domain rejected by provider
```

No signup request was repeated after this classification. The harness now requires `ONLINE_AUTH_TEST_EMAIL_DOMAIN` for real provider-delivery paths, explicitly skips provider signup when no routable catch-all domain is configured, and independently tests recovery link exchange, session installation, password update, and re-login. Final linked Auth matrix: sign-in/profile `2/2` passed, recovery core `2/2` passed, provider signup `2/2` explicitly skipped. No Auth application source, provider setting, SMTP setting, or remote configuration changed.

## Postdeploy behavioral evidence

The fail-fast `npm run test:remote:2x` aggregate passed in this order:

1. jobs — exclusive leases, stale-worker denial, bounded retry/recovery, exhaustion, sanitization, metrics, RLS;
2. interpretations — immutable revisions, bounded conflict, ownership, replay, audit, undo;
3. product events — all 17 events, allowlists/privacy, idempotency/repeats, ownership/RLS, service role;
4. entry processing — atomic capture, direct initial/reprocess worker, persisted completion events, same-attempt deduplication, distinct attempt keys, scheduled drain;
5. daily cycle — current interpretation, candidate consistency, record-only, race safety, queue and pagination;
6. baseline — Auth, settings, RLS/ownership, heartbeat, AI ledger/aggregation, deployed attachment worker;
7. cleanup — zero disposable Auth prefixes, accessible owner-row orphans, and smoke storage leftovers; product-event cascade verified owner-scoped.

Worker-specific outcomes were verified against persisted state:

- completion telemetry followed persisted job and entry completion;
- failure telemetry followed persisted failure;
- recoverable failures emitted `processing_retry_requested`;
- idempotency used job ID plus attempt, while distinct attempts produced distinct keys;
- service-side emission used owner-scoped `record_product_event_for_user`;
- telemetry errors remained fail-open;
- entry and attachment processing both continued to pass;
- direct reinvocation of the completed attempt introduced no duplicate event.

The scheduled-drain fixture now waits through the one-minute cadence plus worker/provider budget, accepts all three persisted success states (`completed`, `partially_processed`, `awaiting_review`), fails immediately on a persisted error state, and requires a current interpretation, completed fixture job, and exactly one completion event whose outcome matches persisted state. Reaper smokes refuse to run unless the disposable fixture is the only `running` job and invoke the global reaper with `p_limit: 1` only after making that fixture deterministically earliest.

## Cleanup snapshot

Final linked cleanup verification found:

- two remaining Auth users, both non-disposable;
- zero users for `phase-2a-jobs-`, `phase-2b-revisions-`, `phase-2x-entry-jobs-`, `phase-2x-events-`, `phase-2x-daily-cycle-`, `sprint-1-5-`, and `codex-` disposable prefixes;
- zero disposable entries, jobs, attachments, questions, tasks, or product events through owner-cascade verification;
- six current storage objects inspected and zero `remote-smoke.txt` objects;
- remote smoke cleanup failures now force a non-zero process exit instead of being log-only.

No rollback was required. The preserved v12 archive remains hash-verified and ready under the authorization's stated rollback procedure.

# Phase 2X — Product Convergence Closeout Report

Last updated: 2026-07-19

Status: complete with documented external limitations

Branch: `codex/phase-2-intelligent-capture`
Closeout commit: `docs(phase-2x): close product convergence evidence` (this commit)

## Completion decision

Phase 2X is complete. All product, database, worker, remote-smoke, local-quality, and core authenticated-browser gates required by Slice 2X.18 passed. The deployed `process-jobs` worker is source-equivalent to the committed local runtime, migrations and generated types match the linked project, and disposable data cleanup is complete.

Two external limitations remain explicit and are not counted as passes:

- provider-delivered signup email is skipped because the linked Supabase Auth service rejects reserved `example.com` test addresses with `email_address_invalid`; real delivery still requires a provider-routable address/custom SMTP;
- local Deno and Docker are unavailable, so no `deno check` or local Docker-backed pgTAP execution is claimed. Deployment bundling, downloaded-bundle parity, focused Vitest, linked lint, and disposable remote behavior provide the executed substitute evidence.

No Phase 2C–2F capability was started. This closeout changes verification harnesses and documentation only; the sole remote mutation was the explicitly authorized deployment of `process-jobs`.

## Deployed state and rollback

| Evidence | Result |
| --- | --- |
| Prior worker | `process-jobs` version 12, updated 2026-07-17 20:48:38 UTC |
| Deployed worker | `process-jobs` version 13, `ACTIVE`, updated 2026-07-19 15:06:50 UTC |
| Exact command | `npx supabase functions deploy process-jobs --project-ref ulvwzqlpsjyrnqzfxmck` |
| Remote parity | Fresh v13 download: 10 files, zero normalized-content mismatches, zero missing local runtime files, zero unexpected remote runtime files |
| Bundle fingerprint | normalized path/content SHA-256 `7a75dc48a12f3bd2453c4057279c24d7a72ab40a01dbcfeef85063ae19fe2a41` |
| Non-runtime test | `dispatch.test.ts` remained local and was not deployed |
| Preserved rollback | complete remote v12 zip at `C:\Users\fabin\.codex\artifacts\my-brain\phase-2x18\process-jobs-v12-20260717T204838Z.zip` |
| Rollback fingerprint | SHA-256 `345680E42AC248375EF1EBB67B83147257E6F2D8A76C0FD1889EBBEF00BE6C2F` |
| Rollback use | not required; no regression attributable to v13 was found |

The durable, sanitized version/source/Auth/cleanup manifest is `reports/PHASE_2X_SLICE_18_EVIDENCE.md`.

The deployment input contained exactly the accumulated committed Slice 2X.15 worker instrumentation:

- `entry.ts`: 49 added and 36 removed lines versus remote v12, adding outcome-gated product-event emission and job/attempt idempotency scopes;
- new runtime `product-events.ts`: 74 lines, deterministic UUID keys, owner-scoped `record_product_event_for_user`, property allowlisting, and fail-open error handling;
- local-only `dispatch.test.ts`: 36 lines and not part of the deployed bundle;
- no difference in `_shared`, `attachment.ts`, `dispatch.ts`, `index.ts`, or `deno.json`.

Required existing secret names were confirmed without printing values: `OPENAI_API_KEY`, `WORKER_DISPATCH_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. No migration, secret, schedule, grant, RLS policy, Auth setting, email setting, or other Edge Function changed. The branch was not pushed and no non-disposable production data was modified.

## Worker outcome evidence

| Required invariant | Evidence and result |
| --- | --- |
| Completion only after persistence | Deployed-source order calls `complete_job` before `capture_processing_completed`; the remote entry smoke observed the event only after the entry/job persisted completion. Passed. |
| Failure only after persistence | Deployed-source order requires successful `fail_job` data before `capture_processing_failed`; focused worker tests exercise the branch. Passed. |
| Recoverable retry event | `processing_retry_requested` is emitted only inside the non-terminal branch after persisted failure. Passed by source-order review and focused tests. |
| Job/attempt idempotency | Completion/failure keys include job id plus attempt; the remote smoke re-invoked an already completed job and observed no duplicate, then reprocessed and observed a distinct second attempt/event. Passed. |
| Owner-scoped recorder | The deployed helper calls only `record_product_event_for_user`; direct insert and cross-owner misuse remain denied by the product-events remote smoke. Passed. |
| Telemetry fail-open | Both RPC rejection and thrown-error paths return without changing the domain response; focused tests and source review passed. |
| Entry compatibility | Initial invocation, reprocessing, exclusive lease, recovery, and unattended scheduled drain passed remotely. |
| Attachment compatibility | Job-reliability smoke and complete Supabase baseline passed against the deployed v13 dispatcher/file worker. |
| No duplicate product events | Same completed attempt remains one event; reprocessing produces one additional event with a distinct idempotency key. Passed remotely. |

The failure/retry ordering is verified against the downloaded v13 source-equivalent bundle plus focused tests; no artificial production worker failure was induced by changing secrets or dependencies.

## PRD → epic → slice → evidence matrix

| PRD family and objective | Epic | Official slices | Delivered artifacts | Current evidence | Status |
| --- | --- | --- | --- | --- | --- |
| `ASY-001–015`, `RET-001–007`; immediate durable capture and recoverable processing | Epic 1 / O1 | 2X.3–2X.5 | migrations `025–027`, `capture_entry_async`, leased entry worker, dispatch drain, async Actions and receipt UI | aggregate jobs/entry/baseline smokes; desktop/mobile capture journey | complete |
| `NY-001–015`; review by exception | Epic 2 / O2 | 2X.10–2X.11 | migrations `030/031`, `list_needs_attention`, projection, Home preview, Caixa queue | daily-cycle remote smoke; full authenticated journey | complete |
| `STA-001–010`; one human-state language | Epic 3 / O3 | 2X.1, 2X.6 | daily-cycle contracts, lifecycle mapper, shared Inbox/Home projection and row | lifecycle tests; Home/Caixa E2E consistency | complete |
| `REV-001–012`; progressive decision-first review | Epic 4 / O2+O6 | 2X.8–2X.9 | review/technical projections, four-block review, collapsed technical details | projection/component tests; keyboard/focus/live-region desktop/mobile E2E | complete |
| `COH-001–011`; coherent candidate actions | Epic 5 / O4 | 2X.7, 2X.10 | migration `028`, interpretation provenance, record-only guard, atomic confirmation | daily-cycle concurrency/ownership/replay smoke; correction/confirmation/undo E2E | complete |
| `FLOW-001–021`; Home/Inbox/Work convergence | Epic 6 / O5 | 2X.6, 2X.11–2X.12 | shared projections, canonical Work, legacy redirects, task DTO/action boundary | Work tests; 18/18 authenticated journey per viewport; route regression | complete |
| `IA-001–013`; frequency-based navigation | Epic 7 / O7 | 2X.13 | capability/route registry, desktop groups, mobile More, locale-preserving links | navigation contract tests; authenticated desktop/mobile PT-BR/en route matrix | complete |
| `TRU-001–012`; operational truth | Epic 8 / O8 | 2X.14 | capability inventory, honest Home status, consumer-backed Settings and Reviews | component/action tests and authenticated Settings/Home/Reviews journeys | complete |
| `MET-001–024`; private product funnel | Epic 9 / O9 | 2X.2, 2X.15, 2X.18 | migration `024`, 17-event taxonomy, closed emitters, deployed worker helper | product-events smoke; deployed v13 parity; remote worker event/no-duplicate assertions | complete |
| `PROJ-001–020`; product projection boundary | Epic 10 / O6+O10 | 2X.1, 2X.6, 2X.8, 2X.10, 2X.12, 2X.16 | product DTOs, server-only loaders, architecture guardrails, no raw score/row leakage | architecture and mapper tests; 80-file/443-test full suite | complete |
| `XG-001–035`; isolation, accessibility, localization, gates, docs | Cross-cutting | 2X.1–2X.18 | owner/RLS boundaries, both locales/viewports, aggregate gate, permanent evidence | complete gate matrix below; external skips explicit | complete with documented limitations |

The seven conceptual delivery groupings in `PHASE_2X_PRD.md` were decomposed into 18 official implementation slices by `PHASE_2X_IMPLEMENTATION_PLAN.md`; they are complementary levels of planning, not competing slice counts. The durable per-ID annex `reports/PHASE_2X_TRACEABILITY_MATRIX.md` maps all 195 functional/non-functional IDs, all 58 family acceptance IDs, and all 30 global acceptance criteria (283 rows) to delivery artifacts and executable evidence. Global criteria 26–30 close specifically through Slice 2X.18.

## Slice and commit inventory

| Slice | Commit | Outcome |
| --- | --- | --- |
| 2X.1 | `797086b` | daily-cycle product contracts |
| 2X.2 | `d25d42a` | private product-event ledger |
| 2X.3 | `483d66f` | atomic capture/job RPC contracts |
| 2X.4 | `dd05114` | asynchronous entry worker and dispatch |
| 2X.5 | `51dd713` | immediate capture/reprocessing cutover |
| 2X.6 | `4645b6d` | shared human Inbox/Home state |
| 2X.7 | `a0e3642` | interpretation-bound candidate actions |
| 2X.8 | `cdcb878` | product/technical review projections |
| 2X.9 | `138ef07` | decision-first progressive review |
| 2X.10 | `26c23f2` | supported Needs Attention projection |
| 2X.11 | `efa9571` | Home/Caixa Needs Attention UI |
| 2X.12 | `e6e8529` | canonical Work surface |
| 2X.13 | `7f3d413` | converged information architecture |
| 2X.14 | `d0ad305` | visible promises aligned to consumers |
| 2X.15 | `daca148` | complete 17-event instrumentation |
| 2X.16 | `31a0acc` | enforced product projection boundaries |
| 2X.17 | `1880a66` | converged daily journey E2E |
| 2X.18 | this commit | deployed parity, aggregate gate, permanent closeout |

Five supporting Phase 2X commits remain intentionally separate from the 18 official slices: report-template work `2fc4da6`, projection prework `9f0c1e6`, architecture review `510d85a`, conflict hotfix `e54be97`, and candidate-lifecycle hotfix `edce18e`. Historical reports were not rewritten.

## Verification matrix

### Local and build

| Command/gate | Result |
| --- | --- |
| focused worker/instrumentation Vitest | 21 files / 151 tests passed before deploy |
| `npm test` | 80 files / 443 tests passed |
| `npm run lint` | passed, zero errors |
| `npm run typecheck` | passed, zero errors |
| `npm run build` | Next.js 16.2.10 production build passed |
| `git diff --check` | passed; only Windows LF/CRLF advisories were printed |
| Deno | unavailable; no `deno check` claim |
| Docker/pgTAP | unavailable locally; no pgTAP pass claim |

### Remote Supabase aggregate

`npm run test:remote:2x` ran sequentially and fail-fast after the final harness changes:

| Gate | Result |
| --- | --- |
| `test:remote:jobs` | passed: leases, stale-worker denial, recovery, exhaustion, sanitization, metrics, RLS |
| `test:remote:interpretations` | passed: immutable revisions, bounded `55P03` conflict, ownership, replay, audit, undo, cleanup |
| `test:remote:product-events` | passed: all 17 events, allowlist/privacy, idempotency/repeats, ownership/RLS, service role, cleanup |
| `test:remote:entry-processing` | passed: atomic capture, direct initial/reprocess worker, event parity/no duplicates, scheduled drain |
| `test:remote:daily-cycle` | passed: current interpretation, candidate consistency, race safety, record-only, queue/pagination, cleanup |
| `test:remote` | passed: auth, atomic settings, RLS, ownership, heartbeat, AI ledger/aggregation, deployed file worker |
| `test:remote:2x:cleanup` | passed: zero disposable users, accessible owner-row orphans, and storage leftovers; owner-scoped product-event cascade passed |

### Browser matrix

| Suite | Desktop | Mobile | Classification |
| --- | --- | --- | --- |
| offline `foundation.spec.ts` | 3/3 passed | 3/3 passed | pass |
| authenticated `intelligent-capture.spec.ts` | 18/18 passed | 18/18 passed | pass |
| authenticated `online-mobile-navigation.spec.ts` | 1/1 passed | 1/1 passed | pass |
| sign-in/profile persistence | 1/1 passed | 1/1 passed | pass |
| password reset core via disposable administrative link | 1/1 passed | 1/1 passed | pass |
| provider-delivered signup email | skipped | skipped | external limitation; not a pass |

The first provider-auth run exposed `signup-failed` and `recovery-failed`. Redacted linked Auth logs classified both underlying requests as HTTP 400 `email_address_invalid` for the reserved `example.com` test domain. The E2E harness was corrected to avoid repeated provider calls to a known-rejected address, keep signup explicitly skipped, and independently exercise recovery token exchange, SSR session installation, password update, and re-login. `ONLINE_AUTH_TEST_EMAIL_DOMAIN` can opt a future catch-all/provider-routable test domain into the real delivery paths without changing source. Final auth result: 4 passed, 2 skipped. No Auth source or remote Auth configuration changed.

Static screenshots were not added. Executable Playwright assertions across both viewports/locales, including semantic roles, focus, keyboard, live regions, routes, persisted database outcomes, and touch targets, are the recorded UI evidence; this is not represented as a screenshot pass.

### Linked database and generated schema

- `supabase migration list --linked`: local and remote histories match through `202607180031`; no migration was applied.
- `supabase db lint --linked --level warning`: exit 0 with exactly two pre-existing SQLSTATE `42804` warnings in `public.run_user_heartbeat` for text-to-time initialization of `quiet_start_time` and `quiet_end_time`; no new finding.
- `supabase gen types typescript --linked`: normalized output exactly matches `src/lib/supabase/database.types.ts` (`generated_types_match=true`; normalized SHA-256 `925f15d9a1400c16231bfabe08fee8249a6d7c656846fc34283cf891535209de`).

## Cleanup verification

Every remote harness deletes its disposable users in `finally`; cleanup errors now force a non-zero exit. Fresh `npm run test:remote:2x:cleanup` verification scanned all linked Auth users and found zero users for these prefixes: `phase-2a-jobs-`, `phase-2b-revisions-`, `phase-2x-entry-jobs-`, `phase-2x-events-`, `phase-2x-daily-cycle-`, `sprint-1-5-`, and `codex-`. The linked project contained only its two non-disposable users.

The cleanup verifier found zero orphaned `entries`, `jobs`, `attachments`, `pending_questions`, or `tasks`. Because direct service-role reads of the private product ledger correctly fail with `42501`, the product-events smoke verifies its cascade with each owner's still-valid JWT immediately after Auth deletion and found zero rows. A storage scan inspected six current `user-files` objects and found zero `remote-smoke.txt` leftovers.

## Capability inventory retained from Slice 2X.14

Visible operational controls still have real consumers: timezone; response style/detail; quiet hours, important override, and daily follow-up limit; manual review generation; chat/extraction/review/file model routes; AI cost transparency; Home operational status. Display/agent names, persisted locale settings, automatic review schedules, autonomy/follow-up intensity, default privacy, and unused reasoning/background routes remain hidden future capabilities. `product_events` remains a private observation ledger and never drives lifecycle or product decisions.

## Residual risks and follow-ups

- Custom SMTP plus a provider-routable catch-all domain supplied as `ONLINE_AUTH_TEST_EMAIL_DOMAIN` is required before claiming real signup/recovery-email delivery in preproduction. The current explicit signup skip is accepted but not green.
- Docker-backed pgTAP must run in CI or on a workstation with Docker; remote behavioral smoke currently supplies the linked-role/runtime evidence.
- Deno should be installed in CI or a developer environment to add `deno check` and direct Deno test execution; the deployed bundle itself was successfully bundled by Supabase and downloaded back with exact runtime parity.
- The two existing heartbeat lint warnings should be fixed in a dedicated append-only migration, not by editing history.
- `undo_operation` still uses SQLSTATE `40001` for one conflict path and remains a separate preproduction investigation.
- No static screenshot artifact was captured; automated UI assertions are the evidence retained here.
- XG-026's client/server p95 reference targets were not measured as percentile datasets. Duration events are present, but no p95/SLO pass is claimed.

## Independent review

- Pre-deploy independent audit: GO; expected runtime delta only and rollback input preserved.
- Final independent closeout review: READY after two remediation rounds; no critical or important finding remained. The reviewer verified shared-queue isolation, fail-fast cleanup, scheduled-drain outcomes, 283-ID traceability, XG-026's non-green classification, stable rollback evidence, and absence of product/migration/secret/Phase 2C–2F scope changes.

## Final scope statement

Phase 2X delivered the existing product's converged daily cycle without re-architecting it: durable asynchronous capture, human lifecycle language, exception review, coherent confirmation, canonical Work, truthful navigation/settings, a closed product projection boundary, and private funnel evidence. The linked deployment now matches that local contract. Phase 2X is complete with the external limitations above; the next product phase is not started by this closeout.

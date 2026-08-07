# Phase 2H — Deploy and Operate — Threat Model

- **Status:** Planning artifact under ADR-085, **reviewed after slice 2H.0** (§5b). T-2H-01…**T-2H-25** are the **per-slice review floor**: no slice merges with an unanswered row that touches it. T-2H-25 was added by the 2H.0 census, not by the original model.
- **Scope:** the mechanisms `PHASE_2H_PRD.md` declares — deletion recovery, error sink, cron dead-man switch, distributed rate limiting, deployment contract, retention mechanism, backup procedure, operator surfaces.
- **Method:** each threat names the asset, the actor who could realise it, the mechanism that refuses it, and — where the refusal is only as good as its proof — the evidence that must be *executed*, not reviewed.

---

## 0. Why this phase's threat surface is unusual

Every previous phase added product capability inside a boundary that already existed. This one adds **observability and automation** — mechanisms whose entire job is to see failures and act on them without a human. That inverts the usual risk: the danger is not mostly that a user reaches something they should not, it is that

- an automatic actor does something destructive nobody authorized (`2H-RECOVER`),
- a mechanism built to record failures records **secrets** instead (`2H-SINK`, `2H-OPS`),
- or a control reports health it never measured (`2H-DEADMAN`, `2H-RATE`).

The third is the quietest and this repository has already paid for it twice — a producer whose refusals recorded nothing for weeks (ADR-084), and a probe whose controls agreed with its positives. Both appear below as first-class threats rather than test notes.

---

## 1. Automatic destructive action

| # | Threat | Refused by | Evidence that must be executed |
| --- | --- | --- | --- |
| **T-2H-01** | The stalled-deletion reaper deletes rows the executor deliberately refused to delete, becoming a second — and unaudited — write path to the most destructive operation in the product. | `2H-RECOVER-003`: the reaper re-invokes the executor and holds no capability the executor lacks. The reaper contains no `delete`. | pgTAP proving the reaper's own privileges, plus a source assertion that it performs no deletion itself. |
| **T-2H-02** | The reaper retries without bound, hammering a permanently failing deletion forever and hiding it as "in progress". | `2H-RECOVER-002`: attempt ceiling, bounded backoff, terminal `stalled` classification. | pgTAP driving an account past the ceiling and asserting it stops **and** becomes visible. |
| **T-2H-03** | The reaper resurrects a deletion the user cancelled, or acts on an account no longer in `deleting`. | The reaper's predicate is `deleting` **and** stale; a state change between selection and invocation is refused by the executor's own re-check. | pgTAP on the race: state flips between claim and invoke. |
| **T-2H-04** | Two reaper runs overlap and invoke the executor concurrently for the same account. | Lease-based claim with `FOR UPDATE SKIP LOCKED`, the shape `claim_next_entry_interpretation_job` already establishes. | pgTAP with two concurrent claims; exactly one wins. |
| **T-2H-05** | A retention sweep runs because a migration scheduled it — making the migration, not the owner, the authorizer of the first live purge. | ADR-082, restated assertably as `2H-RETENTION-002`. | A guard over every `phase_2h` migration's text asserting no `cron.schedule` of a destructive sweep. |
| **T-2H-06** | The deploy runbook's destructive steps are executed by someone following it as a checklist, without realising which ones need separate authorization. | `2H-DEPLOY-006`: destructive steps are marked owner-only **in the runbook** and carry the authorization each needs. | A guard asserting every destructive step in the runbook carries its marker. |

## 2. Secrets and user content in observability

| # | Threat | Refused by | Evidence that must be executed |
| --- | --- | --- | --- |
| **T-2H-07** | The error sink records an exception whose message contains user content, a prompt, model output, or a file name. | `2H-SINK-002`: the writer records a **classified reason**, never a raw message. | A probe feeding the writer an exception carrying a known sentinel and asserting the sentinel is absent from the stored row. |
| **T-2H-08** | The error sink records a credential — an OpenAI key in a provider error, the service-role key, the BYOK master key, a heartbeat secret. | Same writer contract; classification happens before storage, and the classifier has a closed vocabulary. | Same probe with credential-shaped sentinels; plus an assertion that the stored column set cannot hold free text from a provider. |
| **T-2H-09** | The error sink records a session identifier or access token, making the sink a session-hijack surface. | `2H-SINK-002`; correlation ids are minted for the sink and are not session identifiers. | pgTAP asserting the correlation id's provenance is independent of any session value. |
| **T-2H-10** | An operator read returns user content or credential material because it joins a table that holds it. | `2H-OPS-004`: aggregates and classifications only. | pgTAP over each operator read's actual output columns, not over its intent. |
| **T-2H-11** | `2H-RECOVER-004`'s operator-readable reason projection leaks the session hash `account_deletion_log` holds. | The projection carries reason code, attempt count and timestamps — an explicit allowlist, never `select *`. | pgTAP asserting the base table remains unreadable by every role **and** that the projection's column set excludes the hash. |
| **T-2H-12** | The deployment contract writes a secret into a `NEXT_PUBLIC_*` variable, publishing it to every browser. | `2H-DEPLOY-002`: the contract classifies each variable and the classification is machine-checked. | A unit test failing on any `NEXT_PUBLIC_*` name matching the secret set. |

## 3. Controls that report health they never measured

| # | Threat | Refused by | Evidence that must be executed |
| --- | --- | --- | --- |
| **T-2H-13** | The dead-man switch reports every job healthy because its staleness predicate never fires. | `2H-DEADMAN-003`: an executed **negative control** — a backdated job reads stale, a current one does not. | Both directions asserted in one test. A control that agrees with its positive has measured nothing. |
| **T-2H-14** | The dead-man switch is blind to a job that was never registered, so a silently unscheduled job reads as "no problem". | `2H-DEADMAN-001` enumerates from the `cron.job` catalog at run time, not from a hand-written list; G-2H.3's census establishes the baseline. | pgTAP adding a job to the catalog and asserting it appears without a code change. |
| **T-2H-15** | The rate limiter's refusals record nothing, so the ceiling's own telemetry is silent — ADR-084's defect, repeated. | `2H-RATE-003`: the refusal's `failureKind` must be a member of **both** the database vocabulary and `contracts.ts`. | A regression test pinning the literal in both validators, in the shape ADR-084's fix established. |
| **T-2H-16** | The error sink's writer fails silently, so the sink is empty and reads as "no errors". | `2H-SINK-003`: the writer's own failure is swallowed **and counted**. | A test forcing the writer to fail and asserting the counter moves. |
| **T-2H-17** | The sink accumulates records no surface ever reads — a producer with no consumer, invisible on both sides. | `2H-SINK-005` fails if no consumer exists; `2H-DEADMAN-004` does the same for parity state. | An integration test resolving the consumer, not a claim that one is planned. |
| **T-2H-18** | `verify:edge-parity` runs in the deploy path but its failure does not stop the deploy. | `2H-DEPLOY-003`: a function behind its deployable source is a **reported failure**, not a warning. | An executed run against a deliberately stale fixture. |

## 4. Availability and the limiter itself

| # | Threat | Refused by | Evidence that must be executed |
| --- | --- | --- | --- |
| **T-2H-19** | The rate limiter admits traffic when its own state cannot be read, so a database problem removes the control exactly when load is highest. | `2H-RATE-005`: fail-closed. | Fault injection making the limit state unreadable; the operation must be refused. |
| **T-2H-20** | The limiter is proven by a serial loop and passes, while concurrent requests all read the same pre-increment count and every one is admitted. | `2H-RATE-004`: SH.6's concurrency proof shape — N racers, ceiling M, exactly M admitted. | The concurrent script against a real database. A serial proof is not evidence here. |
| **T-2H-21** | The limiter's ceilings are numbers someone typed, so the control enforces a policy nobody agreed to. | `2H-RATE-002` (required parameters, ADR-080's discipline) and gate **G-2H.5** (owner signature) blocking 2H.3. | The signed value sheet, referenced by the slice. |
| **T-2H-22** | The limiter becomes a spend control by accretion, re-opening scope ADR-083 §5 withdrew. | `2H-RATE-006`: request rate only; no spend column. | A census asserting the absence. |

## 5. The deployment boundary

| # | Threat | Refused by | Evidence that must be executed |
| --- | --- | --- | --- |
| **T-2H-23** | A migration revokes a grant a deployed Edge Function build depends on, and every call fails silently until a user complains — **the defect that began this phase** (`202608050077` vs `delete-account` v1). | `2H-DEPLOY-003`/`004` put parity in the deploy path; `2H-RECOVER-001` makes the resulting stall self-recovering; `2H-OPS-001` makes it visible; `2H-DEPLOY-007` applies the same audit to `process-jobs` before any decision about it. | `2H-RECOVER-006` reproduces the exact failure shape and asserts recovery. Four mechanisms, because one of them was enough to miss it. |
| **T-2H-24** | `process-jobs` is deployed as a side effect of a slice merge, and an unaudited worker build breaks the live capture path. | ADR-086 and `2H-DEPLOY-007`: the slice produces a **written audit** and a recommendation; the deploy is a separately authorized owner action, never bundled. | The audit itself, citing executed reads of the diff against every migration applied since `8982d74`. |

---

## 5b. Threat review after slice 2H.0 (2026-08-06)

The pre-code gates were executed against the live project. Four rows are updated by measurement rather than by argument, and one threat is **added**, because the census found a failure mode the original model did not name.

| # | Row | Change after 2H.0 |
| --- | --- | --- |
| **T-2H-13** | Dead-man switch fires on everything | **Reinforced, with a live example.** `my-brain-entry-dispatch` shows 29 042 successes while the `jobs` table holds 4 rows, newest 2026-08-02. A `succeeded` cron tick records that the *statement* ran, not that work happened. `2H-DEADMAN-001` must therefore record last-successful-**run**, and any health claim built on tick counts would be measuring silence. |
| **T-2H-14** | Switch blind to unregistered jobs | **Baseline established.** Five active jobs enumerated from `cron.job` at run time; `job_count = distinct_names = 5`, so no duplicates and no shadowed name. The unschedule-then-schedule pattern in the migrations held. |
| **T-2H-18** | Parity check runs but does not stop a deploy | **Sharpened.** The census confirms exactly one parity gap (`process-jobs`), and it has persisted across three closeouts. The check works; what is missing is the *stopping*, which is `2H-DEPLOY-003`'s whole content. |
| **T-2H-23** | A migration revokes a grant a deployed function depends on | **Reproduced live, read-only.** `service_role` on `user_ai_credentials` answers `403 / 42501` — the exact recorded error — while `admin_credential_status` answers `200 null` and a control read succeeds. The cause is not historical; it is present and demonstrable. |

### New threat found by the census

| # | Threat | Refused by | Evidence that must be executed |
| --- | --- | --- | --- |
| **T-2H-25** | **A merge deploys the application while the workers, the schema and the cron schedule stay behind — and the merge reads as "shipped".** Vercel creates a Production deployment on every merge to `main` with no operator act, while Edge Functions and migrations require one. This is the founding defect's mechanism generalised, and the census proved a second face of it: during the 2026-08-06 GitHub Actions outage, Vercel created Preview deployments for `bdb6252` and `fc44375` — **the two commits for which no workflow run existed at all**. A green preview beside absent CI is the most misleading state the platform can present. | ADR-087 records the asymmetry as the phase's central operational fact; `2H-DEPLOY-001`'s runbook must carry a **per-layer** deploy/rollback section rather than one sequence; `2H-DEPLOY-003`/`004` make the lagging layers visible; and the runbook must state that a Preview proves the build compiled and **never** that anything was tested. | The runbook asserted against the census: every layer named with its trigger and its rollback, and a guard that a deployment claim cites the layer it applies to. |

## 6. Threats deliberately out of scope, and why

- **Signup abuse at scale.** Guarded by the rollout gate, CAPTCHA and closed signup; Phase 2H does not open signup and inherits that posture unchanged.
- **File content scanning / AV.** `SH-STORAGE-006` recorded the decision that v1 does not scan, with named compensating controls; it remains an open rollout-gate item and is not re-opened here.
- **Provider-side abuse of a user's own BYOK credential.** BYOK closed with the boundary recorded; rate limiting bounds this product's request rate, not the provider's.
- **Alert delivery.** `2H-OPS-005` states plainly that alerting is defined and deliberately not built absent an owner-selected destination — recorded so a later reader does not mistake the gap for an oversight.

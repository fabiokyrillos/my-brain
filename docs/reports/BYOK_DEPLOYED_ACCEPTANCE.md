# BYOK — deployed acceptance, and the cutover defect it found

**Date:** 2026-08-02
**Repository state:** `main` at `abef6e4`, working tree clean, in sync with `origin/main`.
**Target project:** `ulvwzqlpsjyrnqzfxmck` (`my-brain`).
**Verdict:** the deployed *architecture* is proven. The deployed *cutover* is **FAILED**.
**BYOK is NOT closed.**

---

## 0. The one-paragraph version

The owner completed all four owner actions. Four of them landed correctly: the three
BYOK secrets exist in the Supabase Edge Function store, all five migrations are applied,
the current `process-jobs` is deployed byte-identically, and `OPENAI_API_KEY` is gone
from the deployed secrets. The fifth thing — which was never an action, only an
assumption — did not hold: **the Next.js runtime that saved the owner's credential held
a different `BYOK_MASTER_KEY` from the deployed worker.** The credential is therefore
sealed under a key nothing available can open, and the owner's asynchronous AI is
terminally broken right now.

The important part is what the system did about it. It did not fall back to a project
key, because there is none to fall back to. It did not retry forever. It did not leak a
provider message. It failed closed, terminally, on the first attempt, and returned the
entry to an honest product state. **The failure is a configuration failure that the
architecture handled exactly as designed** — which is why this report can record a large
number of previously-blocked gates as executed and passed, and one central claim as
executed and failed.

---

## 1. Deployment state, verified rather than accepted

Every line here was read back from the deployment, not from the repository or from the
owner's report.

| Property | Method | Result |
| --- | --- | --- |
| Migration parity | `supabase migration list --linked` | local **and** remote both `202608010069`; no drift, no pending, no orphan |
| Deployed function secrets | `supabase secrets list` | 12 names; `BYOK_MASTER_KEY`, `BYOK_FINGERPRINT_PEPPER`, `BYOK_RATE_LIMIT_PEPPER` all present |
| `OPENAI_API_KEY` in deployed secrets | same listing | **ABSENT** — gate **E2 PASSES** |
| `process-jobs` deployment | `supabase functions list` | version 20, `ACTIVE`, updated `2026-08-02T02:42:26Z` — after the secrets, before the credential |
| `heartbeat` deployment | same | version 8, untouched since `2026-07-16`; BYOK changed nothing about it |
| Deployed bundle vs repository | `supabase functions download` + `diff` | **16 of 16 files byte-identical** to `abef6e4` — gate **D10 PASSES in full** |
| Project key in deployed executable code | comment-stripped scan of the downloaded bundle | **0 files**. The only textual occurrence is a doc comment describing the read that BYOK.4 deleted |
| Env names the deployed worker reads | same scan | `BYOK_MASTER_KEY`, `BYOK_FINGERPRINT_PEPPER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_DISPATCH_SECRET`, `OPENAI_FILE_MODEL`. **No provider credential of any kind** |
| Module-scope master-key validation | deployed `index.ts` + live behaviour | present, and *active*: the worker served requests rather than returning its `worker_not_configured` 503, which is only possible with a present, well-formed master key |
| Heartbeat is AI-free | scan of `supabase/functions/heartbeat/` | zero references to `openai`, `byok` or `credential` |

**No sixth BYOK migration exists and none is required.** The head is `202608010069`, five
migrations, exactly the `ADR-070` budget.

### The Next.js runtime boundary, stated honestly

**There is no shared Next.js hosting environment.** No `vercel.json`, no `.vercel`, no
`netlify.toml`, no `Dockerfile`, no deploy workflow — `ci.yml` is the only workflow, and
`README.md:20` and `ARCHITECTURE.md:91` both record Vercel as deliberately deferred while
the product is pre-MVP. The application runs locally against the linked Supabase project.

So "verify the hosting platform has the three secrets and not the project key" has no
subject, and this report does not pretend otherwise. What it verifies instead is the
**local** Next.js runtime configuration, which is the only Node runtime this deployment
has — and that is where the defect is.

---

## 2. The defect: the two runtimes hold different master keys

### What was measured

Three independent methods agree, each with its own control.

**Method 1 — digest comparison.** `supabase secrets list` returns a SHA-256 digest per
secret, never a value. Hashing the `.env.local` value and comparing digests gives an
answer without either side printing anything.

* Positive control: `SUPABASE_URL`'s digest **reproduces** from `NEXT_PUBLIC_SUPABASE_URL`,
  so the algorithm is confirmed and a mismatch below is attributable to the values.
* `BYOK_MASTER_KEY`, `BYOK_FINGERPRINT_PEPPER`, `BYOK_RATE_LIMIT_PEPPER`: **all three
  differ** from the deployed digests, under every legitimate encoding variant (raw,
  trimmed, unquoted, newline-terminated).
* `.env.test.local` differs too, so the deployed values are not the test values either.

**Method 2 — attempted decryption.** The owner's stored envelope was decrypted against
`.env.local`'s master key with the repository's own AAD composition.

* Positive control: a round trip under that key **succeeds**, so the harness is correct.
* Negative control: the same ciphertext under a deliberately wrong AAD is **rejected**.
* The owner's ciphertext: **does not open**, under `.env.local` or `.env.test.local`.

**Method 3 — the deployed worker itself.** See §3, case OWNER-ASYNC.

### What follows from it

The Node runtime that saved the credential on `2026-08-02T02:44:07Z` held a
`BYOK_MASTER_KEY` that is neither the deployed value nor either value now in the
repository's env files. The credential row is `active`, `key_version` 1, fingerprint
present, `validated_at` set, `last_failure_code` null — **it looks perfect from every
surface that can see it**, because every one of those surfaces is metadata.

This is the master-key-loss condition, arrived at by misconfiguration rather than by
losing anything. There is no recovery: AES-256-GCM does not have one, and this report
does not invent one. The owner must re-enter the key.

### Why nothing warned anybody, and why that is correct

`BYOK-CRYPTO-005` forbids a decryption failure from reporting *which* of key, tag or AAD
failed. That is the right rule — the alternative is an oracle — and it means a
runtime-key mismatch is **structurally invisible from inside the product**. The check
therefore has to live outside it, and until this report there was none.

`ADR-072` adds one: `npm run byok:verify-runtime`. Run against the current state it
reproduces the defect independently, in one command, printing no value and no digest:

```
PASS         digest-algorithm-control — SUPABASE_URL digest reproduced
FAIL         BYOK_MASTER_KEY — the two runtimes hold DIFFERENT values
FAIL         BYOK_FINGERPRINT_PEPPER — the two runtimes hold DIFFERENT values
FAIL         BYOK_RATE_LIMIT_PEPPER — the two runtimes hold DIFFERENT values
PASS         OPENAI_API_KEY — absent from the deployed Edge Function secrets

NOT IN PARITY — 2 pass, 3 fail, 0 unverifiable
```

It refuses to return a verdict at all unless it can first reproduce a known digest, so it
can never report "different values" when it means "different hash function". Thirteen
unit cases in `src/lib/byok/runtime-parity.test.ts`, including this exact defect and the
no-leak assertion.

---

## 3. What the deployed worker actually did — executed cases

All cases ran against the **deployed** `process-jobs` reached through the unattended
`pg_cron` drain. Disposable accounts were created and deleted; the owner case used the
owner's real account and was cleaned up. Every case below is EXECUTED.

| Case | Result | Evidence |
| --- | --- | --- |
| **OWNER-ASYNC** — the owner's asynchronous AI on the owner's own credential | **FAILED** | job `exhausted`, `error = credential_unreadable`, attempts 1/5, entry returned to `awaiting_ai_configuration`, `ai_usage_events` unchanged 6 → 6 |
| **NO-PROJECT-KEY-FALLBACK** — a job whose credential cannot be read must not run on anything else | **PASS** | the same run. Under the pre-BYOK architecture this job would have **succeeded** on the project key. It failed closed instead, and made no provider call at all |
| **DRAIN-SKIPS-UNCREDENTIALED** — an owner with no credential is skipped, not burned | **PASS** | after >1 cron tick: `pending`, attempts **0**, error null |
| **JOB-BECOMES-ELIGIBLE-AFTER-CONFIGURATION** — configuring a credential makes the queued job claimable | **PASS** | same job moved to attempts 1 once a credential row went active |
| **TERMINAL-ON-UNREADABLE-CREDENTIAL** | **PASS** | `exhausted`, not `pending` |
| **NO-RETRY-SCHEDULED-ON-CONFIGURATION-FAILURE** | **PASS** | attempts 1 of max 5; no further attempt scheduled. `ADR-071`'s narrowing holds exactly as written |
| **JOBS-ERROR-IS-DECLARED-SAFE-CODE** | **PASS** | `credential_unreadable` — a member of the closed vocabulary, no provider text, no runtime message |
| **ENTRY-RETURNED-TO-AWAITING-AI-CONFIGURATION** | **PASS** | `mark_entry_awaiting_ai_configuration` fired; `processing_error` null |
| **FOREIGN-OBJECT-ID-DOES-NOT-CROSS-OWNERS** | **PASS** | a job owned by B naming an entry owned by A left A's entry untouched and uninterpreted |
| **REMOVAL-CANNOT-BE-A-FLAG** | **PASS** | an update setting `status = 'removed'` while leaving the ciphertext in place is **refused** by `user_ai_credentials_status_shape_check`. `BYOK-SCHEMA-003` holds in the deployed database, not just in the migration |
| **REMOVAL-ERASES-KEY-MATERIAL** | **PASS** | the accepted removal wrote `status = 'removed'` with `ciphertext` and `iv` both null |
| **REMOVAL-BLOCKS-QUEUED-WORK** | **PASS** | job enqueued against a removed credential stayed `pending` with attempts **0** across a full tick |
| **JOB-RECOVERABLE-AFTER-CREDENTIAL-RESTORED** | **PASS** | reconfiguring an active credential moved the **same** job from attempts 0 to 1 |
| **JOBS-ERROR-VOCABULARY-CENSUS** — every `jobs.error` in the deployed table | **PASS** | one distinct value, `credential_unreadable`; zero undeclared. See §6 |

A note on method, because it changes what one of these rows is worth. The first pass of
the removal case reported a failure that turned out to be the harness's, not the
product's: it set `status = 'removed'` without erasing the ciphertext, the database
**rejected** the update, the credential stayed active and the job was correctly claimed.
The cases were re-run with that corrected, and the rejection itself was promoted into the
two `REMOVAL-*` rows above — a constraint that refuses to let a removal be a flag is worth
asserting deliberately rather than discovering by accident.

`reap_expired_jobs`'s pre-existing `'Worker lease expired'` literal is **not** claimed as
part of the worker vocabulary; it remains outside the declared scope exactly as
`ADR-071` records.

---

## 4. What is still blocked, and by what

The master-key mismatch does not merely leave the remaining gates unrun — it makes
running them **meaningless or unsafe**, and in one case actively destructive. Stated per
item rather than as a single excuse.

| Blocked item | Why it cannot be executed now |
| --- | --- |
| Owner's **synchronous** AI on their own credential (E1 sync) | No Node runtime available to this loop holds the deployed master key, so no synchronous path can decrypt the owner's credential. Only the owner's own runtime can. |
| **Removing and re-adding the owner's credential** (E3) | Removal is easy and irreversible-ish; re-adding is not. Re-adding through the local Settings would seal a new credential under the **local** master key, which the deployed worker also cannot read — leaving the owner exactly as broken, with their real OpenAI key spent to get there. **This would damage live production state, so it was not attempted.** |
| Two-user isolation with **real** credentials | Saving a credential requires a validating provider call, and the only OpenAI key available to this loop is `BYOK_VALIDATION_OPENAI_API_KEY`, which is explicitly **not a product credential**. The isolation properties were exercised at the resolver and worker layer instead (§3), where they actually live. |
| **Concurrent rotation** (C10) | Genuine contention needs two validating keys to rotate between. Same constraint. Not simulated and not claimed. |
| **Settings journeys**, desktop and Pixel 7, both locales (C11) | Same: every save/validate/rotate step needs a provider-accepted key that this loop may not use as a product credential. |
| **Capture lifecycle** end to end through the UI | The no-key half is executable; the "activate a key, then bounded processing" half needs a usable credential. Split rather than half-claimed. |
| **Two-key bounded rotation window** | The code does not exist. `BYOK_INCIDENT_RUNBOOK.md` §2a already says so. It was not built here: building an unproven recovery mechanism on top of a deployment whose credential path is currently broken is precisely the failure `ADR-069` exists to prevent. |
| **Remote smoke after cutover** (E5) | Its purpose is to confirm the remote scripts still work *after* a successful cutover. The cutover is not successful. Running it now would test a state nobody wants to keep. |

---

## 5. Master-key loss and recovery — what was proven, and how

The loss drill did not need a synthetic environment. **It happened, for real, against the
deployed one**, and every property the drill exists to establish was observed:

| Recovery claim | Status | Evidence |
| --- | --- | --- |
| A lost/mismatched master key makes existing ciphertext unreadable | **PROVEN** | the owner's credential, under two different keys and every encoding variant |
| The application fails safely | **PROVEN** | terminal, no retry storm, no provider call, honest product state |
| No plaintext recovery is falsely claimed | **PROVEN** | none is claimed here or in the runbook; AES-256-GCM has none |
| Affected users must re-enter credentials | **PROVEN, and now required of the owner** | the only remedy |
| Failure names no cause | **PROVEN** | `credential_unreadable` and nothing else, in `jobs.error` and to the user |
| Unit-level equivalent | **PASSING** | `crypto.test.ts` — "rejects the right ciphertext under the wrong master key" |
| Two-key rotation window works | **NOT EXECUTED — the code does not exist** | `BYOK_INCIDENT_RUNBOOK.md` §2a |
| New encryptions use the new key version | **NOT EXECUTED** | same |
| Old ciphertext readable only during a bounded transition | **NOT EXECUTED** | same |
| Old key removal verified | **NOT EXECUTED** | same |
| Compromise runbook requires user-key rotation | **WRITTEN, NOT DRILLED** | `BYOK_INCIDENT_RUNBOOK.md` §4, marked as such at the top of the file and of every section |

The runbook's §2b, *invalidate and ask*, is the procedure the owner is about to perform
involuntarily. It is the only rotation the system currently supports, and it is right for
a compromise and wrong for hygiene — unchanged from what BYOK.6 recorded.

---

## 6. Zero-secret residue and no-project-key-fallback

**No secret appears in any artifact this loop produced or read.** Values, digests, key
lengths and fingerprint bodies were kept out of every report, every commit and every
console line; comparisons were performed and only booleans emitted. `.env.local` and
`.env.test.local` are git-ignored and untracked, and nothing here records anything about
their contents beyond presence and mismatch.

* **`jobs.error` census, over the whole deployed table:** every distinct value is a
  member of the declared closed vocabulary; no undeclared value, no provider text, no
  runtime message, no excerpt of anything.
* **No project-key fallback, in any deployed runtime:** proven three ways — statically
  (0 executable references in the downloaded bundle), by absence (the name is not in the
  deployed secret store), and **behaviourally**, which is the strongest of the three: a
  job that could not read its owner's credential made no provider call and produced no
  `ai_usage_events` row. There was nothing else for it to use.
* **The owner has no identity bypass:** the resolution chain contains no identity
  comparison, no identity read from configuration and no hardcoded uuid — asserted, and
  now confirmed behaviourally, since the owner's job failed under exactly the same rule
  as a disposable account's would.

---

## 7. Requirement disposition

| Disposition | Count | Notes |
| --- | --- | --- |
| Executed and passed, previously blocked | 23 | 11 deployment-state properties (§1) + 12 deployed-worker cases (§3) |
| **Executed and FAILED** | **1** | owner cutover (OWNER-ASYNC / E1 async) |
| Executed and passed during the loss drill | 6 | §5 |
| Blocked, with the blocker named per item | 8 | §4 |
| Not executed because the code does not exist | 4 | two-key rotation window, §5 |
| Written, not drilled | 1 | compromise runbook |
| Deliberately refused as damaging to production | 1 | E3, §4 |

**BYOK cannot close.** One of its central claims — *"every AI capability works for the
owner on the owner's own credential"* — is currently false in the deployed environment,
and the acceptance record says so rather than deferring it.

---

## 8. The smallest owner action

Two steps, in this order. Nothing here needs a value to be pasted anywhere but into the
platforms that already hold them.

**Step 1 — make the two runtimes agree.** The Next.js runtime and the Supabase Edge
Function runtime of this environment must hold the **same three values, byte for byte**.
The linked project is the only shared environment, so the local `.env.local` is that
environment's Next.js runtime configuration. Either copy the three deployed values into
`.env.local`, or set the three Supabase secrets to the values `.env.local` already holds
— either direction is fine; they must simply match. Then confirm, without printing
anything:

```powershell
npm run byok:verify-runtime
```

It must print `IN PARITY` before going further. If a shell exported different values for
the process that saved the credential, note that this command checks the **file**, not a
running process — restart the dev server from a clean shell.

**Step 2 — re-enter the credential through Settings.** The stored ciphertext is
unrecoverable and must be replaced, not repaired. Sign in, open `/pt-BR/app/settings` or
`/en/app/settings`, and paste the OpenAI key into *Your OpenAI key*. **Not seeded from an
environment variable, not by SQL, not by script** — for the reason BYOK.5 gives: a seeded
credential would make the owner the one account that never proved the flow.

After those two steps the following become executable and none of them needs anything
further from the owner: E1 in full, E3, E5, BYOK.3's matrix cases and Settings journeys,
concurrent rotation, the two-user isolation matrix, and the capture lifecycle's
credentialed half.

---

## 9. What this report deliberately does not say

* It does not say the cutover succeeded. It says four of five conditions were met and the
  fifth was never checked because nothing existed to check it — and that now something
  does.
* It does not say BYOK's architecture is unproven. The architecture behaved correctly
  under a real fault, which is better evidence than a passing happy path.
* It does not treat the guard that caught the author's own new script as an obstacle.
  `scripts/byok-verify-runtime-parity.mjs` was refused by `BYOK-GUARD-001` on its first
  run for naming `OPENAI_API_KEY`; the resolution was an ADR and a classification
  (`ADR-072`), not a workaround that would have slipped the name past the control.
* It does not remove any historical limitation. §4 and §5 carry every item forward with
  its blocker named, and the prior acceptance records are amended by append, never edited.

---

## 10. Post-remediation, 2026-08-02 — the cutover succeeded. **Appended; nothing above is edited.**

The owner performed the two steps of §8: the three BYOK values were synchronized between
`.env.local` and the deployed Edge Function store, the dev server was restarted from a
clean shell, and the credential was **re-entered through the Settings product flow** —
not by SQL, not from an environment variable, not by script, not by migration.

Everything below was executed against the **deployed** project. Nothing is inferred from
the fact that the owner reported the steps done.

### What now passes that did not

| Case | Result | Evidence |
| --- | --- | --- |
| **RUNTIME-PARITY** | **PASS** | `npm run byok:verify-runtime` → `IN PARITY`, 5 pass / 0 fail / 0 unverifiable, including the digest-algorithm control and `OPENAI_API_KEY` absent from the deployed secrets. No value and no digest printed. |
| **OWNER-CREDENTIAL-OPENS-IN-NODE** (E1, crypto half) | **PASS** | The stored row was fetched read-only and opened with the Node runtime's `BYOK_MASTER_KEY` under the row's own AAD. Positive control round-tripped; negative control rejected a wrong AAD. Plaintext length observed, **value never read**. |
| **OWNER-ASYNC** — the owner's asynchronous AI on the owner's own credential | **PASS**, previously **FAILED** | A probe entry and `interpret_entry` job were created on the owner's account and drained by the unattended `pg_cron` tick. Job `completed`, attempts 1, `error` null; one interpretation persisted; `ai_usage_events` **8 → 10**. The probe entry and its rows were deleted; the two ledger rows are genuine usage and correctly retained. |
| **NO-PROJECT-KEY-IN-THE-NODE-ENVIRONMENT** | **PASS** | `.env.local` contains no `OPENAI_API_KEY`. The single substring match is `BYOK_VALIDATION_OPENAI_API_KEY`, the acceptance lane's key. There is nothing for a Node path to fall back **to**, independently of there being no expression that falls back. |
| **UNCREDENTIALED-DEPLOYED-ACCOUNT-IS-REFUSED** | **PASS** | A disposable account's `process_attachment` job: HTTP 500 `{"error":"Processing failed","code":"job_exhausted"}`, job `exhausted`, attempts **1**, `error = credential_required`, attachment `failed`, and **zero** `ai_usage_events`. |
| **CAPTURE-LIFECYCLE-WITHOUT-A-CREDENTIAL** (BYOK-CAPTURE-001/002/003) | **PASS** | An uncredentialed capture returns a `saved` receipt, stores the entry in `awaiting_ai_configuration`, and creates **no job** — asserted in `scripts/remote-entry-processing-smoke.mjs`. |
| **UNOPENABLE-CREDENTIAL-FAILS-CLOSED-AND-BILLS-NOTHING** | **PASS** | A synthetic ciphertext: job `exhausted`, attempts 1, `error = credential_unreadable`, entry returned to `awaiting_ai_configuration`, zero ledger rows. The master-key-loss contract, now asserted on the path that used to assert a project-key success. |
| **E5 — remote smoke after cutover** | **PASS** | `npm run test:remote` green. `test:remote:jobs`, `test:remote:interpretations` and `test:remote:product-events` green unchanged. |
| **ZERO-RESIDUE-IN-PRODUCT-DATA** | **PASS** | Six readable product tables censused (`entries`, `entry_interpretations`, `audit_logs`, `ai_usage_events`, `credential_validation_attempts`, `notifications`): **0** credential-shaped matches. `jobs.error`: **0** distinct values. `entries.processing_error`: **0** distinct values. `product_events` is **not readable by `service_role`** — reported rather than skipped silently, and correct: it is written only through its RPC. |

### Two remote scripts were asserting pre-BYOK behaviour, and both are now inverted

Neither was a regression. Both fixtures predate BYOK and were asserting that a deployed
account **without** a credential still gets AI — which is exactly the fallback BYOK.3
deleted.

* `remote-supabase-smoke.mjs` invoked the deployed worker for a disposable user and
  required `attachment ready`, `job completed`, one `file_analysis` ledger row. It now
  requires the refusal: a declared code, one attempt, and **no ledger row**. The
  credentialed half of that path is proven by **OWNER-ASYNC** instead, on the only
  account in this environment that can hold a credential.
* `remote-entry-processing-smoke.mjs` assumed every capture enqueues a job. It now
  asserts both halves of the credential-gated lifecycle, seeds a synthetic credential for
  the queue mechanics — the same technique `supabase/tests/byok_awaiting_and_drain.sql`
  already uses — asserts the fail-closed contract at the worker, and then **stops with a
  named BLOCKED notice** rather than failing as though something had broken.

### What is still blocked, and by exactly one thing

Unchanged in kind from §4, reduced in scope. Every remaining item needs **a
provider-accepted OpenAI key used as a product credential**, and no such key is available
to this loop: `BYOK_VALIDATION_OPENAI_API_KEY` is explicitly not one (`ADR-070`,
`TODO.md`).

| Blocked item | What would unblock it |
| --- | --- |
| Two-user isolation with **real** credentials | Two disposable provider-accepted keys the loop is authorized to spend as product credentials. |
| **Concurrent rotation** (C10) | Two such keys, to rotate between. Not simulated, not claimed. |
| **Settings journeys**, desktop and Pixel 7, both locales (C11) | One such key: every save/validate/rotate step makes a real provider call. |
| **E3 — removing and re-adding the owner's credential** | Nothing. It is **refused on purpose**, unchanged from §14 of the handoff: removal is easy, restoring requires the owner to re-enter a key this loop must never see or request, and getting it wrong costs the owner a working credential. The equivalent property is proven on disposable accounts (**REMOVAL-\*** rows in §3, and the refusal rows above). |
| **Two-key bounded rotation window** (BYOK.6's last code deliverable) | Authorization to build it. `ADR-069`'s reasoning no longer applies in the same form — the credential path now works — but the deliverable is code that does not exist, and it is not started unasked. |
| End-to-end interpretation inside `remote-entry-processing-smoke.mjs` | A decryptable **and** provider-accepted credential on a disposable account. |

**BYOK is therefore still not closed.** What changed is which claim is false: no central
runtime claim is false any more, and the remainder is blocked on an external credential
rather than on a broken deployment.

---

## 11. The closeout, 2026-08-02 — every remaining gate executed. **Appended; nothing above is edited.**

The owner provisioned two disposable, low-limit OpenAI **product** credentials
(`BYOK_TEST_USER_A_OPENAI_API_KEY`, `BYOK_TEST_USER_B_OPENAI_API_KEY`, in
`.env.local` and nowhere else). That cleared the single blocker §10 named, and
every item it listed as blocked has now been executed against the deployment
with real provider calls.

Preflight, reported as counts only: **A present, B present, distinct,
repository matches: zero** across 1047 tracked files, `.env.local` ignored and
untracked. No value, prefix, length or digest was printed at any point.

### What now passes

| Gate | Result | Evidence |
| --- | --- | --- |
| **C11 — Settings journeys** | **PASS 4/4** | desktop + Pixel 7 × pt-BR + English, `e2e/byok-settings-journey.spec.ts`. Gated state, live validation, metadata-only configured state, invalid candidate preserving the active credential, replacement, removal with confirmation, immediate gating, reconfiguration, no reveal control, no prefill, both honesty disclosures, keyboard order and no horizontal overflow. |
| **Two-user isolation, real credentials** | **PASS** | `e2e/byok-isolation-and-rotation.spec.ts`. Sync: each session's `resolve_own_ai_credential` returns its own envelope, the RPC takes no user id, A's cross-read and cross-write of B's row both return nothing. Async: `resolve_job_ai_credential` follows the **job's** owner — a job of B's naming an entry of A's resolves B's credential — both jobs completed on the deployed worker and each ledger row is attributed to its own owner. |
| **C10 — genuine concurrent rotation** | **PASS** | Two tabs loaded from the same row, therefore the same staleness witness, submitted with `Promise.all`. Exactly one `validated.`, exactly one `Something else changed at the same time`, one row, one active ciphertext, both `ciphertext` and `iv` non-null, and no candidate value in `credential_validation_attempts` or `audit_logs`. |
| **Removal, queued jobs, capture lifecycle** | **PASS** | `e2e/byok-removal-jobs-capture.spec.ts`. Uncredentialed capture → `awaiting_ai_configuration`, zero jobs. Activating a key starts nothing. Explicit processing queues exactly one and does not duplicate on a second press. A job queued before a removal stays `pending`, attempts **0**, across a full drain window, and the ledger does not move. Reconfiguration recovers that same job. A bystander account with its own credential is untouched throughout. |
| **Bounded processing** | **PASS** | 26 pending, 25 queued, the *partial* message rendered — "done" after 25 of 26 would be false by omission. |
| **Two-key rotation window** | **BUILT and DRILLED** | Disposable material only; `--status` also run read-only against the deployment (`remaining: 0` at version 1). |
| **Fixture cleanup** | **PASS, with non-vacuous controls** | Zero BYOK fixture users remain; **zero orphaned rows** across nine owned tables. Positive control: the scanner sees 9 rows for a live account, so the zero is not vacuous. Negative control: the owner's credential survives, `active`, ciphertext intact. |

### How isolation was evidenced, and why not by "both calls succeeded"

Two valid keys both work, so a product that used A's key for B's request would
pass a "both succeeded" test. A **provider-side** distinguisher was looked for
and **measured absent**: both credentials return HTTP 200 from `GET /v1/models`,
expose no `openai-organization` or `openai-project` response header, and see an
identical 131-model list. Nothing in a provider response says which key asked.

Identity is therefore evidenced cryptographically, which is stronger. The stored
fingerprint is `HMAC(pepper, plaintext)` truncated — a function of the key and
of nothing else — so two distinct keys have two distinct fingerprints, and A's
row carrying A's fingerprint proves whose key is in whose row without reading
either. The resolvers then prove each path reaches only its own row. Neither
half is "it worked".

### Three product defects the acceptance lane found

None was findable by unit tests, and each is fixed with a regression test.

1. **`formatFingerprint` had no production consumer.** The parse-don't-trust
   guard shipped with BYOK.1 — a stored value outside the closed shape renders
   as `unknown` rather than being echoed — and the panel rendered the stored
   column directly. The guarantee was written and not in force.
2. **The panel reported the wrong action.** `useActionState` retains its result
   forever, so after any successful save a later **removal** kept showing "Key
   replaced and validated" beside a status reading "No key configured".
3. **"Key replaced" after a removal.** The staleness witness drives the
   mechanism correctly, but it was also picking the message, so a user who
   pressed a button labelled *Save key* was told the key had been *replaced*.

### What remains, and it is not a gate

* **The production master-key rotation has never been run** — an
  owner-authorised key change. The code is built and drilled; there is no undo.
* **`BYOK-OPERATIONS` (6 requirements) is not built** — no operator dashboard or
  alerting. Named, not counted as delivered.
* **Six orphaned storage objects from 2026-07-16** predate this work: database
  rows cascade on account deletion, storage objects do not. Signup Hardening's
  problem, recorded here because this sweep is what found it.
* **Three keys should be revoked** at platform.openai.com: the validation key
  and the two disposable product credentials. Outside the implementer's
  administrative boundary.

Full requirement accounting, including the 47 untraced ids and their
disposition: `docs/reports/BYOK_TRACEABILITY_MATRIX.md`.

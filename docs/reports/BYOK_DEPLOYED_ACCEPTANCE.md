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

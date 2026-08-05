# BYOK — PRD

**Revision 1** · 2026-07-31 · Baseline `main` `a745011`, parity `202607310064`.

**Status — AWAITING OWNER APPROVAL. Not authorized for implementation.**

- **Architectural basis** — [`reports/BYOK_SECURITY_DEFINITION.md`](./reports/byok/BYOK_SECURITY_DEFINITION.md), accepted, with owner decisions BYOK-DEC-1 … BYOK-DEC-11.
- **Position in the roadmap** — second, after Entity Graph Completion, before signup hardening and Phase 2G.
- **Requirement prefix** — `BYOK-`.
- **Separation** — separate branches, separate commits, separate PRs from Entity Graph Completion. No shared branch at any point.

> **Standing context, restated because it governs every requirement below.** Hosted signup
> was measured on 2026-07-31: **`disable_signup: false`** — open, with email confirmation
> required. Per the owner's instruction this is closed immediately and independently.
> **BYOK is not a mitigation for a currently open signup path**, and nothing in this PRD may
> be cited as one.

---

## 1. Objective

> **Every AI-backed operation runs on the credential of the operation's authoritative owner,
> resolved structurally, decrypted only in trusted runtimes — and the project-level
> `OPENAI_API_KEY` serves no deployed user path, including the owner's.**

## 2. Requirement families

`BYOK-SCHEMA` · `BYOK-CRYPTO` · `BYOK-MASTER` · `BYOK-FINGERPRINT` · `BYOK-RESOLVER` ·
`BYOK-ADAPTER` · `BYOK-GUARD` · `BYOK-LIFECYCLE` · `BYOK-VALIDATE` · `BYOK-JOBS` ·
`BYOK-CAPTURE` · `BYOK-USAGE` · `BYOK-QUOTA` · `BYOK-DELETE` · `BYOK-COPY` ·
`BYOK-OPERATIONS`

---

## 3. BYOK-SCHEMA — the credential table

| ID | Requirement |
| --- | --- |
| **BYOK-SCHEMA-001** | One table, `public.user_ai_credentials`. **One row per user** — `user_id uuid primary key references auth.users(id) on delete cascade`. A primary key rather than a unique index, so "one active credential per user" (BYOK-DEC-3) is structural. |
| **BYOK-SCHEMA-002** | Columns: `user_id`, `provider text not null default 'openai'`, `status text not null`, `ciphertext bytea`, `iv bytea`, `key_version smallint`, `fingerprint text`, `validated_at timestamptz`, `last_failure_code text`, `created_at`, `updated_at`. **No plaintext column exists, in any form, under any name.** |
| **BYOK-SCHEMA-003** | `status` is a CHECK over a closed set: `active`, `invalid`, `removed`. `active` requires `ciphertext`, `iv`, `key_version`, `fingerprint` and `validated_at` all non-null; `removed` requires `ciphertext` and `iv` **null**. Enforced by a table CHECK, not by application code. |
| **BYOK-SCHEMA-004** | RLS **enabled and forced**, with own-row `select` and `update` policies for `authenticated`. **No `delete` policy and no `delete` grant** — removal is a status transition that nulls the ciphertext (BYOK-LIFECYCLE-006), and row deletion happens only by `auth.users` cascade. |
| **BYOK-SCHEMA-005** | `grant select, insert, update on public.user_ai_credentials to authenticated`; `revoke all from anon`; no `delete` to any client role. Asserted by pgTAP in both directions. |
| **BYOK-SCHEMA-006** | `last_failure_code` is a closed vocabulary (`invalid_key`, `insufficient_quota`, `rate_limited`, `revoked`, `unknown`) and **never** stores a provider message, a key substring, or any free text. |
| **BYOK-SCHEMA-007** | A separate `public.credential_validation_attempts` table records `(user_id, attempted_at, outcome)` for BYOK-VALIDATE-004's throttle. It stores **no key material and no fingerprint**, is forced-RLS owner-scoped, and is append-only to `authenticated`. |
| **BYOK-SCHEMA-008** | `entries.status` gains one literal meaning *awaiting AI configuration* (BYOK-CAPTURE-002). The constraint is replaced by `alter table … drop constraint … ; add constraint …`, the precedent already set at `202607170020:3-11`. |
| **BYOK-SCHEMA-009** | The migration adds **no** column to `ai_usage_events`, `jobs`, `profiles`, `agent_preferences`, `audit_logs` or `product_events`. |

## 4. BYOK-CRYPTO — the envelope

| ID | Requirement |
| --- | --- |
| **BYOK-CRYPTO-001** | **AES-256-GCM.** The master key is 32 bytes. Implemented through Web Crypto (`crypto.subtle`), which exists in both Node 22 and Deno — one algorithm, one shape, two runtimes. |
| **BYOK-CRYPTO-002** | The IV is **96 bits (12 bytes), cryptographically random, generated fresh for every encryption**. An IV is never reused with the same key. Rotation writes a new IV. |
| **BYOK-CRYPTO-003** | The authentication tag is **128 bits**. Web Crypto appends it to the ciphertext; the stored `ciphertext` column holds `ciphertext‖tag` as one value and the two are never split. |
| **BYOK-CRYPTO-004** | **Additional Authenticated Data (AAD) binds the ciphertext to its owner.** AAD is the canonical byte encoding of `user_id ‖ key_version ‖ provider`. A ciphertext row copied into another user's row **fails authentication and cannot be decrypted** — cross-user substitution becomes a cryptographic failure, not merely an RLS-prevented one. |
| **BYOK-CRYPTO-005** | Decryption failure is **terminal and silent about cause**: a declared `credential_unreadable` outcome. It never reports whether the failure was tag, key, or AAD, and never echoes bytes. |
| **BYOK-CRYPTO-006** | Encryption and decryption exist in exactly one module per runtime, and nowhere else. No inline `crypto.subtle` call outside those two modules — asserted by BYOK-GUARD-005. |
| **BYOK-CRYPTO-007** | Plaintext key material exists **only** as a local variable inside the encrypt/decrypt boundary and the provider constructor. It is never assigned to an object field, never returned from a Server Action, never placed in React state beyond the submitting form's own lifetime, and never awaited across a boundary that could serialize it. |

## 5. BYOK-MASTER — master-key requirements

| ID | Requirement |
| --- | --- |
| **BYOK-MASTER-001** | `BYOK_MASTER_KEY` exists **separately in every environment**: production, preview, test and local. The four values **must differ**. A shared value across environments is a deploy-blocking defect. |
| **BYOK-MASTER-002** | Generated from cryptographically secure random bytes (32 bytes, base64-encoded for transport). Never derived from a password, a project id, or any guessable material. |
| **BYOK-MASTER-003** | **No raw value may appear** in source, `.env.example`, documentation, examples, screenshots, CI logs, PR bodies, slice reports, or any artifact in this repository. `.env.example` carries the name and an empty value only. |
| **BYOK-MASTER-004** | **The master key must never enter the database** — not as a column, not in a Vault secret, not in a function body, not in a migration comment. Asserted by a chain-wide scan in CI. |
| **BYOK-MASTER-005** | The application **fails to start** if `BYOK_MASTER_KEY` is absent or is not a valid 32-byte value, in both runtimes. It never falls back, never generates one, never warns and continues. |
| **BYOK-MASTER-006** | **Loss of the master key makes every stored credential permanently unrecoverable.** This is stated in the runbook, in `SECURITY.md`, and in the onboarding copy's honesty section — not discovered during an incident. |
| **BYOK-MASTER-007** | **Recovery procedure after loss:** set every row to `status = 'removed'` with `ciphertext`/`iv` nulled, notify users, and require re-entry. There is no decryption path and no partial recovery. The procedure is scripted and tested against a disposable project before it is needed. |
| **BYOK-MASTER-008** | **Compromise procedure:** rotate `BYOK_MASTER_KEY` **and** require every user to rotate their OpenAI key, because a compromised master key plus a database copy yields plaintext. Both halves are mandatory; rotating only the master key is insufficient and the runbook says so. |
| **BYOK-MASTER-009** | Every ciphertext row carries `key_version`. The current master key's version is a runtime constant. |
| **BYOK-MASTER-010** | **Master-key rotation is a bounded migration window.** During it, the runtime may hold exactly two keys — current and immediately-previous — and re-encrypts rows lazily on next resolution plus eagerly by a one-off script. **No indefinite multi-key fallback.** The window has a declared maximum duration, after which any row still on the old version is set to `invalid` and the user is asked to re-enter. |
| **BYOK-MASTER-011** | Rollout and rollback for a master-key rotation are documented before the first rotation is attempted, including the state of in-flight jobs during the window. |
| **BYOK-MASTER-012** | A CI guard fails the build if `BYOK_MASTER_KEY` (or the fingerprint pepper) is read anywhere except the single crypto module of each runtime. |

## 6. BYOK-FINGERPRINT — the non-secret display value

| ID | Requirement |
| --- | --- |
| **BYOK-FINGERPRINT-001** | A **separate** secret, `BYOK_FINGERPRINT_PEPPER`, distinct from `BYOK_MASTER_KEY`. **The encryption master key is never reused as the pepper**, so a fingerprint leak can never assist decryption. Both are subject to BYOK-MASTER-001…005 independently. |
| **BYOK-FINGERPRINT-002** | The fingerprint is `HMAC-SHA256(pepper, key)` truncated to 6 hex characters, displayed with the provider-safe prefix — e.g. `sk-proj · a3f9c1`. |
| **BYOK-FINGERPRINT-003** | **No substring of the API key is persisted or displayed**, including the last four characters (BYOK-DEC-8). The tail carries the entropy and is the part a screenshot or support transcript most usefully captures. |
| **BYOK-FINGERPRINT-004** | The provider-safe prefix is derived from a **closed allowlist** of known prefixes (`sk-proj`, `sk-`, …) with an `unknown` fallback. It is never a slice of arbitrary input. |
| **BYOK-FINGERPRINT-005** | The fingerprint is stored on `user_ai_credentials` only. It is **never** written to `ai_usage_events`, `audit_logs`, `product_events`, `jobs`, or any log line. |

## 7. BYOK-RESOLVER — structural owner derivation

| ID | Requirement |
| --- | --- |
| **BYOK-RESOLVER-001** | Two RPCs, both `SECURITY DEFINER` with `set search_path = ''`. **Neither accepts a `user_id` argument.** The absence is asserted against `pg_proc.proargnames`, so a future signature change that adds one fails the suite. |
| **BYOK-RESOLVER-002** | **Synchronous:** `public.resolve_own_ai_credential()` derives the owner from `auth.uid()`; a null identity raises `42501`. Granted to `authenticated`; `public`/`anon` revoked. |
| **BYOK-RESOLVER-003** | **Asynchronous:** `public.resolve_job_ai_credential(p_job_id uuid)` derives the owner from `jobs.user_id` of that row. Granted to `service_role` only; `authenticated`, `anon` and `public` revoked, asserted in both directions. |
| **BYOK-RESOLVER-004** | Both return **ciphertext**, `iv`, `key_version`, `status` and `provider`. **Neither returns plaintext**, and no SQL in the chain decrypts anything. |
| **BYOK-RESOLVER-005** | A resolver returns a row only when `status = 'active'`. `invalid`, `removed` and absent are one outcome to the caller — `credential_unavailable` — so the resolver is not an oracle for another account's configuration state. |
| **BYOK-RESOLVER-006** | `resolve_job_ai_credential` against a job the caller may not see, or a non-existent job, raises the **same** `P0002` — the `apply_reminder_command_v1` precedent, so the function cannot probe row existence. |
| **BYOK-RESOLVER-007** | **Accepted residual, recorded rather than hidden:** a user may call `resolve_own_ai_credential()` directly through PostgREST with their own token and receive their own ciphertext. This is harmless — it is their own secret, they typed it, and it is undecryptable without the master key, which is not in the database. BYOK-CRYPTO-004's AAD additionally makes it useless in any other account. |
| **BYOK-RESOLVER-008** | No job payload contains a credential, a credential reference, a fingerprint, or any client-chosen selector. The job carries what it always carried; the owner is read from the row. |

## 8. BYOK-ADAPTER — the two runtimes

| ID | Requirement |
| --- | --- |
| **BYOK-ADAPTER-001** | **Node:** one `server-only` module resolves, decrypts and constructs the provider. `getAIProvider()`'s signature changes so a credential is **required** — the environment fallback at `openai-provider.ts:59` is deleted, not disabled. |
| **BYOK-ADAPTER-002** | `OpenAIProvider`'s constructor takes `apiKey: string` as a **required** parameter. Omitting it is a type error; passing an empty value throws. |
| **BYOK-ADAPTER-003** | **Deno:** a mirrored adapter under `supabase/functions/_shared/`, because `src/lib/ai` cannot be imported into Deno (`server-only` throws outside a bundler, `SECURITY.md:23`). |
| **BYOK-ADAPTER-004** | **Parity lock**: a test fails the build when the Node and Deno adapters diverge in envelope format, AAD composition, status handling or failure vocabulary — the `extraction-parity.test.ts` / `deno-parity.test.ts` mechanism. A drifting adapter is a fallback waiting to happen. |
| **BYOK-ADAPTER-005** | `process-jobs/index.ts:11`'s `Deno.env.get("OPENAI_API_KEY")` read and its 503 branch are **deleted**. The worker no longer has a process-wide key; the key parameter threaded through `dispatch.ts` → `entry.ts`/`attachment.ts` becomes a per-job resolved credential. |
| **BYOK-ADAPTER-006** | Plaintext is carried by a branded `Secret` type whose `toJSON`, `toString` and `inspect` **throw**. Only an explicit `.expose()` at the provider call site yields the string. |
| **BYOK-ADAPTER-007** | `credential_unavailable` and `credential_unreadable` are **declared outcomes** in the existing result vocabularies, localized, never thrown as raw errors, and distinguishable by the caller from provider, domain and infrastructure failure. |

## 9. BYOK-GUARD — the five CI guards

| ID | Requirement |
| --- | --- |
| **BYOK-GUARD-001** | **Project-key import guard.** The build fails if any module under `src/features/**` or `src/lib/ai/**`, or either deployed Edge Function entrypoint, references `OPENAI_API_KEY`, outside an exact allowlist. Compared in **both directions**, so an allowlist naming a non-existent file also fails — the `direct-write-guard.test.ts` shape. |
| **BYOK-GUARD-002** | **No-default-credential guard.** A test asserts `OpenAIProvider` cannot be constructed without an explicit credential, and that `getAIProvider` has no environment-reading branch. |
| **BYOK-GUARD-003** | **Worker owner-resolution guard.** A Deno test asserts every job handler resolves a credential from the claimed row's owner before any provider call. |
| **BYOK-GUARD-004** | **Secret-serialization guard.** Every declared result shape, job payload, audit payload, product-event payload and rendered prop is round-tripped and asserted free of key material; `Secret`'s serializers are asserted to throw. |
| **BYOK-GUARD-005** | **Crypto-locality and secret-locality guard.** `crypto.subtle`, `BYOK_MASTER_KEY` and `BYOK_FINGERPRINT_PEPPER` are readable only from the one crypto module per runtime. |
| **BYOK-GUARD-006** | The allowlist for BYOK-GUARD-001 contains **only** the classified exceptions of BYOK-DEC-2: local development configuration, mocked or opt-in tests, and `scripts/remote-*.mjs`. **No deployed user path appears in it, ever.** Adding an entry requires an ADR. |

## 10. BYOK-LIFECYCLE — statuses and Settings

| ID | Requirement |
| --- | --- |
| **BYOK-LIFECYCLE-001** | Statuses: `active`, `invalid`, `removed`, plus *absent* (no row). AI gating treats `invalid`, `removed` and absent identically. |
| **BYOK-LIFECYCLE-002** | Settings shows only **metadata**: `configured`, `provider`, `fingerprint`, `validatedAt`, `status`. **The full key is never returned by any read path.** |
| **BYOK-LIFECYCLE-003** | **There is no "show key" action**, no reveal control, and no endpoint that returns plaintext. |
| **BYOK-LIFECYCLE-004** | The input is `type="password"`, `autoComplete="off"`, **never prefilled with a stored value**, and cleared from component state on submit and on unmount. |
| **BYOK-LIFECYCLE-005** | **Replace** follows BYOK-VALIDATE and BYOK-ROTATE below. |
| **BYOK-LIFECYCLE-006** | **Remove** sets `status = 'removed'` and nulls `ciphertext` and `iv` **in one statement**. The ciphertext is destroyed, not orphaned. |
| **BYOK-LIFECYCLE-007** | **Test** re-validates the stored credential without revealing it, updating `status`, `validated_at` and `last_failure_code`. |
| **BYOK-LIFECYCLE-008** | Onboarding explains why a key is required, what it costs the user, and what the product can and cannot promise (BYOK-COPY). It never blocks the deterministic product. |
| **BYOK-LIFECYCLE-009** | Every AI surface renders a **gated state** — a declared `credential_required` outcome with a localized explanation and a link to Settings — never a broken control or a silent no-op. |

## 11. BYOK-VALIDATE — validation and its hardening

| ID | Requirement |
| --- | --- |
| **BYOK-VALIDATE-001** | Shape validation precedes any network call and **never logs the value**. A Zod issue may name the field; it may never echo the input. |
| **BYOK-VALIDATE-002** | Live validation is **one minimal request** — the cheapest available provider call — with `maxRetries: 0` and a short timeout. |
| **BYOK-VALIDATE-003** | Provider errors are mapped to `BYOK-SCHEMA-006`'s closed vocabulary. **The provider error object is never re-thrown, never logged whole, and never serialized into a result.** |
| **BYOK-VALIDATE-004** | **Validation is throttled per user and per IP**, with a hard daily ceiling, recorded in `credential_validation_attempts`. This is the T-16 control: without it the product is an oracle for testing stolen OpenAI keys — a capability it does not have today and must not acquire. |
| **BYOK-VALIDATE-005** | Validation requires an authenticated session. There is no anonymous validation path. |
| **BYOK-VALIDATE-006** | A validation attempt records outcome only — never the key, never the fingerprint, never the provider message. |
| **BYOK-VALIDATE-007** | The credential becomes `active` **only** after a successful live validation. A key that fails validation is never stored in any form. |
| **BYOK-ROTATE-001** | Rotation validates the candidate **first**. On failure, the existing credential is **untouched and still active**, asserted by test. |
| **BYOK-ROTATE-002** | On success, one transaction overwrites `ciphertext`, `iv`, `key_version`, `fingerprint`, `validated_at` and `status` **in place**. One row per user means there is no superseded ciphertext to leak or forget. |
| **BYOK-ROTATE-003** | Rotation returns metadata only and writes an `audit_logs` row recording that a rotation occurred, with **no key material and no fingerprint**. |
| **BYOK-ROTATE-004** | Concurrent rotations are serialized by a row lock. The losing attempt receives a declared conflict outcome, never a partial write. |

## 12. BYOK-JOBS — asynchronous behaviour

| ID | Requirement |
| --- | --- |
| **BYOK-JOBS-001** | **Credentials resolve at execution time, never at enqueue time** (BYOK-DEC-6). No plaintext is pinned; no superseded ciphertext is retained. |
| **BYOK-JOBS-002** | `claim_next_entry_interpretation_job(text, integer)` gains a `not exists` predicate so the unattended drain **does not select jobs whose owner has no active credential**. `create or replace`; signature, grants and lease semantics unchanged. |
| **BYOK-JOBS-003** | A job that reaches execution with no active credential moves to a **declared terminal state** and does **not** consume a retry. Configuration failure is not a transient failure, and this codebase has already been burned by retries spent on errors retrying cannot fix. |
| **BYOK-JOBS-004** | Failure classes are distinguishable by declared code and have different retry policies: **terminal, no retry** — `credential_unavailable`, `credential_unreadable`, `invalid_key`, `revoked`; **retry with backoff** — `rate_limited`, provider unavailable, transport; **owner decision (BYOK-DEC-10 answered as terminal)** — `insufficient_quota`. |
| **BYOK-JOBS-005** | **No secret and no provider message reaches `jobs.error`.** `jobs.error` is still rendered verbatim on the Jobs page (`TODO.md:209`), and this repository has already leaked a provider-derived message into it once (`SECURITY.md:34`). Only closed-vocabulary codes are written. |
| **BYOK-JOBS-006** | Removing a credential blocks queued work at execution, proven by an executed test — enqueue, remove, run, assert no provider call. |
| **BYOK-JOBS-007** | Attachment jobs follow the same contract. They have no unattended consumer, so the gate is at direct invocation. |
| **BYOK-JOBS-008** | The heartbeat is unaffected — it performs no AI. Asserted, so a future AI addition to it cannot slip past this contract. |

## 13. BYOK-CAPTURE — capture without a key

| ID | Requirement |
| --- | --- |
| **BYOK-CAPTURE-001** | Capture **succeeds** and the raw entry is stored (BYOK-DEC-5). Refusing would lose the user's own words to a configuration state. |
| **BYOK-CAPTURE-002** | The entry is marked with the explicit *awaiting AI configuration* status (BYOK-SCHEMA-008). **It is never reported as `processing`.** Inbox, Home and the entry detail render the honest state with a link to Settings. |
| **BYOK-CAPTURE-003** | **No interpretation job is enqueued.** `capture_entry_async` writes the entry without the job when no active credential exists — one transaction, same atomicity guarantee. |
| **BYOK-CAPTURE-004** | After a credential becomes active, the user is **offered** a bounded, explicit action to interpret pending entries, routed through the deployed `enqueue_entry_reprocessing` path. |
| **BYOK-CAPTURE-005** | **Bulk interpretation never happens automatically on key activation.** Spending the user's money without an explicit act is the same class of error as an unconfirmed AI write. |
| **BYOK-CAPTURE-006** | The pending-entry action is bounded (a stated maximum per invocation) and reports exactly how many entries it enqueued. |

## 14. BYOK-USAGE — accounting

| ID | Requirement |
| --- | --- |
| **BYOK-USAGE-001** | `ai_usage_events` continues to record every successful provider call, before any dependent domain write, unchanged. |
| **BYOK-USAGE-002** | Cost is presented as **estimated** in every surface that shows it, with a sentence naming the user's own OpenAI dashboard as authoritative (BYOK-DEC-9). The local pricing catalog is never presented as the user's bill. |
| **BYOK-USAGE-003** | **No credential fingerprint and no `key_version` is written to `ai_usage_events`** (BYOK-DEC-9). If a later operational need is proven, it is a separate decision with its own ADR. |
| **BYOK-USAGE-004** | `recordAIUsage` **remains fail-open**. Its pre-BYOK risk (`PHASE_2G_DEFINITION.md` R10) was that it was a hole in a spend cap; under BYOK-DEC-9 no ceiling is enforcing, so a lost row costs accuracy, not control. **This requirement's justification is void if any ceiling ever becomes enforcing**, and that dependency is recorded here so the change cannot be made without revisiting it. |
| **BYOK-USAGE-005** | The Costs surface distinguishes the four purposes the definition study separated: it reports the **user's own estimated use**, and makes no claim about protecting anyone's budget. |

## 15. BYOK-QUOTA — infrastructure controls stay separate

| ID | Requirement |
| --- | --- |
| **BYOK-QUOTA-001** | **BYOK does not implement infrastructure quotas, and does not claim to.** Signup, entries, queued jobs, concurrency, input size, uploads, storage, abuse and suspension are owned by the signup-hardening initiative (BYOK-DEC-10). |
| **BYOK-QUOTA-002** | Credential accounting and infrastructure accounting are **separate mechanisms**. A user with a valid key is not exempt from any infrastructure limit, and the credential state is never consulted as a quota. |
| **BYOK-QUOTA-003** | `max_output_tokens` is set on **every** provider operation, not only the task-command path. Under BYOK this protects the **user's** wallet and bounds worst-case latency. It is the one control moved here from `PHASE_2G_DEFINITION.md` §9. |
| **BYOK-QUOTA-004** | BYOK-VALIDATE-004's throttle is the **only** rate limit this initiative ships, because it guards a surface this initiative creates. |

## 16. BYOK-DELETE — deletion and retention

| ID | Requirement |
| --- | --- |
| **BYOK-DELETE-001** | `user_id references auth.users(id) on delete cascade` removes the credential row when the auth user is deleted. Asserted by executed test, not by reading the constraint. |
| **BYOK-DELETE-002** | **An account-deletion path does not exist in this repository** (`SECURITY.md:57`, verified). BYOK **does not build it**; it is named as a dependency of the signup-hardening initiative and as a **prerequisite for the first non-owner account**. This PRD delivers the cascade and the residue verifier that such a path will need. |
| **BYOK-DELETE-003** | A **zero-secret residue verifier** proves, after a disposable user is deleted, that no credential row, no ciphertext and no validation-attempt row survives. Fail-closed, in the `verify-*-cleanup.mjs` family. |
| **BYOK-DELETE-004** | Deleted-account behaviour for **queued jobs** is asserted: `jobs.user_id` cascades, so the jobs disappear with the user. The drain must not observe a job whose owner is gone. |
| **BYOK-DELETE-005** | **Backups are named, not promised away.** Physical deletion is bounded by the platform's backup retention window. The copy states that removal is immediate in the live system and that backups age out on the provider's schedule (BYOK-COPY-004). |
| **BYOK-DELETE-006** | Audit evidence that a credential existed is retained as **metadata only** — an `audit_logs` row recording configuration, rotation or removal, with no key material and no fingerprint. |

## 17. BYOK-COPY — what the product may truthfully say

| ID | Requirement |
| --- | --- |
| **BYOK-COPY-001** | **Every claim is paired with the property and the test that backs it.** A claim with no test is not shipped. |
| **BYOK-COPY-002** | **These four claims are forbidden**, in Settings, onboarding, marketing and the privacy policy: "completely safe"; "nobody can ever access your key"; "only you can see it"; "we are technically unable to decrypt it". |
| **BYOK-COPY-003** | The copy **states explicitly** that trusted backend systems decrypt the key to perform synchronous **and background** AI operations (BYOK-DEC-11). The background half is the part users would not otherwise expect, and it is the reason the operator's access is unavoidable. |
| **BYOK-COPY-004** | The copy covers: encrypted at rest with the key held outside the database; never shown again; used only for operations on the user's own account; never used for another user; removable and replaceable at any time; **the user is billed by OpenAI directly**; backups age out on the provider's schedule. |
| **BYOK-COPY-005** | **Rotation guidance:** users are advised to create a **dedicated key with a spend limit** in their own OpenAI project rather than reusing a general-purpose key. |
| **BYOK-COPY-006** | **Incident disclosure:** a written commitment naming key rotation as the first user-facing remediation step, and naming both halves of BYOK-MASTER-008. |
| **BYOK-COPY-007** | All copy lives in typed `copy.ts` modules, both locales, with no new inline locale ternaries. |

## 18. BYOK-OPERATIONS — closeout

| ID | Requirement |
| --- | --- |
| **BYOK-OPERATIONS-001** | A **complete cross-user isolation matrix** is executed, not described: two owners, both paths, every state (§20). |
| **BYOK-OPERATIONS-002** | The zero-secret residue verifier (BYOK-DELETE-003) runs in the closeout and exits 0. |
| **BYOK-OPERATIONS-003** | **Incident and rotation runbook** committed: master-key rotation, master-key loss, master-key compromise, pepper rotation, and the bounded-window rules of BYOK-MASTER-010. |
| **BYOK-OPERATIONS-004** | A fail-closed traceability generator produces a row per requirement and fails on PRD drift. |
| **BYOK-OPERATIONS-005** | `SECURITY.md` records the new boundary, the operator-decryption reality, the guard inventory, and the classified project-key exceptions. The existing line 59 ("BYOK com envelope encryption e rotação") moves from *required* to *delivered*, with its evidence. |
| **BYOK-OPERATIONS-006** | **Rollout gates** (§19) are stated as a checklist that must be proven, not scheduled. |

---

## 19. Rollout gates

| Gate | Before the owner's own account switches to BYOK | Before the first invited user | Before public signup |
| --- | --- | --- | --- |
| All BYOK guards green | **required** | required | required |
| Isolation matrix executed | **required** | required | required |
| Residue verifier exits 0 | **required** | required | required |
| Runbook committed | **required** | required | required |
| Hosted signup **closed** | **required — independent of this initiative** | n/a | replaced by the controls below |
| Account deletion exists | no | **required** | required |
| Admin suspension | no | **required** | required |
| Terms + privacy policy | no | **required** | required |
| Email confirmation | already on | required | required |
| CAPTCHA | no | recommended | **required** |
| Signup + key-validation throttling | validation throttle **required** | required | required |
| Infrastructure quotas | no | **required** | required |
| CSP without `unsafe-eval` | recommended | **required** | required |
| Error sink, cron dead-man, retention | recommended | **required** | required |
| PostgREST exposure review | recommended | **required** | required |
| Edge Function auth review | recommended | **required** | required |

**Public signup is a gate, not a step.** No date authorizes it; only a proven checklist does.

---

## 20. Cross-user isolation matrix (executed, not described)

| # | Scenario | Expected |
| --- | --- | --- |
| 1 | A saves key A; B saves key B | two rows, two fingerprints, two distinct ciphertexts |
| 2 | A's synchronous operation | uses key A |
| 3 | B's synchronous operation | uses key B |
| 4 | A calls the sync resolver | returns A's ciphertext only |
| 5 | A attempts to read B's row via PostgREST | zero rows — asserted **after** A's own positive read, so it cannot pass vacuously |
| 6 | A's ciphertext copied into B's row and decrypted | **fails** — AAD binding (BYOK-CRYPTO-004) |
| 7 | Worker resolves a job owned by A | returns A's credential |
| 8 | Worker given a job id owned by B | returns **B's** credential (the row's real owner) and the worker's reload-by-`id`-and-`user_id` yields nothing to act on |
| 9 | Worker given a non-existent job id | `P0002`, identical to the foreign-job response |
| 10 | `authenticated` calls `resolve_job_ai_credential` | denied — no grant, asserted in both directions |
| 11 | `anon` calls either resolver | denied, after a privileged positive control |
| 12 | A has no credential; A triggers any AI path | `credential_required`, **no provider call**, project key untouched |
| 13 | A's credential removed; queued job runs | terminal, no retry, no provider call |
| 14 | A's credential invalid; drain ticks | job not selected (BYOK-JOBS-002) |
| 15 | A rotates mid-flight | in-flight job completes on the credential it resolved; the next resolves the new one |
| 16 | A's failed rotation | old credential still active, asserted |
| 17 | A's account deleted | no credential row, no validation rows, no jobs — residue verifier exit 0 |
| 18 | Every declared result, job payload, audit row, product event and rendered prop | contains no key material |

---

## 21. Adversarial review of this PRD

Sixteen attacks, from the mandated list. **Six changed the document.**

### Changed the document

**1. "Master-key compromise."** The first draft's rotation story was "rotate the master
key". **Incomplete** — a compromised master key plus any database copy already yields
plaintext, so rotating the master key alone protects nothing already taken.
**BYOK-MASTER-008 now requires both halves**: rotate the master key *and* require every user
to rotate their OpenAI key. Stating only the first half would be the copy promising more
than the architecture delivers.

**2. "Cross-user resolution — RLS is your only isolation and it is code-adjacent."**
**Conceded, and it produced the strongest requirement in the PRD.** RLS does not protect
against a bug inside a `SECURITY DEFINER` body, and §4.1 of the definition study already
established the operator cannot be locked out. **BYOK-CRYPTO-004** adds AAD binding over
`user_id ‖ key_version ‖ provider`, so a ciphertext in the wrong row is **cryptographically
undecryptable**. Isolation stops being purely a predicate and becomes partly a property of
the ciphertext. Matrix case 6 proves it.

**3. "Stolen-key validation oracle."** The first draft throttled per user. **Insufficient** —
an attacker with many accounts is not per-user-limited. **BYOK-VALIDATE-004 now requires per
user *and* per IP with a hard daily ceiling**, plus `credential_validation_attempts` as its
substrate, and BYOK-VALIDATE-005 forbids an anonymous path.

**4. "Account deletion leaves an orphan secret."** The cascade handles the row — but the
attack exposed that **there is no account-deletion path at all**. The draft implied BYOK
would satisfy requirement 10 of the owner's proposal. It cannot. **BYOK-DELETE-002 now says
so explicitly**, names the dependency, and scopes BYOK to delivering the cascade and the
residue verifier that a future deletion path will need.

**5. "Inability to recover after master-key loss."** The draft named loss as a consequence.
**BYOK-MASTER-007 now specifies the executable procedure** — mass `removed`, notify,
re-entry — and requires it to be **scripted and tested against a disposable project before
it is needed**, because a recovery procedure first executed during an incident is a guess.

**6. "Local-development shortcuts leaking into production."** The draft's allowlist was a
list. **BYOK-GUARD-006 now pins its contents to the classified exceptions of BYOK-DEC-2,
requires an ADR to add an entry, and BYOK-MASTER-001 requires the four environments' keys to
differ** — so a leaked dev key decrypts nothing in production. BYOK-MASTER-005's
fail-to-start closes the "it fell back to dev config" path.

### Answered without change

**7. "Forged job ids."** `resolve_job_ai_credential` derives from `jobs.user_id`, so a forged
id resolves *that job's real owner*; the worker then reloads the entry by `id` **and**
`user_id` (`SECURITY.md:20`) and has nothing to act on. BYOK-RESOLVER-006 makes foreign and
non-existent indistinguishable. Matrix cases 8 and 9.

**8. "Stale queued jobs."** Only a problem under credential pinning, which BYOK-JOBS-001
forbids for exactly this reason. Matrix cases 13–15.

**9. "Fallback reintroduction."** BYOK-GUARD-001's two-directional exact-set comparison plus
BYOK-ADAPTER-002's required parameter make reintroduction a type error and a build failure,
not a review miss. BYOK-ADAPTER-005 deletes the worker's process-wide read entirely.

**10. "Secret logging."** BYOK-VALIDATE-003 forbids re-throwing or whole-logging provider
errors; BYOK-SCHEMA-006 and BYOK-JOBS-005 confine persisted failure information to closed
vocabularies. BYOK-JOBS-005 exists because this repository has already leaked a
provider-derived message into `jobs.error`, which is still rendered verbatim.

**11. "Secret serialization."** BYOK-ADAPTER-006's branded `Secret` with throwing serializers
plus BYOK-GUARD-004's round-trip over every declared shape. Matrix case 18.

**12. "Rotation races."** BYOK-ROTATE-004's row lock; the loser gets a declared conflict.
BYOK-ROTATE-002's in-place single-transaction overwrite means there is no window with two
ciphertexts.

**13. "Database dump exposure."** The master key is not in the database (BYOK-MASTER-004,
chain-scanned in CI), so a dump yields ciphertext. This is the property that chose
application-layer encryption over Vault, and the residual — dump **plus** runtime env —
is stated in the definition study's T-8/T-9.

**14. "Operator-access wording."** BYOK-COPY-002 forbids four specific claims and
BYOK-COPY-003 requires the background-decryption sentence. BYOK-COPY-001 requires a test
behind every claim.

**15. "Deno/Node drift."** BYOK-ADAPTER-004's parity lock, in the mechanism this repository
already runs for the extraction schema and the three `_shared` modules.

**16. "This over-engineers a pre-MVP."** **Rejected on sequencing, not on principle.** BYOK
is not built for users who do not exist — it is built *before the first non-owner account*,
which is the moment its absence would be a defect. What would be over-engineering is
building infrastructure quotas here; BYOK-QUOTA-001 explicitly refuses them and hands them
to signup hardening.

---

## 22. Amendment P-1 — the per-IP throttle gets a column, and G-0.4 is satisfied

**Date: 2026-08-01. Status: accepted, owner decision. Append-only — every section above is
reproduced unchanged.** Recorded as `ADR-070`; the implementation plan carries the matching
Amendment A-2.

### P-1.1 — Why this amendment exists

`BYOK-SCHEMA-007` fixes `credential_validation_attempts` at `(user_id, attempted_at,
outcome)`. `BYOK-VALIDATE-004` requires throttling **per user *and per IP***, and the
implementation plan's task 3.8 puts that throttle over this table while budgeting BYOK.3
**zero** migrations.

**The three could not all hold.** BYOK.1 raised the conflict rather than resolving it —
inventing a column would have been an implementer expanding a governing document's schema
inside a branch — and implemented `BYOK-SCHEMA-007` exactly as written. The owner has now
decided.

### P-1.2 — `BYOK-SCHEMA-010`: `credential_validation_attempts.ip_hash`

`credential_validation_attempts` gains **one** column, `ip_hash`. `BYOK-SCHEMA-007`'s
three-column list is superseded **only** by this row; every other clause of it — no key
material, no fingerprint, forced RLS, owner-scoped, append-only to `authenticated` — stands
unchanged.

| ID | Requirement |
| --- | --- |
| **BYOK-SCHEMA-010** | `ip_hash` stores `HMAC-SHA256` over a **canonicalized** IP value. **The raw IP is never stored**, never logged, and never returned by any read path. |
| **BYOK-SCHEMA-011** | The HMAC key is a **new, independent secret**, `BYOK_RATE_LIMIT_PEPPER`. It is **never** `BYOK_MASTER_KEY` and **never** `BYOK_FINGERPRINT_PEPPER`: three secrets, three purposes, and no single compromise that yields two capabilities. It is subject to `BYOK-MASTER-001…005` independently, exactly as `BYOK-FINGERPRINT-001` makes the fingerprint pepper. |
| **BYOK-SCHEMA-012** | The pepper is **never displayed, logged or persisted** — not in a migration, not in `.env.example` beyond its name with an empty value, not in a test snapshot, not in a log line, and not in an error message that rejected it. |
| **BYOK-SCHEMA-013** | `ip_hash` is used **only** for validation throttling and abuse control. It is not a join key, not an analytics dimension, not a user-visible field, and it appears in no other table. |
| **BYOK-SCHEMA-014** | `credential_validation_attempts` has a **bounded retention period**, declared as a repository fact and enforced rather than described. An attempt record older than the window is not evidence; it is a log of somebody's network location that outlived its purpose. |
| **BYOK-SCHEMA-015** | Indexing supports **concurrency-safe daily ceilings per user and per IP**, and nothing beyond what those two queries require. An index is a retention surface as much as a performance one. |

### P-1.3 — Canonicalization, stated rather than assumed

`HMAC-SHA256` over an un-canonicalized IP string produces a different hash for values that
are the same address, which would silently defeat the ceiling it exists to enforce.
Canonicalization is therefore part of the contract, not an implementation detail:

- IPv4 in decimal-dotted form, no leading zeros;
- IPv6 lower-cased and compressed to its canonical form, with any IPv4-mapped prefix
  normalized to the IPv4 form;
- surrounding whitespace and any port suffix stripped;
- a value that does not parse as an address hashes as the literal `unparseable`, so a
  malformed forwarded header cannot mint unlimited distinct buckets.

### P-1.4 — G-0.4 is satisfied, with one thing still unreachable

The owner has provisioned a dedicated OpenAI project and API key for the opt-in validation
lane, held as **`BYOK_VALIDATION_OPENAI_API_KEY`** — deliberately not `OPENAI_API_KEY` — with
a USD 2 monthly budget, restricted model access, the lowest practical rate limits, and use
confined to the acceptance lane. **The gate's decision is made and its artifact exists.**

**What repository truth cannot yet confirm** is that the lane can *reach* it. Measured at
`0b62a5b`: no repository Actions secret of that name exists, and the name is absent from
`.env.local` and `.env.test.local`. `ADR-059` puts the opt-in lane's execution **locally**,
deliberately "without putting credentials in CI" — so the value has to be readable by a
local run. Until it is, the lane can be *written* but not *executed*, and `ADR-069` forbids
BYOK.3 closing with it unexercised. This is recorded now rather than discovered at BYOK.3's
acceptance gate; the one-line resolution is in `AUTONOMOUS_LOOP_HANDOFF.md` §7.

### P-1.5 — The migration budget

**Four becomes five.** BYOK.3's allocation moves from **0** to **1**, for this column, its
index and the retention mechanism. No other slice's allocation changes.

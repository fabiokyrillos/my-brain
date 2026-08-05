# BYOK.1 — Credential store and crypto core: acceptance record

**Date: 2026-08-01.** Governs `docs/initiatives/byok/BYOK_IMPLEMENTATION_PLAN.md` Slice BYOK.1, delivering
`BYOK-SCHEMA-001…007`, `BYOK-CRYPTO-001…007`, `BYOK-MASTER-001…012`,
`BYOK-FINGERPRINT-001…005`, `BYOK-GUARD-005`.

**One migration: `202608010065`.** Parity moves from `202607310064` by exactly one, the
allocation the plan budgets. No resolver, no adapter, no product surface, no provider
change, and `OPENAI_API_KEY` is untouched.

---

## 1. Acceptance gates

| Gate | Must show | Result |
| --- | --- | --- |
| **A1** | forced RLS; own-row policies; **no `delete` grant to any client role**, both directions; `anon` denied after a privileged positive control | **PASS** — `supabase/tests/byok_credential_store.sql`, sections 2–4 and 8–9. The DELETE refusal is executed against the caller's **own** row, so what refuses it is the missing privilege and not RLS |
| **A2** | the `status` CHECK rejects `active` without ciphertext and `removed` with ciphertext — executed, both directions | **PASS** — section 6, ten executed rejections and three executed acceptances, each rejection one column away from an accepted row |
| **A3** | encrypt→decrypt in Node, in Deno, and **cross-runtime** (G-0.2 re-executed in CI) | **PASS** — `crypto.test.ts` (Node), `byok-envelope.test.ts` (Deno), and `npm run byok:interop` now runs **in the `worker` CI job**, 7/7 both directions |
| **A4** | AAD binding proven: a ciphertext decrypted under another `user_id` **fails**; the failure is `credential_unreadable` with no byte echo | **PASS** — proven in both runtimes, for all **three** AAD components, with the positive control first and a scan of the rendered error for six distinct leak candidates |
| **A5** | two encryptions of the same plaintext produce different IVs and different ciphertexts | **PASS** — 64 encryptions in Node and 32 in Deno, every IV distinct, each still decrypting so uniqueness cannot be a corrupted write |
| **A6** | startup fails with an absent key and with a malformed key, in both runtimes | **PASS with a stated limit** — see §3. The validators are exercised exhaustively in both runtimes; **their process-level call sites are deliberately not wired in this slice** |
| **A7** | chain scan finds no key material anywhere | **PASS** — `guards.test.ts`, four assertions plus a non-vacuity control over >400 files |
| **A8** | parity moves by exactly one; `db lint` shows only the two pre-existing `run_user_heartbeat` warnings | **PASS on parity** (`202607310064` → `202608010065`, verified by `egc-invariants.test.ts`). **`db lint` runs in CI, not locally** — Docker is unavailable on this machine |
| **A9** | lint 0, typecheck 0, Vitest green, build exit 0 | **PASS, with the two known CRLF failures reported as failures** — see §4 |

---

## 2. Three departures from the PRD, recorded rather than folded in

### 2.1 An own-row INSERT policy exists

`BYOK-SCHEMA-004` enumerates `select` and `update` policies. `BYOK-SCHEMA-005` grants
`select, insert, update`. **Under forced RLS those two do not cohere**: a grant with no
policy is dead weight, and every INSERT would pass the privilege layer and be refused by
the policy layer. The migration adds `user_ai_credentials_insert_own`, which is what makes
SCHEMA-005's grant mean what it says.

### 2.2 `fingerprint` stores `<prefix>:<6 hex>`, not bare hex

`BYOK-FINGERPRINT-002` displays `sk-proj · a3f9c1`, so the prefix has to survive the write.
`BYOK-SCHEMA-002`'s column list has nowhere else to put it, and adding a column would be a
larger departure than composing the two into the value that already exists. The closed
vocabulary is pinned by a CHECK **in the database** — the same choice `BYOK-SCHEMA-003`
makes for `status` — and `fingerprint.test.ts` reads the CHECK out of the migration and
compares it to the TypeScript list in both directions, so the duplication cannot drift.

### 2.3 `BYOK-GUARD-005` admits one named keyless exception

`process-jobs/product-events.ts:28` computes a **keyless** `SHA-256` for an analytics
idempotency key. It predates BYOK and takes no key parameter, so no path reaches a
credential. Read literally the requirement forbids it; read for its purpose it does not,
and rewriting a working analytics hash to route through the credential crypto core would
couple the two for no gain. The exception is bounded three ways: one named file, a
**keyed-operation** assertion that admits no exceptions at all, and a test asserting that
file still contains only the keyless call.

---

## 3. What this slice deliberately did **not** wire, and why

**The startup checks exist, are exhaustively tested, and are called by no process.**

`requireMasterKey` and `requireFingerprintPepper` refuse an absent, empty, non-base64 or
wrong-length value in both runtimes, without ever echoing the rejected value. Task 1.6
asks for "startup validation in both runtimes: … **fails to start**". This slice ships the
check and **not** the boot-time call site, for a reason that is an ordering fact rather
than a preference:

- Amendment A-1.2 defers `preview` and `production` secret provisioning to the point of
  use, with a required ordering — production secrets before any production deployment.
- Wiring a fail-to-start check into the Next.js app (`instrumentation.ts`) or into
  `process-jobs/index.ts` **now** inverts that ordering. The next deploy of either would
  fail to boot on a secret nobody has provisioned yet. That is a scheduled outage, caused
  by this slice, for no security gain — nothing in BYOK.1 reads a credential.

Each call site therefore lands with the slice that makes its runtime depend on a
credential: **BYOK.3** for Node, **BYOK.4** for the worker (whose task 4.13 already owns the
deploy). Gate A6 asks the suite to *show* that startup fails on an absent and a malformed
key; the validator is the startup check, and it is shown doing exactly that in both
runtimes. What is not yet shown is a *process* refusing to boot, and this report says so
rather than implying otherwise.

**The Deno core exports no `hmacSha256`.** A declared asymmetry, not drift: the worker
never computes a fingerprint, and a consumer-less export is the thing this repository
removes. `parity.test.ts` asserts the asymmetry in **both** directions, so neither adding
it to the worker nor deleting it from Node can pass silently.

**The Deno suite cannot execute the env read.** The `worker` CI job runs `deno test` with
**no `--allow-*` flags** so it can never reach a network. `Deno.env.get` without
`--allow-env` raises a permission error rather than the validation error under test, so the
Deno half proves `decodeMasterKey` — the actual validation logic — exhaustively, and the
wiring from `requireMasterKey`/`requireFingerprintPepper` to it is asserted textually from
the Node side, where the file is already read for the parity lock. Granting `--allow-env`
to reach three more assertions would trade the network-free guarantee for a weaker version
of a proof the suite already has.

---

## 4. What failed, stated as failure

**Two assertions fail locally and are not this slice's.**
`src/features/task-commands/sql-reachability.test.ts` loses 2 of its 46 assertions on this
Windows checkout and loses the identical two on `main`, whose CI is green. Cause:
`core.autocrlf = true` with no `.gitattributes`, against two assertions anchored on a bare
`\n` after non-whitespace. Recorded as repository maintenance in `PRODUCT_UX_CLOSEOUT.md`
§8 and deliberately not fixed inside a feature branch.

Full local run: **3403 passed, 2 failed**, 191 files.

**Docker is unavailable on this machine**, so `supabase db reset`, the pgTAP suite and
`supabase db lint` could not be executed locally. `byok_credential_store.sql` is therefore
the highest-risk artifact in this slice and was scrutinised statically instead:

- the declared `plan(57)` was **counted mechanically** against the file's assertion calls
  and matches exactly;
- every `throws_ok` argument is **explicitly cast** (`'23514'::char(5)`, `null::text`),
  because pgTAP overloads `throws_ok` on `(TEXT, CHAR(5), …)` and `(TEXT, TEXT, …)` and an
  untyped literal is ambiguous;
- **no assertion depends on which CHECK constraint PostgreSQL reports.** More than one can
  be violated by a single statement — `status = 'expired'` breaks both the closed-set CHECK
  and the shape CHECK — and the evaluation order is not promised. The "which constraint"
  evidence is taken from `pg_constraint` instead, where it is deterministic;
- `has_index`, `col_is_pk` and `col_type_is` use the exact argument forms already proven in
  CI by `phase1_rls.sql` and `editable_candidate_confirmation.sql`.

---

## 5. A conflict this slice raises and does **not** resolve

**`BYOK-SCHEMA-007` and implementation-plan task 3.8 cannot both hold as written.**

- `BYOK-SCHEMA-007` fixes `credential_validation_attempts` at `(user_id, attempted_at,
  outcome)`.
- Task 3.8 requires BYOK.3 to throttle validation **"per user *and* per IP"** over that
  same table.
- **BYOK.3's migration budget is zero.**

No column in the declared shape can carry an IP, so BYOK.3 as written would need either a
column that does not exist or a migration it is not allocated.

**This migration implements SCHEMA-007 exactly and invents nothing.** Adding an `ip_hash`
column here would be an implementer expanding a governing document's schema inside a
branch, which is the move this repository refuses — and it is the same move `ADR-069`
exists because the owner, not the implementer, is entitled to make.

**The decision is the owner's, and it is needed before BYOK.3 starts.** Three options, with
no recommendation smuggled into the framing:

1. **Add a column in a BYOK.3 migration** and raise the initiative's budget from four to
   five. Storing a *hashed* IP under the fingerprint pepper rather than a raw one keeps the
   table free of directly identifying data.
2. **Amend task 3.8 to a per-user ceiling only**, and record what that gives up: an attacker
   with many accounts is unthrottled in aggregate — though hosted signup is closed, so
   "many accounts" is not currently reachable.
3. **Throttle per IP outside this table**, at the edge or in a separate store, and amend
   task 3.8's "over `credential_validation_attempts`" accordingly.

Recorded in `docs/TODO.md` and in the loop handoff so it cannot be discovered at the moment
BYOK.3 needs it.

---

## 6. Evidence index

| Claim | Artifact |
| --- | --- |
| Schema, RLS, policies, grants, CHECKs, cascade | `supabase/migrations/202608010065_byok_credential_store.sql` + post-deploy assertion block |
| A1, A2, and the schema shape | `supabase/tests/byok_credential_store.sql`, 57 assertions |
| A3, A4, A5, A6 (Node) | `src/lib/byok/crypto.test.ts` |
| A3, A4, A5, A6 (Deno) | `supabase/functions/_shared/byok-envelope.test.ts` |
| A3 cross-runtime, executed in CI | `scripts/byok-crypto-interop.mjs`, now a step in the `worker` job |
| Node/Deno parity and the declared asymmetry | `src/lib/byok/parity.test.ts` |
| `BYOK-FINGERPRINT-001…005` | `src/lib/byok/fingerprint.ts`, `src/lib/byok/fingerprint.test.ts` |
| A7, `BYOK-GUARD-005`, task 1.8 | `src/lib/byok/guards.test.ts` |
| Migration ↔ generated types parity | `src/lib/byok/database-types-parity.test.ts` |
| Parity moved by exactly one | `src/lib/closeout/egc-invariants.test.ts` |
| Residue sweep learns the two new tables | `scripts/verify-phase-2f-cleanup.mjs` |
| The security boundary in prose | `docs/SECURITY.md`, "BYOK.1 — o armazenamento de credenciais" |

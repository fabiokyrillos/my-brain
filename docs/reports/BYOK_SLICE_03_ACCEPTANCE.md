# BYOK.3 — Node adapter, Settings and validation: acceptance record

**Date: 2026-08-01.** Governs `docs/BYOK_IMPLEMENTATION_PLAN.md` Slice BYOK.3 as amended by
`ADR-070` / Amendment A-2, delivering `BYOK-ADAPTER-001/002/006/007` (Node),
`BYOK-LIFECYCLE-001…009`, `BYOK-VALIDATE-001…007`, `BYOK-ROTATE-001…004`,
`BYOK-GUARD-001/002/004/006` (Node scope), `BYOK-COPY-001…007`, `BYOK-QUOTA-003` (Node),
and `BYOK-SCHEMA-010…015`.

**One migration: `202608010067`.** Parity `202608010066` → `202608010067`, exactly the
allocation Amendment A-2.2 raised BYOK.3 to.

**This is the slice that removes the project-key fallback.** Settings ships with it, in the
same commit range, for the reason the plan gives: a fallback removed before the surface
that configures a replacement would leave the product AI-less.

---

## 1. Acceptance gates

| Gate | Must show | Result |
| --- | --- | --- |
| **C1** | **No Node path can reach the project key** — guard green, and a deliberately reintroduced fallback reds the build | **PASS** — `project-key-guard.test.ts`. The clause is deleted; the credential is a required property of a required argument, so omission fails at `tsc`. The guard forbids the read in four spellings and asserts the constructor's parameter is non-optional |
| **C2** | Matrix cases 1, 2, 3, 12 executed | **PARTIAL — see §4.** Case 12 is executed (`gate.test.ts`). Cases 1–3 need two real accounts against a deployed database and are **not executed** |
| **C3** | A failed rotation leaves the old credential active — executed | **PASS** — validation precedes the write; on any non-`succeeded` outcome the action returns before `sealCredential` is called, and only `last_failure_code` moves |
| **C4** | A successful rotation stops the old key being used | **PASS** — one in-place `update` overwrites `ciphertext`, `iv`, `key_version`, `fingerprint` and `validated_at`. One row per user means there is no superseded ciphertext |
| **C5** | Removal blocks synchronous AI immediately | **PASS** — removal sets `status = 'removed'` and nulls the material in **one statement**; `resolve_own_ai_credential` returns rows only for `active`, asserted in `byok_resolvers.sql` |
| **C6** | An invalid key never becomes `active` | **PASS** — `BYOK-VALIDATE-007`. A failed validation returns before sealing; a first-time failure creates no row at all |
| **C7** | The browser never receives plaintext | **PASS** — the read path selects five columns and names neither `ciphertext` nor `iv`; `CredentialMetadata` has no key field; the panel has no reveal control, no prefill and no `type` toggle, asserted across the whole feature directory |
| **C8** | Logs and errors contain no key | **PASS** — `Secret` throws on `toString`, `toJSON`, `Symbol.toPrimitive` and `JSON.stringify`; the provider error is classified to one of six words and discarded; **executed against the real SDK** in the live lane |
| **C9** | Throttle refuses past the ceiling, per user **and** per IP | **PASS on behaviour, PARTIAL on concurrency — see §3** |
| **C10** | Concurrent rotation: one wins, one gets a declared conflict, no partial write | **PASS by construction, not executed — see §4** |
| **C11** | Desktop + Pixel 7 Settings, both locales | **NOT EXECUTED — see §4.** Blocked on the migrations not being deployed |
| **C12** | Locale-ternary count ≤ baseline; lint/typecheck/tests/build green | **PASS** — no new ternaries (all copy is in one typed module); lint 0, typecheck 0, build exit 0, **3475 passed / 2 failed** (the known CRLF pair) |
| **C13** | Parity moves by exactly one; `db lint` clean | **PASS on parity**; `db lint` runs in CI — Docker is unavailable here |
| **G-0.4** | The live validation lane, **executed** | **PASS — EXECUTED. See §2.** |

---

## 2. G-0.4: the live lane, executed

`npm run test:byok:validation` — **4 passed**, against the real provider.

| Case | Time | What it proves |
| --- | --- | --- |
| the key is available | 1ms | presence only; no length, prefix or hash recorded |
| a valid key validates | **834ms** | `succeeded` is reachable **only** if the probe resolved — a real authenticated `models.list` against the dedicated project |
| an invalid key maps to `invalid_key` | **203ms** | requires a genuine `401` carrying OpenAI's actual code/status shape. **A network failure would have classified as `unknown`**, so this is the half a mocked suite cannot prove: it shows the shape the mapping expects is the shape OpenAI sends |
| the probe leaks nothing on failure | **379ms** | containment asserted against the **real SDK**, whose errors carry the request — and therefore the key — rather than against a stub throwing a plain object |

**The lane is not marked "passed while unexercised", which `ADR-069` forbids.** It ran, it
made three real round trips, and the timings are in the table above.

**Cost:** `models.list` consumes **no tokens**, so validating a key bills nothing. The
dedicated project's USD 2 monthly figure is a **budget alert, not a hard spending cap** —
stated here because a report implying otherwise would be describing a control that does not
exist. The hard ceilings are application-side: `maxRetries: 0`, a 10-second timeout, and the
per-user/per-IP daily limits.

**No key material was exposed.** Re-verified after the run: present and non-empty, 1024
tracked files scanned, **0 matches**, `.env.local` absent from `git status`.

---

## 3. The throttle, and the honest limit on its proof

`BYOK-VALIDATE-004` is the **T-16** control: without it the product is an oracle for testing
stolen OpenAI keys, a capability it does not have today and must not acquire.

**Why it is a database RPC.** The obvious implementation — count today's attempts, proceed if
under the limit — is wrong under any concurrency: two requests both read `ceiling - 1` and
both proceed. Inserting first and counting afterwards does not fix it either, because under
`READ COMMITTED` neither transaction sees the other's uncommitted row. `pg_advisory_xact_lock`
serializes the read-and-write for one bucket, which is the mechanism `run_all_heartbeats`
already uses. **Two locks, always in the same order** — user, then IP — because two locks
taken in different orders by different callers is a deadlock.

**The slot is reserved by inserting inside the locked transaction**, so the next caller
counts it. A reservation that is never finalized — the process died mid-call — stays
`unknown` and still counts. That is the correct failure direction: a crash must not be a way
to buy free attempts against somebody else's key.

**What is proven:** the ceiling holds. `byok_validation_throttle.sql` §5 fills a bucket, sees
the next claim refused, and then shows a **different address is a different bucket** — so the
per-IP refusal was about the address and not about the user.

**What is NOT proven: true concurrency.** pgTAP is single-session, so the advisory locks are
never contended. The locks are asserted to exist and to be taken in a fixed order, and the
sequential ceiling behaviour is executed — but the concurrent case is **reasoned, not
executed**, and this report says so rather than letting the section heading imply otherwise.

---

## 4. What is not done, stated as not done

**C2 cases 1–3, C10, and C11 are not executed.** All three are blocked by the same fact, and
it is worth naming once: **neither BYOK migration has been applied to a shared environment.**
`202608010065`, `202608010066` and `202608010067` are validated on every CI run by
`supabase db reset` from an empty database, and Docker is unavailable on this machine, so
there is no local Postgres either.

- **C2 cases 1–3** need two real accounts each saving a distinct key and each performing a
  synchronous operation. That requires a deployed database with the credential table.
- **C10** needs two simultaneous rotations against one row. The staleness witness makes one
  win and one receive `rotationConflict` by construction — a single-statement `update … where
  updated_at = <witness>` cannot partially apply — but "by construction" is not "executed".
- **C11** needs the authenticated Settings journey on desktop and Pixel 7 in both locales.
  `test:e2e:online` runs against the linked project, where `user_ai_credentials` does not
  exist, so the panel would fail on a missing relation rather than render.

**These are not deferred quietly.** They are the acceptance evidence that becomes available
at the first BYOK deployment, which Amendment A-1.2 gates on preview and production secrets
existing. Until then this slice's claim is bounded to what was actually run.

**Also not done, and not this slice's:** the Deno adapter, the worker's `OPENAI_API_KEY`
deletion, and capture-without-a-key. Those are BYOK.4. The Deno read is asserted **present**
by `project-key-guard.test.ts` precisely so that when BYOK.4 removes it, the allowlist must
shrink in the same commit — an allowlist that outlives its exception is how they grow.

---

## 5. Three guard drafts that were wrong, recorded

Written down because a guard that was silently corrected teaches nothing, and because each of
these was a real near-miss.

1. **`?? process.env` forbidden outright.** It failed on `OPENAI_EXTRACTION_MODEL` and
   `OPENAI_EMBEDDING_MODEL`, which are **not credentials** — a model id is public, costs
   nothing to know, and creates no path to a provider. Narrowed to variable names containing
   `KEY`, `SECRET` or `TOKEN`.
2. **`return[^;]*ciphertext` in the actions module.** It flagged `sealCredential`, which
   returns database columns and is exactly where a ciphertext belongs. A textual guard could
   not tell that apart from a leak; the check now reads the **declared result type**.
3. **The migration scan without comment stripping.** It reddened on `202608010067`, whose
   header explains at length that the rate-limit pepper lives in the application environment
   and never in the database. That is the **third** time a guard in this initiative forbade
   documenting the thing it guards; the fix is now applied consistently, including to
   `comment on … is '…'` bodies, which are prose that happens to live in SQL.

---

## 6. Evidence index

| Claim | Artifact |
| --- | --- |
| The fallback is deleted and the credential required | `src/lib/ai/index.ts`, `src/lib/ai/openai-provider.ts` |
| C1, C2 (case 12), C7, C8, guards 001/002/004/006 | `src/lib/byok/project-key-guard.test.ts`, `src/lib/byok/gate.test.ts` |
| The branded `Secret` and its eleven refusals | `src/lib/byok/secret.ts`, `secret.test.ts` |
| Canonicalization, without which the ceiling counts nothing | `src/lib/byok/ip.ts`, `ip.test.ts` |
| The throttle, retention and `ip_hash` | `supabase/migrations/202608010067_byok_validation_throttle.sql` |
| C9 behaviour, and what it cannot prove | `supabase/tests/byok_validation_throttle.sql`, 34 assertions |
| Validation and the closed vocabulary | `src/features/byok/validation.ts`, `validation.test.ts` |
| **G-0.4, executed** | `src/features/byok/live-validation.remote.test.ts`, `npm run test:byok:validation` |
| Settings, metadata only, no reveal | `src/features/byok/credential-panel.tsx`, `credential-view.ts` |
| Copy, both locales, one module | `src/features/byok/copy.ts` |

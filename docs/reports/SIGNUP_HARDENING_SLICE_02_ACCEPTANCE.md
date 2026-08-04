# Signup Hardening — SH.2 acceptance record

Slice: **SH.2 — account deletion and zero-residue cleanup.** Branch
`codex/sh-slice-2`, from `main` at `3c227f6` (the SH.1 merge). **Migrations: 1**
— `202608040072` — exactly the plan §1 allocation; head `202608040071` →
`202608040072`, with `AUTHORIZED_MIGRATION_HEAD` moved in the same change.

## 1. What exists now that did not

- **`public.account_deletion_log`** — de-identified *by construction*: no
  `user_id`, no email, no display name (asserted against the catalog, because
  the honest form of that claim is that the columns do not exist). It holds an
  opaque event id, per-step timestamps, counts, a closed outcome set
  (`completed`/`stopped`/`failed`), a closed stop vocabulary, and the
  requesting session's 64-hex hash on BYOK's `ip_hash` contract. Forced RLS
  with **no policy at all** and no table grants — not even `service_role` —
  so the `SECURITY DEFINER` RPC is its only writer.
- **`request_account_deletion()`** — the user's own transition, through the
  SH.1 machine (so the audit row is unconditional). Takes **no parameter**:
  the owner is `auth.uid()`. Idempotent while already `deleting`, because the
  surface may legitimately be retried.
- **`account_owned_row_counts(uuid)`** — `service_role`-only, enumerates
  user-owned tables **from the catalog at run time** and returns non-zero
  counts, with `-1` for a table it could not scan. It is the executor's
  before-census (for the log) and after-check (zero residue), and the reason a
  table added by a later slice joins the stop-on-unknown detector unasked.
- **The executor** (`supabase/functions/delete-account/`) — outside `src/`,
  per ADR-074, split into `executor.ts` (the machine, importable by tests) and
  `index.ts` (the HTTP entrypoint). Self-only: the account comes from the
  validated Bearer token and the body carries no target, so T-01 cannot be
  built here by accident. Seven ordered steps, stopping rather than forcing on
  anything unclassifiable; storage removed by exact `<uid>/` prefix and
  verified empty before the account row is touched.
- **The request surface** (`src/features/account/`) — re-authentication
  validated against the provider *server-side*, plus a typed confirmation
  phrase compared in the caller's own locale. Declared codes only; no provider
  or database message ever reaches the user. Copy states all four SH-COPY-003
  claims in both locales.
- **The storage-orphan scanner** (`npm run verify:storage:orphans`) — reports,
  never deletes, with classification by prefix (structural), never by filename.
- **The capability guard** — 20 holders of `admin.deleteUser`, classified:
  **one** product site (the executor, citing ADR-074), five pre-SH.2 e2e
  teardown specs, fourteen pre-SH.2 operator scripts. Both directions.

## 2. Evidence

- **Deno, 15 cases** (`executor.test.ts`) driven through a recording fake that
  asserts **what was destroyed**, not what was returned: completion with exact
  prefix removal; every listed prefix equal to the owner id; stop when the
  account never asked; stop on an unscannable table with nothing deleted (T-32);
  stop on a cross-owner reference with nothing deleted (T-07); stop when
  storage still lists objects; stop when rows survive the cascade; a genuine
  auth-delete failure that never reports success; the concurrent-run race; the
  reachable resume case; the session hash's shape; and the **colliding-name
  negative control** (T-09) asserting no path of another owner appears in any
  remove call.
- **pgTAP, 25 assertions** (`signup_hardening_account_deletion.sql`): the log
  unreachable outside its RPC and structurally de-identified; its vocabularies
  refusing free text, an unknown outcome and a raw identifier, with a
  well-formed record accepted so the refusals are non-vacuous; the census
  reaching trigger-seeded tables; the request surface self-only, audited and
  idempotent; **its own positive control** — the account's job is claimed while
  active, and an identical second job is unclaimable once `deleting`; and the
  cascade leaving zero rows while the bystander's identically-named attachment
  survives.
- **Unit, 37 cases**: the request action called directly with hand-built
  FormData (a wrong phrase never consumes a password attempt; a missing control
  is not consent; re-auth resolving to a different user is refused; no provider
  text escapes); scanner classification including cross-owner outranking
  absent-owner; the capability guard.

## 3. Adversarial review — findings fixed or recorded

1. **FIXED, found by running the tests:** importing `index.ts` executed
   `Deno.serve`, which needs `--allow-net` — and the worker suite runs with no
   `--allow-*` flags by design. The machine moved to `executor.ts`; the
   entrypoint imports it. Without the split, every branch of the executor would
   have been untestable in CI.
2. **FIXED, and it changed a claim rather than a fixture:** the first
   "crash-resume" test asserted a scenario that **cannot occur** — after
   `auth.users` is deleted the Bearer token no longer authenticates, so the
   machine is never re-entered. Replaced with the two reachable cases (a
   concurrent second invocation, and a resume before the account delete), and
   the limit is stated in the test file and in §5 below rather than implied by
   a passing test.
3. **FIXED, the fourth occurrence of a known trap:** the scanner's
   no-destructive-call guard failed on the scanner's own prose describing what
   it does not do. Comments are stripped before scanning — the established
   answer, now recorded a fourth time.
4. **FIXED:** the scanner ran `main()` on import, so a unit test importing its
   pure classifier tried to reach a live project. Guarded with the
   `import.meta.url === pathToFileURL(process.argv[1])` idiom the BYOK parity
   script already uses.
5. **RECORDED, and the guard was widened rather than narrowed:** SH-DELETE-013
   asks for the executor to be pinned as "the only site holding deletion
   capability". Nineteen other holders already existed (e2e teardown, operator
   smokes — FINDINGS §2 recorded them). Excluding them by scan scope would have
   created a blind spot exactly where a future writer would add one, so all 20
   are listed **with classifications**, and the `product` class has exactly one
   member.
6. **RECORDED:** the executor verifies the credential row's *status* before the
   cascade but cannot verify erasure of bytes it must never read. The real
   guarantee is the CHECK constraint (`removed` rows carry no ciphertext) plus
   the cascade; the check here is a stop-if-unreadable, not a proof of erasure,
   and it says so.
7. **RECORDED, deployment ordering:** as with SH.1, the migration must reach
   the hosted project before the app code that calls `request_account_deletion`.
   The failure mode is milder here (a declared error, not a closed product),
   but it is stated rather than discovered.

## 4. CI evidence

- Local gates: lint **0**, typecheck **0**; full vitest and build recorded at
  the PR boundary; Deno worker suite **104/104** including the 15 new cases;
  `deno check` on the new entrypoint green (and wired into CI beside the other
  two).
- PR, PR-head CI run, merge SHA and merge-SHA CI run: appended at the PR/merge
  boundary.

## 5. What SH.2 does not claim

- **No deployed execution.** SH-DELETE-012 (the end-to-end journey against a
  disposable account) needs SH-GD.3, and the executor is not deployed by this
  slice. Every claim above is repository-and-CI evidence.
- **No resume after the account row is gone.** The Bearer token cannot
  authenticate a deleted account, so a crash between the `auth.users` delete
  and the log write loses the log row, not the deletion. Recorded here rather
  than papered over; the account is in its intended final state either way.
- **The six orphaned objects are untouched.** `docs/reports/SH_DELETE_015_ORPHAN_MANIFEST.md`
  carries the read-only procedure and an explicitly **unfilled** manifest.
  Taking the manifest needs the deployed project; deleting the objects is
  irreversible, owner-only, and gated on SH-GD.2's verified backup. **This is
  SH.2's stop condition**, and the loop stops there rather than proceeding on
  the belief that the objects are stale.
- **No suspension, no admin boundary** (SH.3), and no e2e journey over the
  deletion surface — the surface's server-side behavior is unit-proven; its
  rendering belongs with SH.3's suspended-surface e2e work.

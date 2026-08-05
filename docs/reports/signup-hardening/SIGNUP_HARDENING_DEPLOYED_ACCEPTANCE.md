# Signup Hardening — deployed acceptance for SH.2, SH.3 and SH.4

Executed 2026-08-04 against the deployed project `ulvwzqlpsjyrnqzfxmck`, at
repository head `0b03e56` on `codex/sh-deployed-acceptance` (branched from
`e925ba2`).

This document closes the six rows that SH.2, SH.3 and SH.4 each recorded as
**NOT EXECUTED** behind SH-GD.1/GD.2/GD.3. It records what was measured, what
was found, and the two things that are still not proven from this side.

---

## 1. Deployment-ordering verification, before any journey ran

Every one of these was verified **before** a journey was allowed to start,
because the two new gates fail closed and a reversed deployment order would
have been indistinguishable from a broken product.

| Precondition | Method | Result |
| --- | --- | --- |
| Hosted migration parity is `202608040074` | `npx supabase migration list --linked`, every row compared local-vs-remote | **confirmed** — all rows match through `202608040074`; no gap anywhere in the chain |
| `account_lifecycle` exists, every real account has a row | service-role census of `auth.users` against `account_lifecycle` | **confirmed** — 2 accounts, 2 rows, **0 stateless**, 0 lifecycle rows without an auth user |
| `policy_acceptances` exists | service-role read | **confirmed** |
| The owner is active | lifecycle row for the owner account | **confirmed** — `active`, and holding `terms`+`privacy` acceptances at the current version |
| Signup remains disabled | `GET /auth/v1/settings` on the deployed GoTrue | **confirmed** — `disable_signup: true`, `mailer_autoconfirm: false` |
| Updated app code is not running against an older schema | `.env.local` targets `ulvwzqlpsjyrnqzfxmck`; repository head and hosted head are both `202608040074` | **confirmed** |
| No fail-closed error affects legitimate accounts | both real accounts reach the product; the owner's own session was exercised | **confirmed** |

**No legitimate account lacked a lifecycle row**, so the stop condition the
checkpoint named did not trigger. Migration `202608040070` backfills and aborts
itself if it would leave anyone stateless, and accounts created after it are
seeded by `handle_new_user` — observed live, with `reason_code = 'initial_signup'`
on every account created during this session versus `'backfill'` on the two that
predate the migration.

### Reconciling the owner's report

Seven of the owner's nine reported actions verified exactly. Two did not, and
both are recorded rather than smoothed over:

- **"Hosted Auth configuration was read back and recorded."** The readback is
  not in the repository — the tree was clean at `e925ba2`, unchanged since
  before those actions. The configuration was therefore re-read here
  (§5), and SH-GD.1 stays open for the values only the Management API exposes.
- **"Disposable accounts are available for deployed acceptance."** The project
  held exactly two accounts, both predating Signup Hardening, one of them the
  shared `ONLINE_AUTH_TEST_EMAIL` fixture the whole online suite depends on.
  No disposable account existed. This was not a blocker: SH-GD.3's strategy is
  "admin-created until signup opens", so the journeys now provision their own
  and remove them, which is strictly better than a shared fixture — a deletion
  journey run against a shared account works exactly once.

---

## 2. SH.2 — the deletion journey

`e2e/online-account-deletion.spec.ts`, plus a database-level harness for the
states a browser cannot observe without racing the executor.

The `delete-account` Edge Function was deployed from the repository version at
this head — **v1, ACTIVE, `verify_jwt = true`**. It had never been deployed
before; `heartbeat` (v8) and `process-jobs` (v20) were already live.

| Checkpoint step | Result |
| --- | --- |
| 1–2. Representative data incl. a storage object | entries, profile, audit, attachment, agent preferences, 2 acceptance rows, 1 object (60 bytes) |
| 3. Deletion requested through the authenticated product surface | done, `/pt-BR/account/delete` |
| 4. Recent reauthentication and typed confirmation proven | **both refuse independently, with distinct messages**, and the account stays `active` through both |
| 5. The account enters `deleting` before destruction | observed in the database **and rendered in the browser** |
| 6. New writes and job claims blocked | write refused `Account lifecycle does not permit this action`; the claim RPC does not return the owner's job |
| 7. Self-only deletion function executed | `HTTP 200 {"outcome":"completed","objectsRemoved":1,"bytesRemoved":60}` |
| 8. No foreign account data or storage touched | every other account's census byte-identical before and after; no foreign storage prefix disappeared; **all six historical orphans still present** |
| 9. Whole-account zero-residue verified | `account_owned_row_counts` returns `{}`; storage prefix empty |
| 10. De-identified deletion log verified | see below — verified structurally, not by reading it |
| 11. Disposable Auth user gone | confirmed; the lifecycle row cascaded away with it |

### The typed confirmation and the re-authentication are genuinely separate

The wrong phrase returns *"Digite exatamente a palavra pedida para confirmar."*
and the wrong password returns *"A senha não confere."* Two different messages
from two different checks is what proves the password was actually validated
against the provider rather than the form rejected wholesale — and the phrase is
compared first, so a wrong word never costs a provider password attempt.

### Step 10, honestly: the log was verified by construction, not by reading

`account_deletion_log` **cannot be read by any client role, including
`service_role`** — `revoke all … from public, anon, authenticated, service_role`,
RLS enabled, and a postcondition asserting the table carries no policy at all.
The live attempt returned `permission denied for table account_deletion_log`.

That refusal *is* the verification. The table has no `user_id`, no email and no
name column in its schema, so de-identification is structural rather than a
convention the writer must remember; and the row cannot be read back out by the
capability that wrote it. Reading the row content to confirm it is de-identified
would require a capability whose absence is the property under test. The write
path itself is covered by the pgTAP suite in CI.

### A finding: the receipt copy is unreachable

`deletion-copy.ts` defines `receiptTitle`/`receiptBody` ("Conta excluída"), and
the Server Action returns `{ status: "started" }` to render them. On the
deployed surface they never appear. The moment `request_account_deletion`
lands, the account leaves `active`; the Server Action's revalidation re-runs the
SH.1 lifecycle gate; and the `deleting` account-state surface interposes before
React paints the returned state. The user sees *"Exclusão em andamento"*.

This is not a defect in either gate — both behave correctly, and the
interposition is arguably the better screen. It is dead copy, and it is recorded
here because unreferenced user-facing strings rot silently. Resolving it is a
copy decision, not a code one, and is left to the owner.

---

## 3. SH.3 — suspension, the operator boundary, and the way back

`e2e/online-account-suspension.spec.ts`. All five tests pass.

| Checkpoint step | Result |
| --- | --- |
| 1. Representative data and a valid pending job | entry captured; a `process_attachment` job created through the exact upload path, under the user's own client so RLS admitted it |
| 2. Suspended through the operator CLI | `--suspend --reason operator_suspension_abuse --apply` |
| 3. Exact status readback | `suspended` / `operator_suspension_abuse` / `operator` |
| 4. Product routes show only the suspended surface | `/app`, `/app/tasks`, `/app/chat`, `/app/settings` all render *"Conta suspensa"* |
| 5. Direct Server Actions refuse | the PostgREST RPC path refuses with `Account lifecycle does not permit this action` |
| 6. Deployed worker skips the job across two ticks | both ticks `HTTP 409` |
| 7. Job stays queued without `jobs.error` | `pending`, `error` null, **and no attempt spent** across both ticks |
| 8. Heartbeat/reminders do not execute | `heartbeat_runs` count unchanged; notifications 0 |
| 9. Provider-side sign-in ban executed and read back | `banned_until` populated; a fresh password sign-in is refused outright |
| 10. Reactivated through the operator CLI | `active` |
| 11. Provider-side ban removed | sign-in succeeds again |
| 12. Same job claimable, completes without re-enqueue | no longer 409; same job id; **exactly one job row for the owner** |
| 13. No retroactive reminder burst | notifications still 0 |
| 14. Product data unchanged | every owned table identical to the pre-suspension census |

Two details worth keeping. The CLI is **dry-run by default** and the journey
drills that first — it prints what it would do and refuses to act without
`--apply`. And the CLI **does not echo the email it was handed**: the journey
asserts the address never appears in the transcript, because acceptance
transcripts get pasted into documents like this one.

The job's `attempts` counter is asserted unchanged, not merely its status. A
skipped job that burned a retry would eventually exhaust itself for something
its owner never did — deferral and failure are different things and the
distinction is only visible in that counter.

### Step 15 — the runbook, drilled

`SIGNUP_HARDENING_ADMIN_RUNBOOK.md` was previously marked **written, not
drilled** (SH-ADMIN-006). The sections exercised end-to-end in this run are:
suspension via the CLI, status readback, the provider-side sign-in ban and its
`banned_until` readback, ban removal, and reactivation. Those are now **drilled**.
The administrative-deletion section (`begin_account_deletion_admin`) was **not**
drilled and remains written-only: exercising it means an operator-initiated
destruction of an account, and the deletion capability was already proven by the
user-initiated path in §2.

---

## 4. SH.4 — versioned consent

`e2e/online-consent-interposition.spec.ts`. Eight tests, **both locales**, all
pass.

| Checkpoint step | Result |
| --- | --- |
| First-session interposition | *"Antes de continuar"* / *"Before you continue"*, first-session body |
| pt-BR acceptance | recorded, `surface = interposition`, server-supplied version |
| English acceptance | same |
| Forged future-version INSERT through PostgREST | **refused** (`9999-12-31`) |
| Stale-version INSERT | **refused** (`2000-01-01`) |
| Server-side gate independent of cookies/local storage | acceptance rows removed server-side while the client was made to claim the opposite; the next request is interposed |
| Decline path offers sign-out and deletion | sign-out is a real form button; deletion link **fixed** — see below |
| Version-bump behaviour, test-safe only | simulated per-account; **no global version bump was performed** |
| Normal product access after acceptance | `/app` and `/app/tasks` reachable, no interposition |

### The endpoint is not a version oracle

Both refusals use the same sentence and differ only in echoing back the
caller's own submitted value. Neither names the current version — asserted
directly, because an error that leaked it would let a prober walk to a valid
pre-acceptance and satisfy the gate forever.

### How the bump was simulated, and how it differs

A real bump is a migration plus `versions.ts` in the same commit (ADR-079) and
re-interposes consent for **every** account. Doing that to exercise a journey
would stage a production legal event for a test, which the checkpoint forbids.

Instead one disposable account's acceptance rows were removed with the service
role — a capability no client has. The gate asks "is there an acceptance at the
current version"; a bumped account and a cleared account both answer no, so the
predicate cannot distinguish them. **The difference is recorded rather than
glossed:** a real bump leaves a stale row behind and this leaves none. Nothing
in the gate reads the stale row, but that is a property of today's predicate,
not a law.

### A defect, found and fixed

The decline path's *"Excluir a conta"* link pointed at `/{locale}/app/settings`.
Everything under `app/` runs the consent gate, so the only user that link exists
for — someone declining the policies — was sent straight back to the
interposition. **The decline path was a loop.**

SH.4 had built the deletion surface at `/{locale}/account/delete` and
deliberately placed it outside `app/` for exactly this caller; nothing pinned
the link to it. Fixed in `1eee716`, with a regression test that asserts both the
href and that it stays out of `app/`.

This is the second time this initiative's own warning — *"a decline path
pointing at a route that does not exist is not a path"* — described something
that had actually happened. Review did not catch it; running the journey did.

---

## 5. Hosted configuration readback

From the deployed GoTrue's public settings endpoint:

| Setting | Value |
| --- | --- |
| `disable_signup` | **`true`** — public signup remains closed |
| `mailer_autoconfirm` | `false` — email confirmation is required |
| `external.email` | `true` — email/password is the only enabled provider |
| every other provider | `false`, including `anonymous_users` |
| `saml_enabled` | `false` |

**SH-GD.1 is only partly closed by this.** The redirect allowlist, `site_url`,
the password policy and the GoTrue **rate limits** are not exposed on this
endpoint; they need the Management API with a personal access token, which the
CLI on this machine holds in the Windows credential store rather than a readable
file. Those values are SH.5's direct input — application throttle ceilings must
sit at or below them — and they remain an owner action.

---

## 6. Storage

`npm run verify:storage:orphans`, read-only, is reconciled in full in
`SH_DELETE_015_ORPHAN_MANIFEST.md`. Summary: **six objects, all `absent-owner`,
all 2026-07-16, zero `cross-owner`, zero `unparseable`.** Both deletion
conditions were measured independently per object. Nothing was deleted; the lane
stops at owner authorization.

### The journeys made two new orphans, and that is itself a finding

The first run of the suspension spec left two orphaned objects. Its teardown
called `admin.deleteUser`, which cascades database rows and **does not touch
object storage** — the exact mechanism that produced the historical six.

Both were removed, the teardowns in both storage-touching specs now delete
storage *before* the auth row (the executor's ordering, for the executor's
reason), and a re-run confirmed the scanner is back to exactly six.

Worth stating plainly: a test suite written to verify that deletion leaves no
residue was itself leaving residue. The scanner caught it in the same session it
was created, which is the argument for having the instrument at all.

---

## 7. What is still not proven from this side

| Item | Why not |
| --- | --- |
| The deletion log's row *content* | unreadable by any role by design (§2). Structural de-identification is proven; the row is not readable and should not be |
| GoTrue rate limits, redirect allowlist, `site_url`, password policy | Management API only — owner action, SH-GD.1. **SH.5 depends on these** |
| CAPTCHA enforcement | a hosted GoTrue setting only the owner can enable |
| The restorable-backup posture (SH-GD.2) | reported by the owner; not independently verifiable from this side. Carried as an attestation, and it gates the orphan deletion |
| `begin_account_deletion_admin` | written, not drilled — see §3 |

---

## 8. State after this run

- Deployed project holds **2 accounts** — the owner and the shared online
  fixture — both `active`. Every disposable account created during this session
  was removed.
- Storage holds **6 objects**, the historical orphans, untouched.
- `delete-account` is deployed (v1, ACTIVE). `heartbeat` and `process-jobs` are
  unchanged.
- **Signup is still disabled.** Nothing in this run touched `disable_signup`.
- **No migration was applied by this run**, and no migration budget was spent:
  five of eight remain as they were.
- One production defect was found and fixed; one dead-copy finding and one
  self-inflicted-orphan finding are recorded above.

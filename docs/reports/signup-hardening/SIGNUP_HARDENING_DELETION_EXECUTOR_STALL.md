# The deletion stalls at `deleting`, and it is a deployment defect

Found on 2026-08-06 by the **first interactive account-deletion proof**. The
CAPTCHA hotfix worked: the challenge completed, `EXCLUIR` was accepted, the
correct password was accepted, no refusal appeared, and the request was
recorded. The account then stopped, permanently, at **“Exclusão em andamento”**.

This is not the pending state of a slow job. **There is no job**, and nothing
re-runs the executor.

## 1. What was observed, read-only

| observation | value |
| --- | --- |
| Auth user | **still exists** |
| `account_lifecycle.status` | `deleting`, set 14:00:52Z by `user` / `user_deletion_request` |
| `jobs` rows for the account | **none** — deletion is not job-based |
| owned rows | `profiles` 1, `agent_preferences` 1, `policy_acceptances` 2, plus `audit_logs`, `heartbeat_runs`, `product_events`, `account_lifecycle` |
| storage objects | none |
| `delete-account` function | deployed, reachable, `401` unauthenticated — not missing |
| re-signing in | succeeds, and lands on the same interposition — **real state, not a stale session** |

The screen is correct. SH.1's lifecycle gate is doing exactly what it should for
an account in `deleting`: refusing every product action. What never happened is
the deletion.

## 2. Where it fails

Re-running the executor through its supported path — the same call shape the
Server Action makes — answers:

```
409 {"outcome":"stopped","code":"credential_not_erased","objectsRemoved":0}
```

**Step 5**, the credential-residue check. But run against the *repository's*
current code that check passes: `admin_credential_status` for this account
answers `200` with body `null` — no credential row ever existed, which is not an
error, and the executor only stops on `credential.error`.

So the deployed code is not the repository's code.

```
delete-account   v1   created 2026-08-04T19:43Z   updated 2026-08-04T19:43Z
```

**Deployed once, never again.** That build is `eb92035` (2026-08-04), the SH.2
executor, which read `user_ai_credentials` **directly**.

Then, on 2026-08-05:

- `357cd63` narrowed the executor to the `admin_credential_status` RPC — **in
  the repository**;
- migration `202608050077` (SH-EXPOSURE-001) revoked `service_role`'s access to
  `user_ai_credentials` — **and was deployed**.

Confirmed: `service_role` selecting that table now answers
`403 / 42501 permission denied for table user_ai_credentials`.

So from 2026-08-05 the deployed executor's step 5 errored for **every** account,
stopped with `credential_not_erased`, and left the account in `deleting`.

The migration's own prose names the caller:

> `supabase/functions/delete-account/executor.ts` selects `status` to prove the
> credential was erased before the cascade runs.

The dependency was known. The code was fixed the same day. **The deploy was a
separate act and it never happened**, and nothing in the repository could see
the gap.

## 3. Why it never recovered

`requestAccountDeletion` invokes the executor from a `next/server` `after()`
callback, best-effort, with the failure deliberately swallowed — correct on its
own terms, because the account is already `deleting` and the executor is
documented as re-runnable (SH-DELETE-005).

**But nothing re-runs it.** `pg_cron` carries the hourly heartbeat and the
retention sweeps; there is no schedule, no job row, and no reaper for a stalled
deletion. One failed invocation is permanent.

That is a second, independent gap: *re-runnable* was implemented as a property
of the executor rather than as a mechanism that re-runs it.

## 4. Why diagnosing it was harder than it should be

Every stop writes its reason to `account_deletion_log` — a table that
`revoke all … from public, anon, authenticated, service_role` makes readable by
**nobody**, with an invariant test asserting it stays that way. The design is
right for a table holding a session hash, and the consequence is that the stop
reason cannot be read by the person diagnosing the stall.

The reason came from **re-running the executor**, whose HTTP response carries
the code (`409` + `stopReason`). That is the supported diagnostic path and it
should be written down as one, which is what §7 does. No new reader is proposed:
that would need a migration and would widen access to a table deliberately
closed.

## 5. The fix

**Deploy the current function.** One command, no code change, no migration:

```
npx supabase functions deploy delete-account
```

The repository code has been correct since `357cd63`. Deploying to production is
an operator action and was **not** performed automatically.

## 6. What this repository gained so it cannot recur silently

### `npm run verify:edge-parity` — the check that was missing

Migrations have `AUTHORIZED_MIGRATION_HEAD`, a chain and a hosted readback.
Edge Functions had nothing. This compares each deployed function's `updated_at`
against the newest commit touching its **deployable** source — `.ts` and
`.json`, never tests or markdown, because a fixture edit changes nothing that
runs.

Its first run found the defect and two false alarms, and the false alarms are
the reason for that narrowing: a docs reorganisation that touched a `.test.ts`,
and a fixture update. A parity check that cries wolf is one people run with
their eyes closed — which is how this would have been missed twice.

It also found a **second** real gap, independent of this defect:

```
delete-account   2026-08-04T19:43   2026-08-05T19:27   STALE
  undeployed: 357cd63 refactor(byok): the two service-role credential callers, narrowed
heartbeat        (never)            2026-07-16T21:20   not deployed, by design
  SH-EXPOSURE-005 — pg_cron calls run_all_heartbeats() inside the database
process-jobs     2026-08-02T02:42   2026-08-05T18:55   STALE
  undeployed: 8982d74 feat(bounds): one home for the file limits, the input bounds and the body bound
```

`process-jobs` is also behind. Nothing observed depends on that change, but it
is undeployed and now visible instead of not.

`heartbeat` is recognised as deliberately undeployed, with SH-EXPOSURE-005's
reasoning carried in the allowlist rather than left as silence.

### Two Deno tests pinning the branch that stalled

- **`completes for an account that never configured a credential`** —
  `admin_credential_status` answers `{ data: null, error: null }`, which is the
  shape of *every ordinary account*, and the machine must still reach
  `completed` and delete the Auth user. Nothing pinned this before; the fixture
  defaulted the status to `"removed"` and never exercised `null`.
- **`stops, and deletes nothing, when the credential check itself fails`** — the
  opposite direction, so the first is not passing for want of a check.

Both against the repository's current code, which is what will be deployed.

## 7. The supported way to diagnose a stalled deletion

1. `npm run verify:edge-parity` — is the deployed executor the current one?
2. Re-run the executor with a fresh user token for the stuck account
   (`admin/generate_link` → `/auth/v1/verify` → `POST /functions/v1/delete-account`
   with `Authorization: Bearer <token>`). The response carries the stop reason:
   `409 {"outcome":"stopped","code":"…"}`.
3. `account_lifecycle.status` and `account_owned_row_counts` show what remains.

Re-running is safe by construction: the executor is idempotent, stops rather
than forces, and deletes nothing it cannot verify.

## 8. State of the disposable account

**Deliberately left in `deleting`, not admin-deleted.** It is the live
reproduction, and destroying it before the fix is deployed would remove the only
end-to-end proof that the fix works. No owner account was touched. No CAPTCHA
setting, signup posture, retention schedule or Phase 2H state was changed.

## 8b. RESOLVED — terminal deletion proven end to end (2026-08-06, appended)

The owner deployed the function:

```
npx supabase functions deploy delete-account
```

No config push, no migration, no Auth configuration change. Parity confirmed
before anything else was touched:

```
delete-account    2026-08-06T14:40      2026-08-05T19:27      ok
```

The stuck disposable account was then driven through the **supported** executor
path — the product's own call shape, no admin shortcut — and every claim was
verified against the hosted project:

| # | claim | result |
| --- | --- | --- |
| 1 | no longer `credential_not_erased` for an account with no credential row | **no stop code at all** |
| 2 | terminal success outcome | `200 {"outcome":"completed","objectsRemoved":0,"bytesRemoved":0}` |
| 3 | the Supabase Auth user no longer exists | admin lookup **404** |
| 4 | the existing session is invalidated | access token → **403**; refresh token → **400** |
| 5 | `account_lifecycle` and all owned rows follow the cascade | `profiles 1→0`, `agent_preferences 1→0`, `policy_acceptances 2→0`, `account_lifecycle 1→0`, `audit_logs 1→0`, `heartbeat_runs 1→0`, `product_events` gone; the executor's own census returns **`{}`** |
| 6 | storage residue | **zero** objects under the owner prefix |
| 7 | fixture residue | **zero** — `@example.com` accounts: none |
| 8 | no owner account or owner-owned row touched | project accounts **3 → 2**; the two survivors are the two real ones |
| 9 | hosted CAPTCHA still enabled | `security_captcha_enabled = true`, provider `turnstile` |
| 10 | signup still disabled | `disable_signup = true` |
| 11 | no purge or retention activation | SH.6 retention sweeps **0/5**; cron carries only heartbeat, entry-dispatch, job-reaper and the auth-attempt prune |

SMTP remains `null`; nothing else in the hosted configuration was read as
changed.

### Both fixes were required, and only one was code

A deletion could not complete until **both** landed:

1. **The CAPTCHA hotfix** (PR #108) — without it the request never got past
   re-authentication, and the surface blamed the user's password.
2. **The executor deploy** — without it the request was accepted and then
   stalled at `deleting` forever.

The first was a code change; the second was a deploy of code that had been
correct in the repository since `357cd63`. A green repository proved nothing
about the second, which is the whole reason `npm run verify:edge-parity` exists.

### The journey is executable again

`e2e/online-account-deletion.spec.ts` — **4 passed · 0 skipped · 0 failed**. The
`test.fixme` is gone. What it now automates is everything the challenge stands
in front of: the account is driven to `deleting` through
`request_account_deletion` — the exact RPC the Server Action calls once the
phrase, challenge and password have all been accepted — the `deleting`
interposition is observed in the browser, the executor is invoked in the
product's call shape, and terminal deletion, session invalidation and zero
residue are asserted. Before the deploy that invocation answered
`409 credential_not_erased`; the test would have failed, which is what makes it
a regression test rather than a description.

**The one step still not automated** is the form submit carrying a *valid*
Turnstile token. It was performed once, interactively, on the deployment, on
2026-08-06, with a disposable account, and it succeeded. It is not automatable
without defeating the control, and the spec says so where a reader will find it.

## 9. What is still not proven

**Superseded by §8b, and kept as written.** At the time this section was
written the executor had not been deployed and none of it could be claimed.
Terminal deletion is now proven; the `test.fixme` is gone.

> Terminal deletion. The remaining `test.fixme` in
> `e2e/online-account-deletion.spec.ts` **stays**, and this report does not claim
> the account was destroyed, the session invalidated, or the cascade verified —
> none of that can be true until the executor is deployed.

## 10. Still open, deliberately

- **`process-jobs` is undeployed** (`8982d74 feat(bounds): one home for the file
  limits, the input bounds and the body bound`). Deliberately **not** deployed
  as part of this task — it is a separate decision, and nothing observed depends
  on that change. `npm run verify:edge-parity` reports it on every run, so it
  stays visible rather than forgotten.
- **`re-runnable` is still a property, not a mechanism.** Nothing re-runs a
  stalled executor. This deployment failed for a whole day and the only reason
  it surfaced is that a person tried to delete an account. Destination: Phase
  2H, beside the error sink and dead-man switch. Needs a migration; not taken
  opportunistically.
- **The stop reason is still written where nobody can read it.** The supported
  diagnostic remains §7: re-run the executor and read the `409` body.

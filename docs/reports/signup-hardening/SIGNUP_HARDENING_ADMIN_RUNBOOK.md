# Signup Hardening — administrative runbook

**SH-ADMIN-006.** Suspension, reactivation, administrative deletion-start, and the
provider-side sign-in ban. Written against `main` at the SH.3 merge, migration head
`202608040073`.

> **Status: WRITTEN, NOT DRILLED.** No section below has been executed against the
> hosted project. Each one carries its own execution record, empty until the first
> real run, and the record is filled in append-only — a section that has been run
> once says so with a date and a transcript reference; a section that has not says
> nothing else. The `docs/reports/byok/BYOK_INCIDENT_RUNBOOK.md` precedent.

---

## 0. Preconditions, every time

| # | Precondition | How it is checked |
| --- | --- | --- |
| P1 | The hosted database is at migration `202608040073` or later | `supabase migration list --linked`; the SH.1–SH.3 migrations must be present **before** any command here is run — the functions do not exist otherwise |
| P2 | You hold the linked project's service-role key | `scripts/linked-supabase.mjs` resolves it from the Supabase CLI; nothing here asks you to paste it |
| P3 | You know the account by email or id | both are accepted; the id is what every transcript records |
| P4 | You have decided the reason **before** running anything | the reason is a closed-set value, refused by the database if it is anything else |

**The whole boundary is `service_role` SQL.** There is no admin page, no HTTP
endpoint, and no route that accepts a service-role credential (ADR-075, T-10).
If a future change appears to need one, that is a stop condition, not a task.

### The closed reason vocabulary

| Verb | Allowed `--reason` | Meaning |
| --- | --- | --- |
| `--suspend` | `operator_suspension` | generic: the account is under review |
| | `operator_suspension_abuse` | acceptable-use review |
| | `operator_suspension_security` | security precaution (e.g. suspected compromise) |
| `--reactivate` | `operator_reactivation` | lifting a **suspension** |
| | `deletion_reverted` | calling off a **deletion** — a different act, and deliberately a different word |
| `--start-deletion` | `operator_deletion_start` | the only one |

The database refuses anything else, refuses free text, and refuses
`deletion_reverted` on a suspended account (and `operator_reactivation` on a
deleting one) — so the reason cannot be typed by muscle memory into the wrong
transition.

---

## 1. Suspension

**What it does:** the account cannot capture, reprocess, or run any product
Server Action; every product route renders only the suspended surface; queued
jobs stay queued and unclaimed; the heartbeat does no work for the account; no
reminder or notification is delivered. **No data is changed** — a suspend/
reactivate cycle leaves every owned table with identical row counts (proven by
`signup_hardening_suspension_admin.sql` §H).

**What it does NOT do:** it does not stop the account from *signing in*. A
suspended user can still authenticate and will land on the suspended surface.
Blocking sign-in at the provider is §4, a separate step with its own decision.

### Commands

```powershell
# 1. Read the current state. Always first, and it changes nothing.
npm run account:lifecycle -- --status --email someone@example.com

# 2. Dry run. Prints what it would do and exits without doing it.
npm run account:lifecycle -- --suspend --email someone@example.com --reason operator_suspension_abuse

# 3. Apply.
npm run account:lifecycle -- --suspend --email someone@example.com --reason operator_suspension_abuse --apply
```

### Expected readback

```
verb: suspend
before:
  account:   <uuid>
  status:    active
  reason:    initial_signup
  changed:   system at <timestamp>
after:
  account:   <uuid>
  status:    suspended
  reason:    operator_suspension_abuse
  changed:   operator at <timestamp>
```

### Verification

- `after.status` is `suspended` and `after.changed` says `operator`. If it says
  anything else, stop: the transition did not go through the machine.
- The `audit_logs` row exists — it is written by the trigger in the same
  statement, so its absence would mean the transition did not happen at all.
- The account's queued jobs are still `pending` (they are skipped, not failed).

### Stop conditions

- The readback says `NOT FOUND` → the account does not exist. Do not proceed;
  re-check the address.
- `status` is already `deleting` → **refuse to suspend.** The database refuses
  it too. A deletion in progress is not something to pause with a suspension;
  the pre-executor return path is §3's note, not this section.
- Anything prints a database message you did not expect → stop and record it.
  Do not re-run with `--apply` to "see if it works".

**Execution record:** **DRILLED 2026-08-04** against the deployed project at migration parity `202608040074`, on a disposable account. The dry run printed its refusal and changed nothing; `--apply` produced the readback above verbatim (`suspended` / `operator_suspension_abuse` / `operator`). The transcript was also asserted not to contain the email the operator supplied. Evidence: `SIGNUP_HARDENING_DEPLOYED_ACCEPTANCE.md` §3.

---

## 2. Reactivation

**What it does:** returns the account to `active`. Queued jobs become claimable
again on the next drain tick **with no operator re-enqueue** — nothing needs to
be requeued, repaired or backfilled.

**What it deliberately does not do:** it does not deliver the reminders that came
due during the suspension. Those reminders are **untouched** — still `scheduled`,
still visible in the user's reminders list — but the heartbeat does not turn them
into notifications after the fact (SH-SUSPEND-005). The suspended surface tells
the user this in their own language before it happens.

### Commands

```powershell
npm run account:lifecycle -- --status --id <uuid>
npm run account:lifecycle -- --reactivate --id <uuid> --reason operator_reactivation
npm run account:lifecycle -- --reactivate --id <uuid> --reason operator_reactivation --apply
```

### Verification

- `after.status` is `active`, `after.reason` is `operator_reactivation`.
- If the account was banned at the provider in §4, **it is still banned.** The
  two controls are independent by design; lifting one does not lift the other.
  Un-ban with §4's reverse command and read it back.
- Within one drain tick, the account's `pending` jobs move to `running` and
  complete. If they do not, the blocker is not the lifecycle — check the account
  has an active AI credential (BYOK), which is a separate predicate.

### Stop conditions

- The account is `deleting`, not `suspended` → this is not a reactivation, it is
  **reverting a deletion**, and it needs `--reason deletion_reverted` and a
  decision that it is the right thing to do. See §3.
- The account's status is already `active` → the command reports `changed:false`
  and does nothing. That is not an error; it is the idempotent answer.

**Execution record:** **DRILLED 2026-08-04**, same run and same account. Reactivation restored `active`, the previously-skipped job became claimable without re-enqueue, and the owned-row census was identical to its pre-suspension state — suspension cost the account nothing. Evidence: `SIGNUP_HARDENING_DEPLOYED_ACCEPTANCE.md` §3.

---

## 3. Administrative deletion-start

> **Read this whole section before running it.**

**What it does:** transitions the account to `deleting`. Every write is refused,
no job is claimable, the product surface closes, and an audit row records who
started it and why.

**What it does NOT do — and this is the part to understand:** it **does not erase
anything**. The deletion executor (ADR-074) authorizes the Bearer token's own
account and accepts no target parameter, precisely so that no operator path can
drive an erasure of somebody else's account. So an administratively-started
deletion **freezes** the account and then waits: the erasure runs when the user
themselves completes the flow from their own session.

**Recorded residual.** There is therefore no operator path to erase an account
whose owner never returns. That is a deliberate consequence of the self-only
executor, not an oversight, and it is recorded as an open item rather than
worked around: closing it would mean either an executor that accepts a target
account (T-01's exact shape) or an operator surface holding deletion capability,
and neither is authorized. The reversible freeze is what this verb delivers.

### Commands

```powershell
npm run account:lifecycle -- --status --id <uuid>
npm run account:lifecycle -- --start-deletion --id <uuid> --reason operator_deletion_start
npm run account:lifecycle -- --start-deletion --id <uuid> --reason operator_deletion_start --apply
```

### The return path

Before the executor's first destructive step, a `deleting` account can be
returned to `active` — and only through this boundary:

```powershell
npm run account:lifecycle -- --reactivate --id <uuid> --reason deletion_reverted --apply
```

After the executor has started removing storage objects, there is no return
path. Deletion is irreversible from that instant (SH-DELETE-014).

### Stop conditions

- You are considering this to "clean up" an account rather than at the account
  owner's request or under a stated policy → stop. Freezing somebody's account
  is not housekeeping.
- The account is already `deleting` → the command reports `changed:false`.
- **Any doubt about which account this is** → stop. The id in the readback is
  the only identifier that matters; confirm it against something outside this
  terminal before `--apply`.

**Execution record:** _not executed_ — and deliberately so. Every other section here was drilled on 2026-08-04; this one was not, because drilling it means an operator-initiated destruction of a real account, and the deletion machinery it would exercise was already proven end-to-end by the **user-initiated** path (`SIGNUP_HARDENING_DEPLOYED_ACCEPTANCE.md` §2). What stays untested is this section own command and reason vocabulary, not the executor. Recorded as the one gap rather than quietly counted as covered.

---

## 4. The provider-side sign-in ban (SH-ADMIN-005)

**Owner/operator step, not automated.** It needs the GoTrue admin API, which
needs the service-role key at an HTTP boundary — and no product code holds one
(the two guards that pin that keep passing). So it is a recorded command here
rather than a verb in the CLI.

**When to use it:** suspension closes the product; a ban closes *authentication*.
Use it when the account must not hold a session at all — a compromised account,
or an abuse case where a valid session is itself the problem. For an ordinary
"this account is under review", suspension alone is the proportionate control.

### Ban

```bash
curl -X PUT "$SUPABASE_URL/auth/v1/admin/users/<uuid>" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ban_duration":"876000h"}'
```

### Readback (required, both before and after)

```bash
curl "$SUPABASE_URL/auth/v1/admin/users/<uuid>" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

Record the `banned_until` field exactly, before and after. A response that does
not show a future `banned_until` after the PUT means the ban did not take —
record that and stop rather than assuming.

### Lift

```bash
curl -X PUT "$SUPABASE_URL/auth/v1/admin/users/<uuid>" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ban_duration":"none"}'
```

### The residual, stated

A ban blocks new sign-ins; it does not, by itself, revoke a JWT already issued.
The application-side control is what covers that window: the lifecycle status is
read **server-side on every request**, so an already-issued token stops working
against the product on its next request (SH-SUSPEND-003). The two together are
the whole control; neither alone is.

**Execution record:** **DRILLED 2026-08-04**. The ban was applied, `banned_until` read back non-null, and a fresh password sign-in was refused outright — the half of suspension the database cannot enforce. The ban was then lifted as its own step and sign-in succeeded again. Evidence: `SIGNUP_HARDENING_DEPLOYED_ACCEPTANCE.md` §3.

---

## 5. The six orphaned storage objects (pointer)

Not repeated here. `docs/reports/signup-hardening/SH_DELETE_015_ORPHAN_MANIFEST.md` carries the
read-only procedure, the empty manifest, and the rule that deleting any of them
is a separate owner-authorized irreversible step taken only after the manifest
is recorded. Nothing in this runbook deletes a storage object.

---

## 6. What this runbook cannot claim

**Rewritten 2026-08-04, after the first drill.** All three bullets below said
"unproven"; two of them no longer can. What replaced them is narrower and, for
that reason, worth reading rather than skimming.

- **Three of four sections are drilled** — suspension, reactivation, and the
  provider-side ban and its lift — against the deployed project at migration
  parity `202608040074`, on a disposable account, with the readbacks recorded
  in each section. **Administrative deletion-start (§3) is not**, by choice:
  see its own execution record.
- **The deployed worker behaviour is proven.** SH-WORKER-004 and SH-WORKER-005
  were executed: the queued job was skipped across two ticks with no error and
  **no attempt spent**, the heartbeat did not run and produced no notification,
  and after reactivation the same job became claimable and left the queue with
  no re-enqueue. Evidence: `SIGNUP_HARDENING_DEPLOYED_ACCEPTANCE.md` §3.
- **The provider-side ban's shape is now from a transcript**, not from the
  provider's documentation: `banned_until` reads back non-null and a fresh
  password sign-in is refused outright while it holds.

What still cannot be claimed:

- **One drill is not a runbook that has been used in anger.** These executions
  were performed by an agent against a disposable account it created, in a
  session that knew what it expected to see. That is enough to prove the
  commands and readbacks are real; it is not the same as an operator using this
  under time pressure on an account that matters.
- **The reason vocabularies were exercised for one value each**, not
  exhaustively. The database enforces the closed sets and pgTAP covers them;
  this drill walked one path through each.

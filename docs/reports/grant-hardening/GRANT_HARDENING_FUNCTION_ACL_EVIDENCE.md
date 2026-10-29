# Grant hardening — the function side of the same default privilege

**The CLI bump did not create the `anon` grants. It stopped hiding them.**

**Date:** 2026-10-29
**Trigger:** PR #340 (`ci/bump-supabase-cli-for-registry-fallback`), CI run `40911565141`, job `123580603246`
**Scope:** diagnosis only. No fix applied, no migration written — none is authorized.

## Why this document is filed here

`GRANT_HARDENING_EVIDENCE.md` measured what `alter default privileges` hands out on
**tables**. This measures the same rule on **functions**, and the charter already reserved
the ground: its objective is to *"review the other privileges the schema's default rules
hand out unasked"*, and it left open the question of whether
`signup_hardening_grant_census.sql` *"proves slightly less than its sentence claims."*
It now fails outright, for this reason.

**It corrects one charter premise.** The charter records that *"`anon` is completely closed
and is not part of this work."* That is true of tables and **false of functions** — `anon`
holds an explicit EXECUTE grant on eight functions in production. §4 shows the grant is
inert, so the conclusion survives; the premise, as written, does not.

As with the table-side evidence: everything below is a `select`, measured read-only against
the deployed project. Nothing was changed and nothing here is a plan.

---

## Verdict

**There is no new exposure, and there is no anonymous call path.** The bump is safe to
land on the security question it raised.

Two findings, in order of importance:

1. **The seven unexpected functions are all trigger functions and cannot be called at all** —
   by `anon` or by anyone. PostgreSQL refuses a direct invocation before privileges are
   ever consulted. The grant is inert. Proven by direct probe against production, below.
2. **Production already carries every one of these grants, identically.** The hosted
   database (`ulvwzqlpsjyrnqzfxmck`, Postgres 17.6.1.147) was queried read-only and returns
   the *same ten* functions the new CI stack reports, plus an eleventh platform one. So the
   new stack is not drifting away from production — **it is the first stack that matches it.**
   The old local stack was weaker than production, and both tests have been passing
   vacuously for as long as they have existed.

One genuine latent deviation was found, and it is production's, not the bump's:
**`confirm_entry_tasks` is still executable by `service_role` in production** (§6). It is
low-severity but the invariant that migration `202607250054` wrote down is false today.

---

## 1. The complete failing output

The log truncation in the hand-off is resolved. Test 3 of
`supabase/tests/signup_hardening_grant_census.sql`:

```
# Failed test 3: "exactly the two pre-session throttle RPCs and the error sink's
#                 writer carry an explicit anon grant -- offenders are named"
#   have: audit_task_change, claim_auth_event_slot, create_due_task_reminder,
#         finalize_auth_event_attempt, link_interpreted_entities,
#         mark_historical_summaries_outdated, normalize_pending_questions,
#         protect_entry_original, record_error_event, set_updated_at
#   want: claim_auth_event_slot, finalize_auth_event_attempt, record_error_event
```

Ten names. Three are the expected, ADR-recorded decisions. **The seven additions share one
property the truncated list concealed: every one of them returns `trigger`.**

Test 17 of `supabase/tests/rpc_version_retirement.sql` is a different grantee entirely —
`service_role`, not `anon`. It is treated separately in §6.

---

## 2. The mechanism, proven

Supabase's own bootstrap SQL, `migrations/db/init-scripts/00000000000000-initial-schema.sql`
in `supabase/postgres`, line 41:

```sql
alter default privileges in schema public grant all on functions
  to postgres, anon, authenticated, service_role;
```

and again at line 56, this time attributed to a second grantor:

```sql
alter default privileges for user supabase_admin in schema public grant all
    on functions to postgres, anon, authenticated, service_role;
```

So **every function created in `public` inherits an explicit `anon` EXECUTE entry** unless
something revokes it. `proacl` is therefore never NULL, and the census — which deliberately
counts only *explicit* entries and ignores NULL — sees it.

This is confirmed against production rather than assumed. `pg_default_acl` on the hosted
project:

| grantor | schema | objtype | default ACL |
|---|---|---|---|
| `postgres` | `public` | **FUNCTION** | `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `supabase_admin` | `public` | FUNCTION | `{postgres=X/…,anon=X/…,authenticated=X/…,service_role=X/…}` |

And the effect is measurable, not inferred:

```
public functions total .......................................... 149
public functions with NULL proacl (i.e. untouched default) ....... 0
```

**Zero of 149.** Every function in production's `public` schema carries an explicit ACL,
because the default privilege attached one at creation. That is the mechanism, demonstrated
end to end.

> The original suspicion — that migration `202608240102_phase_2s_slice_1_notification_suppressions.sql`
> is involved — is **refuted**. That file never executes `alter default privileges`; it only
> *mentions* it, in a comment explaining why it revokes `service_role` explicitly. The repo
> has in fact known about this platform behaviour since Phase 2S and documented it in three
> places. What nobody noticed is that the same default privilege applies to **functions**,
> not just tables.

## 3. What was ruled out

Three plausible causes were checked and each is **refuted by direct comparison**:

| Hypothesis | Evidence | Verdict |
|---|---|---|
| The newer image added the `ALTER DEFAULT PRIVILEGES … ON FUNCTIONS` statement | `initial-schema.sql` fetched at tags `17.6.1.134` and `17.11.0.006` — **identical** at lines 40–56 | Refuted |
| The newer CLI stopped revoking those defaults | `ApplyApiPrivileges` and `RevokeDefaultDataApiPrivilegesSql` fetched at `v2.106.0` and `v2.122.0` — **byte-identical**; and the newer CLI revokes *more* over time, not less (the flag is removed 2026-10-30 for always-revoked behaviour) | Refuted |
| Our `config.toml` opts into the legacy auto-expose behaviour | `auto_expose_new_tables` is **commented out** at `supabase/config.toml:24`, so the CLI takes the revoking path in both versions | Refuted |

The CLI's counter-revoke is worth recording, because it explains why the old stack was
quiet. `supabase db reset` drops and recreates the database
(`DROP DATABASE IF EXISTS postgres WITH (FORCE)` / `CREATE DATABASE postgres`), and
`pg_default_acl` is a **per-database** catalogue. Whatever survives that recreation, and
whatever the CLI's `revoke execute on functions from anon, authenticated, service_role`
then removes, decides whether a locally created function carries an `anon` entry. The old
local stack ended up with no `anon` entry; production never ran that revoke at all.

**Open sub-question, stated honestly:** which upstream change flipped the *local* outcome
is not isolated. It is not the init SQL, not `ApplyApiPrivileges`, and not our config — all
three were compared directly. The remaining candidates (what the new image seeds into
`template1`, and which role owns functions after recreation) cannot be distinguished
without running the stack, and **there is no Docker on the maintainer's machine**, so no
local experiment was available. This does not affect any conclusion below: the question
that decides the outcome is what production holds, and that was measured directly rather
than inferred.

---

## 4. Severity, per function — queried from the catalogue, not grepped

All eleven rows below are **from production**, via `pg_proc` joined to `aclexplode(proacl)`
filtered on `grantee = 'anon'`:

| Function | Returns | SECURITY DEFINER | `search_path` | Owner | Reachable by `anon`? |
|---|---|---|---|---|---|
| `audit_task_change` | `trigger` | **no** (invoker) | `""` (safe) | postgres | **No** — uncallable |
| `create_due_task_reminder` | `trigger` | **no** (invoker) | `""` (safe) | postgres | **No** — uncallable |
| `link_interpreted_entities` | `trigger` | **no** (invoker) | `""` (safe) | postgres | **No** — uncallable |
| `mark_historical_summaries_outdated` | `trigger` | **no** (invoker) | `""` (safe) | postgres | **No** — uncallable |
| `normalize_pending_questions` | `trigger` | **no** (invoker) | `""` (safe) | postgres | **No** — uncallable |
| `protect_entry_original` | `trigger` | **no** (invoker) | `""` (safe) | postgres | **No** — uncallable |
| `set_updated_at` | `trigger` | **no** (invoker) | `""` (safe) | postgres | **No** — uncallable |
| `rls_auto_enable` *(platform, not ours)* | `event_trigger` | yes | `pg_catalog` (safe) | postgres | **No** — uncallable |
| `claim_auth_event_slot` | `uuid` | yes | `""` (safe) | postgres | Yes — **ADR-080, intended** |
| `finalize_auth_event_attempt` | `void` | yes | `""` (safe) | postgres | Yes — **ADR-080, intended** |
| `record_error_event` | `uuid` | yes | `""` (safe) | postgres | Yes — **2H.2, intended** |

**`create_due_task_reminder` is NOT `security definer`.** The grep-based read that flagged it
was wrong; `prosecdef` is `false`. No trigger function in the set is a definer. Every one of
the eleven sets a safe `search_path`.

**Why that error is worth recording as a method, not just a corrected row.** Two sessions
reached the same wrong answer independently, both by grepping the migration, before the
catalogue settled it. A migration file declares several functions in sequence, and
`security definer` sits on its own line between a `create function` header and the body —
so a grep for the clause, or a windowed `-A`/`-B` read around a function name, attributes
it to **whichever function happens to be nearest in the file**, not to the one that owns
it. The text gives no reliable boundary to anchor on.

`pg_proc.prosecdef` is the only answer that cannot be mis-attributed, and it costs one
query. The same holds for `proconfig` (the `search_path`), `prorettype` (which decided the
entire severity question here) and `proacl`. **Read the catalogue, not the migration, for
any property of a function that is actually deployed** — the migration says what was
intended at one moment in the chain; the catalogue says what is true now, after every later
`create or replace`, `alter` and default privilege has had its say.

### The uncallability is proved, not asserted

A direct-call probe was run against production inside a `DO` block that catches each error
and rolls the whole thing back. Every one refused:

```
audit_task_change                  [trigger]       => 0A000 trigger functions can only be called as triggers
create_due_task_reminder           [trigger]       => 0A000 trigger functions can only be called as triggers
link_interpreted_entities          [trigger]       => 0A000 trigger functions can only be called as triggers
mark_historical_summaries_outdated [trigger]       => 0A000 trigger functions can only be called as triggers
normalize_pending_questions        [trigger]       => 0A000 trigger functions can only be called as triggers
protect_entry_original             [trigger]       => 0A000 trigger functions can only be called as triggers
rls_auto_enable                    [event_trigger] => 0A000 trigger functions can only be called as triggers
set_updated_at                     [trigger]       => 0A000 trigger functions can only be called as triggers
```

PostgreSQL rejects the call on the *return type*, before any privilege check and regardless
of who holds EXECUTE. PostgREST additionally never exposes a trigger-returning function, so
there is no Data API route either. A grant on these functions confers nothing.

The decisive one-line confirmation that the census's **intent** still holds in production:

```sql
-- anon-granted functions in public that are NOT trigger/event_trigger returning
=> claim_auth_event_slot, finalize_auth_event_attempt, record_error_event
```

Exactly the three the census expects. **The property the census was written to defend is
intact in production.** What it actually asserts is a narrower, accidental thing.

---

## 5. Is production affected today?

**Yes — production carries the identical grants, and has from the beginning.** This is the
finding that changes the framing: the defect is not in PR #340.

The same census query run against the hosted project returns the ten CI names plus
`rls_auto_enable` (a Supabase platform event trigger that exists only on the hosted project).
Production's `pg_default_acl` shows the ungranted defaults were never revoked there, which is
expected: the CLI's revoke is a *local-stack* step that mirrors what Studio does at cloud
project creation when the "Default privileges for new entities" toggle is off. This project
was created 2026-07-16 without that toggle.

**But "affected" is not "exposed."** Per §4, nothing anonymous is reachable. There is no
urgent production action here. The honest statement is: production has been in this state
since day one, the CI stack has only just caught up, and the thing the census meant to
protect was never breached.

---

## 6. Test 17 — a real deviation, and it is production's

This one is not about `anon` and is not inert.

`supabase/tests/rpc_version_retirement.sql:170-172` asserts the retired
`confirm_entry_tasks(uuid, integer[])` is not executable by `service_role`. Production:

```
proacl                                   = {postgres=X/postgres,service_role=X/postgres}
has_function_privilege('service_role', …) = true      <-- the assertion is FALSE in production
has_function_privilege('authenticated', …)= false
has_function_privilege('anon', …)         = false
```

The cause is the same default privilege. Migration `202607250054` wrote only:

```sql
revoke execute on function public.confirm_entry_tasks(uuid, integer[]) from authenticated;
```

with a comment stating *"Nothing else is needed: the body, its grants to no other role…"*.
That premise was wrong — the default privilege had already granted `anon`, `authenticated`
**and** `service_role`. Revoking `authenticated` left `service_role` standing. This is the
same class of mistake Phase 2S caught for *tables* and fixed by revoking explicitly; nobody
applied the lesson to *functions*.

**Severity: low, but real.** The function is SECURITY DEFINER with a safe `search_path`, and
it has no remaining caller (only an audit-copy string and the generated types reference the
name). `service_role` *is* a live credential — four Edge Functions hold it
(`process-jobs`, `heartbeat`, `send-push`, `delete-account`) — so this is not a theoretical
grantee. But anything holding that key already bypasses RLS wholesale, so the grant confers
no authority it did not already have. The problem is that a documented invariant
("Execute is revoked from every role") is false, and nothing detected it for fifteen months.

---

## 7. Recommendation

**The census is measuring the wrong thing, and the retirement migration is genuinely
incomplete. Those need different answers.**

### 7a. The census (property 2) — fix the assertion, not the database

Recommended. The property worth defending is *"no anonymous caller can reach a public
function that was not deliberately opened"*. Trigger functions cannot satisfy the
antecedent, so folding them in adds noise, not safety. The assertion should exclude
`prorettype in ('trigger','event_trigger')` and keep the exact-name pin for everything else:

```sql
and proc.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
```

This is **not** weakening a guard to make CI pass. It makes the census *stricter in the way
that matters* and, for the first time, **true of production** — today it only passes because
the local stack happened to be unlike the hosted one. A new callable function granted to
`anon` still fails by name, which is the behaviour the test was written for. It needs no
migration and no grant change.

A revocation sweep across the seven trigger functions is the alternative and is **not**
recommended: it would require a new migration, would have to be re-applied for every future
trigger function forever, and would buy no security, since the functions are already
uncallable.

> **What was actually written, 2026-10-29 — and it goes further than this recommendation.**
> The change landed in the shared checkout on `ci/bump-supabase-cli-for-registry-fallback`
> (uncommitted at the time of writing, authored by the session that owns that branch). It
> carries the filter above **plus a twelfth assertion this report did not ask for**:
>
> ```sql
> select throws_ok(
>   $$ select public.set_updated_at() $$,
>   '0A000',
>   null,
>   'a trigger function cannot be invoked directly, which is what makes the inherited anon grant on one inert'
> );
> ```
>
> That is the better fix, and it repairs this document's weakest link. §4 calls the engine's
> refusal "proved", but the proof was a one-off probe run by hand — nothing in the suite
> would notice if the behaviour ever changed. The whole severity argument rests on that one
> fact, so it belonged in a test. If PostgreSQL ever permits a direct trigger-function call,
> the suite now fails *before* the filter can hide a grant that has become reachable.
>
> Verified read-only against the file rather than taken on report: `plan(12)` with twelve
> assertions, `throws_ok` at line 198, the `prorettype` filter at line 184.

### 7b. Test 17 / `confirm_entry_tasks` — this one needs a migration, so it stops here

The right fix is a one-line explicit revoke:

```sql
revoke execute on function public.confirm_entry_tasks(uuid, integer[]) from service_role;
```

**Not written, and not authorized.** Flagging per the standing constraint. Note that it is
*not* needed to unblock PR #340 if 7a is scoped correctly — but it would also not be
sufficient on its own, because test 17 fails in CI for the same reason production is
affected, so leaving it unfixed leaves CI red. **This is the decision the owner has to
make**, and it is the reason this report stops rather than proceeding.

### 7c. What this means for the grant-hardening initiative

This work belongs in the same migration the charter already reserves, not in a new one. The
charter's standing rule applies unchanged: **a function's privilege posture is a consequence
of what a migration revoked, never a declaration**, and any change here must update the
census by name in the same change.

Two items move from "open" to "answered" by the measurements above:

- *Whether the census moves off `information_schema`* — for the **function** property it
  never used `information_schema`; it uses `aclexplode(proacl)`, and the problem is the
  missing return-type filter, not the catalogue. The table-side question is untouched.
- *Whether `anon` is in scope* — it is, for functions, though §4 shows nothing is reachable.

### 7d. The wider lesson, for whoever authorizes the above

Phase 2S learned that `alter default privileges` means **omitting a grant is not the same as
withholding one** — for tables. The same is true for functions, and the codebase does not yet
know it. Any migration creating a function in `public` that should not be reachable by
`anon`/`authenticated`/`service_role` must revoke explicitly. A census property asserting
that every non-trigger function's ACL is a deliberate list would catch the next one; that is
a candidate for the slice that acts on this report.

---

## Appendix — how to reproduce

Read-only, against the hosted project `ulvwzqlpsjyrnqzfxmck`:

```sql
-- the default privilege that causes it
select pg_get_userbyid(defaclrole) as grantor, defaclobjtype, defaclacl
from pg_catalog.pg_default_acl d
join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public' and d.defaclobjtype = 'f';

-- the census query itself, plus what each function actually is
select p.proname, p.prosecdef, p.proconfig, p.prorettype::regtype
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(p.proacl) a
where n.nspname = 'public' and a.grantee = 'anon'::regrole::oid
order by p.proname;

-- the proof that the default privilege reaches everything
select count(*) filter (where p.proacl is null) as untouched, count(*) as total
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';          -- => untouched = 0, total = 149
```

CI evidence: run `40911565141`, job `123580603246`, read with
`gh api repos/fabiokyrillos/my-brain/actions/jobs/123580603246/logs --allow-escape-sequences`.
Local stack in that run: `docker.io/supabase/postgres:17.11.0.006` (the `ghcr.io` fallback
worked — 56 refusals then successful `docker.io` pulls, which is the part PR #340 set out to
prove).

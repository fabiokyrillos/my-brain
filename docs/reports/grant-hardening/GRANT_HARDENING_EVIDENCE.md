# Grant hardening — preserved evidence

**Measured read-only against the deployed project on 2026-08-25**, at hosted
parity `202608240102` (102 migrations). Every statement in this document is a
`select`. **Nothing was changed, and nothing here is a plan** — the owner
directed that this evidence be preserved *before* the initiative is planned, so
that planning argues against measurements rather than against memory.

Raised by slice 2S.1's hosted deployment (`PHASE_2S_SLICE_01_DEPLOYMENT.md` §5)
and carried as `2S-TRUNCATE-AUTHENTICATED` in `docs/TODO.md`.

**Owner decision, 2026-08-25:** do **not** fix inside Phase 2S and do **not**
create a second migration. This becomes a separate, priority grant-hardening
initiative with a migration of its own.

---

## 0. The one-line finding

**`authenticated` can TRUNCATE 38 tables but can only DELETE rows from 20.** It
can destroy, wholesale, eighteen tables it is not allowed to delete a single row
from — and **TRUNCATE does not respect RLS**, so the owner-scoping that protects
every other path does not apply to it.

---

## 1. Nominal census

### 1a. The full privilege matrix, by role, over 59 `public` base tables

| role | SELECT | INSERT | UPDATE | DELETE | **TRUNCATE** | REFERENCES | TRIGGER | MAINTAIN |
|---|---|---|---|---|---|---|---|---|
| `anon` | 0 | 0 | 0 | 0 | **0** | 0 | 0 | 0 |
| `authenticated` | 53 | 30 | 25 | 20 | **38** | 38 | 38 | 38 |
| `service_role` | 45 | 45 | 45 | 45 | **45** | 45 | 45 | 45 |

Three things this table says that the one-line finding does not:

1. **`anon` is completely closed.** Zero privileges on zero tables. Whatever the
   initiative does, it is not about `anon`.
2. **`service_role` is worse than `authenticated`, and it is uniform.** 45 tables
   with **all eight** privileges and 14 with none — there is no middle. Where a
   migration did not revoke, the role holds everything. The 14 with none are the
   RPC-closed set (`signup_hardening_grant_census.sql`, Property 3).
3. **TRUNCATE, REFERENCES, TRIGGER and MAINTAIN are the same 38 tables** for
   `authenticated` — one set, four privileges, one cause.

### 1b. The 38 tables where `authenticated` holds TRUNCATE

```
agent_preferences, ai_model_pricing, ai_usage_events, attachment_interpretations,
attachments, audit_logs, contexts, conversation_messages, conversations,
entity_aliases, entity_attachments, entity_tags, entries, entry_embeddings,
entry_entities, entry_interpretations, heartbeat_runs, jobs, memories,
notification_suppressions, notifications, organizations, pending_questions,
people, person_contexts, person_projects, person_relationships, profiles,
projects, reminders, summaries, tags, task_contexts, task_dependencies,
task_people, task_projects, tasks, undo_operations
```

**`audit_logs`, `ai_usage_events` and `undo_operations` are in that list.** They
are append-only ledgers. A role that can TRUNCATE an audit log can erase the
record of what it did, which is a different order of problem from the rest.

### 1c. The 21 that are already clean, and why they matter

```
account_deletion_attempts, account_deletion_log, account_lifecycle,
auth_event_attempts, automation_calibration_observations,
automation_category_policies, credential_validation_attempts,
entity_deletion_confirmations, entry_person_candidate_resolutions,
entry_task_candidate_resolutions, error_events, notification_consents,
notification_deliveries, policy_acceptances, product_events, push_subscriptions,
rate_limit_events, reminder_series, scheduled_job_health,
task_command_confirmations, user_ai_credentials
```

These are not clean by luck — each is a table whose migration revoked from
`authenticated` explicitly. **The fix is already practised in this repository**:
13 migrations contain `revoke all on table`, and `reminder_series` is the
cleanest worked example (`authenticated=r/postgres` — SELECT and nothing else).

---

## 2. Exact origin in the default privileges

Two `pg_default_acl` rules produce this, both on `public` tables:

| granting role | schema | object type | ACL |
|---|---|---|---|
| `postgres` | `public` | table | `{postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}` |
| `supabase_admin` | `public` | table | `{postgres=arwdDxtm/supabase_admin, anon=arwdDxtm/supabase_admin, authenticated=arwdDxtm/supabase_admin, service_role=arwdDxtm/supabase_admin}` |

`arwdDxtm` is **all eight** table privileges: `a` INSERT, `r` SELECT, `w` UPDATE,
`d` DELETE, **`D` TRUNCATE**, `x` REFERENCES, `t` TRIGGER, `m` MAINTAIN.

**Every table in `public` is owned by `postgres`** (verified — a single distinct
owner), so the first rule is the operative one for anything this repository's
migrations create.

### The correction this measurement forces

Slice 2S.1's migration comment and acceptance record both say the default hands
over *"REFERENCES, SELECT, TRIGGER and TRUNCATE"* — **four**. That was read from
`information_schema.role_table_grants`, and it is an **undercount**:

- The default grants **eight**, not four. The four named are simply the ones that
  survived on a table whose migration then granted the other four explicitly.
- **`information_schema` cannot see `MAINTAIN` at all.** It is a PostgreSQL 17
  privilege with no SQL-standard equivalent, so it is absent from that view.
  `has_table_privilege` reports it; the census view does not.

**Consequence for the initiative: `information_schema.role_table_grants` is not a
sound basis for a privilege census on PG17.** `pg_class.relacl` /
`has_table_privilege` is. This also means `signup_hardening_grant_census.sql`,
which derives its RPC-closed set from `role_table_grants`, is proving *"no
standard-SQL privileges"* rather than *"no privileges"* — it happens to be
correct today (the seven-way probe in the 2S.1 deployment record confirmed
`service_role` holds nothing on the new table, MAINTAIN included), but the guard
does not assert what its sentence claims. **Recorded, not changed** — it is not
this evidence's job to edit a passing guard.

---

## 3. Reachability — read-only assessment

### 3a. PostgREST

PostgREST maps HTTP verbs to `SELECT`/`INSERT`/`UPDATE`/`DELETE` only. **There is
no verb that emits `TRUNCATE`**, and no request shape that produces one. The
privilege is not reachable through the REST surface directly.

The indirect path is `POST /rpc/<function>`, so the functions matter more than
the tables:

| probe | result |
|---|---|
| functions in `public`/`private` that `authenticated` may EXECUTE | **74** |
| …of those, whose body contains `TRUNCATE` | **0** |
| …of those, containing dynamic SQL (`EXECUTE format/'…'/$…`) | **1** |
| functions `anon` may EXECUTE | 21 |
| SECURITY INVOKER functions with `TRUNCATE` reachable by `authenticated` | **0** |

The single dynamic-SQL function is **`public.rls_auto_enable`**, and it is
**not callable**: it `returns event_trigger`, and PostgreSQL refuses a direct
invocation of an event-trigger function from SQL or PostgREST. It is also benign
— it enables RLS on newly created tables — and see §4, because it is the
precedent the control should be built on.

### 3b. Other surfaces

| surface | state |
|---|---|
| GraphQL (`pg_graphql`) | **not installed.** The grant/placeholder event triggers exist, but the extension is absent from `pg_extension`, so the surface is not live |
| views / materialised views in `public` | **0** — the exposed surface is base tables only |
| installed extensions | `pg_cron`, `pg_net`, `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`, `vector` |
| Realtime / Storage | **not assessed here.** They operate under their own roles and schemas; `public` table privileges for `authenticated` are what this evidence covers |

### 3c. Honest statement of the residual risk

**No reachable path from `authenticated` to `TRUNCATE` was found**, and that is
the accurate finding — it is *not* the same as proving none exists. What is
established: the REST verbs cannot express it, no executable function contains
it, and the one dynamic-SQL function cannot be called. What remains conceivable:
any future function that runs dynamic SQL as invoker, a SQL-injection defect
inside a definer function that ends up executing attacker text as
`authenticated`, or a direct database connection using an `authenticated`-role
credential.

**The privilege is unnecessary either way.** The argument for removing it does
not depend on a live exploit path, and the initiative should not be sold on one.

---

## 4. Controls that would stop a new table inheriting TRUNCATE

**The mechanism already exists in this database.** Event trigger `ensure_rls`
fires `rls_auto_enable` on `ddl_command_end` and enables RLS on every newly
created `public` table. Seven event triggers are installed in total:

```
ensure_rls -> rls_auto_enable [ddl_command_end]
issue_graphql_placeholder -> set_graphql_placeholder [sql_drop]
issue_pg_cron_access -> grant_pg_cron_access [ddl_command_end]
issue_pg_graphql_access -> grant_pg_graphql_access [ddl_command_end]
issue_pg_net_access -> grant_pg_net_access [ddl_command_end]
pgrst_ddl_watch -> pgrst_ddl_watch [ddl_command_end]
pgrst_drop_watch -> pgrst_drop_watch [sql_drop]
```

Three candidate control points, to be weighed at planning rather than chosen here:

1. **Narrow the default itself** — `alter default privileges in schema public
   revoke truncate, references, trigger, maintain on tables from authenticated,
   service_role`. Fixes the cause rather than the symptom, and needs the same
   treatment for the `supabase_admin` rule, which this repository's role may not
   be able to alter.
2. **An event trigger beside `ensure_rls`**, revoking the unwanted privileges at
   `ddl_command_end`. Same shape as a control the database already trusts, and it
   catches tables created by any path.
3. **A CI-time census guard** — extend the pgTAP grant census to assert, over
   *all* `public` base tables, that no non-owner role holds TRUNCATE except by a
   named exception. This is the control that **fails loudly**, and per §2 it must
   be written against `has_table_privilege`, not `information_schema`.

(1) and (2) prevent; (3) detects. They are not alternatives — a preventive
control with no detector is a control nobody notices has stopped working.

---

## 5. Rollback plan

The change is **grant-only**: no DDL on tables, no data movement, no schema
change. That makes rollback unusually cheap and unusually easy to verify.

- **Forward:** `revoke truncate, references, trigger, maintain on table <t> from
  authenticated, service_role;` per table, plus whichever control from §4.
- **Backward:** `grant truncate, references, trigger, maintain on table <t> to
  authenticated, service_role;` — the exact inverse, and the pre-change ACL is
  recorded verbatim in §1a/§2 so the restore target is a measurement, not a
  reconstruction.
- **Pre-capture:** snapshot `pg_class.relacl` for all 59 tables before applying;
  it is the ground truth to diff against and to restore from.
- **Blast radius if wrong:** an application path that legitimately needed one of
  the four privileges would begin failing with `42501 insufficient_privilege` —
  loud, immediate, and reversible by the inverse grant. **No data is at risk in
  either direction.**
- **Verification after rollback:** re-run the §1a matrix and diff against the
  pre-capture snapshot.

---

## 6. Proof that legitimate application operations do not depend on it

| surface searched | result |
|---|---|
| `src/**/*.ts`, `src/**/*.tsx` | **no SQL `TRUNCATE`.** Every hit is the JavaScript helper `truncate()` that shortens display text (`history/event.ts`, `reminders/projection.ts`), a comment, or a documentation line in `library/link-contracts.ts` |
| `supabase/functions/**` (both deployed workers) | **zero hits of any kind** |
| `scripts/**` | one comment; no command |
| `supabase/migrations/**` | **no `TRUNCATE` command anywhere** in the 102-migration chain |
| `supabase/tests/**` | one: `truncate pg_temp_target` in `phase_2r_reminder_recurrence.sql` — a **temporary** table, executed as the test role, unaffected by grants to `authenticated` |

**Nothing the product does requires `TRUNCATE` for `authenticated` or
`service_role`.** REFERENCES, TRIGGER and MAINTAIN should be argued separately at
planning: REFERENCES matters only for creating foreign keys (a migration-time act
performed by the owner), and MAINTAIN only for `VACUUM`/`ANALYZE`/`REINDEX`
(operational, not application). Neither appears in any application path either,
but this evidence deliberately stops at what it measured.

---

## 7. What this evidence does **not** establish

- It does not price the work, sequence it, or choose between the §4 controls.
- It does not assess Realtime or Storage (§3b).
- It does not prove no reachable exploit path exists — only that none was found,
  and that the privilege is unnecessary regardless (§3c).
- It changes nothing. **The 38 tables still hold TRUNCATE as of this writing.**

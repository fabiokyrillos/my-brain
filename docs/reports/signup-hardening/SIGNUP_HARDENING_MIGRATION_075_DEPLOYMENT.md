# `202608040075` applied to the hosted project — deployment evidence

Append-only record. Executed **2026-08-05** against project
`ulvwzqlpsjyrnqzfxmck` under explicit owner authorization.

This migration had to precede the Server Action wiring, not follow it. The
throttle fails **closed** by design — a control that silently fails open is
worse than an outage, because T-14/T-15/T-16 all become unbounded and nothing
reports it — so application code calling a `claim_auth_event_slot` that did not
exist would have taken production authentication down. That ordering is the same
one SH.1's acceptance recorded.

---

## 1. Pre-flight, all five checked before touching anything

| Check | Result |
| --- | --- |
| Target project ref | `ulvwzqlpsjyrnqzfxmck`, from `supabase/.temp/project-ref` **and** `NEXT_PUBLIC_SUPABASE_URL` — the two agree |
| Hosted head is exactly `202608040074` | confirmed by `supabase migration list --linked`; every prior version matched local, remote and file |
| Exactly one migration pending | `202608040075_auth_event_attempts.sql`, committed at `643ab3f`, merged in PR #84 |
| Public signup disabled | `disable_signup = true` in the pre-change readback |
| No unrelated configuration in scope | `db push` applies migrations only — it does not send `config.toml`, which is `config push`. Proven rather than asserted: see §3 |

## 2. The apply

```
supabase db push --linked
  • 202608040075_auth_event_attempts.sql
Applying migration 202608040075_auth_event_attempts.sql...
Finished supabase db push.
```

The migration's own postcondition block ran as part of it. It raises on forced
RLS missing, on any client-role table privilege, on a missing `anon`/
`authenticated` execute grant, on a `service_role` execute grant, and on the
sweep or the cap being reachable by a client role. It did not raise.

## 3. Post-apply verification

### (1) Parity

`supabase migration list --linked` → `202608040075 | 202608040075 | 202608040075`.
**Hosted head is now `202608040075`.**

### (2) The RPC is reachable

`POST /rest/v1/rpc/claim_auth_event_slot` no longer answers `PGRST202`.

### (3) The invalid-ceiling probe is refused, and writes nothing

Four deliberately malformed calls as `anon`, the role the Server Actions will
use:

| Probe | Response |
| --- | --- |
| `p_identifier_ceiling = 0` | `400` / `22023` / `"Invalid ceiling"` |
| `p_ip_ceiling = 2147483647` (over the SQL cap) | `400` / `22023` |
| `p_kind = 'logout'` | `400` / `22023` |
| `p_identifier_hash = 'victim@example.test'` | `400` / `22023` |

`select count(*) from public.auth_event_attempts` → **0**. Every refusal wrote
nothing, so validation genuinely precedes the insert and a rejected call cannot
burn a slot.

> **A correction worth keeping.** The first attempt at this count asked
> PostgREST as `service_role` and got `403`. That is *correct* behaviour —
> ADR-080 grants no table privilege to any role, `service_role` included — but
> it made the check vacuous: it compared `"?"` with `"?"` and reported a pass.
> The count above comes from the Management API query endpoint, which runs as
> `postgres`. A verification that cannot fail is not a verification.

### (4) The application is healthy

`/pt-BR/auth/login`, `/pt-BR/auth/register`, `/pt-BR/auth/recover`,
`/en/auth/login` → all `200`.

### (5) Signup is still disabled

`disable_signup = true`, unchanged (§3 below proves *nothing* changed).

### (6) No unrelated hosted configuration moved

The full Auth configuration was read back before and after and diffed:
**byte-identical**, 239 printed fields. `db push` changed schema and only schema.

### Deployed posture, read from the catalog

| Property | Value |
| --- | --- |
| Forced RLS | `true` |
| Policies | 1 (`auth_event_attempts_no_client_access`) |
| Table grants held by client roles | **0** — all 7 belong to `postgres`, the owner |
| `claim_auth_event_slot` execute | `anon`, `authenticated`, `postgres` |
| `finalize_auth_event_attempt` execute | `anon`, `authenticated`, `postgres` |
| `prune_auth_event_attempts` execute | `postgres` only |
| `service_role` claim attempt | `403` / `42501` `permission denied for function` |
| Retention job `sh-prune-auth-event-attempts` | scheduled |

ADR-080's boundary survived the deploy exactly as written: `anon` can claim,
`service_role` cannot, and nobody holds the table.

---

## 4. What this does *not* establish

- **Genuine concurrency.** Two claims racing at a ceiling boundary is a property
  of the advisory locks that no single-session test can show. The deployed
  concurrency script is the instrument for it.
- **That any application code uses this.** At the time of writing, nothing calls
  the RPC. The ledger is empty and stays empty until the wiring ships.
- **Anything about email.** Custom SMTP is still absent; `rate_limit_email_sent`
  is still the default `2/hour`.

Public signup was closed before this operation and is closed after it. No
retention purge was executed; the sweep is scheduled, not run by hand.

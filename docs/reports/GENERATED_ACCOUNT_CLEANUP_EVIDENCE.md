# Generated account cleanup — evidence

**Redacted pre-deletion record and post-deletion verification for one abandoned production
test account.** Removal authorized by the owner on 2026-07-31 after the read-only
investigation recorded in `G05_HOSTED_SIGNUP_CLOSURE_EVIDENCE.md` §7.

- **Project** — `my-brain`, ref `ulvwzqlpsjyrnqzfxmck`.
- **Date** — 2026-07-31.
- **Scope** — exactly one account. No other account was touched.
- **Credential handling** — the Supabase **Management API token was not accessed or
  extracted**. The service-role key was obtained through the linked CLI's own
  `projects api-keys` command, the mechanism `scripts/linked-supabase.mjs` uses for every
  remote smoke in this repository. No key value appears in this document or in any commit.

---

## 1. Subject

| Field | Value |
| --- | --- |
| Auth user id | `33ffd5bf-55f4-43a0-9935-107f9b746c62` |
| Address | `codex.cost.1784238790334@…` (local part retained because it is the evidence; domain redacted) |
| Created | `2026-07-16T21:53:49.012752Z` |
| Email confirmed | **yes** |
| Last (and only) sign-in | `2026-07-16T21:56:55.660678Z` — a **3-minute** lifetime |
| Lifetime since | 15 days idle |

## 2. Owned rows before deletion

| Table | Rows |
| --- | --- |
| `profiles` | 1 |
| `agent_preferences` | 1 |
| `entries` | **1** |
| `ai_usage_events` | **2** |
| `heartbeat_runs` | **358** |
| `tasks` | 0 |
| `memories` | 0 |
| `jobs` | 0 |
| `notifications` | 0 |
| `conversations` | 0 |

**No business or user data was found beyond the known cost-test rows.** The single `entries`
row and two `ai_usage_events` rows are consistent with a 3-minute session exercising the AI
cost dashboard; there are no tasks, memories, conversations or notifications. `profiles` and
`agent_preferences` are created automatically by `handle_new_user` (`202607160001:50`) and
are not user-authored.

## 3. Reason for classification

| Signal | Finding |
| --- | --- |
| Local-part suffix | `1784238790334` decodes as epoch-ms → `2026-07-16T21:53:10Z`, **39 seconds before** the account was created. A `Date.now()` stamp taken at script start |
| Repository fixture creators | **None uses a `codex.cost` prefix** — zero hits across all sources. Current creators use `crypto.randomUUID()` with `@example.com` / `@example.test` / `@example.invalid`, never a `Date.now()` suffix and never a real deliverable domain |
| Creation context | Same day as `202607160015_ai_routing_costs.sql`; the local part contains `.cost`. Consistent with the Sprint 1.5 "Finish AI Routing and Cost Control" work |
| Confirmation | `email_confirmed_at` is set — a link was clicked in a real inbox, which **no fixture script in this repository can do** |

**Classification: abandoned manual test account — legitimate at creation, residue since.**
Created semi-automatically by a human during the cost-control work, used for three minutes,
never returned to. The owner confirmed it as such and authorized removal.

## 4. Prior fixture detectors treated it as a real user

This is recorded because it is the part a future reader would otherwise mis-trust.

- `PHASE_2F_SLICE_06_ACCEPTANCE.md:99` — "**0** fixture-prefix survivors in `auth.users`
  over **20** prefixes (**2 real users in the project**)".
- `PHASE_2F_SLICE_05_ACCEPTANCE.md:155` — "2 users in the project, 4 tasks — **all
  pre-existing real data**".

Both closeouts ran a 20-prefix fixture detector across `auth.users` and **counted this
account as one of the real users.** They were not wrong by their own rule — the account
matches no fixture prefix this repository generates — but the rule could not see a
machine-generated local part on a real domain. **The detector's proxy was narrower than the
property**, which is the same class of finding as the A13 guard corrected in this branch.

## 5. The ongoing cost, which is why it was not left alone

**358 `heartbeat_runs` rows** — one per hour since 2026-07-16, and growing indefinitely.

`SECURITY.md:171` records that the Phase 2F closeout **refused** to mint a fixture user in
production for exactly this reason: *"`run_all_heartbeats` inscribes the user, writing a
`heartbeat_runs` row per tick while it exists."* The phase declined to create one such
account. An older one had been running the whole time.

## 6. Deletion

Performed through the supported Auth Admin path:

```
DELETE /auth/v1/admin/users/33ffd5bf-55f4-43a0-9935-107f9b746c62
```

`user_id references auth.users(id) on delete cascade` carries the owned rows.

**`DELETE` returned `HTTP 200`.** No non-cascading row and no foreign reference blocked it,
so the stop-and-report condition was not reached.

## 7. Executed verification — owned rows, before and after

Seventeen tables were counted, not the six named in the pre-deletion record. The extra
eleven exist to prove absence where absence was expected, so the sweep cannot pass by only
looking where rows were known to be.

| Table | Before | After |
| --- | --- | --- |
| `profiles` | 1 | **0** |
| `agent_preferences` | 1 | **0** |
| `entries` | 1 | **0** |
| `ai_usage_events` | 2 | **0** |
| `heartbeat_runs` | 358 | **0** |
| `audit_logs` | **1** *(not in the pre-deletion record — found by the wider sweep)* | **0** |
| `entry_interpretations` | **1** *(likewise)* | **0** |
| `tasks` | 0 | 0 |
| `memories` | 0 | 0 |
| `jobs` | 0 | 0 |
| `notifications` | 0 | 0 |
| `conversations` | 0 | 0 |
| `attachments` | 0 | 0 |
| `reminders` | 0 | 0 |
| `undo_operations` | 0 | 0 |
| `pending_questions` | 0 | 0 |
| `product_events` | **unreadable (403)** | **unreadable (403)** — see §7.1 |

**Two tables carried rows the §2 record did not name** — `audit_logs` and
`entry_interpretations`, one row each, both consistent with the single captured entry being
interpreted. The wider sweep found them; the narrower one would not have. Both are now zero.
This is recorded rather than quietly corrected, because §2 was written before the sweep ran.

### 7.1 `product_events` is unreadable by design, and its cascade is proven compositionally

`service_role` holds `revoke all` on `public.product_events`, and the Phase 2F closeout
**asserts that refusal** as a control (`SECURITY.md` §2F.6: *"`service_role` **não** lê
`public.product_events` — recusado, asserido"*). The `403` is that control working, not a
verification gap.

Absence is therefore proven the same way `PHASE_2F_SLICE_06_ACCEPTANCE.md` proves it — as a
**composition, declared as a composition**: the asserted refusal, plus zero surviving owner
in `auth.users` (§7.2), plus `user_id references auth.users(id) on delete cascade`
(`202607170024:10`) asserted by pgTAP in CI. **No stronger claim is made.**

### 7.2 Auth user census

| | Users |
| --- | --- |
| Before | 3 |
| **After** | **2** — `china.kbp@…` (owner, created 2026-07-16), `teste@mybrain.com` (created 2026-07-30) |

Target absent: **true**, asserted by id. Both surviving accounts are unchanged: same ids,
same `created_at`. **No other account was touched.**

## 8. Result

| Check | Result |
| --- | --- |
| Auth user absent | **PASS** — asserted by id |
| `profiles` / `agent_preferences` absent | **PASS** |
| `entries` absent | **PASS** |
| `ai_usage_events` absent | **PASS** |
| `heartbeat_runs` absent | **PASS** — the per-hour row generator is stopped |
| No foreign rows remain | **PASS** across 16 readable tables; `product_events` per §7.1 |
| Legitimate accounts unchanged | **PASS** — 2 remain, ids and timestamps identical |
| No cleanup fixture remains | **PASS** — the deletion created none |

**The project now holds two accounts, both real, and no account created by automation.**

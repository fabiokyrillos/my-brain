# Phase 2F — Slice 2F.2 acceptance report

Deployment session executed 2026-07-29 against the linked project **`ulvwzqlpsjyrnqzfxmck`** (`my-brain`, `us-west-2`, `ACTIVE_HEALTHY`). Every gate below was **executed**; nothing is cited from injected-client or by-construction evidence.

---

## 1. Merge commit and CI

| | |
|---|---|
| PR | [#24](https://github.com/fabiokyrillos/my-brain/pull/24), merged 2026-07-29T12:41:42Z |
| **Merge commit SHA** | **`47c555ea5c01ef6ef4f417c2dc8a81d97385e27b`** |
| CI run on that exact SHA | [`30452675573`](https://github.com/fabiokyrillos/my-brain/actions/runs/30452675573) |
| `application` (lint, types, unit, build) | **success** |
| `edge worker` (deno types, deno tests) | **success** |
| `database and journey` (empty-DB chain, full pgTAP, db lint, foundation e2e desktop + Pixel 7) | **success** |

## 2. Remote migration parity (2F-OPERATIONS-001)

| | Value |
|---|---|
| **Pre-deployment** | `202607280061` — `supabase migration list --linked`, every row local == remote, no gap |
| **Post-deployment** | `202607280061` — re-run after the session, unchanged |

Slice 2F.2 ships no migration, so an unchanged parity is the correct result and is what was observed.

## 3. Deployment session

The merged code was built (`next build`, "Compiled successfully") at the merge commit and served with `next start` as a **production build**, then driven by Playwright against the deployed project.

**One environmental note, resolved without touching the user's environment:** port 3000 was held by a Next.js server for this repo started 2026-07-23 — six days stale, and therefore pre-2F.2 code. Reusing it would have reported a 2F.2 result while exercising something else, so the session ran on port 3100 under a temporary Playwright config with `reuseExistingServer: false`. That config was deleted afterwards; the stale process was left untouched.

## 4. Authenticated journeys — 32/32 passed

`node scripts/online-playwright.mjs --config=<session> e2e/work-actions.spec.ts`, real `ONLINE_SUPABASE_*` credentials resolved from the linked project. **No test skipped.**

| Project | Locale | Result |
|---|---|---|
| desktop (Desktop Chrome) | pt-BR | 6/6 |
| desktop | en | 6/6 |
| mobile (Pixel 7) | pt-BR | 6/6 |
| mobile | en | 6/6 |
| desktop — cross-cutting (undo, two-owner, live event, keyboard) | — | 4/4 |
| mobile — cross-cutting | — | 4/4 |
| **Total** | | **32 passed, 0 failed, 0 skipped (4.4m)** |

## 5. All four actions routed through the real entry point (step 7)

Each executed by clicking the rendered button in the browser, then read back from the deployed database:

| Action | Journey | Deployed-database result |
|---|---|---|
| `complete_task` | "completing a task applies…" (×4 locale/viewport) | `status = completed`, `completed_at` non-null |
| `wait_task` | "wait and resume leave every reminder untouched" (×4) | `status = waiting` |
| `resume_task` | same journey, second half (×4) | `status = todo` |
| `reopen_task` | "reopen_task routes from completed back to todo" (×4) | `status = todo`, `completed_at` null |

The `reopen_task` journey also asserts 2F-SURFACE-009 at the surface: a completed row offers **only** reopen (`Complete` has count 0).

## 6. Two-owner proof, non-vacuous (step 8)

Executed in this order, as **real end users** via PostgREST with each user's own access token — never `service_role`, because the tenant boundary under test is an `auth.uid()` predicate inside a `security definer` body:

1. **The owner's task resolves.** The owner is signed in, the row is visible on `/app/work`, and the owner's own `list_task_command_candidates` call returns the row (`task_id` present). The positive assertion comes **first**, so the denials below cannot pass vacuously.
2. **The stranger cannot resolve it.** The identical RPC with identical arguments, called with the stranger's token, returns `200` with the owner's `task_id` **absent**.
3. **No fallback read exists.** The stranger's direct `SELECT` on that task returns `[]` — RLS gives no path by which a pre-state could be assembled outside resolution.
4. **The stranger cannot apply.** A direct `apply_task_command` call by the stranger, bypassing the surface entirely with a hand-built nineteen-key pre-state, is refused (non-`200`).
5. **The owner's task is unchanged** afterwards (`status = todo`).

## 7. Audit, undo row, and executed undo (step 9)

- **Audit actor.** After a successful Work apply, `audit_logs` filtered to the task returns rows and the most recent carries **`actor = 'user'`**.
- **Undo row.** `undo_operations` for that task contains a row with `status = 'available'` whose `operation_key` contains the **`taskcmd-v1:`** namespace — i.e. the row the RPC reserved, not an unrelated one.
- **Undo executed.** `public.undo_operation(p_undo_id)` called **as the owner** through the deployed contract returned `200`, and the task went from `completed` back to **`status = todo` with `completed_at` null**. The compensation is real, not merely recorded.

## 8. Reminder behaviour against real rows (step 10)

**Cancellation** (×4 locale/viewport):

1. A task and a `scheduled` reminder are created on the deployed project.
2. The reminder is **positively asserted `scheduled` before** the completion — the assertion after it cannot pass by finding nothing.
3. The task is completed **through the Work surface** in the browser.
4. The reminder is read back: **`status = cancelled`**.

**Non-interference, both directions** (×4):

1. A task with a `scheduled` reminder; the full reminder row (`status`, `remind_at`) is captured first.
2. `wait_task` executed through the surface → task `waiting`, reminder row **byte-identical** to the captured value.
3. `resume_task` executed through the surface → task `todo`, reminder row **still byte-identical**.

## 9. Live analytics observation (step 11)

Read from `public.product_events` on the deployed project **as the owner** (see §11.3):

- `task_command_applied` — `commandOrigin = 'work'`, `applyRoute = 'direct'`, `outcomeCategory = 'applied'`, `surface = 'task_command'`.
- **No content leak:** the task title appears in no emitted payload, checked across every returned event.
- `task_status_changed` continues alongside it with `surface = 'work'` and property keys exactly `['fromStatus', 'toStatus']`.

No migration was applied for any of this — `commandOrigin`'s `'work'` value was already allowlisted at `202607280061:434`.

## 10. Cleanup (step 13)

`npm run test:remote:2e:cleanup` — **passed**:

- `disposableUsers: 0`
- every orphan count `0` across all 17 scanned tables (entries, interpretations, jobs, attachments, pending_questions, tasks, projects, contexts, people, all four relation tables, candidate resolutions, reminders, undo_operations, ai_usage_events)
- `remoteSmokeObjects: 0`, `tablesNotYetDeployed: []`
- `task_command_confirmations` is not orphan-scanned because `service_role` cannot read it — that refusal is asserted, not assumed, and an orphan there is structurally impossible under the cascade.

Additionally verified directly: **0 remaining `codex-work-2f2*` auth users** (total auth users on the project: 2, both real accounts).

## 11. Findings from the deployment session

Three defects were found — **all three in the test harness, none in the shipped product.** The merged application code was not modified.

1. **English sign-in label.** The spec used `getByLabel("Email")` for `en`; the login form renders the literal **`E-mail` in both locales**. All ten English journeys timed out on sign-in in the first run. Fixed.
2. **The title-drift expectation was wrong, and the product was right.** The spec asserted that a *total* rename still applies. It refuses — and **PRD §5 says so explicitly**: *"clicked id absent (**renamed beyond token overlap**, status now ineligible, or outside the result window) → localized refresh refusal."* Permissive drift (2F-SURFACE-004) governs **selection**: a title mismatch never causes selection to reject a row that is *in* the resolution result. A rename that destroys token overlap removes the row from an `auth.uid()`-scoped resolution keyed on the stale title, so there is nothing to select. The spec now asserts **both** sides: a drift retaining overlap applies and renders the current title; a rename beyond overlap refuses **and writes nothing** (`status` still `todo`, `completed_at` still null).
3. **`product_events` is not readable by `service_role`.** The observation query returned `42501`. The table grants SELECT to `authenticated` under RLS only; the existing Phase 2E product-events smoke reads it the same way. The observation is now owner-scoped, which is also what 2F-MEASURE-002's exclusion mechanism (iii) relies on.

**The merged spec was also incomplete** for the gates required here: it had no `reopen_task` coverage, no two-owner proof, no executed undo, and no live event observation. All four were added in this session and all pass.

## 12. Working tree and scope

- Working tree clean at the end of the session; the temporary Playwright config, `test-results/` and `playwright-results.json` were removed.
- **No 2F.3 or later-slice work was started.** No migration, no grant change, no new RPC, no manual-creation change. `git diff` against the merge commit touches exactly one file: `e2e/work-actions.spec.ts`.
- The only production-code change in this session: **none**.

## 13. Gate summary

| Step | Gate | Result |
|---|---|---|
| 1–2 | PR merged; merge SHA recorded | ✅ `47c555e` |
| 3 | All three CI jobs on that SHA | ✅ run `30452675573` |
| 4 | Pre-deployment parity | ✅ `202607280061` |
| 5 | Merged code exercised in the deployment session | ✅ production build, port 3100 |
| 6 | `work-actions.spec.ts` with real credentials, 4 combinations | ✅ 32/32, none skipped |
| 7 | All four actions routed | ✅ complete / wait / resume / reopen |
| 8 | Two-owner proof, non-vacuous | ✅ 5 ordered assertions |
| 9 | Audit actor / undo row / executed undo | ✅ `actor='user'`, `taskcmd-v1:` row, undo returned the task to `todo` |
| 10 | Reminder cancellation + non-interference | ✅ both directions |
| 11 | Live `commandOrigin='work'`, `applyRoute='direct'`, no content | ✅ |
| 12 | Post-deployment parity | ✅ `202607280061`, unchanged |
| 13 | Cleanup verifier, zero residue | ✅ plus 0 leftover fixture users |

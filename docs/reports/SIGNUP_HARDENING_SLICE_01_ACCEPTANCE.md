# Signup Hardening — SH.1 acceptance record

Slice: **SH.1 — account lifecycle foundation.** Branch `codex/sh-slice-1`, from `main` at
`a05cfb5` (the SH.0 merge). **Migrations: 2** — `202608040070` (the table, machine, seed,
backfill, SH-EXPOSURE-004) and `202608040071` (the predicate wiring) — exactly the plan §1
allocation; `AUTHORIZED_MIGRATION_HEAD` moved to `202608040071` in the same change.

## 1. What exists now that did not

- **`public.account_lifecycle`** — one row per account (`active`/`suspended`/`deleting`),
  closed reason and actor vocabularies (free text refused by CHECK, not convention),
  forced RLS, `authenticated` SELECT-own only, no client writes. Transitions are legal
  only through the state-machine trigger (declared machine, `P0001` /
  `ACCOUNT_LIFECYCLE_ILLEGAL_TRANSITION`) and **every transition writes its `audit_logs`
  row in the same statement** — admin-action-without-audit is structurally impossible one
  slice before the admin functions exist. `handle_new_user` seeds the row; the backfill
  covers every existing user and the migration fails if anyone is left stateless
  (SH-LIFECYCLE-001…004).
- **The predicate, wired where the trust lives** (SH-LIFECYCLE-005/006/007): capture and
  reprocessing refuse non-active accounts with the declared vocabulary
  (`P0001`/`ACCOUNT_LIFECYCLE_NOT_ACTIVE`, distinct by construction from the throttle and
  quota vocabularies SH.5/SH.6 will add); all **three** claim paths carry the
  byte-identical owner-active predicate (`claim_attachment_job`'s FROM gained the alias
  `job` to make identity literal); the heartbeat skips a non-active user before reading
  any of their data. Six functions reproduced in full, no signature changes (ADR-057).
- **The app-side gate** (SH-LIFECYCLE-008/009/010): `requireUser` — the single
  authenticated entry point, 192 call sites — resolves lifecycle server-side per request
  and sends every non-active account to the new `/[locale]/account-state` route, which
  renders **no product surface** and offers **exactly sign-out** (the existing tested
  `signOut` action). `assertActiveAccount` carries the same fail-closed gate into the
  **19 inline-auth action sites across seven feature modules** (agent ×7, byok ×3,
  interpretations ×3, tasks ×3, capture, chat, profile), so every Server Action refuses
  server-side; the DB predicates remain the deeper boundary. Fail-closed throughout: an
  unreadable or absent row is non-active, and the surface says "unavailable" rather than
  inventing a suspension. Copy ships as a typed module in both locales (SH-COPY-001); the
  locale-ternary ceiling did not move.
- **SH-EXPOSURE-004 executed:** `handle_new_user` lost client-role EXECUTE (trigger
  execution unaffected), asserted in the migration postcondition; the grant census's F-19
  pin flipped to the closed state in the same slice, as its own comment demanded.

## 2. Evidence

- **pgTAP `signup_hardening_account_lifecycle.sql` — 28 assertions.** The fixture
  discriminates on lifecycle alone (both accounts hold active credentials and well-formed
  jobs). Executed grant probes; legal and illegal transitions with the audit row checked
  field by field; capture/reprocess called **directly as the suspended user** (T-11) with
  the no-partial-write count; the drain claiming the active owner then finding nothing;
  the suspended owner's job left `pending:0` (SH-SUSPEND-004's foundation); the direct and
  attachment paths refusing the same job; positive controls on every axis; the heartbeat
  skip with zero run rows.
- **Unit:** the central gate called directly (12 cases across `requireUser` /
  `assertActiveAccount`, including both fail-closed arms); suspended-path refusals proven
  by direct action calls in capture, tasks and profile (redirect asserted, no mutation
  call made); copy completeness and enum-leak pins; **SH-WORKER-003** asserting the
  predicate byte-identical across the three claim functions in the wiring migration's
  text and pinning the refusal vocabulary count.
- **The cascade drill (SH.0) covers the new table unasked:** `handle_new_user` seeds
  `account_lifecycle` for the drill's fixture users, and the drill's completeness scan
  enumerates the table at run time — T-32 verified live by the first table added after
  the drill.
- Local gates: lint 0, typecheck 0, build exit 0; full vitest recorded in §4. Subagent
  verification during the wiring: the 9 affected test files pass 149/149, and the
  project-key/worker guards pass 32/32.

## 3. Adversarial review — findings fixed or recorded

1. **RECORDED, deployment-ordering hazard (the A-1.2 class):** once this slice's app code
   runs against a database **without** migrations 070/071, the fail-closed gate sends
   every user — including the owner — to the account-state surface, because the lifecycle
   read errors. Repository and CI are consistent (CI applies the chain from zero); the
   hazard is the **hosted** project: apply `202608040070`/`202608040071` before running
   updated app code against it. Recorded in the handoff §18 as the SH.1 deployment note;
   the migrations themselves are behind SH-GD.1 as planned.
2. **RECORDED:** two feature action modules carry no `auth.getUser` site (`assistant`,
   `product-analytics`) — they hold no direct mutation path of their own; their writes go
   through modules that are gated. The 19-site census is of every `getUser` site in
   `src/features/*/actions.ts`, verified by grep during the wiring.
3. **RECORDED:** `audit_logs.actor` has a closed `user/agent/system` set, so the
   operator's transitions audit as `system` with `changed_by='operator'` carried in
   `after_state` — no information lost, no CHECK widened. SH.3 may revisit the actor
   vocabulary by its own migration if the distinction must be first-class.
4. **RECORDED:** the machine permits `deleting → active` (SH-DELETE-014's pre-executor
   return path). That it is operator-only is enforced by writers (no client role can
   UPDATE; SH.3's DEFINER functions become the only mutators), not by the machine —
   stated in the migration comment so nobody reads the machine as the authorization.
5. **FIXED DURING AUTHORING:** three pgTAP claim assertions compared a `jsonb` against a
   bare `null`, which pgTAP's polymorphic `is()` cannot type — cast to `null::jsonb`
   before first push (the BYOK static-scrutiny discipline; Docker is unavailable
   locally).
6. **RECORDED:** `requireUser` now costs one extra PK lookup per authenticated request.
   Accepted: the read is indexed, the alternative (caching) would make suspension
   take effect later than one round-trip, and SH-SUSPEND-003 wants exactly the
   per-request read.

## 4. CI evidence

- Local gates at the PR boundary: lint **0**, typecheck **0**, build **exit 0**, full
  vitest **3652 passed, 2 failed** — exactly the standing CRLF pair in
  `sql-reachability.test.ts` (present on `main`, green in CI; `PRODUCT_UX_CLOSEOUT.md`
  §8). Two integration suites the new audit writer legitimately reddened were fixed in
  this slice and are green: the history vocabulary (`account_lifecycle_transition` /
  `account_lifecycle` copy in both locales, category `lifecycle`, not linkable) and the
  2F cleanup partition (`account_lifecycle` excused with its cascade anchor
  `202608040070:40`); `SECURITY.md`'s chain-head line moved to `202608040071` with the
  deployment-ordering hazard stated inline.
- **PR #74. PR-head CI run `30909345700` (head `3ceb2e5`): ALL THREE JOBS GREEN on the
  first attempt** — the `database` job applied both migrations from an empty database and
  shows `signup_hardening_account_lifecycle.sql .. ok` (28/28), alongside the SH.0 drill
  and census (the drill now covering `account_lifecycle` via the trigger seed, T-32
  exercised live). SH-LIFECYCLE-001…007 are therefore EXECUTED in CI, not merely
  authored.
- Merge SHA and merge-SHA CI run: recorded in `AUTONOMOUS_LOOP_HANDOFF.md` §18 at the
  merge boundary, per the standing discipline.

## 5. What SH.1 does not claim

No admin functions exist (SH.3): today no writer can reach `suspended` except direct SQL
by the platform operator role, which is the pre-SH.3 posture, not a product path. No
deletion surface exists (SH.2). The suspended-surface copy is foundation-grade; SH.3's
SH-COPY-002 owns the final wording and the e2e over a genuinely suspended fixture. No
deployed-environment claims are made: both migrations await the SH-GD.1-gated deployment
session, and every deployed-behavior requirement (SH-WORKER-004/005) belongs to SH.3's
acceptance against disposable accounts.

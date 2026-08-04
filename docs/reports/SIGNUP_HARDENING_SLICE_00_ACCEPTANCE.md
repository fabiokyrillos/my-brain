# Signup Hardening — SH.0 acceptance record

Slice: **SH.0 — census, contracts, pre-code gates.** Branch `codex/sh-slice-0`, from `main`
at `45e0f69` (the planning merge). **Migrations: 0**, exactly the plan §1 allocation; the
head stays `202608010069` and `AUTHORIZED_MIGRATION_HEAD` is untouched.

This is the first Signup Hardening implementation slice, executed only because the owner
approved the planning package on 2026-08-04. The approval itself is part of this slice's
deliverables, recorded append-only rather than retrofitted: `ADR-077`, PRD Amendment `P-1`,
plan Amendment `A-1`, and the ADR-073…ADR-076 status flips (each keeps its Proposed date on
the status line — the planning history is not rewritten as always-approved).

---

## 1. Gates

| Gate | What SH.0 required | State |
| --- | --- | --- |
| **A1 — approval recorded append-only** | ADR-077 (reproducing the approved quota/retention values verbatim); PRD status + P-1; plan status + A-1; ADR-073…076 Proposed → Accepted with history retained | **DONE** |
| **A2 — SH-G0.4** | owner-signed quota/retention value sheet | **SATISFIED** — the §20 values were approved **as proposed**; recording them is acceptance, not change. They are repository constants under the SH-QUOTA-010 parity contract, never migration content |
| **A3 — SH-DELETE-001 / SH-G0.2** | the cascade drill authored, non-vacuous, in the CI `database` job | **DONE** — `supabase/tests/signup_hardening_cascade_drill.sql`, 20 assertions; CI evidence in §5 |
| **A4 — SH-EXPOSURE-002 / SH-G0.3** | the grant-census skeleton | **DONE** — `supabase/tests/signup_hardening_grant_census.sql`, 9 assertions; CI evidence in §5 |
| **A5 — SH-CAPTCHA-001** | CAPTCHA vendor chosen by accepted ADR before any integration code | **SATISFIED** — ADR-076 Accepted (Cloudflare Turnstile); no integration code exists yet, by design |
| **A6 — SH-RETENTION-001** | retention schedule owner-accepted before SH.6 | **SATISFIED** — plan §7 approved as proposed; approval is explicitly **not** purge authorization |
| **A7 — SH-STORAGE-006** | no-scanner posture recorded, compensating controls named | **SATISFIED** — ADR-077 item 9; the `SECURITY.md` open item stays open, owned by the rollout gate |
| **A8 — signup pinned disabled** | `disable_signup` remains `true`, no change made or scheduled by this initiative | **SATISFIED** — no hosted config was touched this slice; G-0.5 evidence stands; SH-ROLLOUT-005 stays post-initiative, owner-only |
| **A9 — standing discipline** | own branch, thematic commits, three CI jobs green on PR-head, exact merge-SHA CI green, preserved branch | §5 |

**Stop conditions consulted and not triggered:** the drill is expected to pass on the
census's reasoning (every involved table also cascades from `auth.users` directly), and if
CI instead shows the delete blocked by a composite FK, that is the plan's declared valid
finding — the loop then stops for an owner budget-amendment decision rather than changing
any FK. SH-GD.1…SH-GD.4 (deployment tier) were not needed: nothing in SH.0 touches a shared
environment.

## 2. The cascade drill — what it proves and how it cannot rot

`supabase/tests/signup_hardening_cascade_drill.sql`, 20 assertions, four sections.

- **Row-complete is proven, not intended.** One populator (`pg_temp.sh_populate`) inserts a
  row into every insertable user-owned table — 39 direct inserts; `profiles` and
  `agent_preferences` arrive via the `handle_new_user` trigger on the `auth.users` insert.
  Two independent by-name detectors close the two ways completeness can silently fail:
  the populator catches each table's insert failure in its own exception arm and returns
  `table: reason` (so an unpopulatable table fails the calibration assertion **by name**),
  and a completeness scan (`pg_temp.sh_missing_rows`) enumerates the catalog at run time
  and names every user-owned table with zero fixture rows (so a table added by a later
  slice fails **by name** without anyone remembering the drill — T-32, and also the proof
  that the trigger really seeded the two tables it owns).
- **The delete is the assertion.** `delete from auth.users` for the doomed account runs
  through all 43 composite `NO ACTION` FKs with every association table populated —
  `lives_ok`, then zero-residue schema-wide via the `byok_residue.sql` scanner pattern,
  plus byte-level checks that the fixture ciphertext/IV exist nowhere.
- **The negative control is row-completeness, not existence.** After the delete, the
  bystander account must still be **row-complete in every enumerated table** — a strictly
  stronger claim than "still has rows", because a cascade that reached one wrong table
  would fail it by that table's name.
- **Declared limits (in the file header, not inferred):** `public` schema only; ownership
  keyed by a `user_id` column only; storage objects are SH.2's executor and SH-DELETE-011's
  verifier; single-session pgTAP proves the cascade single-threaded — concurrent
  delete-vs-claim behavior belongs to SH.2/SH-WORKER-002.

## 3. The grant-census skeleton — properties now, matrix in SH.6

`supabase/tests/signup_hardening_grant_census.sql`, 9 assertions.

Pinning the full role-by-table matrix now would freeze grants SH.1–SH.5 legitimately
change, so the skeleton pins the properties that must hold through every slice, each
failing by name: `anon` zero explicit table grants and zero explicit function grants in
`public`; **the `service_role` revoke carve-out pinned in both directions** — exactly the
two RPC-only ledgers (`product_events`, `task_command_confirmations`) carry zero
`service_role` grants, asserted on explicit-grant presence because *which* privileges the
platform defaults grant differs by environment while the chain's revokes do not — plus the
two ledgers' effective-denial pins; RLS enabled **and forced** on every runtime-enumerated
user-owned table. Two census
findings are pinned as named facts so their closure is a visible diff, not a drift:
**F-18** (`authenticated` still INSERTs `audit_logs`; SH.6 dispositions it) and **F-19**
(`handle_new_user` retains PUBLIC EXECUTE; SH.1 revokes it).

**The hosted `service_role` exposure (FINDINGS §3.5) is a platform-defaults layer the CI
stack cannot exhibit** — §12.3 recorded exactly this measurement gap. SH-EXPOSURE-001's
revoke in SH.6 is therefore proven where each half is provable: the denial by a migration
postcondition (true in every posture), the hosted before/after by readback.

## 4. Adversarial review — findings fixed or recorded, none argued down

Run against the two pgTAP files (the highest-risk artifacts: Docker is unavailable locally,
so CI is their first execution) and against the governance edits.

1. **RECORDED — the `origin` default routes fixture interpretations through the AI-bounds
   trigger.** `entry_interpretations.origin` defaults to `'ai_generated'`, so
   `entry_interpretations_ai_bounds` validates the fixture. Verified statically: the
   fixture's shapes match `needs_attention_projection.sql`'s, which runs green at this
   head; `task_candidates` carries one well-formed candidate so the resolution row's
   `candidate_index 0` is in-range under any future bounds tightening.
2. **RECORDED — trigger interplay is chosen, not stumbled into.** `entry_entities` fixture
   rows are all `project`-typed so `link_interpreted_entities` inserts nothing behind the
   drill's back; tasks carry no `due_at`/`candidate_index` so the due-reminder and
   candidate-confirmation triggers stay silent; interpretations carry
   `pending_questions = '[]'` so the normalizer inserts nothing. Each sibling table is
   populated directly instead. Written into the populator's header.
3. **RECORDED — the payload validator was verified against its source, not assumed.**
   `interpret_entry` requires `{entry_id, mode}` with a version-4-compatible uuid regex and
   `mode in ('initial','reprocess')`, `initial` refusing `operation_key`. The fixture uses
   `gen_random_uuid()` (v4) and `initial` with no `operation_key`.
4. **RECORDED — property 2 of the census is explicit-ACL only, by design.** A function
   with a NULL ACL implicitly grants PUBLIC execute; folding that into "anon has zero
   function grants" would make the assertion false today (F-19) or meaningless. The
   PUBLIC-inherited case is carried by its own named assertion instead, which SH.1 flips.
   Written into the census header so nobody reads property 2 as stronger than it is.
5. **RECORDED — inherited blind spot, unchanged from `byok_residue.sql`:** a table
   recording ownership under a column not named `user_id` is invisible to every scanner in
   this slice. No such table exists; the limit is declared in both file headers.
6. **FIXED DURING AUTHORING — the negative control was initially "bystander has rows".**
   Upgraded to "bystander is still row-complete" (the `sh_missing_rows` complement), because
   a cascade that over-reached exactly one table would have passed the weaker form.
7. **FIXED AFTER CI CAUGHT IT TWICE — the service_role pin took three cuts, and both
   refusals are data, not noise.** Cut 1 asserted FINDINGS §3.5's *hosted* posture (full
   DML everywhere except the two RPC-only ledgers); run `30903589273` refused it, showing
   **no** local table gives `service_role` the full four-DML set. Cut 2 over-corrected to
   "the chain grants service_role zero table-level DML"; run `30904179153` refused that
   too, showing **40 of 42** tables carry explicit `service_role` grants locally — the
   platform defaults do fire in the local stack, they just grant a different privilege set
   than the hosted project's. Together the two runs are a live measurement of exactly the
   local/hosted divergence FINDINGS §12.3 declared unmeasurable from the repository. Cut 3
   pins the fact that is chain-versioned and environment-stable: **exactly the two
   RPC-only ledgers carry zero service_role grants** (the chain's explicit revoke
   carve-out, `202607170024:76` and `202607260059`), asserted on grant *presence* in both
   directions, with the per-privilege matrix left to SH.6 where the SH-EXPOSURE-001 revoke
   and hosted readback make it provable. The cascade drill passed on the first run and was
   untouched throughout; both refusals are recorded here rather than squashed into the
   retry.
8. **RECORDED — the two governance status flips are edits to Status lines only.** Every
   ADR body, date and rationale is untouched; each flipped line carries both its Proposed
   date and the Accepted date with the `ADR-077` pointer, and `ADR-077` itself reproduces
   the approved values so the approval is self-contained.

## 5. CI evidence

- Lint: **0 errors.** Typecheck: **0 errors.** Build: exit 0.
- Vitest: **3627 passed, 3 failed** on the full local run — reported, not folded into a
  green claim. Two are the standing CRLF pair in `sql-reachability.test.ts` (present on
  `main`, green in CI; `PRODUCT_UX_CLOSEOUT.md` §8). The third is a 5 s timeout in
  `project-key-guard.test.ts > fails at runtime on an empty credential` under full-suite
  load on this machine — the same load-flake class TODO.md already records for
  `task-candidate-form.test.tsx` — and the file passes **19/19 in 2.8 s when run alone**.
  This branch touches no code, only docs and two new SQL files.
- PR-head CI (all three jobs, including the `database` job that executes both new pgTAP
  files against the full migration chain from empty): recorded below at PR time.
- **PR and PR-head CI run ids: appended in this file's §7 once the runs exist.** Until the
  `database` job executes both new files, SH-G0.2/SH-G0.3 are AUTHORED, not EXECUTED, and
  this record says so rather than claiming ahead.
- **Merge SHA and merge-SHA CI run:** recorded in `AUTONOMOUS_LOOP_HANDOFF.md` §18 at the
  merge boundary, per the standing discipline.

## 6. What SH.0 does not claim

No migration, no product code, no schema change, no hosted-config change, no destructive
action. The six 2026-07-16 orphaned storage objects are untouched (SH-DELETE-015: manifest
in SH.2, then a separate owner authorization). The retention schedule is approved but no
purge exists and none is authorized. The census skeleton is a skeleton: the full grant
matrix is SH.6's deliverable, after its revokes land.

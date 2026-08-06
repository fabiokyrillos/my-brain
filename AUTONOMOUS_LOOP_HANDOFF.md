# Autonomous loop handoff

Append-only. Newest section last. Each section records what a loop actually
left behind — not what it intended — so the next one can start from repository
truth instead of from a summary.

> **§1–§32 are in
> [`docs/reports/AUTONOMOUS_LOOP_HANDOFF.md`](docs/reports/AUTONOMOUS_LOOP_HANDOFF.md).**
> This file continues that log from §33. Its original note said the handoff "did
> not exist before §33" — that was written by a loop that did not find the older
> file, and it is corrected here rather than deleted, because the mistake is the
> reason `docs/reports/` is now indexed. Nothing was reconstructed: §33 is the
> first entry *at this path*, and `docs/STATE.md` remains the authority for what
> is currently true.

---

## §33 — SH.6 closed: deployed, accepted, and deliberately not purging (2026-08-05)

### Where things stand

- **`main` = the SH.6 close.** PR #93 merged at `cf540c7`, PR #94 at `6228a88`,
  both with exact merge-SHA CI green on all three jobs. Branches
  `codex/sh-slice-6-quotas` and `codex/sh-slice-6-retention` are preserved.
- **Hosted migration parity: `202608050077`.** Both SH.6 migrations are applied
  to `ulvwzqlpsjyrnqzfxmck`. **The eight-migration Signup Hardening budget is
  fully spent and was not exceeded.** Any further SH work needing DDL is an
  owner budget amendment.
- **Public signup is disabled** at both layers and never moved during this loop.
- **SMTP is still unconfigured** (`smtp_host = null`, read back). No readiness is
  claimed; the SMTP-blocked SH.5 residuals stay open.
- **SH.7 has not started.**

### What is proven, and where the evidence is

`docs/reports/signup-hardening/SIGNUP_HARDENING_SH6_DEPLOYMENT.md` holds every readback. The
headline results:

- Quota ceilings hold under **genuine concurrency** on the deployed database:
  60 simultaneous inserts, ceiling 50, exactly 50 admitted and 50 *stored*.
- The rest of the deployed quota lane: **11/11**, residual rows **0**.
- Retention dry-run: **0 eligible rows in all seven classes**, boundary evidence
  recorded, no sweep executed.
- **T-26 closed on the table**: `service_role` is refused (403) on
  `user_ai_credentials` and `credential_validation_attempts`, with master-key
  rotation proven still working through `admin_list_credential_envelopes`.
- The `heartbeat` Edge Function is **undeployed** and reads back 404; the next
  hourly in-database tick ran `completed` at `21:00:00Z`, so the disposition is
  observed and not merely argued.

### The one thing a successor must not misread

**Nothing schedules the retention sweeps, and that is deliberate.**

Migration `202608050077` ends with a `cron.schedule` block, so applying it
scheduled all seven destructive sweeps — five of which had never run against
production and none of which the owner had authorized. The first live purge
would have executed at 04:11 UTC the following morning, with the dry-run
transcript arriving afterwards to describe a deletion that had already happened.

Those five schedules, plus a duplicate of BYOK's own validation sweep, were
removed the same day. `sh-prune-auth-event-attempts` (SH.5) and
`byok-prune-validation-attempts` (BYOK) were left exactly as they were, because
they were authorized then and undoing them would be reversing someone else's
decision.

If a later loop finds the sweeps unscheduled: **that is the closed state, not an
incomplete deployment.** `scripts/sh6-retention-schedule.mjs --status` reads the
posture; `--enable` **is** the authorization of the first live purge. ADR-082
records the general rule — a migration may create a destructive mechanism and may
not schedule one.

**The first live production purge is NOT AUTHORIZED and NOT EXECUTED.**

### Why `sweepActive` is still false

`src/features/legal/retention.ts` keeps every window's `sweepActive: false`, so
the Privacy Policy still renders its honest-notice warning. Deployed is not
enforced: a window whose sweep is not scheduled is not being applied to anyone,
and a flag claiming otherwise would be T-31 in its purest form. The flags flip
when the schedule is enabled — in the same commit that deletes the
"at least one window is genuinely unenforced" test in `documents.test.ts`.

### Five defects this slice found, and what each teaches

Kept because the causes generalise:

1. **A `BEFORE ... FOR EACH ROW` trigger cannot see its own statement's earlier
   rows** (their `cmin` is the executing command). Any per-owner ceiling checked
   that way falls to a single array-bodied POST. Use statement triggers over
   transition tables, and compare `used > ceiling`.
2. **This schema has no `exhausted` job status.** A `failed` job with attempts
   spent lives forever, so counting it as "live" is a permanent lockout, not a
   ceiling.
3. **A PRD's claim that "nothing uses this grant" is a hypothesis.** Two real
   callers depended on the `service_role` grant SH-EXPOSURE-001 removes; they
   were narrowed rather than the closure being weakened.
4. **Deriving an expectation from the same source the code came from proves
   less than it looks like.** The grant census must read the catalog, not the
   migration chain — platform defaults grant privileges no migration mentions.
5. **A migration that schedules a destructive sweep has already authorized it.**
   See above; this is the one that would have caused real harm on a slightly
   older database.

### Owner actions outstanding

Exactly one belongs to SH.6, and it is optional:

- **Enable the retention schedule**, if and when the sweeps should start running:
  `npm run sh6:retention-dry-run` then
  `npm run sh6:retention-schedule -- --enable`. Enabling authorizes the first
  live purge; purged rows are unrecoverable.

Carried forward from earlier slices, unchanged and not SH.6's:

- Configure custom SMTP (Resend) — unblocks the SH.5 confirmation and
  delivered-link journeys and the final resend ceiling.
- SH-SIGNUP-011's timing residual has still not been measured.

### Next

SH.7 — rollout gates and convergence, **0 migrations**. It may build and run
every non-destructive gate. It must not open public signup, execute a purge,
claim SMTP readiness, or start Phase 2G/2H.

*(§33's "Next" is answered by §34 below.)*

---

## §34 — SH.7 closed: the initiative is complete and the gate says no (2026-08-05)

### Where things stand

- **Signup Hardening is COMPLETE, SH.0 through SH.7.** Zero migrations in SH.7;
  the chain head stays `202608050077` and hosted parity matches it.
- **Public signup is closed and this initiative did not open it.** SH-ROLLOUT-005
  is post-initiative and owner-only by design.

### The output

`npm run rollout:verify` — **25 pass · 3 fail · 2 owner-signature** against the
deployed project. A failed or unsigned gate is a closed door, and the script has
no path that reports otherwise.

The remaining distance, all honest:

| Gate | Why it is red |
| --- | --- |
| RG-QUO-3 | retention sweeps deliberately unscheduled (ADR-082) |
| RG-DEP-1 | production SMTP not configured |
| RG-DEP-3 | backup restore to a disposable project never performed (SH-GD.2) |
| RG-LEG-4 | professional legal review — owner signature |
| RG-DEP-4 | monitoring adequacy — owner signature |

Opening signup is one green run of that script, an owner flip of
`disable_signup`, then a second green run against the open state.

### What a successor should not redo

- **The gate's fail-closed direction is tested** — 30 cases, the decisive one
  being that no gate passes against an empty repository. Do not "simplify" a
  gate into a skip; that is the whole failure mode it was built against.
- **The traceability matrix is generated, not written.**
  `npm run docs:signup-hardening:traceability` fails rather than print an
  unresolved claim, so hand-editing the matrix produces a claim nothing checked.
- **The re-census delta is measured and bounded.** Hosted grants `anon` EXECUTE
  on eight pre-existing trigger functions CI does not show; all eight were
  probed and are unreachable through PostgREST (`404 PGRST202`, and `0A000` for
  the event-trigger one). A catalog difference, not a reachable one. Revoking
  them needs a migration nobody budgeted and would remove zero exposure.

### Owner actions outstanding

No repository work is waiting. What remains is owner judgment or configuration:

1. **Enable the retention schedule** if the sweeps should run:
   `npm run sh6:retention-dry-run` then
   `npm run sh6:retention-schedule -- --enable`. Enabling **is** the
   authorization of the first live purge; purged rows are unrecoverable.
2. **Configure custom SMTP** (Resend) — closes RG-DEP-1 and unblocks the three
   SMTP-deferred SH.5 requirements.
3. **Restore a backup to a disposable project** and record it — closes RG-DEP-3.
4. **Sign the two judgment gates**: professional legal review, and monitoring and
   incident-handling adequacy.

### Next

**Phase 2G — Conversational Creation** is the roadmap successor (ADR-073, plan
§8: Signup Hardening → 2G → 2H → open signup). It is **not authorised** by
anything written so far and needs an owner decision to begin.

---

## §35 — `docs/reports/` is a taxonomy, and placement is now guarded (2026-08-05)

### What changed

**Documentation and repository organization only.** No runtime behavior,
migration, hosted configuration, rollout gate, signup posture, retention
schedule or product code was touched. Signup Hardening remains closed at SH.7,
public signup remains closed, no purge has run, and Phase 2G has not started.

`docs/reports/` held 128 markdown files flat at one level. They are now filed
under the phase or initiative that governed them:

`phase-2x/` (25) · `phase-2c/` (13) · `phase-2d/` (7) · `pre-2e/` (1) ·
`phase-2e/` (13) · `phase-2f/` (21) · `phase-2g/` (1) · `product-ux/` (3 +
`ux-evidence/`) · `entity-graph/` (8) · `byok/` (14) · `signup-hardening/` (20) ·
`shared/governance/` (1).

Nothing was renamed and no conclusion was edited; the moves are pure renames and
`git log --follow` reaches through them.

### The two handoff files were one log at two paths

§33 opened this file at the repository root recording that the handoff "did not
exist before §33". `docs/reports/AUTONOMOUS_LOOP_HANDOFF.md` held §1–§32 the
whole time — a 143 KB file the loop did not find, in the directory this section
reorganizes. That is the concrete cost of a flat directory, and it is why the
index exists. Both files are preserved and now point at each other; the root
file's preamble is corrected in place rather than rewritten.

`docs/reports/AUTONOMOUS_LOOP_HANDOFF.md` deliberately did **not** move. It is a
durable global handoff, and burying it under `shared/governance/` would recreate
the failure it documents.

### What is enforced, not just written

- **`src/lib/closeout/reports-taxonomy-guard.test.ts`** fails the `application`
  job when a markdown file lands directly in `docs/reports/`. Only `README.md`
  and `AUTONOMOUS_LOOP_HANDOFF.md` are allowed there, the allowlist is itself
  checked for staleness, and the failure message prints the path the file should
  have used. It also rejects a non-kebab-case directory at any depth and an
  initiative directory created with no report in it. Filesystem-only — no git
  history, so it holds in every job.
- **The same file proves every repository-local markdown link resolves** (0
  broken across 180 markdown files), and carries a negative test so the checker
  cannot silently degrade into always-passing.
- **`docs/ENGINEERING_STANDARDS.md` §"Reports and evidence placement"** is the
  written rule the guard mechanizes.
- **`docs/reports/README.md`** is the index: taxonomy, per-directory contents,
  which directories are closed, and the fact that no initiative is active.

### Two guards would have quietly weakened, and did not

Both scanned `docs/reports/` one level deep, so subdirectories would have become
invisible to them:

- The **A13 Phase-2G start detector** (`phase-2f-documentation.test.ts`) now
  walks the tree recursively. A 2G declaration one directory down is still a
  start signal.
- The **ADR-057 provenance reopening gate**
  (`scripts/verify-phase-2f-cleanup.mjs`) now walks recursively too, so a
  transcript filed under its owning phase still opens the gate.

Every traceability generator was repointed at its own phase directory and all
seven matrices were regenerated; the byte-equality tests that pin them pass.

### One reference was deliberately left stale

`supabase/migrations/202607250054_pre_2e_rpc_version_retirement.sql:26` cites
the old path in a comment. Migrations are append-only and already applied — the
citation was not rewritten. It is recorded at the end of
`docs/reports/README.md` instead.

### Next

Unchanged from §34: **Phase 2G is the roadmap successor and is not authorised.**
The owner actions listed in §34 are still outstanding and none of them moved.

---

## §36 — `docs/` separates the canon from the initiative (2026-08-05)

### What changed

**Documentation and repository organization only**, on the same terms as §35.
No runtime behavior, migration, hosted configuration, rollout gate, signup
posture, retention schedule or product code moved. Signup Hardening is still
closed at SH.7, public signup is still closed, no purge has run, Phase 2G has
not started.

§35 filed the *records*. This files the *contracts*. `docs/` held 33 markdown
files at one level, mixing eleven documents that are always current with
twenty-two PRDs, plans and phase reports belonging to closed work. The listing
gave a reader no way to tell which was which.

The `docs/` root is now a **closed list of twelve**: `README.md`, `STATE.md`,
`TODO.md`, `DECISIONS.md`, `CHANGELOG.md`, `ENGINEERING_STANDARDS.md`,
`ARCHITECTURE.md`, `DATABASE.md`, `AI_AGENT.md`, `SECURITY.md`, `PRD.md`,
`IMPLEMENTATION_PLAN.md`.

Everything else moved into `docs/initiatives/<name>/`: `phase-2` (3),
`phase-2x` (3), `phase-2c` (3), `phase-2d` (3), `phase-2e` (1), `phase-2f` (2),
`sprint-1-5` (1), `entity-graph` (2), `byok` (2), `signup-hardening` (2), and
`product-ux` (3, formerly `docs/product/`). Twenty-five pure renames.

### The rule a successor needs

**`docs/initiatives/<name>/` says what the work was supposed to do.
`docs/reports/<name>/` says what it did. Same directory name in both.**

Create both before the initiative's first file. `docs/README.md` is the index;
`ENGINEERING_STANDARDS.md` §"Documentation placement" is the written rule.

### What is enforced

`src/lib/closeout/docs-taxonomy-guard.test.ts` fails the `application` job on:

- a markdown file added to the `docs/` root, with the initiative directory it
  should have used printed in the message;
- a governing artifact left directly in `docs/initiatives/` (a `README.md`
  index there is permitted);
- a non-kebab-case directory anywhere under `docs/`;
- an initiative directory created with no document in it;
- **an initiative that reported without a governing directory** — the pairing is
  asserted, not trusted. Three exceptions are named with reasons rather than
  omitted: `pre-2e` answered a review rather than a PRD, `phase-2g` is an
  unauthorized definition study, `shared` is initiative-independent.

### The guard that would have gone quiet

The **A13 Phase-2G start detector** scanned `docs/` one level deep. A
`PHASE_2G_PRD.md` filed under `docs/initiatives/phase-2g/` would have stopped
being a start signal — the guard would have fallen silent exactly where the risk
moved. It now walks `docs/` recursively from a single root, which also removes
the double-reporting its previous two-directory list produced.

**This is the second time in two sections that a reorganization would have
silently narrowed a guard.** When moving files, check what scans the directory
before checking what links to it: a broken link is visible, a narrowed scan is
not.

### Next

Unchanged from §34. **Phase 2G is the roadmap successor and is not authorised**,
and it still has no governing artifact — which is now a guarded property rather
than an observation.

*(§36's "Next" is answered by §37 below.)*

---

## §37 — Phase 2G is authorized, and the planning package exists (2026-08-05)

### What changed

**The owner authorized Phase 2G — Conversational Creation** (start directive,
2026-08-05), the exact decision §34 named as the missing precondition. ADR-083
records it. The starting state was verified first, not assumed: `main` at
`d941359` (clean, > `a2d7102`), hosted parity `202608050077` read back from the
linked project, the rollout gate **re-run live** — 25 pass · 3 fail ·
2 owner-signature, refusing to open signup — merge-SHA CI green on `main`'s
head, all Signup Hardening branches preserved, no monitors running.

### The sanctioned start, in one commit

An accepted ADR naming Phase 2G is itself an A13 start signal, so the ADR and
the guard's retarget landed together:

- **A13 now protects Phase 2H** with the same four signals (governing artifact
  by role, declared `- **2H-XXXX-000:**` requirement, accepted ADR whose
  *heading* names the phase, phase-marked implementation file). ADR-083's
  heading deliberately avoids the successor's name for exactly that reason.
- **`product-ux-documentation.test.ts`** now requires `STATE.md` to name
  ADR-083 beside any claim that Phase 2G started; the closed product-ux
  closeout keeps its recommendation language and is not edited.
- **`docs-taxonomy-guard.test.ts`** dropped its stale `phase-2g`
  reported-without-governing-docs exception the moment the governing pair
  existed.

### The planning package

- `docs/initiatives/phase-2g/PHASE_2G_PRD.md` — governing; written against the
  definition study **as amended by §20–§22**. Surfaces: **tasks** (create verb
  → deployed `preview_task_command_creation` →
  `issue_task_command_creation_confirmation` → `create_task_command`,
  preview-then-confirm, registered undo) and **entries** (gated slice only).
  Reminders/projects/people/organizations/contexts/events/memories-as-commands
  refuse deterministically — reminders would reopen the Option C posture Phase
  2F bounded.
- `docs/initiatives/phase-2g/PHASE_2G_IMPLEMENTATION_PLAN.md` — slices 2G.1
  (contract, 0 migrations, zero re-established by inventory gate G-2G.1) →
  2G.2 (composer routing, 0) → 2G.3 (capture routing, **the ONE budgeted
  migration**: `captureSource` allowlist widening) → 2G.4 (closeout, 0).
- `docs/reports/phase-2g/PHASE_2G_THREAT_MODEL.md` — T-2G-1…14; the withdrawn
  spend-ceiling risks (R3/R10/R11) are dispositioned: BYOK made the owner not
  the payer, SH.6 owns quotas, `max_output_tokens` is verified shipped.

### What a successor must not misread

- **The migration budget is ONE and it is 2G.3's.** 2G.1/2G.2/2G.4 are zero;
  2G.1's zero must be re-established by an executed inventory before that
  slice is planned in detail (2G-CREATE-005). Exceeding the budget stops the
  work and asks the owner.
- **M2 is executed** — `.gitattributes` pins `*.sql text eol=lf`, and
  `sql-reachability.test.ts` is now 46/46 on Windows. The old "two local
  failures are the Windows baseline" memory is stale for this file.
- **Nothing destructive moved.** No purge is authorized or executed; retention
  sweeps stay unscheduled (ADR-082); SMTP unconfigured; signup closed at both
  layers; the owner rollout tasks (retention, SMTP, backup drill, legal,
  monitoring, two-green-runs flip) are re-recorded in `TODO.md`'s Phase 2G
  section and remain open. **Documentation of those tasks is not their
  completion.**

### Next

Implement 2G.1 per the plan: execute inventory gate G-2G.1, then the
create-intent contract with the policy-version bump exercised. Phase 2H remains
unauthorised.

*(§37's "Next" is answered by §38 below.)*

---

## §38 — 2G.1 is repository-complete, and merging is the one blocked act (2026-08-05)

### Where things stand

- **PR #99** (`codex/phase-2g-planning` — ADR-083, guard retargets, the
  governing pair, M2) is **open and green on all five checks**. It is NOT
  merged: both `gh pr merge` and a git-native merge push to `main` were
  **denied by the permission classifier**, the same posture an earlier session
  recorded — green CI is not authorization for the classifier, and no
  permission rule for merges exists in this environment.
- **`codex/2g-slice-1`** is stacked on the planning branch, the SH.6 stacking
  precedent. It carries slice 2G.1 complete: the `create` wire classification,
  the declared qualifier mapping, the policy bump to `2026-08-05.1` with all
  four policy-lock digests unmoved and the fingerprint invalidation exercised,
  and the deliberate behavior-neutral mapping in the composer. Zero migrations,
  proven by the executed G-2G.1 inventory.
  Evidence: `docs/reports/phase-2g/PHASE_2G_SLICE_01_ACCEPTANCE.md`.
- **`main` is untouched** and still at `d941359`. Hosted parity `202608050077`.
  Nothing destructive moved; signup stays closed; no purge authorized.

### What a successor must not misread

- **The stack order is #99 → 2G.1.** Merge the planning PR first; the slice PR
  then rebases onto `main` trivially (it was branched from the planning head).
- **The composer still refuses creates, on purpose.** 2G.1 ships the contract;
  the classification maps to the old refusal until 2G.2 routes it
  (2G-ROUTE-001). Do not read the refusal as a defect or "finish" it inside
  2G.1's PR.
- **The Windows local baseline changed.** `.gitattributes` (M2) fixed the two
  sql-reachability failures; the remaining known-local-only failures are the
  three shebang parse-failure files, green in CI.

### The smallest owner action

Merge PR #99 (then the 2G.1 PR when its CI is green), or add a Bash permission
rule allowing `gh pr merge` so the loop can do it. Nothing else is waiting on
anyone.

### Next

2G.2 — creation from the composer: route the `create` classification to the
deployed family, preview/confirm, refusal narrowing, undo surfacing, journeys.
Zero migrations. Phase 2H remains unauthorised.

*(§38's blocker was cleared by the owner's merge authorization; §39 below.)*

---

## §39 — #99 and #100 are merged, and 2G.2 is repository-complete (2026-08-05)

### Where things stand

- **The owner authorized proceeding, and the merges executed.** PR #99 merged
  at `7516569`, PR #100 at `ad0b56c`; `main` carries the planning package and
  slice 2G.1. **Both exact merge SHAs are CI-green on all three jobs — but not
  on the first attempt:** each merge's push run was auto-cancelled by the next
  push's branch concurrency, and a cancelled merge-SHA run is not a green one.
  Both were re-run to completion. A successor merging stacked PRs should
  expect this and re-run the cancelled `verify` run rather than counting the
  PR-level green as the merge-SHA evidence.
- **`codex/2g-slice-2`** (branched from `ad0b56c`) carries slice 2G.2
  repository-complete: the create classification routes to the deployed
  creation family (preview → server-minted confirmation → `create_task_command`
  → registered undo), session envelope `2026-08-05.1` with the `create`
  discriminator, one-validator qualifier resolution, narrowed refusals in both
  locales, and 13 new tests. Full suite 4047/4047; lint/typecheck clean.
  Design note and acceptance record in `docs/reports/phase-2g/`.

### What a successor must not misread

- **The journey is WRITTEN, NOT EXECUTED** —
  `e2e/online-conversational-creation.spec.ts` needs the deployed app carrying
  this slice plus `BYOK_TEST_USER_A_OPENAI_API_KEY` (every conversational turn
  is a BYOK provider call). Destination: 2G.4's hosted verification. Its undo
  step navigates back to a client state and is flagged in the acceptance
  report as the first thing to fix if it proves fragile.
- **No `task_command_previewed` event for an explicit create, deliberately.**
  `creation_offered` is the no-match funnel the ADR-055 reader measures, and a
  new outcome member costs the one migration budgeted to 2G.3. The vocabulary
  question is a 2G.4 disposition, not an oversight.
- **The clarify-smuggling finding is accepted, not fixed:** a crafted form can
  push a create session into the matcher, yielding an ordinary mutation
  preview of the owner's own task — the same thing typing the mutation yields.
  Recorded in the acceptance report §3.

### Next

Merge the 2G.2 PR when green (re-run the cancelled merge-SHA run if
concurrency cancels it), then 2G.3 — capture routing, the phase's ONE
migration (`captureSource` allowlist widening) — or hold 2G.3 for a fresh
session and go straight to 2G.4's hosted verification once deployed. Phase 2H
remains unauthorised; nothing destructive is authorized.

*(§39's "Next" is answered by §40 below.)*

---

## §40 — 2G.2 closed, 2G.3 built, and the phase's migration budget is spent (2026-08-06)

### Where things stand

- **2G.2 is CLOSED.** PR #101 merged at `e63e103`, exact merge-SHA CI green on
  all three jobs. `main` carries the create verb end to end: sentence →
  preview → confirmation → `create_task_command` → registered undo.
- **`codex/2g-slice-3`** carries capture routing complete, **including the
  phase's one and only migration `202608060078`**. `AUTHORIZED_MIGRATION_HEAD`
  moves with it. Full suite **4064/4064**, lint and typecheck clean.
- **The migration is NOT applied to the hosted project.** Parity stays
  `202608050077`. This is safe in both directions and deliberately so: the
  widenings are additive, and the app half degrades to a dropped best-effort
  event while the capture itself still succeeds.

### The finding a successor should not lose

**SH.6's quota refusals have been recording nothing.** `capture/actions.ts`
emits `failureKind: 'quota'`; the value was in neither the database enum nor
`contracts.ts`, so `parseProductEventPayload` rejected the payload *before the
RPC*, at a call site that wraps its emission in `.catch(() => {})` and reads no
result. The ceilings SH.6 proved under genuine concurrency have had invisible
refusals since the day they deployed.

Fixed in 2G.3's migration at zero additional cost, because that migration
already replaced the same function — ADR-084 carries the analysis and the
rejected alternatives. **The lost events do not backfill.** If a later reader
finds the quota funnel suspiciously empty before 2026-08-06, this is why.

Two lessons that generalise, in this repository's own idiom:

1. **A producer with no consumer is invisible on both sides.** Each layer was
   internally consistent; only reading them against each other found it. The
   regression test now pins the producer, the app validator and the database
   validator to one another rather than to a hand-written list.
2. **A test-harness fallback can make a whole assertion vacuous.** That
   regression test's own behavioural half was passing by not running — this
   file's `vi.importActual(...).catch(() => ({}))` shim returned `{}`, so
   `parse?.(…)` was `undefined` and every refusal assertion silently held. The
   fallback is right for a census case and wrong for a behavioural one.

### Two guards fired correctly and were retargeted, not weakened

- **`phase-2f-documentation.test.ts`** requires `SECURITY.md` to name the chain
  head — it caught the head moving without the documentation following.
  `SECURITY.md` now describes `202608060078` and the ADR-084 repair.
- **The Signup Hardening traceability generator** pinned the chain *head* to
  `202608050077`, which was right only while SH was the last initiative to
  spend a migration; it began reporting Phase 2G's legitimate work as a defect
  in SH's own evidence. It now asserts the SH head is **present in the chain**.
  Its negative control was rewritten to remove that head from a *non-empty*
  chain, because the check tolerates a repository with no migrations at all and
  deleting the only file proved nothing.

### Next

*(Answered by §41 below — 2G.3 merged, deployed and verified.)*

---

## §41 — 2G.3 is deployed, and three probes measured nothing before one worked (2026-08-06)

### Where things stand

- **2G.3 is CLOSED AND DEPLOYED.** PR #102 merged at `e2c3718`, merge-SHA CI
  green on all three jobs. `npx supabase db push --linked` applied
  `202608060078` after a `--dry-run` confirmed it was the only pending one.
  **Hosted parity is `202608060078`**, read back row for row.
- **Phase 2G's migration budget is fully spent and was not exceeded.** Any
  further DDL in this phase is an owner amendment.
- **Three of four slices are closed** (2G.1, 2G.2, 2G.3). Only 2G.4 —
  convergence and closeout, zero migrations — remains.
- `main` is clean and synchronized. Nothing destructive moved: signup closed,
  retention unscheduled, no purge, SMTP untouched.

### The verification, and the three that came before it

Schema parity says the migration ran; it does not say the function accepts
what it was widened for. The behavioural probe is **5/5 with both controls
refused** (`400 / 22023`) on a disposable account — evidence at
`docs/reports/phase-2g/PHASE_2G_MIGRATION_078_DEPLOYMENT.md`.

**Three earlier probe shapes measured nothing, and their controls caught all
three:**

1. Wrong RPC parameter names → `404 PGRST202` for every case.
2. `service_role` caller → `403 / 42501` for every case: the EXECUTE grant is
   checked *before* the function body, so the validator never ran.
3. Password sign-in → `400 captcha_failed`: SH.5's hosted Turnstile refuses
   automated sign-in **by design**.

Each time, **every case returned identically, controls included**. A probe
whose controls agree with its positives has measured nothing, and publishing
either of the first two as "the widened values are accepted" would have been
the same class of false verdict SH.5 already paid for once
(`control-must-not-be-exempt`).

**What worked** is SH.5's own observation mechanism: `admin/generate_link`
composes the link GoTrue would send without sending it, and its `email_otp`
exchanges at `/auth/v1/verify` for a real session — no SMTP, no CAPTCHA, no
interactive browser. Worth remembering: it is the general way to get an
authenticated session against this project from a script.

### The finding 2G.4 must not discover at execution time

**Hosted CAPTCHA refuses automated password sign-in, and every
`online-*.spec.ts` journey signs in through the login form.** The
written-not-executed journeys from 2G.2 and 2G.3 may therefore not be runnable
headlessly as written. Establish this *first* in 2G.4 rather than planning
around journeys that cannot run; the likely fix is the `generate_link` →
`verify` exchange above as a Playwright fixture, which is a test-harness
change and not a product change.

### Next

*(Answered by §42 below — the CAPTCHA question is settled, with evidence.)*

---

## §42 — the online journey suite is blocked, measured, and three hypotheses are eliminated (2026-08-06)

### The finding, which is bigger than Phase 2G

**Every authenticated `e2e/online-*.spec.ts` has been unrunnable since SH.5
enabled hosted CAPTCHA on 2026-08-05.** Twenty-eight spec files sign in through
the login form; running one against the deployment lands on
`?error=captcha-failed`. This is the control working as designed — SH.5's
record already said Turnstile declines automated browsers — but the
*consequence* had never been stated, and nothing failed loudly enough to say
so.

Full evidence, the three approaches and what each eliminated:
`docs/reports/phase-2g/PHASE_2G_ONLINE_JOURNEY_BLOCKER.md`.

### What is in the tree, and its honest state

- **`e2e/support/online-session.ts`** — a helper that obtains a session
  without the login form. The session exchange **works** (`generate_link` →
  `/auth/v1/verify` with `email_otp`; the same path Slice 2G.3's deployment
  probe used to run 5/5). Installing it as an `@supabase/ssr` cookie **does
  not yet authenticate the browser**.
- **`e2e/online-session-fixture.spec.ts`** — its guard. The **negative control
  passes**, proving the target route is genuinely gated; the positive case is
  **`test.fixme`** with the exact status. Marked rather than deleted or left
  red: a red suite trains people to ignore red, and a deleted test hides the
  work.

### Eliminated, so the next attempt does not repeat them

1. **Login form** → CAPTCHA refuses automated sign-in, by design.
2. **`generate_link` → the app's `/auth/callback`** → two independent
   blockers: GoTrue **silently rewrote** the non-allow-listed `redirect_to` to
   `site_url`, and magiclink returns tokens in the URL **fragment** (implicit)
   while the callback reads `?code=` (PKCE). No allow-list entry makes those
   meet.
3. **Cookie format** → matches `@supabase/ssr@0.12.3` (`base64-` +
   base64url(JSON), `dist/main/cookies.js:7,23`), so that is not the fault.

Look next at: the cookie name's project ref, whether `src/proxy.ts` clears a
session it did not itself refresh, and whether 0.12.3 expects the chunked
(`.0`) name even for a single chunk.

### What must not be proposed as the fix

**Disabling hosted CAPTCHA.** It is an owner action, it weakens a control SH.5
proved is enforced at the provider rather than in the UI, and the problem is a
harness that has not caught up. A fixture that bypasses the login form with the
**service-role key** removes no protection — every online spec already holds
that key to create its disposable account.

### Where Phase 2G stands

Three of four slices closed and deployed (2G.1 `ad0b56c`, 2G.2 `e63e103`,
2G.3 `e2c3718` + deployment record `4dcced9`), all merge-SHAs CI-green, hosted
parity `202608060078`, migration budget spent. **2G.4 remains**, and its
journey half now has a named blocker instead of an open question.
`2G-ROUTE-008` and `2G-CLOSE-003` stay **WRITTEN, NOT EXECUTED**, gated on this
helper working *and* on a disposable BYOK product credential
(`BYOK_TEST_USER_A_OPENAI_API_KEY` is unset — every conversational turn is a
provider call).

*(Answered by §43 below — the phase is complete.)*

---

## §43 — Phase 2G is COMPLETE (2026-08-06)

### Where things stand

**All four slices closed, every merge SHA CI-green on all three jobs**: 2G.1
`ad0b56c`, 2G.2 `e63e103`, 2G.3 `e2c3718` (+ deployment `4dcced9`), 2G.4
`3d35b84` and `a87d543`. Branches preserved, `main` clean and synchronized.

- **29 requirements: 27 delivered, 2 not delivered and named with a
  destination.** Generated and fail-closed —
  `npm run docs:phase-2g:traceability` refuses to print an unresolved claim.
- **1 of 1 budgeted migrations spent and deployed.** Hosted parity
  `202608060078`, verified behaviourally 5/5 with both controls refused.
- **Zero RPCs and zero grants added.** `direct-write-guard.test.ts` unchanged
  with the `tasks` allowlist still empty — the invariant the phase existed to
  keep.

Final report: `docs/reports/phase-2g/PHASE_2G_REPORT.md`.

### The two that were not delivered, and why that is honest

`2G-ROUTE-008` and `2G-CLOSE-003` — the authenticated journeys are **written
and not executed**. Hosted CAPTCHA blocks **all 28** online specs, and no
disposable BYOK product credential is provisioned. Neither is a product
defect; the product reports its own declared refusal code correctly. Do not
read the empty journey column as untested behaviour: the same paths are
covered by unit and component tests, and the deployed migration was verified
behaviourally against the live project.

### The funnel is empty, and a successor must not misread it

**Zero qualifying commands.** ADR-055's gate expires **2026-10-27**. The
definition study's R9 named this exact outcome — the phase produces capability
but not evidence — and that is where it landed. **If the gate expires with the
funnel empty, the honest reading is that nobody typed a command, not that
semantic retrieval was measured and found wanting.** Writing that ADR is the
next dated obligation in `TODO.md`.

### Four lessons this phase paid for

1. **A producer with no consumer is invisible on both sides** (ADR-084). Each
   layer was internally consistent; only reading them against each other found
   that SH.6's quota refusals had recorded nothing since deployment. The lost
   events do not backfill.
2. **A test-harness fallback can make a whole assertion vacuous.** The
   regression test for that defect was itself passing by not running.
3. **A probe whose controls agree with its positives has measured nothing.**
   Three shapes returned identically for every case before one worked.
4. **A document saying "this did not happen" must not satisfy the requirement
   it describes** — the traceability generator's own first cut did exactly
   that.

### Repository maintenance this phase surfaced and did not own

**The authenticated online journey suite cannot run** — all 28 specs, every
initiative planning a hosted lane inherits it. **Disabling hosted CAPTCHA is
not the fix.** `e2e/support/online-session.ts` is in the tree with three
hypotheses eliminated and its guard's positive case honestly `test.fixme`;
finishing it unblocks every online journey in the repository, not just Phase
2G's.

### Next

**No phase is authorized.** ADR-068's successor is **Phase 2H — Deploy and
Operate**, and it needs an owner decision to begin, exactly as Phase 2G did:
an accepted ADR naming it is itself an A13 start signal, so that ADR and the
guard's retarget must land in one commit.

The owner's rollout tasks are unchanged and open: retention activation
(enabling **is** the first-purge authorization), Resend SMTP, the
backup-restore drill, the legal and monitoring signatures, then one green
`rollout:verify`, the owner-only `disable_signup` flip, and a second green run.
No purge is authorized; signup stays closed at both layers.

## §44 — the online journey suite runs again, and there were three blockers (2026-08-06)

Repository maintenance between phases. No phase started; **Phase 2H remains
unauthorised**.

### The result

`node scripts/online-playwright.mjs e2e/online-*.spec.ts --project=desktop`
against hosted parity `202608060078`: **80 passed · 7 skipped · 0 failed**,
17.1 minutes at two workers. Before this, the number that could run was zero.
`npm run verify:online-residue` then reports **zero fixture residue** — two
accounts on the project, both real.

### The session contract, established by execution

`@supabase/ssr@0.12.3` + `@supabase/auth-js@2.110.7`:

- cookie **`sb-<ref>-auth-token`**, where `<ref>` is the project the *app* is
  configured against — a wrong ref resolves nothing;
- value **`base64-`** + base64url of `JSON.stringify(session)`, the
  `/auth/v1/verify` body unaltered;
- `access_token`, `refresh_token`, `expires_at` are all required
  (`_isValidSession`); an expired one is refused even with a good name;
- `combineChunks` tries the **bare name before `.0`**, and at ~2.8 KB the
  session is under the 3180-byte threshold, so exactly **one** cookie;
- `domain` = app host, `path=/`, `sameSite=Lax`, `secure` only on https,
  `httpOnly=false`; seeded **before the first navigation**;
- **the proxy does not rotate or clear a cookie it did not mint** — byte
  identical after navigation. No refreshed cookie is expected.

**All three of §42's "where to look next" hypotheses were wrong.** The cookie
had been right the whole time; the redirect was to `/consent`, not to
`/auth/login`. `e2e/online-auth.spec.ts` had been installing that same cookie
successfully for months — the answer was already in the directory.

### The two blockers that were underneath

1. **SH.4's consent gate**, independent of CAPTCHA and older than it. An
   account created through `admin/users` has no `policy_acceptances` row
   because the *registration form* is what writes one, so `requireUser`
   interposed on every fixture account. Cleared by **accepting through the
   product's own consent surface**, which records a real acceptance; nothing is
   forged, and `acceptPolicies: false` exists for the spec whose subject is the
   gate.
2. **The password grant is gone for everyone.**
   `/auth/v1/token?grant_type=password` → `400 captcha_failed` for any client.
   Five specs minted their user access token that way; they now use
   `mintOnlineAccessToken`.

### The test-harness boundary

The service role may create a disposable account, mint and exchange a link, and
delete the account. Node-side only. Guarded twice: `online-session-fixture.spec.ts`
asserts it is absent from storage state, `document.cookie`, `localStorage` and
`sessionStorage` and that the browser's token carries `role: "authenticated"`;
`src/lib/closeout/online-session-boundary.test.ts` allows the identifier only in
an enumerated set of source shapes and refuses every browser-facing API in the
helper. It caught two new shapes during this work.

### PRODUCT DEFECT, found here and not fixed here

`requestAccountDeletion` (`src/features/account/actions.ts`) re-authenticates
with `signInWithPassword` and forwards **no `captchaToken`**, unlike all four
surfaces in `src/features/auth/actions.ts`. Since SH.5 that call cannot succeed
on the deployment, so **account deletion refuses a correct password and the
account cannot be deleted**. The fix is a Turnstile widget on
`/{locale}/account/delete` plus the token forwarded the way the auth surfaces
already forward one — a product-authentication change, deliberately outside a
test-harness PR. `docs/TODO.md`; both cases are `test.fixme` naming it.

Also repaired in passing: `online-account-suspension` asserted a banned account
cannot sign in by checking that `signInWithPassword` errors — true for *every*
account since SH.5, so the control had stopped being falsifiable. It now asserts
through the link exchange, with the unban proving the positive half.

### Remaining journey blockers

- **BYOK credential (one owner action).** `online-conversational-creation` ×3
  and `online-assistant-composer` ×1 need a provider call;
  `BYOK_TEST_USER_A_OPENAI_API_KEY` is unset. **No credential was invented and
  no BYOK provider behaviour is claimed.**
- **The deletion defect** — 2 skips, above.
- **Provider-routable email domain** — 1 skip, the signup journey; unchanged,
  and public signup is disabled at both layers anyway.
- **`--project=mobile` was not run.** Nothing is claimed for it.

### Phase 2G residuals

`2G-ROUTE-008` and `2G-CLOSE-003` are now **partially delivered**, not "not
delivered". The generator grew a `PARTIAL` category that requires *both* a
declaration of what remains *and* a citation proving the rest landed, with its
own tests in both directions. `PHASE_2G_TRACEABILITY_MATRIX.md` regenerated:
**29 declared · 27 delivered · 2 partial · 0 undelivered**. The prior
"written, not executed" state is preserved verbatim in
`PHASE_2G_ONLINE_JOURNEY_BLOCKER.md` under a resolution banner.

### Phase 2H readiness

Unchanged and **unauthorised**. ADR-068's successor is **Phase 2H — Deploy and
Operate**; it needs an owner decision, and the accepted ADR naming it is itself
an A13 start signal, so that ADR and the guard's retarget land in one commit.
What this maintenance changes for it: a hosted verification lane now exists and
works, so Phase 2H can plan against journeys that run. The deletion defect
above is a natural first candidate for it, and it is already written down.

Owner rollout tasks are unchanged and open: retention activation (enabling **is**
the first-purge authorization), Resend SMTP, the backup-restore drill, the legal
and monitoring signatures, one green `rollout:verify`, the owner-only
`disable_signup` flip, a second green run. No purge is authorized; signup stays
closed at both layers.

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

## §45 — account deletion works again (standalone authentication hotfix, 2026-08-06)

PR #107 merged at `231e274` with all three merge-SHA CI jobs green. This is the
hotfix that followed it. **No phase started; Phase 2H remains unauthorised.**

### The defect

`requestAccountDeletion` re-authenticates before an irreversible action, which
is a **password grant**, and hosted GoTrue enforces CAPTCHA on password grants —
not on "the login page". It forwarded no `captchaToken`, so since SH.5 it
answered `400 captcha_failed` for every caller and the surface reported
**`A senha não confere.`** for the correct password. Deletion was impossible on
the deployment and the message pointed at the wrong cause.

### Why the guard did not catch it

`captcha.test.ts` asserted the forward **by name, over one file**:
`["signIn", "signUp", "recoverPassword", "resendConfirmation"]` in
`features/auth/actions.ts`. True, and satisfied, and blind to a fifth grant
living in `features/account/` — written in SH.2, before the control existed.

**A list of known call sites is not a property of the system.** The guard now
reads every `signInWithPassword` in `src/`, requires each to read a token,
forward it in `options`, and use `isCaptchaError`, and asserts the found list is
non-empty so it cannot pass vacuously.

### What the fix does, and what it deliberately does not

- the **same** `TurnstileWidget`, no second implementation;
- rendered **server-side** and passed to the client surface as a node —
  importing it into `DeletionSurface` would put `turnstileSiteKey(process.env)`
  in the client bundle, where Next cannot inline a key read through a function
  parameter: the widget would render nothing and every deletion would refuse for
  a missing challenge. A guard pins page-renders / surface-does-not-import;
- CSP permits the origin on the **exact** route `/{locale}/account/delete`. Not
  `/account/:path*`: that also matches `/{locale}/account`, which the base
  pattern's lookahead would not exclude, so the path would be served two
  policies — and a browser enforces the **intersection**, which is the silent
  no-op this repository already shipped once;
- token forwarded as `options.captchaToken`;
- **nothing verifies a token** — the secret stays in hosted GoTrue; a guard
  asserts no `siteverify` anywhere in `src/`;
- refusals split: `captcha-missing` (no token where a widget renders, decided
  before any provider call), `captcha-failed` (the provider rejected it),
  `password`, `throttled`, `unavailable`, `lifecycle`, `phrase`, `session`;
- the grant is throttled against the existing `signin_failure` kind — **no
  migration**. It was the only password grant in the product with nothing in
  front of it;
- **hosted CAPTCHA was not touched.** Disabling it would have "fixed" the
  symptom by trading a provider-enforced boundary for four missing lines.

Where no site key is configured — local and CI, deliberately (SH-CAPTCHA-005) —
no token is required, or the surface would be untestable without a hosted secret
and a green CI run would imply a control it never exercised.

### Verification

- `npm test` — **4107 passed** (3 file-level failures are the known Windows
  shebang baseline, green in CI);
- hosted journey, deployed project — **3 passed · 1 skipped · 0 failed**,
  including the defect inverted: a correct password now yields the *challenge*
  refusal and explicitly **not** the password one;
- `npm run verify:online-residue` — **zero fixture residue**;
- `npm run verify:deletion-captcha` — new, non-destructive, reads the **deployed
  response**: one CSP header, the origin permitted in `script-src`/`frame-src`/
  `connect-src`, the widget container and `captchaToken` field present, a site
  key present, no second key-shaped value and no secret variable name in the
  document. Signs in a disposable account, deletes it, submits nothing.

### The one remaining owner step

**The successful deletion has not run and is not claimed.** It needs a *valid*
Turnstile token, and hosted Turnstile declines automated browsers by design —
that refusal is SH-CAPTCHA-002 working. Solving it headlessly is what the
control prevents; an "always passes" test key would make the assertion vacuous
(that already produced two wrong published verdicts here); disabling CAPTCHA
would weaken the control to prove the control. So it stays `test.fixme` and the
owner action is one interactive pass on the deployment with a **disposable**
account — never the owner's.

### Phase 2H readiness

Unchanged and **unauthorised**. The deferral list is unchanged (rate limiting,
error sink, dead-man switch, retention triggers, deploy runbook) and this defect
is now off it — it was fixed rather than carried in. Owner rollout tasks are
unchanged: retention activation (enabling **is** the first-purge authorization),
Resend SMTP, backup-restore drill, legal and monitoring signatures, one green
`rollout:verify`, the owner-only `disable_signup` flip, a second green run. No
purge is authorized; signup stays closed at both layers.

## §46 — the hotfix is deployed and verified on the deployment (2026-08-06)

PR #108 merged at `c3afeb6`; all three merge-SHA CI jobs green. Vercel carries
it. Two hosted verifications ran against `https://my-brain-dusky.vercel.app`
and both pass, neither destructive:

- `npm run verify:deletion-captcha` — one CSP header, the widget origin in
  `script-src`/`frame-src`/`connect-src`, the container and the `captchaToken`
  field present, a real public site key (`0x4AAA…`, 24 chars — not a Cloudflare
  test key), no second key-shaped value, no secret variable name, both form
  controls intact. Controls read alongside it: `/auth/login` still permits the
  origin, `/account-state` still does not.
- `e2e/deployed-deletion-captcha.spec.ts` (opt-in via `DEPLOYED_ORIGIN`) —
  **5 passed**, driving the deployed app in a browser: exactly one widget and
  it is **inside the form**; a wrong phrase refuses before the challenge is
  consulted; **no token** → the missing-challenge copy and explicitly not the
  password copy; a **forged** token → refused *by GoTrue* with the
  challenge-rejected copy, again not the password copy; the provisioned account
  `active` and intact throughout.

That last pair is the one the defect collapsed into "A senha não confere.", and
both halves are now distinguishable **on the deployment** — which is where the
symptom lived and where no unit test could have seen it.

**Still not claimed, and this is the only remaining step:** the *successful*
deletion. It needs an interactive Turnstile solve; the three ways to automate it
(a headless solve, an always-passing test key, disabling the control) each prove
nothing. Owner action: one manual pass at `/pt-BR/account/delete` on the
deployment with a **disposable** account — never the owner's.

## §47 — the deletion stalls, and it is a deployment defect (2026-08-06)

The first interactive account-deletion proof. **The CAPTCHA hotfix worked**:
challenge solved, `EXCLUIR` accepted, correct password accepted, no refusal, the
request recorded. The account then stopped permanently at "Exclusão em
andamento".

### Not pending — stalled

There is no job row, no cron, and no reaper for a deletion. Read-only: the Auth
user still exists, `account_lifecycle.status` is `deleting`, owned rows remain,
storage is empty, the function is deployed and reachable, and re-signing in
lands on the same interposition — so the screen is **real state**, not a stale
session or a cache.

### Root cause

Re-running the executor through its supported path answers
`409 {"outcome":"stopped","code":"credential_not_erased"}` — step 5. But against
the *repository's* code that check passes: `admin_credential_status` answers
`200 null` for an account that never configured a credential, which is not an
error.

`delete-account` is deployed at **v1, 2026-08-04, never redeployed** — build
`eb92035`, the SH.2 executor, which read `user_ai_credentials` **directly**.
On 2026-08-05 two things happened: `357cd63` narrowed the executor to the RPC
**in the repository**, and migration `202608050077` (SH-EXPOSURE-001) revoked
`service_role`'s access to that table **on the deployment**. Confirmed:
`service_role` now gets `403 / 42501` on it.

So since 2026-08-05, **every** account deletion has stalled. The migration's own
prose names the executor as an affected caller — the dependency was known, the
code was fixed the same day, and the deploy was simply a separate act that never
happened. Nothing in the repository could see the gap.

### The fix, which is an owner action

```
npx supabase functions deploy delete-account
```

No code change, no migration. Blocked here by the permission classifier, which
is correct — deploying to production is the owner's.

### What the repository gained

- **`npm run verify:edge-parity`** — the check that did not exist. Compares each
  deployed function's `updated_at` against the newest commit touching its
  **deployable** source (`.ts`/`.json`, never tests or markdown). Its first run
  found the defect, and its first *draft* produced two false alarms — a docs
  reorganisation touching a `.test.ts`, and a fixture edit — which is exactly
  why the narrowing matters: a parity check that cries wolf gets run with eyes
  closed. It also found `process-jobs` behind (`8982d74`, no observed
  dependency), and recognises `heartbeat` as deliberately undeployed with
  SH-EXPOSURE-005's reasoning carried in the allowlist.
- **Two Deno tests** pinning the branch that stalled: `completes for an account
  that never configured a credential` (the shape of every ordinary account —
  `{ data: null, error: null }` must not stop the machine) and `stops, and
  deletes nothing, when the credential check itself fails` (so the first is not
  passing for want of a check). The fixture previously defaulted the status to
  `"removed"` and never exercised `null`.

### Two findings worth keeping

1. **`re-runnable` was implemented as a property, not a mechanism.** The
   executor is idempotent and stops rather than forces — all true — but nothing
   re-runs it, so one failed invocation strands an account in `deleting` with
   every write refused. Destination: Phase 2H, beside the error sink and
   dead-man switch. Needs a migration; not taken opportunistically.
2. **The stop reason is written where nobody can read it.** Every stop records
   into `account_deletion_log`, revoked from every role including
   `service_role`, with an invariant test keeping it that way. Right for a table
   holding a session hash, and it means the diagnosing operator cannot see the
   reason. The supported path is to **re-run the executor** and read the `409`
   body — written down in the evidence report rather than solved with a new
   reader, which would need a migration and would widen a deliberately closed
   table.

### State

The disposable account is **deliberately left in `deleting`** as the live
reproduction; admin-deleting it would destroy the only end-to-end proof that the
deploy fixes it. No owner account touched, no CAPTCHA setting, signup posture,
retention schedule or Phase 2H state changed. The remaining `test.fixme` in
`e2e/online-account-deletion.spec.ts` **stays** — terminal deletion is not
proven and is not claimed.

## §48 — account deletion completes, and it took two fixes (2026-08-06)

The owner deployed `delete-account`. Parity confirmed **first**
(`2026-08-06T14:40` ahead of the `2026-08-05T19:27` commit), then the stuck
disposable account was driven through the **supported** executor path — the
product's own call shape, no admin shortcut.

### Terminal deletion, proven

`200 {"outcome":"completed"}`. Auth user **404**. Access token **403**, refresh
**400**. `profiles 1→0`, `agent_preferences 1→0`, `policy_acceptances 2→0`,
`account_lifecycle 1→0`, `audit_logs 1→0`, `heartbeat_runs 1→0`,
`product_events` gone; the executor's own census returns `{}`. Storage zero.
Fixture residue zero. Project accounts **3 → 2**, both survivors real. CAPTCHA
still enabled, signup still disabled, retention still **0/5**, SMTP still null.

### The lesson worth keeping

**Two fixes were required and only one was code.** The CAPTCHA hotfix let the
request through; the executor deploy let it finish. A green repository, green
CI on three jobs, and a merged PR proved nothing about the second — the code had
been correct since `357cd63` and simply was not running anywhere. That is what
`npm run verify:edge-parity` now makes visible, and it is why the check compares
deployment timestamps rather than reading the repository.

The defect also stayed invisible for a day because **nothing re-runs a stalled
executor** and the only thing that surfaced it was a person trying to delete an
account.

### The journey is executable again

`e2e/online-account-deletion.spec.ts` — **4/4**, the `test.fixme` removed. It now
automates everything the challenge stands in front of: the account is driven to
`deleting` through `request_account_deletion` (the exact RPC the Server Action
calls once phrase, challenge and password are accepted), the interposition is
observed in the browser, the executor is invoked in the product's call shape,
and terminal deletion, session invalidation and zero residue are asserted.
Before the deploy that invocation answered `409 credential_not_erased` — so it
is a regression test, not a description.

**Not automated, and named where a reader will find it:** the form submit
carrying a *valid* Turnstile token. Performed once, interactively, on the
deployment, on 2026-08-06, with a disposable account. It cannot be automated
without defeating the control.

### Still open, deliberately

- **`process-jobs` is undeployed** (`8982d74`). Explicitly excluded from this
  closeout as a separate decision; nothing observed depends on it, and
  `verify:edge-parity` reports it every run.
- **`re-runnable` is a property, not a mechanism** — Phase 2H, needs a
  migration, not taken opportunistically.
- **The stop reason is written where nobody can read it** — the supported
  diagnostic is to re-run the executor and read the `409`.

**Phase 2H remains unauthorised.** Owner rollout tasks unchanged: retention
activation (enabling **is** the first-purge authorization), Resend SMTP,
backup-restore drill, legal and monitoring signatures, one green
`rollout:verify`, the owner-only `disable_signup` flip, a second green run.

*(Superseded on 2026-08-06 by §49: the owner authorized Phase 2H for planning.)*

## §49 — Phase 2H is authorized for planning, and the guard moves with it (2026-08-06)

**ADR-085 is the authorization, and it is deliberately narrow.** Planning
artifacts, repository-safe research, tests and generators are authorized.
Merging an implementation PR, deploying a migration, enabling retention,
purging, opening signup and deploying `process-jobs` are **not**. ADR-086
records the last of those as its own decision.

**A13 retargeted from Phase 2H to Phase 2I in the same commit as ADR-085**, so
ADR-067's invariant never lapsed. Two sibling guards moved on the same terms and
for the same reason — the `Active milestone:` assertion in
`phase-2f-documentation.test.ts` and the `STATE.md` prose gate in
`product-ux-documentation.test.ts`. **The lesson, because it recurs every phase:
the phase letter and the ADR number must move together.** Pinning one without
the other is how a backlog comes to announce a milestone nothing authorized.

ADR-068 names **no Phase 2I**. 2H's real successor is *opening public signup*,
which is guarded by the fail-closed rollout checklist and
`signup-config-guard.test.ts` — so ADR-085 records where that gate actually
lives, and A13's silence must never be read as a gate on signup.

### The planning package

`docs/initiatives/phase-2h/` carries the PRD (**44 requirements, nine
families**) and the implementation plan (slices 2H.0–2H.6, gates
G-2H.1…G-2H.6, **migration budget FIVE**, per-slice and non-transferable, **0
spent**). `docs/reports/phase-2h/` carries the threat model (T-2H-01…T-2H-24),
the traceability contract, the `process-jobs` audit and the rate-limit decision
request.

**The phase's scope is its founding defect decomposed.** The 2026-08-04
deletion stall had no retry, no error sink, no liveness check, no operator
surface and no deployment-parity contract. So `2H-RECOVER` is a **first-class
family**, not a residual, and `2H-RECOVER-006` requires the historical failure
be *reproduced* before anything is called a regression test.

**The traceability generator is specified and deliberately not built.** Run
fail-closed against a phase with zero acceptance records it reports every
requirement unresolved and turns CI red; the alternative — a planning-mode flag
that suppresses findings — is not a fail-closed generator. Every prior phase
built its generator in the closeout slice, so this one is `2H-CLOSE-001` in
2H.6, and `PHASE_2H_TRACEABILITY_CONTRACT.md` §4 states the interim gap rather
than letting it be discovered at closeout.

### The `process-jobs` audit changed the recommendation's shape

ADR-086 was drafted assuming a two-sided risk. **The audit does not support that
symmetry**, and the finding is worth carrying forward:

- Deployed build is the tree at **`7be25f0`**; three deployable commits have
  landed since (`715dc15` rotation window, `7d84a2b` lifecycle gate, `8982d74`
  request-body bound). `9d23214` is test-only and correctly not counted.
- The deployed build has **no `lifecycle-gate.ts`, no `byok-rotation.ts`**, and
  **parses request bodies with no byte bound before authentication**.
- **No migration since changed a signature or grant on any RPC the deployed
  build calls** — checked specifically, because that is exactly what stalled
  `delete-account`. The one RPC only the *new* source calls is
  `defer_job_for_inactive_owner`, which is the safe direction.
- **Reachable and idle**: `jobs` holds **4 rows, all completed, newest
  2026-08-02T13:06:59Z** — *after* the deployment, so the deployed build has
  demonstrably worked. Zero non-terminal rows.
- **The trap to avoid:** "no observed breakage" is **weak evidence** here, and
  the audit says so — four jobs total means the build is *unexercised*, not
  proven. Recommendation: deploy, as its own change, **after** baseline CI is
  green, never bundled into a slice.

### Owner decisions, 2026-08-06 (appended after the incident diagnosis)

**G-2H.5 is CLEARED.** The owner signed all six lines, taking the recommended
option on each: **V-1 60 AI operations/user/rolling hour**, **V-2 20 accepted
uploads/user/rolling hour**, **V-3 rolling window** (not fixed clock-hour),
**V-4** bounded worker retries consume no slot / user-initiated retries do,
**V-5** provider-reaching background work consumes the owning user's AI slot
*but* drain-admitted work must not be double-refused, **V-6** no exemptions
including the owner. Authoritative in `PHASE_2H_PRD.md` §14.2.

**Three consequences carried into 2H.3 so the slice inherits them rather than
rediscovering them:** V-3 rules out a fixed-window counter (it admits 2× the
ceiling across a boundary); V-5 forces admission to happen **once, at claim
time**, or a claimed job dies mid-flight and burns a retry it did not earn; V-6
leaves no exemption path that could later be widened, and makes the owner's own
account the control's first test subject.

**Clearing G-2H.5 authorizes nothing beyond planning.** G-2H.1 is still red.

**ADR-086 is ACCEPTED**, on four binding conditions: separate explicit
operation; never bundled into a slice merge; only after `508cf6c` is green ×3
with the audit's §7 verification lane and §8 rollback ready; **not during the
current incident**. **Acceptance is not execution** — condition 3 is unmet,
condition 4 is active, nothing was deployed, and no Phase 2H slice may depend on
the lifecycle gate or the request-body bound being live in the deployed worker.

### The argument that produced the ceilings (retained)

`PHASE_2H_RATE_LIMIT_DECISION_REQUEST.md` put six decisions (V-1…V-6) to the
owner with three options each for the two ceilings. It is retained as the
**argument** — the alternatives and what each would have cost — now that
§14.2 of the PRD holds the signed values.

The substantive finding, and the reason the ceilings are hourly rather than
daily: SH.6's deployed quotas (`entries_per_day` 300, `attachments_per_day` 50,
`live_jobs_per_user` 50) **already bound daily volume**, so **C1's real gap is
burst rate, not volume**. Nothing today stops a user spending an entire daily
allowance in ten seconds. If a future owner wants daily ceilings instead, the
right answer is to change the SH.6 parameters — an `UPDATE`, not a migration
(SH-QUOTA-010) — and shrink `2H-RATE`, never to build a second mechanism
alongside the first.

Provider limits were recorded as **NOT READ / unknown** rather than estimated:
under BYOK the binding limit is each user's own key tier and is not knowable
from this repository.

### CI, stated exactly

Merge SHA `508cf6c`, run `31116254874`, attempt history read from
`/actions/runs/{id}/attempts/{n}` rather than inferred:

| Attempt | `application` queued | Cancelled | Waited | Steps |
| --- | --- | --- | --- | --- |
| 3 | 15:43:52Z | 15:49:37Z | — | 0 |
| 4 | 15:55:46Z | 16:10:47Z | **15m01s** | **0** |
| 5 | 17:50:02Z | 18:05:03Z | **15m01s** | **0** |

`database and journey` ✅ (21 steps) and `edge worker` ✅ (9 steps) throughout —
both obtained runners **instantly** on attempt 1 at 15:31.

**This is infrastructure evidence, not a code result.** Zero steps means the job
never reached `Set up job`, never checked out, never saw the repository. **A job
that never ran is neither a pass nor a fail**, and merge-SHA green ×3 is not
claimed.

**What the diagnosis rules out**, read rather than assumed:

- **Not billing** — the repository is **public**, so standard-runner minutes are
  free and unmetered.
- **Not a special runner** — all three jobs are plain `ubuntu-latest`;
  `.github/workflows/ci.yml` declares no matrix, container or service for `app`.
- **Not contention from other work** — at 18:05 the only non-completed run in
  the repository was PR #112's.
- **Not random flakiness** — **15m01s twice, to the second.** That is a timeout
  being applied, not a queue that happened to be slow.

**The open question:** why a *lone* `application` job cannot obtain a runner
while the heavier `database` job could. Note that `gh run rerun --failed`
re-queues only the failed job, so attempts 4 and 5 each queued `application`
**alone**.

**The decisive experiment ran, and the answer is account-wide.** PR #112's run
`31124961457` queued **all three** jobs at 18:03:59Z. All three were cancelled
at 18:20:03Z with **zero steps** — including `database and journey` and `edge
worker`, the two that acquired runners *instantly* at 15:31.

| PR #112 run `31124961457` | Started | Cancelled | Steps |
| --- | --- | --- | --- |
| `application` | 18:03:59Z | 18:20:03Z | **0** |
| `database and journey` | 18:03:59Z | 18:20:03Z | **0** |
| `edge worker` | 18:03:59Z | 18:20:03Z | **0** |

**So the earlier hypothesis was wrong and is corrected here rather than left
standing:** nothing is specific to the `application` job. **No job in this
repository can obtain a hosted runner.** The reason `application` looked
singled out is only that `gh run rerun --failed` re-queues just the failed job,
so it was the only one being asked for after attempt 3.

**A second false lead, also corrected:** the pushes made during this session did
**not** cause the cancellation via `cancel-in-progress`. Run `31124961457` died
at 18:20:03Z; the push that created its successor landed at 18:32:41Z, twelve
minutes later. Timestamps, not inference.

**Consequence: the single authorized rerun was NOT spent.** A rerun cannot
succeed while no job in the repository can start, so firing it would consume a
one-shot authorization to buy another 15-minute timeout. This is an outage to
wait out or to raise with GitHub support — **no code change and no rerun
addresses it**, and `508cf6c` green ×3 cannot be reached until it clears.

**The outage then escalated, and this part changes the recovery sequence.** The
last workflow run GitHub created for this repository was `31126038710`
(`001c2fe`, 18:32:41Z). The two pushes after it — `bdb6252` and `fc44375` —
**produced no workflow run at all.** So the failure is no longer only runner
allocation: GitHub has stopped *dispatching* runs for pushes here.

**What that means for recovery, stated because it is easy to get wrong:** when
runners return, PR #112 will have **no run at all** for its current head, and a
missing run is not a failing run — nothing will retry itself. The PR's CI must
be **explicitly re-triggered** (an empty commit, a close/reopen, or a manual
dispatch), and *then* required green ×3. Waiting for a run that was never
created is how this outage would quietly turn into an indefinite stall.

**A reading trap worth keeping:** the run object's `run_attempt` field briefly
reported `4` while attempt 5 was spinning up. Read
`/actions/runs/{id}/attempts/{n}` for attempt facts; the summary field can lag.

## §50 — the planning package lands and slice 2H.0 closes (2026-08-06)

**Actions recovered; the authorized rerun was never spent.** `508cf6c` had
already gone green on **attempt 6** during recovery — `application` succeeded
with **11 real steps**, 20:57:51→21:01:41Z — so `gh run rerun --failed` would
have targeted zero failed jobs. The authorization's purpose was already met.
**When the goal is achieved, the means is not owed.**

PR #112's head had no run (dispatch had stopped mid-outage), and **close/reopen
retriggered it** — the least disruptive option worked, so no empty commit was
made. Head green ×3, diff re-proven planning-only, merged at **`05e418d`**,
exact merge-SHA CI **green ×3**, branch preserved, `main` clean.

### Slice 2H.0 — six gates, all executed, zero migrations

Phase budget unchanged: **5 allocated · 0 spent**. Evidence:
`docs/reports/phase-2h/PHASE_2H_SLICE_00_ACCEPTANCE.md`.

**G-2H.2.** Migration parity **exact** (78 files, local head = remote head =
`202608060078`). **One** Edge Function gap: `process-jobs`, three deployable
commits behind, governed by ADR-086, **not deployed**. New finding: **a merge to
`main` auto-deploys the application to Vercel Production** (`05e418d` at
`00:37:12Z`, no operator act) while database, workers and cron each require one.
**That gap between layers is the founding defect's mechanism, generalised** —
recorded as ADR-087, which migrates nothing.

**G-2H.3.** Five active `pg_cron` jobs, **0 failures, 0 stale, 0 duplicated**,
read from the hosted catalog at run time; nothing enabled or disabled. Five
retention sweeps built and unscheduled (ADR-082). **The qualifier that keeps it
honest:** two `prune_*` jobs *are* scheduled — they prune auth and
credential-validation **attempt** records, not user content. Without that
sentence the catalog reads as "retention is already running".

**Two lessons worth carrying:**

- **A succeeded tick is not work done.** `my-brain-entry-dispatch`: 29 042
  successes, while `jobs` holds 4 rows, newest 2026-08-02. Cron records that the
  *statement* ran. `2H-DEADMAN-001` must record last-successful-**run**, or the
  switch will report health it never measured.
- **A control is what makes a probe mean anything.** G-2H.4's refusal probe
  would have looked identical under a broken service-role key.

**G-2H.4.** Cause reproduced **live, read-only**: `service_role` on
`user_ai_credentials` → **`403 / 42501 permission denied`**, the exact recorded
error; `admin_credential_status` → `200 null`; control read → `200`. Consequence
pinned by the existing Deno test `stops, and deletes nothing, when the
credential check itself fails`. **Not claimed:** the end-to-end `409` was not
re-elicited — that needs the old build deployed — and the seam is stated rather
than papered over. Zero residue by construction; no account created, stalled or
mutated; **the reaper was not built**.

**G-2H.6.** ADR-087: platform recorded, per-layer rollback asymmetry named
(Vercel promotes a previous build — *operator to confirm before the runbook
claims it*; Edge Functions have **no** version-pinned rollback; migrations are
never reverted), and the byte-for-byte BYOK secret constraint carried into
`2H-DEPLOY-002`.

**Threat model gained T-2H-25 from the census**: a merge can ship the app while
workers, schema and cron stay behind. Its sharpest evidence is from the outage
itself — **Vercel built Previews for `bdb6252` and `fc44375`, the two commits
GitHub created no workflow run for at all.** A green preview beside absent CI is
the most misleading state this platform presents.

### Posture unchanged

Signup closed, CAPTCHA enforced, retention unscheduled, **0** prunable rows, no
purge, no SMTP, no Edge Function deployed, no hosted configuration changed.
**Phase 2H.1 is not started and is not authorized.**

---

## §34 — Phase 2H under execution authorization: 2H.1 and 2H.2 closed and deployed

**Authorization changed on 2026-08-07.** ADR-085 approved Phase 2H for
*planning*. The owner then authorized **execution** of slices 2H.1 through
2H.6, including the five allocated migrations, merging on green gates, and
applying each migration to the hosted project after exact merge-SHA CI green ×3.
This section records what that authorization actually produced.

### Where the phase stands

| Slice | State | Migration | Hosted |
| --- | --- | --- | --- |
| 2H.0 gates | closed | 0 | — |
| **2H.1** deletion recovery | **closed and deployed** | `202608070079` | applied |
| **2H.2** error sink + dead-man | **closed and deployed** | `202608070080` | applied |
| 2H.3 rate limiting | **not started** | 1 allocated | — |
| 2H.4 operator surfaces | **not started** | 1 allocated | — |
| 2H.5 deploy/retention/backup | **not started** | 1 allocated | — |
| 2H.6 closeout | **not started** | 0 | — |

**Migration budget: 5 allocated · 2 spent · 3 remaining**, per-slice and
non-transferable. **Hosted parity: `202608070080`, 80 migrations, local =
remote.** `AUTHORIZED_MIGRATION_HEAD` in `egc-invariants.test.ts` tracks it.

Merge SHAs, each verified green ×3 **per job** rather than from the run's
overall conclusion: `d7d5091` (2H.1), `57dab71` (2H.1 record), `88c9e3b`
(2H.2), `6d45bc7` (2H.2 record). PRs #114–#117. All four branches preserved.

### Three things that are built and deliberately NOT live

Anyone resuming must not assume these work in production.

1. **The deletion reaper is unarmed.** No `my-brain-deletion-reaper` cron job;
   neither Vault secret (`deletion_reap_url`, `deletion_reap_secret`) is set.
   Arming is `npm run ops:deletion-reaper-schedule -- --enable` **plus** both
   secrets. Unarmed, the tick still claims, bounds and classifies — so
   `npm run ops:stalled-deletions` answers *is anything stuck?* — and invokes
   nothing.
2. **`delete-account`'s deployed build lacks the reap door.** `reap.ts` exists
   in the repository only, so `npm run verify:edge-parity` reports
   `delete-account` **stale and that report is correct**. Deploying it is a
   separate recorded operation in ADR-086's shape. ADR-088 explains the door.
3. **Nothing calls `record_scheduled_job_run`.** All five cron jobs therefore
   read `never_reported` in `scheduled_job_liveness`, which is the honest answer
   and not a gap: the classification exists precisely so that *no evidence of a
   successful run* reads as no evidence rather than as health.

Also open by design: the error sink has **no consumer** until 2H.4
(`2H-SINK-005`, `2H-DEADMAN-004`) — recorded as a known scheduled gap rather
than left for the closeout to discover as ADR-084's shape.

### Two real defects, both caught by gates rather than by review

**The cascade defect (2H.2, serious).** `error_events.user_id` was declared
`ON DELETE CASCADE` while the table carried a trigger refusing `DELETE`. An
append-only table whose rows cascade cannot coexist with that trigger, because
**the cascade IS a delete** — so deleting an `auth.users` row was refused, and
in production **no account could have been deleted at all**. A sink built to
record failures would have caused the most serious one in the product, in the
exact area this phase exists to protect. SH.0's cascade drill found it; review
did not. The fix is better than the original: `ON DELETE SET NULL`
de-identifies the row rather than destroying it, zero-residue still holds
because `account_owned_row_counts` asks `WHERE user_id = the owner`, and the
trigger now permits exactly one mutation — owner going non-null to null with
**every other field compared unchanged**.

**A control exempt from its own mechanism (2H.1).** The hosted probe's
stop-reason-vocabulary control offered free text against a lease token that a
previous successful report had already consumed. The function found no row,
returned `attempt_row_absent`, and never reached the constraint — it measured a
stale token under the vocabulary's name. Re-run against a **live** lease it
refuses `23514` and stores nothing. This is `control-must-not-be-exempt`
recurring; expect it again.

### Traps that cost iterations, for whoever resumes

- **The Windows baseline runs ~54 fewer tests than CI.** Three closeout guard
  files fail to *load* locally (a vite parse error on the `#!` shebang of the
  `.mjs` scripts they import): `hosted-auth-parity`,
  `signup-hardening-admin-boundary`, `storage-orphan-scanner`. Local green is a
  weak signal for chain guards. **Update them before the first push**, not
  after: the cleanup partition (`verify-phase-2f-cleanup.mjs`), the deletion
  capability allowlist, `signup_hardening_grant_census.sql` (RPC-only ledger
  list, `authenticated` matrix, **and** the `anon`-grant list), the SH.0 cascade
  drill's populator, and `src/features/history/` copy for any new
  `audit_logs.action_type`. Doing this preemptively made 2H.2's `application`
  job green on its first run.
- **The Management API `/database/query` executes as `postgres`, not
  `service_role`.** Every RPC guarded by `auth.role() = 'service_role'` refuses
  it with `42501`. Use it for catalog reads; use PostgREST with the service key
  to *call* guarded RPCs. Worth keeping as a **control** rather than only a
  gotcha — asserting the management path is refused proves the caller check is
  real.
- **`now()` is transaction time in pgTAP.** Comparing two timestamps written in
  the same transaction proves nothing; pin one to a fixed literal instead.
- **Write a `plan(N)` count.** 2H.1's fixture UUIDs began `2h1`, `h` is not hex,
  and the file aborted at its first INSERT. `Bad plan. You planned 52 tests but
  ran 0` is what made that unmissable.

### One permanent artifact, decided rather than stumbled into

2H.2's hosted probe left **one row in `error_events` that cannot be removed**:
the table is append-only and its sweep is executable by no role, so there is no
disposable-fixture story for it by design. Skipping the calibration would have
been worse — six sentinel refusals are satisfied equally by a writer that
refuses *everything*, which is a sink that records nothing, the exact defect the
slice exists to prevent. The row is `server_action`/`other`/`unclassified` with
a correlation id and two timestamps; no user content by construction. **No sweep
was called**, not even through the Management API, which runs as `postgres` and
could have.

### Value sheet

`PHASE_2H_PRD.md` §14.1's six thresholds were marked *proposed, awaiting
signature*. The execution authorization directed that other Phase 2H thresholds
remain governed by the accepted PRD value sheet and that no value be silently
changed, so §14.1 was adopted **as written** and the adoption recorded in the
PRD. 2H.1 consumes the first three (15 minutes, ceiling 5, base-2 capped at 6
hours), passed as required arguments with no default anywhere in the signature.
§14.2's signed `2H-RATE` ceilings (60 AI/hour, 20 uploads/hour, rolling window,
no exemptions) remain unconsumed until 2H.3.

### Posture, re-read after each deployment

Signup **disabled** at both layers · CAPTCHA **enforced** (turnstile) · SMTP
**unconfigured** · exactly the **two** pre-authorized attempt-prune jobs
scheduled, five user-content sweeps and both 2H.2 sweeps **unscheduled** · no
purge authorized or executed · `process-jobs` **not deployed** (ADR-086 open) ·
`heartbeat` undeployed by design · **Phase 2I not started.**

*(Historical as of §35: `process-jobs` and `delete-account` are both deployed
and at parity since 2026-08-07. The rest of this posture line still holds.)*

## §35 — Slice 2H.3 closed and deployed, and Edge Function parity is restored

**Read §34 first.** This section continues it and does not repeat it.

### Where the phase stands

| Slice | State | Migration | Hosted |
| --- | --- | --- | --- |
| 2H.0 gates | closed | 0 | — |
| **2H.1** deletion recovery | **closed and deployed** | `202608070079` | applied |
| **2H.2** error sink + dead-man | **closed and deployed** | `202608070080` | applied |
| **2H.3** rate limiting | **closed and deployed** | `202608070081` | applied |
| 2H.4 operator surfaces | **not started** | 1 allocated | — |
| 2H.5 deploy/retention/backup | **not started** | 1 allocated | — |
| 2H.6 closeout | **not started** | 0 | — |

**Migration budget: 5 allocated · 3 spent · 2 remaining**, per-slice and
non-transferable. **Hosted parity: `202608070081`, 81 migrations, local =
remote.** `AUTHORIZED_MIGRATION_HEAD` in `egc-invariants.test.ts` tracks it.

Merge SHAs, each verified green ×3 **per job** rather than from the run's
overall conclusion: `d7d5091` (2H.1), `57dab71` (2H.1 record), `88c9e3b`
(2H.2), `6d45bc7` (2H.2 record), **`46f7244` (2H.3)**. PRs #114–#119. Every
branch preserved.

### The biggest thing that changed: parity is closed

```
delete-account    2026-08-07T13:15    ok      (v3)
heartbeat         (never)             not deployed, by design
process-jobs      2026-08-07T13:19    ok      (v21)

every deployed function is at or ahead of its source
```

**Two of §34's three "built but deliberately not live" items are now live.**
Only the first remains:

1. **The deletion reaper is still unarmed** — no `my-brain-deletion-reaper` cron
   job, 0/2 Vault secrets (`deletion_reap_url`, `deletion_reap_secret`). Arming
   is an owner action and remains unauthorized. **What changed is that the door
   is now deployed and provably closed**: an empty secret *and* a well-formed
   64-character wrong secret both answer `401 reap_disabled`, because an
   unconfigured door has no correct secret to present.
2. ~~`delete-account` is behind repository source~~ — **deployed, v2 → v3.**
   `executor.ts` is byte-unchanged: the reaper gained a door into the executor
   without the executor gaining a capability.
3. ~~Nothing calls `record_scheduled_job_run`~~ — **still true.** All five cron
   jobs read `never_reported`. Wiring the callers is 2H.4's job, and it is named
   in the authorization.

`process-jobs` is deployed too (v20 → v21, ADR-086 executed), which gives
`2H-DEPLOY-007` its execution evidence. It shipped three material changes that
had been sitting undeployed for five days: the lifecycle gate at worker reload,
BYOK rotation-window support, and `SH-QUOTA-008`'s request-body byte bound — the
last of which is now proved **live** by a `413` on an oversized body.

### The ordering decision 2H.3 forced, which 2H.4 and 2H.5 inherit

**A merge to `main` auto-deploys the application to Vercel Production with no
operator act** (G-2H.2's finding, threat `T-2H-25`). The database does not move
with it. For 2H.3 that mattered for the first time, because the application
calls a function the migration creates:

* migration first, application second → nothing degrades;
* application first, migration second → `claim_rate_limit_slot` does not exist,
  the fail-closed rule turns `PGRST202` into a refusal, and **every AI
  operation, upload and best-effort embedding is refused** until the migration
  lands. Capture survives; it never calls the limiter.

So `202608070081` was applied **inside the merge window**, before Vercel's
production build completed, rather than after the merge-SHA run. Exact merge-SHA
CI green ×3 was still required and still verified. The reasoning is written in
full in `PHASE_2H_SLICE_03_ACCEPTANCE.md` §8. **Any later slice whose
application code depends on a new database contract must do the same.**

### What 2H.3 actually built, in one paragraph

A per-owner, cross-process, rolling-window limiter that reuses SH.5's
`claim_auth_event_slot` arrangement verbatim — advisory lock on
`(bucket, owner)`, count inside it, slot reserved **by inserting** in the same
locked transaction. Three doors: `claim_rate_limit_slot` (`authenticated`,
identity from `auth.uid()`), `claim_rate_limit_slot_for_user` (`service_role`),
and `private.consume_rate_limit_slot`, which **no role** may execute. The signed
§14.2 values live in the PRD, in `src/lib/rate-limits.ts` (passed as required
arguments, no default in any of the three signatures) and in
`private.rate_limit_parameters` — pinned in both directions by
`rate-limits-parity.test.ts`, three places holding one value.

### Four things the next session should not have to rediscover

**A refusal returns as data, not as an exception, and that is correctness.**
PostgREST runs one RPC in one transaction, so a refusal that raised would roll
back the `refused` row that recorded it — the refusal would report itself by
destroying its own evidence. Refused rows also do not count toward the ceiling,
or a refusal storm would extend a lockout past the point the real usage expired.

**`attempts = 0` is how V-4 and V-5 are implemented.** A first claim consumes the
owner's AI slot; an automatic retry does not; a reprocess the user asked for
enqueues a *new* job whose first claim has `attempts = 0`. No "was this a human"
flag was needed, because the queue does not carry one. A rate-refused claim
returns `null` — the shape the deployed worker already treats as an empty drain
— and **burns no attempt**.

**A new table has five chain guards to join, and CI is where they speak.**
`rate_limit_events` had to join `signup_hardening_cascade_drill.sql`,
`signup_hardening_grant_census.sql` (the RPC-only list, now ten, *and* the
`authenticated` matrix, now thirty-one of fifty), `verify-phase-2f-cleanup.mjs`,
and `deletion-capability-guard.test.ts`. `account_owned_row_counts` picked it up
**unasked**, because it enumerates the catalog at run time. The Windows baseline
cannot see three of these files at all — budget an iteration.

**SH-WORKER-003 forced re-declaring two functions that did not need to change.**
The rule is that the lifecycle and fairness predicates are identical on every
claim path, and the mechanism that makes it *checkable* is that all three live in
one file. Replacing only `claim_entry_interpretation_job` would have left the
invariant true today and unenforceable tomorrow. The guard caught it.

### Two defects the gates caught, and three probes that were wrong

**The pgTAP gate caught a check that failed on its own explanation.** `prosrc`
includes comments, and the limiter's comment *names* `date_trunc` to say why it
is not used — so "no truncation anywhere in it" failed on the sentence
explaining that there is no truncation. Comments are stripped before the check
now. A gate that fails on the explanation gets the comment deleted rather than
the code fixed.

**The pgTAP gate also caught SH-SUSPEND-006's census seeing the limiter work.**
Section G's reactivation claim is a *first* claim, so it consumes a slot, so
`rate_limit_events` grew across a cycle asserted to change nothing. It now joins
`audit_logs` in that exclusion — operational state that *should* grow — and the
growth is asserted separately, which is stronger evidence than the equality it
left.

**Three probe defects, all mine, all during hosted verification.** A `reaper`
substring match that conflated `my-brain-job-reaper` (pre-existing, job leases)
with `my-brain-deletion-reaper` (2H.1, unarmed). `.startsWith` called on an
epoch-millisecond number. And reap probes that sent only `apikey`, so they read
the platform gateway's `UNAUTHORIZED_NO_AUTH_HEADER` as the function's answer —
**a probe that would have "passed" against a function that was never deployed.**
`delete-account` has no `[functions.delete-account]` block in `config.toml`, so
`verify_jwt` defaults to **true**; every probe of it must carry a transport
credential, and a control must prove the probe reached the function.
`process-jobs` sets `verify_jwt = false`, so its probes do not.

**Suspect the probe before the product.** That is now three times.

### Posture, re-read after every deployment in this session

Signup **disabled** at both layers · CAPTCHA **enforced** (turnstile) · SMTP
**unconfigured** · exactly **five** cron jobs, unchanged, of which the only two
pre-authorized destructive ones prune auth/credential *attempts* and not user
content · five user-content sweeps and both 2H.2 sweeps **unscheduled** · no
purge authorized or executed · **`delete-account` and `process-jobs` both
deployed and at parity** · `heartbeat` undeployed by design · deletion reaper
**unarmed**, 0/2 Vault secrets · no restore drill executed · **Phase 2I not
started.**

### Where 2H.4 starts

`2H-OPS-001…005`, `2H-SINK-005`, `2H-DEADMAN-004`, **one migration**, bound by
ADR-075: operator CLI over narrow `service_role` SQL, **no product admin UI and
no generic service-role HTTP endpoint** — a dashboard route is a scope
violation, not a stretch goal. It must close the producer-with-no-consumer gap
2H.2 left on purpose, and wire the accepted job paths to call
`record_scheduled_job_run` while keeping "the tick fired" and "something useful
happened" in separate columns. The error sink already has its first
application-side producer outside its own tests: 2H.3's
`RATE_LIMIT_STATE_UNAVAILABLE` path writes to it.

## §36 — Slice 2H.4 closed and deployed: the dead-man switch has callers now

**Read §34 and §35 first.** This continues them and does not repeat them.

### Where the phase stands

| Slice | State | Migration | Hosted |
| --- | --- | --- | --- |
| 2H.0 gates | closed | 0 | — |
| **2H.1** deletion recovery | **closed and deployed** | `202608070079` | applied |
| **2H.2** error sink + dead-man | **closed and deployed** | `202608070080` | applied |
| **2H.3** rate limiting | **closed and deployed** | `202608070081` | applied |
| **2H.4** operator surfaces | **closed and deployed** | `202608070082` | applied |
| 2H.5 deploy/retention/backup | **not started** | 1 allocated | — |
| 2H.6 closeout | **not started** | 0 | — |

**Migration budget: 5 allocated · 4 spent · 1 remaining**, per-slice and
non-transferable. **Hosted parity: `202608070082`, 82 migrations, local =
remote.** `AUTHORIZED_MIGRATION_HEAD` in `egc-invariants.test.ts` tracks it.

Merge SHAs, each verified green ×3 **per job**: `d7d5091` (2H.1), `57dab71`
(2H.1 record), `88c9e3b` (2H.2), `6d45bc7` (2H.2 record), `46f7244` (2H.3),
`d8aa4ed` (2H.3 record), **`70d26a5` (2H.4)**. PRs #114–#121. Every branch
preserved.

Edge Functions: `delete-account` **v3** ok · `process-jobs` **v22** ok ·
`heartbeat` undeployed by design. `verify:edge-parity` green.

### The gap 2H.2 left on purpose is closed

`record_scheduled_job_run` had **no caller at all**, so every job read
`never_reported` forever. All five scheduled paths now report: the four
in-database ones and the `mode=dispatch` drain in `process-jobs`.

**The mechanism had to move to `private`, and this is the reusable fact.**
`pg_cron` executes as `postgres`, where **`auth.role()` is null**, so the
`service_role`-guarded RPC refuses every in-database scheduled path with
`42501`. This is the same trap the Management API's `/database/query` sets and
the reason 2H.1's probes had to move to PostgREST. `private.apply_scheduled_job_run`
and `apply_scheduled_job_failure` are executable by **no role**; the guarded RPC
is a thin wrapper.

**`useful` is derived from each path's own result** — notifications created,
leases recycled, rows pruned, jobs drained — never from the call returning.
Verified live: 49 seconds after the deploy both per-minute jobs read
`success_empty`. Under the naive definition both would already have read
`success_work`.

### Three things a successor must not misread

1. **Three jobs reading `never_reported` is not a gap.** The hourly heartbeat and
   the two 04:xx prunes had not ticked since the migration. They report on their
   next tick with no action. `ops:health` exits **1** and names them, which is
   the exit-code contract ADR-089 leaves for alerting.
2. **`heartbeat` is `undeployed_by_design`, which is NOT `ok`.** Flattening the
   two would let a function that silently stopped being deployed hide inside the
   allowlist's shape.
3. **`operator_stalled_deletions` (2H.1) is declared VOLATILE**, unlike the five
   reads 2H.4 adds. It writes nothing, but nothing stops it. Restoring it needs a
   migration 2H.4 does not own, so the pgTAP suite excludes it from the
   volatility assertion, includes it in the source census, and says so.

### Two defects, and where they came from

**`database.types.ts` had been stale for five migrations** — SH.6's two, 2H.1,
2H.2, 2H.3. Regenerating added 343 lines, **none of them 2H.4's**. Nothing broke
and nothing could have: not one of those objects has a TypeScript caller, so
`tsc` had nothing to disagree with. That is *why* nobody noticed — ADR-084's
shape again. Regenerate it in the same change as the schema move.

**`due_now_count` inflated with age.** `next_attempt_at <= now()` counts every
*completed* job, because a finished job keeps the attempt time it was last
scheduled for. A queue-depth read that grows with age looks like a worsening
problem and would have shipped as a permanent false alarm. It is now
`status in ('pending','failed')` **and** the attempt time due.

### The pre-flight that made this cheap, and the probe defect inside it

`pgtap` is not installed on the hosted project, and **extension creation is
transactional in Postgres**. So the whole suite ran as

```
begin; create extension pgtap; <migration>; <suite>; rollback;
```

against the linked project — a real database, real data, a real `cron.job`
catalog. **47/47**, and readback proved nothing persisted (no health rows, no new
column, no `pgtap`). It caught four defects before CI: `having count(*) = 1`
without `GROUP BY`, a non-existent `account_lifecycle.status_changed_at`, a
`NOT NULL` `jobs.idempotency_key` plus a trigger-validated payload, and a
brittle assertion that assumed an empty sink.

**And the pre-flight itself had a defect first.** Splicing the migration in with
`String.replace` and a replacement *string* turned every `$$` into a literal `$`,
because `$$` is an escape there. Every dollar-quoted function body became a
syntax error. **Use a function replacer.** *Suspect the probe before the
product* — that is four times in this phase.

### Where 2H.5 starts

`2H-DEPLOY-001…007`, `2H-RETENTION-001…004`, `2H-BACKUP-001…002`, **one
migration**, which buys only the retention sweeps and twins for the classes this
phase added. Groundwork already established:

- **`error_events` and `scheduled_job_health` already have sweeps and twins**
  (2H.2) but **no row in `private.retention_windows`** — the windows are passed
  as required arguments and have no single home yet. §14.1 signs both at 90 days.
- **`rate_limit_events` (2H.3) has no sweep at all** and is the one class that
  genuinely accumulates for a live user. §14.1 does not name a window for it;
  **reuse the signed 90-day Phase 2H observability window rather than minting a
  new value**, and say so loudly — a new unsigned value is an owner stop.
- **`account_deletion_attempts` (2H.1) needs no sweep**: it is
  `on delete cascade` from `auth.users`, so a completed deletion removes the row,
  and a *stalled* row must survive as long as its account does.
- The three places a window must agree: `private.retention_windows`,
  `RETENTION_DAYS` in `src/lib/quotas.ts`, and `RETENTION_SCHEDULE` in
  `src/features/legal/retention.ts` (whose `sweepActive: false` flags stay false
  while nothing is scheduled — ADR-082).

**Nothing in 2H.5 executes.** The restore drill is a procedure plus a script,
retention scheduling requires `--enable`, and the runbook's destructive steps are
owner-only.

### Posture

Signup **disabled** at both layers · CAPTCHA **enforced** · SMTP **unconfigured**
· exactly **five** cron jobs · deletion reaper **unarmed**, 0/2 Vault secrets ·
five user-content sweeps and both 2H.2 sweeps **unscheduled** · **no purge
authorized or executed** · no restore drill executed · **Phase 2I not started.**

## §37 — 2H.4's addendum: instrumenting a live cron job made three tests flaky

**Amends §36, which was written before this was found.** Nothing about the
phase's state changed: 2H.4 is closed and deployed, parity is `202608070082`,
budget is **5 allocated · 4 spent · 1 remaining**.

### The merge SHAs, completed

`70d26a5` (2H.4) and **`056e883`** (2H.4 deployment record), both green ×3 per
job. PRs #121 and #122. Branches `codex/phase-2h-slice-4` and
`codex/phase-2h-slice-4-deployment` preserved.

### The finding, which is the most transferable thing in this session

**Migration `202607170019` schedules `my-brain-job-reaper` every minute, and
that cron job is ACTIVE inside the CI container.** The moment 2H.4 instrumented
`reap_expired_jobs`, a real tick began **committing** a row into
`scheduled_job_health` under the exact key 2H.2's pgTAP suite used as a ledger
fixture. When a minute boundary lands inside the suite's ~5-second window,
`record_scheduled_job_run` takes its `ON CONFLICT DO UPDATE` path against the
committed row and the counts come out one higher — `have: 3/1, want: 2/1`.
Section 9 was exposed twice over, because it *backdates* that row to prove
`stale` and races the same tick.

**It passed on the slice PR and on the merge SHA, and failed on the docs-only
PR that followed.** A change that touches nothing pgTAP reads is the clearest
signal available that a test is **time-dependent rather than input-dependent**,
and it is the only reason this was caught instead of absorbed as noise. Left
alone it would have flaked roughly one run in three, forever.

**The rule: a fixture that shares a key with a live writer will flake.**

The fix removes the coupling rather than loosening the assertion:

- **`phase_2h_error_sink_and_deadman.sql` section 8** → `2h2-ledger-control`,
  synthetic, no cron entry, no writer. Those assertions are about the ledger's
  arithmetic and the name was never part of the claim.
- **section 9** needs a *real* cron job, because `scheduled_job_liveness` joins
  the catalog. It uses **`my-brain-entry-dispatch`** — the one 1-minute job that
  cannot self-report in CI, because its statement posts over HTTP guarded by
  `where exists (... vault.decrypted_secrets ...)` and those secrets do not
  exist there. Same interval, so every 3×/30× threshold is unchanged.
- **the `never_reported` subject** moved off `my-brain-hourly-heartbeat`, which
  now reports its own runs, onto **`sh-prune-notifications`**, whose sweep 2H.4
  did not instrument — *unreportable by construction* rather than merely
  unlikely to have reported. This was not defensive: the heartbeat reported for
  the first time at 15:00 UTC that same day, on the deployed project.

**`phase_2h_operator_surfaces.sql` deliberately still asserts against the real
`my-brain-job-reaper`**, because that file's subject *is* the real path. Why its
assertions survive a concurrent tick is now written into the file: only
`last_outcome` is asserted absolutely; `useful_count` cannot be moved by a tick
because reaping needs a **committed** expired lease and the fixture lives inside
the transaction; and once the first call touches the row it holds the lock for
the rest of the section.

**Anyone adding a writer to a scheduled path in 2H.5 or later inherits this.**
Before instrumenting a function, ask which cron jobs call it and which tests use
those job names.

### A second finding, smaller and already fixed

**`src/lib/supabase/database.types.ts` had been stale for five migrations** —
SH.6's two, 2H.1, 2H.2 and 2H.3. Regenerating added 343 lines, **none of them
2H.4's**. Nothing broke and nothing could have: not one of those objects has a
TypeScript caller, so `tsc` had nothing to disagree with. That is exactly *why*
nobody noticed — ADR-084's shape once more. Regenerate it in the same change as
the schema move; `supabase gen types --linked` reads the hosted schema, so it
can only be run after the migration is applied.

### Where 2H.5 starts — unchanged from §36, repeated because it is the next act

`2H-DEPLOY-001…007`, `2H-RETENTION-001…004`, `2H-BACKUP-001…002`, **one
migration**, the phase's last. The groundwork §36 recorded still holds:
`error_events` and `scheduled_job_health` have sweeps and twins but no row in
`private.retention_windows`; `rate_limit_events` has no sweep at all and is the
one class that accumulates for a live user; `account_deletion_attempts` needs
none because it cascades from `auth.users`; and a window must agree in three
places — `private.retention_windows`, `RETENTION_DAYS`, and
`RETENTION_SCHEDULE`, whose `sweepActive` flags stay **false** while nothing is
scheduled.

**Do not mint a new retention value.** §14.1 signs 90 days for the error sink
and 90 days for dead-man history; reuse that signed figure for
`rate_limit_events` and say so loudly. A genuinely new unsigned value is an
owner stop condition.

### Posture, re-read at the close of this session

Signup **disabled** at both layers · CAPTCHA **enforced** · SMTP
**unconfigured** · exactly **five** cron jobs · `delete-account` v3 and
`process-jobs` **v22** both at parity, `heartbeat` undeployed by design ·
deletion reaper **unarmed**, 0/2 Vault secrets · five user-content sweeps and
both 2H.2 sweeps **unscheduled** · **no purge authorized or executed** · no
restore drill executed · **Phase 2I not started.**

## §38 — Phase 2H is COMPLETE, and the two things it could not fix

**Read §36 and §37 first.** This closes them.

### Final state

**44 requirements declared · 44 delivered and cited · 0 partial · 0 undelivered.**
Budget **5 allocated · 5 spent · 0 remaining**, each by its allocated slice.
**Hosted parity `202608070083`, 83 migrations, local = remote.**
PRs **#112–#125**, every merge SHA green ×3 per job **except `4a7e9bd`**, which
was verified green **×1** on explicit owner instruction after its first run came
back green on all three jobs. Every branch preserved.

**The exception is written down rather than rounded off**, and a successor should
read the reason as much as the fact: this phase found a test that failed roughly
**one run in three**, and one run catches such a flake ~33% of the time against
~70% for three. The closeout PR changes no product code, so the exposure is
bounded — but the number in a record must be the number that happened.

| Slice | Merge SHA | Migration |
| --- | --- | --- |
| 2H.1 | `d7d5091` / `57dab71` | `202608070079` |
| 2H.2 | `88c9e3b` / `6d45bc7` | `202608070080` |
| 2H.3 | `46f7244` / `d8aa4ed` | `202608070081` |
| 2H.4 | `70d26a5` / `056e883` / `285d33e` | `202608070082` |
| **2H.5** | **`40f2fac`** | **`202608070083`** |
| **2H.6** | *closeout PR* | none |

Full record: `docs/reports/phase-2h/PHASE_2H_REPORT.md`. Machine-checked
classification: `PHASE_2H_TRACEABILITY_MATRIX.md`, regenerated by
`npm run docs:phase-2h:traceability`, which **refuses rather than print an
unresolved claim** — its first run named exactly the five `2H-CLOSE-*` that
2H.6 had not yet evidenced, and wrote nothing.

### The two findings a successor inherits, because this phase could not close them

**1. There is no operator-restorable backup of this project.** `pitr_enabled:
false`, `backups: []`, organization plan **free**. The schema is recoverable
from git; **the rows are not**, Storage is uncovered on any plan, hosted Auth
configuration is reconstructable but not restorable, and a restore arrives
without `BYOK_MASTER_KEY` and so recovers every credential envelope as
unreadable ciphertext. **This blocks `RG-DEP-3`** — a drill needs something to
restore. Owner action: upgrade the plan, or an owner-run `pg_dump` schedule.

**2. `202608050077` still schedules five user-content sweeps at apply time.**
Its `do $retention_schedule$` block calls `cron.schedule` for seven jobs, five
of them the user-content sweeps. Those five were removed from the **hosted**
project the same day by `scripts/sh6-retention-schedule.mjs` (ADR-082) — but the
migration was not, and could not be, edited afterwards.

So the hosted project has 5 cron jobs and no user-content sweep, while **any
database built from the chain** — CI's `db reset`, a restored disposable
project, any new environment — schedules all five and begins deleting user
content at 04:11 UTC the next morning. **That is the failure ADR-082 was written
about, still live in the chain.** Unscheduling them needs a **sixth** Phase 2H
migration against a budget of five, non-transferable: an owner amendment, or the
first migration of the next phase.

`phase-2h-restore-drill.mjs`'s check 4 already asserts the destructive posture of
a restored copy, so a drill following the documented procedure **would fail that
check correctly** and surface the five schedules before they ran.

### The most transferable thing this phase learned

**Suspect the probe before the product — seven times, and six of the twelve
defects were in probes or controls rather than in the product.**

Four of them are worth a successor's memory:

1. **A harness that must edit an artifact to test it is testing a different
   artifact.** The pgTAP pre-flight strips a migration's own `begin;`/`commit;`
   to splice it into one transaction — so 2H.5's migration passed 31/31 while
   carrying a `commit;` that no other migration in the chain has, and that
   `supabase db push` would have honoured by ending its own transaction. The
   migration's self-assertion would have raised **after** its DDL committed.
2. **Read the probe's output as carefully as its input.** The Management API
   returns only the **last** result set, so `select * from finish()` returning
   nothing is identical whether the run was clean or the middle is invisible.
   Use `_get('failed')`, `_get('curr_test')`, `_get('plan')`.
3. **A scan that reads comments reads history as requirement.** The Edge
   environment scan matched a `Deno.env.get("…")` inside a comment recording the
   project-wide provider key BYOK *removed*; the "fix" would have re-declared in
   a contract the name `project-key-guard.test.ts` exists to forbid.
4. **An assertion about the environment is not an assertion about the product.**
   Two pgTAP assertions passed the hosted pre-flight and would have failed in CI.
   The authorized BYOK prune is `byok-prune-credential-validation-attempts` in a
   chain-built database and `byok-prune-validation-attempts` on hosted — **the
   command is what the authorization was about; the name is an artifact of which
   environment wrote it.** Assert by command.

And one about repairs: **a repaired assertion that merely stopped failing is
indistinguishable from a weakened one.** SH.6's registry check was proven in
three directions — control without the migration (1 failure), repaired without
the migration (2, so the new half is not vacuous), repaired with it (back to 1).

### Posture at close, re-read live

Signup **disabled** at both layers · CAPTCHA **enforced** (`turnstile`) · SMTP
**unconfigured** · exactly **five** cron jobs, none a sweep of this phase's or
SH.6's · `delete-account` **v3** and `process-jobs` **v22** at parity,
`heartbeat` undeployed by design, `verify:edge-parity` fully green · deletion
reaper **unarmed**, 0/2 Vault secrets, 0 stalled rows · **eight sweeps built,
zero scheduled** · **no purge has ever run** · restore drill **not executed** ·
rollout gate **25 pass · 3 fail · 2 owner-signature**, refusing to open signup ·
**no owner-signature gate satisfied on the owner's behalf** · **Phase 2I not
started**, A13 green.

**No successor phase is authorized.** The funnel is empty. ADR-055's semantic
retrieval deferral **expires 2026-10-27** and is now the nearest dated
commitment in the repository.

## §39 — The owner retires green ×3. Read this before you reinstate it.

**ADR-090, an owner decision given 2026-08-07**, at the start of the first
post-2H session. It supersedes the ×3 convention **for all future work**.

| PR kind | Gate |
| --- | --- |
| docs / planning only | **one** complete PR-head CI run, all required jobs green + clean full-diff review → merge. **No merge-SHA run.** |
| code / migration / runtime / deployment-affecting | one complete PR-head run green → review the complete diff → merge → **one** exact merge-SHA run green → *then* deploy / hosted verification |

**Do not re-run an already-green suite to accumulate attempts.** A failure is
investigated and its actual cause fixed; only what is required is re-run. A
flake is a **defect with an owner** — diagnosed, fixed or isolated, and
recorded — never a cost absorbed by repetition. That is the whole substitution
this policy makes: repetition out, investigation and a real diff review in.

**Why a future session will be tempted to reinstate ×3, and why it must not.**
Every Phase 2H acceptance document says "green ×3", correctly, about the past —
`PHASE_2H_SLICE_00…06_ACCEPTANCE.md`, `PHASE_2H_REPORT.md`, the Signup Hardening
records, `docs/CHANGELOG.md`, and §§33–38 above. **None of those is a policy
statement.** They are records of runs that happened, and they were deliberately
not rewritten: a record edited to match a later rule is the falsehood Phase 2H
built six slices of mechanism against. The **only** forward-looking statements
of the rule are ADR-090 and `PHASE_2H_DEPLOYMENT_RUNBOOK.md` §9, and §9 now
carries the old rule struck through beside the new one for exactly this reason.

**The runbook's §9 order also changed**, and the change is substantive rather
than editorial: the merge-SHA run now precedes the migration push and the Edge
Function deploys instead of following them. Under ×3 the old order was a
concession to three sequential runs. With one run required, applying a migration
to production ahead of the only CI evidence that ever sees the merged tree has
nothing left to recommend it.

**What did not move.** RLS · grant boundaries · migration parity (local = remote,
read after every deploy) · destructive-action authorization, ADR-082's
*scheduling IS authorization* · secret boundaries · account-deletion invariants ·
fail-closed rate limiting · the fail-closed signup rollout gate. The policy
changed how many times evidence is collected. It did not change what counts as
evidence.

## §40 — Post-2H rollout readiness: what shipped, and the three defects it found

**Read §39 first** — it carries the CI policy this work ran under.

**Not Phase 2I.** A bounded post-2H effort. No successor phase is authorized,
and none was created. A13 remains green.

### Shipped and deployed

`202608070084` (ADR-091) — merged in **PR #127** at `a20505f`, PR-head CI green
on `50003c2` and **exact-merge-SHA CI green on `a20505f`, attempt 1, all three
jobs**. Under ADR-090 that is one run each, and the merge-SHA run **preceded the
deploy** rather than following it — the ordering §39 corrected.

**Hosted parity `202608070084`, local = remote.** Cron catalog byte-identical
before and after, still exactly five jobs. Edge functions untouched and at
parity. Rollout gate re-read **25 pass · 3 fail · 2 owner-signature**,
unchanged.

The deploy's own NOTICE is the idempotency proof, on the live project:

```
post-2H retention schedule correction: 5 cron jobs before, 5 after,
five user-content sweeps forbidden and absent
```

Five before, five after — nothing removed, because the five were already gone
from hosted; nothing added; **all four postconditions still executed and
asserted.** The migration's real effect is on databases built from the chain,
which is why CI's `db reset` is the proof and a hosted readback is not.

### The three defects, and what connects them

**1. The restore drill counted `public.entities`, a table that does not exist.**
Found by the first census ever taken against the live project (`42P01`). Nothing
had caught it because **the drill had never been run**, so nothing had ever asked
the database whether the list was true. Had it run first, check 1 — the only
check that measures whether the data came back — would have reported a failure
**on a perfectly good restore**, and a reviewer who accepted one known-noisy
failure there would have been trained to discount check 1 generally.

**2. A pgTAP fixture borrowed a live catalog entry, and CI caught it.**
`phase_2h_error_sink_and_deadman.sql` test 46 needed a never-reported job and
used `sh-prune-notifications` — which existed **only because `202608050077`
scheduled it.** Its own comment noted the hosted divergence and called it
"harmless here". It was not: unscheduling the five made the subject vanish and
the assertion read `NULL`. **The test was right to break — it was measuring the
environment, not the product.** There was no surviving job to borrow (everything
else reports since 2H.4, and the BYOK prune's *name* differs by environment), so
the suite now schedules its own subject, exactly as the T-2H-14 probe fifteen
lines below it already did.

**3. The defect also made `RG-QUO-3` pass without an authorized purge — and this
is the worst of the three.** `verify-signup-rollout.mjs` computes
`retentionSweepsScheduled` as *"all five user-content sweeps are in
`cron.job`"*. In any chain-built database all five **were** scheduled at apply
time, so the gate whose entire purpose is to require an **authorized** retention
activation would have read **PASS** — satisfied by the very defect ADR-082 was
written about. Hosted never reached that state only because an operator removed
the five the same day, which means **the gate has been honest by accident rather
than by construction.** No code change was needed: the gate logic was right; the
chain was wrong.

**What connects 1 and 2:** *a fixture must not borrow a live catalog entry.*
Both were probes depending on ambient state they did not own. That is *suspect
the probe before the product* for the ninth and tenth time in this repository.
**3 is the mirror image and the more dangerous shape** — there the probe was
correct and the product was lying to it, which no amount of probe scrutiny would
have found. It surfaced only from asking *what else references these five
names?* after the fix.

### Backup: the verdict changed

**A bounded owner-run `pg_dump` satisfies the restore-readiness contract without
a provider upgrade.** The two classes a paid plan does not cover — Storage
objects and hosted Auth configuration — are **the same two a dump does not
cover**, so the upgrade buys convenience, not coverage. That reverses 2H.5's
recorded "smallest closing action".

Toolchain: `backup:check|census|run|verify|restore-disposable`, 23 guard
assertions. Encryption default-on; checksum over the **plaintext**, because a
ciphertext checksum proves the file survived and not the content; a failed dump
deletes its partials and writes no manifest; the connection string is env-only
and every error is redacted — **the Supabase CLI's own `db dump --dry-run`
prints a live `PGPASSWORD` to stdout**, which is how that hazard was found.

Three restore refusals, no override, two proven by execution. The one that
matters most is the one `--target` cannot make: a *disposable* target alongside
a *production* connection string passes the ref check. **The writes follow the
connection string, not the flag.**

### What was deliberately not done, and a successor must not "finish"

- **`SIGNUP_HARDENING_BACKUP_RESTORE.md` was not created.** `RG-DEP-3` passes on
  that file's mere **existence**. Writing it without a restore would turn the
  gate green on nothing. It gets written when a restore succeeds.
- **No alerting destination was invented for `RG-DEP-4`.** ADR-089 holds: an
  unread alert channel is an *argument* that someone is watching.

Neither owner-signature gate was satisfied on the owner's behalf.

### Two gaps a successor inherits

1. **The rate limiter has no operator read.** 2H.3 built `rate_limit_events`;
   none of 2H.4's five operator reads covers it. Enforcement is proven,
   visibility is missing — the ADR-084 shape again, and **the one gap that
   widens specifically because signup opened.** No migration needed.
2. **The deployed application exposes no commit identifier over HTTP**
   (F-2H.5-4, carried).

### Posture, re-read live at close

Hosted parity **`202608070084`**, local = remote · signup **disabled** at both
layers · CAPTCHA **enforced** · SMTP **unconfigured** (every `smtp_*` null) ·
exactly **five** cron jobs, none a sweep · `delete-account` v3 and `process-jobs`
v22 at parity, `heartbeat` undeployed by design · deletion reaper **unarmed**,
0/2 Vault secrets · **eight sweeps built, zero scheduled** · **no purge has ever
run** · restore drill **not executed** · rollout gate **25 · 3 · 2**, refusing to
open signup · **Phase 2I not started**, A13 green · planning-only workspace for
the next UX initiative at `docs/initiatives/next-experience/`, with **no ADR**.

## §41 — Phase 2I is authorized for PLANNING ONLY, and the audit shrank it

**Read §39 (CI policy) and §40 (post-2H rollout) first.**

**ADR-092, an owner decision, 2026-08-07.** Phase 2I — Foundation and
Findability. **Planning only; implementation is NOT authorized**, and the
planning package does not start it. Scope is the owner's mobile-first PRD's
**Etapa 0 + Etapa 1 only.**

### Why the label covers two etapas and not seven

**A seven-etapa phase cannot close, and a phase that cannot close cannot be
traced, budgeted or gated.** That would break the one mechanism that has made
every phase since 2C verifiable. The parent PRD stays the roadmap and is
decomposed one phase per etapa, in the shape 2C→2H already used: one governing
pair, one migration budget, one closing report, then the next authorization.

### The A13 retarget, and the trap inside it

A13 moved **2I → 2J in the same commit as ADR-092** — fourth application of the
ADR-083/ADR-085 precedent. **ADR-092's heading says *"retargets to the roadmap
successor"* and never names 2J.** That is enforced, not stylistic: the detector
treats an accepted ADR **naming the next phase in its heading** as a start
signal, so an authorizing ADR that named its successor **fails the guard it is
moving.** The first draft did exactly that. If you write the next one, copy the
wording.

`docs/README.md` now records this pattern beside the guard description.

### What the audit found, and why it matters more than the plan

**Read `capabilities.ts` before pricing any navigation work.** The parent PRD
describes a navigation redesign; the code is further along than it feels:

- `home`, `inbox`, `work` (absorbing `today`/`tasks`/`waiting` as aliases) and
  `chat` are **already primary**, with capture as the global centre action in a
  **five-slot mobile bar** — all delivered by product-UX slice H.
- **`chat: "Conversar"` is already shipped.** The earlier neutral-named study
  listed it as pending. It was wrong.
- Library's six members **already share `group: "context"`** — the grouping
  exists as data and is simply not rendered.

**So the navigation slice is one label (`home` → "Início" → Hoje) plus one
grouping.** Twice now a planning pass has over-stated remaining navigation work
by reading the product's *feel* rather than its *source*. The PRD therefore
requires that any rename requirement **cite the exact constant it changes**.

The audit classifies everything **DELIVERED / RENAME / MISSING**, and the
traceability contract carries a matching **`baseline` / `built` / `rename`**
marker — so a requirement that merely asserts an existing property cannot be
reported as though it built something.

### The order, inverted by the owner, and why

**Palette → search → Library.** Twelve destinations sit flat inside `Mais`;
nothing competes for attention because nothing is visible. That is a
**retrieval** problem. Building Library first would group twelve into five and
then build the two tools that make grouping largely unnecessary.

Slices: 2I.0 pre-code · 2I.1 visual language + universal states · 2I.2 trust
components · 2I.3 shell + navigation · 2I.4 palette · 2I.5 search · 2I.6 Library
· 2I.7 closeout.

### Migration budget: MAXIMUM ONE, and zero is the preferred close

Allocated to **2I.5 only**. The input was established rather than assumed:
**no `tsvector`, no `to_tsquery`, no GIN index, no `pg_trgm` anywhere in the
84-migration chain.** Gate **G-2I.2 decides by measurement, before any search
code**, and records the numbers. `1 allocated · 0 spent` is a success. Not
created during planning; must not be created to justify the budget.

### The search surface, read from the schema

Seven existing tables, **no new data model**: `tasks`(title, description) ·
`entries`(original_content) · `memories`(content) · `people`(name, notes) ·
`projects`(name, description) · **`organizations`**(name, description) ·
**`attachments`**(original_name, description, `extracted_text`).

**Two vocabulary facts to reuse rather than re-derive:** "Companies" is
`organizations`, displayed **Empresas/Companies** (the label already exists and
carries its EGC.1 reasoning); "Files" is `attachments`, reached at the `files`
route.

### Two owner decisions block slice 2I.5 (gate G-2I.5)

- **OD-1 — do `private`/`highly_sensitive` records appear in search results?**
  Three domains carry `sensitivity in ('normal','private','highly_sensitive')`
  and nothing declares search behaviour for them, because there has never been a
  global result list. Not confidentiality — the user owns all of it — but
  **expectation**. *A search feature that silently surfaces every class has
  taken this decision by omission.*
- **OD-2 — is `attachments.extracted_text` searchable?** Document content, not
  text the user typed.

Both cheap now, expensive after users form expectations.

### Signed owner decisions, recorded so they are not re-taken

Signup is **not** a prerequisite; instrumentation separates the internal cohort
from a future public one and **current-population figures are never public
activation evidence**. **Dark mode is out**, not partially implemented.
**Original audio is discarded** after confirmed transcription — recorded now as
an input to the future Etapa 2 phase; **voice is not in 2I**, and if a provider
requires temporary retention, *document the exact provider behaviour before
implementation*.

### Threat surface, and the one most likely to be built by accident

Phase 2I adds **no write path, no model call, no RLS policy, no grant, no secret
and no external service.** Two real threats: **T-2I-01** search as an
enumeration oracle (mitigated in the query, proved in pgTAP **with a second
account**), and **T-2I-02** the palette as a second write path — **the likelier
one, because the generic-command-executor version is better engineering by every
local measure, which is exactly why it gets built.**

**ADR-055 expires 2026-10-27** and `2I-SEARCH-010` forbids embeddings, vector
retrieval and generated answers. Lexical search is what would *generate* the
evidence ADR-055 wanted; it must not quietly resolve it.

### Posture at close of planning

Hosted parity **`202608070084`**, local = remote · signup **disabled** ·
CAPTCHA **enforced** · SMTP **unconfigured** · five cron jobs, none a sweep ·
reaper **unarmed** · **eight sweeps built, zero scheduled** · **no purge has
ever run** · rollout gate **25 · 3 · 2**, untouched by this authorization ·
**Phase 2I planned and unstarted; Phase 2J not started, A13 green.**

## §42 — Phase 2I is COMPLETE, and the audit it was built on was wrong three times

**Read §39 (CI policy), §40 (post-2H) and §41 (2I planning) first.**

**61 declared · 61 classified · 0 undelivered.** 53 built, 4 baseline, 1 rename,
2 evidenced negatives, 1 partial. **Budget 1 allocated · 0 SPENT.** Hosted parity
**unchanged at `202608070084`** — the phase added no migration, so there was
nothing to deploy.

| Slice | PR | Merge SHA |
| --- | --- | --- |
| 2I.0–2I.3 | #131 | `e2779a5` |
| 2I.4 | #132 | `1660bad` |
| 2I.5 | #133 | `4295200` |
| 2I.6–2I.7 | #134 | closeout |

One green PR-head run and one green merge-SHA run each. ADR-090 held all the way
through; no rerun was used as an acceptance mechanism.

### The thing a successor should actually take from this phase

**Read the source before pricing UX work.** The Phase 2I audit — which I wrote,
after explicitly warning that the previous pass had over-stated navigation work
— **over-stated it again, three times**:

1. `chat: "Conversar"` had already shipped;
2. `Mais` already rendered grouped destinations with visible labels and
   `role="group"` on both breakpoints;
3. Library's membership already existed as `group: "context"` data.

Each was found by reading `capabilities.ts`, `messages.ts` or
`navigation-links.tsx` rather than the plan. `2I-SHELL-003` was reclassified
**built → baseline** mid-phase.

**This is why the matrix carries `baseline` as a class distinct from `built`.**
A phase that reported an assertion of existing behaviour identically to
something it constructed would, in this case, have overstated itself three times
over. If you inherit a UX plan, assume it over-states, and make every rename or
rebuild requirement **cite the exact constant it changes**.

### The migration that was not spent

G-2I.2 measured **before** any search code existed. Sequential `UNION`
338–669 ms (fail); parallel slowest-domain 121–244 ms (pass).

**The parallel shape was not chosen to fit the budget** — `2I-SEARCH-006` and
`2I-SEARCH-007` already required per-domain queries, so the wall clock was
always going to be the slowest domain. The measurement confirmed a shape the
requirements had already fixed.

Revisit threshold: **~10 000 entries or ~1 000 attachments with
`extracted_text`** per owner. `scripts/phase-2i-search-benchmark.mjs` is
committed and safe to re-run against production.

### The benchmark's safety design, which is the most transferable thing here

It seeds **thousands of rows into production tables**. The first draft wrapped
them in `begin;` and relied on the Management API not committing — **a guess
about someone else's transaction handling**, and being wrong leaves the fixtures
behind.

It became **a single `DO` block whose only exit is a `raise`**. A `DO` block is
one statement and is atomic, so the raise rolls back every insert, every trigger
disable and every `set_config` regardless of what the caller does with
transactions. Measurements ride out in the exception message, and every run
reads the table back and prints `rollback verified: 0 benchmark rows persisted`.

**If you ever need to measure against production, copy this shape.**

### Two requirements delivered by NOT being built

`2I-LIB-004` — **zero** pin/favourite columns exist anywhere in the schema, and
adding one would be the data model `2I-LIB-002` forbids one line above.
`2I-PALETTE-009` — recents need state that outlives the palette, which
`2I-PALETTE-010` forbids.

Both are **re-derived, not asserted**: the Library guard re-reads
`database.types.ts` every run, so a future migration adding a `pinned` column
breaks the test rather than silently invalidating the claim.

### What is still owed

- **`2I-CLOSE-002` is PARTIAL.** Component accessibility is asserted by test;
  **no axe pass, no screen-reader session, no Playwright journey** over palette,
  search and Library. Destination: a Playwright accessibility lane. Do not let a
  successor read the matrix and conclude accessibility is done.
- **Locale debt: 263 → 263.** The ratchet held but did not fall, because this
  phase created surfaces rather than rewriting them.
- **The rate limiter still has no operator read** (carried from post-2H).

### Defect tally

**Fifteen, thirteen of them in probes, fixtures, guards or tooling.** Three
guards failed on *correct product code* for one root cause — scanning raw text
including comments, so a header saying *"no `pt ?` ternary is added"* was read
as the violation. Two were in the generator and both surfaced as refusals: it
rejected `partial` as an unknown class when the contract permits it, and it
could not be imported by its own test until the repo-root computation matched
Phase 2H's. **A generator no test can import is a generator nothing proves.**

The generator **refused on its first real run**, naming nineteen unevidenced
requirements individually. Eleven mutation fixtures, one defect each, plus a
**clean baseline fixture** so every negative differs by exactly one thing.

### Posture at close

Hosted parity **`202608070084`** · signup **disabled** · CAPTCHA **enforced** ·
SMTP **unconfigured** · five cron jobs, none a sweep · reaper **unarmed** ·
**eight sweeps built, zero scheduled** · **no purge has ever run** · rollout gate
**25 · 3 · 2**, untouched · **ADR-055 open and unchanged, expiring 2026-10-27** ·
**Phase 2J unstarted, A13 green.**

**No successor phase is authorized.** The parent PRD's Etapa 2 is the natural
next one, and its voice audio-discard contract is already signed and recorded in
`PHASE_2I_PRD.md` §13 — but naming it is not authorizing it.

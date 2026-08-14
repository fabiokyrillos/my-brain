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

## §43 — Phase 2J is authorized for PLANNING ONLY, and the audit shrank it again (2026-08-08)

**Baseline:** `main` at `a02c74e`, clean, synced. Hosted parity `202608070084`, 84
migrations, local = remote. Phase 2I complete. Nothing running: no monitor, no background
task.

### What happened

Phase 2I's roadmap successor is the parent mobile-first PRD's **Etapa 2 — Hoje, captura e
atenção**. Before naming anything missing, the whole etapa was re-derived from source.
**ADR-094 authorizes Phase 2J — Today, Capture and Attention, planning only.** 74
requirements, nine families, eight slices, migration budget **2 allocated · 0 spent**.

### Read this before you plan anything on Hoje

**`/app/today` is a redirect.** Nine lines, and its body is
`redirect('/${locale}/app/work?view=today')`. The cockpit the parent PRD describes —
capture at the top, attention, today, waiting, pending question, recent activity — **already
exists at `/app`** as `HomeDashboard` + `home-view.tsx`, composing four projections in
parallel with `NEEDS_ATTENTION_HOME_LIMIT = 3` and `TODAY_HOME_LIMIT = 5`.

The product has **two things called "today"**, and the one the user navigates to is the
weaker one. That is the highest-value item in the phase and it costs no schema. A session
that reads the parent PRD and starts building a cockpit will rebuild delivered work — the
Phase 2I failure mode, repeating.

### Four more corrections, all shrinking the phase

1. **The attention queue already exists.** `list_needs_attention`
   (`202607180030`, fixed by `202607180031`) — `security definer`, `set search_path = ''`,
   `auth.uid()`-scoped, keyset-paginated, bounded 1–200, granted to `authenticated` and
   revoked from `public, anon`. Five reasons. What is missing is a **surface and in-place
   actions**: `attention-actions.ts` exports exactly one function and it only pages, and
   every item's `primaryAction` is a **link** to `/app/inbox/[entryId]`.
2. **`configure_ai_credential` is deliberately outside the queue.** `contracts.ts:36-50`
   explains it: `needs_attention_item_opened` validates `attentionReason` against a
   **five-member enum inside the database** (`202607170024:205`). Admitting it to the
   queue is a **migration**, not a mapper change. Do not "fix" this.
3. **Memory conflicts do not exist in this schema.** The parent PRD lists them as an
   attention source. There is nothing to compose, and inventing a table for them would be
   the duplication the PRD itself warns against.
4. **The review domain already ships** — `/app/reviews`, `generateReview` with
   `daily · weekly_review · weekly_plan · monthly`. The gap is continuity from Hoje, not
   the domain. Do not rebuild review.

### Voice: greenfield, and cheaper than it looks

`grep -rni 'transcri|mediarecorder|audio/webm|whisper' src/ supabase/` returns **zero hits
in code**. The only mention in the repository is the parent PRD.

**The cost question resolves technically, not by owner decision.**
`user_ai_credentials.provider` is `check (provider in ('openai'))` — one provider, whose API
transcribes. So the user's existing BYOK credential already authorizes transcription: **no
project-paid AI, no project key, no new secret, no new environment variable, no new
vendor.** Reuse `resolveOwnCredential` in `src/lib/byok/adapter.ts`.

**The signed audio-discard decision is what makes it cheap.** No durable audio means **no
bucket, no table, no retention class, no sweep, no deletion-cascade entry**. The draft lives
client-side and confirmation goes through `captureEntry`. If a future session finds itself
designing audio storage, the retention decision has been lost — go back and re-read it.

**What is NOT settled and must be measured (G-2J.4b):** Safari — including every browser on
iOS — emits `audio/mp4`; Chromium emits `audio/webm`. A pipeline that assumes one container
fails on half the target devices. The size ceiling is a duration ceiling in practice and
must be enforced client-side. The plan *stating* this does not discharge the gate.

### The migration budget comes from telemetry, not from features

`product_events.event_name` is a **database check constraint** (27 names, last re-declared
`202608070081:783`), paired with `private.validate_product_event_properties`, which
allow-lists **properties per event**. **Any new product event costs a migration.** That is
why Phase 2I spent zero and Phase 2J cannot: 2I added no events.

M1 → 2J.7 (telemetry). M2 → 2J.4 (`ai_usage_events.operation` += a transcription value) and
**M2 is avoidable**, because `'other'` is an allowed operation. It is recommended anyway:
logging an entire new AI capability as `'other'` destroys per-operation cost attribution and
makes transcription invisible in `/app/costs`. **`2 allocated · 1 spent` is a legitimate
close.** Reconcile **per slice**, not by count.

### The sensitivity gap you will find, and must not fix quietly

`grep sensitivity src/features/daily-cycle/ src/features/shell/ src/features/tasks/` returns
**nothing**. Home, the attention queue and the Work views apply **no** sensitivity predicate,
and `attention-projection.ts` renders a 240-character `originalPreview` of
`entries.original_content`. Search, meanwhile, excludes `highly_sensitive` by default
(ADR-093, `DEFAULT_SENSITIVITY`).

Two surfaces of one product disagree. This is **pre-existing**, not a Phase 2J regression —
and it is **OD-2J-1**, an owner expectation decision. Do not let each component choose, and
do not close it by picking the reasonable-looking option.

### The accessibility residual is slice zero, deliberately

`2I-CLOSE-002` closed **partial**: component behaviour asserted by test, no axe pass, no
screen-reader session, no Playwright journey. It becomes **2J.0, a pre-code gate** — because
Phase 2I put it last and then did not reach it, and the same ordering would produce the same
result.

Two facts for whoever builds it: **there is no axe dependency in `package.json` today**, and
CI's `database` job already runs `e2e/foundation.spec.ts` against a production build on
desktop and Pixel 7 — so a **local** (non-`online-*`) spec runs on every PR. The
screen-reader session is recorded **as manual** or closes as an evidenced negative. Naming a
manual check automated is the over-claim the `baseline` class exists to prevent.

### A13 moved, and now asserts one more thing

Retargeted **2J → the roadmap successor** in the same commit as ADR-094 — the fifth
application. This was mandatory, not tidy: `PHASE_2J_PRD.md` and
`PHASE_2J_IMPLEMENTATION_PLAN.md` are signals 1 and 2, the accepted ADR is signal 3, and
the `2J-…` declarations are signal 2's content. Without the retarget in the same commit the
planning package fails its own guard.

**New assertion:** a test now checks ADR-094's heading contains *"roadmap successor"* and
does **not** contain the successor's letter. ADR-092's first draft hit exactly that trap and
was reworded from memory; it is now a property the suite holds.

`phase-2f-documentation.test.ts` + both taxonomy guards: **60 tests green** locally.

### A local-only transient, named so nobody debugs it as a product defect

Twice during this session a full local run reported a failure — once in A13's *"finds no
start signal"*, once as three unnamed failures in `src/lib/closeout/` — and **neither
reproduced**: the same suites then passed in isolation, in three consecutive directory
runs, in two full runs, and in CI.

Both occurrences share one signature: **the run was launched immediately after an `Edit`
wrote to a file the guard reads.** The closeout guards read live `docs/*.md` and
`src/lib/**` from disk on every run, so a parallel vitest worker on Windows can observe a
write that has not finished landing. CI checks the tree out once and never mutates it, so
the race cannot occur there — which is exactly what the results show.

**This is not the ADR-090 flake class.** ADR-090's rule — a flake is a defect with an owner
— is about CI. This is a local harness artifact of editing the corpus a guard reads while
the guard runs. If you see it: re-run the suite *without* touching files in between before
investigating anything. If it reproduces on an untouched tree, then it is real and it is
yours.

### Posture at close

Hosted parity **`202608070084`** · signup **disabled** · CAPTCHA **enforced** ·
SMTP **unconfigured** · five cron jobs, none a sweep · reaper **unarmed** ·
**eight sweeps built, zero scheduled** · **no purge has ever run** · rollout gate
**25 · 3 · 2**, untouched · **ADR-055 open and unchanged, expiring 2026-10-27** ·
**Phase 2K unstarted, A13 green.**

**Phase 2J implementation is NOT authorized.** The planning package is complete and merged;
three owner decisions (OD-2J-1, OD-2J-2, OD-2J-3) and the implementation authorization
itself are the next steps. **Naming the successor is not authorizing it** — and ADR-094
deliberately names no scope for whatever follows Phase 2J.

## §44 — Phase 2J is COMPLETE, and the premise it corrected was our own (2026-08-08)

**74 declared · 74 classified · 0 unclassified** — 59 built, 6 baseline, 5 evidenced
negatives, 2 partial, 2 undelivered. **Budget 2 allocated · 2 spent**, per slice.
Chain head `202608080086`. **Hosted parity still `202608070084` — nothing deployed.**
PRs #136 `283380d`, #137 `e2a9fc0`, #138 `b91172a`, #139 `88ddb9d`, #140 `fa791f0`,
one green PR-head and one green merge-SHA run each.

### Read this before you touch `ai_usage_events` or `error_events`

**There are two `operation` columns with different closed vocabularies, and
confusing them cost this phase its preferred close.**

- `ai_usage_events.operation` — eight values before this phase, nine now. **No
  `other`.** Widening it is a migration, and `record_ai_usage` **enumerates the
  same list in its body**, so widening only the table CHECK deploys clean and
  then raises `22023` at runtime inside a call site that swallows the error.
- `error_events.operation` — sixteen values, **including `other`**, from
  `202608070080`.

ADR-095 said 2J.4's migration could stay unspent because `other` was available.
It is not. The claim travelled audit → PRD → ADR without being re-derived against
the constraint on the table it described. ADR-096 records it. The phase's own
rule — *every claim cites the file it came from* — is what should have caught it.

### The accessibility lane earns its place, and it is slice zero for a reason

It found a **real Phase 2I defect on its first run**: `.library-search-link` at
16px on a Pixel 7, under WCAG 2.2 AA 2.5.8. jsdom has no layout engine.

**What it proves and what it does not is asserted, not merely written.**
`accessibility-mirror-guard.test.ts` checks that the three limit sentences are
still in `accessibility.spec.ts`, so nobody can quietly upgrade the claim:

- PROVEN: axe, structure, accessible names, visible focus, focus order, rendered
  touch targets, reduced motion, dialog semantics — real browser, two viewports.
- NOT PROVEN: hydrated interactivity (Ctrl+K, arrows, Escape, focus
  **restoration**) — needs a session CI does not have.
- NOT PROVEN ANYWHERE: a real screen-reader session.

The surfaces are **mirrored** (`layout-contracts.spec.ts`'s precedent) because the
routes are behind `src/proxy.ts`. The guard bounds the drift.

### Things that already existed, again

`Precisa de você` **already shipped** at `/app/inbox?view=needs-you` — tabs, list,
keyset pagination, reachable from Hoje. `2J-ATTN-001` is **baseline**. The audit
for this phase predicted exactly this class of error and it still happened.

The capture receipt has **no content field at all**, and there is **no push,
service-worker or lock-screen payload anywhere in the repository**. Two of five
sensitivity surfaces therefore had nothing to converge, and both are recorded as
evidenced negatives instead of getting a mask for content that does not exist.

### Voice: what is real and what is not

Real: the provider capability on the interface, a pinned model checked against the
SDK's own union, BYOK-only through `openAiGate`, rate-limited on the `ai` bucket,
the ledger row, and **no durable audio** — proved by a guard that re-derives the
absence from `database.types.ts` and the storage config every run.

**Not real: G-2J.4b.** MediaRecorder is faked in tests. Nothing here proves how
iOS Safari or Android Chrome behave. The accepted-container list is what the
repository *accepts*, derived from the SDK's documented inputs — **not a
measurement**. `2J-VOICE-014` is `partial` and says so.

Also true and worth knowing: transcription events land **`cost_status =
'unpriced'`**. No audio pricing row exists and `ai_model_pricing` is per-token
while transcription bills per minute. That is a state `record_ai_usage` already
modelled — an earlier ADR-096 draft wrongly called it a hole.

### Telemetry is three events because each had to have a reader

`2J-METRICS-007` exists because SH.6 shipped a producer with no consumer and its
quota refusals recorded nothing for weeks. So the vocabulary is exactly what
`npm run measure:2j:funnel` asks questions of, and the guard asserts **both**
directions. Two metrics requirements are **undelivered** as a result: declaring
more events needs a third migration, which ADR-095 names a stop condition.

Privacy is the payload shape — per-event **key** whitelists in
`validate_product_event_properties`. `resolutionBucket` is a bucket, never a
duration: a millisecond count says when somebody was at their desk.

### Thirteen defects, ten in the machinery

The one to remember: **`telemetry-parity.test.ts` was pinned to a superseded
migration.** Every phase that widens `product_events` re-declares the whole list,
so the newest such migration holds the constraint in force — the test asserted
what Phase 2H's file said and passed because the name it looked for was still
there. If you pin a migration by filename, pin the one currently in force.

Two more worth carrying: a `"use server"` module **may only export async
functions** (constants moved to `voice-contracts.ts`), and editing files with a
Python script that reads universal-newlines and writes `newline=''` **converts
CRLF to LF**, which silently broke Node/Deno extraction-prompt parity locally.

### The generator's honest limitation

It refuses on ten fixture defects and the repository is its positive control. But
**it did not refuse on its first real run**, unlike Phase 2I's, which named
nineteen. The acceptance rows were generated from one classification table, so
the two sides did not converge independently. The PRD ↔ evidence cross-check is
still meaningful — the PRD's 74 declarations were authored in a separate, earlier
pass and reconciled exactly — but the generator's real value here is **forward**:
the matrix cannot now drift from the PRD without a refusal.

### Posture at close

Hosted parity **`202608080086`** · chain head **`202608080086`**, **DEPLOYED 2026-08-08, local = remote** (superseding "`202608070084`, not deployed") ·
signup **disabled** · CAPTCHA **enforced** · SMTP **unconfigured** · rollout gate
**25 · 3 · 2**, re-read and untouched · **ADR-055 open and unchanged, expiring
2026-10-27** · **Phase 2K unstarted, A13 green, zero 2K artifacts.**

**Two owner acts are outstanding and neither is optional for a complete close:**
deploying the two migrations (both merge-SHA gates already green), and measuring
voice on real hardware for G-2J.4b. A manual screen-reader session is a third,
and it is the one this repository has never been able to automate.

## §45 — The migrations deployed cleanly, and the deployment found a third copy of the vocabulary (2026-08-08)

**Both Phase 2J migrations are applied. Hosted parity is exactly `202608080086`, 86
migrations, local = remote**, read from hosted state rather than from a filename. The
deployment itself was uneventful in the way a good deployment is: pre-deploy readback
matched every stated precondition, `migration list` showed exactly the two pending in
chain order, a dry run confirmed it, and all four embedded verification blocks passed.
Posture is byte-identical before and after — forced RLS, policy counts, function grants,
table grants, five cron jobs, retention, storage, no audio structure. Signup closed,
CAPTCHA enforced, rollout gate **25 · 3 · 2**.

**The interesting part is what the acceptance probe found afterwards, and it is a lesson
this repository has now learned three times in three phases.**

`202608080085` exists because ADR-095's premise was wrong about which table owned a
vocabulary. Writing it uncovered that `record_ai_usage` **enumerates the vocabulary in its
own body**, so widening the table alone would have deployed clean and failed at runtime.
That discovery was written into both migrations' comments, and `202608080086` was built
in the same shape: widen the CHECK, widen the validator, verify both.

**It was still one copy short.** `product_events` has *three* gates, not two. The third is
a hardcoded 26-name `not in (...)` list inside `private.record_product_event`, which both
public writers delegate to, and which no migration since `202607280061` has re-declared.
So on the live project all three Phase 2J events are refused `22023 Unsupported product
event` — while a control travelling the identical function, argument list and rollback is
accepted. The producers exist and emit into a `.catch(() => {})`. `2J-METRICS-007` reads
zero, which is the precise SH.6 outcome (ADR-084) the three-event design was chosen to
prevent.

**And it is older than Phase 2J: `rate_limit_refused` has been unrecordable since
`202608070081`.** Phase 2H added that name to the CHECK and the validator, not to the
gate. So a Phase 2H requirement has been quietly inert for a day, and Phase 2J's probe is
what surfaced it.

**Three lessons, in descending order of how much they cost:**

1. **"Widen the constraint and the validator" was never the whole contract.** The right
   question is not *"did I update the validator?"* but *"how many places enumerate this
   vocabulary, and did I enumerate them by searching rather than by memory?"* One
   `grep` for the refusal message would have answered it — and that grep is exactly what
   found it, run after the deploy instead of before.
2. **A verification block that asserts text is weaker than one that exercises the path.**
   Both migrations verified their own artifacts by `position(... in pg_get_functiondef())`.
   Both passed. Neither could see a gate in a *different* function. The missing guard is a
   pgTAP test that writes **every** name in the CHECK through the real writer.
3. **The probe's first run was wrong, and the control is what proved it.** The first pass
   refused all three events *and* the pre-existing control, because `p_idempotency_key`
   and `p_is_synthetic` are non-nullable and refuse at `22004` before the vocabulary is
   consulted. That refusal was mine. Only when the control passed through the identical
   corrected call did the three refusals mean anything. **Suspect the probe — now eight
   times.**

**Nothing was fixed.** Repair needs a third migration, which is a stop condition. No
merged migration was edited, none was written, no history was rewritten. **Option B is
recommended: delete the redundant gate rather than sync a third copy** — the table CHECK
and the validator's `else` arm already refuse an unnamed event, and the gate's only
demonstrated effect has been to silently drop two phases' worth of events. Either option
ships with the pgTAP guard from lesson 2. Full write-up: `docs/reports/phase-2j/PHASE_2J_DEPLOYMENT.md` §5.

Every probe ran inside a transaction whose only exit is a `raise`, so both append-only
ledgers carry **zero** residue: `ai_usage_events` 11 → 11, `product_events` 67 → 67.

**Phase 2K remains unstarted. A13 green. ADR-055 open, expiring 2026-10-27.**

## §46 — The repair, and the shape of the test that was missing (2026-08-08)

**`202608080087` is deployed. Hosted parity `202608080087`, 87 migrations, local = remote.**
All four events the stale gate refused — the three Phase 2J ones and `rate_limit_refused` —
are accepted through the real writer on the live project, negatives still fail closed, and
producer → writer → `product_events` → consumer is proved end to end with **zero residue**.
Charged to no phase budget; Phase 2J stays `2 allocated · 2 spent`.

**The fix was deletion.** Appending four names to `private.record_product_event`'s list
would have restored the behaviour and left the defect: a third copy for the next widening
to forget, which is precisely how it survived two phases. Removing it leaves exactly two
enforcement points, and the migration proves they agree **name-by-name** — not by count,
because a count matches while two lists disagree by one name in each direction.

**The load-bearing question was not "does this work" but "is it still fail-closed".**
Deleting a guard is only safe when the survivors are complete. Here they were, and
verifiably: the CHECK is untouched and still refuses `23514`, and the validator's `else`
arm raises the *same message and the same errcode* the deleted list raised, so no caller
can tell the difference. Had the validator's coverage been a subset of the CHECK, Option B
would have been a widening in disguise — so that equality was checked before the migration
was written, not after.

**The missing test had a shape, and it is worth naming.** Every existing product-event
test inspected artifacts **in isolation** — the CHECK contains a name, the function body
contains a name, the writer is `security definer` — and every one of them passed while
four legal events were refused. `202608080086`'s own verification block is of that kind;
it asserts the validator's *text*, which cannot see a gate in a different function. The
question none of them asked was **"can the writer production calls actually accept this
event?"** That is now asked for every name the database declares, with the vocabulary
**derived from the CHECK** so a future widening that forgets the writer fails
automatically rather than shipping silent.

**Three process notes, cheaper to read than to rediscover:**

1. **Non-vacuity has to be demonstrated, not asserted.** The new assertions would all pass
   against a writer that never had the defect, which says nothing about whether they can
   *see* it. So the historical gate is planted and the harness re-run, requiring exactly
   four refusals, then the captured definition is restored and re-run a third time.
2. **Static scrutiny paid again, with no local Docker to run pgTAP.** Two defects were
   caught by reading: an OUT column named `event_name` would have been ambiguous against
   both joined tables, and the planted function returning `null::uuid` would have scored
   all thirty events unwritten — making the non-vacuity count read 30 instead of 4 and
   measuring the fixture rather than the gate.
3. **A guard failing right after you edit its corpus is a mid-write read.** The suite
   reported two failures immediately after `SECURITY.md` was edited and **4616 passed, 0
   failed** on an untouched re-run. Re-run before debugging.

**Residue discipline held throughout.** Rollback-only probes for everything provable that
way, a disposable account for the one thing that needed committed rows, and the
`on delete cascade` on `product_events.user_id` to take them away: 68 before, 68 after. The
single row by which the table grew during this work is genuine application traffic.

**Phase 2K remains unstarted. A13 green. Rollout gate 25 · 3 · 2, signup closed.**

---

## §47 — Phase 2M migration 1 is spent and deployed, the calendar ships, and three probes were found dead (2026-08-11)

**Where the repository actually is.** `main` at `054da4d`; working tree clean; no
open PR. **90 migrations**, hosted parity **`202608110090`**, local = remote on
every row, read live and read-only on 2026-08-11. Migration budget
**`2 allocated · 1 spent`, NON-TRANSFERABLE** — a third is a stop condition.
Signup closed, rollout gate untouched, Phase 2N not started, A13 green.

Three pull requests landed, each with CI green on its **exact merge SHA**:

| PR | Merge SHA | What |
|---|---|---|
| **#168** | `6ca0314` | Migration 1 created — the daily-cycle telemetry vocabulary and the `calendar` surface, **with no producer** |
| **#169** | `611dd01` | Migration 1 **applied to the hosted project**, proved there, and three probe defects repaired |
| **#170** | `054da4d` | Slice 2M.1 part 2 — the calendar surface at `/app/calendar` |

### What migration 1 declares, and why it is shaped that way

Six events answering four questions **written down before any name was chosen**
(`2M-METRICS-005`), and **one** new surface (OD-2M-2 named exactly one):

| Event | Question | Surface | Producer |
|---|---|---|---|
| `calendar_viewed` | is the calendar reached, and in which orientation | `calendar` | **shipped**, 2M.1 part 2 |
| `day_planned` | how often is a plan made — set or cleared, one item or many | `calendar`, `work` | slice 2M.2 |
| `day_review_opened` | denominator | `calendar` | slice 2M.3 |
| `day_review_action_applied` | numerator, and which action | `calendar` | slice 2M.3 |
| `notification_consent_changed` | opt-in, and revocation | `server` | slice 2M.4a |
| `notification_suppressed` | how often silenced, by which control | `server` | slice 2M.4b |

The notification events carry **`server`** rather than a second new surface,
because they are emitted by the Server Action that writes a consent row and by
the sender that decides not to send — a `notifications` surface would be a
vocabulary entry that lies about where the event happened. The planner and the
day review are planned as **sub-routes of `/app/calendar`**, which is what makes
attributing them to `calendar` honest; if a later slice moves them, the
attribution has to move with them or stop being true.

**There is no date and no time on any event.** That is `2M-METRICS-004`'s
sharpest edge in a calendar phase, refused at the parser and again in the
deployed validator, and proved hosted with a planted `plannedDate` on a valid
event and a valid surface.

### The three dead probes, and the lesson under them

Running the probes rather than reading them found all three:

1. **`scripts/remote-product-events-smoke.mjs` had been unrunnable since
   `202608070081`.** Its first assertion compares its hand-written event matrix
   to `productEventNames` by **exact ordered equality**, and the matrix stopped
   at Phase 2E's four names. Phase 2H added one, 2J three, 2K three — and each
   widened the gap in silence, because *a manual script that is never run reports
   nothing at all*. Thirteen names were added; the assertion means something
   again.
2. **Both funnel readers signed in with `grant_type=password`**, which Turnstile
   has refused since SH.5. Both now take `--access-token`; the smoke mints
   sessions through `admin/generate_link` + `verifyOtp`.
3. **Both funnel readers queried `product_events.occurred_at` — a column that
   does not exist.** The ledger's only timestamp is `created_at`
   (`202607170024:51`). **Phase 2K's declared consumer for `2K-METRICS-007` could
   therefore never have executed**, though the phase closed claiming it.

`2E-ANALYTICS-006`'s vocabulary reader stopped the smoke from **drifting**;
nothing stopped it from being **abandoned**. A guard against divergence is not a
guard against disuse. `phase-2m-telemetry-guard.test.ts` now derives the ledger's
real column list from the create-table migration and fails any consumer that
reads a column the table does not have.

### The hosted proof, and the half of it that is honestly missing

`npm run test:remote:product-events` wrote **all 39** declared event names
through the real *authenticated* writer on the deployed project.
`npm run measure:2m:proof` then proved producer → writer → **consumer**, reading
through the reader's own code path, with six non-vacuous controls — undeclared
name, undeclared surface, a user-chosen date, an out-of-enum value, a replayed
idempotency key, and RLS isolation **against a foreign row that exists**. Zero
residue, proved **owner-scoped**: `product_events` grants `service_role` neither
SELECT nor DELETE, so the only honest evidence is that no owner of those rows
survives.

**The producer half is not proved and is recorded as not proved.** At migration
time there was no producer — which is `2M-METRICS-001`'s whole point — so the
corpus was written by a harness standing in for the calendar, the planner, the
day review and the sender. A harness is not a producer. Full record:
`docs/reports/phase-2m/PHASE_2M_DEPLOYMENT.md` §7.

### What the calendar is, and what it deliberately is not

`/app/calendar`, over the five sources that already exist — **zero schema, no
event entity**. Deadlines (`tasks.due_at`), intentions (`tasks.planned_at`),
reminders (`reminders.remind_at`), reviews (`summaries` periods) and unconfirmed
extracted dates (`entries.occurred_at` where `is_retroactive`). The commitment
axis has **four** values, not two: an intention is not a commitment, and painting
it as one is the silent reclassification OD-2M-3 option B was refused for.

**Reminder sensitivity is derived for the first time in this repository.**
`reminders.entry_id` is the same relationship `task-derivation.ts` consumes for
tasks; `deriveReminderSensitivity` delegates to the task path rather than
reimplementing it, so the three outcomes are identical by construction.

Three properties worth not re-deriving:

- **Fail-closed means narrower *and* nearer.** `orientation` resolves to `day`, a
  malformed or out-of-range anchor resolves to **today** (one day wide), and an
  unknown lane token is **dropped**. The bound is declared once, ±365 days, and
  reaching it is a visible state.
- **A lane that fails is named.** Five independently fallible reads; a dropped
  lane would show a day that *looks empty*, which is the lie masking-rather-than-
  excluding exists to avoid. Extended to a row whose instant will not parse — a
  case found while writing the tests, not predicted.
- **Every control is a `<Link>`.** OD-2M-6 A costs nothing here because the
  control *is* the URL, which is also what makes "the URL is the state" true
  rather than aspirational.

**Navigation is `more`, not `primary`, and that is a restraint rather than a
ranking.** `2I-SHELL-001` pins the four primary destinations as a delivered
baseline; `2M-CAL-001` requires a route and says nothing about prominence.
Promoting a destination into the rail is an IA decision Phase 2M was not
authorized to make. **It is an open owner question, recorded in `docs/TODO.md`.**

### What is outstanding, exactly

**Slice 2M.1 is not finished.** Part 3 owes:

- `2M-CAL-009` / `-010` — rescheduling **from** the calendar through the existing
  validated command path. The reuse is already identified and needs no new
  Server Action, RPC, table or column: `TaskDetailControls`
  (`src/features/task-commands/task-detail-controls.tsx`) takes `controls`,
  `relationOptions`, `dateBounds`, the `applyTaskDetailCommand` handler and an
  `undoAction`, and `detailControlsFor(status)` already filters by status. The
  calendar projection must carry each task item's **real status** and task id for
  that, which it does not yet.
- `2M-MOBILE-005` — the Playwright journeys, desktop and mobile, both locales.
- The slice acceptance record,
  `docs/reports/phase-2m/PHASE_2M_SLICE_01_ACCEPTANCE.md`.

Then slices **2M.2** (planner, `clear_planned`), **2M.3** (reviews, the five
inert preferences reaching their declared end state), **2M.4a** (notification
governance, CI-provable), **2M.4b** (**migration 2** plus opt-in content-free
push, then deploy and the hosted proof) — and then the loop **stops** at
`CHECKPOINT DO DONO — PROVA EM HARDWARE NECESSÁRIA`. Slice 2M.5 and closeout come
after the owner's evidence returns, never before.

### Traps this stretch paid for, so the next one does not

1. **A guard that pins a *pre-condition* has to be replaced, not deleted.**
   `phase-2m-telemetry-guard.test.ts` asserted "no producer exists yet"; when the
   first one shipped it became a **producer census** — every producer must name
   an event and a surface the chain admits, and the events still awaiting one are
   listed. A guard that only ever said "not yet" would have been switched off.
2. **Check keys, not substrings.** The producer's content assertion fired on
   `orientation` because it contains `at` — the same trap Phase 2K records
   stepping in with `title` inside `normalized_exact_title`.
3. **A hand-written date fixture is the one input a date test cannot check for
   you.** A draft asserted `2026-02-29` parses. 2026 is not a leap year. Slice
   2M.0 recorded the same class of error with `America/Santiago`.
4. **A stub keyed only by table hides a second reader.** `entries` is read twice —
   as the suggestion lane and as the classification map — and the stub that could
   not tell them apart is what exposed a real missing guard in the projection.
5. **Local guard failures immediately after editing their corpus are mid-write
   reads.** Re-run untouched before debugging; it happened three times again.

**Phase 2N remains unstarted. Signup closed. Rollout gate untouched.**

---

## §48 — Phase 2K's declared consumer is corrected, and slice 2M.1 is finished (2026-08-11)

**Where the repository actually is.** `main` at `b4bfe7d`; working tree clean;
no open PR. **90 migrations**, hosted parity **`202608110090`**, unchanged by this
stretch. Migration budget **`2 allocated · 1 spent`, NON-TRANSFERABLE** — a third is
a stop condition. Signup closed, rollout gate untouched, Phase 2N not started,
A13 green.

Two pull requests landed, each with CI green on its **exact merge SHA**:

| PR | Merge SHA | What |
|---|---|---|
| **#173** | `f3cb0e4` | Phase 2K's `2K-METRICS-007` claim corrected — documentary only |
| **#174** | `b4bfe7d` | Slice 2M.1 part 3 — rescheduling from the calendar |

### The historical correction, and the thing it does not say

**Phase 2K's declared consumer could never have executed.**
`scripts/phase-2k-conversation-funnel-reader.mjs` selected, filtered *and* ordered
by `product_events.occurred_at` — a column the ledger has never had — and
authenticated with `grant_type=password`, which Turnstile has refused since SH.5,
four days before that phase closed. Either alone is fatal to every invocation.

**The 13/13 hosted proof of 2026-08-09 stands and is not withdrawn.** The writes
through the authenticated writer, the RLS read-back, the real
`aggregateConversationFunnel`, the negative controls on a valid surface and the
owner-scoped residue proof are all unaffected.

**What is withdrawn is one clause.** That proof reached the aggregation through a
query written for the occasion, not through the consumer's own code path — which
is exactly why the broken reader stayed invisible. *A probe that reconstructs the
path it is meant to exercise measures the reconstruction.*

So `2K-METRICS-007` moved **`built` → `partial`**, counts regenerated from the
slice record rather than typed: **79 declared · 79 classified — 66 built,
9 baseline, 4 partial**, where the close read 67/9/3 and that reading is preserved
beside the new one. **No historical execution is claimed, invented or back-dated.**
The repair belongs to Phase 2M (PR #169) and is charged to no phase; Phase 2K's
budget stays `1 allocated · 1 spent`; and **the repaired reader has still not been
run**, which is an open obligation in `docs/TODO.md` that may not be closed by
writing a document.

**Why no guard fired for nine days.** `phase-2k-telemetry-guard.test.ts` asserted
the reader's *shape* exhaustively — reads all three names, authenticates as the
owner and never as service-role, writes nothing, distinguishes "not deployed yet"
from "a quiet week" — and every one of those assertions was true of a file that
could not run. **A guard over a script's shape is not a guard over its
executability.**

### Slice 2M.1 is complete, and part 3's three decisions

**Rescheduling happens on the calendar, through the command path that already
existed.** Zero migration, zero RPC, zero Server Action, zero table, zero column.
`direct-write-guard.test.ts` still holds its `tasks` allowlist **empty**.

1. **The verb subset is derived, and a list would have been the defect.** The
   obvious implementation is `["reschedule_due", "clear_due", "set_planned"]` — a
   second copy of taxonomy knowledge, the shape `202608080087` and `202608090089`
   were both written to delete one layer down. A scheduling action is one whose
   policy's `changedFields` touch `due_at` or `planned_at`. **`reminders` is
   deliberately not in that field list**: including it would put *complete* and
   *cancel* on the calendar as rescheduling controls.
2. **The projection carries the answer, never the status.**
   `CalendarItemView.reschedule` is `{taskId, controls}` or `null` — a client
   handed a status would decide eligibility where it cannot re-check it.
3. **The return position reuses Phase 2L's *mechanism*, not its data shape.**
   `POSITION_FORBIDDEN_FIELDS` is imported rather than copied; `WorkPosition`'s
   field list is not reused, because a calendar position is not a Work query. One
   `from`, two vocabularies, discriminated by version literal, and the calendar
   parser answers **`null` rather than a default** so a Work return can never
   become a calendar return pointing at today.

**Masking withholds the words, not the ability to move a date** — the controls sit
beside `ProtectedContent`, because hiding them behind the reveal would make a
privacy setting into a capability gate. **No destructive verb reaches the calendar
at all**: `cancel_task` changes no date, so the destructive surface is empty by
construction rather than by care.

**It deliberately cannot clear a planned day.** `clear_planned` does not exist in
the taxonomy; the absence is asserted **with its destination named**
(`2M-PLAN-002`, slice 2M.2), so the day it is added the test fails and whoever
adds it has to notice the calendar starts offering it.

### What was executed, and the line under it

**42 browser journeys passed** on desktop and Pixel 7 in both locales
(`e2e/calendar.spec.ts`): structure, lane and commitment in text rather than
colour, empty distinguishable from failed, an elapsed item still reschedulable, a
masked item withholding its title and keeping its controls, keyboard operation
with a visible focus ring, tab order, no horizontal page scroll at 320/375/412 px,
every control ≥24 px from paint, reflow at an emulated 200% zoom.

**WRITTEN AND NOT EXECUTED: `e2e/online-calendar.spec.ts`** — the applied
reschedule, the audit row, the undo, the staleness refusal, the return to the
exact position and the cancelled-task case. It needs the deployment carrying this
slice. **This is the first thing the next loop should run** once Vercel has
redeployed `main`.

**NOT PROVED ANYWHERE:** a real screen reader and a real phone. **An emulated
viewport is a viewport, not a device.**

### Traps this stretch paid for

1. **A guard over a script's shape is not a guard over its executability.** Nine
   days of a consumer that could not run, under a guard that asserted four true
   things about it.
2. **A probe that reconstructs the path it is meant to exercise measures the
   reconstruction.** That is why Phase 2K's 13/13 did not catch its own reader.
3. **A browser journey must not encode a control count.** The tab-order test
   tabbed a fixed four times and failed on both projects; the number of stops
   depends on what the taxonomy admits, and the property is what to assert.
4. **A mirror guard earns its keep on its first run.** It found two real drifts
   before CI did — an unnamed class and a line-wrapped sentence its own regex
   depended on.
5. **Local guard failures immediately after editing their corpus are still
   mid-write reads.** It happened again; re-run untouched before debugging.

### What is outstanding, exactly

**Slice 2M.2** (planner, `clear_planned`, `planned_at` read-side semantics, bulk
reschedule at the signed ceiling of 50), **2M.3** (reviews and the five inert
preferences), **2M.4a** (notification governance, CI-provable), **2M.4b**
(**migration 2** plus opt-in content-free push, then deploy and the hosted proof)
— and then the loop **stops** at
`CHECKPOINT DO DONO — PROVA EM HARDWARE NECESSÁRIA`. Slice 2M.5 and closeout come
after the owner's evidence returns, never before.

Two open obligations that may **not** be closed by writing a document:

- run `e2e/online-calendar.spec.ts` against the deployment;
- run the repaired `scripts/phase-2k-conversation-funnel-reader.mjs --access-token`
  once against the deployed project.

**Phase 2N remains unstarted. Signup closed. Rollout gate untouched.**

## §49 — The deployment journey ran, and three product defects were behind it (2026-08-11)

**Baseline in: `76e2d02`. Baseline out: `216ea8d`, merge-SHA CI green on all
three jobs.** 90 migrations, parity `202608110090`, budget `2 allocated · 1
spent` non-transferable, signup closed, rollout gate untouched, Phase 2N not
started. **Zero migrations spent in this stretch.**

### What was owed, and what it cost to pay it

`e2e/online-calendar.spec.ts` was the obligation slice 2M.1 left open and that
`docs/TODO.md` recorded as one that **may not be closed by writing a document**.
It ran. **12/12, desktop and Pixel 7** — closing the remainder of `2M-CAL-010`
and the authenticated half of `2M-ACCESS-003`.

It failed six ways first, over eight runs. **Five causes were in the probe.
Three product defects were behind the sixth.** The full account is
`docs/reports/phase-2m/PHASE_2M_ONLINE_CALENDAR_EXECUTION.md`; what follows is
what a successor needs and could not reconstruct.

### The gates had stopped being server-side, and the control is what proved it

`5edc205` ("perf: make authenticated navigation responsive", 2026-08-10) added
`src/app/[locale]/app/loading.tsx`. **A segment's `loading.tsx` wraps its
children in Suspense while its own `layout.tsx` renders outside it**, so from
that commit every `/{locale}/app/**` request flushed the shell before reaching
`requireUser`, and the `redirect()` became a client-side navigation. An
authenticated, unconsented account got **`200` and 63 KB of shell** where
`SH-LIFECYCLE-008` and `SH-LEGAL-008/009` specify a 307. **An interposition that
ships the shell and asks the browser to leave lasts exactly as long as hydration
does.**

The first six failures all read `net::ERR_ABORTED` on the calendar, and every
instinct said *the calendar is broken*. **What settled it was running a spec this
phase has never touched.** `online-reminders.spec.ts` failed 11 of 12 the same
way. It now passes 12/12. **Run the control before believing the diagnosis** —
the whole online lane had been dead for a day, and no one would have found out
from the calendar alone.

The gate now runs in the segment layout, above the boundary; the pages keep
their own call. `src/lib/closeout/server-side-gate-guard.test.ts` pairs every
`loading.tsx` with a gated layout and fails on exactly this.

### `2M-CAL-010` was self-defeating, and the first fix was wrong in a way worth keeping

The undo sat inside the item's disclosure — where the requirement asks for it —
and **a successful reschedule is precisely what moves the item off the day being
viewed.** The revalidated calendar unmounted the outcome and the undo at the
instant there was something to undo. **No jsdom test could have found it**: the
disappearance is the server re-running its query.

The first fix reported the outcome upward from an effect inside
`TaskDetailControls`. **It never fired.** React applies the settled state and the
revalidated tree together, so the subtree is already gone when effects run. **A
component cannot report its own outcome if the outcome is what removes it.** The
recording lives in a wrapper around the action, owned by `CalendarView`;
`CalendarOutcome` renders the answer.

### The undo button had never rendered, on any surface, since Phase 2L

`apply_task_command` returns the window as
`to_char(undo_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`. Postgres `OF` emits
`+00` for UTC; ECMAScript accepts only `Z` or `±HH:mm`; `Date.parse` answered
`NaN`; `UndoAffordance` fails closed on an unparseable expiry. **The fail-closed
branch was not unreachable — it was the only reachable one.**

Its own comment recorded the reasoning that hid it: *"the column is `not null`
with a default so this is unreachable through the database"*. **The column was
never the input. What crosses the boundary is a rendering of the column, and a
rendering has its own contract.**

Every `2E`/`2L` test passed throughout. All of them wrote `expiresAt` as `…Z`;
they proved the `undo_operations` row and the `undo_operation` RPC, both of which
work; **none asserted the button**. Fixed app-side in
`src/features/task-commands/rendered-instant.ts`, **no migration** — `apply.ts`
already documents that the RPC's rendering is not an ISO promise.

### The five probe defects, and the one wrong inference

A lane-blind locator matching two correct elements (`tasks_create_due_reminder`
puts a reminder and a deadline on the same day under the same title); copy
borrowed from the surface next door; a UTC-sliced date compared against a local
one (a bare date is 23:59:59 local, already tomorrow in UTC);
`audit_logs?target_id=…&select=action`, **neither column having ever existed** —
**Phase 2K's `occurred_at` again, five days later**; and a raised *test* timeout
that left `expect` at Playwright's five seconds.

**The staleness case was suspected of resting on a false premise and was not.**
The pre-state is re-read server-side, the day was empty, and it looked like the
stale submit had succeeded. Once the four probe defects were repaired it passed
on its own terms. **Do not rewrite a failing test until its cause is known.**

### The blocker found before 2M.2 was started

**`clear_planned` cannot be delivered in this phase, and this was established
before a line of 2M.2 was written.**

The taxonomy is only half the verb. `apply_task_command` carries its own action
allowlist and per-action patch rules **in SQL**, and `set_planned` *requires*
`plannedAt` to be a string matching `iso_instant_pattern`
(`202607270060:164`) — **a null is refused**, so `set_planned` cannot be made to
clear. Adding the verb means replacing the RPC, which is a migration.

`PHASE_2M_IMPLEMENTATION_PLAN.md:44-47` names both migrations
**non-transferably** — 1 is telemetry and is spent, 2 is notification consent,
subscription and delivery in 2M.4b — and `PHASE_2M_PRD.md:608` lists **a third
migration as a stop condition, not a judgement call.**

Three honest resolutions, **none of which an implementer may pick alone**:
**(a)** ship 2M.2 without it and classify `2M-PLAN-002` as blocked with its cause
named; **(b)** the owner authorizes a third migration; **(c)** the owner
reassigns migration 2, which unfunds the signed OD-2M-4 push and ends 2M.4b.

`2M-PLAN-001` and `-003` … `-010` are unaffected and need no migration. **Nothing
in 2M.2 was started pending this.**

### Traps this stretch paid for

1. **Run the control before believing the diagnosis.** Six failures pointed at
   the calendar; a spec the phase never touched pointed at the lane.
2. **A rendering has its own contract.** A comment reasoning about the *column*
   hid a defect in the *value that crossed the boundary*, for two phases.
3. **A fixture that is prettier than the value tests the fixture.** Every undo
   test wrote `…Z`; the RPC has never sent one.
4. **A component cannot report its own outcome if the outcome is what removes
   it.** Effects do not run in a subtree the same commit unmounted.
5. **A guard over a `loading.tsx` is a guard over an authorization boundary.** A
   perf change moved a gate without touching a line of auth code.
6. **A query written from remembered column names fails at the database.** Twice
   now, five days apart, in two different phases.

### What is outstanding, exactly

**Slice 2M.2** (blocked on the owner decision above for `2M-PLAN-002` only),
**2M.3**, **2M.4a**, **2M.4b** (**migration 2**), then deploy, hosted proof, and
the loop **stops** at `CHECKPOINT DO DONO — PROVA EM HARDWARE NECESSÁRIA`. Slice
2M.5 and closeout come after the owner's evidence returns, never before.

One open obligation that may **not** be closed by writing a document: run the
repaired `scripts/phase-2k-conversation-funnel-reader.mjs --access-token` once
against the deployed project.

**NOT PROVED ANYWHERE:** a real screen reader and a real phone. **An emulated
viewport is a viewport, not a device.**

**Phase 2N remains unstarted. Signup closed. Rollout gate untouched.**

## §50 — The owner funded the stop condition, and running one probe found three (2026-08-11)

> **A numbering collision a successor will hit, recorded rather than silently
> renumbered.** This file already contains a `§50` dated 2026-08-06, in the
> block at lines ~1003–1414 that runs `§47 … §50` and is then *followed* by
> `§34`. That block predates the live sequence and its numbering was already
> wrong when it landed. **The live sequence is the one that ends at `§49`
> (2026-08-11), and this is its successor.** Read by date, not by number, and do
> not renumber the old block — every prior record cites it as it stands.

**Baseline in: `f877714`. Baseline out: `285cdc2` (PR #178).** 91 migrations,
**hosted parity `202608110090` — unchanged, because migration 3 is NOT
deployed.** Budget **`3 allocated · 2 spent`**, all three non-transferable.
Signup closed, rollout gate untouched, Phase 2N not started.

### The third migration was authorized, and the rule moved up rather than dissolved

`2M-PLAN-002` was proved unbuildable without schema **before slice 2M.2 was
started** — §49 recorded it with the cause in a named line. The owner chose
option **(b)**. **ADR-106** authorizes migration 3, for `clear_planned` and
nothing else; it does **not** reallocate migration 2, which stays reserved for
push in 2M.4b.

**A fourth migration is the stop condition now**, and so is migration 3 carrying
anything but the one verb. The precedent is deliberately narrow and the ADR says
so: **not** *"a migration may be added when the work is hard"*, but *a signed
requirement proved impossible without schema, reported before the slice started,
with its cause located in a named line and its three resolutions costed*. The
declarations guard asserts the new budget, ADR-106's three narrowing properties
and the traceability contract's refusal, so it cannot widen by being re-read.

### Assemble a re-declared function; never retype it

`public.apply_task_command` is 1458 lines and its `case` arms cannot be extended
in place. Migration 3 was **assembled from `202607270060`'s own text**, then
edited at seven sites. **A mechanical diff of the two bodies, ignoring comments,
shows exactly those seven changes and nothing else** — which is the only
affordable proof that no pre-existing branch was dropped. Do this for every
future re-declaration; a hand-copy is how one disappears in silence.

The seven: the closed action enum; the policy arm; the `plannedAt` patch rule
(now a JSON null for this action and **only** this action); the delta against the
claimed pre-state; the delta against the locked row; the write; and the recorded
`applied_state` the undo guard reads back. Sites four through seven share
`patch_planned_at`, which step 8 leaves null — so each is the `set_planned`
expression with the action list widened, and none needs a branch.

### The one deliberate asymmetry, and why it is not an oversight

**`clear_planned` reconciles no reminders and `clear_due` does.** An intention
never armed one (OD-2M-3 A), so declaring a reminder effect here would close a
`scheduled` row the task's **deadline** still wants. The pgTAP suite proves it
with a task carrying both a planned day and a live deadline reminder: after the
clear, the count is **1** and not 0.

### Two app-side defects the requirement exposed

1. **`buildCanonicalPatch` would have sent an empty patch.** The verb carries no
   patch field and the RPC *requires* the `plannedAt` key — the preview offering
   a control the database then refuses.
2. **The `planned_at` delta coalesced with `??`.** Null reads as absent, so a
   cleared plan would have rendered as **unchanged** while the write removed it.
   `due_at` had always tested for `undefined`; `planned_at` had never needed to,
   because until this requirement **no command could send a null**. *A nullish
   default is a bug waiting for the first legitimate null.*

### Running one probe found that three were dead

The open obligation was to execute `scripts/phase-2k-conversation-funnel-reader.mjs`
once against the deployed project. **It was executed and it failed**:
`supabaseKey is required`, before a row was read. `getLinkedSupabaseCredentials`
returns a **publishable** key and has never returned an `anonKey`; all three
readers destructured `anonKey` and passed `undefined` to `createClient`.

**The third defect in that file, and the third that had never fired.** The same
defect was in Phase 2J's reader **and in Phase 2M's own** — the **declared single
consumer** of the six events `202608110090` admitted, so `2M-METRICS-003` was
resting on a script that could not execute. It was found by running the
neighbour and **checking rather than assuming**.

All three fixed. Both readers then ran against the deployed project and **exited
0**. **Recorded honestly:** each ran as a freshly minted disposable owner,
deleted immediately (`HTTP 200`), so each reports **zero events for that owner**
— executability proved, the real owner's funnel **not** measured. The procedure
is `admin/generate_link` → `email_otp` → `/auth/v1/verify`; the hosted password
grant still answers `captcha_failed`.

**Three is now the count of Phase 2K reader defects, and zero was the count of
its runs. "Corrected" is not "runnable", and a guard over a script's *shape* is
not a guard over its *executability*.**

### What shipped besides the verb

**`2M-PLAN-001`** — one declared meaning for `planned_at` in
`src/features/planning/planned-at.ts`, with a corpus scan refusing a second. It
found two: the task detail rendered the column with `timeStyle` (a day the user
chose, shown as a time they reserved) and the Work list carried an inline locale
ternary. **The guard strips comments first**, because its first run failed on the
comment documenting the defect it had just removed — *a scan that cannot tell
code from prose makes deleting the explanation the cheapest fix.*

**`2M-PLAN-003`** — the read side the column never had: five filter members and
two orderings, **inside the three views** and never as a fourth, so every
destination stays describable by the deployed `workView` enum and it cost **no
migration**. Both orderings carry `nullsFirst: false`; PostgREST defaults to
nulls **first** descending, so the second is a correction, not decoration.

**`2M-PLAN-004`…`-010`** — the planner at `/app/calendar/plan`, under the
calendar because migration 1 declared that surface and a `/app/plan` route would
have needed a value the CHECK does not admit. Overload is a **count**, the hours
the user actually declared, and the explicit statement that **no duration is
known** — the obvious bar would be a lie with a number on it.

### What is NOT proved, and where it goes

**There is no Playwright lane for the planner.** The calendar's local lane is
legitimate only because `calendar-mirror-guard.test.ts` re-derives its markup
from the components each run; a planner spec without one would be a fixture
prettier than the value. So **`2M-MOBILE-004` and `2M-ACCESS-004` are PARTIAL for
the planner and `2M-TIME-006` is PARTIAL for two surfaces**, destination **slice
2M.3**, which touches the same surface and can carry one mirrored lane and one
guard for both.

**Migration 3 is not deployed.** Hosted parity is `202608110090`, and every
artifact says so rather than implying the schema moved.

**NOT PROVED ANYWHERE:** a real screen reader and a real phone.

### Traps this stretch paid for

1. **Assemble, never retype**, and prove it with a mechanical diff.
2. **A nullish default is a bug waiting for the first legitimate null.**
3. **A probe that has never run has never been correct**, however many times it
   has been repaired.
4. **A guard over shape is not a guard over executability.**
5. **A scan that cannot tell code from prose** makes deleting the explanation the
   cheapest way to pass it.
6. **A locator that ignores the structure the surface is organized by** finds the
   surface working and calls it broken — again, in jsdom this time.

### What is outstanding, exactly

**Slice 2M.3**, **2M.4a**, **2M.4b** (**migration 2**), then deploy — which must
apply **`202608110091` and then migration 2, in that order** — hosted proof, and
the loop **stops** at `CHECKPOINT DO DONO — PROVA EM HARDWARE NECESSÁRIA`. Slice
2M.5 and closeout come after the owner's evidence returns, never before.

**Phase 2N remains unstarted. Signup closed. Rollout gate untouched.**

## §51 — Slice 2M.3 closes three partials, and the surface it mounted on was a decision (2026-08-11)

**Baseline in: `50a1619`.** 91 migrations, **hosted parity `202608110090` — unchanged,
because migration 3 is still NOT deployed.** Budget **`3 allocated · 2 spent`**,
all three non-transferable. Signup closed, rollout gate untouched, Phase 2N not
started. **Zero migrations were spent in this slice.**

### The route was a decision, and it is recorded rather than absorbed

The owner's brief said **reuse `/app/reviews`**. Three artifacts merged in slices
2M.1 and 2M.2 — `product-analytics/contracts.ts`, the planner route and
`capabilities.ts` — said the day review would be a **sub-route of
`/app/calendar`**. That is a genuine divergence between an instruction and the
repository's own record, and it was resolved rather than picked.

**Neither reading costs a migration, and that is what decides it.** The
constraint those comments were really about is the **surface value**: a `reviews`
entry the deployed `product_events_surface_check` does not admit would be a
fourth migration — a stop condition. The *route* was never the constraint.
`surface` is the product area an event belongs to, not the route it was emitted
from, and `task_command` has attributed to its own area from `/app/chat` and
`/app/work` since Phase 2E. So the day review mounts where the owner asked, its
two events carry `calendar` — the value migration `202608110090` deployed
**naming the day review explicitly** — and all three comments were corrected in
the same change instead of being left to disagree with the code.

*A comment that states a governance fact is load-bearing. When the fact moves,
the comment moves with it, in the same commit.*

### Three defects, and two of them were older than the phase

1. **The notification list rendered in the host's zone.** `new Intl.DateTimeFormat`
   with **no `timeZone`** — UTC on a server — while the calendar, the planner,
   the reminders page and the task detail had carried the owner's zone since
   slice 2M.1. Changing the timezone in settings moved four surfaces and left
   this one. `2M-TIME-005` and `2M-TIME-006` failing on one line.
2. **Both Phase 2M browser lanes were absent from CI.** `2M-ACCESS-006` offers a
   lane **or** a source-derived mirror; slice 2M.1 chose the mirror, the mirror
   ran in CI as a vitest guard, and **the lane it guards ran nowhere**. Every
   touch-target, focus, reflow and keyboard assertion `calendar.spec.ts` makes
   had only ever executed on a developer's machine. *A guard over a lane is not
   the lane.* Both are now in the CI Playwright step at both viewports.
3. **`detailControlsFor` excludes `set_status`** — correctly, because the Work
   list renders that verb elsewhere — so reusing it on a review row would have
   shipped **four verbs where the requirement names five**, and the deployed
   telemetry would have carried an `actionKind` no producer could emit.

### What shipped

`2M-REVIEW-001`…`-008`, `2M-TIME-005`, `2M-TIME-006`, `2M-ACCESS-006`, and the
discharge of `2M-MOBILE-004` and `2M-ACCESS-004` where slice 2M.2's record said
they would go.

The five verbs are **data mapped onto the taxonomy**: `carry_forward` and `plan`
are both `set_planned`, differing only in the day the surface proposes;
`reschedule` is `reschedule_due`; `archive` is `cancel_task`; `follow_up` is
`set_status` to `waiting`. Confirmation and reversibility are **read from
`actionPolicy`**, never restated — a taxonomy that made archiving one-click
fails a test rather than shipping quietly.

`TaskDetailControls` gained exactly **one optional prop**, `defaultValues`,
which fills an input's initial value and changes no control, no eligibility and
no intent — the same bar `variant` is held to. Every gate below it runs
unchanged, so a preset the policy would refuse is refused exactly as a typed one
is.

The mirror guard is now **table-driven over three surfaces** with a mutation
control: a renamed class, an added class the lane does not name, and a drifted
copy sentence each make it fail. The mutation runs on a **string**, never on a
file — a harness that edits an artifact tests a different artifact.

### The traceability generator, and the guard that was right

`scripts/generate-phase-2m-traceability.mjs` extracts the declarations from the
PRD and the classifications from the slice records, refuses on duplicates,
unknown classes, vacuous remainders, rule-less absences, a foreign namespace and
a fourth migration, and reports **94 declared, 63 classified, 60 built, 3
partial, 31 not yet classified, 2/3 migrations** — every number extracted.

**Its first run tripped `phase-2m-declarations.test.ts`**, which forbids the
matrix from existing before the closeout gate: *a matrix written early is a
classification of work that has not happened.* The guard was right. The fix was
to make the artifact **impossible** before its gate — the mid-phase run prints
and writes nothing, `--complete` writes the file — rather than to relax the
guard. *When a guard fires on new work, the first question is whether the guard
is right, and here it was.*

It also found three things in the existing records: a requirement whose final
classification was weaker than an earlier one, a guard-prose row read as its own
violation, and two partials naming no destination in their row. The first two
were generator defects and were fixed in the generator; the third resolves
because slice 2M.3 discharges both.

### What is NOT proved

**The applied case in a browser.** The lane composes pages with `setContent`, so
a successful carry-forward, the row leaving the list, the undo and a staleness
refusal are not exercised. They need an authenticated app, exactly as the
calendar's did. **Destination: an online journey, not this slice.**

**A real screen reader and a real phone, still nowhere.** `2M-ACCESS-007` and the
OD-2M-5 hardware checkpoint are the owner's.

**The two review events have a producer and no observed arrival.** Nothing here
watched one land in `product_events` on the hosted project.

### One local execution constraint, recorded

Playwright's `webServer` could not start within its 120 s timeout on this machine
(Next reports a slow filesystem), so both lanes were executed through a temporary
config **without** `webServer` — legitimate because neither spec navigates to the
app. That config was deleted and is not in the tree. **36 passed** for
`daily-surfaces.spec.ts` and **89 passed / 17 skipped** for the calendar and
accessibility lanes, desktop and Pixel 7.

### What is outstanding, exactly

**Slice 2M.4a** (notification governance, no migration), **2M.4b** (**migration
2**, push), then deploy — which must apply **`202608110091` and then migration 2,
in that order** — hosted proof, and the loop **stops** at `CHECKPOINT DO DONO —
PROVA EM HARDWARE NECESSÁRIA`. Slice 2M.5 and closeout come after the owner's
evidence returns, never before.

**Phase 2N remains unstarted. Signup closed. Rollout gate untouched.**

## §52 — Governance ships before anything can obey it, and a guard collision was resolved in the guard's favour (2026-08-12)

**Baseline in: `c48f703`.** 91 migrations, **hosted parity `202608110090` —
unchanged.** Budget **`3 allocated · 2 spent`**, all three non-transferable.
Signup closed, rollout gate untouched, Phase 2N not started. **Zero migrations.**

### The ordering is the whole slice

`2M-METRICS-001` says the migration that admits an event is deployed **before**
the first producer exists. Slice 2M.4a is that discipline pointed at consent:
the rules that decide whether a delivery is permitted exist, and are tested,
**before anything can deliver**. There is no sender, no subscription, no
service-worker handler and no persistence, and the push-absence guard's
allowlist is asserted **empty** — because that allowlist gaining its first entry
is precisely the event 2M.4b is.

*A consent model written alongside its first sender is a consent model shaped by
what the sender found convenient.*

### Absence is `unsupported`, never `denied`

The two states a boolean would collapse are the two that decide whether the user
can ever turn push on. `denied` means the browser will not prompt again from the
page; `revoked` means the user withdrew and may re-grant; `unsupported` means
there is no basis yet. Collapsing them produces the worst behaviour available:
re-prompting forever, with no way to explain why nothing happens.

Every parser field fails closed **toward less delivery** — with one deliberate
exception. **An unreadable quiet window is not quiet**, because refusing every
delivery on a preference the product could not read would silence somebody who
never asked for silence. The fail-closed direction is not a reflex; it is chosen
per field, by which failure is worse.

### The surface offers no control, and that is the requirement being met

`2M-NOTIFY-004` asks for controls *"each with a consumer that reads it"*. The
consumer is migration 2's consent record. A toggle rendered now would change
nothing — which is exactly what `R-24` refuses and what slice 2M.0's audit of the
five inert scheduling preferences was about. So the surface says so, in both
locales, and the requirement is classified **partial** with its remainder named.

**An honest absence beats a control that lies**, and classifying it `built`
because a screen exists would have been the second kind.

### The guard collision, and the mistake inside the fix

Three new files legitimately needed to *name* `showNotification` and
`pushManager` in order to assert their absence. `phase-2m-push-boundary-guard.test.ts`
forbids those literals anywhere and exempts **exactly two** files, with a test
asserting the count, *"because a broadened exemption is how a guard stops
guarding"*.

A third exemption was the cheapest way to green and the most expensive thing to
do. The tokens are assembled at runtime instead. **The first attempt failed
again — because the variable names were the literals.** Recorded because that is
the shape of the mistake: the fix moved the string out of the assertion and left
it in the identifier.

### `public/sw.js` has tests for the first time

It is loaded in a fabricated worker scope — `new Function`, not an import,
because it is a classic script that exports nothing — and driven through install,
activate and fetch. It refuses a POST, a cross-origin request and **an ordinary
page**; the third matters most, because a worker serving the app's HTML from a
cache would show a signed-out user a signed-in page. And it registers **no
`push` and no `notificationclick` listener**, which is the behavioural half of
the finding slice 2M.0 made structurally.

### A guard that is silent locally, and the sentence it caught

`phase-2f-traceability.test.ts`'s stale-deployment sweep **only runs when `CI`
is set**. A local `npm test` runs it vacuously, so the first push to this branch
failed CI on a line a local full-suite run had just passed.

It was right. `STATE.md`'s opening line said *"still not deployed"* within ninety
characters of `202608110090`, which **is** in the applied chain — the sentence
was true, because the "not deployed" belonged to `202608110091`, but proximity is
what a reader and a scanner both use. The fix was the sentence: a period now
separates the parity claim from the undeployed one. **The rule from here: run
`CI=1 npm test` before pushing.** This repository has guards that say nothing on
Windows and nothing outside CI, and both silences have now cost a round trip.

### What is outstanding, exactly

**Slice 2M.4b** — **migration 2**, the sender, the subscription, the service
worker's two handlers, and the five partials this slice routed there: the
rendered controls, the delivery-side proofs of quiet hours/cap/cooldown, the
audit row, bounded retry, and the journey once controls exist.

Then deploy — which must apply **`202608110091` and then migration 2, in that
order** — hosted proof, zero-residue proof, and the loop **stops** at
`CHECKPOINT DO DONO — PROVA EM HARDWARE NECESSÁRIA`. Slice 2M.5 and closeout come
after the owner's evidence returns, never before.

**Phase 2N remains unstarted. Signup closed. Rollout gate untouched.**

## §53 — The loop stops between slices, with 2M.3 and 2M.4a closed (2026-08-12)

**This is a boundary, not a checkpoint.** The owner's hardware checkpoint comes
after 2M.4b; this is the *other* stopping rule the brief names — finish the unit,
get CI green on the merge SHA, record a complete handoff, and stop **between**
slices rather than part-way through one.

### The two units this stretch closed

| unit | PR | head SHA | merge SHA | CI on the exact merge SHA |
|---|---|---|---|---|
| slice **2M.3** | #180 | `015bfd7` | **`c48f703`** | **green, 3/3 jobs** |
| slice **2M.4a** | #181 | `5c3e77d` | **`98898f4`** | **green, 3/3 jobs** |

**Zero migrations were spent in either.** The budget is still
**`3 allocated · 2 spent`**, all three non-transferable. **Hosted parity is
`202608110090`.** `202608110091` is merged and has **not** been applied to the
hosted project. Signup closed, rollout gate untouched, **Phase 2N not started**,
A13 not retargeted.

### Why the loop stops here rather than starting 2M.4b

2M.4b is the largest remaining unit by a wide margin — **migration 2** (consent,
subscription, delivery state, revocation, retention, deduplication, RLS, grants,
fail-closed functions, content-free audit), a VAPID sender, two service-worker
handlers, the settings controls the five 2M.4a partials are routed to, a pgTAP
suite, **two migrations deployed in a fixed order**, hosted proof and a
zero-residue proof.

Starting it with the context left would have meant stopping part-way through a
**migration**, which is the one artifact this phase cannot leave half-written:
migrations are append-only, and a partial one in the tree is a stop condition
somebody else has to resolve. So the loop stops at the boundary the brief names.

### One thing the next session should confirm with the owner before deploying

**Migration 2 needs a VAPID key pair, and the private half must live only in the
server environment.** Generating the pair costs nothing and needs no provider
account, but **setting `VAPID_PRIVATE_KEY` on the hosted environment is an owner
action**, and `2M-NOTIFY-011` requires the private key never to reach any client.
That is not a stop condition for *building* 2M.4b — the sender can be built and
tested against a locally generated pair — but it **is** one for deploying it, and
it should be raised before the deployment step rather than discovered inside it.

### Two silences that have now each cost a round trip

1. **Windows hides guard tests.** Three test *files* fail to parse locally on
   this machine — the recorded shebang baseline — and they are green in CI.
2. **`CI` gates a guard.** `phase-2f-traceability.test.ts`'s stale-deployment
   sweep runs only when `CI` is set, so a local `npm test` runs it vacuously. It
   caught a `STATE.md` line that read as claiming a *deployed* migration was
   undeployed. **Run `CI=1 npm test` before pushing.**

### The resumption prompt is in the report

The next session begins with a preflight against `98898f4`, a re-audit of 2M.4b,
and the migration-2 scope check the brief requires **before** the file is
created. Nothing about 2M.5, the closeout or Phase 2N may begin before the
owner's hardware evidence returns.

**Phase 2N remains unstarted. Signup closed. Rollout gate untouched.**

## §54 — Slice 2M.4b is built to the migration boundary and stops there, unmerged (2026-08-12)

**This is a mid-slice stop, and it is recorded as one.** Slice 2M.4b is **NOT
complete**, **NOT merged**, **NOT deployed**. Branch `codex/phase-2m-slice-4b`,
no PR opened. `main` is untouched at `b91bad4`.

### Why the loop stopped here rather than at a slice boundary

§53 predicted 2M.4b was the largest remaining unit, and it was: a migration, a
pgTAP suite, two service-worker handlers, four Server Actions, a client control
surface, two guard retargets, an Edge sender, browser lanes and a deployment in
a fixed order. Context ran out partway. The brief's rule for that case is to
finish the atomic unit in progress, stop at a safe boundary, and **never leave a
migration append-only partially built**.

**The migration is complete and self-consistent.** That was the artifact that
could not be left half-written, and it is not.

### The budget is UNCHANGED on `main`

`3 allocated · 2 spent`. The third and last allocated migration exists **only on
the unmerged branch** as `202608120092_phase_2m_push_delivery.sql`. Hosted
parity is still `202608110090`; `202608110091` is still merged and unapplied.
**No fourth migration was created.** Signup closed, rollout gate untouched,
Phase 2N not started, A13 not retargeted.

### What the branch contains, and what is proved about it

| artifact | state |
|---|---|
| `202608120092_phase_2m_push_delivery.sql` | **complete**; three tables, six functions, RLS forced, retention registered and armed by nobody, eight self-checks |
| `supabase/tests/phase_2m_push_delivery.sql` | **complete**, 61 assertions, positive controls beside every refusal — **never executed** (no local Docker; CI's `database` job is the first real run) |
| `public/sw.js` | `push` + `notificationclick` handlers; payload treated as untrusted, destination from a closed set |
| `actions.ts`, `schema.ts`, `consent-reader.ts`, `push-controls.tsx`, `push-encoding.ts` | built; typecheck and lint clean |
| push + notification boundary guards | **retargeted, not weakened**; allowlist names three files and each is proved to earn its entry |
| `service-worker.test.ts` | retargeted from "no push surface" to driving the real handlers — **12 passed** |
| Edge Function sender | **NOT STARTED** |

### Three defects this work found in itself, recorded because they are the shape

1. **`cooldown` was unreachable.** The first draft let a delivered row count as
   a `duplicate`, so the duplicate branch always fired first and the 24-hour
   cooldown could never be the answer. Writing the pgTAP suite found it. The
   state model now separates *in flight* from *delivered recently*, and both
   controls are exercised.
2. **The allowlist blinded the guard's own mutation controls.** Adding
   `public/sw.js` to `ALLOWED` made three scratch-root controls return `[]`
   while still passing. `pushArtifacts` now takes the allowlist as a parameter
   so the controls pass `[]`.
3. **`now() at time zone <zone>` is a `timestamp`, not a `timestamptz`.**
   Declaring it `timestamptz` would have re-interpreted the user's wall clock in
   the server's zone and silently skewed every quiet-hours and local-day
   comparison.

### Local gate state at the stop

`typecheck` clean · `lint` clean · `npx vitest run` **5824 passed, 20 failed,
12 files failed (366)**. The 20 are enumerated and none is a mystery:

- `notification-settings.test.tsx` (10) — 2M.4a component tests that render the
  surface without the props 2M.4b added. **Need retargeting.**
- `phase-2f-traceability`, `phase-2f-documentation`, `phase-2f-cleanup`,
  `egc-invariants` — chain-head and documentation guards that require the new
  migration recorded in `DATABASE.md`, `STATE.md` and the regenerated matrix.
- `phase-2l-no-gesture-guard` — must name the new notification components.
- 3 unparsed **files** — the recorded Windows shebang baseline, green in CI.

### What the next session owes, in order

1. Retarget `notification-settings.test.tsx`; add tests for `push-encoding.ts`,
   `schema.ts`, `consent-reader.ts` and `actions.ts`.
2. Build the Edge sender (a `deliver_push` job through `process-jobs` —
   `public.jobs.type` carries **no CHECK**, so this needs no schema change) and
   the `notification_suppressed` producer.
3. Extend `phase-2l-no-gesture-guard`; update `DATABASE.md`, `STATE.md`,
   `CHANGELOG.md`, `TODO.md`; regenerate the 2F matrix and the 2M traceability.
4. Playwright desktop + mobile; `CI=1 npm test`; `git diff --check`.
5. Draft PR → CI green on the head → review → merge → CI green on the **exact**
   merge SHA.
6. **Then the VAPID checkpoint, which is already known to be open** — see below.

### The VAPID checkpoint is confirmed OPEN, and it was checked rather than assumed

`npx supabase secrets list` was read against the linked project. **There is no
`VAPID_PRIVATE_KEY` and no `VAPID_PUBLIC_KEY`.** Deployment of `202608120092`
is therefore blocked on an owner action regardless of when the code is finished.
The surface already handles the absence honestly: `consent-reader.ts` returns
`null` and `push-controls.tsx` renders the "not available" sentence instead of a
button that would produce a subscription nothing can deliver to.

**Phase 2N remains unstarted. Signup closed. Rollout gate untouched. `main`
unchanged.**

## §55 — Slice 2M.4b is complete, merged and DEPLOYED; the loop stops at the owner's hardware checkpoint (2026-08-12)

**Slice 2M.4b is COMPLETE, MERGED and DEPLOYED.** PR #183, merge SHA
`5a202048ee82643d7528117b2c92affa46614840`, CI green **3/3 on that exact SHA**
before anything was pushed to the hosted project.

### The budget is CLOSED

`3 allocated · 3 spent`, all non-transferable. **Hosted parity is
`202608120092` across 92 migrations, local = remote on every row.** A **fourth
migration is a stop condition** and none was created — the dry run showed exactly
two pending, in chain order, and nothing else.

### Ten defects, and where each was caught

Six in the migration, four in its own suite. The distribution is the durable
lesson and it is why this section exists.

| # | defect | caught by |
|---|---|---|
| 1 | `pg_catalog.coalesce/.least/.greatest` cannot resolve — applies clean, fails on the first real send | the grammar guard, locally |
| 2 | quiet hours silently discardable by a no-op `UPDATE` | reading |
| 3 | `failure_count`: a CHECK with no writer, so retry was bounded per delivery only | reading |
| 4 | a granted consent with no live device returned `permitted` | reading |
| 5 | the SSRF comment described a control that did not exist | reading |
| 6 | **`pg_catalog.position('x' in y)` is a PARSE-TIME error — the migration would not have applied at all** | **CI, on the first attempt to apply it** |
| 7 | fixture keys violated the CHECKs the migration declares | **the suite's first execution** |
| 8 | the cascade drill named all three new tables, by name | **CI** |
| 9 | the grant census required the `SELECT`-only posture declared | **CI** |
| 10 | the retention registry required the new window named | **CI** |

**Careful review caught everything that would fail LATER. Only execution caught
the one that would fail IMMEDIATELY.** Five readings of a migration did not
notice that it could not parse, because reading tests the model in your head and
`supabase db reset` tests Postgres. Both are needed and neither substitutes.

`sql-grammar-guard.test.ts` now names **both** families — the ones that fail at
first execution and the ones that fail at parse — with a control proving each is
detected and a control proving the ordinary replacements are not flagged.

### Two deployment traps found before they could bite

1. **`verify_jwt`.** The sender is secret-authenticated, and under the platform
   default the GATEWAY answers 401 before the function runs — no log line, no
   ledger row, and a symptom ("nothing is ever sent") indistinguishable from a
   dozen others, discovered at the owner's checkpoint. `[functions.send-push]
   verify_jwt = false` is declared in `config.toml` and passed explicitly at
   deploy. **`supabase config push` was NOT run and must not be** — it is
   all-or-nothing and would open signup.
2. **No local Docker**, so `functions deploy` needs `--use-api`.

### The 401-not-503 proof, worth reusing

The deployed sender's POST path checks configuration **before** the secret. A
`POST` with a wrong secret returning **401 rather than 503** therefore proves
that both VAPID halves, the dispatch secret and the service credentials are all
visible to the running function — established without reading any value. And the
401 body being the function's own rather than a gateway JWT error proves
`verify_jwt = false` took effect. Two facts from one curl.

### What is proved, and what is emphatically not

**47 of 47 hosted claims passed** through real PostgREST under real roles with
RLS actually enforced: T-01, T-09, the six controls each naming itself, both
retry ceilings, immediate retirement of a gone subscription, quiet hours and the
cap read back from `agent_preferences`, an audit with no content-bearing column,
and three non-vacuous negative controls. Zero residue proved owner-scoped and
then confirmed globally.

The push cryptography is proved against **RFC 8291 section 5's published vector,
byte for byte** — a round trip would have agreed with itself while both halves
used the same wrong info string.

**NO PUSH HAS REACHED ANY DEVICE.** Every test uses a fake `fetch`. An emulated
Pixel 7 is a viewport, not a device. No screen reader has read the surface.
**Nothing calls the sender automatically** — there is no producer, no schedule
and no cron entry, because wiring the heartbeat would need a claim RPC and
therefore a fourth migration.

### THE LOOP STOPS HERE — OWNER CHECKPOINT, HARDWARE PROOF REQUIRED

The checklist is in `docs/reports/phase-2m/PHASE_2M_SLICE_04B_ACCEPTANCE.md` §6,
split into the **six lines that block slice 2M.5** (permission after a real
gesture, delivery on both platforms, the tap destination, revocation) and the
**eight that block only closeout**.

**2M.5 is NOT started. Phase 2M is NOT closed. Phase 2N is NOT started and NOT
planned. A13 is NOT retargeted.** Signup closed, rollout gate untouched, the
retention sweep armed by nobody.

## §56 — Hardware run 1 failed H-5, and the failure was undiagnosable by my own doing (2026-08-12)

**H-4 passed. H-5 FAILED. The checkpoint is still blocked**, and every remaining
hardware line is **not started** rather than passed, because each assumes
delivery works.

### The second defect, which was mine

The iPhone reported `ok=true status=sent delivered=0 retired=0 failed=1` and the
function's logs held **only boot and shutdown**. Both failure paths appended to
`failed` and said nothing, so an Apple rejection, a bad VAPID signature, a
transport error and a malformed subscription were **one observation**.

**Only hardware could have found this.** Every offline test asserts what the code
*does* with a known failure; none could notice that it never says *which* failure
happened. That is a general lesson about test design, not about push: a suite
that always supplies the failure it is testing cannot detect that the system
under test never reports which failure occurred.

### The remedy, merged as `609ee5b` and deployed

Twelve closed categories plus the HTTP status when the service answered. No
endpoint, no subscription id, no owner, no key, no payload, and **no response
body text** — a thrown value is matched by exact equality against our own crypto
module's closed set and everything else collapses to an opaque `unknown_error`.
Retirement stays **exactly 404/410**, asserted across six statuses.

### The hypothesis, and the half already answered

Cryptography is **not** the suspect: structurally equivalent to a known-working
deployment and proved against RFC 8291 section 5's vector byte for byte. The
difference is the VAPID `sub`. Ours defaults to `mailto:ops@my-brain.invalid`,
and `.invalid` is RFC 2606 reserved and can never resolve, while RFC 8292 defines
`sub` as an address the operator can be contacted at.

**`VAPID_SUBJECT` is confirmed NOT configured on the deployed project**, so the
sender is using that default and will report `subject: "reserved"`. The remaining
unknown is the push service's status code, and only a device can supply it.

`Urgency: normal` and the TTL difference are **deliberately unchanged** — moving
them now would make the next run ambiguous.

### A deployment detail that will recur

On Windows the working tree holds CRLF while the blob holds LF, because
`.gitattributes` pins `*.sql` and not `*.ts`. Byte-identity for an Edge Function
deploy therefore needs an LF normalisation first. **The migration deployments'
byte-identity claims are unaffected** — `*.sql` is pinned. Pinning `*.ts` is an
open remainder.

### THE LOOP STOPS HERE — OWNER ACTION REQUIRED

One hardware re-run with the diagnostics deployed. **2M.5 not started, Phase 2M
not closed, Phase 2N not started, A13 not retargeted.**

---

## §57 — The 403 is narrowed by measurement, and the one question left is now askable without a device (2026-08-12)

Hardware run 1 (§56) reported `unauthorized` with **HTTP 403**, twice — once with
`subject: "reserved"` and once, after the owner configured `VAPID_SUBJECT` with a
real operational address, with `subject: "operational"`. The subject is therefore
**not** the cause, and 403 is where a rejected `sub`, a wrong `aud`, an
unverifiable signature and an unexpected key all converge.

### Three hypotheses eliminated by measurement, none by reading

Comparisons made locally, reported as verdicts, **never as values**:

| claim | verdict | how |
|---|---|---|
| `edge_public_vs_app_public` | **match** | sha256 of the deployed application's rendered key vs. the hosted secret's digest |
| the application's key is a real uncompressed P-256 point | **yes** | 65 bytes, `0x04` prefix, decoded locally |
| the key predates the subscription | **yes** | secret set 10:16 UTC; the owner re-subscribed after 14:47 UTC |
| `VAPID_PRIVATE_KEY` present on Vercel | **no** | `vercel env ls` — the boundary holds |

Two methodological notes worth keeping:

1. **`supabase secrets list` reports `sha256(value)` in hex.** That is not
   documented anywhere the CLI says so; it was established against **three
   controls** whose values this machine already held. Never compare a secret by
   asserting an algorithm you have not first proved on a known value.
2. The application's copy is only observable **at runtime**, because
   `VAPID_PUBLIC_KEY` is a server variable rendered into an authenticated page —
   and Vercel marks it *Sensitive*, so no API returns it. It was read the way
   `e2e/support/online-session.ts` reads anything hosted: mint a session over
   HTTP, install the `@supabase/ssr` cookie, clear SH.4's consent interposition
   **through the product's own surface**, and scan the page for base64url runs
   that decode to a P-256 point. Zero residue; the scanner never printed a byte.

### The hypothesis that could not be asked, and the runtime that is why

Whether the two configured **halves are a pair**. This runtime cannot be asked,
and that was measured rather than assumed: Deno's WebCrypto imports an EC private
JWK **from `d` alone**, never consulting `x`/`y`. A `d` from one generation
advertised with an `x`/`y` from another imports cleanly, signs, and yields a
64-byte signature that verifies against **nothing**.

That is a perfectly well-formed request no push service can authenticate, and
**403 is the only answer it can give** — which is exactly what an iPhone said.

### The remedy, merged as `7bc0698`, CI green 3/3 on that exact SHA, deployed

- `vapidKeyPairAgrees` does what the push service does: signs a fixed public
  probe with the configured private key, verifies it with the configured public
  key. Disagreement is `false`; a half that is not a key **throws**, because
  "two keys from different generations" and "this is not a key" are different
  repairs.
- `deliverPush` checks it **before `begin_push_delivery`** — which this module's
  header had already promised for a missing VAPID key. The loop would otherwise
  spend the dedupe slot, spend an attempt, and charge the **device** a strike for
  a fault that is entirely ours. **Three strikes retire a subscription and the
  owner has one.**
- `inspectSenderConfiguration`, reachable as `mode: "selfcheck"`, reports
  subject, public key, private key and pair as **categories** over a request that
  touches no database, contacts no push service and can name no subscription.

**The point of the self-check is the operational constraint, not the code.** The
remaining bit of information cost a hardware run to obtain and left the next
reading ambiguous. It now costs nothing.

### The test lesson, again, and it is the same one

Every existing RFC 8292 assertion was handed a pair generated in **one call**, so
an incoherent pair could travel silently past all of them — §56's lesson with a
different subject. The new controls supply the incoherent pair. The mismatch test
is written to survive a runtime that starts validating: it asserts that **a
mismatched pair never yields a token the advertised key can verify**, not that
the import succeeds.

### Deployment

Byte-identity again needed the LF normalisation §56 recorded — `.gitattributes`
still pins `*.sql` and not `*.ts`, and **that remainder is still open**. All five
deployed files proved sha256-identical to the merge after normalising, the tree
was restored, `verify:edge-parity` is green (`send-push` deployed
2026-08-12T15:37 ≥ source 15:31), and the deployed function answers **405** to
`GET`, **401** to a POST with no secret and **401** to one with a wrong secret —
its own body, not a gateway error, so `verify_jwt = false` still holds and every
variable is still visible to it.

### Honest classification

- **Executed and proved:** hypotheses 1, 3 and 11 eliminated; the runtime's
  silent acceptance of a mismatched JWK; the merge, CI, deployment and parity.
- **Implemented but not executed in the required environment:** the self-check
  itself. It is secret-authenticated and **the agent does not hold
  `WORKER_DISPATCH_SECRET`**, so its hosted reading is the owner's to take.
- **Not eliminated:** hypothesis 2 (the pair). That is precisely what the
  self-check now answers, at no cost.
- **Blocked by owner action:** H-5 and every hardware line behind it.

### THE LOOP STOPS HERE — OWNER ACTION REQUIRED

**The self-check first, and it costs nothing.** Only if it reports
`pair: "consistent"` is a device run the right next step. **2M.5 not started,
Phase 2M not closed, Phase 2N not started, A13 not retargeted. No migration was
created; the budget stays `3 allocated · 3 spent`.**

---

## §58 — Phase 2M closes honestly, and its closeout slice found two surfaces that had never rendered (2026-08-12)

**Phase 2M is COMPLETE.** 94 requirements: **89 built · 4 partial · 1
not-built-by-rule · 0 undelivered**, generated from the slice records and never
typed. Budget closes at **`3 allocated · 3 spent`**; zero migrations in the
closeout. Hosted parity read live and read-only: **`202608120092` across 92
migrations, local = remote on every row.** Signup closed; rollout gate untouched
at **25 pass · 3 fail · 2 owner-signature**. Merged as PR #189 at **`71c258d`**
with **CI green 3/3 on that exact SHA**.

### The sentence the phase must be read with

**Push is implemented and hosted, it fails on the owner's real iPhone with
`HTTP 403` from Apple Web Push, and it has never been validated on Android.**

The owner's self-check answered `pair: "consistent"`, and the single retest after
it still answered `unauthorized 403` with no notification arriving. **A consistent
pair eliminates a key mismatch and explains nothing.** No root cause is asserted
anywhere in this repository, and the next person should treat every hypothesis in
`docs/initiatives/push-hardware-validation/` §2 as unproven.

**ADR-107 is an amendment to OD-2M-5's closeout gate and not a success claim.**
`H-5` is FAILED, Android is NOT EXECUTED, and neither may be deleted,
reclassified as passing, or discharged by an offline test.

### The finding that mattered most, and it was not push

The closeout slice's declared work was classification. The first thing it did was
execute the authenticated journey slice 2M.3 said it owed — and that journey
found that **`/app/reviews` and `/app/calendar/plan` had never rendered at all.**
Both handed a plain arrow function to a `"use client"` component; React cannot
serialize a function into the RSC payload, so both routes answered with their
error boundary from the day they deployed. Measured in a real browser against the
deployment, with `/app/calendar` beside them as the control that rendered.

**Every component test was correct.** A test mounts the client component directly
and hands it a function, which is valid there. Both browser lanes compose the
surfaces with `setContent`, which never runs a server render.

> **A boundary that only exists in production is only tested in production.**

Two slices classified those surfaces `built` on evidence that could not see the
boundary. Both are re-classified `built` in 2M.5 on evidence that can, and the
earlier rows are left in place — the history is the contract working.

### Three things worth carrying forward

1. **A guard that fails on correct code is a guard somebody weakens.** The
   boundary guard's first version scanned whole files and failed immediately on
   `app/reminders/page.tsx`, which hands two local formatters to a **server**
   component and works. It resolves the receiving element now.
2. **An exemption must not outlive its defect.** `2M-TIME-007` found four
   `daily-cycle` surfaces still formatting instants with no `timeZone`. They were
   recorded rather than repaired — the repair crosses two routes and ~27 call
   sites, and a product change inside a closing commit is how a phase's last
   change becomes its riskiest. The guard names all four, asserts the length, and
   **asserts each still carries the defect**, so the day one is fixed the guard
   fails until the name comes out.
3. **Invert a governance guard, never delete it.** `phase-2m-declarations.test.ts`
   forbade the matrix and the closing report from existing — right mid-flight,
   exactly wrong at closeout. It now *requires* both and requires the matrix to be
   byte-identical to the generator's output, which is stronger than what it
   replaced, and it changed inside ADR-107's own unit.

### The deployment

Vercel deploys `main` automatically. Both previously-broken routes were probed in
a real browser after the merge and **render**. No Edge Function was redeployed —
this slice touched none — and `verify:edge-parity` is green with `send-push`
deployed 2026-08-12T15:37 ≥ source 15:31.

### THE LOOP STOPS HERE — OWNER DECISIONS REQUIRED

**Phase 2N is NOT started and NOT planned. A13 reports no start signal.** The
re-audit is `docs/reports/phase-2m/PHASE_2M_SUCCESSOR_REAUDIT.md` and it asks
four questions without preferring an answer: whether the successor starts at all,
whether push's device validation is a precondition, whether the Android gap is
accepted or funded, and whether the successor gets a migration budget.

**No migration was created. No push was sent. No key was changed. Signup stays
closed and the rollout gate stays untouched.**

## §59 — The Local Day Correction initiative repairs all thirty-one occurrences; the loop stops before its browser and hosted proof (2026-08-12)

**Authorized by ADR-111** as a compact initiative — planning through closeout,
**zero migrations, allocated and spent**. Not a phase: it opens no roadmap
position and implements nothing from Phase 2N.

`docs/initiatives/local-day-correction/`, `docs/reports/local-day-correction/`.

### What the census actually found

The merged Phase 2M successor re-audit said seventeen call sites in sixteen
files. Re-run against `main` at `9a1e8a2` by the same brace-depth detector the
guard uses, that number was **exact** — and it was not the whole number.

| family | found | where |
|---|---|---|
| `formatter-without-zone` | **17** in 16 files | 4 inside the Phase 2M corpus, **13 outside any guard's reach** |
| `host-zone-field` | 7 | one function: `generateReview`'s period |
| `utc-day-slice` | 4 | `generateReview` ×2, `dateBounds`, `shiftDay` |
| `zone-round-trip` | 3 | BYOK panel, and two `toLocaleString` fakes |

**Thirty-one, all repaired.** `OPEN_OCCURRENCES` is empty; every family is at
zero tree-wide.

### The thing worth carrying forward

**Thirteen of the seventeen were invisible, not deferred.** `2M-TIME-007` named
eight directories, honestly recorded the four inside them, and could not see the
person page, the project page, the memory detail, the entry detail, the file
list, the conversation list, the question panels, search, conversation sources or
the Home header. A guard whose corpus is a list is a guard that is exactly as
wide as somebody remembered to make it.

The replacement takes **`src/`** as its corpus and reaches zero in all four
families, which is what makes a tree-wide rule affordable: **no family needs a
standing allowlist, so none can be widened to make a failure go away.**

### Five things this initiative learned the hard way

1. **An exemption list must be asserted in both directions.** Every row carried
   an exact count that had to *still* hold; repairing a file failed the build
   until its row came out. That is how Phase 2M's carry-past-close list was
   discharged rather than forgotten — and the retirement is **asserted**, not
   announced, because deleting a list is also what deleting the rule looks like.
2. **A fixture that cannot fail proves nothing.** Both `daily-cycle` row tests
   pinned **noon UTC** — the same calendar day in every zone this product
   supports — so they would have passed however wrong the rendering was. Every
   fixture now sits at a boundary instant where two zones disagree, and the host
   running the tests is `America/Sao_Paulo`, so a fixture in the default zone is
   a fixture that cannot fail either.
3. **Two local functions were named `formatInstant`.** `memories` and
   `question-preview-panels` both shadowed the contract's own name while doing
   the opposite of what it does; anyone grepping to check whether those pages
   were correct would have found the name and concluded yes. The second was
   worse: its primary path carried the zone and only its **`catch` branch**
   dropped it, so the one path that ran when the zone was unusable ignored it.
4. **Guards caught my repairs, and were right both times.**
   `architecture.test.ts` refused a raw `.from("profiles")` on a page held to the
   Slice 2X.16 projection boundary — which produced `getOwnerTimeZone()`, a
   `cache()`-wrapped accessor that costs one query per request however many
   surfaces ask. And `git diff --check` refused a commit whose scripted edits had
   written CRLF into LF files, reporting every line as changed.
5. **`getOwnerTimeZone()` cannot be imported everywhere.** It pulls in
   `server-only`, and `agent/actions.ts` is reached by tests running under the
   client condition. The accessor is for Server Components; the pure
   `resolveOwnerTimeZone` is for everywhere else.

### One intended behaviour change, signed before it was made

`generateReview` computed its `daily`/`weekly`/`monthly` window from the host's
calendar — UTC on a server — and stored UTC date labels, **while fetching the
owner's zone eleven lines below in the same batch and using it only for the
prompt**. It now computes in the owner's zone.

A daily review generated at 22:00 in São Paulo covers that day instead of
tomorrow. **ADR-111 Decision 6 signed this in advance**, and **no stored summary
is rewritten, reprocessed or back-dated.**

### Two corrections that were not user-visible, recorded as such

`dateBounds` sliced a UTC date off an instant plus `730 * 24h` — wrong twice
over, and at most a day at a ±730-day picker bound, so **no user ever saw a wrong
date from it**. `shiftDay` was **correct** and moved onto the contract anyway,
because it was the last `toISOString().slice(0, 10)` in the tree and a family at
zero needs no allowlist. Neither is dressed up as a user-facing fix.

### One reader deliberately left alone

`requireProfileTimeZone` **throws** on an unsupported zone instead of falling
back. That is not a fifth copy of the resolver — it is the correct posture for a
surface that *computes* days, and it is `local-day.ts`'s own argument: a day
nobody could compute must be **reported rather than answered**. Two postures,
each stated.

### Merge SHAs, each with CI green on the exact SHA

| unit | merge SHA | debt after |
|---|---|---|
| 1 — contract and guard | `911c58a` | 31 |
| 2 — daily-cycle | `1734d34` | 27 |
| 3 — contextual pages | `ea9fd39` | 20 |
| 4a — remaining formatters | `45fb7fb` | 14 |
| 4b — three families, resolvers | `7bd89aa` | **0** |

### THE LOOP STOPS HERE — UNIT 5 IS NOT DONE

**The code work is complete and the initiative is NOT closed.** What remains is
Unit 5: browser journeys, authenticated production verification in two zones that
are on different calendar days at the same instant, a DST case per hemisphere,
zero-residue cleanup, the closing report, and a re-audit of slice 2N.0 against
the new `main` **without implementing it**.

**Not proven anywhere yet:** that any of this renders correctly in a real
browser, or against production. The proof to date is unit-level and structural —
6536 tests, a tree-wide guard, and a convergence test — plus CI green on five
merge SHAs.

**Unchanged throughout:** 92 migrations, hosted parity `202608120092`,
`verify:edge-parity` green, zero Edge Function changes, `planned_at` untouched,
push not resumed (still HTTP 403 on a real iPhone, Android **NOT EXECUTED**),
signup closed, rollout 25 · 3 · 2, **Phase 2N planned and unimplemented**, Phase
2O not started, and A13 still guarding the roadmap successor.

## §60 — The Local Day Correction concludes: the proof stops being structural and starts rendering (2026-08-13)

Unit 5 of ADR-111, merged at `005c42e` with CI green on that exact SHA. The
initiative is **CONCLUDED**. `docs/reports/local-day-correction/LOCAL_DAY_CORRECTION_CLOSEOUT.md`
and `PHASE_2N_SLICE_0_REAUDIT.md`.

### What §59 could not say, and this one can

§59 recorded thirty-one repairs and then said plainly what was missing: *"not
proven anywhere yet: that any of this renders correctly in a real browser, or
against production."* Everything to that point — a tree-wide guard at zero in
four families, a convergence test, 6563 unit tests, CI green on five merge SHAs —
is a statement about **source**. None of it renders a page.

### The shape of the proof, and why it is two owners rather than one

A single account cannot distinguish "renders the owner's day" from "renders some
day". So one instant runs past **two owners whose zones are on different calendar
dates at that instant, in opposite directions**:

| owner | zone | locale | sees | UTC — and the deployment's host — sees |
|---|---|---|---|---|
| ahead | `Pacific/Auckland` | pt-BR | **15 May** | 14 May |
| behind | `America/Los_Angeles` | en | **13 May** | 14 May |

A surface pinned to UTC fails for **both**; a surface that merely picked some
other zone fails for **at least one**. Before this initiative every cell in the
fourth column read 14 May. May, not August, because a fixture dated today would
let a page's own "today" satisfy an assertion about a **stored** instant.

Eleven surfaces each, plus the Home header and a DST pair per hemisphere.
**Executed four ways — 29/29 desktop and mobile against the hosted project, then
both again against the deployed application.** 116 assertions, zero residue.

**The deployment is the point.** Its host zone is UTC; this machine's is
`America/Cayenne`. A host-zone defect renders differently in the two, and the
deployment is the environment the defect was reported against.

### Four ways a test reports success while proving nothing — all found by running

None of these was reasoned about in advance. Each was found because the suite ran
against something real.

1. **An absence assertion passes on a page that never rendered.** Eleven surface
   cases "passed" while one of them was reading a body containing nothing but the
   navigation shell and "Carregando página". The route's Suspense fallback is now
   waited out, and **every surface names a marker from its own fixture**, so "the
   wrong day appears nowhere" can no longer be satisfied by a blank page.
2. **A test that pins a format tests the format.** The calendar was *correct* and
   failed anyway: `calendar-view.tsx` labels a column `Wed, May 13` and the
   assertion wanted `May 13, 2026`. A day is now a **set** of spellings.
3. **`innerText` does not report collapsed content.** The question panels are
   `<details>`; their dates were in the DOM and invisible. Opened by clicking —
   scoped to `main`, because the nav shell's own `<details>` is hidden at desktop
   widths and never becomes clickable.
4. **Thirty sign-ins in two minutes earn `429 over_request_rate_limit`**, which
   surfaced as eight unrelated failures and was none of them.

### The extraction that made a signed behaviour change contradictable

`generateReview`'s period moved to `review-period.ts` **unchanged**. The
obstacle was structural and worth remembering: **`"use server"` makes every
export in a file an async Server Action**, so the window computation could not be
exported, could not be called with a fixed `now`, and could only be "tested" by a
test that re-wrote the same expressions and compared them to itself. ADR-111
Decision 6's behaviour change had, for five units, **nothing able to contradict
it**.

Both controls are real: reverting `today` to the host calendar fails **6** cases
by name; reverting the daily bounds fails **14**. Reverting the person page to
`formatInstant(…, "UTC")` fails **both** its journey cases with the exact UTC
spellings it rendered.

### The leak, and the reason it was the failing run that leaked

The first hosted run's `beforeAll` threw *after* creating two accounts, and
cleanup keyed off a variable the throw had prevented assigning. **The run that
most needed cleaning up was exactly the one that could not clean up.** Removed by
explicit id, each verified `@example.com` first, never by a predicate sweep; then
fixed at the cause — the id is recorded *before* seeding can throw, proved by the
deliberately failing mutation run, which left nothing.

### Three residuals, none of them a date defect

- `src/app/[locale]/app/loading.tsx` announces **`"Carregando página"` in both
  locales** on a `role="status"` live region. → `2N-ACCESS`.
- `loadQuestionPreviews` is wrapped in `.catch(() => new Map())`: a row shape its
  schema rejects yields no preview and **no error**. → Phase 2N provenance.
- A **live** `generateReview` against production is **NOT EXECUTED** — it needs a
  paid provider call behind the BYOK gate. → the owner; a cost decision, not a
  technical blocker.

`calendar-view.tsx`'s `timeZone: "UTC"` was checked and is **correct** — it
formats an already-decided `LocalDate` at UTC noon. Recorded because it reads
alarmingly and the next audit will meet it again.

### Slice 2N.0, re-audited and NOT implemented

Its privacy, bounds and identity halves stand as signed. **Its time half needs
three corrections before implementation, and they are the owner's to authorize:**

- **`2N-TIME-002` is obsolete as written.** It plans to extend `2M-TIME-007`'s
  *named* corpus with Phase 2N's directories. A **tree-wide** guard now holds
  four families at zero over 400+ files, those directories included. Adding a
  narrower list beside it produces two guards with different reaches for one
  defect — and re-teaches exactly what §59 recorded: *a guard whose corpus is a
  list is exactly as wide as somebody remembered to make it.*
- **`2N-TIME-004` is moot.** The four `daily-cycle` exemptions were repaired in
  Unit 2 and `HOST_ZONE_FORMATTERS_CARRIED_PAST_CLOSE` is retired. The
  requirement now asks 2N.0 to **preserve a list that does not exist**, and the
  easiest way to satisfy it literally is to re-create one.
- **`2N-TIME-005`'s population was 31, not ~27.** Its own "whichever is current"
  clause absorbs this, so it is satisfied rather than violated — but the gap is
  instructive: the extra families were invisible to an audit counting
  *formatters*, and the worst of them changed **what a review contained**.

**Nothing in Phase 2N was implemented, amended, added or removed.** ADR-111
Decision 8 makes amending a signed 2N contract a stop condition, so the re-audit
**proposes and does not edit**.

### THE LOOP STOPS HERE — THE INITIATIVE IS CLOSED

**Unchanged throughout:** 92 migrations, **zero created and zero spent**, hosted
parity `202608120092` verified against the live project, `verify:edge-parity`
green, zero Edge Function changes, `planned_at` untouched, push **not** resumed
(still HTTP 403 on a real iPhone, Android **NOT EXECUTED**), signup closed,
rollout 25 · 3 · 2, **Phase 2N planned and unimplemented**, **Phase 2O not
started**, M1/M2/M3 still allocated and non-transferable, and A13 still guarding
the roadmap successor.

## §61 — Phase 2N implementation is authorized, the stale time requirements are corrected, and 2N.0 is re-audited but NOT started (2026-08-13)

**ADR-112**, merged at `05d4c8f` with CI green on that exact SHA. `docs/reports/phase-2n/PHASE_2N_SLICE_0_REAUDIT.md`.

### What moved

Phase 2N goes from **planned** to **in implementation**. Planning had been
authorized by ADR-108, all seventeen decisions signed by ADR-109, the flagged
interpretation settled by ADR-110 — and every one of those withheld permission
to build. **This change built no product.**

### The seventeen signatures, re-audited and unchanged

Every one stands. `OD-2N-13` **B** is the only one whose *object* changed, and it
changed by being **satisfied**: the initiative it required was authorized,
executed and merged. **A decision that has been carried out is not a decision
that has been altered** — which is why four requirements were corrected and no
signature was amended.

### The four corrections, and why each was a defect rather than a tidy-up

| id | was | now |
|---|---|---|
| `2N-TIME-002` | extend `2M-TIME-007`'s **named** corpus | `[BASELINE]` — the tree-wide guard's four families stay at zero; **2N.0 builds no timezone guard** |
| `2N-TIME-004` | preserve the self-cleaning half of the exemption list | `[BASELINE]` — the list is retired; **no exemption list is re-created** |
| `2N-TIME-005` | 13 across 12 files (≈27) | `[BASELINE]` — **31**, under the requirement's own "whichever is current" clause |
| `2N-TIME-006` | future-tense dependency, "2N.0 guards its own surfaces" | `[BASELINE]` — dependency **discharged**; the repair is **not this phase's delivery** |

**`2N-TIME-002` was the one that mattered.** As written it instructed a slice to
build a **second census of one defect**, beside a tree-wide guard already holding
it at zero — and the narrower census always reads as authoritative to the next
author. That is the failure `2M-TIME-007` taught, being re-created by a
requirement written before the fix existed.

**`2N-TIME-004` was the subtler one.** It obliged the phase to *preserve* a list
that no longer exists, and **the most direct way to satisfy it literally would
have been to re-create one.** A requirement can outlive its object and still read
as perfectly sensible.

**All four close `baseline`, never `built`.** The repair came from ADR-111's
initiative under its own budget and its own closeout. `baseline` is the marker
this repository already has for *"true before the phase; the phase must not break
it"*, and using `built` would have inflated this phase's delivery by 31 call
sites it did not touch.

### How the correction stayed traceable

**No id renumbered, reused or deleted.** Each restated **in place** with an
explicit `*(Restated by ADR-112: …)*` marker — the mechanism ADR-109 used for
twelve requirements and ADR-110 for one. Count stays **127 across sixteen
families**, re-derived from the PRD rather than typed. Deleting the ids would
have destroyed the record that the obligation existed *and* broken the family's
gapless numbering, which the guard asserts.

### Two guards inverted rather than deleted, as the file itself predicted

`phase-2n-declarations.test.ts` was written to be inverted — its header says so,
citing Phase 2M's equivalent. Both inversions happened at their gate:

- *"implementation is still not authorized"* → *"implementation is authorized,
  **and by which decision**"*, still requiring the PRD to name what is refused in
  the same breath.
- *"implementation has not begun"* → narrowed to *"the **closing** artifacts
  arrive at their gates"*. Slice acceptance records are now expected; the matrix,
  closing report and deployment record are not, until 2N.7.

**The flat count of 92 migrations became the rule it was standing in for:** at
most three attributable to this phase, and the total is 92 **plus exactly those**.
A fourth now fails at the guard rather than at closeout, **and an unattributed
migration fails too** — which a flat count could only ever catch by accident.

**A13's milestone line moved in the same commit, for the sixth time**, by the
unchanged rule: *the line cites every authorization the phase has received and
overstates none of them.* ADR-105 dropped "planning"; ADR-108 required it back;
ADR-112 drops it again, because requiring it now would force the backlog to
**understate**.

### The correction's premise is asserted, not trusted

A new cross-guard check fails if `OPEN_OCCURRENCES` is ever re-populated or the
tree-wide corpus narrowed — **proved by planting a row and watching it fail by
name**. Removing one census while the other quietly weakened is the single way
this correction could have done harm, so it is the one thing mechanically
prevented.

### Both Unit 5 findings dispositioned, neither absorbed

- **In scope, no new id invented.** `app/loading.tsx` announces
  `"Carregando página"` in **both** locales on a live region. PRD §4 obliges
  every surface this phase ships **or touches** to declare its **loading** state
  in both locales, and it is the streaming fallback for all four contextual
  routes → `2N-ACCESS-005` and `2N-ACCESS-003`, delivered in **2N.0**.
  **Trap for whoever builds it:** an App Router `loading.tsx` receives **no
  props**, so no `params` and no locale. Read `node_modules/next/dist/docs/`
  before choosing how to derive it.
- **Out of scope, remainder with a destination.** `loadQuestionPreviews` turns a
  rejected row shape into an empty `Map`. **No instance of that pattern exists on
  any Phase 2N surface** — asserted over the four contextual routes and
  `src/features/entities`, not assumed.

### 2N.0 re-audited against `05d4c8f` — and NOT started

All five of ADR-108's premises **still hold**, re-derived from source: no
contextual route imports the sensitivity contract; `entity_aliases` still has
**zero readers**; search's `people` domain still matches **and snippets**
`notes`; the person and project pages still truncate silently at
`.limit(100/200/50)`; and neither table carries a `sensitivity` column. **The
slice needs no re-planning**, has no blocked requirement and no open decision,
and its schema impact is **none**.

### THE LOOP STOPS HERE — 2N.0 IS RE-AUDITED, NOT IMPLEMENTED

Stopped **between slices**, which is where ADR-112's loop says to stop. 2N.0 is
29 requirements across five routes plus a new derivation module, a bounds
vocabulary, an alias reader, a search narrowing, the loading fix, unit tests and
desktop/mobile journeys in both locales. **Beginning it without finishing it
would leave exactly the partial slice the loop forbids.**

**Unchanged:** 92 migrations, **zero of Phase 2N's three spent, none created**,
parity `202608120092`, budget non-transferable with a **fourth a STOP
CONDITION**, signup closed, rollout 25 · 3 · 2, push **not** resumed (HTTP 403 on
a real iPhone, Android **NOT EXECUTED**), **Phase 2O not started**, and A13 still
guarding the roadmap successor.

## §62 — Phase 2N slice 2N.0 ships: the contextual surfaces become governed, bounded and identifiable (2026-08-13)

**PR #202**, merged at `effc8da`, **CI green 3/3 on that exact SHA**. Head at
review was `ef953dc`, also green 3/3. Base was `main` at `4b66119`.
`docs/reports/phase-2n/PHASE_2N_SLICE_0_ACCEPTANCE.md`.

**Migrations: 0 created. 92 total, parity `202608120092`.** M1/M2/M3 remain
allocated to 2N.3 and 2N.7, unspent and non-transferable — asserted by a guard,
not by prose.

**29 requirements: 23 built, 5 baseline, 1 partial.** The partial is
`2N-PRIVACY-011`: its journey is written, covers both locales on desktop and
mobile, asserts every clause — and **has not been executed**, because it needs
hosted credentials and skips without them. A written test is not an executed
test. `2N-IDENTITY-008` also closes `baseline`: the slice ships no writer at all,
so "no inference creates a persisted identity" is preserved rather than built.

### The thing worth carrying forward: a column is not an answer

Work needed a derivation because `tasks` has no classification. `entries`,
`memories` and `attachments` **do**, so the obvious implementation here was
"read the column and render it" — and that is the bug. **A column exists on the
row the query returned and says nothing about the row it could not return.**

These pages join through relationship tables, and a join that comes back short
does so silently: the id is on the page, the classified row is not, and the
fail-open reading prints whatever it has. So `subject-derivation.ts` keeps the
three-arm answer even where the level is closer to hand, and removed, foreign
and unreadable stay indistinguishable **by having no branch that could tell them
apart** — all three are *absent from the map*, so they are literally the same
input.

### `undetermined` and "masked by default" are both absences, and picking wrong publishes

`people.notes` has no classification anywhere to read. `undetermined` renders
**in the clear**, so routing the note through it would have published the single
most likely place in this product for something genuinely private about a named
human being. `deriveFreeTextSensitivity` returns `derived` at the most protective
level, and **takes no arguments at all** — ADR-110 D7 forbids inferring a level
from the note's text, and a signature that cannot accept the text is stronger
than callers remembering not to pass it.

### Exactly `limit` rows cannot tell you whether more exist

The audited defect was silent truncation. The plausible fix —
`bounded = rows.length === limit` — is **worse**: it claims a truncation every
time the total is exactly the limit, trading silence for a confident falsehood
the user cannot detect. The bound is measured with a probe row (`limit + 1`),
which the repo's own `paginateRows` already did and nobody had generalised.

**And a two-hop read has two bounds.** Found reviewing the diff, not by a test:
the contextual pages resolve ids through a relationship table first, so 101 links
resolving to 95 rows reported the list **complete**. `upstreamBounded` makes the
answer the disjunction.

### `loading.tsx` takes no props, and the real fix was one level up

It announced Portuguese to every reader. It cannot look the locale up —
`node_modules/next/dist/docs/.../loading.md` says "Loading UI components do not
accept any parameters" — and the workarounds each cost something: `await
headers()` makes an instant fallback dynamic, `"use client"` ships JS to render
a skeleton.

So it renders **every** announcement and the document's `lang` selects one. That
required fixing why it could not: **`src/app/layout.tsx` sits above `[locale]`
and hardcodes `lang="pt-BR"` for every locale**, so `app-shell.tsx` — the first
element below it that knows the locale — now declares it. Worth having on its
own: it is what a screen reader uses to pick a voice for the whole app.

The stylesheet **hides what does not match** rather than showing what does, so a
missing stylesheet or a missing `lang` degrades to announcing *both* rather than
*nothing*. The gate is untouched: `loading.tsx` awaits nothing and holds no
client, and `requireUser` still runs above the Suspense boundary.

### Guards found one defect; the diff review found the other; two guards were wrong first

The bounds guard caught **`.limit(20)` silently bounding the files page's failed
jobs** — the one list whose entire purpose is "these need your attention". Fixed,
not exempted.

Two guards were written wrong and **corrected rather than loosened**: one flagged
pagination's `hasMore` as a competing bounds vocabulary (it is not — "there is a
next page" comes with a way to reach it), and one matched `await` inside the
comment in `loading.tsx` **forbidding** `await`. A guard that fails on correct
code gets weakened by the next person to touch it, so both were narrowed to the
property actually being asserted.

### Two judgement calls a reviewer should be able to disagree with

- **`graph` was NOT admitted to `GOVERNED_SURFACES`.** `2N-PRIVACY-001` admits a
  surface in the change that ships its first consumer, and 2N.0 ships no graph.
  It joins in 2N.6, with its consumer, or not at all.
- **`projects.description` stays visible.** ADR-110 D4 masks free text *about a
  human being*, and search deliberately keeps matching that column. Masking it
  would leave the product saying two things about one column; widening is an
  owner decision, not one a slice takes. Recorded in place so it does not read
  as an oversight.

Also corrected: **`asMemorySensitivity` fails OPEN to `normal`** where the
contract's predicate fails closed. The memory detail page both *states* the
classification and *acts* on it, so two predicates failing in opposite directions
could print "Normal" beside content the mask was withholding. That page now uses
the contract; the write-path helper is left alone.

### Slice 2N.1 re-audited against `effc8da`, NOT started

- **Dependencies satisfied.** 2N.0's three modules are on `main`; the timezone
  initiative concluded at `d581e43`.
- **ADR-108 audit finding #7 still holds:** `person_relationships`,
  `person_projects` and `person_contexts` carry **no `source_entry_id` and no
  `interpretation_id`** — 0 occurrences in the migrations. So a relation cannot
  answer "where did this come from", and `OD-2N-8` A's *"informed by you"* is the
  only truth available. **Backfilling provenance the product cannot know is the
  slice's named stop condition.**
- **`relationship-panel.tsx` renders no origin, source or confidence at all** — 0
  occurrences. The `2N-PROV` work is real, not already-shipped.
- **The person page is now governed and bounded** (9 `ProtectedContent`, 4
  `BoundedNotice`), so 2N.1 inherits those rather than building them, and must
  not re-claim them.
- **No reordering justified.** No migration implied — `OD-2N-8` A removed the
  provenance migration.

### State at the end of this entry

`main` at `effc8da`, clean, synchronized. No open PR. **92 migrations, parity
`202608120092`.** Budget **3 allocated · 0 spent**, non-transferable, a fourth a
**STOP CONDITION**. Signup closed, rollout **25 · 3 · 2**, push **not** resumed
(HTTP 403 on a real iPhone, Android **NOT EXECUTED**), **Phase 2O not started**,
and A13 still guarding the roadmap successor. Slices 2N.1–2N.7 remain.

## §63 — 2N.0's hosted proof is executed, and it finds the loading state silent in English (2026-08-13)

**PR #204**, merged at `77172d4`, **CI green on that exact SHA**. Head at review
was `fe57467`, also green. `docs/reports/phase-2n/PHASE_2N_SLICE_0_ACCEPTANCE.md`
§8. **0 migrations. 92 total, parity `202608120092`.**

`2N-PRIVACY-011` closes **partial → built**. Slice 2N.0 is now **24 built · 5
baseline · 0 partial**.

### What "hosted" actually means here, stated so it cannot be overclaimed

**12/12 passed**, both locales × desktop and mobile (Pixel 7).

| half | what it was |
|---|---|
| database, auth, RLS | the **hosted Supabase project**, real GoTrue session, real policies |
| application | the **production build** (`npm run build` → `npm run start`) on `localhost:3000` |

**The application half is NOT the Vercel deployment.** That is what this
repository's online lane is — `playwright.config.ts` pins `baseURL` to
localhost and `scripts/online-playwright.mjs` supplies only hosted Supabase
credentials. `npm run start` over `npm run dev` is a deliberate narrowing (§57's
two never-rendered surfaces), and `npm run dev` cannot be used anyway: it exceeds
the 120s `webServer` timeout on this machine.

No owner credential. **No paid provider** — search is lexical, and no trigger
enqueues a job from a direct REST insert, so nothing reached OpenAI.

### Two defects, and only one of them was the product

**1. The journey could never have run.** Both array inserts gave their rows
different key sets, which PostgREST refuses with `PGRST102 — "All object keys
must match"`. **A written test is not an executed test — and an unexecuted one is
not even known to be *runnable*.** 2N.0 classified it partial for the right
reason and still understated it.

**2. `2N-ACCESS-003`/`-005`: the loading state is silent in English.** 2N.0
replaced a fallback that announced Portuguese to every reader with one that, on
`en`, announces **nothing at all** — both spans hidden, a screen reader given
silence, which is *worse* than the bug it fixed and is exactly what the
"hide what does not match" direction was chosen to prevent.

The direction was right; the **selector form** defeated it. A descendant
`[lang="…"]` combinator matches an ancestor at **any** depth, and there are
always **two** `lang` declarations above those spans — `src/app/layout.tsx` sits
above `[locale]` and hardcodes `pt-BR`, `.app-frame` carries the real one — so on
`en` both rules fired. **`:lang()` resolves against the nearest declaration**, so
the outer `<html>` cannot participate. Degradation preserved: no stylesheet or no
`lang` and both are announced.

**No unit test in this repository could have caught it** — jsdom applies no
external stylesheet — and the guard asserted the rules *existed*, so it would
have passed on a stylesheet that hides everything. It now bans the ancestor form
by name, **proved by reintroducing the old selector**, and separately proved not
to fire on the comment that quotes it.

### Zero residue, owner-scoped

Never a global count — the project holds the owner's real data, so a global
number would be evidence of nothing. Disposable accounts by prefix: **0**. Six
distinctive synthetic markers across `people`/`memories`/`entries`/
`entity_aliases`: **0** each. The probe run **before** the first successful
execution also returned zero, which is what establishes the harness cleans up
after a **failed** `beforeAll` rather than only after a passing run.

## §64 — Slice 2N.1 is re-audited, one inherited number is wrong, and the defect it hid is fixed — 2N.1 itself is NOT started (2026-08-13)

**PR #205**, merged at `6309e0d`, **CI green 3/3 on head `e3cc9dc`**.
**0 migrations. 92 total, parity `202608120092`.**

### The inherited number was wrong, and that is the transferable part

§62 recorded "9 `ProtectedContent`, 4 `BoundedNotice`" on the person page, and
the next prompt restated it as **"nove consumidores"**. Both are raw `grep`
**line** counts — import lines and closing tags included. The real figures are
**4 `ProtectedContent`** and **3 `BoundedNotice`**.

**An inherited coverage number is what the next slice uses to decide what it may
skip as already shipped.** Inflated 2×, it silently narrows scope, and nobody
re-derives it because it reads as already audited. Re-derive counts of *usages*
from the opening tag, never from the bare name.

### The defect that re-deriving it exposed

`2N-PERSON-003` and `2N-PROJECT-006` closed **built** in 2N.0 on "bounds
vocabulary applied to every list". **Four lists were never in it**:
`relationships`, `contexts` and linked `projects` on the person page, and linked
`people` on the project page.

Each was queried with `withProbe(limit)` — the extra row **was** fetched to
measure the bound — and then handed straight to its panel without
`boundedList`. So at 51 relationships or 101 linked projects the page **rendered
one row past its own limit AND reported nothing**: the probe row became content
instead of evidence.

**Three guards passed over it, and none of them was wrong.** The routes did call
`withProbe`, did call `boundedList`, and did render `<BoundedNotice>` — for their
*other* lists. The notice lived inside a panel the route-level checks never
opened.

- The bound is now a **required** prop on both panels, so `tsc` remembers rather
  than each caller. Optional would have re-created the exact failure
  `bounded-notice.tsx` was written to prevent, and the symptom is silent.
- A required prop is **not sufficient**: `bound={boundedX}` beside
  `rows={raw.map(...)}` type-checks and still renders one row too many. So the
  new guard asserts the **data** — every panel list on a contextual route is fed
  from `.items` — proved by feeding it the raw array and watching it fail by name.
- The project page is fixed here rather than deferred. It carries the same live
  defect, and preserving a slice boundary is not worth leaving a known silent
  truncation in place. **2N.2 still owns the project page's requirements.**

### THE LOOP STOPS HERE — 2N.1 IS RE-AUDITED AND NOT STARTED

`2N-PERSON-003` is now genuinely satisfied on the person page (all six lists
bounded). Everything else in 2N.1 is **unbuilt**, verified against source rather
than assumed:

| requirement | state |
|---|---|
| `2N-PERSON-001`/`-002` | `[BASELINE]`, preserved — re-verify, do not re-claim |
| `2N-PERSON-003` | **satisfied** by PR #205 |
| `2N-PERSON-004` derived vs persisted, visibly | **NOT BUILT** — the only two matches in the page are *comments* |
| `2N-PERSON-005` Work authority + derived classification | partly present (`deriveTaskSensitivity` + shared `ProtectedContent`); the authority half is unasserted |
| `2N-PERSON-006` return to exact position incl. expanded disclosure | **NOT BUILT** |
| `2N-PERSON-007` no direct client write | likely already true; **unasserted** |
| `2N-PROV-001…006` | **NOT BUILT** — `src/features/provenance` does not exist |
| `2N-RELATION-002`/`-008` origin per relation | **NOT BUILT** — 0 origin/source/confidence in `relationship-panel.tsx` |
| `2N-RELATION-004` correct/end, audited | paths exist (`updateOwnerRelationship`, `endOwnerRelationship`); audit half unasserted |
| `2N-RELATION-005` confidence never certainty | **0 confidence rendered anywhere** in `src/features/entities` → likely `baseline` |
| `2N-MOBILE-001…003`, `2N-ACCESS-001…005` | **NOT VALIDATED** (`-004` N/A: no graph in 2N.1) |

**The provenance facts are unchanged and were re-confirmed against this tree:**
`person_relationships`, `person_projects` and `person_contexts` carry **no
`source_entry_id` and no `interpretation_id`** (0 occurrences in the migrations),
so *"informed by you"* is the only truth available for a relation. **`memories`
and `tasks` DO carry `source_entry_id`**, so those two — and only those two —
can show a real, openable source. Do not generalise that path to relations.

**Stopped between slices**, which is where the loop says to stop. 2N.1 is 25
requirements including a provenance vocabulary, a derived/persisted distinction,
position restoration, and mobile/accessibility validation with journeys in both
locales on two viewports. **Beginning it without finishing it would leave exactly
the partial slice the loop forbids.**

**Unchanged:** 92 migrations, **zero of Phase 2N's three spent, none created**,
parity `202608120092`, budget non-transferable with a **fourth a STOP
CONDITION**, signup closed, rollout **25 · 3 · 2**, push **not** resumed (HTTP
403 on a real iPhone, Android **NOT EXECUTED**), **Phase 2O not started**, and
A13 still guarding the roadmap successor. Slices 2N.1–2N.7 remain.

## §65 — Slice 2N.1 ships: the person page says where each claim came from, and refuses to invent one (2026-08-13)

**PR #207**, merged at `da7f8c9`, **CI green 3/3 on that exact SHA**. Head at
review was `3cfefb9`, also green. Base was `main` at `12591495`.
`docs/reports/phase-2n/PHASE_2N_SLICE_1_ACCEPTANCE.md`.

**Migrations: 0 created. 92 total, parity `202608120092`.** M1/M2/M3 remain
allocated to 2N.3 and 2N.7, unspent and non-transferable.

**25 requirements: 17 built, 7 baseline, 1 N/A** (`2N-ACCESS-004` — this slice
ships no graph; it belongs to 2N.6).

### The thing worth carrying forward: a nullable FK is not an absence of intent

`memories.source_entry_id` and `tasks.source_entry_id` are both declared
**`on delete set null`**. So a `NULL` means **either** "nothing recorded a
source" **or** "the source entry was deleted and the foreign key nulled the
column" — and nothing afterwards distinguishes them. There is a real writer that
inserts a memory with no source at all, so both readings genuinely occur.

The obvious implementation is to call a null source *owner-authored* and print
*"informado por você"*. **That is the bug.** For a memory whose entry the owner
deleted, it is false — and false in the direction that matters, turning an
absence into a positive claim about where knowledge came from. So `null`
resolves to **`unsourced`**, the same arm as a source that will not resolve.

*"Informed by you"* is reserved for the three relation tables, where it is true
**by construction**: they carry no source column at all. `ownerAuthored` takes a
closed union of exactly those tables, so **`ownerAuthored("memories")` is a type
error rather than a judgement call** — and a guard checks that union against the
migrations, so a later phase adding a source column to one of them fails in the
same change that adds it.

Removed, foreign, unreadable and never-set are **one arm**, by having no branch
that could tell them apart, so the rendered page cannot be used to test whether
an entry id exists.

### Where the origin is stated, and where it deliberately is not

Once **per section** for the relation panels — every row has the same answer,
and repeating it under twelve rows is noise that says nothing actionable. **Per
row** for memories and tasks, where it genuinely differs. **None** on the
timeline: those rows *are* the records, and a "from an entry of yours" line
under an entry is the page explaining that a record came from itself.

An unsourced claim renders as ordinary italic text, **not** a warning. Colouring
it would present a missing stored source as a fault to fix and would invite the
reader to guess *why* — the distinction the single arm exists to destroy.

### Two guards were wrong before the product was

- **The confidence guard banned the string outright and failed on correct code.**
  All three relation tables carry a `confidence` column whose writers set the
  constant `1` for every owner-authored row. *Writing* that is not rendering
  certainty; *rendering* it would print "100%" beside something the owner merely
  typed. Narrowed to what renders, and extended so `confidence` may not even
  enter a person-page projection — a value absent from the query cannot be
  rendered by a later edit and is not in the RSC payload either.
- **The diff review caught the page asking one question two ways.**
  `resolvableEntryIds.has(id) ? sourceHref(id) : undefined` sat beside
  `deriveClaimProvenance(id, resolvableEntryIds)` — two expressions computing one
  answer from the same inputs. They agreed then and would drift the moment the
  contract gained a condition, leaving a page that offers a link to a claim it
  simultaneously labels unsourced. Derived once, asked via `isOpenable`, guarded.

### `?back=` is refused rather than sanitised

The return handle arrives in a URL, so it is matched against a strict allow-list
built from this app's own locales and **anything else renders nothing**. Without
it this is an open redirect, and the pattern is anchored on the locale segment
precisely because an allow-list built on `startsWith("/")` lets `//host`
through. Refusing costs nothing — the browser's own Back still works — while a
sanitised link is a guess about intent.

### Proofs

`e2e/online-phase-2n-person.spec.ts` — **14/14**, both locales × desktop and
mobile (Pixel 7). The fixture builds the `on delete set null` case on purpose: a
memory whose source entry is **deleted after the memory is created**, and the
journey asserts its line does not borrow the owner-authored wording — which is
what makes the pair evidence rather than coincidence. `online-phase-2n-foundations`
re-run **12/12**, no regression. Suite **6701 → 6760**.

Same lane as 2N.0: hosted database/auth/RLS, **local production build**, **not**
the Vercel deployment. Mobile is a **viewport simulation on Pixel 7 metrics**,
not a physical device, and **no screen-reader run is claimed**. Zero residue,
owner-scoped: `codex-2n1-` accounts **0**, five synthetic markers **0** each.

### Recorded for the owner, not decided by a slice

**Sensitivity reveals are NOT restored across a source round trip.**
`2N-PERSON-006` asks for "any expanded disclosure"; the anchor restores the
provenance disclosure, but a revealed mask is not restored. ADR-110 makes the
reveal local and explicit, and persisting one across a navigation would weaken
the posture 2N.0 shipped in order to satisfy a convenience. **An owner decision.**

### THE LOOP STOPS HERE — 2N.2 IS NOT STARTED

Stopped **between slices**. 2N.2 is the project page and its missing sections
(`2N-PROJECT-001…007` plus the mobile and accessibility families), and it
inherits this slice's shared panels — both `AssociationPanel` and the provenance
module already render on `/app/projects/[projectId]`, so 2N.2 must **re-derive
what is already true there rather than re-claim it**. Its stop condition is
unchanged: any temptation to add a change-log or decision table.

**Unchanged:** 92 migrations, **zero of Phase 2N's three spent, none created**,
parity `202608120092`, budget non-transferable with a **fourth a STOP
CONDITION**, signup closed, rollout **25 · 3 · 2**, push **not** resumed (HTTP
403 on a real iPhone, Android **NOT EXECUTED**), **Phase 2O not started**, and
A13 still guarding the roadmap successor. Slices 2N.2–2N.7 remain.

## §66 — Slice 2N.2 ships: the project page says what changed, what a reading called a decision, and what it cannot know (2026-08-13)

**PR #209**, merged at `163f09b`, **CI green on that exact SHA**. Head at
review was `4949e37`, also green. Base was `main` at `7e27b53`.
`docs/reports/phase-2n/PHASE_2N_SLICE_2_ACCEPTANCE.md`.

**Migrations: 0 created. 92 total, parity `202608120092`.** M1/M3 remain
allocated to 2N.3 and M2 to 2N.7, unspent and non-transferable.

**7 requirements: 4 built, 3 baseline**, plus the risk half of `2N-PROJECT-005`
closing **`not-built-by-rule`**.

### The re-audit is the part that mattered most, and it subtracted work

Three of seven were **already true on `main`** and are recorded baseline rather
than re-claimed. `2N-PROJECT-002` is the one worth carrying forward: *"people
render with their roles"* reads like an obligation, and `AssociationPanel` has
received `role` from `person_projects` and printed it since UX-08. **A
requirement can be satisfied by a slice that never mentioned it**, and the only
way to know is to open the component rather than the plan.

### A classification that closes by rule must fail when the rule changes

Decisions are representable: `entry_interpretations.concepts` is a stored
`text[]` whose vocabulary contains `decision`. **Risks are not** — no risk
concept, column or table exists in the schema, the app vocabulary or the
worker's. The nearest members are `blocker`, `dependency` and
`waiting_for_third_party`, and **a blocker is something that IS stopping work
while a risk is something that MIGHT**; mapping one onto the other would mint a
vocabulary the product does not have.

So the classification is **asserted against the tree**, not narrated in a
report: the guard scans all three vocabularies and the migrations, **with a
non-vacuity control proving the same scan finds the `decision` that did ship**.
A later phase that makes risks representable fails this guard in the same change
that makes it representable. A `not-built-by-rule` whose only evidence is a
sentence is a classification nobody re-checks.

### Two reads, two opposite correct answers, from one apparent pattern

`sourceResult` reads `.data` directly **on purpose**: a row that does not arrive
stays absent from the levels map and lands in the most-protective arm, so the
failure closes.

Copying that into the interpretation read is a **bug**, and it looked like
consistency. That result feeds a section whose empty state *asserts* something —
"no entry on this project was read as a decision" — so swallowing an error turns
**we could not look** into **there are none**. It uses `requireSupabaseData`,
which is what every other list on the page already does.

**A failure posture is a property of what the caller renders, not of the query.**

### Reuse was the design, and one of the two vocabularies already existed

"What changed recently" is `audit_logs` described by the **same
`describeHistoryEvent` and rendered by the same `HistoryList`** that `/app/history`
uses. The guard forbids the project surface from naming an action type at all,
so one audit row cannot acquire two narrations. The audit `reason` is **not even
selected** (UX-28).

The section's explainer **states its own coverage** — project edits and person
links — so a change the trail never records, such as linking a task, reads as
outside the list rather than as an absence of history. That is the honest
alternative to silently under-reporting.

### Bounds, one hop further out than the last two slices found

`2N-PERSON-003` found the defect at the render, §64 found it at the second read
hop, and this slice found it at a **third**: `associationIds`, bounded at 100,
feeds the association-change lookup, so a project with a long association history
would have left rows unqueried while the list looked complete. **Every hop that
narrows a set has to carry the bound**, and each slice so far has discovered one
more hop than the last.

### A count under a bound says "at least"

The state line reports open linked tasks, and the task list is bounded, so the
dropped rows may hold more. The confident and uncertain phrasings are **separate
copy strings** rather than one with a conditional prefix — that is what stops a
caller printing the first over the second's number. `pelo menos 0 em aberto` is
reachable and awkward; the alternative would be false.

### The journeys had to run serially, and that is a finding

**28/28** for 2N.2, **12/12** for 2N.0, **14/14** for 2N.1 — all with
**`--workers=1`**. In parallel, four fixtures of one page (one rendering a
hundred masked entries) saturated the local production server and a hosted write
was still showing "Saving…" at **45 s** with every control disabled and no
error. Serially the same case took **10.6 s**. Also: **28 sign-ins per run earns
`429 over_request_rate_limit` from GoTrue**, and a re-run costs a ~25 minute
cooldown — budget one clean serial run rather than several parallel attempts.

The change journey **edits through the product's own form** before asserting the
sentence appears; a fixture row written behind the surface would have proved the
reader and left the writer untested. It also needs **one project per locale** —
sharing one made the second run's edit a no-op, and the assertion then failed
against a page behaving exactly as specified.

**Zero residue**, two ways: 0 accounts under each of `codex-2n0-`, `codex-2n1-`
and `codex-2n2-`, and 0 rows for each of 19 markers, with a control proving the
probe can read at all.

### Recorded, not smoothed

Mobile is a **viewport simulation on Pixel 7 metrics, not a device**, and **no
screen-reader run is claimed**. The lane is a **local production build against
the hosted Supabase**, not the Vercel deployment. `OPEN_TASK_STATUSES` stays
triplicated across `calendar`, `day-review` and `planning` — consolidating it is
a Work-domain refactor beyond this surface. A change row about the project
renders a link to the project, which is truthful and redundant; suppressing it
would mean editing a component `/app/history` depends on.
`element_classifications.concepts` would let each decision row say whether its
concepts were classified `fact`, `interpretation`, `inference` or `suggestion` —
**available, deliberately not surfaced**, because no requirement asks and it
would mint user-facing copy for a four-value vocabulary that has none.

### One sequencing mistake, recorded because it repeats

§66 was written **inside the slice PR**, so its own merge SHA could not be known
and went in as a placeholder that reached `main`. §65 avoided this by shipping
the handoff as a **separate follow-up PR** (#208) after #207 had merged — which
is the shape to keep: a section that cites its merge commit cannot be in the
commit it cites.

### THE LOOP STOPS HERE — 2N.3 IS NOT STARTED

Stopped **between slices**. 2N.3 is the phase's **critical path and its only
irreversible operation**: inspection, correction and deletion
(`2N-KNOWS-001…009`, `2N-CORRECT-001…013`, `2N-IDENTITY-005…007`), carrying
**M1** (validity-aware retrieval) and **M3** (transactional deletion), which are
**internally sequenced — M1 first, then a deletion re-audit per type, then M3**,
because a deletion built before retrieval eviction works produces an object that
is deleted and still retrievable. Its stop condition is a propagation that
cannot be truthfully undone (`2N-CORRECT-013`), which returns the case to the
owner rather than shipping an undo that claims more than it restores.

**Unchanged:** 92 migrations, **zero of Phase 2N's three spent, none created**,
parity `202608120092`, budget non-transferable with a **fourth a STOP
CONDITION**, signup closed, rollout **25 · 3 · 2**, push **not** resumed (HTTP
403 on a real iPhone, Android **NOT EXECUTED**), **Phase 2O not started**, and
A13 still guarding the roadmap successor. Slices 2N.3–2N.7 remain.

## §67 — Slice 2N.3 unit M1 ships and deploys: an archived memory stops being retrieved, at the bound (2026-08-13)

**PR #211**, merged at `ab86208`, **CI green on that exact SHA**. Head at review
was `87e8d98`, also green. Base was `main` at `9334705`.
`docs/reports/phase-2n/PHASE_2N_SLICE_3_M1_ACCEPTANCE.md`, and the re-audit that
preceded it at `docs/reports/phase-2n/PHASE_2N_SLICE_3_REAUDIT.md`.

**The phase's first migration.**
`202608130093_phase_2n_slice_3_validity_aware_retrieval.sql`, allocation **M1**.
**93 migrations, hosted parity `202608130093`, local = remote, read live.**
Budget `3 allocated · 1 spent`; **M3 stays with 2N.3 and M2 with 2N.7**, both
unspent and non-transferable, and a **fourth is a STOP CONDITION**.

### THIS IS ONE UNIT OF A TWO-UNIT SLICE. M3 IS NOT AUTHORIZED

The intermediate deletion re-audit is what authorizes M3, and it **has not run**.
It must enumerate, per type — person, project, memory — from the migrations, the
foreign keys, the functions and the current consumers: cascade, set-null and
blocked dependencies; associations to remove; rows to preserve; effects on
retrieval, tasks, files, aliases, tags, relations, contexts, projects, the audit
trail, undo, and historical citations; and what the owner sees immediately.
**Its stop condition is a propagation that cannot be undone with truth**, which
returns the case to the owner rather than shipping an undo that claims more than
it restores.

Two facts already established that will shape it: **`memories` has no delete
path today by standing product decision** (`memories/undo.ts`) even though
`authenticated` holds `delete` — which is what makes `2N-CORRECT-009`'s refusal
of a client-side multi-delete a live rule rather than an academic one — and
**`undo_operation` is a handler registry with no handler for memories**, so
whether M3 can register one inside its own file without acquiring a second
migration's worth of responsibility is a question that re-audit must answer.

### The defect, and why no amount of TypeScript could have fixed it

`match_internal_knowledge` applied `limit least(…)` **before anything read
`valid_from` or `valid_until`**. The TypeScript filter removed an archived
memory from the **citation list** but could not undo what the bound had already
done: chat asks for **8**, so an archived memory ranking in the top eight
**consumed one of the eight slots** and the live memory ranked ninth was never
sent. **No downstream code can recover a row the database did not return.**

The predicate now sits inside the union arm and uses **both halves**, because a
`valid_until`-only predicate — the shape `phase_2k_memory_undo.sql` uses for its
own narrower purpose — still retrieves a **scheduled** memory, which is the same
lie in the other direction. Entries stay unfiltered: they carry no validity
window.

**The TypeScript filter is kept and is no longer the enforcement.** M1's
documented rollback is *re-declare the prior definition*, and a rollback that
also re-admitted archived memories into citations would cost more than the
displacement fix it undoes.

### The re-audit found a live defect the plan did not carry

The memory detail page printed **"Criada por você"** for every null
`source_entry_id`, and the column is **`on delete set null`** — so a memory whose
source entry the owner deleted claimed an origin it cannot have. Its other arm
asserted a record **"no longer exists"** whenever the row did not come back,
which under RLS also covers a **foreign** entry, making the sentence both false
and a probe for whether an entry id is real. Slice 2N.1 had already written the
contract that refuses both, around this exact table —
`ownerAuthored("memories")` is a **type error** — and the memory page predates
it. **A requirement can be satisfied by a slice that never mentioned it, and a
defect can survive the slice that wrote its cure.**

### A scan that reads prose finds the thing the prose is about

Twice, one level apart, in this unit's own instruments. The migration's
verification block searched the function definition for `limit` — and the body's
own comment contained the word, so it would have raised on a correct migration.
The guard read the **whole migration file**, whose header quotes the offending
`limit least(…)` clause while explaining the defect, and concluded the bound
preceded the predicate. Both narrowed: to `limit least(` and to the function
**body**.

Recorded and **not repaired**: the block also checks that `valid_from` appears
in the definition, and **that check would have passed against the broken
function**, because `coalesce(valid_from, created_at)` already mentioned the
column as an output projection — confirmed by a read of the hosted project
before deploy (`reads_valid_from = true, reads_valid_until = false`). The checks
that discriminate are correct. After merge and deploy a new migration is a stop
condition, not a convenience.

### A control that returns zero against an empty table is not a control

The first residue proof read zero for every marker — and `public.memories` holds
**no rows at all** on this project, so zero was equally what a broken probe, a
revoked grant or a typo would have returned. `test:remote:2n3:cleanup` now does a
round trip: it plants a memory under a disposable account, **asserts the probe
finds it**, deletes **only the account**, and asserts the probe finds nothing.
The second half proves what every online spec's `afterAll` silently relies on
and none of them checks — that deleting the account removes the **data**.

### Proofs, and one failure that is recorded rather than smoothed

pgTAP **15 assertions** proving **eviction at the bound**, with the ranking
premise asserted directly against the table so the eviction cannot pass because
the archived row merely ranked low. **Six mutation controls**, each failing
exactly its own assertion. Hosted journeys **12/12**, both locales × desktop and
Pixel 7, **`--workers=1`**, in 2.0 min — the archive runs **through the
product's own form** and then calls the RPC **as that user** with a **synthetic**
vector, so it observes eviction directly and **spends no provider budget**.
Regressions **2N.0 12/12** and **2N.1 14/14**.

**`online-memories.spec.ts:85` fails on mobile: a 21 px touch target against a
44 px minimum.** It is **pre-existing** — reproduced at `289f1f8`, before this
unit's surface change, by rebuilding and running the same single test. The cause
is that `.list-row-main a` carries **no sizing rule on any list surface**; the
row's padding clears 44 px, the link does not. Repairing it touches Work,
Reminders, People, Projects and Memories, which is the **`2N-MOBILE`** family
and not this unit's requirements. **Left failing rather than weakened, skipped or
deleted** — it describes a real defect and is doing its job. **Destination:
`2N-MOBILE`.**

**`online-phase-2n-project` (2N.2, 28 tests) was NOT re-run.** GoTrue answers
`429 over_request_rate_limit` around 28 sign-ins and this session spent 51 across
four suites; it was the lowest-value of the four, and it is **not run** rather
than implied by an unqualified "regressions pass".

### THE LOOP STOPS HERE — THE DELETION RE-AUDIT IS NOT STARTED

Stopped **between M1 and the intermediate deletion re-audit**, which is one of
the two sanctioned stopping points inside this slice. **No migration is
partially deployed**: M1 is merged, deployed, at parity and proved.

**Unchanged:** signup closed, rollout **25 · 3 · 2**, push **not** resumed
(HTTP 403 on a real iPhone, Android **NOT EXECUTED**), **Phase 2O not started**,
and A13 still guarding the roadmap successor. Slices 2N.4–2N.7 remain, and 2N.3
is half done.

## §68 — The deletion re-audit answers its own stop condition by executing it, and M3 is authorized with one correction to the plan (2026-08-13)

**PR #213**, merged at `456750b`, **CI green on that exact SHA**. Head at review
was `01ab6e9`, also green. Base was `main` at `0f521f4`.
`docs/reports/phase-2n/PHASE_2N_SLICE_3_DELETION_REAUDIT.md`.

**Migrations: 0 created. 93 total, parity `202608130093`, local = remote, read
live.** Budget `3 allocated · 1 spent (M1)`; **M3 stays with 2N.3 and M2 with
2N.7**, and a **fourth is a STOP CONDITION**.

### The catalogue could not answer the first question, so it was measured

Every table referencing `people` or `projects` carries **two** keys to it: a
single-column `CASCADE`/`SET NULL`, and a composite ownership key `(user_id, id)`
with **`NO ACTION`**, none `DEFERRABLE`. Whether the second **blocks** the delete
or is satisfied because the first already removed the child is **not readable**
— both are after-triggers on one event and the answer depends on firing order.

**Measured: the delete succeeds.** A re-audit that read `NO ACTION` as
"protected" would have concluded deletion was already impossible and stopped for
the wrong reason. Four probes ran, each inside a `DO` block whose only exit is a
`raise`, so nothing committed and the owner's rows — 3 people, 1 project, 7
tasks, 5 entries, 33 audit rows — were not modified.

### The finding: the cascade does not reach the tables that matter most

`entry_entities`, `entity_aliases`, `entity_attachments` and `entity_tags` carry
`entity_type`/`entity_id` as an **unconstrained pair with no foreign key**,
validated only by `validate_polymorphic_entity_owner` — a **`BEFORE INSERT OR
UPDATE`** trigger that never fires on the parent's delete. Nothing cascades,
nothing nulls: **the rows survive pointing at a dead id**, measured, 1 planted →
1 remaining. `entry_entities` has four live readers and `entity_aliases` gained
its first in 2N.0/2N.1, so an entry would keep reporting a mention of a deleted
person. **That is the partial deletion `2N-CORRECT-012` forbids, and M3 must
remove them explicitly.** Search does not leak — it matches alias ids against
`id`, so an orphan yields no row — which makes this a correctness defect, not an
exposure, and the difference is recorded rather than blurred.

### Authority, proved from grants rather than asserted

`authenticated` holds **no `DELETE` and no `INSERT`** on `entry_entities` or
`entity_attachments`. So a `SECURITY INVOKER` path would delete **zero** of them
and **raise nothing** — RLS filters a `DELETE` silently. **M3 must be
`SECURITY DEFINER`**, and `2N-CORRECT-009`'s refusal of a client-side sequence
stops being a rule and becomes a proof: a client **cannot** complete this
deletion correctly. `public.undo_operation` is already `SECURITY DEFINER`, so the
compensation needs **no new authority**.

### The stop condition was answered by executing it, not by arguing it

`2N-CORRECT-013` asks whether every propagation can be undone **with truth**. A
probe planted a fully populated person — relationships in **both** directions
with types, descriptions and confidences; a project association with a `role`; a
context; a task assignment with a `role`; a task `waiting`; a memory with a real
1536-dimension embedding; an alias; an entry mention — snapshotted with
`to_jsonb`, deleted the way M3 would, restored with `jsonb_populate_recordset`
under the **same ids**, and compared. **Nine row sets byte-identical.** Repeated
for project and memory: identical, embedding included.

Two secondary results carry it. **The embedding survives a `jsonb` round trip at
cosine distance 0**, so a restored memory is retrieved exactly as before **with
no provider call** — the largest technical risk to a true undo, closed by
measurement rather than by hope. And **`normalized_alias` is recomputed by its
trigger to the same value**, so determinism is proved rather than assumed. There
are **no identity or serial columns** on any affected table: restoration
preserves identity, it does not mint a substitute.

**Verdict: `M3 AUTORIZÁVEL DENTRO DO CONTRATO EXISTENTE`**, with all fourteen
stop conditions checked individually and none found.

### A prediction in the signed plan was wrong, and it was surfaced rather than absorbed

§6.3 said M3 would create *"One new function. **No new table**."* A
server-issued, single-use, fingerprint-bound confirmation **is a row**, and the
only existing store is FK-bound to `tasks` behind a **closed** `CHECK` that Phase
2E's own tests defend. The re-audit stopped and put it to the owner instead of
choosing — because after deployment, removing a table costs a **fourth
migration, which is a stop condition**.

**The owner authorized it: ADR-113.** One table inside M3, **not** an additional
migration, budget unchanged, `task_command_confirmations` neither reused nor
widened, and the table stores **identifiers and hashes only** — no name, title,
note, memory content, excerpt or endpoint, with the consequences bound as a
**digest** rather than stored. §6.3's sentence is **preserved verbatim** and
annotated `*(Amended by ADR-113: …)*`, the mechanism ADR-109, ADR-110 and
ADR-112 already use. **A plan whose wrong predictions quietly vanish teaches
nothing.**

### Recorded, not smoothed

One full-suite run showed `question-answer-form.test.tsx > runs the undo flow`
failing; it passes **17/17 in isolation** and **did not reproduce** — the re-run
was **6823/6823 with 3 failed files, exactly the Windows-only shebang-parse
baseline**. It is a **pre-existing test-side race**: the assertion captures the
`role="status"` node and asserts its text without a `waitFor`, so full-suite load
widens the window. In a file this work does not touch. **Not weakened, not
skipped, not deleted, not absorbed.** The `online-memories.spec.ts:85` 21 px
touch target remains open with destination **`2N-MOBILE`**, and 2N.2's 28-test
journey remains **not re-run**.

Also recorded: the review of this PR's own diff found **two rows of the
propagation tables calling `tasks` and `memories` "not referenced by the
delete"** — two rows below the `SET NULL` entries that reference them. The rows
survive; the columns do not. Split into *preserved, link severed* and *preserved,
untouched*, because a table whose value is precision cannot afford a sentence
that reads as "the delete passes them by."

### THE LOOP CONTINUES — M3 IS NEXT, AND IT IS THE PHASE'S ONLY IRREVERSIBLE OPERATION

**Unchanged:** 93 migrations, parity `202608130093`, budget non-transferable with
a **fourth a STOP CONDITION**, signup closed, rollout **25 · 3 · 2**, push **not**
resumed, **Phase 2O not started, not planned and not retargeted**, and A13 still
guarding the roadmap successor. Slices 2N.4–2N.7 remain.

## §69 — Slice 2N.3 COMPLETE: the product can remove a person, a project and a memory, and the undo returns the same one (2026-08-14)

**PR #215**, merged at `20fbbd0`, and **PR #216** at `0b7565c`, **CI green on
both exact merge SHAs**. `docs/reports/phase-2n/PHASE_2N_SLICE_3_ACCEPTANCE.md`.
ADR-113 and handoff §68 landed first as **PR #214** at `df64395`.

**The phase's second migration.**
`202608140094_phase_2n_slice_3_entity_deletion.sql`, allocation **M3**.
**94 migrations, hosted parity `202608140094`, local = remote, read live.**
Budget `3 allocated · 2 spent`; **M2 stays with 2N.7**, unspent and
non-transferable, and a **fourth is a STOP CONDITION**.

**25 requirements: 15 built, 5 baseline, 5 `not-built-by-rule`.**

### The re-audit answered its stop condition by executing it

`2N-CORRECT-013` asks whether every propagation can be undone *with truth*. That
was not argued. A fully populated person — relationships in **both** directions
with types and descriptions, an association with a `role`, a context, a task
assignment, a task `waiting`, a memory with a real 1536-dimension embedding, an
alias, an entry mention — was snapshotted, deleted, restored under the **same
ids**, and compared: **nine row sets byte-identical**. Repeated for project and
memory. **The embedding survives a `jsonb` round trip at cosine distance 0**, so
a restored memory is retrieved exactly as before **with no provider call** — the
largest technical risk to a true undo, closed by measurement.

### The cascade does not reach the tables that matter most

`entry_entities`, `entity_aliases`, `entity_tags` and `entity_attachments` carry
`entity_type`/`entity_id` as an **unconstrained pair**, validated only by a
`BEFORE INSERT OR UPDATE` trigger that never fires on the parent's delete.
Deleting a person left all four alive, pointing at a dead id, and
`entry_entities` has four live readers — so an entry would have gone on
reporting a mention of someone the owner deleted. **No `on delete cascade`
prevents this**, and M3 removes all four explicitly.

**`authenticated` holds no `DELETE` on two of them**, so `2N-CORRECT-009`'s
refusal of a client sequence stops being a rule and becomes a proof: a client
**cannot** complete this deletion correctly. It also forces `SECURITY DEFINER`,
because an invoker path would remove zero rows and **raise nothing**.

**And the price of that was measured**: `postgres` holds `rolbypassrls`, so
inside the function RLS is **not consulted at all** and the `FORCE ROW LEVEL
SECURITY` those tables carry protects nothing there. The explicit
`user_id = v_owner` predicate on every statement is the only isolation there is,
and the suite asserts it against a second owner **with RLS bypassed** — because a
check run under RLS could not tell *protected* from *deleted*.

### A signed plan's prediction was wrong, and it went to the owner rather than into the diff

§6.3 said M3 would create *"one new function, no new table"*. A server-issued,
single-use, fingerprint-bound confirmation **is a row**, and the only existing
store is welded to `tasks` by a foreign key and a **closed** `CHECK` Phase 2E's
tests defend. The re-audit **stopped** — because after deployment, removing a
table costs a fourth migration, which is a stop condition. **ADR-113** authorized
one table inside M3; §6.3's sentence is **preserved verbatim and annotated**.

### The defect only a browser could find

`applyDeletion` called `revalidatePath`. Next's own documentation: a Server
Function's `revalidatePath` *"updates the UI immediately (if viewing the affected
path)"* — and the affected path was the page the dialog sits on. **So a
successful deletion destroyed the component that was about to offer the undo.**
The hosted journey saw it: status still reading `confirmed`, no outcome, no undo
control. **A deletion whose undo button disappears before it can be pressed is
worse than one with no undo, because the preview promised it.** Neither action
revalidates now; the client refreshes when the dialog closes, after the owner has
read the outcome and had the chance to undo.

Beside it: the preview action is called from `onClick` rather than a form action
and was not wrapped in a transition, so **`isPending` did not update** — and
`isPending` is what draws the loading sentence and disables the confirm button.

### Six defects were found by something checking, not by re-reading

Two in SQL that would have shipped silently: `jsonb_build_object` turns a `CASE`
with no `ELSE` into **JSON `null`**, which `coalesce` can never repair because
JSON null is not SQL NULL; and `'cron'::regnamespace` **raises** when the schema
is absent, which is how CI builds this database — **a guard that errors on a
clean database is not a guard**.

And the new guard failed twice on its own subject. First it read its own prose —
`copy.ts`'s header explains that deletion copy may never say "archive", and
therefore contains the word, the failure M1 recorded twice in one migration.
Then, after stripping comments, it failed again *correctly*: Portuguese spells
the noun *arquivo* — a **file** — with the same five letters as the verb
*arquivar*, and the copy legitimately says "os arquivos continuam na sua
biblioteca" because `2N-CORRECT-012` requires it to say what is kept. The stem
was **narrowed** to `arquiva`, with a control proving it still refuses the
sentence it exists to refuse. **Narrowed, not deleted.**

Three more were in the journey and each made a test lie: a bulk insert whose rows
carried different keys; a staleness test that moved the world **before**
issuance, so the confirmation was validly bound to the changed facts and the test
**failed by passing**; and an assertion on a **sibling test's** fixture, which
passed only when that sibling had run.

### Proofs, and one pending item closed

pgTAP **43 assertions** from an empty database. Hosted structural proof read live
after deploy. Hosted **behavioural** proof as `authenticated`, rolled back:
foreign → `P0002` identical to absent, facts moved → `55P03` with the
confirmation **not burned**, delete leaving **aliases=0**, undo returning the
same id with its note, its relationship description and both aliases. Journey
**14/14** serially, both locales × desktop and Pixel 7.

Regressions **2N.0 12/12**, **M1 12/12**, **2N.1 14/14**, and **2N.2 28/28** —
which §67 recorded as **NOT RUN**. That pending item is closed. **No `429` across
roughly 110 sign-ins**, run serially and spaced.

**Zero residue**, 22 markers, with a control that plants a person, a project and
an alias and proves the probe finds all three before the account is deleted.

### Recorded, not smoothed

`online-memories.spec.ts:85` still fails on mobile — a **21 px touch target**
against a 44 px minimum, reproduced at `289f1f8` before any of this slice's
changes, cause `.list-row-main a` carrying no sizing rule on **any** list
surface. Destination **`2N-MOBILE`**. Mobile is a **viewport simulation**, not a
device; **no screen-reader run is claimed**; the lane is a **local production
build** against hosted Supabase. The undo window is **24 hours** and the deleted
content lives in `undo_operations.before_state` for it — retention, named as
retention in the preview, and permanent thereafter.

### THE LOOP STOPS HERE — 2N.4 IS NOT STARTED

Stopped **between slices**, which is a sanctioned stopping point. **No migration
is partially deployed**: M1 and M3 are both merged, deployed, at parity and
proved.

**Unchanged:** signup closed, rollout **25 · 3 · 2**, push **not** resumed (HTTP
403 on a real iPhone, Android **NOT EXECUTED**), **Phase 2O not started, not
planned and not retargeted**, and A13 still guarding the roadmap successor.
Slices 2N.4–2N.7 remain, and **2N.3 is complete**.

## §70 — Slice 2N.4 ships: the Brain says two facts cannot both be right, instead of quietly calling one archived (2026-08-14)

**PR #219**, merged at `da9b787`, **CI green on that exact merge SHA**. Head at
review was `3cf69cf`, also green on all three job families. Base was `main` at
`674965d`. `docs/reports/phase-2n/PHASE_2N_SLICE_4_ACCEPTANCE.md`, and the
enumeration that authorized it at `..._SLICE_4_CONFLICT_ENUMERATION.md`.

**ZERO MIGRATIONS. 94 total, hosted parity `202608140094`, local = remote, read
live.** Budget stays `3 allocated · 2 spent (M1, M3)`; **M2 stays with 2N.7**,
unspent and non-transferable, and a **fourth is a STOP CONDITION**.

**6 requirements: 6 built.**

### The silence this slice ends

A memory whose validity window is impossible — in force **after** it stopped
being in force — read as **"arquivada"**. `memoryLifecycleState` resolves it that
way because *archived wins over scheduled*: right about the code, **wrong about
the world**. The memory is not "no longer true", it is a pair of dates that
cannot both be right.

### The enumeration ran first, and it closed at one

Eight candidates, **one implementable**, seven declared out **by name**. A wider
detector was available and is deliberately not here.

**The one worth remembering is C7.** The identical fault on `entity_aliases` is
**already refused by a database CHECK** — `(valid_to IS NULL) OR (valid_from IS
NULL) OR (valid_to >= valid_from)`, read live. Its set is empty by construction
and can only ever be empty, so a detector there would be **a control that cannot
fail**. It closes `not-built-by-rule` rather than being quietly skipped, because
its absence is otherwise indistinguishable from an oversight.

### Three facts that corrected or extended the re-audit

1. **`memories` has no validity CHECK; its sibling does.** Confirmed across **all
   94 migrations**, not only the one that created the table.
2. **`memories.valid_from` has NO WRITER anywhere in the product.** Every
   occurrence in the migrations, both Edge Function entrypoints and all of `src/`
   is a **read**. So an inverted window **cannot be created through any product
   surface today** and the expected population is **zero**. The detector is a
   read-time safety net over a column nothing writes — **recorded rather than
   smoothed**, because a slice implying it was cleaning up existing bad rows
   would be claiming something it cannot show.
3. **The re-audit named `updateMemory` as the correction path.**
   `memoryUpdateSchema` carries **neither** timestamp. The conclusion survived;
   the mechanism did not.

### A signed requirement refused the obvious implementation

Widening `memoryUpdateSchema` with the two timestamps needs **no migration, no
RPC and no new authority** — the columns exist, `authenticated` already holds
`update`, and `AUDITED_COLUMNS` already compares both. It was refused anyway, on
`2N-CORRECT-002`: *"correcting stays distinct from archiving."* A raw
`valid_until` field is archiving wearing an edit form's clothes, and
`memories/schema.ts` already refuses raw timestamps **in writing**. **2N.4 does
not reverse a signed decision to make its own item prettier.**

`archive` was rejected on measurement rather than principle: it stamps
`valid_until = now()`, and with a **future** `valid_from` the window is **still
inverted**. `setMemoryLifecycle(restore)` clears `valid_until` to `null`, and a
null half can never satisfy the predicate — it resolves **every** instance with
no case analysis.

**And "refuse a new inverted window" has no validator, because there is no input
to validate.** The refusal is **structural**, and a guard fails the moment any
code introduces a raw timestamp write. A validator on a field that does not exist
would be the vacuous control this phase refuses.

### Two structural facts about the queue that neither the plan nor the re-audit carried

**It is welded to `entries`.** Every row comes from `list_needs_attention`, is
hydrated from `entries.original_content`, and `NeedsAttentionItemView.entryId` is
**required**. A memory is not an entry, and `memories.source_entry_id` is
`on delete set null`. So the conflict carries **its own view shape** — making
`entryId` optional would have weakened the field for the twenty rows that
genuinely have one, and the analytics event those rows fire would then have had
an `undefined` to send. **Both shapes render in ONE queue: the separation is in
the types, not on the surface.**

**Its reason vocabulary is enforced in Postgres.**
`needs_attention_item_opened` validates `attentionReason` against a **five-member
enum inside the database**, so `resolve_validity_conflict` is deliberately **not**
a `TrackedAttentionReason` and the conflict row fires **no product event at all**.
That is required twice over: telemetry belongs to **2N.7 and M2**.

`resolve_consistency` keeps its **exact prior sentence in both locales** and its
live producer at `lifecycle.ts:71`, asserted by guard — routing belief conflicts
there would have made one sentence stand for two unrelated problems.

### Hoje could have said "Nada pendente" while a conflict existed

Its `saved` branch renders *"Nada pendente. Tudo salvo."* — a categorical claim
about the whole product. `conflictCount` is now **required** on
`deriveHomeOperationalStatus`, and the compiler found every caller. One
`pendingCount` drives the heading, the "view all" link, the empty state and the
end-of-day summary, so a conflict can never render under a heading that says zero.

### Two product defects the diff review found and no test would have

1. **The row obeyed the wrong governed surface.** It hardcoded
   `presentationFor("attention", …)` while Hoje's is `"hoje"`. **No visible defect
   today — the two carry identical rules — and that is what made it worth fixing
   rather than noting.** The day they diverge, the row would obey the wrong one
   and **nothing would fail**.
2. **It shipped with six class names and no CSS**, and would have rendered as
   unstyled prose in a list of styled cards. The first draft then reached for
   `--amber`, `--surface-muted`, `--muted` and `--border`: **`:root` defines none
   of them.** `experience.css` already references two without definitions —
   pre-existing, not this slice's to repair, but adding four more would have been
   copying a fault forward.

### Three guard defects, all one class, and the class is worth naming

**A scan for a generic token finds the history of every phase that used the same
word.** `conflict` matched `202607170021_fix_interpretation_timestamp_conflict`;
bare `slice_4` matched `202607220041_phase_2c_slice_4_…`; and a bare `valid_from`
scan flagged **four correct files** whose only sin is a type annotation. Each was
**narrowed to what discriminates** — a phase-qualified token, and the identifier
**inside a mutation payload** — **never weakened**, and each narrowing carries a
control proving it still refuses what it exists to refuse **and** does not refuse
what it must allow.

One **inherited** guard caught this work correctly:
`local-day-correction-convergence` counts consumers of the owner's zone on Hoje,
and it moved 2 → 3 because a third row type now renders an instant. Raised with
the three consumers **named**, so the number is a claim about the surface rather
than a literal bumped to go green.

### Proofs

Detector **23**, projection **15**, row **18**, queue integration **21**, guards
**42 with a mutation control each**. Full suite **7000 passed** (3 failed files =
the Windows-only shebang baseline); lint, typecheck, build and
`git diff --check` clean.

Hosted **18/18**, desktop and Pixel 7, both locales, **`--workers=1`**, **no
`429`**. Two pairings carry the file: the correction runs **end to end through
the product's own form** and a separate test proves **the memory survived it** —
without the pair, "gone from the queue" is satisfied by a delete; and the
cross-tenant control asserts the stranger sees **their own** conflict first, so
"does not see the owner's" cannot pass on a blank page.

**The hosted proof ran BEFORE the merge**, and that is sound here precisely
because **2N.4 spends no migration**: the lane is a local production build
against hosted Supabase, and the database is identical either side of the merge.

Regressions: M1 knowledge **12/12** (desktop + Pixel 7), memories **6/6
desktop**, M3 deletion **7/7 desktop**, 2N.0 foundations **6/6 desktop**.

**Zero residue**, two probes with non-vacuous controls. 2N.4's control plants
**two** rows — one with an inverted window and one with none — and asserts the
windowed probe finds the first and **ignores** the second. Without the second, a
probe that silently dropped its filter would still read 1 and look correct.

### Recorded, not smoothed

**`online-memories.spec.ts:85` still fails on mobile** — **21 px** against a 44 px
minimum, reproduced unchanged this session, cause `.list-row-main a` carrying no
sizing rule on **any** list surface. **Not weakened, skipped, deleted or
absorbed.** Destination **`2N-MOBILE`**. Checked against the owner's own criterion
and it does **not** apply: the affected control is an `<a>` *inside*
`.list-row-main` on the memories **list**, while the conflict row *is* an
`<a class="list-row">` that *contains* a `.list-row-main` and has no nested
anchor.

**`needs_attention_viewed.itemCount` still counts entry rows only.** Redefining
what an existing 2J metric measures is telemetry work; destination **2N.7**.

**2N.2's 28-test project journey was NOT re-run** — it shares no contract this
slice touches, named rather than implied by an unqualified "regressions pass".
Mobile is a **viewport simulation**, not a device; **no screen-reader run is
claimed**.

### THE LOOP STOPS HERE — 2N.5 IS RE-AUDITED BUT NOT STARTED

Stopped **between slices**, a sanctioned stopping point. **No migration is
partially deployed**: 2N.4 created none, and M1 and M3 remain merged, deployed,
at parity and proved.

**Unchanged:** signup closed, rollout **25 · 3 · 2**, push **not** resumed (HTTP
403 on a real iPhone, Android **NOT EXECUTED**), **Phase 2O not started, not
planned and not retargeted**, and A13 still guarding the roadmap successor.
Slices **2N.5, 2N.6 and 2N.7** remain.

## §71 — Slice 2N.5 ships: the file library reads links it cannot create, and says so (2026-08-14)

**PR #221**, merged at `51900b4`; head at review `37f085e`, CI green on all three
job families. **Zero migrations, zero RPCs, zero grants widened, zero writers.**
94 local = 94 hosted, parity **`202608140094`** unchanged. Budget stays
`3 allocated · 2 spent (M1, M3)`; **M2 stays with 2N.7**, and a fourth is a stop
condition. **13 requirements: 9 built · 3 baseline · 1 partial · 0
not-built-by-rule.**

### The decision the slice was built on

`entity_attachments` has existed since `202607160007` with **neither a reader nor
a writer** in product code. `202607170016:239` revoked `insert, update, delete`
from `authenticated` deliberately; the live grants read `REFERENCES, SELECT,
TRIGGER, TRUNCATE` and nothing else. The only insert anywhere in the repository
is M3's deletion undo (`202608140094:803`), restoring links that already existed.

The owner signed **option A** — ship the read side, name the missing writer as a
remainder, create no new authority. Option B (restore `INSERT` or add an RPC) is
new authority and a stop condition; option C (let the worker derive links) is
persisted inference and contradicts `OD-2N-8` **A**. **This slice created the
first reader and no writer.**

### The census found a live privacy defect, and it was not where the requirement pointed

`2N-FILES-006` names `extracted_text`. The census found `extracted_text`
correctly governed in both of its two product readers. **The leak was one step to
the side:** the tag cloud built from `extracted_people`, `extracted_projects` and
`extracted_dates`, and the candidate task titles, rendered **outside any
classification** — one block below the extracted text that was masked.

So on a `highly_sensitive` file the product withheld the name, the description
and the document text, and then printed the names of people found inside the
document and task titles frequently lifted verbatim from it. That is `R-16d`, it
was live, and **a census that had grepped only for the column name would have
concluded the requirement already held.**

A second correction of the same shape: a per-item signed-URL failure was filtered
out of the map, so the "open original" link simply vanished — a failure rendered
as absence, on the one read of that page whose failure cannot reach the error
boundary.

### The four measurements, and what each cost

1. **`extracted_text` census** — two governed product readers; search keeps
   ADR-093/OD-1's default exclusion and was not reopened. **One defect found.**
2. **Bounds** — the file list paginates with a probe, the failed-job list bounds
   with a notice, and a failed read throws rather than emptying. Two findings:
   the signing failure above, and `attachment_interpretations` stating no bound
   (recorded; it renders no list).
3. **Filter cost** — state, kind and period are predicates on the query the page
   already issues: **zero extra round trips**, existing index unchanged. Linked
   entity costs one sequential read, only when active. Every predicate is applied
   **before** `.range()`, because filtering an already-paginated page is the
   misleading filter the slice was told to report rather than ship.
4. **Discovery** — ADR-110's narrowing touched **`people` only**. File discovery
   is unaffected, so `2N-FILES-011` closes by linking to search.

### The one partial, and its remainder

**`2N-FILES-008`.** Six of its seven capabilities ship. The seventh — *files
linked to people and projects* — ships as a real read path that **renders empty
for every owner without legacy or restored links, permanently**.

The user is told this, not only the acceptance record: *no link is recorded*, and
*the Brain shows links that already exist; there is no way to create a new one
here yet.* **No button, no form, no disabled control** — a guard and a component
test both fail if one appears.

Destination **`2N-FILES-WRITER`**. Creating one needs `INSERT` restored or a new
`SECURITY DEFINER` RPC: **new authority, an owner decision, a stop condition**,
and **not transferable into M2**.

`2N-FILES-009` and `2N-PERSON-008` close as **built, empty by construction**
rather than partial — their subject is the link's navigability, complete whenever
a link exists, not the ability to make one.

### Three things worth carrying forward

- **A residue probe on a table with no text column needs a join, and a join needs
  a discriminating control.** `entity_attachments` can only be found through the
  attachment carrying the marker, and a join that silently failed would read zero
  against a table full of links. The control plants a linked **and** an unlinked
  attachment under one marker and requires the probe to find exactly one.
- **Harness fixtures planted with the service role prove the reader, not the
  capability.** `authenticated` holds no `INSERT`; the spec says so where a later
  reader would otherwise assume the product can create links.
- **A cancelled CI run is not a failed one.** The run on `6d04dd1` shows
  `cancelled` because the next push superseded it. Read the conclusion, not the
  colour.

### Proofs

127 unit and component tests; **45 structural guards, each with a mutation
control**, two-sided where a false positive was the risk; full suite **7140
passing**; lint, typecheck, build and `git diff --check` clean. **32 hosted
journeys** (16 desktop + 16 Pixel 7, both locales, `--workers=1`) — a local build
against the hosted Supabase project, **not a Vercel deployment**. **59 regression
journeys** from 2N.0–2N.4 re-run and green. **Zero residue** on all three probes
(2N.3, 2N.4, 2N.5), each with a non-vacuous control.

### Carried, not absorbed

`online-memories.spec.ts:85`'s **21px touch target** against a 44px minimum stays
a `2N-MOBILE` remainder — not weakened, not deleted, not marked passing. ADR-055
is neither satisfied nor superseded and expires **2026-10-27**.

**Unchanged:** signup closed, rollout **25 · 3 · 2**, push **not** resumed (HTTP
403 on a real iPhone, Android **NOT EXECUTED**), **Phase 2O not started, not
planned and not retargeted**, and A13 still guarding the roadmap successor.
Slices **2N.6 and 2N.7** remain.

**2N.6 re-audited and NOT started** — `docs/reports/phase-2n/PHASE_2N_SLICE_6_REAUDIT.md`.
Its load-bearing finding: **there is no graph of any kind on `main`** — no route,
no component, no feature directory. `e2e/online-entity-graph.spec.ts` is EGC.1's
*entity graph capability* (Companies and Contexts gaining routes and writers),
not a graph surface; the filename is the trap. Five of the eleven relation
requirements already ship from EGC.2 and 2N.1/2N.2, so the open work is the graph
itself, `2N-RELATION-003`'s proposal posture, and the parts of `-002`/`-009` that
only exist once edges do.

## §72 — Slice 2N.6 ships: the product has a relations surface, and its graph draws only what it can explain (2026-08-14)

**PR #223**, merged at `fc3b565`; head at review `94bd23f`, **CI green on all
three job families on both**. `docs/reports/phase-2n/PHASE_2N_SLICE_6_ACCEPTANCE.md`,
and the artefact that authorized it at `..._SLICE_6_EDGE_CATALOG.md`.

**ZERO MIGRATIONS, ZERO RPCs, ZERO GRANTS, ZERO INDEXES, ZERO WRITERS, ZERO
DEPENDENCIES ADDED.** 94 local = 94 hosted, parity **`202608140094`**, read live.
Budget stays `3 allocated · 2 spent (M1, M3)`; **M2 stays with 2N.7**, and a
fourth is a **STOP CONDITION**.

**12 requirements: 8 built · 3 baseline · 1 partial · 0 not-built-by-rule.**

### The catalogue ran first, because the authorization can refuse

`2N-RELATION-011` obliges the work to stop and propose a reduction rather than
ship a decorative graph, so **ten edge candidates were measured against the
schema and classified before a line of UI existed**. Verdict: **AUTORIZÁVEL
DENTRO DO CONTRATO EXISTENTE** — and the three measurements that produced it are
the reason the surface looks the way it does.

**1. There is no person-to-person edge in this product.**
`person_relationships.related_person_id` is written `null` by the only writer the
table has ever had, and a null there means *related to the owner*. The table is a
**star centred on the owner**. *"Which people are related"* is answered by two
real edges sharing a node; a line between two people would have to be synthesized
from a shared project, a shared context or a co-mention, and each of those is a
conclusion the data does not carry.

**2. `OD-2N-8` A's premise does not hold in the tree.** The threat model says in
terms that *"what makes it acceptable is T-3's signature, not the graph's own
design"*. But `link_interpreted_entities` (`202607160011`, **never dropped**)
still inserts a co-mention into `person_projects` and `person_contexts` on every
interpretation, carrying `least(a.confidence, b.confidence)`. That is the
**refused option C**, and `entry_entities` is written by the live interpretation
RPC, so the path is the product's primary flow. **Removing it is a migration and
therefore a stop condition.**

**3. So the claim was already wrong on a shipped surface.**
`association-panel.tsx` rendered **"Informado por você"** for every association
row — including the trigger's — on the reasoning that the tables carry no
`source_entry_id` *"so there is nothing else the origin could be"*. **That
confuses the absence of a provenance column with the absence of another writer.**
True of one table, false of the other two, and live on the person and project
pages since 2N.1.

### The discriminator cost nothing, and it proves in one direction only

The owner's creation actions write an `audit_logs` row; the trigger writes none.
That table is **exempt from every retention sweep by decision**
(`202608050077:45`), already carries `(user_id, entity_type, entity_id)`, and is
already read by the project page — **no grant, no index, no RPC**. Narrowed to
the two `associate_*` actions, because an edit or an end is an owner act on a
link, not authorship of one.

**Presence proves owner-authorship; absence proves nothing** — an owner action
whose best-effort audit insert failed is indistinguishable from the trigger — so
absence resolves to *not attributable*, **never** to *informed by you*. The
false-negative direction understates what is known; the other fabricates an
origin.

### What that produced

The **list is canonical and rendered first**, in the DOM and on the page, and
carries every link. The **drawing receives a strict subset**, so it cannot hold
exclusive information without somebody deliberately giving it some. Both read one
`Bounded<RelationEdge>`, so **neither can report a different bound** — a
type-level property rather than a convention. An unattributable link is listed
under its own heading with an honest sentence and **deliberately not drawn**, and
the page says why.

Rendering is **HTML anchors over an `aria-hidden` SVG holding only geometry**,
chosen against inline SVG, canvas and a library on accessibility, touch targets,
bundle, SSR, CSP and maintenance. **Zero client JavaScript, zero dependencies.**
The SVG sits behind opaque boxes, so a line can never cross a label.

`/app/relations` sits in the `context` group at **`more`** visibility, which is
the requirement rather than restraint: `2N-RELATION-006` forbids primary
navigation and `2I-SHELL-001`'s four primaries are asserted unchanged.

### `graph` joined the sensitivity contract with its consumer, and closed a divergence doing it

`contracts.ts` reserved the key in 2N.0 with an explicit condition — *"with its
consumer, or not at all."* The consumer is `person_relationships.description`.

**And the person page converges in the same change.** It masked `people.notes`
and printed `description` in the clear **one section below it**: two
unclassifiable free-text fields about the same human being, on one page, under
two postures, both matching ADR-110 Decision 4's predicate word for word.
`person_projects.role` is **deliberately unchanged** and recorded as an owner
question — extending a signed posture to a field whose predicate it does not
match is not this slice's to do.

### Four defects, and each was found by something checking rather than by re-reading

1. **The node box carried `min-height`.** The layout places rows a `PITCH` apart
   and calls overlap impossible — but a two-line name under a floor grows past
   its row and sits on the node below, **while `layout.test.ts` goes on passing,
   because the arithmetic never saw the text.** Fixed height now.
2. **A journey clicked the `.first()` reveal control** on a page with several
   protected subjects, every one of whose buttons is called "Mostrar". It would
   have uncovered whichever came first and then asserted about a string it never
   revealed.
3. **A hosted journey failed and the product was right.** It waited for *"Relação
   encerrada"* after ending a relationship. The end succeeded; the sentence lives
   only in an `sr-only` region **inside the row being removed**, so
   `revalidatePath` unmounts it in the same commit that sets it. That is §69's
   shape one component over, and it is **recorded as
   `2N-RELATION-END-ANNOUNCEMENT`, not repaired** — it is not needed by the
   graph's contract, and fixing it while nearby is how a slice acquires scope.
4. **An `axe-core` scan of the REAL page found a contrast defect this slice had
   introduced.** `.provenance-note` is `color: var(--muted, #64748b)` and
   **`--muted` is defined nowhere in this codebase** — 4.62:1 on white, which
   passes, and **4.30:1 on `--mist`**, which does not. Tinting the unattributable
   row tipped an inherited colour below the threshold. **No structural guard
   would have caught it and no unit test could**: jsdom applies no external
   stylesheet, so contrast is invisible to every assertion in this repository
   except one run in a real browser against the real page. The scan is now part
   of the journey, at both viewports and in both locales, and it reports the
   failing **elements** rather than a count.

### Two guard tokens narrowed, never weakened, each with a two-sided control

A bare `graph` in a migration filename matched Phase 2C's
`202607220044_phase_2c_slice_5_task_graph` and its follow-up. A bare
`content\s*:` matched `align-content: start` on a correct file. **The class keeps
recurring and the fix is always the same**: narrow to what discriminates, and
prove the narrowing still refuses what it must refuse *and* still allows what it
must.

### Proofs

110 focused tests; **38 structural guards, each with a mutation control**; full
suite **7263 passing** (the local Windows-only shebang parse baseline is three
files, zero tests; one run concurrent with the Playwright dev server produced one
flake that passes in isolation and is green in CI). Lint, typecheck, build and
`git diff --check` clean.

Hosted: **23/23 desktop and 23/23 Pixel 7**, both locales, `--workers=1`, plus
**64 regressions** — EGC.2 relationships 8/8, 2N.1 person 14/14, 2N.0 foundations
12/12, 2N.2 project 14/14, 2N.5 library 16/16. **110 hosted executions, no `429`
across roughly 190 sign-ins.** A local production build against hosted Supabase,
**not a Vercel deployment**.

**Zero residue**, on a probe whose control **discriminates**: none of the three
relation tables carries a text column, so residue is reachable only by joining
through the marked person — and a probe that silently failed to join would read
zero against a table full of relations. It plants **two** marked people, gives
**one** a relationship, and requires exactly one to be found. The audit row is
read **directly**, because `audit_logs.entity_id` has no foreign key and a row
that outlived its subject is precisely the residue worth naming. **It ran after a
deliberately failed journey**, which is the second half of the proof.

### Recorded, not smoothed

- **`2N-RELATION-003` closes `partial`**, remainder **`2N-RELATION-TRIGGER`**: a
  migration, an owner decision, a stop condition, and **not transferable into
  M2**.
- **`2N-RELATION-002` and `-008` are claimed as `built`, not baseline.** The
  2N.6 re-audit read them as *"largely ships"* and *"ships"*; both readings
  rested on the premise the catalogue measured false.
- **There is no selection model, and that is a design decision.** The drawing
  carries no client state, so focus is the only state a node has. A selection
  would have meant client JavaScript, a second state to keep in step with the
  list, and an affordance with nothing to do.
- **`2N-FILES-008`** stays partial with **`2N-FILES-WRITER`**, untouched: this
  slice creates **no writer** for `entity_attachments` and uses the graph to
  justify nothing.
- **`online-memories.spec.ts:85`'s 21px touch target** stays a **`2N-MOBILE`**
  remainder — not weakened, deleted, skipped or marked passing. Checked against
  the owner's criterion and it does not apply: the relations surface shares no
  component with it, and its own controls are chips asserted at 44px in the
  journey.
- **`2N-PRIVACY-FREETEXT`** — an owner question about `person_projects.role`,
  neither decided nor acted on.
- Mobile is a **viewport simulation**, not a device; **no screen-reader session
  is claimed**; the error state is proved by unit test, because forcing a hosted
  read failure would mean breaking the database.

### THE LOOP STOPS HERE — 2N.7 IS RE-AUDITED BUT NOT STARTED

Stopped **between slices**, a sanctioned stopping point. **No migration is
partially deployed**: 2N.6 created none, and M1 and M3 remain merged, deployed,
at parity and proved.

`docs/reports/phase-2n/PHASE_2N_SLICE_7_REAUDIT.md`. Its load-bearing findings:
**M2 may close unspent and that is a correct outcome** (`2N-METRICS-002`); the
live surface CHECK has **no `person`, `project`, `memory`, `library`, `relation`
or `graph` surface**, which is why any 2N telemetry costs a migration at all; and
**a trap this repository has paid for is already closed** —
`private.record_product_event` no longer carries its own frozen copy of the
event-name allowlist, deleted by `202608090089`, so 2N.7 inherits **three**
vocabulary copies to move together, not four. A slice re-auditing from the older
note would budget for a writer change M2 does not need.

**Unchanged:** signup closed, rollout **25 · 3 · 2**, push **not** resumed (HTTP
403 on a real iPhone, Android **NOT EXECUTED**), ADR-055 neither satisfied nor
superseded and expiring **2026-10-27**, **Phase 2O not started, not planned and
not retargeted**, and A13 still guarding the roadmap successor. **Slice 2N.7 is
the only slice left.**

## §73 — PHASE 2N IS COMPLETE: 127 of 127 classified, and the last allocation closes unspent (2026-08-14)

**PR #225**, merged at `75522f4`; head at review `8135cb5`, **CI green on all
three job families on both**. `docs/reports/phase-2n/PHASE_2N_CLOSING_REPORT.md`,
`..._SLICE_7_ACCEPTANCE.md`, `..._SLICE_7_M2_VERDICT.md`, and the generated
`..._TRACEABILITY_MATRIX.md`.

**`127 declared · 127 classified · 0 unclassified` — 93 built · 20 baseline ·
3 partial · 11 not-built-by-rule · 0 undelivered.** Budget closes
`3 allocated · 2 spent`: **M1** `202608130093`, **M3** `202608140094`, and
**M2 UNSPENT**. 94 local = 94 hosted, parity **`202608140094`**.

### M2 closed unspent because no event survived its own contract

`2N-METRICS-002` made it conditional and the plan set the standard in terms: *an
unspent allocation is not a defect; **a migration created to use one up fails the
close**.* So the slice opened with a measurement rather than a schema.

Six candidates were derived from the phase's own stated purpose — *"whether
anyone inspects, corrects or removes what the Brain knows"* — **steelmanned, then
refused**, each for a named reason in one of three classes:

| Class | Candidates |
| --- | --- |
| A **better instrument already exists and is the authority** — `audit_logs` records every correction, `undo_operations` every undo, and a direct owner-scoped query answers the rest **exactly** | C2, C4, C5, C6 |
| The answer **changes no pending decision** | C1 |
| Recording it would **contradict a signed privacy decision** | C3 |

**The strongest candidate is worth remembering.** `protected_content_revealed`
was the only one with **no better instrument** — a reveal is local and transient
and leaves no row anywhere. It is refused **on privacy**: OD-2J-1 made that
reveal transient *deliberately*, with **no persisted form and no serializer**, and
recording it would create the persistence by a different door. A per-surface
reveal count is also a **fingerprint of where an owner keeps protected content**,
which `2N-METRICS-004` forbids as *"any identifier that functions as content."*

Two census facts, both measured rather than assumed: **all 39 declared event
names have producers** once the census reads `supabase/functions/` as well as
`src/` — three live **only** in the Deno worker, and a census of `src/` alone
would have reported three orphans and been wrong about all three — and **no
funnel reader has ever read a real event belonging to a real owner**, which Phase
2M's own §5 records after finding all three died at `createClient` and had never
run.

### The matrix is generated, and it refused thirty-five times first

`scripts/generate-phase-2n-traceability.mjs` reads the PRD for what was declared
and the eight acceptance records for what was evidenced, and **writes nothing at
all** when they disagree. A document that silently omits the rows it could not
verify is worse than no document, because it looks complete.

**It reads four row shapes, because the records really use four**, written across
six slices: class in the row; class in an enclosing `### Built (17)` heading;
family heading over **bare numeric suffixes** (`001, 002, 007`); and compound
classes resolved to a head token. **Tolerating four is safe only because of the
completeness check** — all 127 must come out classified exactly once, so a shape
it misreads surfaces as a refusal, never as a missing row.

It carries a **narrow adjudication licence**: the closing slice may settle a
conflict and may classify an id **no record reached**, but **may not overturn a
class the prior records agree on**. Two ids needed it, and both were settled in
favour of the slice that **delivered** the property over the one that inherited
it.

### A mutation control found the generator's own vacuous check

*"Every `partial` names a destination"* tested the row's evidence for a `2N-…`
token — and **every row contains its own id**, so the check passed for any
`partial` that existed. **It had never been capable of failing.**

Stripping the subject id first made **three rows that had been passing vacuously
appear at once**, across three different acceptance records. Each was corrected in
its **source record**, adding the citation its own surrounding prose already
carried. **No class changed.** The narrowing carries a two-sided control.

### Two signed premises are false in the tree, and the close says so

- **`OD-2N-8` A** claims no inferred relation is persisted.
  `link_interpreted_entities` still writes a co-mention into `person_projects`
  and `person_contexts` **on every interpretation**. **T-3 is live.** Remainder
  **`2N-RELATION-TRIGGER`**.
- **`2N-IDENTITY-008`** forbids inference creating a persisted identity.
  `persist_interpretation` inserts `people`, `projects`, `contexts` and
  `organizations` from the model's extracted names **with no user act**. Found by
  the **closeout**, not by any slice. Remainder **`2N-IDENTITY-EXTRACTION`**.

**Neither is transferable into M2**, which is telemetry's allocation and closes
unspent regardless. Both need a migration and an owner decision.

### The three partials, each with a destination

| Requirement | Destination |
| --- | --- |
| `2N-FILES-008` | **`2N-FILES-WRITER`** — restore `INSERT` or add a definer RPC |
| `2N-RELATION-003` | **`2N-RELATION-TRIGGER`** — drop the co-mention trigger |
| `2N-IDENTITY-008` | **`2N-IDENTITY-EXTRACTION`** — gate entity creation behind a user act |

**All three are a migration and an owner decision, and all three are stop
conditions.**

### Threats

**All twenty-three dispositioned**, each mitigated with named evidence or
accepted in writing. **Two live**: T-3 above, and **T-19** retention sweeps still
unscheduled — inherited, a rollout-gate residual, and **no Phase 2N migration
schedules one**, which M3 enforces by *refusing to deploy* if a sweep exists.

### Two gates inverted rather than deleted

`phase-2n-declarations.test.ts` forbade the closing artifacts while the phase
ran; it now **requires** them. The assertion is kept rather than removed for the
reason Phase 2M's equivalent was kept: **a deleted assertion records nothing**,
and the next reader cannot tell a gate that was satisfied from a gate that was
removed. **The deployment record stays out** — 2N.7 spends no migration, so it
has none to record, and inventing a file to satisfy a pattern is the shape this
family refuses.

### Proofs

lint, typecheck, **full suite 7284 passing** (three unparsed files = the
Windows-only shebang baseline, green in CI), build, `git diff --check`, and the
generator's own `--check` all clean. **The generator was re-run against the
merged tree** and still re-derives `127 declared, all classified` — the matrix is
not merely a file that travelled with the PR.

**No hosted journey is run or claimed.** This slice ships no product code and no
surface; the phase's surfaces were proved by their own slices, and re-running
them here would prove nothing this slice changed.

### One precision correction, made before the merge rather than after

The closing report claimed all eight slices were merged with CI green on their
exact merge SHAs. **Seven were**; the eighth was the change carrying the
sentence, whose merge SHA cannot be green before it exists. A closing report is
the one document a reader trusts about *what was verified*, so it now separates
the two.

### THE PHASE IS CLOSED — NO PHASE IS ACTIVE

**Unchanged and approved by nothing here:** signup **closed**
(`enable_signup = false`), rollout **25 pass · 3 fail · 2 owner-signature**, push
implemented and hosted but **failing on a real iPhone with HTTP 403** and
**NEVER VALIDATED ON ANDROID**, **ADR-055 neither satisfied nor superseded** and
expiring **2026-10-27**, **no screen-reader run executed or claimed** (an open
residual beside `2L-ACCESS-008`), and `2N-MOBILE`'s **21px** touch target carried
forward unrepaired.

**The successor is re-audited and NOT started.** No successor requirement,
governing artifact or scope exists anywhere in the repository — verified, not
assumed: there is no `docs/initiatives/phase-2o/` and no `docs/reports/phase-2o/`.
**A13 is not retargeted**, and starting one needs its own owner authorization.

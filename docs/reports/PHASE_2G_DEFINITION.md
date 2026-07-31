# Phase 2G Definition Study

**Status — DEFINITION ONLY.** This document proposes nothing as authorized. There is
no Phase 2G PRD, implementation plan, requirement ID, ADR, migration or product code,
and this study creates none. Its output is a recommended phase definition and an
owner-decision package. Nothing here may be implemented before the owner approves the
definition and a PRD is written against it.

- **Baseline** — `main` at `a745011`, clean, synchronized with `origin`.
- **Migration parity** — `202607310064`, local and remote.
- **Date** — 2026-07-31.
- **Governing precedents** — `docs/STATE.md`, `docs/TODO.md`, `docs/DECISIONS.md`,
  `docs/SECURITY.md`, `docs/PHASE_2F_PROPOSAL.md`, `docs/reports/PHASE_2F_REPORT.md`,
  `docs/reports/PRODUCT_UX_CLOSEOUT.md`, `docs/reports/PRODUCT_UX_FINDINGS.md`.

> **AMENDED 2026-07-31 — see §20.** New evidence from real owner use (the "Camila"
> session) materially changes the evaluation of organizations, contexts and entity
> relationships. **§11 Decision 11 and candidate 2G-4 are superseded by §20.6**, and the
> recommended sequence in §18 is revised by §20.8. Sections 1–19 are **labelled rather
> than rewritten**, per this repository's convention, so the original reasoning and the
> adversarial review that corrected it stay legible. The new findings have their own
> record: `docs/reports/ENTITY_GRAPH_FINDINGS.md`. The closed UX ledger is untouched.

---

## 1. Current-state verification

Each row was verified against the repository in this session, not taken from the handoff.

| Claim | Verified | Evidence |
| --- | --- | --- |
| `main` is `a745011`, clean | yes | `git log`, `git status` |
| Phase 2F complete | yes | `PHASE_2F_REPORT.md` §16; `TODO.md:28` |
| Product UX/UI remediation complete | yes | `PRODUCT_UX_CLOSEOUT.md` header + §10; `TODO.md:280` |
| Parity `202607310064` | yes | `SECURITY.md:38`; last migration is `202607310064_reminder_lifecycle_command.sql` |
| 35 findings / 30 RESOLVED / 4 RETAINED / 1 DEFERRED / 0 OPEN / 0 PARTIAL / 0 BLOCKED | yes | `PRODUCT_UX_CLOSEOUT.md` §1; `TODO.md:282` |
| Phase 2G unauthorized, no artifact of any kind | yes | `PHASE_2F_REPORT.md:182` (asserted by a CI case); `STATE.md` "Phase 2G is not authorized and has not started" |
| `public.tasks` has one validated write path | yes | `SECURITY.md` §2F.4; `authenticated` holds `SELECT` only |
| `public.reminders` retains the Option C `INSERT` exception | yes | `SECURITY.md:112`, `:185` |

**One correction to the handoff.** The handoff lists four ranked Phase 2G candidates
from the UX closeout. `TODO.md:286-287` carries only two of them (2G-3 and 2G-4) as
named Phase 2G candidates; 2G-1 and 2G-2 appear in `PRODUCT_UX_CLOSEOUT.md` §8 but were
not mirrored into the backlog. The closeout report is the ranked source and all four are
evaluated here, but the backlog and the closeout do not currently agree, and whichever
phase is authorized should reconcile them.

---

## 2. Repository evidence

### 2.1 Operational readiness — what exists and what does not

| Control | State | Evidence |
| --- | --- | --- |
| Rate limiting (any kind, any surface) | **absent** | Repo-wide search for rate-limit/throttle machinery returns only Supabase's own auth email-rate error mapping (`features/auth/flow.ts:16,52`) and unrelated "budget" words |
| Per-user AI spend cap | **absent** | No caller of `get_ai_cost_summary` gates a provider call; `lib/ai/cost-summary.ts` is a read for the costs dashboard only |
| Global AI spend cap | **absent** | Nothing exists at any scope |
| `max_output_tokens` per operation | **one path only** | `lib/ai/openai-provider.ts:136` sets `TASK_COMMAND_MAX_OUTPUT_TOKENS`; extraction, chat, embedding and file paths set none |
| AI usage ledger | **present, complete** | `record_ai_usage` (`202607160015` → `202607250055`), append-only, written before dependent domain writes; `get_ai_cost_summary` aggregates server-side |
| Error sink / APM | **absent** | No `instrumentation.ts` anywhere, no `onRequestError`, no vendor. 15 `console.error` sites and one error boundary, `src/app/[locale]/app/error.tsx`. No `global-error.tsx`, so unauthenticated and root segments have no boundary |
| Edge Function failure observability | **absent** | Worker failures land in `jobs.error` and the Jobs page; nothing aggregates or alerts |
| Scheduled work | **three `pg_cron` jobs** | hourly heartbeat (`202607160008:42`), job reaper (`202607170019:280`), per-minute entry drain (`202607170026:636`) |
| Dead-man detection for those three | **absent** | No freshness check, no alert, no reader |
| Job-queue health reader | **absent** | `O1` in `TODO.md:217` asks for oldest-pending-age as the operator signal; not built |
| Retention / purge | **absent** | The 180-day `product_events` limit is a table **comment** (`202607170024:60`). No purge job for `product_events`, completed `jobs`, delivered `notifications`, or anything else |
| Cost/latency alerting | **absent** | `SECURITY.md:60` lists it as required before production |
| Backup/restore verification, deploy runbook | **absent** | `M19`/`M20`, `TODO.md:195` |
| **Ledger-write durability** | **fail-open** | `recordAIUsage` (`src/lib/ai/usage.ts:40-57`) logs and returns `false` on RPC or transport failure; it never throws and no caller reacts. A provider call whose ledger write fails is billed by OpenAI and invisible to `get_ai_cost_summary` |

**The last row is not a curiosity — it is a precondition for any spend cap.** A cap that
reads `ai_usage_events` inherits that ledger's fail-open behaviour: whatever makes the
write fail also makes the cap read low. Today that costs an inaccurate dashboard. Under a
cap it becomes a bypass. Any Phase 2G spend ceiling must decide, explicitly, what happens
when the ledger write fails — and "log and continue" stops being an acceptable answer the
moment a control depends on the row.

### 2.2 Deployment and signup posture — the decisive finding

**The Next.js application is not deployed anywhere.**

- `README.md:20` — *"Google OAuth e Vercel foram deliberadamente adiados enquanto o
  produto permanece em pré-MVP."*
- `playwright.config.ts:14` — `baseURL: "http://localhost:3000"`. The "online"
  authenticated suite runs the app **locally** against the linked Supabase project
  (`scripts/online-playwright.mjs` injects `ONLINE_SUPABASE_*` credentials only).
- `TODO.md:195` — the deploy runbook for the Next.js app layer is open (`M19`/`M20`).
- `.env.example` names no site URL, no hosting variable, no deployment target.

What **is** hosted: the Supabase project (Postgres, Auth, PostgREST, Storage) and the
two Edge Functions. The application layer that renders every product surface is not.

**The interim mitigation C1 rests on does not exist in the repository.**
`TODO.md:191` records C1's mitigation as *"invite-gate signup, which drops it to High."*
`src/features/auth/actions.ts:91-111` calls `supabase.auth.signUp` directly with a Zod
schema and no allowlist, no invite check and no gate of any kind; `/auth/register`
renders unguarded; `src/proxy.ts` contains no signup restriction. Searching
`src/features/auth`, the auth routes and `src/proxy.ts` for an allowlist or invite
mechanism returns nothing.

`supabase/config.toml` sets `enable_signup = true`, but that file governs the **local**
stack. The hosted project's Auth settings live in the Supabase dashboard and **are not
determinable from this repository**. This is stated as an unknown, not assumed either
way — and it is the single highest-value fact the owner can supply.

**The exposure that does not require the app to be deployed.** If hosted signup is open
and the publishable key is obtainable, an account created directly against the hosted
Auth API can call `capture_entry_async` through PostgREST. The per-minute `pg_cron` drain
then claims and interprets that entry unattended — one OpenAI extraction plus one
embedding, on the owner's key, with no per-user ceiling and no `max_output_tokens` on
either call. The Next.js app is not on that path. This is the concrete shape of C1 today,
and it is narrower than "public production" but wider than "nothing is deployed".

### 2.3 Usage evidence — what the instruments can and cannot say

The Phase 2F command-funnel reader exists and is executed
(`scripts/phase-2f-command-funnel.mjs`, `scripts/phase-2f-command-funnel-reader.mjs`,
52 CI cases plus 32 assertions against the deployed project).

| Question | Answer from the repository | Category |
| --- | --- | --- |
| How many real commands have been typed? | **Zero.** `PHASE_2F_REPORT.md:104` — *"The real owner's funnel is empty: zero real commands have been typed. That is evidence, not a gap"* | evidence of no usage |
| Project population | 2 users, 4 tasks, 1 reminder (status `sent`) — `PHASE_2F_SLICE_05_ACCEPTANCE.md:155`, reminder census | evidence of no usage |
| Is either ADR-055 evidence tier met? | **No.** Spike tier (50 commands / 10 active days / 14-day window) unmet; planning tier structurally cannot return `met` at one user | evidence of no usage |
| How often is *"add a task"* refused? | **Not measurable.** `2F-MEASURE-005` is a named partial: the `unsupported` preview category is emitted by **no code path** (`actions.ts:347-358`, `:719-726` return before the emitter at `:400`), so `unsupportedRefusals` is structurally `0` against production | instrumentation unable to answer |
| No-match / creation-offer rates | Computable, but over an empty denominator; `qualifyingCommands` counts preview rounds, not intents | instrumentation limited **and** no data |
| Do users want project purpose/dates/notes or a person-level role? | **No evidence either way.** Nothing measures entity-field usage; the population is two users | no evidence |
| Do users need audit-row grouping? | **No evidence.** UX-27 is RETAINED precisely because the two rows are truthfully distinct and History reads them as such | no evidence |

**The distinction the owner asked for, applied.** "Zero real commands" is *evidence of no
usage*, not *evidence of no need* — the product has had no deployed surface through which
usage could occur. Nothing in this repository is entitled to conclude that a capability is
unwanted. What it **is** entitled to conclude is that no schema expansion can currently be
justified by demand, because there is no demand signal of any kind, in any direction.

### 2.4 Conversational creation — the gap is narrower than its name

This is the most consequential finding of the study, and it reframes candidate 2G-1.

**The validated creation write path already exists and is deployed.** Migration
`202607270060_phase_2e_no_match_task_creation.sql` ships the full family:

| Object | Line | Role |
| --- | --- | --- |
| `public.preview_task_command_creation` | `:2172` | read-only preview |
| `public.issue_task_command_creation_confirmation` | `:2251` | server-issued single-use token |
| `public.create_task_command` | `:2346` | the transactional creation |
| `private.undo_create_task_command` | `:2644` | registered compensation |
| `task_command_confirmations` CHECK | `:20` | `check (action in ('cancel_task', 'create_task'))` |

`create_task` is **already a database-level action literal**. The family carries the
operation key, canonical fingerprint, replay idempotency, audit row, `app.audit_actor`
stamping and registered undo. It has two live callers already: the no-match creation offer
(`task-commands/actions.ts` `creationRound`) and manual creation, routed onto it by Slice
2F.3 (`createRecord`'s task branch).

**What is actually missing is one classification.** `TASK_COMMAND_ACTIONS`
(`src/features/task-commands/taxonomy.ts`) holds fifteen verbs and every one of them
mutates an existing task. There is no create verb, so *"Adicione uma tarefa para revisar
os números amanhã"* is classified `unsupported_action` and refused — while the exact same
creation destination is reachable, but only by accident, when a **mutation** proposal
happens to match no task (`intent: {kind: "no_match"}`).

So candidate 2G-1's task half is **not a new write contract, not a new privileged
boundary, and — for the task half — not a migration**. It is a taxonomy and routing change
over infrastructure that is already built, already reviewed across three adversarial
rounds, already deployed and already exercised.

**Stated plainly, because the phase should not be sold as more than it is:** the create
verb is an **addressability fix, not a new capability**. The composer can already create a
task today — but only if the owner phrases the request as a *mutation* that then fails to
match. Saying "adicione uma tarefa…" is refused; saying "revisar os números amanhã" as if
it were an edit to an existing task reaches the creation offer. The capability exists and
is unreachable by the natural sentence. That is a real product defect and it is worth a
phase, but it is worth less than "the product cannot create by voice", which is false.

**No database object pins the verb list.** Verified: the product-event validator
(`202607280061`) allowlists *event names* and the *outcome* vocabularies, not action verbs;
`analytics.ts` never emits the action name as a property; `task_command_confirmations`
already admits `create_task`; and `apply_task_command`'s fifteen-literal list is not on the
creation path. The create verb therefore needs **no migration** — but per the house rule
(`PHASE_2F_PROPOSAL.md` §15) this must be re-established by an executed inventory before
2G.1 is planned, not inherited from this paragraph.

**2G-1 as named conflates two separable things**, and the closeout's own evidence markers
show it: `E-M4` (no create verb) and `E-M5` (capture routing) are different findings with
different costs.

| Half | What it is | Migration | New AI spend path |
| --- | --- | --- | --- |
| **Create verb** (`E-M4`) | a sixteenth verb routed to the deployed creation family | none expected for the task half | **none** — `runTaskCommand` already makes exactly one bounded `parseTaskCommand` call per turn; a verb changes the *outcome*, not the call count |
| **Capture routing** (`E-M5`) | the composer may write an `entry` and enqueue interpretation | **yes** — `private.validate_product_event_properties` pins `captureSource` to `['home','capture_page','global']` (`202607170024:185-192`) and `captureEntry` requires one on every path including failure | **yes** — one extraction plus one embedding per routed capture, drained **unattended** by `pg_cron`, with no per-user ceiling and no output-token bound on either call |

`entries.source` already admits `'chat'` (`202607160003:50`) and
`captureEntrySchema.source` already accepts it, so the entry side needs nothing. The
migration is telemetry-only.

**One real consequence of adding a verb, stated rather than discovered later.**
`TASK_COMMAND_POLICY_VERSION` (`taxonomy.ts`) is hashed into the command fingerprint
(`fingerprint.ts:72`). Bumping it invalidates every stored fingerprint and every unexpired
confirmation token. With an empty funnel the practical blast radius is nil, but the
mechanism must be exercised, not assumed.

**DEC-5 is closed and is not 2G scope.** The memory branch shipped: `createProposedMemory`
is wired to the composer's proposal on both chat routes
(`app/[locale]/app/chat/page.tsx:48`, `chat/[conversationId]/page.tsx`).

### 2.5 Projects and People — current columns

```
public.projects   id, user_id, organization_id, name, description, status, created_at, updated_at
public.people     id, user_id, organization_id, name, notes, created_at, updated_at
public.contexts   id, user_id, name, description, kind, created_at, updated_at
public.organizations  id, user_id, name, description, created_at, updated_at
```
(all from `202607160003_intelligent_capture.sql:1-45`)

Edit paths exist and match the house posture: `updateProject`
(`src/features/entities/actions.ts:92`) and `updatePerson` (`:152`) are Server Actions
with Zod validation and an `audit_logs` row each — shipped by UX Slice F2.

**Two corrections to the 2G-2 candidate list.** `public.people` **already has `notes`**, so
"free-form notes" is only missing for projects. And a person-level *role* is genuinely
absent — `person_projects.role` exists but is project-scoped, so it cannot express "she is
a lawyer", only "she is counsel on this project". The remaining genuinely-missing project
fields are purpose, start date and target date.

### 2.6 Audit operation identity

- **Writers.** ~60 `insert into public.audit_logs` statements across ~30 migrations, plus
  four application-level inserts (`chat/actions.ts:217`, `entities/actions.ts:135`,
  `entities/actions.ts:185`, `memories/actions.ts:156`), plus the `audit_task_change`
  trigger (`202607160014`).
- **The propagation mechanism already exists and is proven.** `app.audit_actor` is set
  transaction-locally with `set_config(..., true)` inside the command RPCs and read by the
  trigger with `missing_ok` (`202607260058:234,345,1108,1703`; `202607260059`;
  `202607270060:1268,1976`). A transaction-local `app.audit_operation_id` would use the
  identical, already-reviewed pattern. `is_local => true` is what stops it leaking across
  a pooled connection, and that property is already asserted.
- **Cost is bounded, and much lower than the comparable deferral.** `alter table … add
  column operation_id uuid` is additive and nullable. Unlike `2E-COMMAND-012` (ADR-057),
  it does **not** require a drop-and-recreate: the affected functions keep their
  signatures and change by `create or replace` only. To close UX-27's actual root, only
  the bodies that write the paired rows need touching — `apply_task_command`,
  `create_task_command`, `apply_reminder_command_v1` and the `audit_task_change` trigger.
  `apply_task_command` is ~1,460 lines and is re-declared in full by convention, which is
  where the real cost sits.
- **Product value.** UX-27 is **RETAINED**, not deferred, because the two rows are two
  genuinely distinct events that History renders truthfully today. Grouping them is an
  internal-architecture improvement with a downstream reader that does not exist. `M18`
  (`TODO.md:205`) records the standing state of that problem: 22 instrumented events, one
  reader, built for a different purpose.

### 2.7 Organizations and contexts surfaces

The full authenticated route inventory (`find src/app -name page.tsx`) contains **no
`organizations` route and no `contexts` route** — neither list nor detail. Both tables
exist with ownership, uniqueness indexes and live relations (`projects.organization_id`,
`people.organization_id`, `task_contexts`, `entity_tags`).

**A correction to the candidate as written.** 2G-4 is described as "detail routes" and as
"only the surface is missing". Both are true but understate it: there is no entry point at
all, so shipping detail routes alone would produce two pages nothing links to except
UX-04's outcome section. The honest scope is *list + detail*, two entity types, read-only,
no migration — larger than "a route", still small.

---

## 3. Reconciliation of the two competing recommendations

Neither recommendation is wrong about its own evidence. They disagree because they were
written from different vantage points and neither had the other's facts.

**Recommendation A (Phase 2F closeout): "Phase 2G = Operational Readiness, C1 first."**
`PHASE_2F_PROPOSAL.md` §14. Its supporting argument, in the same document's §13, is
explicit about the conditions under which the deferral holds:

> *"Held: the interim mitigations recorded at the hardening review stand, the environment
> is single-user with disposable data, and 2F adds **zero** new AI spend paths. The
> commitment made instead: Phase 2G is named, C1 is its first item, and 2F's closeout
> explicitly re-raises it. **If public signup opens before 2G, C1 jumps the queue.**"*

Three of that argument's four load-bearing clauses survive verification. One does not:
**the recorded interim mitigation — invite-gated signup — is not implemented** (§2.2).
That is a correction to the record, and it changes what C1-first should mean: the missing
control is not a phase of work, it is a signup gate and a dashboard setting.

**Recommendation B (UX closeout §8): 2G-1 … 2G-4, ranked.** Written from the remediation's
own findings. Its ranking is sound; its cost model for 2G-1 is not, in the product's
favour — §2.4 shows the create verb rides on already-deployed infrastructure. Its 2G-2 and
2G-4 descriptions each contain one factual understatement (§2.5, §2.7).

**Where they actually conflict.** They do not conflict on facts; they conflict on *what a
phase is for*. A is sequencing by risk register. B is sequencing by product gap. The
tiebreaker available in the repository is that **A's trigger condition is not met and B's
is**:

- Operational Readiness's items are each keyed to an event — `C1` to "open self-service
  signup", `H7`/`H8` to "before a pilot", `M6` to "before the first pilot",
  `M19`/`M20` to deployment. **None of those events has occurred, and none can occur
  without a deployment that has been deliberately deferred** (§2.2).
- Conversational creation's gap is provable from code today, is not waiting on anything,
  and — decisively — is the *only* candidate that produces the usage every deferred
  evidence gate is waiting on. `ADR-055` expires **2026-10-27** and, at the current rate,
  will expire because no commands were typed, not because embeddings were shown
  unnecessary. Building instruments for traffic that no feature generates is how a gate
  expires unanswered.

**But B is not free of A.** The create verb is spend-neutral; **capture routing is not**
(§2.4). If capture routing ships, the phase creates its first new unattended AI spend path
since Phase 2X, on an ungated text box — and the honest response is not "defer C1 again",
it is "ship the half of C1 this phase's own path requires".

---

## 4. Rollout assumptions

**Repository truth determines the *current* posture and cannot determine the *intended*
one.**

| Posture | Determinable? | Repository evidence |
| --- | --- | --- |
| Current | **yes — single owner, local application, hosted database** | No app deployment (§2.2); 2 users in the project; empty funnel |
| Near-term intended | **no — owner decision** | `README.md:20` says Vercel is *deferred*, not declined. `TODO.md:269` lists custom SMTP + routable domain "before production launch" as open. `SECURITY.md:64` says Google OAuth is configured "only when the user resumes that integration". Every one of these is a statement of intent-to-decide, not a decision |

**This study does not assume public launch and does not assume permanent single-user
operation.** It assumes only what is checkable: today nobody but the owner can reach the
product, and the controls that would make that untrue are not built.

**One posture fact is unknown and materially changes the urgency of everything in §2.1:**
whether the **hosted** Supabase project currently accepts open signup. That is Owner
Decision 1 below, and it is the only item in this study that could reorder the
recommendation.

---

## 5. Candidate evaluation

| # | Candidate | Real problem today? | Evidence class | Technically ready? | Owner decision needed? | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **2G-1a** | Create verb in the command taxonomy | **Yes — provable from code.** The owner's own example sentence is refused | Architectural certainty (not a rate; the rate is unmeasurable, §2.3) | **Yes — highest readiness of any candidate.** Destination contract deployed, two callers already | Confirmation posture only | **In scope — the centerpiece** |
| **2G-1b** | Capture routing from the composer | Yes, but smaller: `/app/capture` exists and works | Architectural | Yes, with one telemetry migration | **Yes** — and it carries the phase's only new spend path | **In scope, conditional on Owner Decision 2 and on the spend ceiling shipping with it** |
| **C1a** | Per-user daily AI spend ceiling | Yes, if 2G-1b ships | Architectural | Yes — `ai_usage_events` / `get_ai_cost_summary` already aggregate server-side | Policy value + behaviour at cap | **In scope, scoped to what 2G-1b requires** |
| **C1b** | Distributed rate limiting | Not today — no traffic, no deployed surface, and no shared store exists | — | No — needs an infrastructure decision | Yes | **Out — Phase 2H** |
| **C1c** | Signup gate (the mitigation that was recorded but never built) | **Yes — the record is wrong** | Verified absence | Yes — hours of work | Yes (Decision 1) | **Out of the phase, and a HARD GATE on starting it** (§19, attack 3) |
| **H7** | Error sink | Yes, but unobservable value while nothing is deployed | — | No — vendor decision | Yes | **Out — Phase 2H** |
| **H8** | Cron dead-man's switch | Yes, and partly invisible (see §10, R4) | — | Partly — `O1`'s oldest-pending-age reader is specified | No | **Out — Phase 2H**, with the caveat in §10 |
| **M6** | Retention / purge | Not yet — trigger is "before the first pilot" | — | Yes | Policy | **Out — Phase 2H** |
| **2G-2** | New Projects/People fields | **No evidence of need in either direction** (§2.3). `people.notes` already exists (§2.5) | No evidence | Trivially (additive migration) | **Yes** | **Out — recommend "not now" with a reopening condition** |
| **2G-3** | `audit_logs.operation_id` | No — UX-27 is RETAINED because the current rows are truthful | No evidence | Yes, and cheaper than ADR-057's deferral | Yes | **Out — internal architecture, no reader** |
| **2G-4** | Organizations/contexts surfaces | Minor — UX-04 degrades two entity types to plain text | Architectural | Yes, no migration | Yes | **Out of 2G's core; offer as an optional trailing slice** |
| **DEC-5** | Conversational memory creation | **Already shipped** (§2.4) | — | — | — | **Closed, not a candidate** |

---

## 6. Alternative phase structures

### Alternative A — Operational Readiness first

**Objective.** Make the system safe to expose before exposing it: spend caps, rate
limiting, an error sink, scheduler monitoring, retention.

- **User value.** None directly. The owner is the only user and is also the payer.
- **Technical risk.** Low-moderate. Rate limiting needs a shared store the stack does not
  have (Postgres table? Upstash? Supabase Edge?) — an infrastructure decision, not a code
  change.
- **Operational risk of *doing* it.** Low. Of *not* doing it: bounded today (§2.2), sharply
  higher the day the app deploys.
- **Migrations.** Likely 2–4: a spend-limit policy table or `agent_preferences` columns,
  a rate-limit counter table, purge functions plus `pg_cron` schedules.
- **New privileged boundaries.** Yes — a cap-check function on the AI path (must be
  callable before every provider call), a purge job running as a scheduled role.
- **AI spend impact.** Reduces the ceiling; adds one bounded read per provider call.
- **Rollback.** Good — caps are configuration; purges are the exception (deleted rows do
  not come back, so the first purge must run behind a dry-run).
- **Testing burden.** High. Cap behaviour needs concurrency tests; purge needs retention
  boundary tests; a dead-man switch needs a way to simulate a stalled cron.
- **Slices.** 5–6.
- **Explicitly deferred.** All product capability. `ADR-055` expires unanswered.
- **Coherent?** Yes as a *theme*. **No as a phase now**: it builds guards for traffic no
  feature generates and for a surface that is not deployed, and its own trigger conditions
  are unmet. It also cannot be validated end-to-end — you cannot prove a rate limiter works
  against a system nobody can reach.

### Alternative B — Conversational Creation first

**Objective.** The composer can create, not only mutate. Close `E-M4`; decide `E-M5`.

- **User value.** The highest of any candidate. It closes the gap between what the owner
  can say to the product and what the product can do, on the surface the UX remediation
  just unified.
- **Technical risk.** **Low, and lower than it looks.** The write path exists, is deployed
  and has been through three adversarial review rounds. The change is a classification
  layer plus routing (§2.4). The real risks are the policy-version bump invalidating
  fingerprints and prompt/taxonomy drift between the model contract and the RPC.
- **Operational risk.** Low for the create verb (spend-neutral). **Real for capture
  routing** — a new unattended spend path on an ungated text box.
- **Migrations.** Zero for the create verb; **one telemetry migration** for capture routing
  (`create or replace` on `private.validate_product_event_properties`); one small one if the
  spend ceiling is stored per user.
- **New privileged boundaries.** None for the create verb — it calls three RPCs that
  already exist. One if the spend ceiling is a `SECURITY DEFINER` pre-check.
- **AI spend impact.** Create verb: **zero new call paths**, more of the existing bounded
  call succeeding. Capture routing: one extraction + one embedding per routed capture,
  unattended.
- **Rollback.** Very good. The taxonomy is data; removing a verb reverts classification.
  The telemetry migration is additive to an allowlist.
- **Testing burden.** Moderate. Taxonomy/contract parity, routing, the confirmation flow,
  undo, the fingerprint-invalidation consequence, plus authenticated journeys in both
  locales on desktop and mobile.
- **Slices.** 4–5.
- **Explicitly deferred.** All of Operational Readiness except the ceiling this phase's own
  path requires; 2G-2, 2G-3, 2G-4.
- **Coherent?** **Yes.** One objective, one surface, one contract family, one clear
  acceptance question: *can the owner create by typing, safely, reversibly and within a
  spend ceiling?*

### Alternative C — Ordered combined phase

**Objective.** Ceilings first, then creation: slices 1–2 build spend caps and monitoring,
slices 3–5 build conversational creation.

- **User value.** Same as B, delayed.
- **Technical risk.** Moderate — two unrelated architectures in one phase.
- **Operational risk.** Lowest on paper.
- **Migrations.** 3–5.
- **New privileged boundaries.** All of A's plus B's.
- **AI spend impact.** Same as B, better bounded.
- **Rollback.** Mixed; two independent rollback stories.
- **Testing burden.** A + B.
- **Slices.** 7–9.
- **Coherent?** **Only partly.** The bounded version of C — ship exactly the ceilings the
  phase's own new spend path requires — is coherent, and is what Alternative B already
  recommends. The unbounded version (all of C1/H7/H8/M6 plus creation) is a grab bag: it
  pairs a product capability with a risk register, and the phase would have two acceptance
  questions that share no evidence. This repository has rejected that shape once already
  (`PHASE_2F_PROPOSAL.md` §0).

### Alternative D — Split into 2G and 2H (the recommendation's frame)

Phase 2G = Conversational Creation (Alternative B). Phase 2H = **Deploy and Operate** —
deployment (`M19`/`M20`) *together with* C1, H7, H8, M6, because they share one trigger
and validating any of them requires the deployment the others are waiting for. This is
strictly better than "Operational Readiness" as a standalone phase: it gives the
operational work an acceptance test it currently cannot have.

---

## 7. Recommended phase name

> ## Phase 2G — Conversational Creation

*Alternative: "One Composer, One Create Path" — accurate, and it names the invariant the
phase would establish, in the house style of "One Write Path". Either is fine; the first
is clearer to a reader who has not read Phase 2F.*

---

## 8. Recommended objective

**The unified composer can create, not only mutate — through the creation contract that
already exists, with no second path to `public.tasks`, and within a spend ceiling the
phase's own new path requires.**

The invariant the phase would leave behind, mechanically guarded like Phase 2F's:

> Every task the composer creates goes through `create_task_command`. There is no second
> creation path, and the direct-write allowlist for `public.tasks` stays empty.

---

## 9. Recommended scope

### In scope

1. **A create verb in the command taxonomy** (`E-M4`), routed to the deployed
   `preview_task_command_creation` → `issue_task_command_creation_confirmation` →
   `create_task_command` family. No new RPC. No new write path. The `no_match` creation
   offer stays exactly as it is; the verb becomes a *second, intentional* way to reach the
   same destination.
2. **The policy-version consequence, exercised rather than assumed** — the
   `TASK_COMMAND_POLICY_VERSION` bump invalidates stored fingerprints and unexpired
   confirmation tokens, and the phase proves the invalidation behaves as designed.
3. **Conditional on Owner Decision 2 — capture routing from the composer** (`E-M5`), with
   its telemetry migration (`captureSource` gains a composer-specific value; reusing
   `'global'` is prohibited, per the closeout's own reasoning).
4. **Conditional on (3) — a per-user daily AI spend ceiling**, checked before the provider
   call, computed from the existing `ai_usage_events` ledger. This is the half of C1 the
   new path requires, and only that half. It ships **in the same slice as** capture
   routing, never after it. Its justification is specifically the *unattended* drain: the
   `pg_cron` tick spends on the owner's key with nobody present to notice, which is what a
   costs dashboard cannot substitute for.
   Two constraints the PRD must carry, both established by inventory rather than
   assumption:
   - **The ceiling may not live in `agent_preferences`.** That table grants
     `select, insert, update, delete` to `authenticated` with an own-row update policy
     (`202607160001:61-66`) — a user could raise their own cap. It must live where the
     user cannot write it.
   - **The ceiling's input is fail-open** (§2.1, last row). The PRD must state whether a
     failed ledger write fails the operation closed or is tolerated, and prove the choice.
5. **Conditional on (4) — `max_output_tokens` on every operation**, not only the
   task-command path. This is in scope *because a ceiling needs it*: a daily budget checked
   **before** a call cannot bound a single call that runs away, so the two controls are one
   control with two halves. If (4) is out, this is out with it, and becomes a Phase 2H
   item rather than an orphan improvement smuggled into a product phase.
6. **Convergence and closeout** in the house shape: traceability matrix, cleanup verifier,
   remote smoke, authenticated journeys desktop + mobile in both locales, ADRs.

### Explicitly conditional

Items 3, 4 and 5 stand or fall together. If the owner declines capture routing, the phase
is items 1, 2 and 6, and carries **no migration and no operational content at all** — a
pure product phase over deployed infrastructure.

---

## 10. Explicit non-goals

- **Distributed rate limiting** (C1b) — no traffic, no deployed surface, no shared store.
  → Phase 2H.
- **Error sink / APM** (H7) — a vendor decision, and nothing is deployed to observe.
  → Phase 2H.
- **Cron dead-man's switch** (H8/M21) — → Phase 2H. *Caveat, stated because §10's own
  challenge demands it: of the three schedules, a stalled **entry drain** is visible
  (entries sit in `processing` on the Inbox) and a stalled **reaper** is nearly harmless at
  this volume, but a stalled **heartbeat** is genuinely invisible — a reminder that never
  fires produces no symptom. That is a real, currently-unmitigated silent-failure risk. It
  is deferred because its consequence at one user with four tasks is a missed reminder, not
  because it is invisible. If the owner disagrees, the cheapest mitigation is a
  `heartbeat_runs` freshness read on an existing page — hours, not a slice.*
- **Retention / purge** (M6) — trigger is "before the first pilot". → Phase 2H.
- **Deploy runbook, backup/restore** (M19/M20) — → Phase 2H, where they belong with the
  work they gate.
- **New Projects/People fields** (2G-2) — no demand signal in either direction.
- **`audit_logs.operation_id`** (2G-3) — internal architecture with no reader; UX-27 is
  RETAINED and truthful.
- **Organizations/contexts surfaces** (2G-4) — real but unrelated; see Owner Decision 8.
- **Semantic retrieval** — `ADR-055` gate unmet; explicitly out.
- **AI provenance `2E-COMMAND-012`** — `ADR-057` reopening gate not executed.
- **Multi-target commands, recurrence, retroactive placement, split/merge** — unchanged
  deferrals.
- **Any second write path to `public.tasks` or a re-grant to `authenticated`.**
- **All three maintenance items** — see §17.

---

## 11. Required owner decisions

Genuine decisions only. Everything the repository can settle has been settled above and is
**not** asked here.

### Decision 1 — Hosted signup posture *(HARD GATE on starting Phase 2G)*

**Question.** Does the hosted Supabase project currently accept open self-service signup?
**Why the owner.** Not determinable from the repository (§2.2); it lives in the dashboard.
**Options.** (a) It is already disabled/invite-only — confirm and record.
(b) It is open — close it, and build the invite gate the record already claims exists
(`TODO.md:191`), before Phase 2G is planned.
**Recommendation.** Answer this **first**, and treat (b) as blocking. *(This was written as
a parallel item in the first draft of this study; the adversarial review in §19 corrected
it.)* If hosted signup is open, a stranger can reach `capture_entry_async` through
PostgREST and the `pg_cron` drain will spend the owner's OpenAI budget unattended — with no
deployment of the application involved. That is C1 live, today, and the correct first
response is a closed signup and a gate, not a rate limiter and not a phase. Adding a
conversational surface on top of an open one would be building on the hole.
**Impact.** Determines whether C1's residual exposure today is theoretical or live, and
whether Decision 5's per-user-only recommendation survives.
**Reversibility.** Fully reversible.
**Blocks.** **Phase 2G's start, if the answer is (b).**

### Decision 2 — Near-term rollout posture

**Options.** (a) Single owner, no deployment, indefinitely. (b) Deploy for the owner only,
signup closed. (c) Invited private users. (d) Limited beta. (e) Public signup.
**Recommendation — (b), and schedule Phase 2H before (c).** Deploying for one user makes
every operational item in Phase 2H *testable*, which they are not today, without exposing
anything.
**Impact.** Sets Phase 2H's trigger and content.
**Reversibility.** (a)–(c) reversible; (d)/(e) are not — you cannot un-expose a URL.
**Blocks.** Phase 2H's scope; the urgency of C1b, H7, H8, M6.

### Decision 3 — Does capture routing belong in Phase 2G?

**Options.** (a) Yes — the composer may capture, with the telemetry migration and the spend
ceiling. (b) No — the composer creates tasks only; `/app/capture` stays the capture
surface.
**Recommendation — (a)**, because a composer that refuses "registre que preciso enviar o
relatório" is only half a composer, and because the ceiling it forces is worth having
anyway. But **(b) is a defensible, strictly cheaper phase** with zero migrations.
**Impact.** Determines whether the phase has a migration, a new spend path and a fifth
slice.
**Reversibility.** The routing is; the telemetry allowlist widening is permanent schema
(additive).
**Blocks.** Decisions 4–6 are only live if this is (a).

### Decision 4 — AI spend policy value

**Question.** What daily per-user ceiling?
**Why the owner.** It is a money decision, not an engineering one.
**Options.** A daily USD figure (e.g. 0.50 / 2.00 / 5.00), or a token-equivalent.
**Recommendation.** A daily figure set well above the owner's own realistic use, so it is a
runaway guard rather than a UX constraint. The ledger already prices every call, so the
owner can read a real number before choosing.
**Impact.** The cap's value; nothing structural.
**Reversibility.** Fully — it is configuration.
**Blocks.** Slice ordering only.

### Decision 5 — Global versus per-user caps

**Options.** (a) Per-user only. (b) Global only. (c) Both.
**Recommendation — (a) now, (c) at Phase 2H — but only if Decision 1 returns (a).**
*(Conditional added by §19's review.)* Per-user is what the existing owner-scoped
`get_ai_cost_summary` supports without a new privileged reader. **A per-user cap is
worthless against open signup**: N accounts each under the ceiling aggregate without
limit, and the ceiling would be protecting the attacker's convenience rather than the
owner's card. If hosted signup is open and stays open, per-user-only is not a defensible
choice and the global aggregate moves into Phase 2G with the ceiling.
**Impact.** Whether a privileged service-role aggregate reader is in scope.
**Reversibility.** Additive.
**Blocks.** Nothing — but it is decided *by* Decision 1, not independently of it.

### Decision 6 — Behaviour at the cap

**Options.** (a) Refuse the AI step with a localized, honest message; deterministic paths
keep working. (b) Degrade to a cheaper model. (c) Queue until the window rolls over.
**Recommendation — (a).** It is the only option that is honest, testable and consistent with
this codebase's refusal vocabulary. (b) silently changes output quality; (c) invents a
delivery promise the product cannot keep.
**Impact.** Copy, one refusal member, the tests that prove it.
**Reversibility.** Yes.
**Blocks.** The ceiling slice's acceptance criteria.

### Decision 7 — May conversational creation execute immediately, or must it preview?

**Options.** (a) Preview then confirm, reusing the deployed
`issue_task_command_creation_confirmation` token — identical to today's no-match offer.
(b) Immediate creation with undo.
**Recommendation — (a).** The confirmation machinery already exists and is already the
path manual creation takes; (b) would be a *new* posture for an AI-proposed domain write,
which `ENGINEERING_STANDARDS.md` treats as requiring confirmation, and would need its own
justification.
**Impact.** Whether the phase changes a security posture at all. Under (a) it does not.
**Reversibility.** Yes.
**Blocks.** Slice 2G.2's design.

### Decision 8 — Which object types may conversational creation create?

**Options.** (a) Tasks only. (b) Tasks + entries (i.e. Decision 3 = yes). (c) Tasks +
entries + reminders. (d) Add projects/people/contexts.
**Recommendation — (a) or (b), per Decision 3. Not (c) or (d).** A task-less reminder has
**no validated authoring contract** — `createReminder` is the Option C direct-INSERT
exception, and `SECURITY.md:100` states that a conversational authoring surface is exactly
the condition that would require revoking it. Creating reminders by voice would reopen a
posture Phase 2F just closed. Projects/people/contexts creation is a plain RLS insert
(`operations/actions.ts:155`) with no command contract at all.
**Impact.** Prevents the phase from silently reopening the reminder exception.
**Reversibility.** Adding types later is additive; reopening a revoked grant is not.
**Blocks.** The phase's non-goals list.

### Decision 9 — Projects/People new fields (2G-2)

**Options.** (a) Not now; revisit on evidence. (b) Add project purpose/start/target now.
(c) Add a person-level role now.
**Recommendation — (a).** There is no demand signal in either direction (§2.3), and
`people.notes` already exists so one of the four named candidates is not missing at all.
**Reopening condition, so this is a decision and not a silence:** revisit when the product
has ≥2 real users **or** when a project's own detail page shows a field the owner has been
working around — measurable from the edit surface F2 shipped.
**Impact.** Keeps permanent schema out of a phase that has no use for it.
**Reversibility.** Additive migrations are cheap to add, permanent once added.
**Blocks.** Nothing.

### Decision 10 — Is audit grouping product value or internal architecture? (2G-3)

**Options.** (a) Internal architecture — defer until a reader wants it.
(b) Product value — a History surface that groups an operation's rows.
**Recommendation — (a).** UX-27 is RETAINED because the rows are truthful today. `M18`
(22 events, one purpose-built reader) is the standing evidence that this codebase
instruments faster than it reads. Build the grouping when a surface asks for it.
**Impact.** Keeps ~1,460 lines of `create or replace` out of a phase that does not need it.
**Reversibility.** The column is additive and nullable; adding it later costs the same.
**Blocks.** Nothing.

### Decision 11 — Do organizations and contexts deserve first-class surfaces? (2G-4)

**Options.** (a) Yes, now, as a trailing Phase 2G slice. (b) Yes, as its own small phase or
slice after 2G. (c) No.
**Recommendation — (b).** It is real and cheap, but it shares no architecture with
conversational creation, and folding it in is how a phase becomes a grab bag. Note the
correction in §2.7: the honest scope is **list + detail** for two entity types, not "detail
routes".
**Impact.** Phase coherence.
**Reversibility.** Read-only, no migration — the most reversible item in the study.
**Blocks.** UX-04's outcome section stays degraded until it ships.

---

## 12. Likely migrations and privileged boundaries

**If Decision 3 = (b) — no capture routing:** **zero migrations.** No new privileged
boundary of any kind. Every write goes through `create_task_command`, unchanged.

**If Decision 3 = (a) — with capture routing:**

| Change | Kind | Boundary |
| --- | --- | --- |
| `create or replace private.validate_product_event_properties` — widen `captureSource` | additive allowlist | none new; the validator is already `SECURITY DEFINER` and internal |
| Per-user daily spend ceiling | a policy store the user cannot write, plus a pre-check | **one new `SECURITY DEFINER` pre-check**, because the check must be authoritative in the database (see the design note below) |

**Where the ceiling may not live — verified, not assumed.** `agent_preferences` grants
`select, insert, update, delete` to `authenticated` and carries an own-row `update` policy
(`202607160001:61-66`). Storing a cap there would let the account it constrains raise it.
The first draft of this study proposed it as the cheap option; §19's review removed it. The
ceiling belongs in a table with no `authenticated` write grant, or as a server-side
constant with per-user overrides written only by a definer path.

**Explicitly not in scope:** any `grant` widening; any change to `public.tasks` or
`public.reminders` privileges; any new `RETURNS TABLE` shape; any drop-and-recreate.

**A design note that should be settled in the PRD, not in code.** Whether the spend check
is a Server Action guard or a database pre-check is a real fork. The Server Action version
is trivial and covers every product path. The database version is the only one that also
covers the **worker** — which is the path capture routing actually creates, and which runs
as `service_role` outside any Server Action. If capture routing ships, the check must reach
the worker, or it does not bound the path it exists for.

---

## 13. Dependency order

```
Decision 1 (hosted signup)  ──►  independent hardening, before or beside everything
                                  (signup gate — hours, no phase)

Decision 2 (rollout)        ──►  Phase 2H trigger and content

Decision 7 (preview posture) ─┐
Decision 8 (object types)    ─┼─►  2G.1  create-intent contract  (no write path change)
                              │         │
                              │         ▼
                              └──►  2G.2  routing to the deployed creation family
                                        │
Decision 3 (capture routing) ──────────►│
Decisions 4/5/6 (spend policy) ────────►▼
                                    2G.3  capture routing + spend ceiling  [conditional]
                                        │
                                        ▼
                                    2G.4  convergence and closeout

Decision 9/10/11  ──►  each terminates outside this phase
```

**Hard ordering rules.** 2G.1 before 2G.2 (a contract before its consumer, the Phase 2E
precedent). The spend ceiling **inside** 2G.3, never after it — a new unattended spend path
must not exist unbounded for the length of a slice.

---

## 14. Proposed slice outline

| Slice | Name | Delivers | Migration | Owner decisions consumed |
| --- | --- | --- | --- | --- |
| **2G.1** | The create intent contract | A sixteenth verb in `TASK_COMMAND_ACTIONS`; the model-contract, prompt and schema update in the one importable module (`ADR-039`'s shape); the `TASK_COMMAND_POLICY_VERSION` bump and its fingerprint/confirmation-invalidation consequence, exercised; no matcher change, no RPC, no UI | **none — established by an executed inventory gate** (§2.4), not assumed | 7, 8 |
| **2G.2** | Creation from the composer | Routing a create intent to `preview_task_command_creation` → `issue_task_command_creation_confirmation` → `create_task_command`; the preview, the confirm control, undo through the existing registered handler; `unsupported_action` narrows to what it truly cannot do; authenticated journeys | none | 7 |
| **2G.3** *(conditional)* | Capture routing and the spend ceiling | The `captureSource` allowlist migration with its own composer value; composer → `captureEntry`; **and, in the same slice**, the per-user daily ceiling that bounds the new path — reaching the worker (§12), stored where the user cannot write it, with a decided posture for a failed ledger write (**R10**) — plus `max_output_tokens` on every operation as the ceiling's other half | 1–2 | 1, 3, 4, 5, 6 |
| **2G.4** | Convergence and closeout | Traceability matrix (fail-closed generator), cleanup verifier, remote smoke, the full authenticated set desktop + mobile in both locales, ADRs, `STATE`/`TODO`/`CHANGELOG`/`SECURITY` reconciliation, and — if 2G.3 shipped — a measured statement of what the funnel now contains | none | — |

**Four slices, or three if Decision 3 is (b).** Compare Phase 2F's six and Phase 2E's
eight: this is deliberately the smallest coherent phase in the project's recent history,
because most of its infrastructure was built by the two phases before it.

---

## 15. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| **R1** | The create verb and the deployed creation RPC drift — the taxonomy says one thing, `create_task_command` validates another | Medium | High — a refused create with a database error instead of a product refusal | The Phase 2E precedent: one importable contract module, parity asserted by test (`extraction-parity.test.ts` / `ADR-039` shape). No hand-copied verb list |
| **R2** | The policy-version bump invalidates something live and nobody notices | Low (empty funnel) | Medium | Exercise the invalidation in 2G.1 rather than reasoning about it. `PHASE_2F_SLICE_05_REPORT.md`'s lesson applies: *a check that reads its own input proves nothing* |
| **R3** | Capture routing's spend ceiling is enforced in the Server Action only, so the worker path — the one it exists for — is unbounded | **Medium-high if not designed for** | High | §12's design note is a PRD gate, not an implementation detail. The check must reach `service_role` |
| **R4** | A stalled heartbeat is invisible and Phase 2G does not fix it | Medium | Medium — a reminder that never fires | Accepted and named (§10). Cheapest mitigation is a `heartbeat_runs` freshness read; offer it to the owner as an out-of-phase item |
| **R5** | The phase creates a second creation path by accident (e.g. a shortcut insert for the "simple" case) | Low | **Critical** — it would undo Phase 2F's invariant | Extend the existing fail-closed guard (`src/lib/supabase/direct-write-guard.test.ts`): the `tasks` allowlist stays empty and the build reds if it does not |
| **R6** | Conversational creation duplicates capture — the user says "registre que…" and gets a task where they wanted an entry, or vice versa | **Medium — this is the phase's sharpest product risk** | Medium | The routing decision must be *declared data*, as `routing.ts` already is, and the preview must state which object type will be created before anything is written. Never a heuristic behind a silent write |
| **R7** | Adding a verb makes the model over-classify, turning questions into task creations | Medium | Medium | The confirm-before-write posture (Decision 7 = (a)) makes every misclassification a visible, discardable preview rather than a row |
| **R8** | Phase 2H never happens and the operational items age another cycle | **Medium — it has now happened twice** | High at deployment | Phase 2G's closeout must re-raise C1/H7/H8/M6 the way 2F's did (`SECURITY.md:173`), and Decision 2 must name Phase 2H's trigger explicitly |
| **R9** | The funnel stays empty because the owner does not use the feature, so the phase produces capability but not evidence | Medium | Medium | Not mitigable by engineering. Named so the `ADR-055` expiry on 2026-10-27 is not mistaken for a verdict on embeddings |
| **R10** | **The spend ceiling reads a fail-open ledger.** `recordAIUsage` logs and continues on failure (`usage.ts:40-57`), so whatever breaks the ledger write also makes the cap read low — the cap's bypass and the ledger's failure mode are the same event | **Medium** | **High** — a control that silently stops controlling | Found by §19's review, not by the first draft. The PRD must decide the failure posture explicitly and prove it: either the operation fails closed when its ledger row cannot be written, or the tolerance is stated with its consequence |
| **R11** | **A per-user cap is worthless against open signup.** N accounts each under the ceiling aggregate without bound | Low if Decision 1 = (a); **High** if (b) | High | Decision 1 is a hard gate; Decision 5's per-user-only recommendation is conditional on it |
| **R12** | The create verb is sold as new capability when it is an addressability fix (§2.4), and the phase is judged against an inflated promise | Medium | Low-Medium | Stated in §2.4 and in the acceptance question. The phase's value claim is "the natural sentence works", not "the product can now create" |

---

## 16. Acceptance philosophy

Unchanged from Phases 2E and 2F, and it is the reason this study is worth its length:

1. **A gate that has never run is a claim, not a check.** Every acceptance gate in the PRD
   must be designed to be executed, and executed before the slice is accepted.
2. **A check that reads its own input proves nothing** (`PHASE_2F_SLICE_05_REPORT.md`). The
   parity test must read the emitter; the invalidation test must read the stored
   fingerprint; the guard must read the allowlist.
3. **Isolation assertions must be non-vacuous** — the owner's positive count is asserted
   before the stranger's absence (`2F-OWNERSHIP-001`).
4. **Every partial stays labelled partial; every deferral keeps a destination.**
5. **The phase's invariant is guarded mechanically, not by prose** — the empty `tasks`
   direct-write allowlist reds the build if a second creation path appears.
6. **No migration is written before its gate's artifact is in the repository**
   (`PHASE_2F_PROPOSAL.md` §15). For 2G.3 that artifact is the spend-ceiling design note
   resolving §12's fork.

**The phase's single acceptance question.** *Can the owner create a task — and, if
Decision 3 is (a), an entry — by typing a sentence into the composer, see exactly what will
be created before it exists, undo it, and be stopped by a ceiling before an unattended path
can spend without bound?*

---

## 17. Maintenance work kept outside the phase

None of the three is Phase 2G product scope. Each is named with its own destination and a
recommended execution order.

| ID | Work | Why it is not the phase | Recommended order |
| --- | --- | --- | --- |
| **M2** | `.gitattributes` with `*.sql text eol=lf` | Repository hygiene. Fixes two Windows-only failures in `src/features/task-commands/sql-reachability.test.ts` (`202607260059` checks out with 3,256 CRLF pairs and zero bare LF against `\n`-anchored multi-line literals). Linux CI is green and is the proof | **First — before any Phase 2G branch.** It is a one-line file, and a local suite that is red for a known non-reason trains everyone to ignore red |
| **P1** | Scheduled full authenticated regression | Process, not product. Run the complete authenticated set serially or through a controlled queue to avoid shared-project auth rate limiting; report independently of per-slice journeys. `STATE.md` records that this is what would have caught UX-35 three slices earlier | **Second — establish the baseline before Phase 2G changes behaviour**, so a regression has something to be measured against |
| **M1** | Localization maintenance (UX-22) | The one DEFERRED finding. 266 inline locale ternaries across 34 non-test files; changes no product behaviour. Re-measure with `git grep -oE '\bpt \?' -- src/` excluding tests; trajectory 288 → 266. `settings-form.tsx` (53) and `costs/page.tsx` (37) are 34 % between them | **Its own slice, after Phase 2G.** Ship the non-increase guard *first* even if the sweep waits — its absence is why four slices raised the count unnoticed |

**One addition this study recommends, which is not on the maintenance list and is not a
phase:** implement the **signup gate** that `TODO.md:191` records as an existing
mitigation and that §2.2 shows does not exist. It is hours of work, it closes the only
place where the security record and the code disagree, and it should not wait for a phase
boundary.

---

## 18. Final recommendation

**Adopt Alternative D.**

> **Phase 2G — Conversational Creation.** Four slices (three if capture routing is
> declined). The create verb rides the creation contract Phase 2E built and Phase 2F
> consolidated; the phase adds no second write path, no grant, and — unless capture
> routing is chosen — no migration. If capture routing is chosen, the per-user spend
> ceiling ships in the same slice and must reach the worker.
>
> **Phase 2H — Deploy and Operate.** Deployment (`M19`/`M20`) together with C1's rate
> limiting, H7's error sink, H8's dead-man switch and M6's retention — because they share
> one trigger, and because deployment is what finally makes them testable.
>
> **Now, outside both:** answer Decision 1, close hosted signup if it is open, and build
> the invite gate the record already claims.

**Why not C1 first.** Not because C1 is unimportant — because C1's own trigger has not
occurred, its interim mitigation was never built (which is a *smaller* and *more urgent*
fix than a phase), and a rate limiter cannot be validated against a surface nobody can
reach. Deferring C1 a third time would be wrong; **splitting it** — building the ceiling
this phase's own path needs now, and the rest with the deployment that gives it meaning —
is not.

**Why conversational creation.** It is the only candidate with a gap provable from code
today, the only one whose infrastructure is already deployed and adversarially reviewed,
and the only one that generates the usage every deferred evidence gate in this repository
is waiting on. `ADR-055` expires on **2026-10-27**. If Phase 2G builds instruments instead
of the feature that feeds them, that gate expires because nobody typed a command — and the
repository will have measured its own silence.

**One condition on all of the above.** Decision 1 is a hard gate. If hosted signup is open,
nothing in Phase 2G starts until it is closed and the invite gate exists — because a
conversational surface over an open signup is a bigger version of the hole C1 has been
describing since the architecture review.

---

## 19. Adversarial review of this study

Eight attacks were run against the first draft, per the review requirement. Four changed
the recommendation's content; one changed its ordering; three were answered without change.
Every correction is applied above and marked at the point of change.

### Attacks that changed the study

**1. "Your spend cap can be raised by the account it constrains."**
**Conceded — the sharpest finding.** The first draft offered `agent_preferences` columns as
the cheap home for the ceiling. `202607160001:61-66` grants `update` on that table to
`authenticated` with an own-row policy. A hostile account would simply raise its own cap.
§12 now states where the ceiling may not live, and why, from the grant rather than from
judgement.

**2. "Your cap reads a ledger that fails open."**
**Conceded.** `recordAIUsage` (`usage.ts:40-57`) logs and returns `false`; it never throws
and no caller reacts. The event that loses a cost row is the same event that makes the cap
read low. This is a genuine bypass and the first draft did not contain it. Added as §2.1's
last row and as **R10**, with the PRD obligation to decide the failure posture.

**3. "C1 is live right now and you filed it as a parallel item."**
**Conceded on ordering.** The draft correctly identified the PostgREST + `pg_cron` path
(§2.2) and then recommended answering Decision 1 "first, then build the gate" — as work
beside the phase. If hosted signup is open, that path is C1 happening, and building a
conversational surface on top of it is indefensible. Decision 1 is now a **hard gate on
starting Phase 2G**, and Decision 5's per-user-only recommendation is now conditional on
its answer (**R11**).

**4. "Your phase contains an operational item its own rule excludes."**
**Conceded.** The draft's scope rule is *"only the controls this phase's own new spend path
requires"*, and then item 5 (`max_output_tokens` everywhere) bounded **existing** paths.
That is the grab-bag shape the study claims to avoid. It is now bound to item 4 with the
argument that makes it legitimate — a daily budget checked *before* a call cannot bound a
single call that runs away, so the two are one control — and it leaves the phase if the
ceiling does.

### Attacks answered without change

**5. "Conversational creation duplicates capture and manual task creation."**
**Partly conceded, and the concession is recorded rather than argued away.** Three creation
paths already exist: `/app/capture`, manual creation on Work (routed onto the same family
by Slice 2F.3), and the composer's own no-match offer. The create verb adds no destination.
What it adds is that the **natural sentence** reaches the destination — today the owner
must phrase a creation as a failed mutation. §2.4 now says this in the phase's own words:
*an addressability fix, not a new capability* (**R12**). The value survives the correction;
the marketing does not. The task-versus-entry confusion risk is separately held as **R6**,
with the mitigation that the preview must name the object type before anything is written.

**6. "Is Phase 2H just deferral with a nicer name?"**
**Answered, with a hardening.** It would be, if it had no trigger — and this repository has
now deferred C1 twice. Two things make 2H different from a third deferral: it is bound to
an event the owner controls and must name in Decision 2 (deployment), and pairing the
operational items *with* deployment is what finally makes them testable — you cannot
validate a rate limiter against a surface nobody can reach. **R8** carries the residual
risk and requires Phase 2G's closeout to re-raise C1 the way `SECURITY.md:173` did.

**7. "Operational work deferred because it is invisible."**
**Answered on the merits, and one item conceded as genuinely invisible.** Of the three
`pg_cron` schedules, a stalled entry drain is visible on the Inbox and a stalled reaper is
near-harmless at this volume — but a **stalled heartbeat produces no symptom at all**. That
is deferred because its consequence at one user with four tasks is a missed reminder, not
because it cannot be seen; §10 now says so explicitly and names the hours-scale mitigation
rather than leaving the reader to assume it was overlooked. The genuinely invisible risk the
draft *had* missed was not a cron at all — it was R10's fail-open ledger, which attack 2
found.

**8. "Does the phase contain speculative schema work?"**
**Answered.** At most one additive telemetry allowlist widening, required by a decided
feature, plus a spend-policy store that exists only if the ceiling does. Zero speculative
columns. The three candidates that *would* have been speculative — 2G-2's project fields,
2G-3's `operation_id`, and any reminder-authoring contract — are all excluded, and 2G-2 is
excluded on the explicit ground that "no evidence" is not "evidence of no need", with a
measurable reopening condition instead of a silence. The draft's one unhedged schema claim
("the create verb needs no migration") has been re-verified against the event validator,
the analytics payloads and the confirmation CHECK, and is now additionally required to be
re-established by an executed inventory before 2G.1 is planned rather than inherited from
this document.

### What this review did not do (as of the first draft)

It did not re-derive the repository facts in §1–§2; those were verified once, in this
session, against the files cited. It did not attack the owner decisions as decisions — only
the recommendations attached to them, two of which changed. And it found no reason to
prefer Alternative A or the unbounded Alternative C over the recommendation, which is worth
saying explicitly: the strongest attack on the recommendation was not *"the phase is
wrong"* but *"the phase is fine and you are starting it over an open door"* — which is why
Decision 1 moved from a footnote to a gate.

**What it could not do, and what §20 corrects.** This review attacked the study's
*reasoning*. It could not attack its *evidence base*, which was the repository — and the
repository does not record what a page looks like to someone using it. §20 exists because
the owner used the product and found something no amount of grep would have surfaced: a
page that reads four relationship surfaces nothing can write.

---

## 20. Amendment — entity graph evidence from real owner use

**Added 2026-07-31, after §1–19 were complete and reviewed.** Source: the owner's review of
the Person detail/edit surface. Full findings record:
[`ENTITY_GRAPH_FINDINGS.md`](./ENTITY_GRAPH_FINDINGS.md), which files nine observations
(EG-01 … EG-09) with verified dispositions. This section carries only what changes the
phase definition.

### 20.1 The new evidence

On the Person record for *Camila*, the edit surface offers **name, notes, company** and
displays four sections — relationship to you, contexts, pending tasks, shared projects —
all empty, all unreachable. There is no way to record that Camila is the owner's wife, no
way to create an organization the Company selector could offer, and no Organizations or
Contexts route at any level.

**All nine observations were verified against the migration chain and confirmed.** This is
direct user evidence, and it is a materially different class from everything in §2.3: it is
neither *no evidence* nor *evidence of no need* nor *instrumentation unable to answer*. It
is **a defect observed in use**.

### 20.2 What the repository says — the decisive fact

| Object | RLS | `authenticated` grants | Ownership proof | **Write path today** |
| --- | --- | --- | --- | --- |
| `organizations` | forced + 4 own-row policies | `select, insert, update, delete` | `user_id` + RLS | **AI extraction only** |
| `contexts` | forced + 4 own-row policies | `select, insert, update, delete` | `user_id` + RLS | **AI extraction only** |
| `person_relationships` | forced + 4 own-row policies | `select, insert, update, delete` | **composite FKs** → `people (user_id, id)`, both columns | **none — nothing has ever written it** |
| `person_contexts` | forced + 4 own-row policies | `select, insert, update, delete` | composite FKs → `people` **and** `contexts` | trigger only (`link_interpreted_entities`) |
| `person_projects` | forced + 4 own-row policies | `select, insert, update, delete` | composite FKs → `people` **and** `projects` | trigger only |
| `people.organization_id` | via `people` | writable | FK | `updatePerson` — Server Action + Zod + audit (Slice F2) |
| `projects.organization_id` | via `projects` | writable | FK | `updateProject` — same |
| `person_projects.role` | via table | writable | — | **none** — the trigger never sets it, so it is structurally always `null` on two pages that display it |

Sources: `202607160003:1-45,185-197`; `202607160009:6-27,60-73`; `202607160011:1-2`;
`202607170016:74-88`; `entities/actions.ts:92,152`; `entities/organizations.ts:33`.

> **Every object the owner needs already has forced RLS, four own-row policies, full
> `authenticated` CRUD, `anon` revoked, and — for all three relationship tables —
> composite-foreign-key ownership proof on both endpoints. The requested lifecycle needs
> zero migrations, zero grants and zero new privileged boundaries.**

Soft-end semantics are already modelled too: `valid_from`/`valid_until` exist on all three
relationship tables, every consumer already filters `.is("valid_until", null)`, and partial
unique indexes already enforce one live link per pair. Ending a relationship needs a
control, not a schema.

### 20.3 Missing UI, or missing domain capability?

**Missing UI, in eight of nine observations.** The domain model is complete, owned,
constrained, and already *read* by the product.

**One genuine gap, and it is a vocabulary rather than a column.**
`person_relationships.relationship_type` is bare `text` with no CHECK anywhere and no
TypeScript vocabulary; the Person page renders it raw
(`people/[personId]/page.tsx:111`). "Wife / Esposa" needs a typed, localized relationship
vocabulary — which this repository builds in TypeScript (`taxonomy.ts`,
`history/vocabulary.ts`, **ADR-064**), not as a database constraint. Following that
precedent keeps the work at zero migrations; a CHECK would be a migration, would be
permanent, and would turn any future extraction-written value into an insert failure
instead of a rendering fallback.

**The Camila scenario is representable today with no schema change.** `related_person_id`
is **nullable**, and a null already means "related to the owner" — so
`{person_id: Camila, related_person_id: null, relationship_type: 'spouse', description}`
is the row. `contexts.kind` already carries the literal `'personal'`. `people.organization_id`
is already writable and already independent. **The model already separates a personal
relationship from an employer; the form collapsed them by showing only Company.** That is a
UI-composition defect, and it is why the fix cannot be "add a relationship field to the
person form" — the right home is a table that already exists.

### 20.4 Corrected evaluation of candidate 2G-4

§5 rated 2G-4 *"Minor — UX-04 degrades two entity types to plain text"* and §11 Decision 11
recommended a later read-only list/detail slice. **Both are superseded.** The re-evaluation:

| | Original (§5, §11) | Corrected (§20) |
| --- | --- | --- |
| Severity | Minor | **Significant — a surface that advertises four capabilities and provides zero paths to any of them** (EG-09) |
| Evidence class | Architectural | **Observed in real use** |
| Scope | Read-only detail routes for two entity types | **Create + read + update + soft-end**, across two entity types **and three relationship tables** |
| Migration | none | **none — confirmed, and now on much stronger evidence** |
| Coupling to Phase 2G | none | **a real dependency** — see §20.5 |

**Read-only routes are insufficient, for three checkable reasons.** (1) They do not clear
EG-04's dead end — a read-only organizations page renders the same emptiness on a second
screen and still owns no remedy. (2) The tables the owner needs are *relationship* tables;
detail pages for organizations and contexts touch none of `person_relationships`,
`person_contexts` or `person_projects`, so they address EG-05 and EG-06 and none of the
other seven. (3) They leave EG-09 — the governing finding — entirely untouched.

**Nothing in the closed UX ledger was wrong.** UX-08/UX-09 scoped themselves to surfacing
existing *columns* and explicitly deferred new write surfaces under `DEC-4`; UX-04 scoped
itself to not linking what it cannot open. Those dispositions were correct as scoped. This
is new territory, which is why it has a new record.

### 20.5 The dependency on Phase 2G — stated, because it is the load-bearing argument

Phase 2G's create verb routes to `create_task_command`, whose relation actions
(`assign_project`, `assign_context`, `assign_person`) resolve against *owned* projects,
contexts and people. Today **a context or an organization can only come into existence by
AI extraction.** A user who types *"adicione uma tarefa para o projeto Casa no contexto
Pessoal"* can get the task, and cannot have created the context by hand.

Conversational creation over an entity graph the user cannot populate is a half-feature —
and worse, it would ship a *new* surface on top of one already found to advertise what it
cannot do. That is not sequencing preference; it is the same defect class arriving twice.

### 20.6 Revised alternatives

**Alternative A — Entity Graph Completion before Phase 2G.** *(the owner's preliminary
preference)*
Complete the existing Person / Project / Organization / Context lifecycle. No new fields.
No conversational scope. Then begin Phase 2G from a baseline where every surface is
truthful.
- *User value* — high and immediate; it makes the product's own data model usable.
- *Migrations / grants / privileged boundaries* — **zero, zero, zero** (§20.2).
- *Risk* — low. Precedent set by Slice F2 two days ago; the write posture is already
  chosen (§20.7).
- *Cost* — 2–3 slices, no database work, no deployment step.
- *Coherence* — **high.** One objective: *the entity graph the product already stores is
  reachable by its owner.*
- *Cost to Phase 2G* — a delay measured in slices, against an `ADR-055` expiry ~88 days
  out. Not a real conflict.

**Alternative B — an Entity Graph slice inside Phase 2G.**
- Fails the study's own coherence rule (§16, and §6's verdict on unbounded Alternative C):
  the phase would carry two unrelated acceptance questions — *"can the owner create by
  typing?"* and *"can the owner reach the entity graph?"* — sharing no architecture, no
  contract and no evidence. **Rejected.**

**Alternative C — defer.**
The study was asked to explain how the Person and Project UI remains truthful without this
work. **It does not, and that is the finding.** Four sections advertise lifecycle behaviour
with no reachable path; the Company selector reports emptiness while owning no remedy; and
`person_relationships` is read from a table nothing writes. Deferring is only available
after *removing* those sections — a regression in a different direction, and a reversal of
what the UX remediation just shipped. **Rejected on the evidence.**

### 20.7 Write posture the completion must follow

**Server Action + Zod + `audit_logs` row** — the Slice F2 precedent
(`entities/actions.ts:92`, `:152`), not the task-command RPC contract. That contract exists
because `public.tasks` had two write paths and needed one; these tables have zero user
paths and need one. Two inherited properties stated rather than assumed:

- **The audit row is self-reported.** F2 inserts `audit_logs` from the client role, and
  `authenticated` retains `INSERT` there (2F-TESTMIG-007). Extending that posture is
  consistent; calling it database-enforced would not be.
- **Phase 2F's invariant is untouched.** It is scoped to `public.tasks` plus the bounded
  `public.reminders` exception, guarded by `direct-write-guard.test.ts` with an empty
  `tasks` allowlist. None of the eight objects is `tasks` or `reminders`; the guard stays
  green and unchanged, and that must be an acceptance gate rather than an assumption.

### 20.8 Revised sequence

```
   Decision 1 (hosted signup)          ── hard gate, unchanged (§11)
        │
        ▼
   Entity Graph Completion             ── NEW, before Phase 2G
   ├─ EGC.1  organizations + contexts: list, create, inspect, edit;
   │         `createRecord` gains two kinds; contextual create from
   │         the Person and Project forms (closes EG-03…EG-06, EG-08)
   ├─ EGC.2  person relationships: typed localized vocabulary, create,
   │         edit, soft-end via `valid_until`; person↔context and
   │         person↔project association with `role`; safe removal
   │         (closes EG-01, EG-02, EG-07, EG-09)
   └─ EGC.3  convergence: no empty section without a reachable path,
             asserted over the route inventory (ADR-066's shape)
        │
        ▼
   Phase 2G — Conversational Creation  ── §7–§14, unchanged
        │
        ▼
   Phase 2H — Deploy and Operate       ── §18, unchanged
```

Maintenance order from §17 is unchanged and still runs first: `.gitattributes` (M2), then
the scheduled authenticated baseline (P1) — and P1 is now *more* valuable, because it would
establish the regression baseline before two initiatives change entity surfaces.

**Naming.** "Entity Graph Completion" is proposed rather than assumed; the owner called it a
*post-UX entity-completion patch*. It is not a patch by this repository's standards — it
ships user-visible capability across five tables — but it is smaller than a phase. A
numbered slice set between the closed UX loop and Phase 2G fits the precedent that Slices
A–H set. **Owner Decision 12 settles the name.**

### 20.9 Revised Decision 11

> **Decision 11 (REVISED) — Entity graph completion: before Phase 2G, inside it, or later?**
>
> *Supersedes the original Decision 11, which recommended a later read-only slice on
> incomplete evidence.*
>
> **Options.** (a) A focused Entity Graph Completion slice set **before** Phase 2G.
> (b) A slice **inside** Phase 2G. (c) Defer.
>
> **Recommendation — (a), which matches the owner's preliminary preference and is supported
> independently by the evidence rather than by deference.** Four reasons, each checkable:
> the work needs **zero migrations, zero grants and zero new privileged boundaries**
> (§20.2); the write posture is already precedented by Slice F2 (§20.7); Phase 2G's
> relation actions depend on an entity graph the user can populate (§20.5); and (c) is
> unavailable because the current surface is not truthful (§20.6). (b) is rejected on the
> study's own coherence rule.
>
> **Impact.** Inserts 2–3 slices before Phase 2G. Removes 2G-4 from the Phase 2G candidate
> list entirely — it is absorbed, and enlarged, by this work.
>
> **Reversibility.** The highest of any item in this study: no schema, no grants, no
> deployment. Every change is application code over already-owned tables.
>
> **Blocks.** Phase 2G's start, if (a). Nothing, if (b) or (c).

### 20.10 What this amendment explicitly does not authorize

- **No new persisted fields.** Verified across all eight objects. This amendment is
  evidence *for* the surface-before-you-add rule, not against it, and it **does not reopen
  Decision 9** (project purpose / start / target dates) — those stay out on unchanged
  grounds. That the owner's entire scenario is representable with zero new columns is the
  strongest available argument that 2G-2 was correctly deferred.
- **No CHECK on `relationship_type`** (§20.3).
- **No person-to-person relationship graph** beyond the nullable `related_person_id` that
  already exists.
- **No change to the closed UX ledger**, its counts or its dispositions. `TODO.md` and
  `STATE.md` gain a pointer to `ENTITY_GRAPH_FINDINGS.md`; `PRODUCT_UX_FINDINGS.md` and
  `PRODUCT_UX_CLOSEOUT.md` are not edited — Slice H's documentation-consistency suite
  asserts their counts and status text, and this evidence is not theirs to carry.
- **No PRD, plan, ADR, requirement ID, migration or product code**, for either initiative.

---

## 21. Amendment — the signup hard gate is now being evaluated through BYOK

**Added 2026-07-31, after §20.** Bounded to recording that Decision 1's hard gate is under
evaluation by a separate study. Nothing in §1–20 is rewritten.

The owner has proposed **BYOK** — self-service signup permitted, but each user must
configure their own OpenAI API key before any AI-backed capability runs, with the owner's
key never used as a fallback. That proposal is evaluated in
[`BYOK_SECURITY_DEFINITION.md`](./BYOK_SECURITY_DEFINITION.md), not here.

**Three findings from that study bear on this one, and only these three:**

1. **Decision 1's hard gate survives BYOK and is not satisfied by it.** BYOK removes one
   consequence of open hosted signup — a stranger spending the owner's OpenAI budget
   through `capture_entry_async` and the `pg_cron` drain (§2.2). It removes none of the
   others: Supabase Auth, email, storage, database growth, job-queue load and PostgREST
   throughput are unchanged, and BYOK **adds** a key-validation oracle that does not exist
   today. Of fourteen controls required before public signup, BYOK addresses one.
   **Decision 1 stands exactly as written in §11.**

2. **§9 items 4–5 and R10 change meaning under BYOK, and are superseded there rather than
   here.** The per-user daily USD ceiling recommended in §9 was justified by the unattended
   drain spending *the owner's* budget. Under BYOK that justification disappears; the
   control that protects the owner becomes an **infrastructure quota** (jobs, rows,
   storage), not a dollar figure. `max_output_tokens` on every operation survives on its own
   merits. **R10 (the fail-open ledger under a cap) is dormant if the ceiling is advisory
   and returns in full if Owner Decision 9 makes any ceiling enforcing.** See
   `BYOK_SECURITY_DEFINITION.md` §14.

3. **Phase 2G's position is unchanged, and BYOK is not a dependency.** Phase 2G adds **no
   new provider call site** — the create verb routes through the existing
   `parseTaskCommand` and capture routing through the existing extraction path — so it does
   not enlarge the BYOK retrofit surface. Entity Graph Completion (§20) is fully
   deterministic and is likewise independent. The recommended order in that study is:
   *BYOK definition → Entity Graph Completion → Phase 2G → BYOK implementation + guards →
   signup hardening → Phase 2H → open signup*, with signup opening gated on a control list
   rather than on a date.

**Nothing in §7–§18 is withdrawn.** The recommended phase name, objective, scope, non-goals,
slice outline and acceptance philosophy stand.

---

## 22. Amendment — Phase 2G now follows BYOK implementation (owner decision)

**Added 2026-07-31.** Append-only; no prior reasoning is rewritten.

The owner has accepted `BYOK_SECURITY_DEFINITION.md` as the architectural basis
(BYOK-DEC-1 … BYOK-DEC-11) and has fixed the roadmap order:

```
1. Entity Graph Completion
2. BYOK implementation initiative
3. Signup hardening
4. Phase 2G — Conversational Creation
5. Phase 2H — Deploy and Operate
6. Open self-service signup — only after every rollout gate is proven
```

**Phase 2G remains recommended and its definition stands. Its position changes.** §16.4 of
the BYOK study placed Phase 2G *before* BYOK implementation, on the ground that Phase 2G
adds no new provider call site and that the project key serving the owner's own account was
the status quo. The owner has decided otherwise, and the reason given is sound and is
recorded here rather than merely accepted:

> Phase 2G extends the composer's AI surface. Implementing it against a project-key design
> that BYOK will immediately replace means writing credential-naïve call sites and then
> rewriting them. Building it against the final per-user credential contract is cheaper and
> avoids a retrofit.

**This supersedes §16.4's sequencing recommendation in `BYOK_SECURITY_DEFINITION.md`, and
that document's own reasoning already conceded the point was a preference rather than a
dependency.** BYOK-DEC-2 also removes the status-quo premise entirely: the project key may
not serve *any* deployed user path, including the owner's, so there is no longer a
"status quo" for Phase 2G to inherit.

**Consequences for this study, and only these:**

1. **§14's slice outline is unchanged**, but slice 2G.1's contract work must resolve its
   credential through the BYOK adapter rather than through `getAIProvider()`'s current
   signature. The BYOK PRD owns that adapter; Phase 2G consumes it.
2. **§9 item 4 (the per-user daily spend ceiling) is withdrawn from Phase 2G scope.** Under
   BYOK-DEC-9 and BYOK-DEC-10, the owner is not the payer and the protective control is an
   infrastructure quota owned by signup hardening, not a USD ceiling owned by Phase 2G.
   §9 item 5 (`max_output_tokens` on every operation) moves to the BYOK initiative, where it
   protects the user's own wallet.
3. **§11 Decision 1 is answered, and the answer is bad.** Hosted signup was measured on
   2026-07-31 via the GoTrue settings endpoint: **`disable_signup: false`** —
   signup is **open**, with `mailer_autoconfirm: false` (email confirmation required) as the
   only mitigation. Per the owner's instruction, closing it is immediate and is **not**
   deferred to any initiative. **BYOK is explicitly not a mitigation for a currently open
   signup path**, and no initiative below may be treated as one.
4. **R10 stays dormant**, per §21 item 2 — unless a later decision makes any ceiling
   enforcing.

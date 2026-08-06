# Phase 2G PRD — Conversational Creation

**Status: GOVERNING — authorized by ADR-083 (owner decision, 2026-08-05).**

This PRD is written against `docs/reports/phase-2g/PHASE_2G_DEFINITION.md` (the
definition study) **as amended by its §20–§22**, and against the owner's Phase 2G
start directive of 2026-08-05. Where this PRD and the study disagree, this PRD
governs; the study is preserved unchanged as the record of how the scope was
decided. The companion plan is
[`PHASE_2G_IMPLEMENTATION_PLAN.md`](./PHASE_2G_IMPLEMENTATION_PLAN.md); the
threat model is
[`docs/reports/phase-2g/PHASE_2G_THREAT_MODEL.md`](../../reports/phase-2g/PHASE_2G_THREAT_MODEL.md).

Starting state, verified 2026-08-05: Signup Hardening complete (SH.0–SH.7),
`main` at `d941359`, hosted migration parity `202608050077`, rollout gate
**25 pass · 3 fail · 2 owner-signature** (re-run live, fail-closed), public
signup disabled at both layers, no production purge authorized or executed.

---

## 1. Objective and invariant

**The unified composer can create, not only mutate — through the creation
contract that already exists, with no second path to `public.tasks`.**

The invariant the phase leaves behind, mechanically guarded like Phase 2F's:

> Every task the composer creates goes through `create_task_command`. There is
> no second creation path, and the direct-write allowlist for `public.tasks`
> stays empty.

Stated honestly, per the study §2.4: the create verb is an **addressability
fix, not a new capability**. The deployed creation family
(`preview_task_command_creation` → `issue_task_command_creation_confirmation` →
`create_task_command`, migration `202607270060`) is complete, adversarially
reviewed, and already has two callers (the no-match offer and manual creation).
What is missing is the classification: `TASK_COMMAND_ACTIONS` holds fifteen
verbs, all mutations, so *"Adicione uma tarefa para revisar os números amanhã"*
is refused `unsupported_action` while the same destination is reachable when a
mutation attempt happens to match no task. The phase's value claim is "the
natural sentence works", not "the product can now create".

## 2. Creation surfaces — what is in, what refuses, and why

Determined from repository truth (study Decision 8, adopted by ADR-083):

| Surface | Posture | Why |
| --- | --- | --- |
| **Task** | **IN — the phase's centerpiece.** Preview → confirm → `create_task_command`. | The only entity with a deployed, validated, undoable AI-creation contract. |
| **Entry (capture)** | **IN — gated slice 2G.3 only.** Composer routes an explicit capture request to `captureEntry`. | `entries.source` already admits `'chat'`; capture is idempotent, quota-bounded (SH.6), BYOK-gated, and async interpretation already carries its own confirmation model for candidate tasks. |
| Reminder | **REFUSED, deterministically.** | A task-less reminder has no validated authoring contract — `createReminder` is the bounded Option C direct-INSERT exception, and `SECURITY.md` names a conversational authoring surface as exactly the condition that would force revoking it. Creating reminders by voice would reopen a posture Phase 2F closed. |
| Project / Person / Organization / Context | **REFUSED, deterministically.** | No command contract exists; manual creation is a plain RLS insert with no preview, fingerprint, audit or undo. Building four new contracts is not this phase and must not ride in as "easy". |
| Event / calendar | **REFUSED, deterministically.** | No `events` table exists at all. |
| Memory | **REFUSED as a *command*; the existing proposal flow is unchanged.** | DEC-5 shipped: the composer already proposes memories through deterministic detection with owner confirmation. That path stays as it is. |
| Person/entity associations | **Out of scope for creation.** | The relation verbs (`assign_project`, `assign_context`, `assign_person`, `set_waiting_on`) already exist as mutations; EGC delivered the manual association surfaces. |

A refused surface gets the phase's refusal vocabulary (§8) — a localized,
deterministic message naming what the composer can create — never a silent drop
and never an invention.

## 3. Requirements

Declared in the repository's declaration shape. The traceability matrix at
closeout resolves every ID.

### 3.1 The create-intent contract (2G-CREATE)

- **2G-CREATE-001:** The command contract recognizes an explicit task-creation
  intent (pt-BR and en phrasings of "add/create a task …") as a first-class
  classification, distinct from the fifteen mutation verbs and from `no_match`.
  The matcher does not run for a creation intent — there is no existing task to
  match.
- **2G-CREATE-002:** A creation intent carries exactly what the deployed
  creation family accepts — title, optional due date, optional priority,
  optional single relation reference — and nothing more. Content the model
  cannot map onto those fields surfaces in the preview as part of the title or
  is dropped visibly; it is never written silently anywhere.
- **2G-CREATE-003:** One importable contract module declares the creation
  intent for prompt, schema and validation, in the ADR-039 shape; a parity test
  reads the emitter. No hand-copied verb list exists anywhere.
- **2G-CREATE-004:** `TASK_COMMAND_POLICY_VERSION` bumps in the same commit
  that changes the taxonomy, and the invalidation consequence is **exercised**:
  a stored fingerprint and an unexpired confirmation minted under the old
  version are proven invalid under the new one by test, not by argument.
- **2G-CREATE-005:** The contract slice's zero-migration claim is
  re-established by an executed inventory (no database object pins the verb
  list; `task_command_confirmations`' CHECK already admits `create_task`) and
  the inventory's transcript is recorded in the slice acceptance report before
  the slice is planned in detail.
- **2G-CREATE-006:** One creation per turn. A sentence proposing several tasks
  yields a clarification, never a batch of writes.

### 3.2 Creation from the composer (2G-ROUTE)

- **2G-ROUTE-001:** A recognized creation intent routes to
  `preview_task_command_creation` →
  `issue_task_command_creation_confirmation` → `create_task_command`. No new
  RPC, no changed grant, no second write path; `direct-write-guard.test.ts`
  keeps its empty `tasks` allowlist and stays green as an acceptance gate.
- **2G-ROUTE-002:** Preview-then-confirm is mandatory (study Decision 7 (a)).
  The preview names the object type ("uma tarefa") and every field that will be
  written before anything exists; the confirm consumes the server-issued
  single-use confirmation token; no token is ever returned to the client as
  authorization.
- **2G-ROUTE-003:** The `no_match` creation offer stays exactly as it is. The
  create verb is a second, intentional route to the same destination — the two
  paths converge on identical RPC calls.
- **2G-ROUTE-004:** `unsupported_action` narrows to what the composer truly
  cannot do. A creation request for a refused surface (§2) renders the
  deterministic refusal naming the supported surfaces, in both locales.
- **2G-ROUTE-005:** The created task is undoable through the registered
  `undo_create_task_command` handler within the existing window, and the undo
  affordance is surfaced in the composer result exactly as the no-match offer
  surfaces it.
- **2G-ROUTE-006:** Provenance: the created row carries `created_by = 'agent'`;
  the session's model, prompt version and strategy version reach the operation
  (the 2E-COMMAND-012 posture, unchanged); the RPC writes its audit row with
  `app.audit_actor` stamping; the `ai_usage_events` ledger row for the parse
  precedes any dependent domain write.
- **2G-ROUTE-007:** Replay and retry are idempotent: resubmitting the same
  confirmation (double-click, network retry) yields exactly one task, proven
  under the operation key against the deployed idempotency machinery.
- **2G-ROUTE-008:** Authenticated journeys cover the full path — sentence →
  preview → confirm → task visible → undo — on desktop and mobile, in both
  locales, plus the refusal journey for one out-of-scope surface.

### 3.3 Capture routing (2G-CAPTURE — the gated slice)

- **2G-CAPTURE-001:** The composer routes an explicit capture request
  ("registre que…", "capture/note that…") to `captureEntry` with
  `source = 'chat'`. The routing decision is declared data in the routing
  module, never a heuristic buried in a prompt, and the composer's response
  states that an entry was captured and where it went.
- **2G-CAPTURE-002:** The object type is visible before the write: a sentence
  the router classifies as capture renders a capture acknowledgment distinct
  from task creation; a sentence ambiguous between capture and creation asks,
  it does not guess (study R6).
- **2G-CAPTURE-003:** The phase's ONE migration widens
  `private.validate_product_event_properties`' `captureSource` allowlist with a
  composer-specific value. Reusing `'global'` is prohibited. No other schema
  changes ride along.
- **2G-CAPTURE-004:** With no active AI credential, a routed capture stores the
  entry as `awaiting_ai_configuration` exactly as the capture page does — no
  job, no provider call, no spend, honest copy.
- **2G-CAPTURE-005:** Routed captures ride the SH.6 quotas (`entries_per_day`,
  live jobs); a quota refusal renders the declared quota copy, not a generic
  error.
- **2G-CAPTURE-006:** Every routed capture carries its own idempotency key;
  retries are replay-safe and report `replayed` rather than double-storing.

### 3.4 Safety invariants (2G-SAFETY)

- **2G-SAFETY-001:** No new privileged boundary: no grant widening, no
  service-role credential in the Next.js runtime, no generic mutation endpoint.
  The existing grant census, forced-RLS census and direct-write guard stay
  green and are cited as acceptance evidence per slice.
- **2G-SAFETY-002:** Every provider call goes through the BYOK gate
  (`openAiGate`); there is no project-key path to reach. The two declared
  gate refusals (`credentialRequired`, `credentialUnreadable`) keep their
  distinct copy.
- **2G-SAFETY-003:** Provider failure and product refusal stay distinct
  declared outcomes: a provider error never creates anything, never burns the
  turn's idempotency key, and renders its own copy — never the refusal
  vocabulary, and never vice versa.
- **2G-SAFETY-004:** Telemetry stays content-minimized: no raw sentence, title
  or preview content enters `product_events` or operational logs. Events carry
  outcome classifications and declared vocabulary only.
- **2G-SAFETY-005:** User content and retrieved content are never instructions:
  a creation can originate only from the owner's live composer turn, never from
  stored entries, memories or chat history replayed through retrieval.

### 3.5 Convergence and closeout (2G-CLOSE)

- **2G-CLOSE-001:** A fail-closed traceability generator
  (`scripts/generate-phase-2g-traceability.mjs` + closeout test) resolves every
  `2G-*` ID declared in this PRD to delivered / deferred-with-destination /
  not-delivered-and-named. It fails rather than print an unresolved claim.
- **2G-CLOSE-002:** `STATE.md`, `TODO.md`, `CHANGELOG.md`, `SECURITY.md` and
  the handoff are reconciled; every partial is labelled partial; every deferral
  keeps a destination; the Phase 2H deferrals (rate limiting, error sink,
  dead-man switch, retention triggers, deploy runbook) are re-raised, not aged.
- **2G-CLOSE-003:** Non-destructive hosted verification: the authenticated
  journey set runs against the deployed project on disposable fixtures that are
  cleaned up with zero residue proven; a measured statement of what the command
  funnel now contains is recorded (the ADR-055 evidence gate feeds on this).
- **2G-CLOSE-004:** Every slice carries an adversarial review and an acceptance
  report in `docs/reports/phase-2g/`, and merges only with exact merge-SHA CI
  green on all three jobs.

## 4. Confirmation model

Conversational creation is **staged, never immediate** (study Decision 7 (a)):

1. **Preview** — read-only; `preview_task_command_creation` renders exactly
   what will be written.
2. **Confirm** — the server mints a single-use confirmation row bound to owner
   + operation key + canonical fingerprint
   (`issue_task_command_creation_confirmation`); the client never holds a token
   as authorization.
3. **Create** — `create_task_command` consumes the confirmation in the same
   transaction, writes the task, its relations, the audit row and the undo
   compensation row atomically.

Capture routing (2G.3) follows capture's existing posture — the entry is the
owner's own words, idempotent and quota-bounded, and the interpretation that
follows carries its own selective confirmation for candidate tasks. The staged
element there is the routing declaration (2G-CAPTURE-002), not a second
confirmation of the owner's own text.

## 5. Idempotency, duplicates, and partial failure

- Operation keys are minted once per flow and reused across preview / issue /
  create; the RPCs are idempotent on `(user_id, operation_key)` and replay
  reports `idempotent`/`replayed` truthfully (2G-ROUTE-007, 2G-CAPTURE-006).
- The canonical fingerprint (hashing `TASK_COMMAND_POLICY_VERSION`) makes a
  duplicate command detectable and a policy bump invalidating (2G-CREATE-004).
- Multi-entity partial creation cannot occur by construction: one creation per
  turn (2G-CREATE-006) and `create_task_command` is transactional — the task,
  relations, audit and undo rows commit or none do.

## 6. Undo

`undo_create_task_command` is already registered in
`private.undo_operation_handlers`; the structural trigger refuses any undo row
without a registered handler. The phase adds **no new undoable operation
types** — both routes land on the registered one. The 24-hour window and the
guarded compensation (state re-verified before cancelling) are inherited and
re-asserted by journey (2G-ROUTE-005).

## 7. Provenance

Unchanged posture, consumed rather than extended: `tasks.created_by`,
`app.audit_actor`, the interpretation/command version constants travelling on
the session (2E-COMMAND-012 remains deferred behind ADR-057's unexecuted
reopening gate — **not** 2G scope), and the `ai_usage_events` ledger written
before any dependent domain write. The definition study's R10 (fail-open
ledger) stays dormant: no enforcing ceiling reads the ledger in this phase.

## 8. Refusal vocabulary and failure distinction

Four kinds of "no", each with its own declared code and localized copy, never
collapsed:

1. **Out-of-scope surface** (§2) — deterministic product refusal naming what
   the composer can create.
2. **Quota refusal** — SH.6's declared `P0001` DETAIL codes and existing copy.
3. **BYOK gate refusal** — `credentialRequired` / `credentialUnreadable`, with
   the Settings route.
4. **Provider failure** — the model or network failed; nothing was created;
   retry is safe. Distinct from all product refusals (2G-SAFETY-003).

Ambiguity (which task? which surface? several creations?) becomes a
clarification state, never an invention — inherited from the Phase 2E
disambiguation contract.

## 9. Quotas and spend

- The create verb adds **no provider call**: `runTaskCommand` already makes
  exactly one bounded `parseTaskCommand` call per turn; the verb changes the
  outcome, not the call count.
- Capture routing adds one extraction + one embedding per routed capture, on
  the **owner's own BYOK key** (BYOK-DEC-9/10: the owner is not the payer for
  other users), bounded by `max_output_tokens` on every operation (delivered by
  BYOK, verified in `openai-provider.ts`) and by SH.6's infrastructure quotas.
- The per-user USD spend ceiling remains **withdrawn** from this phase (study
  §22); no ceiling, advisory or enforcing, ships here.

## 10. Migration budget (mirror of plan §1)

**ONE migration**, allocated to slice 2G.3 (`captureSource` allowlist
widening). Slices 2G.1, 2G.2 and 2G.4 carry **zero**, and 2G.1's zero is
re-established by inventory (2G-CREATE-005) before detailed planning. Exceeding
the budget stops the work and asks the owner; every migration updates
`AUTHORIZED_MIGRATION_HEAD` in `egc-invariants.test.ts` in the same commit.
Signup Hardening's budget is spent and cannot be borrowed from; nothing is
borrowed from Phase 2H.

## 11. Acceptance

The phase's single acceptance question, adapted from the study §16 with the
withdrawn ceiling removed:

> Can the owner create a task — and, in 2G.3, capture an entry — by typing a
> natural sentence into the composer, see exactly what will be created before
> it exists, confirm it, undo it, and receive an honest, distinct refusal for
> everything the composer cannot create?

House acceptance philosophy applies unchanged: a gate that has never run is a
claim; a check that reads its own input proves nothing; isolation assertions
are non-vacuous; partials stay labelled; the invariant is guarded mechanically.

## 12. Non-goals

Unchanged from the study §10, restated as binding: distributed rate limiting,
error sink, cron dead-man switch, retention/purge triggers, deploy
runbook/backup-restore (→ Phase 2H); new Projects/People fields (2G-2);
`audit_logs.operation_id` (2G-3); semantic retrieval (ADR-055 gate unmet,
expiry 2026-10-27); AI provenance 2E-COMMAND-012 (ADR-057 gate unexecuted);
multi-target commands, recurrence, retroactive placement, split/merge; any
second write path to `public.tasks` or re-grant to `authenticated`; reminder
creation by any conversational route; extending the lifecycle predicate into
`create_task_command`'s body (a `create or replace` this budget does not carry —
the residual keeps its recorded SH destination and partial mitigation).

## 13. What this phase must not touch (owner boundary)

Opening public signup; retention schedule activation (enabling **is** the
authorization of the first live purge); SMTP configuration; legal and
monitoring signatures; the rollout gate's semantics. The owner's rollout tasks
remain recorded in `TODO.md` and the handoff, visible throughout the phase, and
none of them blocks repository-safe Phase 2G work.

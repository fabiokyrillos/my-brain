# Slice 2G.2 — design note (pre-implementation)

Written before code, in the Phase 2E/2F pre-slice habit: the findings below were
established by reading the deployed modules, and the implementation must consume
them rather than rediscover — or contradict — them.

## 1. What the creation module already gives us

- `TaskCommandCreationIntent` is a two-member union: `no_match` (an *inference*
  gated by `decideInitialTaskCommandNoMatch` — offering must be honest) and
  `manual` (a form submission with nothing to decide). The docstring's boundary
  argument applies squarely to the create verb: an explicit "adicione uma
  tarefa…" is **neither** an inference nor a form — it is a third thing, and it
  gets a third member rather than a flag on an existing one.
- `TASK_CREATION_ACTIONS` = `create_title_only` + the seven qualifier actions.
  A bare create maps to `TASK_CREATION_BARE_ACTION`; a one-qualifier create
  maps through `TASK_COMMAND_CREATION_QUALIFIERS` (2G.1's declared data).
- `buildTaskCommandCreationPayload` is the ONE payload builder, hashed into the
  request fingerprint. The third intent kind extends it; a parallel builder
  would be the drift `2E_IDEMPOTENCY_MISMATCH` exists to catch.
- `bareCreationTitleWords` already solves title bounding (1–12 words, grouping
  not truncation, declared refusal `creation_title_unrepresentable`).

## 2. Qualifier resolution is deterministic, and reuses the deployed layers

The model ships *phrases* (2E-COMMAND-014: never instants). Before the preview
RPC, the routing must resolve:

- `dueAt`/`plannedAt` through the temporal lexicon (unresolvable → the existing
  `needs_clarification` posture, never a guess);
- `priority` through `resolvePriorityTerm` (unresolvable → dropped visibly);
- relation references ride to the preview RPC unresolved — the SQL family
  resolves them against owned rows and refuses the unresolvable with
  `relation_reference_unresolved`, the same declared refusal the mutation
  preview uses.

**Multi-qualifier creates:** the SQL family accepts exactly one qualifier
action. 2G.1's normalizer already bounds the patch to the six declared fields;
if more than one survives, keep the first in `TASK_COMMAND_CREATION_QUALIFIERS`
declaration order (dueAt → plannedAt → priority → projectRef → contextRef →
personRef) — the preview then shows **exactly** what will be created, which is
the visibility 2G-CREATE-002 requires, before anything exists.

## 3. The telemetry decision, and why it is deliberate

The `task_command_previewed` outcome vocabulary is validated **inside
Postgres**, and `creation_offered` there means "a mutation matched nothing and
the system offered creation" — the exact funnel the ADR-055 reader measures.
Emitting it for an explicit create would pollute that measurement; adding a new
outcome member would spend the phase's ONE migration, which belongs to 2G.3.

**Decision: in 2G.2 the create-intent path emits no `task_command_previewed`
event** — precisely what the `unsupported` early-return does today, so the
telemetry posture is unchanged rather than newly invented. The creation itself
is fully recorded where it matters: the audit row, the undo row,
`tasks.created_by = 'agent'`, and the `ai_usage_events` ledger row for the
parse. Whether the funnel vocabulary should gain a `create_intent` member is
recorded as a 2G.4 disposition (it may ride 2G.3's migration if chosen while
that slice is open; it must not become a reason to exceed the budget).

## 4. The flow, end to end

```
startTaskCommand
  └─ normalized.kind === "create"        (2G.1's classification)
       ├─ resolve qualifiers (temporal lexicon, priority vocabulary)
       ├─ build intent {kind: "create", titleWords, action, patch, operationKey,
       │                 policyVersion}
       ├─ previewTaskCommandCreation     (read-only; renders title + the one
       │                                  qualifier + "will be created, inbox")
       └─ console state: creation offer  (the SAME offer/confirm UI the
                                          no_match path renders)
confirm →
  issueTaskCommandCreationConfirmation → createTaskCommand(p_created_by='agent')
  → undo affordance through undo_create_task_command (registered handler)
```

- The `no_match` offer flow is untouched (2G-ROUTE-003); both paths converge on
  identical RPC calls (2G-ROUTE-001).
- Refusal narrowing (2G-ROUTE-004): the model-level refusal for non-task
  creation surfaces already lands as `unsupported_action`; the console copy for
  that reason gains the sentence naming what the composer *can* create, in both
  locales — copy change, no new state.
- BYOK gate, lifecycle gate and locale plumbing are inherited from
  `startTaskCommand` — the create path branches after all of them.

## 5. What must be proven (test obligations)

1. Bare create → `create_title_only` payload with empty patch; one-qualifier
   create → the mapped action with the resolved patch; multi-qualifier → first
   by declared order, visible in the preview.
2. Unresolvable temporal phrase → clarification, not a guess; unresolvable
   priority → dropped, visible; unresolvable relation → the declared refusal.
3. Replay: same operation key end-to-end; double confirm creates exactly one
   task (`idempotent`/`replayed` truthful).
4. `direct-write-guard.test.ts` unchanged and green; no new RPC; no grant
   change.
5. Journeys: sentence → preview → confirm → task visible → undo, desktop +
   mobile, both locales; plus one refusal journey ("crie um lembrete…" refuses
   naming the supported surfaces).
6. Provider failure vs product refusal remain distinct (existing codes).

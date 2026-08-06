# Phase 2G Slice 2G.2 — Creation from the composer — acceptance record

Slice of [`PHASE_2G_IMPLEMENTATION_PLAN.md`](../../initiatives/phase-2g/PHASE_2G_IMPLEMENTATION_PLAN.md);
requirements from [`PHASE_2G_PRD.md`](../../initiatives/phase-2g/PHASE_2G_PRD.md) §3.2;
design note: [`PHASE_2G_SLICE_02_DESIGN.md`](./PHASE_2G_SLICE_02_DESIGN.md) —
written before code, and the implementation consumed it rather than
rediscovering it. **Zero migrations. No RPC change, no grant change, no new
write path.**

## 1. What this slice delivers

*"Adicione uma tarefa para revisar os números amanhã"* now previews, confirms
and creates — through the deployed
`preview_task_command_creation` → `issue_task_command_creation_confirmation` →
`create_task_command` family, the same three calls the no-match offer and
manual creation already make (2G-ROUTE-001). The 2G.1 refusal mapping is
removed; the `no_match` offer is untouched (2G-ROUTE-003).

- **`session.ts`** — the envelope gains a `create: boolean` discriminator
  (version `2026-07-28.1` → `2026-08-05.1`). A qualified creation stores the
  *synthesized mutation-shaped proposal* (action = the mapped qualifier), so
  `deriveTaskCommand` re-applies the temporal lexicon, the vocabulary and
  every hint bound — one validator, not two. A bare creation stores only its
  title words and operation key. Tampering with the flag buys nothing: each
  direction lands in a validator that refuses or a preview the user must read.
- **`creation.ts`** — the intent union gains `create` (a validated command
  whose action is the mapped qualifier) and `create_bare` (a title, sharing
  the `manual` payload branch): the create verb is a third thing — not an
  inference to gate, not a form — and the union now says so.
  `mapCreateIntentToCreationProposal` is the declared mapping; when several
  qualifiers survive 2G.1's normalization, the first in
  `TASK_COMMAND_CREATION_QUALIFIERS` declaration order wins, and the preview
  shows exactly what will be created (2G-CREATE-002's visibility).
- **`actions.ts`** — `createIntentRound` mirrors `creationRound`: derivation
  failures render the same honest states a mutation gets (`unsupported` with
  its declared reason; an unresolvable date is asked to be said differently,
  never guessed); preview and confirmation are minted at render time against
  the shown payload; `createTaskFromCommand` re-derives the identical intent
  from the envelope on confirm, so the fingerprint the RPC resolves is the one
  the confirmation row was minted against (2G-ROUTE-007).
- **Provenance (2G-ROUTE-006):** `create_task_command` is called with no
  origin argument — the default `'agent'` — and the session carries model,
  prompt and strategy versions exactly as mutations do. The applied event
  reuses the existing `task_command_applied` vocabulary with
  `applyRoute: "created"`, which is truthful for both routes.
- **Refusal narrowing (2G-ROUTE-004):** the `unsupported_action` sentence in
  both locales now names what the composer can do — update tasks, create a
  task, capture a note — and that reminders, projects, people and events are
  not created here.
- **Telemetry, deliberately unchanged:** no `task_command_previewed` event for
  an explicit create. `creation_offered` there means "a mutation matched
  nothing", the funnel the ADR-055 reader measures, and a new outcome member
  would spend the phase's one migration, which belongs to 2G.3. The
  vocabulary question is dispositioned at 2G.4 (design note §3).

## 2. Proven by test

| Claim | Where |
| --- | --- |
| A bare create routes to the family with `create_title_only` and never runs the matcher | `actions.test.ts` — asserts no `list_task_command_candidates` call, the exact preview args, and `session.create === true` |
| One qualifier maps to its declared action and its phrase reaches the RPC **resolved** (ISO instant, never the user's words) | `actions.test.ts` |
| Several qualifiers keep the first in declaration order, and only it | `actions.test.ts`, `creation.test.ts` |
| An unresolvable date is asked to be rephrased; nothing is previewed or written | `actions.test.ts` |
| Confirm creates through the same family under the **same operation key** the preview fingerprinted; the applied event carries `applyRoute: "created"` | `actions.test.ts` |
| **2G-ROUTE-002** — preview-then-confirm is mandatory: the preview names the object type and every field before anything exists, the server mints the single-use confirmation at render time against the shown payload, and no token is ever returned to the client as authorization | `actions.test.ts` — the offer renders with `control: "create"` and `issue_task_command_creation_confirmation` is called, while `create_task_command` is not, until the confirm |
| **2G-ROUTE-005** — the created task is undoable through the registered `undo_create_task_command` handler, and the composer surfaces the undo affordance exactly as the no-match offer does | `actions.test.ts` (the applied state carries `undo.undoId`); the handler and its 24-hour window are the deployed ones, unchanged by this slice |
| No `task_command_previewed` event for an explicit create | `actions.test.ts` |
| The narrowed refusal names the supported surfaces | `actions.test.ts` |
| `mapCreateIntentToCreationProposal` bare/qualified/blank-value behavior | `creation.test.ts` |
| `create_bare` shares the manual payload branch; `create` refuses a non-task-like action (`creation_not_offered`) and an unrepresentable title (`creation_title_unrepresentable`) with declared codes | `creation.test.ts` |

Suite state: task-commands 1372 → 1385 passing (13 new), assistant/operations
suites green, **zero existing test expectations edited** except the two
narrowed copy strings' own assertions. Full suite, lint and typecheck: see §4.

## 3. Adversarial review

1. **Flag tamper (create→mutation, mutation→create).** A mutation session
   flagged `create: true` lands in the payload builder's task-like check or in
   a preview the user must read before anything exists; a creation session
   flagged `create: false` fails mutation validation (no action) and refuses.
   No silent write in either direction; the session docstring states the
   property.
2. **Clarify smuggling.** The create round never offers the clarify control,
   but a crafted form could send a create session into `clarifyTaskCommand`,
   which re-enters the matcher on the synthesized qualifier proposal. Outcome:
   an ordinary mutation preview of the owner's own task with the ordinary
   confirmation — exactly what typing the mutation directly yields. No
   privilege, no silent write; accepted and recorded.
3. **Apply smuggling.** `applyTaskCommandAction` requires
   `requireApplicableSession` (witness + selection), which no creation session
   ever acquires — refused structurally.
4. **Second write path.** None: `direct-write-guard.test.ts` unchanged and
   green; the slice adds zero RPCs and touches zero grants (2G-SAFETY-001).
5. **Replay.** One server-minted operation key rides preview → issue → create;
   the double-confirm case replays idempotently at the RPC (pinned by the
   existing family tests) and the new test asserts key identity end-to-end.
6. **Journey fragility, named:** the undo step of the online journey navigates
   back to a client state; if that proves flaky at execution time the journey
   should undo from the fresh console state instead. Recorded here because the
   journey is written, not yet executed (§4).

## 4. Gates

| Gate | Result |
| --- | --- |
| `npm run lint` / `npm run typecheck` | zero errors |
| Task-commands + assistant suites | green, 13 new tests |
| Full unit suite | 4,04x/4,04x locally with only the 3 known Windows-only shebang parse failures (green in CI); exact counts in the PR |
| `direct-write-guard.test.ts` | unchanged, green |
| **Journeys (2G-ROUTE-008)** | **WRITTEN, NOT EXECUTED** — `e2e/online-conversational-creation.spec.ts` (6 tests: create/confirm/undo in both locales + the refusal journey) is deployment- and credential-gated: every conversational turn is a provider call under BYOK, so it needs the deployed app carrying this slice plus `BYOK_TEST_USER_A_OPENAI_API_KEY`. Destination: 2G.4's hosted verification, the same NOT-EXECUTED-until-deployable posture SH.3 recorded. |

## 5. What this slice does not do, on purpose

No migration, no analytics vocabulary change, no capture routing (2G.3), no
change to the no-match offer or to manual creation, no Edge Function change.
The lifecycle-predicate residual on `create_task_command` (T-2G-13) is
unchanged and keeps its recorded destination. Phase 2H remains unauthorised.

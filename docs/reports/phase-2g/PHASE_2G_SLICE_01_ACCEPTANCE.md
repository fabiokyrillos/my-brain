# Phase 2G Slice 2G.1 — The create-intent contract — acceptance record

Slice of [`PHASE_2G_IMPLEMENTATION_PLAN.md`](../../initiatives/phase-2g/PHASE_2G_IMPLEMENTATION_PLAN.md);
requirements from [`PHASE_2G_PRD.md`](../../initiatives/phase-2g/PHASE_2G_PRD.md) §3.1.
**Zero migrations, and the zero was re-established by execution, not inherited (§2).**

## 1. What this slice delivers

The wire contract between the model and the product gains a third
classification: `outcome: "create"`, beside `proposal` and `unsupported`
(2G-CREATE-001). The object shape is deliberately unchanged — a creation reuses
`targetHints.titleWords` as the new task's name words (the same 1–12-word shape
`private.task_command_creation_payload` consumes) and `patch` for at most the
declared qualifier fields, so the model gains no new field to misuse.

- **`src/lib/ai/task-command-schema.ts`** — the one importable contract module
  (2G-CREATE-003): the `create` outcome in the schema, the creation rules in
  the prompt, and the `create` branch in `normalizeTaskCommandProposal`. A
  contradictory creation (an action or a refusal reason beside it, or no title
  words at all) is `invalid`, never repaired.
- **`src/features/task-commands/taxonomy.ts`** — `TASK_COMMAND_CREATE_ACTION`
  (the confirmation-kind literal the database has admitted since
  `202607270060:20`) and `TASK_COMMAND_CREATION_QUALIFIERS`, the declared
  mapping from the six creation-representable patch fields to the qualifier
  actions the deployed family accepts. `personRef → assign_person`, not
  `set_waiting_on`: a bare creation does not carry the claim "waiting on" makes.
- **`src/features/task-commands/actions.ts`** — the `create` kind maps to the
  exact refusal a create request has always received. **Observable behavior is
  unchanged in this slice**, including telemetry: the unsupported early-return
  emits no `task_command_previewed` event (it happens before any match run),
  and the create branch emits none either. 2G.2 removes this mapping when it
  routes the intent (2G-ROUTE-001).
- **Deliberately NOT a sixteenth member of `TASK_COMMAND_ACTIONS`:** every
  member of that list mutates an existing task and carries a PRD §11.2 policy
  row — eligibility over the target's current status, patch bounds, an undo
  strategy over recorded pre-state. A creation has no existing target; forcing
  it into the row shape would fabricate every column. The study's phrase
  "a sixteenth verb" is satisfied by the classification being first-class; the
  PRD's exact words ("distinct from the fifteen mutation verbs") are what
  shipped.

## 2. G-2G.1 — the executed inventory (2G-CREATE-005)

Each claim below was re-established by reading the object, this session, not
inherited from the definition study:

| Claim | Where verified | Result |
| --- | --- | --- |
| `task_command_confirmations`' CHECK already admits `create_task` | `202607270060:20` — `check (action in ('cancel_task', 'create_task'))` | ✓ no schema change needed |
| `apply_task_command`'s fifteen-literal list is not on the creation path | `202607260058:466` and `202607260059:552` (`status_writing_actions`) — both internal to the mutation RPC | ✓ untouched |
| The creation payload's own SQL action list is the *qualifier* vocabulary, not the verb list | `202607270060:87-95` — seven members, each a mutation verb whose patch becomes the creation qualifier | ✓ `TASK_COMMAND_CREATION_QUALIFIERS` maps onto it; title-only creation rides the `manual`-shaped path (`creation.ts:252-254` union) |
| The product-event validator pins event names and outcome vocabularies, never action verbs, and pins the `policyVersion` property by **format only** | `202607280061:219-238` — `^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{1,3}$`; zero action-verb literals in the file | ✓ the version bump needs no migration |
| No SQL object pins `TASK_COMMAND_POLICY_VERSION`'s value | repository-wide grep over `*.sql`: zero hits | ✓ the bump is TypeScript-only (ADR-079 governs the *legal-document* version, a different mechanism) |

**Conclusion: zero migrations, proven.** `AUTHORIZED_MIGRATION_HEAD` is
untouched and the chain head stays `202608050077`.

## 3. The policy bump, exercised (2G-CREATE-004)

- `TASK_COMMAND_POLICY_VERSION`: `2026-07-25.2` → `2026-08-05.1`;
  `TASK_COMMAND_PROMPT_VERSION`: `2026-07-25.1` → `2026-08-05.1`;
  `TASK_VOCABULARY_VERSION` moves with the policy version as `policy-lock`
  requires; `TEMPORAL_LEXICON_VERSION` is an alias and follows;
  `TASK_MATCH_POLICY_VERSION` stays `2026-07-25.3` — the matcher is untouched.
- **The four policy-lock digests did not move** (action taxonomy
  `7390ce73be772c2c`, database literals `e8c8bb1bd473e41f`, vocabulary
  `ee9b0095c8418659`, temporal lexicon `a5b7f3be24a9abe1`) — which is the
  proof that no mutation policy changed. Only the version strings and the
  prompt digest (`60644c2e4ea7d5aa` → `297481e5fa4bccb3`) moved.
- **The invalidation consequence is exercised, not asserted:**
  `fingerprint.test.ts` builds the identical request as it would have been
  stored under `2026-07-25.2` — every other hash input byte-equal — and proves
  the version input moved. The SQL fingerprint is `strict` and hashes
  `p_policy_version` as one of its seven inputs, and both `apply_task_command`
  and `create_task_command` resolve stored confirmations by that digest, so a
  fingerprint or unexpired confirmation minted before this commit cannot match
  any request built after it. Blast radius: the funnel is empty (the ADR-055
  reader's standing measurement), and an invalidated confirmation re-previews
  rather than corrupting anything.

## 4. One creation per turn (2G-CREATE-006)

Structurally, the schema can represent exactly one creation — one `titleWords`
array, one patch. At the model layer the prompt rules several creations into
`multiple_targets`, the same reported-judgement posture `multiple_targets` has
always had, with the matcher's determinism unavailable here by construction (a
creation matches nothing). The prompt rule is pinned by test.

## 5. Gates

| Gate | Result |
| --- | --- |
| `npm run lint` | zero errors |
| `npm run typecheck` | zero errors |
| Task-commands + AI + assistant + operations + analytics suites | 1,783 / 1,783 |
| Full unit suite | see the slice PR's CI; local baseline is the three known Windows-only shebang parse failures, green in CI |
| Policy-lock digests | four unchanged, versions moved together |
| Behavior neutrality | existing `actions.test.ts`, `session.test.ts`, `command-console.test.tsx` pass **unchanged** — no expectation was edited |

## 6. Adversarial review

Attacks run against this slice, with outcomes:

1. **Misclassification regression** — a *mutation* sentence the model now
   returns as `create` would render a refusal instead of a mutation preview.
   The prompt scopes creation to explicit create/add/register phrasing; the
   failure mode is a visible, retryable refusal, never a wrong write
   (T-2G-4's posture). Accepted and watched: 2G.2's journeys cover both
   directions.
2. **Qualifier smuggling** — `status`/`note`/`title` in a creation patch have
   no qualifier action; the normalizer drops them so nothing rides in
   unrendered (2G-CREATE-002). Pinned by test.
3. **Contradiction repair** — a create carrying an action, a reason, or no
   title is `invalid`, following the established never-repair rule. Pinned by
   test.
4. **Key hijack** — the operation key remains a parameter the model cannot
   choose; the `create` payload takes the server-minted key like the others.
5. **Structured-Outputs drift** — the `zodTextFormat` conversion suite runs
   against the widened schema; strict mode still refuses any extra field.
6. **Telemetry drift** — checked and neutral (§1); no event vocabulary was
   widened, so no migration pressure was smuggled in.

## 7. What this slice does not do, on purpose

No routing (the composer still refuses creates — 2G.2), no preview, no UI, no
RPC change, no migration, no analytics vocabulary change, no capture routing.
Phase 2H remains unauthorised; nothing hosted was touched.

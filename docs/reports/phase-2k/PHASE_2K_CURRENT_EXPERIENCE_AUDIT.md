# Phase 2K — Current-experience audit

**Purpose.** Re-derive, from source, what the Conversar surface actually does today, so that Phase 2K's scope is decided against the product rather than against the roadmap's memory of it. Every claim below cites a file, a line, a migration, a constraint, a guard or an executed command. Nothing is carried forward from the Phase 2I or Phase 2J audits without re-verification.

**Audited at.** `main` = `df9f40e841878c117d69dd85faac26a44829e021`, 2026-08-08. Local migration chain head `202608080087`; **hosted parity verified live in this session** — `npx supabase migration list --linked` returns local = remote = `202608080087` across 87 migrations.

**Governing parent scope.** `docs/initiatives/product-ux/MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md`, Etapa 3. Candidate decomposition: `docs/initiatives/product-ux/PHASE_2K_2O_ROADMAP_DESIGN.md` §3.

**Reading rule.** The candidate slices `2K.1`–`2K.8` are *proposals*. This audit's job is to find where they are already satisfied, already contradicted, smaller than assumed, or forbidden by a signed rule. It found all four.

---

## 0. Executive summary — the five findings that reshape the phase

1. **Semantic retrieval already ships.** The chat answer path embeds the question and queries pgvector through `public.match_internal_knowledge` over `entry_embeddings` and `memories`. Candidate slice 2K.7 is therefore not "build semantic retrieval" but "widen it" — and widening is what a signed rule forbids (finding 4).
2. **Sources per answer already ship.** Citations are computed, stripped of fabricated ids, **persisted** to `conversation_messages.citations`, and rendered as links. Candidate slice 2K.4 is largely `baseline`; its real remainder is provenance *typing* (direct fact vs. product state vs. inference) and insufficiency disclosure, not citation plumbing.
3. **A mature preview → confirm → apply → undo pipeline already exists — for tasks only.** 66 files, a read-only preview whose immutability is a *type*, a TOCTOU fingerprint, a single-use server-issued confirmation row, and a 24-hour undo. Candidate slices 2K.1/2K.2 are mostly *unification and extension of one existing grammar*, not new machinery.
4. **ADR-055 forbids the natural reading of 2K.7, and it expires inside Phase 2K's own estimate.** No `source_type` widening, no backfill, no pipeline, no job type, no index, until an evidence threshold is met. The funnel is **empty**. The ADR expires **2026-10-27**; the roadmap estimates Phase 2K at 9–13 weeks from 2026-08-08.
5. **Continuity is the one genuinely absent capability.** The whole card/preview/proposal state lives in a client `useActionState`. Navigating to a cited source and returning destroys a pending confirmation with no trace. This is the phase's highest-value gap and it needs no schema.

---

## 1. The Conversar surface, as built

### 1.1 Routes and composition

| Route | File | What it is |
|---|---|---|
| `/{locale}/app/chat` | `src/app/[locale]/app/chat/page.tsx` | Conversation list + composer + proactive questions |
| `/{locale}/app/chat/{conversationId}` | `src/app/[locale]/app/chat/[conversationId]/page.tsx` | Message thread + composer |

Navigation registers chat as a primary, nested capability and gives it a mobile bar slot — `src/features/shell/capabilities.ts:89` (`{ key: "chat", route: "chat", group: "primary", visibility: "primary", nested: true }`) and `:155` (`mobileBarSlots = ["home", "work", "capture", "chat", "more"]`). **Conversar is already reachable and already mobile-primary.** The roadmap's framing of "make Conversar the primary interface" is a *quality* goal here, not a navigation goal.

### 1.2 One composer, five routes, decided as data

`src/features/assistant/assistant-composer.tsx` is the single text field on both routes. It replaced the separate `CommandConsole` and `ChatForm`. Every turn goes through `runAssistantTurn` (`src/features/assistant/actions.ts:102`), which classifies before it acts. The classification is pure and synchronous — `src/features/assistant/routing.ts:49`:

| Route | Trigger | Writes? | Provider call? |
|---|---|---|---|
| `memory_intent` | `looksLikeMemoryIntent(text)` | **No** — returns a proposal | No |
| `capture_intent` | `classifyCaptureIntent(text) === "capture"` | **Yes** — `captureEntry` | No (async worker) |
| `capture_ambiguous` | `classifyCaptureIntent(text) === "ambiguous"` | No | No |
| `knowledge` | text longer than `MAX_COMMAND_TEXT_LENGTH` | Persists conversation + message | Yes |
| `command_first` | everything else | Not until confirmed | Yes |

Two properties are load-bearing and already correct:

- **Fallthrough is a declared value, never an exception.** `commandTurnFallsThrough` (`routing.ts:86`) returns true on exactly one member of the model's closed vocabulary, `not_a_task_command`. A provider fault, invalid model output, and a preview awaiting confirmation all stay with the command pipeline. Written as an equality rather than set membership specifically so a *new* unsupported reason defaults to "shown as unsupported" rather than "silently answered as a question".
- **Command-first ordering is a safety property, not a preference.** `routing.ts:42-47` records it: the command path is read-only until confirmation, whereas the knowledge path persists a conversation row, a message row and an audit row *before* it answers. Running knowledge first would leave that residue behind every mistyped command.

### 1.3 The grounded answer path

`sendChatMessage` — `src/features/chat/actions.ts:100`. In order:

1. Locale resolved independently first, so pre-schema failures are still localized (ADR-036).
2. Zod parse, bounded by `AI_INPUT_BOUNDS.chatQuestion`.
3. `supabase.auth.getUser()`, then `assertActiveAccount` (lifecycle gate).
4. Conversation ownership verified or a conversation created.
5. **User message persisted before any provider call** — so a provider failure never loses the question.
6. **BYOK gate** (`openAiGate`, `:140`) — a gated user costs nothing and reaches no network. No project key exists to fall back to.
7. **Rate-limit admission** (`:154`) — bucket `ai`, operation `chat_answer`, admitted **once per turn**, deliberately: the embedding and the answer are two provider calls serving one question, and charging two slots would make the signed ceiling mean half of what it says.
8. Embedding → `recordAIUsage({ operation: "semantic_search", sourceType: "conversation" })`.
9. `rpc("match_internal_knowledge", { p_match_count: 8 })`.
10. Similarity floor `>= 0.2` (`:194`).
11. **Memory lifecycle filter** (`memoriesInForce`, `:80`) — an archived memory must stop being used, or "Archive" is a label with nothing behind it. Fails **closed**: a memory whose row cannot be read is excluded.
12. `answerFromKnowledge` → `recordAIUsage({ operation: "chat" })`.
13. **Citation hydration with fabricated-id stripping** (`:228`) — `flatMap` drops any cited id absent from the source set rather than asserting.
14. Assistant message persisted with `citations`, `model`, `input_tokens`, `output_tokens`.
15. `audit_logs` row, `action_type: "chat_answered"`, `actor: "agent"`, `after_state: { cited_source_ids, model }`.
16. `revalidatePath` + `redirect` into the thread.

**There is no streaming.** The turn is a Server Action that ends in a `redirect`. A successful answer never returns to the composer — `composer-state.ts:36` records this explicitly.

### 1.4 Retrieval, exactly

`public.match_internal_knowledge` — `supabase/migrations/202607160006_chat_memory.sql`:

```
language sql · stable · security invoker · set search_path = ''
returns (source_type text, source_id uuid, content text, similarity double precision, occurred_at timestamptz)
```

- Two arms, `union all`: `entry_embeddings` joined to `entries`, and `memories where embedding is not null`.
- Both arms scoped `user_id = (select auth.uid())`. `security invoker`, so RLS applies on top.
- Cosine distance via `operator(extensions.<=>)`; `limit least(greatest(coalesce(p_match_count, 8), 1), 20)`.
- `grant execute … to authenticated`; `revoke all … from anon`.

**Consequences for Phase 2K.** The retrievable universe is exactly two source types: `entry` and `memory`. Tasks, people, projects, organizations and files are **not** semantically retrievable. `memories.valid_from`/`valid_until` are **not** read by the RPC — lifecycle is enforced in TypeScript afterwards (`actions.ts:184-193` states why: teaching the RPC would need a migration that slice was not authorized to make).

### 1.5 Lexical search is a separate, deliberately unconnected surface

`src/features/search/` — seven domains (`tasks`, `entries`, `memories`, `people`, `projects`, `organizations`, `files`), `ilike` over declared columns, per-domain limit 8 / total 40, `Promise.allSettled` so a failed domain is **named** rather than dropped, `highly_sensitive` excluded by default with **no count and no existence oracle** (ADR-093 / OD-1).

`src/lib/closeout/phase-2i-search-guard.test.ts` asserts structurally that the search feature references **no** embedding column, no vector operator, no similarity function, and generates **no** answer. It also forbids any service-role client in the feature and any `.rpc(` call.

**So the product has two retrieval systems that cannot legally be merged today**: lexical search over seven domains with no AI, and semantic retrieval over two domains inside chat.

---

## 2. The action pipeline, as built

### 2.1 What already exists for tasks — and it is a lot

`src/features/task-commands/`, 66 files. The parts that matter to 2K.1/2K.2:

| Capability | Evidence |
|---|---|
| Read-only preview whose immutability is a **type** | `preview.ts:135` — `readonly willMutate: false`, the literal, "a boolean would let a future edit set it true and still compile" |
| Every changed field rendered, changed or not | `preview.ts:141`, `buildDeltas` driven by the taxonomy's `changedFields` so no action can quietly acquire an undisclosed field |
| Localized, display-ready before/after values | `TaskCommandDeltaValue` with `kind: "empty" \| "text" \| "instant" \| "flag" \| "atApply"` — `atApply` exists because a preview cannot know the write instant, and inventing one "would be the preview's first lie" |
| Linked effects disclosed (reminders, list removal, restorability) | `buildLinkedEffects`, `preview.ts:763` |
| Stale detection | `preview.ts:277` compares `expected.updatedAt` to the observed pre-state; returns a `staleShell` carrying **no** deltas and **no** task content |
| Cross-owner refusal | `preview.ts:258` throws `TaskPreviewInputError`; the shell deliberately carries `title: null, status: null` because a shell is reached *before* ownership is established |
| TOCTOU anchor | `observedBefore`, pinned by the session and hashed into the request fingerprint |
| Server-issued single-use confirmation | `confirmation.ts` → `public.issue_task_command_confirmation` (`202607260059`), bound to fingerprint + owner + operation key; **there is deliberately no way to pass a token to the apply**, because "a token a caller can name is a token a caller can guess at" |
| Replay and consumed reporting | `TaskCommandConfirmationIssued.consumed` / `.replayed` |
| Idempotency | operation key + request fingerprint; a replay returns the original outcome |
| Undo | `undo` affordance in console state; 24-hour window (`TASK_COMMAND_UNDO_WINDOW_HOURS`); handler registry at `202607250052_pre_2e_undo_handler_registry.sql` |
| Restore after the undo window | `restore_task`, disclosed by the preview as `restorable_after_undo_window` |
| One visual grammar already rendered | `TASK_COMMAND_CONTROLS = ["none","apply","confirm","create","choose","clarify"]`, decided **server-side** because "may this be applied in one step" is a domain rule |
| Disambiguation | `disambiguation.ts`, `TaskDisambiguationView` |
| Bounded clarification, exactly once | `session.ts:126-135` — a single optional field rather than a counter, so the bound is a property of the shape |

**This is the grammar 2K.1 asks for.** It exists, it is server-decided, and the composer already renders it unchanged via `TaskCommandResult` (`assistant-composer.tsx:174`). `composer-state.ts:9-15` records the reason: a composer that re-modelled those states "would be a second place the destructive-confirmation requirement is decided".

### 2.2 What exists for memories — and what it lacks

`src/features/memories/actions.ts`.

- `createProposedMemory` (`:340`) is the confirmed-write half of DEC-5. The composer's memory branch builds a **proposal** and writes nothing; this action runs only from the confirm control on that proposal.
- Idempotency exists but is **content-match**, not a fingerprint: `:359-369` selects an existing row with identical `content` for the same owner and reports `duplicate`. There is no unique index to lean on.
- **`memories` is a plain client write under RLS.** No RPC. `authenticated` holds `select, insert, update, delete` under four own-row policies (`202607160006:69-79`); Phase 2F's revocation covered `tasks` and `reminders` only (`202607300063:90-92`).
- Ownership is proved twice — RLS plus an explicit `user_id` predicate on every statement.
- Every write is audited (`audit`, `:172`) with before/after states.
- Lifecycle: `setMemoryLifecycle` (`:265`) archives by stamping `valid_until` and reactivates by clearing it. **There is deliberately no delete** — archiving preserves provenance.

**The gaps, precisely.** A proposed memory has: no preview of *deltas* (there is no pre-state — it is a create), no TOCTOU witness, no server-issued confirmation row, **no undo**, and no entry in the undo handler registry. It also has no `source_entry_id` — `:337` states this deliberately: a memory born in conversation has no originating entry, and naming a provenance that does not exist would be worse than saying plainly that the owner created it.

**Feasibility note for 2K.2.** A truthful undo for a *created* memory is reachable **without a migration**: the archive transition already exists, is audited, and is the product's own signed answer to "this stopped being true". Registering a handler in `undo_operation` *would* need a migration and is therefore out under decision 3a.

### 2.3 What does not exist at all

- No preview, confirmation or undo for **people**, **projects**, **organizations**, **entries** or **files** initiated from conversation. Entries are written directly and immediately by `captureEntry` on the `capture_intent` route — by design (`actions.ts:191-206`: "the text is the owner's, so there is nothing to confirm about it").
- No card of any kind is persisted. Which brings us to the real gap.

---

## 3. Continuity — the genuine absence

`assistant-composer.tsx:61`:

```ts
const [state, formAction, pending] = useActionState(action, idleAssistantComposerState);
```

`AssistantComposerState` holds `command` (the entire `TaskCommandConsoleState`, including `preview`, `disambiguation`, `creation`, `undo`, `control`) and `proposal` (the memory offered for confirmation). **All of it is client state.** The task-command *session envelope* travels as a hidden form field and survives a form round-trip; it does not survive a navigation or a reload.

Therefore, today:

- A user reads an answer, clicks a citation → `/{locale}/app/inbox/{sourceId}`, and returns. **The pending confirmation is gone**, with no message saying so.
- A reload has the same effect.
- The mobile bar makes this *more* likely, not less: `chat` sits beside `home`, `work` and `capture`, one tap away.

What is **not** missing is the mechanism to rebuild it safely. `session.ts` already establishes the correct doctrine and the machinery:

> "No state is stored in the client as the source of truth. A preview is recomputed server-side and re-fingerprinted on every render." (PRD §11.1, quoted at `session.ts:14-15`)

Re-derivation from a pinned clock (`issuedAt`) reproduces the identical command, the identical `observedBefore` and therefore the identical fingerprint. `withStalenessWitness` and `requireApplicableSession` already refuse a write whose witness is absent or mismatched. **Owner decision 4a is the doctrine this module already implements, extended across a navigation boundary** — which is why it costs no schema.

---

## 4. Sensitivity, cost, limits, telemetry

### 4.1 Sensitivity — chat is governed by nothing

`src/features/sensitivity/contracts.ts` is the Phase 2J central contract. `GOVERNED_SURFACES = ["hoje", "attention", "capture_receipt", "review_summary", "notification"]`. **`chat` is absent, and `search` is deliberately absent** (`:46-51`: ADR-093 signed search's behaviour in Phase 2I and OD-2J-1 explicitly does not redefine it; "adding it here would silently re-open a closed decision").

`sensitivity-boundary.test.ts` fails the build if a surface tests a literal level on its own.

**So the conversation surface today applies no sensitivity predicate and no mask.** `match_internal_knowledge` retrieves entries and memories regardless of `sensitivity`, and citation excerpts (220 characters, `actions.ts:232`) are rendered in the clear and persisted into `conversation_messages.citations`. This is a real, currently-live exposure of the same class Phase 2J fixed for Hoje and attention — and it is *worse* than the surfaces 2J fixed, because the excerpt is **persisted** rather than merely rendered.

The contract's own doctrine is masking, not exclusion, and it states why: exclusion makes the visible count a lie and any "n hidden" affordance "an existence oracle wearing a helpful hat". `toSensitivityLevel` fails **closed** to `highly_sensitive`.

### 4.2 Cost and AI usage

`ai_usage_events.operation` is a closed vocabulary of eight, enforced **both** in the table CHECK and **in the body of `record_ai_usage`** — `202607250055:36` and `:118`:

```
'capture_extraction','semantic_search','chat','review','file_analysis','advanced_reasoning','background','task_command'
```

There is **no `other`** (ADR-096). A chat turn already logs two rows: `semantic_search` for the embedding and `chat` for the answer, both with `sourceType: "conversation"` and the conversation id. `/app/costs` reads this ledger.

**Consequence.** Phase 2K adds no new AI *operation kind* — every operation it performs is already in the vocabulary. No `ai_usage_events` migration is needed.

### 4.3 Rate limits

`admitRateLimitedOperation`, bucket `ai`, is already applied to `chat_answer` (`chat/actions.ts:158`) and to `embed_text` in the memory path (`memories/actions.ts:132`). A refusal in the memory path degrades to "do not touch the stored vector" rather than failing the save — "an hourly pace ceiling must never be able to stop somebody saving what they wrote."

A rate refusal emits `rate_limit_refused`, which **was silently rejected by the writer for weeks** until `202608080087`. That is now repaired and proved live.

### 4.4 Telemetry — no conversation surface exists

`src/features/product-analytics/contracts.ts`:

- `productEventNames` — 30 literals. **None is about a conversation, an answer, a source, a card, or an explanation.**
- `productSurfaces` — 10 literals: `home, capture, inbox, needs_attention, interpretation_review, technical_details, work, questions, server, task_command`. **There is no `chat` / `conversation` surface.** `task_command` exists precisely because the console mounts on both Chat and Work, and attributing it to either "would make 'where do commands come from' unanswerable"; which mount is carried as the `commandOrigin` property.

**Consequence.** Any Phase 2K funnel needs a new surface value and new event names — which is a database constraint, not an application constant. That is exactly what decision 3a's single budgeted migration is for.

**The enforcement topology, post-correction.** `202608080087` deleted the third, frozen copy of the vocabulary from `private.record_product_event`'s body. Enforcement is now **two gates**: the table CHECK and `private.validate_product_event_properties`. `supabase/tests/post_2j_product_event_write_path.sql` derives the vocabulary from the CHECK at test time and writes every declared name through the real public writer with set-difference assertions. Phase 2K must extend that test, not write a parallel one.

---

## 5. Accessibility, mobile and existing coverage

### 5.1 The 2J.0 accessibility lane exists — and does not cover Conversar

`e2e/accessibility.spec.ts`. Seven tests: axe scan (`2J-ACCESS-001`), visible focus from paint (`-005`), tab order (`-003`), modal semantics (`-004`), rendered target size (`-006`), reduced motion (`-007`), polite announcement (`-003`).

**It runs against static HTML fixtures, not the authenticated application.** `SURFACES` is four entries: command palette closed, command palette open, global search, Library. **Conversar is not among them.** The lane found a real Phase 2I defect on its first execution (`.library-search-link` at 16px on a Pixel 7, WCAG 2.2 AA 2.5.8) — which is the argument for extending it rather than replacing it.

### 5.2 What the composer already gets right

`assistant-composer.tsx`:

- One polite live region for the whole surface (`:101`), with `TaskCommandResult` asked to stay `silent` so a turn cannot be announced twice.
- Focus moves to the outcome after an async round (`:73`), and only for routes this component renders itself — "two focus moves in one commit would fight each other".
- Enter sends, Shift+Enter breaks; `event.nativeEvent.isComposing` is checked because an IME is mid-word when it sends Enter, and React's synthetic event does not carry the flag. This is a correctness property for pt-BR and CJK input, not a nicety.
- `aria-describedby`, `aria-busy`, labelled textarea, named `role="region"` landmark with `tabIndex={-1}` for the outcome.

### 5.3 Existing browser coverage touching chat

`e2e/online-assistant-composer.spec.ts`, `online-assistant-name.spec.ts`, `online-conversational-creation.spec.ts`, `online-memories.spec.ts`, plus `foundation.spec.ts`, `layout-contracts.spec.ts` and `online-route-audit.spec.ts`. The `online-*` lane requires live credentials and is **manual**, not CI. CI's `database` job runs local specs against a production build on desktop and Pixel 7.

### 5.4 pgTAP

56 files. Relevant: `phase_2i_search_ownership.sql`, `product_events.sql`, `post_2j_product_event_write_path.sql`, `ai_usage_rls.sql`, `phase_2e_task_command_*` (six files), `undo_operation_routing.sql`. **There is no pgTAP file covering `match_internal_knowledge` ownership** — the RPC is `security invoker` and RLS-backed, but its owner-scoping is not asserted by a database test.

---

## 6. Reconciliation — every candidate requirement classified

Classification vocabulary per `PHASE_2K_2O_MASTER_IMPLEMENTATION_PLAN.md` §"Requirement classification vocabulary", extended with the audit states the task specified.

| Candidate | Roadmap claim | State | Evidence |
|---|---|---|---|
| **2K.0** Audit + signed decisions | Reconstruct flows, classify, resolve decisions | **absent → this phase** | This document; decisions signed 2026-08-08 |
| 2K.0 ADR-055 resolution | not in roadmap | **absent, newly required** | ADR-055 expires 2026-10-27, inside the phase window; funnel empty (`TODO.md:135`) |
| **2K.1** Previews for tasks | Read-only previews | **built** | `preview.ts:135` `willMutate: false`; `TASK_COMMAND_CONTROLS` |
| 2K.1 Previews for memories | Read-only previews | **partial** | Proposal exists (`memory-proposal-card.tsx`); no delta view, no witness |
| 2K.1 Previews for entries | Read-only previews | **contradicted** | `capture_intent` writes immediately and deliberately (`actions.ts:191-206`) |
| 2K.1 Previews for people / projects | Read-only previews | **absent** | No conversational path exists |
| 2K.1 "No mutation until typed confirmation" | New rule | **baseline** | Command path read-only until Apply/Confirm; memory path writes only from its confirm control |
| 2K.1 One visual grammar for pending/accepted/refused/failed/undone/expired | New | **partial** | Six server-decided controls + twelve outcomes exist for tasks; memory has none of it; no shared grammar module |
| **2K.2** Confirm / discard without leaving | New | **baseline** | `useActionState` on one composer; Confirm replaces the preview in place |
| 2K.2 Edit action parameters in the card | New | **absent** | No edit affordance on a preview; `clarification` is one bounded slot, not parameter editing |
| 2K.2 Truthful partial results | New | **built** | Twelve declared outcomes; `no_change`, `rejected_stale`, `refused` are distinct and rendered |
| 2K.2 Bounded undo | New | **partial** | Tasks: 24h undo + restore. Memories: **none** |
| **2K.3** Open a referenced object without losing position | New | **absent** | Citations are plain `<Link>`; no return state |
| 2K.3 Restore the originating card + pending confirmation | New | **absent** | State is `useActionState`; destroyed by navigation |
| 2K.3 Expired/stale behaviour rather than silent replay | New | **partial** | Doctrine and machinery exist (`session.ts`, `withStalenessWitness`, `requireApplicableSession`, `staleShell`) but are not reached across a navigation |
| **2K.4** Show records and memories used | New | **built** | `conversation_messages.citations`; rendered with links |
| 2K.4 Show tasks, people, projects, files used | New | **not-buildable-under-current-rule** | `match_internal_knowledge` returns only `entry` and `memory`; widening `source_type` is named by ADR-055 as forbidden |
| 2K.4 Distinguish direct support / product state / inference | New | **absent** | `Citation` is `{ id, type, sourceId, excerpt }`; no support-kind field |
| 2K.4 Say when personal evidence is insufficient | New | **absent** | An empty source set produces an answer with no citations and no statement about why |
| **2K.5** Progressive disclosure of interpretation and uncertainty | New | **absent** | No explanation surface on chat |
| 2K.5 Freshness | New | **partial** | `occurredAt` is retrieved and carried into `ChatSource`; never rendered |
| 2K.5 Excluded material | New | **partial** | Two exclusions are computed and discarded: the `< 0.2` similarity floor and the archived-memory filter |
| 2K.5 Correct the source vs. correct the interpretation | New | **partial** | Correcting the *source* is reachable — memory edit/archive ships. Correcting the *interpretation* has no path |
| 2K.5 No hidden model reasoning exposed | Constraint | **baseline** | Nothing exposes reasoning today; the constraint must be preserved, not built |
| **2K.6** ≤3 contextual suggestions | New | **absent** | The empty state hard-codes one example string in a locale ternary (`chat/page.tsx`) |
| 2K.6 No decorative prompt wall | Constraint | **baseline** | Nothing to remove |
| 2K.6 No private content in telemetry | Constraint | **baseline** | Enforced by contract shape; must be preserved |
| **2K.7** Combine lexical + semantic + type + date + relationship | New | **not-buildable-under-current-rule** | ADR-055; `phase-2i-search-guard.test.ts:143` |
| 2K.7 Bind answer claims to retrieved sources | New | **built** | Fabricated ids stripped deterministically (`actions.ts:228`) |
| 2K.7 Offer reformulation when confidence is weak | New | **absent** | No confidence signal reaches the surface |
| **2K.8** Authenticated browser journeys | New | **partial** | `online-*` lane exists but is manual and does not cover cards, sources or return continuity |
| 2K.8 Keyboard / focus / narrow viewport | New | **partial** | Composer is strong; lane exists; Conversar not in `SURFACES` |
| 2K.8 Content-free funnel metrics | New | **absent** | No `chat` surface, no conversation events |
| 2K.8 Traceability, threat closure, parity, residuals | New | **absent → this phase** | Standard closeout |

### 6.1 Summary of what the roadmap got wrong

| Change | Item | Why |
|---|---|---|
| **Removed** | 2K.7 as an implementation slice | ADR-055 forbids the widening it requires; funnel empty; owner decision 1a |
| **Removed** | Mutating cards for people / projects / entries / files | Owner decision 2a; no proved write path; would multiply the threat surface |
| **Reduced** | 2K.1 | The grammar exists for tasks; the work is unification + memory parity, not construction |
| **Reduced** | 2K.4 | Citations ship; the work is provenance typing and insufficiency, not plumbing |
| **Reduced** | 2K.5 | Two exclusions and one freshness signal are already computed and thrown away |
| **Expanded** | 2K.0 | Must now resolve ADR-055's expiry, which the roadmap did not anticipate |
| **Expanded** | Sensitivity | Conversar is ungoverned today and persists 220-char excerpts; Phase 2J's contract must be extended to it |
| **Expanded** | 2K.2 | Memory needs a real undo it has never had |
| **Reordered** | Continuity (2K.3) rises in value | It is the only wholly-absent capability and it costs no schema |

---

## 7. Constraints Phase 2K inherits and must not break

| Constraint | Source | Effect |
|---|---|---|
| ADR-055 — no semantic infrastructure without threshold | `DECISIONS.md`; expires **2026-10-27** | Kills 2K.7; forces a 2K.0 decision |
| `phase-2i-search-guard.test.ts` | Structural | Search must never gain embeddings, vector operators, similarity, service-role, `.rpc(`, or generated answers |
| ADR-093 / OD-1 | Search sensitivity | Must not be re-opened; chat's policy is a *new* decision, not an amendment |
| `sensitivity-boundary.test.ts` | Structural | A surface may not test a literal level; it must read `presentationFor` |
| ADR-036 | Localization | New copy goes in a typed feature `copy.ts`; `locale-ternary-guard.test.ts` enforces |
| One Write Path | `capture-write-path-guard.test.ts` | No second capture path |
| `no-durable-audio-guard.test.ts` | Phase 2J | Unaffected but must stay green |
| A13 phase-start guard | `phase-2f-documentation.test.ts:283` | Currently targets Phase 2K; **retargets in the authorizing commit** |
| `docs-taxonomy-guard` / `reports-taxonomy-guard` | Structural | Governing artifacts under `docs/initiatives/phase-2k/`; every reporting initiative needs a governing directory |
| Two-gate telemetry vocabulary | `202608080087` + `post_2j_product_event_write_path.sql` | Any new event must pass CHECK *and* validator, proved through the real writer |
| Signup rollout gate | `signup-rollout-gate.test.ts` | 25 pass · 3 fail · 2 owner-signature. **Phase 2K is not progress toward it** |

---

## 8. Open questions this audit could not answer, and where they go

1. **Do task-command confirmations expire?** `issue_task_command_confirmation` binds owner + operation key + fingerprint and reports `consumed`/`replayed`, but this audit found no TTL. Under decision 4a the surface must show "expired" when the object changed; whether a confirmation *row* also ages out is a separate question. → `OD-2K-5`, resolved in slice 2K.0 by reading `202607260059` in full.
2. **What does an answer with zero sources currently say?** The provider composes an answer from an empty source array; this audit did not execute a live turn against the hosted project to capture the copy. → measured in slice 2K.0, not assumed.
3. **Screen-reader behaviour of the live region under a real AT.** Never executed for this surface. → declared **not proved** in the plan, never inferred.

---

**Audit status.** Complete for the purpose of scoping Phase 2K. Every "already exists" and "does not exist" above is pinned to a file, a line, a migration or an executed command. Items 8.1–8.3 are named as unmeasured rather than guessed.

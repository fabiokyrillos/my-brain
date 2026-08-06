# Phase 2G Slice 2G.3 — Capture routing — acceptance record

Slice of [`PHASE_2G_IMPLEMENTATION_PLAN.md`](../../initiatives/phase-2g/PHASE_2G_IMPLEMENTATION_PLAN.md);
requirements from [`PHASE_2G_PRD.md`](../../initiatives/phase-2g/PHASE_2G_PRD.md) §3.3.

**One migration — `202608060078`, the whole of Phase 2G's budget, now spent.**
`AUTHORIZED_MIGRATION_HEAD` moves to `202608060078` in the same commit. Any
further DDL in this phase is an owner budget amendment.

## 1. What this slice delivers

*"Registre que preciso enviar o relatório"* now files an entry from the
composer, and the acknowledgment names the object it became and links to it.

- **`capture-intent.ts`** — the routing decision as declared data
  (2G-CAPTURE-001), in `memory-intent.ts`'s shape: fifteen explicit filing
  imperatives, normalized so accents and phone punctuation do not decide
  anything, and a question is answered rather than filed.
- **`routing.ts`** — `capture_intent` and `capture_ambiguous` join the
  decision union. Capture sits **second**: behind memory, whose branch
  persists nothing, and ahead of the command parse, because an explicit
  "registre que…" is not a task command and sending it to the model would buy
  a refusal the rule already knows. The position is the decision worth
  defending, and the module says why.
- **The ambiguity rule (2G-CAPTURE-002, study R6)** — a sentence carrying both
  a filing imperative and the word *tarefa*/*task* names two objects, and the
  composer asks instead of choosing. It writes nothing and calls nothing.
  **The two routes are otherwise structurally disjoint**, which is pinned
  rather than assumed: "Registre uma tarefa…" matches no filing opener and
  goes to the command path, where 2G.1's `create` classification handles it.
- **`assistant/actions.ts`** — the capture branch reuses `captureEntry`
  **whole**, the same Server Action the capture page submits to, so the
  lifecycle gate, the SH.6 quota ceilings (2G-CAPTURE-005), the server-minted
  idempotency key (2G-CAPTURE-006), the `awaiting_ai_configuration` path when
  no credential exists (2G-CAPTURE-004) and the worker nudge are inherited
  rather than re-implemented beside them. A refusal surfaces `captureEntry`'s
  own localized message, so a quota ceiling and a storage fault stay different
  facts.
- **`captureSource: "composer"`** joins the two form surfaces
  (2G-CAPTURE-003). Its own value, never a reuse of `'global'`: the event
  exists to say *which surface* captured, and collapsing the two would make
  the one measurement unanswerable. `entries.source` stays `'chat'` — where
  the entry came from and which surface asked are different questions.

## 2. The defect this slice's inventory found (ADR-084)

The pre-code gate read `private.validate_product_event_properties` before
widening it, and found a second defect in the same function.

**SH.6 shipped a producer with no consumer.** `capture/actions.ts` emits
`failureKind: refusal ? 'quota' : 'storage'` when a capture is refused by a
quota ceiling. `'quota'` was in **neither** governing vocabulary — not the
database enum, not `contracts.ts`'s `isOneOf` — so `parseProductEventPayload`
rejected the payload *before the RPC was called*, and the call site wraps the
emission in `.catch(() => {})` and reads no result.

**Every quota refusal has therefore recorded no telemetry at all**, while the
code reads as though it records one. SH.6 proved those ceilings hold under
genuine concurrency; their refusals have been invisible ever since.

Fixed in this migration because this slice already replaces this exact
function, so the repair costs **zero additional migrations**. Recorded rather
than smuggled: ADR-084 carries the analysis, the rejected alternatives and the
consequence that **the lost events do not backfill**.

## 3. The migration, verified line by line

`202608060078` is a `create or replace` of one internal `SECURITY INVOKER`
validator. It creates, drops and grants nothing.

The new body was diffed against `202607280061`'s **as sets of trimmed lines**,
not by position — a positional diff is meaningless once three comment lines
are inserted, and would have hidden a transcription error in a 203-line
re-declaration. Result:

| | Lines |
| --- | --- |
| Removed from the original | **4** — the three `captureSource` enums and the one `failureKind` enum |
| Added | **7** — the same four lines widened, plus three lines of comment |

**Both widenings are additive**, so no previously-valid property becomes
invalid: no recorded event stops validating, and the migration is safe to
apply before or after the application code, in either order.

## 4. Proven by test

| Claim | Where |
| --- | --- |
| An explicit imperative files an entry, links to it, and reaches neither the model nor the knowledge path | `assistant/actions.test.ts` |
| The submitted form carries `captureSource: composer`, `source: chat` and a server-minted UUID key | `assistant/actions.test.ts` |
| A sentence naming both a note and a task asks, and writes nothing | `assistant/actions.test.ts`, `capture-intent.test.ts` |
| "Registre uma tarefa…" goes to the command path — the routes are disjoint | `assistant/actions.test.ts` |
| A capture refusal surfaces `captureEntry`'s own honest message, not a generic failure | `assistant/actions.test.ts` |
| A question is answered, never filed, whatever it opens with | both |
| Memory stays ahead of capture, because its branch persists nothing | `assistant/actions.test.ts` |
| Acknowledgment and ambiguity question localized in both locales | `assistant/actions.test.ts` |
| The task word matches at a boundary, so "multitarefa" decides nothing | `capture-intent.test.ts` |
| Capture and memory openers are disjoint sets | `capture-intent.test.ts` |
| **ADR-084:** the producer, `contracts.ts` and the migration admit the same values, and the parser accepts `quota`/`composer` while refusing an invented one | `product-analytics/contracts.test.ts` |

**One test-harness defect found and fixed while writing these:** the
behavioural half of the ADR-084 case was silently vacuous through this file's
`vi.importActual` shim, which falls back to `{}` when the module is absent —
so `parse?.(…)` became `undefined` and every refusal assertion passed by not
running. It now imports `parseProductEventPayload` statically, and the comment
records why. That shim's fallback is right for the vocabulary-census cases
above and wrong for a behavioural one.

## 5. Adversarial review

1. **A false positive writes.** This is the one composer branch that persists
   on the turn that selects it, so the openers are explicit imperatives and
   nothing else, and a question is refused outright. The cost of a wrong
   capture is the owner's own sentence in their Inbox, deletable — bounded,
   and stated in the module rather than discovered.
2. **Over-asking.** The ambiguity rule fires on opener + task word, which will
   sometimes ask about a sentence a human would read as an obvious note
   ("Anote que a tarefa atrasou"). Accepted deliberately: asking costs one
   turn, guessing wrong costs a stored object of the wrong type the owner must
   find and delete, and the branch that asks writes nothing. Named here so a
   future slice can narrow it on evidence rather than rediscover the trade.
3. **Spend.** A routed capture spends the **owner's own** BYOK key on one
   extraction plus one embedding, bounded by `max_output_tokens` and by SH.6's
   `entries_per_day` and live-job ceilings. No new unattended path: the drain
   that processes it is the one capture has always used.
4. **Ordering tamper.** None available — the router is pure, synchronous and
   client-free; the decision is recomputed server-side on every turn.
5. **Telemetry content.** The widening adds two closed enum members and no
   free text; the event stays content-free by construction.
6. **Prompt injection.** Unchanged and untouched: this branch calls no
   provider at all, so retrieved content cannot reach a routing decision.

## 6. Gates

| Gate | Result |
| --- | --- |
| `npm run lint` / `npm run typecheck` | zero errors |
| Full unit suite | green (counts in the PR); the 3 known Windows-only shebang parse failures are the only local exceptions |
| Migration body diff vs `202607280061` | 4 lines changed, 3 comment lines added — verified as sets, not by position |
| `AUTHORIZED_MIGRATION_HEAD` | moved to `202608060078` in the same commit |
| pgTAP / migration chain from empty | CI `database` job on the PR |
| **Hosted application** | **NOT APPLIED at the time of writing.** Parity stays `202608050077` until the migration is applied to the linked project; the app half degrades safely in the meantime because the event is best-effort — the capture itself still succeeds. Applying it is non-destructive (a `create or replace` of an internal validator) and is recorded in the deployment section when executed. |
| Authenticated journeys | Carried with 2G.2's, still **written not executed** — destination 2G.4's hosted verification |

## 7. What this slice does not do, on purpose

No confirmation step for the owner's own text — capture's existing posture,
unchanged. No second write path: `captureEntry` is reused whole. No new
`task_command_previewed` outcome member (2G.2's disposition stands; the
question closes at 2G.4). No Edge Function change. Phase 2H remains
unauthorised; nothing destructive is authorized or executed.

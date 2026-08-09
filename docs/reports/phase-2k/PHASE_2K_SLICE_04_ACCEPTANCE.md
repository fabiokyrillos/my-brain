# Phase 2K — Slice 2K.4 acceptance

**Sources per answer — and the end of the persisted excerpt.**

**Written after execution, from executed evidence.** Every gate is reported as executed, skipped or **NOT PROVED** — never inferred.

**Authorization.** ADR-101. **Governing decision:** OD-2K-2 (ADR-098) — *for new messages the excerpt is not persisted at all.*

**Baseline.** `main` = `a3a5837f22d217fef7f1cea2be36d64ebf0fbb01` (PR #149, slice 2K.3), **CI green on that exact merge SHA across all three jobs**. Hosted parity unchanged at `202608080087`.

**Migration budget.** **`1 allocated · 0 spent`.** The envelope is a `jsonb` shape change, not a schema change, and no backfill belongs to this phase.

---

## 1. Requirements this slice claims

| Id | Claim | Evidence |
|---|---|---|
| `2K-SRC-001` | **built** | The block renders every source the answer used, with its type, its content re-read now, and a link. It was `baseline` for *existence*; what this slice added is that it renders **at all** for the honest empty case |
| `2K-SRC-002` | **baseline** | The fabricated-id `flatMap` is unchanged. Its three existing tests pass against the new envelope: an unmatched id and a malformed id both degrade to a missing reference rather than a `TypeError` |
| `2K-SRC-003` | **built** | `SUPPORT_KINDS` is closed; `supportKindForSource` maps entry → `direct_record` and memory → `product_state`, **server-side**. `chat-schema.ts` is untouched, so the model still cannot widen its own authority |
| `2K-SRC-004` | **built** | `occurred_at` for an entry, `valid_from ?? created_at` for a memory — exactly what the RPC ranks on — rendered as `<time datetime>`. **Absent rather than fabricated** when the row has none |
| `2K-SRC-005` | **built** | The envelope records what **retrieval** found. Proved directly against the ambiguity slice 2K.0 measured: every cited id fabricated → zero references → and the evidence state is still `evidenced`, because retrieval *did* find something |
| `2K-SRC-006` | **built** | The reach sentence names entries and memories, and is shown on **both** branches — an answer that found nothing owes the user the shape of where it looked |
| `2K-SRC-007` | **built** (guard) | `chatAnswerSchema` still declares exactly `answer` and `citedSourceIds`; a guard asserts it gained no action, command, patch, mutation, intent, taskId or support field, and fires on a planted one |
| `2K-SRC-008` | **built** (guard) | The whole `conversation-sources` feature builds only read-only cards, renders no form or submit, issues no mutation, and constructs no service-role client |
| `2K-PRIVACY-003` | **built** | `sendChatMessage` no longer writes an excerpt — asserted by absence of both `excerpt` and `source.content.slice`. The persisted reference schema is `.strict()`, so a planted content field makes the whole envelope unparseable |
| `2K-PRIVACY-004` | **built** | `resolve-sources.ts` re-reads every cited source at render time. A source reclassified **after** the answer was stored carries the new level; a deleted one and an unreadable one are byte-identical; an archived memory renders `unavailable` rather than in the clear |

---

## 2. What was actually removed, and why it mattered

`sendChatMessage` used to write `excerpt: source.content.slice(0, 220)` into `conversation_messages.citations`. That excerpt was a **copy of the user's content in a second table**, and the source row's `sensitivity` did not travel with it. Reclassify an entry, archive a memory, edit its text — the quote in the thread was unchanged and still rendered in the clear.

The audit called it the sharpest finding in the phase, and it was live.

**Carrying the classification alongside the excerpt was rejected**, not overlooked: it keeps two copies of one fact in sync by convention, which is the shape of defect `202608080087` had to delete and the reason that one survived two phases. Removing the copy removes the thing that can diverge. There is now nothing to keep in sync.

---

## 3. The envelope, and why it needed no migration

The column holds two shapes:

- **Current** — `{ v, evidence, reach, sources[] }`, where each source is `{ id, type, sourceId, support }` and there is **nowhere to put content**.
- **Legacy** — the array of `{ id, type, sourceId, excerpt }` already written.

`parseCitations` normalizes both. The legacy branch picks the three identifying fields and **drops the excerpt on the floor** — it is not read into anything, which is the property that stops the residual becoming a live exposure again. A backfill is a `jsonb` migration, OD-2K-2 authorizes none, and the single budgeted migration is destined for telemetry.

**A legacy row is `unknown`, never `no_qualifying_evidence`.** Nobody recorded what retrieval found for those rows, and claiming "I had nothing" about a row that may have had plenty would be an invention. The surface says less for them, deliberately: no reach, no insufficiency, just an honest note that the answer predates the record.

**A planted content field refuses the whole envelope, not just the field.** A payload carrying content was written by something this contract does not recognise, and salvaging the rest would be trusting a writer that has already broken the shape.

---

## 4. Insufficiency comes from retrieval, and the test proves the distinction

Slice 2K.0 measured that `citations.length === 0` is **ambiguous**: it is produced both by "nothing was retrieved" and by "sources were retrieved and the model cited none of them".

So the envelope records `retrievedAnyQualifyingSource: sources.length > 0` — where `sources` is the **retrieval result** after the similarity floor and the lifecycle filter, not the citation list. The guard asserts that line by shape and asserts the wrong one is absent.

The behavioural proof is the sharpest test in the slice: every cited id fabricated → **zero** references persisted → and the evidence state is still `evidenced`. Deriving insufficiency from the count would have reported the exact opposite of what happened.

---

## 5. Gates, as executed

| Gate | Command | Result |
|---|---|---|
| Tests first | contract, resolve and guard tests before implementation | **Executed**, red for the right reasons |
| Focused | `npx vitest run src/features/conversation-sources src/features/chat src/lib/closeout/phase-2k-answer-contract-guard.test.ts` | **Executed, green** |
| Lint | `npm run lint` | **Executed, zero errors** |
| Types | `npm run typecheck` | **Executed, zero errors** |
| Full unit | `npm test` | **Executed** — 291 files passed, **4809 tests passed, 0 failing tests**. 3 files fail to *load* on Windows — the known local baseline, green in CI |
| Build | `npm run build` | **Executed, green** |
| Browser, both viewports | `npx playwright test e2e/accessibility.spec.ts --project=desktop --project=mobile` | **Executed** — 27 passed, 1 skipped. The new `Conversar sources` surface renders **both** evidence branches and passes axe at both viewports |
| Whitespace | `git diff --check` | **Executed, clean** |
| Migrations | none created | **`1 allocated · 0 spent`** |
| pgTAP | not applicable — no database change | **Declared, not skipped silently** |
| Real device / assistive technology | not run | **NOT PROVED** |
| Provider prose for a zero-source answer | not executed | **NOT PROVED — see §7** |

---

## 6. Negative controls and non-vacuity

- **The content refusal is proved against six field names**, not just `excerpt`: `content`, `snippet`, `title`, `text`, `preview` are each planted and each refuses the envelope.
- **The legacy excerpt is proved discarded**, by serializing the parse result and asserting the stored string is absent from it.
- **The reclassification case is executed**, not described: the row now reports the most protective level and the card carries it.
- **The archived-memory refusal has a positive control**: an in-force memory renders in the clear in the very next test, so the refusal is not a resolver that returns nothing for any input.
- **The batching claim is measured**, not asserted: three references across two tables produce exactly **two** `from` calls, and a message citing nothing produces **zero**.
- **The insufficiency distinction is proved from the ambiguous case**, which is the only case that can tell the two implementations apart.
- **The answer-schema guard fires on a planted `action` field** and not on the real schema.
- **Order is asserted**, because re-sorting by whatever the database returned would quietly change what the user reads.

---

## 7. Reported NOT PROVED, and the one that changed status

**The prose a zero-source answer produces is still not proved.** It needs a real OpenAI call. A disposable account has no BYOK credential, so the gate refuses before any provider call; using the owner's credential would spend their money and write permanent rows into their real account, which ADR-101 does not authorize and this slice will not do silently.

**What changed is that it no longer gates the requirement.** Slice 2K.0 recorded the structural half as the part `2K-SRC-005` actually needs, and that half is now **built**: insufficiency is a persisted fact derived from retrieval and rendered as its own visually distinct state. The model's prose is no longer the disclosure — it sits above one. The residual is therefore narrower than it was: it is about what the provider *says*, not about whether the product *tells the user*.

**Also not proved:** a real screen-reader session; hydrated interactivity in a browser.

---

## 8. Limitations, stated rather than rounded up

1. **Existing stored excerpts are untouched.** They remain the named residual OD-2K-2 declared. What is proved is that the renderer never reads one — that is the containment, and it is a test rather than a promise.
2. **The re-read costs two queries per message with sources.** Bounded by the 200-message ceiling and batched per table. The stopping condition was an unbounded per-source fan-out; that does not occur, and the fix if it ever did is more batching, never the stored copy — which no longer exists.
3. **No screen-reader session, and no hydrated-browser proof.**
4. **The authenticated sources journey runs in 2K.8**, where the online lane runs.

---

## 9. What this slice did not do

No migration, no backfill, no schema change, no deployment. `chat-schema.ts` untouched, so the model gained no field. `match_internal_knowledge`, the similarity floor and the lifecycle filter are unchanged. No RLS policy, grant, secret, external service or write path. Signup remains closed; the rollout gate is untouched at 25 pass · 3 fail · 2 owner-signature.

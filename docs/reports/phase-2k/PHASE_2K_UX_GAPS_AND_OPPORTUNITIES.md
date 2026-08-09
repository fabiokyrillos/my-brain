# Phase 2K — UX gaps and opportunities

**Companion to** `PHASE_2K_CURRENT_EXPERIENCE_AUDIT.md`. The audit says what exists. This says what that costs a user, ranked by how much of the loss is recoverable inside Phase 2K's signed boundary.

**Written independently of the PRD.** Where this document and the PRD disagree, the disagreement is a defect in one of them and must be resolved before implementation authorization — that is the point of writing them apart. Cross-references are by requirement id, never by copied prose.

---

## How gaps are ranked

| Axis | Meaning |
|---|---|
| **Loss** | What the user cannot do, or is told wrongly, today |
| **Recoverable** | Whether Phase 2K's signed boundary (decisions 1a/2a/3a/4a) can fix it |
| **Cost** | Rough size, given what the audit proved already exists |

A gap that is large but out of boundary is recorded anyway, with its destination. A gap the roadmap named but the audit found already closed is recorded as **not a gap**, because the most expensive planning error available here is building something twice.

---

## G-1 — A pending action does not survive looking at its own evidence

**Loss.** The product invites the user to check the sources behind an answer, and punishes them for accepting the invitation. Citations render as links to `/app/inbox/{id}` and `/app/memories/{id}`. The card, the preview and the pending confirmation live in `useActionState` (`assistant-composer.tsx:61`). Clicking a source and returning destroys all of it — **silently**. No message, no trace, no "your action expired".

This is worse than a bug because the two behaviours the product most wants — *verify before you trust* and *act inside the conversation* — are mutually destructive.

**Why it is the highest-value gap.** It is the only wholly-absent capability in the phase, it is the one the mobile bar makes most likely (chat sits one tap from home/work/capture), and the machinery to fix it correctly **already exists**: the server can re-derive a command and rebuild a preview from scratch, `withStalenessWitness` and `requireApplicableSession` already refuse a write whose witness is absent or mismatched, and `staleShell` already renders "this went stale" carrying no task content.

**Recoverable.** Yes, fully, and with **no schema** — decision 4a plus **ADR-100**.

**One distinction the fix turns on, because it is easy to lose.** `session.ts` pins `issuedAt` *within* one multi-step command, and that is exactly right: it is what makes the steps of a single operation agree, and ADR-050 records why. Pinning it **across a navigation** would be the opposite property — the mechanism by which an old authorization survives one. Same value, opposite effect. So the return path re-derives with a **new** clock and **always** re-asks; the earlier confirmation becomes unusable by construction, which is the point rather than a cost.

**Opportunity beyond the fix.** Once return is safe, the citation stops being a dead end and becomes the normal way to read an answer. That is the actual thesis of "Conversar as the primary interface", and it is currently blocked by a client-state lifetime.

**Cost.** Medium. → `2K-CONT-*`

---

## G-2 — Conversar is the only content surface with no sensitivity policy, and it is the only one that *persists* an excerpt

**Loss.** Phase 2J built a central presentation contract and applied it to five surfaces. `GOVERNED_SURFACES` is `["hoje","attention","capture_receipt","review_summary","notification"]`. Chat is not there. Search is deliberately not there, because ADR-093 already signed its behaviour.

So today: `match_internal_knowledge` retrieves entries and memories **regardless of `sensitivity`**, the answer is composed over their full text, and a 220-character excerpt of each cited source is written into `conversation_messages.citations` and rendered in the clear.

**Why this is the sharpest finding in the audit.** Every other surface Phase 2J fixed *renders* sensitive content. This one **stores a copy of it** in a second table, under a different retention story, where the original row's classification no longer travels with it. Archiving or reclassifying the source does not touch the excerpt. That is a durable divergence between a classification and the thing it is supposed to classify.

**Recoverable.** Yes — inside boundary and without schema. The contract is designed for exactly this: add a governed surface, read `presentationFor`, and `sensitivity-boundary.test.ts` will fail the build if any new code tests a literal level instead.

**The hard sub-question — signed on 2026-08-08 (OD-2K-2, ADR-098).** Masking a *rendered* row was always well-defined; what to do about the *persisted* excerpt was not. The answer is the strongest of the three candidates: **store no excerpt at all for new messages**, keep only a structured reference, and **re-read the source at render time** against its current classification. Masked when `highly_sensitive`, unavailable when removed / inaccessible / out of validity, and a historical excerpt never reproduced in the clear.

It is the strongest because it does not *manage* the divergence, it removes the thing that can diverge. Carrying the classification beside the excerpt would have kept two copies of one fact in sync by convention — the same shape as the three product-event vocabulary copies `202608080087` had to delete.

**What it does not fix, and that is deliberate.** Excerpts already stored stay put; a `jsonb` backfill is a migration and none is authorized. They remain a **named residual**, contained by the renderer never reading a legacy excerpt field.

**Cost.** Medium. → `2K-PRIVACY-*`

---

## G-3 — Two exclusions and one freshness signal are computed, then thrown away

**Loss.** The answer path already knows three things the user is never told:

1. **What was excluded for weak similarity** — `relevant = matches.filter(m => m.similarity >= 0.2)` (`chat/actions.ts:194`). Everything below the floor is discarded silently.
2. **What was excluded because the owner archived it** — `memoriesInForce` (`:80`) drops archived memories, correctly and deliberately, and says nothing.
3. **How old the evidence is** — `occurredAt` is retrieved by the RPC, carried into `ChatSource`, handed to the provider, and **never rendered**.

The user therefore cannot distinguish "the Brain found nothing" from "the Brain found three things and rejected all of them", nor "this is from yesterday" from "this is from March".

**Why this is the cheapest large win in the phase.** Nothing needs to be computed. Three values that already exist need to reach the surface. 2K.5 was scoped as a new explanation system; the audit says most of its input is already in memory and being dropped on the floor.

**The boundary that must hold.** Disclosing *what was excluded and why* is not disclosing model reasoning. The line: the product may say "two memories matched but you archived them" and "the closest match scored below the threshold"; it may never narrate how the model composed its sentence.

**Recoverable.** Yes, fully. **Cost.** Low–medium. → `2K-EXPL-*`

---

## G-4 — An answer with no evidence looks exactly like an answer with evidence

**Loss.** When retrieval returns nothing above the floor, `sources` is empty, the provider still composes prose, `citedSourceIds` is empty, and the thread renders the answer **with no sources block at all** — because the renderer only draws the block when `citations.length > 0` (`[conversationId]/page.tsx:29`).

An answer with zero personal evidence is visually indistinguishable from a short answer whose sources happened not to render. The parent PRD's own principle is that *silence is also a result*; the product currently has no way to say it.

**Recoverable.** Yes. This is a rendering and copy contract, not a retrieval change.

**Measured, not assumed.** The audit did **not** execute a live zero-source turn against the hosted project, so what the provider currently *says* in that case is unknown. Slice 2K.0 measures it before 2K.4 specifies the replacement. → `2K-SRC-*`, and audit §8.2

**Cost.** Low. → `2K-SRC-*`

---

## G-5 — "Actionable card" means one thing for tasks and almost nothing for memories

**Loss.** The task pipeline is genuinely excellent: read-only preview typed `willMutate: false`, every changed field disclosed whether it changed or not, linked effects (reminders, list removal, restorability), stale detection, cross-owner refusal that carries no title, a TOCTOU fingerprint, a single-use server-issued confirmation the caller cannot name, replay reporting, a 24-hour undo, and restore afterwards.

Beside it, a proposed memory gets: a card, a confirm button, content-match idempotency — and **no undo at all**. Confirm a memory you did not mean to keep and the only route back is to find it in Memories and archive it, which is a different surface, a different mental model, and undiscoverable from the conversation that created it.

**The user-facing consequence.** "Confirm" means two different things one line apart in the same composer: *reversible for 24 hours* and *permanent unless you go somewhere else*. Nothing on screen distinguishes them.

**Recoverable.** Yes, inside decision 2a. Notably, a truthful memory undo needs **no migration**: the archive transition already exists (`setMemoryLifecycle`, `:265`), is audited, preserves provenance, and is the product's own signed answer to "this stopped being true". Registering a handler in `undo_operation` *would* cost a migration and is therefore out under 3a.

**The trap to avoid.** Do not give memory a *fake* symmetry. A memory create has no pre-state, so it has no deltas; rendering an empty before/after table to look like the task card would be decoration claiming to be disclosure. The grammar must be shared where the semantics are shared and honestly different where they are not.

**Signed on 2026-08-08 (OD-2K-3, ADR-098): the undo ARCHIVES.** It does not physically remove. Provenance is preserved, the memory leaves the active context, authorization and owner scope are unchanged, and the UI says **explicitly** that the memory was archived or withdrawn from use — and **never** that it was deleted.

This resolves the asymmetry honestly rather than hiding it. The task card keeps its 24-hour window and its restore-afterwards disclosure; the memory card claims **no** window, because it has none. The one outcome the decision forbids is the comfortable lie: a control labelled "undo" that leaves the row in place while letting the user believe it is gone. Two consequences follow that are easy to miss: the archived memory must also stop being **retrievable** as a source — otherwise it keeps answering questions after the user thinks they undid it — and the copy must be asserted **negatively** in both locales, because "deleted" is the word a well-meaning contributor reaches for.

**Cost.** Medium. → `2K-CARD-*`, `2K-ACT-*`

---

## G-6 — Not a gap: sources, semantic retrieval and claim-binding already ship

Recorded because the roadmap treats all three as work, and building them again is the most expensive mistake available in this phase.

| Roadmap framing | Reality |
|---|---|
| 2K.4 "Show the personal records and memories used" | **Ships.** Citations computed, persisted to `conversation_messages.citations`, rendered as links |
| 2K.7 "Semantic retrieval" | **Ships.** `match_internal_knowledge`, pgvector, cosine, owner-scoped, `security invoker` |
| 2K.7 "Bind answer claims to retrieved sources" | **Ships, and defensively.** Fabricated ids are dropped by `flatMap` rather than asserted, so weakening the provider-side filter degrades to a missing citation instead of a mid-conversation `TypeError` |

**Opportunity.** Because retrieval and citation already work, the phase's entire budget can go to *what the user understands about them*. That is a better phase than the roadmap planned.

---

## G-7 — The thread is a wall of prose with no structure to return to

**Loss.** `[conversationId]/page.tsx:29` renders the whole thread as a single expression: role label, content paragraph, optional sources block, optional model string. There is no per-message anchor, no timestamp rendered, no way to link to a specific answer, and no visual distinction between an answer that acted and an answer that only spoke.

For G-1's fix this matters mechanically: "restore the conversation position" needs something to restore *to*.

**Recoverable.** Yes, and it is a prerequisite for G-1 rather than a separate ambition. Keep it minimal — anchors and a stable per-message identity, not a thread redesign, which belongs to no authorized phase. **Cost.** Low. → `2K-CONT-*`

---

## G-8 — The empty state teaches one hard-coded sentence

**Loss.** `chat/page.tsx` renders `pt ? "Experimente: «O que combinei com Marina?»" : "Try: «What did I agree with Marina?»"` — a fixed example, in an inline locale ternary, naming a person the user may not have. A new user learns exactly one question shape; a returning user with a full Brain is shown the same string forever.

**Recoverable.** Yes. Decision boundary: suggestions must be derived from *current surface and current state*, capped at three, and must never put user content into telemetry. The audit's caution is that "derived from state" is easy to do badly — a suggestion naming a person or a project is user content on screen, which is fine, but the *event* recording that it was shown must carry only a bounded category.

**Also note.** The inline ternary is exactly the pattern ADR-036 and `locale-ternary-guard.test.ts` exist to remove. Fixing this gap discharges a small standing debt.

**Cost.** Low–medium. → `2K-SUGG-*`

---

## G-9 — Out of boundary: the retrievable universe is two tables

**Loss, stated honestly.** A user asking "what's open with Marina?" gets an answer grounded in entries and memories only. Tasks, people, projects, organizations and files are semantically invisible. Lexical search reaches all seven domains but composes no answer and cannot be joined to chat — `phase-2i-search-guard.test.ts:143` fails the build if the search feature so much as references an embedding column, a vector operator, a similarity function, or generates an answer.

**Not recoverable in Phase 2K, by signed decision.** ADR-055 names `source_type` widening, backfill, pipelines, job types and indexes as forbidden until an evidence threshold is met. The funnel is empty. Decision 1a removes 2K.7 from implementation scope.

**And now not recoverable later by default either — signed on 2026-08-08 (OD-2K-6, ADR-098).** At the ADR-055 expiry the *widening* **retires from the active roadmap**. The retrieval that exists today over entries and memories is **not** removed, disabled or degraded; only the expansion retires. Resumption requires a new measurable demand signal, a new audit, a new ADR, its own budget and explicit authorization — and ADR-055 is explicitly **not** to be renewed artificially to keep a possibility alive on the roadmap.

That is the correct reading of ADR-055's own logic rather than a new refusal: it gave itself an expiry precisely because a permanently pending gate blocks nothing and decides nothing. The funnel is empty, the spike tier was never executed, and the planning tier's statistics were never available at one user. Retirement is the outcome the ADR already committed to when its thresholds went unmet.

**Destination.** Slice 2K.0 records the retirement and the closed list of resumption conditions. It writes **no** renewal date.

**The opportunity this creates.** Phase 2K can make the *limit* legible instead of hiding it. An answer that says "I looked at your records and memories" is honest and teaches the user the shape of the system; today the product implies it looked everywhere. That costs nothing and is inside boundary. → `2K-SRC-*`

---

## G-10 — Accessibility coverage exists but stops before Conversar

**Loss.** The 2J.0 lane is good and it works — it caught a real Phase 2I defect on its first run (a 16px target on a Pixel 7 under WCAG 2.2 AA 2.5.8). But `SURFACES` is four static fixtures: palette closed, palette open, global search, Library. Conversar — the surface this phase is about, and the one with the most interactive states in the product — has **no axe scan, no focus-paint check, no target-size check and no reduced-motion check**.

Meanwhile the composer itself is already strong: one polite live region with the command renderer silenced so nothing announces twice, focus moved to the outcome only for routes it owns, and `isComposing` respected on Enter — which is a genuine correctness property for pt-BR and CJK input, not a nicety.

**So the gap is coverage, not quality.** The risk is that the new states this phase adds — pending, expired, refused, undone, masked, insufficient-evidence — arrive uncovered.

**Recoverable.** Yes, by extending `SURFACES` with the card and source states as they land, slice by slice, rather than at closeout. Phase 2J learned this the hard way: Phase 2I deferred accessibility to the end and then did not reach it.

**What must not be claimed.** A screen-reader session with a real assistive technology has never been executed for this surface. It is declared **not proved** and reported as manual or as an evidenced negative — never inferred from an axe pass. **Cost.** Medium. → `2K-A11Y-*`

---

## G-11 — The phase would close blind

**Loss.** There is no `chat` or `conversation` value in `productSurfaces`, and none of the 30 `productEventNames` describes an answer, a source, a card, or an explanation. Phase 2K could ship every requirement above and be unable to answer "did anyone use it?".

**The specific trap, already paid for once.** SH.6 shipped a producer with no consumer and its quota refusals recorded nothing for weeks while the code read as though they did. Then `202608080087` found a *third* copy of the event vocabulary frozen inside the writer's body, silently rejecting `rate_limit_refused` and all three Phase 2J events. Enforcement is now two gates — the table CHECK and `validate_product_event_properties` — and `post_2j_product_event_write_path.sql` derives the vocabulary from the CHECK at test time and writes every declared name through the real public writer.

**Recoverable.** Yes — this is the sole destination of decision 3a's single budgeted migration, and 3a explicitly permits `1 allocated · 0 spent` if the telemetry can be delivered honestly without one.

**Non-negotiable.** Content-free by *shape*, not by promise: every property a closed enum or a boolean, with no key capable of holding a query, a title, a filename, an excerpt or a transcript. → `2K-METRICS-*`

---

## Ranked summary

| # | Gap | Loss | In boundary | Cost |
|---|---|---|---|---|
| G-1 | Pending action dies on navigation | High | Yes | Medium |
| G-2 | Conversar ungoverned for sensitivity; excerpt persisted | High | Yes | Medium |
| G-5 | "Confirm" means two different things | High | Yes | Medium |
| G-3 | Exclusions and freshness computed then discarded | Medium-high | Yes | Low-medium |
| G-11 | Phase would close blind | Medium-high | Yes | Low (1 migration ceiling) |
| G-10 | Accessibility stops before Conversar | Medium | Yes | Medium |
| G-4 | No-evidence answer looks like an evidenced one | Medium | Yes | Low |
| G-8 | Empty state teaches one hard-coded sentence | Medium | Yes | Low-medium |
| G-7 | Thread has nothing to return to | Medium | Yes | Low |
| G-9 | Retrievable universe is two tables | Medium | **No** — ADR-055 | Decision only |
| G-6 | *Not a gap* — already ships | — | — | Avoid rebuilding |

**The shape this implies.** Phase 2K is not "build conversational actions". Conversational actions largely exist. It is **make the conversation honest about what it did, what it used, what it ignored, and what it cannot reach — and stop destroying pending work when the user checks.** That is a smaller and more defensible phase than the roadmap sketched, and every item above except G-9 is reachable inside the signed decisions with a ceiling of one migration.

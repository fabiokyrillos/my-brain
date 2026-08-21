# Phase 2Q — Gaps and opportunities

**Every row below states which *kind* of work it is.** The owner asked
explicitly that work already shipped not be described as new, so the kind is a
column rather than a tone.

| Kind | Meaning |
|---|---|
| **construction** | nothing like it exists; it is built from nothing |
| **hardening** | it works and its guarantee is weaker than it reads |
| **correction** | it is wrong on `main` today |
| **extension** | a shipped mechanism is applied to one more case |
| **validation** | it is believed true and has never been executed |
| **external debt** | blocked on something outside this repository |
| **owner decision** | it cannot be started until the owner signs |

---

## 1. Priority map

| Priority | What the owner cannot do today | Kind | Phase response |
|---|---|---|---|
| **P0** | check a review's claim against the record behind it | **construction** (persistence) + **extension** (the resolver) | 2Q.1 → 2Q.2 → 2Q.3 |
| **P0** | trust that a link the product draws goes where it says | **correction** — the allow-set is keyed on the uuid alone | 2Q.2 |
| P1 | read global search and the Work bulk bar in dark mode on WebKit | **correction** + **validation** (a CI lane that cannot see it) | 2Q.4 |
| P1 | know the phase told the truth about itself | **construction** | 2Q.5 |
| — | see what a review was written from **before** it is generated | **owner decision** (`OD-2Q-2`) | out unless signed |
| — | let the Brain create projects, companies, memories or relations for them | **construction**, two phases' worth | out (`OD-2Q-8`) |

---

## 2. The one gap, stated precisely

The product answers "where did this come from" on **seven** surfaces and refuses
to answer it on **one**.

**Seven that answer** — task detail, memories (list and detail), a person, a
project, the entity association and relationship panels, an entry (return link),
and chat's resolved source cards.

**One that refuses** — `/app/reviews/[reviewId]`. It passes
`new Set<string>()` as the link allow-set, so every link the model writes
degrades to plain text, and the page tells the owner it cannot name the records.

**That refusal is currently correct.** The page has nothing to vouch for: the
identifiers exist during generation, are already validated against the rows the
request read, and are dropped at the write. The gap is one column and one
vocabulary correction wide — not a missing capability.

---

## 3. What is *not* a gap, and must not be planned as one

Recorded because each of these reads like work and is not.

| Reads like | Actually |
|---|---|
| "tasks have no provenance" | **false.** `task-detail-projection.ts:196` returns it and `task-detail-view.tsx:279` renders a link. This audit's own first pass got it wrong by grepping a 38-line route file that delegates |
| "the product cannot render Markdown safely" | it can. `reviews/markdown.ts` is a typed AST with no `dangerouslySetInnerHTML` on the path, shipped in Phase 2P |
| "a citation needs a join table and ownership triggers" | one `jsonb` column. `conversation_messages.citations` has worked this way since Phase 2K, with **no** check constraint, trigger or deployed validator |
| "citations need a new RLS policy" | the column inherits `summaries`' policies and forced RLS. `2Q-CITE-002` asserts they are *unchanged* |
| "the settings `revalidatePath` debt is open" | `SETTINGS_REVALIDATION_PATHS` already uses the route **pattern**. The remaining literal calls name URLs that *are* the rendered route, which this repository has since proved works |
| "the four automation flows are one blocked group" | measured, they are four different problems — two medium, one large and worker-touching, one blocked by `2N-RELATION-TRIGGER` |
| "Revisões needs redesign" | it was redesigned in Phase 2P and the owner approved it. This phase adds links to it and changes nothing else |

---

## 4. Design principles for this phase

- **A link is evidence or it is not offered.** Every anchor traces to an
  identifier recorded at generation time from a row read under RLS.
- **The stored envelope is a claim, never a proof.** Every citation is re-read at
  render time, under the reader's own session.
- **Refusing costs words, not meaning.** A refused link becomes text; the model's
  sentence survives intact. Stripping it would let the product delete its own
  report.
- **The page must not become a probe.** Removed, unreadable and foreign produce
  the same output — asserted as equality, not as three passing tests.
- **Citations carry identifiers, never content.** The shape has nowhere to put an
  excerpt, and that is the control.
- **A container is not a link.** A section headed "Fontes" with no canonical
  links in it is not delivery — ADR-125 Decision 4, inherited.
- **The product may say what it cited. It may not say the sentence is true.**

---

## 5. Deliberate non-goals

This is not a redesign of Revisões, a new retrieval strategy, a new provenance
system, a widening of what the Brain reads, a change of AI provider, a signup
change, a rollout change, or a container for the project's accumulated debt.

Every inherited remainder is classified in the audit §4 with a destination, and
most of those destinations are **not this phase**.

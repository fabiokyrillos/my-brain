# Phase 2I — UX gaps and opportunities

**Date:** 2026-08-07 · **Status:** PLANNING ONLY.
Companion to the audit, the PRD and the threat model.

Where the audit says *what exists* and the PRD says *what will be built*, this
document says **where the parent PRD and repository reality disagree**, and what
is cheaply available that nobody has claimed.

---

## 1. Where repository reality corrected the parent PRD

Each row is a place the parent PRD would have led to work that is unnecessary,
mis-sized, or in the wrong order.

| # | Parent PRD position | Repository reality | Correction |
| --- | --- | --- | --- |
| **C-1** | §5.1/§5.4 propose a new primary navigation; slice 1.1 estimated 1–2 weeks | Four primary destinations, capture as global centre action, and the five-slot mobile bar are **DELIVERED** | Re-priced as **one label plus one grouping**. The smallest product slice in the phase, against a parent that treats it as one of the largest. |
| **C-2** | Implies "Brain → Conversar" is outstanding | **Already shipped** — `messages.ts` carries `chat: "Conversar"` with the UX-06/DEC-2 reasoning | Removed from scope entirely. |
| **C-3** | §5.2 defines Biblioteca membership as new IA | The six members **already share `group: "context"`** in `capabilities.ts` | Library is **rendering a grouping that exists as data**, not designing one. |
| **C-4** | §3.2 leads with "muitos destinos competem pela atenção" | Twelve items sit **flat inside `Mais`** — nothing competes, because nothing is visible | Reframed as a **retrieval** problem, which is why the owner's approved order puts palette and search first. |
| **C-5** | Etapa 1 orders navigation → Biblioteca → palette → search | — | **Inverted by owner decision.** Building Library first would group twelve into five, then build the tools that make grouping largely unnecessary. |
| **C-6** | §6.1 lists "exportação de dados" among privacy-centre contents beside shipped items | **Does not exist** | Named as new. Routed to the rollout/legal track, not Phase 2I. |
| **C-7** | §5.2 says "Empresas" | Table is `organizations`; label **is already** `Empresas`/`Companies` | Requirements use the product vocabulary and query the real table. Pinned so the slice does not discover a rename mid-flight. |
| **C-8** | Treats states as finish ("estados vazios, carregamento, erro e processamento") | Capture is **asynchronous** since Phase 2X; interpreting is the most common intermediate state and has **no contract** | Promoted to **architecture** — `2I-LANG-005`, in the phase's root slice, consumed by everything after. |
| **C-9** | §10 gives absolute calendar totals (14–20 months) for a 5-person team | The team is one owner plus this agent | Phase 2I carries **no calendar estimate**. Ranges stay in the parent as relative sizing. |
| **C-10** | Slice 1.4 "busca global lexical", 2 weeks, no schema discussion | **No FTS object exists anywhere in the 84-migration chain** | Made an explicit measured decision at G-2I.2, with at most one migration and zero preferred. |

**C-1 through C-3 are the same finding wearing three hats:** the parent PRD was
written from the product's *feel*, and the code is further along than it feels.
That is worth saying plainly rather than burying, because it is the second
planning pass to make the same over-statement, and the fix — cite the constant
you intend to change — is cheap.

---

## 2. Gaps the parent PRD names that Phase 2I genuinely closes

| Gap | Slice |
| --- | --- |
| No way to reach an action without knowing where it lives | 2I.4 |
| No way to find information by name across domains | 2I.5 |
| Six context domains with no shared door | 2I.6 |
| State means different things on different screens | 2I.1 |
| No shared way to propose / confirm / undo | 2I.2 |
| `Mais` is an undifferentiated list of twelve | 2I.3 |
| "Saved, still being interpreted" is unexpressed | 2I.1 (`2I-LANG-005`) |

---

## 3. Gaps Phase 2I deliberately leaves open

Not oversights. Each is named with where it goes.

| Gap | Destination | Why not now |
| --- | --- | --- |
| Voice capture | Etapa 2 phase | Five contracts at once; D4 settles retention, the rest is that phase's work |
| Semantic search | ADR-055, **expires 2026-10-27** | Lexical search is what generates the evidence ADR-055 wanted |
| Calendar | Etapa 4 phase | Possibly zero migrations — a strong candidate for the *next* phase |
| Memory conflicts | Etapa 5 phase | The clearest genuine migration in the parent PRD |
| Person / project context pages | Etapa 5 phase | Detail pages exist; the contextual summary does not |
| Daily planner, contextual suggestions | Etapa 4 phase | Blocked on the parent PRD's unaddressed **cost** question — BYOK means proactive AI spends the user's money |
| Bulk actions | Etapa 4 phase | A write-path slice wearing a list-UI costume |
| Onboarding | Etapa 6 phase | Parent PRD §9 says it closes only after the Etapa 1–3 journey exists |
| Data export | Rollout / legal track | A privacy surface, not a findability one |
| Dark mode | **Out** (D5) | Doubles the visual QA surface of every later slice |

---

## 4. Opportunities available cheaply — surfaced, not scheduled

**None of these is a recommendation to widen Phase 2I.** They are recorded so
they are not rediscovered.

1. **The whole of the parent PRD's §5 IA is already modelled as data.** Beyond
   Library's `context` group, `capabilities.ts` also declares `reflection`,
   `organization`, `transparency` and `preferences` — which are exactly §5.3's
   "atividade e configurações". A later phase gets that surface for the cost of
   rendering, as Library does here.

2. **`agent_preferences` already declares §6.2's personalization keys as
   `future`** with `visible: false` — `scheduled_reviews`, `autonomy`,
   `follow_up_intensity`, `privacy_default`, `locale_preference`,
   `reasoning_route`, `background_route`. Progressive personalization is partly
   making declared-but-hidden capabilities real, and `capabilities.ts` already
   tracks which have consumers.

3. **The error sink has no product consumer.** `error_events` records failures
   under a closed vocabulary. The parent PRD's §4.8 ("nenhuma tela sem próximo
   passo") and its "falhas recuperáveis" in *Precisa de você* could consume it,
   turning an operator surface into a user-facing recovery affordance. Phase 2I
   builds the **error states** that such a feature would render into, so it is
   the natural successor.

4. **Retiring the 266 locale ternaries pays for itself here.** The parent PRD
   §12 demands both languages per etapa. A ratchet (`2I-CLOSE-003`) retires the
   debt incrementally through the work that would otherwise trip over it,
   instead of a sweep nobody will schedule.

5. **`attachments.extracted_text` makes file search unusually good** for a
   lexical implementation — the product already extracts document text for
   interpretation. It is also OD-2, because it surfaces text the user never
   wrote.

---

## 5. The two owner decisions inside Phase 2I's scope

Both block slice 2I.5 at gate G-2I.5. Both are cheap now and expensive after
users form expectations.

| | Decision | Options |
| --- | --- | --- |
| **OD-1** | Do `private` and `highly_sensitive` records appear in global search results? | include all · exclude `highly_sensitive` unless filtered · include but mark |
| **OD-2** | Is `attachments.extracted_text` searchable? | yes (search inside files) · no (metadata only) |

Neither is a security question — the user owns all of it. **OD-1 is an
expectation question**: a record marked `highly_sensitive` appearing in a result
list on a phone in public breaks what the classification implies. **OD-2 is a
scope question**: whether search reaches content the user never typed.

---

## 6. What must not weaken — restated as things a designer can hold

| Invariant | Designer-facing form |
| --- | --- |
| One write path | The palette starts flows; it never performs them. |
| RLS is the trust boundary | Search shows only what you own, decided in the query. |
| AI proposes, the user disposes | Phase 2I makes no AI call at all. |
| Auditable and reversible | Phase 2I adds no mutation, so it adds no audit gap. |
| Untrusted content is data | A result is text, never markup, never an instruction. |
| The user pays | Phase 2I spends nothing. |
| Content is never lost to a configuration gap | Every state must say the user's content is safe — which is why **interpreting** is a first-class state. |

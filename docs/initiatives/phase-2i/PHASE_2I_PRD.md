# Phase 2I — Foundation and Findability — PRD

**Status:** PLANNING ONLY (ADR-092). **Implementation is not authorized.**
**Date:** 2026-08-07 · **Parent product direction:**
[`MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md`](../product-ux/MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md)
**Scope:** the parent PRD's **Etapa 0 + Etapa 1 only.** Etapa 2+ is out.
**Audit this is written against:**
[`PHASE_2I_CURRENT_EXPERIENCE_AUDIT.md`](../../reports/phase-2i/PHASE_2I_CURRENT_EXPERIENCE_AUDIT.md)

---

## 0. Owner decisions, signed — the record this phase is built on

| # | Decision | Consequence here |
| --- | --- | --- |
| **D1** | Initiative name: **Phase 2I — Foundation and Findability** | |
| **D2** | Scope is **Etapa 0 + Etapa 1 only** | Etapa 2+ is not pulled in. The parent PRD stays the roadmap and is decomposed into independently closable phases. |
| **D3** | **Public signup is NOT a prerequisite** | Development and validation proceed against the existing controlled accounts. |
| **D3a** | Instrumentation must distinguish **internal/manual-account cohort** from **future public-signup cohort** | §8. Current-population metrics are **never** evidence of public acquisition or activation. |
| **D4** | **Original audio is discarded** after successful transcription and confirmed capture | Recorded in §11 as an input to the *future* phase. **Voice is not in Phase 2I.** |
| **D5** | **Dark mode is OUT** | Not partially implemented. §10. |
| **D6** | **Command palette precedes global lexical search** | Slice order 2I.4 → 2I.5. |
| **D7** | **Global lexical search precedes Library** | Slice order 2I.5 → 2I.6. |
| **D8** | Migration budget **maximum ONE**, allocated to search only if proven necessary | §9. May remain unspent, and unspent is the preferred outcome. |
| **D9** | **Implementation remains unauthorized** | This document does not start the phase's code. |

---

## 1. Objective

> Define and prepare the foundation that makes the rest of the mobile-first
> experience coherent and easy to discover.

The phase leaves behind seven things: one consistent visual/trust language; a
real mobile-first shell; reusable universal states; reduced and coherent primary
navigation; fast global **action** discovery; fast global **information**
discovery; and a coherent Library entry point over the existing context domains.

### The acceptance question

> *"Can a user understand where they are, find an action, find information and
> move between the product's major capabilities without knowing My Brain's
> internal architecture?"*

Every requirement below exists to move that question toward yes. A requirement
that cannot be traced to it does not belong in this phase.

---

## 2. What is already delivered — and must not be rebuilt

**Read this before reading the requirements.** The parent PRD describes a
navigation redesign; the audit found most of its structure already shipped. A
redesign claim in this document **never** implies code must be rebuilt when the
baseline already satisfies it.

| Parent PRD asks for | Repository state | Phase 2I does |
| --- | --- | --- |
| Hoje / Registros / Trabalho / Conversar as primary | **DELIVERED** in `capabilities.ts` | **nothing structural** |
| Capture as the global centre action | **DELIVERED** | nothing |
| Five-slot mobile bar | **DELIVERED** (product-UX slice H) | refine, not rebuild |
| `work` absorbing `today`/`tasks`/`waiting` | **DELIVERED** via aliases | nothing |
| "Brain" → "Conversar" | **ALREADY DONE** — `messages.ts` | **nothing** |
| "Início" → "Hoje" | pending | **one label** |
| Biblioteca membership | the `context` **group already exists as data** | **render it** |
| Command palette | absent | **build** |
| Global search | absent | **build** |
| Full-text infrastructure | **absent from the whole chain** | **decide in 2I.0** |

---

## 3. Requirement families

Eight families. Ids follow the repository's declaration shape so the
traceability generator and the A13 detector both read them.

| Family | Slice | Subject |
| --- | --- | --- |
| `2I-LANG` | 2I.1 | Visual language and universal states |
| `2I-TRUST` | 2I.2 | Trust and action components |
| `2I-SHELL` | 2I.3 | Mobile shell and navigation convergence |
| `2I-PALETTE` | 2I.4 | Command palette |
| `2I-SEARCH` | 2I.5 | Global lexical search |
| `2I-LIB` | 2I.6 | Library surface |
| `2I-METRIC` | cross-cutting | Privacy-safe UX telemetry |
| `2I-CLOSE` | 2I.7 | Convergence, accessibility, traceability |

---

## 4. Slice 2I.1 — Visual language and universal states

**User problem.** State means different things on different screens. A user
cannot learn the product once, because "this needs your attention" does not look
the same in Registros as in Trabalho.

**Current journey.** Colour and emphasis are chosen per surface. Empty, loading
and error states exist but were written independently. **Nothing expresses
"saved, still being interpreted"**, which is the product's most common
intermediate state since capture became asynchronous in Phase 2X.

**Target journey.** A user recognises a state anywhere in the product without
re-learning it, including on a screen they have never opened.

| Dimension | Contract |
| --- | --- |
| **Mobile** | Every state legible at 375 px; touch targets ≥ 44 px; no state expressed only by hover. |
| **Desktop** | Same tokens; density may increase, meaning may not change. |
| **Empty** | Says what would be here and offers the one action that creates it. Never a bare dash. |
| **Loading** | Skeleton matching final layout, so nothing reflows on arrival. |
| **Interpreting** | **A distinct state, not a spinner.** The entry is saved; the AI has not finished. Must state that the content is safe. |
| **Error — recoverable** | Names what failed and offers a retry that goes through the existing action. |
| **Error — terminal** | Names what failed, says it will not retry, offers the next safe step. |
| **Offline** | Distinguishes "not sent" from "sent, unknown". |
| **Accessibility** | **Meaning never carried by colour alone** — every state has an icon or text affordance. Contrast ≥ 4.5:1. `prefers-reduced-motion` honoured. |
| **Keyboard / focus** | Focus visible on every interactive element; focus never lost when a state transitions. |
| **Telemetry** | State *kind* only. Never content. |
| **Dependencies** | None. This is the phase's root. |
| **Security / privacy** | None — presentational. |
| **Acceptance** | A static guard asserting semantic tokens are the single source of state colour; screenshots at four viewports; an axe pass. |

- **2I-LANG-001:** Semantic state tokens are declared **once** and are the only
  source of state colour — information, success, attention, risk, AI-suggestion,
  archived. A guard asserts no surface hard-codes a state colour.
- **2I-LANG-002:** User text, AI interpretation, AI suggestion and confirmed
  action are **visually distinct**, and the distinction never depends on colour
  alone. This is the parent PRD §4.3 made checkable.
- **2I-LANG-003:** Typography, spacing, elevation, border and density are
  standardised as tokens; a surface may choose density, never meaning.
- **2I-LANG-004:** The universal state set — empty, loading, **interpreting**,
  recoverable error, terminal error, offline — exists as one contract with one
  implementation per state.
- **2I-LANG-005:** The **interpreting** state is a first-class member and states
  that the user's content is already saved. Capture is asynchronous; a state
  that reads as "working, might fail" over content that is already durable is a
  false alarm the architecture does not warrant.
- **2I-LANG-006:** Every state satisfies contrast, reduced-motion and
  non-colour-only encoding **as a completion condition**, not as a later pass.
- **2I-LANG-007:** **Dark mode is out of scope** (D5) and is not partially
  implemented. No half-set of dark tokens ships.

---

## 5. Slice 2I.2 — Trust and action components

**User problem.** Every surface invents its own way to propose, confirm and undo,
so the user cannot build one mental model of "the Brain suggested something and I
decided".

**Current journey.** `src/features/task-commands/` has a real preview-and-confirm
path. It is **one feature's** implementation, not a vocabulary the rest can use.

**Target journey.** Suggestion, confirmation, source and undo look and behave
identically wherever they appear, so a first encounter on a new surface is not a
first encounter with the pattern.

| Dimension | Contract |
| --- | --- |
| **Mobile** | The desktop side panel's equivalent is a **full-screen** view with an explicit close that returns focus to the origin. |
| **Desktop** | Side panel; the underlying list keeps its scroll position. |
| **Empty / loading / error** | Inherited from `2I-LANG`, not re-invented. |
| **Accessibility** | Panel is a focus trap with a labelled close; `Esc` closes; focus returns to the invoking control. |
| **Keyboard / focus** | Every card action reachable by keyboard in DOM order. |
| **Telemetry** | Component kind and outcome (confirmed / edited / dismissed). **Never** the proposed content. |
| **Dependencies** | 2I.1. |
| **Security / privacy** | **Components only — Phase 2I adds no new mutation.** A confirm button calls an existing action or it does not ship. |
| **Acceptance** | Component tests per state; a guard that no component owns a write path. |

- **2I-TRUST-001:** A **suggestion card** with a consistent shape for
  preview / edit / confirm / dismiss.
- **2I-TRUST-002:** A **confirmation card** whose weight is proportional to
  risk, and which is mandatory for anything irreversible.
- **2I-TRUST-003:** A **source card** that identifies a record, memory, task,
  person, project, company or file and opens it without losing the origin.
- **2I-TRUST-004:** A **processing banner** consuming `2I-LANG-005`.
- **2I-TRUST-005:** **Undo feedback** — a result statement with a real undo where
  one exists. Where the domain has no undo, the component says so rather than
  offering a control that cannot work.
- **2I-TRUST-006:** **Entity chips** for person, project, company and context,
  reading the vocabulary layer — never a raw database enum.
- **2I-TRUST-007:** The **panel/full-screen pair**, one contract, both
  breakpoints.
- **2I-TRUST-008:** **No component performs a write.** Components accept a
  handler; the handler is an existing Server Action or RPC. Asserted by guard —
  this is the one-write-path invariant expressed at the component layer.

---

## 6. Slice 2I.3 — Mobile shell and navigation convergence

**User problem.** Twelve destinations sit flat behind `Mais` (audit §1.2), and
one primary destination is named for a place rather than for the day's work.

**Current journey.** The five-slot bar and the four primary destinations are
**delivered**. `Mais` is an undifferentiated list.

**Target journey.** The same five slots, one corrected label, and `Mais`
presented as the groups the code already declares.

| Dimension | Contract |
| --- | --- |
| **Mobile** | Five slots unchanged: Hoje · Trabalho · **[Capturar]** · Conversar · Mais. `Mais` shows groups, not a flat list. Safe areas and virtual keyboard handled. |
| **Desktop** | Rail keeps the same destinations and the same grouping. Desktop and mobile never disagree about where something lives. |
| **Empty / loading / error** | Navigation has no empty state; a destination that fails to load uses `2I-LANG`. |
| **Accessibility** | Bar is a labelled landmark; the active destination is programmatically current, not merely coloured. |
| **Keyboard / focus** | Every destination reachable by keyboard on desktop; focus lands in main content after navigation. |
| **Telemetry** | Destination **key** and surface (mobile/desktop). Never a record id. |
| **Dependencies** | 2I.1, 2I.2. |
| **Security / privacy** | None. |
| **Acceptance** | Old routes still resolve; a guard asserts every `capabilities.ts` key is reachable. |

- **2I-SHELL-001:** Primary destinations are **Hoje, Registros, Trabalho,
  Conversar** with **Capturar** as the global action. **DELIVERED baseline** —
  this requirement asserts it and forbids regression; it builds nothing.
- **2I-SHELL-002:** `home`'s label becomes **Hoje / Today**, in
  `src/i18n/messages.ts`. **The only navigation rename this phase owns**; the
  `chat: "Conversar"` rename is already shipped and is not re-done.
- **2I-SHELL-003:** `Mais` renders the **existing** `group` values rather than a
  flat list. No new grouping is invented.
- **2I-SHELL-004:** **Every existing route keeps working.** Saved URLs are not
  invalidated; no user relearns an address. Asserted per key.
- **2I-SHELL-005:** Desktop and mobile expose the same destinations and the same
  grouping, and navigation state survives a breakpoint change.
- **2I-SHELL-006:** Virtual-keyboard behaviour, safe areas and touch targets are
  satisfied at 375 px and 412 px.

---

## 7. Slice 2I.4 — Command palette

**User problem.** To do anything, the user must first know where it lives.

**Target journey.** Type what you want; go there or start it — from any screen.

| Dimension | Contract |
| --- | --- |
| **Mobile** | A **touch** entry point, not a keyboard-only affordance. Opens full-screen with the field focused and the keyboard raised. |
| **Desktop** | Keyboard invocation from every screen. |
| **Empty** | Open with **no query**: show destinations and context actions, never a blank box. |
| **No results** | Say so and offer the nearest useful action. |
| **Loading** | Local navigation is instant; anything asynchronous shows inline progress without blocking typed input. |
| **Error** | A failed action reports through `2I-LANG`; the palette does not swallow it. |
| **Accessibility** | Combobox semantics; arrow-key traversal; active option announced; `Esc` closes and **returns focus to the invoker**. |
| **Keyboard / focus** | Full operation without a pointer. |
| **Telemetry** | Action **kind** chosen, whether a query was typed, and completion. **Never the query text** (§8). |
| **Dependencies** | 2I.1, 2I.2, 2I.3. |
| **Security / privacy** | See below — this is the slice with a real boundary risk. |
| **Acceptance** | Keyboard-only journey, desktop + mobile, both locales; a guard proving no new write path. |

- **2I-PALETTE-001:** Invocable by keyboard on desktop **and** by touch on
  mobile, from every authenticated screen.
- **2I-PALETTE-002:** Navigates to any destination in `capabilities.ts`, read
  from the model rather than from a second hard-coded list.
- **2I-PALETTE-003:** Starts **capture** and **conversation** through their
  existing entry points.
- **2I-PALETTE-004:** Starts task/create flows **only through existing
  contracts** — the `task-commands` create-intent path with its preview and
  confirmation. The palette never becomes a second way to write.
- **2I-PALETTE-005:** **No generic command executor.** Actions are a closed,
  enumerated set. A string the user types is a *query*, never an instruction —
  the standing "user content is data, not instructions" rule at the UI layer.
- **2I-PALETTE-006:** Offers context-specific actions for the current surface.
- **2I-PALETTE-007:** An action the user cannot currently perform is **absent**,
  not shown-and-refused. Absence is computed from the same predicate the surface
  uses, so the palette cannot disagree with the product.
- **2I-PALETTE-008:** **Fast.** Opens and filters without a network round trip
  for navigation and local actions. Budget in §9.1.
- **2I-PALETTE-009:** Recent/frequent actions **only if** expressible without
  personal-content telemetry — action kinds are safe, typed queries are not. If
  it cannot be built inside that constraint, it is **not built**.
- **2I-PALETTE-010:** **Not a second application shell.** No nested navigation,
  no multi-step wizards, no state that outlives it.

---

## 8. Slice 2I.5 — Global lexical search

**User problem.** There is no way to find a thing by what it is called. The user
must remember which of seven domains it lives in and go there first.

**Target journey.** Type a word; see matches across everything you own, labelled
by type; open one.

### 8.1 Domains — verified against the schema (audit §4)

| Displayed | Table | Searched columns |
| --- | --- | --- |
| Tarefas / Tasks | `tasks` | `title`, `description` |
| Registros / Records | `entries` | `original_content` |
| Memórias / Memories | `memories` | `content` |
| Pessoas / People | `people` | `name`, `notes` |
| Projetos / Projects | `projects` | `name`, `description` |
| **Empresas / Companies** | **`organizations`** | `name`, `description` |
| Arquivos / Files | **`attachments`** | `original_name`, `description`, `extracted_text` |

| Dimension | Contract |
| --- | --- |
| **Mobile** | Full-screen results; type filter reachable without leaving the field; a result opens its destination and Back returns to results with the query intact. |
| **Desktop** | Same model, denser. |
| **Empty (no query)** | Recent destinations or a prompt — never a blank page. |
| **Empty (no results)** | Says the query matched nothing **the user owns**, and offers reformulation. Must not imply the item exists elsewhere. |
| **Loading** | Skeleton rows; a slow domain never blocks the ones that returned. |
| **Error** | A failed domain is named as failed; the others still render. **Partial results are labelled partial** — silently dropping a domain is a wrong answer that looks like a complete one. |
| **Accessibility** | Results are a labelled list; count announced; type is text, not colour. |
| **Keyboard / focus** | Traversable and openable by keyboard; focus returns to the result on Back. |
| **Telemetry** | Whether a search ran, result count bucket, type filter used, whether a result was opened, refinement. **Never the query text** (§10). |
| **Dependencies** | 2I.1, 2I.2, 2I.3. Independent of the palette in code, after it in order. |
| **Security / privacy** | The phase's main threat surface — see the threat model, T-2I-01. |
| **Acceptance** | Ownership proven in pgTAP **with a second account**; performance measured; both locales. |

- **2I-SEARCH-001:** Lexical search across the seven domains in §8.1, using the
  product's own vocabulary — **Empresas/Companies**, not "organizations".
- **2I-SEARCH-002:** Every result declares its **type** in text.
- **2I-SEARCH-003:** Filters by **type** and by **period**.
- **2I-SEARCH-004:** **Ownership is enforced in the query**, under the
  authenticated client and forced RLS — never by filtering after the fact.
- **2I-SEARCH-005:** A zero-result response is **indistinguishable** from a
  not-owned response. Search must not become an existence oracle.
- **2I-SEARCH-006:** Results are **bounded** per domain and in total, and the
  bound is stated in the response so "more exist" is expressible.
- **2I-SEARCH-007:** **Partial failure is visible.** A domain that errored is
  named; the result set is labelled incomplete.
- **2I-SEARCH-008:** Performance targets in §9.1, measured rather than asserted.
- **2I-SEARCH-009:** Reformulation is offered on a weak or empty result.
- **2I-SEARCH-010:** **No embeddings, no vector retrieval, no generated answer.**
  Search returns records the user owns; it never composes prose about them.
  `memories.embedding` and `entry_embeddings` are untouched, and **ADR-055 is
  neither satisfied nor superseded** by this slice.
- **2I-SEARCH-011:** Telemetry records **no query text** and no personal
  content, by construction rather than by redaction.

### 8.2 Two owner decisions this slice needs — surfaced, not taken

**OD-1 — Do `private` and `highly_sensitive` records appear in global search
results?** Three domains carry
`sensitivity in ('normal','private','highly_sensitive')` (audit §4.1, F-2I-B).
Nothing in the repository declares search behaviour for them, because there has
never been a global result list. Options: include all (simplest, and the user
owns everything anyway); exclude `highly_sensitive` unless a filter is set;
include but mark. **A search feature that silently surfaces every class has made
this decision by omission**, which is why it is named here. **Not decided in
planning.**

**OD-2 — Is `attachments.extracted_text` searchable?** It is document *content*,
not text the user typed into My Brain. Including it is what "search inside
files" means and is clearly useful; it also means a query can surface text the
user never wrote. **Not decided in planning.**

Both are cheap to implement either way and expensive to change after users form
expectations, which is why they are decisions and not defaults.

---

## 9. Slice 2I.6 — Library

**User problem.** Six context domains have no shared door; they are six of the
twelve flat items behind `Mais`.

**Target journey.** One destination that says *this is what the Brain knows
about your world*, with the six domains beneath it.

| Dimension | Contract |
| --- | --- |
| **Mobile** | Reached from `Mais`; type navigation first, content second. |
| **Desktop** | A destination in the rail with the six domains visible. |
| **Empty** | A domain with nothing says what would live there and how to create it. |
| **Loading** | `2I-LANG` skeletons. |
| **Error** | One failed domain does not blank the surface. |
| **Accessibility** | Landmark and heading structure; keyboard traversal. |
| **Keyboard / focus** | Full keyboard traversal to each domain. |
| **Telemetry** | Which domain was entered. Never an entity name. |
| **Dependencies** | 2I.3, and search for its entry point. |
| **Security / privacy** | None new — every domain is already RLS-scoped. |
| **Acceptance** | Every existing domain route still reachable directly. |

- **2I-LIB-001:** Library groups exactly the six existing `group: "context"`
  members — Memories, People, Projects, **Companies**, Contexts, Files. **The
  grouping is read from `capabilities.ts`, not re-declared.**
- **2I-LIB-002:** **No new data model.** If evidence emerges that one is
  required, the slice stops and the plan is amended.
- **2I-LIB-003:** Shows **recent** items where an existing timestamp supports it.
- **2I-LIB-004:** Shows **pinned/favourite only if the repository already
  supports it.** *Planning note: no pin/favourite column was found in any of the
  six domains, so the expected outcome is that this requirement is delivered as
  "not supported, not built" with the evidence, rather than by adding a column —
  that would be a data model, which `2I-LIB-002` forbids.*
- **2I-LIB-005:** Shows **needs-attention only where a deterministic existing
  state supports it** — never an invented score.
- **2I-LIB-006:** Offers a **search entry point** scoped to the current domain.
- **2I-LIB-007:** **No dashboard metrics.** Counts as navigation aids are
  permitted; a metrics panel is not.
- **2I-LIB-008:** Every domain remains reachable by its existing route.

### 9.1 Performance budgets

Measured on the deployed application, mobile profile, against the controlled
accounts.

| Surface | Budget | Rationale |
| --- | --- | --- |
| Palette open → interactive | **≤ 150 ms** | Perceived as instant; no network for navigation. |
| Palette keystroke → filtered list | **≤ 50 ms** | Local filtering only. |
| Search keystroke → request issued | debounced **200–300 ms** | One decision, recorded, not per-surface. |
| Search request → first results | **≤ 500 ms** p50, **≤ 1200 ms** p95 | Above this, users retype. |
| Library open → interactive | ≤ 400 ms | |

**If the p95 target cannot be met with zero migrations, that is the evidence
`2I-SEARCH-008` exists to produce, and it is what justifies spending the budget.**

---

## 10. Telemetry — `2I-METRIC`

**Instrument now; interpret later (D3/D3a).**

- **2I-METRIC-001:** Every UX event carries a **cohort** label distinguishing
  the **internal/manual-account** population from a **future public-signup**
  population. Public-cohort metrics begin when signup opens.
- **2I-METRIC-002:** Current-population figures are **never** reported as
  evidence of public acquisition or activation performance. Any surface or
  report presenting them says so.
- **2I-METRIC-003:** Measured: time to first useful action; search run /
  refined / opened; palette action completion; navigation destination usage;
  mobile vs desktop; empty-result frequency; abandonment between search and
  destination.
- **2I-METRIC-004:** **Never recorded** — query content, entry text, task text,
  memory text, file names, prompt content, personal entity names. Enforced by
  the **shape of the event** (closed vocabularies and counts, no free-text
  column), not by redacting at the call site. This is `error_events`' proven
  pattern: the privacy property is the absence of a place to put the string.
- **2I-METRIC-005:** Activation and retention measures that cannot be
  meaningfully interpreted before a public cohort exists are labelled
  **"instrument now, evaluate after public cohort exists."**
- **2I-METRIC-006:** Events go through the existing `record_product_event` RPC
  and its validator. No second telemetry path.

---

## 11. Closeout — `2I-CLOSE`

- **2I-CLOSE-001:** A **fail-closed** traceability generator over every `2I-*`
  id that refuses rather than print an unresolved claim, mutation-proved against
  fixtures.
- **2I-CLOSE-002:** Accessibility acceptance across every new surface —
  keyboard, focus return, screen-reader labelling, contrast, reduced motion,
  touch targets.
- **2I-CLOSE-003:** Both locales verified on every new surface, and the
  **locale-ternary count does not increase**; surfaces this phase touches move
  to a typed `copy.ts`.
- **2I-CLOSE-004:** The rollout gate is re-read and recorded at close. Phase 2I
  must not be the phase that stops doing this.
- **2I-CLOSE-005:** A closing report stating delivered / partial / undelivered
  per requirement, with the migration budget reconciled.

---

## 12. Out of scope — explicit

| Out | Why |
| --- | --- |
| **Dark mode** | D5. Not partially implemented. |
| **Voice capture / transcription** | Etapa 2. D4's retention decision is recorded in §13 as an input. |
| **Semantic search, embeddings, vectors, generated answers** | `2I-SEARCH-010`. ADR-055 is separate and dated. |
| **Etapa 2+** of the parent PRD | D2. |
| **Calendar, planner, reviews, notification levels** | Etapa 4. |
| **Memory conflicts, person/project context pages, graph** | Etapa 5. |
| **Onboarding, personalization, privacy centre** | Etapa 6. |
| **Any new write path** | Phase 2I adds no mutation. |
| **Any AI/model call** | Phase 2I spends no tokens. |
| **Opening public signup** | Independent fail-closed track. D3. |

---

## 13. Recorded for the future phase — voice audio retention (D4)

**Not implemented in Phase 2I.** Recorded here so the decision is not re-taken.

**Contract:** record → transcribe → editable draft → user confirms capture →
**original audio is discarded.**

Before confirmation: audio may exist **only** as temporary processing state
required for transcription; cancellation removes it; a transcription failure
**must not destroy the user's existing text draft**; and no audio becomes a task,
memory, entry or action automatically.

After a confirmed textual capture: **no durable original audio object remains**,
**no audio-retention class is introduced**, and **no audio-storage quota product
is introduced.**

**Prerequisite for that future phase:** if a transcription provider requires
temporary storage or retention, **document the exact provider behaviour before
implementation.** A provider that silently retains audio would violate this
contract while the product believed it complied.

---

## 14. Definition of done

A slice is done when: its flows work on mobile and desktop; empty, loading,
interpreting, error and offline are covered; keyboard, focus and screen-reader
behaviour are verified; copy exists in both locales; no personal content appears
in any metric; the events needed to measure it are defined; the experience needs
no knowledge of internal terms; zero lint and type errors; unit and behavioural
tests pass; relevant Playwright journeys pass on desktop and mobile; the
production build passes; and `STATE.md`, `CHANGELOG.md` and `TODO.md` are
updated.

**Phase-level:** all `2I-*` requirements delivered and cited by the fail-closed
generator, the migration budget reconciled **per slice**, the rollout gate
re-read, and A13 verified green for the successor.

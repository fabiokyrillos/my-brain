# Current experience audit — what is actually shipped, 2026-08-07

**Neutral workspace.** The initiative has no name and no phase label until scope
is settled. This directory is `next-experience` for that reason, and nothing in
it authorizes implementation.

**This is not a fresh UX audit.** One exists and is good:
`docs/initiatives/product-ux/MY_BRAIN_PRODUCT_AUDIT.md`, with its roadmap
beside it and its closeout at `docs/reports/product-ux/PRODUCT_UX_CLOSEOUT.md`.
**Much of what those documents recommended has since shipped.** This audit's job
is narrower and more useful: **read the code as it is today, and establish which
of the PRD's premises are still true.**

Method: the route tree, `src/features/shell/capabilities.ts` (the navigation
model, as data), the feature directories, and the product-ux closeout's
before/after table. Every claim below is a code reading, not a recollection.

---

## 1. The navigation model, as the code declares it

`src/features/shell/capabilities.ts` §76–98. This is the authoritative list.

| Key | Route | Visibility | Note |
| --- | --- | --- | --- |
| `home` | `/app` | **primary** | |
| `inbox` | `/app/inbox` | **primary** | Labelled **Registros** |
| `work` | `/app/work` | **primary** | **aliases: `today`, `tasks`, `waiting`** |
| `chat` | `/app/chat` | **primary** | |
| `capture` | `/app/capture` | **global** | The centre control |
| `notifications` | `/app/notifications` | global | |
| `projects` `people` `organizations` `contexts` `memories` `files` | — | **more** | group `context` |
| `reviews` `questions` | — | more | group `reflection` |
| `reminders` | — | more | group `organization` |
| `history` `costs` | — | more | group `transparency` |
| `settings` | — | more | group `preferences` |
| `jobs` | `/app/jobs` | context-only | |

**Mobile bar today: Início · Trabalho · [Capturar] · Brain · Mais** — five slots,
capture on the centre line, `Registros` demoted into `Mais` on mobile only.

---

## 2. The finding that most affects the PRD

> **The PRD's §5.1 and §5.4 navigation is, in substance, already shipped.**

| PRD §5.1 proposes | Shipped today | Delta |
| --- | --- | --- |
| Hoje | `home` at `/app` | **naming and content**, not structure. `today` currently resolves as an *alias of `work`* rather than as a destination. |
| Registros | `inbox`, primary, already renamed from "Caixa" | **none** |
| Trabalho | `work`, primary, already absorbs `tasks` + `waiting` | **none** |
| Conversar | `chat`, primary | **naming** ("Brain" → "Conversar") |
| **Biblioteca** | **does not exist** | **real, and it is the whole of §5.1's remaining work** |
| Capturar as a global action | shipped, centre slot | **none** |

The six members the PRD wants grouped under `Biblioteca` — Memórias, Pessoas,
Projetos, Empresas, Contextos, Arquivos — are already tagged `group: "context"`
in `capabilities.ts`. **The grouping exists in the data model and is not
rendered as a destination.** They sit flat inside `Mais` beside `reviews`,
`questions`, `reminders`, `history`, `costs` and `settings` — twelve flat items,
which is the actual discoverability problem, and it is narrower than "the
navigation is too big".

**Consequence for the PRD's Etapa 1:** slice 1.1 (navegação reduzida) is largely
**already delivered** and its estimate of 1–2 weeks is mostly spent. Slice 1.2
(Biblioteca) is real. This is worth several weeks of the P0 core, and it is the
kind of thing a PRD written from the product's *feel* rather than from its
*route table* would not catch.

---

## 3. What exists, by PRD claim

Verified against the tree; **shipped** means a route and feature directory exist.

| PRD premise | Reality |
| --- | --- |
| "captura … predominantemente textual" | **True.** `src/features/capture/` is one form. |
| Voice capture, transcription (§6.1, slice 2.5) | **Nothing exists.** No `MediaRecorder`, no `getUserMedia`, no audio path, no transcription provider. Entirely greenfield. |
| Global search / command palette (§6.1, slices 1.3–1.4) | **Nothing exists.** No palette component, no global search route. Greenfield. |
| Calendar (§6.1, slice 4.4) | **No route.** Greenfield. |
| "Precisa de você" single box (slice 2.3) | **Backend largely exists** — `src/features/daily-cycle/attention-projection.ts` plus `attention-actions.ts`. The *projection* is built; the unified surface is not. |
| Hoje as a cockpit (slices 2.1–2.2) | **Partially.** `home-projection.ts` and `home-dashboard.tsx` exist; the closeout describes Home as already "an attention surface answering the owner's five questions in order". |
| Conversa with actionable cards (slice 3.1) | **Foundations exist.** `task-commands/` routes create-intent with preview/confirm; the composer already routes commands and falls through to knowledge answers. Cards *in the conversation* are the new part. |
| Fontes por resposta (slice 3.3) | **Partially.** Chat already retrieves the user's own records and can only cite provided IDs; nonexistent IDs are stripped deterministically. The *presentation* of sources is the gap. |
| Busca semântica (slice 3.6) | **Deferred by ADR-055, which expires 2026-10-27.** See §5. |
| Memórias with provenance and lifecycle (slice 5.3) | **Shipped** by product-ux: kind, provenance, validity, archive. |
| Conflitos de memória (slice 5.4) | **Nothing exists.** Greenfield. |
| Páginas de pessoa/projeto (slices 5.1–5.2) | **Detail pages and edit forms shipped**; the *contextual* summary (compromissos, riscos, resumo com fontes) is the gap. |
| Grafo de relações (slice 5.6) | **Nothing exists.** The `entity-graph` initiative built the *data* relations, not a visualisation. |
| Arquivos (slice 5.5) | Route shipped; the "inteligente" half is the gap. |
| Revisões (slice 4.6) | Route and `generateReview` shipped; cadence and the three tiers are the gap. |
| Notificações por urgência (slice 4.7) | Route shipped; levels/grouping/quiet control are the gap. |
| Onboarding (slice 6.1) | **Nothing exists as a guided flow.** |
| Privacidade e controle (slice 6.3) | **Mostly shipped by Signup Hardening** — consent, deletion, BYOK credential, sessions. **`exportação de dados` does NOT exist**, and the PRD lists it. |
| PWA / install (slice 6.4) | `src/features/pwa/` and `manifest.webmanifest` exist. |

---

## 4. Cross-cutting state the PRD should inherit

**Strengths it can build on and must not weaken:**

- **One write path.** Phase 2F. Sensitive mutations go through Server Actions
  and validated RPCs; authorization lives in the database.
- **RLS forced on every user-owned table**; polymorphic relations validated by
  trigger; composite FKs prove ownership.
- **Every automatic action is auditable and every reversible one has a tested
  undo** — `undo_operation` is a handler registry.
- **AI output is schema-validated before any domain write**; ambiguity becomes a
  pending question, never an invention.
- **BYOK** — the user's own key, the user is the payer. This shapes every
  feature that costs tokens (voice transcription, semantic search, summaries).
- **Fail-closed rate limiting** — 60 AI ops/user/hour, 20 uploads/user/hour,
  rolling windows, no exemptions including the owner.
- **A typed vocabulary layer** (`src/features/vocabulary/`) — database enums are
  no longer rendered as labels.

**Debt the PRD will meet:**

- **UX-22 — 266 inline locale ternaries across 34 files**, deferred at
  product-ux close. The canonical mechanism is a typed feature `copy.ts`. **Any
  slice touching a surface with ternaries inherits the conversion for that
  surface**, and the PRD's §12 requirement that "textos existirem em português e
  inglês" makes this unavoidable rather than optional.
- **Capture is asynchronous** (Phase 2X). The UI must show an interpreting
  state; §6.1's "estados … processamento" is load-bearing, not polish.
- **No deployed-commit identifier over HTTP** (F-2H.5-4).

---

## 5. The dated commitment the PRD collides with

**ADR-055 expires 2026-10-27** — roughly eleven weeks out, and the nearest dated
commitment in the repository. It defers semantic task retrieval behind a
measured evidence standard, and the funnel it measures is **empty** (no real
commands typed).

The PRD's **slice 3.6 (busca semântica)** is that decision, arriving from the
product side. Two ways this can go, and the initiative should choose
deliberately rather than discover it:

- The UX initiative **supplies the evidence** ADR-055 wanted — real usage, from
  a real funnel — and the expiry resolves on data.
- The expiry lands mid-initiative with the funnel still empty, and the decision
  is taken on product grounds instead.

Either is defensible. Silently letting the date pass is not, and it is now
**within the planning horizon of this initiative**.

---

## 6. The honest summary

The PRD's diagnosis — *"the problem is no longer absence of capability; it is a
fragmented experience"* — **is correct and is confirmed by the code.** Twenty-one
authenticated routes, twelve of them flat inside `Mais`.

Its **structural remedy is further along than it assumes.** The five-slot mobile
bar exists, capture is already the centre action, `work` already absorbs three
former destinations, and `Registros` has already been renamed for what it is.
What is genuinely missing from Etapa 1 is **Biblioteca**, **the command
palette**, and **global search**.

The genuinely greenfield, high-value work is concentrated elsewhere: **voice
capture**, **global search**, **actionable cards in the conversation**,
**calendar**, **memory conflicts**, and **onboarding**.

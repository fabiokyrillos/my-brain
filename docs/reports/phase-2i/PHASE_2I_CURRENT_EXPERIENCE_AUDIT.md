# Phase 2I — Current experience audit

**Date:** 2026-08-07 · **Method:** read the code, not the recollection.
Sources: `src/features/shell/capabilities.ts`, `src/i18n/messages.ts`,
`src/lib/supabase/database.types.ts`, the route tree, and the whole migration
chain.

**Why this document exists.** The parent PRD describes a navigation redesign.
A large part of it is **already delivered**. A phase that rebuilds delivered work
spends its budget proving nothing, so this audit's single job is to separate:

| Class | Meaning |
| --- | --- |
| **DELIVERED** | Shipped and working. Phase 2I must not rebuild it. |
| **RENAME** | The structure exists; a label or a grouping is wrong. Cheap. |
| **MISSING** | Genuinely absent. This is where the phase's effort goes. |

---

## 1. Navigation — the owner's expected finding, verified

`src/features/shell/capabilities.ts` §76–98 is the authoritative model. It is
**data**, not markup, which is what makes the finding checkable.

| Key | Route | Visibility | Class |
| --- | --- | --- | --- |
| `home` | `/app` | **primary** | **DELIVERED** (label: RENAME) |
| `inbox` | `/app/inbox` | **primary** | **DELIVERED** |
| `work` | `/app/work` | **primary**, aliases `today`, `tasks`, `waiting` | **DELIVERED** |
| `chat` | `/app/chat` | **primary** | **DELIVERED** |
| `capture` | `/app/capture` | **global**, centre mobile slot | **DELIVERED** |
| `notifications` | `/app/notifications` | global | DELIVERED |

> **The owner's expected finding is CONFIRMED.** Four primary destinations
> broadly equivalent to Hoje / Registros / Trabalho / Conversar, with capture as
> the central mobile action, already exist. The five-slot mobile bar exists.
> `work` already absorbs three former destinations through its alias list.

### 1.1 Two corrections to the previous planning pass

The earlier study (`docs/initiatives/next-experience/`) said two renames were
outstanding. Only one is.

| Claim | Repository truth |
| --- | --- |
| ~~"Brain → Conversar" is pending~~ | **Already done.** `messages.ts` reads `chat: "Conversar"` in pt-BR and `"Conversar"`/`"Chat"` per locale, with a comment recording the UX-06/DEC-2 reasoning: *"A destination is a place, so it gets a verb."* **Nothing to do.** |
| "Início → Hoje" is pending | **Correct.** `messages.ts` reads `home: "Início"` (pt-BR) and `"Home"` (en). This is the one navigation rename Phase 2I owns. |

**This correction matters beyond two words.** It is the second time a planning
pass has over-stated remaining navigation work by reading the product's feel
rather than its source. Any 2I requirement that claims a rename must cite the
exact constant it changes.

### 1.2 The `Mais` grouping already exists as data

Every context surface already carries a `group`:

| Group | Members | Rendered as a surface? |
| --- | --- | --- |
| `context` | `projects`, `people`, `organizations`, `contexts`, `memories`, `files` | **NO — this is Library** |
| `reflection` | `reviews`, `questions` | no |
| `organization` | `reminders` | no |
| `transparency` | `history`, `costs` | no |
| `preferences` | `settings` | no |

**So Library is not a new information architecture — it is the rendering of a
grouping the code already declares.** The parent PRD's §5.2 membership list and
the `context` group are the same six keys. This is the cheapest structural win
in the phase, and it is **MISSING** only as a surface.

The other four groups are the parent PRD's §5.3 "atividade e configurações", and
they are **out of Phase 2I scope** — Library is the only group this phase
renders.

---

## 2. The real problem, restated from the data

Twelve destinations sit flat inside `Mais`: the six `context` members plus
`reviews`, `questions`, `reminders`, `history`, `costs`, `settings`.

Nothing is competing for attention there — **nothing is visible.** That is a
**retrieval** problem, not a navigation-size problem, and it is why the owner's
approved order puts the palette and search ahead of Library. Grouping twelve
items into five reduces the list; being able to type a name removes the need to
traverse it at all.

---

## 3. Discovery — both tools are MISSING

| Capability | State | Evidence |
| --- | --- | --- |
| Command palette | **MISSING** | No `CommandPalette`, no `command-palette`, no keyboard-invoked overlay anywhere in `src/`. |
| Global search | **MISSING** | No global search route, no cross-domain search action. |
| **Full-text search infrastructure** | **MISSING ENTIRELY** | No `tsvector`, no `to_tsquery`/`websearch_to_tsquery`, no `USING gin`, no `pg_trgm` anywhere in the 84-migration chain. |

That last row is the finding the migration budget turns on, and §5 works it
through.

---

## 4. The search surface, as the schema actually holds it

Verified against `database.types.ts`. **The owner's domain list maps cleanly onto
seven existing tables — no new data model is implied.**

| Owner's domain | Table | Searchable text columns | Route |
| --- | --- | --- | --- |
| Tasks | `tasks` | `title`, `description` | `/app/tasks` → `work` |
| Entries / **Registros** | `entries` | `original_content` | `/app/inbox` |
| Memories | `memories` | `content` | `/app/memories` |
| People | `people` | `name`, `notes` | `/app/people` |
| Projects | `projects` | `name`, `description` | `/app/projects` |
| **Companies** | **`organizations`** | `name`, `description` | `/app/organizations` |
| Files | **`attachments`** | `original_name`, `description`, **`extracted_text`** | `/app/files` |

**Two vocabulary facts the requirements must use rather than re-derive:**

1. **"Companies" is `organizations` in the schema and `Empresas` in pt-BR.**
   `messages.ts` carries a comment recording the EGC.1 decision: the product
   said "Empresa" everywhere before the destination existed, so the label
   follows the product and the key follows the table. Search must display
   *Empresas* / *Companies* and query `organizations`.
2. **"Files" is `attachments`.** The route is `files`; the table is not.

### 4.1 Two findings inside the search surface

**F-2I-A — `attachments.extracted_text` is file *content*, and it is searchable.**
Including it makes file search genuinely useful and is what "busca no conteúdo"
in the parent PRD §5.5 means. It also means a global search box can surface text
the user never typed into My Brain — extracted from a document. That is a
product decision, not a technical one, and the PRD must name it rather than
inherit it silently.

**F-2I-B — three domains carry a `sensitivity` classification, and search has no
declared behaviour for it.**

```sql
sensitivity text not null default 'normal'
  check (sensitivity in ('normal', 'private', 'highly_sensitive'))
```

Present on `entries`, `memories` and `attachments`. Nothing in the repository
says whether a `highly_sensitive` record should appear in a global result list —
because until now there has been no global result list. **A search feature that
silently surfaces every sensitivity class is making that decision by omission.**
Raised as an owner decision in the PRD; not decided here.

### 4.2 What must stay out

`memories.embedding` and `entry_embeddings` exist (pgvector). **Phase 2I must not
touch either.** ADR-055 is a separate dated decision expiring **2026-10-27**, and
lexical search must neither satisfy nor supersede it.

---

## 5. Does lexical search need a migration?

The owner's budget is **at most one**, allocated here only if the repository
proves it necessary. This section is that investigation.

### 5.1 What exists today

- **No full-text infrastructure of any kind.**
- Ownership is enforced by **forced RLS on every one of the seven tables**, so a
  query run as the user cannot return another user's rows regardless of how the
  predicate is written.
- Current data volume, from the live census taken 2026-08-07: entries **4**,
  tasks **7**, people **3**, organizations **1**, projects **1**, memories **0**.

### 5.2 The two candidate shapes

| | `ILIKE` over existing columns | Postgres FTS (`tsvector` + GIN) |
| --- | --- | --- |
| Migration | **zero** | one |
| Ranking | none (or hand-rolled) | `ts_rank` |
| Stemming, stop words | no | yes |
| Accent handling (pt-BR) | manual `unaccent` | needs `unaccent` too |
| Cost at current volume | trivial | trivial |
| Cost at 10⁴–10⁵ rows/user | sequential scan per domain | indexed |
| Retrofit cost later | — | touches all seven tables again |

### 5.3 Recommendation, and the honest uncertainty in it

**Recommended: plan for ONE migration, and require slice 2I.0 to try to spend
zero.**

The reasoning is not "we might need it later" — that argument would justify any
migration. It is narrower:

- **Seven domains is the multiplier.** A retrofit is not one index; it is seven
  tables, seven column sets and a re-verification of each. Doing it once, in the
  slice that introduces the query, is materially cheaper than doing it twice.
- **`attachments.extracted_text` is not small.** Six of the seven domains hold
  short text. Extracted document text is the one column where a sequential scan
  degrades on a *single* user's realistic data, not on a large population — and
  this product's population will be small for a long time.
- **But the acceptance criteria may be satisfiable without it**, and 2I.0 must
  find out by measurement rather than by argument.

**So the budget is 1 allocated, and closing the phase at `1 allocated · 0 spent`
is an explicitly acceptable and preferred outcome.** The migration is not created
during planning, and it will not be created to justify the budget.

---

## 6. Universal states and the visual language

| Item | Class | Note |
| --- | --- | --- |
| Five-slot mobile bar | **DELIVERED** | Product-UX slice H. |
| Empty / loading / error states | **PARTIAL** | Present per-surface; no shared contract. |
| **Interpreting / processing state** | **MISSING as a contract** | Capture is asynchronous since Phase 2X: `captureEntry` persists and returns, a worker interprets. Every surface showing an entry inherits this. |
| Suggestion / confirmation / source cards | **PARTIAL** | `task-commands/` has preview-and-confirm; it is not a shared component vocabulary. |
| Semantic colour tokens | **MISSING** | No declared token set for information / success / attention / risk / AI-suggestion / archived. |
| Chips for person / project / company / context | **PARTIAL** | Rendered ad hoc per surface. |
| **Locale ternaries** | **DEBT** | **266 inline ternaries across 34 files** (UX-22, deferred at product-UX close). The canonical mechanism is a typed feature `copy.ts`. |

---

## 7. What Phase 2I inherits and must not weaken

| Invariant | Consequence for this phase |
| --- | --- |
| **One write path** (Phase 2F) | The palette starts flows through **existing** Server Actions and RPCs. No shortcut, no generic executor. |
| **RLS is the trust boundary** | Search is owner-scoped **in the query**, never filtered after. |
| **Forced RLS + composite FKs** | No new cross-user read is possible if search reuses the authenticated client. |
| **AI proposes, user disposes** | Phase 2I adds **no** model call at all. |
| **Auditable + reversible** | Phase 2I adds no new mutation, so it adds no new audit or undo surface. |
| **Untrusted content is data** | Search results render user content in a new place; it is never markup and never instructions. |
| **BYOK — the user pays** | Phase 2I spends nothing: no provider call anywhere in scope. |

---

## 8. Summary — where the phase's effort actually goes

| Area | DELIVERED | RENAME | MISSING |
| --- | --- | --- | --- |
| Primary navigation | 4 destinations + capture + mobile bar | `home` → Hoje | — |
| Library | the `context` grouping, as data | — | the surface |
| Command palette | — | — | **all of it** |
| Global search | — | — | **all of it, incl. any DB support** |
| Visual language | — | — | semantic tokens |
| Trust components | preview/confirm in one feature | — | shared vocabulary |
| Universal states | per-surface | — | shared contract, esp. **interpreting** |

**The phase is mostly about the two things nobody can do today — find an action,
and find information — plus giving the six context domains one door.** The
navigation redesign the parent PRD leads with is, in this repository, one label
and one grouping away from done.

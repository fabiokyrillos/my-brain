# Phase 2P — the Revisões experience, redesigned

**Status:** design, signed by the owner's prompt of 2026-08-20, implemented in the same unit.
**Baseline:** `main` at `d5eedc4`, CI green on the merge SHA, parity `202608190099` (99 local = 99 hosted).
**Migrations:** **ZERO.** Every decision below was re-audited against the deployed schema and none needs one. The two places where a migration *would* have been needed are named in §9 and are refused rather than spent.

---

## 1. What was actually wrong

The owner's report — *"ainda parece uma página técnica e excessivamente longa"* — is one page doing five jobs with no hierarchy between them. The census found the mechanics behind each complaint:

| Complaint | Mechanism found in the census |
|---|---|
| Dia/Semana/Mês are not the navigation | There is no period navigation at all. The page has a **`day`/`next_day`** scope nav (the day review's own) and **four generate buttons** in a 4-column grid. Period is not a dimension of the page. |
| Current review, generate buttons and history are mixed | One `<section className="reviews-history">` holds the lead text, the four buttons **and** the paginated history. Above it, `DayReviewView` renders a *"Revisão gerada"* card for the review covering today — **the same row the history repeats below**. |
| "Mostrar resumo" expands inside the list | `ReviewBody` is a client component per row holding `useState`. It is **not** an expander: it is the OD-2J-1 **sensitivity reveal**. |
| Raw Markdown, broken | `content` is stored verbatim from `answerFromKnowledge` and rendered as `<p>{content}</p>`. **The product has no Markdown renderer at all** — no `remark`, `rehype`, `marked` or `dompurify` in `package.json`, and the only `markdown` hits in `src/` are closeout guards that parse `docs/`. |
| A review has no page of its own | There is no route under `reviews/` but `page.tsx`. |
| No sections, sources, links, actions | The list item renders title, period label, status badge, masked body, date range. Nothing else exists. |
| The page repeats itself | See row 2: the current review is rendered twice, and `DayReviewView` ends with a link to `/app/reviews` — the page it is already on. |

Two further defects were found that the owner did not name and that this unit also fixes:

- **`O que não pôde ser lido` renders unconditionally.** `day-review-view.tsx:371` always emits the section and falls back to a *"nothing unreadable"* empty state. A section whose entire purpose is to report failure, rendered on every successful visit, is the page telling the reader about a problem that does not exist.
- **`DayReviewView` links to the page it is on.** `copy.openReviews` anchors to `reviewsHref`, which on `/app/reviews` is a self-link.

---

## 2. Constraints derived from the code, not assumed

These are the facts the design is built on. Each was verified against the deployed database or the source, not inferred.

### 2.1 `summaries` is the table, and it carries no relationships

```
summaries(content, generated_at, id, input_tokens, model, original_content,
          output_tokens, period_end, period_start, period_type, status,
          title, updated_at, user_id)
```

`Relationships: []`. The only FK is `user_id → auth.users`. Constraints:

- `summaries_period_type_check` → `daily | weekly_review | weekly_plan | monthly`
- `summaries_status_check` → `generated | edited | outdated`
- `summaries_user_id_period_type_period_start_period_end_key` → **UNIQUE**

**Consequence:** a stored review contains **no canonical identifier of anything**. `answerFromKnowledge` returns `citedSourceIds`, and `generateReview` **discards them** — only `content` is persisted. Per-item links (this task, this person, this project) therefore **cannot be proved today**. §9 records this as a pendência and refuses the migration that would fix it.

### 2.2 Four period types, three tabs

The tabs are Dia · Semana · Mês; `period_type` has four values. The mapping is **not** one-to-one and this is the design's most load-bearing decision:

| Tab | `period_type` values | Generate controls on that tab |
|---|---|---|
| **Dia** | `daily` | *Resumo do dia* |
| **Semana** | `weekly_review` **and** `weekly_plan` | *Revisão da semana*, *Planejar a semana* |
| **Mês** | `monthly` | *Revisão do mês* |

This is why the four-button grid disappears without losing a control: each button moves to the tab whose period it writes. The owner never loses a capability; the row of four stops existing.

### 2.3 The reveal is a signed decision, not a UI affordance

`review-body.tsx` masks **every** summary at `highly_sensitive`, unconditionally, because `summaries` has no `sensitivity` column and a review over a period can contain anything that period contained. OD-2J-1 signs this.

**Consequences the design obeys:**
- The reveal control is **preserved**, not removed. It **moves to the review's own page**, which is where the content now lives.
- **The history list carries no preview.** The owner's own instruction — *"não exponha conteúdo mascarado (…) por meio de rótulos, URLs ou prévias"* — forbids it, and under OD-2J-1 every summary is masked. The prompt's *"pequena prévia, se houver uma prévia confiável"* is conditional, and the condition is false. The list therefore renders **type, period, state, and Abrir revisão** — exactly the four the prompt names unconditionally.
- **`content` is not sent to the list at all.** A new content-free projection (§4.2) means the RSC payload for `/app/reviews` stops carrying masked prose it never renders.

### 2.4 The telemetry vocabulary is closed and cannot be widened

`dayReviewScopes = ["day", "next_day"]`, validated by `isOneOf(value.scope, dayReviewScopes)` in `product-analytics/contracts.ts` — and this repository has already recorded that `product_events` keeps **three** copies of its vocabulary, one of which is deployed and refuses newer values **silently**.

**Consequence:** the design emits **no new scope value**. `day_review_opened` and `day_review_action_applied` continue to describe the day review and only the day review. Week and month tabs emit **nothing** rather than a fabricated `scope: "day"`. This is stated in §7 as a deliberate, honest telemetry boundary — not an omission.

### 2.5 The authority guard already forbids what the prompt forbids

`phase-2m-review-authority-guard.test.ts` walks `src/features/day-review/` **and `src/app/[locale]/app/reviews/`**, failing the build on a direct table write, an RPC, a privileged client, a `"use server"` declaration, a timer, a gesture handler, or a taxonomy verb literal outside `contracts.ts`.

**Consequence:** the new detail route inherits the prompt's *"não crie um caminho direto de escrita"* as a **build error**, automatically, the moment it is created under that directory. No new guard is needed for that clause.

### 2.6 The stylesheet guard constrains the CSS before it is written

`stylesheet-registry-guard.test.ts` requires: filename `^[a-z-]+\.css$`; no raw hex or `white`/`black`; every `var()` declared; no `font:` twice per block and no font longhand before the shorthand; no `var()` in a media query condition; no redeclaration of `--background-canvas`, `--text-primary`, `--border-default`; and it forbids `globals.css` importing a file that is not on disk.

**Consequence:** the new sheet is `reviews.css`, imported from `globals.css`, tokens only.

---

## 3. Routes and URL state

### 3.1 Listing

```
/{locale}/app/reviews?period=day|week|month[&scope=day|next_day][&page=N]
```

- `period` is the tab. **Absent or malformed → `day`**, the same fail-closed posture `scope` already has: a repeated parameter arrives as an array and is refused rather than guessed at.
- `scope` is **preserved unchanged** and applies to the Dia tab only. It is the existing day/next-day control and removing it would delete shipped behaviour.
- `page` is **preserved** and paginates the history of the selected tab.

The three tabs are **links**, not buttons with local state. Reload, back and forward preserve the selection because the selection *is* the URL. No `useState` anywhere in the tab control.

### 3.2 Individual review

```
/{locale}/app/reviews/{reviewId}
```

`reviewId` is `summaries.id` — the model's existing identity. No second identity system is introduced. The segment name follows the four precedents in the repository (`memories/[memoryId]`, `people/[personId]`, `projects/[projectId]`, `inbox/[entryId]`).

### 3.3 Isolation

The detail page reads `summaries` by id under RLS and calls `notFound()` when the row does not come back. **Removed, foreign and never-existed are one arm** — there is no branch that could tell them apart, so the page cannot become a probe for whether another account's review id is real. This is the same construction `memories/[memoryId]` uses for `source_entry_id`, and it is the reason the design does not add a "this review was deleted" message: such a message would be a different answer for a foreign id than for a missing one.

---

## 4. Data

### 4.1 Part A — the current period, per tab

The factual projection generalises from a **day** to a **period window**. The window comes from the local-day contract, never from host arithmetic:

| Tab | Window |
|---|---|
| Dia | `localDayBoundsForDate(day, tz)` — `day` is today, or tomorrow under `scope=next_day` |
| Semana | `localRangeBounds(startOfLocalWeek(today), 7, tz)` — Monday-based, one convention for both locales |
| Mês | `localRangeBounds(startOfLocalMonth(today), daysInLocalMonth(today), tz)` |

`localRangeBounds` composes both ends from `localDayBoundsForDate`, so a week containing a DST transition is 167 or 169 hours and a month beginning on a day whose local midnight does not exist starts at the first instant that does.

The five reads are **unchanged in shape** — completed tasks, declared intentions, deadlines, captured entries, and the stored review whose period covers the window. Only the bounds move. Each source keeps its individual `read`/`unavailable` score, because *"nothing happened"* and *"I could not read this"* remain different claims.

**The Dia tab's behaviour is byte-for-byte what shipped.** The generalisation is additive: the day window is what the day tab passes.

### 4.2 Part B — the history, per tab

`loadReviewListProjection` gains a `periodTypes` filter and drops `content` from its `select`:

```
.select("id,title,period_type,period_start,period_end,status")
.in("period_type", periodTypesFor(tab))
```

The current period's review is **excluded from the history** by period bounds, so the same review never appears twice on one screen.

`review-presentation.ts` splits into two views:

- `toReviewSummaryView` → `{ id, title, periodType, periodLabel, statusLabel, statusTone, periodLabelRange }` — **no content.** Used by the history list and by the current-period card.
- `toReviewDetailView` → the above **plus** `content`. Used only by the detail page.

`toReviewListItemView` is removed and its two call sites migrated. Two views rather than one optional field, so a surface cannot render content by forgetting to check.

---

## 5. Markdown

### 5.1 What the stored format actually is

Verified, not assumed: `content = answer.answer` from `answerFromKnowledge`, bounded by `chatAnswerSchema` to 8000 characters of free text. The screenshot the owner sent shows `##`, `###`, `**` and `-` — GitHub-flavoured Markdown, rendered through `<p>{content}</p>`, which collapses the newlines and leaves the markers visible.

So: **the format is Markdown, produced by a model, and therefore untrusted.**

### 5.2 The renderer

A new pair, written here because nothing compatible exists:

- `src/features/reviews/markdown.ts` — a parser producing a **typed AST**. No HTML is ever produced, parsed or accepted; there is no `dangerouslySetInnerHTML` anywhere in the path.
- `src/features/reviews/rendered-markdown.tsx` — renders that AST to React elements.

Supported, and nothing else:

| Node | Source | Rendered as |
|---|---|---|
| heading | `#`…`######` | `<h3>`/`<h4>`/`<h5>`, **clamped** into the page outline |
| paragraph | blank-line separated | `<p>` |
| unordered list | `-`, `*`, `+` | `<ul><li>` |
| ordered list | `1.` | `<ol><li>` |
| strong | `**x**` | `<strong>` |
| emphasis | `*x*`, `_x_` | `<em>` |
| code | `` `x` `` | `<code>` |
| link | bracket-paren link syntax | see §5.3 |

Everything unrecognised — raw HTML, images, tables, block quotes, autolinks, reference links, HTML entities — is **rendered as literal text**. Not stripped: text. Stripping would let a model erase words from its own report by wrapping them in a syntax the renderer discards.

Heading levels are **clamped, not mapped**: the detail page owns `<h1>` and `<h2>`, so a model that opens with `#` gets `<h3>`, and no depth of `######` can produce a level above `<h3>` or below `<h5>`. A document outline is not the model's to decide.

### 5.3 Links: an allow-set, empty today

A bracket-paren link renders as an `<a>` **only if both** hold:

1. `href` matches `^/(pt-BR|en)/app/[a-z-]+(/[0-9a-f-]{36})?$` — an internal app route with, at most, one UUID segment; and
2. that UUID is present in the **allow-set the caller passes**.

Everything else — `http:`, `https:`, `mailto:`, `javascript:`, `data:`, protocol-relative `//`, a fabricated internal path, a real path with an id nobody vouched for — renders as **the link text, plain**. Not as an anchor with a stripped href; as text.

**The reviews surface passes an empty allow-set.** Under §2.1 no stored summary carries a verified identifier, so today every link in every review degrades to text. That is the correct outcome and it is the honest one.

The mechanism exists anyway, with a **two-sided test**: an id in the set renders an anchor, the same id out of the set renders text. Without the positive half the check could pass by rendering nothing as a link, forever, including after ids become available.

---

## 6. Links to Brain content

Only from **canonical, owner-scoped columns**. Two families qualify and no third is invented:

**From the review's own row** — `period_start`, `period_end`, `period_type` are canonical:
- `calendarHref(locale, { orientation, anchor, lanes })` at the period's start, with `orientation` taken from the tab (`day`/`week`/`month`). This is the existing calendar link builder; the design does not hand-write a URL.
- Back to `/{locale}/app/reviews?period={tab}` — the tab this review belongs to.

**From Part A's projection** — task and entry ids read this request, under RLS, with `href` already computed by the projection (`/app/work/{id}`, `/app/inbox/{id}`).

**Explicitly not done:** no name in the prose becomes a link; no entity is created; no retrieval is widened; no inference is persisted; no relationship is invented. A masked capture keeps `ProtectedContent`'s neutral positional label — the excerpt never reaches an `aria-label` or an href.

---

## 7. Actions

Every action is an **existing** path. Nothing new is created to enrich a page.

| Where | Action | Path | Inherits |
|---|---|---|---|
| Part A rows | the five review verbs | `applyTaskDetailCommand` → `list_task_command_candidates` / `apply_task_command` | fingerprint, staleness gate, confirmation for destructive verbs, audit row, registered undo |
| Part A rows | undo | `undoWorkOperation` | the `undo_operations` router since Phase 2E |
| Part A header | generate / update the period's review | `generateReview` | BYOK gate, rate limit, usage ledger, upsert |
| Detail page | update **this** review | `generateReview`, **only when this review's period is the current one** | as above |

That last row is a correctness point, not a styling one: `generateReview` upserts on `(user_id, period_type, period_start, period_end)` computed from **now**. Offering it on a past review's page would silently write a *different* row while appearing to update the one on screen. The control is therefore rendered only when the review's period equals the current period for its type, and otherwise the page says why.

Mobile: row actions stay inside `<details>`, closed by default. Executing one re-renders through the existing action result path — no manual reload. A refusal renders through `CalendarOutcome` and the review stays on screen.

**Telemetry boundary (§2.4):** `day_review_action_applied` fires from the **Dia** tab only. The projection carries `telemetryScope: DayReviewScope | null`, and the view emits nothing when it is `null`. Q3's funnel keeps measuring exactly what it was defined to measure. A `scope: "day"` on a monthly action would have been a false record, and widening the enum is a migration.

---

## 8. Layout, states, responsiveness

**Tabs.** A three-item nav, `aria-current="page"` on the selected one. Desktop: an inline segmented control sized to its content — not a full-bleed band. Mobile: three equal columns in a grid, ≥44px targets, no horizontal scroll. The rule that failed on the calendar is not repeated: the media query sits **after** its base rules, since an identical-specificity query above them never wins.

**Part A / Part B separation.** Part A is a bordered surface with the period as its heading. Part B is a plain list under its own `<h2>`, visually quieter — history is reference, not the subject.

**`O que não pôde ser lido` renders only when `unreadable.length > 0`.** When every source read, a discreet positive line goes in the synthesis block instead of a section. This is the owner's instruction and it removes a permanent failure heading from a page that succeeded.

**States.** Loading via the segment's existing `loading.tsx`; error via the segment's existing `error.tsx`; empty via `UniversalStateView`/`UniversalStateLine`; removed / foreign / never-existed via a single `notFound()` (§3.3).

**Reading measure.** Rendered Markdown is capped at `--width-reading` so an 8000-character monthly review is readable. Long unbroken tokens wrap with `overflow-wrap: anywhere`.

---

## 9. Re-audit: does anything need a migration?

**No.** Every element above reads deployed columns and writes through existing paths. Two things *would* have needed one, and both are refused:

1. **Per-item source links inside a stored review.** Would need a column to persist `citedSourceIds` (which the provider already returns and `generateReview` already discards). **Refused** — the owner's instruction is explicit: *"Não crie migration apenas para enriquecer essa página."* Recorded as a pendência.
2. **Week/month telemetry scopes.** Would need the deployed `product_events` validator widened. **Refused** — §2.4. The events simply are not emitted.

**Open pendências, recorded honestly:**

| # | Pendência | Why it is not done here |
|---|---|---|
| P1 | A review cannot link to the individual records it was written from | `citedSourceIds` is discarded at write time; persisting it is a migration |
| P2 | Week and month tabs emit no product event | The scope vocabulary is closed and deployed; widening it is a migration |
| P3 | Every summary is masked regardless of its actual content | `summaries` has no `sensitivity` column (OD-2J-1's own stated cost); classifying it is a migration |
| P4 | VoiceOver | **Not executed.** Dispensed by the owner, recorded as not executed — never as approved |

---

## 10. What is deliberately not touched

- **The calendar.** Corrected in PR #272 (round three). Its state was confirmed before this unit began and it is not modified, save for a regression this work caused — none did.
- **Capture by text, voice and file; settings; notifications; direct access to Lembretes; direct access to Revisões; the *Precisa de você* card.** Approved by the owner. Untouched.
- **`generateReview` itself.** Its window, prompt, gate, rate limit, ledger and upsert are unchanged. This unit changes **where its buttons live**, not what they do.
- **The day review's factual behaviour.** The window generalises; the day case passes the day window and produces what it produced before.

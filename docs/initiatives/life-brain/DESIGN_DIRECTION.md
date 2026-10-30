# Life Brain — Direção visual

Status: governing artifact of the `life-brain` initiative (ADR-145). Written 2026-10-30 from the baseline evidence in `docs/reports/life-brain/evidence/baseline/` and the inventory in `docs/reports/life-brain/INVESTIGATION.md` §1.

This document is binding for every surface the initiative touches. It **extends Papel e Console** (ADR-114): the palette, the two type families and the dark theme stay. What changes is the layer that never existed — shared primitives — and the rhythm, density and vocabulary that 11,023 lines of page-scoped CSS never agreed on.

---

## 1. What the baseline looks like, in one paragraph

Every page opens with the same three-part header: a monospace uppercase eyebrow (`CONVERSA COM CONTEXTO`, `DADOS E IA`, `PREFERÊNCIAS OPERACIONAIS`), a 31–40px serif title and a lead paragraph that explains the page. On an iPhone this stack consumes 30–40% of the first screen before any content. Below it, each surface composes its own controls from scratch: pill groups, segmented controls, a tab strip, accordions, full-width black buttons and blue information boxes often appear on the **same** screen (`work`, `calendar`, `files`). Seven button families coexist, none shares a height, radius or weight. Body text is 13.5px, labels 12.5px, captions 12px, and meta data (dates, counts, hints) is set in monospace, which makes ordinary information read like a log. The palette is good; the composition is not.

---

## 2. Principles

1. **Content first, chrome second.** The first screen of a phone shows the thing the page is for: the composer, the conversation, the list. Titles are one line; explanations move to empty states, hints or `(?)` disclosures.
2. **One control vocabulary.** A page may use at most two kinds of selection control (e.g. tabs + a filter button). Pills, segmented controls, tabs and accordions are never stacked.
3. **Tokens decide, pages do not.** No new `font-size`, `padding`, `border-radius`, `box-shadow` or colour literal in page CSS. The primitive layer owns them.
4. **Calm by default.** Information boxes (`tone-information`) are reserved for a fact the user must act on. Empty states are quiet text with one action, not blue cards.
5. **The product speaks like a person, not like its architecture.** No "interpretação", "processamento", "consumer verificável", "deduplicação", "preferências operacionais" in product copy. Those words belong in `Avançado`.
6. **Life-neutral.** Examples, placeholders and empty states draw from health, travel, family, home and money as often as from work.
7. **Dark mode is first-class.** Most iPhones run dark by default. Depth cannot depend on shadows alone, and shadows cannot be `none`.

---

## 3. Tokens

All tokens live in `src/app/tokens.css`. The foundation slice (A.0) **adds** the following and **changes** the type scale; nothing is removed in A.0 (removals come when the last consumer migrates).

### 3.1 Type scale (changed)

| Token | Before | After | Why |
| --- | --- | --- | --- |
| `--type-body` | 400 13.5px/1.6 | 400 15px/1.55 | 13.5px body on a phone is below the comfortable reading floor; iOS defaults to 17px. |
| `--type-lead` | 400 15.5px/1.55 | 400 16px/1.5 | Pairs with the new body. |
| `--type-label` | 500 12.5px/1 | 500 13.5px/1.2 | Button and nav labels; `line-height:1` clipped descenders. |
| `--type-caption` | 400 12px/1.45 | 400 12.5px/1.45 | Minimum size permitted anywhere. |
| `--type-heading` | 600 15px/1.35 | 600 16px/1.35 | Section headings inside cards. |
| `--type-title-1` | 400 30px/1.1 | 400 28px/1.15 | Page titles; mobile override 24px. |
| `--type-display` | 400 40px/1.06 | 400 34px/1.1 | Only the Home greeting uses it; mobile 28px. |
| `--type-eyebrow` | 500 11px/1 mono | 500 11.5px/1 **sans**, tracking 0.08em | Monospace stays for actual code/ids. |
| `--type-mono` | 500 12px/1 | 500 13px/1.3 | Ids, keys, hashes only. |

Dates, counts and hints use `--type-caption` in the UI face, **never** `--type-mono`.

### 3.2 Added tokens

```css
/* control sizing — the three heights every interactive primitive uses */
--control-sm: 36px;   /* dense rows, desktop only */
--control-md: 44px;   /* default; the touch floor */
--control-lg: 52px;   /* primary call to action on a phone */

/* icon sizing */
--icon-sm: 16px;
--icon-md: 20px;
--icon-lg: 24px;

/* layering */
--z-raised: 1;
--z-sticky: 10;
--z-bottom-bar: 20;
--z-sheet: 30;
--z-dialog: 40;
--z-toast: 50;

/* page rhythm */
--page-gutter: var(--space-4);          /* 16px phone */
--page-gutter-wide: var(--space-8);     /* 32px ≥ 900px */
--section-gap: var(--space-8);
--card-padding: var(--space-5);
--card-padding-compact: var(--space-4);

/* accent — one warm accent for selected states and the chat voice */
--accent: #b5542c;            /* light */
--accent-soft: #f6e9e1;
--accent-text: #ffffff;
/* dark */
--accent: #e07a4f;
--accent-soft: #3a2518;
--accent-text: #141311;
```

The accent exists because the baseline has **no** affirmative colour: selected pills are black on one page (`inbox`, `work`) and `--link` blue on another (`files`). One accent, used for selection and the assistant's own voice, replaces both.

### 3.3 Dark elevation (changed)

`--elevation-1` and `--elevation-2` are `none` in dark mode today. They become:

```css
--elevation-1: 0 1px 2px rgba(0, 0, 0, 0.5);
--elevation-2: 0 4px 14px rgba(0, 0, 0, 0.55);
```

and every card also gets a 1px `--border-default` so depth never depends on the shadow alone. Both copies of the dark block (system default and explicit `[data-theme="dark"]`) change together — `phase-2i-experience-guard.test.ts` asserts they match.

### 3.4 Breakpoints (consolidated)

Two breakpoints, written one way: `(max-width: 899px)` is phone, `(min-width: 900px)` is desktop. The `600px` rules that exist today are left in place until their file is retired; **no new rule uses 600, 900 (max), 1024 or 1080**.

---

## 4. Primitives

Location: `src/components/ui/`. Each primitive is a React component whose class names come from a `cva` definition and whose styles live in `src/app/ui.css`, imported right after `experience.css`. Class names are prefixed `ui-` so they can never collide with the 1,166 existing selectors (see the "a class name is an interface" rule in the handoff). Components stay presentational: no data access, no domain rules, no locale ternaries — copy comes in as props.

| Primitive | Variants (cva) | Notes |
| --- | --- | --- |
| `Button` | `variant: primary · secondary · ghost · danger · link`; `size: sm · md · lg`; `width: auto · full` | `loading` swaps the leading icon for a spinner and sets `aria-busy`; `icon` slot; renders `<button>`. Height = `--control-*`. Radius `--radius-md`. |
| `ButtonLink` | same as `Button` | Renders `next/link` with button classes. Used when a navigation must look like a call to action (e.g. "Ir para a configuração"). |
| `IconButton` | `variant: secondary · ghost · primary`; `size: sm · md · lg` | Square, `aria-label` required by type. |
| `TextLink` | `tone: default · muted · inherit`; `underline: hover · always` | Renders `next/link`. Inline links in prose use `underline: always`; links in rows use `hover`. |
| `Card` | `padding: none · compact · default`; `tone: default · subtle · accent · inverse`; `interactive` | `<section>` or `<article>` by `as`. Border + `--elevation-1`. The only card box in new code. |
| `Field` + `Input` / `Textarea` / `Select` | `size: md · lg`; `invalid` | `Field` composes label, hint and error with `aria-describedby`; 16px font minimum on touch (iOS zoom floor). |
| `Badge` | `tone: neutral · info · success · warning · risk · accent`; `size: sm · md` | Replaces `status-badge` and the per-page chips. Sans caption face, never mono. |
| `EmptyState` | `size: compact · default`; `tone: quiet · info` | Icon (lucide), title, one sentence, optional primary action. **Quiet** is the default; `info` is the blue box, reserved. |
| `PageHeader` | `size: default · compact`; `align: start · center` | Title (h1), optional one-line description, optional `actions`. **No eyebrow slot** — eyebrows are retired from page headers. On phones `compact` renders the title at 24px with the description hidden behind the description's own `(?)` toggle when provided as `help`. |
| `ListItem` | `density: comfortable · compact`; `interactive` | Leading slot, title, meta line (caption), trailing slot. Row height from `--row-*`. |
| `SegmentedControl` | `size: sm · md` | The single selection control for 2–4 exclusive views. Replaces the per-page pill groups. |
| `Sheet` | `side: bottom · right` | Phase-two primitive (slice A.3); listed so no slice invents a modal before it exists. |

Rules of use:

- **Button vs link.** A control that changes data or starts an operation is a `Button`. A control that moves to another page is a `TextLink` or, when it is the page's call to action, a `ButtonLink`. Never a `<button>` that calls `router.push`, never an `<a>` that submits.
- **One primary per view.** A screen has at most one `variant="primary"` visible at a time (the composer's send, or the page's single call to action).
- **Touch target** 44×44 minimum for anything tappable on a phone; `size="sm"` is desktop-only and the component enforces it with a media query, not a prop.
- **Focus** uses `--focus-ring` at 2px offset 2px, visible on keyboard only (`:focus-visible`).
- **Reduced motion** disables the rise animation and spinner rotation.
- **Contrast** every pairing meets WCAG AA 4.5:1 for text and 3:1 for UI boundaries; the test `src/components/ui/contrast.test.ts` computes the pairs from `tokens.css`, it does not assert constants.

---

## 5. Page anatomy

```
┌──────────────────────────────────────────────┐
│ top bar (52px): title-less, search, bell, you │
├──────────────────────────────────────────────┤
│ PageHeader (compact on phone): H1 + actions  │
│ optional SegmentedControl (one row)          │
│ content: Cards / ListItems / the composer    │
│ …                                            │
├──────────────────────────────────────────────┤
│ bottom bar (phone): Hoje · Conversar · [+] · │
│ Agenda · Mais                                │
└──────────────────────────────────────────────┘
```

- Gutter 16px phone / 32px desktop; max width `--width-productivity` for lists, `--width-reading` for conversation and detail text.
- Vertical rhythm: `--section-gap` (32px) between sections, `--space-3` (12px) between rows, `--card-padding` (20px) inside cards.
- The sticky composer (chat) sits above the bottom bar: `bottom: calc(var(--mobilebar-height) + env(safe-area-inset-bottom))`.

---

## 6. Before / after — the five weakest pages

Baseline screenshots: `docs/reports/life-brain/evidence/baseline/<route>-pt-BR-iphone-390.png`. "After" is the target the slice must reach; the acceptance screenshot lands next to the baseline with the slice name.

### 6.1 Trabalho (`/app/work`, baseline score 1.5)

Before: eyebrow + 36px title + lead; quick-add input and a two-line "Adicionar" button; a 3-item lens strip, a 3-item pill group, two accordions and a "Selecionar as que estão nesta página" button — the first task is below the fold. On desktop each task row shows a lone checkbox centred in a 200px empty cell, the title on the right, a `NÃO INICIADA` chip, two buttons and an "Editar aqui" button on a third line.

After: `PageHeader compact` ("Tarefas", + action icon button that opens quick-add). One `SegmentedControl` (Hoje · Todas · Aguardando). Filters behind one `ghost` button with a count badge. Rows are `ListItem` with the checkbox in the leading slot, title + due/project in meta, state as a `Badge` in the trailing slot; row actions in a swipe/long-press sheet on phone and a hover trailing group on desktop. First task visible within 180px of the top on an iPhone.

### 6.2 Notificações (`/app/notifications`, score 1.5)

Before: 50 unread items, each a card with title, body, mono timestamp, "Não lida" chip, "Abrir", "Concluir tarefa", "Mais ações" — 103 buttons, 14,000 CSS px tall. Subtitle: "Somente sinais relevantes, com deduplicação e respeito ao silêncio."

After: `PageHeader compact` ("Avisos") with "Marcar tudo como lido". Grouped by day; each notice is a `ListItem` (unread dot, title, caption) that opens the item. One action per row at most (the primary verb), the rest in the item itself. 50 rows ≈ 3,000 px.

### 6.3 Relações (`/app/relations`, score 1.5)

Before: four paragraphs of prose explaining what a drawing means before the drawing; lens strip; a pill pair; an amber information block.

After: becomes a lens inside a person's or project's page (slice C.4) and leaves the navigation. Until then: title + the drawing + one caption line; all explanatory prose behind a `(?)` disclosure.

### 6.4 Calendário / Planejar (`/app/calendar`, `/app/calendar/plan`, score 2)

Before: lens strip + "Formato" pill row (4) + period row (3) + "O que mostrar" pill row (5) = 15 controls before the first event. Planejar shows five headings and six sentences about a day with nothing in it.

After: "Agenda" — one `SegmentedControl` (Dia · Semana · Mês), a date stepper in the header, filters behind one button. Empty day = one `EmptyState quiet` with the next event's date. Planejar is a mode of the day view, not a page.

### 6.5 Conversar (`/app/chat`, score 2 — and the main feature)

Before: eyebrow "CONVERSA COM CONTEXTO", a display title, a lead; a form with a monospace label, a serif placeholder full of work examples, a full-width black "Enviar" and a monospace keyboard hint; then a lens strip and a blue box. No conversation is visible. On the thread page the composer is at the bottom of up to 200 messages and not sticky; every answer carries the model id.

After (slice A.1): the page **is** a conversation. Compact header ("Conversar" + new conversation). Empty state: a warm greeting from the assistant and four life-question chips ("Quando fui ao médico pela última vez?", "O que tenho essa semana?", "O que falei sobre a viagem?", "Quais exames estão pendentes?"). Messages as a two-voice thread (you right-aligned in `--background-subtle`, the assistant in plain text with sources as `Badge`-sized chips under the answer). Composer sticky above the bottom bar, sans placeholder "Pergunte ou registre algo…", send as a 44px `IconButton primary`; the keyboard hint shows only on `(hover:hover)` devices. Model id moves into a per-message `(?)` detail. Conversar takes a slot on the bottom bar.

---

## 7. Copy direction

| Today | Direction |
| --- | --- |
| "Registre uma tarefa, decisão, conversa ou ideia…" | "O que aconteceu, o que você precisa, ou o que quer lembrar?" |
| "CONVERSA COM CONTEXTO · Fale com o Brain" | "Conversar" |
| "Trabalho" | "Tarefas" |
| "Registros" | "Registros" (stays; it is life-neutral) |
| "Brain" (section) | "Memória" (people, projects, places, files, memories) |
| "Perguntas pendentes" | shown inside Registros as "Precisa de você", not a destination |
| "Custos de IA", "Processamento", "Histórico de alterações" | grouped under "Avançado" in Ajustes |
| "Preferências operacionais · Somente preferências com consumer verificável." | "Ajustes" (no description) |
| "Interpretação", "interpretando" | "organizando", "lendo" |

---

## 8. Acceptance for every visual slice

1. A fresh baseline-style screenshot pair (iPhone 390 + desktop 1440, pt-BR; en when copy changed) lands in `docs/reports/life-brain/evidence/<slice>/`.
2. `measurements.json` for the touched routes shows: `overflowPx = 0`, `smallTargets = 0` on phone, `technicalWords = []`, and `buttonClassSignatures` not higher than before.
3. The first interactive or content element is visible within 200 CSS px of the top on the iPhone viewport (header + one control row).
4. Contrast test green in both themes.
5. No new `font-size`, `padding`, `border-radius`, `box-shadow` or colour literal in page CSS (checked by `src/components/ui/page-css-guard.test.ts` on the files the slice touches).

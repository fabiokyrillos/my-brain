# My Brain — UI/UX state audit (read-only)

Repo: `D:\Projetos\GitHub\my-brain` at `main` `b38d656` (2026-10-30). No file in the repo was modified.
All paths below are repo-relative; `file:line` cites the checkout at this SHA. Counts come from the commands quoted inline.

## 0. The premise correction that frames everything else

The brief assumed "Tailwind v4 + cva + lucide-react". Two of the three are installed and **unused as a styling system**:

| Assumption | Reality | Evidence |
| --- | --- | --- |
| Tailwind utilities in JSX | **Zero** utility classes in TSX. `rounded-*` 0, `text-xs` 0, `text-sm` 0, `px-*` 0, `bg-*-NNN` 0, `underline` 0 across 199 non-test `.tsx` files. | `grep -rho 'rounded-[a-z0-9]*' src --include=*.tsx --exclude=*.test.tsx \| wc -l` → 0 (same for the others) |
| Tailwind as the theme | `@import "tailwindcss"` is line 1 of `src/app/globals.css` but the only `@theme` block maps 5 variables (`--color-background`, `--color-foreground`, three fonts) onto the hand-written tokens | `src/app/globals.css:1`, `src/app/globals.css:58` (`@theme inline {…}`) — Tailwind is effectively preflight only |
| `cva` primitives | `class-variance-authority` is in `package.json:97`; **0 files call `cva(`** | `grep -rl 'cva(' src` → empty |
| `src/components` / `ui/` | **Does not exist**. No `components`, `ui`, or `primitives` directory anywhere under `src/` | `find src -type d \( -name ui -o -name primitives -o -name components \)` → empty |
| lucide-react | Used: 55 non-test TSX files import it | `grep -rl lucide-react …` → 55 |

What the product actually has is a **BEM-ish, hand-written CSS architecture**: 27 stylesheets under `src/app/*.css`, **11,023 lines**, 1,166 distinct class selectors, 1,069 distinct `className="…"` strings in TSX, all imported globally in a fixed, order-dependent cascade from `src/app/globals.css:5-52` (24 `@import`s with comments like "After calendar.css: … the tab strip below them must be able to sit on top of that block" at `globals.css:20-21`) plus two more from `src/app/layout.tsx:6-8`. Several files are partially minified single-line CSS (`src/app/operations.css:1-3` holds dozens of rules on three lines, including `.button-primary,.button-secondary{` at `operations.css:2`).

This is the single most important fact for any redesign plan: **there is no component layer to restyle — there are ~1,100 page-scoped class names to re-author.**

---

## 1. Prior UX work — promised vs shipped

### 1.1 `docs/initiatives/product-ux/MY_BRAIN_PRODUCT_AUDIT.md` (2026-07-21)
- **Promised/diagnosed:** verdict at `:8-24`: "credible product idea… the interface does not yet make that advantage feel like one coherent daily instrument"; IA scored 2/4 (`:31`); too many top-level list pages; missing search, command access, direct manipulation, bulk, loading states, memory lifecycle (`:16`).
- **What shipped since:** nearly all of it, per `docs/reports/product-ux/PRODUCT_UX_CLOSEOUT.md:7-11` (35 findings: 30 resolved, 4 retained, 1 deferred, `:28-33`) and the before/after IA table at `:120-134` (five-slot mobile bar, Registros rename, attention-surface Home, task detail, entity detail pages, memory lifecycle, reminders verbs, account menu, one composer).
- **Half-done:** the audit's "coherent daily instrument" is a *visual/interaction* goal; the closeout counts only 3 of 35 findings as category `visual` (`CLOSEOUT.md:56`). The remediation was overwhelmingly lifecycle/usability/IA, not look.

### 1.2 `docs/initiatives/product-ux/MY_BRAIN_UX_ROADMAP.md`
- **Promised:** C-01 command palette (`:39`), converge-before-expand (`:20`), every slice ships populated/empty/loading/error/mobile/keyboard/i18n states (`:23`).
- **Shipped:** command palette exists (`src/features/palette/command-palette.tsx`, mounted at `src/features/shell/app-shell.tsx:90`); global search page exists (`src/app/[locale]/app/search/page.tsx`); Phase 2I "Foundation and Findability" closed 61/61 (`docs/STATE.md:228`).

### 1.3 `docs/initiatives/product-ux/MY_BRAIN_DESIGN_SYSTEM_PLAN.md` — the one that matters for "looks poor"
- **Promised** (`:171-226`): a **component contract** — `Button` (5 variants × 6 states), `IconButton`, `Input/Textarea/Select`, `Checkbox/Radio/Switch`, `Badge`, `Tag`, `Surface`, `Divider`, `Avatar`; composites `PageHeader`, `ListToolbar`, `ListRow`, `Tabs`, `CommandPalette`, `PeekPanel`, `Pagination`, `DataTable`, `Disclosure`, `ActionBar`; trust composites; state components `EmptyState`, `Skeleton`, `InlineFeedback`, `Notice`, `ErrorState`, `OfflineState`. Migration plan `:313-341`: Stage 2 "Add primitive Button/Input/Badge/Surface/Feedback", Stage 3 "Build PageHeader, EmptyState, Skeleton, ListRow, Tabs, Toolbar, Pagination, ActionBar", Stage 5 "Remove superseded selectors only after parity". Completion gate `:455-465`: "new features can be built without inventing colors, text sizes, radii, loading states, or list behavior; old page CSS can be removed safely".
- **Its own baseline inventory** (`:29-43`): 9 root tokens, 164 hard-coded colours, 97 declarations ≤12px, 16 radii, 12 shadows, ~805 rule blocks, breakpoints 600/700/760/850/900.
- **Shipped:**
  - DS-01 semantic colour → **done** by ADR-114 "Papel e Console" (`docs/DECISIONS.md:1518-1534`): `src/app/tokens.css` created, declared the only file allowed to hold a raw colour (`globals.css:2-4`); the nine legacy aliases (`--ink`, `--paper`, `--blue`…) are now bridges (`tokens.css:258-288`) and have **0 remaining uses** in any stylesheet (grep `var(--ink)` etc. → all 0).
  - DS-02 type/density → **tokens exist** (`--type-display`…`--type-eyebrow`, `tokens.css:73-86`; `data-density` at `tokens.css:239-246`) and are used 665 times (`grep -ho 'var(--type-' src/app/*.css`). **But nothing in TSX ever sets `data-density`** (`grep -rn data-density src --include=*.tsx` → 0): compact density is a dead token.
  - DS-05 empty/loading/error family → **exists**: `UniversalStateView`, `UniversalStateLine`, `UniversalSkeleton`, `AuthoredBlock` (`src/features/experience/universal-state.tsx:136,246,284,304`).
  - DS-06 trust family → **exists**: `EntityChip`, `SuggestionCard`, `ConfirmationCard`, `SourceCard`, `ProcessingBanner`, `UndoFeedback`, `DetailSurface` (`src/features/experience/trust-components.tsx:40-292`).
  - DS-07 palette/dialog/sheet → palette yes; `ConfirmDialog` exists only inside task-commands (`src/features/task-commands/confirm-dialog.tsx:135`); **no generic Sheet/Drawer/Popover** (0 CSS classes contain `sheet`, `modal`, `drawer`; 2 `<dialog>` tags in all TSX).
  - **DS-03 shared action/form primitives → NOT done.** No `Button`, `IconButton`, `Input`, `Select`, `Badge`, `Tag`, `Surface` component exists anywhere. See §3.
  - **DS-04 list interaction system → partial.** `.list-row/.list-header/.list-meta` live in minified `operations.css:2-11` but 42 distinct `*row*` and 45 `*list*` class families are defined across the stylesheets.
  - **DS-08 responsive consolidation → NOT done.** Breakpoints in use today: `max-width:600px` (35), `max-width:899px` (22), `max-width:900px` (5), `min-width:900px` (4), `min-width:1080px` (3) — written in two spacing styles.
  - **DS-10 visual regression gates → NOT done.** `grep -rho toHaveScreenshot e2e | wc -l` → 0 (4 raw `.screenshot(` calls only). The `ux-evidence/` PNGs are manual captures from July (see §1.7).
  - Stage 5 "remove superseded selectors" → never happened; the stylesheet count went *up* (plan counted ~805 rule blocks; today 1,166 distinct selectors / 11k lines).

### 1.4 `docs/initiatives/product-ux/MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md` (Portuguese, owner's PRD)
- **Promised:** §5.1 primaries Hoje · Registros · Trabalho · Conversar · Biblioteca + Capturar global (`:96-105`); §5.2 Biblioteca groups Memórias/Pessoas/Projetos/Empresas/Contextos/Arquivos (`:107-116`); §5.4 mobile bar Hoje · Trabalho · Capturar · Conversar · Mais (`:129-139`); Etapa 0 (`:219-264`): slice 0.1 visual language + dark mode "only if complete", 0.2 trust components, 0.3 mobile shell + universal states.
- **Shipped:** Etapa 0+1 as Phase 2I (ADR-092 `DECISIONS.md:1106`, closed `STATE.md:228`); Etapa 2 as 2J (`STATE.md:224`); Etapas 3-6 as 2K-2O (ADR-101/103/105/112/118, `DECISIONS.md:1290,1325,1357,1483,1582`); then 2P-2S beyond the roadmap (ADR-125/130/135/139 at `:1729,1825,1957,2085`). Dark mode shipped complete via ADR-114 Decision 2 (`DECISIONS.md:1523`).
- **Diverged:** the mobile bar today is `["home","inbox","capture","work","library"]` (`src/features/shell/capabilities.ts:587`) — **Conversar is not on the bar** (it is `visibility:"more"`, group `context`, `capabilities.ts:422`), and `Registros` *is*, contrary to PRD §5.4. "Mais" is not a slot; demoted primaries + groups render inside the bar's overflow (`navigation-links.tsx:90-110,214-223`).

### 1.5 `PHASE_2K_2O_ROADMAP_DESIGN.md` / `PHASE_2K_2O_MASTER_IMPLEMENTATION_PLAN.md`
- Program-control documents (gates, artifact sets, migration budgets — `MASTER…:11-74`). Every phase they describe is closed by an ADR (above). Neither document contains a visual-design deliverable; "design system" is not a phase in this roadmap. **Visual quality was never a gated requirement of any phase 2K-2S.**

### 1.6 `docs/initiatives/next-experience/*` (2026-08-07, pre-2I)
- `CURRENT_EXPERIENCE_AUDIT.md:44-47`: "The PRD's §5.1 and §5.4 navigation is, in substance, already shipped." `UX_PRD_REVIEW.md:47-67`: F-1 navigation already shipped (high), F-2 "Discoverability, not navigation, is the load-bearing problem" (high), F-10 localization debt (`:185`). `UX_GAPS…` is a backend-cost mapping. `INITIATIVE_DEFINITION_PROPOSAL.md:83-96` proposed 2I.1 `2I-LANG`, 2I.2 `2I-TRUST`, 2I.3 `2I-STATE` — these are what became `experience.css`, `trust-components.tsx`, `universal-state.tsx`.

### 1.7 `docs/reports/product-ux/`
- `PRODUCT_UX_CLOSEOUT.md` (459 lines), `PRODUCT_UX_FINDINGS.md` (3,304 lines, UX-01…UX-35), `SLICE_G5_REMINDER_INVESTIGATION.md`.
- `ux-evidence/` = 199 PNGs in 8 dirs: `baseline/` 28 (home/login/register × 1440/1920/iPhone-SE/Pixel-7), `slice-a/` 12, `slice-b/` 22 (+`nav-more-open`), `slice-c/` 20, `slice-d1/` 2 (task-detail), `slice-g3/` 24 (memories), `slice-g4/` 24 (history), `slice-h/` 67 (home/inbox/work/projects/memories/reminders/settings/history). All predate Papel e Console (July 2026); **no evidence set exists for the current theme**.

### 1.8 Papel e Console itself — what landed
ADR-114 (`DECISIONS.md:1518`) authorized "integral application… design system, typography, light and dark themes, components, universal states, shell, navigation…". STATE records it as a branch with 19→26 commits, "no push, no PR, no merge" (`STATE.md:132,130,128`); `tokens.css` and the IBM Plex fonts are on `main` now (`src/app/layout.tsx:2,32-43`), so at least the token/font part merged. What ADR-114 Decision 4 promised — "**each slice retires the aliases it replaces**" — did happen for the nine colour aliases, but the *composition* half ("components") produced no shared component files: the newest primitives on `main` are still the Phase-2I `experience/` modules.

### 1.9 Diagnosis — why it still looks poor despite all this
1. **Tokens were retrofitted under 11k lines of page CSS instead of replacing it.** The palette is centralised (good) but every surface keeps its own box model: 252 distinct `padding:` values, 113 distinct `gap:` values, 2,396 `px` literals vs 159 `rem`, 31 distinct `font-size` values alongside the 14 `--type-*` tokens, 22 distinct `box-shadow` values vs 5 `--elevation-*`, 18 distinct `border-radius` values vs 5 `--radius-*` (commands in §2). Consistency of *colour* was bought; consistency of *rhythm, density and shape* was not.
2. **No primitive layer, so every feature invented its own controls.** 200 `<button>`s carry 43 distinct classNames, 30 carry none; at least seven parallel button families exist (`button-primary/secondary` `operations.css:2`, `ux-action-*` `experience.css:258-264`, `task-command-primary/secondary`, `reminder-button[ primary|danger]`, `entity-edit-save/open`, `push-action`, `voice-finish`). Each was styled by a different slice with a different height, radius and weight.
3. **The type scale is small for a phone-first product.** `--type-body` is 13.5px, `--type-label` 12.5px, `--type-caption` 12px, `--type-eyebrow` 11px (`tokens.css:82-86`). The 2026-07 plan already flagged "97 declarations at 12px or below" as a fatigue/accessibility risk (`DESIGN_SYSTEM_PLAN.md:34`); the token set codified it instead of fixing it. Only 8 `font-size: 16px` declarations exist (iOS input-zoom floor).
4. **Elevation is turned off in dark mode** (`--elevation-1: none; --elevation-2: none;` `tokens.css:183-184,225-226`), so in the theme most iPhone users will see by default (`prefers-color-scheme`, `tokens.css:197`), cards, rows and sheets are separated only by hairline borders on a near-black canvas. The light theme's elevation 1-2 are also very faint (`0 1px 3px rgba(0,0,0,.05)`, `tokens.css:123-124`).
5. **Density is a dead switch.** `data-density="compact"` is defined (`tokens.css:239-246`) but no code sets it; nothing in the appearance control offers it (`src/features/appearance/contracts.ts` only exposes theme).
6. **Twenty-six destinations, six groups, and one shell.** The navigation model exposes 26 keys (§4). Even with the five-slot bar, the "Mais" overflow carries 17 entries in 5 labelled groups (`navigation-links.tsx:214-223`), including vocabulary that is internal ("Contextos", "Relações", "Custos de IA", "Histórico").
7. **The process optimised for provable behaviour, not for look.** Every ADR gate counts requirements, migrations, CI SHAs and device checkpoints; the only visual gates are contrast and touch-target assertions. There is no screenshot regression lane (`toHaveScreenshot` = 0), no current evidence set, and "visual" was 3 of 35 findings. The product got *correct* faster than it got *designed*.
8. **Order-dependent global CSS.** `globals.css:20-28` documents that files must import in a particular order for selectors to win; `.button-primary` is re-specialised per page (`history.css:86,92,246-247`), `.status-badge` per page (`calendar.css:1010-1011`, `operations.css:50`), `.eyebrow` per page (`agent.css:5`, `assistant.css:166`, `costs.css:1`). Any new surface drifts unless its author reads 11k lines first.

---

## 2. Design tokens (`src/app/tokens.css`, 288 lines; `src/app/experience.css` for tone)

Commands: `grep -hoE '^\s*--[a-z0-9-]+:' src/app/*.css | sort -u | wc -l` → **156** distinct custom properties, **117** of them in `tokens.css`.

| Family | Tokens (line) | Status |
| --- | --- | --- |
| Surfaces | `--background-canvas/-surface/-subtle/-subtle-strong/-elevated/-inverse` (`:29-36`) | light + dark (dark at `:154-192` explicit, `:197-235` media) |
| Text | `--text-primary/-secondary/-muted/-inverse` (`:37-50`) | both themes; `--text-muted` darkened for 4.5:1 (`:40`) |
| Lines/marks | `--border-default/-strong/-divider`, `--mark-decorative` (`:51-57`) | both |
| Action/focus | `--action-primary/-hover/-text`, `--focus-ring`, `--link/-hover` (`:58-65`) | both |
| Tone (state) | 38 `--tone-{information,success,attention,risk,suggestion,archived}-{fg,bg,line}` + `--tone-attention-row` (`experience.css:32-70`, dark `:76-104`) | both; guarded by `src/lib/closeout/phase-2i-experience-guard.test.ts` |
| Type | `--font-reading` (Newsreader), `--font-ui` (IBM Plex Sans), `--font-mono` (IBM Plex Mono) (`:69-71`); 14 `--type-*` shorthands 40px→11px (`:73-86`) | used 665×; 68 raw `font-size:` remain; 31 distinct sizes |
| Space | `--space-1…16` = 4/8/12/16/20/24/32/40/48/64 (`:90-99`) | exists but 252 distinct `padding:` values and 2,396 px literals bypass it |
| Measures | sidebar/header/mobilebar/panel/list/width/row/touch (`:101-114`) | — |
| Radius | `--radius-sm 6 / md 10 / lg 12 / sheet 20 / full 999` (`:116-120`) | 18 distinct `border-radius` values in use; md/lg dominate (119/113) |
| Elevation | `--elevation-1/2/3/-sheet/-undo`, `--scrim` (`:123-133`) | dark sets 1 and 2 to `none`; 22 distinct `box-shadow` values in use |
| Motion | `--motion-fast 100 / standard 160 / emphasis 220ms`, `--ease-enter/-exit` (`:136-140`); reduced-motion collapses to 1ms (`:250-256`) | only 10 `transition:` declarations in all CSS; 8 files honour reduced motion |
| Density | `[data-density="comfortable|compact"]` (`:239-246`) | **never set by any component** |
| Legacy bridge | `--ink --ink-soft --line --paper --mist --white --blue --blue-wash --signal --gutter --page-bottom` (`:267-288`) | 0 live consumers of the nine colour aliases; `--gutter`/`--page-bottom` still used |

**Missing:** no z-index scale; no sizing scale for controls (button heights are per-family); no icon-size token; no opacity/disabled token; no semantic "card"/"row" surface recipe (each page writes border+radius+bg itself); no breakpoint tokens (Tailwind's `@theme` is unused for this); no type tokens ≥16px for body on mobile.

**Dark mode:** complete and authored (ADR-114 Decision 2-3). Default follows `prefers-color-scheme` via `:root:not([data-theme="light"])` (`tokens.css:197-198`); explicit choice stored in `localStorage` and applied by an inline script before paint (`src/app/layout.tsx:75-107`); `themeColor` is per-scheme (`layout.tsx:64`). Control: `src/features/appearance/appearance-control.tsx` (device/light/dark; copy at `src/features/shell/capability-copy.ts:85-88`). Raw colours outside `tokens.css`: 63 hex + 1 rgba (`grep -ho '#[0-9a-fA-F]\{3,8\}\b' <all but tokens.css>`), 38 of them being the tone set in `experience.css` — the remaining ~25 are drift.

---

## 3. Component inventory

Method: `grep -rhoE 'export (default )?function [A-Z]…' src --include=*.tsx --exclude=*.test.tsx`; element and className counts via `grep -rho '<button' …` etc. (non-test TSX only).

| Primitive | Reusable component? | Variants | Ad-hoc reality |
| --- | --- | --- | --- |
| **Button** | **None.** Closest: `.button-primary/.button-secondary` CSS (`src/app/operations.css:2`), `.ux-action{-primary,-quiet}` (`src/app/experience.css:258-269`), `AuthSubmitButton` (`src/features/auth/submit-button.tsx`, auth only) | n/a | **200 `<button>`**, 43 distinct classNames, 30 with no className. Top: `task-command-primary` 10, `entity-edit-save` 8, `button-secondary` 8, `reminder-button` 7, `row-action` 6, `entity-edit-open` 6, `button-primary` 6, `task-command-secondary` 5, `reminder-button primary` 4, `ux-action ux-action-quiet` 3 |
| **Link** | None (raw `next/link`). `back-link` class used 10× | — | **153 `<Link>`**, 42 distinct classNames, 51 with none; 11 raw `<a>` |
| **IconButton** | None. `NotificationsLink` (`navigation-links.tsx:127`) and `TaskPanelClose` are one-offs | — | icon-only buttons are hand-built per feature |
| **Card** | Partial: `SuggestionCard`, `ConfirmationCard`, `SourceCard` (`trust-components.tsx:87,157,200`), `ConversationCardView`, `ResumedCard`, `MemoryProposalCard`, `QuestionOutcomeCard`, `NeedsAttentionLeadCard` — all domain cards | — | **40 CSS class families containing `card`** (`grep -hoE '\.[a-z0-9_-]*card[a-z0-9_-]*' src/app/*.css \| sort -u`); no generic Surface |
| **Input / Textarea / Select** | **None.** `.field-label` class used 17× | — | **286 `<input>`, 14 `<textarea>`, 55 `<select>`** raw; 12 `*field*` and 4 `*select*` CSS families |
| **Badge / Chip** | `EntityChip` (`trust-components.tsx:40`); `.status-badge` CSS (`operations.css:11`, used 18×) | tone via `data-tone` | 9 `*chip*`, 6 `*badge*`, 1 `*pill*`, 3 `*tag*` CSS families |
| **EmptyState** | `UniversalStateView` (`universal-state.tsx:136`), `ReminderEmptyState`; `.empty-state` CSS (`globals.css:60`), `.quiet-state` (16 uses) | tone/icon | 11 `*empty*` CSS families; three competing idioms (`UniversalStateView`, `.quiet-state` `<p>`, `.empty-state`) |
| **Sheet / Dialog** | `ConfirmDialog` (`task-commands/confirm-dialog.tsx:135`) only; `use-scroll-lock.ts` in shell | — | 2 `<dialog>` tags; 11 `*dialog*` CSS families; **0 sheet/modal/drawer classes**; task panel uses parallel route `work/@panel` instead of a sheet component |
| **ListItem / Row** | None generic. `InboxItemRow`, `NeedsAttentionItemRow`, `ConflictAttentionItemRow`, `RelationRow`, `SuggestionRow`, `NotificationRowActions` (799 lines) | — | 42 `*row*` + 24 `*item*` + 45 `*list*` CSS families; `.list-row` 9×, `.list-row-main` 15×, `.row-action` 16× |
| **Tabs** | **Five** separate implementations: `WorkModeTabs` (`daily-cycle/work-modes.tsx`), `ReviewTabs` (`reviews/review-tabs.tsx`), `RelationViewTabs` (`relations/relation-view-controls.tsx`), `DataAiTabs` (`transparency/data-ai-tabs.tsx`), `BrainLensTabs` (`library/brain-lenses.tsx`) | — | 11 `*tab*` CSS families |
| **Toast** | **None.** `UndoFeedback` (`trust-components.tsx:253`) is inline; 93 `role="status"` + 62 `aria-live` regions hand-placed | — | 0 `*toast*` CSS classes |
| **Skeleton** | `UniversalSkeleton` (`universal-state.tsx:284`) | rows | 2 CSS families |
| **Banner / Notice** | `ProcessingBanner`, `ReminderSeriesBanner`, `ReminderFeedbackBanner`, `BoundedNotice`, `AskingAboutBanner` | — | 19 `*notice*` + 3 `*banner*` CSS families |

**Most-repeated className strings** (`grep -rhoE 'className="[^"]+"' … | sort | uniq -c | sort -rn`): `sr-only` 52, `spin` 50, `eyebrow` 42, `button-secondary` 20, `status-badge` 18, `list-header` 18, `field-label` 17, `row-action` 16, `quiet-state` 16, `list-row-main` 15, `entity-edit-feedback error` 15, `content-page` 14, `list-stack` 12, `list-meta` 12, `task-command-primary` 11, `reminder-button` 11, `data-ai-intro` 11, `form-error` 10, `entity-edit-feedback success` 10, `back-link` 10. Because classes are single tokens, "long Tailwind strings" do not exist; duplication shows up as 1,166 selectors for 1,069 used names and as the seven button families above.

**Localization:** 57 typed `copy.ts` modules exist, yet **31 inline `locale === "pt-BR" ?` ternaries remain in 13 files** — 12 in `src/features/tasks/candidate-editor.tsx` (1,401 lines), 6 in `src/features/interpretations/revision-editor.tsx`, plus `app-shell.tsx`, `navigation-links.tsx` (2), `costs/page.tsx`, `settings/layout.tsx`, `capture-receipt.tsx`, `source-list.tsx`, `suggestion-row.tsx`, `memory-proposal-card.tsx`, `consent-section.tsx`, `navigation-pending.tsx`, `task-candidate-form.tsx`.

---

## 4. Navigation

Source of truth: `src/features/shell/capabilities.ts:385-488` (26 keys), labels in `src/i18n/messages.ts:17-97`, rendering in `src/features/shell/navigation-links.tsx`, shell in `src/features/shell/app-shell.tsx`.

**Shell layout** (`app-shell.tsx:55-135`): `.app-frame` grid → `<aside class="side-rail">` with brand "B" (`:66-68`), `<nav class="side-nav">` (`:71`), rail footer account (`:79`); `<div class="main-stage">` → `<header class="top-bar">` holding `CommandPalette` (`:90`), `NotificationsLink` (`:96`), header account (`:118`); `<main id="main-content">`; `<nav class="bottom-nav">` mobile (`:125-135`), shown at `max-width: 899px` (`src/app/mobile-navigation.css:252,432`).

| # | key | pt-BR label | route | visibility / group | jargon? |
| --- | --- | --- | --- | --- | --- |
| 1 | home | Hoje | `/app` (alias `today`) | primary | — |
| 2 | inbox | Registros | `/app/inbox` | primary | — |
| 3 | work | Trabalho | `/app/work` (aliases `tasks`, `waiting`) | primary | — |
| 4 | library | Brain | `/app/library` | primary | product name as a nav noun |
| 5 | capture | Captura rápida | `/app/capture` | global (centre slot) | — |
| 6 | notifications | Notificações | `/app/notifications` | global (header icon) | — |
| 7 | chat | Conversar | `/app/chat` | more / Contexto | — |
| 8 | projects | Projetos | `/app/projects` | more / Contexto | — |
| 9 | people | Pessoas | `/app/people` | more / Contexto | — |
| 10 | organizations | Empresas | `/app/organizations` | more / Contexto | — |
| 11 | contexts | **Contextos** | `/app/contexts` | more / Contexto | GTD-ish internal term |
| 12 | memories | Memórias | `/app/memories` | more / Contexto | AI-internal concept |
| 13 | files | Arquivos | `/app/files` | more / Contexto | — |
| 14 | relations | **Relações** | `/app/relations` | more / Contexto | graph/data term |
| 15 | reviews | Revisões | `/app/reviews` | more / Reflexão | — |
| 16 | questions | **Perguntas pendentes** | `/app/questions` | more / Reflexão | pipeline state as a destination |
| 17 | calendar | Calendário | `/app/calendar` | more / Organização | — |
| 18 | reminders | Lembretes | `/app/reminders` | more / Organização | — |
| 19 | history | **Histórico** | `/app/history` | more / Transparência | audit log |
| 20 | costs | **Custos de IA** | `/app/costs` | more / Transparência | billing ledger |
| 21 | settings | Configurações | `/app/settings` (8 sections) | more / Preferências | — |
| 22 | jobs | (lens title under Transparência) | `/app/jobs` | **context-only** (reachable from `files/page.tsx:499`) | queue admin |

Plus unlisted routes: `/app/search`, `/app/today`, `/app/tasks`, `/app/waiting` (alias pages), `/app/work/cancelled`, `/app/calendar/plan`, `/app/work/[taskId]` + `@panel` intercept.

**Counts:** 4 primary + 2 global + 15 "more" in **5 labelled groups** (Contexto 8, Reflexão 2, Organização 2, Transparência 2, Preferências 1) + 1 context-only = **22 nav destinations, 6 groups** (`navGroups` at `messages.ts:91-97`). Mobile bar = `home · inbox · capture · work · library` (`capabilities.ts:587`), i.e. **Hoje · Registros · [Captura] · Trabalho · Brain**; the "Mais" overflow (`messages.ts:89`) is a `<details>` (`navigation-links.tsx:104-110`) listing the demoted primaries then the five groups.

**Account menu** (`account-menu.tsx:82-108`): display name + "signed in as", **Configurações** link, **Sair** — nothing else.

**Jargon exposed to the user:** "Contextos", "Relações", "Perguntas pendentes", "Histórico", "Custos de IA", "Memórias" as top-level nouns; "Brain" doubling as product name and section; settings section vocabulary such as "Roteamento de IA" (`capability-copy.ts:61`) and "Automação por categoria" (`:96`); `/app/jobs` retains raw `jobs.type` for unknown workers (closeout `:259-262`). The English nav uses "Talk" for Conversar and "Records" for Registros (`messages.ts:110,122`).

**Home** (`src/features/shell/home-dashboard.tsx` → `home-view.tsx`, 800 lines; copy `home-copy.ts:112-181`): greeting + "O que merece sua atenção agora?" + status line; `Composer` embedded (`home-dashboard.tsx:297`); `OnboardingPanel` (`:308`); sections **Precisa de você**, **Prioridades de hoje** (max 3), **Para hoje**, **Aguardando outras pessoas**, **Pergunta em aberto**, side column **Adiante** + **Sendo organizado** + **Encerrar o dia** (`home-copy.ts:121-174`). That is 8 named blocks on one phone screen, each with its own hint sentence.

---

## 5. Page-level smells

Scan: scratchpad script `page-smells.js` reads each `page.tsx` under `src/app/[locale]/app/` plus its first- and second-level `@/features/*.tsx` imports and counts regex hits (so numbers are *signals*, not rendered-field counts). Columns: rawId = `{x.id}`-style interpolations; rawEnum = `{x.status|kind|type|model…}`; techFields = `prompt_version|request_id|tokens_in|idempotency|lease…`; locale = inline ternaries.

| Route | Smells (from the scan + reading) |
| --- | --- |
| `/` (home) | 9 techFields hits, 11 error-state idioms, 8 blocks; Composer + onboarding + priorities on one scroll |
| `/inbox` | rawId 15, rawEnum 4, confidence 3; page file 370 lines |
| `/inbox/[entryId]` | **7 inline locale ternaries** (via `revision-editor.tsx`), 6 `<pre>/mono/JSON.stringify` hits, confidence 6 — the "technical details" disclosure (`daily-cycle/technical-details.tsx:13,133-140`) renders per-mention `confidence: number` and `JSON.stringify` hidden inputs (`revision-editor.tsx:259`) |
| `/work`, `/work/[taskId]`, `@panel` | rawId 7, rawEnum 4; candidate editor is 1,401 lines with 12 ternaries |
| `/chat`, `/chat/[conversationId]` | rawEnum 6-7, confidence 1-4, 2 ternaries (`source-list.tsx`, `suggestion-row.tsx`); 12 imported components |
| `/calendar`, `/calendar/plan` | rawId 3-6; heavy loading idioms (32-37) — 1,270-line `calendar.css` |
| `/files` | **762-line page file**, rawId 12, errorState 60, links to `/app/jobs` as the repair path (`files/page.tsx:496-499`) |
| `/people/[personId]` | **811-line page file**, rawId 34, 15 imported components — route file does the composition work |
| `/projects/[projectId]` | 666-line page file, rawId 29 |
| `/costs` | **572-line page file**, `toFixed(` ×3, 1 ternary, 12 error idioms — a ledger table with model/operation columns |
| `/memories/[memoryId]` | rawId 14, 15 formatter calls — provenance/validity metadata dense |
| `/history` | 10 formatter calls; audit vocabulary via typed map (closeout says resolved) |
| `/jobs` | rawEnum 3; titled under "Transparência" (`jobs/page.tsx:68-69`); raw worker type fallback retained (closeout `:259`) |
| `/notifications` | rawId 9, rawEnum 3; `notification-row-actions.tsx` 799 lines |
| `/questions` | rawId 5, rawEnum 3, confidence 2, 8 formatters |
| `/relations` | rawEnum 9 (graph node kinds), 616-line `relations.css` |
| `/reminders`, `/reminders/[id]` | rawEnum 4, 9-10 formatters; `reminder-composer.tsx` 620 lines |
| `/reviews`, `/reviews/[id]` | 78 loading idioms in reviews; rawId 8 |
| `/settings`, `/settings/[section]` | rawEnum 9, 2 ternaries (`settings/layout.tsx`, `consent-section.tsx`), 16 imported components, `settings-extended.css` 1,368 lines |
| `/library` | 3 files, 0 empty-state idioms — lens strip only |
| `/search`, `/contexts*`, `/organizations*`, `/people`, `/projects` | thin lists, 0 ternaries, modest counts |
| `/today`, `/tasks`, `/waiting` | 1-file alias redirects |

**Loading / error boundaries:** exactly **one** `loading.tsx` and **one** `error.tsx` for the whole `/app` tree (`src/app/[locale]/app/loading.tsx`, `error.tsx`); none per route, none under `auth/`. The loading fallback renders both locales and hides one with CSS (`loading.tsx:14-32`); the error boundary derives locale from `window.location.pathname` (`error.tsx:14`) and shows `error.digest` (`:37-40`). No `not-found.tsx` anywhere.

**Formatting:** 0 `toLocaleDateString` calls (good — `formatInstant`/`formatLocalDay` are the norm) but 5 `toISOString` reach TSX; 36 inline `style={` props.

---

## 6. Capture vs chat composer

They are **two different components** that share nothing but `VoiceComposer`'s absence from one of them:

| | Capture composer | Assistant (chat) composer |
| --- | --- | --- |
| File | `src/features/capture/composer.tsx:88` `Composer` (598 lines) | `src/features/assistant/assistant-composer.tsx:43` `AssistantComposer` (268 lines) |
| Mounted on | `/app/capture` (`capture/page.tsx:43`) and **Home** (`shell/home-dashboard.tsx:297`) with `source: "home" \| "capture_page"` (`composer.tsx:68`) | `/app/chat` (`chat/page.tsx:94`) and `/app/chat/[conversationId]` (`[conversationId]/page.tsx:203`) |
| Forms | **Two sibling `<form>`s**: text → `captureEntry`, attachment → `uploadAttachment` (`composer.tsx:9-16,394-404`); modality `text\|attachment\|voice` (`:86`); hosts `VoiceComposer` (`:575`) | One `<form action={runAssistantTurn}>` with hidden `intent="ask"` (`assistant-composer.tsx:164-168`); textarea `composerText` (`:172-187`); **no voice, no attachment** |
| Routing | none — always a capture | `decideAssistantRoute(text)` (`assistant/routing.ts:49-70`): `memory_intent` → `capture_intent`/`capture_ambiguous` → length>`MAX_COMMAND_TEXT_LENGTH` → `knowledge` → else `command_first`; `commandTurnFallsThrough` (`:86-88`) lets `not_a_task_command` fall to the knowledge answer |
| "register" vs "ask" | n/a | `classifyCaptureIntent` (`capture-intent.ts:77-89`): text must start with one of 15 openers (`"registre que"`, `"anote isso"`, `"capture this"`, `"jot down"`… `:44-60`), not end with `?`; if it also names `tarefa/task` → `ambiguous` (asks instead of guessing). `capture_intent` reuses `captureEntry` whole (`assistant/actions.ts:209-225`); `memory_intent` writes nothing (`routing.ts:34-36`) |
| Declared intents | — | `ASSISTANT_COMPOSER_INTENTS = ["ask"]` only (`assistant/composer-state.ts:74`) — there is no UI toggle for "register"; registering from chat depends on the user typing an opener |

So the product has **three input surfaces** (home capture, capture page, chat), two composers, and an opener-list heuristic deciding whether a chat line becomes a record. The closeout's "one composer that routes commands and falls through to knowledge answers" (`PRODUCT_UX_CLOSEOUT.md:133`) describes the chat page only; the home/capture `Composer` is a separate implementation with separate CSS (`assistant.css` 39 `composer` rules, `experience.css` 21).

---

## 7. What could not be determined
- Whether the Papel e Console branch merged in full or was partially cherry-picked: STATE's last entries say "not merged" (`STATE.md:128-132`) yet `tokens.css`/Plex fonts are on `main`; no merge SHA was located in the lines grepped.
- Rendered appearance: nothing was launched or screenshotted; all visual claims are inferred from CSS/token values.
- The base rule for `.eyebrow` was not isolated by grep outside minified lines; only its per-page overrides were (`agent.css:5`, `assistant.css:166`, `costs.css:1`).

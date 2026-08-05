# My Brain — Design System Plan

**Status:** Proposed implementation contract; no implementation performed  
**Goal:** Scale the current visual identity into a durable, accessible productivity system without a visual reset  
**Related:** [`MY_BRAIN_PRODUCT_AUDIT.md`](./MY_BRAIN_PRODUCT_AUDIT.md), [`MY_BRAIN_UX_ROADMAP.md`](./MY_BRAIN_UX_ROADMAP.md)

## 1. Design direction

Preserve the parts that already feel like My Brain:

- editorial Newsreader moments;
- calm paper/ink surfaces;
- blue as intentional action/focus;
- restrained depth and motion;
- visible source, trust, and state language;
- generous capture surfaces.

The system should feel **quiet, precise, contextual, and fast**. It should not become a generic component-library dashboard, a glassmorphism showcase, or a dense enterprise table product.

### Experience principles

1. **Content before chrome.** Navigation and cards should recede after orientation.
2. **One dominant action per context.** Secondary actions use menus, shortcuts, or progressive disclosure.
3. **Density follows intent.** Capture and reflection can be spacious; Inbox and Work must be compact.
4. **Trust is visible.** Sources, confidence meaning, pending state, and undo are first-class components.
5. **The keyboard teaches itself.** Command results show shortcuts; every shortcut has a pointer equivalent.
6. **Empty is a meaningful state.** Do not fill whitespace with generic cards.

## 2. Current-system inventory

| Area | Current evidence | Risk |
| --- | --- | --- |
| Color | 9 root tokens; 164 hard-coded color occurrences. | Status/contrast drift and difficult theming. |
| Typography | Newsreader, Manrope, JetBrains Mono; 97 declarations at 12px or below. | Fatigue and accessibility failures. |
| Spacing | Many local pixel values with no documented scale. | Inconsistent density and responsive rhythm. |
| Radius | 16 distinct values plus pills/circles. | Components feel related but not systematic. |
| Shadow | 12 distinct shadows. | Depth has no semantic meaning. |
| CSS architecture | About 805 rule blocks across page/feature CSS files. | High regression and override risk. |
| Breakpoints | 600, 700, 760, 850, 900px. | Behavior drifts by feature. |
| Motion | 3 animations, 3 transitions, 2 keyframes; decorative motion uses no-preference. | State transitions are under-specified. |
| Focus | Global and component focus-visible treatments exist. | Style can vary; obscured focus needs testing. |
| Targets | Several 44px rules, but many explicit dimensions are below 44px. | Touch precision is inconsistent. |
| Contrast | Core ink/paper and blue/paper pass; some muted text pairs are 1.94–3.03:1. | Normal text fails WCAG AA. |

## 3. Foundation tokens

Token names describe semantic purpose, not a specific color or page.

### 3.1 Color

Keep the current palette as the brand seed, then map it to semantics.

```css
/* Proposed names and roles; values require visual/contrast validation before implementation. */
--color-bg-canvas;
--color-bg-surface;
--color-bg-subtle;
--color-bg-inverse;
--color-fg-primary;
--color-fg-secondary;
--color-fg-muted;
--color-fg-inverse;
--color-border-default;
--color-border-strong;
--color-action-primary;
--color-action-hover;
--color-focus-ring;
--color-status-info-fg;
--color-status-info-bg;
--color-status-success-fg;
--color-status-success-bg;
--color-status-warning-fg;
--color-status-warning-bg;
--color-status-danger-fg;
--color-status-danger-bg;
--color-status-neutral-fg;
--color-status-neutral-bg;
```

Rules:

- Normal text must meet 4.5:1; large text and essential iconography 3:1.
- `fg-muted` is still readable text, not placeholder decoration.
- Color never carries status alone; pair it with text/icon/shape.
- Raw domain states map to semantic tones through one typed presentation contract.
- Dark mode is not required for the first migration, but token choices must not prevent it.

### 3.2 Typography

| Token | Font | Desktop size / line | Mobile size / line | Use |
| --- | --- | --- | --- | --- |
| `display` | Newsreader | 64 / 0.98 | 42 / 1.0 | Home prompt only. |
| `title-1` | Newsreader | 42 / 1.05 | 34 / 1.08 | Page titles and major entity names. |
| `title-2` | Newsreader or Manrope | 28 / 1.15 | 24 / 1.2 | Reflection/detail sections. |
| `heading` | Manrope | 18 / 1.35 | 17 / 1.35 | Panel/list section heading. |
| `body` | Manrope | 15 / 1.6 | 15 / 1.55 | Default reading and form text. |
| `body-sm` | Manrope | 13 / 1.5 | 13 / 1.5 | Secondary descriptions. |
| `label` | Manrope | 13 / 1.25 | 13 / 1.25 | Buttons, inputs, navigation. |
| `caption` | Manrope | 12 / 1.4 | 12 / 1.4 | Timestamps and support text. |
| `micro` | JetBrains Mono | 11 / 1.35 | 11 / 1.35 | Eyebrows, sequence metadata; never critical content. |

Rules:

- No normal UI text below 12px; 11px is reserved for non-essential mono metadata.
- Avoid uppercase paragraphs; uppercase is limited to short eyebrows/status keys.
- Use tabular numerals for costs, times, and token counts.
- Line length: 45–75 characters for reading; dense lists can use truncation with accessible full text.
- Product copy must remain meaningful at 200% zoom and browser text enlargement.

### 3.3 Spacing

Use one 4px-derived scale:

| Token | Value | Typical use |
| --- | ---: | --- |
| `space-0` | 0 | Reset. |
| `space-1` | 4px | Icon/text micro gap. |
| `space-2` | 8px | Compact controls. |
| `space-3` | 12px | Field internals, row gaps. |
| `space-4` | 16px | Default component padding. |
| `space-5` | 20px | Comfortable rows/cards. |
| `space-6` | 24px | Section internal spacing. |
| `space-8` | 32px | Section separation. |
| `space-10` | 40px | Page/header separation. |
| `space-12` | 48px | Large page rhythm. |
| `space-16` | 64px | Editorial desktop space only. |

Content widths:

- `reading`: 720px for reviews, chat text, memory evidence.
- `productivity`: 960px for Work, Inbox, settings.
- `wide`: 1180px for Today and Costs.

### 3.4 Radius and elevation

| Token | Value | Use |
| --- | ---: | --- |
| `radius-sm` | 6px | Chips, compact controls. |
| `radius-md` | 10px | Buttons, inputs, list rows. |
| `radius-lg` | 14px | Panels, popovers. |
| `radius-xl` | 18px | Editorial cards, sheets. |
| `radius-full` | 999px | Pills/avatar/status dot only. |

| Elevation | Use |
| --- | --- |
| `0` | Default surface; border defines separation. |
| `1` | Sticky bars, hover/selected list row, compact popover. |
| `2` | Dialog, command palette, mobile sheet. |

Do not use shadow as decoration on every card. A surface should normally use either border or shadow, not both, unless the elevation requires both for contrast.

### 3.5 Motion

| Token | Duration | Use |
| --- | ---: | --- |
| `motion-fast` | 100ms | Hover/focus color, small icon. |
| `motion-standard` | 160ms | Row selection, disclosure, button state. |
| `motion-emphasis` | 220ms | Sheet/dialog/panel transition. |

Use `ease-out` for entering, `ease-in` for leaving, and a standard ease for state movement. Never animate routine actions longer than 250ms. Reduced motion removes transforms and preserves only necessary opacity/state changes.

### 3.6 Density

Support two intentional densities, not arbitrary per-page values:

- **Comfortable:** 52–60px list rows; capture, settings, reviews, entity detail.
- **Compact:** 40–48px list rows; Inbox, Work, search results, history, costs detail.

Compact mode must preserve 44px touch actions on coarse pointers and may reduce only whitespace on fine pointers.

## 4. Component contract

### 4.1 Core primitives

| Component | Variants | Mandatory states |
| --- | --- | --- |
| `Button` | primary, secondary, quiet, danger, link | default, hover, focus, pressed, disabled, pending. |
| `IconButton` | default, quiet, danger | Accessible name, 44px touch target, tooltip on hover/focus. |
| `Input`, `Textarea`, `Select` | default, compact | label, description, placeholder, focus, invalid, disabled, read-only, pending. |
| `Checkbox`, `Radio`, `Switch` | default, card | checked, indeterminate, invalid, disabled, focus. |
| `Badge` | neutral, info, success, warning, danger | Text required; maps from presentation state. |
| `Tag` | static, removable, interactive | Clear semantic distinction from status badge. |
| `Surface` | canvas, panel, raised, inverse | Central radius/border/elevation only. |
| `Divider` | horizontal, vertical | Decorative semantics by default. |
| `Avatar/EntityIcon` | person, project, file, memory | Deterministic fallback and accessible labeling where meaningful. |

### 4.2 Productivity composites

| Component | Responsibility |
| --- | --- |
| `PageHeader` | Eyebrow, title, description, primary action, optional secondary utilities. |
| `ListToolbar` | Search/filter/sort/view/density/selection count. |
| `ListRow` | Focus, selection, primary text, secondary metadata, actions, pending, context menu. |
| `Tabs` | URL-backed view switching with counts and overflow behavior. |
| `CommandPalette` | Search, navigation, actions, recents, shortcut hints, empty/error/loading states. |
| `PeekPanel` | Context preview with full-route escape; dialog/sheet semantics by viewport. |
| `Pagination` | Previous/next, page position, result context, focus restoration. Cursor/load-more variant where appropriate. |
| `DataTable` | Sortable headers, row labels, responsive summary alternative, scroll affordance. |
| `Disclosure` | Technical details, advanced settings, source evidence; keyboard and state persistence. |
| `ActionBar` | Contextual primary action, multi-select actions, undo entry. |

### 4.3 Trust and AI composites

| Component | Responsibility |
| --- | --- |
| `SourceCitation` | Source type, title/excerpt, date, open action, unavailable state. |
| `ConfidenceSignal` | Human label plus explanation/evidence; never percentage alone. |
| `BrainState` | Saved, Organizing, Needs you, Ready, Could not organize. |
| `InterpretationCard` | Understanding, editable facts, change history, provenance. |
| `AttentionNotice` | One explicit decision, explanation, safety note, primary action. |
| `UndoToast/Bar` | Action result, time-bounded undo, terminal outcome. |
| `ProcessingTimeline` | Saved → queued → processing → ready/attention/failure, without exposing internals. |
| `CostDisclosure` | Model/function/cost explanation with priced/unpriced uncertainty. |

### 4.4 State components

| Component | Contract |
| --- | --- |
| `EmptyState` | Tone, title, explanation, one primary CTA, optional example and secondary source link. |
| `Skeleton` | Mirrors stable layout; no false controls/data; reduced motion friendly. |
| `InlineFeedback` | Polite success/status; alert for blocking failure; preserves layout when useful. |
| `Notice` | info/success/warning/danger with title, body, action, dismiss policy. |
| `ErrorState` | What failed, safety implication, retry, alternative path, optional support reference. |
| `OfflineState` | States what remains local, what is not stored, and how to continue safely. |

## 5. Page templates

### Today

- Editorial compact header and universal capture.
- One-column attention sequence on mobile.
- Two-column desktop only when priority remains clear.
- Secondary panels disappear when empty rather than preserving decorative card slots.

### Inbox / Work

- Productivity width and compact density.
- Sticky `PageHeader`/toolbar on tall lists.
- URL-backed tabs and filters.
- Roving row focus, peek/detail, direct actions, selection.
- Empty state remains within the list region, not a 330px generic card by default.

### Context library

- Search first; type filters for Projects, People, Memories, Files, Reviews.
- Consistent result row with type, title, excerpt, source/time, relationships.
- Type-specific detail can retain tailored layouts.

### Entity detail

- Header: identity, state, aliases, primary contextual action.
- Overview facts; active work; relationships; memories/evidence; timeline.
- Hide empty secondary sections only when a discoverable “add/connect” action remains.
- Use linked source previews instead of raw unbounded original text in lists.

### Settings / Transparency

- Section navigation on desktop; stacked sections on mobile.
- Sticky save bar only when dirty.
- Technical controls under explicit Advanced disclosure.
- Costs/history use summaries first and details on demand.

## 6. Responsive system

Replace feature-specific breakpoints with named content breakpoints:

| Token | Suggested boundary | Behavior |
| --- | ---: | --- |
| `compact` | up to 599px | One column, bottom shell, sheets, full-width forms. |
| `medium` | 600–899px | One/two column by content, compact rail or mobile shell based on available width. |
| `wide` | 900–1199px | Desktop rail, productivity width, selective two-column content. |
| `xwide` | 1200px+ | Max-width content; whitespace grows, not type indefinitely. |

Implementation should prefer container queries for reusable panels/list toolbars and media queries for the global shell.

Required viewport verification:

- 320×568, 360×800, 390×844;
- 768×1024 portrait and 1024×768 landscape;
- 1280×720, 1440×900, 1920×1080;
- 200% browser zoom and text enlargement;
- virtual keyboard open on capture/chat/reminder forms;
- coarse and fine pointers;
- reduced motion, increased contrast/forced colors where supported.

## 7. Accessibility contract

- WCAG 2.2 AA is the minimum for core flows.
- Set `<html lang>` from the locale route.
- One page-level `h1`; section hierarchy must not skip because of visual size.
- Use landmarks and label repeated navigation/filter regions.
- All icon-only controls have an accessible name and tooltip.
- Status updates use polite live regions; blocking errors use alerts without duplicate announcements.
- Focus is visible, not obscured by sticky bars, and returns after dialog/sheet/action completion.
- Roving focus in lists must not remove ordinary Tab access to actions.
- Touch targets are 44×44px minimum unless inline text links have adequate spacing.
- Tables expose headers/captions and have a non-table mobile representation when horizontal scanning is impractical.
- Never use placeholder text as the only label.
- Source/confidence/status meaning does not depend on color.
- Destructive actions distinguish archive, stop using, and permanent delete.

## 8. Content and localization rules

- Name user intent, not infrastructure: “AI routing” may be Advanced; “consumer verificável” is not product copy.
- Use “Ask Brain”/“Fale com o Brain” for the conversational action if that naming is approved; reserve “My Brain” for the product.
- Use one localized label per domain state through a typed presentation map.
- Sentence case for controls and headings; uppercase only short eyebrows.
- Error copy states what is safe, what failed, and the next action.
- Empty copy does not guilt the user or manufacture urgency.
- Confidence copy explains evidence: Confirmed by you, Strong evidence, Tentative, Conflicting.
- Model IDs and token detail appear only in advanced/transparency contexts.

## 9. Migration plan

### Stage 1 — Audit and freeze

- Inventory every current selector, color, type size, radius, shadow, and interaction state.
- Mark the current screenshot set and core routes as visual-regression baselines.
- Approve semantic tokens and component API before migration.

### Stage 2 — Foundations

- Introduce semantic color/type/space/radius/elevation/motion tokens mapped to current visual values where safe.
- Correct failing contrast and minimum type sizes.
- Add primitive Button/Input/Badge/Surface/Feedback without changing page layouts.

### Stage 3 — Productivity primitives

- Build PageHeader, EmptyState, Skeleton, ListRow, Tabs, Toolbar, Pagination, and ActionBar.
- Migrate Work and Inbox first because they validate density, keyboard, pending, error, and mobile behavior.

### Stage 4 — Trust components

- Migrate capture receipt, Brain state, source citation, confidence, attention notice, processing timeline, and undo.
- Apply to entry review, memories, files, and Brain conversations.

### Stage 5 — Shell and long-tail pages

- Implement command/search and the converged navigation.
- Migrate Projects, People, Reviews, Notifications, Reminders, Settings, Costs, and History.
- Remove superseded selectors only after visual/interaction parity is proven.

## 10. Implementation recommendations

### DS-01 — Semantic color migration

- **Problem:** Hard-coded colors outnumber the current root token set and some muted text fails contrast.
- **Why it matters:** Status and accessibility drift with every feature.
- **Suggested solution:** Introduce semantic foreground/background/border/action/status tokens; map current colors, repair contrast, and prohibit new raw colors outside token definitions.
- **Expected user benefit:** Consistent, readable states and future theme flexibility.
- **Estimated implementation effort:** M.
- **Dependencies:** Visual approval, contrast tests, status presentation map.
- **Priority:** Important.
- **Acceptance criteria:** Core flows meet contrast; no new hard-coded application color; status meaning is not color-only.

### DS-02 — Type and density normalization

- **Problem:** Ninety-seven declarations are 12px or smaller and density varies by page.
- **Why it matters:** Tiny text and inconsistent rows cause fatigue during long sessions.
- **Suggested solution:** Adopt the type scale and comfortable/compact density modes; migrate Inbox/Work first.
- **Expected user benefit:** Faster scanning and better zoom/accessibility.
- **Estimated implementation effort:** M.
- **Dependencies:** Token foundation and visual regression.
- **Priority:** Important.
- **Acceptance criteria:** No normal text under 12px; critical metadata at least caption size; compact rows retain 44px touch actions.

### DS-03 — Shared action and form primitives

- **Problem:** Buttons, inputs, pending feedback, and errors are implemented through page-specific selectors.
- **Why it matters:** Repeated actions behave differently and regress independently.
- **Suggested solution:** Build typed Button/IconButton/Input/Textarea/Select/Feedback primitives with all interaction states.
- **Expected user benefit:** Predictable controls and reliable feedback.
- **Estimated implementation effort:** M.
- **Dependencies:** DS-01/02 and form accessibility contract.
- **Priority:** Critical.
- **Acceptance criteria:** Pending prevents duplicates; accessible labels/descriptions/errors are connected; touch/focus states pass on all inputs.

### DS-04 — List interaction system

- **Problem:** Lists share visual styling but lack a common focus, selection, action, and responsive contract.
- **Why it matters:** Inbox and Work throughput depends on repeated list behavior.
- **Suggested solution:** Build ListRow, ListToolbar, selection state, contextual actions, and compact mobile metadata layout.
- **Expected user benefit:** Muscle memory across all collections.
- **Estimated implementation effort:** L.
- **Dependencies:** DS-03 and roadmap C-02/I-03.
- **Priority:** Critical.
- **Acceptance criteria:** Same keyboard/mouse/touch rules across Work, Inbox, search, notifications, and history; focus survives updates/pagination.

### DS-05 — Empty/loading/error family

- **Problem:** Empty states are visually shared but semantically generic; loading states are absent.
- **Why it matters:** First-use and failure moments shape trust.
- **Suggested solution:** Build EmptyState, Skeleton, Notice, ErrorState, and OfflineState with constrained content slots.
- **Expected user benefit:** Clear next steps and lower uncertainty.
- **Estimated implementation effort:** M.
- **Dependencies:** Error taxonomy and route state inventory.
- **Priority:** Critical.
- **Acceptance criteria:** Every route state is covered without fake data; retry preserves input; “all clear” differs from “not configured” and “failed.”

### DS-06 — Trust component family

- **Problem:** Confidence, sources, organizing, attention, and undo are valuable but not consistently represented across features.
- **Why it matters:** Trust is the product's main differentiator.
- **Suggested solution:** Standardize SourceCitation, ConfidenceSignal, BrainState, ProcessingTimeline, AttentionNotice, and UndoBar.
- **Expected user benefit:** The Brain's behavior becomes understandable everywhere.
- **Estimated implementation effort:** L.
- **Dependencies:** Product presentation vocabulary and provenance contracts.
- **Priority:** Important.
- **Acceptance criteria:** Confidence always has meaning/evidence; source links handle missing/expired states; undo shows eligibility and outcome.

### DS-07 — Command, popover, dialog, and sheet layer

- **Problem:** Deep actions need progressive disclosure, but no shared overlay/focus layer exists.
- **Why it matters:** Command search, contextual actions, editing, and mobile flows depend on robust overlays.
- **Suggested solution:** Implement accessible overlay primitives with desktop popover/dialog and mobile sheet adaptations.
- **Expected user benefit:** Powerful actions without permanent visual clutter.
- **Estimated implementation effort:** L.
- **Dependencies:** DS-03, focus-management strategy, C-01/C-06.
- **Priority:** Critical.
- **Acceptance criteria:** Focus trap/return, Escape, click outside policy, scroll lock, safe areas, virtual keyboard, and nested-overlay rules are tested.

### DS-08 — Responsive contract consolidation

- **Problem:** Five feature-specific width breakpoints create inconsistent collapse behavior.
- **Why it matters:** New components cannot predict their layout context.
- **Suggested solution:** Adopt named shell breakpoints plus container queries for reusable components; verify the required viewport matrix.
- **Expected user benefit:** Stable layouts across phone, tablet, laptop, and zoom.
- **Estimated implementation effort:** M–L.
- **Dependencies:** Component migration and visual testing.
- **Priority:** Important.
- **Acceptance criteria:** No horizontal loss at 320px/200% zoom; component behavior is documented once; tables have mobile summaries.

### DS-09 — Localization and presentation contract

- **Problem:** Raw enums and fixed document language leak implementation details.
- **Why it matters:** Mixed vocabulary harms comprehension and assistive pronunciation.
- **Suggested solution:** Centralize typed bilingual labels/tones/descriptions and derive document language from route locale.
- **Expected user benefit:** Consistent product language and accessibility.
- **Estimated implementation effort:** M.
- **Dependencies:** Domain-state inventory.
- **Priority:** Important.
- **Acceptance criteria:** No raw enum in UI; unknown fallback is localized; both locales have component and E2E coverage.

### DS-10 — Visual regression and accessibility gates

- **Problem:** A large CSS surface can drift during incremental migration.
- **Why it matters:** Design-system work can create broad subtle regressions.
- **Suggested solution:** Add screenshot baselines for core populated/empty/loading/error routes at desktop/mobile plus automated accessibility checks and manual keyboard/zoom gates.
- **Expected user benefit:** Consistent quality while the product evolves.
- **Estimated implementation effort:** M initial, S per later slice.
- **Dependencies:** Stable fixtures that contain synthetic non-sensitive data.
- **Priority:** Important.
- **Acceptance criteria:** Today, Inbox, entry review, Work, Memories, Files, Ask Brain, and Settings have deterministic states; diffs are reviewed; accessibility failures block completion.

## 11. Design-system completion gate

The design system is not complete when every selector has moved. It is complete when:

- core routes use the same interaction language;
- daily work is faster in usability tests;
- the current distinctive editorial identity remains recognizable;
- accessibility gates pass;
- new features can be built without inventing colors, text sizes, radii, loading states, or list behavior;
- old page CSS can be removed safely with no product regression.


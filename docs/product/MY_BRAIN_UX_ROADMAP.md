# My Brain — UX Implementation Roadmap

**Purpose:** Prioritized, implementation-ready plan derived from the 2026-07-21 product audit.  
**Constraint:** This document does not authorize implementation by itself and makes no code changes.  
**Related:** [`MY_BRAIN_PRODUCT_AUDIT.md`](./MY_BRAIN_PRODUCT_AUDIT.md), [`MY_BRAIN_DESIGN_SYSTEM_PLAN.md`](./MY_BRAIN_DESIGN_SYSTEM_PLAN.md)

## 1. Product outcome

Build a daily-use personal contextual agent in which a user can:

- capture anything in seconds;
- see a finite queue of decisions and work;
- retrieve any relevant context without remembering its location;
- understand what the Brain believes and why;
- correct or undo actions safely;
- operate efficiently by keyboard, mouse, or touch.

## 2. Sequencing principles

1. **Converge before expanding.** Do not add another top-level page until search, command access, and the daily loop are stable.
2. **Preserve current architecture.** Use existing projections, server boundaries, RLS, audit, and undo.
3. **Finish the task contract first.** Current Phase 2C task/candidate work must settle before building richer Work manipulation.
4. **Ship vertical UX slices.** Each slice includes populated, empty, loading, error, mobile, keyboard, localization, and analytics states.
5. **Measure behavior, not vanity.** Use the private allowlisted product-event system; never record personal content.
6. **Keep old URLs working.** IA changes should redirect or alias existing routes.

## 3. Effort scale

| Estimate | Expected scope |
| --- | --- |
| XS | Less than 2 engineering days; isolated copy or styling contract. |
| S | 2–5 days; one contained component/surface. |
| M | 1–2 weeks; cross-component frontend slice with tests. |
| L | 2–4 weeks; multiple surfaces and/or a backend projection. |
| XL | 4–8+ weeks; new cross-domain capability delivered in phases. |

## 4. Critical — must be solved before dependable daily use

### C-01 — Global command palette and navigation search

- **Problem:** Users must remember and traverse routes; no global command or search entry exists.
- **Why it matters:** Retrieval cost grows directly with the value accumulated in the Brain.
- **Suggested solution:** Phase 1: `Cmd/Ctrl K` command palette for navigation, recent items, and available actions. Phase 2: keyword search over permitted item projections. Phase 3: semantic/hybrid retrieval with type/date/source filters. Include `/`, `?`, and `G then …` discovery.
- **Expected user benefit:** Near-instant navigation, action discovery, and recall.
- **Estimated implementation effort:** XL overall; M for command/navigation MVP.
- **Dependencies:** Search projection/API, RLS-safe result union, ranking contract, command registry, recent-item storage, design-system Command component.
- **Priority:** Critical.
- **Acceptance criteria:** Opens from every authenticated route; does not trigger inside editors; supports keyboard-only use; returns navigation and recent results under 100ms client-perceived after data arrives; result types are labeled; no cross-owner data; mobile has a touch entry; empty/error/offline states exist.
- **Success signal:** Median route-to-item time; command adoption; search reformulation rate; zero-result rate.

### C-02 — Work interaction foundation

- **Problem:** Tasks cannot be opened or edited, and every repeated action requires a small row form.
- **Why it matters:** The product cannot sustain an 8-hour workday if its execution surface is slower than a basic task manager.
- **Suggested solution:** Introduce a task detail/edit sheet, row focus, direct complete/wait/resume/reopen actions with pending state, contextual menu, selection, and undo. Add bulk status/project/priority/date actions only after single-item behavior is stable.
- **Expected user benefit:** Fast execution with fewer clicks and clearer feedback.
- **Estimated implementation effort:** L.
- **Dependencies:** Stable Phase 2C task fields and operations; optimistic/pessimistic update decision; undo eligibility; shared list-selection contract.
- **Priority:** Critical.
- **Acceptance criteria:** Every task can be opened and edited; all mutations show pending/success/error; actions are usable by keyboard and touch; focus returns predictably; stale conflicts preserve edits; bulk actions are owner-scoped and auditable; mobile targets are at least 44px.
- **Success signal:** Actions per session, median task-complete latency, repeated-click rate, action failure recovery.

### C-03 — Loading, failure, and asynchronous-state system

- **Problem:** There are no route-level loading states and only one broad authenticated error boundary.
- **Why it matters:** Server data and AI processing can appear frozen, especially on mobile or poor networks.
- **Suggested solution:** Define page skeletons that preserve final layout, section-level retry boundaries, row-action pending feedback, background organizing/progress states, stale-data messages, and a shared failure taxonomy.
- **Expected user benefit:** Better perceived speed, confidence, and recoverability.
- **Estimated implementation effort:** M–L.
- **Dependencies:** Design-system Skeleton/Feedback/Notice components; error-code mapping; route segmentation decisions.
- **Priority:** Critical.
- **Acceptance criteria:** Every data route has loading, empty, populated, recoverable error, and terminal error coverage; skeletons do not imitate data that cannot load; retries preserve user input; offline capture warning remains explicit; no raw internal error is shown.
- **Success signal:** Abandonment during loading, retry success rate, duplicate submissions, support incidents tagged “stuck.”

### C-04 — Daily information-architecture convergence

- **Problem:** Sixteen visible destinations and overlapping attention concepts make the product feel like a suite of modules.
- **Why it matters:** Users need a stable daily loop, not a sitemap.
- **Suggested solution:** Primary destinations become Today, Inbox, Work, and Ask Brain. Add a Library entry for context objects. Use Pinned/Recent as earned navigation. Move History, AI Costs, and utilities beneath Settings/command access. Preserve existing URLs.
- **Expected user benefit:** Faster orientation and less navigation anxiety.
- **Estimated implementation effort:** L including validation.
- **Dependencies:** C-01 command access, usage telemetry, naming decision, mobile shell update.
- **Priority:** Critical.
- **Acceptance criteria:** Four daily destinations are visible without overflow on desktop; mobile uses four destinations plus Capture; all existing routes remain reachable; active states work for aliases/details; task success rate does not fall in moderated tests.
- **Success signal:** Navigation backtracking, More-menu opens, time-to-primary-surface, route distribution.

### C-05 — Memory trust and maintenance lifecycle

- **Problem:** Memories are reusable AI context but expose only content, kind, confidence, and importance; users cannot inspect or correct provenance.
- **Why it matters:** A wrong durable memory can silently contaminate future answers and actions.
- **Suggested solution:** Add memory detail with source evidence, human-readable confidence, scope, relationships, history, and last-use signal. Support edit with provenance, archive/stop-using, permanent delete with impact warning, merge, supersede, and conflict resolution. Add category/filter/search.
- **Expected user benefit:** The user can govern what the Brain believes and safely scale a long-lived knowledge base.
- **Estimated implementation effort:** XL, split into inspect → edit/archive → conflict/merge.
- **Dependencies:** Provenance/history schema; memory-use audit; deletion/retention policy; C-01 search; entity relationships.
- **Priority:** Critical.
- **Acceptance criteria:** Every memory answers “where did this come from?”; confidence never appears as an unexplained percentage; edit does not erase source history; archive stops AI reuse; deletion states downstream impact; conflicts have an explicit resolution state; all actions are audited and owner-scoped.
- **Success signal:** Memory corrections, disputed-memory rate, source opens, AI-answer correction rate.

### C-06 — Mobile shell simplification

- **Problem:** Six bottom controls and a ten-destination popover are crowded and taxonomy-heavy.
- **Why it matters:** The product's most frequent capture and triage moments will occur on narrow screens.
- **Suggested solution:** Use Today, Inbox, Work, Library plus central Capture. Put Ask Brain in the header/command surface or validate it as a replacement through telemetry. Move profile/settings/notifications to a compact utility sheet. Respect safe areas and virtual keyboards.
- **Expected user benefit:** Accurate one-handed navigation and less visual obstruction.
- **Estimated implementation effort:** M.
- **Dependencies:** C-04 IA, C-01 mobile command/search, responsive primitives.
- **Priority:** Critical.
- **Acceptance criteria:** Works at 320px width, 200% zoom, landscape, and safe-area devices; no label is below the type minimum; every target is at least 44px; menus trap/restore focus; bottom navigation never covers focused form controls.
- **Success signal:** Mobile mis-taps, overflow opens, route completion, capture completion.

## 5. Important — should be solved before public beta

### I-01 — Guided first-use activation

- **Problem:** Registration leads into a product whose downstream model must be inferred from empty pages.
- **Why it matters:** The first capture is the best moment to teach trust, interpretation, Inbox, and Work.
- **Suggested solution:** Use a short in-product sequence: set timezone → capture a real thought → show preserved receipt → explain organizing → review the result. Allow skipping and never seed fake private content.
- **Expected user benefit:** Faster comprehension and a meaningful first success.
- **Estimated implementation effort:** M.
- **Dependencies:** Stable capture/review flow, empty-state component, activation telemetry.
- **Priority:** Important.
- **Acceptance criteria:** Can be completed with keyboard/touch; resumes safely; no forced sample data; explicitly explains original preservation and confirmation; completion state is private and resettable.
- **Success signal:** Registration-to-first-capture, first-capture-to-review, day-2 return.

### I-02 — Today as a compact daily cockpit

- **Problem:** Home gives equal weight to six panels, including empty or duplicate status areas.
- **Why it matters:** Daily attention should be finite and ordered.
- **Suggested solution:** Prioritize Capture → Needs you → Today/overdue → relevant time anchors. Hide empty secondary modules, collapse Recent context, and move organizing/saved status to the shell. Add direct task actions.
- **Expected user benefit:** The next useful action is visible without scanning a dashboard.
- **Estimated implementation effort:** M–L.
- **Dependencies:** C-02, C-03, C-04 and current daily-cycle projections.
- **Priority:** Important.
- **Acceptance criteria:** One primary action above the fold at common laptop/mobile heights; empty secondary sections do not reserve full cards; direct actions have undo; today definition matches Work exactly.
- **Success signal:** Today-to-action latency, scroll depth, home-to-work bounce.

### I-03 — High-throughput Inbox triage

- **Problem:** Inbox has useful filters but no row focus, selection, batch processing, or inline context preview.
- **Why it matters:** Needs you should be a finite decision queue, not a list of page transitions.
- **Suggested solution:** Add keyboard navigation, peek/side-panel review, primary-action shortcuts, multi-select for safe homogeneous actions, and filter counts. Keep risky decisions explicit and one-by-one.
- **Expected user benefit:** Faster Inbox zero with preserved judgment and trust.
- **Estimated implementation effort:** L.
- **Dependencies:** C-01, C-03, decision safety rules, entry-review slot refactor.
- **Priority:** Important.
- **Acceptance criteria:** J/K or arrows move focus; Enter/Space opens preview; Esc returns to the exact row; unsafe candidate confirmations cannot be bulk-applied; filter state persists in the URL.
- **Success signal:** Items resolved per minute, queue abandonment, reopen rate.

### I-04 — Contextual workspaces for Projects and People

- **Problem:** Entity pages display useful relationships but cannot maintain them.
- **Why it matters:** Extraction inevitably creates aliases, duplicates, and stale relationships.
- **Suggested solution:** Add edit/archive/merge, aliases, relationship roles, source evidence, contextual capture, timeline filters, task actions, and a consistent detail side panel.
- **Expected user benefit:** Projects and people become living context rather than read-only indexes.
- **Estimated implementation effort:** L–XL.
- **Dependencies:** Entity lifecycle contracts, C-05 provenance, C-01 search.
- **Priority:** Important.
- **Acceptance criteria:** Duplicate merge is reversible or safely confirmed; aliases improve future matching; timelines link to originals; empty sections explain how data appears; raw statuses are localized.
- **Success signal:** Entity merge rate, context opens from Work/Brain, duplicate creation.

### I-05 — Pending questions as an Inbox filter

- **Problem:** Questions duplicate attention work in a separate Reflection destination.
- **Why it matters:** Users should not inspect multiple queues to become clear.
- **Suggested solution:** Make questions a typed Inbox filter and surface the source record plus downstream effect. Keep `/questions` as a compatible alias or secondary saved view.
- **Expected user benefit:** One attention queue and better-informed answers.
- **Estimated implementation effort:** M.
- **Dependencies:** C-04 and attention projection changes.
- **Priority:** Important.
- **Acceptance criteria:** Every question links to its source and states what answering will unlock; answers can be edited until consumed; old route remains valid.
- **Success signal:** Question response time, abandoned questions, route switching.

### I-06 — File discovery and lifecycle

- **Problem:** Files have excellent privacy/retry semantics but weak retrieval and management.
- **Why it matters:** File value appears after accumulation, when lists and pagination are insufficient.
- **Suggested solution:** Add type/status/date filters, keyword search, preview modes, related entities, rename/archive/delete, and a compact processing timeline. Keep original and analysis visually distinct.
- **Expected user benefit:** Files become retrievable evidence instead of an upload log.
- **Estimated implementation effort:** L.
- **Dependencies:** C-01 search, storage deletion policy, analysis projection.
- **Priority:** Important.
- **Acceptance criteria:** Processing/failed/ready are filterable and localized; temporary URL expiry is communicated; deletion explains original/analysis impact; mobile never exposes an unusable table.
- **Success signal:** File re-open rate, search success, retry recovery.

### I-07 — Review workflow and cadence

- **Problem:** Four generation buttons do not explain scope or turn insights into follow-up.
- **Why it matters:** Reflection is valuable only if it changes future attention or preserves insight.
- **Suggested solution:** Add scope previews, “what is included,” compare-to-previous, pin/share-to-memory, and create follow-up actions. Scheduling should wait for reliable notification/review contracts.
- **Expected user benefit:** Reviews become a meaningful ritual rather than generated reports.
- **Estimated implementation effort:** M–L.
- **Dependencies:** Review projection, C-05 memories, C-02 tasks.
- **Priority:** Important.
- **Acceptance criteria:** No review runs without explicit scope; generation has pending/progress/error; output can cite sources; follow-up creation is confirmed and undoable.
- **Success signal:** Review completion, review-to-action, repeat cadence.

### I-08 — Accessibility and density pass

- **Problem:** Tiny metadata, low-contrast muted colors, inconsistent targets, long dense pages, and an incorrect fixed document language remain.
- **Why it matters:** These issues affect daily fatigue, zoom, mobile, and assistive technology.
- **Suggested solution:** Apply semantic contrast/type tokens, minimum sizes, language metadata, landmark/heading audit, table alternatives, 200% zoom testing, and optional compact density for lists.
- **Expected user benefit:** More comfortable all-day use and broader access.
- **Estimated implementation effort:** L across incremental slices.
- **Dependencies:** Design-system foundation.
- **Priority:** Important.
- **Acceptance criteria:** WCAG 2.2 AA for core flows; no normal text below 12px; 200% zoom without loss; correct `lang`; focus visible and never obscured; reduced-motion maintained.
- **Success signal:** Automated violations, keyboard completion, zoom defects.

### I-09 — Settings architecture and preference persistence

- **Problem:** Settings is one long operational form with technical copy and no profile/privacy/data structure.
- **Why it matters:** Settings should communicate control, not implementation details.
- **Suggested solution:** Split into Profile, Behavior, Notifications, Privacy & Data, and Advanced AI. Persist locale; add dirty-state protection; keep only real settings; link AI Costs/History from Data & AI.
- **Expected user benefit:** Safer changes and clearer control over the Brain.
- **Estimated implementation effort:** M.
- **Dependencies:** Capability registry, locale persistence contract, C-04.
- **Priority:** Important.
- **Acceptance criteria:** Every setting names its effect; technical “consumer” language is removed; unsaved navigation is handled; save errors preserve values; advanced AI remains collapsed by default.
- **Success signal:** Save failure/retry, settings abandonment, model-profile changes.

### I-10 — Attention utility convergence

- **Problem:** Notifications and reminders are isolated lists with incomplete action lifecycles.
- **Why it matters:** Time-sensitive signals should appear when relevant, not require routine checking.
- **Suggested solution:** Surface relevant reminders/notifications in Today and Inbox; add snooze, dismiss, mark-all-read, edit/cancel/repeat, and settings links. Keep history pages secondary.
- **Expected user benefit:** Fewer places to check and more controllable interruptions.
- **Estimated implementation effort:** L.
- **Dependencies:** Reminder/notification domain operations, quiet-hours policy, C-04.
- **Priority:** Important.
- **Acceptance criteria:** Every signal has a clear source and next action; quiet-hours behavior is visible; snooze/edit/cancel are audited; empty state remains intentionally quiet.
- **Success signal:** Notification opens, dismiss/snooze, missed reminders.

### I-11 — Human presentation vocabulary

- **Problem:** Raw status/kind/action strings and mixed language appear across routes.
- **Why it matters:** Internal vocabulary breaks polish and slows comprehension.
- **Suggested solution:** Create typed presentation mappings for all domain states, with consistent labels, tones, icons, descriptions, and locale behavior.
- **Expected user benefit:** Predictable language and status recognition.
- **Estimated implementation effort:** M.
- **Dependencies:** Design-system status tokens and domain-state inventory.
- **Priority:** Important.
- **Acceptance criteria:** No raw enum is rendered; the same state has one label/tone everywhere; unknown values use a safe localized fallback; tests cover both locales.
- **Success signal:** Localization defects and unknown-state telemetry.

### I-12 — Transparency center

- **Problem:** History, AI Costs, and Jobs are valuable but fragmented and technical.
- **Why it matters:** Trust information should be easy to inspect without dominating daily navigation.
- **Suggested solution:** Create Settings → Data & AI with History and Costs sections; keep Jobs reachable only from failures/advanced support. Add type/date/entity filters and linked source records.
- **Expected user benefit:** Cleaner navigation and stronger, contextual trust.
- **Estimated implementation effort:** M.
- **Dependencies:** C-04 and filtering projections.
- **Priority:** Important.
- **Acceptance criteria:** Current URLs remain valid; filters are shareable in URL; costs explain uncertainty; history actions link to entities; Jobs never appears as a normal empty destination.
- **Success signal:** Transparency opens from contextual links vs primary navigation.

## 6. Nice to have — can wait until after public-beta fundamentals

### N-01 — Pinned, favorite, and recent context

- **Problem:** Frequent projects/people/items require repeated Library navigation.
- **Why it matters:** A personal system should adapt to current focus.
- **Suggested solution:** Allow pinning and show recent items in the command palette/sidebar, with automatic decay and user control.
- **Expected user benefit:** Faster return to active context without permanent IA growth.
- **Estimated implementation effort:** M.
- **Dependencies:** C-01, C-04, recency storage.
- **Priority:** Nice to have.
- **Acceptance criteria:** Pins are owner-scoped, reorderable, and removable; recents can be cleared; no content is exposed in analytics.

### N-02 — Peek and side-panel context

- **Problem:** Opening related context causes route churn and lost list position.
- **Why it matters:** Review and triage benefit from staying in flow.
- **Suggested solution:** Add a responsive peek panel for entries, tasks, projects, people, memories, and sources; full route remains canonical.
- **Expected user benefit:** Faster comparison and less backtracking.
- **Estimated implementation effort:** L.
- **Dependencies:** C-01, I-03, shared detail contracts.
- **Priority:** Nice to have.
- **Acceptance criteria:** URL/history behavior is predictable; focus is trapped/restored; mobile uses a full-height sheet; deep links remain shareable.

### N-03 — Saved views and smart collections

- **Problem:** Fixed lists cannot match individual retrieval habits.
- **Why it matters:** Scaled personal context needs filters without more top-level pages.
- **Suggested solution:** Save filter combinations across Work and Library; allow optional pinning; provide a small curated starter set.
- **Expected user benefit:** Flexible organization without folder complexity.
- **Estimated implementation effort:** L.
- **Dependencies:** C-01 search/filter grammar, N-01 pins.
- **Priority:** Nice to have.
- **Acceptance criteria:** Saved views store no unauthorized content, are editable/deletable, and degrade safely when fields change.

### N-04 — Interaction polish and continuity

- **Problem:** Current motion is mostly page-entry rise; state changes lack continuity.
- **Why it matters:** Subtle continuity improves confidence when items move between queues.
- **Suggested solution:** Animate state transitions, undo bars, row removal, and panel expansion with restrained tokens; maintain reduced-motion alternatives.
- **Expected user benefit:** Clearer causality and a more refined feel.
- **Estimated implementation effort:** S–M after primitives exist.
- **Dependencies:** Design-system motion tokens, C-02/C-03.
- **Priority:** Nice to have.
- **Acceptance criteria:** Motion communicates state, lasts under 250ms for routine actions, never blocks input, and is removed/reduced when requested.

### N-05 — Capture presets and contextual capture

- **Problem:** One free-text field is flexible but does not accelerate repeated capture types.
- **Why it matters:** Power users repeat meeting, decision, person, and follow-up patterns.
- **Suggested solution:** Offer optional presets in command capture and contextual “capture for this project/person” actions; keep natural language as default.
- **Expected user benefit:** Faster structured capture without turning the product into a form builder.
- **Estimated implementation effort:** M.
- **Dependencies:** Stable extraction schema, C-01, I-04.
- **Priority:** Nice to have.
- **Acceptance criteria:** Presets are optional, preserve original text, and never bypass confirmation rules.

## 7. Future vision — versions 2.0+

### F-01 — Proactive daily briefing

- **Problem:** Users must assemble the day from several signals.
- **Why it matters:** The product vision includes an attentive agent, not only passive storage.
- **Suggested solution:** Generate a private, source-linked briefing with priorities, people to follow up with, risks, and unresolved decisions; require explicit controls for cadence and silence.
- **Expected user benefit:** A trusted start-of-day orientation.
- **Estimated implementation effort:** XL.
- **Dependencies:** Mature Today/Inbox, notification controls, review quality, provenance.
- **Priority:** Future vision.
- **Acceptance criteria:** Every claim cites a source; no automatic task mutation; user can tune/disable; evaluation covers omission, overreach, and stale context.

### F-02 — Conflict-aware semantic memory graph

- **Problem:** Independent memories and entity links do not expose contradictions or temporal change.
- **Why it matters:** Long-lived personal context is time-dependent and occasionally inconsistent.
- **Suggested solution:** Model supersession, temporal validity, contradictory evidence, related-memory clusters, and explainable graph exploration.
- **Expected user benefit:** More reliable recall and fewer stale assumptions.
- **Estimated implementation effort:** XL+.
- **Dependencies:** C-05, robust provenance, semantic retrieval evaluations.
- **Priority:** Future vision.
- **Acceptance criteria:** Conflicts are surfaced, never silently auto-resolved; graph views have list alternatives; AI reuse respects active/temporal state.

### F-03 — Capture from anywhere

- **Problem:** Web-app capture requires switching context.
- **Why it matters:** Capture quality depends on low interruption cost.
- **Suggested solution:** PWA share target, browser extension, system shortcut, email/voice channels, and mobile share sheet, all using the same immutable capture receipt.
- **Expected user benefit:** Thoughts and evidence reach the Brain without breaking flow.
- **Estimated implementation effort:** XL per channel portfolio.
- **Dependencies:** Stable public capture boundary, abuse/rate limits, source labeling, offline policy.
- **Priority:** Future vision.
- **Acceptance criteria:** Every channel preserves provenance, idempotency, privacy, and the same review contract.

### F-04 — Adaptive autonomy with explicit trust levels

- **Problem:** Confirmation is safe but may become repetitive for well-understood low-risk patterns.
- **Why it matters:** Long-term value comes from earned automation, not permanent manual review.
- **Suggested solution:** Let users grant bounded autonomy by action type, source, confidence/evidence, and scope; show why an action qualified and provide undo.
- **Expected user benefit:** Less repetitive work without surrendering control.
- **Estimated implementation effort:** XL+.
- **Dependencies:** Mature trust policy, audit/undo, product event evidence, safety evaluations.
- **Priority:** Future vision.
- **Acceptance criteria:** Default remains confirmation; autonomy is explicit, revocable, and scoped; sensitive actions are never auto-enabled; failures trigger safe fallback.

### F-05 — Cross-context synthesis workspaces

- **Problem:** Reviews and Brain conversations are isolated outputs.
- **Why it matters:** Complex decisions require a temporary workspace combining records, people, projects, files, and questions.
- **Suggested solution:** Create ephemeral, source-linked synthesis canvases that can produce a decision, review, plan, or curated memory without duplicating source data.
- **Expected user benefit:** Deep thinking with traceable context.
- **Estimated implementation effort:** XL.
- **Dependencies:** Search, backlinks, memory lifecycle, file discovery, grounded generation.
- **Priority:** Future vision.
- **Acceptance criteria:** Sources remain canonical; outputs show citations and freshness; publishing to memory/task requires confirmation.

## 8. Recommended delivery waves

| Wave | Scope | Exit condition |
| --- | --- | --- |
| 0 — Contract alignment | Stabilize current Phase 2C task model; instrument baseline metrics; approve IA vocabulary. | No UX plan relies on a moving task contract; baseline captured without content telemetry. |
| 1 — Daily-use floor | C-02, C-03, first design-system primitives, I-11. | Work and Inbox can be used repeatedly with feedback, keyboard basics, and accessible states. |
| 2 — Find and go | C-01 command/navigation MVP, C-04, C-06. | Users can reach any core surface/item quickly on desktop and mobile. |
| 3 — Trust at scale | C-05 inspect/edit/archive, I-03, I-04. | Attention and durable context remain governable as data grows. |
| 4 — Public beta polish | I-01, I-02, I-05 through I-12, accessibility gate. | First-use, daily loop, utilities, and transparency meet beta acceptance. |
| 5 — Personalization | N-series capabilities, search enrichment, saved views. | Power-user speed improves without IA expansion. |

## 9. Definition of done for every UX slice

- Problem and target user outcome are stated.
- Desktop, mobile, keyboard, touch, 200% zoom, and reduced-motion behavior are defined.
- Empty, loading, success, validation, stale, recoverable error, terminal error, and offline states are covered where relevant.
- Portuguese and English copy use the shared presentation vocabulary.
- Focus order, focus return, accessible name, announcement behavior, and target size are verified.
- No personal content enters analytics; allowed events use bounded properties.
- Existing URLs and server/domain trust boundaries remain intact.
- Component, integration, and E2E evidence covers the changed workflow.
- Permanent documentation is updated only when the implementation is actually complete.


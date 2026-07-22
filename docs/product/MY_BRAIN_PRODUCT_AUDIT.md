# My Brain — Product UX/UI Audit

**Audit date:** 2026-07-21  
**Scope:** Current checkout at `D:\Projetos\GitHub\my-brain`  
**Mode:** Read-only product and interface audit; no implementation, code changes, branch, or commit  
**Companion documents:** [`MY_BRAIN_UX_ROADMAP.md`](./MY_BRAIN_UX_ROADMAP.md) and [`MY_BRAIN_DESIGN_SYSTEM_PLAN.md`](./MY_BRAIN_DESIGN_SYSTEM_PLAN.md)

## 1. Executive verdict

My Brain already has a credible product idea, not merely a CRUD shell. Its strongest promise is:

> Capture naturally; preserve the original; let the Brain organize it; ask before acting; keep the result explainable and reversible.

That promise is visible in capture, the Inbox review flow, candidate confirmation, confidence signals, internal citations, audit history, and undo. These are meaningful differentiators. The product is already stronger than many personal knowledge tools at **trustworthy interpretation** and stronger than many task tools at **preserving the source behind an action**.

The interface does not yet make that advantage feel like one coherent daily instrument. It currently exposes sixteen visible destinations, several implementation-facing concepts, many equally weighted cards, and a large number of list pages that behave as isolated collections. Search, command access, direct manipulation, bulk processing, robust loading states, and a durable memory lifecycle are missing. Those gaps will become more painful as content accumulates.

The correct direction is not a visual reset. It is product convergence:

1. Make **Today/Home, Inbox, Work, and Ask Brain** the daily loop.
2. Make capture and retrieval available from anywhere.
3. Treat Projects, People, Memories, Files, and Reviews as connected context, not separate CRUD modules.
4. Move transparency and advanced operations out of the primary information architecture without hiding them.
5. Build a compact, keyboard-capable interaction layer before adding more top-level destinations.

### Overall assessment

| Dimension | Score | Assessment |
| --- | ---: | --- |
| Product clarity | 3/4 | The underlying promise is distinctive; several route labels and generic list screens dilute it. |
| Information architecture | 2/4 | Logical groups exist, but the number of destinations and overlapping concepts increase navigation cost. |
| Daily-use productivity | 2/4 | Capture is strong; retrieval, editing, triage, selection, and keyboard throughput are not. |
| Trust and explainability | 4/4 | Original preservation, confidence, corrections, citations, audit, and undo are unusually strong. |
| Empty and recovery states | 2/4 | Copy is generally calm and honest; first-use teaching, loading, and next-step affordances are inconsistent. |
| Visual system | 3/4 | Editorial typography and restrained palette are memorable; foundations are not tokenized enough to scale. |
| Mobile | 2/4 | Core layouts collapse and targets are considered; the bottom navigation and dense forms will not scale. |
| Accessibility | 2/4 | Focus, semantics, live feedback, and reduced-motion care are present; contrast, text size, language, and global state coverage need work. |

## 2. Evidence and methodology

The audit reconciled the requested product documents with the current implementation. The source-of-truth order used was current code, current database contracts/migrations where relevant to UX, then permanent documentation.

Reviewed sources included:

- `CLAUDE.md`, `README.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/PHASE_2_PLAN.md`, the Phase 2C/2X PRDs and reports, `docs/STATE.md`, `docs/DECISIONS.md`, `docs/TODO.md`, and engineering standards.
- All `page.tsx`, layouts, the authenticated error boundary, redirects, route-level forms, and detail routes under `src/app`.
- The application shell, capability registry, navigation, home projection, daily-cycle projections, capture, entry review, candidate editor, task list, settings, file, cost, and operational components.
- All application CSS files and their responsive rules at 600, 700, 760, 850, and 900 pixels.
- Stored desktop and mobile home screenshots in `docs/screenshots/`.
- Component/E2E coverage relevant to navigation, responsive behavior, candidate editing, and daily-cycle flows.

The checkout contains ongoing uncommitted Phase 2C work. This audit inspected those current files but does not treat an uncommitted behavior as shipped or stable. No test user was created and no hosted data was mutated merely to generate screenshots. Authenticated routes were therefore evaluated from their complete source/render paths, component tests, and stored visual evidence.

## 3. Product vision

### What the product communicates well

- Capture copy is excellent: “write naturally,” “the original is preserved,” and “nothing becomes a task without confirmation.”
- “Needs your attention” is a human-centered state, unlike a technical processing queue.
- Corrections and undo communicate that the AI is fallible and the user remains authoritative.
- Projects and People can emerge from captured context rather than requiring manual filing first.
- Brain conversations cite internal sources, turning chat into grounded retrieval rather than a blank chatbot.
- AI costs and history make invisible automation inspectable.

### What still feels generic

- Projects, People, Memories, Reminders, History, Notifications, and Jobs are mostly title + creation form + list + pagination.
- Status badges often expose raw domain values instead of a coherent human vocabulary.
- The same large empty container pattern appears on many pages, regardless of the feature's purpose.
- Page navigation is route-centric rather than intent-centric: users choose a table-like destination before they can act.
- “Brain” names both the product intelligence and one chat destination, so its role is ambiguous.

### What is memorable

- Editorial Newsreader headlines paired with Manrope and JetBrains Mono.
- The calm ink/paper/blue palette.
- The capture-first hero.
- The trust sequence: original → interpretation → attention → confirmation → undo.
- “The Brain stays quiet when there is nothing useful” is a strong product posture.

## 4. Target mental model

The product needs three clearly different layers.

| Layer | User question | Product surfaces | Rule |
| --- | --- | --- | --- |
| Attention | “What needs me now?” | Today/Home, Inbox/Needs you, Work | Finite, prioritized, actionable. |
| Context | “What do I know about this?” | Projects, People, Memories, Files | Connected, searchable, source-aware. |
| Intelligence | “Help me understand or decide.” | Ask Brain, Reviews, contextual AI actions | Grounded in sources; never a parallel datastore. |

Inbox and Brain must not overlap:

- **Inbox** is a processing and trust queue: captured originals, organizing state, unresolved interpretations, and decisions that need confirmation.
- **Ask Brain** is a retrieval and synthesis surface: ask a question, inspect sources, continue a conversation, or invoke an action.
- **Memories** are durable assertions the system will reuse: curated, sourced, editable, conflict-aware, and discoverable.

## 5. Navigation and information architecture

### Current structure

- Desktop primary: Home, Inbox, Work, Brain.
- Global capture action.
- Context: Projects, People, Memories, Files.
- Reflection: Reviews, Pending questions.
- Organization: Reminders.
- Transparency: History, AI costs.
- Preferences: Settings.
- Notifications in the top bar; Jobs is intentionally context-only.
- Mobile renders Home, Inbox, Capture, Work, Brain, and More; More contains ten destinations in a two-column popover.

The grouping is coherent on paper, but it optimizes taxonomy rather than frequency. A user must scan many nouns, while common actions — search, edit, complete, reschedule, relate, merge, delete — have no consistent global home.

### Recommended destination model

| Tier | Destinations | Notes |
| --- | --- | --- |
| Always visible | Today, Inbox, Work, Ask Brain | The daily loop. “Today” can use the current Home route. |
| Pinned/Recent | User-selected projects, people, memories, saved views | Appears only after use; not another mandatory group. |
| Library | Projects, People, Memories, Files, Reviews | One entry point with type filters and global search. |
| Utility | Notifications, Reminders | Reached contextually and through the command menu. |
| Settings / Transparency | Preferences, AI costs, History | Preserve full access without spending primary-nav attention. |
| Context-only | Jobs, technical details | Remain available from failures and advanced settings. |

## 6. Dashboard / Today

A dashboard should exist, but it should be a **daily cockpit**, not an analytics dashboard.

The current Home is directionally correct: dynamic greeting, capture, priorities, needs attention, waiting, questions, operational status, and recent activity. The problem is equal visual weight. Empty cards for Waiting and Questions compete with urgent work, while operational status repeats information already represented by Inbox/Needs you.

The target Today surface should contain, in this order:

1. Universal capture.
2. Needs you, shown only when non-empty.
3. Today/overdue work with direct completion and rescheduling.
4. Upcoming time anchors or reminders, when relevant.
5. Recent context, collapsed or secondary.
6. A subtle sync/organizing status in the shell, not a full dashboard card.

The current editorial hero is distinctive and should remain, but on an 8-hour workday it must compress after the first interaction or on smaller laptop heights.

## 7. Route-by-route audit

### Authenticated product routes

| Route | Current role and strengths | Friction / scalability risk | Empty, loading, and error assessment | Roadmap IDs |
| --- | --- | --- | --- | --- |
| `/app` | Strong capture-first daily overview; combines work, attention, and recent context. | Six equal panels, repeated status, and no direct manipulation make it more presentation than cockpit. | Several calm empty messages, but blank cards remain visible. No route loading skeleton. | C2, C3, I2 |
| `/app/capture` | Clear standalone quick capture; explains preservation and confirmation. | Duplicates Home capture and has no shortcut hint, templates, recent capture, or attachment entry. | Not applicable as a collection; offline and action errors are handled well. | C1, N3 |
| `/app/inbox` | Best-defined product surface: All vs Needs you, preserved originals, human state vocabulary. | No query/search, multi-select, batch triage, density control, or keyboard row navigation. | Both tabs explain the state; CTAs are text-only and do not focus/open capture. No loading skeleton. | C1, C3, I3 |
| `/app/inbox/[entryId]` | Excellent trust architecture: understanding, attention, next actions, original, corrections, technical details. | The page can become very long; technical and editing complexity competes with the primary decision. | Strong failure and record-only states; needs a staged skeleton and a clearer sticky decision area. | C3, I3, I8 |
| `/app/work` | Consolidates Today, All, Waiting; manual creation appears only where useful. | Task rows are not editable/openable and actions are tiny server forms without pending feedback or selection. | Empty copy varies by view and teaches intent; no direct CTA in Today/Waiting. | C2, C3, I2 |
| `/app/today`, `/tasks`, `/waiting` | Backward-compatible redirects to Work views. | Old URLs are fine, but the product should not expose the legacy concepts as separate destinations. | Redirect only. | C4 |
| `/app/chat` | Grounded conversation concept, prompt example, recent conversations. | “Brain” is ambiguous; no prompt history, suggested questions by context, search, pin, rename, or delete. | One of the best first-use states because it gives a concrete example. | C1, I4 |
| `/app/chat/[conversationId]` | Sources are visible and link back to records; model transparency exists. | Long threads lack timestamps, anchors, search, regenerate/copy, conversation controls, and source preview. | No dedicated empty-thread or message-send recovery surface. | C3, I4 |
| `/app/memories` | Shows kind, confidence, importance, and supports manual creation. | No detail view, source, created/updated explanation, edit, delete, merge, conflict, filters, search, categories, or relationships. Confidence is a percentage without meaning. | Explains how to add a memory, but not why/when a memory is reused or how to trust it. | C1, C5 |
| `/app/projects` | Automatic emergence from captures is a strong differentiator; manual creation remains possible. | No search, filter, sort, edit, archive, merge, pin, status localization, or activity preview. | Explains automatic appearance; could open capture with a project-oriented example. | C1, I4 |
| `/app/projects/[projectId]` | Tasks, people, and source timeline make the page contextual rather than CRUD. | Cannot edit metadata, manage relationships, filter timeline, or act on tasks. Raw status labels reduce polish. | Section empties are contextual, but there is no page-level “how this project grows” guidance. | I4, I11 |
| `/app/people` | Automatic recognition and relationship framing are product-appropriate. | Same discoverability and lifecycle gaps as Projects; duplicate people will become costly. | Explains automatic appearance; no action beyond the creation form. | C1, I4 |
| `/app/people/[personId]` | Shared projects, tasks, memories, and timeline are a compelling personal context view. | No aliases, relationship role history, merge, edit, contact channels, follow-up action, or memory source. | Section empties are calm; the Memories section disappears entirely, reducing discoverability. | C5, I4 |
| `/app/reviews` | Honest on-demand model and four useful time scopes. | Four generation buttons are undifferentiated; no scope preview, cadence, comparison, pinning, or review-to-action workflow. | Copy explains when to generate, but does not preview the value of each review. | I7 |
| `/app/questions` | A strong anti-hallucination concept: ambiguity is preserved instead of guessed. | Duplicates Inbox Needs you; answering lacks surrounding source/context and batch keyboard flow. | Good reassurance, but it can feel like a dead end because no example or route back to capture exists. | I3, I5 |
| `/app/reminders` | Respects timezone and quiet hours; creation is direct. | Reminder lifecycle lacks edit, snooze, repeat, cancel, status localization, or contextual relationship. | Clear creation cue; the dense inline form is heavy on mobile. | I6, I10, I11 |
| `/app/files` | Strong privacy language, temporary original access, separated analysis, retry flow, and structured extraction. | No search, type/status filters, preview modes, bulk upload, relationship navigation, or lifecycle controls. Structured analysis is visually dense. | Strong empty and failure copy; processing needs skeleton/progress rather than status alone. | C3, I6 |
| `/app/history` | Useful explainability: actor, action, entity, reason, time. | Raw action/entity strings, no filters, no grouping, no linked entity, and high primary-nav cost. | Honest but passive; “actions appear here” teaches little about undoability. | I11, I12 |
| `/app/costs` | Unusually transparent; distinguishes priced/unpriced use and model/function breakdown. | Information density is high, language is technical, and the page competes with daily product destinations. | Good no-usage and warning states; tables/charts need a compact mobile summary. | I8, I12 |
| `/app/notifications` | Relevance and silence are explicit product values. | No unread grouping, dismiss/bulk mark, preferences shortcut, or clear relation to reminders/Needs you. “Lida” is an action label that can read as status. | Delightful and anxiety-reducing empty copy. | I10, I11 |
| `/app/settings` | Only operational settings are exposed; advanced AI is progressively disclosed; save feedback is robust. | Technical copy (“consumer verificável”), long single form, no profile/privacy/data sections, and locale does not persist as a real preference. | Not a collection; pending/success/error are handled. Needs dirty-state protection and section navigation. | I9, I11 |
| `/app/jobs` | Correctly hidden from normal navigation and useful for technical recovery. | Raw technical queue is not appropriate as a general user surface. | Queue-empty copy mentions future integrations and exposes implementation language. | I12 |

### Authentication and global routes

| Route | Current assessment | Key gap | Roadmap IDs |
| --- | --- | --- | --- |
| `/auth/login` | Calm, polished copy and safe success messages. | No pending state, password visibility, passkey/social path, or first-run explanation of the product. | C3, I1 |
| `/auth/register` | Clear privacy promise and password guidance. | Account creation is not connected to a guided first capture; password rules are cognitively heavy. | I1 |
| `/auth/recover` | Simple and appropriately non-disclosing. | No visible pending state or resend timing. | C3 |
| `/auth/reset` | Security implications are explained. | No strength feedback or pending state. | C3 |
| Root `/` | Locale redirect is acceptable. | Language is route-based while the root document always declares `lang="pt-BR"`. | I8, I9 |
| Authenticated error boundary | Provides retry and calm copy. | It is the only explicit product error boundary; no route-specific recovery or diagnostic reference. | C3 |

## 8. Empty-state evaluation

### Summary by user outcome

| Surface | Encourages first use | Explains feature | Teaches workflow | Motivates action | Reduces anxiety | Delight potential |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | Good | Good | Partial | Partial | Good | High |
| Inbox All | Good | Good | Partial | Partial | Good | Medium |
| Inbox Needs you | Partial | Good | Good | Low when empty | Excellent | Medium |
| Work Today / All / Waiting | Partial | Good | Partial | Partial | Good | Medium |
| Ask Brain | Excellent | Good | Excellent | Excellent | Good | High |
| Memories | Partial | Partial | Low | Good | Good | High |
| Projects / People | Partial | Good | Partial | Partial | Good | High |
| Reviews | Good | Good | Partial | Good | Good | High |
| Questions | Low | Good | Good | Low | Excellent | Medium |
| Reminders | Good | Good | Good | Good | Good | Medium |
| Files | Good | Excellent | Good | Good | Excellent | Medium |
| Notifications | Low | Good | Not needed | Not needed | Excellent | High |
| History / Costs / Jobs | Low | Partial | Low | Low | Good | Low |

### Empty-state principles

The existing copy is calm and usually truthful. The missing layer is action architecture. A scalable empty state should use a consistent five-part model:

1. **State:** what is empty and whether that is good, neutral, or blocked.
2. **Value:** why this surface exists.
3. **First action:** one primary action that performs or focuses the next step.
4. **Example:** a realistic prompt or sample, without inserting fake data.
5. **Escape:** a link to the source workflow when the current page is derivative.

For “all clear” states, do not manufacture work. Celebrate briefly, offer a secondary action, and preserve whitespace.

## 9. Memories deep dive

The current Memories page is the largest mismatch between product promise and product depth. It exposes `content`, `kind`, `confidence`, and `important`, but the user cannot inspect why a memory exists or safely maintain it.

### Required memory object model in the UI

| Attribute | User-facing purpose |
| --- | --- |
| Statement | The durable fact or preference the Brain may reuse. |
| Category | Preference, fact, relationship, responsibility, rule, goal, habit, restriction, or professional context, using localized labels. |
| Source | Original capture, conversation, file, user-created assertion, or derived correction. |
| Evidence | Linked source excerpts and dates; never an unexplained confidence percentage. |
| Confidence | Human language: Confirmed by you, Strong evidence, Tentative, or Conflicting. |
| Scope | Global, person, project, or time-bounded context. |
| Lifecycle | Active, superseded, disputed, archived. |
| Relationships | Connected people, projects, files, entries, and related memories. |
| History | Who/what created or changed it and whether the Brain has used it. |

The creation flow should allow natural language first, with optional structure revealed progressively. Editing must preserve provenance. Deletion should distinguish “archive/stop using” from permanent deletion. Conflicts should be resolved explicitly instead of lowering an opaque score.

## 10. Design-system audit

### What works

- The three-font system has a clear role split: Newsreader for editorial emphasis, Manrope for UI, JetBrains Mono for metadata.
- Ink, paper, and blue form a calm and recognizable palette.
- Focus-visible treatment exists globally and in complex controls.
- Reduced-motion is respected by placing decorative animations behind `prefers-reduced-motion: no-preference`.
- Major forms use labels, pending states, live feedback, and semantic fieldsets in the candidate editor.
- Mobile CSS explicitly accounts for 44-pixel targets in navigation and several controls.

### What will not scale

- Nine root color tokens coexist with **164 hard-coded color occurrences**.
- CSS contains about **805 rule blocks**, spread across page-oriented files rather than a primitive/component layer.
- There are **16 radius values** and **12 distinct shadow values**.
- There are **97 font-size declarations at 12px or below**, including 8px and 9px metadata.
- Muted colors such as `#8793a5` on paper (~3.03:1) and `#aebbd0` on white (~1.94:1) fail WCAG AA for normal text.
- Breakpoints are feature-specific (600/700/760/850/900) and can drift.
- Buttons, inputs, cards, badges, feedback, and list rows are visually similar but implemented through many selectors.
- No dark theme contract exists; status color semantics are not centralized.

The detailed migration contract is in [`MY_BRAIN_DESIGN_SYSTEM_PLAN.md`](./MY_BRAIN_DESIGN_SYSTEM_PLAN.md).

## 11. Productivity and 8-hour-use assessment

### What would feel fast

- Capture from Home and the dedicated capture route.
- Immediate preserved receipt and explicit organizing state.
- Inbox state labels and focused Needs you filter.
- Work tabs that consolidate old Today/Tasks/Waiting URLs.
- Correcting AI interpretation before materializing tasks.

### What would become annoying

- Mouse travel to small row action buttons for every task.
- No global search or “go to” facility as content grows.
- No keyboard row focus, selection, completion, navigation, or command discovery.
- No bulk action for Inbox, Notifications, Work, or duplicate entities.
- Repeated page transitions for context that could use peek/side panels.
- Pagination without visible result count, page position, page size, filters, or preserved focus.
- Many large headers and generous empty containers during dense daily work.
- No task edit/detail flow after creation.
- Technical state words and tiny metadata slowing recognition.

### Minimum keyboard contract

| Shortcut | Action |
| --- | --- |
| `Cmd/Ctrl K` | Open command palette. |
| `/` | Search current/global content when focus is not in an editor. |
| `C` | Quick capture. |
| `G` then `H/I/W/B` | Go to Today, Inbox, Work, Ask Brain. |
| `J/K` or arrows | Move row focus. |
| `Enter` | Open focused item. |
| `X` | Select focused item. |
| `E` | Edit focused item where permitted. |
| `Cmd/Ctrl Enter` | Confirm the primary form action. |
| `Cmd/Ctrl Z` | Undo the latest eligible action. |
| `?` | Open searchable shortcut reference. |

Every shortcut must have a mouse/touch equivalent, ignore editable targets, support international layouts, and be discoverable through the command palette.

## 12. Mobile audit

### Current strengths

- The app shell collapses to a bottom navigation at 760px.
- Content pages reserve bottom padding for the fixed navigation.
- Core grids collapse at 900/700/600px.
- Capture is large, clear, and remains the central mobile action.
- The More menu is scrollable and bounded to the viewport.
- Several important controls meet 44px targets.

### Current risks

- Six bottom-level controls (Home, Inbox, Capture, Work, Brain, More) are too crowded at 320–390px, especially with 9px labels.
- Ten overflow destinations in a two-column popover require taxonomy scanning and can obscure the screen beneath.
- The 43px mobile hero and large empty cards consume several viewport heights before actionable information.
- Inline creation forms and settings become long stacked forms rather than task-focused sheets.
- List row metadata and action buttons wrap below content, increasing scan time.
- No swipe, long-press, selection mode, pull-to-search, or contextual bottom sheet exists.
- Tables and dense technical detail rely on scrolling/stacking rather than mobile-specific summaries.

The target mobile shell should use four stable items — Today, Inbox, Work, Library — with a central Capture action. Ask Brain should be a persistent header/command action or replace Library only if usage data proves it is more frequent. More/Settings should move behind the profile or command surface.

## 13. Best-in-class conceptual comparison

This comparison is about interaction models, not visual imitation.

| Product | Concept to learn from | My Brain today | Where My Brain is stronger |
| --- | --- | --- | --- |
| Notion | Workspace search doubles as navigation; recent/frequent destinations reduce sidebar dependence. [Official search guide](https://www.notion.com/help/search) | No global search or recent-item navigation. | More opinionated daily flow and stronger AI provenance. |
| Linear | Every action is available by control, shortcut, contextual menu, and command palette; selection and undo are core. [Official conceptual model](https://linear.app/docs/conceptual-model) | Server forms are mostly mouse-first and one-item-at-a-time. | Safer natural-language capture and source preservation. |
| Things 3 | Inbox is temporary; Today is curated; Quick Find and Quick Entry minimize navigation. [Official list model](https://culturedcode.com/things/support/articles/4001304/) | Inbox is partly archive and partly triage; Home is not yet a curated work surface. | Richer context, people/projects, and AI interpretation. |
| Superhuman | Split Inbox creates a finite priority queue; Command teaches shortcuts as the user acts. [Official shortcut guide](https://help.superhuman.com/hc/en-us/articles/46005789591693-Speed-Up-With-Shortcuts) | Needs you is promising but lacks high-throughput processing. | More transparent AI decisions and reversible materialization. |
| Raycast | A small command surface exposes deep capabilities without permanent navigation. [Official hotkey guide](https://manual.raycast.com/command-aliases-and-hotkeys) | Most capabilities require route discovery. | Persistent personal context and connected history. |
| Apple Notes | Tags and Smart Folders add lightweight organization without forcing a rigid hierarchy. [Official guide](https://support.apple.com/en-ie/102288) | Fixed object types exist, but no user-facing tags or smart views. | Stronger entities, task conversion, confidence, and provenance. |
| Todoist | Quick Add syntax, keyboard access, filters, and predictable task manipulation make repetition fast. [Official shortcut guide](https://www.todoist.com/help/articles/use-keyboard-shortcuts-in-todoist-Wyovn2) | Natural-language capture is stronger, but post-capture task handling is weaker. | Captures decisions, conversations, memories, and sources — not only tasks. |
| Capacities | Objects, backlinks, daily notes, and search form a connected context network. [Official backlinks guide](https://docs.capacities.io/reference/backlinks) | People/project timelines are a strong start; memories/files lack backlink-level discovery. | Safer action confirmation and a clearer attention queue. |
| Reflect | Semantic search, filtered AI chat, similar notes, and backlinks make retrieval immediate. [Official AI search overview](https://reflect.app/blog/ai-search) | Grounded chat exists, but discovery is conversation-first and unfilterable. | Explicit task candidates, attention states, audit, and undo. |

## 14. Prioritized findings

The complete implementation sequence and acceptance criteria are in the roadmap. The audit-level recommendations below use the required implementation fields.

### A-01 — Converge the daily information architecture

- **Problem:** Sixteen visible destinations compete for attention and several overlap.
- **Why it matters:** Navigation cost grows with content and makes the product feel modular rather than intelligent.
- **Suggested solution:** Keep Today, Inbox, Work, and Ask Brain primary; introduce Library and pinned/recent context; move transparency and preferences to utility surfaces.
- **Expected user benefit:** Faster orientation and a stable daily habit loop.
- **Estimated implementation effort:** L (2–3 frontend weeks plus analytics validation).
- **Dependencies:** Navigation telemetry, naming decision for Brain/Ask Brain, route compatibility.
- **Priority:** Critical.

### A-02 — Add global search and a command palette

- **Problem:** There is no global retrieval or action surface.
- **Why it matters:** A personal brain becomes unusable when recall depends on remembering a route.
- **Suggested solution:** Ship `Cmd/Ctrl K` with navigation/actions first, then full-text/semantic results across entries, memories, projects, people, files, and conversations.
- **Expected user benefit:** Retrieval and navigation become near-instant and learnable.
- **Estimated implementation effort:** XL (phased: M command/navigation; L–XL indexed search).
- **Dependencies:** Search projection/API, permissions, ranking, result contracts, keyboard framework.
- **Priority:** Critical.

### A-03 — Make Work directly manipulable

- **Problem:** Tasks cannot be opened or edited; small per-row forms dominate repeated work.
- **Why it matters:** This is the largest 8-hour/day throughput bottleneck.
- **Suggested solution:** Add row focus, open/edit detail, optimistic pending feedback, complete/wait/resume shortcuts, selection, and bulk actions.
- **Expected user benefit:** Fewer clicks and reliable muscle memory.
- **Estimated implementation effort:** L.
- **Dependencies:** Stable Phase 2C task contract, optimistic action/error semantics, undo boundary.
- **Priority:** Critical.

### A-04 — Build the memory trust lifecycle

- **Problem:** Memories show opaque confidence but cannot be inspected or maintained.
- **Why it matters:** Incorrect durable context silently degrades every AI interaction.
- **Suggested solution:** Add memory detail, provenance, evidence, human confidence labels, edit, archive/delete, merge/conflict handling, categories, and relationships.
- **Expected user benefit:** Users can understand and control what the Brain believes.
- **Estimated implementation effort:** XL.
- **Dependencies:** Memory provenance/history schema, usage tracking, deletion policy, relationship APIs.
- **Priority:** Critical.

### A-05 — Standardize loading, recovery, and asynchronous feedback

- **Problem:** There are no route loading files and only one authenticated error boundary.
- **Why it matters:** Server-rendered data and AI jobs will otherwise feel frozen or unreliable.
- **Suggested solution:** Add layout-preserving skeletons, local error/empty/retry states, pending row actions, stale-data messaging, and non-blocking job progress.
- **Expected user benefit:** Better perceived performance and lower anxiety.
- **Estimated implementation effort:** M–L.
- **Dependencies:** Shared state components and error taxonomy.
- **Priority:** Critical.

### A-06 — Replace route-centric empty states with first-use guidance

- **Problem:** Many empty states explain the absence but do not execute the next step.
- **Why it matters:** New users must infer how capture creates downstream context.
- **Suggested solution:** Use the five-part empty-state model with one real CTA, an example, and a source-workflow link.
- **Expected user benefit:** Faster activation without fake records or tutorials detached from work.
- **Estimated implementation effort:** M.
- **Dependencies:** Shared EmptyState component, onboarding event model, finalized primary actions.
- **Priority:** Important.

### A-07 — Unify Inbox, questions, notifications, and reminders around attention

- **Problem:** Attention-related work is split across four destinations.
- **Why it matters:** Users cannot know where the next unresolved item lives.
- **Suggested solution:** Make Inbox the canonical decision queue with typed filters; surface reminders/notifications in Today and preserve dedicated history views secondarily.
- **Expected user benefit:** One reliable place to get to “all clear.”
- **Estimated implementation effort:** L.
- **Dependencies:** Projection contracts, notification/reminder action semantics, IA change.
- **Priority:** Important.

### A-08 — Turn Projects and People into contextual workspaces

- **Problem:** Detail pages expose relationships but do not support maintenance or action.
- **Why it matters:** Automatic entity extraction creates duplicates and stale context over time.
- **Suggested solution:** Add aliases, merge, edit, archive, relationship roles, filters, source evidence, contextual capture, and task actions.
- **Expected user benefit:** Context becomes trustworthy and useful at the moment of work.
- **Estimated implementation effort:** L–XL.
- **Dependencies:** Entity lifecycle/merge contracts and memory provenance.
- **Priority:** Important.

### A-09 — Establish a scalable visual foundation

- **Problem:** Hard-coded colors, tiny text, many radii/shadows, and page-level CSS cause drift.
- **Why it matters:** Every new feature increases inconsistency and accessibility risk.
- **Suggested solution:** Introduce semantic tokens, a documented type/space/density scale, and shared primitives without redesigning working flows.
- **Expected user benefit:** More legible, predictable, and cohesive UI.
- **Estimated implementation effort:** L, migrated incrementally.
- **Dependencies:** Design-system contract and visual regression coverage.
- **Priority:** Important.

### A-10 — Redesign the mobile shell for prioritization

- **Problem:** Six bottom controls and ten overflow destinations do not scale on narrow screens.
- **Why it matters:** Frequent navigation becomes imprecise and the More menu becomes a sitemap.
- **Suggested solution:** Use four stable destinations plus Capture, with command/search and profile utility access.
- **Expected user benefit:** Larger targets, faster one-handed navigation, less visual noise.
- **Estimated implementation effort:** M.
- **Dependencies:** IA decision, mobile usage telemetry, safe-area and focus behavior.
- **Priority:** Critical.

### A-11 — Localize the whole product vocabulary

- **Problem:** Raw statuses, kinds, actions, models, and the document `lang` can disagree with the selected locale.
- **Why it matters:** Mixed language looks unfinished and harms screen-reader pronunciation.
- **Suggested solution:** Centralize presentation vocabulary and set document language from the locale route.
- **Expected user benefit:** More polished comprehension and better accessibility.
- **Estimated implementation effort:** M.
- **Dependencies:** Presentation contract and locale-aware root layout strategy.
- **Priority:** Important.

### A-12 — Preserve transparency while reducing primary-nav cost

- **Problem:** History and AI Costs are valuable but compete with daily actions.
- **Why it matters:** Transparency should build trust without making the product feel operational/technical.
- **Suggested solution:** Group them under Settings → Data & AI, retain command access, and add filters/linked entities.
- **Expected user benefit:** Cleaner daily navigation with no loss of control.
- **Estimated implementation effort:** S–M.
- **Dependencies:** IA change and route compatibility.
- **Priority:** Important.

## 15. Final product position

My Brain should not become a general-purpose workspace or a prettier database. Its defensible experience is a **trusted contextual agent with a finite daily attention loop**. The interface should make three things effortless:

1. Get information out of the user's head.
2. See exactly what needs human judgment.
3. Retrieve connected context without remembering where it was filed.

Everything else should support those three jobs quietly.


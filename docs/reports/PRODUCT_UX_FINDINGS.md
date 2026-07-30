# Product UX findings ledger

**Initiative** — Product UX/UI Remediation Loop (post-Phase 2F, pre-Phase 2G).
**Opened** — 2026-07-30.
**Baseline commit** — `0c13285` (`main`, clean tree at audit start).
**Status** — Audit 1 complete. No remediation slice merged yet.

This is the durable artifact for the initiative. Every finding keeps its ID for the
life of the initiative and ends with exactly one disposition:

- `RESOLVED` — fixed and verified with mechanical + visual evidence.
- `RETAINED` — deliberately kept, with the evidence that justified keeping it.
- `DEFERRED` — not done, with a **named destination** and rationale.
- `BLOCKED` — waiting on a genuine owner decision (the decision is stated).
- `OPEN` — not yet dispositioned (audit-1 default).

Renaming a finding "future enhancement" is not a disposition.

---

## How the audit was performed

The authenticated product could not be driven end-to-end: `.env.local` carries only
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`OPENAI_API_KEY`. There is no service-role key to mint a confirmed user, and
`signUp` in `src/features/auth/actions.ts:44` always ends at
`/auth/login?message=check-email`, so self-registration cannot produce a session.
This is recorded as **BLOCK-1** and is the one thing the owner must unblock for
full end-to-end visual acceptance.

Everything below was therefore reproduced by three converging methods, and each
finding states which one produced its evidence:

| Method | What it proves | Where |
| --- | --- | --- |
| **M1 — source/contract inspection** | what the code and the database actually support | file:line citations |
| **M2 — real-app render** (`/[locale]/ux-harness`, a temporary uncommitted route outside the `/app` auth gate that mounts the **real** `AppShell`, `NavigationLinks`, `NeedsAttentionItemRow`, `InboxItemRow` and `TaskList` with fixture props inside the panel markup copied verbatim from `home-dashboard.tsx:53-62`) | the layout the authenticated Home actually produces | `docs/reports/ux-evidence/baseline/harness-*.png` |
| **M3 — static CSS harness** (the repository's real stylesheets + the exact DOM the components emit, in real Chromium) | the same layout independently of Next, plus the Work surface | `docs/reports/ux-evidence/baseline/static-*.png` |

M2 and M3 agree on every measurement, which is what makes the numbers below
trustworthy rather than impressionistic. Viewports measured throughout:
**1440×900**, **1920×1080**, **375×667 (iPhone SE class)**, **412×915 (Pixel 7)**.

A visual finding is only marked `RESOLVED` after a real-browser render at those four
viewports — never on jsdom or snapshot evidence.

### Information architecture, as measured

Desktop side rail renders **15 links** in this order (measured, `M2`):

```
Início · Caixa · Trabalho · Brain
[Captura rápida]                     ← dark button, visually detached from the list
CONTEXTO        Projetos · Pessoas · Memórias · Arquivos
REFLEXÃO        Revisões · Perguntas pendentes
ORGANIZAÇÃO     Lembretes
TRANSPARÊNCIA   Histórico · Custos de IA
PREFERÊNCIAS    Configurações
```

Mobile bottom nav renders **6 slots**: 4 primary + the capture FAB + a `Mais`
`<details>` overlay holding the remaining **10 items under 5 group labels**.

Route inventory (`src/app/[locale]/app/`): `page` (Home), `capture`, `inbox`,
`inbox/[entryId]`, `work`, `work/cancelled`, `chat`, `chat/[conversationId]`,
`projects`, `projects/[projectId]`, `people`, `people/[personId]`, `memories`,
`files`, `reviews`, `questions`, `reminders`, `history`, `costs`, `notifications`,
`jobs`, `settings`. `today`, `tasks` and `waiting` are 307 redirects into
`work?view=…` and are **not** duplicate surfaces.

**There is no task detail route.** No `work/[taskId]`, no `tasks/[taskId]`.

---

## Severity and priority

`P0` blocks or seriously damages basic use · `P1` creates major confusion ·
`P2` richer product evolution.

| ID | Title | Cat. | Pri. | Reproduces | Disposition |
| --- | --- | --- | --- | --- | --- |
| UX-01 | Navigation exposes 14 concepts before the workflow is understood | IA | P1 | yes | **RESOLVED** (labels → DEC-1) |
| UX-02 | Home is editorial, not operational; large voids beside compressed content | IA | P1 | yes | **RESOLVED** |
| UX-03 | "Caixa" names a mailbox; the page is a full record list | IA | P1 | yes | OPEN → B2 (DEC-1 approved: **Registros**) |
| UX-04 | Entry detail hides "what was created" behind interpretation vocabulary | interaction-model | P1 | yes | OPEN |
| UX-05 | Tasks are not inspectable or editable; 11 of 15 domain verbs unreachable | missing-lifecycle | **P0** | yes | OPEN |
| UX-06 | Assistant name is persisted but has no field and no consumer | usability | P1 | yes | OPEN → F (DEC-2 approved: **ship it**) |
| UX-07 | Brain page stacks three competing AI input surfaces | interaction-model | P1 | yes | OPEN → E (DEC-3 approved: **unified**) |
| UX-08 | Projects: create-by-name only; no edit path at all | missing-lifecycle | P1 | yes | OPEN |
| UX-09 | People: create-by-name only; modelled relations unsurfaced | missing-lifecycle | P1 | yes | OPEN |
| UX-10 | Memories have no mental model, no provenance, no lifecycle | missing-lifecycle | P1 | yes | OPEN |
| UX-11 | Pending-question resolution has no visible after-state | interaction-model | **P0** | partly | OPEN |
| UX-12 | Reminders expose create only; snooze/cancel/edit modelled but unreachable | missing-lifecycle | P1 | yes | OPEN |
| UX-13 | History has no search, no filters, raw DB vocabulary, no link to subject | usability | P1 | yes | OPEN |
| UX-14 | Mobile: capture FAB mis-ordered and off-centre; no safe-area inset | responsive | **P0** | yes | **RESOLVED** (centring → B) |
| UX-15 | Panel list rows collapse the title to ~6–16 lines (`auto` meta column) | visual | **P0** | yes | **RESOLVED** |
| UX-16 | Content width *shrinks* as the viewport grows (`padding: 5vw`) | responsive | **P0** | yes | **RESOLVED** |
| UX-17 | Side rail clips its last nav item at 1440×900 | visual | P1 | yes | **RESOLVED** |
| UX-18 | Home panel kickers are hardcoded Portuguese in both locales | localization | P1 | yes | **RESOLVED** |
| UX-19 | `open_task` is a declared, localized action with no producer and no route | interaction-model | P1 | yes | OPEN |
| UX-20 | Rows styled as interactive are inert (`memories`, `reminders`) | usability | P1 | yes | **RESOLVED** (affordance) |
| UX-25 | Home grew ~24 % taller as a consequence of the UX-15 fix | visual | P1 | n/a | **RETAINED** (with evidence) |
| UX-26 | No logout or account switch exists anywhere in the product | missing-lifecycle | **P0** | yes | OPEN → D3 |
| UX-27 | One task creation writes two audit rows, so history shows it twice | usability | P2 | yes | OPEN → G |
| UX-28 | `audit_logs.reason` is English prose written by SQL | localization | P1 | yes | RETAINED (not rendered) |
| UX-21 | Raw database enum values rendered as user-facing labels | localization | P1 | yes | OPEN |
| UX-22 | 305 inline locale ternaries bypass the mandated copy-module mechanism | localization | P1 | yes | OPEN |
| UX-23 | `Mais` overlay cannot be dismissed by tapping outside it | usability | P1 | yes | **RESOLVED** |
| UX-24 | Touch targets ≥44px — **does not reproduce**; retained as verified-good | — | — | **no** | RETAINED |

Owner findings map to IDs 1:1 in order: owner 1→UX-01 … owner 14→UX-14.
UX-15…UX-23 were discovered during this audit. UX-24 is an owner-listed concern
that measured clean and is recorded so it is not "fixed" without cause.

---

# P0 findings

## UX-15 — Panel list rows collapse the title to one word per line

- **Owner observation** — "'Precisa de você' and 'Atividade recente' render text in extremely narrow columns, sometimes one word per line."
- **Route** — `/[locale]/app` (Home). Same component reused on `/app/inbox`.
- **Category** — visual defect (P0).
- **Frequency** — every Home visit with any item whose title exceeds ~30 characters, i.e. effectively always.
- **Reproduction** — render Home at 1440×900 with a 94-character entry title. `M2` + `M3`.
- **Evidence** —
  `baseline/harness-home-pt__desktop-1440.png`, `harness-home-en__desktop-1920.png`,
  `static-home__desktop-1440.png`. Measured:

  | Viewport | Locale | Row width | Title column | Meta column | Title lines | chars/line |
  | --- | --- | --- | --- | --- | --- | --- |
  | 1440×900 | pt-BR | 379 px | **78 px** | 243 px | **10** | 9.4 |
  | 1440×900 | pt-BR | 549 px | 137 px | 354 px | 6 | 15.7 |
  | 1920×1080 | pt-BR | 359 px | **58 px** | 243 px | **16** | 5.9 |
  | 1920×1080 | en | 521 px | **62 px** | 401 px | **10** | 8.5 |
  | 412×915 | pt-BR | 330 px | 292 px | 292 px | 3 | 31.3 |

- **Root cause** — `src/app/operations.css:3` defines
  `.list-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:20px}` and
  `.list-meta{display:flex;align-items:center;gap:9px}` with **no `flex-wrap` and no
  `min-width:0`**. The `auto` track is therefore sized by its content — a timestamp
  plus an action hint plus a status badge, 243–401 px — and the `minmax(0,1fr)` title
  track absorbs whatever is left. `.list-row` was designed for the full-width
  `.list-stack` on Caixa (where it measures 1036 px and behaves correctly: 47
  chars/line) and was later reused inside `.dashboard-recent-list` in a 359–549 px
  dashboard panel without a container-appropriate variant. The `<p>` preview escapes
  notice because `.list-row-main p` sets `white-space:nowrap;text-overflow:ellipsis`;
  the `<strong>` title has no such escape and wraps instead.
  English is consistently worse than Portuguese because its action hints are longer,
  which widens the `auto` track further.
- **Proposed solution** — introduce a density variant rather than shrinking type
  (prohibited) or truncating the title (prohibited: the title must stay readable).
  In narrow containers the row becomes a single column with the meta line beneath the
  title, which is exactly what the existing `max-width:600px` rule already does at
  `operations.css:5`. The fix is to key that behaviour on the **container**, not the
  viewport — `container-type: inline-size` on the panel plus an `@container` rule —
  and to add `min-width:0` + `flex-wrap:wrap` to `.list-meta` so the meta track can
  never starve the title again.
- **Contracts affected** — none. Presentation only.
- **Slice** — A.
- **Validation** — real-browser render at all four viewports, both locales, with a
  120-character title; assert title ≥ 28 chars/line in every container; add a
  regression test asserting the computed grid of `.panel .list-row`.
- **Disposition** — OPEN.

## UX-16 — Usable content width shrinks as the viewport grows

- **Owner observation** — implicit in "large empty areas coexist with compressed content".
- **Route** — every `/app/*` route (`.dashboard` and `.content-page`).
- **Category** — responsive defect (P0). It is the multiplier that makes UX-15 worse on bigger screens.
- **Reproduction** — measure `.dashboard` content width at 1440 and at 1920. `M2` + `M3`.
- **Evidence** — content width **1036 px @ 1440** vs **988 px @ 1920**; panel width
  549 px → 521 px; title column 137 px → 109 px. A 33 % wider display yields a
  **48 px narrower** reading column.
- **Root cause** — `globals.css:14` `.dashboard{max-width:1180px;margin:auto;padding:64px 5vw 120px}`
  and `operations.css:1` `.content-page{max-width:1180px;margin:auto;padding:58px 5vw 130px}`.
  Because `max-width` caps the box while the padding is a **viewport** percentage, the
  padding keeps growing after the box has stopped, eating the content box from both
  sides.
- **Proposed solution** — clamp the gutter (`padding-inline: clamp(18px, 5vw, 64px)`)
  or move the gutter to a wrapper outside the `max-width` box.
- **Contracts affected** — none.
- **Slice** — A.
- **Validation** — assert content width is monotonically non-decreasing across
  375 → 412 → 1440 → 1920.
- **Disposition** — OPEN.

## UX-14 — Mobile capture button is mis-ordered and off-centre; no safe-area inset

- **Owner observation** — "a central capture button competes with the primary navigation"; safe areas.
- **Route** — every `/app/*` route at ≤760 px.
- **Category** — responsive defect (P0).
- **Reproduction** — measure `.bottom-nav` children at 375×667 and 412×915. `M2`.
- **Evidence** —
  - DOM order (the intended design): `Início · Caixa · [Captura rápida] · Trabalho · Brain · Mais`.
  - Computed `order`: `Início=0 · Caixa=0 · Captura rápida=3 · Trabalho=4 · Brain=0 · Mais=0`.
  - **Visual order: `Início · Caixa · Brain · Mais · Captura rápida · Trabalho`.**
  - FAB centre **x=273** on a 375-wide viewport (centre 188) → **85 px off-centre**, in the 5th of 6 slots.
  - `.bottom-nav` computed `padding-bottom: 12px`, no `env(safe-area-inset-bottom)`.
- **Root cause** — two stylesheets disagree and the loser is the one that was meant to
  win. `globals.css:15` still carries the pre-Slice-2X.13 rules
  `.bottom-nav .capture-fab{order:2}`, `.bottom-nav>a:nth-child(3){order:3}`,
  `.bottom-nav>a:nth-child(4){order:4}`. `mobile-navigation.css:76-79` tries to
  neutralise them with `.bottom-nav > a, .bottom-nav > .mobile-more { order: initial }`,
  but `.bottom-nav>a:nth-child(3)` (specificity 0,2,1) beats `.bottom-nav > a`
  (0,1,1). Those `:nth-child` positions were authored when the nav had a different
  child list; after `Mais` was added and the DOM re-ordered, they began selecting the
  **capture FAB** (3rd `<a>`) and **Trabalho** (4th `<a>`) and pushing both to the end.
  So the ordering is not a design choice at all — it is a stale-selector regression
  that no test observes, because the nav's tests assert presence and href, not geometry.
- **Proposed solution** — delete the stale `order` declarations from `globals.css`,
  let DOM order stand, and centre the FAB structurally. Add
  `padding-bottom: calc(12px + env(safe-area-inset-bottom))` and a matching
  `scroll-padding`/content inset.
- **Contracts affected** — none. `e2e/online-mobile-navigation.spec.ts` asserts
  behaviour, not order; a geometry assertion is added rather than changed.
- **Slice** — A (order + safe area), H (the rest of the mobile convergence review).
- **Validation** — assert visual order equals DOM order and `|fabCentre − viewportCentre| ≤ 2 px`
  at both mobile viewports; assert the nav's padding resolves through `env()`.
- **Disposition** — OPEN.

## UX-05 — Tasks are not inspectable or editable; 11 of 15 domain verbs are unreachable

- **Owner observation** — "The Trabalho page shows tasks, but the tasks do not behave like useful interactive objects."
- **Route** — `/[locale]/app/work` (and Home's priority panel, which links to `work?view=today` rather than to a task).
- **Category** — missing lifecycle action (P0), **not** missing domain capability.
- **Reproduction** — open Work; a row is an `<article>` with no link; the only controls are the four status buttons. `M1` + `M3`.
- **Evidence** — `static-work__desktop-1440.png`, `static-work__pixel7-412.png`.
  `src/features/operations/task-list.tsx:156` renders `<article className="list-row">`;
  relations render as inert `<span className="status-badge">` at lines 164-187.
- **Root cause — the capability exists and the UI does not reach it.**
  `src/features/task-commands/taxonomy.ts:44-60` declares **15** validated command
  actions, all applied through the One Write Path `public.apply_task_command`:

  | Reachable today (4, as buttons) | Reachable only by typing natural language into the console (11) |
  | --- | --- |
  | `complete_task`, `reopen_task`, plus the surface verbs `wait_task`/`resume_task` mapped onto `set_status` | `set_status`, `cancel_task`, `restore_task`, `rename_task`, `append_note`, `reschedule_due`, `clear_due`, `set_planned`, `set_priority`, `assign_project`, `assign_context`, `assign_person`, `set_waiting_on` |

  `TASK_COMMAND_PATCH_FIELDS` (`taxonomy.ts:143`) already enumerates
  `title, note, status, priority, dueAt, plannedAt, projectRef, contextRef, personRef`.
  Every action the owner asked for — edit, complete, reopen, wait, resume, change due
  date, change priority, manage relationships, undo — is therefore **already
  implemented, validated, audited, fingerprinted and undoable**. What is missing is a
  task detail surface and structured controls that speak to it.
- **Proposed solution** — add `/[locale]/app/work/[taskId]`: original provenance
  (`source_entry_id` → the entry), current field values, relations as **links**,
  change history from `audit_logs`, and one control per eligible command action.
  Each control composes a `TaskCommandIntent` and submits through the existing
  `apply_task_command` path with an operation key — **no new write path, no direct
  task write.** Natural-language change stays available through the same console
  component, so the two are one funnel and not two write paths.
- **Contracts affected** — `apply_task_command` (consumed, not modified);
  `TASK_COMMAND_POLICY_VERSION` unchanged; `task_command_applied` analytics gains
  no new property (`commandOrigin` already admits `'work'`).
- **Slice** — D.
- **Validation** — pgTAP already covers the RPC. New: component tests per control,
  a Playwright journey (desktop + mobile, both locales) that opens a task, edits the
  due date, changes priority, reassigns a project and undoes each.
- **Disposition** — OPEN.

## UX-11 — Pending-question resolution has no visible after-state

- **Owner observation** — the full lifecycle after the user gives the Brain clarity; and "'Corrigir interpretação' must not feel like an internal debugging action".
- **Route** — `/[locale]/app/questions`, plus the `ConversationalQuestions` mounts on `/app/chat` and `/app/inbox?view=needs-you`.
- **Category** — interaction-model problem (P0 for the "incomplete clarification flow" criterion).
- **Reproduction** — `M1`. Full end-to-end confirmation of the post-answer screen needs a session (**BLOCK-1**), so this is recorded as *partly* reproduced: the pre-answer surface and the code path are confirmed; the rendered after-state is not yet photographed.
- **Evidence** — `src/app/[locale]/app/questions/page.tsx:45` renders, per question:
  a bare confidence percentage, the question, the reason, `QuestionAnswerForm`, and
  `QuestionPreviewPanels` (source DTO + predicted effect + suggestions). The
  *pre*-answer story is genuinely good — a predicted effect already exists. What is
  missing is everything after: the resolved question leaves the list (it is filtered
  out by `actionablePendingQuestionFilter()`), and there is no confirmation of what
  changed, no diff of the interpretation before/after, no statement of whether
  confirmation is still required, and no place to inspect the decision later.
  `pending_questions` already stores `answer`, `answered_at` and `status`, and
  migration `202607230050_phase_2d_confirmed_reinterpretation.sql` already reinterprets
  on answer — so the after-state is fully recorded and simply never shown.
  Separately, `daily-cycle/copy.ts:44` labels the action **"Corrigir interpretação" /
  "Correct interpretation"**, which asks the user to know what an interpretation is.
- **Root cause** — the flow was built as a queue to be emptied, not as a decision with
  an outcome. The projection has no "recently resolved" view and the copy names the
  internal object rather than the user's goal.
- **Proposed solution** — (a) after answering, render an outcome panel: what you
  answered, what changed, what happens next, whether confirmation remains, and a
  permanent link to the entry where it is recorded; (b) a "resolved" tab reading the
  answered rows; (c) rename the action to the user's intent (e.g. "Ajustar o que o
  Brain entendeu" / "Adjust what Brain understood") — the label change is local,
  reversible and covered by copy tests.
- **Contracts affected** — `resolve_pending_question_v3` (consumed, unchanged);
  `question_resolution_contract.ts` gains an outcome projection, not a new write.
- **Slice** — G.
- **Validation** — component tests for the outcome panel; DB-backed test that an
  answered question is retrievable in the resolved view; Playwright journey through
  answer → outcome → inspect-later, desktop + mobile, both locales.
- **Disposition** — OPEN.

---

# P1 findings

## UX-01 — Navigation exposes 14 concepts before the workflow is understood

- **Route** — global shell (`src/features/shell/app-shell.tsx`, `navigation-links.tsx`, `capabilities.ts`).
- **Category** — information-architecture problem.
- **Evidence** — 15 desktop links measured (`M2`); the taxonomy already exists in
  `capabilities.ts:71-88` as `primary | more | global | context-only` with five
  `more` groups — but the desktop rail renders **every group inline** rather than
  treating `more` as overflow, so the distinction the code makes is invisible to the
  user. `Captura rápida` is styled as a dark button between the primary list and the
  first group label (`mobile-navigation.css:41-58`), which is what makes it read as
  "visually detached".
- **Root cause** — `navigation-links.tsx:120-139` maps `primaryNavigationKeys` **and**
  all of `moreNavigationGroups` into the rail. The visibility field is honoured on
  mobile and ignored on desktop.
- **Proposed solution** — honour `visibility` on desktop too: rail shows the primary
  set plus capture; everything in `more` moves behind one disclosure that mirrors the
  mobile `Mais` semantics. This is a **navigation-taxonomy** change and its *labels*
  are gated by DEC-1; the *structure* (primary vs overflow) is inside my remit
  because it only surfaces a distinction the repository already declares.
- **Contracts affected** — `capabilities.ts` navigation registry (extended, not
  reshaped); `e2e/online-mobile-navigation.spec.ts`; `app-shell.test.tsx`.
- **Slice** — B.
- **Validation** — nav renders ≤5 always-visible destinations at every viewport;
  every route in the registry stays reachable; keyboard traversal and focus return
  verified; screenshots at four viewports.
- **Disposition** — OPEN.

## UX-02 — Home is editorial rather than operational

- **Route** — `/[locale]/app`.
- **Category** — information-architecture problem.
- **Evidence** — `harness-home-pt__desktop-1440.png`: numbered kickers `01 / AGORA`
  … `06 / RECENTE`; total page height **2106 px at 1440×900** and **2345 px at
  375×667**, i.e. 2.3–3.5 screens; the `priority-panel` reserves `min-height:392px`
  (`globals.css:14`) and shows ~300 px of void beside the compressed attention panel;
  five of the six panels are single-sentence read-outs.
- **Root cause** — `home-dashboard.tsx:53-62` is a fixed six-panel magazine grid
  (`grid-template-columns:1.4fr 1fr` with `priority-panel{grid-row:span 2}`) whose
  slots are allocated by editorial rank, not by whether anything needs the user. The
  page answers "here are six categories" instead of "here is what needs you".
- **Proposed solution** — one attention surface first (needs-you + blocked + open
  questions merged and ranked, since all three already exist as projections), then
  today's commitments, then a compact recent strip. Panels with nothing in them
  collapse instead of reserving 392 px. Drop the ordinal kickers (they also carry
  UX-18).
- **Contracts affected** — `attention-projection.ts`, `home-projection.ts`,
  `work-projection.ts`, `inbox-projection.ts` are consumed unchanged; the
  presentation is extracted out of `home-dashboard.tsx` so it becomes testable and
  renderable without a database.
- **Slice** — C (depends on A).
- **Validation** — above-the-fold content at 1440×900 and 375×667 answers "what needs
  me now"; empty / loading / error / long-content / both-locale renders captured.
- **Disposition** — OPEN.

## UX-03 — "Caixa" names a mailbox; the page is the full record list

- **Route** — `/[locale]/app/inbox` (+ `?view=needs-you`).
- **Category** — information-architecture problem.
- **What the page actually is** — determined from `inbox-projection.ts` and
  `page.tsx:74-93`: it lists **every entry the user has ever captured**, newest
  first, paginated, each with a product state (`saved · organizing · needs_attention ·
  ready · could_not_organize`). Nothing leaves it; there is no archive, no "done",
  no zero state to reach. Its own heading already says
  "Tudo que você confiou ao Brain" — *everything* you entrusted to Brain.
  So it is **all records**, not raw captures, not unprocessed entries, and not a
  to-organize queue. The to-organize queue is the `?view=needs-you` tab inside it.
- **Evidence** — nav label `Caixa` (`messages.ts:8`) vs page title
  `Caixa de entrada` (`page.tsx:49`) vs `attentionStatusHint` "A Caixa mostra as
  decisões pendentes" (`messages.ts:58`) — three different mental models for one
  route, one of which ("Caixa shows pending decisions") describes only the sub-tab.
- **Root cause** — a name borrowed from email applied to an append-only archive.
- **Recommendation** — **Registros** (pt-BR) / **Records** (en), with the needs-you
  tab promoted out of it into the attention surface (UX-02). "Caixa de entrada"
  and "Capturas" are both wrong for a list nothing ever leaves; "Para organizar"
  describes only the sub-tab. Per the standing instruction I will not rename without
  making the page's function match the name, so the rename ships together with
  removing the "pending decisions" framing from `attentionStatusHint`.
- **Contracts affected** — `messages.ts`, page copy, `foundation.spec.ts` (asserts
  Portuguese headings), `capabilities.ts` route key stays `inbox` so no URL changes.
- **Slice** — B.
- **Disposition** — **BLOCKED on DEC-1** (permanent navigation taxonomy — explicitly an owner gate).

## UX-04 — Entry detail hides "what was created" behind interpretation vocabulary

- **Route** — `/[locale]/app/inbox/[entryId]`.
- **Category** — interaction-model problem.
- **Evidence (`M1`)** — `entry-review.tsx:165-177` composes, in order:
  `ReviewUnderstanding` (eyebrow **"INTERPRETAÇÃO DO BRAIN"**), `ReviewAttention`,
  `ReviewNextActions`, `CandidateOutcomeHistory`, `OriginalRecord` (collapsed
  `<details>` **unless** there is no interpretation), then `TechnicalDetails`.
  Against the owner's six questions:

  | Should be clearly separated | Today |
  | --- | --- |
  | what the user wrote | present, but **collapsed by default** behind "Ver registro original" |
  | what the Brain interpreted | present and dominant (it is the `<h1>`) |
  | which objects/tasks were created | only as `materializedTasks` inside the candidate form's success state; **no persistent list**, and the created task is not linkable (UX-05/UX-19) |
  | people, projects, context detected | inside `TechnicalDetails`, i.e. behind a disclosure named "technical" |
  | outstanding questions | present |
  | history and provenance | inside `TechnicalDetails` |
  | available actions | present |

- **Root cause** — the page is organised around the *interpretation object* rather
  than the user's question "what happened to what I wrote?". Detected entities and
  provenance were classified as technical detail; created tasks were treated as a
  transient success message rather than a standing fact about the entry.
- **Proposed solution** — reorder to: what you wrote (open) → what Brain understood →
  **what now exists because of it** (linked tasks, reminders, entities, memories) →
  what is still open → history. Move detected people/projects/contexts out of
  `TechnicalDetails` into the record; leave model ids, scores and trust policies
  behind the disclosure, which is where technical detail belongs.
- **Contracts affected** — `review-projection.ts` gains a created-objects projection
  (read-only); no write path touched.
- **Slice** — D.
- **Disposition** — OPEN.

## UX-06 — The assistant name is persisted but has no field and no consumer

- **Route** — `/[locale]/app/settings` and every surface that says "Brain".
- **Category** — usability problem (and a false premise worth correcting).
- **Evidence (`M1`)** — the owner's premise is that a setting exists and is ignored.
  What the repository shows is different and more specific:
  - `agent_preferences.agent_name text not null default 'Brain' check (char_length between 1 and 60)` — `202607160001_phase1_identity.sql:19`.
  - `save_profile_settings` accepts and writes it; `buildSettingsPayload` (`settings-payload.ts:46`) passes the **stored** value straight back through on every save so it is preserved.
  - `settings-form.tsx` renders **no input for it** — grep for `agentName` across `src/` returns only the payload pass-through, `lib/preferences.ts:13` and tests.
  - `capabilities.ts:21` already records it honestly: `{ key: "identity_names", state: "future", consumerEvidence: [], visible: false }`.
  - Meanwhile "Brain" appears as a hardcoded literal **82 times** across 26 files, mixing three distinct referents: the product (`My Brain`, `manifest.ts`), the nav destination for chat (`messages.ts:16` — the *page* is called "Brain"), and the assistant as an actor ("O Brain organiza…", "Pergunte ao Brain").
- **Root cause** — a persisted domain field with no UI and no consumer, plus a product
  name and an actor name that share one string.
- **Recommendation** — separate the two referents first: the product stays "My Brain";
  the **actor** becomes the configured name, defaulting to "Brain"; the chat
  destination is renamed to something that is a place rather than a persona
  (e.g. "Conversar"/"Talk"), which also removes the "Brain" nav-label collision.
  Then add the field and thread the actor name through a single accessor so there is
  one place to read it.
- **Contracts affected** — `save_profile_settings` (already accepts it),
  `settings-contracts.ts`, `settings-payload.ts`, `capabilities.ts` (`identity_names`
  moves `future → operational`, `visible: true`), plus every copy module.
- **Slice** — B (nav label) + F (the field and the accessor).
- **Disposition** — **BLOCKED on DEC-2** (surface the name vs remove the column — a core mental-model and feature-removal decision).

## UX-07 — The Brain page stacks three competing AI input surfaces

- **Route** — `/[locale]/app/chat`.
- **Category** — interaction-model problem.
- **Evidence (`M1`)** — `chat/page.tsx:26` mounts, in this order:
  1. `ConversationalQuestions mode="proactive"` — cards, each with its own answer field;
  2. `CommandConsole` — eyebrow **"COMANDOS"**, label **"O que mudou?"**, placeholder *"ex.: marque a tarefa do relatório como feita"*, single-line `<input>`, submit "Enviar";
  3. `ChatForm` — a 105 px-tall `<textarea>`, placeholder *"Pergunte sobre seus registros, pessoas, projetos ou pendências…"*.

  So there are **three** AI-backed inputs, not two, and the user must classify their
  own intent before typing. The same console is also mounted on Work
  (`work-view.tsx:77`), so "change a task" has two entry points with different
  surrounding context.
- **Root cause** — each capability shipped with its own surface; nothing ever merged them.
- **Proposed solution (for DEC-3)** — one composer that routes. The routing evidence
  already exists and is cheap: `matching.ts` + `preview.ts` already decide whether an
  utterance is a task command, and already return `not_a_task_command` as a declared
  model outcome (`TASK_COMMAND_MODEL_UNSUPPORTED_REASONS`, `taxonomy.ts:93`). So a
  unified composer can try the command path, and on `not_a_task_command` fall through
  to the knowledge answer — with no new model call in the common case and no new write
  path. Destructive commands keep their existing confirmation dialog, which is the
  one place where an explicit mode is justified by safety rather than by convenience.
- **Contracts affected** — none written; `runTaskCommand` and `sendChatMessage` are
  both consumed. Analytics: `task_command_applied.commandOrigin` currently admits only
  `['chat','work']` (`202607280061:434`) — a unified composer still reports `chat`, so
  no allowlist widens and **no migration is required**.
- **Slice** — E.
- **Disposition** — **BLOCKED on DEC-3** (core interaction model).

## UX-08 — Projects: create-by-name only, and no edit path at all

- **Route** — `/[locale]/app/projects`, `/projects/[projectId]`.
- **Category** — missing lifecycle action, with a genuine domain gap behind part of it.
- **Evidence (`M1`)** — creation is `InlineCreateForm` → `createRecord`, which inserts
  `{user_id, name}` only (`operations/actions.ts:155`). `description` and `status`
  exist in the table and are **never writable from the UI**. The detail page reads
  `name, description, status` and shows linked tasks, people and an entry timeline —
  so it is not empty, but nothing on it can be changed.
- **Already in the domain, unsurfaced** — `projects.description`, `projects.status`,
  `projects.organization_id` → `public.organizations(name, description)` (company),
  `person_projects.role` + temporal validity, `task_projects`, `entity_attachments`
  (files), `entity_tags`, `entry_entities` (activity).
- **Genuinely missing from the domain** — explicit purpose, start/target dates,
  free-form notes, and a life-area classification distinct from `contexts.kind`.
- **Proposed solution** — surface what exists first (edit name/description/status,
  show and set organization, show `person_projects.role`, show attachments), and only
  then ask whether purpose/dates/notes justify a migration. No field is added to make
  a form look richer.
- **Contracts affected** — project writes are currently plain RLS-scoped inserts, not
  a command path (only tasks were consolidated, in Slice 2F.4). Adding an *update*
  path is a new write surface for `projects`, so it must be a Server Action with Zod
  validation and an `audit_logs` row — matching the existing posture, not bypassing it.
- **Slice** — F.
- **Disposition** — OPEN (any schema change is DEC-4).

## UX-09 — People: create-by-name only; modelled relations unsurfaced

- **Route** — `/[locale]/app/people`, `/people/[personId]`.
- **Category** — missing lifecycle action; **mostly hidden existing capability**.
- **Evidence (`M1`)** — `createRecord` inserts `{user_id, name}` (`actions.ts:157`).
  `people` also has `notes` and `organization_id`, neither writable. The detail page
  shows linked tasks, shared projects, memories and a timeline — but not the person's
  company, not their relationship to the user, not their contexts.
- **Already in the domain, unsurfaced** — `public.person_relationships`
  (`relationship_type`, `description`, `valid_from`/`valid_until`, `confidence`) →
  relationship to the user; `people.organization_id` → company;
  `person_projects.role` → role, per project; `public.person_contexts` +
  `contexts.kind` → personal/work classification; `memories.person_id` → known facts
  (already read by the detail page); `task_people.role`; `entry_entities` → captures.
- **Genuinely missing from the domain** — a person-level (not project-level) role/title.
- **Proposed solution** — surface relationships, company, contexts and per-project
  roles; make `notes` editable; keep the memories block (already there) and label its
  provenance (UX-10).
- **Slice** — F.
- **Disposition** — OPEN (any schema change is DEC-4).

## UX-10 — Memories have no mental model, no provenance and no lifecycle

- **Route** — `/[locale]/app/memories`.
- **Category** — missing lifecycle action; **entirely hidden existing capability**.
- **Evidence (`M1`)** — `memories/page.tsx:24` renders each memory as an
  **`<article class="list-row">`** — styled with the hover border and shadow that
  every clickable row uses, but inert (see UX-20). It shows content, a kind label, a
  bare confidence percentage and an "important" badge. There is no detail view, no
  edit, no archive, no delete, no source, and no explanation of what a memory is.
  Creation is `createRecord` → `{content, kind:'fact', confidence:1}` plus an
  embedding (`actions.ts:173`) — so **every manually created memory is a `fact` with
  confidence 1** regardless of what the user typed.
- **Already in the domain, unsurfaced** — `memories.source_entry_id` (provenance —
  "where it came from", answerable today), `valid_from`/`valid_until` (archive
  without deletion, which is exactly the retention-safe lifecycle the product needs),
  `person_id`/`project_id` (how it differs from a person fact or project context —
  the distinction is *already modelled*), `sensitivity`, `kind` (10 values),
  `important`, `embedding` + `match_internal_knowledge` (when the Brain uses it — it
  is retrieved by the chat RPC).
- **"Lembre disso sempre" — is it already supported?** No, and the audit is specific
  about why. The extraction schema produces concepts, entities, candidate tasks and
  pending questions; there is **no memory candidate**, and `TASK_COMMAND_ACTIONS`
  contains no memory verb. So a conversational "remember this always" has no path
  today. Adding one means extending either the extraction contract or the command
  taxonomy — both are validated AI→domain write contracts, so this is DEC-5, not a
  UI change.
- **Proposed solution** — (1) explain what a memory is on the page; (2) show
  provenance from `source_entry_id` and link to the entry; (3) make kind/important
  choosable at creation instead of silently defaulting to `fact`/1.0; (4) archive via
  `valid_until` rather than delete; (5) state where it is used. All of that is UI over
  existing columns. The conversational path is separate (DEC-5).
- **Slice** — G.
- **Disposition** — OPEN; the conversational-memory path is BLOCKED on DEC-5.

## UX-12 — Reminders expose create only; snooze/cancel/edit are modelled but unreachable

- **Route** — `/[locale]/app/reminders`.
- **Category** — missing lifecycle action; **mostly hidden existing capability**.
- **Evidence (`M1`)** — `reminders/page.tsx:22` lists `title, remind_at, important,
  status` as inert `<article>` rows and offers **only** `ReminderForm` (create). The
  raw `status` string is printed as a badge.
- **Already in the domain, unsurfaced** — `reminders.snoozed_until` (postpone),
  `status` with `cancelled` filtered out by the query (cancel), `sent_at`,
  `task_id`/`entry_id` (linking to a task or a capture), `important`, plus
  `public.create_due_task_reminder` and the reminder side-effects that
  `apply_task_command` already maintains (`preview.ts:728` — `reopen_task` re-creates
  the reminder a completed task had).
- **Constraint respected** — physical deletion is **not** proposed. Phase 2F's
  reminder census and the Option C decision put reminders under a specific grant
  posture, and `apply_task_command` treats reminders as a maintained side-effect of
  task state. So the lifecycle offered is snooze / cancel (status) / edit
  `remind_at` — all state transitions, all auditable, none destructive.
- **Root cause** — the surface shipped as create-only in Phase 1 and was never revisited.
- **Proposed solution** — row actions for snooze, cancel and reschedule through a
  validated Server Action that writes the reminder's own columns (the current
  sanctioned posture for reminders) and records an `audit_logs` row; show the linked
  task/entry as a link; render status through a copy module (UX-21).
- **Contracts affected** — must not introduce a second reminder write path alongside
  the one `apply_task_command` maintains. The audit must confirm, before implementing,
  which reminder mutations are reserved to the command path — recorded as an
  implementation precondition for Slice G.
- **Slice** — G.
- **Disposition** — OPEN.

## UX-13 — History has no search, no filters, raw vocabulary and no link to the subject

- **Route** — `/[locale]/app/history`.
- **Category** — usability problem.
- **Evidence (`M1`)** — `history/page.tsx:17` selects
  `id, action_type, entity_type, actor, reason, created_at` from `audit_logs`, ordered
  by date, paginated 20 at a time, and renders `action_type.replaceAll("_", " ")` as
  the heading with `actor · entity_type · date` beneath. No search input, no date
  filter, no type filter, no entity filter, and **no link to the affected object**.
- **Already in the domain, unsurfaced** — `audit_logs.entity_id` and `entity_type`
  (enough to build the link), `before_state`/`after_state` (enough to describe the
  change concretely instead of printing an enum), `source_entry_id` (provenance).
  `actor` already distinguishes user / agent / system — the page prints the raw value
  rather than styling the distinction.
- **Proposed solution** — text search over `reason`, date range, actor filter
  (you / Brain / system, as three explicit affordances), type filter, entity filter;
  human sentences generated from `action_type` + `before_state`/`after_state` through
  a copy module; and a link to the subject.
- **Contracts affected** — read-only. Needs indexes if search is server-side —
  index additions are additive migrations, still DEC-4 territory if they change the
  schema, so the first cut filters on already-indexed columns.
- **Slice** — G.
- **Disposition** — OPEN.

## UX-17 — The side rail clips its last nav item at 1440×900

- **Evidence** — `harness-home-pt__desktop-1440.png`: the `PREFERÊNCIAS` group label
  is cut by the rail's bottom edge and **`Configurações` is not visible at all**.
  `.side-rail{position:sticky;top:0;height:100vh;padding:28px 18px}` (`globals.css:14`)
  with `.side-nav{overflow-y:auto;scrollbar-width:thin}`
  (`mobile-navigation.css:10-16`): 15 items plus 5 group labels plus brand exceed
  900 px, and the thin scrollbar gives no visible cue.
- **Category** — visual defect. **Fixed as a by-product of UX-01** (fewer visible
  items), but recorded separately so it is verified separately at 1440×900 — the most
  common laptop height.
- **Slice** — A (guard) / B (structural fix). **Disposition** — OPEN.

## UX-18 — Home panel kickers are hardcoded Portuguese in both locales

- **Evidence** — `home-dashboard.tsx:56-61` contains the literals
  `"01 / AGORA"`, `"02 / PRECISA DE VOCÊ"`, `"03 / CONTEXTO"`, `"04 / CLAREZA"`,
  `"06 / RECENTE"`; only `05` is localized (`{pt ? "ESTADO" : "STATUS"}`). Visible in
  `harness-home-en__desktop-1440.png`: an English user sees `PRECISA DE VOCÊ`.
- **Category** — localization problem. Resolved by UX-02 removing the kickers, but
  recorded so the English render is explicitly re-verified.
- **Slice** — C. **Disposition** — OPEN.

## UX-19 — `open_task` is a declared, localized action with no producer and no route

- **Evidence** — `contracts.ts:31` declares `open_task` in `dailyCycleActions`;
  `copy.ts:47,97` localize it as "Abrir tarefa" / "Open task". Grep across `src/` and
  `supabase/` finds **no projection that emits it** and **no route that could satisfy
  it** — there is no `work/[taskId]`. The contract anticipated the task detail view
  that UX-05 says was never built.
- **Category** — interaction-model problem (dead contract surface).
- **Proposed solution** — UX-05's detail route gives `open_task` a real destination and
  the projections start emitting it. If DEC on UX-05 went the other way, the action and
  its copy would be deleted rather than left dangling.
- **Slice** — D. **Disposition** — OPEN.

## UX-20 — Rows styled as interactive are inert

- **Evidence** — `.list-row` carries `:hover{border-color:#b1bfd2;box-shadow:…}`
  (`operations.css:3`), the same affordance every clickable row uses. Rendered as
  **`<article>`** (not a link) on `/app/memories` (`page.tsx:24`) and
  `/app/reminders` (`page.tsx:22`), and as `<article>` for each task on Work
  (`task-list.tsx:156`). Relations inside a task row are inert `<span>`s. Also
  `person`/`project` mini-list rows on the detail pages: project→person links exist,
  but `tasks` render as bare `<article>` with no link (`people/[personId]/page.tsx:40`).
- **Category** — usability problem; directly violates "objects that look actionable must be actionable".
- **Proposed solution** — either give the row a destination (UX-05, UX-10, UX-12) or
  remove the hover affordance. No placeholder controls.
- **Slice** — A (affordance audit) then D/F/G (destinations). **Disposition** — OPEN.

## UX-21 — Raw database enum values rendered as user-facing labels

- **Evidence** — `projects/page.tsx:23` `{project.status}`;
  `projects/[projectId]/page.tsx:38` `{project.status.toUpperCase()}` as the eyebrow;
  `reminders/page.tsx:22` `{item.status}`; `people/[personId]/page.tsx:40`
  `{task.status}` and `{memory.kind}`; `history/page.tsx:20`
  `{item.action_type.replaceAll("_"," ")}`, `{item.actor}`, `{item.entity_type}`;
  `memories/page.tsx:24` falls back to `memory.kind.replaceAll("_"," ")` for English
  while Portuguese gets a hand-written map at line 11 — so English users see
  `recurring info`, `professional context`.
- **Category** — localization problem (and it exposes database terminology, which the
  principles prohibit).
- **Proposed solution** — one typed copy module per vocabulary, in the
  `daily-cycle/copy.ts` shape the standards name as canonical, with exhaustiveness
  tests so a new enum value cannot ship unlabelled.
- **Slice** — A (mechanical, low risk) with the vocabularies each slice touches.
- **Disposition** — OPEN.

## UX-22 — 305 inline locale ternaries bypass the mandated copy mechanism

- **Evidence** — `grep -oE '\bpt \?'` over non-test `src/` → **305** occurrences.
  Worst: `settings-form.tsx` (52), `costs/page.tsx` (37), `technical-details.tsx` (13),
  `inbox/page.tsx` (13), `people/[personId]/page.tsx` (11), `task-list.tsx` (10).
  `CLAUDE.md` and `docs/ENGINEERING_STANDARDS.md` both state that copy goes through
  the i18n system, "not scattered locale ternaries", and name the typed feature
  `copy.ts` module as canonical (ADR-036).
- **Category** — localization problem / standards debt. It is also the mechanism
  behind UX-18 and UX-21.
- **Proposed solution** — do **not** open a 305-site sweep as its own change. Each
  remediation slice converts the copy in the files it already touches, and a guard
  test caps the count so it can only go down. Report the count each slice.
- **Slice** — every slice, with the counter as the gate. **Disposition** — OPEN.

## UX-23 — The `Mais` overlay cannot be dismissed by tapping outside it

- **Evidence** — `navigation-links.tsx:150-175` uses a bare `<details>`; the only
  closers are `Escape` (`closeMobileMoreWithEscape`) and clicking a link inside
  (`closeMobileMore`). There is no outside-click handler and no backdrop
  (`mobile-navigation.css:120-135` gives the menu a shadow, not a scrim). On a phone,
  tapping the page to dismiss it does nothing.
- **Category** — usability / accessibility problem. Focus is returned to the summary
  on `Escape`, which is correct and should be preserved.
- **Slice** — B (or H if UX-01 replaces the overlay entirely). **Disposition** — OPEN.

## UX-24 — Touch targets: does not reproduce

- **Owner listed** — "touch targets" under finding 14.
- **Measured** — at 375×667 and 412×915, across `.bottom-nav a`, `.mobile-more summary`,
  `.row-action` and `.work-view-tabs a`: **zero elements below 44×44 px**.
  `mobile-navigation.css:81-93` sets `min-width/min-height:44px` on the bottom nav,
  `operations.css:49,58,63` set `min-height:44px` on the tab pills and Work row
  actions. Horizontal overflow is also **zero** at every viewport tested.
- **Disposition** — **RETAINED** (verified good). Recorded so later slices must keep
  it true; the four-viewport check stays in the evidence script as a regression guard.

## UX-26 — No logout or account switch exists anywhere in the product

- **Owner observation** — "The application has no visible logout or account-switch action. The owner currently cannot leave the active session to sign in with another account."
- **Route** — global; the shell (`app-shell.tsx`) and `/[locale]/app/settings`.
- **Category** — missing lifecycle action (P0: the user cannot leave a state they can enter).
- **Reproduction** — signed in against the real application and swept **all 16 authenticated
  routes**, matching every `<a>`, `<button>` and `<summary>` against
  `/\bsair\b|logout|sign ?out|encerrar sess|trocar conta|switch account/i`.
- **Evidence** — **0 of 16 routes** offer any way to end the session:
  `app`, `inbox`, `work`, `chat`, `projects`, `people`, `memories`, `files`, `reviews`,
  `questions`, `reminders`, `history`, `costs`, `notifications`, `settings`, `capture`.
  The sweep's screenshots are **deliberately not committed**: they are frames of a live
  signed-in session, and the measurement above is the evidence that matters. The sweep is
  reproducible from the description in this entry.
- **Root cause (`M1`)** — the auth feature shipped sign-in, sign-up, recovery and reset
  (`src/features/auth/actions.ts`) and **never a sign-out**. There is no
  `supabase.auth.signOut()` call anywhere in `src/`. The shell's top bar carries only the
  locale switch and a notifications link; there is no account menu on either surface, and
  the rail's profile chip (`.profile-chip` in `globals.css:14`) is styled but never
  rendered. `src/proxy.ts` redirects an unauthenticated visitor to login, so an expired
  session already lands correctly — what is missing is the deliberate exit.
- **Proposed solution** — an account menu anchored in the top bar on desktop and reachable
  from the mobile `Mais` overflow, holding the signed-in identity and a sign-out action:
  a Server Action calling `supabase.auth.signOut()`, then `redirect` to
  `/${locale}/auth/login`. A `<form>`-submitted button rather than a link, so it cannot be
  triggered by prefetch or by a crawler following an href.
- **Contracts affected** — none written. Adds one Server Action; session cookies are
  cleared by the Supabase SSR client the proxy already uses.
- **Required behaviours to cover** — desktop placement · mobile placement · session
  termination · redirect after logout · keyboard reachability and focus · screen-reader
  naming · already-expired session (must not error) · signing in as a different account
  afterwards · authenticated E2E for logout **and** the subsequent login.
- **Slice** — **D3**, scheduled before final authenticated acceptance per the owner's
  instruction.
- **Disposition** — OPEN.

---

## Blockers

**BLOCK-1 — RESOLVED (2026-07-30).** A dedicated confirmed test account was supplied by the
owner. The existing authenticated harness had **no variable names for a pre-existing
account** — `e2e/online-auth.spec.ts` and `e2e/online-mobile-navigation.spec.ts` mint
throwaway users through the Supabase admin API with `ONLINE_SUPABASE_SERVICE_ROLE_KEY`, and
`scripts/online-playwright.mjs` supplies that from the Supabase CLI link rather than from
`.env.local`. Two new names were therefore introduced, following the harness's own
`ONLINE_AUTH_TEST_*` convention: **`ONLINE_AUTH_TEST_EMAIL`** and
**`ONLINE_AUTH_TEST_PASSWORD`**, held only in `.env.local`, which `.gitignore:37` (`.env*`)
excludes and which is confirmed untracked. No service-role key was needed or requested.
Sign-in verified against the running application. The values appear in no tracked file, no
report, no screenshot and no PR.

**BLOCK-1 (historical) — no authenticated session available.**
`.env.local` has no `SUPABASE_SERVICE_ROLE_KEY`, and `signUp` ends at
`check-email`, so no session can be established locally. Consequence: the audit
photographed the real components and real CSS through the harness, but not the real
authenticated pages with the owner's own data. Affects final acceptance evidence for
UX-04, UX-11, UX-13 and any finding whose after-state needs live rows.
**Unblocked by** either a throwaway test account's credentials, or
`SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (which `e2e/online-auth.spec.ts` already
knows how to use to mint a confirmed user), or the owner running the journeys.
Everything not dependent on it proceeds meanwhile.

---

## Owner decisions required

Stated in full with options, recommendation, impact, reversibility and what is blocked.

**DEC-1 — the record surface's name and the navigation taxonomy** (UX-03, UX-01).
Renaming a permanent destination is explicitly an owner gate.
Options: (a) **Registros / Records** with the needs-you tab promoted into the
attention surface — *recommended*, because it is what the page provably is and the
heading already says so; (b) keep **Caixa** and change the page to be a real inbox
things leave, which means inventing an archive action and a zero state;
(c) **Capturas / Captures**, which is wrong for a list that also holds interpreted,
confirmed and failed records.
Impact: nav label, page copy, `foundation.spec.ts`; URL stays `/app/inbox`.
Reversible: yes, copy-level. Blocks: UX-03, and the labelling half of UX-01.

**DEC-2 — the assistant name** (UX-06).
Options: (a) **ship the field and thread the actor name through**, keeping the product
"My Brain" and renaming the chat destination so it stops competing — *recommended*;
(b) **remove `agent_name`** and drop the personalization idea (a feature removal, and
a migration); (c) leave it dormant and document it as deliberately unshipped.
Impact: `settings-form`, `settings-contracts`, `capabilities.ts`, all copy modules.
Reversible: (a) and (c) yes; (b) no. Blocks: UX-06.

**DEC-3 — one composer or two** (UX-07).
Options: (a) **unified composer** that tries the command path and falls through to the
knowledge answer on the already-declared `not_a_task_command` outcome, keeping the
destructive-confirmation dialog — *recommended*, no new write path, no migration;
(b) keep two inputs with clearer labels; (c) unified composer with an explicit
override toggle.
Impact: `/app/chat`, `/app/work` mounts; no contract written.
Reversible: yes. Blocks: UX-07 and Slice E.

**DEC-4 — schema changes for projects and people** (UX-08, UX-09).
Only after the existing columns are surfaced. Candidates: project purpose/dates/notes;
a person-level role. Recommendation: **defer the decision until Slice F has shipped
the existing-column UI**, then decide against real use. Reversible: additive
migrations are, but they are still permanent schema. Blocks: only the *new-field* part.

**DEC-5 — conversational memory creation** (UX-10).
"Lembre disso sempre" has no path today. Options: (a) extend the **extraction**
contract with a memory candidate that the user confirms — *recommended*, it reuses the
existing confirm-before-write pattern; (b) add a memory verb to the **command**
taxonomy; (c) leave it to the manual form.
Impact: a validated AI→domain write contract either way. Reversible: contract
versions are, shipped rows are not. Blocks: only the conversational path.

---

## Remediation slice sequence

Dependency-ordered from repository truth. A and B unblock everything visual; D is the
largest single product gain and depends only on A.

| Slice | Covers | Non-goals | Backend impact |
| --- | --- | --- | --- |
| **A — responsive foundations** | UX-15, UX-16, UX-14, UX-17 (guard), UX-20 (affordance audit), UX-21 (start) | no IA change, no new routes | none |
| **B — navigation & IA** | UX-01, UX-03†, UX-06 (nav label)†, UX-23 | no page-content redesign | `capabilities.ts` registry only |
| **C — home attention surface** | UX-02, UX-18 | no new projections | consumes existing projections |
| **D — entry & task detail** | UX-05, UX-04, UX-19 | no new write path | consumes `apply_task_command` |
| **E — unified composer** | UX-07† | no second chat | none written |
| **F — projects, people, naming** | UX-08, UX-09, UX-06† | no schema change without DEC-4 | new validated update actions |
| **G — memories, reminders, questions, history** | UX-10, UX-12, UX-11, UX-13 | no physical deletion | respects reminder grant posture |
| **H — mobile convergence & closeout** | UX-14 (remainder), re-audit of all 24 | — | none |

† gated on an owner decision.

Each slice carries: findings covered · non-goals · affected files · backend-contract
impact · accessibility requirements · desktop **and** mobile acceptance criteria ·
automated tests · visual validation at four viewports in both locales ·
rollback boundary.

---

## Change log for this ledger

| Date | Entry |
| --- | --- |
| 2026-07-30 | Audit 1. 24 findings recorded (14 owner + 10 discovered). UX-24 dispositioned RETAINED. UX-03/06/07 BLOCKED on DEC-1/2/3. BLOCK-1 raised. Baseline evidence captured at four viewports in both locales. |
| 2026-07-30 | **Slice A merged-ready.** UX-15, UX-16, UX-20 RESOLVED; UX-14 resolved except exact FAB centring (→ B). UX-25 raised and DEFERRED to C. UX-17 and UX-21 reassigned out of A (see below). |

---

# Slice A — responsive foundations

**Branch** `codex/ux-slice-a-responsive-foundations`. **Covers** UX-15, UX-16, UX-14, UX-20.
**Non-goals** — no information-architecture change, no new route, no copy rewrite, no
backend contract touched. **Backend impact** — none; two stylesheets and one new spec.
**Rollback boundary** — reverting the two CSS files restores the previous rendering
exactly; the spec fails loudly if that happens, which is the point.

### Scope changes made during the slice, and why

- **UX-17 moved to Slice B.** The guard I wrote for it passed *before* the fix, because
  the test document substitutes system fonts for Manrope and the rail becomes short
  enough to fit. A test that passes for the wrong reason is worse than no test, so it
  was removed rather than kept. The real remedy is rendering fewer destinations, which
  is Slice B's job.
- **UX-21 moved to its owning slices.** Converting every raw enum label is a wide,
  low-risk sweep that would have doubled this slice's diff and mixed a copy change into
  a layout change. Each slice now converts the vocabularies it touches.

### Result, measured in the real app at four viewports in both locales

| Measurement | Before | After |
| --- | --- | --- |
| Attention-panel title, 1440×900, pt-BR | 78 px column · 10 lines · **9.4 chars/line** | 348 px · 2 lines · **47.0 chars/line** |
| Attention-panel title, 1920×1080, pt-BR | 58 px · 16 lines · **5.9 chars/line** | 348 px · 2 lines · **47.0 chars/line** |
| Attention-panel title, 1920×1080, en | 62 px · 10 lines · **8.5 chars/line** | 348 px · 2 lines · **42.5 chars/line** |
| Content width 1440 → 1920 | 1036 px → **988 px** (shrinks) | 1052 px → **1052 px** (stable) |
| Mobile nav visual order | `Início · Caixa · Brain · Mais · [+] · Trabalho` | **matches DOM order** |
| Capture button, 375 wide | centre **x=273** (5th of 6) | centre **x=159** (3rd of 6) |
| `.bottom-nav` bottom padding | `12px`, no device inset | `calc(12px + env(safe-area-inset-bottom,0px))` |
| Horizontal overflow, all viewports | none | none |
| Touch targets below 44 px | none | none |

### Changes

- `src/app/globals.css` — `--gutter: clamp(18px,5vw,64px)` replaces the bare `5vw` on
  `.dashboard`, `.content-page`, `.settings-page` and `.top-bar` (UX-16). Deleted the
  stale `.bottom-nav .capture-fab{order:2}` and `.bottom-nav>a:nth-child(3|4){order:3|4}`
  declarations (UX-14). `.bottom-nav` gains the safe-area inset and `min-height` in place
  of a fixed `height`, so the inset adds rather than squeezes.
- `src/app/operations.css` — `.list-meta` gains `min-width:0` and `flex-wrap:wrap` so the
  `auto` track can no longer starve the title; `.list-stack` and `.dashboard-recent-list`
  become inline-size containers and a `@container (max-width: 700px)` rule stacks the row
  (UX-15). `.list-row:hover` narrowed to `a.list-row:hover` (UX-20). `.dashboard-task`
  hardened against the same starvation.
- `e2e/layout-contracts.spec.ts` — new. 13 assertions across four viewports, run by both
  Playwright projects. All 6 relevant assertions failed before the fix and pass after.

### Gates

`eslint` 0 · `tsc --noEmit` 0 · `vitest` 2522 passed / **2 pre-existing failures**
(`sql-reachability.test.ts`, a CRLF-sensitive regex over a SQL migration — reproduced on
unmodified `main`, Windows-local only, CI runs on LF) · `next build` passes ·
`playwright foundation + layout-contracts` 26/26 on desktop **and** mobile.

### UX-25 — Home grew ~24 % taller as a consequence of this fix

Recorded rather than hidden. Page height at 1440×900 went **2106 px → 2617 px**: rows
that used to compress the title into a 78 px column now use the row's full width and put
the meta line beneath it, so each row is taller. The text is readable; the page is longer.
The underlying cause is UX-02 — a six-panel magazine grid that puts lists into 359–593 px
side panels and reserves `min-height:392px` for a panel that is often empty. Slice C
replaces that grid, which removes both the voids and the height. Fixing it inside Slice A
would have meant redesigning Home under a stylesheet-only change.
**Disposition — DEFERRED, destination Slice C**, re-measured there.

### Still open after this slice

UX-14's exact FAB centring needs the bar to carry an odd number of slots, which is a
navigation-taxonomy question (Slice B). The spec currently asserts the middle third and
will be tightened to dead centre when B decides the primary count.

---

# Slice B — navigation and information architecture

**Branch** `codex/ux-slice-b-navigation`, stacked on Slice A. **Covers** UX-01, UX-17, UX-23.
**Non-goals** — no rename (DEC-1), no page-content change, no route added or removed, no
change to which destinations exist. **Backend impact** — none. **Rollback boundary** —
reverting `navigation-links.tsx` and the `.side-more` block restores the previous rail
exactly; four component tests fail loudly if that happens.

### What changed, and why it is not a taxonomy decision

`capabilities.ts:71-88` has always declared a `primary | more | global | context-only`
visibility for every destination. Mobile honoured it; the desktop rail did not, mapping
`primaryNavigationKeys` **and** all of `moreNavigationGroups` inline. So the rail was not
expressing a different design — it was ignoring the one already in the repository. This
slice makes desktop honour the same field, which is why it does not need DEC-1: it changes
**where** destinations render, never **which** exist or what they are called.

The two surfaces now share one `NavigationOverflow` component, so the disclosure's
behaviour is written once instead of twice.

### Result, measured in the real app with the real fonts

| | Before | After |
| --- | --- | --- |
| Desktop rail, nothing expanded | **15 links** (`Início … Configurações`) | **6** — the four primary, capture, and `Mais` |
| `Configurações` at 1440×900 | **not visible at all**, below the rail's fold | visible; nothing below the fold |
| Desktop rail expanded | n/a | 15 links; the rail scrolls (943 px of content in 780 px), which is now a deliberate act rather than the default state |
| Mobile bar, nothing expanded | 6 slots | 6 slots (unchanged) |
| Dismiss the panel by tapping outside | **no** on both surfaces | **yes** on both |
| Escape closes and returns focus to the summary | mobile only | both surfaces |

### Changes

- `src/features/shell/navigation-links.tsx` — new `NavigationOverflow`, used by both
  surfaces. Adds outside-`pointerdown` dismissal (UX-23; `pointerdown` rather than `click`
  so the panel is gone before the tap resolves, instead of the press landing on whatever
  the panel covered). Desktop renders the primary group, capture, then the disclosure.
- `src/app/mobile-navigation.css` — `.side-more` / `.side-more-menu`. Expands inline
  rather than as a floating panel: the rail is already the scroll container, so an
  absolutely positioned overlay would have to escape it and handle its own collisions for
  no gain.
- `src/features/shell/app-shell.test.tsx` — four new tests; three failed before the change.

### A change made and then reverted, recorded because the reasoning matters

I first made the panel `scrollIntoView` on open, so the last three destinations would not
sit below the rail's fold. The screenshot showed why that was wrong: it scrolled the four
**primary** links off the top, so expanding `Mais` cost the user their main navigation. It
was reverted. A rail that scrolls after the user deliberately expands it is ordinary; the
defect in UX-17 was that it scrolled on the **default** view, and that is fixed.

### Gates

`eslint` 0 · `tsc --noEmit` 0 · `next build` passes (and no longer emits a `ux-harness`
route — see below) · `vitest` 2526 passed with the same 2 pre-existing
`sql-reachability.test.ts` failures · `playwright foundation + layout-contracts` 26/26 on
desktop and mobile · real-browser check of both surfaces at 1440×900 and 375×667 for
visible-when-closed, reachable-when-open, outside dismissal, Escape and focus return.

### Note on the audit harness

`src/app/[locale]/ux-harness/` is **not committed**. It was restored locally to take these
screenshots and removed again: `next build` lists it as a route in the production manifest
even though it `notFound()`s in production, and audit tooling should not appear in the
shipped route table. The durable guard is `e2e/layout-contracts.spec.ts`, which needs no
route. The harness is reproducible from the "How the audit was performed" section above.

### Still open after this slice

UX-14's exact FAB centring is **still gated**. Centring slot 3 of 6 is geometrically
impossible; it needs the bar to carry an even number of non-capture items, which means
demoting one primary destination — a taxonomy decision, i.e. DEC-1.

---

# Slice C — Home as an attention surface

**Branch** `codex/ux-slice-c-home`, stacked on Slice B. **Covers** UX-02, UX-18; resolves
UX-25's disposition. **Non-goals** — no new projection, no new route, no rename, no
backend contract touched. **Rollback boundary** — `home-dashboard.tsx` is the only
production consumer of `home-view.tsx` and `home-copy.ts`; deleting the two and restoring
the previous component reverts the surface completely.

### The page now answers the owner's five questions, in that order

The previous Home was a `1.4fr 1fr` magazine grid of six fixed panels, numbered `01 / AGORA`
through `06 / RECENTE`, in which the panel holding the most text was also the narrowest and
`min-height: 392px` reserved a void for the panel that most often had nothing in it.

| The owner's question | Where it is answered now |
| --- | --- |
| What requires action now? | `Precisa de você`, first section, and the status line under the greeting |
| What does the Brain need from me? | same section — attention items and open questions are one queue, not two panels |
| What is blocked? | `Aguardando outras pessoas`, rendered **only when the count is above zero** |
| What can I act on immediately? | `Para hoje`, from the same Work `today` projection as before |
| What changed recently? | `Registrado recentemente` |

The `Estado agora` panel is gone. It restated the count the section below already carries,
which is repetition without value; the same signal is now one sentence under the greeting.

### Measured at 1440×900 and 412×915

| | Desktop 1440×900 | Pixel 7 412×915 |
| --- | --- | --- |
| Status line (`2 itens precisam de você.`) | y=415 | y=280 |
| **First attention item fully legible** | **y=884 — above the fold** | **y=806 — above the fold** |
| `Precisa de você` section | y=717, 310 px tall | y=568, 410 px tall |
| Home block height | 1981 px | 2157 px |
| Sections rendered when everything is empty | 3 (attention, today, recent) | 3 |

### Changes

- `src/features/shell/home-view.tsx` — new. Home's presentation as a pure component over a
  `HomeViewModel`, with **no data access**, which is what finally makes the layout
  testable: the old component loaded four projections and built its markup in the same
  function, so none of its visual behaviour had a test.
- `src/features/shell/home-copy.ts` — new typed copy module in the canonical
  `daily-cycle/copy.ts` shape (ADR-036). Home's copy moved out of `src/i18n/messages.ts`,
  which stays the shell/navigation catalogue.
- `src/features/shell/home-dashboard.tsx` — now only loads projections and builds the view
  model.
- `src/app/operations.css` — `.home-sections` / `.home-section`. Full-width stacked
  sections with no `min-height`, so a section with nothing to say collapses to its heading
  and one line.
- `src/features/shell/operational-copy.test.ts` — the forbidden-promise audit now also
  covers `home-copy.ts` and `home-view.tsx`. **Copy that leaves an audited file must not
  leave the audit with it**, and moving strings out of `home-dashboard.tsx` would have
  silently dropped them.
- `src/features/shell/home-view.test.tsx` — 9 new tests: section order, empty state,
  organizing state, truncated-count marker, English with no Portuguese leakage, and a
  destination for every section that has content.

### What I did to the existing Home tests, and why

Eight of the sixteen assertions in `home-dashboard.test.tsx` failed. I classified each
before touching it, because the standing instruction is not to preserve a design merely
because a test encodes it:

- **Thirteen were genuine contracts and all survive** — reads through the shared
  projections rather than ad-hoc queries, localized product-state labels, never rendering a
  raw internal state, honest organizing counts, the five-item bound on today's list, the
  `+` suffix that marks a truncated queue, and the canonical destinations.
- **Two encoded only the old markup**: a `.attention-count` CSS selector and an assertion
  that the analytics marker was a DOM descendant of `.attention-panel`. The contract is
  that the marker reports the count that was actually rendered — which is asserted directly
  on the call — not where it sits in the tree. Rewritten to scope by accessible role.
- **One asserted a `0` badge** next to a heading that already says nothing is waiting. That
  is the repetition UX-02 is about, so the badge is gone and the test now asserts its
  absence. The empty **sentence** is the contract, and it is still asserted.

### UX-25 — the height, honestly

Slice A recorded that Home grew ~24 % taller and named Slice C as the fix. **Slice C did
not shorten it, and I am not closing the finding by renaming it.** Home is 1981 px at
1440×900 against roughly 1400 px for the original grid.

It is nonetheless **retained deliberately, with evidence**: the original was shorter only
because it compressed a 94-character title into a 78 px column across ten lines. Full-width
rows are legible and therefore taller. What the owner actually reported — "must scroll
significantly to understand the page" — is addressed by ordering rather than by length:
the state of the day and the first item that needs them are both legible above the fold at
both viewports, where before the fold held the hero, the capture card and six panel
headings. Total height is not the metric that improved; time-to-first-answer is.

If the owner still wants the page shorter, the next lever is the hero — `clamp(42px,6vw,76px)`
over three lines occupies 230 px before anything operational — and that is a deliberate
identity choice I will not change unilaterally.

### Gates

`eslint` 0 · `tsc --noEmit` 0 · `vitest` 2535 passed with the same 2 pre-existing
`sql-reachability.test.ts` failures · shell suite 44/44 · real-browser render at four
viewports in both locales, plus the empty state.

---

# Slice D — plan and seam analysis (not yet implemented)

Recorded before writing code because D is the only slice that touches the One Write Path,
and the seam it must use is not the obvious one.

### The seam

`src/features/task-commands/work-command.ts` is the **id-authoritative** bridge from a UI
click to `public.apply_task_command`. It resolves through the deployed
`list_task_command_candidates`, selects the row **by id out of the whole result** rather
than out of the ranked/floored/capped subset (2F-SURFACE-004), projects the nineteen-key
pre-state, derives the canonical patch and applies — with **no new SQL, no new RPC and no
migration**. A task-detail surface must go through this, not around it.

The alternative that looks right and is wrong: composing a `TaskCommandIntent` and running
it through the matcher. `schema.ts:104` states the reason — target hints are "deliberately
incapable of naming a task: there is no id field, so the model cannot select the target
even if it tries." That design is correct for untrusted model output and wrong for a
detail page, which already knows the id; routing a known target through the ranker would
refuse legitimate edits whenever the row scored below `minCandidateScore` or fell outside
the top five.

### What blocks reusing `applyWorkCommand` directly

`resolveWorkCommand` builds its command from `WORK_ACTION_MAPPING[action].patch` — a
**fixed** patch, which is why it serves exactly the four status verbs. Every remaining verb
carries a *value* (a new title, a date, a priority, a relation ref). D therefore needs a
generalised sibling that takes a caller-supplied, schema-validated patch through the same
resolution and the same apply. That is a new TypeScript module, not new SQL.

### The split, and why

- **D1 — inspect (no new write path).** `/[locale]/app/work/[taskId]`: what you wrote
  (via `source_entry_id`), current field values, relations as **links**, change history
  from `audit_logs`, and the four status actions through the already-proven
  `applyWorkItemAction`. Resolves UX-19 outright (`open_task` finally has a producer and a
  destination), the inspect half of UX-05, and the task-row half of UX-20.
- **D2 — structured field edits.** The generalised composer for `rename_task`,
  `append_note`, `reschedule_due`, `clear_due`, `set_planned`, `set_priority`,
  `assign_project`, `assign_context`, `assign_person`, `set_waiting_on`. `cancel_task` and
  `restore_task` are **destructive** and must route through
  `issue_task_command_confirmation` and the existing confirm dialog — they may not be
  plain buttons.

Splitting is not a way of shipping less. It keeps a slice that adds **zero** write surface
separate from one that generalises the write path, so the first can be reviewed on its
layout and the second on its contract.

### Verification completed before writing D2 — all three answered

**1. `dueAt` — a date picker works, an instant does not.**
`resolveTemporalPhrase` **explicitly refuses a complete ISO instant**
(`temporal.ts:368`), and the comment states why: 2E-COMMAND-016 says the instant is never
model-supplied, and a raw timestamp let a model "pin a Sao Paulo user to a Tokyo offset".
For a moment this looked like an integrity-contract conflict, because a date picker was
assumed to supply an instant. **It is not one.** The lexicon carries an `explicit_date`
rule (`temporal.ts:283`) matching `ISO_DATE` — `YYYY-MM-DD`, exactly what
`<input type="date">` emits — and resolves it *in the caller's own timezone* through
`resolveLocal(..., context.timeZone)`. So the contract already anticipated this control:
the picker sends a calendar date, the lexicon owns the instant, and **no schema change, no
version bump and no migration is needed**. One bound to respect: `explicit_date` refuses a
date more than `MAX_RELATIVE_DAYS` = **730 days** from today, so the picker must clamp to
±2 years or it will produce `needs_clarification`.

**2. The action policies, read off `taxonomy.ts` — 15 policies.**

| action | patch field(s) | required | allowed values | destructive |
| --- | --- | --- | --- | --- |
| `complete_task`, `reopen_task`, `clear_due`, `restore_task` | — | — | — | no |
| `cancel_task` | — | — | — | **yes** |
| `set_status` | `status` | `status` | `ACTIVE_ONLY` (the six non-terminal statuses) | no |
| `set_priority` | `priority` | `priority` | `TASK_PRIORITIES` (low/medium/high/urgent) | no |
| `rename_task` | `title` | `title` | — | no |
| `append_note` | `note` | `note` | — | no |
| `reschedule_due` | `dueAt` | `dueAt` | — | no |
| `set_planned` | `plannedAt` | `plannedAt` | — | no |
| `assign_project` | `projectRef` | `projectRef` | — | no |
| `assign_context` | `contextRef` | `contextRef` | — | no |
| `assign_person` / `set_waiting_on` | `personRef` | `personRef` | — | no |

`set_status`'s allowed set is `ACTIVE_ONLY`, which is what structurally prevents it from
delivering a cancellation without the confirmation `cancel_task` requires. **Only
`cancel_task` is destructive**, so it alone routes through
`issue_task_command_confirmation` and the existing confirm dialog; the other ten may be
direct controls.

**3. Relation refs resolve server-side against owned entities.**
`projectRef`/`contextRef`/`personRef` are bounded strings, resolved in SQL by
`public.resolve_owned_entity_exact` and turned into a `resolvedId`
(`preview.ts:291`). A `<select>` listing the user's own projects and submitting the exact
name therefore resolves correctly, with ownership proven in the database rather than
asserted by the client — and there is no path for the UI to smuggle an id.

**Conclusion: D2 needs no owner decision, no migration and no contract change.** It is a
new TypeScript module generalising `work-command.ts`'s fixed patch to a caller-supplied,
schema-validated one, plus controls whose values the table above bounds.

Until D2 lands, UX-05 stays **partially open** with 11 verbs reachable only through the
console — recorded as such, not closed.

---

# Slice D1 — the task detail surface

**Branch** `codex/ux-slice-d1-task-detail`, stacked on Slice C. **Covers** UX-19 (fully),
the inspect half of UX-05, the task-row half of UX-20. **Non-goals** — no field editing,
no new command verbs, **no new write path**. **Rollback boundary** — deleting the route,
the projection, the view and the copy module reverts the surface; `work-projection.ts`
returns to emitting three actions instead of four.

### First slice verified against the real database

BLOCK-1 was resolved before this slice, so D1 was built and checked against the running
application with a real account and real rows, not only against fixtures. That mattered
twice — see "what running it found" below.

### What it does

`/[locale]/app/work/[taskId]` shows, in this order: what the task is (title, description,
state), the actions it admits, its fields, its relations **as links**, where it came from,
and everything recorded about it.

- **UX-19 is fully resolved.** `open_task` was declared in `contracts.ts` and localized in
  `copy.ts` from the beginning, but no projection produced it and no route could satisfy
  it. `work-projection.ts` is now the producer and this route is the destination.
- **Relations are links.** On the Work list a task's project is an inert
  `<span class="status-badge">`; here it opens the project. A **context** deliberately
  renders as plain text, because contexts have no page — a control that leads nowhere must
  not look like one that does (UX-20).
- **History is sentences.** `audit_logs.action_type` is mapped through a closed copy
  vocabulary with a neutral fallback, never `replaceAll("_", " ")`.

### No new write path, and how that is guaranteed

The status controls are the **same component** the Work list renders. `WorkItemActions` was
extracted from `task-list.tsx` and is now mounted by both surfaces, so the operation-key
discipline (2F-SURFACE-006), the idempotency handling and the outcome rendering
(2F-SURFACE-011) exist once rather than twice. Both mounts resolve through
`list_task_command_candidates` and apply through `apply_task_command`.

### What running it against the real database found

Two defects that fixtures could not have shown:

1. **The history vocabulary was wrong.** The first copy map was written from the *taxonomy*
   verbs — `set_priority`, `complete_task` — which is what the command contract uses and
   **not** what reaches `audit_logs`. The migrations actually write `task_created`,
   `task_updated`, `task_command_created`, `task_command_applied`, `tasks_confirmed`,
   `confirm_entry_tasks`, `confirm_entry_task_candidates` and `operation_undone`. A real
   history row rendered as the neutral fallback. Fixed, and
   `task-detail-view.test.tsx` now **reads the migrations** and fails if any action type
   written against a task has no copy in either locale, so the two vocabularies cannot
   drift apart again.
2. **UX-28 — `audit_logs.reason` is English prose written by SQL** ("Task created", "User
   created a task directly"). Rendering it puts untranslated text in front of a Portuguese
   reader. It is **not rendered**: for a task, every value it can hold only restates the
   action the localized sentence already names. Localizing it would mean changing what the
   RPCs write, which is a schema-level decision this surface may not take.
   **Disposition — RETAINED**, with the reason deliberately unrendered.

A measurement of my own was also wrong and is worth recording: an automated scan reported
`not_started` leaking into the page. It was inside the RSC flight payload in a `<script>`,
because the scan read `document.body.textContent`. **No raw enum reaches the user.** The
scan was the defect, not the code.

### UX-27 — one creation, two history entries

A manually created task produces **two** audit rows: the `tasks_audit_changes` trigger
writes `task_created`, and `create_task_command` writes `task_command_created`. The history
therefore shows "Você criou a tarefa" twice, seconds apart. That is a truthful rendering of
what the audit log contains, so the surface is not hiding it. Whether the *log* should
record one creation twice is a question for the history slice.
**Disposition — OPEN, destination Slice G.**

### Gates

`eslint` 0 · `tsc --noEmit` 0 · daily-cycle + operations + shell suites 283/283 ·
12 new component tests including the migration-backed vocabulary guard · verified end to
end against the real application at 1440×900 and 375×667: four sections in order, the two
eligible actions, real history rendered as sentences, no horizontal overflow on either
viewport.

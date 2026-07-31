# Product UX findings ledger

**Initiative** — Product UX/UI Remediation Loop (post-Phase 2F, pre-Phase 2G).
**Opened** — 2026-07-30.
**Baseline commit** — `0c13285` (`main`, clean tree at audit start).
**Status** — Slices A through G2 are **merged into `main`**. G3 in progress.

### Integrated slices

Every merge SHA below was confirmed green on all three CI jobs — application,
edge worker, and database and journey — before the next slice was cut from it.

| Slice | PR | Merge commit | Branch (preserved) |
| --- | --- | --- | --- |
| A — responsive foundations | #35 | `4d8e3d2` | `codex/ux-slice-a-responsive-foundations` |
| B — navigation and IA | #36 | `2c935f9` | `codex/ux-slice-b-navigation` |
| C — Home attention surface | #37 | `35ae645` | `codex/ux-slice-c-home` |
| D1 — task detail surface | #38 | `9302bc5` | `codex/ux-slice-d1-task-detail` |
| D2 — structured task commands | #39 | `4e97519` | `codex/ux-slice-d2-task-commands` |
| D3 — logout and account switching | #40 | `cf2bcb5` | `codex/ux-slice-d3-account-session` |
| B2 — Registros, FAB centring | #41 | `9d7f98f` | `codex/ux-slice-b2-registros` |
| E — the unified composer | #42 | `967e6cc` | `codex/ux-slice-e-unified-composer` |
| F1 — the assistant's name | #43 | `66d2ae0` | `codex/ux-slice-f1-assistant-name` |
| F2 — Projects and People | #44 | `558ecdd` | `codex/ux-slice-f2-projects-people` |
| G1 — the question after-state | #45 | `974c072` | `codex/ux-slice-g1-question-outcome` |
| G2 — the reminder gate (record only) | #46 | `0548e2c` | `codex/ux-slice-g2-gate` |

Merged in dependency order with the repository's normal merge-commit strategy — no squash,
no rebase, thematic commits and branch history intact. Each stacked PR was retargeted to
the updated `main` and its file list verified byte-identical before and after retargeting
(#36 26 files, #37 29 files, #38 13 files), so no reviewed semantic diff changed. `main`'s
own `push` CI was confirmed green after each merge before the next was taken:
`4d8e3d2` run 30560113300, `2c935f9` run 30560498090, `35ae645` run 30560881120.

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
| UX-01 | Navigation exposes 14 concepts before the workflow is understood | IA | P1 | yes | **RESOLVED** (labels closed in B2) |
| UX-02 | Home is editorial, not operational; large voids beside compressed content | IA | P1 | yes | **RESOLVED** |
| UX-03 | "Caixa" names a mailbox; the page is a full record list | IA | P1 | yes | **RESOLVED** (B2 — Registros / Records) |
| UX-04 | Entry detail hides "what was created" behind interpretation vocabulary | interaction-model | P1 | yes | OPEN |
| UX-05 | Tasks are not inspectable or editable; 11 of 15 domain verbs unreachable | missing-lifecycle | **P0** | yes | **RESOLVED** (D1 inspect + D2 edit) |
| UX-06 | Assistant name is persisted but has no field and no consumer | usability | P1 | yes | **RESOLVED** (Slice F1 — field, accessor, Conversar/Talk) |
| UX-07 | Brain page stacks three competing AI input surfaces | interaction-model | P1 | yes | **RESOLVED** (Slice E — one composer) |
| UX-08 | Projects: create-by-name only; no edit path at all | missing-lifecycle | P1 | yes | **RESOLVED** (Slice F2) |
| UX-09 | People: create-by-name only; modelled relations unsurfaced | missing-lifecycle | P1 | yes | **RESOLVED** (Slice F2) |
| UX-10 | Memories have no mental model, no provenance, no lifecycle | missing-lifecycle | P1 | yes | **RESOLVED** (Slice G3 — incl. DEC-5) |
| UX-11 | Pending-question resolution has no visible after-state | interaction-model | **P0** | partly | **RESOLVED** (Slice G1) |
| UX-12 | Reminders expose create only; snooze/cancel/edit modelled but unreachable | missing-lifecycle | P1 | yes | **BLOCKED on DEC-6** (grant posture) |
| UX-13 | History has no search, no filters, raw DB vocabulary, no link to subject | usability | P1 | yes | OPEN |
| UX-14 | Mobile: capture FAB mis-ordered and off-centre; no safe-area inset | responsive | **P0** | yes | **RESOLVED** (centring closed in B2) |
| UX-15 | Panel list rows collapse the title to ~6–16 lines (`auto` meta column) | visual | **P0** | yes | **RESOLVED** |
| UX-16 | Content width *shrinks* as the viewport grows (`padding: 5vw`) | responsive | **P0** | yes | **RESOLVED** |
| UX-17 | Side rail clips its last nav item at 1440×900 | visual | P1 | yes | **RESOLVED** |
| UX-18 | Home panel kickers are hardcoded Portuguese in both locales | localization | P1 | yes | **RESOLVED** |
| UX-19 | `open_task` is a declared, localized action with no producer and no route | interaction-model | P1 | yes | OPEN |
| UX-20 | Rows styled as interactive are inert (`memories`, `reminders`) | usability | P1 | yes | **RESOLVED** (affordance) |
| UX-25 | Home grew ~24 % taller as a consequence of the UX-15 fix | visual | P1 | n/a | **RETAINED** (with evidence) |
| UX-26 | No logout or account switch exists anywhere in the product | missing-lifecycle | **P0** | yes | **RESOLVED** (D3) |
| UX-30 | A revoked-but-unexpired session becomes an infinite redirect loop | missing-lifecycle | **P0** | yes | **RESOLVED** (D3) |
| UX-31 | Signing out left the shell restorable by browser Back | usability | P1 | yes | **RESOLVED** (D3) |
| UX-27 | One task creation writes two audit rows, so history shows it twice | usability | P2 | yes | OPEN → G |
| UX-28 | `audit_logs.reason` is English prose written by SQL | localization | P1 | yes | RETAINED (not rendered) |
| UX-29 | Every cancelled task's detail page answered 404 | missing-lifecycle | **P0** | yes | **RESOLVED** (D2) |
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
- **Slice** — D1 (inspect) and D2 (edit).
- **Validation** — pgTAP already covers the RPC. New: component tests per control,
  a Playwright journey (desktop + mobile, both locales) that opens a task, edits the
  due date, changes priority, reassigns a project and undoes each.
- **Disposition** — **RESOLVED** across D1 and D2.
  - D1 gave the task a page: provenance, current values, relations as links, history as
    sentences, and the four status verbs through the already-proven
    `applyWorkItemAction`.
  - D2 made the remaining eleven verbs controls. All fifteen taxonomy actions are now
    reachable by click; none reaches the database by a new route. `detail-command.ts`
    generalises `work-command.ts`'s **fixed** patch to a caller-supplied,
    schema-validated one and keeps every property of the seam — id-authoritative
    selection out of the whole resolution result, the nineteen-key pre-state and the
    observation instant from one read, and the apply through
    `public.apply_task_command`. **No SQL, no RPC, no migration, no direct task
    write, and `TASK_COMMAND_POLICY_VERSION` unchanged.**
  - The control set is **derived from `actionPolicy` and the task's status**, never
    hand-written, so a button whose only possible outcome is a refusal cannot be
    rendered (2F-SURFACE-009). `cancel_task` is the one destructive verb and routes
    through `issue_task_command_confirmation`; `set_status`'s `allowedTargetValues`
    is what structurally closes the unconfirmed route to `cancelled`.
  - See "Slice D2 — structured field edits" below for what running it found.

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
- **Slice** — G1.
- **Disposition** — **RESOLVED** in Slice G1. The after-state was already stored and is now
  reachable: a resolved tab whose filter is the exact complement of the open queue’s, an
  outcome card stating what changed and linking to where it is recorded, and the control
  renamed to the owner’s goal. No write was added.

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
- **Disposition** — **RESOLVED** in Slice B2. `Registros` / `Records` across the nav label,
  both page headings, the filter tabs' accessible name and the entry-detail back link. The
  route key stays `inbox`, so **no URL changed** and every existing link still works. The
  condition this entry set — "I will not rename without making the page's function match the
  name" — was met before the rename: Slice C promoted the needs-you queue onto Home as the
  attention surface, so what is left under this name really is the complete archive. The
  page's own eyebrow already read `REGISTROS`/`RECORDS` from Slice B; the rename makes the
  heading agree with it.

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
- **Disposition** — **RESOLVED** in Slice F1 under DEC-2 (a). The field ships, the actor name
  is threaded through one accessor, and the chat destination is now `Conversar`/`Talk` so the
  three referents no longer share a string.

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

  > **Corrected in Slice E (`E-M3`)** — "no new model call in the common case" is wrong.
  > The command parse is what *produces* the classification, so it must run first: a
  > knowledge question costs three provider calls where it costs two today. Only inputs
  > over 1000 characters avoid it, and they do so contractually rather than heuristically.
  > The rest of the proposal held up.
- **Contracts affected** — none written; `runTaskCommand` and `sendChatMessage` are
  both consumed. Analytics: `task_command_applied.commandOrigin` currently admits only
  `['chat','work']` (`202607280061:434`) — a unified composer still reports `chat`, so
  no allowlist widens and **no migration is required**.
- **Slice** — E.
- **Disposition** — **RESOLVED** in Slice E under DEC-3 (a). One composer on both chat
  routes; `ChatForm` deleted. Capture routing is carved out and deferred with a stated
  reason (`E-M5`), and the memory branch proposes without persisting (DEC-5).

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
- **Slice** — F2.
- **Disposition** — **RESOLVED** in Slice F2. Existing columns and relations are surfaced and
  editable through a validated, audited path; no column was added. Any *new* field stays a
  DEC-4 question, now answerable against real use.

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
- **Slice** — F2.
- **Disposition** — **RESOLVED** in Slice F2. Existing columns and relations are surfaced and
  editable through a validated, audited path; no column was added. Any *new* field stays a
  DEC-4 question, now answerable against real use.

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
- **Slice** — G3.
- **Disposition** — **RESOLVED** (Slice G3). Both halves shipped, including the
  conversational path — see the Slice G3 section for the correction to the
  paragraph above, which assumed DEC-5 required a new AI→domain write contract
  and was wrong about the only architecture it considered.

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
- **Slice** — G2.
- **Disposition** — **BLOCKED on DEC-6.** The precondition this finding set for
  itself was run and it stops the slice: `202607300063` revokes `update` and `delete` on
  `public.reminders` from `authenticated` and asserts that posture at deploy time, so the
  proposed Server Action cannot write. See the Slice G2 section.

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
- **Disposition** — **RESOLVED**. One account disclosure, mounted twice: the desktop rail
  foot (the `.rail-footer`/`.profile-chip` area this entry noted was styled and never
  rendered) and the top of the mobile overflow panel. It names the active account by
  **display name only**, reaches Settings as the destination it already is, and holds the
  sign-out control — so no new permanent navigation destination was added. Sign-out is a
  Server Action calling the deployed `supabase.auth.signOut()`, then redirecting to the
  localized login route with a localized confirmation. **No migration, no SQL, no auth RPC,
  and no service-role key in production code.**

  The proposed placement in this entry was the *top bar*; it ships in the **rail foot**
  instead, because the top bar holds two global affordances at 70px and an account
  disclosure opening downward from there would overlay page content, while the rail foot was
  already reserved and lets the panel open upward over navigation the user is not reading.

  See "Slice D3 — the account and session surface" below for the two defects running it
  found, one of which made the product unusable for up to an hour at a time.

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
**DECIDED 2026-07-30 — (a) Registros / Records**, shipped in Slice B2. The owner also took
the taxonomy half the option list did not cover: the mobile bar carries **four** non-capture
slots — Início · Trabalho · [Capturar] · Brain · Mais — and Registros moves into `Mais`,
because an archive and consultation surface is not an operational queue and a five-slot bar
is what lets the capture control sit exactly on the centre line. Desktop is unchanged.
**DEC-1 is closed.**

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
console — recorded as such, not closed. *(D2 has since landed; the three answers above all
held when the controls were written against them, with one correction recorded below.)*

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

---

# Slice D2 — structured field edits

**Branch** `codex/ux-slice-d2-task-commands`, stacked on `main` after D1 merged.
**Covers** the edit half of UX-05 — the eleven taxonomy verbs that were reachable only by
typing a sentence into the console. **Non-goals** — no new command verbs, no new write
path, no schema change, no policy-version bump. **Rollback boundary** — deleting
`detail-actions.ts`, `detail-controls*.ts`, `task-detail-controls.tsx` and the route's
`controls` prop reverts the surface to D1's read-only page; `detail-command.ts` becomes
consumer-less contract again.

### What it adds, and what it deliberately reuses

| New | Reused unchanged |
| --- | --- |
| `detail-controls.ts` — the control set, **derived** from `actionPolicy` + status | `list_task_command_candidates` (resolution) |
| `detail-controls-copy.ts` — labels, value labels, the four control refusals, the dialog | `apply_task_command` (the One Write Path) |
| `detail-actions.ts` — the Server Action, three intents | `issue_task_command_confirmation` (destructive gate) |
| `detail-action-state.ts` — the client-safe rendered state | `validateTaskCommand`, `loadTaskCandidates`, `toTaskPreState`, `buildCanonicalPatch`, `applyTaskCommand` |
| `task-detail-controls.tsx` — the controls, and the existing `ConfirmDialog` | `confirm-dialog.tsx`, `copy.ts`'s outcome/failure/validation vocabularies |

**Zero SQL, zero RPC, zero migration.** `TASK_COMMAND_POLICY_VERSION` is untouched, so no
stored fingerprint and no unexpired confirmation is invalidated.

### The controls are derived, not written

`detailControlsFor(status)` walks `TASK_COMMAND_ACTIONS`, drops what
`isEligibleStatus` refuses, and gives each survivor a shape read off its policy: no patch
field → a button; a bounded `targetValueField` → a closed `<select>`; a temporal field → a
date picker; a relation field → a picker over the caller's own entities; otherwise text.
A hand-written list would be a second copy of taxonomy knowledge, and its failure mode is
the one the whole contract exists to prevent — offering a control whose only possible
outcome is a refusal (2F-SURFACE-009). A sixteenth action appears automatically with the
right shape, and `detail-controls-copy.ts` is an **exhaustive record over the taxonomy's
own vocabularies**, so it cannot appear without a label in either locale.

The four status verbs the shared `WorkItemActions` already renders are excluded by name:
two routes to one transition on one screen is duplication, not redundancy.

### The destructive verb takes two calls, and that is the point

`cancel_task` sends `request_cancel`; the server resolves the row, issues the confirmation
against **that** observation, and returns the operation key and instant it was bound to.
Only then does the dialog open. Confirming sends `confirm_cancel` with the same key and the
same instant.

The instant has to travel because `public.task_command_fingerprint` hashes
`observedBefore` alongside the pre-state, so a fresh instant on the second call derives a
digest matching no issued row and the database refuses a cancellation the user genuinely
confirmed. Issuing at Confirm time instead would bind the token to whatever the form said
afterwards — which is exactly what 2E-DESTRUCTIVE-003 forbids, and what the console's own
`actions.ts` records as the reason its confirmation is minted at render time.

The carried instant is **not** authorization and is not trusted: a forged one matches no
issued row. It is nevertheless bounded server-side (`ISO`, not in the future, at most 15
minutes old), because `observedBefore` is written into the audit trail as the moment the
task was read, and a caller-chosen value there would be a recorded untruth.

Dismissing the prompt abandons the confirmation and **rotates the operation key**, so
asking again is a new request against a fresh observation. The abandoned row stays
unconsumed; only `apply_task_command` can spend it, and only against a request whose seven
values hash to the digest it stores.

### Two defects the handed-off contract layer carried, found by writing the caller

1. **`resolvedId: null` would have silently dropped every relation.**
   `detail-command.ts` copied `work-command.ts`'s `buildCanonicalPatch({ …, resolvedId:
   null })`, which is correct there — no Work verb writes a relation. Four detail verbs do,
   and with a null the canonical patch contains no `projectId`, `contextId` or `personId`
   at all: the RPC receives a patch asking for nothing, answers `no_change`, and the user is
   told their edit made no difference when it was never sent. Fixed by exporting
   `resolveRelationReference` from `preview.ts` — **one definition, two readers**, rather
   than a second action→ref-column mapping in TypeScript, which is the divergence
   `normalizer-divergence.test.ts` forbids across that directory. A reference that resolves
   to nothing (renamed elsewhere, deleted, or two entities sharing a name) is now the
   declared refusal `relation_unresolved`, rendered with the sentence `copy.refusals`
   has held since Slice 2E.4.
2. **`isSubmittableDate` accepted days that do not exist.** `explicit_date` builds a
   `WallTime` straight from the capture groups and never asks, so `2026-02-31` resolved — as
   March 3rd. A date input cannot emit one; a hand-made POST can, and silently rescheduling
   a task to a day the user did not name is worse than refusing. The control now refuses
   it, and still accepts `2028-02-29` while refusing `2027-02-29`.

A third thing was found in the component rather than the contract: the dialog's dismiss
path called `router.refresh()`, which re-fetches the server tree and leaves client state
untouched — so the dialog closed and immediately re-rendered open. `useActionState` state
changes only by dispatching, so dismissal is now local state cleared by the next dispatch.

### UX-29 — every cancelled task's detail page answered 404

**Found by running D2 against the live database, and it is a D1 defect that D2 makes
reachable.** `workItemHumanStates` had no `cancelled` member, so
`toWorkItemHumanState("cancelled")` returned null, `toWorkItemView` returned null,
`loadTaskDetailProjection` returned null and the route called `notFound()`. The
consequences compound:

- `restore_task` is the **only** action the taxonomy admits on a cancelled task, and the
  page that offers it could not be opened;
- a user who cancelled a task from the detail page — the flow D2 adds — was left on a page
  that 404s on its next load.

The missing member was **not** what kept cancelled tasks out of the lists. Every branch of
`work-projection.ts` excludes them in SQL (`.not("status","in","(completed,cancelled)")`,
`.eq("status","waiting")`, `.neq("status","cancelled")`), and the detail route is the only
other caller of `toWorkItemView` — so adding it cannot surface a cancelled task anywhere it
was not already meant to appear. The three copy maps that index the vocabulary were found
by the compiler, not by search, because all three are exhaustive records.

**Disposition — RESOLVED.** Covered by the live journey "a cancelled task offers
restoration and nothing else", which opens the page, asserts that `restore_task` is the
only control offered, restores, and reads `status` and `cancelled_at` back from the
database.

### Correction to the pre-D2 verification note above

The note says `observedBefore` is "the database's own instant, cross-joined onto every row
by the `refs` CTE". It is cross-joined by that CTE, but the value is
`coalesce(p_observed_before, now())` — i.e. **the instant the caller injected**, echoed
back. That distinction is what makes the two-call confirmation flow possible at all, and
the comment in `detail-command.ts` now says so.

### Gates

`tsc --noEmit` 0 · `eslint` 0 · `detail-command.test.ts` 38 · `detail-controls.test.ts` 25
(was 13) · `detail-actions.test.ts` 32 · `task-detail-controls.test.tsx` 26 · task-commands
+ daily-cycle + operations suites 1594/1596, the two failures being the pre-existing
Windows-CRLF regex reads in `sql-reachability.test.ts` that fail identically with this
branch's work stashed (they pass in CI on Linux) · `e2e/task-detail-commands.spec.ts`
17 tests × desktop + mobile = 34 executions, run against the linked live database in both
locales.

---

# Slice D3 — the account and session surface

**Branch** `codex/ux-slice-d3-account-session`, stacked on `main` after D2 merged.
**Covers** UX-26, and UX-30 / UX-31 which running it exposed. **Non-goals** — no new
navigation destination, no account *editing* (Settings already owns that), no migration, no
auth RPC. **Rollback boundary** — deleting `account-menu.tsx`, `account-copy.ts`,
`account-identity.ts`, the `signOut` action and the shell's two mounts reverts the surface;
the `proxy.ts` changes are independently valuable and would be kept.

### What ships

| New | Reused unchanged |
| --- | --- |
| `account-menu.tsx` — the disclosure, one component, two mounts | `supabase.auth.signOut()` (already called by `updatePassword`) |
| `account-copy.ts` — typed copy for both locales | the login page's `?message=` banner |
| `account-identity.ts` — display-name resolution, server-only | `/[locale]/app/settings` as an existing destination |
| `sign-out-state.ts` — the client-safe rendered state | `confirm-dialog`-era focus discipline, via the shared hook |
| `use-dismissable-disclosure.ts` — **extracted** from `NavigationOverflow` | `proxy.ts`'s existing redirect rules |

**Zero migration, zero SQL, zero RPC, zero service-role usage in production code.**

### The identity rule

The surface renders `profiles.display_name`, falling back to
`user_metadata.display_name`, then to a neutral localized label — and **never an email
address or a user id**. Two reasons, and the second is the load-bearing one: a display name
already answers "which account am I in" well enough to switch accounts, and an email would
put a credential-adjacent identifier into every screenshot, bug report and test artifact
that ever captures the shell. A component test and a live journey both assert the rendered
tree contains no `@` and no uuid.

### Placement, and why not the top bar

The finding proposed the top bar. It ships in the **rail foot** instead: the top bar is 70px
holding two global affordances, and a disclosure opening downward from there would overlay
page content, while `.rail-footer` was already styled-and-unrendered and lets the panel open
upward over navigation the user is not reading. On mobile the block is the **first** child of
the overflow panel, spanning both columns — that panel scrolls at 65vh, so "first" is what
makes "reachable without scrolling past product destinations" true rather than aspirational.

### Two defects running it found, one severe

**UX-30 — a revoked-but-unexpired session was an infinite redirect loop.** `proxy.ts`
verifies the JWT **locally** (`getClaims`, deliberately no network call per request) while
`requireUser` verifies it **over the network** (`getUser`). A token revoked while still
unexpired passes the first and fails the second, so the page redirected to login, the
proxy's auth-route rule redirected back into the app, and the browser gave up with
`ERR_TOO_MANY_REDIRECTS`. **For the whole remaining lifetime of the access token the product
was unusable and could not even be signed out of** — which is precisely the state
requirement 5 is about. Fixed by confirming with the provider **only on the auth-route
branch** — scoped to four low-traffic routes, and only when a claim is actually present, so
the hot path stays local-only — and by *clearing* the cookies when the two disagree rather
than ignoring them, so the stale session stops passing local verification on the next
request too. `requireUser` could not do this itself: `lib/supabase/server.ts` swallows
cookie writes, because a Server Component may not set them during render.

**UX-31 — Back restored the authenticated shell after sign-out.** Pressing Back returned the
fully rendered shell with the account surface still naming the account that had just left.
The mechanism is `Cache-Control: no-store`, which makes a document ineligible for the
back/forward cache. Two things are now true and both are asserted: `proxy.ts` sets it on
every in-app response and on the refusal redirect, and the journey asserts the header it
depends on rather than only the behaviour.

**A real difference between the two servers, recorded because it will bite again.**
`next dev` **replaces** the response's `Cache-Control` with `no-cache, must-revalidate`,
dropping `no-store`; `next start` includes `no-store` in its dynamic-rendering default. So
the Back journey passes against the production build and fails against the dev server, and
the spec says so at the top along with the command to run it. The middleware header is
therefore defence-in-depth on page documents rather than the operative value — it is the
operative value for the redirect and for RSC payloads, and it fails safe.

### Gates

`tsc --noEmit` 0 · `eslint` 0 · `npm run build` exit 0 · new coverage: `proxy.test.ts` 13
(the file had none — the boundary was covered only by browser journeys), `sign-out.test.ts`
8, `account-menu.test.tsx` 18, `app-shell.test.tsx` +7 · `e2e/account-session.spec.ts` 13
journeys × desktop + Pixel 7, run against the linked live database **on the production
build**, both locales, with two disposable accounts carrying distinct display names and
fail-closed deletion.

---

# Slice B2 — Registros, and the FAB centring DEC-1 unblocked

**Branch** `codex/ux-slice-b2-registros`, stacked on `main` after D3 merged.
**Covers** UX-03, the labelling half of UX-01, and the FAB-centring remainder of UX-14 that
Slice A recorded as gated. **Non-goals** — no URL change, no page-content change, no new
destination, no backend contract touched. **Rollback boundary** — the rename is copy-level;
reverting `mobileBarSlots` to include `inbox` and restoring `justify-content: space-evenly`
puts the old bar back.

### The rename

`Caixa` → **Registros**, `Inbox` → **Records**, across the nav label, both page headings,
the filter tabs' accessible name, the entry-detail back link, and one stale code comment.
**The route key stays `inbox`**, so no URL changed and every existing link and bookmark still
works — including `?view=needs-you`, which Slice C's Home links to.

The condition UX-03 set on itself was met *before* the rename rather than by it: "I will not
rename without making the page's function match the name." Slice C promoted the needs-you
queue onto Home as the attention surface, so what remains under this name really is the
complete archive it always was. The page's eyebrow already read `REGISTROS`/`RECORDS` from
Slice B — the rename makes the heading agree with its own kicker.

### The FAB centring, and why it needed a decision rather than a stylesheet

Slice A resolved UX-14's ordering and safe-area halves and recorded the centring as gated,
correctly: the bar carried six children with capture third, and **no distribution can put
slot 3 of 6 on the centre line.** `space-evenly` makes it worse, not better — its gaps mean
no child index coincides with 50% at any count. The layout-contract test therefore asserted
the middle *third* and said in a comment that making it exact "means changing how many
primary destinations the bar carries, which is Slice B's decision, not a stylesheet's".

The owner took that decision (2026-07-30, closing DEC-1). The mobile bar is now five slots:

| pt-BR | Início | Trabalho | **[Capturar]** | Brain | Mais |
| --- | --- | --- | --- | --- | --- |
| en | Home | Work | **[Capture]** | Brain | More |

Four destinations, two each side of capture. Five equal grid columns put the **third
column's** centre exactly on the bar's centre, so the button is centred by the layout's
arithmetic — no absolute positioning over another slot, no sixth destination added to balance
geometry, and no nudge. The contract test now asserts **within 2 px** at both 375×667 and
412×915 instead of a third of the screen.

`Registros` moved into `Mais`, because an archive and consultation surface is not an
operational queue. It is the **first product destination** in the panel — after the account
block D3 put there, before the five secondary groups — so it needs no scrolling, and
`mobileDemotedKeys` derives it from `mobileBarSlots` rather than listing it twice. Desktop is
untouched: the rail still carries all four primary destinations.

### What makes the geometry hard to break again

`mobileBarSlots` is one ordered list whose **length is the column count** and whose **middle
element is the capture control**. A component test asserts both — odd length, capture at the
midpoint, equal counts each side — so an edit that adds a sixth destination fails in the unit
suite rather than silently decentring the button. The bar renders straight from that list, so
DOM order, visual order, keyboard order and screen-reader order are one sequence; nothing
sets `order`. The duplicate `display:flex; justify-content:space-around` in `globals.css` was
removed, so one stylesheet owns the bar's layout instead of two fighting over it.

### The active-state trap the demotion creates, and its guard

A phone user reading Registros would see no active state anywhere, because the destination
they are standing in is no longer on the bar. `Mais` therefore carries it: the overflow-active
set is computed **per surface**, adding `mobileDemotedKeys` on mobile only, so the rail's own
disclosure does not claim active for a destination it still shows as primary. Asserted in the
unit suite and in the authenticated journey, on both surfaces.

### One pre-existing failure repaired to get the required evidence

`e2e/online-mobile-navigation.spec.ts` asserted `"Tudo salvo"` and a `.attention-panel`
article — the **pre-Slice-C** Home. Slice C replaced that panel grid with the attention
sections and this deployment-session spec was never updated, so it failed on `main` at the
same locator before B2 touched anything (verified by stashing this slice and re-running).
B2's acceptance requires this journey green, so the two stale assertions were repaired
against Home's actual markup. It is not a B2 regression and is recorded here so it is not
read as one.

### Gates

`tsc --noEmit` 0 · `eslint` 0 · `npm test` **2739/2741** (the two are the pre-existing
Windows-CRLF regex reads in `sql-reachability.test.ts`) · `e2e/layout-contracts.spec.ts`
10/10 including exact centring at both mobile viewports · authenticated navigation journey on
desktop and Pixel 7, both locales.

---

# Slice E — the unified composer (UX-07)

**Branch** `codex/ux-slice-e-unified-composer`, cut from the green B2 merge SHA `9d7f98f`.
**Covers** UX-07 under DEC-3 (a). **Non-goals** — no second chat, no new task write path, no
migration, no change to the command taxonomy, matcher, confirmation, audit, undo or
idempotency contracts, and no navigation rename (`Brain` → `Conversar`/`Talk` stays with the
assistant-name work). **Rollback boundary** — remounting `CommandConsole` + `ChatForm` on the
two chat routes restores the previous surface; nothing else in this slice is load-bearing.

## Investigation, before any implementation

Recorded first because two of the six findings below **changed the design** that DEC-3's
option (a) sketched, and one of them is a deferral the owner should see rather than discover.

### `E-M1` — the three inputs, confirmed at the mount

`chat/page.tsx:26` mounts, in DOM order, `ConversationalQuestions mode="proactive"`
(cards, each with its own answer field) → `CommandConsole` (single-line `<input>`, eyebrow
**COMANDOS**) → `ChatForm` (`<textarea>`). `chat/[conversationId]/page.tsx:28` mounts the
last two again below the message stream. So the thread view has **two** permanent primary
text fields and the index view has **three** input surfaces. This is UX-07's `M1` re-verified
at the current SHA, not a new reading.

### `E-M2` — `not_a_task_command` is a declared, isolable outcome, but it is not readable

`TASK_COMMAND_MODEL_UNSUPPORTED_REASONS` (`taxonomy.ts:93`) is a seven-member closed
vocabulary, and `startTaskCommand` returns it at exactly one site (`actions.ts:719-725`) as a
**terminal** state. It is structurally distinct from the three neighbouring failure kinds:
a provider fault (`681-700`, retryable, ledger already written), invalid model output
(`711-718`, retryable), and the other six unsupported reasons (same site, different reason).
That is what makes a *declared* fallthrough possible instead of a `catch` block.

**But the reason does not survive into the state.** `TaskCommandConsoleState.reason` is
already-localized prose (`copy.unsupportedReasons[normalized.reason]`), so a composer reading
it would be string-matching translated sentences. This slice therefore adds one additive
field — `readonly unsupportedReason: TaskCommandUnsupportedReason | null` — set at the two
unsupported sites and `null` everywhere else. The fallthrough condition becomes a value from
a closed vocabulary. Nothing else reads it, and no behaviour changes for the Work mount.

### `E-M3` — the cost DEC-3 (a) assumed is real, and only partly avoidable

UX-07's proposal line says command-first costs "no new model call in the common case". That
is wrong, and the correction matters. A knowledge question now costs **three** provider calls
(`parseTaskCommand` → `embedText` → `answerFromKnowledge`) where it costs two today, because
the command parse must happen *before* anything knows the utterance was a question. There is
no cheaper declared signal: the parse is what produces the classification.

One bound is contractual rather than heuristic and is applied: the provider refuses anything
past **1000** characters with `command_text_too_long` *before it is billed*
(`MAX_COMMAND_TEXT_LENGTH`, `lib/ai/task-command-schema.ts:40,171`), while chat accepts
**12000**. Longer text cannot be a task command, so the composer skips the parse entirely.
Everything shorter pays the extra call. Recorded as the measured price of DEC-3, not hidden.

> Corrected during implementation. The first cut of this slice read the bound off
> `commandTextSchema`'s `.max(4000)` in `actions.ts` and declared a *new*
> `MAX_COMMAND_TEXT_LENGTH` at that value — shadowing the real one, which already existed at
> 1000 and is the cap the provider actually enforces. The 4000 is the outer guard against a
> multi-megabyte form field, and its own comment says so. Using the real constant makes the
> skip both correct and considerably wider.

### `E-M4` — there is no create verb, so "add a task" is refused, not offered

`TASK_COMMAND_ACTIONS` (`taxonomy.ts`) holds fifteen verbs and **all fifteen mutate an
existing task**. The creation offer is not a verb: `runCommandRound` reaches it only when a
*valid proposal* matches no task (`actions.ts:610-633`, `intent: {kind: "no_match"}`). So the
owner's own example — *"Adicione uma tarefa para revisar os números amanhã"* — classifies as
`unsupported_action` and is refused.

This is a genuine product gap and Slice E **does not mask it**: `unsupported_action` stays
visible as unsupported. Closing it means either a create verb in the taxonomy or capture
routing, and `E-M5` explains why the second is not available here.

### `E-M5` — capture routing needs a migration, so it is explicitly deferred

The entry side is already open: `entries.source` admits `'chat'`
(`202607160003_intelligent_capture.sql:50`) and `captureEntrySchema.source` already accepts
it. The blocker is telemetry, and it is at the database level, not in TypeScript:
`private.validate_product_event_properties` pins `captureSource` to
`['home','capture_page','global']` for all three capture events
(`202607170024_phase_2x_product_events.sql:185-192`), and `captureEntry` requires a
`captureSource` on every path including its failure path (`capture/actions.ts:41-53,77`).

Routing capture from the composer therefore requires `create or replace` on that validator —
a migration. Slice E is not authorized to write one, and reusing `'global'` would mislabel a
composer turn as the always-reachable capture affordance. **Capture routing is deferred**,
and the composer never invents an entry insert of its own. Reported as a gate rather than
worked around.

### `E-M6` — analytics needs nothing

`TaskCommandOrigin` is `['chat','work']` (`analytics.ts:96`) and the unified composer still
reports `chat`, exactly as UX-07 predicted. No allowlist widens, and `commandOrigin` keeps
distinguishing the Brain mount from the Work mount. **No migration, no SQL, no RPC.**

## What the slice builds

One `AssistantComposer` — a single multiline field — replaces `CommandConsole` and
`ChatForm` on both chat routes. Behind it, one Server Action routes on a **declared** intent:

| Input | Route | Model calls |
| --- | --- | --- |
| any of the eight task-command intents | delegated verbatim to `runTaskCommand` | unchanged |
| memory phrasing (deterministic, anchored, non-interrogative) | proposed next step, **persists nothing** | none |
| longer than a command may be (1000 chars) | knowledge answer | 2 |
| everything else → `not_a_task_command` | knowledge answer | 3 |
| everything else → any other outcome | shown as itself — refused, unsupported, preview, confirm, choose, clarify, create | 1 |

The memory branch is DEC-5-safe by construction: it is recognised *before* any provider call,
it renders a proposal and a link, and there is no write path behind it to reach. The full
lifecycle stays in Slice G.

`ConversationalQuestions` is **not deleted**. It keeps its existing surfacing decision,
resolution contract and undo; the change is presentational — the composer becomes the first
interactive element on the page and the question cards read as secondary, so their answer
fields no longer compete with the primary composer.

The Work page **keeps** its `CommandConsole`. Contextual task editing beside the task list and
a global assistant on Brain are different surfaces, and they already share one backend
contract with `origin` as a telemetry category rather than a behaviour switch
(`command-console.tsx:3-21`). Removing it would take a capability away from Work to make a
different page tidier.

## The seam, and why it is a value rather than a `catch`

Two additive changes carry the whole routing decision, and both are named so a later reader
cannot mistake them for incidental:

`TaskCommandConsoleState.unsupportedReason` is set at the two sites that produce a refusal and
is `null` everywhere else — including at the provider-fault and invalid-output returns that sit
immediately above one of them. The composer falls through on `not_a_task_command` **and on
nothing else**, which the suite proves exhaustively against
`TASK_COMMAND_UNSUPPORTED_REASONS` rather than against a hand-listed sample: a reason added
later defaults to staying visible as unsupported.

`TaskCommandResult` gained a `silent` prop, default `false`. The composer owns one polite live
region for the whole surface because a turn can resolve on a route the command state knows
nothing about; two regions would announce every command outcome twice.

`ChatForm` was **deleted**. It was the second permanent field, and after the composer replaced
it nothing rendered it — a consumer-less client component is the kind of residue this
repository removes rather than keeps. `ChatState` moved to `chat/chat-state.ts`, because
`sendChatMessage` still returns that shape.

## What is deferred, and said out loud

- **Capture routing** — blocked on a migration (`E-M5`). The composer never inserts an entry.
- **Conversational memory creation** — DEC-5's confirmed contract is Slice G's. The composer
  recognises the intent *before any provider call*, renders a proposal and a link, and there
  is deliberately no path from it to `memories`. The authenticated journey asserts the
  memories surface is still empty afterwards, in both locales and on both viewports.
- **"Add a task"** — refused as `unsupported_action` and left visible (`E-M4`).
- **`Brain` → `Conversar` / `Talk`** — *not* required for Slice E to be coherent, so the
  permanent navigation copy is untouched. The page's own framing moved into the composer's
  typed copy module, which removes this route's inline `pt ? … : …` ternaries and leaves the
  rename a one-place change when the assistant-name work lands.

## Gates

`tsc --noEmit` 0 · `eslint` 0 · `npm test` **2787/2789** (the two are the pre-existing
Windows-CRLF regex reads in `sql-reachability.test.ts`, unchanged from B2's baseline) ·
`npm run build` exit 0 · new coverage: `memory-intent.test.ts` 9, `routing.test.ts` 10,
`actions.test.ts` 18, `assistant-composer.test.tsx` 11 — **48 new tests**.

Journeys, **on the production build against the linked live database**: 66/66 across
`online-assistant-composer`, `online-mobile-navigation`, `account-session`,
`layout-contracts`, `foundation` and `task-command`, on desktop **and** Pixel 7. The composer's
own journey runs in both locales and covers structure, the 44 px touch targets, the empty-
submission refusal, the proposed-memory route with its no-write assertion, and one live
round proving a question still reaches its grounded answer through the fallthrough.
Disposable accounts are deleted fail-closed; a post-run sweep of the live database found
**zero** residue.

### One pre-existing failure, characterized rather than inherited

`account-session.spec.ts:270` asserts `cache-control: no-store` on a protected route and fails
**against the dev server**, which emits `no-cache, must-revalidate`. Verified pre-existing by
stashing this slice and reproducing it on untouched `main`, and verified harness-only by
re-running the same spec on the **production build**, where it passes 13/13 — which is how
Slice D3 validated it. Not a Slice E regression and not a product defect; recorded so the
next reader who runs that spec locally does not chase it.

- **UX-07 — RESOLVED.** One composer, no mode to choose, every other contract untouched.

---

# Slice F1 — the assistant's name (UX-06)

**Branch** `codex/ux-slice-f1-assistant-name`, cut from the green Slice E merge SHA `967e6cc`.
**Covers** UX-06 under DEC-2 (a). **Non-goals** — no migration, no schema change, no touching
Projects or People (that is F2), and **no renaming of the product**. **Rollback boundary** —
reverting the three getters to single-argument and restoring `chat: "Brain"` puts the old
copy back; nothing else in this slice is load-bearing.

**Slice F is split.** F1 is the name; F2 is Projects and People (UX-08, UX-09) under DEC-4.
They share a slice letter in the plan and nothing else: one is a copy-and-settings change
across 40 surfaces, the other adds validated update paths to two tables. Splitting them keeps
each diff reviewable, which is how B/B2 and D1/D2/D3 were handled.

## What the finding actually was

Not "a setting exists and is ignored". `agent_preferences.agent_name` has existed since
`202607160001` with a `Brain` default and a 1–60 character check; `save_profile_settings` has
always accepted it, reading `p_preferences ->> 'agentName'`. What it never had was **an input
and a consumer** — and `capabilities.ts:21` recorded exactly that, honestly, as
`state: "future", consumerEvidence: []`.

The consequence was the interesting part: with nothing able to change it, "Brain" hardened
into a literal across the product for **three different referents at once** — the product
(`My Brain`), the chat destination, and the assistant as an actor. A name the owner can change
cannot also be a fixed place in the navigation, so all three had to be separated before the
field could ship.

## The three referents, after F1

| Referent | Before | After |
| --- | --- | --- |
| **Product** | `My Brain` | unchanged — manifest, document title, brand mark, login page |
| **Destination** | `Brain` | **`Conversar` / `Talk`** — the route key and URL are unchanged |
| **Actor** | `Brain`, hardcoded | the configured name, read through one accessor |

The login page keeps the product name rather than the actor's: there is no signed-in user
there to have a preference, so an actor name would be a guess.

## Two mechanisms, chosen for what they make impossible

**`getAgentName()`** is `cache()`d, so the dozen unrelated Server Components that need the name
issue **one** query between them. A prop threaded from a layout would have put a
presentational value into every intermediate signature for the same deduplication. It never
throws — the name decorates copy, and a failed preferences read must degrade to the default
rather than take down a page whose content is elsewhere. A signed-out caller gets the default
too, which is what the pre-auth surfaces want anyway.

**`withAgentName()`** substitutes an `{agent}` token, so copy records keep the shape they had.
The name sits several levels down in some of them (`provenance.origins.brain`,
`attention.review_interpretation.description`), and a function per string would push the
parameter through every intermediate type for one word. `home-copy.ts` already used this idiom
for `{count}`.

The safety is not in the token — it is in the **getters taking the name as a required
argument**. That turned every remaining hardcoded surface into a build error, which is how the
threading was driven: the compiler enumerated the call sites rather than a grep. The one hole
the token design leaves — a `{agent}` that never reaches a getter — is closed by asserting no
token survives in any getter's *output*, in both locales, plus the mirror assertion that a
name reached the copy at all.

## Threading shapes, chosen per site

- **Server Components already doing I/O** call the accessor themselves (`HomeDashboard`,
  `attention-projection`, `review-projection`'s loader, `interpretations/actions`, and the
  five pages).
- **Pure projections and presentational components** take it as a required parameter. They are
  pure, and they must stay testable without a Supabase mock.
- **Copy records** carry the token and their getter substitutes.

`chat/actions.ts`'s `answerUnavailable` became `(agent: string) => string` rather than a token,
because it is a single string built at the moment of failure, not a record.

## Gates

`tsc --noEmit` 0 · `eslint` 0 · `npm test` **2803/2805** (the two are the pre-existing
Windows-CRLF regex reads in `sql-reachability.test.ts`, unchanged since B2) ·
`npm run build` exit 0 · **15 new tests** in `agent-name.test.ts`, plus updated assertions in
twelve suites.

Journeys, **on the production build against the linked live database**: **70/70** across
`online-assistant-name`, `online-assistant-composer`, `online-mobile-navigation`,
`account-session`, `layout-contracts`, `foundation` and `task-command`, on desktop **and**
Pixel 7. The new identity journey proves the separation rather than just the field: the name
is settable and persists across a reload, the actor is renamed on two different surfaces, the
destination is **not** renamed, and the product name still appears — read from the document
title, because the brand mark lives in the rail and is off-screen on a phone. Disposable
account deleted fail-closed; post-run sweep found **zero** residue.

Migration parity unchanged at `202607300063`. No deployment. Phase 2G remains unstarted.

### Tests that changed because they had codified the finding

Twelve suites asserted the *old* behaviour and had to move. The one worth naming is
`schema.test.ts`, which listed `agentName` among the fields the schema must **reject** as a
forged control — correctly, at the time, precisely because no control existed to produce one.
It is now accepted and bounded to the column's own check.

### A local-only typecheck artifact, not a defect

Running `tsc --noEmit` *after* `npm run build` reports two errors in the generated
`.next/types/validator.ts` about `[locale]/app/layout.tsx`'s `params` typing. CI never sees
them because it typechecks **before** building (`ci.yml:30` then `:32`), and deleting
`.next/types` makes them vanish. Unrelated to this slice — recorded because it looks alarming
locally and is worth fixing on its own terms someday.

- **UX-06 — RESOLVED.** The field ships, the actor name is threaded through one accessor, and
  the three referents are separate.

---

# Slice F2 — Projects and People (UX-08, UX-09)

**Branch** `codex/ux-slice-f2-projects-people`, cut from the green Slice F1 merge SHA
`66d2ae0`. **Covers** UX-08 and UX-09 under DEC-4. **Non-goals** — **no migration and no new
column**, no organization creation, no relationship or context *editing*, and nothing about
memories (Slice G). **Rollback boundary** — removing the `EntityEditForm` mount from the two
detail pages restores the read-only surface; the new module is otherwise unreferenced.

## What existed and was unreachable

Every field this slice makes editable, and every relation it renders, was **already in the
schema**. `createRecord` inserted `{user_id, name}` and that was the entire lifecycle.

| Table | Column / relation | Before |
| --- | --- | --- |
| `projects` | `description`, `status`, `organization_id` | in the schema, never writable |
| `people` | `notes`, `organization_id` | in the schema, never writable |
| `person_projects` | `role` | **already fetched by both pages** and thrown away |
| `person_relationships` | `relationship_type`, `description`, validity | modelled since `202607160009`, rendered nowhere |
| `person_contexts` → `contexts.kind` | — | same |

So "shared projects" said a project was shared and never what the person *does* on it, and
the project's People list said someone was linked and never in what capacity.

## The write path, and why it is not an RPC

Plain RLS-scoped statements, matching the posture `createRecord` already uses for these two
tables. `authenticated` still holds `update` on both (`202607160003:195`) — Phase 2F's
revocation covered `tasks` and `reminders` only, deliberately — so **no migration is
required**, and `audit_logs` already admits `'project'` and `'person'` as entity types
(`202607160007:122`).

Four properties carry it:

**Ownership is proved twice.** RLS is the trust boundary; the `user_id` predicate on every
statement is the belt to its braces. A policy loosened in a later migration would otherwise
widen these writes silently.

**The pre-state is read before the write, in the same scope.** An audit row recording only the
result cannot answer "what did this change". The audit's *own* failure is logged and not
surfaced: the change did happen, and reporting otherwise would invite a second save.

**Every failure is a distinct sentence.** A duplicate name (`23505` on
`projects_user_name_idx`) is a user mistake with an obvious next step; a vanished row is not;
neither is an outage. Collapsing them is how someone retries what can never succeed.

**Bounds are copied, not chosen.** 1–160 for both names, the four literals
`projects_status_check` allows, and cleared text stored as `null` rather than `""` — because
both pages fall back on `null` to render their placeholder.

## Three defects only the live journey could find

Recorded because each was invisible to a green unit suite, and two of them made the feature
completely non-functional while every test passed.

**`F2-M1` — the strict schema refused every save.** A Server Action's `FormData` carries
`$ACTION_*` framework metadata, and both schemas are `.strict()`. `updateProfile` already
filters these (`profile/actions.ts:18-20`); this module did not. Unit tests built their own
`FormData` and never saw it.

**`F2-M2` — a disabled control is not submitted.** The company `<select>` was disabled when
the owner had no organizations, which is the obvious thing to do and is wrong: `organizationId`
then vanished from the submission and the strict schema refused the *whole* save. The select
is no longer disabled — with no organizations it holds one option anyway.

**`F2-M3` — React 19 resets an uncontrolled form after an action.** So a refused save snapped
the field back to the stored value, leaving an error message above an edit the owner could no
longer see. The action now echoes its input back on the failures worth recovering and the
fields default to it; the selects are keyed on their own default, because React applies
`defaultValue` to a `<select>` only on mount.

All three are now pinned by unit tests, written after the fact and named for what they guard.

## Gates

`tsc --noEmit` 0 · `eslint` 0 · `npm test` **2840/2842** (the two are the pre-existing
Windows-CRLF regex reads in `sql-reachability.test.ts`, unchanged since B2) ·
`npm run build` exit 0 · **37 new tests** across `schema`, `actions` and `entity-edit-form`.

Journeys, **on the production build against the linked live database**: **76/76** across
`online-entity-editing`, `online-assistant-name`, `online-assistant-composer`,
`online-mobile-navigation`, `account-session`, `layout-contracts`, `foundation` and
`task-command`, on desktop **and** Pixel 7. The new journey re-reads the page after every save,
so a value rendered from React state rather than from the database would fail it. Disposable
account deleted fail-closed — the cascade takes its projects, people and audit rows with it —
and a post-run sweep found **zero** residue.

Migration parity unchanged at `202607300063`. No deployment. Phase 2G remains unstarted.

## What DEC-4 still holds back

Nothing new persists. The fields the audit called *genuinely missing* — a project's explicit
purpose, start/target dates and free-form notes; a person-level role distinct from
`person_projects.role` — are untouched, and the decision on them is now ready to be taken
against real use rather than in the abstract, which is what DEC-4 asked for.

- **UX-08 — RESOLVED.** Name, description, status and company are editable; per-project roles
  are shown. New fields remain a DEC-4 question.
- **UX-09 — RESOLVED.** Name, notes and company are editable; relationships, contexts and
  per-project roles are surfaced. A person-level role remains a DEC-4 question.

---

# Slice G1 — what happened after you answered (UX-11)

**Branch** `codex/ux-slice-g1-question-outcome`, cut from the green Slice F2 merge SHA
`558ecdd`. **Covers** UX-11, the last **P0** in the ledger. **Non-goals** — no new write, no
change to `resolve_pending_question_v3`, and nothing about memories, reminders or history
(G2–G4). **Rollback boundary** — removing the `?view=resolved` branch restores the previous
page; the projection and the card are otherwise unreferenced.

**Slice G is split into four.** They are four independent findings on four routes, and one of
them (UX-12) carries an implementation precondition the ledger set for itself. Splitting keeps
each diff reviewable, as B/B2, D1–D3 and F1/F2 were.

| | Finding | Status |
| --- | --- | --- |
| **G1** | UX-11 — question after-state (**P0**) | this slice |
| **G2** | UX-12 — reminders lifecycle | precondition first: confirm which reminder mutations are reserved to `apply_task_command` |
| **G3** | UX-10 — memories | conversational path stays DEC-5-deferred |
| **G4** | UX-13 — history | |

## The finding was not a missing feature

Everything the owner wanted to see was **already stored**. `pending_questions` has held
`answer`, `answered_at` and `status` since `202607160007`; `resolve_pending_question_v3`
writes two independently replay-safe audit rows and `202607230050` reinterprets on answer.

What happened is that `actionablePendingQuestionFilter` removed the row from **the only list
that existed**, and nothing else listed it. The owner answered, the card vanished, and the
product said nothing about what that had achieved.

So this slice **reads**. It writes nothing and changes no contract.

## The partition, which is the actual fix

`resolvedPendingQuestionFilter` lives next to `actionablePendingQuestionFilter` in
`question-visibility.ts`, because the two are only correct **as a pair**: between them they
must cover all four `pending_questions` states exactly once. The test asserts *that property*
— over every status the column's CHECK allows — rather than asserting either filter string,
because "a resolved question was in neither list" is precisely the defect.

A snoozed question whose deadline is still ahead is included as **deferred**. It is not
resolved, but it left the queue because the owner acted on it, and that is the same
disappearance the finding is about. Slice 2D.2's read-time reactivation is untouched: once the
deadline passes the question is open again, and the two filters swap it back.

## What the card says, and one thing it refuses to say

Four lines, separate because they are separately actionable: **what you wrote**, **what it
changed**, **whether anything still needs you**, **where it is recorded** — only the last leads
anywhere.

The refusal matters. Whether an answer re-ran the interpretation is read from the
`question_consequence_confirmed` audit row, which the RPC writes *only when a consequence was
actually applied* — never inferred from the answer's presence. A plain answer with
`consequence: "none"` changes the record without re-reading it, and telling the owner otherwise
would describe work that never happened. An unreadable audit degrades to "not reinterpreted",
which is the truthful reading when the process cannot say.

## The label

`Corrigir interpretação` → **`Ajustar o que o {agent} entendeu`** (and `Correct interpretation`
→ `Adjust what {agent} understood`). The old label asked the owner to know what an
interpretation *is*; the owner's own note was that it must not feel like an internal debugging
action. It carries the assistant's configured name through Slice F1's token, so it stays
personalized. `getInterpretationCopy` now takes the name as a required argument for the same
reason the other three getters do — the compiler finds every surface rather than a grep.

## Gates

`tsc --noEmit` 0 · `eslint` 0 · `npm test` **2859/2861** (the two are the pre-existing
Windows-CRLF regex reads in `sql-reachability.test.ts`, unchanged since B2) ·
`npm run build` exit 0 · **19 new tests** across the partition and the outcome card.

Journeys, **on the production build against the linked live database**: **80/80** across
`online-question-outcome`, `online-entity-editing`, `online-assistant-name`,
`online-assistant-composer`, `online-mobile-navigation`, `account-session`,
`layout-contracts`, `foundation` and `task-command`, on desktop **and** Pixel 7, both locales.
Disposable account deleted fail-closed — the cascade takes the entry, the interpretation and
both seeded questions — and a post-run sweep found **zero** residue.

Migration parity unchanged at `202607300063`. No deployment. Phase 2G remains unstarted.

### Two things the seed had to learn from the schema

Recorded because they cost two failing runs and would cost the next author the same:
`entry_interpretations` requires its provenance columns **and** `raw_output` (all `not null`,
no default), and PostgREST refuses a batch insert whose objects do not share keys
(`PGRST102`) — so a dismissal has to state its nulls explicitly.

- **UX-11 — RESOLVED.** A resolved question is reachable, says what it changed, and links to
  where the decision is recorded. The control names the owner's goal rather than the internal
  object.

---

# Slice G2 — BLOCKED. The reminder precondition is answered, and it is a gate

UX-12 set its own implementation precondition: *"The audit must confirm, before implementing,
which reminder mutations are reserved to the command path."* That confirmation was run before
any code was written, and it stops the slice.

## What the audit found

**`authenticated` cannot update a reminder at all.** Migration `202607300063` — Phase 2F Slice
2F.4, still the parity head — revokes it:

```sql
revoke update, delete on public.reminders from authenticated;
```

and the table's own comment states the determination it enforces:

> `Phase 2F Slice 2F.4: authenticated holds SELECT and INSERT. INSERT is the documented Option C
> authoring exception (PRD §2 item 6, sole caller createReminder); UPDATE and DELETE are revoked
> on the 2F-REMINDER-003 determination. Reminder mutation in production is derived reconciliation
> inside apply_task_command and the undo handlers, or delivery mark-sent inside
> run_user_heartbeat. Rows are removed only by cascade.`

The migration does not merely revoke — it **asserts** the posture at deploy time, raising if
`authenticated` still holds `update`/`delete` or has lost `select`/`insert`
(`202607300063:135-144`).

### Every reminder mutation that exists today

| Writer | Kind |
| --- | --- |
| `apply_task_command` and the destructive-confirmation / no-match-creation family | derived reconciliation from task state |
| the registered `undo_*` handlers via `undo_operation` | compensation |
| `run_user_heartbeat` | delivery mark-sent |
| `auth.users` cascade | deletion |
| `createReminder` (`agent/actions.ts:125`) | **INSERT only** — the sole application writer, and the documented Option C exception |

## Why that blocks UX-12 as proposed

UX-12's proposal is *"row actions for snooze, cancel and reschedule through a validated Server
Action that writes the reminder's own columns"*. That Server Action would run as
`authenticated` and would be refused by the grant. There is no way to ship it without one of:

1. **Re-granting `update`** on `public.reminders` to `authenticated` — a migration that
   directly reverses the 2F-REMINDER-003 determination, and would fail 2F's own assertion.
2. **A new `SECURITY DEFINER` RPC** for owner-initiated reminder transitions — a migration, a
   new validated write contract, and a second reminder-mutation authority alongside
   `apply_task_command`, which UX-12 itself said must not happen.

Routing through the existing command path does not rescue it either: `apply_task_command`
reconciles reminders *as a side effect of task state*, and a standalone reminder created by
`createReminder` has no task to command. "Snooze this reminder" is not expressible as a task
command.

## What is not blocked

Two parts of UX-12 are pure reads and need no decision. They are deliberately **not** shipped
here, because shipping half a lifecycle would leave the page still saying "create only" while
implying more:

- showing the linked task or entry as a link (`reminders.task_id` / `entry_id`);
- rendering `status` through a copy module instead of printing the raw enum (UX-21).

They are folded into whichever slice takes UX-12 once the decision below is made.

## DEC-6 — owner decision required (UX-12)

**Does the owner want reminder snooze / cancel / reschedule from the reminders page, knowing it
requires a migration that changes a Phase 2F determination?**

- **(a) A new `SECURITY DEFINER` RPC** for owner-initiated transitions, keeping
  `authenticated`'s grant posture intact — *recommended if the capability is wanted*. It adds a
  second reminder authority, so it must state, in SQL, which transitions belong to it and which
  stay with `apply_task_command`. Reversible: the RPC can be dropped.
- **(b) Re-grant `update`** to `authenticated`. Smallest diff, and it reverses a recorded
  determination and weakens One Write Path for this table. **Not recommended.**
- **(c) Ship the read-only half only** — links and localized status — and leave the lifecycle
  where Phase 2F put it. No migration, no decision reversed; the page stays create-only for
  mutation. Reversible: yes.

**Blocks:** UX-12 and Slice G2. **Does not block:** UX-10 (G3) or UX-13 (G4), which carry no
grant constraint.

- **UX-12 — BLOCKED on DEC-6.** Not a UI problem: `authenticated` holds no `update` on
  `public.reminders`, by a deliberate Phase 2F determination that the parity-head migration
  asserts at deploy time.

---

# Slice G3 — what a memory is, where it came from, and when it stops (UX-10, DEC-5)

**Branch** `codex/ux-slice-g3-memories`, cut from the green G2 merge SHA `0548e2c` (run
`30593990646`, all three jobs green). **Covers** UX-10 and completes **DEC-5**. **Non-goals** —
no migration, no RPC, no grant change, no new AI→domain write contract, and no physical delete.

## The precondition, checked before anything was written

UX-12 is blocked because Phase 2F revoked `authenticated`'s `update` and `delete` on
`public.reminders`. The first question for this slice was whether `memories` sits under the same
posture. It does not, and the evidence is direct:

- `202607160006_chat_memory.sql:69-79` enables **and forces** RLS on `memories`, creates four
  own-row policies (select/insert/update/delete), and grants all four to `authenticated`.
- `202607300063_phase_2f_task_grant_revocation.sql:90-92` revokes on `tasks` and `reminders`
  **only** — the comment at `:98` records that scope deliberately.
- `audit_logs.action_type` and `entity_type` are plain `text` (`202607160003:131-132`); only
  `actor` carries a CHECK, and it already admits `'user'`.

Every column this slice needed was already reachable, so the whole slice is application code.
**Migration parity is unchanged at `202607300063`, verified before and after.**

## The audit's one wrong assumption, corrected

The original UX-10 entry concluded that a conversational "lembre disso sempre" required extending
*either* the extraction schema *or* the task-command taxonomy, and that since both are validated
AI→domain write contracts, DEC-5 could not be closed without one.

That surveyed two architectures and missed the third, which is the one that shipped:
**deterministic recognition → proposal → explicit owner confirmation → ordinary authenticated
write.** No model participates. `looksLikeMemoryIntent` (Slice E) and `buildMemoryProposal` (this
slice) are pure string functions; the stored content is the owner's own sentence with the
imperative opener removed; and the write is the same RLS-scoped INSERT `createRecord` has always
used for this table. There is no AI decision to validate because there is no AI decision.

DEC-5's requirement — a proposed memory requiring confirmation before persistence, and no silent
direct write — is therefore met **without** a new contract, RPC, grant or migration. The gate the
audit raised was real; the constraint it inferred was not.

## What shipped

**A memory now has a lifecycle.** `valid_from`/`valid_until` have existed since the table was
created and nothing had ever read them. `lifecycle.ts` derives three states — `scheduled`,
`active`, `archived` — because a memory that is not yet true and one that is no longer true are
different things to tell the owner. The clock is a parameter, never `Date.now()`, so the boundary
cases are tested rather than flaky at midnight.

**Archive is not delete.** `authenticated` holds `delete` on this table, so the absence of a
delete path is a product decision rather than a limit: the provenance the detail page exists to
show lives on the row, and destroying it to express "this stopped being true" would be the wrong
trade. Archiving stamps `valid_until`; the row stays intact and auditable.

**Archiving actually changes what the assistant does.** `match_internal_knowledge` selects
memories on `embedding is not null` alone (`202607160006:116-117`) and has never read either
validity column, so an archived memory kept being retrieved and quoted. Teaching the RPC would
mean a migration this slice is not authorized to make, so the filter is applied at its one
consumer, `chat/actions.ts`. It shares `isMemoryInForce` with the badge on the page, so the two
provably cannot drift, and it **fails closed**: a memory whose validity cannot be read is dropped
from the sources, because staying silent about one fact is recoverable in a way that quoting a
retracted one back at the owner is not.

**The detail surface is the first place these columns have ever been readable.**
`source_entry_id`, `person_id`, `project_id`, `sensitivity`, `valid_from` and `valid_until` were
unreachable from anywhere in the product. Provenance distinguishes three cases rather than two: a
live source entry is a link, a `source_entry_id` whose row did not load is a dangling reference
the page admits to, and `null` means the owner created it. Since `source_entry_id` is
`on delete set null`, a memory from a deleted entry is genuinely indistinguishable from a
hand-written one — the page does not pretend otherwise.

**Two other findings close on the list.** UX-20's memory rows were `<article>` elements styled as
interactive with nothing to activate; there is a destination now, so they are links. UX-21's
memory half is closed: the page kept ten Portuguese kind labels in an untyped module-scope record
and rendered `kind.replaceAll("_", " ")` — the raw database enum, spaced — to English readers.

**`confidence` is no longer rendered.** It was the row's only metadata. Every hand-written memory
stores `1`, so the list read "100%" beside every memory the owner had written — a number that
looked like a judgement on their own statement and could not be acted on. It is not offered on
create or edit either; the column keeps its default for the extraction path that populates it
meaningfully. What replaces it is the fact that actually varies: whether the assistant may use
the memory at all.

## Two defects this slice found in itself, and fixed

- **A screen-reader naming bug, surfaced by the authenticated journey.** React renders a
  `<textarea>`'s value as a **child text node**, so a wrapping `<label>` made the field's
  accessible name the label *plus the entire memory text*. Both textareas now carry an explicit
  `aria-label`, which wins over the computed name while the visible label still focuses the
  control. The same latent shape exists in `entity-edit-form.tsx`'s description field; it is
  recorded here and left for a separate change rather than widened into this slice.
- **A tense bug, surfaced by the captured evidence.** The validity row read "Valeu até" / "Was
  valid until" — past tense — on memories currently in force. Now neutral.

One subtlety is encoded as a test because getting it wrong would store the opposite of what the
owner said: a trailing "sempre" is dropped only after a **demonstrative** opener ("Lembre disso
sempre: X", where the word says how often to remember). After a **complementizer** ("Lembre que
sempre uso o mesmo banco") it belongs to the fact and is kept.

## Gates

- `npm run lint` clean; `npx tsc --noEmit` clean; `npm run build` succeeds with both
  `/[locale]/app/memories` and `/[locale]/app/memories/[memoryId]` registered.
- `npm test` — **2906 passed**, 2 failed. Both failures are the pre-existing Windows CRLF
  fragility in `sql-reachability.test.ts` recorded under repository hygiene: this slice touched no
  SQL and no migration, `git status` confirms neither that test nor the migration is in its
  changeset, and Linux CI checks out LF and stays green.
- **Authenticated journeys — `e2e/online-memories.spec.ts`, 6 tests × desktop and mobile,
  12/12 green.** They prove the writes rather than the forms: every assertion after a save
  re-reads the page, so a value rendered from React state would fail. Covered: manual creation,
  detail inspection, provenance, editing content/kind/importance, a person relation and its
  navigation, archive, restore, both locales, the DEC-5 proposal, confirmation, cancellation,
  duplicate submission, and a 44px touch target on mobile.
- **Visual evidence** — `docs/reports/ux-evidence/slice-g3/`, 24 frames: list, detail and proposal
  at **1440×900, 1920×1080, 375×667 and 412×915**, in **pt-BR and en**. All content is synthetic;
  no real memory of the owner's appears in any frame.
- **Zero residue** — disposable accounts deleted fail-closed by `afterAll`, and a live sweep of
  the linked project afterwards returned **0 fixture accounts and 0 fixture-shaped memory rows**.

## Still open after this slice

UX-04, UX-13 (G4), UX-19, UX-21's non-memory surfaces, UX-22, UX-27. UX-12 remains **BLOCKED on
DEC-6**, untouched: this slice introduced no reminder write, and the composer's memory branch
cannot reach `reminders`.

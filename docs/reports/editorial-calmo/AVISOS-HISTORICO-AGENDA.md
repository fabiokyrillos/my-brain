# Avisos, Histórico and Agenda, recomposed

- **Date:** 2026-11-18
- **Branch:** `design/avisos-e-historico`
- **Design:** [`docs/initiatives/editorial-calmo/DESIGN.md`](../../initiatives/editorial-calmo/DESIGN.md) · ADR-180 · ADR-186
- **Migration:** none. No Server Action, RPC, query or default changed.

## The four pages

Heights are at 390px, same fixture before and after.

| Page | Before | After | What changed |
| --- | --- | --- | --- |
| Avisos | 1,067px | 901px | Opens with "3 avisos não lidos." and *Marcar todos como lidos* as a text verb. An unread row is the notice's subject (it was the kind, three rows reading "Tarefa atrasada"), one caption, its primary verb, the menu and *Abrir*. Read notices fold under *Já lidos*. The standing bulk bar, the description and the per-row state pill are gone; preferences are the page's last line |
| Histórico | 3,039px | 2,225px | A logbook: days as headings, one row per event, the row is the link. Filters are one closed line; active filters are said in words beside *Limpar filtros*. The eyebrow, the intro, the per-row dot, pill and *Abrir* button are gone; multi-field changes are caption lines, not a box |
| Agenda, list | 2,422px | 1,630px | The period is the subject, with the count and the arrows on one line. A row is time column, title (the link), one caption, *Datas* as its verb. Cards, tinted chips and the boxed "Hoje" are gone |
| Agenda, week | 1,028px | 1,892px | Longer on purpose: the seven-column table of 11px fragments is a seven-day strip over the list of days (ADR-186). The table is unchanged from 768px |
| Planejar | 2,065px | 1,457px | What is planned and what is available come first; a task is one line with one verb (*Planejar* / *Tirar*) and its deadline; a conflict is stated on its own row. The explanations are one closed disclosure at the foot |

Images (phone): [Avisos](evidence/avisos-historico-agenda/avisos-depois-mobile.png) ([before](evidence/avisos-historico-agenda/avisos-antes-mobile.png)) · [Histórico](evidence/avisos-historico-agenda/historico-depois-mobile.png) ([before](evidence/avisos-historico-agenda/historico-antes-mobile.png)) · [Agenda, week](evidence/avisos-historico-agenda/agenda-depois-mobile.png) ([before](evidence/avisos-historico-agenda/agenda-antes-mobile.png)) · [Agenda, list](evidence/avisos-historico-agenda/agenda-depois-lista-mobile.png) ([before](evidence/avisos-historico-agenda/agenda-antes-lista-mobile.png)) · [Planejar](evidence/avisos-historico-agenda/agenda-plano-depois-mobile.png) ([before](evidence/avisos-historico-agenda/agenda-plano-antes-mobile.png)) · [Agenda, week, desktop](evidence/avisos-historico-agenda/agenda-depois-desktop.png).

Rendered from the real pages with mocked loaders through the compiled stylesheets, light, **without the app shell and not signed in**.

## Verification

- `npm test`: 600 files, 11,072 tests. `npm run typecheck`: clean. `npm run lint`: 0 errors (4 warnings that predate the branch). `npm run build`: passed.
- Static specs (`layout-contracts`, `daily-surfaces`, `accessibility`, `calendar`, `life-brain-d1-agenda`, `life-brain-d2-lists`; desktop and Pixel 7): 641 passed, 13 skipped. New checks cover every page at 390 and 320 without overflow and without a target under 44px, at rest and with disclosures open.
- No guard was deleted. Tests keyed to earlier requirements were rewritten where ADR-186 changes what is visible: `2M-ACCESS-005`, `2M-PLAN-004/-006/-007`, and the A.5 "every notice row ≤70px" assertion (now read rows only; the 50-notices-in-3,500px budget holds).
- `page-outline.test.ts` pins `notification-status-badge` in the row; the element is kept and visually hidden, since the opening line and the *Já lidos* heading now say the state.

## What the owner will notice

- Unread notices show their primary verb directly; notices are unread-first within a page, not strictly by date; read rows have no *Abrir* word (the row opens).
- History filters no longer stand open on desktop or reopen when a filter is active.
- *O que mudou recentemente* on the memory, person and project pages shares the history row and changed with it. Seen on the memory page only.
- Agenda: "Hoje" appears in the stepper only when the period on screen does not contain today. Planner buttons read *Planejar* / *Tirar*.

## Not verified

- The signed-in app, the device, dark by eye, `en` by eye; a real reschedule, plan or bulk mark-as-read round trip.
- `online-history`, `online-phase-2p-settings`, `online-phase-2p-device-findings`, `online-phase-2p-planning` were rewritten and not run.
- The desktop week and month are closer to a restyle than a rethink. The Lembretes lens keeps the large title.
- The planner's *O que vale notar* block repeats the conflict that the row already states.

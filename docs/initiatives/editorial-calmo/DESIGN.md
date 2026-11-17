# Editorial calmo — the visual pass, starting on Hoje

- **Opened:** 2026-11-16, by the owner, from a phone recording of Hoje.
- **Decision record:** ADR-180.
- **Record of the work:** [`docs/reports/editorial-calmo/`](../../reports/editorial-calmo/HOJE.md).
- **Status:** slice 1 (Hoje) implemented on `design/hoje-editorial-calmo`. Slices 2–7 not started.

## 1. What the owner said

A 34-second recording of Hoje on an iPhone, dark theme, with narration:

- the texts are badly placed on the home page;
- "Precisa de você" is "muito grande, muito desproporcional";
- "eu posso mexer lateralmente aqui em tudo" — the page can be dragged sideways;
- "está muito feio. Eu preciso de algo premium, muito bom";
- every page is in scope, the home page first.

He was shown three directions as mockups and chose:

| Question | Answer |
| --- | --- |
| Direction | **A — editorial calmo**: flat rows, one action per row |
| Identity | **Keep and refine**: same faces (Newsreader, IBM Plex), same palette |
| Capture on Hoje | **One compact line that opens when written in** |
| Order | **Hoje first, then the other pages, one per delivery** |

On the high-fidelity mockup he added: the whole row must be clickable; the repeated item (the same task shown as an overdue notice, as a reminder and again under "Hoje e atrasado") is to be recorded as open work rather than solved here; and the design is to be applied to every page where it fits.

## 2. What was wrong, measured

| Finding | Cause |
| --- | --- |
| The page scrolls sideways | A task title holding one unbreakable identifier sized its flex item to its own length (`.home-task strong` had `min-width:0` and no `overflow-wrap`); `.home-list`, `.today-main` and `.home-priorities` are grids with no `minmax(0,1fr)` track, so they grew to fit it. Nothing clips at the page. |
| "Precisa de você" takes nearly three screens for four items | A bordered card inside a bordered panel; the first item expanded into a proposal card; a notice's stamp, *Abrir*, primary verb and menu trigger each took their own line. |
| The text sits badly | Three faces on one screen (reading, UI and mono for stamps); a greeting of three lines; the heading count and the section link in different corners. |
| It does not look like the rest of the product | Hoje uses none of `src/components/ui`; its rows are page classes of its own. |

## 3. The design

### 3.1 The language (applies everywhere this pass reaches)

1. **A section is a heading over a hairline.** Title and count on the left, the section's one link on the right, on a single line at least one touch target tall. No panel border, no panel background.
2. **An item is a row.** Rows are separated by hairlines, never boxed. A row holds, in order: an optional leading mark (a tone dot, or the control that completes it), a title, one line of context, and at most one visible verb.
3. **The row is the link.** Where an item has a destination, the whole row navigates to it. A verb appears only where the row has one to offer.
4. **Two faces.** The owner's own words are set in the reading face; the interface in the UI face. Stamps are not monospaced.
5. **Colour says one thing.** Attention is amber, risk is red, and both always come with a word.
6. **Nothing is wider than the screen.** Every list has a track that can shrink and every title can break.

Every value is a token from `tokens.css`. No new colour, size, radius or shadow.

### 3.2 Hoje

| Area | Before | After |
| --- | --- | --- |
| Greeting | "Boa tarde." + "O que merece sua atenção agora?" on three lines | "Boa tarde." on one line, then the status sentence |
| Capture | A card 118px tall with a toolbar, always open | One line with the paperclip and the microphone; it opens — toolbar, *Registrar*, helper text — when the field is focused or holds text |
| "Ir para" | A labelled row of four pills that wrapped to two lines on a phone | One row of four quiet targets; the label is not drawn on a phone |
| Sections | Bordered panels with a round count badge and the link at the bottom | Heading, count and link on one line over a hairline |
| "Precisa de você" | Lead proposal card + boxed rows + notices with four stacked controls | Rows. A notice is its text, then stamp and *Abrir* on one line, then its verbs side by side |
| "Hoje e atrasado" | Boxed task rows; "Atrasada" as a filled chip | Rows; "Atrasada" as coloured text beside the date |
| Section hints | Always drawn | Drawn from 900px up; the priority rule stays at every width |

Measured on the preview fixture (four attention items, three priorities), the page is 1,857px tall at 390px wide. The recording shows the same content at roughly 2,900px.

### 3.3 What deliberately did not change

- **"Ir para" stays.** The first proposal removed it on a phone. It exists because the owner could not find Lembretes and Revisões on his own device in August (`2P-MOBILE-001`), and `mobile-reachability-guard` holds it. It was made quiet instead of removed. Removing it remains his decision (EC-OD-1 below).
- **The reading order, every data rule and every verb.** No projection, action, RPC or copy key changed. The section hints and the priority rule are still in the document.
- **The greeting has no name.** The mockup said "Boa tarde, Fábio."; the greeting is a fixed string today and is not derived from the hour either ("Boa tarde." at 23:47 in the recording). Both are one change to the copy contract and are listed as open work.

## 4. The pages, and what each one gets

"Row" and "section" mean §3.1. The order is the order of delivery.

| Slice | Pages | Change |
| --- | --- | --- |
| 1 — done | Hoje (`/app`) | §3.2 |
| 2 | Shared primitives | Move the row and the section heading out of `operations.css` into `src/components/ui` (`ListItem` exists with no call site; a `SectionHeader` does not exist), so slices 3–6 adopt components rather than copy rules |
| 3 | Registros (`/app/inbox`), Tarefas (`/app/work`, `/app/work/cancelled`), Lembretes (`/app/reminders`) | `.list-row` cards and `.work-row` become rows; group headings become section headings |
| 4 | Memória (`/app/library`, `/app/memories`), Pessoas, Projetos, Contextos, Organizações, Arquivos, Relações | Same, for the entity lists |
| 5 | Avisos (`/app/notifications`), Histórico, Perguntas, Revisões, Busca | Avisos is already a divided list (Life Brain A.5); align its heading and type. The rest adopt rows |
| 6 | Detail pages (`inbox/[entryId]`, `work/[taskId]`, people, projects, contexts, organizations, memories, reviews) | Section headings and the two-face rule; `.mini-list` and `.timeline-list` become rows |
| 7 | Shell | Top bar balance (brand on the left on a phone), locale switch into the account menu |

Not in this pass, on purpose:

- **Conversar** — rebuilt in Life Brain E.6/E.7 this month, to the owner's own reference.
- **Agenda** (`/app/calendar`, `/app/calendar/plan`) — a grid, not a list; only its headings would change, in slice 5.
- **Custos, Jobs** — operator surfaces.
- **Settings and the auth pages** — forms; they get the type and spacing rules only if slice 7 shows a mismatch.

## 5. Verification

- Unit: `home-view.test.tsx` asserts every attention item is one linking row, the section link sits in the heading before the rows, and the greeting is one line.
- Layout: rendered with the real stylesheet at 390×844 and 1280×900, light and dark — horizontal overflow 0 with the unbreakable title from the recording; no target under 44px at 390.
- Not yet run: the signed-in screenshot lane (`e2e/visual-regression.spec.ts`). Its Hoje baselines must be redrawn through `visual-baselines.yml`, which is hand-dispatched.

## 6. Open, for the owner

- **EC-OD-1 — remove "Ir para" from Hoje on a phone?** It would free one more row. It would also put Lembretes and Revisões back behind search and the calendar.
- **The repeated item.** One task can appear as an overdue notice, as a reminder notice and under "Hoje e atrasado". That is a projection rule, not a drawing.
- **A greeting that knows the hour and the name.**

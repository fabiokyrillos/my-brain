# Editorial calmo — the remaining cards (slices 4, 5 and 6, in part)

- **Date:** 2026-11-17
- **Branch:** `design/editorial-calmo-slice-5`
- **Design:** [`docs/initiatives/editorial-calmo/DESIGN.md`](../../initiatives/editorial-calmo/DESIGN.md) · ADR-180
- **Migration:** none. CSS only; no markup, projection, action or copy key changed.

## What changed

| Page | File | Change |
| --- | --- | --- |
| Perguntas | `app/agent.css` | Inside `.list-stack`, `.question-card` and `.question-outcome` are rows between hairlines. The card stays in Conversar. |
| Busca | `app/palette.css` | Inside `.search-results`, `.ux-source` is a row; the list opens with a hairline. The card stays where a source is cited in an answer. |
| Revisões | `app/reviews.css` | `.review-card` is a row inside the panel that holds the list, not a tinted card inside it. |
| Arquivos | `app/files.css` | `.file-card` is a row; its analysis and links lose the card's inset; a long file name breaks; *Abrir original* is 44px tall below 900px. |
| Pessoa, Projeto | `app/entities.css` | The workspace panels lose their card: a heading over a hairline, rows beneath. `.relation-row` is a row. Blocks are separated by space (`--space-8`). |
| Contexto, Organização, Memória (detail) | `app/timelines.css`, `app/entities.css` | `.entity-columns > section`, `.entity-timeline`, `.entity-memory`, `.entity-decisions`, `.entity-changes` lose their card the same way. |

## Second round, the same day — from the owner's review of the images

- **Perguntas, resolved tab.** A resolved question rests collapsed: its state, its date and the question. The reason, the answer, the consequence and the link open beneath (`QuestionOutcomeCard` is a native `<details>`; its tests open it before reading it, and one asserts the resting state). [Image](evidence/paginas/resolvidas-mobile.png).
- **Arquivos.** The name is the one heavy line; kind and state are one line of plain text; *Abrir original* is a link, not a bordered button.
- **Pessoa, Projeto.** "O que mudou recentemente" moved to the foot of the page, collapsed — markup changed in both pages and in the accessibility fixture, whose outline assertion now lists it last. Each block opens with the stronger rule (`--border-strong`) and a heading in the reading face, so a block reads apart from a row.

## Evidence

390 × 844, light, through the compiled application stylesheet. **Not a signed-in session.** The person page is the fixture `entityWorkspace()` from `e2e/accessibility.spec.ts`, verbatim. The other four are markup written by hand from the components' JSX, so they prove the rules against that markup, not against the running page.

[Perguntas](evidence/paginas/perguntas-mobile.png) · [Busca](evidence/paginas/busca-mobile.png) · [Revisões](evidence/paginas/revisoes-mobile.png) · [Arquivos](evidence/paginas/arquivos-mobile.png) · [Pessoa](evidence/paginas/pessoa-mobile.png)

Horizontal overflow is 0 on all five at 390 and at 1280. Before the fix in this change, the Arquivos row overflowed by 84px with an unbreakable file name — the card had been hiding it with `overflow: hidden`.

Static specs (`layout-contracts`, `daily-surfaces`, `life-brain-d2-lists`, `life-brain-d1-agenda`, `accessibility`; desktop and Pixel 7): 367 passed, 13 skipped. Unit: 10,825 passed.

## Not verified

- **The device, the dark theme, and the real pages.** Nothing here was seen signed in.
- **Projeto, Contexto, Organização and Memória detail** were not rendered; they share the rules the person page was rendered with.
- No screenshot baseline covers any of these pages (`e2e/visual-regression.spec.ts` holds Hoje, Conversar, Tarefas and Agenda).

## Left as it was, on purpose

- **Memória (`/app/library`)** — `.brain-domain` is a grid of tiles, not a list.
- **The "Revisão deste dia" panel** keeps its box; `reviews.css` documents it as a deliberate signal that the block holds actions.
- **`inbox/[entryId]`** — its cards are decisions with forms in them; that page needs its own pass.
- **`work/[taskId]` controls, `.memory-facts`** — single objects, not repeated rows.

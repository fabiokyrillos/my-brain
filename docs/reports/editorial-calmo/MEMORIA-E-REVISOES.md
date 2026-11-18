# Memória and Revisões, recomposed

- **Date:** 2026-11-18
- **Branch:** `design/memoria-e-revisoes`
- **Design:** [`docs/initiatives/editorial-calmo/DESIGN.md`](../../initiatives/editorial-calmo/DESIGN.md) · ADR-180
- **Migration:** none. No Server Action, RPC, projection or query changed.

## The five pages

Heights are at 390px, same fixture before and after.

| Page | Before | After | What changed |
| --- | --- | --- | --- |
| Memória overview | 2,289px | 1,804px | Search first, as a full-width field. Seven bordered tiles become an index of rows: name, count, the latest items on one line; the row is the link. Areas and ideas are rows. Domain links were 24px tall |
| Memories list | 3,122px | 2,118px | A row is the memory's sentence over one caption (kind, relation, source). The separate chevron link — whose accessible name was "Memórias" — is gone. The explainer is a closed disclosure after the list |
| Memory detail | 1,853px | 1,272px | The sentence is the subject at reading size, not 62px beside an icon. Facts are rows; "Pessoa: Nenhum / Projeto: Nenhum" are not printed. *Editar* and *Arquivar* are two text verbs. Origin is the source record, quoted. Changes are collapsed; delete is a quiet last line |
| Reviews page | 3,735px | 2,633px | The scheduling promise was said three times; it is said twice (a guard pins one, a test the other). The day opens with its counts, then the written review and the button that writes one, then the lists. Task titles and captures are links. A written review is a row |
| Review detail | 2,391px | 1,955px | Title, one facts line, the text at full ink and reading measure, sources as rows, technical details collapsed, two links at the foot |

Images (`-antes` / `-depois`, phone): [Memória](evidence/memoria/library-depois-mobile.png) ([before](evidence/memoria/library-antes-mobile.png)) · [Memories](evidence/memoria/memorias-depois-mobile.png) ([before](evidence/memoria/memorias-antes-mobile.png)) · [Memory](evidence/memoria/memorias-depois-detalhe-mobile.png) ([before](evidence/memoria/memorias-antes-detalhe-mobile.png)) · [Reviews](evidence/memoria/revisoes-depois-mobile.png) ([before](evidence/memoria/revisoes-antes-mobile.png)) · [Review](evidence/memoria/revisoes-depois-detalhe-mobile.png) ([before](evidence/memoria/revisoes-antes-detalhe-mobile.png)).

Rendered from the real pages with mocked loaders through the compiled stylesheets, light, **without the app shell and not signed in**.

## Verification

- `npm test`: 599 files, 11,031 tests. `npm run typecheck`, `npm run lint`: clean. `npm run build` passed before `main` was merged into the branch; CI builds it again.
- Static specs (`layout-contracts`, `daily-surfaces`, `accessibility`, `life-brain-d2-lists`; desktop and Pixel 7): 449 passed, 5 skipped. New checks cover 390 and 320 without overflow and without a target under 44px on all five pages.
- No guard was deleted or weakened. Three shaped the design: the inert-preferences guard keeps the "nada é executado por horário configurado" sentence on the reviews page; the reviews stylesheet scope guard kept `.task-control` rules in `calendar.css`; the accessibility mirror guard kept the `brain-domain*` class names on the new rows.

## Moved or removed from view

- Behind a disclosure: the memories explainer, a memory's changes trail, a review's model / period / kind.
- No longer drawn: the state badge and hero icon on the memory page; the "Em vigor" word on a row of the memories list; the stored title on a review row (it is the heading of the review's own page); the overview's intro sentence.
- "Nova organização" sits at the foot of the overview.

## Not verified

- The signed-in app, the device, and dark by eye (axe ran in dark on two of the surfaces).
- `e2e/online-memories.spec.ts`, `e2e/online-brain-lenses.spec.ts` and `e2e/intelligent-capture.spec.ts` were updated for the new markup and not run.
- On the overview, the lens strip sits directly above an index of the same seven destinations. A guard requires the strip there, so the duplication stays.

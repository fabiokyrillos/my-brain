# Editorial calmo — slice 3, every stacked list

- **Date:** 2026-11-17
- **Branch:** `design/hoje-editorial-calmo`
- **Design:** [`docs/initiatives/editorial-calmo/DESIGN.md`](../../initiatives/editorial-calmo/DESIGN.md) · ADR-180
- **Migration:** none. No markup changed.

Taken before slice 2 (the shared primitives): the change turned out to be four declarations on classes nine pages already share, so there was nothing to extract first.

## What changed

`src/app/operations.css`, one block: inside `.list-stack`, a `.list-row` loses its border box, radius, background and shadow and gains a hairline beneath it; the stack's 9px gap is gone; a linking row's hover is a tint rather than a lift; titles break anywhere.

Pages that build their lists from `.list-stack`: Registros, Tarefas (and the cancelled list), Lembretes, Memórias, Pessoas, Projetos, Contextos, Organizações, Arquivos, Jobs, and the conversational questions panel.

## Evidence

A static Registros page — two attention rows and three record rows, one with the unbreakable title from the owner's recording — through the compiled application stylesheet. **A fixture, not a signed-in session, and one page of the eleven.**

| | Dark | Light |
| --- | --- | --- |
| 390 × 844 | [mobile-dark.png](evidence/listas/mobile-dark.png) | [mobile-light.png](evidence/listas/mobile-light.png) |
| 1280 × 900 | [desktop-dark.png](evidence/listas/desktop-dark.png) | [desktop-light.png](evidence/listas/desktop-light.png) |

Horizontal overflow 0px at both widths. `e2e/layout-contracts.spec.ts` and `e2e/daily-surfaces.spec.ts` (static fixtures, desktop and Pixel 7): 212 passed.

## Not verified

- **Ten of the eleven pages were not rendered.** The rule is the same for all of them and the layout contracts cover the task row and the reminder row, but Memórias, Pessoas, Projetos, Contextos, Organizações, Arquivos and Jobs were not looked at. A page whose rows carried their own background or spacing on top of `.list-row` could look wrong.
- The signed-in screenshot lane: the Tarefas baselines will differ and must be redrawn.
- The owner's device.

# The task detail, recomposed (`work/[taskId]` and its panel)

- **Date:** 2026-11-18
- **Branch:** `design/tarefa-recomposta`
- **Decision:** ADR-185 · design language: [`docs/initiatives/editorial-calmo/DESIGN.md`](../../initiatives/editorial-calmo/DESIGN.md)
- **Migration:** none. No Server Action, RPC or projection changed.

## What was wrong, measured

Rendered at 390px with one ordinary task, the page was 3,700px tall. A task's facts appeared three times — "Detalhes" (read-only), "Relações", and "Editar esta tarefa", twelve always-open cards each with its own input and "Aplicar". The due date was on the first screen and the control that changes it on the third.

## What changed

| Part | Before | After |
| --- | --- | --- |
| Facts | Three sections | One list, "Detalhes": due date, planned day, priority, projects, contexts, people, waiting on |
| Editing | Twelve standing cards | One verb per row (*Alterar*, *Definir*, *Adicionar*) opening that field's control under the row; one row open at a time; Escape or *Fechar* closes it |
| Title and note | Two of the twelve cards | *Renomear* and *Acrescentar uma nota* under the title |
| Cancelling | A card | One line at the foot of the column; the confirmation dialog is unchanged |
| Origin, creation | Two fields | One caption under "De onde veio" |
| Last change | A field | Removed; the history says it |
| History | An open timeline | Collapsed, one line |

## Evidence

`TaskDetailView` with the real `WorkItemActions` and `TaskDetailControls`, from a fixture, through the compiled stylesheet, light. **Not a signed-in session.**

| | 390 | 1280 |
| --- | --- | --- |
| Before | [png](evidence/tarefa/antes-mobile.png) | — |
| After, at rest | [png](evidence/tarefa/depois-mobile.png) | [png](evidence/tarefa/depois-desktop.png) |
| After, the due-date row open | [png](evidence/tarefa/depois-aberta-mobile.png) | — |

3,700px → 1,495px at 390px (1,603px with a row open). No horizontal overflow; no target under 44px at 390.

## Verification

- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 591 files, 10,859 tests passed.
- Static specs (`layout-contracts`, `daily-surfaces`, `accessibility`; desktop and Pixel 7): 371 passed, 5 skipped. The task-detail fixture mirrors the new markup and now also checks 390 and 320 without overflow, the editor inside its row, 44px controls and 16px fields.
- The tests of the `section`, `inline` and `preset` variants, and of the calendar, planner, day review and quick edit that mount them, pass unchanged.

## Not verified

- A real command round trip: hydration, the Server Action, revalidation closing the row, the native date picker. `e2e/task-detail-commands.spec.ts` was updated to open a row first and was not run.
- Dark, `en`, the device, and the panel mount beside the list at desktop width.

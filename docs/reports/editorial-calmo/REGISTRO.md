# The record page, recomposed (`inbox/[entryId]`)

- **Date:** 2026-11-17
- **Branch:** `design/registro-recomposto`
- **Decision:** ADR-184 · design language: [`docs/initiatives/editorial-calmo/DESIGN.md`](../../initiatives/editorial-calmo/DESIGN.md)
- **Migration:** none. No Server Action, RPC or projection changed.

## Why this is not the first attempt

A first pass (pull request 399, closed unmerged) turned the page's six cards into six ruled sections with CSS alone. The owner asked whether that was good enough as UX; it was not. The problems were the page's composition, listed in ADR-184. He approved a mockup of the recomposition before any of this was written.

## What changed

| Part | Before | After |
| --- | --- | --- |
| Top of the page | The date as a large `<h1>`, "ORIGINAL PRESERVADO", a state badge | One caption line: "Você escreveu · date". The badge only for states other than `ready` / `needs_attention` |
| The owner's text | A card with a heading and a sentence of explanation | The largest thing on the page, no box (headline up to 220 characters, text beyond) |
| The reading | A card with a heading, an explanation, the text and pills | A remark beside a rule: a small label, the text, the fields as quiet pairs |
| What it needs | A yellow notice, then a "Próximas ações" card with its own explanation | One block in the attention colour; the actions follow it directly |
| A mentioned person | A fieldset: two radios, a name field, and "Salvar decisões sobre pessoas" under all of them | A question, the evidence, *Criar pessoa* · *Ignorar* · *Mudar o nome*; one tap writes that decision |
| What it created | A card with an icon and an explanation | A section of rows |
| Earlier decisions, technical details | Two cards | Two collapsed lines at the foot |

## Evidence

`EntryReview` with the real `PersonCandidateForm` in its next-actions slot, rendered from a fixture (one attention item, two fields, two people, three outcomes) through the compiled stylesheet, light. **Not a signed-in session.**

| | 390 | 1280 |
| --- | --- | --- |
| Before | [png](evidence/registro/antes-mobile.png) | — |
| After | [png](evidence/registro/depois-mobile.png) | [png](evidence/registro/depois-desktop.png) |

The "before" image has one mentioned person and the "after" two, so heights are not comparable row for row: 2,053px before with one person, 1,314px after with two. No horizontal overflow at either width; no target under 44px at 390.

## Verification

- Unit: `npm test` — 591 files, 10,828 tests passed, with the unstyled-class ratchet lowered to 33.
- `npm run typecheck`, `npm run lint`: clean.
- Static specs (`layout-contracts`, `daily-surfaces`, `accessibility`; desktop and Pixel 7): green, including the rewritten person-row contracts at 1440, 600, 440, 375 and 320.

## Not verified

- **A real write.** The tap was exercised against a mocked action in jsdom. That the server accepts a single-resolution request is read from `PersonCandidateForm`'s previous behaviour (it already skipped undecided rows), not from a run against a database.
- `e2e/online-person-candidate-suggestions.spec.ts` was rewritten for the new controls and not run.
- The task, event, memory, birthday and revision forms inside the page; the open technical disclosure; dark; `en`; the device.

## Second step, 2026-11-18 — suggested tasks (branch `design/registro-tarefa-um-toque`)

The task form took the same shape as the person one: a question, *Criar tarefa* · *Ignorar* · *Mais opções*, and the editor behind one link.

- *Ignorar* writes `dismissed`, the neutral disposition. *Rejeitar sugestão* and *Manter como registro* are behind *Mais opções*, each with its one-line meaning.
- *Criar as N tarefas* appears with two or more suggestions. It is the only way to create two suggestions linked as parent or dependency, because the server accepts that reference only when both are in the same request. Confirming such a task alone is stopped locally with a message that says so.
- Closed, `CandidateEditor` is the link "Editar sugestão". Its card repeated the title, the description, the due date and the time zone under a question that had just said them; a notice that a due date could not be read stays visible.

Image, same fixture plus two task suggestions, 390, light: [png](evidence/registro/tarefas-mobile.png).

Verification: `npm test` 591 files / 10,835 tests; typecheck and lint clean; static specs 361 passed, 5 skipped.

What changed in behaviour and is not recoverable from the screen: a mixed batch (create one suggestion and reject another in one request) no longer exists, and each tap is its own undo. Not verified: a real write; `e2e/editable-candidate-confirmation.spec.ts`, rewritten for the new controls and not run; the open editor inside the new row at phone width; whether the editor drops a reference to a sibling that was ignored after it was chosen.

## Left open

- The event, memory and birthday candidates are still forms (tasks followed on 2026-11-18, above).
- The mockup had *Corrigir* beside the reading; the revision editor is still reached where it was.
- Only the latest tap's *Desfazer* is on screen.

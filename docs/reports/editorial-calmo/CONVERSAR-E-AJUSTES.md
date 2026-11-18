# Conversar and Ajustes, recomposed

- **Date:** 2026-11-18
- **Branch:** `design/conversar-e-ajustes`
- **Design:** [`docs/initiatives/editorial-calmo/DESIGN.md`](../../initiatives/editorial-calmo/DESIGN.md) · ADR-180 · ADR-187
- **Migration:** none. No Server Action, route handler, RPC, query, prompt or streaming logic changed.

## Conversar

Heights at 390px, same fixture before and after.

| Surface | Before | After | What changed |
| --- | --- | --- | --- |
| A conversation | 1,901px | 1,300px | The day is one heading. The question has an ink rule and its hour; the answer is prose, with real lists. Sources, reach and model are one closed line under the answer (ADR-187). "Found nothing" is always printed. The field is one line that grows |
| Proposed memory | 2,512px | 1,751px | Drawn in the thread, not under the sticky field. Flat fields, *Guardar memória* and a quiet *Descartar* |
| Failed answer | 2,110px | 1,469px | In the thread, heading in amber, no box |
| The list | — | — | Groups over hairlines; a row is the title in the reading face and one caption saying when; the row is the link |
| New conversation | one screen | one screen | The question alone, suggestions as rows, the field. The explanatory sentence is cut |

Images: [conversation](evidence/conversar-ajustes/conversar-depois-mobile.png) ([before](evidence/conversar-ajustes/conversar-antes-mobile.png)) · [disclosures open](evidence/conversar-ajustes/conversar-depois-aberto-mobile.png) · [new conversation](evidence/conversar-ajustes/conversar-vazio-depois-iniciais-mobile-tela.png). In full-page captures the sticky field and bottom bar are drawn mid-page.

## Ajustes

| Page | Before | After | What changed |
| --- | --- | --- | --- |
| Index | one screen | one screen | Rows that say each group's current state ("Silêncio das 22:00 às 07:00 · até 5 por dia"). Icon tiles gone |
| Você e o assistente | 1,473px | 991px | One-line rows with the control as the value |
| Seu dia e avisos | 2,974px | 1,370px | Device alerts are a state sentence and one row that opens the same four groups and one Save |
| O que ele faz sozinho | 4,292px | 1,102px | Six rows instead of six open forms; *Alterar* opens one in place. The rule is behind *Como ele decide* |
| IA e custos | 2,513px | 1,671px | Pending entries first. The key is a row that opens its unchanged form; *Remover chave* is a quiet word in the risk tone |
| Aparência | 1,832px | one screen | Theme as one three-segment choice; install is one closed row |
| Privacidade e conta | 3,121px | 1,828px | Take a copy, what is stored, sessions — then documents, then *Apagar a conta* last, its only door |

Images: [index](evidence/conversar-ajustes/ajustes-depois-mobile.png) ([before](evidence/conversar-ajustes/ajustes-antes-mobile.png)) · [dia](evidence/conversar-ajustes/ajustes-day-depois-mobile.png) ([before](evidence/conversar-ajustes/ajustes-day-antes-mobile.png)) · [sozinho](evidence/conversar-ajustes/ajustes-autonomy-depois-mobile.png) ([before](evidence/conversar-ajustes/ajustes-autonomy-antes-mobile.png)) · [IA](evidence/conversar-ajustes/ajustes-ai-depois-mobile.png) ([before](evidence/conversar-ajustes/ajustes-ai-antes-mobile.png)) · [privacidade](evidence/conversar-ajustes/ajustes-privacy-depois-mobile.png) ([before](evidence/conversar-ajustes/ajustes-privacy-antes-mobile.png)).

The key form, the removal confirmation and the hidden `observedUpdatedAt` witness keep exactly their fields.

Rendered from the real pages with mocked loaders through the compiled stylesheets, light, **not signed in**.

## Verification

- `npm test`: 602 files, 11,103 tests. `npm run typecheck`: clean. `npm run lint`: 0 errors. `npm run build`: passed.
- Static specs (desktop and Pixel 7): 677 passed, 13 skipped. New checks cover both surfaces at 390 and 320, closed and with disclosures or an editor open.
- `e2e/life-brain-b7-conversation.spec.ts:140` still fails as it did before this work (the palette `kbd` assertion).
- No guard was deleted. Tests rewritten because what is visible changed: the accessibility fixtures for sources and the transcript; "an answer carries its sources and the model" now finds the model inside *Onde procurei*; the settings summary wording; the push fixture opens its row first.

## What the owner will notice

- Sources are one tap away; model and reach are not visible by default; dates are said once per day.
- A turn's outcome appears in the thread and takes focus there.
- Settings: "Salvo · Desfazer" is a quiet chip under the saved form, not a dark toast. The key row arrives open only when there is no working key. Deleting the account has one link.
- Text hidden on a phone but kept for assistive technology: setting hints, theme descriptions, some intro sentences.

## Not verified

- The signed-in app, the device, hydration, real streaming, `en`, dark by eye (one dark render of the thread).
- **Every settings save ran against mocked actions only**: profile, key save/rotate/remove, policy save and undo, push, export, sign-out everywhere, consent revocation.
- Ten online specs were edited and not run.
- `field-sizing` on iOS Safari; `<details name>` exclusivity in Safari and Firefox.
- The new-conversation screen and the desktop thread changed least.

## Follow-up, 2026-11-18: two sides and source cards (ADR-189)

After using the thread the owner asked for the question on the right and the answer on the left, and for sources as cards in the conversation. He approved a [mockup](evidence/conversar-ajustes/chat-mockup-aprovado-mobile-dark.png); the result: [phone](evidence/conversar-ajustes/conversa-lados-depois-mobile.png) ([dark](evidence/conversar-ajustes/conversa-lados-depois-escuro-mobile.png), [before](evidence/conversar-ajustes/conversa-lados-antes-mobile.png)) · [desktop](evidence/conversar-ajustes/conversa-lados-depois-desktop.png) ([before](evidence/conversar-ajustes/conversa-lados-antes-cinco-desktop.png), a short thread pushed to the bottom).

Deviation from the mockup: task and reminder cards are headed by their kind ("Tarefa", "Lembrete") and a date, not their title, because the resolver reads them content-free (ADR-146). `npm test` 613 files / 11,306 tests; typecheck, lint, build clean. Not verified: the signed-in app, real streaming; `online-agenda-answer` edited and not run.

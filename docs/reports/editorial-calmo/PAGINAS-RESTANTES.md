# The remaining pages, recomposed

- **Date:** 2026-11-18
- **Branch:** `design/paginas-restantes`
- **Design:** [`docs/initiatives/editorial-calmo/DESIGN.md`](../../initiatives/editorial-calmo/DESIGN.md) · ADR-180 · ADR-188
- **Migration:** none. No Server Action, RPC, query, redirect or `src/proxy.ts` change.

With this pass every page of the product has been through Editorial calmo.

## Pages

Heights at 390px, same fixture before and after. "One screen" means the page fits the 844px viewport.

| Page | Before | After | What changed |
| --- | --- | --- | --- |
| Login, recover, resend, reset | one screen | one screen | One column, no card or gradient: mark and language, one sentence, fields, one button, text links. The heading starts at the same height on every page (it moved between 85 and 291px) |
| Register | 858px | 897px | The consent checkbox sits on the line of its sentence; the password rule is a caption that updates as it is typed. Taller: fields and button went from 44 to 52px |
| Entry page | 981px | 1,015px | *Já tenho conta* is directly under the tagline (it was the last line); the claims are rows |
| Consent, account state, account deletion | — | — | Same frame. On deletion the four consequence sentences stay verbatim above the first field; the submit is the one filled risk button |
| Custos | 4,827px | 1,748px | The month's amount is the subject; the split by function is rows; per-model, last calls and prices are folded. No sideways scroll |
| Processamento | 2,146px | 1,079px | One sentence states the queue; failures first; finished folded; raw error behind *Detalhe técnico* |
| Busca | 1,726px | 1,543px | The field first; filters on one closed line; results grouped by kind |
| Lembretes | 2,740px | 1,511px | The Agenda masthead; rows grouped by when, one verb each; views at the foot (ADR-188) |
| A reminder | one screen | one screen | The reminder's text is the subject; its facts are rows changed in place; ending and cancelling last |
| Hoje, onboarding | 1,262px | 1,280px | A section of rows showing all seven steps instead of a card showing one |

Images (phone): [login](evidence/paginas-restantes/auth-login-depois-mobile.png) ([before](evidence/paginas-restantes/auth-login-antes-mobile.png)) · [register](evidence/paginas-restantes/auth-register-depois-mobile.png) ([before](evidence/paginas-restantes/auth-register-antes-mobile.png)) · [entry](evidence/paginas-restantes/auth-entrada-depois-mobile.png) ([before](evidence/paginas-restantes/auth-entrada-antes-mobile.png)) · [deletion](evidence/paginas-restantes/auth-deletion-depois-mobile.png) ([before](evidence/paginas-restantes/auth-deletion-antes-mobile.png)) · [consent](evidence/paginas-restantes/auth-consent-depois-mobile.png) ([before](evidence/paginas-restantes/auth-consent-antes-mobile.png)) · [Custos](evidence/paginas-restantes/custos-depois-mobile.png) ([before](evidence/paginas-restantes/custos-antes-mobile.png)) · [Processamento](evidence/paginas-restantes/processamento-depois-mobile.png) ([before](evidence/paginas-restantes/processamento-antes-mobile.png)) · [Busca](evidence/paginas-restantes/busca-depois-mobile.png) ([before](evidence/paginas-restantes/busca-antes-mobile.png)) · [Lembretes](evidence/paginas-restantes/lembretes-depois-mobile.png) ([before](evidence/paginas-restantes/lembretes-antes-mobile.png)) · [a reminder](evidence/paginas-restantes/lembrete-detalhe-depois-mobile.png) ([before](evidence/paginas-restantes/lembrete-detalhe-antes-mobile.png), [open](evidence/paginas-restantes/lembrete-detalhe-depois-aberto-mobile.png)) · [onboarding](evidence/paginas-restantes/hoje-onboarding-depois-mobile.png) ([before](evidence/paginas-restantes/hoje-onboarding-antes-mobile.png)).

Rendered from the real pages with mocked loaders through the compiled stylesheets, light, **not signed in**.

## Security surface

On every signed-out and gate form the field names, `type`, `autocomplete`, `required`, length limits, hidden inputs, the Turnstile widget, the submit and the Server Action are unchanged; `auth-pages.test.tsx` and the gate tests pin each field's attributes. Added: `aria-describedby` on the two new-password inputs, `lang` on the frame, a language link (the existing `LocaleSwitchLink`). `PasswordHint` listens to the server-rendered input, holds no value and sends nothing.

## Verification

- `npm test`: 612 files, 11,298 tests. `npm run typecheck`: clean. `npm run lint`: 0 errors. `npm run build`: passed.
- Static specs (desktop and Pixel 7): 831 passed, 13 skipped — every page at 390 and 320, closed and open, without overflow or a target under 44px.
- `e2e/foundation.spec.ts` was not edited and not run locally; each assertion was walked against the new markup. CI runs it.
- No guard was deleted. Tests rewritten because what is visible changed: D.1 "at most three controls" on a reminder row (now two); UX-12, `2R-SERIES-008` and B.7 defect 5 moved to the reminder's page; the search mirror in `accessibility.spec.ts`.

## What the owner will notice

- Reminders: reschedule, edit and cancel are on the reminder's page (tap its title), not on the row. The quick verb reads "Adiar 1h".
- Custos: token counts are inside the folds. Processamento is failures-first, not chronological.
- Busca: filters are folded; results are grouped by kind.
- Onboarding shows all seven steps; progress reads "2 de 7 passos".
- Signed-out pages have a language link.

## Not verified

- The signed-in app, the device, dark and `en` by eye beyond a few renders; any real round trip (sign-in, sign-up, deletion, snooze, reschedule, search).
- The reminder page's `router.refresh()` after a command.
- Real Turnstile inside the new column (a placeholder was measured).
- Seven online specs were rewritten and not run.
- Processamento rows still name the kind, not the entry: the page does not load the text.

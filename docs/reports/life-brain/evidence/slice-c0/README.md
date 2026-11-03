# Slice C.0 — evidence

Copy and navigation stop assuming work (`LB-C-008`, ADR-145). Zero migrations, prompt unchanged.

## What was run (2026-11-02, Linux cloud session)

| Gate | Result |
| --- | --- |
| `src/lib/closeout/life-brain-c0-copy-guard.test.ts` | written first: 7 of 8 failed against `main`; 8 of 8 after the change |
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors; 3 pre-existing warnings in files this slice does not touch |
| `npx vitest run` | 540 files, 10,054 passed |
| `npm run build` | green |
| Playwright `layout-contracts` + `accessibility`, desktop + mobile, production build | 223 passed, 5 skipped |

## What changed, by surface

| Surface | Before | After |
| --- | --- | --- |
| Rail / Hoje strip / palette | Trabalho · Work | Tarefas · Tasks |
| Task list title, views, modes | Trabalho, "Visões de Trabalho", "Modos de Trabalho" | Tarefas, "Visões das tarefas", "Modos das tarefas" |
| Task page back link | Trabalho | Tarefas |
| Hoje | "Aguardando outras pessoas", "Ver todo o trabalho" | "Aguardando retorno", "Ver todas as tarefas" |
| Organizations (nav, page, selector, dialog, search, history, automation) | Empresa(s) · Company/Companies | Organização(ões) · Organization(s) |
| Memória lens lines | "Quem aparece no seu trabalho.", "Empresas e clientes." | "Quem faz parte da sua vida.", "Onde você trabalha, estuda, se cuida ou é cliente." |
| Contexts intro | "Âmbitos que separam o que é trabalho do que é pessoal." | "As áreas da sua vida: trabalho, casa, saúde, família, estudos…" |
| Placeholders | contract reviewer · report task · Acme invoice · morning meetings | family doctor · blood-test task · November light bill · allergy |

## Not captured

No screenshots: this session had no account on the linked project, so the pages could not be rendered with data. The online journeys whose selectors this slice changed — `online-entity-graph`, `online-entity-editing`, `online-phase-2p-contextual`, `online-relationships`, `online-brain-lenses`, `online-mobile-navigation`, `online-phase-2p-automation` — were updated and **not run**. Both are open in `docs/TODO.md`.

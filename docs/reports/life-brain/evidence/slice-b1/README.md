# Slice B.1 — evidence

Deterministic agenda answers and "não encontrei" without a model (`LB-B-005`, `LB-B-008`, ADR-146).

## What was run (2026-10-31, Windows, UTC-3)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | 0 errors |
| `npx eslint src e2e scripts` | 0 errors; 3 pre-existing warnings in files this slice does not touch |
| `npx vitest run` | 9,984 passed, 2 failed, 5 files failed. Three files never load on Windows (CRLF shebang): `hosted-auth-parity`, `signup-hardening-admin-boundary`, `storage-orphan-scanner` — pre-existing. Two guards timed out under load (`project-key-guard`, `reports-taxonomy-guard` links) and pass alone (33/33). |
| Slice tests | `agenda-intent` (21 positive, 19 negative sentences), `agenda-answer` (windows, masking, failed lanes, month padding, bound, en), `routing`, `assistant/actions`, `chat/actions` (agenda and zero-source paths make no provider call and write no `chat` usage row), `resolve-sources`, `source-list`, `phase-2q-foundation` |
| `npm run build` | green |
| Playwright `foundation`, `accessibility`, `layout-contracts`, desktop + mobile, production build | 247 passed, 5 skipped |
| `e2e/online-agenda-answer.spec.ts`, desktop + mobile, against `npm run start` and the linked project | **6 passed** (owner authorized the hosted write in chat) |

## The online journey

A disposable account with **no AI key** and one task seeded for it (due tomorrow at 15:00, São Paulo) asks "O que tenho amanhã?" and then "O que tenho depois de amanhã?" in the same thread, in pt-BR and en; the account is deleted afterwards. It asserts the answer text, the agenda reach sentence, one task link, no model id under the message, and — after both locales — **zero `ai_usage_events` rows** for the account.

| File | Shows |
| --- | --- |
| `agenda-tomorrow-{pt-BR,en}-{desktop,mobile}.png` | the answer with two lines and the task as a source |
| `agenda-empty-{pt-BR,en}-{desktop,mobile}.png` | the same thread with the empty-window answer and "Nada na sua agenda nesse período" |

**What the first run taught.** It failed 4 of 6, expecting one item and finding two: `tasks_create_due_reminder` (`202607160007_agent_operations.sql`) gives every task inserted with a `due_at` a reminder one hour earlier, and the calendar projection shows both. The answer was right and the spec was wrong; the spec now asserts both lines.

## Caveats on the screenshots

- They are `fullPage` captures, so the sticky composer is painted over the middle of the page and hides part of the source block (the "Abrir" link on desktop). That is the capture, not the layout.
- The mobile bar is the pre-A.2 one (`Hoje · Registros · + · Trabalho · Brain`), because this branch is cut from `main` without #347.

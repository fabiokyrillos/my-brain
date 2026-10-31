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

## What was not run, and why

- **`e2e/online-agenda-answer.spec.ts` has never been executed.** It creates a disposable account (no AI key), seeds one task due tomorrow for that account only, asks "O que tenho amanhã?" and "O que tenho depois de amanhã?" in pt-BR and en, asserts the answer, the agenda reach sentence, the task link and that the account has zero `ai_usage_events` rows, then deletes the account. The session's permission classifier refused the hosted write. To run it:

  ```bash
  npm run build && npm run start
  LIFE_BRAIN_EVIDENCE=docs/reports/life-brain/evidence/slice-b1 npm run test:e2e:online -- e2e/online-agenda-answer.spec.ts --project=desktop --project=mobile --workers=1
  ```

- **No screenshot of an agenda answer exists** for the same reason — the screenshots are that spec's output. ADR-145 Decision 8 is therefore not yet met for this slice.

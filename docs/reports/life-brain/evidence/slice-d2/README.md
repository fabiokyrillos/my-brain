# Life Brain D.2 — evidence

Slice D.2 (ADR-166): lists and notices, themes T3 and T5 of `../../FEEDBACK_DONO_2026-11-05.md`.

## How it was captured

- **`before/`** — the D.1 production build (no D.2 code), signed in as the test account on the linked project, through `e2e/online-life-brain-baseline.spec.ts` with `LIFE_BRAIN_ROUTES=notifications,notifications-menu,people,library,organizations,memories`, iPhone 390 and desktop 1440, light and dark (`-dark`).
- **`after/`** — the same instrument on this branch's production build.
- **`after/fixture-notice-menu-iphone-390.png`** — `e2e/life-brain-d2-lists.spec.ts` with `LIFE_BRAIN_EVIDENCE` set.

## What the captures cannot show

- **The bulk verbs pressed.** The test account has 50+ unread notices; pressing "Marcar todos como lidos" on the hosted project would rewrite them, so the instrument never presses it. `after/notifications-*` shows the offer; the outcome and the undo are proved by `bulk-actions.test.ts`, `bulk-data.test.ts`, `notification-bulk-bar.test.tsx` and the fixture lane.
- **People grouped.** The test account has no people; `people-groups.test.ts` proves the grouping.

## What to compare

| Complaint | Before | After |
| --- | --- | --- |
| The queue only grows (T5) | `before/notifications-*` | `after/notifications-*` ("Marcar todos como lidos" above the list) |
| The "⋯" menu is giant (T5) | `before/notifications-menu-*` | `after/notifications-menu-*` |
| The tabs scroll with no sign of more (T3) | `before/people-*`, `before/library-*` | `after/people-*`, `after/library-*` (the faded edge) |
| "Aparece no seu contexto" under every person (T3) | (no people on the account) | the sentence is gone from the code; grouping by area |
| Creating an organization means going to its page (T3) | `before/people-*` | `after/people-*` ("Nova organização" under the strip) |

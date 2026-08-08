# Phase 2J.1 — Hoje as one destination: acceptance

**Slice:** `2J.1` · **Status:** closed · **Migrations:** 0

Every row below cites the artifact that proves it. A row without a resolving
citation is a refusal in `generate-phase-2j-traceability.mjs`, not a warning.

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2J-HOJE-001` | **built** | `src/app/[locale]/app/today/page.tsx` redirects to `/app`; `today` moved from Work's alias list to `home`'s in `capabilities.ts`. |
| `2J-HOJE-002` | **built** | The URL still resolves and the nav highlights `home`; `capabilities.test.ts` and `work/page.architecture.test.ts` assert both, and Phase 2I's `phase-2i-shell-guard.test.ts` was amended to assert where the alias went rather than merely that it left. |
| `2J-HOJE-003` | **built** | `dueState()` separates `overdue` from `due_today` in the user's own timezone; `home-priorities.test.tsx` asserts a distinct marker for each. |
| `2J-HOJE-004` | **built** | `selectTodayPriorities()` -- a qualification test plus a stable sort over `due_at`, `status` and the pre-existing `manual_priority` column. No model call, no new persistence. |
| `2J-HOJE-005` | **built** | The ordering rule is rendered in plain language and asserted (`home-priorities.test.tsx`). |
| `2J-HOJE-006` | **built** | Fewer than three qualifying items renders fewer; nothing qualifying renders the empty state rather than borrowing from the list below. |
| `2J-HOJE-007` | **baseline** | Capture was already the first interactive element on Hoje before this phase (`home-view.tsx` hero). Asserted, not built. |
| `2J-HOJE-008` | **baseline** | Hoje already rendered lists rather than metric tiles. The phase added one count line at end-of-day, whose count is the subject of an action. |
| `2J-HOJE-009` | **built** | Every section -- including the two this phase added -- renders a distinct quiet state; asserted in `home-priorities.test.tsx` and `home-end-of-day.test.tsx`. |
| `2J-HOJE-010` | **built** | `Promise.allSettled` replaces `Promise.all`; each projection degrades to its own empty shape and logs. `home-resilience.test.tsx` fails each of the four projections in turn and asserts Hoje still renders with capture intact. |


# EGC G-0.4 — Locale-ternary baseline

**Pre-code gate G-0.4** of `ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md`.
Establishes the pinned ceiling that `EGC-SURFACE-002` forbids raising and that EGC.3's
permanent non-increase guard will assert against.

- **Measured** — 2026-07-31, from `main` at `a745011`.
- **Migration head at measurement** — `202607310064`.
- **Result** — **266 occurrences across 34 files.**

---

## 1. Measurement method

Exactly the method `PRODUCT_UX_CLOSEOUT.md` §7 documents, re-executed rather than
inherited. The owner's instruction was explicit: *do not inherit the number 266 without
re-running the documented method.*

```sh
git grep -oE '\bpt \?' -- 'src/' \
  ':(exclude)src/**/*.test.ts' \
  ':(exclude)src/**/*.test.tsx'
```

- **Occurrences** — the line count of that command's output.
- **Files** — the distinct-path count of the same output.
- Test files are excluded because a locale ternary inside a test is an assertion about
  copy, not shipped copy.

**Re-measured result: 266 occurrences / 34 files — which confirms the closeout's figure.**
The number was verified, not assumed; had it drifted, the pinned ceiling would have been
the measured value, not the documented one.

## 2. Trajectory

| Point | Occurrences | Source |
| --- | --- | --- |
| Pre-remediation base | 288 | `PRODUCT_UX_CLOSEOUT.md` §7 |
| Product UX/UI remediation close (Slice H) | 266 | `PRODUCT_UX_CLOSEOUT.md` §7 |
| **This measurement (G-0.4)** | **266** | executed here |

Unchanged since the remediation closed, as expected: nothing has shipped to `src/` since.

## 3. Per-file inventory

| File | Occurrences |
| --- | --- |
| `src/features/profile/settings-form.tsx` | 53 |
| `src/app/[locale]/app/costs/page.tsx` | 37 |
| `src/features/daily-cycle/technical-details.tsx` | 13 |
| `src/app/[locale]/app/inbox/page.tsx` | 13 |
| `src/app/[locale]/app/people/[personId]/page.tsx` | 11 |
| `src/features/operations/task-list.tsx` | 10 |
| `src/app/[locale]/app/projects/[projectId]/page.tsx` | 9 |
| `src/features/daily-cycle/entry-review.tsx` | 8 |
| `src/app/[locale]/app/inbox/[entryId]/page.tsx` | 8 |
| `src/app/[locale]/auth/reset/page.tsx` | 7 |
| `src/app/[locale]/auth/register/page.tsx` | 7 |
| `src/app/[locale]/auth/login/page.tsx` | 7 |
| `src/app/[locale]/app/questions/page.tsx` | 7 |
| `src/app/[locale]/app/notifications/page.tsx` | 7 |
| `src/app/[locale]/app/projects/page.tsx` | 6 |
| `src/app/[locale]/app/people/page.tsx` | 6 |
| `src/features/tasks/task-candidate-form.tsx` | 5 |
| `src/features/capture/quick-capture-form.tsx` | 5 |
| `src/app/[locale]/auth/recover/page.tsx` | 5 |
| `src/app/[locale]/app/reviews/page.tsx` | 5 |
| `src/app/[locale]/app/jobs/page.tsx` | 5 |
| `src/features/tasks/actions.ts` | 4 |
| `src/features/shell/pagination-links.tsx` | 4 |
| `src/app/[locale]/app/error.tsx` | 4 |
| `src/app/[locale]/app/chat/[conversationId]/page.tsx` | 4 |
| `src/features/operations/inline-create-form.tsx` | 3 |
| `src/app/[locale]/app/chat/page.tsx` | 3 |
| `src/features/daily-cycle/task-detail-view.tsx` | 2 |
| `src/app/[locale]/app/settings/page.tsx` | 2 |
| `src/app/[locale]/app/capture/page.tsx` | 2 |
| `src/features/reminders/copy.ts` | 1 |
| `src/features/entities/copy.ts` | 1 |
| `src/features/daily-cycle/needs-attention-list.tsx` | 1 |
| `src/features/assistant/copy.ts` | 1 |
| **Total** | **266** |

**34 files.** The two largest — `settings-form.tsx` (53) and `costs/page.tsx` (37) — hold
**90 of 266, or 34 %**, matching the closeout's own inventory.

## 4. Files Entity Graph Completion will touch

Four already carry a count, and are the ones where EGC-SURFACE-002 has teeth:

| File | Current | EGC slice |
| --- | --- | --- |
| `src/app/[locale]/app/people/[personId]/page.tsx` | 11 | EGC.1 (Company create-and-select), EGC.2 |
| `src/app/[locale]/app/projects/[projectId]/page.tsx` | 9 | EGC.1, EGC.2 |
| `src/app/[locale]/app/people/page.tsx` | 6 | EGC.1 |
| `src/app/[locale]/app/projects/page.tsx` | 6 | EGC.1 |
| `src/features/operations/inline-create-form.tsx` | 3 | EGC.1 (`createRecord` gains two kinds) |
| `src/features/entities/copy.ts` | 1 | EGC.1, EGC.2 — all new copy lands here |

**EGC must not raise any of these.** New copy goes into the typed `copy.ts` modules. The
ceiling is the total, not the per-file count, so a reduction in one file cannot be spent
raising another without the guard noticing — but the intent is that the total stays at
**266 or falls**.

## 5. What this gate does and does not authorize

- **Does:** pin 266 as the ceiling EGC.3's permanent guard asserts against.
- **Does not:** authorize the UX-22 localization sweep. That remains the one DEFERRED
  finding of the closed product UX ledger, is not Entity Graph Completion scope, and is not
  Phase 2G scope. This gate ships the guard the UX audit proposed and nobody built; the
  sweep itself stays where the closeout put it.

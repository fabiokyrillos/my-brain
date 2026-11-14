# Life Brain D.1 — evidence

Slice D.1 (ADR-165): the Agenda, theme T2 of `../../FEEDBACK_DONO_2026-11-05.md`.

## How it was captured

- **`before/`** — `main` at `a253392` (the code of PR #376), production build (`npm run build && npm run start`), signed in as the test account on the linked project, through `e2e/online-life-brain-baseline.spec.ts` with `LIFE_BRAIN_ROUTES=calendar,calendar-week,calendar-month,calendar-plan,reminders`, at iPhone 390 and desktop 1440, light and dark (`-dark` suffix).
- **`after/`** — the same instrument on this branch's production build, plus `calendar-picker` (the week with the date picker opened by a tap).
- **`after/fixture-*`** — `e2e/life-brain-d1-agenda.spec.ts` with `LIFE_BRAIN_EVIDENCE` set: the reminder card (closed and with "Mais" open) and the week with lines in it, rendered with the product's own stylesheets.

## What the signed-in captures cannot show

The test account has **no reminders** and **nothing on this week's calendar**, so `reminders-*` and `calendar-week-*` show the redesigned empty states. Seeding data on the hosted project is not done from a session (it was refused as a shared-resource write on 2026-10-30), so the shapes that only exist with content are the fixture captures above. Planejar does have content: the account's open tasks fill its pool.

## What to compare

| Complaint (T2) | Before | After |
| --- | --- | --- |
| The date label is not a control | `before/calendar-*` (a paragraph between arrows) | `after/calendar-picker-*` |
| The week is not a week | `before/calendar-week-*` (two wide columns, the rest off screen) | `after/calendar-week-*`, `after/fixture-week-*` |
| Planejar: what is "planned", the checkbox, monospace, a nested card with "Aplicar" per task | `before/calendar-plan-*` | `after/calendar-plan-*` |
| The reminder card is too big | (no reminder on the account) | `after/fixture-reminder-card-*` |

Also visible in `before/calendar-month-*`: "Grade do mês de novembro de 2026" printed above the month — a caption whose hiding class did not exist (ADR-165 Decision 5). Gone in `after/`.

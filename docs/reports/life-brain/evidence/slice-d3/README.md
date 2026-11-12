# Life Brain D.3 — evidence

Slice D.3 (ADR-167): the small remainders.

- **`settings-measurements-whole-word.json`** — Ajustes measured on the linked project (production build, test account, iPhone 390 and desktop 1440, pt-BR and en) with the instrument's new whole-word matcher: `technicalWords` is empty everywhere. The old substring matcher reported "nan" because "Fer**nan**do de Noronha" is a time-zone option on that page.
- The other items have no signed-in evidence: ⌘K needs a Mac; the test account has no record stating a birthday and no multi-day event. They are proved by `shortcut-hint.test.tsx`, `birthday-proposal.test.tsx` / `entry-birthdays.test.ts` / `actions.test.ts`, `calendar-spans.test.ts` and the "multi-day event is one bar" case of `e2e/calendar.spec.ts`; the breakpoints by `breakpoint-guard.test.ts`.

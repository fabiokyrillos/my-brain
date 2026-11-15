# Life Brain E.1 — evidence

Slice E.1 (ADR-169): Configurações redesigned, theme T4 of `../../FEEDBACK_DONO_2026-11-05.md`, from the mockups in `../proposal-ajustes/`.

## How it was captured

- **`before/`** — the `main` production build (track D merged, no E.1 code), signed in as the test account on the linked project, through `e2e/online-life-brain-baseline.spec.ts` with `LIFE_BRAIN_ROUTES=settings,settings-ai,settings-notifications,settings-appearance,settings-privacy,settings-account`, iPhone 390 and desktop 1440, light (all) and dark (settings, ai, notifications, privacy).
- **`after/`** — the same instrument on this branch's production build, with the groups by name: `settings` (on the phone, the list of groups), `settings-general`, `settings-day`, `settings-autonomy`, `settings-ai`, `settings-appearance`, `settings-privacy`; light and dark.

## What the captures cannot show

- **A save and its undo.** Pressing a control would write the test account's profile on the hosted project, so the instrument never changes anything. Save on change, the receipt, the undo and the failure path are proved by `src/features/profile/settings-form.test.tsx`.
- **A redirect.** `after/` captures the groups at their new URLs; the 307 from each 2P.5 slug is `[section]/page.tsx` and `sections.test.ts`.

## What to compare

| Complaint | Before | After |
| --- | --- | --- |
| Eight sections, then a form, on the phone | `before/settings-pt-BR-iphone-390.png` | `after/settings-pt-BR-iphone-390.png` (the list of groups, each with its state) |
| Numbered form blocks and a save bar | `before/settings-pt-BR-desktop-1440.png` | `after/settings-general-pt-BR-desktop-1440.png` |
| Notifications as a wall of explanations | `before/settings-notifications-*` | `after/settings-day-*` |
| Privacy as a wall of tables | `before/settings-privacy-*` | `after/settings-privacy-*` |
| AI routing behind "IA avançada" | `before/settings-ai-*` | `after/settings-ai-*` |

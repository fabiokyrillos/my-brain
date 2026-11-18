# The shell (Editorial calmo, slice 7)

- **Date:** 2026-11-18
- **Branch:** `design/topo-do-app`
- **Design:** [`docs/initiatives/editorial-calmo/DESIGN.md`](../../initiatives/editorial-calmo/DESIGN.md) · ADR-180
- **Migration:** none.

## What was wrong, as rendered at 390

- The top bar had nothing on the left and four unlike things pushed to the right: a text button "Buscar e agir" with a `Ctrl+K` chip (on a phone), a bare "EN", a bell and a tinted avatar disc.
- The locale switch was a top-level control on every screen.
- The account panel was two bold rows in a floating card that did not say whose account it was; sign-out looked like any other row.
- In the bottom bar the labels were the heaviest text on the screen, the current slot was marked by colour alone, and the capture button was lifted out of the bar with a shadow across the page.

## What it is now

| Part | Now |
| --- | --- |
| Phone top bar | The "B" mark and "My Brain" in the reading face on the left, linking to Hoje; search, notifications and account as three 44px line icons on the right. Sticky at phone widths; a hairline appears on scroll (`animation-timeline: scroll()` inside `@supports`, no script; always drawn where unsupported) |
| Language | A row in the account menu on both mounts, through the same `LocaleSwitchLink` |
| Account panel | "Conectado como" and the name, then Ajustes, Idioma and Sair da conta as rows between hairlines; sign-out last, as text in the risk tone. Inside the viewport and clear of the bottom bar at 390 and 320 |
| Bottom bar | Lighter labels; the current slot is ink, weight and a short rule; the capture button is inside the bar |
| Desktop | The rail stays. The top bar is a quiet search field and the bell. The rail's current item is a rule and weight, not a card |

## Evidence

`AppShell` with a stand-in page, real components, compiled stylesheets, light. **Not a signed-in session.**

| | Before | After |
| --- | --- | --- |
| 390 | [png](evidence/shell/antes-mobile.png) | [png](evidence/shell/depois-mobile.png) |
| 390, account open | [png](evidence/shell/antes-conta-mobile.png) | [png](evidence/shell/depois-conta-mobile.png) |
| 1280 | [png](evidence/shell/antes-desktop.png) | [png](evidence/shell/depois-desktop.png) |

No target under 44px and no horizontal overflow at 390 and 320, closed and with the menu open.

## Verification

- `npm test`: 595 files, 10,968 tests. `npm run typecheck`, `npm run lint`, `npm run build`: clean.
- Static specs (`layout-contracts`, `daily-surfaces`, `accessibility`; desktop and Pixel 7): 401 passed, 5 skipped. The shell fixture now mirrors the real header and account menu and is checked at 390×844 and 320×568.
- `mobile-reachability-guard`: the one expectation that required the locale link in the top bar now requires it in the account menu and nowhere in `app-shell.tsx`. Its mount census and the other assertions are unchanged.

## Not as briefed

- No e-mail in the panel: `AccountIdentity` carries a display name only, by design, and a test forbids a second identifier.
- No unread count on the bell: the shell has no data for it.
- The menu has Ajustes, Idioma and Sair; there was no "Dados e IA" row to keep.

## Not verified

- Dark, real iOS Safari, and every `online-*` spec (`online-mobile-navigation.spec.ts` was updated for the moved locale switch and not run).
- Found stale and left alone: `e2e/life-brain-b7-conversation.spec.ts:140` already failed before this change; `online-phase-2o-mobile-accessibility.spec.ts` asserts the palette trigger is under 44px, which was already untrue.

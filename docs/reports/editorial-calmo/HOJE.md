# Editorial calmo — slice 1, Hoje

- **Date:** 2026-11-17
- **Branch:** `design/hoje-editorial-calmo`
- **Design:** [`docs/initiatives/editorial-calmo/DESIGN.md`](../../initiatives/editorial-calmo/DESIGN.md) · ADR-180
- **Migration:** none. No projection, action, RPC or copy key changed.

## What changed

| File | Change |
| --- | --- |
| `src/features/shell/home-view.tsx` | `Section` puts the section link in the heading, before the rows; the hint is a paragraph under the heading. The greeting is one line. The lead attention item renders as `NeedsAttentionItemRow` instead of `NeedsAttentionLeadCard`. |
| `src/app/operations.css` | One block, scoped to `.home-dashboard`: sections lose their panel; `.list-row` and `.home-task` become hairline rows; titles break anywhere and every list has a `minmax(0,1fr)` track; notice controls share lines; the capture field rests at one line; "Ir para" is one quiet row. |
| `src/features/shell/home-view.test.tsx` | The lead-card test becomes "every attention item is one linking row"; two tests added (the link's place, the one-line greeting). |
| `src/lib/closeout/local-day-correction-convergence.test.ts` | `NeedsAttentionLeadCard` leaves the list of rows Hoje must hand the owner's zone to. |

`NeedsAttentionLeadCard` and its styles are still in the repository and now have no call site. Removing them is a separate, small change.

## Evidence

Rendered from `HomeView` with a fixture matching the owner's recording (two interpretations to review, an overdue-task notice, a reminder notice, three overdue priorities, one item waiting), through the compiled application stylesheet. **This is the page body without the shell, not a signed-in session** — the top bar and the bottom bar are not in these images.

| | Dark | Light |
| --- | --- | --- |
| 390 × 844 | [mobile-dark.png](evidence/hoje/mobile-dark.png) | [mobile-light.png](evidence/hoje/mobile-light.png) |
| 1280 × 900 | [desktop-dark.png](evidence/hoje/desktop-dark.png) | [desktop-light.png](evidence/hoje/desktop-light.png) |
| 390, capture open | [mobile-dark-open.png](evidence/hoje/mobile-dark-open.png) | — |

Measured in the same run:

| Check | 390 | 1280 |
| --- | --- | --- |
| Horizontal overflow, with `dev_digital_bi.test_schema.nc_booking_population` in a title | 0px | 0px |
| Interactive targets under 44px | 0 | 4 — the notice verbs, 34px, unchanged by this slice |
| Page height | 1,857px | 1,613px |

`e2e/layout-contracts.spec.ts` (static fixtures through the real stylesheets, desktop and Pixel 7): 120 passed. It caught one regression while this slice was being written — the new row grid overrode the 700px container rule that stacks a row's context under its title, and a long context starved the title to 0px in a narrow column. The row now stacks at the same container width.

## Not verified

- **The real device.** Nothing here was seen on the owner's iPhone.
- **The signed-in screenshot lane.** `e2e/visual-regression.spec.ts` was not run; its four Hoje baselines will differ and must be redrawn through `visual-baselines.yml`.
- **The capture field inside the real composer.** The resting state is keyed on `:has(textarea:placeholder-shown:not(:focus))`. The preview used a static copy of the composer's markup; voice recording, a kept draft and a pending attachment were not exercised.
- **Width 1440 and the `en` locale** were not captured.

## Left open

Listed in `docs/TODO.md` under *Editorial calmo*.

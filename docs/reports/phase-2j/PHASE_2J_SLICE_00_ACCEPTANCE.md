# Phase 2J.0 — Accessibility lane: acceptance

**Slice:** `2J.0` · **Status:** closed · **Migrations:** 0

Every row below cites the artifact that proves it. A row without a resolving
citation is a refusal in `generate-phase-2j-traceability.mjs`, not a warning.

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2J-ACCESS-001` | **built** | `e2e/accessibility.spec.ts` runs axe over four surfaces at desktop and Pixel 7; wired into CI's `database` job and asserted there by `accessibility-mirror-guard.test.ts`. |
| `2J-ACCESS-002` | **built** | `axe-core` is a declared devDependency, asserted by `accessibility-mirror-guard.test.ts`. It was already in the tree transitively, and a scanner arriving by someone else's hoisting can vanish on an unrelated update. |
| `2J-ACCESS-003` | **built** | Keyboard tab order through the open palette and polite status announcements, both asserted in a real browser (`accessibility.spec.ts`). |
| `2J-ACCESS-004` | **partial** | **Delivered:** dialog semantics, `aria-modal`, and that `aria-controls`/`aria-activedescendant` resolve to real elements -- none of which jsdom can check. **Missing:** focus *restoration* on close, which needs React running and therefore an authenticated route CI has no session for. **Destination:** covered today by Phase 2I's `command-palette.test.tsx` in jsdom; a hydrated browser lane is named in `PHASE_2J_REPORT.md`. |
| `2J-ACCESS-005` | **built** | Every focusable control is focused in turn and asserted to paint an outline, box-shadow or border -- measured from computed style, which is the check jsdom cannot make. |
| `2J-ACCESS-006` | **built** | Rendered bounding boxes measured on the mobile project against WCAG 2.2 AA 2.5.8. **Found a real Phase 2I defect on its first run:** `.library-search-link` rendered 16px tall; fixed in `palette.css`. |
| `2J-ACCESS-007` | **built** | `prefers-reduced-motion` emulated; the palette's computed animation and transition durations asserted to be zero. |
| `2J-ACCESS-008` | **not built, by rule** | No screen-reader session was performed. Recorded as an evidenced negative rather than claimed: `accessibility.spec.ts` states *NOT PROVEN ANYWHERE: a real screen-reader session*, and `accessibility-mirror-guard.test.ts` asserts that sentence is still in the file. **Destination:** a manual session by the owner, named in `PHASE_2J_REPORT.md`. |


# Editorial calmo — the record page (slice 6, `inbox/[entryId]`)

- **Date:** 2026-11-17
- **Branch:** `design/editorial-calmo-registro`
- **Design:** [`docs/initiatives/editorial-calmo/DESIGN.md`](../../initiatives/editorial-calmo/DESIGN.md) · ADR-180
- **Migration:** none. One block of CSS in `app/operations.css`, scoped to `.record-detail`. No markup, projection, action or copy key changed.

## What changed

The page was six bordered cards in a column, each with a round icon. They are sections: a rule across the column, a heading in the reading face, the content beneath.

| Part | Before | After |
| --- | --- | --- |
| What you wrote | A card; the text under a hairline inside it | No box; the text set as a quotation, with a rule beside it |
| What the assistant understood | A card; the fields as a row of pills | A section; the fields as label–value pairs between hairlines |
| Next actions, what now exists, earlier decisions | Cards with a round icon | Sections |
| Technical details | A card | One line under the lighter rule |

Kept in a box on purpose: the attention notice, and each candidate card (a form the owner decides on).

## Evidence

`EntryReview` rendered with a fixture (one attention item, two fields, three outcomes) through the compiled stylesheet, light. **Not a signed-in session.** The next-actions slot holds the person-candidate markup copied from `e2e/layout-contracts.spec.ts`; the task-candidate, event, memory-proposal and revision forms were **not** rendered, and neither was the open technical disclosure.

| | Before | After |
| --- | --- | --- |
| 390 | [png](evidence/registro/registro-antes-mobile.png) | [png](evidence/registro/registro-depois-mobile.png) |
| 1280 | [png](evidence/registro/registro-antes-desktop.png) | [png](evidence/registro/registro-depois-desktop.png) |

Page height at 390 with this fixture: 2,053px before, 1,908px after. No horizontal overflow at either width; no target under 44px at 390.

Static specs (`layout-contracts`, `daily-surfaces`, `accessibility`; desktop and Pixel 7): 347 passed, 5 skipped — including the person-candidate card and the history timeline contracts that live on this page.

## Not verified

The device, the dark theme, the `en` locale, and the forms listed above.

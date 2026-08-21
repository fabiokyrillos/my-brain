# Phase 2Q — Slice 2Q.4 acceptance record

**The defect the lane could not see was a defect *of* the lane. The product was
always correct, and not one product colour was changed to prove it.**

- **Authorization:** implementation, **ADR-128**; the premise correction and the
  classifications, **ADR-129** (2026-08-21).
- **Requirements:** `2Q-ACCESS-001` … `-005` (5 of 42; **37 of 42 cumulative**).
- **Migrations:** **none.** Budget stays **1 allocated · 1 spent**.
- **Baseline:** `main` **`a67a34c`**, worktree clean, zero open PRs, CI green 3/3
  on that exact merge SHA, **100 local = 100 hosted, parity `202608210100`**.
- **Product code changed: none.** Every change is in `e2e/`, `.github/` and
  `playwright.config.ts`.

---

## 1. The order was the requirement, and it is what found this

ADR-127 Decision 6 said: reproduce first, fix second, widen CI third. `2Q-ACCESS-001`
reproduced it — and **the reproduction contradicted the premise the decision was
signed on.** Nothing was changed until the owner had ruled (ADR-129).

Had the slice gone straight to "fix the contrast", the fix would have been a
product CSS change made to satisfy a broken fixture.

---

## 2. What was measured, in the order it was measured

**ADR-129 Decision 9 requires the intermediate steps be preserved**, including the
two conclusions that were wrong. A report showing only the final answer would
teach nothing about how a lane invents a defect.

| # | Measurement | Result | What I concluded, and whether it held |
|---:|---|---|---|
| 1 | `accessibility.spec.ts` on `iphone-emulated` | **2 failed**: `global search` (6 nodes), `Work bulk bar` (7), `color-contrast`, `serious` | the PRD's premise reproduces |
| 2 | axe node detail | `bgColor #ffffff`, `fgColor #f0ede7` / `#b3aca2`, ratios 1.16 / 2.24 | *"the canvas is white — this is a fixture artifact"* — **wrong in its reasoning**, right by accident |
| 3 | `body` computed style, both engines | Chromium `rgb(20,19,17)`; **WebKit `rgba(0,0,0,0)`**, `--background-canvas` **empty** | a second, real lane artifact — but not the contrast cause |
| 4 | The **real app**, `/pt-BR/auth/login`, WebKit | `bodyBg rgb(247,246,243)`, tokens resolved | the product is fine at the `body` level |
| 5 | `html` made opaque, axe re-read | `bgColor #141311`, **`fgColor #000000`**, ratio **1.13**, targets `#search-type` / `#search-period` | *"black text on selects — a real product defect"* — **wrong** |
| 6 | The CSS | `.search-filters select` **does** set `color: var(--text-primary)` | the rule is correct; so why is it black? |
| 7 | Isolated repro, 4 sheets | select resolves correctly in WebKit | not the rule |
| 8 | Bisect all **15** stylesheets | all resolve | not the CSS |
| 9 | Bisect the markup, 5 shapes | all resolve | not the markup |
| 10 | Bisect the `<head>` | **`<meta name="viewport">` alone breaks it** | the second artifact, isolated |
| 11 | Real app `/pt-BR/app/search`, theme forced **after** load | WebKit select light-on-white | *"stale theme resolution"* — **an artifact of how I forced it** |
| 12 | Real app, theme set **the product's way** (`localStorage` + pre-paint script) | **both engines `rgb(240,237,231)` on `rgb(28,27,24)`** | **the product is correct.** Reported to the owner; work stopped |
| 13 | Cascade walk on the real bulk bar | the select **inherits** `#f0ede7` through **eight** ancestors | so `<select>` inherits in the product — but not in the fixture |
| 14 | Why | the fixture strips `@import "tailwindcss"`, and **preflight is what makes a form control inherit its colour** | **the cause** |

**Three intermediate conclusions, two of them wrong.** Each had a plausible
artifact behind it, and each was corrected by the next measurement rather than by
argument. That is the finding worth keeping.

---

## 3. The cause, stated once

`e2e/accessibility.spec.ts` inlines the product's CSS with `@import "tailwindcss"`
removed. Tailwind's **preflight** carries
`button,input,optgroup,select,textarea{font:inherit;color:inherit}` — it is what
makes a form control inherit its colour instead of using the UA's `FieldText`.

Without it a `<select>` computes `FieldText`: **white** under Chromium's dark
`color-scheme`, **black** under WebKit's. Black on `#141311` is **1.13:1** — and
it lands on exactly the two surfaces whose text sits on a select, which is why
only those two failed and only on WebKit.

**Chromium could never have caught it**, which is precisely why `ci.yml` running
two Chromium projects was silent for a whole phase. That is now a test.

A **second, independent** artifact was found alongside it: a `setContent`
document carrying a viewport meta with no real origin makes WebKit resolve **no
custom properties at all** on `body` and on form controls. It is what produced
the bogus `#ffffff` backgrounds in measurement 2.

---

## 4. The fix — all of it in `e2e/`

1. **The theme arrives the way the product delivers it.** The lane stamped
   `data-theme` into an HTML string. It now seeds the choice into `localStorage`
   and runs **`APPEARANCE_SCRIPT` imported from
   `src/features/appearance/contracts.ts`** — the product's own code, not a
   lookalike, so the two cannot drift.
2. **A real document loads before the fixture replaces it**, on the app's origin,
   fulfilled in-process so the lane stays hermetic. This is both what a real
   navigation does and what makes `localStorage` reachable — one change, two
   reasons.
3. **Tailwind's preflight rule is restored verbatim**, with the explanation
   beside it. *Restored, not invented*: writing
   `select{color:var(--text-primary)}` instead would have made the lane green
   while still measuring something the product does not do.

---

## 5. The five controls the owner required

| # | Control | Where | Result |
|---:|---|---|---|
| 1 | Without the real mechanism, the lane **reproduces the false positive** | `accessibility.spec.ts`, "control 1" | the retired path is driven on purpose; on WebKit it yields `bodyToken: ""` and `selectColor: rgb(0,0,0)`; **on Chromium it does not**, which is asserted, because that is why CI was blind |
| 2 | With the correct mechanism, **fixture and real page converge** | `online-phase-2q-accessibility-fidelity.spec.ts` | eight properties asserted **equal** between the fixture and the live authenticated page, in **dark and light**, on **both engines** — with the real page asserted to really be in dark and to really have a select, so agreement cannot be two blanks agreeing |
| 3 | axe still detects a **really planted** violation | `accessibility.spec.ts`, "control 3" | grey-on-grey is still reported `serious`; a passing pair reports nothing — two-sided |
| 4 | **No rule was switched off** | `phase-2q-accessibility-lane.test.ts` | axe config byte-pinned (`region` and only `region`), threshold still `serious`/`critical`, no `skip`, no surface removed, both loops over the same list |
| 5 | **No product colour was changed** | `phase-2q-accessibility-lane.test.ts` | `.search-filters select`, both `.work-bulk-*` rules and the dark `--background-canvas` / `--text-primary` pinned byte-for-byte; the lane's `APPEARANCE_SCRIPT` **import** asserted, so the product cannot have been edited to suit the lane |

**A correction inside the controls themselves.** The bulk-bar comparison first
skipped the select whenever the real page had none — which made "they agree" true
of two blanks. The account is now seeded with a task and a row is actually
ticked, because the bulk bar renders only when a row is selected. **A missing
control is not evidence of agreement.**

---

## 6. CI widened — after, and scoped

`ci.yml` installs `webkit` and runs `accessibility.spec.ts` on
`--project=iphone-emulated` alongside the two Chromium projects. The other
journeys stay Chromium-only: the widening is scoped to the lane whose blind spot
was **measured**, not applied speculatively.

`playwright.config.ts`'s paragraph saying *"CI does not select this project"* is
**replaced rather than deleted**, and says why it changed.

---

## 7. Requirements — classified by ADR-129 Decision 7

| Requirement | Class | Why |
|---|---|---|
| `2Q-ACCESS-001` | **built** | an executed investigation: reproduced, located, and compared against the real application, with fourteen recorded measurements |
| `2Q-ACCESS-002` | **baseline** | global search **already** had correct contrast on real WebKit. **No product fix was needed and none was made** — classifying it `built` would claim a change that did not happen |
| `2Q-ACCESS-003` | **baseline** | the Work bulk bar, identically, proved with the bar actually rendered |
| `2Q-ACCESS-004` | **built** | the lane made faithful, then CI widened to it — in that order |
| `2Q-ACCESS-005` | **built** | the citation surfaces introduce no regression: the lane is green on all three projects, and the record states plainly that **none of this is screen-reader evidence** |

---

## 8. Evidence

| Run | Result |
|---|---|
| `accessibility.spec.ts` — `iphone-emulated` | **65 passed**, 5 skipped, 0 failed |
| `accessibility.spec.ts` — `desktop` | **65 passed**, 5 skipped, 0 failed |
| `accessibility.spec.ts` — `mobile` | **70 passed**, 0 failed |
| `online-phase-2q-accessibility-fidelity.spec.ts` — `desktop` | **4 passed** |
| `online-phase-2q-accessibility-fidelity.spec.ts` — `iphone-emulated` | **4 passed** |
| `phase-2q-accessibility-lane.test.ts` | **11 passed** |

---

## 9. What this slice deliberately did not do

- **No product colour, token, CSS or component changed** — pinned, not promised.
- **No axe rule, threshold, selector or surface removed.**
- **No migration.** Budget unchanged at 1 · 1.
- **No AI credential spent.**
- **No screen-reader claim.** `2P-ACCESS-005` stays **WAIVED, NOT PASSED**, and
  the disclaimer is asserted in the suite because a lane on a third engine is
  exactly what a later reader might mistake for coverage.
- **ADR-127 not edited.** ADR-129 amends one premise, by name, and nothing else.
- Signup closed · rollout 25 · 3 · 2 · push HTTP 403 not resumed ·
  `2P-REVIEW-CITATIONS` still **NOT DELIVERED** · successor not started.

---

## 10. What is left open, honestly

Converting the dark scan to **real routes**, as `phase-2o-mobile-accessibility.spec.ts`
already does, is the more robust shape and would remove this whole class of
fixture/product divergence. ADR-129 rejects it **for this slice only**, on size.
It is not a Phase 2Q remainder and it is not hidden: **destination, a later
initiative, at the owner's discretion.**

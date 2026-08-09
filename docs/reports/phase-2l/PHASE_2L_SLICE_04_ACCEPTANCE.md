# Phase 2L — Slice 2L.4 · acceptance record

**Status:** executed. **Zero gestures. Zero migrations.** Hosted parity remains
`202608090089`.

**Baseline:** `main` at `d9971a324224c1f5d42cc8dba7587bd3ce0ee82c` — the 2L.3
merge commit, CI green on all three jobs at that exact SHA. Branch
`codex/phase-2l-slice-4`.
**Requirements covered:** `2L-MOBILE-001…010`; `2L-ACCESS-001…007` re-run for the
mobile layouts.

---

## 1. The lane found three real defects, and that is the point

`2L-MOBILE-001` requires every control to be measured **from paint at a mobile
viewport**, not asserted from source. The existing target-size check measured
`button, a[href]` — every control Phase 2J's surfaces had. Work adds a checkbox
and two pickers, so the locator was widened to
`button, a[href], input, select, summary` and the four Work fixtures were added
to it.

It failed immediately, three times:

| Control | Measured | Now |
|---|---|---|
| The row's **title link** — the way into a task | **16px** | 24px (`inline-flex` + `min-height`) |
| `.panel-view-all` — "open the original entry", shared with Hoje and Registros | **18px** | 24px |
| The relation filter's escape hatch, inside a sentence | **12px** | 24px |
| The row checkbox | 20px | 24px |

The 16px title link is the same shape as the defect Phase 2I shipped and Phase
2J caught on the lane's first execution. **A check that had been widened without
being run would have been green about controls it never looked at.**

**24px and not 44px, deliberately.** 24px is WCAG 2.2 AA (2.5.8), which is the
standard this lane already asserts and the only one the repository has stated.
The row's **actions** are 44px and are the thumb-reach controls; a 44px title on
every row would add half a line of height per task and fight `2L-MOBILE-007`'s
density bound. The trade is recorded here rather than left in a stylesheet.

---

## 2. `2L-MOBILE-004` — the no-gesture guard

A permanent guard over a **named** set of thirteen Work surfaces, matching the
four families OD-2L-5 names in the two shapes they take — a JSX prop and a
listener registration — plus the libraries that would bind them for us and the
`touch-action` CSS a drag implementation reaches for first.

**Three properties it was built to have, each proved on a planted source:**

- **It fires on a handler added "in preparation".** That clause is in the
  requirement because a handler that does nothing yet is the shape a review
  waves through and a decision dies to.
- **It does not fire on a comment.** The modules explain *why* they carry no
  gesture, which means they name what they refuse — and this repository has lost
  a slice to a guard that read its own documentation as a violation.
- **It does not fire on `onClick`, `onChange`, `onSubmit` or the composition
  handlers.** Those are what a visible, labelled control does when it is used.

**It also asserts its own completeness.** A guard over a hand-written list
protects exactly the list, so the list is compared against the Work components
discovered on disk; a new one has to be added, which is the reviewed edit the
decision deserves.

---

## 3. `2L-MOBILE-010` — IME composition

**The failure this prevents is concrete.** A single-line `<input>` inside a
`<form>` submits on Enter, and Enter is also how an IME **commits** a candidate.
On a Japanese, Chinese or Korean keyboard the first Enter means "that is the word
I meant" — and submitting on it would send a half-typed value the user never
chose.

Three clauses, three mechanisms:

- **never submitted mid-composition** — `preventDefault` on the Enter keydown
  while `isComposing` (the platform's own signal) or the component's own ref is
  set, **and** a second guard inside the submit handler, because the keydown
  path is the common one and not the only one;
- **never treated as a completed value** — the same guard, at the boundary the
  value would cross;
- **never discarded by a re-render** — the text inputs are **uncontrolled**, so
  React does not own their content and cannot reset it; and the composition flag
  is a `ref`, so tracking it cannot itself cause the render that would discard
  the composition.

---

## 4. What the browser lane now proves, at a real viewport

| Requirement | Assertion |
|---|---|
| `2L-MOBILE-001` | every control ≥ 24px from paint, over all four Work fixtures |
| `2L-MOBILE-002` | the bulk bar's box does **not intersect** any row's box — geometric, not "it is not `position: fixed`", because that is one way to cover a row and not the only one |
| `2L-MOBILE-003` | every control has a box, is visible and has non-zero opacity **without hovering** |
| `2L-MOBILE-007` | `documentElement.scrollWidth ≤ clientWidth`, and every row action's box lies inside the viewport |
| `2L-MOBILE-009` | the same, at **320 CSS px** and at an emulated **200% zoom**, with no control losing its box |

**200% zoom is emulated by halving the CSS viewport** at the same device width,
which is how the success criterion defines it. Playwright has no page-zoom
control, and a `transform: scale()` would test a transform rather than a reflow.
Stated so the claim is not read as more than it is.

---

## 5. What jsdom proves instead, and why the split

Layout needs a layout engine. What a component *does* does not, and those are
asserted in `mobile-interaction.test.tsx`:

- **selection survives a re-render** — the real cases are an orientation change
  and the on-screen keyboard, neither of which remounts a React tree and both of
  which re-render it;
- **the count is announced when it changes**, in its **own** polite region: one
  region carrying both the count and the outcome would replace "3 selected" with
  the result of a run the user has not started;
- **a control mid-flight is disabled**, so a second accidental touch has nothing
  to hit.

---

## 6. Executed, and not executed

**Executed locally:** focused suites green; lint and typecheck zero-error;
`npm test` — **5213 passing, 0 failing tests** (3 test *files* fail to load on
the documented Windows baseline, green in CI); build green; the accessibility
lane green at **both** viewports, 26 tests on mobile.

**NOT executed, and not inferred — `2L-MOBILE-008` and `2L-ACCESS-008`:**

- **No real device.** Everything above is an **emulated viewport** in a headless
  browser. Pixel 7 emulation is a viewport and a user-agent, not a phone: it has
  no real touch digitiser, no real on-screen keyboard, no real IME, and no
  hardware compositor.
- **No real IME.** The composition events are synthesised. What is proved is that
  the component honours `compositionstart`/`compositionend` and `isComposing`;
  what is not proved is that a real Japanese IME on a real phone emits them in
  the order assumed.
- **No screen-reader session**, no authenticated online journey, no hosted probe.

Both are reported as **not executed** rather than rounded up, and they stay open
exactly as `G-2J.4b` did.

---

## 7. Claims

| id | classification | evidence |
|---|---|---|
| `2L-MOBILE-001` | **built** | Section 1 - every control measured from paint at the mobile viewport over all four Work fixtures; the widened locator found three real defects, all now at the WCAG 2.5.8 minimum |
| `2L-MOBILE-002` | **built** | Section 4 - the bulk bar's box is proved not to intersect any row's box, geometrically rather than by asserting it is not fixed-position |
| `2L-MOBILE-003` | **built** | Section 4 - every control measured without hovering: it has a box, is visible and has non-zero opacity |
| `2L-MOBILE-004` | **built** | Section 2 - a permanent guard over thirteen named surfaces that fires on a handler added in preparation, does not fire on a comment, and asserts its own completeness against the components on disk |
| `2L-MOBILE-005` | **built** | Section 5 - a control mid-flight is disabled rather than re-triggerable, and the one destructive verb stays behind its server-issued confirmation |
| `2L-MOBILE-006` | **built** | Section 5 - the selection survives a re-render, and the count is announced in its own polite region apart from the outcome's |
| `2L-MOBILE-007` | **built** | Section 4 - scroll width never exceeds client width, and every row action's box lies inside the viewport; the filter controls remain rendered at the mobile viewport |
| `2L-MOBILE-008` | **partial** | Section 6 - every mobile behaviour is proved at an emulated viewport and the record says so. Remainder: a real-device session, which needs owner-run hardware. Destination: the same standing as G-2J.4b, carried past close |
| `2L-MOBILE-009` | **built** | Section 4 - reflow proved at 320 CSS pixels and at an emulated 200 percent zoom, with no control losing its box; the emulation method is stated rather than implied |
| `2L-MOBILE-010` | **built** | Section 3 - guarded on the keydown and again inside the submit handler; never discarded by a re-render because the inputs are uncontrolled and the flag is a ref |

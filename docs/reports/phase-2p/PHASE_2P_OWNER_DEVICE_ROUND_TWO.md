# Phase 2P — the owner's second iPhone pass, and the last correction

**The owner ran round two on 2026-08-20.** This records the result, the two
things it rejected, and what was done about each.

**Phase 2P is not closed by this record**, and the roadmap successor is neither
started nor planned.

---

## 1. The result, as the owner reported it

| Item | Result |
|---|---|
| Direct access to Lembretes | **approved** |
| Direct access to Revisões | **approved** |
| The Home *Precisa de você* card | **approved** |
| Edges, absence of sideways scroll, and everything not listed below | **approved** |
| The calendar's filters | **rejected** — *"não estão suficientemente responsivos"* |
| The Revisões page's appearance | **rejected** — *"visualmente muito ruim"* |

**Everything the owner did not name is approved**, and is recorded that way
rather than left ambiguous. Carried over from round one: VoiceOver stays
`NOT EXECUTED — owner waived hardware validation`; the calendar's edges, page
container, title hierarchy and control labels were approved in this pass.

---

## 2. Revisões — two defects, and one of them was not visual

### 2.1 The page queried a table that has never existed

`day-review-projection.ts` read `.from("reviews")`. **No table by that name
exists in any schema** — `information_schema` matches nothing on `%review%`, and
`database.types.ts` has no such key. The real table is **`summaries`**, which
carries *exactly* the seven columns the query selects, and which
`loadReviewListProjection` — the list further down the same page — has been
reading correctly all along.

So the query always failed, `sourceStates.generated` was always `"unavailable"`,
and the page rendered **“Não foi possível ler: Revisão gerada”** on every single
visit — **twice**, once in the partial-read notice and once in the section
itself. A permanent error banner is a large part of *"visualmente muito ruim"*,
and it was never a styling problem.

**How it escaped every gate.** The client parameter was typed `SupabaseClient`
with **no `<Database>` generic**, so the table name was checked against `any`.
`tsc` had nothing to object to. The generic is now applied, which turns a wrong
table name into a build error.

**And the unit test agreed with the bug.** `day-review-projection.test.ts` fakes
the client by table name, and its stubs said `reviews` too — so the test and the
code agreed with each other and both disagreed with the database. That is the
one arrangement a stub can produce and a real query cannot, which is why the new
lane runs against the real database.

### 2.2 Every row rendered all five command forms, open

A date input, a status select and their buttons, five times per row. With four
tasks that is twenty blocks: **4 125 px on desktop and 14 391 px on an iPhone**,
of which the review's own content — what the day contained — was a few lines at
the top.

The verbs now sit behind a `<details>`, which is the disclosure this product
already uses on the calendar (`.calendar-reschedule`). **Nothing is removed and
nothing hides behind a gesture**: the same five verbs, the same command path,
the same confirmation rules, one press away, keyboard-operable, with the native
`<summary>` announcing its own expanded state.

### 2.3 The sections had no boundaries

Eight sections ran as one undifferentiated column of small bold headings. They
are now bordered surfaces, using `.home-section`'s treatment rather than a new
one, so Revisões stops being the one redesigned page that looks like a document.

**Measured after: desktop 4 125 → 2 348 px; iPhone 14 391 → 8 613 px.**

---

## 3. The calendar's filters — arranged, not shrunk

Each group was a `flex-wrap` row, so the last item of each fell alone onto its
own line — *Datas sugeridas* under four lane chips, *Próximo período* under
three pager controls — and every chip was only as wide as its own word, leaving
both edges ragged. *"Pílulas espremidas, quebras desorganizadas e grupos
visualmente confusos"* is what a wrap produces when nothing tells it where to
break.

Each group is now a grid of equal columns sized for its own item count:

| Group | Narrow arrangement |
|---|---|
| Formato | four equal columns — the segmented control the owner suggested, and the selected period is the one filled cell among four identical ones |
| O que mostrar | two equal columns, with a lone last chip spanning the width instead of floating |
| The pager | the period on its own centred line, then prev · today · next as three equal controls |

**No font is reduced**, every control keeps its 44 px height, the DOM order and
therefore the keyboard order are unchanged, and the band still wraps rather than
scrolls.

*One correction inside the correction: the first attempt gave the groups equal
columns and left the chips `inline-flex`, so each sat at the left of a wide cell
— **Dia a small pill and Mês a circle** — and the row was as ragged as the wrap
it replaced. Equal columns only read as a segmented control when the controls
are equal.*

---

## 4. Three probe defects of mine, each measured before blaming the product

| Probe reported | What it actually was |
|---|---|
| the pager is not on two rows (3 distinct tops) | three controls in **one** grid row, one of which wraps to two lines, differing by a pixel at the top. Counting rounded `top` values turns a sub-pixel difference into a failed layout; replaced by the two facts the arrangement actually promises |
| the actions disclosure is not the first thing the keyboard reaches | the row's **title is a link** and takes focus first. The assertion fixed a position where it should have asserted membership of the tab order |
| Lembretes is not on Hoje at all (Pixel 7, intermittent) | the page was still **streaming**, so every box measured zero and the visibility filter correctly discarded them. The same trap the calendar assertions already waited for. **A flake is a defect, and this one was mine** |

---

## 5. Evidence

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | clean outside gitignored `.worktrees/`; only the pre-existing `costs/page.tsx` warning |
| `npm test` | **8692 passed, 0 failed tests**; 3 failed *files* are the recorded Windows shebang baseline |
| `npm run build` | passes |
| exact CI foundation command | **383 passed, 5 skipped** |
| `online-phase-2p-reviews.spec.ts` | new — 3 × desktop, Pixel 7, WebKit iPhone |
| `online-phase-2p-device-findings.spec.ts` | 8 × three lanes, including the new filter-arrangement assertions |
| `online-phase-2p-closeout.spec.ts` | unchanged and green |
| matrix `--check` | 87 classified, unchanged |
| migrations | **zero**; 99 local = 99 hosted, parity `202608190099` |

**Both defects failed a test before they were fixed**, and the table-name repair
was proved by a mutation control: putting `reviews` back made the new assertion
fail on exactly the sentence the owner saw.

**No database, migration, RLS, automation or product rule changed.** The
seeded rows are fixtures on a throwaway account, deleted in `afterAll`.

---

## 6. What the owner still has to check

`PHASE_2P_OWNER_DEVICE_CHECKLIST_ROUND_THREE.md` — the two rejected items only,
and nothing that was already approved.

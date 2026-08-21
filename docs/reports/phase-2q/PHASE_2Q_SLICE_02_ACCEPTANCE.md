# Phase 2Q — Slice 2Q.2 acceptance record

**A review that mentions a task offers a link to that task, and the link lands.
This is the slice the owner asked for.**

- **Authorization:** implementation, **ADR-128** (2026-08-21).
- **Requirements:** `2Q-LINK-001` … `-009` (9 of 42; **23 of 42 cumulative**).
- **Migrations:** **none.** Budget stays **1 allocated · 1 spent**, and a second
  of any kind is a stop condition.
- **Baseline:** `main` **`553b538`**, worktree clean, zero open PRs, CI green 3/3
  on that exact merge SHA, **100 local = 100 hosted, parity `202608210100`**.
- **Re-audit:** zero product files moved on `main` between `c7c8db0` and
  `553b538` — the only delta is `docs/` and one guard.

---

## 1. What changed on screen

The sources area on `/app/reviews/[reviewId]` now lists **every cited record**,
each as a row carrying **a kind, a date and a canonical link** — and nothing
else. A review whose references were never recorded says so honestly instead,
with no empty container.

`OD-2Q-5` is signed as **option C**, and it is implemented **literally**: no
preview, no excerpt, no title, no sensitive text, no reveal control, and no link
born from matching a name.

---

## 2. `2Q-LINK-002` — the gate binds the pair, and the old gap is closed

`authorizeHref`'s allow-set held **bare uuids** and `INTERNAL_ROUTE`'s surface
segment was `[a-z-]+`, never read. `2Q-FOUNDATION-004` executed what that
admitted: **one vouched-for uuid opened `inbox/`, `work/`, `people/`,
`projects/` and `memories/`** — inert while the page passed an empty set, and
**live from the moment slice 2Q.1 filled the column**, which is why it is closed
in the very next unit rather than at closeout.

The set now holds `type:id` pairs and the segment is read back to a type through
`citation-routes.ts`. **One map, two consumers**: the same module the gate checks
against is the one that *builds* the hrefs, so the gate and the renderer cannot
drift into disagreeing about a route.

**A segment that maps to no citable type is refused outright** rather than
compared — so `people/` and `projects/` can never be admitted by any envelope.
Stricter than refusing a mismatch, and it needs no second rule.

**The control this required, and it is a real one.** `markdown.test.ts` asserted
`authorizeHref('/work/{ID}')` **and** `authorizeHref('/inbox/{ID}')` both admitted
with the same allow-set — the defect, encoded as a passing test. It is inverted,
and the block carries **the retired id-only gate re-implemented in one line** as
the control proving every href it now refuses used to pass.

---

## 3. `2Q-LINK-008` — why there is a second resolver, and why that is not drift

The sources area does **not** use `conversation-sources/resolve-sources.ts`.

That module builds every resolved source through `readOnlyPreviewCard`, which
**requires** a `snippet` and a `sensitivity`. For a cited task those are the
task's **title** — content, forbidden here — and a classification derived from
`source_entry_id`, a second derivation `2Q-TRUST-007` forbids. ADR-127 Decision
5.1 states the consequence directly: *a source list carrying no governed content
never calls `resolveContent` at all.*

So `features/reviews/review-sources.ts` exists, and **its shape is the control**:

- `ReviewSourceRow` has **no** `title`, `snippet`, `excerpt`, `preview` or
  `sensitivity` field. Adding one is a visible type change, not a quiet render.
- The queries **select no content-bearing column**: `id,occurred_at` for entries,
  `id,updated_at` for tasks, `id,valid_from,valid_until,created_at` for memories.
  Asserted **on the query**, because a `select("…,title")` nothing rendered today
  would still put the title one edit away from the screen.
- A planted marker on a returned row appears **nowhere** in the resolver's
  output, with a two-sided control proving the marker really was on the input.

`sensitivity-convergence.test.ts` is **untouched, and its reviews file list is
unchanged** — which is what `2Q-TRUST-006` requires. The new files are asserted
clean by this phase's own test rather than by widening the inherited guard.

---

## 4. The uniform row — `2Q-TRUST-006`'s shape, built here

Every row is `kind · date · link`, drawn by **one rule for every value of
`data-kind`**. There is no per-type style and no per-classification branch,
because the row never reads a classification at all.

An **unavailable** row — removed, unreadable or foreign — carries the same kind
label and the same structure, minus the anchor. Slice 2Q.3 asserts the three
cases as a strict **equality**; this slice built the shape that makes that
assertable, and already asserts the structural half.

**No reveal control anywhere**, asserted by scanning a rendered row for *any*
interactive element and finding only the link — with **a planted reveal button
rendered as the control** that makes the scan capable of failing.

---

## 5. Evidence

### Unit and component

| File | Tests |
|---|---|
| `review-sources.test.ts` | 19 — resolution, allow-set derivation, the content refusals, the honest-empty distinction |
| `review-sources-list.test.tsx` | 14 — the (kind, href) pair, the uniform shape, the no-control scan |
| `markdown.test.ts` | 42 — the inverted `(type, id)` gate, with the retired gate as its control |
| `reviews/[reviewId]/page.test.tsx` | the wiring: `2Q-LINK-002/004/006/007` and `2Q-TRUST-001` end to end through the real page |

**Refusal 14 is obeyed**: every resolution assertion drives an entry **and** a
task together. Single-type evidence proves the wrong half.

### The authenticated journey — **the boundary that matters**

`e2e/online-phase-2q-citations.spec.ts`, against the **production build**
(`next start`) and the **hosted database**, on all three lanes:

| Lane | Result |
|---|---|
| `desktop` (Chromium) | **7 passed** |
| `mobile` (Pixel 7) | **7 passed** |
| `iphone-emulated` (**WebKit**) | **7 passed** |

The traceability contract says a citation is proved *"at the boundary where a
link is clicked and lands"*. It is: the journey **clicks the task link and
asserts the browser lands on `/pt-BR/app/work/{taskId}` showing that task**, and
does the same by keyboard with `Enter`.

**Absence assertions are paired with a fixture marker**, because an absence
passes on a blank page. The sources area is asserted to contain neither marker
**while the review's own prose is asserted to contain one** — so if the page had
not rendered, the check would fail rather than pass.

**Nothing here is a screen-reader claim.** `2P-ACCESS-005` stays **WAIVED, NOT
PASSED**.

---

## 6. Three defects this slice's own probes caught

Recorded rather than smoothed over, because each is a class of failure rather
than a typo.

### 6.1 A fixture leaked onto the hosted project, and the residue control is the only reason it was seen

`test.afterAll` guarded on `fixture?.userId` — a variable assigned at the **end**
of `beforeAll`. The lane's first run failed midway (PostgREST refused the bulk
task insert), so `beforeAll` threw, `fixture` was never assigned, and **the
cleanup returned early and deleted nothing.** One throwaway account and its entry
were left on the deployed database.

The residue probe found it because it looks for **markers**, not because the
teardown reported anything. The leftover was removed, and verified gone with the
probe still able to see (2 users, 3 entries readable).

**Both halves are fixed:** the account id is now recorded *the instant it
exists*, so the cleanup guard keys on something that exists as early as the thing
it cleans; and the teardown **asserts the delete succeeded and then re-reads to
prove the cascade left nothing**. A teardown whose failure is invisible is how
residue accumulates one run at a time.

### 6.2 PostgREST refuses a bulk insert whose objects differ in key set

`PGRST102: All object keys must match`. The 2P reviews lane records this rule in
its own comment and this lane hit it anyway — giving one task a `completed_at`
and the other none was enough. Both objects now carry the same keys.

### 6.3 An authority guard must forbid the act, not the word — **four times in this phase**

A scan for a forbidden construct failed on the paragraph explaining why the
construct is forbidden, four separate times:

1. `on delete set null`, inside the `--` comment saying there is no FK;
2. `foreign key`, inside `comment on column` — **prose living inside a statement**;
3. `resolveContent`, inside the paragraph saying the module never calls it;
4. `new Set<string>()`, inside the sentence saying the page no longer passes one.

The tempting repair each time is to reword the explanation until the scanner
agrees, which is fixing the evidence to fit the test. Instead a shared
`executable()` helper strips comments before scanning, it is documented once with
all four instances named, and **every use is paired with a two-sided control**
proving it removes prose and keeps statements — without which a stripper that
removed everything would make every refusal pass on an empty string.

---

## 7. Requirements

| Requirement | Class | Evidence |
|---|---|---|
| `2Q-LINK-001` | **built** | the allow-set is derived from the envelope **after** an owner-scoped re-read; a record that did not come back vouches for nothing |
| `2Q-LINK-002` | **built** | the pair binds; four previously-admitted surfaces now refused **by name**, with the retired gate as the control |
| `2Q-LINK-003` | **baseline** | a refused link renders as its own words; asserted in `markdown.test.ts` and again through the real page |
| `2Q-LINK-004` | **built** | a review naming a real, resolved task by title renders **no anchor** in its prose — with the same task linked in the sources area as the two-sided control |
| `2Q-LINK-005` | **baseline** | the fourteen existing refusals still pass, and four unmappable surfaces join them |
| `2Q-LINK-006` | **built** | one row per citation, canonical href per kind, both locales — and the journey **clicks one and lands** |
| `2Q-LINK-007` | **built** | a citation-free review renders the honest statement, **no list and no empty container**; distinguished from a new review that cited nothing |
| `2Q-LINK-008` | **built** | no content-bearing column selected, no content-bearing field on the row, a planted marker absent from the render, and no `resolveContent` on the path |
| `2Q-LINK-009` | **built** | kind label and href asserted **as a pair**, in both locales, with a **memory-labelled task rendered as the planted control** |

---

## 8. What this slice deliberately did not do

- **No migration.** Budget unchanged at 1 · 1.
- **No AI credential spent.** The review is a synthetic fixture in exactly the
  shape `buildCitationsEnvelope` produces; the **producer** is proved by
  `citations-persistence.test.ts` and pgTAP. The real end-to-end generation stays
  **UNSPENDABLE** and is item 1 of the owner's device checkpoint.
- **No change to `GOVERNED_SURFACES`, the `RULES` table, `review_summary`'s
  entry, or `sensitivity-convergence.test.ts`.**
- **No equality assertions across removed / unreadable / foreign** — that is
  slice 2Q.3's requirement, and claiming it here would be claiming a proof this
  slice did not execute.
- Signup closed · rollout 25 · 3 · 2 · push HTTP 403 not resumed ·
  `2P-ACCESS-005` **WAIVED, NOT PASSED** · successor not started or planned.

---

## 9. Local gates

`lint` clean on every touched file · `typecheck` clean · `npm test` **485 of 488
files, 0 failed tests** (the 3 are the known Windows shebang-parse baseline,
green in CI) · `npm run build` succeeds · the online journey **21 of 21** across
three lanes · hosted residue **zero**, with the probe proved still able to see.

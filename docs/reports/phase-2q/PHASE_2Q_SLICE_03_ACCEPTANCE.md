# Phase 2Q — Slice 2Q.3 acceptance record

**When the record is gone, hidden, or not theirs — the product says the same
thing, and cannot be used to find out which.**

- **Authorization:** implementation, **ADR-128** (2026-08-21).
- **Requirements:** `2Q-TRUST-001` … `-009` (9 of 42; **32 of 42 cumulative**).
- **Migrations:** **none.** Budget stays **1 allocated · 1 spent**.
- **Baseline:** `main` **`57e812a`**, worktree clean, zero open PRs, CI green 3/3
  on that exact merge SHA, **100 local = 100 hosted, parity `202608210100`**.

---

## 1. The property this slice exists for, and why three green tests are not it

The traceability contract refuses *"an indistinguishability requirement proved by
separate passing expectations rather than by an asserted equality"* — because
`2Q-TRUST-003` and `-004` are properties about **two outputs being the same**,
and three tests can each pass while producing three **different** outputs. That
difference is exactly what turns a page into a probe.

So every indistinguishability below is `expect(a).toEqual(b)` over the **whole
resolved output**, driven with **the same citation** under different worlds, so
the comparison has nothing incidental to differ on:

| World | How it is modelled |
|---|---|
| **removed** | the row is not in the table |
| **unreadable** | the read returns `{ data: null, error }` |
| **foreign** | the row **exists**, owned by another account, and `.eq("user_id", …)` is honoured — foreignness is modelled the way the database models it, not faked |
| **never existed** | the table is empty |

**All four produce output asserted `toEqual` one another.** And the control that
makes this mean something: **the same citation, owned and readable, resolves** —
without it every equality would hold trivially for a resolver that refused
everything, which is the shape of a fix that fixes nothing.

The equality is proved for a **task and an entry**, because refusal 14 refuses
single-type evidence.

**One property a blanket "refuse everything on error" would have hidden**: a
failed read on `tasks` must **not** delete the review's `entries` evidence. One
flaky read cannot be allowed to erase the product's own report. Asserted.

---

## 2. A finding from the re-audit: `2Q-TRUST-005` was satisfiable by nothing happening

`resolveReviewSources` **selected** `valid_from, valid_until, created_at` for
memories and **never applied `isMemoryInForce`**.

Under `OD-2Q-2` no memory can reach that branch from `generateReview` today, so
the requirement — classed **baseline** — would have been satisfied *vacuously*:
nothing archived, because nothing citable. Its observable, though, is *"the
in-force check **is applied**, asserted with an out-of-force fixture."*

The check is now applied. It costs one line, it uses **the shared predicate** —
the same one chat's resolver, the SQL retrieval bound and the badge the owner
reads use, so none of the four can disagree about what "in force" means — and an
archived memory now produces output asserted **equal** to a deleted one.

**Recorded as a finding rather than presented as new work**: the columns were
already being read, which is why applying the check was one line rather than a
query change.

---

## 3. `2Q-TRUST-006` — the protection must not disclose what it protects

Two fixtures differing **only** in the classification their record carries — same
kind, same date — produce rows asserted **equal after the identifier is masked
out**, with the identifier confirmed to be the one thing that did differ.

The reason it holds is structural rather than careful: **the resolver never reads
a classification at all.** Asserted **on the query** — every `select` on the path
is checked for `sensitivity` — because a column selected but unused still puts
the classification one edit away from a branch.

**The inherited guard is untouched**, and that is asserted as a byte property
rather than by re-running it: `sensitivity-convergence.test.ts` must still name
**exactly those three** reviews files and still forbid **both** tokens. The new
files are deliberately **not** added, for two reasons that agree — `2Q-TRUST-006`
requires the list unchanged, and that guard does not strip comments, so it would
fail on the very paragraphs explaining why `resolveContent` is never called.

---

## 4. `2Q-TRUST-007` — nothing about sensitivity moved

Pinned as byte properties, and deliberately **in full** rather than by spot-check:

| Pinned | Why in full |
|---|---|
| `review_summary: { normal: SHOW, private: SHOW, highly_sensitive: MASK }` | the exact rule ADR-124 left standing |
| **All thirteen** `GOVERNED_SURFACES`, in order | a count passes on a surface swapped for another; a spot-check on `review_summary` passes on twelve silently disappearing |
| All three presentation variants **with their bodies** | `MASK` carrying `revealable: true` is the exact fact that made option C the only way to honour "no reveal control" without editing `RULES` — so a variant whose *body* changed matters as much as one added |
| `deriveTaskSensitivity` absent from the review path | with the two-sided control that it really does exist elsewhere |

---

## 5. `2Q-TRUST-008` — refusal is total

One corrupt reference among **four** refuses the envelope **entirely** — no three
salvaged rows, and no half-trusted page. A reference smuggling an `excerpt` is
refused the same way, with the text asserted absent from the whole output rather
than merely unrendered.

The row then reports **`unrecorded`** rather than "found nothing", because a
broken envelope records nothing about what retrieval found. And the page still
renders its words: a citation that cannot resolve must not delete the report.

---

## 6. Evidence

### Unit — `review-sources-trust.test.ts`, **20 assertions**

Every equality stated once over whole outputs, each with its non-vacuity control.

### The hosted journey — **27 of 27 across three lanes**

`e2e/online-phase-2q-citations.spec.ts`, against the **production build** and the
**hosted database**:

| Lane | Result |
|---|---|
| `desktop` (Chromium) | **9 passed** |
| `mobile` (Pixel 7) | **9 passed** |
| `iphone-emulated` (**WebKit**) | **9 passed** |

The fixture's third citation names a task deleted **after** the envelope was
written — a genuinely stale reference, which is the state `2Q-TRUST-001` says the
page must never treat as proof. In the browser it renders **words, not a link**,
no anchor anywhere reaches the deleted id, and the review still renders its prose.

The rendered rows are asserted **structurally uniform**: every row is exactly
`kind · date · (link | gone)`, three children, and the two task citations — one
live, one deleted — carry the **same kind word**. Nothing in the markup lets a
reader tell which state produced a row beyond the link's presence.

**The unit tests own the equality; the journey owns the one thing they cannot** —
that a real browser against the deployed database really behaves this way.

**Hosted residue: zero**, with the probe proved still able to see (2 users, 3
entries readable).

---

## 7. A trap this slice walked into, recorded because it is the recorded one

**An orphan dev server answered for the real one.** After slice 2Q.2's run,
`TaskStop` stopped the npm wrapper but **not** the Next.js child. The new
`npm run start` failed with `EADDRINUSE` — and the readiness loop reported
**"SERVER READY"**, because it was talking to the **orphan serving the old
build**.

This repository has already recorded exactly this ("an orphan dev server answers
for the real one", "stopping Next may not stop it"), and it happened anyway.

**What was done instead of hoping:** the listening PID was found and killed,
`.next` was removed, the build was re-run to a **fresh `BUILD_ID`**, the server
was started again, and the readiness loop was rewritten to **fail loudly on
`EADDRINUSE`** rather than to keep polling a stranger. Afterwards the port was
verified free rather than assumed.

The 2Q.3 assertions are test-side, so the stale build could not have produced a
false pass here — but that is luck, not method, and the method is what is fixed.

---

## 8. Requirements

| Requirement | Class | Evidence |
|---|---|---|
| `2Q-TRUST-001` | **built** | a stale envelope naming a deleted record resolves to refused; every re-read is `.eq("user_id", …)`, with the two-sided control that the same row **owned** does come back |
| `2Q-TRUST-002` | **built** | removed → no anchor, in units **and** in the browser on three lanes |
| `2Q-TRUST-003` | **built** | a forced read failure asserted **`toEqual`** the deletion case, over the whole output |
| `2Q-TRUST-004` | **built** | a foreign id asserted **`toEqual`** the removed case, and a nonexistent id **`toEqual`** the foreign case |
| `2Q-TRUST-005` | **baseline**, made non-vacuous | `isMemoryInForce` now applied; an out-of-force memory asserted **equal** to a deleted one, with an in-force one resolving as the control |
| `2Q-TRUST-006` | **built** | `normal` and `highly_sensitive` rows equal but for the identifier; no `sensitivity` in any query; the inherited guard's file list and both tokens pinned |
| `2Q-TRUST-007` | **built** | `review_summary`'s rule, all thirteen governed surfaces in order, all three variants with their bodies, and `deriveTaskSensitivity` absent here but present elsewhere |
| `2Q-TRUST-008` | **built** | one corrupt reference among four refuses all four; a smuggled excerpt refused, not stripped; the state reported `unrecorded`, and the words survive |
| `2Q-TRUST-009` | **built** | no control-bearing construct in any of the three files, plus the rendered scan with a **planted reveal button** as the control (slice 2Q.2's, re-asserted here as this slice's own) |

---

## 9. What this slice deliberately did not do

- **No migration.** Budget unchanged at 1 · 1.
- **No change to `GOVERNED_SURFACES`, the `RULES` table, `review_summary`'s
  entry, or `sensitivity-convergence.test.ts`** — all four asserted unchanged.
- **No second discriminator on the review page.** ADR-124 Decision 4's single
  `notFound()` arm is untouched.
- **No AI credential spent.**
- **No screen-reader claim.** `2P-ACCESS-005` stays **WAIVED, NOT PASSED**.
- Signup closed · rollout 25 · 3 · 2 · push HTTP 403 not resumed ·
  `2P-REVIEW-CITATIONS` still **NOT DELIVERED** · successor not started.

---

## 10. Local gates

`lint` clean · `typecheck` clean · `npm test` **486 of 489 files, 0 failed
tests** (the 3 are the known Windows shebang-parse baseline, green in CI) ·
`npm run build` succeeds · the hosted journey **27 of 27** across three lanes ·
hosted residue **zero**, two-sided.

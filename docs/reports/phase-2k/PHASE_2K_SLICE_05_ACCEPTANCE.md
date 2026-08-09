# Phase 2K — Slice 2K.5 acceptance

**How the Brain reached this — the two exclusions it already computed and threw away.**

**Written after execution, from executed evidence.** Every gate is reported as executed, skipped or **NOT PROVED** — never inferred.

**Authorization.** ADR-101.

**Baseline.** `main` = `96be787fc965b46ca944066264c99dac6057eeec` (PR #150, slice 2K.4), **CI green on that exact merge SHA across all three jobs**. Hosted parity unchanged at `202608080087`.

**Migration budget.** **`1 allocated · 0 spent`.** The disclosure rides the citations envelope as an optional field.

---

## 1. Requirements this slice claims

| Id | Claim | Evidence |
|---|---|---|
| `2K-EXPL-001` | **built** | A native `<details>`, closed, rendered last. Drawn **only** when there is something to disclose — an empty panel invites the user to open it and learn nothing |
| `2K-EXPL-002` | **built** | The source block above it already states what was used (2K.4); the panel states what was not, and points at it |
| `2K-EXPL-003` | **built** | A boolean. Proved **byte-identical for wildly different counts** — nineteen dropped matches and one produce the same payload — and no digit renders in either locale |
| `2K-EXPL-004` | **built** | Owner-archived exclusion is disclosed, with a positive control asserting it reads `false` when every retrieved memory was in force |
| `2K-EXPL-005` | **built** | Nothing about sensitivity can reach the payload: the builder takes four counts, none of which is a classification, and planting one on its input changes nothing. The guard finds no literal level in the feature |
| `2K-EXPL-006` | **baseline, preserved** | Nothing exposed model reasoning before and nothing does now. The guard refuses a `prompt`, `reasoning`, `chainOfThought`, `rationale`, `scores`, `similarity` or `threshold` **field**, and the rendered panel is asserted to mention none of them in either locale |
| `2K-EXPL-007` | **partial, and declared** | Correcting the **source** is reachable and always has been — every source links to its object, and memory edit and archive ship. Correcting the **interpretation** has **no domain effect this phase**, and the panel says so rather than offering a control that records nothing. Remainder: an interpretation-correction domain. Destination: named below |

---

## 2. What was already there, and thrown away

The answer path computed both exclusions and discarded both:

1. `relevant = matches.filter(m => m.similarity >= 0.2)` — everything below the floor, dropped silently.
2. `memoriesInForce` — every archived memory, dropped correctly and without a word.

So the user could not distinguish *"the Brain found nothing"* from *"the Brain found three things and rejected all of them"*. Nothing needed computing to fix that. Two values that already existed needed to reach the surface, which is why this is the cheapest large win in the phase.

---

## 3. Why the payload is two booleans

T-2K-04: explaining what was left out is one refactor away from `search`'s forbidden "3 hidden results". And **"don't show a count" is not enough on its own**, because a *rate* is a count over repeated queries — an attacker, or an over-sharing screenshot, can binary-search existence by rephrasing.

So the boundary is the **payload**, not the rendering. `buildAnswerExplanation` takes four counts and returns two booleans; that function is the one place the numbers stop travelling. A count that never renders today is a count somebody can render tomorrow.

**The two exclusions are treated differently, and not arbitrarily.** The similarity floor is a property of *this query*, not of the corpus — telling the user "the closest matches were too weak" tells them about their own question. Owner-archived memories are facts the audience created and then retired; telling somebody about their own archive is not a disclosure.

**Sensitivity is absent structurally.** Phase 2K masks rather than excludes, so nothing is excluded for sensitivity at all — and the builder reads four named counts, none of which is a classification. The property holds because there is no path, not because a caller remembers.

---

## 4. The one honest partial

`2K-EXPL-007` asks for two correction paths. One works:

- **Correct the source** — every source in the block links to its object; memory edit and archive ship and are audited.

The other does not:

- **Flag the interpretation as wrong** — there is no table that records it, no action that consumes it, and no surface that reads it. Building one is new scope.

The requirement's own wording is *"where the second has no domain effect this phase, it is declared as such rather than implied"*. So the panel **says** there is no way to tell the Brain it read something wrong, and explains why saying so is better than a button that records nothing. `interpretationCorrectionHasDomainEffect()` returns `false` and the panel reads it, so the declaration is a value rather than a sentence someone must remember to keep true.

**Remainder:** an interpretation-correction domain — a record, a consumer, and a surface that reads it. **Destination:** the roadmap successor's own audit; it is not in Phase 2K's scope and no requirement here creates it.

---

## 5. Gates, as executed

| Gate | Command | Result |
|---|---|---|
| Tests first | explanation, panel and guard tests before implementation | **Executed**, red for the right reasons |
| Focused | `npx vitest run src/features/conversation-sources src/features/chat src/lib/closeout/phase-2k-disclosure-guard.test.ts` | **Executed, green** |
| Lint | `npm run lint` | **Executed, zero errors** |
| Types | `npm run typecheck` | **Executed, zero errors** |
| Full unit | `npm test` | **Executed** — 294 files passed, **4849 tests passed, 0 failing tests**. 3 files fail to *load* on Windows — the known local baseline, green in CI |
| Build | `npm run build` | **Executed, green** |
| Browser, both viewports | `npx playwright test e2e/accessibility.spec.ts --project=desktop --project=mobile` | **Executed** — 29 passed, 1 skipped. The new `Conversar explanation` surface passes axe at both viewports |
| Whitespace | `git diff --check` | **Executed, clean** |
| Migrations | none created | **`1 allocated · 0 spent`** |
| pgTAP | not applicable — no database change | **Declared, not skipped silently** |
| Real device / assistive technology | not run | **NOT PROVED** |

---

## 6. Negative controls and non-vacuity

- **The no-count property is proved by construction, not by inspection**: nineteen dropped matches and one dropped match serialize identically, so no count is reconstructible by any consumer, present or future.
- **No digit renders**, asserted over the whole panel in both locales — the shape a count would take if it ever came back through copy.
- **The archived-exclusion disclosure has a positive control**: an in-force memory produces `false` in the very next test, so "discloses an exclusion" is not satisfied by a flag that is always true.
- **The guard distinguishes a use from a quoted refusal** — `{ hiddenCount: 3 }` fires; `["hiddenCount"]` does not. The same precision slice 2K.3 had to introduce.
- **The reasoning guard is proved against four planted fields**, including `similarity` and `threshold`, which are the plausible ones.
- **The schema is asserted to contain exactly two `z.` fields**, so a third cannot be added without failing.
- **The panel is asserted to ship closed** while the accessibility fixture renders it **open** — axe cannot scan what is not in the accessibility tree, and the guard pins both halves so the discrepancy stays deliberate rather than becoming drift.

---

## 7. Limitations, stated rather than rounded up

1. **No screen-reader session.** A native `<details>` is the strongest available answer without one, but it is not a substitute for one.
2. **Hydrated interactivity is not browser-proved.** The panel needs no hydration to open — that is why it is a `<details>` — but the assertion that it works before hydration is structural rather than executed in a browser with JavaScript disabled.
3. **`2K-EXPL-007` is partial by declaration.** Named above with its remainder and destination.
4. **Answers written before this slice carry no explanation.** `null` is "not recorded", and it draws nothing — deliberately not "nothing was excluded", which would be an invention.

---

## 8. What this slice did not do

No migration, no schema change, no deployment. No count, rate or score reaches any payload. `chat-schema.ts` untouched. Retrieval, the similarity floor and the lifecycle filter are unchanged — this slice only stopped discarding what they already report. No RLS policy, grant, secret, external service or write path. Signup remains closed; the rollout gate is untouched at 25 pass · 3 fail · 2 owner-signature.

# Phase 2J — Today, Capture and Attention: closing report

**Closed:** 2026-08-08 · **Authorized by:** ADR-095 (implementation, three signed decisions, two-migration budget) and ADR-096 (a corrected premise inside it).

**74 requirements declared · 74 classified · 0 unclassified.**

| Class | Count |
| --- | --- |
| built | 59 |
| baseline | 6 |
| not built, by rule | 5 |
| partial | 2 |
| undelivered | 2 |

**Migration budget: 2 allocated · 2 SPENT**, reconciled per slice — `202608080085` to 2J.4, `202608080086` to 2J.7. ADR-095's preferred close was `2 · 1`; §2 below records why it was not reachable and why that is a corrected premise rather than scope creep.

---

## 1. The five things the phase found

**The accessibility lane found a real Phase 2I defect on its first execution.** `.library-search-link` rendered **16px** tall on a Pixel 7, under WCAG 2.2 AA 2.5.8's 24px minimum. jsdom has no layout engine and could never have seen it. This is the entire argument for running the lane at all, and for running it as slice **zero** rather than at closeout — which is where Phase 2I put it, and why `2I-CLOSE-002` closed partial.

**"Precisa de você" already existed.** `/app/inbox?view=needs-you` shipped before this phase with tabs, the attention list and keyset pagination, reachable from Hoje. `2J-ATTN-001` is **baseline**. The phase's own audit predicted this class of error and it happened anyway — which is exactly why `baseline` is a distinct class rather than a footnote.

**`ai_usage_events` has no `other` operation.** ADR-095 allocated 2J.4 a migration and hoped it would stay unspent on that premise. The premise was false and it was mine: `other` belongs to **`error_events.operation`**, a different table from the Phase 2H error sink. The conflation travelled from the current-experience audit into the PRD into the ADR without anyone re-deriving it against the constraint on the table it was about. ADR-096 records the correction.

**The migration's own verification block then found a second gap.** `record_ai_usage` **enumerates the operation vocabulary in its body** (`202607250055:118`) and raises `22023` outside it. A migration widening only the table CHECK would have deployed clean and then rejected every transcription at runtime — inside the path `src/lib/ai/usage.ts` swallows into a `console` line. Both halves shipped.

**Two of the five sensitivity surfaces had nothing to converge.** The capture receipt renders a message key and a link and has **no content field at all**; there is **no push, service-worker or lock-screen payload anywhere** in the repository. Both are recorded as evidenced negatives rather than given a mask for content that does not exist — and the notification rule becomes something a future push surface must satisfy rather than something this report can claim was enforced.

## 2. Why the budget closed at 2 · 2

The 2J.4 migration is spent because **no existing `ai_usage_events` value could truthfully carry a transcription.** `background` names work the user did not initiate; `file_analysis` belongs to `process_attachment`, and voice deliberately creates no attachment. Either would misattribute spend on the user's **own** BYOK key — the condition ADR-095 itself named as the trigger for spending the allocation.

This is inside the authorized per-slice ceiling (2J.4 max 1, 2J.7 max 1), so **no owner amendment was needed**. What changed is only that the escape hatch ADR-095 hoped for does not exist.

**A named accounting limit.** `ai_model_pricing` has no audio-model row and is per-token, while transcription is billed per audio **minute**. Transcription events therefore record with a truthful operation and `cost_status = 'unpriced'` — a state `record_ai_usage` **already models**, which an earlier draft of ADR-096 wrongly called a hole. `/app/costs` shows that transcription happened; it does not show what it cost. **Destination:** a future phase that decides whether per-minute pricing belongs in `ai_model_pricing` or a sibling table.

## 3. The two partials and the two undelivered, each with its destination

| Requirement | Why | Destination |
| --- | --- | --- |
| `2J-ACCESS-004` | Dialog semantics and ARIA referents are proved in a browser; **focus restoration** needs React running, and CI has no session for an authenticated route | Covered today by Phase 2I's `command-palette.test.tsx` in jsdom. A hydrated browser lane is future work |
| `2J-VOICE-014` | Container handling, ceiling enforcement and the closed accepted-type list all ship and are Chromium-proved. **Gate G-2J.4b is NOT discharged** — no measurement on real iOS Safari or Android Chrome | Owner measurement on real hardware. The plan states explicitly that describing the contract does not discharge the gate |
| `2J-METRICS-001` | Hoje's first-useful-action event would need a **third migration**; `product_events.event_name` is a database CHECK and the budget is spent | A future phase with migration budget |
| `2J-METRICS-005` | Review started/completed, same reason | A future phase with migration budget |

**`2J-ACCESS-008` is an evidenced negative, not a partial.** No screen-reader session was performed. `accessibility.spec.ts` says *"NOT PROVEN ANYWHERE: a real screen-reader session"* and a guard asserts that sentence is still in the file, so a future edit cannot quietly upgrade the claim.

## 4. Phase 2I's accessibility residual: **partially reduced, not resolved**

Stated exactly, because rounding this up is the specific failure `2I-CLOSE-002` exists to prevent.

- **Now proven, in a real browser, at two viewports:** axe violations, heading and landmark structure, accessible names, visible focus, focus order, **rendered** touch targets, reduced-motion rendering, dialog semantics and ARIA referent resolution.
- **Still not proven:** hydrated interactivity — Ctrl+K, arrow traversal, Escape, focus **restoration**. These rest on Phase 2I's jsdom tests exactly as they did before.
- **Still not proven anywhere:** a real screen-reader session.

The surfaces are **mirrored**, following `layout-contracts.spec.ts`'s precedent, because the routes are behind `src/proxy.ts`. `accessibility-mirror-guard.test.ts` bounds the drift by re-deriving load-bearing attributes from the component sources every run.

## 5. Defects — thirteen, of which ten were in probes, guards, pins or tooling

| # | Defect | Where |
| --- | --- | --- |
| 1 | `.library-search-link` 16px touch target | **product** (Phase 2I) |
| 2 | Promoted tasks rendered twice on Hoje | **product** (found mid-slice by test) |
| 3 | `Promise.all` made one failing projection cost the whole page | **product** (`2J-HOJE-010`) |
| 4 | Sensitivity guard flagged `memories/schema.ts` — authoring vocabulary, not presentation | guard |
| 5 | …then flagged `memories/copy.ts` — i18n label map | guard |
| 6 | Sensitivity contract test matched its own doc comment | probe |
| 7 | `import.meta.url` is not a file URL under vitest | probe |
| 8 | Capture write-path allowlist wrongly excluded `byok/actions.ts` (`BYOK-CAPTURE-004`) | guard |
| 9 | …and flagged the component's own doc comment containing `"use server"` | guard |
| 10 | `transcribe-action.ts` exported constants from a `"use server"` module | **product** |
| 11 | Audio guard named `OPENAI_API_KEY`, tripping the project-key allowlist | guard |
| 12 | `telemetry-parity.test.ts` pinned a **superseded** migration and passed for the wrong reason | guard |
| 13 | Python edits converted CRLF→LF, breaking Node/Deno prompt parity locally | tooling |

Four product defects, nine in the machinery — consistent with Phase 2H (6/12) and Phase 2I (13/15). Defect 12 is the most interesting: every phase that widens `product_events` re-declares the whole list, so pinning Phase 2H's file asserted what a superseded migration said.

## 6. What the generator does and does not prove

The generator refuses on ten distinct fixture defects and the real repository is its positive control (`phase-2j-traceability.test.ts`, 17 assertions).

**Stated plainly:** it did **not** refuse on its first real run, unlike Phase 2I's, which named nineteen unevidenced requirements. That is not a stronger record — it is a weaker test. The acceptance rows were generated from one classification table, so the PRD ↔ evidence cross-check is meaningful (the PRD's 74 declarations were authored in a separate, earlier pass and they reconciled exactly), but the two sides did not converge independently the way Phase 2I's did. The generator's real value here is **forward**: the matrix cannot now drift from the PRD without a refusal.

## 7. Standing commitments, restated

- **ADR-055 is open, unchanged, and expires 2026-10-27.** Phase 2J added **no** semantic retrieval, no embeddings and no vector search. It neither satisfies nor supersedes it.
- **`T-2I-02` holds.** `capture_entry_async` has exactly one caller; the guard was proved red against a planted second one *before* the unified surface existed.
- **No new RLS policy, grant, secret, external service or provider.** Transcription rides the user's existing BYOK OpenAI credential.
- **The signup rollout gate is untouched:** **25 pass · 3 fail · 2 owner-signature — "SIGNUP MUST NOT OPEN"**, re-read at close. Phase 2J is not progress toward it.
- **Phase 2K is unstarted.** A13 green, zero Phase 2K artifacts, no accepted Phase 2K ADR.

## 8. Deployment

**Nothing is deployed.** Hosted parity remains **`202608070084`**; the chain head is `202608080086`. Both Phase 2J migrations are additive vocabulary widenings whose verification blocks run inside their own transactions, and both have passed CI's `database` job against the full chain from an empty database — which is the only place a chain-only defect is visible.

Deploying them is an owner act, and it follows the merge-SHA runs that have already passed.

## 9. PRs

| PR | Merge SHA | Slices | PR-head | Merge-SHA |
| --- | --- | --- | --- | --- |
| #136 | `283380d` | 2J.0, 2J.1 | green | green |
| #137 | `e2a9fc0` | 2J.2, 2J.3 | green | green |
| #138 | `b91172a` | 2J.4 (+ `…085`) | green | green |
| #139 | `88ddb9d` | 2J.5, 2J.6 | green | green |
| #140 | `fa791f0` | 2J.7 telemetry (+ `…086`) | green | green |

One complete green PR-head run and one complete green exact-merge-SHA run each, under ADR-090. No green ×3, and no rerun used as an acceptance mechanism. One rerun occurred, on PR #135's successor branch, for a fixed defect — which ADR-090 permits explicitly.

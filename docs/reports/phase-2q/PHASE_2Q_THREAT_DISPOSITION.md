# Phase 2Q — Threat model disposition

**Every threat the model named, dispositioned once, with the control that
actually ships and the test that would fail if it stopped.**

The threat model marked controls **TO BUILD** so a reader could not mistake a
plan for a defence. This record closes each one, and says which are **residual**
by design rather than pretending none are.

- **Scope:** the twelve threats in `PHASE_2Q_THREAT_MODEL.md`, plus the seven
  inherited properties its §2 says must not be weakened.
- **Baseline:** `main` **`198591c`**, parity `202608210100`, 100 local = 100
  hosted.

---

## 1. The twelve

| # | Threat | Disposition | The control that ships, and where it is proved |
|---|---|---|---|
| **T-1** | A fabricated identifier becomes a link | **CLOSED** | Two independent controls, as the model required. The provider filters `citedSourceIds` against the rows the request read (baseline, `2Q-CITE-005`); the render **re-reads every citation** under the reader's own session (`2Q-TRUST-001`). Proved by driving a fabricated id alone **and** mixed with a real one, and by a stale envelope naming a deleted record |
| **T-2** | A name in the Markdown becomes a link | **CLOSED** | `2Q-LINK-004`: a review naming a real, **resolved** task by title renders **no anchor** — with the same task linked in the sources area as the two-sided control, so the absence is about name matching and not about a resolver that did nothing. Proved in units and in the browser on three lanes |
| **T-3** | A vouched-for id is pointed at the wrong surface | **CLOSED** | `2Q-LINK-002`. The gate binds `(type, id)` through `citation-routes.ts` — **one map, shared with the code that builds the hrefs**. A segment mapping to no citable type is refused **outright**. The retired id-only gate is re-implemented in one line as the control proving every href now refused used to pass |
| **T-4** | The stored envelope becomes a content store | **CLOSED** | `referenceSchema` is `.strict()` over four identifier fields (baseline), and `2Q-CITE-006` proves an extra key is **rejected, not stripped** — six content-shaped names each refused. The resolver additionally **selects no content-bearing column**, asserted on the query |
| **T-5** | Cross-account enumeration through a citation | **CLOSED** | `2Q-TRUST-004`, asserted as an **equality** over the whole output between a foreign id and a nonexistent one — with foreignness modelled the way the database models it (`.eq("user_id", …)` honoured on a row that really exists) rather than faked |
| **T-6** | "Gone" is distinguishable from "unreadable" | **CLOSED** | `2Q-TRUST-003`, the same equality, driven with **the same citation** under four worlds: removed, unreadable, foreign, never-existed. The non-vacuity control is that the same citation, owned and readable, **resolves** |
| **T-7** | Highly sensitive content reaches a surface that did not carry it | **CLOSED BY SHAPE** | `OD-2Q-5` option C: the sources area renders **no content at all**, so there is nothing for the generalisation to reach. `sensitivity-convergence.test.ts` stays **unweakened with its file list unchanged**, asserted as a byte property |
| **T-7b** | The protection discloses what it protects | **CLOSED** | `2Q-TRUST-006`: rows for a `normal` and a `highly_sensitive` record asserted **equal** after the identifier is masked out. It holds structurally — the resolver **never reads a classification**, asserted on every query |
| **T-7c** | A reveal control reappears | **CLOSED** | `2Q-TRUST-009`: no interactive element in a row beyond the link, scanned in the rendered DOM **with a planted reveal button as the control that makes the scan capable of failing**, plus a source-side scan of all three files |
| **T-8** | Deleting a record rewrites history | **CLOSED** | `2Q-CITE-003`: no foreign key in the catalog, **and** pgTAP deletes the cited task and asserts the stored envelope is **byte-identical** — with the deletion itself asserted first, so the comparison is not vacuous |
| **T-9** | A malformed envelope is partially trusted | **CLOSED** | `2Q-TRUST-008`: one corrupt reference among **four** refuses all four; a smuggled `excerpt` is refused rather than stripped; the state reports `unrecorded` rather than "found nothing"; and the page still renders its words |
| **T-10** | The feature ships and silently does nothing | **CLOSED** | The threat this phase existed to prevent. `2Q-FOUNDATION-003` **executed** the failure before any fix; `2Q-CITE-007` asserts the id prefix and the persisted type **as a pair**; and the browser journey **clicks the task link and lands on the real task** on three lanes. Refusal 14 is obeyed throughout: every citation assertion drives an entry **and** a task |

---

## 2. Residuals, named rather than absorbed

| Residual | Why it stands | Destination |
|---|---|---|
| **T-7's residual** — the **destination page** still renders the record's content, under its own rules | Exactly what the owner decided: opening a link is a deliberate act on a governed surface. This phase must not change those pages, and did not | none — it is the intended behaviour |
| The **real producer's** end-to-end hosted proof | Generating a review is a **paid AI call against the owner's BYOK credential**; ADR-128 Decision 5 forbids spending one without a further authorization. Recorded **UNSPENDABLE**, never as a pass — the treatment `2P-CHAT-007-JOURNEY` already carries | **the owner's device checkpoint, item 1** |
| Converting the accessibility dark scan to **real routes** | The more robust shape; it would remove the whole class of fixture/product divergence ADR-129 documents. Rejected **for slice 2Q.4 only**, on size | a later initiative, at the owner's discretion |

---

## 3. The seven inherited properties, each re-proved unweakened

The model's §2 lists what this phase must not break. Each is asserted, not
assumed:

| Property | Verdict |
|---|---|
| removed / foreign / never-existed are **one** `notFound()` arm on the review page | **unchanged** — no discriminator added; the citation path adds its own equality instead |
| the review **listing** carries no review content | **unchanged** — citations are a detail-page feature only; the listing projection is untouched |
| **no reviews surface** calls `resolveContent` or names `highly_sensitive` | **unchanged and unweakened**, with the guard's three-file list asserted **byte-for-byte** and the new files deliberately **not** added |
| the sensitivity `RULES` table and `GOVERNED_SURFACES` | **byte-unchanged** — `review_summary`'s rule pinned, **all thirteen** surfaces pinned **in order**, all three presentation variants pinned **with their bodies** |
| all six automation categories fail-closed | **unchanged** — no automatic writer created anywhere in this phase |
| append-only ledgers written only through their RPCs | **unchanged** — no direct write; `OD-2Q-4` means no new product event either |
| signup closed, rollout 25 · 3 · 2 | **unchanged** |

---

## 4. What this phase deliberately does not defend against

Restated from the model, because a disposition that dropped them would read as
completeness:

- **A model that writes a factually wrong sentence about a record that does
  exist.** Citations prove *which record was in the prompt*, never that the
  sentence about it is true — and no copy in this phase says "verified".
- **A compromised owner session.** Everything here is owner-scoped; an attacker
  holding the session already has the records.
- **Screen-reader behaviour.** `2P-ACCESS-005` stays **WAIVED, NOT PASSED**, and
  nothing in Phase 2Q — including a lane that now runs on a third engine — may
  be reported as screen-reader evidence.

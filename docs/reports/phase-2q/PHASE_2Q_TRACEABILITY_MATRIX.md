# Phase 2Q — Traceability matrix

**Generated, never typed.** `node scripts/generate-phase-2q-traceability.mjs`
reads the PRD and the six slice acceptance records and writes this file, or
refuses and writes nothing. A matrix that is 41/42 correct reads as complete,
which is why a refusal produces no file at all.

**42 declared · 42 classified · 0 unclassified.**

| Class | Count |
|---|---:|
| `built` | 36 |
| `baseline` | 6 |
| `partial` | 0 |
| `not-built-by-rule` | 0 |
| `undelivered` | 0 |

| Requirement | Class | Evidence |
|---|---|---|
| `2Q-FOUNDATION-001` | built | `phase-2q-foundation.test.ts` §001 — four assertions, locations recorded |
| `2Q-FOUNDATION-002` | built | §002 — types, migration chain and the deployed database agree |
| `2Q-FOUNDATION-003` | built | §003 — executed through the real `resolveSources`, with a passing control |
| `2Q-FOUNDATION-004` | built | §004 — executed through the real `authorizeHref`, with a refusal control |
| `2Q-FOUNDATION-005` | built | §005 — verdict recorded in the direction the evidence points, scan two-sided |
| `2Q-CITE-001` | built | the migration; parity advances at deployment; types agree in both directions; pgTAP pins the same name |
| `2Q-CITE-002` | built | pgTAP, eight posture assertions against the recorded pre-state |
| `2Q-CITE-003` | built | no FK in the catalog **and** the byte-identical envelope after deleting the cited task |
| `2Q-CITE-004` | built | the envelope is in the same upsert; the guard asserts the write contains it |
| `2Q-CITE-005` | baseline | `openai-provider.ts` filters against `availableIds`; the action's `flatMap` is the second, independent gate, driven with a fabricated id alone **and** mixed with a real one |
| `2Q-CITE-006` | built | an extra key is **rejected**, not stripped — the whole envelope fails to parse; six content-shaped field names each refused |
| `2Q-CITE-007` | built | the id prefix and the type asserted **as a pair**, with a memory-labelled task as the planted control; and at the database, `citations -> sources -> 0 ->> 'type' = 'task'` |
| `2Q-CITE-008` | built | an empty column parses to `unknown`, asserted **not** to be `no_qualifying_evidence`; a row written without citations gets `[]`, never NULL |
| `2Q-CITE-009` | built | the constructor takes no prior state; pgTAP upserts twice over one period key and asserts **one** envelope, holding the **second** |
| `2Q-LINK-001` | built | the allow-set is derived from the envelope **after** an owner-scoped re-read; a record that did not come back vouches for nothing |
| `2Q-LINK-002` | built | the pair binds; four previously-admitted surfaces now refused **by name**, with the retired gate as the control |
| `2Q-LINK-003` | baseline | a refused link renders as its own words; asserted in `markdown.test.ts` and again through the real page |
| `2Q-LINK-004` | built | a review naming a real, resolved task by title renders **no anchor** in its prose — with the same task linked in the sources area as the two-sided control |
| `2Q-LINK-005` | baseline | the fourteen existing refusals still pass, and four unmappable surfaces join them |
| `2Q-LINK-006` | built | one row per citation, canonical href per kind, both locales — and the journey **clicks one and lands** |
| `2Q-LINK-007` | built | a citation-free review renders the honest statement, **no list and no empty container**; distinguished from a new review that cited nothing |
| `2Q-LINK-008` | built | no content-bearing column selected, no content-bearing field on the row, a planted marker absent from the render, and no `resolveContent` on the path |
| `2Q-LINK-009` | built | kind label and href asserted **as a pair**, in both locales, with a **memory-labelled task rendered as the planted control** |
| `2Q-TRUST-001` | built | a stale envelope naming a deleted record resolves to refused; every re-read is `.eq("user_id", …)`, with the two-sided control that the same row **owned** does come back |
| `2Q-TRUST-002` | built | removed → no anchor, in units **and** in the browser on three lanes |
| `2Q-TRUST-003` | built | a forced read failure asserted **`toEqual`** the deletion case, over the whole output |
| `2Q-TRUST-004` | built | a foreign id asserted **`toEqual`** the removed case, and a nonexistent id **`toEqual`** the foreign case |
| `2Q-TRUST-005` | baseline | `isMemoryInForce` now applied; an out-of-force memory asserted **equal** to a deleted one, with an in-force one resolving as the control |
| `2Q-TRUST-006` | built | `normal` and `highly_sensitive` rows equal but for the identifier; no `sensitivity` in any query; the inherited guard's file list and both tokens pinned |
| `2Q-TRUST-007` | built | `review_summary`'s rule, all thirteen governed surfaces in order, all three variants with their bodies, and `deriveTaskSensitivity` absent here but present elsewhere |
| `2Q-TRUST-008` | built | one corrupt reference among four refuses all four; a smuggled excerpt refused, not stripped; the state reported `unrecorded`, and the words survive |
| `2Q-TRUST-009` | built | no control-bearing construct in any of the three files, plus the rendered scan with a **planted reveal button** as the control (slice 2Q.2's, re-asserted here as this slice's own) |
| `2Q-ACCESS-001` | built | an executed investigation: reproduced, located, and compared against the real application, with fourteen recorded measurements |
| `2Q-ACCESS-002` | baseline | global search **already** had correct contrast on real WebKit. **No product fix was needed and none was made** — classifying it `built` would claim a change that did not happen |
| `2Q-ACCESS-003` | baseline | the Work bulk bar, identically, proved with the bar actually rendered |
| `2Q-ACCESS-004` | built | the lane made faithful, then CI widened to it — in that order |
| `2Q-ACCESS-005` | built | the citation surfaces introduce no regression: the lane is green on all three projects, and the record states plainly that **none of this is screen-reader evidence** |
| `2Q-CLOSE-001` | built | the generator refuses or writes; observed refusing on the incomplete tree and then producing 42/42, with three misreading traps defended positionally |
| `2Q-CLOSE-002` | built | remainder **and** destination required, with the self-referential row stripped of its own identifier first; driven over planted fixtures because the real records contain no `partial`, each with both sides |
| `2Q-CLOSE-003` | built | parity `202608210100` read live, 100 = 100; two-sided residue control planted, seen, removed, unseen, with the probes proved still able to see |
| `2Q-CLOSE-004` | built | six remainders named, each with the human act that would discharge it |
| `2Q-CLOSE-005` | built | the guard stays where ADR-126 put it; no ADR in this phase names a successor; no successor artifact exists |

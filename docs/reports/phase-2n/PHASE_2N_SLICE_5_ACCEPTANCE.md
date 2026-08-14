# Phase 2N slice 2N.5 — acceptance: the file library reads links it cannot create

**Written from the source after the work, not from the plan before it.** Every
classification below was re-derived against the tree at the merge SHA, and the
one **partial** carries a remainder, a cause and a destination.

## 0. Result

| Fact | Value |
| --- | --- |
| Requirements | `2N-FILES-001…012`, `2N-PERSON-008` — **13** |
| Classification | **9 built · 3 baseline · 1 partial · 0 not-built-by-rule** |
| Migrations | **0 spent.** 94 local = 94 hosted, parity **`202608140094`** unchanged |
| RPCs created | **0** |
| Grants widened | **0** — `authenticated` still holds `SELECT` only on `entity_attachments` |
| Writers created | **0**, and the absence is enforced by a closed export list |
| Residue | **zero**, proved by a probe with a discriminating control |

## 1. The decision this slice was built on

`entity_attachments` has existed since `202607160007` with **neither a reader nor
a writer** in product code. `202607170016:239` revoked `insert, update, delete`
from `authenticated` deliberately; the live grants confirm `REFERENCES, SELECT,
TRIGGER, TRUNCATE` and nothing else. The only insert anywhere in the repository
is M3's deletion undo (`202608140094:803`), which restores links that already
existed.

The owner signed **option A**: ship the read side, record the missing writer as a
named remainder, create no new authority. Options B (restore `INSERT` or add an
RPC) and C (let the worker derive links from an interpretation) were both
refused — the first is new authority and a stop condition, the second is
persisted inference and contradicts `OD-2N-8` **A**.

**This slice created the first reader and no writer.**

## 2. The four measurements, executed before the design

### 2.1 `extracted_text` census — **a real leak, found and closed**

Product readers of `attachments.extracted_text`, measured across all of `src/`:

| Surface | State |
| --- | --- |
| `/app/files` | inside `ProtectedContent surface="file"`, own reveal key — **governed** |
| `src/features/search/contracts.ts` | `hasSensitivity: true` → `.in("sensitivity", ["normal","private"])`; `highly_sensitive` enters only under the explicit, visibly-active sensitive scope (ADR-093/OD-1) — **not reopened by this slice** |
| `supabase/functions/process-jobs/attachment.ts` | writer only |

No leak through `aria-label`, `title`, tooltip, visually-hidden text, logs,
errors or telemetry: the library's `ProtectedContent` call sites omit
`describedAs` precisely because the name **is** the protected content.

**The defect.** The tag cloud built from `extracted_people`,
`extracted_projects` and `extracted_dates`, and the candidate task titles,
rendered **outside any classification** — one block below the extracted text that
was masked. On a `highly_sensitive` file the product withheld the name, the
description and the document text, and then printed the names of people found
inside the document and task titles frequently lifted verbatim from it. That is
extracted text reaching a surface the classification masks, through the fields
*derived* from it rather than the field named after it. It is `R-16d` in the
traceability contract, and it was live in production.

Both now share a reveal of their own, for the same reason the extracted text has
one: opening the disclosure and revealing what the model read out of the document
are two separate acts.

### 2.2 Bounds of `/app/files`

| List | Bound | Probe | Notice | Failure vs empty |
| --- | --- | --- | --- | --- |
| files | `.range(from, from+50)` = 51 rows; `paginateRows` trims 50 | yes | `PaginationLinks` — pagination, not truncation | throws → error boundary |
| failed jobs | `withProbe(FAILED_JOB_LIMIT=20)` | yes, trimmed | `BoundedNotice` | throws |
| links per card | `withProbe(PAGE_LINK_LIMIT=200)` grouped, trimmed at 20 | yes | `BoundedNotice` | **named outcome** |
| links per subject | `withProbe(ATTACHMENT_LINK_LIMIT=20)` | yes, trimmed | `BoundedNotice` | **named outcome** |
| filter options | `withProbe(RELATION_LIMIT=50)` | yes, trimmed | `BoundedNotice` | axis absent — makes no claim |
| `attachment_interpretations` | none | n/a | none | throws |

Two findings, both recorded:

- **A per-item signing failure was rendered as absence.** `createSignedUrls`
  returns errors *inside* a successful response, so the failed item was filtered
  out and the "open original" link simply vanished. This is the one read on the
  page whose failure cannot reach the error boundary, which is exactly why it now
  says so. **Fixed.**
- **`attachment_interpretations` states no bound.** It is not a rendered list —
  the page takes the newest row per attachment — and it is bounded in practice by
  the ≤50 attachment ids of the current page. **Recorded, not changed**; changing
  it would be a bound on a list nobody sees.

### 2.3 Cost of `2N-FILES-010`'s filters

- State, kind and period are predicates on the **same** `attachments` query:
  **zero additional round trips**. The existing
  `attachments_user_created_idx (user_id, created_at desc)` still serves both the
  ordering and the period range. **No index, no migration, no RPC.**
- Linked entity costs **one** sequential read, and only when that filter is
  active.
- **No round trip per item**: subjects are resolved one query per type, and
  `subjectIdsByType` exists so a caller never sees a list it could iterate with a
  query inside.
- Every predicate is applied **before** `.range()`. Filtering an
  already-paginated page in memory would show "the completed files" of page one —
  the misleading filter this slice was told to report rather than ship. It is
  avoided by construction and asserted by a guard.
- Filters travel with the page number. Without that the predicate died one click
  after it was applied.
- **No count is rendered anywhere**, so a count cannot be an oracle
  (`2N-PRIVACY-004`). The page states the filter and the page, never a total it
  would have to guess or buy with a second query.
- Mobile: every control is an anchor with `min-height: 44px` at **every** width.

### 2.4 Discovery vs `DOMAIN_SPECS` after ADR-110

`DOMAIN_SPECS.files` searches `original_name`, `description`, `extracted_text`;
snippets come from `extracted_text`, bounded at 160 characters, plain text,
never markup; `hasSensitivity: true` keeps `highly_sensitive` out of a default
search. **ADR-110's narrowing touched `people` only** (`notes` left the domain,
`snippetColumn: null`) and does not affect file discovery.

So `2N-FILES-011` closes by **linking** to search: no second index, no second
snippet builder, no second copy of the seven-domain contract. A guard asserts the
library imports neither `searchEverything` nor `DOMAIN_SPECS` nor `buildSnippet`.

## 3. Classification, requirement by requirement

| Requirement | Verdict | Evidence |
| --- | --- | --- |
| `2N-FILES-001` list, states, inline errors, job recovery | **baseline** | Shipped before this slice; preserved and re-proved by the hosted journey (list, status badge, `processing_error`, the retry offered only where `terminal` is false) |
| `2N-FILES-002` navigation surface, no new data model, no dashboard metrics | **baseline** | 0 migrations, 0 tables, 0 columns, 0 RPCs; no count or metric is rendered |
| `2N-FILES-003` link explicit and sourced from `entity_attachments`, nothing inferred | **built** | `link-contracts.ts` + `attachment-links.ts`; entity types narrowed to the three the requirement names from the eight the CHECK admits; a guard asserts the link modules cannot even be handed `extracted_people`, an embedding or a similarity |
| `2N-FILES-004` files enter the sensitivity contract in the same change that first renders them contextually | **built** | `sensitivity` travels in the same projection on both contextual pages; masking goes through the one `ProtectedContent`, so a file masked at `/app/files` is masked on a person page too |
| `2N-FILES-005` a subject that is gone is not a live association; no second orphan concept | **built** | Unresolved subjects are **dropped**, not placeheld; removed, foreign and unreadable are byte-identical (asserted); a guard proves the feature never uses the word "orphan" |
| `2N-FILES-006` extracted text reaches no masked surface | **built** — *and a live defect closed* | §2.1; the hosted journey asserts the control first, then the four absences |
| `2N-FILES-007` recovery reachable from where the failure is shown | **baseline** | Shipped before this slice; preserved and re-proved. The retry appears only where a retry is a real action — an exhausted job gets none |
| `2N-FILES-008` the library is **genuinely more useful** | **PARTIAL** | See §4 |
| `2N-FILES-009` navigable in both directions | **built**, *empty by construction* | Both directions real, shared, proved with harness-planted links; the emptiness for owners without legacy links is `2N-FILES-008`'s remainder, not a defect in this read path |
| `2N-FILES-010` classified and filtered, count never an oracle | **built** | Four axes, all in-query, page-preserving; no count rendered at all |
| `2N-FILES-011` discovery does not duplicate search | **built** | §2.4 — an evidenced negative plus a link |
| `2N-FILES-012` no migration | **built** | 0 spent; the newest migration in the tree is still M3's |
| `2N-PERSON-008` related files render on the person page from `entity_attachments` under `2N-FILES-004` | **built**, *empty by construction* | Same reader, same component, same bound as the project page |

## 4. The one partial, its cause and its destination

**`2N-FILES-008` — PARTIAL.**

The requirement lists seven capabilities. Six ship: provenance, processing
states, failure recovery, classification, filters and richer discovery, with
sensitivity handled throughout. The seventh — *"files linked to people and
projects"* — ships as a **real read path that renders empty for every owner
without legacy or restored links**, because `entity_attachments` has no writer.

**The remainder, stated in full, as the owner's decision requires:**

1. **There is no way to create a new link.** Not in the UI, not in a Server
   Action, not in an RPC, not in the worker. `authenticated` holds `SELECT` only.
2. **The requirement that stays partial because of it is `2N-FILES-008`.**
   `2N-FILES-009` and `2N-PERSON-008` close as built-and-empty rather than
   partial, because their subject is the link's navigability, which is complete
   whenever a link exists.
3. **The future decision that would be needed** is one of: restore `INSERT` on
   `public.entity_attachments` to `authenticated` with a policy, or add a
   `SECURITY DEFINER` RPC that validates owner and entity type. **Either is new
   authority**, `2N-SEC` treats authority as schema, and a fourth migration is a
   stop condition (`R-21d`). It is an owner decision and this slice did not take
   it.
4. **No new authority was created.** No grant, no policy, no RPC, no migration,
   no worker step, no persisted inference.

**Destination:** `2N-FILES-WRITER`, unassigned to any slice of Phase 2N, and not
transferable into M2 — which remains reserved for 2N.7.

The user is told this too, not only this document: the empty state says *no link
is recorded for this file* and then *the Brain shows links that already exist;
there is no way to create a new one here yet.* There is no button, no form, no
disabled control. A guard and a component test both fail if one appears.

## 5. What was NOT done, by rule

- **No writer**, in any form (owner decision).
- **No inferred link** from text, embedding, similarity or a model's
  `extracted_people` — the modules that would need it cannot be handed it.
- **No migration, RPC, grant, index, job type, cron or worker.**
- **No second orphan concept** — the existing storage-orphan scanner stands.
- **No reopening of ADR-093/OD-1.** Search's treatment of `extracted_text` is
  unchanged; this slice only asserts that the file domain still participates in
  the sensitivity predicate.
- **No fourth migration.** M2 remains reserved for 2N.7.

## 6. Proofs

| Gate | Result |
| --- | --- |
| Unit and component tests | **127** across six files in `src/features/library/` and the guard |
| Structural guards | **45**, each with a mutation control; two-sided where a false positive was the risk |
| Full suite | **7140 passed**, 0 failed tests (3 failed *files* are the known Windows-only shebang parse; green in CI) |
| lint · typecheck · build · `git diff --check` | clean |
| Hosted journeys | **10 test bodies → 32 executions** (16 desktop + 16 Pixel 7; six of the ten run once per locale), `--workers=1`. A local build against the **hosted Supabase project** — *not* a Vercel deployment |
| Regressions re-run | **59** hosted journeys from 2N.0–2N.4, all green |
| Residue | zero, with a control that plants a linked and an unlinked attachment and proves the probe discriminates |

## 7. Carried, not absorbed

- **`online-memories.spec.ts:85` — a 21px touch target against a 44px minimum.**
  Pre-existing, in the memories surface, which this slice does not touch. **Not
  weakened, not deleted, not marked passing.** Destination `2N-MOBILE`.
- **`attachment_interpretations` states no bound** (§2.2). Recorded; it renders
  no list.
- **ADR-055** is neither satisfied nor superseded by this slice, and expires
  **2026-10-27**.

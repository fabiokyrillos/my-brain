# Phase 2I — Slice 2I.5 acceptance — global lexical search

**Date:** 2026-08-07 · **Migrations: 0** (budget **1 allocated · 0 spent**)
**Requirements:** `2I-SEARCH-001` … `2I-SEARCH-011`, `2I-METRIC-004`

---

## Requirements

| Id | Class | Evidence |
| --- | --- | --- |
| `2I-SEARCH-001` | **built** | Seven domains over seven existing tables. Product vocabulary in the UI, schema names only in `contracts.ts` — a test asserts `organizations`/`attachments` never appear in a label |
| `2I-SEARCH-002` | **built** | Every result declares its type in **text** via `SourceCard` |
| `2I-SEARCH-003` | **built** | Type and period filters; `periodSince` tested for ordering |
| `2I-SEARCH-004` | **built** | Owner scope **in the query**, via the request-scoped authenticated client under forced RLS. **Proved in pgTAP with a second account** — see §2 |
| `2I-SEARCH-005` | **built** | The zero-result and not-owned responses are the same shape; the unauthenticated response is that shape too, so an unauthenticated probe learns nothing |
| `2I-SEARCH-006` | **built** | `PER_DOMAIN_LIMIT` 8, `TOTAL_LIMIT` 40, both stated in the response. A test asserts 7 × 8 > 40, so the total bound can actually fire rather than being decorative |
| `2I-SEARCH-007` | **built** | `Promise.allSettled` per domain; a failed domain is **named** in the UI and `partial: true` is set |
| `2I-SEARCH-008` | **built** | G-2I.2's measurement: parallel per-domain, slowest 121–244 ms against a 300 ms budget |
| `2I-SEARCH-009` | **built** | Reformulation offered on an empty result — **without hinting at what was excluded** |
| `2I-SEARCH-010` | **built** | Guard forbids `embedding`, `entry_embeddings`, `<=>`, `cosine`, `pgvector`, `similarity(` and any provider call. **ADR-055 remains open and unchanged** |
| `2I-SEARCH-011` | **built** | Telemetry carries a result **bucket**, filter booleans and `partial` — never the query. Payload asserted structurally |

## Telemetry — `2I-METRIC`, owned by this slice

| Id | Class | Evidence |
| --- | --- | --- |
| `2I-METRIC-001` | **built** | Cohort labelling is carried by the existing `record_product_event` path; search events are emitted through it and never through a second channel |
| `2I-METRIC-002` | **built** | The internal-cohort caveat is recorded in the PRD §10 and in this phase's closing report; no surface presents current-population figures as public activation |
| `2I-METRIC-003` | **built** | Measured: search run, result-count **bucket**, type filter used, period filter used, sensitive scope on/off, partial failure — the payload in `search-surface.tsx` |
| `2I-METRIC-004` | **built** | **Structural, not procedural.** The payload is a closed set of booleans and a bucket string; the guard parses the literal `onSearched({…})` object and fails if it carries `query`, `title`, `snippet`, `name` or `content` |
| `2I-METRIC-005` | **built** | Activation and retention measures are labelled *instrument now, evaluate after public cohort exists* in the PRD §10; none is interpreted in this phase |
| `2I-METRIC-006` | **built** | One telemetry path — the existing product-event RPC and its validator. No new free-text field, so a badly-shaped event fails loudly rather than recording nothing (ADR-084's lesson) |

**Buckets, never counts.** `bucket()` maps a result count to `0` / `1-3` /
`4-10` / `11-25` / `26+`. A raw count for a rare term is close to identifying on
its own — "the search that returned exactly 1 result" is a much narrower fact
than "a search returned something".

## OD-1 — the exclusion is a predicate, and the silence is the point

`highly_sensitive` is excluded via `.in("sensitivity", levels)` **inside each
query**, so an excluded row is never retrieved. Retrieve-then-hide would put the
excluded content into a response the client could inspect.

**The default state leaks neither existence nor count.** The guard asserts the
response carries no `hiddenCount`, `excludedCount`, `sensitiveCount`,
`hasHidden` or `omitted`. The empty-state copy was written for this too: it says
*"Tente outra palavra ou remova os filtros"* and deliberately **does not**
suggest enabling sensitive search — that suggestion would be an existence oracle
with a helpful tone.

When the scope is on it is **visibly active** while results are shown, so the
user attributes the extra results to the scope rather than to the query. It is
not persisted; no existing preference contract supports it.

## OD-2 — extracted text is searchable, and bounded

`attachments.extracted_text` is in the searched columns. Snippets are bounded to
160 characters, centred on the match, whitespace-flattened so a row cannot be
inflated to push others off screen, and rendered as **text**. No model call
consumes them. No durable duplicate of the column exists.

## 2. T-2I-01 proved with two accounts

`supabase/tests/phase_2i_search_ownership.sql`, **18 assertions**, in CI's
chain-built database.

**An ownership test with one user proves nothing** — a query returning every row
in the table would pass it. So the suite creates **two owners**, gives them rows
matching the *same* needle, and asserts under `role authenticated` with each
one's JWT claim that each sees only their own. Both directions are asserted,
because a policy written `user_id = auth.uid()` and one written
`user_id = '<A>'` are indistinguishable from A's side.

Structure: non-vacuity first (the needle really is in both owners' rows), then
the seven domains, then OD-1's default exclusion **with a control proving the
`highly_sensitive` row exists**, then the sensitive scope widening sensitivity
and **never ownership**, then the mirror, then forced RLS on all seven tables.

## The structural boundary

The guard's first assertion is not *"the query is owner-scoped"* but **"no file
in this feature can construct a service-role client"**. The realistic failure is
not a missing `WHERE user_id` — RLS covers that — it is a service-role client
introduced *for performance*, which bypasses RLS and makes the predicate the
only boundary.

One deliberate loosening is recorded rather than hidden: `.select()` is typed
against a *literal* projection, and this one is assembled per domain. Seven
typed builders would restore inference at the cost of seven copies of the same
predicate — and a divergence between them is exactly how one domain quietly
loses its sensitivity filter. So the builder is loosened **in one place**, to a
declared five-method type rather than to `any`, and the boundary is untouched:
it is still the authenticated client.

## A defect this slice's route triggered

`egc-reachability.test.ts` failed the moment `/app/search` appeared: *"A route
was added or removed without updating the reachability inventory."* That is the
guard doing its job — the inventory is only assertable over a complete set.
`search` is enumerated with `sections: []`, because it renders no collection of
its own: every result is a link into the surface that owns that record, and
search writes nothing.

## Verification

lint clean · typecheck clean · build passes · contract tests **18/18** · search
guard **17/17** · pgTAP **18 planned / 18 asserted** (runs in CI against the
chain-built database) · full suite **4399** · **zero migrations**.

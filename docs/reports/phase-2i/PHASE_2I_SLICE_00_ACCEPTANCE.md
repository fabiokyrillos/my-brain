# Phase 2I — Slice 2I.0 acceptance — pre-code verification and the search decision

**Date:** 2026-08-07 · **Migrations: 0** (phase budget 1 allocated · **0 spent**)
**Gates:** G-2I.1 · G-2I.2 · G-2I.3 · G-2I.4 · G-2I.5

---

## 1. Pre-code verification — every item read, not assumed

| # | Check | Reading |
| --- | --- | --- |
| 1 | `main` clean and synchronized | `6f5eae1`, working tree clean, `HEAD == origin/main` |
| 2 | Migration parity | **`202608070084`** — Local = Remote = Applied |
| 3 | A13 guards **Phase 2J** | `phase-2f-documentation.test.ts` **29/29 green**, describe reads *"A13: Phase 2J is not started"* |
| 4 | No Phase 2J start signal | `phase2JStartSignals(REPO)` returns `[]`. The only `PHASE_2J_` string in `docs/` is prose in `README.md` describing the guard — not a governing artifact, not a declaration |
| 5 | Planning artifacts present | PRD + implementation plan under `docs/initiatives/phase-2i/`; audit, threat model, traceability contract, gaps under `docs/reports/phase-2i/` |
| 6 | Rollout gate | **25 pass · 3 fail · 2 owner-signature — "SIGNUP MUST NOT OPEN"** |
| 7 | Migration budget | max **1**, allocated to **2I.5 only**, `0 spent` preferred — confirmed in the plan §1 |

**G-2I.1, G-2I.3, G-2I.4 cleared.** The audit's DELIVERED/RENAME/MISSING
classification was re-verified: `home: "Início"` still pending (the one rename
this phase owns), `chat: "Conversar"` **already shipped**, and the six
`group: "context"` members still unrendered.

**Locale-ternary baseline pinned** for `2I-CLOSE-003`'s ratchet — see §5.

---

## 2. G-2I.2 — the search measurement, and why it is trustworthy

`scripts/phase-2i-search-benchmark.mjs`. **Option A was measured first; no FTS
schema was created to measure against.**

### 2.1 The safety design, because this seeds thousands of rows into production

The first draft wrapped the work in `begin; …` and relied on the Management API
not committing. **That is a guess about someone else's transaction handling, and
if wrong it would have left thousands of fixture rows in production** — a data
incident caused by a benchmark.

So the whole body is **a single `DO` block whose only exit is `raise`**. A `DO`
block is one statement and is atomic: the raise rolls back every insert, every
`alter table … disable trigger` and every `set_config`, regardless of how the
caller manages transactions. The measurements ride out **in the exception
message**, because an exception is the one exit path that cannot leave data
behind.

The script then **reads the table back to verify the rollback**, on every run:

```
rollback verified: 0 benchmark rows persisted
```

**RLS is left on and is the thing measured** — queries run under
`set_config('role','authenticated')` with a JWT claim, so every predicate is
evaluated as the product will evaluate it. A benchmark run as `postgres` would
measure a query nobody issues.

### 2.2 Volumes — a heavy user after ~two years, not a hypothetical population

Search is per-owner under RLS, so **the number that matters is one person's
data.** The owner's instruction not to optimise for millions of users is
followed literally.

| Domain | scale 1 | scale 2 |
| --- | ---: | ---: |
| entries | 5 000 | 10 000 |
| tasks | 2 000 | 4 000 |
| memories | 1 000 | 2 000 |
| people | 300 | 600 |
| projects | 100 | 200 |
| organizations | 50 | 100 |
| attachments (~20 KB `extracted_text` each) | 500 | 1 000 |

### 2.3 Results

| Step | scale 1 | scale 2 |
| --- | ---: | ---: |
| `A.entries` — `original_content` | 120.8 / 191.3 ms | 231.9 ms |
| `A.tasks` — `title`+`description` | 51.0 ms | 101.2 ms |
| `A.memories` — `content` | 23.4 ms | 49.0 ms |
| `A.people` — `name`+`notes` | 7.7 ms | 18.2 ms |
| `A.projects` | 3.4 ms | 7.1 ms |
| `A.organizations` | 2.0 ms | 3.5 ms |
| `A.attachments` — incl. `extracted_text` | 118.2 ms | 244.1 ms |
| **`A.ALL` — sequential `UNION`** | **338–354 ms** | **669.1 ms** |
| **slowest single domain — parallel** | **121–191 ms** | **244 ms** |
| `A.prefix` — `people.name` prefix | 0.8 ms | 0.8 ms |

### 2.4 The decision: **zero migrations**

| Shape | scale 1 | scale 2 | Budget 300 ms |
| --- | ---: | ---: | --- |
| Sequential — one `UNION` round trip | 354 ms | 669 ms | **FAIL** |
| **Parallel — slowest single domain** | **191 ms** | **244 ms** | **PASS** |

**The parallel shape is not a convenient reading of the data — it is the shape
the requirements already mandate.** `2I-SEARCH-006` (per-domain result bounds)
and `2I-SEARCH-007` (a **named** per-domain partial failure) are both
meaningless unless each domain is queried independently. Having required
independent per-domain queries, the wall clock is the slowest domain, not the
sum. So the sequential figure is informational and the parallel figure decides.

> **`1 allocated · 0 spent`. The migration is not created.**

**Recorded revisit threshold**, so this is re-measurable rather than
re-arguable: re-run the benchmark when any single owner passes **~10 000
entries** or **~1 000 attachments carrying `extracted_text`**. Growth is linear
(338 → 669 across a doubling) — a sequential scan behaving exactly as expected.
The two dominant columns are `entries.original_content` and
`attachments.extracted_text`; a future FTS migration would target those first.

**Recorded in ADR-093.**

---

## 3. Two defects found in this slice's own tooling

*Suspect the probe before the product* — eleventh and twelfth occurrences in
this repository.

**1. The benchmark's first exit design could have committed to production.**
Described in §2.1. Found by asking *what happens if the API commits?* rather
than by a failure — the most valuable kind, because the failure mode was
irreversible.

**2. `managementQuery` truncated the answer to 300 characters.** The benchmark
carries its results out in an exception message; `backup-shared.mjs` sliced
every error to 300 chars, cutting the JSON mid-payload. Two consecutive runs
reported *"failed before it could report"* for runs that had **completed
perfectly**. Fixed with an `errorLimit` option that keeps the bound by default —
a runaway provider error should not flood a log — and lets a caller that knows
the message *is* the answer raise it.

A third, smaller: `LIMIT` before `UNION ALL` is a syntax error, and had it
parsed it would have bound to the whole union rather than each branch — the
wrong query, silently.

---

## 4. OD-1 and OD-2, recorded

Both signed by the owner and recorded in **ADR-093**. Summary, because slice
2I.5 implements them:

- **OD-1** — `normal` and `private` searchable by default; **`highly_sensitive`
  excluded** from default results and reachable only under an explicit,
  **visibly active**, non-persisted sensitive scope. **The default state leaks
  neither the existence nor the count of excluded matches** — a count is an
  existence oracle wearing a helpful hat. Ownership still comes exclusively from
  the authenticated query plus forced RLS; **no service-role search path.**
- **OD-2** — `attachments.extracted_text` **is** searchable, with bounded
  plain-text snippets, never markup, never sent to a model in Phase 2I, subject
  to OD-1, and with **no durable duplicate** of the column for UI convenience.

---

## 5. Locale-ternary baseline — G-2I.4

Pinned at phase start so `2I-CLOSE-003`'s ratchet has a floor.

> **Phase 2I baseline: 263 inline `pt ?` ternaries across 35 files.**
> Standing ceiling: **266** (`EGC-SURFACE-002`, measured at G-0.4).

Measured with **`countLocaleTernaries()`'s own pattern** (`/\bpt \?/g`),
deliberately **not** a second counter written for this report. A first attempt
used an ad-hoc regex and produced **325 across 50 files** — a number that would
have made the closing before/after meaningless, because it measures something
the ceiling is not denominated in. *A count compared against a differently-
measured count cannot fail for the reason it exists* — the same defect class as
the `public.entities` phantom, caught before it reached a document.

**Phase 2I does not sweep unrelated features.** Only surfaces it touches convert
to the typed `copy.ts` mechanism; the closing report states before/after against
the 263 pinned here.

---

## 6. What this slice did not do

No product code. No migration. No schema. No FTS object. No component. No route.
`ADR-055` untouched — no embeddings, no vector retrieval, no similarity, no
generated answers. **Phase 2J unstarted**, A13 green.

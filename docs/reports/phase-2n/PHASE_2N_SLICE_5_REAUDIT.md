# Phase 2N slice 2N.5 — re-audit against `main` after 2N.4, **NOT STARTED**

Written **before any code**, and this document starts nothing. It measures the
tree and database slice 2N.4 left behind against what `2N-FILES-001…012` and
`2N-PERSON-008` require, so whoever implements 2N.5 begins from facts rather than
from the plan's expectations.

**Zero requirements are claimed here. Zero files were created for the slice.**

## 0. Baseline

| Fact | Value |
| --- | --- |
| `main` | `da9b787`, clean, CI green on all three job families |
| Migrations | **94 local = 94 hosted**, parity **`202608140094`** |
| Budget | `3 allocated · 2 spent (M1, M3)` · **M2 reserved for 2N.7** · a fourth is a **STOP CONDITION** |
| Slice 2N.4 | **complete and merged**, zero migrations spent |
| Slice 2N.5 | **not started** |

## 1. The finding that decides the slice: `entity_attachments` has neither a reader nor a writer

`OD-2N-9` **B** and §6.5 of the implementation plan justify "no migration"
capability by capability, and the first row of that table reads:

> files linked to people and projects → `entity_attachments` (`entity_type`,
> `entity_id`, `attachment_id`, owner-scoped, trigger-validated)

**That is true about the schema and says nothing about the data.** Measured
against `main` at `da9b787` and the hosted database at parity `202608140094`:

### 1.1 No production reader

`entity_attachments` appears in `src/` exactly **once** outside tests and
generated types — as a **comment** in `src/features/deletion/actions.ts:12`
explaining that `authenticated` holds no `DELETE` on it. Neither contextual page
reads it: `people/[personId]/page.tsx` and `projects/[projectId]/page.tsx`
contain **no attachment query at all**. The files page reads `attachments` and
`attachment_interpretations`, never the link table.

So `2N-FILES-003` and `2N-FILES-009` would give this table its **first reader**,
exactly as 2N.0/2N.1 did for `entity_aliases`.

### 1.2 No production writer, and `authenticated` cannot become one

Read live from `information_schema.role_table_grants`:

| Grantee | Privileges on `public.entity_attachments` |
| --- | --- |
| `authenticated` | **REFERENCES, SELECT, TRIGGER, TRUNCATE** — no `INSERT`, no `UPDATE`, no `DELETE` |
| `service_role` | full DML |
| `postgres` | full DML |

`202607170016:239` revoked `insert, update, delete` from `authenticated`
deliberately. Searching the migrations, both Edge Function entrypoints and all of
`src/` for a writer finds:

- **M3's undo restore** (`202608140094:803`), which re-inserts rows that already
  existed — it cannot create a link that never existed;
- **pgTAP fixtures** in two suites;
- **an `after insert` quota trigger** (`202608050076:476`) that *counts* rows,
  proving the schema anticipated a writer;

and **nothing else**. No upload path, no worker step, no Server Action, no RPC.

### 1.3 What that means for the slice, stated plainly

**The library can be built to read links, and there will be no links to read.**
`2N-FILES-003` and `2N-FILES-005` are satisfiable as written — a file with no
link renders as having none, and a subject that is gone is not rendered as a
mysterious blank. But `2N-FILES-008` (*"genuinely more useful"*),
`2N-FILES-009` (*"navigable in both directions"*) and `2N-PERSON-008`
(*"related files render on the page"*) would render an **empty set for every user,
permanently**, because nothing can populate the table.

**This is a decision for the owner, and it is recorded here rather than
resolved.** The options are not equivalent and one of them is a stop condition:

| Option | What it costs | Verdict |
| --- | --- | --- |
| **A — ship the read side only** | nothing; `2N-FILES-009` and `2N-PERSON-008` close honestly as *built, empty by construction*, with the absence of a writer named | **no stop condition**, and the only option inside the current authorization |
| **B — give the owner a way to link a file to a person or project** | restoring `INSERT` to `authenticated`, or a new `SECURITY DEFINER` RPC | **new authority — STOP CONDITION** |
| **C — let the worker derive links from an attachment interpretation** | persisted inference from a model | contradicts the posture `OD-2N-8` **A** established; needs an explicit owner decision even though attachments are not "relations" in that decision's literal wording |

**Recommendation, for the owner to accept or refuse: option A**, with
`2N-FILES-009` and `2N-PERSON-008` shipped as real read paths whose empty state
says *there are no linked files* rather than being omitted — and the missing
writer recorded as a named remainder with an explicit destination, not absorbed.
Option A is the only one that does not require an owner decision before the slice
can start.

## 2. What already ships, so the slice does not budget for it twice

`/app/files/page.tsx` is **431 lines** and already does more than "a list":

| Capability | State on `main` |
| --- | --- |
| the file list | **ships** |
| processing states and inline errors | **ships** — reads `status` and `processing_error` |
| failed/exhausted job recovery | **ships** — reads `jobs` filtered to `failed`/`exhausted` and offers retry |
| `sensitivity` on the projection | **ships** — selected, and `deriveSubjectSensitivity` is already applied per row |
| extracted text and interpretation | **ships** — reads `attachment_interpretations` |
| `mime_type`, `size_bytes`, `created_at`, `description` | **selected today** |

So `2N-FILES-001`, `2N-FILES-002` and `2N-FILES-007` are **`baseline`
candidates**, and `2N-FILES-004` is **partially standing already** — the page
selects `sensitivity` and derives per row. What `2N-FILES-004` still needs is the
`file` surface being honoured **everywhere a file's name or extracted text can
appear**, which is a coverage question rather than a build.

**A slice that budgeted to build the library would be budgeting for work already
done**, which is the same correction 2N.4's re-audit made about "Precisa de você".

## 3. What is NOT yet measured, and must be before the slice starts

This document establishes the load-bearing fact and the decision it forces. It
has **not** measured:

- whether `attachments.extracted_text` reaches any surface today that
  `2N-FILES-006` would forbid;
- whether the files page's reads are **bounded**, and whether they report the
  bound (`2N-KNOWS-008`'s posture, which 2N.0–2N.2 applied elsewhere);
- what `2N-FILES-010`'s filters would cost over the columns already selected;
- whether `2N-FILES-011`'s "does not duplicate global search" holds against
  `DOMAIN_SPECS` as it stands after ADR-110 narrowed the `people` domain.

Each is a read, not a build, and each belongs to the slice's own opening step.

## 4. Stop conditions, restated against what was measured

2N.5's declared stop conditions are *"any need for a second orphan concept"* and
*"any proven material need for schema, which is an owner decision and never a
reallocation from M1, M2 or M3 (`2N-FILES-012`)"*.

**Neither fires on option A.** Option **B** fires the second one — a grant change
is authority, and `2N-SEC` treats authority as schema. Option **C** does not need
schema but needs a decision that `OD-2N-8`'s posture makes non-obvious.

**M2 remains reserved for 2N.7 and is not available to this slice under any
option.**

**Nothing in `2N-FILES-001…012` or `2N-PERSON-008` is claimed, built, or
partially built. Slice 2N.5 remains NOT STARTED.**

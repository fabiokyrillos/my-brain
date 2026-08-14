# Phase 2N slice 2N.4 — the closed enumeration `2N-CONFLICT-001` requires

`2N-CONFLICT-001` obliges the phase to enumerate *"which conflicts are
deterministically detectable from the schema as it stands"* and to declare **the
rest out of scope by name rather than leaving them implied**. This is that
enumeration. It is written **before the detector**, and the detector implements
exactly what survives it — nothing wider.

Every structural claim below was measured against the tree at `674965d` and the
hosted database at parity `202608140094`, read-only. Where a fact contradicts the
pre-implementation re-audit, it is named as a contradiction rather than quietly
corrected.

## 0. Four measured facts that bound the whole slice

### 0.1 `memories` accepts an inverted window; its sibling refuses one

Read live from `pg_constraint`:

| Table | Validity CHECK |
| --- | --- |
| `public.entity_aliases` | `((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from))` |
| `public.memories` | **none** — the only four checks are `confidence`, `content`, `kind`, `sensitivity` |

Two tables in one schema modelling the same idea, one guarded and one not. The
absence is confirmed across **all 94 migrations**, not only the one that created
the table: nothing later added it.

### 0.2 `memories.valid_from` has **no writer anywhere in the product**

Searched exhaustively — the 94 migrations, both Edge Function entrypoints, and
all of `src/`. Every occurrence is a **read**: `match_internal_knowledge`
(`202608130093`), the memory detail page, `resolve-sources.ts`, `lifecycle.ts`,
and the `AUDITED_COLUMNS` projection.

- `createProposedMemory` writes neither timestamp.
- `updateMemory` writes neither timestamp.
- `setMemoryLifecycle` writes **`valid_until` only**, and only two values:
  `now()` (`archive`) or `null` (`restore`).
- The extraction worker writes neither.

**Consequence, stated plainly:** through the product's own surfaces an inverted
window **cannot be created today**. It is reachable only by a direct PostgREST
write by the owner — who does hold `update` on their own rows — or by a future
writer of `valid_from`. So the expected population of this conflict today is
**zero**, and the detector is a **read-time safety net over a column the product
does not yet write**, not a report on data known to exist.

That is recorded rather than smoothed, because a slice that implied it was
cleaning up existing bad rows would be claiming something it cannot show.

### 0.3 The re-audit named a correction path that cannot perform the correction

`PHASE_2N_SLICE_4_REAUDIT.md` §1.3 says the owner *"corrects the dates through
`updateMemory`, an authority path that already exists and is audited"*.

**`memoryUpdateSchema` carries neither `valid_from` nor `valid_until`**
(`memories/schema.ts:61-70`). It admits `memoryId`, `locale`, `content`, `kind`,
`sensitivity`, `important`, `personId`, `projectId`, and is `.strict()`. The
re-audit's sentence is wrong about the mechanism while right about the
conclusion — an authority path does exist, but it is `setMemoryLifecycle`, not
`updateMemory`. §3 below settles which action this slice uses and why.

### 0.4 "Precisa de você" is welded to `entries`, and its reason vocabulary is enforced in Postgres

Both facts constrain how a memory conflict may enter the queue, and neither is
in the plan or the re-audit:

1. **Every row is entry-shaped.** `list_needs_attention` returns
   `{entry_id, reason, occurred_at, …}`; `loadAttentionProjection` hydrates the
   title from `entries.original_content`; `NeedsAttentionItemView.entryId` is
   **required**; the row renders as a link to `/app/inbox/{entryId}`. **A memory
   is not an entry**, and `memories.source_entry_id` is `on delete set null`, so
   it may have no entry at all.
2. **A sixth tracked reason is a runtime `22023`.**
   `needs_attention_item_opened` validates `attentionReason` against a
   **five-member enum inside the database** (`202607170024:206-212`). The row
   component fires that event on click.

So the conflict item must carry its **own view shape**, must **not** be a
`TrackedAttentionReason`, and must **not** emit that analytics event. The third
of those is independently required: telemetry belongs to 2N.7 and M2.

## 1. The enumeration

Eight candidates were considered. **One is implementable.** Each is classified
against the fixed vocabulary, with the eight facts `2N-CONFLICT-001` asks for.

### C1 — A memory whose validity window is inverted → **CONFLITO IMPLEMENTÁVEL**

| Question | Answer |
| --- | --- |
| **Data used** | `memories.valid_from`, `memories.valid_until`. Nothing else. |
| **Deterministic rule** | Both parse as instants **and** `valid_from > valid_until`, strictly. |
| **Why it is a conflict** | The row asserts it comes into force **after** it stopped being in force. There is no instant at which the memory is true, and no reading of the two columns makes both correct. |
| **Why both cannot hold** | `valid_from` means "true from here"; `valid_until` means "true until here". A window whose start is after its end is empty by construction. This is arithmetic, not interpretation. |
| **Real action available** | `setMemoryLifecycle` with `transition: "restore"` — an existing, audited, owner-scoped, server-authoritative path that clears `valid_until`. §3 justifies it. |
| **How it stops being a conflict** | Once `valid_until` is `null`, or once the pair no longer satisfies the rule by any route, the predicate is false and the item is simply not derived on the next read. Nothing is marked resolved; there is nothing to mark. |
| **Missing / foreign / unreadable** | Indistinguishable, by construction. The read is RLS-scoped, so a foreign memory yields no row — identical to a memory that does not exist. Either timestamp `null` → not a conflict. Either timestamp unparseable → **not** a conflict (the same fail-closed posture `memoryLifecycleState` already takes), so a data fault never becomes an accusation. |
| **False-positive risk** | **None available.** The rule has no threshold, no tolerance, no clock, and no comparison to `now()`. Equality is excluded deliberately — see below. Its real risk is the opposite: per §0.2 it will match nothing today. |

**Equality is excluded, and that is the sibling table's own rule.**
`entity_aliases_check` permits `valid_to >= valid_from`, so `from == until` is
legal there. It is also coherent: a memory true for a single instant is unusual,
not impossible. The predicate is therefore **strict**, and `from == until` is a
named passing case in the tests rather than an untested edge.

### C2 — Two memories on the same subject and `kind` with overlapping windows → **DETECTÁVEL, MAS NÃO CONFLITANTE**

Structurally detectable. Two preferences about one person at one time are
normally **complementary**, not contradictory. Nothing in the schema carries a
claim's polarity, so "overlapping" is the only thing measurable and it is not the
thing that matters. Every such item would reach the queue with **"dismiss"** as
its only honest action, which `2N-CONFLICT-005` refuses by rule.

### C3 — Two memories whose text disagrees → **AMBÍGUO DEMAIS**

Requires semantics. Would need embeddings or a provider, both of which the
detector contract forbids and `OD-2N-7` **A** does not sign — it signs derivation
**from existing data**, and no column carries polarity. Out.

### C4 — `person_relationships` asserting different types in each direction → **DETECTÁVEL, MAS NÃO CONFLITANTE**

"A is B's mentor" and "B is A's mentee" is coherent — direction-specific types
are the design, not a fault.

### C5 — A memory whose `source_entry_id` no longer resolves → **FORA DO ESCOPO**

Under RLS this is **indistinguishable from foreign**, so surfacing it would be an
existence oracle over another tenant's ids. 2N.1 and M1 already settled the
display: it reads `unsourced`. Surfacing it again would reverse a shipped privacy
decision.

### C6 — `confidence` disagreeing between two memories → **FORA DO ESCOPO**

`OD-2N-7` **A** explicitly forbids implicit precedence *by recency, confidence or
similarity*. Using confidence to pick a winner is precisely what the signature
refuses, and low confidence is not disagreement.

### C7 — An **alias** with an inverted window → **NOT-BUILT-BY-RULE**

The exact shape of C1 on `entity_aliases` — and **the database already refuses
it**, by `entity_aliases_check`, measured live. The set is empty by construction
and can only ever be empty. A detector here would be a control that cannot fail,
which is the vacuity this phase refuses elsewhere. Named rather than left
implied, because its absence is otherwise indistinguishable from an oversight.

### C8 — `person_projects` / `person_relationships` with an inverted window → **SEM AÇÃO DISPONÍVEL**

Both tables carry `valid_from`/`valid_until` and neither carries a CHECK, so this
is genuinely detectable. It is excluded on `2N-CONFLICT-005` grounds, not on
detection grounds: **there is no owner-facing edit path for either column on
either table.** The person page reads them (`page.tsx:77,91`) and nothing writes
them. An item with no action is exactly what `2N-CONFLICT-005` refuses, and
building the write path would be new surface this slice is not scoped for.

**Recorded as the one candidate that could become implementable later without
new detection work** — if a future slice gives those columns an owner-facing
authority path, C8 becomes C1's shape on two more tables.

### Summary

| # | Candidate | Classification |
| --- | --- | --- |
| C1 | memory validity window inverted | **conflito implementável** |
| C2 | overlapping windows, same subject and kind | detectável, mas não conflitante |
| C3 | memory texts disagree | ambíguo demais |
| C4 | asymmetric relationship types | detectável, mas não conflitante |
| C5 | unresolvable `source_entry_id` | fora do escopo |
| C6 | disagreeing `confidence` | fora do escopo |
| C7 | alias with inverted window | not-built-by-rule |
| C8 | `person_projects` / `person_relationships` inverted window | sem ação disponível |

**The set of implementable conflicts is `{C1}`, and it is closed.** The stop
condition — *"the deterministically detectable set turning out to be empty"* —
does **not** fire: it has one member, measured. The slice implements one member
and says so, rather than widening the definition of "conflict" until the list
looks longer.

## 2. What the detector may and may not do

Restated as the contract the guards enforce, so the list is testable rather than
aspirational.

**Must:** operate at read time; be deterministic; be pure; respect owner scope;
produce only conflicts with an available action; treat missing, foreign and
unreadable identically.

**Must not:** persist an inference; create a table, migration, job, cron or RPC;
mutate the memory; choose precedence; turn low confidence into a conflict;
compare free text semantically; call a provider; read embeddings.

The detector is `src/features/daily-cycle/conflict-detection.ts`: two exported
functions over a plain row shape, no clock, no I/O, no Supabase import.

## 3. The correction action, and why it is `restore` rather than a widened edit form

Three candidate actions were considered. The choice is load-bearing, so all
three are recorded.

**Rejected — widen `memoryUpdateSchema` with the two timestamps.** It needs no
migration, no RPC and no new authority: the columns exist, `authenticated`
already holds `update` on its own rows, and `AUDITED_COLUMNS` already compares
both. It is rejected on a **signed requirement**, not on capability.
`2N-CORRECT-002` binds the phase to *"correcting stays distinct from archiving —
a correction changes what a memory says, archiving changes whether it is in
force."* A raw `valid_until` field on the edit form is archiving wearing an edit
form's clothes, and `memories/schema.ts:72-79` already refuses it in writing:
*"the owner is choosing 'this stopped being true', not authoring a timestamp."*
2N.4 does not get to reverse that to make its own item prettier.

**Rejected — offer `archive`.** It does not reliably resolve. `archive` stamps
`valid_until = now()`; if `valid_from` is in the **future**, `valid_from > now()`
still holds and **the window is still inverted**. An action that resolves the
conflict only for some rows is not an action, it is a coin flip. Measured, not
assumed.

**Chosen — `setMemoryLifecycle` with `transition: "restore"`.** It clears
`valid_until` to `null`, and a null half can never satisfy the predicate, so it
resolves **every** instance with no case analysis. It already exists, is already
audited (`restore_memory`, with before- and after-state), is already
owner-scoped twice over, is already reachable from the memory detail page, and
needs no schema, no migration, no RPC and no new authority. It is the inverse of
archiving rather than a disguised form of it, so `2N-CORRECT-002` is satisfied
rather than bent.

**On "not choosing a winner".** `2N-CONFLICT-002` forbids **implicit** precedence
in how a conflict is *represented*. The item shows **both** dates, in the owner's
zone and locale, and states plainly that it removes the end date. The choice is
the owner's, made by clicking a labelled control — which is exactly what
`2N-CONFLICT-003` calls *"an explicit user act through an authority path that
already exists"*. The detector itself chooses nothing.

**On "refuse a new inverted window".** There is no validator to add, because
there is no input to validate: per §0.2 no product path writes `valid_from`, and
`setMemoryLifecycle` writes only `now()` or `null`. The refusal is **structural**
rather than a check, and a guard proves it stays that way — it fails if any
future code introduces a raw timestamp write. A validator on a field that does
not exist would be the vacuous control this phase refuses.

## 4. Presentation

`2N-CONFLICT-006` requires full in-app discoverability, and the row must explain
itself without leaking. It shows: what is inconsistent, the two dates, why the
Brain did not choose, and what the owner can do. It shows **no** internal id, no
fingerprint, no table name, no RLS detail, no `confidence`, and no content from
another owner.

The memory's own text is shown **subject to the same classification rules the
queue already applies to entry previews** — a `highly_sensitive` memory is masked
in place, exactly as `2J-PRIVACY-001/004/005` already require of every other row
carrying content.

Today the same row reads only as **"archived"**, because `memoryLifecycleState`
resolves it that way — *archived wins over scheduled*. That is the silence this
slice ends: the badge is not wrong about the code, it is wrong about the world.

## 5. Requirement-by-requirement

| Requirement | How this slice satisfies it |
| --- | --- |
| `2N-CONFLICT-001` | This document. Eight candidates, one implementable, seven declared out **by name** with reasons. |
| `2N-CONFLICT-002` | Read-time derivation from `valid_from`/`valid_until`; both dates shown; no table, no lifecycle, no migration; no precedence by recency, confidence or similarity. |
| `2N-CONFLICT-003` | `setMemoryLifecycle(restore)` — pre-existing, audited, owner-scoped. The item routes into the existing "Precisa de você". |
| `2N-CONFLICT-004` | Nothing suppresses an unresolved conflict. It is derived on every read and persists until the data stops satisfying the predicate. |
| `2N-CONFLICT-005` | C2, C6, C8 excluded **because** their only honest action would be "dismiss" or none at all. A guard asserts every derived conflict carries an action. |
| `2N-CONFLICT-006` | No notification is produced. Push is not resumed and this slice does not resume it. The conflict is discoverable at `/app` and `/app/inbox`. |

**Zero migrations. Zero RPCs. Zero new authority. Zero persisted inference.**

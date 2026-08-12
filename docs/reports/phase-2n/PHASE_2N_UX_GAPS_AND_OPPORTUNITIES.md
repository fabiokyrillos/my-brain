# Phase 2N — UX gaps and opportunities

**A report, not a plan.** It declares no requirement in this repository's
declaration shape, allocates no migration and authorizes nothing. It ranks what
the audit found by *what the user loses today*, and it names the cheapest
honest fix for each.

Companion: `PHASE_2N_CURRENT_EXPERIENCE_AUDIT.md`, from which every claim here
is drawn.

---

## 1. The gaps that change what the product means

### G-1 — The contextual pages promise privacy the product does not apply there

**What the user experiences.** A user classifies an entry `highly_sensitive`.
On Hoje, on Work, in Conversar and on the calendar it is masked, with a
deliberate local reveal. They open the person that entry mentions, and the same
text is printed in full in the timeline, along with the task titles the Work
view was masking a moment earlier.

**Why it is the worst gap.** The classification is a promise. A promise kept on
eight surfaces and broken on the ninth is worse than no promise, because the
user has been taught to rely on it. `2J-PRIVACY-001` was created for exactly
this failure — *"two surfaces of one product meant two answers"* — and the
person page is that sentence, one domain over.

**Cheapest honest fix.** Add `person`, `project`, `memory` and `library` to
`GOVERNED_SURFACES`, derive entry and task classification the way `work` and
`calendar` already do, and render through `ProtectedContent`. **No schema.** The
mechanism is built, tested and has a convergence guard.

### G-2 — Archiving a memory does not stop the assistant from reaching for it

**What the user experiences.** A user marks a memory as no longer true. The
Memories page badges it `archived`. They ask Conversar something related, and
the memory is not cited — so the product looks correct. What they cannot see is
that the archived memory was still *retrieved*, still consumed one of twenty
retrieval slots, and displaced a memory that is true.

**Why it matters.** `match_internal_knowledge` filters neither validity nor
sensitivity; it orders by similarity and applies `limit least(…, 20)` before
anything reads `valid_until`. `isMemoryInForce` runs afterwards, in TypeScript.
So the honest description of today's behaviour is: **removal leaves citation,
not retrieval** — and the more diligently a user curates, the worse their
answers get.

**Cheapest honest fix.** Filter in the RPC, before the bound. That is a
migration, and it is the strongest migration candidate in the phase.

### G-3 — Nothing can be deleted

**What the user experiences.** A person is created from a misheard name. The
user can rename it, they can end every association, and they can never remove
it. It stays in search, in selectors and in counts forever. The only removal the
product offers is deleting the entire account.

**Why it matters.** Every domain table already grants `delete` to
`authenticated`; the capability exists in the database and no code path uses
it. This is not a safety posture anybody designed — it is an absence.

**The fix is a decision, not a patch.** Deletion needs propagation rules,
retrieval eviction, audit, undo and a confirmation contract. It is
`OD-2N-11`.

### G-4 — A relationship is shown as a fact and cannot say where it came from

**What the user experiences.** The person page states "Camila — colleague,
since March". The user does not remember saying that. There is nothing to
click, no source to open, no way to tell whether they entered it or the model
inferred it.

**Why it matters.** `person_relationships`, `person_projects` and
`person_contexts` each carry a `confidence` number — which only makes sense for
something inferred — and **none carries a source, an interpretation link or an
origin**. Meanwhile `entry_entities` carries all three for mere mentions. The
product is more careful about a name it noticed than about a relationship it
asserts.

**Cheapest honest fix.** Either persist provenance on relations (migration), or
refuse to persist inferred relations at all and mark every stored relation as
owner-authored (no migration). Both are real; the choice is `OD-2N-8`.

### G-5 — "What the Brain knows" has one lever for three meanings

**What the user experiences.** A user wants to say *"that was never true"* and
the only control available says *"this stopped being true"*. Their correction is
recorded as history rather than as a mistake.

**Why it matters.** `memoryLifecycleState` derives three states from two
validity columns, and does it well. But validity is a statement about **time**,
and "wrong", "private" and "irrelevant" are not statements about time. Using one
lever for all four collapses distinctions the user actually holds.

**Cheapest honest fix.** Decide the vocabulary first (`OD-2N-6`), then see
whether it needs a column. A supersession pointer — *"this memory replaces
that one"* — is the version that costs schema; a correction expressed as
"archive the old, create the new, link them by source" costs none but records
the link nowhere.

### G-6 — Two memories may contradict each other and nothing notices

**What the user experiences.** The user says the kickoff is Tuesday, then later
says it moved to Thursday. Both memories exist, both are `active`, both are
retrievable, and Conversar will cite whichever is more similar to the question.
The user is never told the product holds two incompatible beliefs.

**Why it matters.** This is the roadmap's 2N.4 and it is the only genuinely
empty slice. There is no table, column, RPC, projection or surface for it.

**The risk to design against** is the one the brief names: a queue of *"the AI
is unsure"* items with no action attached is worse than silence. A conflict
should only be shown when it is **detectable deterministically** and
**resolvable with an authority path that exists**.

### G-7 — A file cannot be reached from the thing it is about

**What the user experiences.** A contract is uploaded and processed. From the
project it belongs to, it is invisible. From the file, the project is invisible.

**Why it matters.** `entity_attachments` exists, is owner-scoped, is
trigger-validated for polymorphic ownership, and has **no surface**. The link
table was built and never connected.

**Cheapest honest fix.** Read it on the contextual pages and write it from the
file page. **No schema.**

### G-8 — Nicknames find nothing

**What the user experiences.** Everyone calls her Bia. The record says
Beatriz. Searching "Bia" returns nothing, and capture creates a *second*
person.

**Why it matters.** `entity_aliases` — with `alias`, `normalized_alias`,
validity and its own explicit RLS policies and grants — has **zero readers and
zero writers**. This is the duplicate problem's built-and-unused solution.

**Cheapest honest fix.** Use the table. Adding it to search's `DOMAIN_SPECS`
and to entity resolution needs **no schema**.

### G-9 — Every contextual list is silently truncated

The person page bounds at 100 (50 for relations, 200 for the project selector)
with no pagination and no disclosure. Search, by contrast, bounds at 8/40 **and
says which bound it hit**. A bounded list that does not say it is bounded is a
wrong answer that looks complete — search already learned this at
`2I-SEARCH-006`.

### G-10 — Dates on these pages are rendered in the server's zone

Six of the twelve files carrying the unguarded form are the pages this phase
would extend, and the guard's corpus does not reach any of them. A user in
`America/Sao_Paulo` reading an evening entry sees tomorrow's date. See the
audit's §3 and `OD-2N-13`.

---

## 2. Opportunities that cost nothing structural

These are worth naming because they are large in user terms and small in
engineering terms.

- **The project page can borrow the person page's shape.** Relationships,
  associations with roles, and the timeline are already built as reusable
  panels.
- **`person_projects.role` is already rendered**; the project page could show
  the same roles from the other side for free.
- **`entry_interpretations` already holds the explanation** — summary,
  concepts, confidence, prompt and strategy versions. A "why do I know this"
  disclosure on a contextual page needs a read, not a model call.
- **`undo_operations` is a handler registry**, so a new reversible operation
  gains undo by registering, not by inventing.
- **Search already knows how to say "there is more"**; the contextual pages can
  copy the vocabulary rather than invent one.

---

## 3. What should be left alone

Named so the phase does not acquire them by proximity:

- **The four `daily-cycle` timezone exemptions.** Same defect family, different
  surfaces, existing destination, self-cleaning guard. Repairing somebody
  else's four files inside this phase's foundation slice is how a phase
  acquires unplanned scope.
- **Push, in every form.** Parallel track. No requirement here may depend on a
  delivery, and no notification may be the only way to learn about a conflict.
- **Recurrence.** Out by `OD-2M-7`, with its own initiative.
- **The rollout gate and signup.** Untouched; this phase is not progress
  toward them.
- **A graph as primary navigation.** The roadmap's own boundary.
- **Persisting model-inferred relations without confirmation**, unless
  `OD-2N-8` explicitly authorizes it with provenance attached.

---

## 4. Ranking, for the owner

By user harm today, highest first:

1. **G-1** — a privacy promise broken on a shipped page.
2. **G-2** — curation actively degrades answers.
3. **G-4** — unsourced claims presented as facts.
4. **G-3** — nothing can be removed.
5. **G-6** — silent contradictions.
6. **G-5** — one lever, three meanings.
7. **G-10** — wrong dates.
8. **G-7** / **G-8** — built mechanisms left unconnected.
9. **G-9** — silent truncation.

Note that **G-1, G-4 (refusal variant), G-7, G-8 and G-9 need no schema at
all**, and together they cover five of the nine. The migration pressure in this
phase comes from **G-2**, **G-3** and the persisted-provenance variant of
**G-4** — which is why the budget proposal is small and destination-bound
rather than round.

---

## 5. What the owner signed, gap by gap

**Added 2026-08-12, after ADR-109.** The ranking above is unchanged; this is its
disposition.

| Gap | Signed outcome | Cost |
| --- | --- | --- |
| **G-1** privacy broken on a shipped page | **Closed in 2N.0** — `OD-2N-12` **A** | no migration |
| **G-2** curation degrades answers | **Closed in 2N.3** — `OD-2N-6` **A**, archiving truly leaves retrieval | **M1** |
| **G-3** nothing can be deleted | **Closed in 2N.3** — `OD-2N-11` **B**, transactional deletion | **M3** |
| **G-4** unsourced claims shown as facts | **Closed by refusal** — `OD-2N-8` **A**, no persisted inference | no migration |
| **G-5** one lever, three meanings | **Partly** — `OD-2N-6` **A** keeps two states and no `suppressed` column; "never true" is expressed by **deleting** (G-3) rather than by a third state | covered by M1/M3 |
| **G-6** silent contradictions | **Closed in 2N.4** — `OD-2N-7` **A**, derived at read time | no migration |
| **G-7** files unreachable from their subject | **Closed in 2N.5, and enlarged** — `OD-2N-9` **B** | no migration |
| **G-8** nicknames find nothing | **Closed in 2N.0** — `OD-2N-1`/`OD-2N-2` **A**, first reader for `entity_aliases` | no migration |
| **G-9** silent truncation | **Closed in 2N.0** | no migration |
| **G-10** wrong dates | **Sent to a separate initiative** — `OD-2N-13` **B**, a mandatory dependency of 2N.1; **not repaired by Phase 2N** | no migration |

**Every gap is addressed, and seven of the ten cost no schema.** The two
migrations that close G-2 and G-3 are the two the audit proved could not be
closed any other way; M2 serves telemetry, which no gap here required.

**One combination is worth stating plainly**, because it is how the phase
answers G-5 without a third state: the owner declined a `suppressed` column and
signed deletion instead. "This was never true" is now expressed by **removing**
the memory — which the product genuinely could not do before — rather than by
adding a state that would have to be threaded through every read path.

**And one consequence of declining merge is worth naming beside it**: G-8's
aliases make a duplicate *findable*, and `OD-2N-3` A leaves it *unmergeable*.
What makes that survivable is G-3: the duplicate cannot be merged, but it can
now be deleted. The two signatures only cohere when read together.

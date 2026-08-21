# Phase 2Q — Threat model

**Scope:** persisting citations on a generated review, and rendering them as
links. Nothing else in this phase changes an authority boundary.

**Method.** Each threat names the concrete mechanism that would have to fail, the
control that stops it, and — where the control already ships — the file and line
that carry it. A control that exists only in this document is marked
**TO BUILD**, so a reader cannot mistake a plan for a defence.

**Assets at risk:** the owner's entry text, task titles, the sensitivity
classification derived from an entry, and the *existence* of records belonging to
other accounts.

---

## 1. The threat this phase exists to create, and must not

Persisting identifiers and turning them into anchors is the first time this
product will render a link out of something a **language model** produced. The
whole threat surface follows from that one sentence.

### T-1 — A fabricated identifier becomes a link

**Mechanism.** The model returns `citedSourceIds` containing an id it invented,
or an id belonging to another account it guessed. The id is persisted and later
rendered as an anchor.

**Control (ships today).** `openai-provider.ts:337` filters `citedSourceIds`
against `availableIds` — the set built from the rows the request actually read
under RLS. An id the request did not supply cannot survive the provider call.

**Second control (TO BUILD).** `2Q-TRUST-001`: every citation is re-read at
render time under the reader's own session. Persistence is a claim about what was
cited; it is never evidence the row exists.

**Residual.** None identified. The two controls are independent: the first
operates on the write, the second on the read.

### T-2 — A name in the Markdown becomes a link

**Mechanism.** The model writes "the Cronograma project" and the renderer, or a
future convenience, looks the name up and links it. This is the failure the
owner's requirement forbids by name.

**Control (partly ships).** `authorizeHref` (`reviews/markdown.ts:135`) admits an
href **only** if its uuid is in the allow-set the caller passes. There is no
name-lookup on the render path and none may be added.

**Control (TO BUILD).** `2Q-LINK-004`: a test in which a review names a real task
by title, with no citation for it, asserts that **no anchor is produced**. Without
that test the property is a promise.

### T-3 — A vouched-for id is pointed at the wrong surface

**Mechanism.** `authorizeHref`'s allow-set is keyed on the **uuid alone**, and
`INTERNAL_ROUTE`'s path segment is `[a-z-]+` — any surface. An envelope that
vouches for entry `X` therefore also authorizes `/pt-BR/app/work/X`,
`/pt-BR/app/people/X` and `/pt-BR/app/projects/X`.

**Present state.** **Inert but real.** The allow-set is empty today
(`reviews/[reviewId]/page.tsx:125`), so nothing is admitted. It becomes live the
moment this phase populates it. **This gap is recorded nowhere in Phase 2P's
artifacts.**

**Impact.** Not a disclosure: `work/[taskId]` scopes by `user_id` and calls
`notFound()`, so an entry id there yields the same not-found arm as a foreign id.
It is a **broken link the owner will click**, which is the failure class this
phase exists to remove.

**Control (TO BUILD).** `2Q-LINK-002`: the gate binds `(type, id)`. Both halves
are already in the envelope, so this costs no new data.

### T-4 — The stored envelope becomes a content store

**Mechanism.** Somebody adds `title`, `excerpt` or `preview` to the persisted
reference "so the page does not have to re-read". Entry text then lives in a
second place, outside the lifecycle that governs the first, and survives the
deletion of its source.

**Control (ships today).** `referenceSchema`
(`conversation-sources/contracts.ts:92`) is `.strict()` over exactly
`{ id, type, sourceId, support }`. **There is nowhere in the shape to put text.**
The property is enforced by the type, not by a caller's discipline —
`2K-PRIVACY-003`.

**Control (TO BUILD).** `2Q-CITE-006`: a test asserting an extra key is
**rejected**, not stripped. Stripping would let the mistake pass silently.

**Historical precedent this repository already paid for.** The legacy chat
citation shape carried an `excerpt`, and archiving a memory left the quote in the
thread in the clear, forever. `legacyEntrySchema`
(`contracts.ts:145`) exists solely to **recognise and discard** that shape.

### T-5 — Cross-account enumeration through a citation

**Mechanism.** A citation for an id belonging to another account renders
differently from one for an id that never existed — a "this record is not
available" versus nothing at all — and the difference tells the reader the
foreign id is real.

**Control (ships today, for chat).** `resolve-sources.ts:105` and `:112` scope
every read with `.eq("user_id", userId)`, so a foreign row simply does not come
back and lands in the same `unavailableCard` arm as a deleted one.

**Control (TO BUILD).** `2Q-TRUST-004`, asserted as an **equality** between the
foreign case and the nonexistent case — not as two separately passing
expectations, which is how this class of defect survives.

**Adjacent, unchanged.** `/app/reviews/[reviewId]` already keeps removed,
foreign and never-existed in one `notFound()` arm (ADR-124 Decision 4). This
phase must not open a second discriminator on the same page.

### T-6 — "Gone" is distinguishable from "unreadable"

**Mechanism.** A read that *errors* is handled differently from a read that
returns nothing, so a transient failure tells the reader the row exists.

**Control (ships today).** `resolve-sources.ts:125-132` builds its lookup maps as
empty on error, with the reason stated at the call site: *"A failed read is not
an empty read. Both produce `unavailable`… the surface must not distinguish
'gone' from 'unreadable'."*

**Control (TO BUILD).** `2Q-TRUST-003`, again as an equality assertion.

### T-7 — Highly sensitive content reaches a surface that did not carry it

**Mechanism.** A cited entry classified `highly_sensitive` renders its preview on
the review page, because ADR-124 made "the review's own words" visible and
somebody generalises that to the records it cites.

**Resolved by shape — `OD-2Q-5`, signed as option C (ADR-127 Decision 5).** The
sources area renders **no content at all**: no preview, no excerpt, no title.
There is no cited-record text on the surface, so there is nothing for the
generalisation to reach.

**Why this is stronger than the control that was recommended.**
`sensitivity-convergence.test.ts:50` already asserts, on `main` today, that **no
reviews surface may contain `resolveContent(` or the literal `highly_sensitive`**
— over three named files including `reviews/[reviewId]/page.tsx`. The
recommended option A would have required **weakening that shipped guard**,
because rendering a cited record's preview means resolving its classification on
a reviews surface. Option C keeps the guard unweakened, and `2Q-TRUST-006`
requires it to still pass with its reviews file list unchanged.

**Task-specific note, now moot on this surface.** `tasks` has no `sensitivity`
column; the level is derived from `source_entry_id` by `deriveTaskSensitivity`.
Under option C the review page never needs that derivation, because it never
renders task text. `2Q-TRUST-007` therefore asserts the *absence* of a second
derivation rather than the correct use of one.

**Residual.** The **destination** page still renders the record's content, under
its own rules — which is exactly what the owner decided should happen. Opening a
link is a deliberate act on a governed surface.

### T-7b — The protection discloses what it protects

**Mechanism.** A source list that showed a title for an ordinary record and
withheld it for a sensitive one would let a reader infer the classification from
the row's **shape**. The protection would leak the fact it exists.

**Why this is a new threat.** It does not exist under option A, where every row
carries a preview and the mask is uniform machinery. It is created by any partial
application of option C — showing identification "when it is safe to" — and it is
the reason ADR-127 Decision 5.2 makes the identification **content-free and
uniform**: kind and date, the same for every citation.

**Control (TO BUILD).** `2Q-TRUST-006`, asserted as an **equality** between a
row for a `normal` record and a row for a `highly_sensitive` one — equal except
for the identifier inside the href. Three separately passing tests would not be
this property.

### T-7c — A reveal control reappears

**Mechanism.** Somebody adds "show anyway" to a row, because that is what `MASK`
does everywhere else in the product.

**Why it would be wrong here.** The owner forbade it, and the shared presentation
`MASK` is `{ outcome: "mask", revealable: true }` — so honouring "no reveal"
through the rules table would mean either a new presentation variant or an edit
to `RULES`, both forbidden by ADR-124 Decision 2. Option C avoids the conflict
entirely: nothing maskable is rendered, so there is nothing to reveal.

**Control (TO BUILD).** `2Q-TRUST-009` — no interactive element exists in a
source row beyond the link itself, with a planted reveal button as the control
that makes the assertion capable of failing.

### T-8 — Deleting a record rewrites history

**Mechanism.** The citation column is made a foreign key with `on delete
cascade` or `set null`, so deleting a task edits what a past review said.

**Why it matters here.** A review is a **historical statement**. It said what it
said on the day it was written, and the product must not retroactively make it
say something else. Separately, this repository has already recorded that a
nullable FK makes `NULL` ambiguous between "no source" and "deleted source".

**Control (TO BUILD).** `2Q-CITE-003`: the migration creates **no foreign key**
on the column, proved by deleting a cited task and asserting the stored envelope
is **byte-identical**.

### T-9 — A malformed envelope is partially trusted

**Mechanism.** One reference in a stored envelope is corrupt; the parser salvages
the other three and renders them. The row is now half-trusted, and nothing says
which half.

**Control (ships today).** `parseCitations` (`contracts.ts:179`) parses the
envelope as a **whole** against a strict schema.

**Control (TO BUILD).** `2Q-TRUST-008`: one bad reference among four refuses the
envelope entirely, and the page still renders its words.

### T-10 — The feature ships and silently does nothing

**Mechanism.** Task citations are persisted under `type: "memory"`, the resolver
looks them up in `memories`, finds nothing, and returns `unavailable` for every
one. Entry citations work, every entry-based test passes, and the owner's actual
question — *"did I complete task X?"* — is never answered by a link.

**This is not hypothetical.** It is what reusing the chat envelope verbatim
would do, and the Phase 2P specification recommends exactly that reuse.

**Control (TO BUILD).** `2Q-FOUNDATION-003` executes the failure **before** any
fix, so the phase begins from a demonstrated defect rather than an argument; and
`2Q-CITE-007` requires the id prefix and the persisted type to agree, asserted as
a pair.

---

## 2. Threats the phase inherits and must not weaken

| Property | Where it lives | This phase's obligation |
|---|---|---|
| removed / foreign / never-existed are one `notFound()` arm on the review page | ADR-124 Decision 4 | do not add a discriminator |
| the review listing carries **no** review content | ADR-124 Decision 3 | citations are a **detail-page** feature only |
| **no reviews surface calls `resolveContent` or names `highly_sensitive`** | `sensitivity-convergence.test.ts:50`, ADR-124 Decision 2 | must still pass **unweakened**, with its reviews file list unchanged — `2Q-TRUST-006` |
| the sensitivity `RULES` table and `GOVERNED_SURFACES` | ADR-124 Decision 2 | **untouched.** `OD-2Q-5` is signed as option C, which needs no change to them; a change proving necessary is a stop condition |
| all six automation categories fail-closed | ADR-123 Decision 3 | no automatic writer is created |
| append-only ledgers are written only through their RPCs | `ENGINEERING_STANDARDS.md` | no direct writes; and see `OD-2Q-4` on why no new event is proposed |
| signup closed, rollout 25 · 3 · 2 | `signup-rollout-gate.test.ts` | untouched |

---

## 3. What this phase deliberately does not defend against

- **A model that writes a factually wrong sentence about a record that does
  exist.** Citations prove *which record was in the prompt*, not that the
  sentence about it is true. The product must not imply otherwise, and the copy
  must not say "verified".
- **A compromised owner session.** Everything here is owner-scoped; an attacker
  holding the session already has the records.
- **Screen-reader behaviour.** `2P-ACCESS-005` is **WAIVED, NOT PASSED**, and no
  statement about it may be earned by anything in this phase.

# Phase 2N — traceability contract

**A contract, not a plan, and not an authorization.** It defines what this phase
is mechanically forbidden from claiming. Its enforcement lives in
`src/lib/closeout/phase-2n-declarations.test.ts`, which runs in CI, and — when
implementation is authorized — in a generated matrix that may not be typed by
hand.

The phase is authorized for **planning only** (ADR-108), with all seventeen
decisions **signed** (ADR-109) and the one flagged interpretation settled by
**ADR-110**. **Thirty-one refusals: ten live during planning, twenty-one armed
at implementation.** Several therefore have two forms: what they refuse **now**
and what they will refuse **at closeout**. The planning half is live today.

---

## 1. Refusals live during planning

**R-1 — A requirement may not exist without a classification.**
Every declared identifier appears exactly once in the PRD in this repository's
declaration shape. Duplicates, gaps within a family, and identifiers declared
outside the PRD are refused.

**R-2 — A family name may not contain a digit.**
`2N-[A-Z]+-\d{3}` is the shape both the phase-start detector and the
traceability generator use. `2K-A11Y` matched neither, which is how seven
accessibility requirements became invisible to every prose count. Refused
mechanically rather than remembered.

**R-3 — The count may not drift.**
Wherever a document states this phase's requirement total, it states the same
number the PRD actually declares. A stale count in prose is refused, and the
extraction that checks it must be proved non-zero — an assertion over an empty
set passes trivially and is how a corpus scan dies unnoticed.

**R-4 — No migration may exist.**
No file in `supabase/migrations/` may be attributable to this phase during
planning. The budget is `3 allocated · obligation zero · 0 spent · none
created` (`OD-2N-14` B), and any document stating otherwise is refused. **An
allocation is a destination, not a permission.**

**R-4b — A signed decision may not be silently re-decided.**
All seventeen are signed. A document that reopens one, softens it, or describes
it as open is refused. The **declined options must remain visible**: a decision
whose alternatives have been deleted is a decision nobody can review, so the
plan's §7 and ADR-109 both keep them.

**R-4c — A decision that needed an interpretation may not be closed by
inventing one.**
Where a signed decision does not cleanly cover a case, the package **states the
interpretation and asks**, rather than resolving it inside an implementation.
`2N-PRIVACY-007` was the only such case, it was flagged rather than absorbed,
and ADR-110 settled it. A future package that quietly picks a reading is refused.

**R-5 — Implementation may not begin under a planning-only authorization.**
No acceptance record, no traceability matrix, no closing report and no
deployment record may exist. Their absence is asserted, not assumed. This
inverts at closeout, exactly as Phase 2M's did.

**R-6 — Push may not be treated as approved.**
Any document claiming push delivery works, or that Android has been validated,
is refused. The inherited state is: implemented and hosted, **failing on a real
iPhone with HTTP 403**, cause unproven, Android **NOT EXECUTED**, destination
`docs/initiatives/push-hardware-validation/`.

**R-7 — The successor may not be started.**
No governing artifact by role, no declared requirement in the successor's
namespace, no accepted ADR whose heading names it, no implementation-marked
file. Enforced by A13, which this phase's own authorizing commit retargeted.

**R-8 — The authorization may not be overstated.**
The active-milestone line and every governing document must say **planning
only** and must not describe implementation as authorized.

## 2. Refusals that arm at implementation

Recorded now so the closeout cannot invent easier rules later.

**R-9 — A partial without a remainder and a destination is refused.**
"Partially done" with no statement of what remains and where it goes is
indistinguishable from an unclassified requirement.

**R-10 — A migration without an exclusive, non-transferable destination is
refused.** Each is named to one slice. Unspent capacity in one is not capacity
in another. A migration created to use up an allocation fails the close, and an
unspent allocation is not a defect.

**R-11 — Exceeding the budget is a stop condition, not a variance.**
The signed number is a ceiling. A fifth migration stops the work and returns to
the owner.

**R-12 — A rendered relation without a stated origin is refused.**
Every relation the product displays says whether the user authored it or it was
derived, and from what. A `confidence` number rendered as a fact is the
specific shape refused.

**R-13 — A correction without an authority path is refused.**
No direct client write to any of the five domains. Every correction,
suppression, archival and removal runs through a Server Action or a validated
RPC and is audited.

**R-14 — A removal that does not leave retrieval is refused.**
Whatever "removed" means, it is enforced where the retrieval bound is applied.
A test asserting absence from a citation list does **not** satisfy this; the
test must assert the row is not retrieved.

**R-15 — A graph without a complete non-graph alternative is refused.**
The alternative is reachable by keyboard, usable by a screen reader, and not a
degraded fallback.

**R-16 — Sensitive content without a policy is refused.**
Any surface rendering entry content, task titles, memory content or file names
is inside the sensitivity contract or it does not ship. A surface testing a
classification literal on its own is refused by the existing boundary guard.

**R-16b — A fail-open default for unclassifiable free text is refused.**
`people.notes` carries no classification and no classifiable source. It is
**masked by default**, revealed only by a local, explicit, accessible act, and
**absence of classification never resolves to `normal`** (ADR-110). A surface
that shows it because nothing told the surface not to is refused.

**R-16c — An inferred classification is refused.**
No sensitivity may be derived from the *text* of a note, or from any other
content, by a model or a heuristic. Classification comes from a source record or
from a user act, and from nothing else. A guess presented as a protection is
worse than no protection, because the user stops checking.

**R-16d — An indirect leak of masked free text is refused.**
Content masked on the contextual surface may not appear in full in search
results or snippets, suggestions, previews, related pages, the graph, telemetry,
or as retrievable content. Masking a field on one surface and printing it on the
next is not a policy; it is a bug with a policy attached.

**R-16e — Masking a field may not hide the entity.**
The person's name and aliases stay searchable, and their existence and
structural counts stay true. A protection that makes the person unfindable has
protected nothing and destroyed navigation, and it would also make the count an
oracle in the opposite direction.

**R-17 — An event without both a producer and a consumer is refused.**
A producer with no reader is invisible, which this repository has already paid
for. Each declared event states its question, its producer, its consumer, its
test and a non-vacuous negative control proved through the real write path.

**R-18 — Telemetry carrying content is refused.**
No names, titles, content, snippets, file names, aliases or free-form
properties.

**R-19 — A hardware claim without an executed run is refused.**
No emulated run, offline test or structural assertion may be recorded as
satisfying a device or screen-reader requirement. Absent a real run, the
requirement closes **partial** with a named destination — never `pass`.

**R-20 — A count may not be an oracle.**
Counts are computed over everything the user owns, masked or not.

**R-21 — Deletion that does not propagate is refused.**
Deletion is signed (`OD-2N-11` B), so this is now a live obligation rather than
a conditional. Its propagation set is enumerated **per table** and asserted by
test, transactionally, with retrieval eviction in the same unit. A **client-side
multi-delete is refused outright**, and so is a **soft delete presented as
removal**.

**R-21b — An undo that restores less than it claims is refused.**
The proof of a deletion's undo is a test against a **populated** fixture — an
object with linked tasks, memories, files, relations and associations — that
asserts the **whole** prior state returns. A fixture with one bare row does not
discharge it. Where a propagation cannot be truthfully undone, the phase
**stops** (`2N-CORRECT-013`); it may not ship the smaller undo and describe the
deletion as reversible.

**R-21c — A graph that fails its contract is refused, not shipped smaller.**
The graph is signed (`OD-2N-10` B) as a contract with a refusal clause. A graph
without a complete, non-degraded, keyboard- and screen-reader-accessible
alternative, or one that attributes meaning to position, distance, cluster or
centrality, or one drawing an edge it cannot explain, fails the authorization
that permitted it. `2N-RELATION-011` requires stopping and proposing a
reduction; a decorative version is refused.

**R-21d — A fourth migration is refused.**
Three are allocated with exclusive destinations: **M1** retrieval,
**M2** telemetry, **M3** deletion. None may carry another's responsibility, none
is transferable, and a proven need for a fourth — including one arising from the
enlarged library or the graph — is a **stop condition and an owner decision**,
never a reallocation.

**R-22 — ADR-055 may not be quietly discharged.**
It is restated at close as neither satisfied nor superseded, with its expiry of
2026-10-27.

## 3. What this contract deliberately does not do

It does not classify any requirement — nothing has been executed. It does not
assert that the four `daily-cycle` timezone exemptions are this phase's to
repair; `OD-2N-13` **B** put them in a **separate initiative**, which this
contract requires to be **complete before 2N.1 begins** and does not otherwise
govern. It does not reopen ADR-093, ADR-057 or ADR-107. It does not gate signup
or the rollout, whose gate is stronger and lives elsewhere. It does not treat a
signed decision as an authorization to implement — **ADR-109 signed the
decisions and authorized no implementation**. And it does not treat its own
silence as approval of anything.

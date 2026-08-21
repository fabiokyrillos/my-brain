# Phase 2Q — Evidence: the record behind the claim (PRD)

**Authorization:** **planning only.** The owner authorized the planning of this
phase on 2026-08-21; ADR-126 records it. **This package authorizes no
implementation, no migration, no deployment, no hosted data change, no signup
change and no rollout change.** The owner reviewed the package and **signed all
eight decisions on 2026-08-21 (ADR-127)**; signing them authorized no
implementation either. Implementation starts only when the owner records a
separate decision that says so.

ADR-125 Decision 6 had authorized no planning for the successor. **ADR-126
supersedes that single decision and nothing else about ADR-125**, which stays
intact and unedited — a closed phase's record is not rewritten to agree with a
later one.

**Baseline:** authored against `main` **`beef7fa`**, local and `origin/main`
identical (`0 0`), worktree clean, zero open pull requests, CI **green 3/3** on
that exact SHA (run `32440530986`), **99 local = 99 hosted, parity
`202608190099`**, signup closed, rollout 25 pass · 3 fail · 2 owner-signature.
Every fact was re-derived read-only in this session; none was carried over.

**Governing pair:** this PRD and `PHASE_2Q_IMPLEMENTATION_PLAN.md`.
**Evidence:** `docs/reports/phase-2q/`.

**ALL EIGHT DECISIONS SIGNED by ADR-127** (2026-08-21). Seven follow the
recommendation; **`OD-2Q-5` does not**, and §2 records both what was recommended
and what was chosen, because a package that hid the divergence would be
describing a decision nobody made.

**42 requirements across six families and six slices. Nothing is implemented by
this package**, and nothing in it may be classified as delivered. (39 at
ADR-126; `2Q-LINK-008`, `2Q-LINK-009` and `2Q-TRUST-009` were **appended to the
ends of their families** by ADR-127 Decision 5, which added eight requirements
that nothing in the 39 expressed. **No identifier was renumbered, reused or
removed.**)

---

## 1. Outcome

**The product composes prose about the owner's own life in exactly one place
where the owner cannot check it.**

Everywhere else it already answers "where did this come from": a task links to
the entry it came from, a memory and a person and a project each carry a
provenance note, and a chat answer carries resolved source cards. A **generated
review** carries nothing — its page passes an empty allow-set, so every link the
model writes collapses into plain text, and the page has to admit to the owner
that it cannot name the records it is talking about.

Phase 2Q closes that hole, and hardens the mechanism that makes such a link
trustworthy in the first place.

Concretely, at the end of this phase:

- a review that says a task was completed **offers a link to that task**, and the
  link works;
- a link exists **only** because a canonical, owner-scoped identifier was
  recorded at generation time — **never** because a name in the Markdown looked
  like a record;
- a record that has since been deleted, archived, or become unreadable **does not
  become a broken link** — it degrades to words, and the page does not reveal
  which of those three things happened;
- the link gate cannot be satisfied by pointing a vouched-for id at the wrong
  surface;
- the review carries a **clear sources area** in which every cited record is
  reachable by a canonical link — **a cited task shown as a task**, never as a
  memory — and that area **shows no preview of the content**, because the review's
  own prose already says what it is about and opening the link is what shows the
  object, under the destination page's own rules (`OD-2Q-5`, signed C);
- a review whose sources were never recorded **says so honestly** rather than
  showing an empty container;
- and the accessibility lane that could not see a live dark-mode contrast defect
  can see it.

### What this phase is not

It is not a redesign of Revisões — that shipped in Phase 2P and the owner
approved it. It is not a widening of what the Brain retrieves. It is not a new
provenance system: three already exist and this phase uses them. It does not
open signup, resume the push HTTP 403 investigation, change the AI provider,
retain audio, build automation review flows, or absorb the rollout gates.

---

## 2. Owner decisions — ALL EIGHT SIGNED by ADR-127

**Inverted on 2026-08-21, and kept rather than rewritten.** Under ADR-126 this
section declared eight open decisions and refused to read its own
recommendations as outcomes. The owner has now answered all eight, so the
section refuses the mirror error instead: a document that re-opens a signed
decision, softens it, or describes it as still open.

**The options and the recommendations below are left standing.** They are the
context the signature was given in, and deleting the branches the owner declined
would make the record unreadable — the same reason Phase 2O's package kept its
declined branches visible.

**One decision went against the recommendation.** `OD-2Q-5` was recommended as
option A and signed as **option C**. §2.5 records why the divergence is an
improvement rather than a preference, because a package that quietly reported
"signed" would have lost the most consequential finding in the phase.

**Implementation is still not authorized.** ADR-127 signs the decisions and
nothing else; the pull request carrying this package stays a **draft**.

### `OD-2Q-1` — the citation type vocabulary

**SIGNED — option A**, as recommended. ADR-127 Decision 1.

`generateReview` labels **tasks** with the `memory:` prefix. The chat citation
contract pins `type: "entry" | "memory"` and resolves `memory` against the
`memories` table. Persisting a review's task citations in that shape would store
a task uuid as a memory, and **every task link would silently degrade to
"unavailable"** — see the audit §3.5.

- **(a) Widen the shared vocabulary to `entry | memory | task` (recommended).**
  One vocabulary, one resolver, one set of degradation rules. Touches a contract
  chat also uses, so chat's own tests become the control that its behaviour did
  not move. Costs **no migration** — the pinning is TypeScript, not SQL.
- **(b) Give reviews a separate envelope and resolver.** No risk to chat; two
  mechanisms that must be kept in agreement forever, which is the drift this
  repository has already paid for twice.

**Consequence of (a):** four type declarations and one resolver change; ~1 extra
day; chat regression proof required. **Of (b):** ~2 extra days and a permanent
second contract.

### `OD-2Q-2` — what a review may cite

**SIGNED — option A**, as recommended. ADR-127 Decision 2.

- **(a) Entries and tasks only (recommended).** Exactly what `generateReview`
  already retrieves. No change to the prompt, the cost, or the review's content.
- **(b) Widen the source set to people, projects, organizations and memories.**
  The owner's phrasing mentions them. Every added type is more rows in the
  prompt, more tokens per review, and a **different review** — the model would
  write about different things. That is a product change, not a link change.

**Consequence of (b):** review cost rises by roughly the size of the added
source text; the review's content changes; +1 slice.

### `OD-2Q-3` — backfill of historical reviews

**SIGNED — option A**, as recommended. ADR-127 Decision 3.

- **(a) No backfill (recommended).** The envelope's `unknown` evidence state
  already means "nobody recorded whether the Brain found anything", which is
  exactly true of a review written before the producer existed.
- **(b) Backfill by re-running retrieval over past windows.** The rows in those
  windows have since changed, so the result would be **references the original
  review was not written from** — an invention with a token cost.

### `OD-2Q-4` — telemetry for citation use

**SIGNED — option A**, as recommended. ADR-127 Decision 4. The migration budget therefore stays at one.

`product_events` validates event names against a closed list inside a **deployed
function**. A new event would be refused, silently. Widening the list is a
`create or replace` of deployed SQL: **a second migration.**

- **(a) No telemetry event; ship the feature (recommended).** Consistent with
  ADR-123's already-signed refusal of `2P-CALENDAR-MONTH-TELEMETRY`. The
  feature's use is observable from `audit_logs` and from the owner directly.
- **(b) Fund a second migration** to admit citation events.

**Consequence of (b):** migration budget 1 → 2; +0.5 slice; a deployed-function
change with its own seven gates.

### `OD-2Q-5` — what the sources area shows, and the sensitivity of what it shows

**SIGNED — option C. The recommendation was option A, and the owner chose against it.** ADR-127 Decisions 5, 5.1 and 5.2, plus eight requirements. See §2.5 below.

ADR-124 made **the review's own words** visible without a second click. A cited
**entry's** content is not the review's content, and ADR-124 Decision 2 left the
rules table untouched.

- **(a) The cited record follows `review_summary`'s rule — `highly_sensitive`
  is masked, with a local reveal (recommended).** The existence of the citation
  and the link are never hidden; only the preview text is.
- **(b) Show the cited preview unmasked**, extending ADR-124's amendment to a
  second kind of object.
- **(c) Render no preview at all** — link and label only.

**Consequence of (b):** an amendment to a signed decision, and highly sensitive
entry text reaching a surface that did not carry it before.

#### §2.5 — what option C does that the recommendation would not have

Recorded because the divergence is an **improvement**, not a preference, and a
package that reported only "signed" would have thrown the finding away.

**It preserves an invariant the recommendation would have broken.**
`sensitivity-convergence.test.ts:50` already asserts — today, on `main` — that
**no reviews surface may contain `resolveContent(` or the literal
`highly_sensitive`**, over three named files including
`reviews/[reviewId]/page.tsx`. ADR-124 Decision 2 established that and left it
standing. Rendering a cited record's preview means resolving that record's
classification on a reviews surface, so **option A would have required weakening
that guard.** A source list carrying no governed content never calls
`resolveContent` at all.

**It resolves a conflict the recommendation would have created.** The owner also
forbade a reveal control on this path. The shared `MASK` presentation is
`{ outcome: "mask", revealable: true }`, so under option A a `highly_sensitive`
cited record would have been masked **with** a reveal affordance — and removing
it would have meant either a new presentation variant or an edit to the `RULES`
table, both forbidden by ADR-124 Decision 2. Under option C nothing maskable is
rendered, so there is nothing to reveal and the rules table is untouched.

**The identification is content-free, and uniform — ADR-127 Decision 5.2.** A
row identifies its object by **kind and date**, never by its title or any
excerpt, and it looks the **same for every citation whatever the
classification.** Two reasons, both binding:

1. **A title is content.** Putting one on the row would put governed text back on
   the surface the paragraphs above keep clear, and a task carries no
   classification of its own — its level is derived from `source_entry_id`.
2. **A list that showed titles for ordinary objects and withheld them for
   sensitive ones would disclose the classification by its shape.** That is a
   leak the product does not have today, and it would be created by the
   protection rather than by the exposure.

**And the words are already on the page.** The review's own prose names what it
is talking about — that is what the review *is*. The sources area exists to point
at the object, not to repeat the sentence above it, which is exactly what the
owner's *"não duplicar uma prévia do conteúdo"* asks for. **Opening the link is
what shows the object, and the destination page's own rules govern what is shown
there.**

**What this costs.** A reader scanning only the sources area sees kinds, dates
and links rather than titles. That is the deliberate trade: the review's text
carries the meaning, and the list carries the proof.

### `OD-2Q-6` — does the WebKit dark-contrast defect belong to this phase?

**SIGNED — option A**, as recommended. ADR-127 Decision 6.

`A11Y-WEBKIT-DARK-CONTRAST` is live: global search and the Work bulk bar fail
axe `color-contrast` (serious) in dark mode on the WebKit lane, and `ci.yml:276`
runs that spec on `desktop` and `mobile` only, so **CI cannot see it**.

- **(a) Include as one small slice (recommended).** It is a live accessibility
  defect with a known cause; the fix and the CI extension are two ordered steps.
  Leaving it unassigned for another whole phase is a decision too.
- **(b) Route it to a separate accessibility initiative.** Keeps this phase
  single-themed.

**Consequence of (a):** +5 requirements, +1 slice, ~1–1.5 days.

### `OD-2Q-7` — the migration budget

**SIGNED — option A**, as recommended. ADR-127 Decision 7. The allocation is now **made**, not proposed: **1 allocated · 0 spent**, and any second need is a stop condition.

- **(a) Exactly one, for `summaries.citations jsonb` (recommended).** Proved
  necessary in the audit §3.3: no column can hold a citation and no join table
  exists. **A second migration is a stop condition** unless `OD-2Q-4` is signed
  for it.
- **(b) Two**, the second being `OD-2Q-4`'s telemetry.
- **(c) Zero** — which means the phase cannot be built. Recorded so that
  refusing is visibly available.

### `OD-2Q-8` — the four missing automation review flows

**SIGNED — option A**, as recommended. ADR-127 Decision 8.

`project`, `organization`, `memory` and `relation` can never accumulate
calibration evidence, because **no code path can write an observation for them**
(audit §5). ADR-123's amendment routed them here as one group.

- **(a) A separate initiative, not this phase (recommended).** Measured, they
  are not one group: `project` and `organization` are medium (the extraction
  schema already emits both), `memory` is large (it is not in the schema at all,
  so the AI contract and the Deno worker both change), and `relation` is
  **blocked** by `2N-RELATION-TRIGGER`. Absorbing them would make this two
  phases and would bury the owner's stated priority.
- **(b) Include `project` and `organization` only** — the two medium ones.
- **(c) Include all four.**

**Consequence of (b):** +2 slices, ~+4 days. **Of (c):** a second phase in
disguise, plus a decision to overturn `2N-RELATION-TRIGGER`.

---

## 3. Requirements

**Declaration shape.** Every requirement is declared exactly once, in this
repository's canonical shape — `- **2Q-FAMILY-000:** …` — so the traceability
generator's attribution guard finds it without a second parser. Each declaration
carries, in order: what must be true, an **Observable** criterion, a **Class**,
and a **Decision** where one blocks it.

**Reading the class.** `baseline` = the property already holds on `main` and the
phase must not regress it; `construction` = new work; `not-built-by-rule` =
deliberately not built, with the rule named. **No requirement is classified as
delivered by this document**, and the traceability contract's refusal 13 rejects
any classification made while its governing decision is still open.

### 3.1 `2Q-FOUNDATION` — measured truth before anything is built (5) · slice 2Q.0

- **2Q-FOUNDATION-001:** re-verify, against the `main` this package merges into, that `generateReview` still retrieves exactly entries and tasks and still discards `citedSourceIds`. **Observable:** a recorded read of both call sites with line numbers, plus an assertion that fails if either changes. **Class:** construction.
- **2Q-FOUNDATION-002:** re-verify that `summaries` still has no column able to hold a citation and no join table. **Observable:** a census of the deployed columns and of `Relationships`, recorded. **Class:** construction.
- **2Q-FOUNDATION-003:** re-verify the type-confusion finding by executing it — prove that a task uuid stored under `type: "memory"` resolves to `unavailable`. **Observable:** a test that fails before the vocabulary correction and passes after, with the pre-state recorded. **Class:** construction.
- **2Q-FOUNDATION-004:** re-verify the `authorizeHref` type-confusion gap by executing it — an id vouched for as an entry must currently authorize a `work/` href. **Observable:** a test asserting the present, wrong behaviour, which slice 2Q.2 then inverts. **Class:** construction.
- **2Q-FOUNDATION-005:** re-audit `2P-ATTENTION-008`'s browser half against the current e2e suite and record the verdict **in either direction**. **Observable:** a recorded verdict naming the spec and the assertion, or naming their absence. **Class:** construction.

### 3.2 `2Q-CITE` — the references survive the write (9) · slice 2Q.1

- **2Q-CITE-001:** `summaries` gains a column able to hold a citation envelope. **Observable:** the migration applies through the seven gates and hosted parity advances by exactly one. **Class:** construction. **Decision:** `OD-2Q-7`.
- **2Q-CITE-002:** the column inherits `summaries`' existing RLS and forced row-level security, and no new policy or grant is created. **Observable:** a pgTAP assertion that the table's policy set and grants are unchanged. **Class:** construction.
- **2Q-CITE-003:** the column is not a foreign key, so deleting a task cannot rewrite what a past review said. **Observable:** the migration contains no FK on it, and a test deletes a cited task then asserts the stored envelope is byte-identical. **Class:** construction.
- **2Q-CITE-004:** `generateReview` persists the provider's already-filtered `citedSourceIds` in the same write as the review. **Observable:** a test proving the envelope is present on the row the action wrote. **Class:** construction. **Decision:** `OD-2Q-1`.
- **2Q-CITE-005:** a fabricated identifier cannot reach the column. **Observable:** a test drives a fabricated id through the real provider filter and asserts it is absent from the persisted envelope. **Class:** baseline — `openai-provider.ts:337` already filters against the supplied set.
- **2Q-CITE-006:** the stored envelope carries no content-bearing field — no excerpt, title or snippet. **Observable:** a test asserts an extra key is **rejected**, not stripped. **Class:** construction.
- **2Q-CITE-007:** a review's source set stops calling a task a memory. **Observable:** the id prefix and the persisted type both name a task, asserted as a pair. **Class:** construction. **Decision:** `OD-2Q-1`.
- **2Q-CITE-008:** a review generated before this phase keeps working and is not retroactively described as having found nothing. **Observable:** a legacy row parses to the `unknown` evidence state and the page says nothing it cannot support. **Class:** construction. **Decision:** `OD-2Q-3`.
- **2Q-CITE-009:** regenerating a review replaces its envelope rather than accumulating envelopes. **Observable:** the upsert path is exercised twice over the same period key and the row holds one envelope. **Class:** construction.

### 3.3 `2Q-LINK` — a link is born only from a vouched-for identifier (9) · slice 2Q.2

- **2Q-LINK-001:** the review page passes the identifiers from the stored envelope as the allow-set, and nothing else. **Observable:** the allow-set is derived from the envelope, and a test proves an id absent from it is refused. **Class:** construction.
- **2Q-LINK-002:** the link gate binds **(type, id)**, not id alone — an entry id must not authorize a task route. **Observable:** the `2Q-FOUNDATION-004` test inverts, with the previously admitted wrong href as the planted control. **Class:** construction.
- **2Q-LINK-003:** a refused link becomes text, never nothing, so the model's words survive. **Observable:** a test asserts the sentence is still readable when its link is refused. **Class:** baseline.
- **2Q-LINK-004:** no link is ever born from matching a name in the Markdown against a record. **Observable:** a review naming a real task by title, with no citation for it, renders no anchor. **Class:** construction.
- **2Q-LINK-005:** external, `javascript:`, `data:`, protocol-relative and bare-surface hrefs stay refused. **Observable:** the existing `authorizeHref` cases keep passing after the (type, id) change. **Class:** baseline.
- **2Q-LINK-006:** the review shows a clear sources area in which every cited record is reachable by a canonical link, whether or not the prose linked it. **Observable:** the area lists one row per resolved citation, each row's href is the object's canonical route, and a test opens one and lands on that object. **Class:** construction. **Decision:** `OD-2Q-5` (signed C).
- **2Q-LINK-007:** a review with no citations says honestly that its sources were not recorded, and shows no empty container. **Observable:** a citation-free review renders the honest statement, no empty list and no fabricated section. **Class:** construction. **Decision:** `OD-2Q-5` (signed C).
- **2Q-LINK-008:** the sources area renders **no** preview, excerpt, snippet or title of a cited record's content — the review's own prose is not duplicated in it. **Observable:** the row's shape has nowhere to put content; a fixture whose cited entry and task carry distinctive text asserts that text appears **nowhere** in the rendered area, and the resolution path contains no `resolveContent(` call. **Class:** construction. **Decision:** `OD-2Q-5` (signed C).
- **2Q-LINK-009:** a cited task appears **as a task** and links to `/{locale}/app/work/{id}`; it is never labelled or routed as a memory. **Observable:** the row's kind label and its href are asserted as a pair, with a memory-labelled task as the planted control. **Class:** construction. **Decision:** `OD-2Q-1` (signed A), `OD-2Q-5` (signed C).

### 3.4 `2Q-TRUST` — when the record is gone, hidden, or not theirs (9) · slice 2Q.3

- **2Q-TRUST-001:** every citation is re-read at render time under the reader's own session; the stored envelope is never treated as proof the row still exists. **Observable:** the render path performs an owner-scoped read per cited id, proved with a stale envelope. **Class:** construction.
- **2Q-TRUST-002:** a removed record renders as words, not as a broken link. **Observable:** a test deletes a cited task and asserts no anchor. **Class:** construction.
- **2Q-TRUST-003:** an unreadable record — a query error — is indistinguishable from a removed one. **Observable:** a forced read failure produces output asserted **equal** to the deletion case, not merely also passing. **Class:** construction.
- **2Q-TRUST-004:** a record belonging to another account never resolves, and the page cannot be used to learn whether that id is real. **Observable:** a foreign id produces output asserted **equal** to a nonexistent id's. **Class:** construction.
- **2Q-TRUST-005:** an archived memory, if memories are ever citable, stops being offered as a source. **Observable:** the in-force check is applied, asserted with an out-of-force fixture. **Class:** baseline. **Decision:** `OD-2Q-2`.
- **2Q-TRUST-006:** a source row looks the **same whatever the cited record's classification**, so the area cannot disclose a classification by its shape. **Observable:** rows for a `normal` and a `highly_sensitive` cited record are asserted **equal** except for the identifier in the href; and `sensitivity-convergence.test.ts`'s existing assertion — that no reviews surface contains `resolveContent(` or `highly_sensitive` — still passes **unweakened**, with the reviews file list unchanged. **Class:** construction. **Decision:** `OD-2Q-5` (signed C).
- **2Q-TRUST-007:** the phase adds no second sensitivity derivation. **Observable:** the `RULES` table, `GOVERNED_SURFACES` and `review_summary`'s entry are byte-unchanged, and no new presentation variant is introduced; `deriveTaskSensitivity` remains the only task derivation. **Class:** construction.
- **2Q-TRUST-008:** an invalid or malformed stored envelope is refused as a whole rather than partially trusted. **Observable:** one bad reference among four refuses the envelope entirely and the page still renders its words. **Class:** construction.
- **2Q-TRUST-009:** no reveal control exists anywhere on the citation path. **Observable:** the rendered sources area exposes no control that changes what it shows, asserted by the absence of any interactive element in the row beyond the link itself, with a planted reveal button as the control that the assertion can fail. **Class:** construction. **Decision:** `OD-2Q-5` (signed C).

### 3.5 `2Q-ACCESS` — the lane that could not see the defect (5) · slice 2Q.4 · `OD-2Q-6`

- **2Q-ACCESS-001:** reproduce `A11Y-WEBKIT-DARK-CONTRAST` before changing anything, and record the failing selectors and ratios. **Observable:** an axe run on the WebKit lane naming each violation. **Class:** construction. **Decision:** `OD-2Q-6`.
- **2Q-ACCESS-002:** global search passes axe `color-contrast` in dark mode on the WebKit lane. **Observable:** the run that failed in `-001` passes, with no rule disabled. **Class:** construction. **Decision:** `OD-2Q-6`.
- **2Q-ACCESS-003:** the Work bulk bar passes the same check. **Observable:** as above. **Class:** construction. **Decision:** `OD-2Q-6`.
- **2Q-ACCESS-004:** after the fix, CI's accessibility step covers the lane that could not see it. **Observable:** `ci.yml` runs the spec on the WebKit project, and the order — fix first, lane second — is recorded. **Class:** construction. **Decision:** `OD-2Q-6`.
- **2Q-ACCESS-005:** the new citation surfaces introduce no contrast, focus or target-size regression on any lane. **Observable:** the extended lane covers the review page in both themes. **Class:** construction.

### 3.6 `2Q-CLOSE` — truthful completion (5) · slice 2Q.5

- **2Q-CLOSE-001:** a generator produces the traceability matrix from the phase's own records, or refuses entirely. **Observable:** `--check` reports declared = classified with zero unclassified, or exits non-zero. **Class:** construction.
- **2Q-CLOSE-002:** every `partial` and `not-built-by-rule` row names a concrete remainder **and** a destination. **Observable:** the generator refuses a row that does not, including one that tries to satisfy the check by containing its own identifier. **Class:** construction.
- **2Q-CLOSE-003:** the feature is proved hosted, against the deployed database, with zero residue afterwards. **Observable:** an owner-scoped journey plus a two-sided residue control that plants a row, sees it, and removes it. **Class:** construction.
- **2Q-CLOSE-004:** a remainder that cannot be discharged by an agent is named as such, with the human act that would discharge it. **Observable:** each is listed with that act. **Class:** construction.
- **2Q-CLOSE-005:** the phase does not start its successor. **Observable:** the phase-start guard is retargeted in the authorizing commit and is never unenforced in between. **Class:** construction.

## 4. Explicit exclusions

Named so they cannot be absorbed silently.

- **Signup** stays closed. **The rollout gate** stays 25 pass · 3 fail · 2
  owner-signature, and **`RG-DEP-3` cannot be closed by writing a file.**
- **Push HTTP 403** is not resumed.
- **The four automation review flows** — `OD-2Q-8`, recommended out.
- **`2P-AUTONOMY-005/-006/-007/-008`** stay `not-built-by-rule`; ADR-123
  Decision 3's fail-closed set is untouched and no automatic writer is created.
- **`2P-CHAT-007-JOURNEY`** stays unspendable: no AI credential exists here.
- **`2P-ACCESS-005` (VoiceOver)** stays **WAIVED, NOT PASSED**. Nothing in this
  phase may be reported as screen-reader evidence.
- **`2P-REMINDER-RECURRENCE`** stays refused by name (ADR-123 amendment);
  reopening it needs a new owner decision.
- **`2P-CALENDAR-MONTH-TELEMETRY`** stays explicitly unfunded.
- **`2P-MOBILE-002`'s keyboard/IME half** stays owner hardware.
- **No audio is persisted. No AI provider changes. No demo mode.**

---

## 5. Success measure

The phase succeeds if, on the owner's own device, a generated review that
mentions work they actually did offers a link to that work — and if a review
that mentions something since deleted says so in words instead of offering a
link that fails.

It fails if a "Fontes" section, a list, or any other container appears **without
canonical links** in it. ADR-125 Decision 4 already ruled on that shape, and this
phase inherits the ruling.

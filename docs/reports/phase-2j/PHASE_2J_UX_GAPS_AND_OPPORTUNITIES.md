# Phase 2J — UX Gaps and Opportunities

Companion to the current-experience audit. The audit says *what exists*; this document says
*what the user experiences as a result*, and which of those experiences Phase 2J should fix.

---

## 1. The gaps worth fixing

### G1 — The product has two "todays", and the user meets the weaker one

Tapping *Hoje* lands on a filtered Work list. The surface with capture, attention, waiting,
questions and recent activity lives at `/app`. The user's mental model — *today is where I
start* — is satisfied by a route they arrive at by a different name.

This is the highest-value item in the phase and it costs no schema. **→ `2J-HOJE-001`/`002`.**

### G2 — Attention is visible but not actionable

Home shows three attention items. Every one is a link to `/app/inbox/[entryId]`. A user who
opens the app to clear three small things performs three navigations, three context loads
and three returns. The queue is good; the interaction is a table of contents.

**→ `2J-ATTN-001`/`007`.**

### G3 — Overdue looks like due-today

`work-projection` knows the difference. The Home view model renders one label and one tone
for both. The single most consequential distinction on a daily surface is not made.

**→ `2J-HOJE-003`.**

### G4 — Capture is one thing in the user's head and three in the product

Text on Home, text on `/app/capture`, files on `/app/files`. Deciding *which* capture to
use is a classification step before capture — the exact thing the product says it does not
require.

Note carefully what the fix is not: the contracts should stay separate. The user should not
have to choose; the code still should. **→ `2J-CAPTURE-001`.**

### G5 — The day has no end

`/app/reviews` can generate a daily review. Nothing suggests it, nothing links to it from
the surface where the day happened, and nothing summarizes what is still open. A daily
practice with no closing gesture is a list that grows.

**→ `2J-DAY-002`/`003`.**

### G6 — Voice does not exist

The only genuinely absent capability in Etapa 2, and the one that most changes what mobile
capture feels like. Everything else in this phase is composition; this is construction.

**→ `2J-VOICE-*`.**

### G7 — Two surfaces of one product disagree about `highly_sensitive`

Search excludes it by default. Hoje and attention apply no predicate at all and render a
240-character preview of entry content. A user who classified something and then saw it on
the first screen would be right to conclude the classification means nothing.

The exposure is pre-existing. What Phase 2J changes is that concentrating attention onto one
mobile surface makes deciding unavoidable. **→ `2J-PRIVACY-*`, blocked on OD-2J-1.**

### G8 — Accessibility is asserted, not observed

The palette, search and Library have never been run through a browser-level audit. The
partial is honest; leaving it open while adding a denser cockpit on top is not.

**→ `2J-ACCESS-*`, slice zero.**

## 2. Opportunities deliberately declined

### D1 — *O Brain percebeu*

Attractive, and the fastest route to an engagement-shaped AI feed billed to the user's own
key. No deterministic source exists. The parent PRD's own principle is *"Silence is also a
result."* Declined, with the contract it would need recorded so a future phase must satisfy
it rather than rediscover it.

### D2 — An "attention" table

A unified surface reads like it wants a unified table. It does not: `list_needs_attention`
already computes the queue from entry state, and a table would be a second source of truth
that can disagree with the first. Composition over duplication.

### D3 — Snooze

The one attention action that genuinely needs new state — and therefore the one that would
turn a zero-migration slice into a schema change for a convenience. Declined for this phase,
recorded with its destination.

### D4 — AI-ranked priorities

Deterministic derivation from due/overdue data costs nothing, is explainable, and is
controllable. A model call to rank three items would add BYOK cost, a confidence contract, a
fail-closed path and a confirmation flow to produce an ordering the user can already predict.
Declined unless the owner says otherwise (OD-2J-3).

### D5 — Per-user transcription model choice

`agent_preferences` has six model slots. A seventh for transcription is unrequested scope
and a migration. Pin the model.

## 3. What the parent PRD got right

- **Hoje as the centre of gravity.** Correct, and the repository was already most of the way
  there — which the PRD did not know.
- **Attention as one place.** Correct, and the underlying queue already exists.
- **Capture must not require classification first.** Already true, and worth protecting.
- **Voice as a reviewable draft, never an automatic action.** The single best decision in the
  parent PRD, and the one that makes the whole feature cheap: because nothing is captured
  until confirmation, voice needs no new job type, no storage and no retention class.
- **No decorative metrics.** Already honoured; keep it.

## 4. What repository reality corrected

- **Hoje does not need to be built.** It needs to be *reachable under its own name*, and to
  distinguish overdue from due.
- **The attention queue exists**, is `security definer`, `auth.uid()`-scoped and
  keyset-paginated. Its **five reasons cover four of the six** sources the PRD lists — task
  suggestions, ambiguities, questions and recoverable failures. It is narrower than the PRD
  assumes and should stay that way.
- **Memory conflicts do not exist** in this schema. The PRD lists them; there is nothing to
  compose.
- **Configuration blockers are deliberately outside the queue.** `configure_ai_credential`
  is excluded because the analytics enum that validates attention reasons is enforced in the
  database. Admitting it is a migration, not a mapper change.
- **Review already exists** with four periods. The gap is continuity from Hoje, not the
  domain.
- **Voice's cost question resolves technically.** The one supported provider transcribes, so
  the user's existing BYOK credential already authorizes it. What remains is the
  no-credential behaviour, which is genuinely a product decision.
- **Telemetry is not free.** `product_events.event_name` is a database check constraint. The
  parent PRD's metrics cost a migration; that is the phase's principal schema cost.

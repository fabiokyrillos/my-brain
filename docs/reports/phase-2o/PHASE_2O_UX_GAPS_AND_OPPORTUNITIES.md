# Phase 2O — UX Gaps and Opportunities

**Status:** evidence for a planning package. Authorizes nothing.

**Derived from:** `PHASE_2O_CURRENT_EXPERIENCE_AUDIT.md` at `main` `9cc1175`.

Every gap below names what is missing, what already exists that it must reuse,
and what it would cost. A gap with no named reuse is a gap that will be built
twice.

---

## G1 — A stranger cannot learn what this product is

**Missing:** any unauthenticated surface that explains the Brain.
**Exists:** the legal documents render from repository truth in both locales at
`/legal/[document]`, with a working layout and a version contract.
**Cost:** one static route, two locales, no data access, no migration.
**Risk if skipped:** the product cannot be opened publicly at all — not because
of a gate, but because the first frame is a login form for something unnamed.

**Opportunity.** The honest version of this page is short. The product's own
posture — *your words are stored first and interpreted after; you bring your own
AI key; nothing leaves without your act* — is unusual and is the reason to try
it. It does not need marketing; it needs to be true and present.

---

## G2 — The closed door refuses after the work, not before

**Missing:** a register page that states its state before asking for anything.
**Exists:** `isSignupOpenIn(process.env)`, checked first, defaulting closed, and
already proved not to be a probe surface.
**Cost:** a read of the same predicate in the page component.
**Constraint:** the refusal must stay uniform. The page may say *"signup is
closed"* as a standing fact; it must not say anything that varies with the
input, because that is exactly what `SH-SIGNUP-001` refuses.

---

## G3 — There is no first conquest

**Missing:** everything. No welcome, no setup, no first capture, no first
interpretation, no arrival with context.
**Exists, and is the whole point:** asynchronous capture that returns before the
model runs; nine entry lifecycle states with `interpreting` first-class;
selective confirmation; real undo; `awaiting_ai_configuration` as a recovery
state; the composer in the shell; Hoje as a cockpit.

**Opportunity, and the design constraint that makes it cheap.** The product
already knows whether an account has a timezone, a credential, an entry, an
interpretation and a confirmed task. **Onboarding progress is derivable from the
data that exists** — it does not need a column, a table or a migration to be
resumable, and a derived checklist cannot go stale against the thing it
describes. A stored `onboarding_step` can, and would be the first thing to lie
after a user does the step in some other order.

**Risk:** an onboarding that blocks. This product's users capture first and
organize later; a modal wall between a person and the composer would contradict
the one interaction the whole product is built around.

---

## G4 — Three preferences steer a surface and cannot be set

**Missing:** controls for `daily_review_time`, `weekly_review_time`,
`weekly_review_day`.
**Exists:** the consumer, proved twice — `review-schedule.ts` reads them,
`day-review-projection.ts` carries them, `/app/reviews` renders the reading, and
`review-schedule.test.ts` proves the output *moves when the preference moves*.
**Cost:** three form fields, a schema widening, a payload passthrough that
already exists.
**Constraint:** `/app/reviews` says, in both locales, *"nada é executado por
horário configurado"*. That sentence is currently true and is guarded. A control
that implied scheduling would make it false. The control must be honest about
what it changes: **when the surface says the day is ready to close**, not when
anything runs.

---

## G5 — Nine preference columns exist and mean nothing

**Missing:** nothing that should be built now.
**The gap is the reverse of the usual one.** `privacy_preferences`,
`quiet_periods` and `avatar_path` have zero consumers; `autonomy_level`,
`follow_up_intensity`, `privacy_default`, `background_model`, `reasoning_model`
and `ai_provider` are written and carried and read by no behaviour.

**R-24 forbids giving any of them a control**, and giving them consumers is
agent-behaviour work — deciding what "autonomy" *does* — which is a different
phase's subject.

**Opportunity:** record the nine, with their state, in a place a guard reads, so
that the next person who sees a column and assumes a capability fails a test
instead of shipping a lie. That is cheap and it is the honest close.

---

## G6 — The capability registry is the right contract, inert

**Missing:** a consumer. Sixteen declared rows, imported by two files, one of
which is its own test.
**Exists:** the shape — `key`, `state`, `surface`, `consumerEvidence`,
`visible` — which is precisely the question Phase 2O has to answer thirty-five
times.

**Opportunity.** Make the preferences centre render *from* the registry, and
make a guard derive `consumerEvidence` from the tree rather than trusting the
literal. Then R-24 stops being a rule people remember and becomes a rule the
build enforces: a row claiming a consumer that does not exist fails; a control
without a row fails.

**The trap, named in advance.** `scheduled_reviews` is already ambiguous — true
under *"nothing runs by schedule"*, false under *"the preference has no
consumer"*. A registry that a surface renders **must** disambiguate, because a
hidden row and a visible one will then differ in what the user sees.

---

## G7 — The product says what an operation cost and never what it will cost

**Missing:** prospective cost, quota headroom, and any statement of the ceiling.
**Exists:** the append-only `ai_usage_events` ledger with price snapshots;
`get_ai_cost_summary`; per-operation model routing with three named profiles;
enforced quotas (`202608050076`) that already record their refusals.
**Cost:** a read of the quota configuration and the ledger, on a surface that
already exists.
**Constraint:** **no model call may be made to answer a question about cost.**
The shape `2K-SUGG-001` refused — spending the owner's credential to render a
page — applies here directly.

---

## G8 — There is no way to leave with your data

**Missing:** export.
**Exists:** RLS-scoped reads for every user-owned table; a deletion path that
already enumerates what a user owns, transactionally, and proves the enumeration
in pgTAP.
**Opportunity:** the deletion cascade is a census of *everything that belongs to
this person*. An export is the same census with a different verb, and building
it against the same enumeration is what stops the two drifting.
**Constraint and honest risk:** an export must be **complete or refuse**. A
partial archive presented as "your data" is worse than none. Size and timeout
are real: this is the one gap where a job and a storage artifact may be the
correct shape, and that costs a migration.

---

## G9 — A user cannot see or end their sessions

**Missing:** any session surface.
**Exists:** Supabase Auth sessions; `signOut` in `features/auth/actions.ts`.
**Cheap half:** "you are signed in on this device" plus a **global** sign-out —
`scope: "global"` — which needs no new authority.
**Expensive half:** listing devices needs GoTrue admin, which means
service-role, which is new authority on an authenticated path and a threat model
change.

---

## G10 — Twenty-three surfaces answer "there is nothing here" in their own words

**Missing:** adoption. **Exists:** a closed seven-state vocabulary with a
component, a tone contract, an icon rule, and a guard that fails a tone with no
icon.
**Measured:** `<UniversalState/>` renders on **one** surface; ten app pages and
thirteen feature components carry their own copy.
**Opportunity:** this is the cheapest large consistency win available, and it is
the direct upstream of three separate items on the phase's own brief — empty
states, error recovery, and dead ends.
**Constraint learned the hard way:** an absence assertion passes on a page that
never rendered. Any guard here needs a planted fixture marker, and any journey
needs a positive control.

---

## G11 — ADR-114 decided the theme is choosable and nothing chose

**Missing:** the control, and the persistence question.
**Exists:** the complete CSS contract, in both directions, with the
`:not([data-theme="light"])` qualifier that makes a light choice win on a dark
machine — the exact defect that would be invisible to anyone testing on a light
machine, already prevented.
**Cost:** client-only is a toggle, a `localStorage` read and a small no-flash
script. Persisted is a column and a migration.
**Note:** this is the only gap in this document that is a **divergence between a
signed decision and the tree**, rather than an unbuilt roadmap item.

---

## G12 — Preferences are in four places and one of them is a notification list

**Missing:** one destination that reaches all of them.
**Exists:** the Dados e IA pattern, shipped last week — a section in Ajustes
that **names and reaches** three routes, and a strip on each of those routes
with a way back. It preserved every URL, every filter and every deep link.
**Opportunity:** apply the identical move to notifications, deletion and
consent. It is proved, it is cheap, and it ends the scatter without ending a
route.
**Constraint:** `AccountMenu` mounts in exactly two places and sign-out lives in
`Mais`; `mobile-reachability-guard.test.ts` says when slot five frees up.
Consolidation must not orphan sign-out.

---

## G13 — Notification permission is asked where notifications are listed

**Missing:** the ask at a moment of value.
**Exists:** opt-in consent, content-free payloads, quiet hours, the daily cap,
and a governance module.
**Blocked by fact:** push **fails on a real iPhone with HTTP 403** and has never
run on Android. Moving the ask earlier without fixing delivery would ask more
people for a permission that does not work.

---

## G14 — Two proofs have never been executed

**Screen reader:** never run, never claimed, open since `2L-ACCESS-008`.
**44px touch target:** `online-memories.spec.ts:85` renders 21px, unchanged
since 2N.3, carried as `2N-MOBILE`.

Neither is a design gap. Both are **execution obligations** that a phase about
accessibility and mobile activation is the natural place to discharge — and
both cost owner or operator time, not code.

---

## Opportunities this audit found that the roadmap did not ask for

1. **The deletion enumeration is an export in disguise** (G8). Reuse, not
   rebuild.
2. **The Dados e IA pattern generalizes** (G12). It is the answer to
   consolidation-without-redirect, and it is already proved in production.
3. **A guard can derive `consumerEvidence` from the tree** (G6), turning R-24
   from a convention into a build failure.
4. **Onboarding can be entirely derived** (G3), which makes it resumable by
   construction and costs no schema.
5. **`awaiting_ai_configuration` is a template** (audit §3.3). One kind of
   incomplete configuration already has a first-class lifecycle state, a count,
   a message and a recovery action. Every other kind could have the same shape.

---

## Non-opportunities — recorded so they are not proposed again

- **`planning_day` / `planning_time` controls.** Retired by decision in
  `2M-AUDIT-005`. Building them contradicts a signed outcome.
- **Redirecting `/app/history`, `/app/costs`, `/app/jobs` into Settings tabs.**
  Refused by ADR-114 Decision 6 and by `transparency/contracts.ts`; would end
  three rendering surfaces and their deep links.
- **Opening signup.** Not this phase, not by inference, not by a passing gate.
- **Inferring a preference from behaviour.** The product's standing posture is
  that ambiguity becomes a pending question, never an invention.

---

## Amendment — 2026-08-15, ADR-116: which branch each gap took

Appended, not applied backwards. Each gap above stated options; the owner
signed. This records **which branch was taken**, so a reader does not have to
re-derive it from twelve decisions.

| Gap | Branch signed | Consequence for the gap |
|---|---|---|
| G1 — a stranger cannot learn what this is | `OD-2O-1` **A** | built, both locales, **no signup CTA while closed** |
| G2 — the closed door refuses after the work | — | unchanged; `2O-ENTRY-005` / `-006` |
| G3 — no first conquest | `OD-2O-3` **A** | **derived**, so resumable by construction and costing no schema |
| G4 — three preferences cannot be set | `OD-2O-6` **A** | controls built for exactly those three |
| G5 — nine columns mean nothing | `OD-2O-7` **A** | recorded and guarded; **no controls**, columns kept |
| G6 — the registry is inert | — | unchanged; `2O-ACTIVATION-004` / `-005` make it load-bearing |
| G7 — no prospective cost | — | unchanged; ceiling and headroom, never a forecast |
| G8 — no way to leave with your data | `OD-2O-4` **A** | **synchronous, server-side**, over the deletion enumeration. The cheaper branch, and it carries the timeout risk this gap named: if *complete or refuse* cannot hold, **the slice stops** |
| G9 — no session control | `OD-2O-5` **A** | the **cheap half only** — indicator plus global sign-out. The device list, and the service-role authority it needed, are declined |
| G10 — 23 surfaces answer in their own words | — | unchanged; `2O-RECOVER-001` / `-002` |
| G11 — ADR-114 decided a theme and nothing chose | `OD-2O-2` **A** | **client-side, `localStorage`, no migration.** This gap's own note said it was the only *contradiction* in the document; it now has `2O-PREF-013` … `-015`. Cost recorded: **the choice does not follow the account across devices** |
| G12 — preferences in four places | — | unchanged; the Dados e IA pattern generalises |
| G13 — permission asked in the wrong place | — | unchanged, and still bounded by push failing on a real iPhone |
| G14 — two proofs never executed | `OD-2O-11` + `OD-2O-12` **B** | **both admitted.** The 21px target unconditionally; the screen-reader run non-blocking but **never promotable by documentation, emulation or inference** |

**All five opportunities survive the signatures.** Opportunity 1 — *the deletion
enumeration is an export in disguise* — is now the signed design rather than a
suggestion, and opportunity 4 — *onboarding can be entirely derived* — is
`OD-2O-3` **A**.

**One new non-opportunity, created by a signature.** `OD-2O-2` **A** must not
grow into a persisted preference by increments. A column for appearance is
`OD-2O-2` **B**, which was declined, and adding one would spend a migration the
owner did not authorize on a destination `R-2O-25` forbids.

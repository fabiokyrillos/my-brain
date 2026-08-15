# Phase 2O — Activation, preferences, and control (Implementation Plan)

**Authorization:** planning only, by **ADR-115**; **all twelve owner decisions
signed by ADR-116** (2026-08-15). **No slice below is authorized for
execution.** No migration may be created during planning. Signup does not open.
The roadmap successor is not started, scoped or named.

**What the signatures changed in this plan.** Every conditional migration
resolved to **none**: `OD-2O-3` **A** and `OD-2O-4` **A** each removed one, and
`OD-2O-2` **A** added a capability without adding a schema. Slice 2O.3 grows by
three requirements and half a week. Slices 2O.2, 2O.5 and 2O.7 are unblocked.
**M2 lost its only three destinations** and now closes unspent by construction.
And the estimate published with the unsigned package — *13–18 weeks* — **was an
arithmetic error against this plan's own table**; the table then summed to
13.5–19, and with 2O.3's growth it sums to **14–19.5**. Corrected below rather
than carried.

**Governing pair:** `PHASE_2O_PRD.md` and this document.
**Baseline:** `main` `9cc1175`, CI green on that exact SHA, 94 migrations, hosted
parity `202608140094` confirmed by a live read-only `migration list --linked`.
**Signup closed; the rollout gate re-read by running `npm run rollout:verify`
and standing at 25 pass · 3 fail · 2 owner-signature** — `RG-QUO-3`, `RG-DEP-1`
and `RG-DEP-3` failing, `RG-LEG-4` and `RG-DEP-4` unsigned. This plan does not
move any of them.

**116 requirements across sixteen families and nine slices.**

---

## 1. Sequencing, and why it is this order

The audit determined the order, not the roadmap.

1. **Nothing in this phase can be honest before `capabilityRegistry` is
   load-bearing.** Twelve `2O-PREF` requirements and six `2O-AICONFIG`
   requirements turn on the question *"does this preference have a consumer?"*,
   and today that question is answered by a literal nobody reads. 2O.0 goes
   first for that reason alone.
2. **Entry precedes onboarding.** A first conquest that starts at a login form
   for an unnamed product starts in the wrong place.
3. **The preferences centre precedes what it must contain.** The Dados e IA
   pattern is generalized once, in 2O.3, and 2O.4 through 2O.6 hang sections on
   it rather than each inventing a placement.
4. **Recovery is paired with notifications, not with mobile.** Both are about a
   state the user did not choose — a denied permission and a failed
   interpretation are the same design problem twice.
5. **Mobile and accessibility come after the surfaces exist**, because a
   contrast or target audit over pages that have not been written measures
   nothing.
6. **Closeout is last and carries the security, telemetry and readiness gates**,
   because each of them is an assertion about the whole phase.

**The roadmap's four slices become nine.** Etapa 6.1 splits into entry and
onboarding, 6.2 into foundations and the preferences centre, 6.3 into AI/cost and
privacy/consent, and 6.4 into mobile and a closeout that the roadmap did not
have.

---

## 2. Slices

### Slice 2O.0 — Foundations: the activation contract and a registry that means something

**Requirements:** `2O-ACTIVATION-001` … `-007` (7).
**Estimate:** 1–1.5 weeks.
**Migrations:** none, and none may be created.

**Delivers.** One typed module declaring activation as ordered, derived,
three-valued facts. `capabilityRegistry` rendered by at least one surface. A
guard that derives `consumerEvidence` from the tree and fails in both
directions. The nine consumer-less columns recorded with their state.

**Dependencies:** none.
**Risk:** a registry that renders everything is indistinguishable from a registry
that renders the right thing — the guard needs a planted divergence per
direction, not one.

**Done when:** the registry has a real consumer; a fabricated row fails the
build; a control with no row fails the build; the nine columns are asserted
absent from the interface and present in the payload.

---

### Slice 2O.1 — Entry: the product says what it is, and the closed door says so first

**Requirements:** `2O-ENTRY-001` … `-008` (8).
**Estimate:** 1–1.5 weeks.
**Migrations:** none.
**Blocked by:** `OD-2O-1`.

**Delivers.** A public entry page in both locales with four checkable claims and
no availability claim. Locale negotiation at the root. A register page that
states the closed door before the form, from the same predicate the action
reads. A route audit proving no entry surface is a dead end.

**Risk, named:** the uniform-refusal property. `SH-SIGNUP-001` exists because a
closed signup that answers differently for different inputs is a probe surface.
A standing statement is safe; anything conditional on input is not, and the
journey must prove it.

**Done when:** an unauthenticated visitor in `en` gets English; every claim on
the page is guard-checked against repository truth; the register page's
statement is proved input-independent.

---

### Slice 2O.2 — The first conquest

**Requirements:** `2O-ONBOARD-001` … `-011` (11).
**Estimate:** 2–3 weeks.
**Migrations:** **none.** `OD-2O-3` is signed **A**, so the conditional
allocation never existed.
**Blocked by:** nothing. **Depends on:** 2O.0, 2O.1.

**Delivers.** A guided, offered-never-imposed path rendered from the activation
facts: locale and timezone, assistant identity, AI configuration by mounting the
existing panel, a first capture that does not block, a first interpretation
reviewed through the existing confirmation surface, a first task, a first
memory. Resumable across sessions and devices. Dismissible and un-dismissible.

**Risk, named:** an onboarding that blocks the composer would contradict the one
interaction this product is built around. Every step must be skippable and the
composer reachable throughout — asserted, not intended.

**Second risk:** reimplementation. Four steps mount surfaces that already exist.
A guard asserts each writes through the existing Server Action and schema, and
that no second write path was created.

**Done when:** an account created mid-path and resumed on another device
continues where it stopped; an account with no credential sees the recovery, not
a step that cannot succeed.

---

### Slice 2O.3 — One preferences centre

**Requirements:** `2O-PREF-001` … `-015` (15).
**Estimate:** 2–2.5 weeks. *(Was 1.5–2; `OD-2O-2` **A** added the appearance
control and half a week at each end.)*
**Migrations:** none, and `OD-2O-2` **A** is the reason there is none.
**Blocked by:** nothing. **Depends on:** 2O.0.

**Delivers.** Ajustes reaching every preference in the product through the Dados
e IA pattern — a named section reaching a route that keeps its URL, filters and
deep links, wearing a strip with a way back. Controls for the three review-time
columns, honest about what they change. `planning_day` and `planning_time`
asserted absent. Every control backed by a verified registry row. Save feedback
in the user's words; a failed save that keeps input.

**And the appearance control** (`2O-PREF-013` … `-015`) — three states, held in
`localStorage`, applied before first paint, with an explicit choice beating
`prefers-color-scheme` **in both directions**. It finishes the half of ADR-114
Decision 3 that shipped its CSS and never shipped a control.

**Third risk, and it is the new one.** The stored appearance value reaches a DOM
attribute, and `localStorage` is writable by any script on the origin — so the
value is **attacker-controlled input** and must be validated against the closed
set of three before it is applied. The inline application script is possible
**without touching the CSP**: `next.config.ts` already carries `'unsafe-inline'`
in `script-src`, verified in the tree rather than assumed, and `csp.test.ts`'s
header shape must come out of this slice unchanged. If it cannot, the slice
stops — a CSP change is a deployment-boundary change and is not in this phase.

**Risk, named:** `AccountMenu` mounts in exactly two places and sign-out lives in
`Mais`. `mobile-reachability-guard.test.ts` must be re-derived in the same
change and must still fail in both directions.

**Second risk:** `/app/reviews`'s *"nada é executado por horário configurado"* is
guarded and must stay true. A control that implies scheduling breaks a guard,
which is the correct outcome.

**Done when:** every preference is reachable from one destination; no route was
redirected; no route ended; sign-out is still reachable on a phone.

---

### Slice 2O.4 — AI configuration, usage and cost

**Requirements:** `2O-AICONFIG-001` … `-009`, `2O-COST-001` … `-007` (16).
**Estimate:** 1.5–2 weeks.
**Migrations:** none.
**Depends on:** 2O.0, 2O.3.

**Delivers.** A plain statement of where AI is used, that the user's credential
performs it, and which operation routes to which model — read from the routing
in use. A disposition for `embedding_model`, and registry rows recording why
`background_model` and `reasoning_model` have no control. Credential storage
claims that are checkable. Removal consequences that match the drain's real
behaviour. Quota ceiling and headroom from the enforced configuration; a refusal
that names its ceiling and its reset; a profile choice that states what it
routes.

**Hard constraint:** no model call renders any of it, and no price is forecast.
Prices are provider facts recorded at call time.

**Done when:** every claim about the credential is verified against the BYOK
implementation; a failed cost read renders as a failed read and never as zero.

---

### Slice 2O.5 — Privacy, consent, and control of the data

**Requirements:** `2O-PRIVACY-001` … `-010`, `2O-CONSENT-001` … `-005` (15).
**Estimate:** 2–3 weeks. **The largest slice, and the one with the most risk.**
**Migrations:** **none.** `OD-2O-4` is signed **A** — synchronous, server-side,
over the deletion enumeration — so the job-and-artifact allocation never
existed. `OD-2O-5` **A** takes the cheap half: a signed-in indicator and a
global sign-out, and **no administrative device list**, so no service-role
authority is introduced on an authenticated path.
**Blocked by:** nothing. **Depends on:** 2O.3.

**Delivers.** One answer to *"what is stored about me"*, by category, derived
from the same enumeration the deletion path uses. Counts that respect the
sensitivity contract. Export, complete or refusing. Retention posture reachable.
Deletion reachable with every property intact. Session visibility and a global
sign-out. The consent record with versions and dates, and revocation where
consent is genuinely optional.

**Risk, named — this is the tenant-boundary slice.** The export reads across
every user-owned table, including four polymorphic relation tables whose
ownership is validated by trigger rather than by a foreign key. A definer
function would be the isolation, and a definer function is new authority.
`2O-SEC-003` is not a formality here.

**Second risk:** completeness. An archive presented as "your data" that silently
omits a table is worse than no archive. The enumeration must be shared with
deletion, and the sharing must be asserted, so the two cannot drift.

**Third risk, and it is now live rather than hypothetical:** scale. `OD-2O-4`
**A** is the synchronous option, so a large account can time out. If it does,
`2O-PRIVACY-004`'s *complete or refuse* cannot hold, and **the slice stops and
returns to the owner** rather than shipping a partial archive. ADR-116 Decision
7 says the same about authority: reusing the deletion **enumeration** does not
authorize reusing or creating a definer function, and if the export cannot be
made complete and tenant-safe without new authority, that is a stop condition.

**Done when:** the export is proved complete against the deletion enumeration;
proved to contain no other user's row, against a foreign row that exists; and
the request is auditable.

---

### Slice 2O.6 — Notifications at the moment of value, and recovery everywhere

**Requirements:** `2O-NOTIFY-001` … `-007`, `2O-RECOVER-001` … `-007` (14).
**Estimate:** 1.5–2 weeks.
**Migrations:** none.
**Depends on:** 2O.3.

**Delivers.** Notification preferences reached from the centre with the route
intact. The permission ask moved to a moment of demonstrated value. Consent,
permission and delivery kept as three separate facts. A denied browser
permission as a first-class state. Adoption of the seven universal states across
the ten pages and thirteen components that currently answer in their own words,
with each exception recorded and read by a guard. `interpreting` never rendered
as `loading`. A composer draft that survives navigation.

**Risk, named:** push **fails with HTTP 403 on a real iPhone** and has never run
on Android. Moving the ask earlier asks more people for a permission that may
not deliver. `2O-NOTIFY-006` forbids claiming delivery; the slice states the
fact and does not resolve it.

**Second risk:** an absence assertion passes on a page that never rendered.
`2O-RECOVER-007` requires a planted fixture marker on every state guard.

**Done when:** `<UniversalState/>` is the only renderer of a universal state, or
each exception has a recorded reason a test reads.

---

### Slice 2O.7 — Mobile activation and accessibility

**Requirements:** `2O-MOBILE-001` … `-005`, `2O-ACCESS-001` … `-006` (11).
**Estimate:** 1.5–2 weeks.
**Migrations:** none.
**Blocked by:** nothing. `OD-2O-11` **admits** the 21px target, so
`2O-MOBILE-003` is unconditional and this is the one place the phase changes a
surface it did not create. `OD-2O-12` is signed **B**, so the screen-reader run
**does not on its own block closeout** — and may never be promoted to a pass by
documentation, an emulator, an automated scan, or inference from one.
**Depends on:** 2O.1 … 2O.6.

**Delivers.** Every new or changed surface usable at 375px with 44px targets.
App installation explained where a user would look. Journeys on desktop and
mobile in both locales, with a planted divergence proving the mobile lane can
fail. Axe with no serious or critical violation in light and dark, with a
control proving the dark run is dark. Contrast verified on the rendered page.
**A real screen-reader session, executed and recorded.**

**Risk, named:** jsdom cannot see contrast, and a new tint can tip an inherited
colour below threshold. Only axe on the real page catches it.

**Second risk:** the four Playwright lanes that inline CSS by hand. A stylesheet
array that goes stale makes a contrast scan run over unstyled markup and pass.
`stylesheet-registry-guard.test.ts` exists for this and must be re-derived.

**Done when:** the screen-reader run is recorded with device, software and
version, and every finding is dispositioned — **or** it is recorded as **not
executed**, which closes `2O-ACCESS-006` `partial` with a destination and closes
nothing else. Under `OD-2O-12` **B** those are the only two outcomes; there is
no third in which it is treated as passing.

---

### Slice 2O.8 — Readiness, telemetry, security and closeout

**Requirements:** `2O-READY-001` … `-005`, `2O-METRICS-001` … `-005`,
`2O-SEC-001` … `-005`, `2O-CLOSE-001` … `-004` (19).
**Estimate:** 1.5–2 weeks.
**Migrations:** at most one — **M1**, and `OD-2O-8` **A** is signed, so the
remaining condition is the real one: a **real producer and a real consumer must
both ship**. If either does not, `2O-METRICS-001` … `-005` close
`not-built-by-rule` and M1 closes unspent. **M2 may not be spent here or
anywhere** — ADR-116 Decision 4 left it with no destination.
**Blocked by:** nothing. **Depends on:** all.

**Delivers.** The readiness dossier from `rollout:verify`'s real output, with
the three failing gates and two signatures restated as owner and operator work.
Activation telemetry, if and only if it is real, content-free, written through
`record_product_event`, with every copy of the vocabulary widened in one file.
The threat model executed. Every requirement classified from source. The matrix
generated. The successor re-audited and not started.

**Risk, named:** `product_events` has had **three** copies of its vocabulary,
and the writer's own list once froze while the check constraint moved. One
migration must update all three or the events are refused on the live project
and nobody finds out until a probe runs.

**Second risk:** a producer with no consumer is invisible. `2O-METRICS-002`
refuses to declare one.

**Third risk:** `service_role` can neither read nor delete `product_events`, so
residue must be proved owner-scoped. A global count proves nothing.

**Done when:** every requirement is classified; the counts are re-derived, not
typed; the successor is re-audited and A13 is **not** retargeted by this
closeout.

---

## 3. Estimates

| Slice | Subject | Requirements | Estimate |
|---|---|---:|---|
| 2O.0 | Foundations and the registry | 7 | 1–1.5 wk |
| 2O.1 | Entry and the closed door | 8 | 1–1.5 wk |
| 2O.2 | The first conquest | 11 | 2–3 wk |
| 2O.3 | One preferences centre, and the appearance control | 15 | 2–2.5 wk |
| 2O.4 | AI configuration, usage, cost | 16 | 1.5–2 wk |
| 2O.5 | Privacy, consent, data control | 15 | 2–3 wk |
| 2O.6 | Notifications and recovery | 14 | 1.5–2 wk |
| 2O.7 | Mobile and accessibility | 11 | 1.5–2 wk |
| 2O.8 | Readiness, telemetry, security, closeout | 19 | 1.5–2 wk |
| **Total** | | **116** | **14–19.5 weeks** |

**The published 13–18 was wrong, and it was wrong before the signatures.** The
table it claimed to total already summed to **13.5–19**; the figure was typed
rather than added. It is corrected here rather than carried, and the totals
above are now derived from the column beside them. Slice 2O.3's growth to
2–2.5 weeks — the appearance control `OD-2O-2` **A** signed — takes it to
**14–19.5**.

**The roadmap estimated 7–10 weeks for Etapa 6.** This plan estimates
**14–19.5**. The difference is not scope creep; it is four things the roadmap
did not know:

1. the universal-state adoption debt — 23 surfaces, discovered by this audit;
2. the export's tenant-boundary work over trigger-validated polymorphic tables;
3. making the capability registry load-bearing, which the roadmap treated as
   existing;
4. a real screen-reader session, which no phase has executed.

Re-estimate before implementation authorization, from a re-audit of the tree at
that time. This range is a planning estimate and not a delivery promise.

---

## 4. Migration budget — SIGNED by ADR-116, and one allocation is already dead

**2 allocated · obligation ZERO · 0 spent · none created · NON-TRANSFERABLE. A
third is a STOP CONDITION.**

| Allocation | Destination | State after the signatures |
|---|---|---|
| **M1** | activation telemetry vocabulary, slice 2O.8 | **live and conditional** — `OD-2O-8` **A** is signed, so the remaining condition is that a real producer **and** a real consumer both ship |
| **M2** | was: **exactly one** of persisted appearance (`OD-2O-2` **B**), stored onboarding progress (`OD-2O-3` **B**), or the export job and artifact (`OD-2O-4` **B**) | **NO REMAINING DESTINATION.** All three were signed **A**, and the budget is non-transferable, so **M2 closes unspent by construction** |

**M2 closing unspent is the expected close, not an omission**, and a reader who
sees "2 allocated" and hunts for a second spend should stop here. **Spending M2
at all is a STOP CONDITION**, because every destination it had is declined.

If `OD-2O-8`'s producer or consumer fails to materialise, **both** allocations
close unspent — also correct. An allocation may close unspent; **an unnecessary
spend is a defect**, and one created to avoid the appearance of an unspent
allocation is the worst version of that defect.

No allocation is transferable, and none of the Phase 2N remainders —
`2N-RELATION-TRIGGER`, `2N-IDENTITY-EXTRACTION`, `2N-FILES-WRITER` — may be paid
for out of either. `OD-2O-11` declined all three by name.

---

## 5. Acceptance criteria per slice

Every slice, without exception:

- zero lint errors, zero type errors, `npm test` green, `npm run build` green,
  `git diff --check` clean;
- unit and behavioural tests written **before** the behaviour;
- a guard for every claim the slice makes about an absence, each with a planted
  divergence proving it can fail;
- Playwright journeys on desktop and mobile, in **both** locales when copy or
  locale-affecting;
- `docs/STATE.md`, `docs/CHANGELOG.md` and `docs/TODO.md` updated in the slice's
  own commit; `docs/DECISIONS.md` when a decision is taken;
- an acceptance record under `docs/reports/phase-2o/`.

**Proof obligations that are not satisfied by unit tests:**

| Proof | Where required | Why it cannot be simulated |
|---|---|---|
| Browser, authenticated, against `next start` | 2O.1 – 2O.7 | the RSC boundary is only tested in production; two surfaces have shipped green and never rendered |
| Hosted, against the deployed project | 2O.4, 2O.5, 2O.8 | quota configuration, the cost RPC and the event vocabulary are hosted facts |
| Real device, iOS and Android | 2O.7 | a mobile emulator does not prove a touch target, and push has never run on Android |
| Real screen reader | 2O.7, `2O-ACCESS-006` | axe finds what axe finds; a screen reader finds what a person hears. Under `OD-2O-12` **B** this does not alone block closeout — and it may **never** be promoted to a pass by documentation, an emulator, an automated scan, or inference from one. Executed and recorded, or recorded as not executed. There is no third outcome |

---

## 6. Telemetry strategy

Declared only if all three hold: a **real question** written down before any
event name; a **real producer** on a shipped surface; a **real consumer** that
reads through its own code path and is **executed** before measurement is
claimed.

The questions this phase would ask, written first:

1. How far along the activation list do new accounts get, and where do they
   stop?
2. Is the guided path dismissed before or after the first capture?
3. Does an account that configures a credential during the path capture more
   than one that configures it later?
4. Which universal state is reached most often on a first session?

Every event content-free. No entry text, no title, no name, no note, no file
name, no user-chosen date. Written only through `record_product_event`. One
migration widening **all three copies** of the vocabulary in the same file.

**`OD-2O-8` is signed A**, so the funnel is in scope — conditionally. **If no
real producer or no real consumer ships, no event is declared, `2O-METRICS-001`
… `-005` close `not-built-by-rule`, and M1 closes unspent.** That is a correct
close, not a shortfall, and it is the outcome the condition exists to permit.

---

## 7. Stop conditions

As in `PHASE_2O_PRD.md` §6. Restated here because a plan that does not carry its
own stop conditions is a plan that will not stop:

a third migration — **or M2 being spent at all**, since it has no signed
destination · signup, the rollout gate, a secret or `config.toml` · **a CSP
change** · new authority for `authenticated` or an unsigned definer function,
including one wanted for the export · a telemetry event with no consumer · a
control for a preference with no consumer · an export that cannot be complete ·
a model call to render a surface · reversing a signed decision from a previous
phase **or one of ADR-116's twelve** · `2O-ACCESS-006` closing `built` without a
recorded execution naming device, software and version.

---

## 8. Preconditions before implementation may be authorized

1. ~~All twelve owner decisions signed~~ — **DONE, ADR-116, 2026-08-15.**
2. ~~A migration budget signed~~ — **DONE, `OD-2O-9`**: 2 allocated, obligation
   zero, non-transferable, M2 already without a destination.
3. **STILL REQUIRED — a re-audit of the tree at the authorization baseline**,
   because the baseline moves. It moved during Phase 2M's review and every
   finding had to be re-executed; it moved again between Phase 2N's close and
   this package, by 138 files.
4. **STILL REQUIRED —** CI green on the exact merge SHA of the authorizing
   commit.
5. **STILL REQUIRED —** hosted parity confirmed by a live
   `migration list --linked`, not from a document.
6. **STILL REQUIRED —** an explicit owner authorization to implement. **ADR-116
   signed the decisions and authorized no implementation**; the two are separate
   acts, as they were at ADR-108/ADR-112 and ADR-104/ADR-105.

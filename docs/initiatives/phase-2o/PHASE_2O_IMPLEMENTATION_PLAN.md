# Phase 2O — Activation, preferences, and control (Implementation Plan)

**Authorization:** planning only, by **ADR-115**. **No slice below is authorized
for execution.** No migration may be created during planning. Signup does not
open. The roadmap successor is not started, scoped or named.

**Governing pair:** `PHASE_2O_PRD.md` and this document.
**Baseline:** `main` `9cc1175`, CI green on that exact SHA, 94 migrations, hosted
parity `202608140094` confirmed by a live read-only `migration list --linked`.
**Signup closed; the rollout gate re-read by running `npm run rollout:verify`
and standing at 25 pass · 3 fail · 2 owner-signature** — `RG-QUO-3`, `RG-DEP-1`
and `RG-DEP-3` failing, `RG-LEG-4` and `RG-DEP-4` unsigned. This plan does not
move any of them.

**113 requirements across sixteen families and nine slices.**

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
**Migrations:** none under `OD-2O-3` **A**; one under **B**.
**Blocked by:** `OD-2O-3`. **Depends on:** 2O.0, 2O.1.

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

**Requirements:** `2O-PREF-001` … `-012` (12).
**Estimate:** 1.5–2 weeks.
**Migrations:** none.
**Blocked by:** `OD-2O-6`. **Depends on:** 2O.0.

**Delivers.** Ajustes reaching every preference in the product through the Dados
e IA pattern — a named section reaching a route that keeps its URL, filters and
deep links, wearing a strip with a way back. Controls for the three review-time
columns, honest about what they change. `planning_day` and `planning_time`
asserted absent. Every control backed by a verified registry row. Save feedback
in the user's words; a failed save that keeps input.

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
**Migrations:** none under `OD-2O-4` **A**; one under **B**.
**Blocked by:** `OD-2O-4`, `OD-2O-5`. **Depends on:** 2O.3.

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

**Third risk:** scale. A synchronous export can time out. If it can, `OD-2O-4`
**A** fails its own requirement and the slice stops rather than shipping a
partial.

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
**Blocked by:** `OD-2O-11` (for `2O-MOBILE-003`), `OD-2O-12` (for
`2O-ACCESS-006`). **Depends on:** 2O.1 … 2O.6.

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
version, and every finding is dispositioned.

---

### Slice 2O.8 — Readiness, telemetry, security and closeout

**Requirements:** `2O-READY-001` … `-005`, `2O-METRICS-001` … `-005`,
`2O-SEC-001` … `-005`, `2O-CLOSE-001` … `-004` (19).
**Estimate:** 1.5–2 weeks.
**Migrations:** at most one — M1, and only if `OD-2O-8` **A** is signed **and**
a real producer and a real consumer both ship.
**Blocked by:** `OD-2O-8`, `OD-2O-9`, `OD-2O-10`. **Depends on:** all.

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
| 2O.3 | One preferences centre | 12 | 1.5–2 wk |
| 2O.4 | AI configuration, usage, cost | 16 | 1.5–2 wk |
| 2O.5 | Privacy, consent, data control | 15 | 2–3 wk |
| 2O.6 | Notifications and recovery | 14 | 1.5–2 wk |
| 2O.7 | Mobile and accessibility | 11 | 1.5–2 wk |
| 2O.8 | Readiness, telemetry, security, closeout | 19 | 1.5–2 wk |
| **Total** | | **113** | **13–18 weeks** |

**The roadmap estimated 7–10 weeks for Etapa 6.** This plan estimates **13–18**.
The difference is not scope creep; it is four things the roadmap did not know:

1. the universal-state adoption debt — 23 surfaces, discovered by this audit;
2. the export's tenant-boundary work over trigger-validated polymorphic tables;
3. making the capability registry load-bearing, which the roadmap treated as
   existing;
4. a real screen-reader session, which no phase has executed.

Re-estimate before implementation authorization, from a re-audit of the tree at
that time. This range is a planning estimate and not a delivery promise.

---

## 4. Migration budget — proposed, unsigned

**2 allocated · obligation ZERO · NON-TRANSFERABLE. A third is a STOP
CONDITION.** Zero created by this planning package.

| Allocation | Destination | Condition |
|---|---|---|
| **M1** | activation telemetry vocabulary, slice 2O.8 | only if `OD-2O-8` **A** and a real producer **and** a real consumer ship |
| **M2** | **exactly one** of: persisted appearance (`OD-2O-2` **B**), stored onboarding progress (`OD-2O-3` **B**), or the export job and artifact (`OD-2O-4` **B**) | whichever single option the owner signs |

An allocation may close unspent, and closing unspent is a **correct** outcome.
An unnecessary spend is a defect. No allocation is transferable to another
destination, and none of the Phase 2N remainders — `2N-RELATION-TRIGGER`,
`2N-IDENTITY-EXTRACTION`, `2N-FILES-WRITER` — may be paid for out of either.

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
| Real screen reader | 2O.7, `2O-ACCESS-006` | axe finds what axe finds; a screen reader finds what a person hears |

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

**If `OD-2O-8` is signed B or C, no event is declared and `2O-METRICS-001` …
`-005` close `not-built-by-rule`.** That is a correct close, not a shortfall.

---

## 7. Stop conditions

As in `PHASE_2O_PRD.md` §6. Restated here because a plan that does not carry its
own stop conditions is a plan that will not stop:

a third migration · signup, the rollout gate, a secret or `config.toml` · new
authority for `authenticated` or an unsigned definer function · a telemetry event
with no consumer · a control for a preference with no consumer · an export that
cannot be complete · a model call to render a surface · reversing a signed
decision from a previous phase.

---

## 8. Preconditions before implementation may be authorized

1. All twelve owner decisions signed, or explicitly deferred with their
   requirements marked.
2. A re-audit of the tree at the authorization baseline, because the baseline
   moves — it moved during Phase 2M's review and every finding had to be
   re-executed.
3. A migration budget signed.
4. CI green on the exact merge SHA of the authorizing commit.
5. Hosted parity confirmed by a live `migration list --linked`, not from a
   document.

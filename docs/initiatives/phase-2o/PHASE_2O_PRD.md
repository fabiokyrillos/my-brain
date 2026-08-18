# Phase 2O — Activation, preferences, and control (PRD)

**Authorization:** planning by **ADR-115**; **all twelve owner decisions signed
by ADR-116** and the one flagged interpretation confirmed by **ADR-117**
(2026-08-15). **Implementation is authorized through closeout by ADR-118**
(2026-08-15), slice by slice in the planned order, each re-audited against the
`main` the previous one produced.

**What that authorization does not carry.** No third migration and no spend of
**M2**, which has no destination. Signup does not open and the rollout gate does
not move. The CSP does not change, `embedding_model` is not touched, and no
declined residual is absorbed. No successor phase is started, scoped or named by
this document.

**What ADR-116 changed, stated once here so no reader has to diff two ADRs.**
Every decision took its recommendation. Three requirements were **appended** —
`2O-PREF-013` … `-015`, for the appearance control `OD-2O-2` **A** signed and
this PRD carried no requirement for — and **nothing was renumbered, reused or
deleted**. Four requirements are **restated in place**, each carrying an
`ADR-116` marker: `2O-ACTIVATION-002`, `2O-AICONFIG-004`, `2O-MOBILE-003` and
`2O-ACCESS-006`. **The second migration allocation has no remaining
destination** and closes unspent by construction. The total moves **113 → 116**.

**Parent scope:** Etapa 6 of `docs/initiatives/product-ux/MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md`,
**as corrected by** `docs/reports/phase-2o/PHASE_2O_CURRENT_EXPERIENCE_AUDIT.md`
§8. Where the roadmap and the tree disagree, the tree governs.

**Baseline:** `main` `9cc1175`, CI `success` on that SHA, 94 migrations, hosted
parity `202608140094`, signup closed, rollout gate **25 · 3 · 2**.

**Governing pair:** this document and
`docs/initiatives/phase-2o/PHASE_2O_IMPLEMENTATION_PLAN.md`.
**Evidence:** `docs/reports/phase-2o/` — audit, gaps, threat model, traceability
contract.

**116 requirements across sixteen families and nine slices.** Nothing is
implemented.

---

## 1. What this phase is for

A person who has never seen this product should be able to understand it, reach
a result that is actually useful, configure the Brain without getting lost,
understand and control how it is personalized, understand how AI is used and
what it costs, control their privacy and their data, revise any of it later,
recover from a setup they left half-finished, and do all of that on a phone with
a screen reader.

**What it is not for.** It does not open public signup. It does not build agent
autonomy. It does not add a provider, a push scope, a search index or a retrieval
path. It does not redesign a surface the Papel e Console redesign just shipped.

---

## 2. The three rules this phase inherits and may not weaken

- **`R-24`** — *the settings surface never offers a control that changes
  nothing.* Enforced by `phase-2m-inert-preferences-guard.test.ts`. A new
  control requires a proved consumer, in the same change.
- **Fail-closed classification** — content whose classification derives from a
  source record is masked by default; absence of classification never resolves
  to `normal` (ADR-110).
- **No model call to render a page** — refused at `2K-SUGG-001`, and it binds
  every cost, quota and onboarding surface here.

---

## 3. Requirements

### 3.1 `2O-ACTIVATION` — foundations and the contracts the rest consumes (7)

- **2O-ACTIVATION-001:** The phase declares, in one typed module, what
  *activation* means for this product as an ordered list of observable facts
  about an account — locale and timezone set, an AI credential present, an entry
  captured, an interpretation reviewed, a task confirmed. The list is data, not
  prose, and every consumer reads it from that module.
- **2O-ACTIVATION-002:** *(restated in place by **ADR-116**; the conditional is
  resolved and nothing is renumbered.)* Each activation fact is **derived from
  existing data** and holds no state of its own. `OD-2O-3` is signed **A**, so
  the prohibition is now **absolute**: no requirement in this phase may
  introduce a stored onboarding step, cursor or flag, and there is no branch
  under which one becomes permitted. *Superseded text: "…unless `OD-2O-3` is
  signed **B**."*
- **2O-ACTIVATION-003:** Each activation fact is **three-valued** — satisfied,
  not satisfied, or *unreadable* — and a read that failed is never rendered as a
  fact that is false. The distinction is asserted in both directions.
- **2O-ACTIVATION-004:** `capabilityRegistry` becomes load-bearing: at least one
  product surface renders from it, so a stale row changes what a user sees
  rather than nothing.
- **2O-ACTIVATION-005:** A guard derives each registry row's `consumerEvidence`
  from the tree and fails when a row claims a consumer that does not exist, or
  when a rendered control has no row. The guard carries a planted-divergence
  control in both directions.
- **2O-ACTIVATION-006:** The `scheduled_reviews` registry row is disambiguated
  in the same change that makes the registry load-bearing, so that *"no review
  runs by schedule"* and *"the scheduling preference has no consumer"* can no
  longer both be read off one row. The row's final wording is fixed by
  `2O-PREF-004`'s outcome.
- **2O-ACTIVATION-007:** The nine preference columns with no behavioural
  consumer — `privacy_preferences`, `quiet_periods`, `avatar_path`,
  `autonomy_level`, `follow_up_intensity`, `privacy_default`, `background_model`,
  `reasoning_model`, `ai_provider` — are recorded with their state in the
  registry, **offered no control**, and asserted absent from the preferences
  interface. The columns are not dropped and the settings payload keeps carrying
  them, so no save wipes a value.

### 3.2 `2O-ENTRY` — arriving at the product (8)

- **2O-ENTRY-001:** An unauthenticated visitor reaching `/` is offered a page
  that says what the product is, in their locale, before any form.
  `src/app/page.tsx`'s unconditional `redirect("/pt-BR/app")` is replaced by
  locale negotiation with `pt-BR` as the fallback, not as the answer.
- **2O-ENTRY-002:** That page states four things and no more: what capture does,
  that the user's words are stored before any model runs, that the user supplies
  their own AI credential, and where the privacy and terms documents are. Every
  claim is one a guard can check against repository truth.
- **2O-ENTRY-003:** The entry page makes **no claim about availability**. While
  signup is closed it does not invite registration, and it does not imply a
  waiting list that does not exist.
- **2O-ENTRY-004:** An authenticated visitor reaching `/` still arrives in the
  application, in their own stored locale, with no extra navigation step.
- **2O-ENTRY-005:** The register page states that signup is closed **before**
  asking for a name, an e-mail, a password or a consent, reading the same
  `isSignupOpenIn` predicate the action reads.
- **2O-ENTRY-006:** That statement is a standing fact and does not vary with
  input, so the closed door remains uniform and is not a probe surface.
  `SH-SIGNUP-001`'s property is re-asserted, not replaced.
- **2O-ENTRY-007:** Every authenticated surface reachable without a session
  redirects to login and returns the user to the surface they asked for after
  signing in.
- **2O-ENTRY-008:** No surface in the entry path is a dead end: login, register,
  recover, reset, resend, consent and the account-state page each offer at least
  one forward path and one way back, and a route audit asserts it.

### 3.3 `2O-ONBOARD` — the first conquest (11)

- **2O-ONBOARD-001:** After a first sign-in, the product offers a guided path to
  a first useful result. The path is **offered, never imposed**: the composer
  and every existing destination stay reachable throughout.
- **2O-ONBOARD-002:** The guided path is rendered from `2O-ACTIVATION-001`'s
  ordered facts, so what it shows and what is true about the account cannot
  disagree.
- **2O-ONBOARD-003:** The path asks for locale and timezone at the point they
  first change something the user can see, and never asks again once set.
- **2O-ONBOARD-004:** The path asks for an assistant name and offers the
  personality and tone the settings form already exposes, writing through the
  same Server Action and the same schema — no second write path.
- **2O-ONBOARD-005:** The path offers AI configuration by mounting the existing
  credential panel, not by reimplementing it.
- **2O-ONBOARD-006:** The path invites a first capture, states what will happen
  to it, and returns immediately — it never blocks on interpretation, because
  capture does not.
- **2O-ONBOARD-007:** When the first interpretation completes, the path presents
  it for review using the existing selective-confirmation surface, and explains
  that nothing was created without the user's act.
- **2O-ONBOARD-008:** Confirming a first task and creating a first memory are
  each a step, each optional, and each reached through the existing paths.
- **2O-ONBOARD-009:** The path is **resumable at any point**, including across
  sessions and devices, because its state is derived. An interrupted onboarding
  is indistinguishable from a paused one.
- **2O-ONBOARD-010:** The path can be dismissed, and dismissal is reversible
  from the preferences centre. A dismissed path never reappears on its own.
- **2O-ONBOARD-011:** The path never claims a capability the account does not
  have. With no credential, it says so and offers the recovery
  `awaiting_ai_configuration` already provides, rather than showing a step that
  cannot succeed.

### 3.4 `2O-PREF` — one preferences centre (12)

- **2O-PREF-001:** There is one destination from which every preference in the
  product is reachable, and it is Ajustes.
- **2O-PREF-002:** Notifications, account deletion and the consent record are
  reached from that destination using the **Dados e IA pattern** — a named
  section that reaches a route which keeps its own URL, filters and deep links,
  and wears a strip with a way back. **No route is redirected and no route
  ends.**
- **2O-PREF-003:** Consolidation does not orphan sign-out. `AccountMenu`'s two
  mount points and `mobile-reachability-guard.test.ts`'s census are re-derived
  in the same change, and the guard still fails in both directions.
- **2O-PREF-004:** `daily_review_time`, `weekly_review_time` and
  `weekly_review_day` gain controls, because all three have a proved consumer.
- **2O-PREF-005:** Those controls state what they change — **when the reviews
  surface says the day is ready to be closed** — and do not imply execution.
- **2O-PREF-006:** `/app/reviews`'s sentence *"nada é executado por horário
  configurado"* / *"nothing runs from a configured schedule"* stays true and
  stays asserted in both locales. If any review ever becomes scheduled, the copy
  is corrected in the same change; this phase does not schedule anything.
- **2O-PREF-007:** `planning_day` and `planning_time` gain **no** control, no
  label and no field. `2M-AUDIT-005` retired them and this phase does not
  reverse a signed outcome.
- **2O-PREF-008:** Every control in the centre is backed by a
  `capabilityRegistry` row whose `consumerEvidence` the guard verifies against
  the tree. `R-24` becomes a build failure rather than a convention.
- **2O-PREF-009:** Advanced preferences are disclosed rather than hidden: a
  reader can reach every one of them, and none is the default view.
- **2O-PREF-010:** Saving any preference states what changed and what will now
  behave differently, in the user's own words, not as a field list.
- **2O-PREF-011:** A save that fails says so, keeps the user's input, and offers
  a retry. A partially applied save is impossible: the payload is written once.
- **2O-PREF-012:** Every preference is revisable at any time with the same
  control that set it, and nothing in this phase creates a one-way choice.
- **2O-PREF-013:** *(appended by **ADR-116**, which signed `OD-2O-2` **A**.)*
  The preferences centre offers an **appearance choice** with exactly three
  states — follow the machine, light, dark — finishing the half of ADR-114
  Decision 3 that shipped its CSS and never shipped a control.
- **2O-PREF-014:** The choice is held **client-side only**, in `localStorage`,
  and is applied **before first paint** so no flash occurs. **No column, no
  migration, and no change to the CSP header** — the inline application script
  is possible because `script-src` already carries `'unsafe-inline'`, and
  `csp.test.ts`'s header shape is unchanged. The stored value is **validated
  against the closed set of three** before it reaches any DOM attribute, because
  `localStorage` is writable by any script on the origin and an unvalidated
  value would be attacker-controlled input.
- **2O-PREF-015:** An explicit choice **beats `prefers-color-scheme` in both
  directions**, and the guard proves it in both — light chosen on a dark
  machine, and dark chosen on a light one. No surface describes the preference
  as an account setting: **it does not follow the account across devices**, and
  that is the stated cost of spending no migration.

### 3.5 `2O-AICONFIG` — understanding and controlling the AI (9)

- **2O-AICONFIG-001:** The preferences centre states, in plain language, where
  AI is used in this product: interpretation of entries, chat answers, file
  analysis, review generation and embeddings.
- **2O-AICONFIG-002:** It states that the user's own credential performs those
  calls, and that removing it stops them.
- **2O-AICONFIG-003:** It states which operations are routed to which model,
  reading the routing the product actually uses rather than a second list.
- **2O-AICONFIG-004:** *(restated in place a second time by **ADR-117**;
  nothing is renumbered.)* `embedding_model` has six behavioural consumers and
  no control. `OD-2O-6` **A** signed controls **only** for the three review
  preferences, and **ADR-117 confirms that the word *only* reaches
  `embedding_model` too** — so it gains a **capability-registry row and no
  control**. The row records the true thing: **real consumers, no authorized
  control** — never "no consumer", which would be false, and never "inert",
  which it is not. **And the column itself may not be removed, altered,
  renamed, re-defaulted or migrated** to satisfy this: the absence of a control
  is not a licence to tidy the schema. *Superseded text, first form: "It either
  gains a control in this phase or gains a registry row recording why not."
  Second form, under ADR-116: "This is an interpretation the agent took, not a
  signature the owner gave" — true when written, and settled by ADR-117.*
- **2O-AICONFIG-005:** `background_model` and `reasoning_model` gain no control
  while they have no consumer, and their registry rows say so.
- **2O-AICONFIG-006:** The credential surface states what is stored — that the
  key is encrypted at rest, never returned to the browser, and never logged —
  and every clause is checkable against the BYOK implementation.
- **2O-AICONFIG-007:** Removing a credential states its consequences before the
  act, including what happens to entries already captured, and the statement
  matches the credential-aware drain's real behaviour.
- **2O-AICONFIG-008:** An account with no credential is told so wherever an AI
  capability is offered, with one path to fix it, and never by a failure.
- **2O-AICONFIG-009:** No surface in this family makes a model call to render
  itself.

### 3.6 `2O-COST` — cost and limits, before and after (7)

- **2O-COST-001:** Custos states what has been spent, by operation and by model,
  from the existing `get_ai_cost_summary` over `ai_usage_events`. This ships
  today and is re-asserted rather than rebuilt.
- **2O-COST-002:** The product states the quota ceiling that applies to the
  account and how much of it is used, read from the enforced quota
  configuration, not from a copy.
- **2O-COST-003:** A refusal caused by a quota says so, names the ceiling, and
  says when it resets.
- **2O-COST-004:** Choosing a cost-and-quality profile states what that choice
  routes where, before it is saved.
- **2O-COST-005:** No surface predicts a price for a specific future operation.
  Prices are provider facts recorded at call time; a forecast would be an
  invention.
- **2O-COST-006:** Every figure shown carries the period it covers and the zone
  that period was computed in, through the one local-day contract.
- **2O-COST-007:** A cost read that fails renders as a failed read, never as
  zero.

### 3.7 `2O-PRIVACY` — control of the data (10)

- **2O-PRIVACY-001:** One surface answers *"what is stored about me"*, by
  category, with a count per category and a link to the surface that shows it.
- **2O-PRIVACY-002:** That surface derives its categories from the **same
  enumeration the deletion path uses**, so the two cannot disagree about what a
  user owns.
- **2O-PRIVACY-003:** Counts respect the sensitivity contract: a category may
  state how many rows exist without revealing content, and `ProtectedContent`
  governs anything rendered beyond a count.
- **2O-PRIVACY-004:** The user can export their own data. The export is
  complete over the enumeration in `2O-PRIVACY-002` or it refuses; a partial
  archive is never presented as the whole.
- **2O-PRIVACY-005:** The export contains no other user's data, and its
  generation is proved to run entirely under the requesting user's authority.
- **2O-PRIVACY-006:** The export states its own scope and generation time, and
  the record of the request is auditable.
- **2O-PRIVACY-007:** The retention posture the product already publishes is
  reachable from the preferences centre, and the copy stays generated from
  repository truth and honesty-gated. **This phase does not schedule a sweep.**
- **2O-PRIVACY-008:** Account deletion is reachable from the preferences centre
  and keeps every property it has: confirmation, CAPTCHA, transactionality, the
  recovery window and the reaper.
- **2O-PRIVACY-009:** The user can see that they are signed in and can end
  every session at once.
- **2O-PRIVACY-010:** No surface in this family infers a privacy preference
  from behaviour, and none resolves an absent classification to `normal`.

### 3.8 `2O-CONSENT` — what was agreed, and when (5)

- **2O-CONSENT-001:** The preferences centre shows which policy documents the
  account has accepted, at which version, and when.
- **2O-CONSENT-002:** It reads `policy_acceptances` and the repository's own
  version contract; it does not restate a version in a second place.
- **2O-CONSENT-003:** The current text of each accepted document is reachable in
  one step, in both locales.
- **2O-CONSENT-004:** Where a consent is genuinely optional — notification
  consent is the only one today — it is presented as revocable, and revoking it
  is honoured by the mechanism that reads it.
- **2O-CONSENT-005:** No consent in this phase is implied by use, pre-ticked, or
  bundled with another.

### 3.9 `2O-NOTIFY` — permission at the moment of value (7)

- **2O-NOTIFY-001:** Notification preferences are reached from the preferences
  centre while `/app/notifications` keeps its URL and its list.
- **2O-NOTIFY-002:** Permission is requested at a moment when the user has just
  seen why it is useful, and never on first arrival.
- **2O-NOTIFY-003:** The ask states what will be sent, that payloads carry no
  content, and how to stop.
- **2O-NOTIFY-004:** A denied browser permission is a first-class state with its
  own recovery text, distinct from "not yet asked" and from "consented but
  undelivered".
- **2O-NOTIFY-005:** Quiet hours and the daily cap are stated where consent is
  given, because they are what makes the consent bounded — and the surface
  states **explicitly that no override exists**: quiet hours always wins, the
  daily cap continues to apply, and **no type, priority or urgency passes
  either**. *(Corrected in place by ADR-120. Slice 2O.6 went looking for the
  third bound and found no object: `decideDelivery` refuses inside quiet hours
  with no exemption for type, priority or urgency, and the words `important`,
  `priority` and `urgent` appear nowhere in the governance module. The owner
  decided the product's rule is correct and the requirement was the artifact
  that was wrong. The identifier is unchanged and is not renumbered.)*
  *Superseded text: "Quiet hours, the daily cap and the important-reminder
  override are stated where consent is given, because they are what makes the
  consent bounded."*
- **2O-NOTIFY-006:** No surface claims a notification was delivered. Push is
  implemented and hosted, **fails with HTTP 403 on a real iPhone**, and has
  never been executed on Android; that is stated where it matters and is not
  resolved by this phase.
- **2O-NOTIFY-007:** Consent, permission and delivery are three separate facts
  and are never collapsed into one indicator.

### 3.10 `2O-RECOVER` — getting unstuck (7)

- **2O-RECOVER-001:** Every one of the seven universal states —`empty`,
  `loading`, `interpreting`, `interpretation_failed`, `error_recoverable`,
  `error_terminal`, `offline` — is rendered through
  `features/experience/universal-state.tsx` wherever it is rendered at all.
- **2O-RECOVER-002:** The ten app pages and thirteen feature components that
  carry their own state copy are converted, or each exception is recorded with a
  reason a guard reads.
- **2O-RECOVER-003:** Every error state offers at least one action, and
  `error_terminal` offers a way to leave rather than a way to retry.
- **2O-RECOVER-004:** `interpreting` is never rendered as `loading`, because the
  user's words are already durable and a spinner would say otherwise.
- **2O-RECOVER-005:** An incomplete configuration is recoverable from wherever
  it blocks something, following the shape `awaiting_ai_configuration` already
  set: a named state, a count, a message and one action.
- **2O-RECOVER-006:** A draft in the composer survives navigation within the
  session and says so.
- **2O-RECOVER-007:** The guard for this family plants a fixture marker, so an
  absence assertion cannot pass on a page that never rendered.

### 3.11 `2O-MOBILE` — activation on a phone (5)

- **2O-MOBILE-001:** Every surface this phase creates or changes is usable at
  375px without horizontal scroll.
- **2O-MOBILE-002:** Every interactive target this phase creates or changes is
  at least 44×44 CSS pixels.
- **2O-MOBILE-003:** *(restated in place by **ADR-116**; the condition is
  resolved and nothing is renumbered.)* `OD-2O-11` **admits it**, so the 21px
  target at `online-memories.spec.ts:85` **is fixed** — unconditionally, and
  this is the one place the phase changes a surface it did not create.
  *Superseded text: "…if and only if `OD-2O-11` admits it; otherwise it stays a
  named residual."*
- **2O-MOBILE-004:** Installing the product as an app is explained where a user
  would look for it, using the service worker and PWA support that already ship.
- **2O-MOBILE-005:** Journeys run on desktop and on a mobile project in both
  locales, and the mobile lane can fail: a planted divergence is asserted.

### 3.12 `2O-ACCESS` — accessibility (6)

- **2O-ACCESS-001:** Every surface this phase creates or changes passes axe with
  no serious or critical violation, in light and in dark, with a control
  proving the dark run really is dark.
- **2O-ACCESS-002:** Every control has an accessible name, a visible focus
  indicator, and a keyboard path.
- **2O-ACCESS-003:** No meaning is carried by colour alone; every tone keeps its
  icon and its text affordance.
- **2O-ACCESS-004:** Any strip of links this phase adds uses `aria-current`
  rather than `role="tablist"`, because these navigate to documents.
- **2O-ACCESS-005:** Contrast is verified on the rendered page rather than in
  jsdom, because jsdom cannot see contrast and a new tint can tip an inherited
  colour below threshold.
- **2O-ACCESS-006:** *(restated in place by **ADR-116** Decision 3; nothing is
  renumbered.)* **A real screen-reader session is executed against the surfaces
  this phase ships**, recorded with device, software and version, and its
  findings dispositioned — discharging the residual open since `2L-ACCESS-008`.
  `OD-2O-12` is signed **B**, so this requirement **does not on its own block
  closeout**, and the price of that is an absolute prohibition: it may close
  **`built` only on a recorded execution**. It may **never** be promoted to a
  pass by documentation, by an emulator, by an automated accessibility scan, or
  by inference from one. Absent a run it closes **`partial`**, with the
  remainder stated and a destination — never `built`, and never quietly absent.
  *Superseded text: "…subject to `OD-2O-12`."*

### 3.13 `2O-READY` — readiness for a public opening that this phase does not perform (5)

- **2O-READY-001:** The phase produces a readiness dossier stating, per rollout
  gate, what is satisfied, what is not, and who must act.
- **2O-READY-002:** The dossier reads `npm run rollout:verify`'s real output and
  does not restate it from memory.
- **2O-READY-003:** **This phase does not open signup**, does not alter the
  rollout gate, does not change `config.toml`, and does not modify a secret.
- **2O-READY-004:** `RG-DEP-1`, `RG-DEP-3`, `RG-QUO-3`, `RG-LEG-4` and
  `RG-DEP-4` are restated as owner or operator work with their current state and
  are **not** closed by writing a file.
- **2O-READY-005:** A retention sweep schedule, if ever armed, is armed by an
  operator script and never by a migration. Scheduling is authorization.

### 3.14 `2O-METRICS` — content-free measurement, only if it is real (5)

- **2O-METRICS-001:** The phase writes down the questions it wants answered
  about activation **before** any event name is chosen, and each declared event
  answers a named question.
- **2O-METRICS-002:** An event is declared only if it has a **real producer** on
  a shipped surface and a **real consumer** that reads through its own code
  path. A producer with no consumer is invisible and is not declared.
- **2O-METRICS-003:** Every event is content-free: no entry text, no title, no
  name, no note, no file name, no date the user chose.
- **2O-METRICS-004:** Events are written only through `record_product_event`,
  and the vocabulary is widened in **one** migration that updates every copy of
  the vocabulary in the same file — the check constraint, the validator and the
  writer's own list.
- **2O-METRICS-005:** The consumer is executed against the deployed project
  before the phase claims measurement, and residue is proved owner-scoped
  because `service_role` can neither read nor delete `product_events`.

### 3.15 `2O-SEC` — the security posture of the new surfaces (5)

- **2O-SEC-001:** Every new read is RLS-scoped to the requesting user and proved
  against a foreign row that exists.
- **2O-SEC-002:** No new surface grants `authenticated` any authority it does
  not already hold, and no new `SECURITY DEFINER` function is created without an
  explicit owner decision.
- **2O-SEC-003:** The export path is proved not to cross a tenant boundary,
  including for polymorphic relations whose ownership is trigger-validated.
- **2O-SEC-004:** Every automatic action this phase adds is auditable — actor,
  source, reason, target, time, resulting state — and every reversible one has a
  tested undo.
- **2O-SEC-005:** The threat model in `docs/reports/phase-2o/PHASE_2O_THREAT_MODEL.md`
  is executed, and every threat is closed, mitigated with evidence, or carried
  with a named destination.

### 3.16 `2O-CLOSE` — closing honestly (4)

- **2O-CLOSE-001:** Every one of the 116 requirements is classified from source
  as `built`, `baseline`, `partial`, `not-built-by-rule` or `undelivered`, and a
  `partial` with a vacuous remainder is refused by the generator.
- **2O-CLOSE-002:** The traceability matrix is generated, never typed, and the
  counts in `STATE.md`, `TODO.md` and `CHANGELOG.md` are re-derived from it.
- **2O-CLOSE-003:** An allocation that closes unspent is a correct outcome and
  an unnecessary spend is a defect. The budget is reported as allocated versus
  spent, with the slice that spent each.
- **2O-CLOSE-004:** The successor is re-audited against the tree the phase
  leaves and is **not started**. A13 is not retargeted by this phase's closeout;
  retargeting belongs to the next authorization's own commit.

---

## 4. Family counts

| Family | Count | Slice |
|---|---:|---|
| `2O-ACTIVATION` | 7 | 2O.0 |
| `2O-ENTRY` | 8 | 2O.1 |
| `2O-ONBOARD` | 11 | 2O.2 |
| `2O-PREF` | 15 | 2O.3 |
| `2O-AICONFIG` | 9 | 2O.4 |
| `2O-COST` | 7 | 2O.4 |
| `2O-PRIVACY` | 10 | 2O.5 |
| `2O-CONSENT` | 5 | 2O.5 |
| `2O-NOTIFY` | 7 | 2O.6 |
| `2O-RECOVER` | 7 | 2O.6 |
| `2O-MOBILE` | 5 | 2O.7 |
| `2O-ACCESS` | 6 | 2O.7 |
| `2O-READY` | 5 | 2O.8 |
| `2O-METRICS` | 5 | 2O.8 |
| `2O-SEC` | 5 | 2O.8 |
| `2O-CLOSE` | 4 | 2O.8 |
| **Total** | **116** | **nine slices** |

`2O-PREF` carries 15 rather than 12 because **ADR-116** appended
`2O-PREF-013` … `-015` for the appearance control. Every other family is
unchanged, and no identifier anywhere was renumbered, reused or deleted.

---

## 5. Owner decisions — ALL TWELVE SIGNED by ADR-116 (2026-08-15)

Twelve decisions change product, scope, migrations, privacy, cost or schedule.
**All twelve are signed.** Signing them **does not authorize implementation**:
Phase 2O remains a planning phase under ADR-115, and every requirement above
still awaits its own implementation authorization.

| Decision | Signed | Effect |
|---|---|---|
| `OD-2O-1` | **A** | a static public entry page, both locales, no signup CTA while closed |
| `OD-2O-2` | **A** | appearance choice client-side, `localStorage`, no-flash, **no migration** — adds `2O-PREF-013` … `-015` |
| `OD-2O-3` | **A** | onboarding progress **derived**; `2O-ACTIVATION-002`'s conditional becomes absolute |
| `OD-2O-4` | **A** | export **synchronous, server-side**, over the deletion enumeration; **no migration** |
| `OD-2O-5` | **A** | signed-in indicator + **global** sign-out; no administrative device list |
| `OD-2O-6` | **A** | controls **only** for the three review preferences; resolves `2O-AICONFIG-004` |
| `OD-2O-7` | **A** | keep the nine columns, no controls, guard the absence |
| `OD-2O-8` | **A** | activation funnel **only if** a real producer and a real consumer both ship |
| `OD-2O-9` | signed | **2 allocated · obligation ZERO · NON-TRANSFERABLE**; a third a STOP CONDITION |
| `OD-2O-10` | **A** | the readiness dossier only |
| `OD-2O-11` | signed | admits **two**: the 21px target and a real screen-reader run. Everything else declined |
| `OD-2O-12` | **B** | the screen-reader run does not alone block closeout, and **may never be promoted by documentation, emulation or inference** |

**The options below are kept in full, and deliberately.** A decision whose
alternatives have been deleted is a decision nobody can review, and the
declined branch is what makes the signed one legible a year from now. Each is
stated with its options, the recommendation the agent gave, and the consequence.

**One consequence of the combination, recorded because it is not visible from
any single signature.** ADR-115 reserved **M2** for exactly one of `OD-2O-2`
**B**, `OD-2O-3` **B** or `OD-2O-4` **B**. All three are signed **A**, and the
budget is non-transferable — so **M2 has no destination it may be spent on and
closes unspent by construction.** That is the correct close, not an omission,
and spending it elsewhere is a stop condition.

- **OD-2O-1 — a public entry page.**
  **A (recommended)** a static unauthenticated page in both locales, no signup
  call to action while signup is closed · **B** keep the root redirect and build
  nothing · **C** build it, ship it only when signup opens.
  *A costs one route and no data access, and it is the precondition for any
  public opening. B leaves the product unnameable to a stranger. C spends the
  work and withholds the benefit.*

- **OD-2O-2 — the appearance control ADR-114 Decision 3 already decided.**
  **A (recommended)** client-only choice, `localStorage`, a no-flash script, no
  column, no migration · **B** persisted on `profiles` — costs one migration and
  makes the choice follow the account across devices · **C** none; the machine
  decides.
  *A finishes a signed decision at zero schema cost. B is the better product and
  spends an allocation. C leaves ADR-114 half-built.*

- **OD-2O-3 — how onboarding progress is remembered.**
  **A (recommended)** derived entirely from existing data · **B** a stored step
  or flag — one migration · **C** client-only.
  *A is resumable by construction and cannot go stale. B can lie the first time
  a user does a step out of order. C loses progress across devices.*

- **OD-2O-4 — data export.**
  **A (recommended)** synchronous, server-side, over the deletion enumeration,
  no new table · **B** a job plus a storage artifact — one migration, a new job
  type, and a signed URL · **C** defer.
  *A is complete-or-refuse and cheap; its risk is a timeout on a large account.
  B survives any size and costs an allocation. C leaves the product with no exit.*

- **OD-2O-5 — sessions.**
  **A (recommended)** "you are signed in" plus a global sign-out · **B** a full
  device list — requires GoTrue admin, service-role on an authenticated path,
  new authority and a threat-model change · **C** defer.

- **OD-2O-6 — which inert preferences get controls.**
  **A (recommended)** only the three review-time columns, which have proved
  consumers · **B** also give `autonomy_level`, `follow_up_intensity` and
  `privacy_default` consumers in this phase · **C** none.
  *B is agent-behaviour design, not preferences work, and would widen the phase
  by a slice.*

- **OD-2O-7 — the nine columns with no consumer.**
  **A (recommended)** record their state, offer no control, guard the absence,
  keep the columns · **B** give them consumers · **C** drop them — a migration
  and an irreversible act.

- **OD-2O-8 — activation telemetry.**
  **A (recommended)** declare an activation funnel **only if** a real producer
  and a real consumer both ship, which costs one vocabulary migration · **B**
  reuse existing event names and declare nothing new · **C** no telemetry.
  *This product has shipped telemetry with no consumer before, and it was
  invisible for weeks. A is conditional on purpose.*

- **OD-2O-9 — the migration budget.**
  **Recommended: 2 allocated · obligation ZERO · NON-TRANSFERABLE.** M1 for the
  activation telemetry vocabulary, conditional on `OD-2O-8` **A** and on real
  producers and consumers. M2 reserved for **exactly one** of `OD-2O-2` **B**,
  `OD-2O-3` **B** or `OD-2O-4` **B** — whichever the owner signs, and no more
  than one. **A third is a STOP CONDITION.** An allocation may close unspent,
  and an unnecessary spend is a defect.

- **OD-2O-10 — public-opening readiness.**
  **A (recommended)** the dossier only; the three failing gates and the two
  signatures stay owner and operator work · **B** the phase also closes
  `RG-QUO-3` by arming the retention sweeps · **C** nothing.
  *B is possible only through an operator script; a migration that schedules a
  destructive sweep is authorization by side effect and is refused.*

- **OD-2O-11 — the inherited residuals.** None is absorbed by default. Each is
  offered explicitly:
  | Residual | Cost if admitted | Recommendation |
  |---|---|---|
  | `2N-MOBILE` — 21px target | small; fits 2O.7 exactly | **admit** |
  | `2L-ACCESS-008` — screen-reader run | owner time | **admit** via `2O-ACCESS-006` |
  | `2N-RELATION-TRIGGER` | a migration, a dropped trigger, a stop condition | **decline** |
  | `2N-IDENTITY-EXTRACTION` | a migration and a behaviour change to the worker | **decline** |
  | `2N-FILES-WRITER` | new authority — `INSERT` or a definer RPC | **decline** |
  | `2N-PRIVACY-FREETEXT` | a posture decision, no code | **decline**, keep as a question |
  | `2N-RELATION-END-ANNOUNCEMENT` | small, unrelated to this phase | **decline** |
  | push HTTP 403 / Android | hardware, and its own initiative | **decline** |
  | `T-19` retention sweeps | operator work | **decline**, see `OD-2O-10` |
  | ADR-055, expires 2026-10-27 | neither satisfied nor superseded | **decline**, restate only |

- **OD-2O-12 — is the screen-reader run a blocking closeout gate?**
  **A (recommended)** yes, blocking · **B** yes, recorded but non-blocking ·
  **C** no.
  *It has been open since Phase 2L. A phase whose subject is accessibility is
  where it stops being deferred, and the cost is owner time rather than code.*

---

## 6. Stop conditions

The phase stops and returns to the owner if any of these is reached.

1. A **third** migration is needed — **or M2 is about to be spent at all**,
   since ADR-116 Decision 4 left it with no signed destination.
2. Any requirement would need signup opened, the rollout gate altered, a secret
   changed, or `config.toml` pushed.
3. Any requirement would need new authority for `authenticated` or a new
   `SECURITY DEFINER` function not covered by a signed decision.
4. A telemetry event is wanted with no real consumer.
5. A control is wanted for a preference with no consumer.
6. An export cannot be made complete, so `2O-PRIVACY-004`'s "complete or refuse"
   cannot hold.
7. A surface would need a model call to render.
8. A signed decision from a previous phase would have to be reversed — or one
   of ADR-116's twelve would.
9. `2O-ACCESS-006` is about to close `built` **without** a recorded execution
   naming device, software and version.

---

## 7. What this phase explicitly does not do

Opening signup · scheduling a retention sweep from a migration · resuming push ·
building agent autonomy · redirecting `/app/history`, `/app/costs` or
`/app/jobs` · reversing `2M-AUDIT-005` · adding a provider, a push scope, a
search index or a retrieval path · redesigning a surface the Papel e Console
redesign shipped · starting, scoping or naming the roadmap successor.

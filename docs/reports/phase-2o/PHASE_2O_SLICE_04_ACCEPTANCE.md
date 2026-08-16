# Phase 2O — Slice 2O.4 acceptance record

**AI configuration, usage and cost.** `2O-AICONFIG-001` … `-009`,
`2O-COST-001` … `-007` — **sixteen requirements**.

**Baseline:** `main` = `origin/main` = **`2dfef1a`**, worktree clean, no open PR,
CI green on all three job families at `a8d9382` and at `2dfef1a`, **94 local
migrations = 94 hosted, parity `202608140094`** read live from the project,
rollout gate **25 pass · 3 fail · 2 owner-signature** re-read by running
`npm run rollout:verify`, signup closed.

**This slice: zero migrations created. 94 = 94, parity `202608140094`. Signup
closed. Rollout gate 25 · 3 · 2. CSP unchanged. `embedding_model` untouched.
A13 not retargeted. M1 live and conditional. M2 unspent and unspendable.**

**57 of 116 requirements delivered.** Slices 2O.0 – 2O.4; four remain.

---

## 1. Classification

| Requirement | Classification | Evidence |
|---|---|---|
| `2O-AICONFIG-001` | `built` | `AiConfigSection` states five use sites, **derived** from the routes with a real reader rather than listed |
| `2O-AICONFIG-002` | `built` | `aiConfigCopy.credential` — the owner's key performs them, removing it stops them; asserted in both locales and in the journey |
| `2O-AICONFIG-003` | `built` | `AI_ROUTE_CONTRACTS` + a **two-directional** tree census; the model shown is the routing in use |
| `2O-AICONFIG-004` | `built` | `embedding_route` row, `uncontrolled`, four consumers, **no control**; the exact-count assertion re-armed |
| `2O-AICONFIG-005` | `built` | `reasoning_model` and `background_model` **said on a surface**; rows unchanged, no control created |
| `2O-AICONFIG-006` | `built` | the **never-logged** clause added; all three clauses checked against the implementation |
| `2O-AICONFIG-007` | `built` | `removeConfirm` states the consequence for entries already captured, checked against the drain's two behaviours |
| `2O-AICONFIG-008` | `built` | absent-credential statement with **exactly one** path; asserted as a count, not a presence |
| `2O-AICONFIG-009` | `built` | source scan **plus** a network assertion on the rendered pages |
| `2O-COST-001` | `baseline` | `get_ai_cost_summary` over `ai_usage_events` ships; re-asserted, not rebuilt |
| `2O-COST-002` | `built` | `QuotaSection` + `loadQuotaUsage`, ceilings from `QUOTAS`, usage from the trigger's own predicates |
| `2O-COST-003` | `baseline` | the refusal module **already has two real consumers**; re-asserted (see §3) |
| `2O-COST-004` | `built` | the profile states all seven routes it writes, before the save |
| `2O-COST-005` | `built` | two hardcoded price claims removed; guarded in both directions |
| `2O-COST-006` | `built` | the zone is declared, and the **two different zones** are told apart |
| `2O-COST-007` | `built` | `null` never renders as zero, on three independent reads |

**14 `built` · 2 `baseline` · 0 `partial` · 0 `undelivered`.**

---

## 2. The re-audit corrected §81 in two places

§81's seven findings were re-run against `2dfef1a`. Five held exactly. Two did
not, and both changed what this slice had to build.

### Finding 5 was false: `refusal.ts` has consumers

§81 records that `src/features/quotas/refusal.ts` *"has no consumer"* and that
`2O-COST-003` must therefore **wire it**. Against `main`, `quotaRefusal` is
called from **`capture/actions.ts`** and from **`agent/actions.ts` in three
places** — the upload's post-insert refusal, its job insert, and a pre-check —
and every one renders through `quotaRefusalMessage`. The copy already
interpolates each ceiling from `QUOTAS` and already says when the two daily
windows reset.

So `2O-COST-003` **ships**, and the honest classification is `baseline`. What
this slice added is the assertion that it keeps shipping, plus a state surface
keyed by the **same** `QuotaDetail` vocabulary so the sentence before a refusal
and the sentence during one cannot describe two different limits.

Rebuilding it — which the instruction as written would have produced — would
have created a second refusal path for one database contract. That is the
producer-with-no-consumer defect inverted, and worse: two consumers can
disagree.

### Finding 6 was partly false: one clause was missing

§81 records the BYOK claims as *"already specific"*. Three of the four are.
`2O-AICONFIG-006` names three clauses — encrypted at rest, never returned to the
browser, **never logged** — and the third was **said nowhere**, while being
true. A true thing the product does not say is a promise the reader cannot rely
on. It was added, and every clause now resolves to something in the
implementation.

---

## 3. What the guards check, and how each was proved able to fail

**Eleven mutations were applied to the real tree; all eleven fired.** Each was
restored byte-for-byte and the restore verified against a SHA-256 digest of the
original, so a failed restore would have been reported rather than left behind.

| Mutation | Guard that fired |
|---|---|
| `embedding_route` reverts to `future` | `contracts.test.ts`, `capabilities.test.ts` |
| `embedding_route` becomes `visible` | `capabilities.test.ts` |
| a declared call site stops reading its column | direction A |
| an undeclared file starts reading a routed column | direction B |
| the never-logged clause is dropped | `byok-claims.test.ts` |
| a logging call appears on the credential path | `byok-claims.test.ts` |
| a hardcoded tariff returns to the form | `ai-config-section.test.tsx` |
| the family issues a model call | `ai-config-section.test.tsx` |
| a failed quota read is reported as zero | `usage.test.ts` |
| `ai_provider` reverts to a literal | `settings-payload.test.ts` |
| the credential-absent path offers two ways out | `ai-config-section.test.tsx` |

**Two of the eleven were malformed on the first run and survived.** One added a
new property instead of changing `visible`; the other's needle was mis-encoded.
Both were fixed **in the harness**, not in the guards — a mutation that does not
express the divergence tests nothing, and reading `SURVIVED` as *"the guard is
weak"* would have led to weakening a guard that was working.

---

## 4. `2O-AICONFIG-004`, and the assertion that had to be re-armed

Slice 2O.3 left `uncontrolled` with **no row** and an **exact-count** assertion,
recording that adding `embedding_model`'s row would fail it and that the correct
response is to re-arm the claim deliberately. It fired on the first run, exactly
as designed.

**Two weakenings were available and both were refused.** `toHaveLength(1)` and
`toBeGreaterThanOrEqual(1)` are each satisfied by a **second** `uncontrolled`
row that no owner signed, and ADR-117 authorized exactly one. The count stays
exact and now **names its member and its column**, so a row added without a
decision still fails.

And the claim is now **stronger than the one it replaces**. While the state was
empty, the invariant's `uncontrolled` branch could only be exercised by planted
rows. It has a real subject, so a second test asserts the branch is exercised by
the shipped registry **and** still fails when that real row is mutated to lie —
in both directions.

**A second armed assertion fired that §81 did not predict.**
`capability-registry-guard.test.ts` asserted *"no row names `embedding_model` at
all"*. It had two halves: *not one of the nine* — still true, untouched — and
*no row names it*, which expressed slice 2O.0's deliberate absence and is now
satisfied rather than broken. Only the second was inverted, with the superseded
form quoted, and a **new** assertion was added against the rendered form,
because the registry records what a row claims and that records what the page
does.

---

## 5. `ai_provider` repaired, `embedding_model` deliberately not

`buildSettingsPayload` wrote both as literals, so every save discarded whatever
the row held — `2O-ACTIVATION-007`'s *"no save wipes a value"* was imprecise for
exactly two columns.

**`ai_provider` is repaired.** ADR-118's own alternatives rejected fixing it in
slice 2O.0 because *"it belongs to `2O-AICONFIG`'s slice"*. This is that slice.
Nothing reads the column, so no behaviour changed today — but *today* is not the
guarantee the requirement asks for, and a write that discards a stored value is
a defect whether or not the loss has been noticed. The registry row stays
`future` and stays one of the nine, because a pass-through creates no consumer.

**`embedding_model` is not touched.** ADR-117 Decision 4 forbids removing,
altering, renaming, re-defaulting or migrating it, and turning a literal into a
pass-through is a change to how the column is written. The shortfall is named
rather than absorbed, and `settings-payload.test.ts` now **asserts the literal**
— so if a later phase is authorized to fix it, that test fails and points at the
ADR that has to move first.

---

## 6. Two price claims removed, and why that is `2O-COST-005` rather than tidying

Writing the `R-2O-18` guard found two things the re-audit had not.

1. **`text-embedding-3-small · $0.02 / 1M`** — a hand-written row in the
   settings form.
2. **A whole tariff table** — `$2.50 in · $15 out / 1M` and two more — rendered
   inside **every `<option>` of every model select**.

The second is the defect. It is a **second copy of `ai_model_pricing`** carrying
neither `pricing_version` nor `source_url`, so a reader could not audit it and
could not tell it from the real one; and the applied price is snapshotted into
`ai_usage_events` on every call while that literal was updated by hand or not at
all. This repository has paid for a hand-kept copy of a vocabulary before —
`product_events`' writer list froze and silently refused newer events for weeks.

**The catalogue is not removed from the product.** `/app/costs` renders it from
the table with its version and source URL, and the routing block already links
there. What was deleted is a claim the form could not back.

The hand-written row became a list **derived from `AI_ROUTE_CONTRACTS`**, so it
covers all three routes without a control instead of one, and a route that gains
or loses a consumer changes it with no edit.

---

## 7. Two zones on one page, and neither is described as the other

`2O-COST-006` asks every figure to carry its period **and the zone that period
was computed in**. The periods were named — Hoje, Este mês, Desde o início — and
the zone was passed to `get_ai_cost_summary` and **never said**, so "Hoje" was a
day the reader could not identify.

The quota windows are a different zone. `private.utc_day_start()` is
`date_trunc('day', now() at time zone 'UTC')`, so the daily ceilings reset at
**UTC midnight, not the owner's**. Both are now stated, separately, and
describing the quota day as "your day" would have been the invention. Two zones
on one page is a fact about the system rather than an inconsistency to smooth
over.

---

## 8. What `2O-COST-002` counts, and the two directions it refuses to be wrong in

Ceilings come from `QUOTAS`, which `quotas-parity.test.ts` already compares three
ways. The **usage** side had the same hazard one layer down, and the guard reads
the trigger's predicates out of `202608050076` so the two cannot drift.

Two divergences are stated rather than hidden, and both lean the same way:

- **Live jobs are over-counted.** PostgREST cannot compare `attempts` to
  `max_attempts`, so exhausted `failed` rows are counted here and not by the
  trigger. Telling someone the queue is fuller than it is costs them a retry;
  telling them it is emptier walks them into a refusal.
- **A truncated byte read returns `null`, not a short sum.** The row set is
  bounded by the object ceiling, and a set larger than that comes back
  detectable rather than silently incomplete.

**One ceiling is deliberately not reported.** `QUOTA_ATTACHMENTS_PER_ENTRY` is
per-record, so it has no account-level usage figure; `2O-COST-002` asks for the
ceiling that applies to **the account**. It is named here rather than dropped,
and it still refuses with its own copy.

---

## 9. What the browser proved that nothing else could

`e2e/online-ai-configuration.spec.ts` — **four journeys, desktop and mobile,
against the production build and the hosted project**, with a disposable account
removed in `afterAll`.

- **The RSC boundary.** Two new Server Components render in production. Both
  compiled and both are unit-tested, and neither fact meant they would render —
  the failure recorded as *"the RSC boundary is only tested in production"*.
- **`2O-AICONFIG-009` read off the wire.** No request to a provider host while
  rendering either surface. The source scan cannot make that statement.
- **`2O-COST-002` against a real account.** `0 de 300` is a **read**, and the
  journey asserts separately that no figure rendered as unreadable — the
  distinction `2O-COST-007` turns on.
- **`2O-COST-005` in the rendered DOM.** No model option quotes a price.

The full CI Playwright command — five specs, desktop and mobile — was also run:
**287 passed**.

---

## 10. Carried, unabsorbed, with destinations

- **`embedding_model` is still written as a literal** by `buildSettingsPayload`,
  so a stored value that differs is overwritten. **Not repairable in this phase**
  — ADR-117 Decision 4 — and now asserted, so closing it requires moving the ADR
  first. → **owner**.
- **`viewport.themeColor` is declared under `prefers-color-scheme` media only** →
  **slice 2O.7**.
- **`2O-PREF-002`'s remainder** — the account's own acceptances have no surface →
  **slice 2O.5**, `2O-CONSENT-001`/`-002`. **Not touched here.**
- **`2O-ONBOARD-003`'s remainder** — the path never asks for locale and timezone,
  because `2O-ACTIVATION-001`'s first fact cannot be false. **Re-evaluated in
  this slice and kept `partial`**: the only way to close it would be to make
  onboarding and activation disagree about one fact, which is what
  `2O-ONBOARD-002` forbids. → **owner, one form field.**
- **`defaultAgentPreferences.tone` says `direct` while the column defaults to
  `informal`**, and nothing reads the field.
- Every Phase 2N residual `OD-2O-11` declined, unchanged and unclaimed; push
  still failing with HTTP 403 on a real iPhone and **never executed on Android**;
  ADR-055 neither satisfied nor superseded, expiring **2026-10-27**.

---

## 11. A defect found by reviewing the shipped component, not by a failure

`AiConfigSection` first took a **boolean** — `credential.status === "active"` —
for `2O-AICONFIG-008`. `CredentialStatus` has four members, and only `active`
performs calls, so that reads correctly for the gate and **falsely** for one
state: `invalid` means the provider **rejected a key that exists**, and the
section told that reader *"no key configured"* and offered *"Configure the
key"*.

Both halves were wrong in the same direction — the sentence denied a key the
account has, and the action sent the reader to create one instead of replacing
it. It ships as the status, with `removed` and `absent` sharing one sentence
because they really are one fact to this surface, and `invalid` carrying its
own sentence and its own verb. Two tests pin it: one asserts each state renders
the right sentence **and not the other**, and one is exhaustive over the
non-`active` union so a fifth status cannot fall through to *"your key performs
these calls"*.

Nothing found this. It was found by re-reading what had already been written,
which is the same reason `2O-PREF-011` was found in slice 2O.3 — and both are
arguments for reading the shipped thing rather than the diff.

## 12. One documentation defect found and repaired

`settings/page.tsx` carried a comment stating that `OnboardingRestore` *"needs no
capability-registry row"* and that *"the registry would have nothing true to say
about it"*. Slice 2O.3 added the `onboarding_restore` row and fixed the copy of
that reasoning in `capabilities.ts`, leaving this one standing. A comment
asserting the opposite of the tree is what `R-2O-16` exists to catch. Repaired,
not deleted.

`TODO.md`'s active line still described **slice 2O.2 and 26 of 116** — one slice
stale. Brought current.

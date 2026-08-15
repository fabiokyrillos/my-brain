# Phase 2O — Slice 2O.2 acceptance record

**The first conquest: a path derived from what is true, offered and never imposed.**

- **Authorization:** ADR-118, implementation through closeout.
- **Requirements:** `2O-ONBOARD-001` … `-011` (11 of 116; **26 delivered
  cumulatively**).
- **Migrations:** **none created, none spent.** 94 local = 94 hosted,
  `202608140094`, unchanged. `OD-2O-3` is signed **A**, so the conditional
  allocation this slice might have carried never existed.
- **Baseline:** `main` `40882c0` — the merge SHA of slice 2O.1's handoff, CI
  green on all three job families, worktree clean, no open PR.

---

## 1. The re-audit, against the `main` slice 2O.1 produced

| Requirement | Already true? | What the tree said |
|---|---|---|
| `-001` a guided path, offered | **no** | nothing in `src/` or `e2e/` implements onboarding; the five files matching *onboard* are the activation contract, its test, a remote baseline and two governance guards, all of which **mention** it |
| `-002` rendered from the activation facts | **no** | the facts shipped in 2O.0 and had no consumer beyond `CapabilitySummary` |
| `-003` locale and timezone, asked once | partly | the settings form asks; nothing tracked whether it had been answered |
| `-004` assistant identity through the same action | partly | `updateProfile` and `settings-form.tsx` exist and are the only writer |
| `-005` mount the existing credential panel | partly | `byok/credential-panel.tsx` exists and is mounted on `/app/settings` |
| `-006` a first capture that does not block | **yes, already** | `captureEntry` has been asynchronous since 2X.5; the path had to *say* so, not build it |
| `-007` review through the existing surface | partly | `RecordsQueue` and the selective-confirmation path exist on `/app/inbox` |
| `-008` a first task and a first memory | partly | both have confirmed manual paths already |
| `-009` resumable across sessions and devices | **no** | there was no path to resume |
| `-010` dismissible and reversible | **no** | — |
| `-011` no capability claimed that is absent | partly | `awaiting_ai_configuration` and `byokSettingsHref` exist; nothing consumed them for onboarding |

**Every one of the four surfaces the plan says to *mount rather than
reimplement* is present**, and the two declared dependencies — 2O.0 and 2O.1 —
are merged with CI green on their merge SHAs (`629ba13`, `bdd22e4`).

### Five findings the previous re-audit did not record

1. **`localStorage` is used nowhere in this repository.** The only occurrence is
   a comment in `sensitivity/contracts.ts`. The client-preference pattern
   `OD-2O-2` **A** signed belongs to slice 2O.3 and **is not built**, so
   `2O-ONBOARD-010` had no existing mechanism to reuse — a fact that decided the
   dismissal design rather than being discovered inside it.

2. **`2O-ONBOARD-002` and `2O-ONBOARD-008` do not fit together without a
   decision.** `-002` requires the path to render from `2O-ACTIVATION-001`'s
   ordered facts, which are **exactly five**, asserted at
   `contracts.test.ts:29`. `-004` asks for an assistant-identity step and `-008`
   asks for a first-memory step, and **neither is one of the five**. Resolved by
   adding them as steps in this slice's own contract rather than by widening
   `activationFacts`: see §3.1.

3. **`defaultAgentPreferences.tone` disagrees with the schema.**
   `src/lib/preferences.ts` declares `tone: "direct"`; `agent_preferences.tone`
   defaults to `'informal'` (`202607160001_phase1_identity.sql:21`). The
   mismatch is latent — no product path reads that field of that object, its
   live consumers are `timezone` and `agentName` — but deriving the identity
   step from it would have read a brand-new account as **already personalised**
   and silently skipped the step. **Recorded and not repaired; destination slice
   2O.3**, on the same rule ADR-118's alternatives applied to `ai_provider`:
   repairing a finding inside a slice that has a different requirement is
   widening on the finding.

4. **T-6 is discharged by existing controls.** `requireUser` runs session →
   lifecycle → consent in that order, and the authenticated layout calls it
   **above** the Suspense boundary. A panel mounted inside `/app` inherits all
   three; nothing new was needed.

5. **The plan's browser proof obligation reaches this slice and cannot be met
   in CI.** 2O.1 discharged its obligation inside `foundation.spec.ts` because
   its surfaces were public. This slice's are authenticated, and
   `foundation.spec.ts` is unauthenticated by construction — it asserts that
   `/app` redirects to login. The journey therefore lives in the credential-gated
   online lane. See §6.

---

## 2. What shipped

`src/features/onboarding/` — seven files, one of which reads the database.

- **`contracts.ts`** — the path as data: seven ordered steps, each naming the
  activation fact it mirrors (or `null`), the existing data its state derives
  from, the destination it reaches and **the module it mounts rather than
  reimplements**. Plus `deriveOnboardingPath`, a fourth state (`blocked`), and
  `pathMirrorsActivationOrder`.
- **`onboarding-view.ts`** — the one read. It calls `loadActivationProgress`
  rather than asking the same five questions its own way, and adds exactly two
  existence checks for the two steps activation does not declare.
- **`dismissal.ts`** — the cookie's name, its single accepting value, its
  options, and a recogniser.
- **`actions.ts`** — `dismissOnboarding` / `restoreOnboarding`. Both call
  `requireUser`. Neither touches a table.
- **`copy.ts`** — pt-BR and en, keyed by `OnboardingStepKey`, so a step added
  without copy **fails to compile in both locales**.
- **`onboarding-panel.tsx`**, **`onboarding-restore.tsx`** — presentation only,
  with the action injected.

Wired into `home-view.tsx` (a slot **below** the composer), `home-dashboard.tsx`
(its own `Promise.allSettled` slot) and `/app/settings` (the reversal).
`src/app/onboarding.css`, imported by `globals.css`.

**Zero migrations. No RPC. No `SECURITY DEFINER` function. No new authority. No
CSP change. `embedding_model` untouched. Signup untouched.**

---

## 3. The three decisions this slice had to take, and what each declined

### 3.1 Seven steps, five of which are activation facts

`2O-ONBOARD-004` and `-008` ask for steps that `2O-ACTIVATION-001` does not
declare. Two ways to resolve that:

**Declined — add a sixth and seventh activation fact.** It changes a contract
slice 2O.0 delivered and `contracts.test.ts` guards, on a requirement that never
asked for it, and every future consumer of activation inherits two facts it has
no use for.

**Taken — declare them as steps here.** Both derive from existing data
(`agent_preferences`, `memories`) and hold no state, so `2O-ACTIVATION-002`'s
absolute prohibition reaches them unchanged. What `-002` actually demands is
that the path and the truth cannot disagree, and that is asserted directly:
`pathMirrorsActivationOrder` checks the five appear in the path **in exactly the
order activation declares them**, with a planted reordering and a planted
deletion proving the check can fail.

### 3.2 Dismissal is a cookie, and it may not be anything persistent

**It may not be a column.** `OD-2O-3` **A** makes `2O-ACTIVATION-002` absolute,
and ADR-118 Decision 9 makes *"onboarding needing persistence"* a **stop
condition**. So dismissal is per-browser state; the only open question was
which kind.

**Declined — `localStorage` with a pre-paint inline script.** That is the
machinery `OD-2O-2` **A** signed for the *appearance* preference. Here it would
import a CSP question (`R-2O-27`) that this slice never needs to ask, and
`R-2O-28` had to treat a stored appearance value as attacker-controlled
precisely because any script on the origin can write `localStorage`.

**Taken — an `httpOnly` cookie.** The panel is a Server Component, so a
server-readable decision means a dismissed panel never renders rather than
rendering and being hidden. `httpOnly` also makes it strictly safer than the
alternative. `OD-2O-2` governs appearance and names no mechanism for dismissal,
so this is a choice inside the slice and **not a reinterpretation of a
signature**.

**The cost, stated plainly rather than discovered later:** *dismissal does not
follow the account across devices, and on a shared browser it is shared.* That
is the same cost ADR-116 Decision 8 stated for the client-held appearance
choice, and it is the price of spending no migration. **What does follow the
account is the path's progress** — every step is derived — so `2O-ONBOARD-009`
is unaffected, and the online journey proves it in a second browser context with
no cookies at all.

### 3.3 The identity step reads a choice, and its residual is named

`agent_preferences` is created with values already in it, so a row's existence
proves nothing. `isAssistantPersonalised` returns true when any of `agent_name`,
`personality`, `tone` or `response_detail` differs from **the schema's own
default**, re-read from the migration by a guard.

**The residual, stated:** an owner who deliberately wants every default never
satisfies this step, and their exit is `2O-ONBOARD-010`'s dismissal. The only
alternative is a stored *"I saw this"* flag, which is forbidden absolutely.

---

## 4. Four things I got wrong, and how each was caught

### 4.1 A test that claimed to prove an unreachable branch

`nextStep` refuses to offer a `blocked` step. My first test asserted it skipped
one — and failed, correctly: the **credential step precedes every step that
needs a credential**, so an account with no credential is always offered the
credential step first, and the refusal never changes the answer.

The honest resolution was not to delete the clause and not to keep a test that
cannot fail. Two assertions replaced it: **`nextStep` is never blocked, over all
2187 combinations of readings**, with both non-vacuity checks (the loop ran;
`blocked` really occurs), and **the structural reason** — every
`requiresCredential` step is ordered after the credential step — which is the
assertion that *would* fail if a future step were inserted in a position that
made the refusal load-bearing without anyone noticing.

### 4.2 The guard read a cookie delete as a domain write

`/\.(insert|update|upsert|delete)\(/` fired on `jar.delete(...)` — which is
`2O-ONBOARD-010`'s reversal. A guard that refused it would have made the
requirement unimplementable. The verb only means *domain write* when it hangs
off `.from(...)`, so that is what is matched now, **with a control in both
directions**: a cookie delete reads as no write, and `supabase.from("tasks")
.delete()` reads as one.

`.rpc(` is refused outright rather than judged, because a write whose verb lives
in the database cannot be recognised from the call site.

### 4.3 A second `role="status"` on the same page

The unreadable notice carried `role="status"`, and Hoje already has one for the
day's state. `home-dashboard.test.tsx` failed on the ambiguity. Removing the
role was the correct fix on the merits and not only to make the test pass: the
notice renders **with** the page rather than in response to an action, so it
announces nothing, and a second live region would compete with the day's on
every navigation.

### 4.4 A test file that failed while every test passed

`home-resilience.test.tsx` reported **0 tests** — `onboarding-view.ts` is
`server-only` and that suite renders `HomeDashboard` as a client module. The
suite summary read *4 failed files, 7826 passed, 0 failed*, which is exactly the
silent shape this repository has been bitten by before.

The file now mocks the loader like every other server module it reaches, and
gained the two assertions it was missing: the panel **renders** when the read
succeeds (without which the failure case would have passed over a panel that
never renders at all) and **does not** when it throws.

---

## 5. Requirement by requirement

| Req | Outcome | Evidence |
|---|---|---|
| `-001` offered, never imposed | **built** | a `<section>` in the page flow, no dialog/portal/route/redirect — guarded; the composer renders **before** it in `home-view.tsx`, asserted by document order in the guard and by `compareDocumentPosition` in the browser |
| `-002` rendered from the activation facts | **built** | the view calls `loadActivationProgress`; `pathMirrorsActivationOrder` with two planted failures |
| `-003` asked at the point it matters, never again once set | **built** | a satisfied step renders its state and **no action** — asserted in both locales, with the unsatisfied case proving the absence means something |
| `-004` identity through the same action and schema | **built** | the step links to `settings-form.tsx`; the feature imports `updateProfile` nowhere, and writes nothing anywhere |
| `-005` mount the existing credential panel | **built** | the step resolves through `byokSettingsHref`; the feature renders no password input and re-mounts no panel |
| `-006` a first capture that does not block | **built** | copy states the words are stored before any model runs and control returns immediately; asserted in both locales |
| `-007` review through the existing surface | **built** | the step reaches `/app/inbox`; copy states nothing is created without the owner's act |
| `-008` a first task and a first memory, each optional | **built** | two steps, each reaching an existing route, each skippable — every step is |
| `-009` resumable across sessions and devices | **built** | no stored progress: 94 migrations unchanged, no onboarding column in the generated types, no write anywhere in the feature; proved live in a second browser context with no cookies |
| `-010` dismissible, reversibly | **built** | cookie set and deleted through two gated actions; the reversal renders only when there is something to reverse; proved across a reload |
| `-011` no capability claimed that is absent | **built** | `blocked` is claimed **only** on a credential known absent, never on one that could not be read; the blocked step carries no action; the recovery resolves to the same route `awaiting_ai_configuration` links to |

**11 built, 0 partial, 0 undelivered.**

---

## 6. Gates

| Gate | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | see §7 |
| `npm run build` | see §7 |
| `git diff --check` | clean |
| Migrations | **94, unchanged.** Parity `202608140094` |
| CI's five Playwright specs, desktop **and** mobile | run locally before pushing — the rule slice 2O.1 earned |
| Browser, **authenticated**, against `next start` | `e2e/online-onboarding.spec.ts`, five journeys, both locales, desktop and mobile |

**On the authenticated proof.** It is credential-gated and therefore **skips
itself in CI**, exactly as every other `online-*` spec does. That is a real
limitation and it is stated rather than implied: what CI proves about this slice
is the unit and guard layer plus that `/app` stays authenticated; what the online
lane proves is the RSC boundary, and it must be **run** for that claim to exist.

---

## 7. What this slice did not do

- **No migration.** M1 stays live and conditional on slice 2O.8; **M2 stays
  without a destination and unspent** (`R-2O-25`).
- **No repair of `ai_provider`'s or `embedding_model`'s literal writes** in
  `buildSettingsPayload` → slice 2O.4, unchanged from §77 and §78.
- **No repair of `defaultAgentPreferences.tone`** → slice 2O.3, newly recorded
  here (§1.3).
- **No `scheduled_reviews` wording change** → `2O-PREF-004`, slice 2O.3.
- **No appearance control.** `OD-2O-2` **A** is slice 2O.3's, and this slice's
  cookie is not it.
- **No telemetry.** `OD-2O-8`'s funnel is slice 2O.8's, and an event declared
  here would have no consumer.
- **Signup not opened; rollout gate untouched at 25 · 3 · 2; CSP untouched;
  A13 not retargeted; no declined residual absorbed; the push HTTP 403 track not
  resumed; ADR-055 neither satisfied nor superseded, expiring 2026-10-27.**

# Phase 2O — Current Experience Audit

**Status:** evidence for a planning package. This document authorizes nothing,
scopes nothing and implements nothing.

**Baseline audited:** `main` at `9cc1175`, worktree clean, `main = origin/main`,
CI `success` on that exact SHA (run `31896527259`). 94 local migrations = 94
hosted, parity `202608140094` confirmed by a live read-only
`supabase migration list --linked`. Signup closed; the rollout gate reads
**25 pass · 3 fail · 2 owner-signature**.

**Audit date:** 2026-08-15.

---

## 0. Why this audit was re-run from the tree

Phase 2N closed on 2026-08-14 at `9b7cda7`. **The product changed after that**,
and the change is large: PR #227, the Papel e Console redesign, merged on
2026-08-15 at `9cc1175` — **39 commits, 138 files, +13,345 / −1,861, zero
migrations**, governed by **ADR-114**.

Every number and every claim below was re-derived from the tree at `9cc1175`.
Nothing is carried forward from the Phase 2N audit, from the roadmap, or from
the redesign's own prose. Where the roadmap and the tree disagree, **the tree
wins and the divergence is recorded** (§8).

Three probes were run and one of them was wrong before it was right — a column
census returned `0 consumers` for `personality`, `tone` and `quiet_start`,
columns the product demonstrably reads. The cause was the sandbox's working
directory, not the product. The census was re-run against absolute paths and
every figure below comes from the corrected run. **The probe was suspected
before the product**, which is the standing rule in this repository, and it was
right to be.

---

## 1. What the redesign actually changed

Read from the diff `9b7cda7..9cc1175` and from the code at `9cc1175`, not from
the handoff.

| Area | What shipped |
|---|---|
| Colour | `src/app/tokens.css` is the only file that may hold a raw colour. Nine legacy tokens (`--ink`, `--paper`, `--blue`, …) become aliases over it. Dark is **authored**, not inverted. |
| Type | IBM Plex Sans / IBM Plex Mono via `next/font`; Newsreader kept for the user's own content. Stylesheets read `--font-reading` / `--font-ui` / `--font-mono`. |
| Shell | One breakpoint, a 212px rail, an amber that passes AA, and the palette / search / composer restyled. |
| Brain | **One space with nine lenses** over `/app/library`, `people`, `projects`, `organizations`, `contexts`, `memories`, `files`, `relations`, `chat`. **Every URL preserved**; no loader, RLS rule or Server Action duplicated. |
| Data & AI | **New `src/features/transparency/`.** `/app/history` (*Atividade*), `/app/costs` (*Custos*) and `/app/jobs` (*Processamento*) become one named centre reached from Ajustes, each wearing a strip with a way back. **No redirect; no route ended.** |
| Daily surfaces | Hoje recomposed as a cockpit; Registros as a decision queue; Trabalho as three modes with a toolbar; task detail, calendar, reviews and Conversar recomposed. |
| Guards | Four new: `stylesheet-registry-guard`, `shell-mirror-guard`, `entity-workspace-guard`, `mobile-reachability-guard`. |

**This matters to Phase 2O more than to any other phase**, because two of the
things Etapa 6 was going to build — a transparency centre, and a settings page
that is a real destination — now partially exist.

---

## 2. Entry into the product

### 2.1 There is no landing page

`src/app/page.tsx` is, in its entirety:

```tsx
import { redirect } from "next/navigation";
export default function Home() { redirect("/pt-BR/app"); }
```

A person who reaches the product's root is redirected into the authenticated
application, which redirects them to login. **At no point does the product say
what it is.** There is no unauthenticated page describing the Brain, no
explanation of what capture does, no statement of the privacy posture, and no
account of what an AI credential is for.

The locale is hard-coded to `pt-BR` in that redirect, so an English-speaking
visitor's first frame is Portuguese regardless of their browser.

**Classification: does not exist.**

### 2.2 Authentication surfaces exist and are hardened

Five pages: `login`, `register`, `recover`, `reset`, `resend`, plus the
`auth/callback` route. Signup is refused **twice** — by
`isSignupOpenIn(process.env)` checked before parsing (so a closed signup is not
a probe surface), and by the hosted `enable_signup = false`. Turnstile is
enforced, the throttle is database-locked, refusals are uniform, and the redirect
allow list is non-empty.

The register page still renders a full form, and the refusal arrives as
`?error=signup-disabled` **after submission**. A visitor fills in name, e-mail,
password and consent checkboxes before learning the door is closed.

**Classification: exists and is adequate** for the security posture;
**exists, needs refinement** for the experience of a closed door.

### 2.3 Consent is interposed, versioned and server-side

`/consent` renders from repository truth in both locales, `policy_acceptances`
records `document`, `version`, `surface` and `accepted_at`, and
`src/lib/auth/require-user.ts` interposes it. `e2e/online-consent-interposition.spec.ts`
proves the interposition.

**Classification: exists and is adequate.**

---

## 3. First value

### 3.1 There is no onboarding, of any kind

A tree-wide scan over 920 TypeScript and SQL files for `onboarding`,
`primeiro acesso`, `first-run` and `bem-vindo` returns **one** match, and it is
`src/features/task-commands/end-to-end-match-baseline.remote.test.ts` — a remote
test fixture, not a surface.

There is no welcome, no guided setup, no checklist, no first-capture prompt, no
first-interpretation walkthrough, and no arrival at Hoje with context. A new
account lands on `/app` with every surface empty and no instruction.

**Classification: does not exist.**

### 3.2 The capture → first-result path is strong, and undiscovered

The machinery a first conquest would use is all built and proved:
`captureEntry` persists and returns without waiting for the model; the worker
interprets asynchronously; `entryLifecycleStates` has nine members including
`interpreting` and `awaiting_ai_configuration`; candidate tasks are confirmed
selectively; undo is real and compensating.

Nothing points a new user at it. The composer exists in the shell; what a first
entry should contain, and what will happen to it, is never said.

**Classification: exists, needs refinement** — the capability is built, the
first-use path over it is not.

### 3.3 The AI-configuration gate is the best recovery mechanism in the product

`awaiting_ai_configuration` is a first-class entry lifecycle state reaching
twelve files — **eight of them behavioural**: the inbox route, the assistant
actions, the BYOK actions and pending-entry count, `daily-cycle/lifecycle.ts`,
`daily-cycle/inbox-projection.ts`, and the history copy and vocabulary; the
other four are three tests and the generated types. An owner with no credential still
captures; the entries queue; the credential panel says how many are waiting and
offers to interpret them.

This is exactly the "recuperar-se de configuração incompleta" behaviour Etapa 6
asks for, **already built**, for one kind of incomplete configuration.

**Classification: exists and is adequate** for the credential case.

---

## 4. Preferences

### 4.1 They are in four places, and only one of them is named "settings"

| Destination | Holds |
|---|---|
| `/app/settings` | BYOK credential panel, the profile form, and the Dados e IA section that links out |
| `/app/notifications` | The notification list **and** `NotificationSettings` + `PushControls` — the push consent, quiet-hour and permission surface |
| `/account/delete` | Account deletion |
| `/consent` | Policy acceptance |

`/app/settings/page.tsx` contains no reference to notifications. A user looking
for "where do I turn notifications off" must find a page whose primary purpose
is a list of notifications received.

**Classification: exists, needs refinement.**

### 4.2 What the profile form actually offers

Fifteen fields, from `src/features/profile/schema.ts`: `locale`, `agentName`,
`timezone`, `personality`, `tone`, `quietStart`, `quietEnd`,
`importantReminderOverride`, `maxFollowupsPerDay`, `responseDetail`,
`aiProfile`, and four model routes (`chatModel`, `extractionModel`,
`reviewModel`, `fileModel`).

Each is backed by a real consumer. The page states the rule it follows:
*"Ajuste somente preferências que já possuem consumer verificável."*

**Classification: exists and is adequate**, within the rule it set itself.

### 4.3 `R-24` is the rule Phase 2O inherits, and it is enforced

> **"The settings surface never offers a control that changes nothing."**

`src/lib/closeout/phase-2m-inert-preferences-guard.test.ts` makes it
unfalsifiable, and records the end state of five scheduling preferences:

| Column | End state | Reality at `9cc1175` |
|---|---|---|
| `daily_review_time` | given a consumer | **consumed**, `review-schedule.ts` → `day-review-projection.ts` → `/app/reviews`; **no control** |
| `weekly_review_time` | given a consumer | the same |
| `weekly_review_day` | given a consumer | the same |
| `planning_day` | retired from the interface | absent from form, view and schema; still carried by the payload |
| `planning_time` | retired from the interface | the same |

**Three preferences change what a surface says and cannot be set by the person
they belong to.** That is not an R-24 violation — R-24 forbids the opposite —
but it is the sharpest single preferences gap in the product.

**Classification: exists partially.**

### 4.4 Three columns are read by nothing

Census over `src/` and `supabase/functions/`, excluding generated types:

| Column | Non-test consumers |
|---|---|
| `agent_preferences.privacy_preferences` | **0** |
| `agent_preferences.quiet_periods` | **0** |
| `profiles.avatar_path` | **0** |

Six more — `autonomy_level`, `follow_up_intensity`, `privacy_default`,
`background_model`, `reasoning_model`, `ai_provider` — appear only in
`profile/actions.ts` and `profile/settings-payload.ts`, which **write defaults
and carry existing values through**. No behaviour reads them.

**Classification for all nine: does not exist as a capability.** Under R-24 none
of them may be given a control until it is given a consumer, and giving them
consumers is agent-behaviour work, not preferences work.

### 4.5 The capability registry is a contract nobody consumes

`src/features/shell/capabilityRegistry` declares sixteen rows across four
surfaces, each with a `state`, a `visible` flag and `consumerEvidence`:

- 1 `informative`, 5 `operational`, 3 `advanced`, **7 `future`, all hidden**
  (`locale_preference`, `scheduled_reviews`, `autonomy`, `follow_up_intensity`,
  `privacy_default`, `reasoning_route`, `background_route`).

**It is imported by exactly two files: itself and `capabilities.test.ts`.** No
surface renders from it, no guard derives from it, and nothing fails when a row
goes stale. It is the right shape for the thing Phase 2O needs — a single
declared answer to *"is this preference real?"* — and it is currently inert.

One row is already ambiguous. `scheduled_reviews` carries
`consumerEvidence: []`, and the three review-time columns now have consumers.
The row is defensible under the reading *"no review is executed by a
schedule"* — which is true, and which `/app/reviews` says out loud in both
locales — and indefensible under the reading *"the scheduling preference has no
consumer"*, which is false. **An ambiguity a guard cannot resolve is a row that
will eventually be wrong.**

**Classification: exists partially.**

---

## 5. AI access, usage and cost

- **BYOK ships and is closed.** The credential panel is the first thing on
  Ajustes, deliberately, because every AI surface depends on it. Encryption,
  rotation, validation throttling and a credential-aware drain are all built and
  proved (`202608010065`–`202608010069`).
- **Model routing is per-operation** and exposed for four of six operations.
  `background_model`, `reasoning_model` and `embedding_model` are not offered;
  `embedding_model` has six real consumers and no control, the other two have
  none.
- **Costs ship** at `/app/costs`, reading `get_ai_cost_summary` over the
  append-only `ai_usage_events` ledger with price snapshots, now inside Dados e
  IA.
- **Quotas are enforced** (`202608050076`) and refusals are recorded.
- **What no surface says:** what a token costs before you spend it, what a
  chosen profile will cost, what the quota ceiling is, or how close to it you
  are. The ledger answers *what happened*; nothing answers *what will happen*.

**Classification: exists and is adequate** (credential, routing, ledger);
**does not exist** (prospective cost, quota headroom).

---

## 6. Privacy, consent and control of the data

| Capability | State at `9cc1175` |
|---|---|
| Sensitivity classification | **Exists and is adequate.** `ProtectedContent` / `ProtectedSurface`, derived sensitivity, `people.notes` masked by default under ADR-110. |
| Retention copy | **Exists**, generated from repository truth and honesty-gated. |
| Retention **execution** | **Sweeps built, dry-run recorded, NOT SCHEDULED.** `RG-QUO-3` fails. Inherited, not a 2O finding. |
| Account deletion | **Exists and is adequate** — transactional, CAPTCHA-gated, with recovery and a reaper; `202608070079`, `202608140094`. |
| Consent record | **Exists and is adequate.** |
| **Data export** | **Does not exist.** Zero matches for `exportar`, `data export`, `download all` anywhere in `src/`. |
| **Active sessions** | **Does not exist.** No surface lists sessions or offers a global sign-out. |
| **Private capture / conversation mode** | **Does not exist.** Zero matches. |
| "What is stored about me" | **Does not exist** as a single answer. The facts are spread across Atividade, Custos, Processamento, the memory pages and the file library. |

---

## 7. Notifications, mobile, accessibility, states

### 7.1 Notifications

Rich and real: `consent-contract`, `consent-reader`, `governance`, `payload`,
`push-encoding`, `push-controls`, `notification-settings`. Consent is opt-in,
the payload is content-free, quiet hours and the daily cap are honoured.

**Push fails on a real iPhone with HTTP 403 and has never been executed on
Android.** Inherited; destination `docs/initiatives/push-hardware-validation/`.
Permission is requested from the notifications page rather than at a moment of
value.

**Classification: exists, needs refinement** (moment of ask);
**depends on hardware proof** (delivery).

### 7.2 Mobile

One breakpoint; a five-slot mobile bar; `mobile-reachability-guard.test.ts`
holds a census that **fails in both directions** and says when slot five frees
up. `Mais` stays because `AccountMenu` mounts in only two places and retiring it
would take Ajustes, all of Dados e IA and **sign-out** with it.

Open: **a 21px touch target against a 44px minimum**, `online-memories.spec.ts:85`,
reproduced unchanged since 2N.3. Inherited as `2N-MOBILE`.

**Classification: exists, needs refinement.**

### 7.3 Accessibility

`e2e/accessibility.spec.ts` runs axe in light **and** dark with a control that
proves it really is dark. 48 Playwright specs exist. Contrast is guarded;
`--undefined` var() references are guarded; the `font:` shorthand is guarded.

**No screen-reader session has ever been executed, and none is claimed.** Open
residual beside `2L-ACCESS-008`.

**Classification: exists partially; depends on an operational proof.**

### 7.4 The universal state vocabulary is built and adopted once

`src/features/experience/state-vocabulary.ts` declares six closed tones and
**seven closed universal states** — `empty`, `loading`, `interpreting`,
`interpretation_failed`, `error_recoverable`, `error_terminal`, `offline` — with
`interpreting` first-class on purpose, because a spinner over durable content
lies about whether the work is safe.

`<UniversalState/>` is rendered by **one** surface: `search/search-surface.tsx`.
**Ten app pages and thirteen feature components carry their own empty-state
copy.** The class `ux-state` appears in exactly one file, `experience.css`.

A closed vocabulary adopted by one of twenty-four destinations is a contract in
name. This is the single largest consistency gap the audit found, and it is
directly upstream of "estados vazios", "mensagens de erro e recuperação" and
"caminhos sem saída".

**Classification: exists partially.**

---

## 8. Where the roadmap is now wrong

The roadmap's Etapa 6 (`MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md` §8) was written
on 2026-08-07. Six items in it are no longer accurate.

| Roadmap says | Tree at `9cc1175` says |
|---|---|
| 6.1 — "idioma e fuso" as onboarding steps | Both already exist as settings fields with real consumers. What is missing is asking at the right time, not the ability. |
| 6.1 — "configuração da IA" | BYOK ships complete, with a recovery path for entries captured before it. |
| 6.2 — "estilo de planejamento" | `planning_day` / `planning_time` were **retired by decision** in Phase 2M. Building a control for them would contradict `2M-AUDIT-005`. |
| 6.2 — "frequência de revisões" | The three review-time columns are **already consumed**. This is a control gap, not a capability gap. |
| 6.3 — "ações recentes", "credencial de IA", "conteúdo aguardando processamento" | All three ship, and the redesign just consolidated the first into **Dados e IA**. |
| 6.4 — "instalação como app" | A service worker already exists at `public/sw.js` and the PWA feature ships. |

And one item the roadmap does not contain at all, which the redesign created:

> **ADR-114 Decision 3 says the theme follows the machine "and an explicit
> choice beats it". The CSS for the explicit choice is complete —
> `:root[data-theme="dark"]` and the `:root:not([data-theme="light"])`
> qualifier that makes a light choice win on a dark machine. Nothing in the
> product ever writes `data-theme`.** A census over 920 files returns `NONE`.
> The decision is half-built, and the missing half is a preferences control.

---

## 9. Classification summary

| # | Capability | Classification |
|---|---|---|
| 1 | Landing / product explanation | does not exist |
| 2 | Authentication surfaces | exists, adequate |
| 3 | Closed-signup experience | exists, needs refinement |
| 4 | Consent interposition | exists, adequate |
| 5 | Onboarding | does not exist |
| 6 | First-capture path | exists, needs refinement |
| 7 | AI-configuration recovery | exists, adequate |
| 8 | Preferences location | exists, needs refinement |
| 9 | Profile preference set | exists, adequate |
| 10 | Review-schedule controls | exists partially |
| 11 | Nine unconsumed preference columns | does not exist (blocked by R-24) |
| 12 | Capability registry as a contract | exists partially |
| 13 | BYOK | exists, adequate |
| 14 | Model routing controls | exists partially |
| 15 | Cost ledger and Dados e IA | exists, adequate |
| 16 | Prospective cost / quota headroom | does not exist |
| 17 | Sensitivity and masking | exists, adequate |
| 18 | Retention copy | exists, adequate |
| 19 | Retention execution | exists partially — inherited, owner/operator work |
| 20 | Account deletion | exists, adequate |
| 21 | Data export | does not exist |
| 22 | Active sessions | does not exist |
| 23 | Private mode | does not exist |
| 24 | "What is stored about me" | does not exist as one answer |
| 25 | Notification consent and governance | exists, adequate |
| 26 | Notification ask at moment of value | exists, needs refinement |
| 27 | Push delivery on hardware | depends on hardware proof |
| 28 | Mobile navigation | exists, needs refinement |
| 29 | 44px touch targets | exists partially — inherited `2N-MOBILE` |
| 30 | Automated accessibility | exists, adequate |
| 31 | Screen-reader validation | depends on an operational proof |
| 32 | Universal state adoption | exists partially |
| 33 | Appearance / theme control | does not exist |
| 34 | Public-opening readiness | depends on owner decision — `RG-DEP-1`, `RG-DEP-3`, `RG-QUO-3`, `RG-LEG-4`, `RG-DEP-4` |
| 35 | `planning_day` / `planning_time` controls | **must not be built by rule** — retired by `2M-AUDIT-005` |

**35 capabilities: 11 adequate · 6 need refinement · 6 partial · 9 do not exist ·
1 must not be built by rule · 2 depend on an operational or hardware proof.**

---

## 10. What this audit does not claim

- **No browser session was run.** Every finding is derived from the tree, from
  guards, and from the recorded results of the redesign's own hosted lane.
  Browser, hosted, real-device and screen-reader proof are **acceptance
  obligations of implementation**, not of planning, and the implementation plan
  requires them.
- **No hosted probe was executed against user data.** Only two read-only calls
  were made: `supabase migration list --linked` and `npm run rollout:verify`.
- **No count in this document is transcribed from another document.** Every
  figure was produced by a scan of the working tree at `9cc1175` on 2026-08-15,
  and every scan is reproducible: the corpus is `src/` plus
  `supabase/functions/`, generated types excluded where stated, tests counted
  separately where stated.

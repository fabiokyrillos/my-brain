# Phase 2O — Slice 2O.1 acceptance record

**Entry: the product says what it is, and the closed door says so first.**

- **Authorization:** ADR-118, implementation through closeout.
- **Requirements:** `2O-ENTRY-001` … `-008` (8 of 116; 15 delivered cumulatively).
- **Migrations:** **none created, none spent.** 94 local = 94 hosted,
  `202608140094`, unchanged.
- **Baseline:** `main` `629ba13` — slice 2O.0's merge SHA, CI green on all three
  job families.

---

## 1. The re-audit, against the `main` slice 2O.0 produced

| Requirement | Already true? | What the tree said |
|---|---|---|
| `-001` public entry, locale negotiated | **no** | `src/app/page.tsx` was two lines: `redirect("/pt-BR/app")` |
| `-002` four checkable claims | **no** | there was no page to make them on |
| `-003` no availability claim | **no** | the register page said *"Crie seu espaço"* over a form that could not succeed |
| `-004` authenticated `/` → the app | partly | it arrived, but always in `pt-BR` |
| `-005` closed door before the form | **no** | the page asked for name, e-mail, password and consent, and only the action refused |
| `-006` statement independent of input | n/a | there was no statement |
| `-007` return to the requested surface | **no** | the proxy redirected to login and dropped the path |
| `-008` no dead end in the entry path | **yes, already** | every surface has a form or a link; see §4 |

**Two findings the plan did not anticipate**, both recorded before implementing:

1. **There was no `src/app/[locale]/page.tsx` and no `[locale]/layout.tsx`.** The
   localized entry route had to be created; the segments were only `account`,
   `account-state`, `app`, `auth`, `consent` and `legal`.
2. **`lang="pt-BR"` is hardcoded in the root layout** and there is no locale
   layout to override it, so an English page would have announced Portuguese —
   the same defect slice 2N.0's hosted proof found in the loading state.

**On (2), the framework docs were read before deciding**, as `CLAUDE.md`
requires. `node_modules/next/dist/docs/01-app/02-guides/internationalization.md`
gives the canonical answer — move the root layout under `[lang]` so `<html lang>`
comes from `params` — and that was **declined**: it relocates the layout for every
route in the product to satisfy one new page, and `/` has no locale segment to
supply. What ships instead is **the pattern this repository already uses and
documents**: `lang` is declared on the first element below `[locale]` that knows
it, exactly as `app-shell.tsx` does for the whole app under ADR-112 Decision 7a.
No framework-level change was made.

---

## 2. What shipped

| | |
|---|---|
| `src/features/entry/locale-negotiation.ts` | `Accept-Language` parsed to the closed `Locale` union; `pt-BR` is the fallback, never the answer |
| `src/features/entry/destination.ts` | where `/` sends a visitor — pure, tested directly |
| `src/features/entry/return-path.ts` | the `next` allowlist |
| `src/features/entry/copy.ts` | four claims, both locales, closed record |
| `src/features/entry/entry-page.tsx` | the page |
| `src/app/page.tsx` | negotiation and the authenticated branch |
| `src/app/[locale]/page.tsx` | `/pt-BR` and `/en` |
| `src/app/[locale]/auth/register/page.tsx` | the closed door, stated before the form |
| `src/app/[locale]/auth/login/page.tsx` | carries a validated `next` |
| `src/features/auth/actions.ts` | `signIn` returns to the requested surface |
| `src/proxy.ts` | the requested path travels with the redirect |
| `src/app/entry.css` | tokens only |
| `src/lib/closeout/entry-page-guard.test.ts` | the claims, the absences, the route audit |
| `e2e/foundation.spec.ts` | six journeys, desktop and mobile, both locales |

**No migration. No RLS or grant change. No new authority. No CSP change. Signup
neither opened nor moved.**

---

## 3. Three things I got wrong, and how each was caught

Recorded in full because each was caught by a test rather than by reasoning, and
because two of them are mistakes a later slice could repeat.

### 3.1 I removed the register form, and that was beyond what was signed

The first cut hid the form entirely while signup was closed, reasoning that
collecting a password only to discard it is worse than not asking. **That is a
defensible product opinion and it is not the requirement.** `2O-ENTRY-005` says
the page states the door is closed **before asking** for a name, an e-mail, a
password or a consent — and *"before asking"* presupposes the asking. `OD-2O-1`
**A**'s *"no signup call to action while signup is closed"* is about the **public
entry page**, which carries no form and does not link here.

**How it was caught:** the existing `foundation.spec.ts` journey *"signup and
password reset forms expose the complete validated fields"* failed, because
removing the form had deleted the surface `SH-LEGAL-007`'s consent assertions are
made against. **Reverted.** The statement now precedes the form, asserted as
**DOM order** — which is the literal requirement and something a screenshot could
not check.

### 3.2 The uniform-refusal journey was wrong twice, and the second time was instructive

- *Byte equality of the response* failed on `self.__next_r`, a per-response
  identifier Next injects. A difference with nothing to do with the property.
- *"The query is not reflected in the response"* then failed too — and for a real
  reason: **`searchParams` is serialized into the RSC flight payload** whether or
  not anything renders it. But that is the caller being handed back what the
  caller just sent. It reveals nothing, and it is not what `SH-SIGNUP-001`
  protects, which is that the response must not differ on facts the caller does
  **not** know — above all whether an address has an account.
- The third formulation compared the whole card and failed on
  `?error=signup_closed`, which renders *"Não foi possível continuar. Tente
  novamente."* — the **generic** banner. **That is the uniform-outcome mechanism
  working**, mapping every code to one message so no code can be told from
  another. A test that demanded byte-identical cards would have made a correct
  security control fail a test written to protect it.

**What ships** asserts what the requirement says: *"that statement"* — the
heading and the notice — is identical across five different inputs, with a
control proving the page really is the closed register page. Proving the
account-existence half needs a registered address to compare against and belongs
to the authenticated suite, not to a lane with no database. **Stated, not
claimed.**

### 3.3 The guard read its own commentary

Three assertions failed on first run because they scanned source text that
included the comments explaining them: `entry-page.tsx` says *"it does not link
to `/auth/register`"*, and `src/app/page.tsx` records the
`redirect("/pt-BR/app")` it replaced. This repository has met the mirror image —
a check that **passed** because it contained its own subject. The resolution is
the same either way: **test the code and strip the commentary**, never delete the
comment to satisfy a regex. A `code()` helper does it once, and assertions about
copy read the copy module, where there is no commentary to confuse.

---

## 4. Requirement by requirement

**`-001` built.** `/` negotiates from `Accept-Language` and redirects to `/pt-BR`
or `/en`. Quality values are honoured over source order, `q=0` means *not this
one*, a malformed header returns a locale rather than throwing (it is untrusted
input reaching a public page), and `pt-BR` is reached **only** when nothing is
understood. Nine unit cases and a five-header journey.

**`-002` built.** Four claims, no fifth. Each is checked against the tree by
`entry-page-guard.test.ts`, and the evidence map is a `Record` over the claim
union — so a claim added without evidence **fails to compile**. The
`stored_first` claim is proved in its strong form: capture persists through
`capture_entry_async` and **cannot reach a model at all**, asserted as an absence
with a presence beside it.

**`-003` built.** No link to `/auth/register`, no `<form>`, no `<input>`. The
waiting-list denial is structural rather than textual: with nowhere to put an
address the page cannot operate a list whatever it says. The copy guard was
narrowed to **promissory** language only — the first version forbade the words
*"lista de espera"* and failed on the notice that **denies** one, and rewording an
honest sentence to satisfy a regex would have been repairing the wrong artifact.

**`-004` built.** An authenticated visitor at `/` goes to `/{storedLocale}/app`
with no intermediate page. The stored value is validated with `isLocale` before
becoming a path segment, because `profiles.locale` is a `text` column.

**`-005` built.** The heading and the notice precede the form, asserted as DOM
order, in both locales.

**`-006` built.** Both surfaces read `isSignupOpenIn(process.env)` — the same
predicate `signUp` enforces — and the guard asserts the bound value is **exactly**
that expression, so a gate derived from a request value fails.

**`-007` built.** The proxy carries the requested path; the login page renders it
only if valid; **`signIn` re-validates it, and that is the boundary**. A form
field is whatever the client sends, and an open redirect firing immediately after
a successful sign-in is the worst possible moment for one — the cookie is fresh
and the visitor has just proved they trust the page. `safeReturnPath` is an
allowlist: one leading slash, this locale's own `/app` with a separator boundary
(`/pt-BR/apple` is refused), no scheme, no backslash, no control character, 512
characters maximum. Everything else becomes `null` and sign-in lands on the app's
home.

**`-008` baseline, and audited.** No entry-path surface was a dead end before this
slice: `login` and `register` carry links, `recover`, `reset` and `resend` each
carry a form and a link back, `consent` carries links and two forms, and
`account-state` carries the sign-out form — which is the only way out a suspended
account should have. The audit follows the delegation into the feature component
for `consent` and `account-state`, because a scan of the route file alone would
have called both dead ends and been wrong. The register page **gains** a second
way out, to the entry page.

---

## 5. Guards, and the mutations that prove they fail

| Mutation applied to the real tree | Result |
|---|---|
| the unconditional `redirect("/pt-BR/app")` comes back | **guard fired** |
| the entry page links to `/auth/register` | **guard fired** |
| the entry page grows an `<input>` | **guard fired** |
| the signup gate is made to depend on a query value | **guard fired** |
| capture is made to reference a model directly | **guard fired** |

Every file restored from a backup; the guard verified green again (23/23).

---

## 6. Gates

| Gate | Result |
|---|---|
| `npm run lint` | **zero errors** |
| `npm run typecheck` | **zero errors** |
| `npm test` | **7726 passed, 0 failed** (+72); the 3 failing *files* are the Windows-only shebang parse, green in CI |
| `npm run build` | **passes** |
| Playwright | **22 passed** on `desktop` **and** `mobile`, against the production build |
| `git diff --cached --check` | clean |
| Migrations created | **0** |
| Hosted parity | `202608140094`, unchanged |
| Rollout gate | **25 · 3 · 2**, unchanged |

**This slice's surfaces are public**, so unlike slice 2O.0 they are proved in a
real browser, against the production build, on two viewports and in both
locales — and those journeys live in `foundation.spec.ts`, which CI's database
job runs on every push. The proof obligation the plan records for 2O.1 is
**discharged in CI rather than deferred**.

---

## 7. What this slice did not do

No migration, no deploy, no secret, no `config.toml`, no CSP change, no RLS or
grant change, no new `SECURITY DEFINER` function, no new authority for
`authenticated`. Signup was not opened and the rollout gate was not touched. No
model call renders anything. `embedding_model` was not touched. No declined
residual was absorbed. **A13 was not retargeted**, and the roadmap successor is
not started, scoped or named.

**Carried forward:** the slice 2O.0 finding on `ai_provider`'s hardcoded write
still belongs to slice 2O.4, unchanged and unabsorbed.

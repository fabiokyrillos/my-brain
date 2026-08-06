# The account-deletion challenge — a standalone authentication hotfix

Not a phase and not a slice. A deployed defect, found by the online-harness
maintenance of 2026-08-06, fixed on its own branch before Phase 2H.

**Account deletion was impossible on the deployment**, and the surface blamed
the user's password for it.

## 1. The defect

`requestAccountDeletion` re-authenticates before an irreversible action:

```ts
await supabase.auth.signInWithPassword({ email: user.email, password })
```

That is a **password grant**, and hosted GoTrue applies CAPTCHA enforcement to
password grants — not to "the login page". The call forwarded no
`captchaToken`, so from the moment SH.5 enabled Turnstile it answered:

```
400 {"error_code":"captcha_failed",
     "msg":"captcha protection: request disallowed (no captcha_token found)"}
```

measured directly against the deployed project, not inferred. The action then
mapped every re-authentication failure to one code, so the user read:

> **A senha não confere.**

— for the correct password, with no way to proceed and nothing pointing at the
real cause. Deletion is the one action a user must always be able to complete;
this made it unreachable.

## 2. Why the other four surfaces were right and this one was not

`src/features/auth/actions.ts` carries `signIn`, `signUp`, `recoverPassword`
and `resendConfirmation`. All four forward a token, and a guard asserted it —
**by name, over that one file**:

```ts
for (const action of ["signIn", "signUp", "recoverPassword", "resendConfirmation"]) { … }
```

The guard was true and the requirement it served was satisfied. It simply could
not see a fifth password grant living in `features/account/`, written in SH.2 —
*before* the CAPTCHA control existed — by which time nobody was looking for
password grants outside the auth feature.

That is the generalisable part: **a list of known call sites is not a property
of the system.** The guard is now stated over the whole source tree — every
`signInWithPassword` in `src/` must read a token, forward it in `options`, and
distinguish `isCaptchaError` from a wrong password — with a case asserting the
list of found call sites is non-empty, so deleting the grants cannot make it
pass vacuously.

## 3. Why disabling hosted CAPTCHA was rejected

It would have "fixed" the symptom in one setting change. It is refused because:

- the control is enforced **at the provider** precisely so a client cannot
  bypass it; SH-CAPTCHA-002 is satisfied only because UI-only enforcement is
  structurally impossible;
- the actual bug is four missing lines in one action, and trading a real
  boundary for that is not a trade;
- signup remains closed and the rollout gate is fail-closed; weakening the
  challenge would move a control the gate depends on.

Nothing about hosted CAPTCHA, GoTrue, or the four working surfaces changed.

## 4. What the fix does

1. **The page renders the shared `TurnstileWidget`** — the same component the
   auth forms use. No second CAPTCHA implementation.
2. **On the server, handed to the client surface as a node.** `DeletionSurface`
   is a client component; importing the widget there would put
   `turnstileSiteKey(process.env)` in the client bundle, where the key is read
   through a *function parameter* Next cannot statically inline. The key would
   come back `undefined`, the widget would render nothing, and every deletion
   would be refused for a missing challenge — a silent, configuration-shaped
   failure. A guard asserts the page renders it and the surface does not import
   it.
3. **The CSP permits the widget origin on that exact route.** This is the trap
   this repository has already fallen into once: two `Content-Security-Policy`
   headers are enforced as an **intersection**, so a looser second policy layered
   on the strict base is a no-op that looks like a fix. The base pattern's
   negative lookahead now excludes `account/delete`, and the new source names
   the **exact route** rather than `/account/:path*` — a wildcard would also have
   matched `/{locale}/account`, which the lookahead would *not* have excluded,
   producing a path served two policies. `/account-state` shares a prefix but not
   a path segment and is deliberately untouched.
4. **The token is forwarded**, in the supported contract:
   `signInWithPassword({ …, options: { captchaToken } })`.
5. **Nothing verifies the token.** Verification needs the Turnstile *secret*,
   which exists only in hosted GoTrue. A guard asserts no `siteverify` call
   anywhere in `src/`.
6. **The refusals are distinct** — see §5.
7. **The password grant is throttled.** It admits against the existing
   `signin_failure` kind, so **no migration**. This was the only password grant
   in the product with nothing in front of it: reachable from a session, but a
   password oracle all the same.

## 5. The refusal vocabulary

| code | means | decided by |
| --- | --- | --- |
| `session` | no authenticated session | the action |
| `phrase` | the confirmation word is wrong | the action, **before** the provider — so it costs neither a password attempt nor the single-use token |
| `captcha-missing` | no token, on a deployment that renders a widget | the action, before any provider call |
| `captcha-failed` | the provider rejected the token | **GoTrue** |
| `password` | the provider rejected the credential | **GoTrue** |
| `throttled` | the ceiling was reached | the throttle |
| `unavailable` | the throttle could not answer | the throttle |
| `lifecycle` | the account is not `active` | the database |
| `failed` | anything else, with no provider or database text leaked | the action |

`captcha-missing` is decided **without verifying anything**: it is the absence
of a token where a widget renders, which is a tampered or blocked submission,
not a failed challenge. Where no site key is configured — local development and
CI, deliberately (SH-CAPTCHA-005) — no token is required, because refusing there
would make the surface untestable without a hosted secret and would let a green
CI run imply a control it never exercised.

A Turnstile token is single-use, so a refusal the provider actually answered
spends it. The surface now says so (`retryHint`) instead of letting the next
attempt fail for an invisible reason. A wrong confirmation word deliberately
does not show that hint: it never reached the provider.

## 6. What was proven, and how

### Executed — unit and component (`npm test`, 4107 passed)

- the token is forwarded in `options.captchaToken`;
- a **missing** token is refused before the provider, and neither the password
  nor the throttle is touched — a stripped hidden input buys no password oracle;
- blank, whitespace and oversized (>2 KB) tokens are all "no token";
- **no** token is required where no site key is configured;
- a provider-rejected token is `captcha-failed`, never `password` — asserted
  against the exact copy, in both directions;
- a wrong password with a good token is still `password`;
- the throttle admits as `signin_failure`, refuses `throttled` and `unavailable`
  distinctly, and finalizes `refused` rather than leaving an attempt reserved;
- the widget renders **inside the form** (outside it, the token is never
  submitted — indistinguishable at the server from a widget that never ran);
- the page renders the widget and the client surface does not import it;
- every `signInWithPassword` in `src/` forwards a token and uses
  `isCaptchaError`; the found-call-site list is asserted non-empty;
- the CSP allows the origin on the auth routes **and** the deletion route,
  nowhere else, and every route matches exactly one source — including
  `/account-state` and the wildcard path that was deliberately not written.

### Executed — hosted, against the deployed project

`node scripts/online-playwright.mjs e2e/online-account-deletion.spec.ts`:
**3 passed · 1 skipped · 0 failed.**

- a wrong phrase refuses **before the provider is asked anything**;
- **the defect, inverted**: the app under test carries no site key, so no token
  is produced, while the provider is the hosted one with CAPTCHA on. The
  surface now reports the **challenge** refusal and explicitly **not**
  `A senha não confere.` — which is precisely the sentence the defect produced
  for a correct password. The account is still `active` afterwards;
- no refusal path mutated the account, restated as its own assertion.

The disposable account is created and removed per run;
`npm run verify:online-residue` reports **zero fixture residue** afterwards.

### Not executed, and why — the one remaining owner step

**The successful deletion (valid token + correct password) has not run.** It
needs a *valid* Turnstile token, and hosted Turnstile declines automated
browsers by design — that refusal is SH-CAPTCHA-002 working. There is no honest
automated route:

- solving the challenge headlessly is what the control exists to prevent;
- a Cloudflare "always passes" test key would make the assertion vacuous. That
  is not hypothetical: an always-passing test key already produced two wrong
  published verdicts in this repository, and the lesson recorded from it was
  that **a control must not be exempt from the mechanism it is testing**;
- disabling hosted CAPTCHA would weaken the control to prove the control.

So it stays `test.fixme` with the reason named, and the smallest owner action is
in §8. **No CAPTCHA-valid path is claimed as passed.**

## 7. Hosted, non-destructive: `npm run verify:deletion-captcha`

Reads the deployed response rather than the repository — the headers a browser
enforces and the HTML it parses, which is the only place the CSP failure is
visible. It signs in a **disposable** account through the link exchange, fetches
`/pt-BR/account/delete`, and asserts: exactly one CSP header, the widget origin
permitted in `script-src`, `frame-src` and `connect-src`, the `cf-turnstile`
container present, the response field named `captchaToken`, a site key present,
**no second key-shaped value and no secret variable name in the document**, and
both form controls intact. It then deletes the disposable account. It submits
nothing and deletes nothing else.

<!-- HOSTED-RESULT -->

## 8. The smallest owner action

One interactive pass, on the deployment, with a **disposable** account — never
the owner's:

1. sign in as a disposable account (or ask for one to be provisioned);
2. open `/pt-BR/account/delete`;
3. solve the Turnstile challenge by hand, type `EXCLUIR`, enter the correct
   password, submit;
4. confirm the account is destroyed and the session ends.

That is the only step no automation may honestly perform. Everything before the
challenge is proven above.

**No secret value is requested.** The Turnstile secret stays in hosted GoTrue.

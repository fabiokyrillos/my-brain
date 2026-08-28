# Push hardware validation — backlog

**Status: backlog. Not an authorized initiative.** This document declares **no
requirement identifiers**, allocates **no migration**, and authorizes **no
implementation**. It exists because ADR-107 deferred real-device validation of
push out of Phase 2M and a residual with no place to go is a residual that
disappears.

Created 2026-08-12 by ADR-107, in the same change that closed Phase 2M.

---

## 1. What is true, stated before anything is planned

**Push is implemented and hosted.** Migration `202608120092` is applied, hosted
parity is `202608120092` across 92 migrations with local = remote on every row,
the `send-push` Edge Function is deployed with edge parity green, and 47 of 47
hosted claims passed through real PostgREST under real roles with RLS enforced.

**Push fails on the owner's real iPhone**, with `HTTP 403` from Apple Web Push.
Two runs, the second after the VAPID subject was corrected to a real operational
address:

```json
{ "ok": true, "status": "sent", "delivered": 0, "retired": 0, "failed": 1,
  "diagnostics": [{ "category": "unauthorized", "status": 403 }],
  "subject": "operational" }
```

No notification arrived. The PWA was installed from the home screen,
notifications were active, and the application was in the background.

**Push has never been executed on Android.** The owner has no Android device.
That is a separate limitation and is not evidence about the iPhone.

---

## 2. What has been eliminated, and what has not

Eliminated **by measurement**, never by reading, and never by printing a value:

| claim | verdict | how |
|---|---|---|
| the application's VAPID public key equals the Edge Function's | **match** | `sha256` of each, compared locally |
| the configured pair is self-consistent | **`pair: "consistent"`** | the deployed sender's `mode: "selfcheck"`, which signs a probe with the private half and verifies it with the public half |
| the public key is a real uncompressed P-256 point | **yes** | 65 bytes, `0x04` prefix |
| the key predates the subscription | **yes** | secret set 10:16 UTC; the owner re-subscribed after 14:47 UTC |
| the VAPID `sub` is an address a service could use | **`operational`** | the sender's own categoriser |
| `VAPID_PRIVATE_KEY` absent from the application environment | **yes** | `vercel env ls` |

**Not eliminated, and deliberately not guessed at: why Apple answers 403 when the
authentication's two halves agree.** A consistent pair rules out a key mismatch.
It explains nothing. **No root cause is asserted anywhere in this repository**,
and the next person to work on this should treat every hypothesis below as
unproven.

Unexcluded hypotheses, in no order of likelihood:

1. An Apple-specific requirement of RFC 8292 the sender does not produce.
2. A property of the subscription itself that the endpoint does not reveal.
3. A requirement on the request beyond the VAPID token — a header, an ordering, a
   size — that Apple enforces and other services do not.
4. An account, entitlement or origin condition on Apple's side.

The construction was compared to the reference implementation and is equivalent
in `aud` (the endpoint origin, never the path), `exp` (12 hours, inside the
24-hour ceiling), `alg` (`ES256`), signature encoding (raw `r ‖ s`, not DER), the
`Authorization: vapid t=…, k=…` form, and the `aes128gcm` headers. **That
equivalence is an observation, not an exoneration.**

---

## 2.1 What the 2026-08-28 corrective read measured, and one recorded fact it contradicts

Measured read-only against the hosted project, reported as verdicts, and never by
printing a key, an endpoint or an address:

| claim | verdict | how |
|---|---|---|
| either VAPID half has changed since the subscription was created | **no** | both secrets carry `updated_at = 2026-08-12T10:16:28Z`, and neither has moved since |
| the subscription was created **after** the deployed key was set | **yes**, by 3h13m | `push_subscriptions.created_at = 2026-08-12T13:29:14Z` |
| `VAPID_PRIVATE_KEY` reachable from the application | **no** | only `VAPID_PUBLIC_KEY` exists on Vercel, marked *Sensitive* |
| the deployed sender is the sender in `main` | **byte-identical** | the deployed source downloaded over the working tree; `git diff --numstat` reported no rows at all |
| the stored subscription is structurally usable | **yes** | host `web.push.apple.com`; `p256dh` 87 canonical base64url characters decoding to a `0x04`-prefixed point; `auth` 16 bytes |
| the delivery ledger still holds the two failed runs | **no** | `notification_deliveries` is empty across every channel |

Together these **eliminate the stale-key-binding reading of hypothesis 2**: the
subscription cannot have been bound to a key generation that no longer exists,
because there has only ever been one and it predates the subscription.

**And one recorded fact is wrong, in the reassuring direction.** §57 of the
handoff recorded *"the owner re-subscribed after 14:47 UTC"*. The row's
`created_at` is `13:29` and only its `updated_at` moved, to `17:11` — and
`push_subscriptions`' upsert resets `failure_count` on conflict, so a
**re-registration of the same endpoint** is exactly what that pair of timestamps
looks like. The subscription was never re-created. As it turns out it did not
need to be; but the claim was believed rather than measured, and §3.6 below is
the defect that would have made it impossible to honour anyway.

**The subscription stood at `failure_count = 2` of 3, with `last_delivered_at`
still null.** `finish_push_delivery` sets `state = 'expired'` on the third strike
and the consent follows the last device out, so the next failing diagnostic run
would have destroyed the only device this residual can be investigated with.
That is repaired ahead of any further send; see §3.1.

---

## 2.2 The probe ran, and its first reading was corrected (2026-08-28)

The owner ran `mode: "vapid_probe"` through the Vault/`pg_net` path, so the
dispatch secret never left the database. Apple answered `BadJwtToken` / 403 to
**both** the real token and the corrupted-signature control.

That was recorded as `verdict: "vapid_rejected"`, and **that verdict was
over-stated.** Both requests named a fabricated resource and varied only the
token; a service that answers `BadJwtToken` to anything it cannot find yields the
identical reading. The probe was missing the control that separates the two.

**The token itself is correct, established against an independent verifier.**
ECDSA P-256 verification written from the curve equations in BigInt — sharing no
code with the signer — accepts RFC 8292 section 2.4's published token, rejects it
with one bit flipped, and accepts ours. The protected header is byte-identical to
the RFC's, the claim set and its order match, `exp` sits inside the 24-hour
ceiling, the signature is 64 raw bytes rather than DER, and a token signed by a
key other than the one `k=` advertises is refused. Cross-checked in a second
runtime and crypto library (Node/OpenSSL vs Deno/WebCrypto).

So `2M-NOTIFY-011`'s **header, algorithm, audience, subject, expiry, ES256
signature, JOSE encoding, base64url and `Authorization` construction are all
eliminated.** Hypothesis 1's "an Apple-specific requirement of RFC 8292 the
sender does not produce" is narrowed to a requirement that is **not visible in
the token**, and hypotheses 3 and 4 gain weight accordingly.

The probe now sends five variants — `real`, `corrupted`, `absent`, `ephemeral`,
`expired` — and emits no verdict at all while an unauthenticated request draws
the same answer as the real token.

---

## 3. The work, when it is authorized

Nothing here may be closed by writing a document, and nothing here may be closed
by an emulated run.

### 3.1 The refusal

- Investigate Apple Web Push's `403` **after** a consistent self-check. Capture
  what the service says beyond the status, without ever putting an endpoint, a
  subscription or a key into a diagnostic.
- Decide, with evidence, whether the sender's request must change at all.

### 3.2 iOS, after any repair

- Real iPhone, installed PWA, permission after an explicit gesture.
- Delivery observed with the application in the **foreground**, in the
  **background**, and with the device on the **lock screen**.
- The notification's content checked against the content-free contract — type,
  destination and locale, and nothing that could name a task, a person or a day.
- **Tap** opens the declared destination (deep link), and the destination is the
  one the payload named.
- **Revocation** from the surface stops delivery, and the consent follows the
  last device out.
- **Quiet hours, the daily cap and the 24-hour cooldown** observed on a device
  rather than in pgTAP — the controls are proved server-side already; what is
  unproved is that a real device sees the consequence.
- Device model and iOS version recorded with each observation.

### 3.3 Android

- Android Chrome, and the installed PWA, through the whole of §3.2.
- **The owner has no Android device**, so this needs a device, a borrowed one, or
  a decision to accept it unvalidated. That is an owner decision and is not taken
  here.

### 3.4 Screen readers

- **VoiceOver** on iOS and **TalkBack** on Android over the notification surface
  and the five consent states. `2M-ACCESS-007` is partial for exactly this and
  has no other remainder.

### 3.5 The two inherited Phase 2L residuals

- `2L-MOBILE-008` and `2L-ACCESS-008` were routed to Phase 2M by `2M-DEVICE-005`
  and are **still open**. They belong to the same owner-run device session and
  travel here rather than being absorbed.

---

### 3.6 A separate defect: the product cannot re-subscribe

**Recorded on 2026-08-28, deliberately NOT repaired in the same change as the
403 instrumentation, and explicitly NOT offered as an explanation of the 403.**

`push-controls.tsx`'s enable handler reuses whatever subscription the browser
already holds:

```ts
let subscription = await registration.pushManager.getSubscription();
if (subscription === null) {
  subscription = await registration.pushManager.subscribe({ ... applicationServerKey: key });
}
```

Nothing compares that subscription's `applicationServerKey` to the key the
deployment is currently configured with. A subscription is bound to the
application server key it was created with, for its whole life, and a push
service is entitled to refuse a token advertising any other. So if the two ever
diverge — a rotated pair, a restored backup, a second environment — every send
fails permanently and **pressing the button again cannot fix it**: the branch
that would re-subscribe is unreachable while a subscription exists, so the user
re-registers the same stale endpoint and the row's `updated_at` moves while its
binding does not.

**This is not the current 403.** §2.1 measured that both halves have been frozen
since `2026-08-12T10:16:28Z` and that the subscription was created three hours
later, so there is no divergence for it to be the consequence of. It is recorded
here because it is real, because it is a latent trap that makes any future key
rotation unrecoverable through the product's own surface, and because the belief
that the owner "re-subscribed" — which this defect makes impossible — was carried
in the record for sixteen days.

The repair, when it is authorized, is to compare the existing subscription's
`applicationServerKey` against the configured key and `unsubscribe()` before
re-subscribing when they differ. It needs no migration. It must not be folded
into the 403 work unless later evidence shows it participates in the cause.

---

## 4. One residual that is not about push

`src/lib/closeout/phase-2m-fixed-offset-guard.test.ts` found **four surfaces that
still render an instant in the host's zone** — the same defect slice 2M.3 fixed
on the notification list, where `new Intl.DateTimeFormat(locale, { dateStyle,
timeStyle })` carries no `timeZone` and therefore renders in UTC on the server:

- `src/features/daily-cycle/entry-review.tsx`
- `src/features/daily-cycle/inbox-item.tsx`
- `src/features/daily-cycle/needs-attention-item.tsx`
- `src/features/daily-cycle/technical-details.tsx`

They were **recorded rather than repaired**, because the repair threads the
owner's zone through two routes, `home-view.tsx`, `needs-attention-list.tsx` and
roughly twenty-seven component call sites — a product change inside a closing
commit, which is how a phase's last change becomes its riskiest.

The guard names all four explicitly and **asserts each still carries the defect**,
so the exemption cannot outlive the repair: the day one is fixed, the guard fails
until the name is removed. A fifth surface cannot join quietly — the count is
asserted.

---

## 5. What this document may not become

It may not be read as authorization to start work, to spend a migration, to
change VAPID configuration, to send further pushes to the owner's device, to open
signup, or to touch the rollout gate. It names no successor phase and does not
retarget **A13**.

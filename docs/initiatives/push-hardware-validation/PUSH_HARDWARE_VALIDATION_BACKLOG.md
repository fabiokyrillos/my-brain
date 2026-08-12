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

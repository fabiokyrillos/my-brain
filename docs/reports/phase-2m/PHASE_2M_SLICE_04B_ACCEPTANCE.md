# Phase 2M — slice 2M.4b acceptance record

**Slice:** 2M.4b — push delivery. The slice that makes 2M.4a's rules capable of
refusing something real.
**Signed decisions executed against:** OD-2M-4 B (push authorized, opt-in,
content-free payload), OD-2M-6 A (visible controls only), OD-2M-5 (the owner runs
the hardware proof), ADR-105 and ADR-106 (three migrations, non-transferable).
**Migrations spent:** **one** — `202608120092_phase_2m_push_delivery.sql`. The
budget closes at **`3 allocated · 3 spent`**, all three non-transferable. **A
fourth is a stop condition** and none was created.
**Hosted parity at the time of writing:** `202608110090`. The deployment step
applies `202608110091` and then `202608120092`.

---

## 1. Requirements

| Requirement | Status | Evidence |
|---|---|---|
| `2M-NOTIFY-001` | **built** | `register_push_subscription` is the only path to `granted` and records `recorded_at`; `revoke_push_consent` marks consent **and every subscription in one transaction**, and is idempotent. pgTAP: `revocation succeeds in one step`, `revocation marked the subscription too — not just the consent (T-09)`, `revoking twice is not an error` |
| `2M-NOTIFY-002` | **built** | Absence refuses, with no row required to say so. pgTAP: `a user with NO consent record at all is refused — absence is not permission`, plus `readPushConsent` resolving every failure shape through `NO_CONSENT` (`consent-reader.test.ts`, 6 assertions) |
| `2M-NOTIFY-003` | **built** | The prompt lives in one click handler in one allowlisted file. `notification-settings.test.tsx` fails the build if `Notification.requestPermission` is reached during a render of **any** of the five states, and asserts the benefit and the content promise render **above** the control that prompts |
| `2M-NOTIFY-004` | **built** | Type and frequency on the consent; quiet hours and the cap in `agent_preferences`, **upserted** so a missing row cannot silently discard them. pgTAP: `the quiet hours really persisted rather than being silently discarded`, `editing preferences created an 'unsupported' consent, never a 'granted' one` |
| `2M-NOTIFY-005` | **built** | All six controls applied **on the server before sending**, in `governance.ts`'s order, against this channel's own counters. pgTAP names each: `type_muted`, `quiet_hours`, `duplicate`, `cooldown`, `daily_cap`, `not_consented`, each with a positive control beside it. The quiet-hours predicate is proved equal to the heartbeat's inline one **at every quarter hour** |
| `2M-NOTIFY-006` | **built** | Payload is type + destination + locale, built by `buildWirePayload`, which has **two parameters and no third a title could arrive through**. `deliver.test.ts` asserts a `title` offered alongside a valid request is discarded rather than forwarded, and that the readable payload does not appear in the bytes on the wire |
| `2M-NOTIFY-007` | **built** | Structural, in both runtimes, and held across the boundary by `push-payload-parity.test.ts` — the whole locale-by-type matrix compared **behaviourally** between the app contract and the worker copy |
| `2M-NOTIFY-008` | **built** | `public.notifications` is untouched. The migration's own self-check refuses a `title`/`body`/`payload`/`metadata`/`data` column on any of the three new tables, read from the catalogue |
| `2M-NOTIFY-009` | **built** | Every refusal writes a `suppressed` row naming **which control refused** and the consent instant in force. The audit is content-free by CHECK, not by care |
| `2M-NOTIFY-010` | **built** | Five distinguishable states rendered and announced; retry bounded **twice** (per delivery and per device), both under a CHECK ceiling; expired subscriptions retired rather than retried; the consent follows the last device out |
| `2M-NOTIFY-011` | **built** | Private key only in the Edge Function environment. The boundary guard sweeps every file under `src/` and `public/` for its variable name with **exactly one exemption — itself** — over 500 files. No product path uses `service_role`: all four user-facing RPCs run as `authenticated` and take the owner from `auth.uid()` |
| `2M-METRICS-003` | **built** | Six of six events now have a producer. `notification_consent_changed` from the Server Action, `notification_suppressed` from the worker |
| `2M-MOBILE-003` / `-004` | **built** | `push-controls.tsx` named in the no-gesture guard, which its own discovery assertion **forced** |
| `2M-MOBILE-005` | **built** | `daily-surfaces.spec.ts` covers the three control states at both viewports, in both locales, 56 tests green on desktop and Pixel 7 |
| `2M-ACCESS-004` | **built** | Every fieldset carries a legend, asserted in the component test **and** in the browser lane |
| `2M-ACCESS-007` | **partial** | Real screen reader is owner-run. **Destination: the hardware checkpoint below.** |

---

## 2. Six defects in the migration, and four more in its own test suite

The migration was complete at the previous stop and was **reviewed rather than
trusted**. All were fixed in place, which is correct precisely because the file
was neither merged nor hosted — and a fourth migration to repair a third one
would have been the stop condition.

**Five were found by reading. The sixth was found by CI, and it was the worst
one** — see §2b. That ordering is worth recording: careful review caught the
defects that would have failed *later*, and only execution caught the one that
would have failed *immediately*.

1. **`pg_catalog.coalesce` / `.least` / `.greatest` cannot resolve.** They are SQL
   grammar with no `pg_proc` entry, and under `set search_path = ''` there is no
   fallback. plpgsql parse-analyses expressions at **first execution**, so the
   migration would have applied cleanly and failed on the first real send. Found
   by `sql-grammar-guard.test.ts`, whose historical allowlist was **not** widened.
   Nine occurrences, all corrected.
2. **`update_notification_preferences` could discard quiet hours in silence.** A
   bare `update … where user_id = actor` matching no row succeeds, and the
   function returned `{"updated": true}` having written nothing — the exact
   "sets quiet hours once and is still pushed at 03:00" failure the migration
   refused a second column in order to avoid, arriving through the back door.
   Now an upsert, and pgTAP proves the row is created.
3. **`failure_count` was a column with a CHECK and no writer.** Retry was bounded
   per delivery only, so a device that failed every time without ever returning
   410 would be retried forever — one fresh three-attempt delivery at a time.
   `finish_push_delivery` gained a failed-id list, and the success reset is scoped
   to the devices that actually received, so a sibling delivery cannot forgive a
   failing device.
4. **A granted consent with no live device returned `permitted`.** The sender
   would have had an empty send list, burned all three attempts failing at
   nothing, and retired the delivery. Now refused as `not_consented` — truthful,
   and the only one of the six the deployed vocabulary admits for this.
5. **The endpoint's SSRF comment described a control that did not exist.** Only
   `https` was checked. Now the shapes that are never legitimate are refused —
   loopback, private ranges, link-local, dotless hosts, and a `user:pass@` prefix
   hiding a loopback behind a legitimate-looking host — with the positive
   push-service allowlist in the sender, where it costs a redeploy rather than a
   migration.

### 2b. The sixth, which only execution could find

6. **`pg_catalog.position('x' in y)` is a parse-time syntax error, so the
   migration would not have applied at all.** `position(x IN y)` is a **parsed
   form** — the keyword inside the parentheses is grammar, and it is grammar only
   for the unqualified spelling. CI's `supabase db reset` failed with `42601
   syntax error at or near "pg_get_functiondef"`.

   This is the same family as defect 1 and strictly louder: `pg_catalog.coalesce`
   deploys clean and fails on the first send, while this never deploys.
   `sql-grammar-guard.test.ts` named only the first family and was blind to the
   second. It now names both — `position`, `overlay`, `substring`, `trim`,
   `extract` — with a control proving each is detected **and** a control proving
   the ordinary replacements (`strpos`, `substr`, `btrim`, `date_part`) are not,
   so the fix does not push authors back toward the unqualified spellings. The
   historical allowlist did not grow, and the whole 92-migration chain passes.

### 2c. Four defects in the suite, found by its first real execution

Once the migration applied, the pgTAP suite ran for the first time and **47 of 90
assertions failed**. Every one traced to real problems, and three of them were
other guards refusing to be silent about the new tables.

1. **My own fixtures violated the CHECKs I wrote.** `push_subscriptions.p256dh`
   is checked 16..256 and `.auth` 8..256; `'p256dh-a'` is 8 characters and
   `'auth-a'` is 6. The first registration died, `lives_ok` swallowed it, owner A
   ended with no consent, and every downstream delivery answered `not_consented`.
   One root, 47 symptoms.

   Its second-order effect is the interesting half: with consent absent, each
   call wrote a **suppressed** row, and suppressed rows are not covered by the
   in-flight unique index — so two rows shared a `dedupe_hash` and the superuser
   id-pin tried to give both the same primary key. The pins are now scoped
   `and outcome = 'pending'`, which the index guarantees is at most one row.

2. **`signup_hardening_cascade_drill.sql`** enumerates every user-owned table
   from the catalog at run time and requires a row for the doomed account. It
   named all three new tables **by name**, on the first run of the migration that
   created them, without anybody having remembered to add them. That is T-32
   working exactly as designed.

3. **`signup_hardening_grant_census.sql`** pins the `authenticated` DML matrix as
   a norm plus named exceptions. All three deviate as `SELECT`-only, and that is
   the posture — a line here gaining INSERT would mean it had been given away.

4. **`signup_hardening_retention.sql`** pins the retention registry to exactly
   the declared windows, so a class the database will one day delete rows for
   cannot be added silently.

---

## 3. What was proved, and how

### The cryptography is proved against the RFCs, not against itself

`web-push.test.ts` reproduces **RFC 8291 section 5's published worked example
byte for byte**, with the ephemeral sender pair and the salt pinned so the
construction is deterministic. This is the single highest-value proof in the
slice: a round-trip test would have agreed with itself while both halves used the
same wrong info string, the same wrong salt order or the same wrong padding
delimiter — each of which produces a body a real push service **accepts** and a
real browser **silently discards**. The symptom would have been "nothing arrives
on the phone", discovered at the owner's hardware checkpoint, which is the worst
possible place to find a KDF bug.

`npm:web-push` was refused deliberately. It is built on Node's `crypto`, this
runs on Deno's Edge Runtime, and that combination is exactly the class of
dependency that passes a local `deno test` and fails deployed.

### The suppression producer is asserted where the scan cannot see it

`notification_suppressed` is emitted from `supabase/functions/`, which the
telemetry guard's producer scan does not walk. That gap is precisely how a
producer goes invisible, and this repository has paid for it — SH.6's quota
refusals recorded nothing for weeks. So the sixth producer is asserted **by name,
against the file that emits it**, including that its properties are exactly the
two the deployed validator admits and that the item's digest does not appear in
the event.

### Guards were retargeted, never weakened

| guard | what changed | what compensates |
|---|---|---|
| push boundary | allowlist grew from 3 to 8 | split in two, and the **application half is asserted separately at exactly three** — the sender may grow files, the browser-loadable side may not |
| push boundary | a new "asserts about push, doesn't do push" category for tests | closed list, every entry proved to be a test file, and **proved to contain no `subscribe(`, `showNotification(` or permission request**, with a non-vacuity check that the patterns still fire on the real worker |
| BYOK-GUARD-005 | the keyed-crypto rule admitted **no** exception; now it admits the push crypto module | four new assertions: the exception is a closed list, may read **no** BYOK secret name (non-vacuously checked), may not import BYOK, and BYOK may not import it. Routing push crypto *through* the BYOK core would have put a notification path inside the module holding `BYOK_MASTER_KEY` — satisfying the rule literally while defeating its purpose |
| private-key sweep | **unchanged, still exactly one exemption** | `consent-reader.test.ts` assembles the variable name at runtime rather than spending an exemption, because that sweep is worth more than one line's readability |

---

## 4. What this slice does NOT prove — never round this up

- **No push has been delivered to a real device by this work.** Every test is a
  fake `fetch`. The cryptography is proved correct against the RFC; that a phone
  displays the result is the owner's hardware checkpoint and nothing here
  discharges it.
- **The pgTAP suite had never executed against a real Postgres** at the time it
  was written — there is no local Docker. CI's `database` job is its first real
  run, and any failure there is a defect in this work, not an environment.
- **No screen reader has read this surface.** `2M-ACCESS-007` is owner-run.
- **An emulated viewport is a viewport, not a device.** The Pixel 7 project
  proves reflow and touch targets; it does not prove Android Chrome push.
- **Nothing is scheduled.** No producer calls the sender automatically yet: the
  heartbeat wiring would need a claim RPC, which would be a fourth migration and
  therefore a stop condition. The sender is invoked explicitly, and that
  remainder is stated rather than implied.

---

## 5. Gates

| Gate | Result |
|---|---|
| `npm run lint` | recorded in the deployment record |
| `npm run typecheck` | recorded in the deployment record |
| `npx vitest run` | recorded in the deployment record |
| `deno test` over `supabase/functions/` | **104 passed, 0 failed** |
| `deno check` on all four entrypoints | clean; `send-push/index.ts` added to CI |
| Playwright `daily-surfaces.spec.ts` | **56 passed** (desktop + Pixel 7) |
| pgTAP `phase_2m_push_delivery.sql` | **90 assertions**, first executed in CI — red on the first run, green on the third |
| CI `application` / `database` / `edge worker` | green 3/3 on the PR head, recorded in the deployment record |

---

## 6a. Hardware run 1 — 2026-08-12: H-4 passed, **H-5 FAILED**

The owner ran the checklist on an iPhone. Recorded as executed, with the result
it actually produced.

| line | result |
|---|---|
| **H-4** — iOS installed PWA, permission after an explicit gesture | **executed and proved** |
| **H-5** — a real push arrives | **FAILED.** `ok=true status=sent delivered=0 retired=0 failed=1`, nothing arrived |
| H-1 … H-3, H-6 … H-14 | **not reached** — every one assumes delivery works |

### The failure exposed a second defect, in this work rather than in the platform

The function's logs held **only boot and shutdown**. Both of the sender's failure
paths — a non-2xx answer and a thrown exception — appended to `failed` and said
nothing at all, so an Apple rejection, a bad VAPID signature, a transport error
and a malformed subscription were **one indistinguishable observation**.

That is an observability defect in the sender, it was mine, and it could only
have been found on hardware: every offline test asserts what the code *does* with
a known failure, and none of them could notice that the code never *says* which
failure happened. The remedy is §6b.

**The checkpoint stays blocked.** Nothing about H-5 is discharged, and the
remaining lines are **not started** rather than passed.

## 6b. The diagnostic remedy, and the hypothesis it makes checkable

The sender now records, for every attempt that does not land, a **closed
category** and — when the push service actually answered — its **HTTP status**.
Twelve categories, each a constant chosen by this repository: `gone`,
`unauthorized`, `bad_request`, `payload_too_large`, `rate_limited`,
`server_error`, `unexpected_status`, `host_not_allowed`,
`subscription_malformed`, `vapid_key_malformed`, `network_error`,
`unknown_error`.

**Nothing else travels.** No endpoint, no subscription id, no owner, no key, no
payload, and — deliberately — **no text from the push service's response**, which
is third-party data and is exactly how an endpoint or a token ends up in a log it
was promised not to be in. A test feeds a recognisable marker into every one of
those and asserts that neither the returned outcome nor anything written to the
console contains it, with a non-vacuity check that something *was* logged.

**Retirement is unchanged and still exactly 404/410.** The diagnostic vocabulary
is deliberately wider than the retirement rule: a `401` now has its own name so
it can be *seen*, and it still must not retire a device, because a rejected
signature is our configuration being wrong rather than the user's browser having
discarded anything. A test asserts the retirement set across `404, 410, 403, 500,
429, 400`.

### The leading hypothesis, made answerable in one run

Comparing against a known-working deployment, the cryptography is structurally
equivalent — P-256, ECDH, HKDF with `WebPush: info`, `aes128gcm`, the `0x02`
delimiter, the RFC 8188 header and VAPID ES256 — and ours is additionally proved
against **RFC 8291 section 5's published vector, byte for byte**. So the
cryptography is not the suspect and has not been touched.

The visible difference is the VAPID `sub`. The working deployment uses a real
domain; this one's **default** is `mailto:ops@my-brain.invalid`, and `.invalid`
is RFC 2606 reserved and guaranteed never to resolve. RFC 8292 defines `sub` as
an address the push service operator can be contacted at, and Apple is documented
as strict about it.

**This is not asserted as the cause.** It is made *observable*: the sender now
reports the subject's **category** — `operational`, `reserved` or `malformed`,
never the address — in the same response as the HTTP status. One hardware run
therefore answers both "what did Apple say" and "was our subject even usable",
instead of needing two. A test asserts the shipped default categorises as
`reserved`, importing the constant rather than restating it.

The fix, if the hypothesis holds, is **configuration**: `VAPID_SUBJECT` is
already read from the environment, so an operational address is a secret the
owner sets and never a personal address compiled into this repository.

`Urgency: normal` and the TTL difference are noted and **deliberately not
changed here** — bundling them would make the next run's result ambiguous about
which change mattered.

## 6c. OWNER CHECKPOINT — the hardware proof (OD-2M-5)

**Nothing in this repository can discharge any line below.** Every test here uses
a fake `fetch`; the Pixel 7 Playwright project is an emulated viewport, not a
device; and no push service has ever been contacted by this code. What follows is
the exact procedure, split by what it blocks.

### 6.1 What blocks slice 2M.5, and what blocks only closeout

| # | Check | Blocks |
|---|---|---|
| H-1 | Android Chrome, installed PWA: permission after an explicit tap | **2M.5** |
| H-2 | Android: a real push arrives in **background** | **2M.5** |
| H-3 | Android: tapping it lands on the authorized destination | **2M.5** |
| H-4 | iOS Safari 16.4+, **installed to the home screen**: permission after an explicit tap | **2M.5** |
| H-5 | iOS installed PWA: a real push arrives | **2M.5** |
| H-6 | Revocation stops delivery on both platforms | **2M.5** |
| H-7 | iOS Safari **not installed**: the surface says the home-screen step, and offers no button that cannot work | closeout |
| H-8 | Foreground behaviour on both platforms | closeout |
| H-9 | Lock-screen rendering carries **no content** | closeout |
| H-10 | Quiet hours suppress a real send | closeout |
| H-11 | Daily cap suppresses a real send | closeout |
| H-12 | 24-hour cooldown suppresses a real re-send | closeout |
| H-13 | Screen reader (VoiceOver / TalkBack) on the settings surface | closeout |
| H-14 | Touch targets and reflow on real hardware | closeout |

**Why the split.** 2M.5 cannot be planned without knowing that delivery *works at
all* on both platforms and that consent can be withdrawn — those are the
assumptions any further notification work would build on. H-7 through H-14 are
quality and governance evidence: real, required for closeout, but they do not
change what 2M.5 would be.

### 6.2 The procedure

**Before touching a device.** Confirm the sender answers: a `POST` to the
deployed function with a wrong `x-dispatch-secret` must return **401**, and with
no body must return **400**. If either returns 200, stop — the gateway is not
enforcing what it should.

**Android (H-1, H-2, H-3, H-6, H-8, H-9, H-11, H-12, H-14)**

1. Chrome → the production URL → sign in → menu → **Install app**. Open the
   installed icon, not the browser tab.
2. Go to **Notifications**. Read the benefit and the content promise **before**
   pressing anything — if a permission prompt appears without a tap, that is a
   `2M-NOTIFY-003` failure and the run stops there.
3. Tap **Ativar avisos neste aparelho**. Accept the OS prompt. The state line must
   change to the `granted` sentence.
4. Send one real push (owner-run, with the dispatch secret). Confirm it arrives
   with the app **backgrounded**, then again with it **foregrounded**, then with
   the screen **locked**.
5. On the lock screen, read the notification text. It must say only that
   something is waiting — **no task title, no name, no date, no count**. Anything
   else is a `2M-NOTIFY-006` failure and is the one finding that would block
   everything.
6. Tap it. It must open the installed PWA on the destination for that type, and
   must **not** open a second window if one is already open.
7. Set quiet hours to a window containing *now*, send again, confirm nothing
   arrives, and confirm the ledger recorded `quiet_hours`.
8. Set the cap to the number already delivered today, send again, confirm nothing
   arrives and the ledger says `daily_cap`.
9. Send the **same item** twice within 24 hours; the second must not arrive and
   the ledger must say `cooldown` — not `duplicate`.
10. Tap **Desativar**. Send again. Nothing may arrive.

**iOS (H-4, H-5, H-7, and the same governance checks)**

1. **First, without installing:** Safari → the production URL → Notifications.
   The surface must state the home-screen step and must offer **no** enable
   button. This is H-7, and it is the case a user is most likely to hit.
2. Share → **Add to Home Screen**. Open from the home screen icon.
3. Repeat Android steps 2–10.

### 6.3 How to report each line

Use these five states, and do not collapse them:

1. **executed and proved** — done on the device, with what was observed;
2. **implemented but not executed in the required environment** — the code path
   exists and is tested, but no device ran it;
3. **partial** — with the remainder named and a destination;
4. **blocked by the owner** — waiting on an owner action, named;
5. **not started**.

A line that cannot be run because delivery itself failed is **blocked**, not
failed — record what broke and stop, rather than continuing down a list whose
remaining items assume the first one worked.

---

### The pgTAP suite's execution history, because "green" alone would hide it

| run | outcome |
|---|---|
| 1 | **never reached the suite** — `supabase db reset` failed applying the migration (`42601`) |
| 2 | **47 of 90 failed** — undersized fixture keys, plus three sibling suites correctly naming the new tables |
| 3 | **90 of 90 passed** |

Recorded because a record that said only "pgTAP green" would imply the suite was
right the first time, and the two red runs are where the real defects were.

---

## 7. Hardware run 1's 403, narrowed (2026-08-12)

`H-5` failed twice with `unauthorized` / **HTTP 403** — once reporting
`subject: "reserved"` and once, after the owner configured `VAPID_SUBJECT` with a
real operational address, reporting `subject: "operational"`. **The subject is
not the cause.** 403 is where a rejected `sub`, a wrong `aud`, an unverifiable
signature and an unexpected key all converge.

### 7.1 What was eliminated, and how

Every comparison below was made locally and is reported as a **verdict**. No key,
no fragment of one, and no digest that was not needed appears anywhere in this
repository or in any command output that was kept.

| claim | verdict | method |
|---|---|---|
| `edge_public_vs_app_public` | **match** | `sha256` of the deployed application's rendered key against the hosted secret's digest |
| the application's key is an uncompressed P-256 point | **yes** | 65 bytes, `0x04` prefix |
| the key predates the subscription | **yes** | secret set 10:16 UTC; the owner re-subscribed after 14:47 UTC |
| `VAPID_PRIVATE_KEY` absent from the application environment | **yes** | `vercel env ls` |
| all five sender secrets present on the Edge Function | **yes** | by name and digest only |

Two methodological points that will recur:

1. **`supabase secrets list` reports `sha256(value)` in hex.** That was
   established against **three controls** whose values this machine already
   held — not assumed. A comparison whose algorithm has not been proved on a
   known value is not a comparison.
2. `VAPID_PUBLIC_KEY` is a **server** variable on the application side, rendered
   into an authenticated page, and Vercel marks it *Sensitive* so no API returns
   it. It was read at runtime the way every hosted read here is done: mint a
   session over HTTP, install the `@supabase/ssr` cookie, clear SH.4's consent
   interposition **through the product's own surface**, and scan the page for
   base64url runs that decode to a P-256 point. Residue: zero.

### 7.2 The hypothesis that could not be asked

Whether the two configured **halves are a pair**. This runtime cannot be asked,
and that was measured: Deno's WebCrypto imports an EC private JWK **from `d`
alone**, never consulting `x`/`y`. A `d` from one generation advertised with an
`x`/`y` from another imports cleanly, signs, and produces a signature that
verifies against nothing — a perfectly well-formed request that no push service
can authenticate, whose only available answer is **403**.

### 7.3 What now answers it, at no cost to a device

`mode: "selfcheck"` on the deployed sender. It reaches no database, contacts no
push service, can name no subscription, and is secret-authenticated all the same.
It reports four **categories**:

| field | values |
|---|---|
| `subject` | `operational` · `reserved` · `malformed` |
| `publicKey` | `p256_point` · `not_canonical` · `malformed` |
| `privateKey` | `p256_scalar` · `malformed` |
| `pair` | `consistent` · `mismatched` · `unusable` |

`deliverPush` also refuses a pair that cannot authenticate **before**
`begin_push_delivery`, so a misconfiguration no longer spends the dedupe slot,
spends an attempt, or charges the **device** a strike. Three strikes retire a
subscription and the owner has one.

**Read the self-check before running the device again.** A device run is the
right next step only if it reports `pair: "consistent"`.

Merged as `7bc0698` (PR #187), CI green 3/3 on that exact SHA, deployed
byte-identical, `verify:edge-parity` green.

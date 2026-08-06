# Migration `202608060078` — deployment record

Phase 2G's **one and only** migration (ADR-083 budget; ADR-084 content),
applied to the linked project on 2026-08-06. **The budget is now spent; any
further DDL in this phase is an owner amendment.**

## 1. Pre-flight

| Check | Result |
| --- | --- |
| Slice merged with merge-SHA CI green | PR #102 → `e2c3718`, run `31073784020`, **all three jobs green** — including `database`, which applies the whole chain from an empty database and runs the pgTAP suite against it |
| Hosted parity before | `202608050077`; `202608060078` present locally, **empty remote column** |
| `db push --dry-run` | *"Would push these migrations: 202608060078…"* — exactly one, the budgeted one, and nothing else |
| Destructiveness | none: one `create or replace` of an internal `SECURITY INVOKER` validator. No table, no grant, no drop, no schedule |
| Ordering hazard | none in either direction. Both widenings are **additive**, so the deployed application (which sends `home`/`capture_page`) stays valid against the new function, and application code sending `composer` against the old one loses a best-effort event while the capture itself still succeeds |

## 2. Apply and readback

`npx supabase db push --linked` → *"Applying migration
202608060078_phase_2g_composer_capture_source.sql… Finished."*

**Hosted parity after: `202608060078`.** Local and remote columns match, row
for row, through the whole chain.

## 3. Behavioural verification — 5/5, both controls refused

Schema parity says the migration ran; it does not say the function accepts
what it was widened for. Probed against the deployed project on a **disposable
account**, removed afterwards:

| Case | Result |
| --- | --- |
| `captureSource: composer` + `failureKind: quota` (both widened) | **accepted** `200` |
| `captureSource: composer` + `failureKind: storage` (new source, old kind) | **accepted** `200` |
| `captureSource: home` + `failureKind: quota` (old source, new kind) | **accepted** `200` |
| **CONTROL** — invented source | **refused** `400 / 22023` |
| **CONTROL** — invented kind | **refused** `400 / 22023` |

The two controls matter more than the three positives: they prove the
validator is still refusing, so acceptance means acceptance rather than a
validator that stopped running.

### Three probe shapes measured nothing first, and their controls caught all three

Recorded because the pattern generalises, and because
[`control-must-not-be-exempt`] is the lesson SH.5 paid for once already:

1. **Wrong parameter names** — `p_name` instead of `p_event_name`. Every case,
   including both controls, returned `404 PGRST202`. The function was never
   reached.
2. **`service_role` caller** — every case returned `403 / 42501`.
   `record_product_event` is `authenticated`-only, and the EXECUTE grant is
   checked *before* the function body, so the validator never ran.
3. **Password sign-in** — `400 captcha_failed`. SH.5's hosted Turnstile refuses
   automated sign-in **by design**, which is the control working, not a fault.

Each time, every case returned an identical result. **A probe whose controls
agree with its positives has measured nothing**, and reporting the first two
runs as "the widened values are accepted" would have been a published false
verdict of exactly the shape SH.5 recorded.

**The session that worked** is SH.5's own observation mechanism:
`admin/generate_link` composes the link GoTrue would send without sending it,
and its `email_otp` exchanges at `/auth/v1/verify` for a real session — no
SMTP, no CAPTCHA, no interactive browser.

### A finding for 2G.4's hosted lane, recorded now

**Hosted CAPTCHA refuses automated password sign-in.** Every `online-*.spec.ts`
journey signs in through the login form, so the written-not-executed journeys
(`online-conversational-creation.spec.ts` and the rest) may not be runnable
headlessly as written. 2G.4 must establish this before planning around them,
rather than discovering it at execution time; the `generate_link` → `verify`
exchange above is the likely path, and it is a Playwright fixture change rather
than a product change.

## 4. Residue

The disposable account was removed by fail-closed teardown on **every** run,
including the three that failed — readback `OK` each time. Its synthetic
product events (`p_is_synthetic: true`) cascade with the account, which SH.0's
row-complete cascade drill proves for every user-owned table. No owner record
was touched: the probe never authenticated as a real account.

## 5. What this deployment does not do

No signup posture, retention schedule, SMTP setting, legal or monitoring
signature, or rollout-gate semantics changed. No purge ran and none is
authorized. `disable_signup` remains `true`. Phase 2H remains unauthorised.

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

### The pgTAP suite's execution history, because "green" alone would hide it

| run | outcome |
|---|---|
| 1 | **never reached the suite** — `supabase db reset` failed applying the migration (`42601`) |
| 2 | **47 of 90 failed** — undersized fixture keys, plus three sibling suites correctly naming the new tables |
| 3 | **90 of 90 passed** |

Recorded because a record that said only "pgTAP green" would imply the suite was
right the first time, and the two red runs are where the real defects were.

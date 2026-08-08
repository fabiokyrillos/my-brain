# Phase 2J — deployment of `202608080085` and `202608080086`

**Date:** 2026-08-08
**Authorization:** the owner authorized deployment of exactly these two already-merged
migrations. No other migration was authorized, and none was written.
**Repository state at deploy:** `main` = `origin/main` = `fd0a8e3`, working tree clean,
both migration files byte-identical to the merge-reviewed artifacts. Neither was modified.

**Outcome in one line: both migrations are deployed, hosted parity is exact — and the
deployment's own acceptance probe found that the three telemetry events Phase 2J
declared still cannot be recorded, because a third copy of the event vocabulary lives in
a function neither migration touched.** That finding is a genuine defect requiring a
third migration, which is a stop condition. It is written up in §5 with its correction
path and has **not** been fixed here.

---

## 1. Pre-deploy hosted read

Read from the live project (`ulvwzqlpsjyrnqzfxmck`) via the Management API before any
DDL. Not inferred from local filenames.

| Fact | Value |
| --- | --- |
| Hosted migration head | `202608070084` |
| Hosted migrations applied | 84 |
| `ai_usage_events_operation_check` | eight values, **no** `transcription` |
| `record_ai_usage` body | eight values, **no** `transcription` |
| `record_ai_usage` grants | `authenticated:EXECUTE, postgres:EXECUTE, service_role:EXECUTE` |
| `product_events_event_name_check` | 27 names, **none** of the three Phase 2J events |
| `private.validate_product_event_properties` | present, **none** of the three Phase 2J events |
| Forced RLS | `ai_usage_events`, `product_events`, `ai_model_pricing` all `enabled=true forced=true` |
| Policies | `ai_usage_events` 1, `product_events` 1 |
| `cron.job` | 5 jobs |
| Audio tables / buckets | 0 audio-ish tables; one bucket `user-files (public=false)` |
| Audio pricing rows | 0 |

`supabase migration list --linked` showed exactly `202608080085` and `202608080086`
pending, in that order. **No unexpected unapplied migration existed between the hosted
head and `085`.** A `--dry-run` push confirmed the same two, in chain order.

## 2. Migration `202608080085` — transcription usage

**Applied. Success.**

It widens `ai_usage_events.operation` by exactly one value and re-declares
`record_ai_usage` with the same one value added. Both of its embedded `do $$` verification
blocks executed without raising — they abort the migration otherwise, so their silence is
the proof that the constraint swap matched the intended name and that the writer and the
table agree.

Post-deploy readback:

- constraint now admits `transcription`; **all eight pre-existing values survive**
  (`capture_extraction`, `semantic_search`, `chat`, `review`, `file_analysis`,
  `advanced_reasoning`, `background`, `task_command`);
- `record_ai_usage` admits `transcription` and still carries `task_command` and
  `capture_extraction`;
- grants **unchanged**, byte-identical to the pre-deploy string;
- no new table, no new policy, no cron change, no storage object, no audio structure.

## 3. Migration `202608080086` — experience telemetry

**Applied. Success.** Both embedded verification blocks passed.

- `product_events_event_name_check`: **27 → 30** names. The three added are
  `capture_mode_selected`, `voice_transcription_finished`, `attention_item_resolved`.
  Every pre-existing name survives (spot-checked `rate_limit_refused`, `capture_started`,
  `task_command_undone`).
- `private.validate_product_event_properties` now carries all three, and still carries
  the pre-existing vocabulary.
- No grant change, no RLS change, no cron change, no new free-text column.

Neither of the two metrics Phase 2J left undelivered (Hoje first-useful-action; review
started/completed) was added. They still require their own migration.

## 4. Hosted parity

Read from hosted state, not from a local filename:

| | |
| --- | --- |
| Local chain head | `202608080086` |
| Hosted head | `202608080086` |
| Hosted migrations applied | **86** (was 84) |
| `supabase migration list --linked` | `202608080085` and `202608080086` present in **all three** columns |

**Parity is exact: local = remote = `202608080086`.**

## 5. FINDING — the three Phase 2J events still cannot be recorded

**Severity: the phase's telemetry deliverable is inert on the live project. Nothing is
broken *by* the deployment; the deployment simply does not reach far enough.**

`product_events` writes pass through three independent copies of the event vocabulary:

1. the table CHECK `product_events_event_name_check` — widened by `202608080086`;
2. `private.validate_product_event_properties` — widened by `202608080086`;
3. **`private.record_product_event` — a hardcoded 26-name `not in (...)` gate in the
   function body, widened by neither.**

Both `public.record_product_event` (the authenticated path) and
`public.record_product_event_for_user` (the service-role path) delegate to
`private.record_product_event`, so **every** write path hits gate 3 first.

Measured on the deployed project, inside a `DO` block whose only exit is a `raise`, so
nothing committed (`product_events` count 67 before and after):

```
[CONTROL] work_view_viewed                 ACCEPTED recorded=true
[2J-1]    capture_mode_selected            REFUSED 22023 Unsupported product event
[2J-2]    voice_transcription_finished     REFUSED 22023 Unsupported product event
[2J-3]    attention_item_resolved          REFUSED 22023 Unsupported product event
[2H]      rate_limit_refused               REFUSED 22023 Unsupported product event
[NEG-1]   free-text `transcript` property  refused 22023
[NEG-2]   undeclared event name            refused 22023
```

The control is **not exempt**: `work_view_viewed` travelled the identical function, the
identical argument list and the identical rollback, and was accepted. The difference
between it and the four refusals is the vocabulary in gate 3, nothing else.

Two consequences, and the second is older than this phase:

- **`2J-METRICS-007` reads zero.** The producers exist
  (`src/features/product-analytics/interaction-events.tsx`) and emission is wrapped in a
  swallow, so the app looks correct and records nothing — precisely the SH.6 failure mode
  (ADR-084) that this slice's three-event design was chosen to avoid.
- **`rate_limit_refused` has been unrecordable since `202608070081` (Phase 2H,
  2H-RATE-003).** That migration added the name to the CHECK and the validator, not to
  gate 3. The last migration to re-declare `private.record_product_event` is
  `202607280061` (Phase 2E); the gate list has been frozen at Phase 2E's 26 names ever
  since. This is a pre-existing Phase 2H defect surfaced by Phase 2J's probe, not a
  regression introduced here.

**Why CI did not catch it.** The chain is identical locally and in CI, so this is a
repository defect and not hosted drift. `202608080086`'s own verification block asserts
the *text* of the validator, and the pgTAP suite exercises `record_product_event` only
with names that predate the freeze. No test writes each name in the CHECK through the
real writer, which is the one assertion that would have failed.

### Smallest safe correction path — NOT executed, needs owner authorization

Nothing here was done. `202608080085` and `202608080086` were **not** edited; no third
migration was written; no migration history was rewritten.

- **Option A (narrowest).** One new migration re-declaring `private.record_product_event`
  verbatim plus the four missing names (`rate_limit_refused`, `capture_mode_selected`,
  `voice_transcription_finished`, `attention_item_resolved`), with a verification block
  in the same shape as `085`/`086`. Restores the status quo but leaves three copies of
  one vocabulary, which is what failed twice.
- **Option B (recommended).** The same migration, but **deleting** gate 3's name list
  rather than syncing it. The table CHECK and the validator's `else` arm already refuse
  an unnamed event — gate 3 is redundant duplication whose only demonstrated effect has
  been to silently drop two phases' worth of events. This removes the third copy instead
  of creating a fourth opportunity to forget it.
- **Either option must ship with the missing guard**: a pgTAP test that writes **every**
  name in `product_events_event_name_check` through `public.record_product_event`, so a
  name the writer refuses fails CI. Without it, the next widening repeats this exactly.

Option B is one migration and strictly less code than Option A. Both are a **third
migration**, beyond Phase 2J's spent `2 · 2` budget, and therefore an owner decision.

## 6. Live acceptance — transcription usage

Measured on the deployed project, same rollback discipline, nothing committed
(`ai_usage_events` count 11 before and after):

```
[A1] transcription      ACCEPTED  cost_status=unpriced  pricing_id=null
[A2] chat               ACCEPTED  (pre-existing operation unaffected)
[A3] not_an_operation   refused 22023
[A4] anonymous caller   refused 42501
```

`record_ai_usage` accepts `transcription` **end to end** — through the function's own
guard, through the table CHECK, to a returned row id. Unknown operations are still
refused, and a caller with no `service_role` claim is still refused at `42501`, so no
privilege was broadened.

**Transcription accounting is `unpriced`, and that is the accepted state, not a
blocker.** There is no audio pricing row (0 rows matching `whisper`/`transcribe`), current
pricing is token-based, and transcription bills per audio minute. `record_ai_usage`
already models `unpriced` with a null `pricing_id` as a first-class state (ADR-096). It is
recorded here as a **named residual for future product/accounting work**. No per-minute
pricing, no pricing schema change, no guessed cost and no project-paid transcription was
introduced.

## 7. Posture after deployment

Every line below is a post-deploy readback compared against the pre-deploy snapshot.

| Posture | State | Changed? |
| --- | --- | --- |
| Forced RLS (`ai_usage_events`, `product_events`, `ai_model_pricing`) | `enabled=true forced=true` on all three | **No** |
| Policies | `ai_usage_events` 1, `product_events` 1 | **No** |
| Grants — `record_ai_usage` | `authenticated`, `postgres`, `service_role` EXECUTE | **No** |
| Grants — `ai_usage_events` | `authenticated` SELECT-class only; DML to `postgres`/`service_role` | **No** |
| Grants — `product_events` | `authenticated` **SELECT only** | **No** |
| `cron.job` | 5 jobs, identical names and schedules, all active | **No** |
| Retention schedule | unchanged; **no sweep scheduled**, no purge authorized or executed | **No** |
| Durable audio | 0 audio tables; one private bucket `user-files`; no audio schema | **No** |
| Signup | **closed** | **No** |
| CAPTCHA | **enforced** (`RG-SIG-2` PASS) | **No** |

No new table, grant, policy, secret, cron entry, storage object or retention change was
introduced by either migration.

## 8. Rollout gate — re-run after deployment

`npm run rollout:verify`, live:

```
25 pass, 3 fail, 2 owner-signature
SIGNUP MUST NOT OPEN.
```

**Unchanged by this deployment, and this deployment is not progress toward it.** The open
items remain owner acts and were not signed here:

- `RG-DEP-1` — production SMTP configured (FAIL)
- `RG-DEP-3` — backup restored to a disposable project and recorded (FAIL)
- `RG-QUO-3` — sweeps built and dry-run recorded but **not scheduled** (FAIL, ADR-082)
- `RG-DEP-4` — monitoring adequacy, **owner signature**
- `RG-LEG-4` — professional legal review, **owner signature**

No SMTP rate limit was invented and nothing was signed on the owner's behalf.

## 9. Residuals — unchanged by deployment

- **`G-2J.4b` voice hardware — PARTIAL, not closed.** Chromium evidence only. Real iOS
  Safari and Android Chrome measurement is still required for emitted container/MIME,
  `MediaRecorder` support, size/duration ceiling behaviour, microphone permission,
  pause/resume/finish, interruption/background behaviour, microphone revocation and
  cancellation. Deployment does not touch this and did not block on it.
- **Accessibility — PARTIAL, restated unchanged.** Browser-level axe, structure,
  accessible names, visible focus, focus order, rendered touch targets, reduced motion and
  dialog semantics improved and are proven at two viewports. **Hydrated focus restoration
  is not browser-proven, and no real screen-reader session has occurred.** Deployment does
  not change this classification.
- **Transcription pricing — `unpriced`.** §6. Accepted state; future accounting work.
- **Two undelivered metrics** — Hoje first-useful-action, review started/completed. Not
  added; they need their own migration and remain future work.
- **ADR-055 — open and unchanged, expires 2026-10-27.** Phase 2J introduced no semantic
  retrieval, and this deployment introduced none: it added one usage-ledger operation
  value and three telemetry event names. No embeddings, no vector retrieval, no
  similarity, no generated answers.

## 10. Phase 2K

**Unstarted.** No 2K PRD, implementation plan, requirement, implementation file or ADR was
created. A13 remains green. The §5 finding is Phase 2J repair, not Phase 2K work.

## 11. Evidence

- Pre- and post-deploy hosted snapshots, and both acceptance probes, were run against the
  live project through the Management API and PostgREST-equivalent claim path. Every
  fixture ran inside a transaction whose only exit is a `raise`, so **no probe residue was
  created in either append-only ledger** — `ai_usage_events` 11 → 11, `product_events`
  67 → 67. No append-only evidence had to be deleted, and none was.
- Credentials were resolved from the linked Supabase CLI project and never printed.

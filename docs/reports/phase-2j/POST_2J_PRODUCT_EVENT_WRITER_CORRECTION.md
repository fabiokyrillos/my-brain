# Post-2J correction — the product-event writer stops keeping its own vocabulary

**Date:** 2026-08-08
**Migration:** `202608080087_post_2j_product_event_writer_deduplication.sql`
**Budget:** charged to **no phase**. Phase 2J remains **`2 allocated · 2 spent`** and that
record is not rewritten. This is an owner-authorized amendment repairing a deployment
defect, in the same class as `202608070084` (the post-2H correction).
**Authorization:** owner decision, Option B of `PHASE_2J_DEPLOYMENT.md` §5 — *remove* the
redundant gate rather than synchronize a third copy.

---

## 1. What CI proved, and what hosted execution disproved

**CI proved the artifacts.** `202608080086` passed the `database` job against the full
migration chain from an empty database. Its own in-transaction verification blocks passed.
The Phase 2J telemetry guard, the rate-limit telemetry parity test and the product-event
contract tests all passed. Every one of those assertions was true.

**Hosted execution disproved the behaviour.** Running the real writer on the deployed
project refused four events that the database simultaneously declared legal:

```
[CONTROL] work_view_viewed                 ACCEPTED recorded=true
          capture_mode_selected            REFUSED 22023 Unsupported product event
          voice_transcription_finished     REFUSED 22023 Unsupported product event
          attention_item_resolved          REFUSED 22023 Unsupported product event
          rate_limit_refused               REFUSED 22023 Unsupported product event
```

Both statements are correct, which is the whole lesson: **the artifacts were right and
their composition was wrong.**

## 2. Root cause

`product_events` enforced its event-name vocabulary in **three** places:

| # | Enforcement point | Widened by `202608080086`? |
| --- | --- | --- |
| 1 | `product_events_event_name_check` (table CHECK) | Yes |
| 2 | `private.validate_product_event_properties` (property shape; `else` arm refuses unnamed events) | Yes |
| 3 | `private.record_product_event` — a hardcoded 26-name `not in (...)` list in the writer body | **No** |

Both `public.record_product_event` (authenticated) and
`public.record_product_event_for_user` (service role) delegate to (3), so (3) refused
first. Nothing has re-declared it since **`202607280061`**, so its list has been frozen at
Phase 2E's 26 names.

Emission sites wrap the call in `.catch(() => {})`, so both losses were invisible: the
application code reads as though it records.

## 3. Why the existing tests missed it

Every product-event test asserted artifacts **in isolation**:

- the CHECK constraint *contains* a name;
- the validator's function body *contains* a name (`position(... in pg_get_functiondef())`);
- the writer *is* `security definer` with a safe `search_path`.

`202608080086`'s own verification block is of exactly this kind — it asserts the text of
the validator, which cannot see a gate living in a **different function**. The pgTAP suite
did exercise `record_product_event`, but only with names that predate the 2E freeze, so
every write it attempted was one the stale gate happened to allow.

**The missing assertion was never "is the name in the list?" but "can the writer
production calls actually accept this event?"** That question is now asked, for every name
the database declares, in `supabase/tests/post_2j_product_event_write_path.sql`.

## 4. The correction

`202608080087` re-declares `private.record_product_event` with the event-name gate
**deleted**, and changes nothing else: same signature, same `security definer`, same
`set search_path = ''`, same surface/locale/viewport/app-version/idempotency guards, same
`validate_product_event_properties` call, same subject-ownership assertion, same idempotent
`on conflict` insert, same return shape, same `revoke` posture.

**Fail-closed is preserved, and that is the load-bearing claim.** Deleting a guard is only
safe because the remaining ones are complete:

- the table CHECK still refuses an unnamed event (`23514`) and is untouched — it remains a
  real enforcement point, and this migration does not make `event_name` open-ended;
- the validator's `else` arm raises `'Unsupported product event'` with errcode `22023` —
  **the same message and the same errcode the deleted gate raised**, so a caller cannot
  tell the difference;
- the validator runs for every event, before the insert, and covers all thirty
  CHECK-declared names.

That last point is proved rather than asserted. The migration's final block extracts every
name from the CHECK constraint and requires each one to appear in the validator, failing
with the offending names listed. It is a **name-by-name** proof, not a count, because a
count matches while two lists disagree by one name in each direction — the exact shape a
partial widening produces. It also refuses to run vacuously: if the extraction yields fewer
than twenty names, or is missing any of five named controls, it raises instead of passing.

**One ordering consequence, stated rather than discovered later.** The deleted gate ran
before the surface/locale/viewport checks; the validator runs after them. A call wrong
about *both* the event name and the surface now reports the surface first. Both are `22023`
refusals of an invalid call. No call that used to be accepted is refused, and none that
used to be refused is accepted.

## 5. The regression test, and proof it is not vacuous

`supabase/tests/post_2j_product_event_write_path.sql`, 19 assertions:

- **The vocabulary is derived from the CHECK constraint**, never restated. One hand-written
  table maps each event to a legal payload, and two set-difference assertions require that
  map to match the derived vocabulary **exactly in both directions**. A future migration
  that adds a CHECK value and forgets the writer or the validator therefore fails this file
  automatically.
- **The core assertion** calls `public.record_product_event_for_user` — the writer
  production calls — once per declared name, collecting failures so a regression names every
  broken event rather than only the first.
- **Explicit controls** for the four events the defect refused, so a future regression says
  which contract broke.
- **Fail-closed negatives**: an undeclared event refuses `22023 Unsupported product event`;
  an out-of-enum value refuses `22023 Invalid product event property`; a free-text
  `transcript` property refuses `22023 Unsupported product event property`.
- **Identity and ownership**: the authenticated writer accepts a Phase 2J event under a real
  session claim, the written row is owned by the **session** identity rather than by an
  argument, and the service-role writer remains unreachable from an authenticated session
  (`42501`).
- **Residue**: the whole file runs inside pgTAP's transaction and ends in `rollback`.

**Non-vacuity is proved against the previous function shape, not argued.** The corrected
definition is captured, `202607280061`'s 26-name gate is planted in its place, and the same
harness is re-run: it must report failures, and exactly **four** of them — the same four
measured on hosted. The corrected definition is then restored from the capture and the
harness re-run a third time to prove the restore worked. Without that section the five
assertions above would pass against a writer that never had the defect, which says nothing
about whether they can *see* it.

Two static defects in the test were caught by reading it before it ran, both of which would
have produced a confident wrong answer:

- the harness's OUT column was originally `event_name`, which plpgsql would have made
  ambiguous against the `event_name` columns of both joined tables — failing the file with
  a parse-time error instead of a result;
- the planted stale function first returned `null::uuid` on its accepted path, which the
  harness scores as *unwritten* — so the non-vacuity count would have read 30 instead of 4,
  and would have been measuring the fixture rather than the gate.

## 6. Which Phase 2J acceptance claim required qualification

**`2J-METRICS-007` — "every declared event has a consumer before close".** The requirement
was written against SH.6's lesson that a producer with no consumer is invisible, and the
slice satisfied it in the repository: three events, a consumer that reads them, tests both
sides. **What it could not claim, and did not check, is that the events could reach the
table at all.** Until this correction is deployed the consumer reads zero — not because it
is broken, but because nothing can be written for it to read. The requirement's *repository*
acceptance stands; its *live* effect was nil, and `PHASE_2J_DEPLOYMENT.md` records that
rather than smoothing it over.

The related producer/consumer wiring (`2J-METRICS-006`'s privacy mechanism) was never in
doubt: the payload has nowhere to put content, and that is re-proved here by a negative.

## 7. The older event this also repairs

**`rate_limit_refused`** entered the accepted vocabulary in `202608070081` (Phase 2H,
`2H-RATE-003`). That migration widened the CHECK and the validator and not the writer, so
the event has been unrecordable since it shipped. It is repaired by the same deletion, with
no special case: removing the stale list fixes every name it was stale about at once, which
is precisely why Option B was the right instruction.

This is a **pre-existing Phase 2H defect surfaced by Phase 2J deployment verification**, not
a Phase 2J regression, and Phase 2H's own records are not rewritten to hide it.

## 8. Live state after the repair

Recorded in **§9** below once the corrective migration is deployed and proved on hosted.

## 9. Hosted acceptance

*Pending deployment. This section is written from a hosted readback, never from a local
filename, and this file is not to be read as complete until it is filled in.*

# Phase 2S — Traceability matrix

**Generated, never typed.** `node scripts/generate-phase-2s-traceability.mjs`
reads the PRD, the coverage report and the five slice acceptance records and
writes this file, or refuses and writes nothing. A matrix that is 98 of 99
correct reads as complete, which is why a refusal produces no file at all.

**99 declared · 99 classified · 0 unclassified.**

| Class | Count |
|---|---:|
| `built` | 73 |
| `baseline` | 20 |
| `partial` | 0 |
| `not-built-by-rule` | 6 |
| `undelivered` | 0 |

| Requirement | Slice | Class | Evidence |
|---|---|---|---|
| `2S-FOUNDATION-001` | 2S.0 | baseline | §1 — counts by type, status and local day taken live at the slice's own baseline; 19 unbroken days at exactly 3/day, zero exceptions; the PRD's date range corrected forward |
| `2S-FOUNDATION-002` | 2S.0 | baseline | §2 — the candidate predicate, all three dedupe keys, the rank ordering and **three** suppression layers quoted from `pg_get_functiondef` and re-asserted against `202608040073:490` with two absent-clause controls; behaviour deliberately not claimed |
| `2S-FOUNDATION-003` | 2S.0 | baseline | §3 — every control enumerated from the component with its destination, asserted as a **closed set** with two negative controls |
| `2S-FOUNDATION-004` | 2S.0 | baseline | §4 — a census over every non-test source file finds exactly one caller sending exactly `"read"`; the assertion is caller-count-first so an empty scan cannot pass it vacuously |
| `2S-FOUNDATION-005` | 2S.0 | baseline | §5 — `notification_deliveries` read live: **0**. Stop condition 2 not reached, and nothing here claims push works |
| `2S-FOUNDATION-006` | 2S.0 | baseline | §6 — the stale predicate run as itself: 3 candidates, all `inbox`, oldest `updated_at` 2026-07-30; plus the unmeasured finding that **three `overdue` notices already name deleted subjects** |
| `2S-FOUNDATION-007` | 2S.0 | built | §7 and the slice's own diff — one test file and one record; migration count asserted at 101 with no `phase_2s` file; the application-layer writer census asserted as a closed set of one |
| `2S-SILENCE-001` | 2S.1 | built | §2 — the table, the writer, and a suppression that persists and reloads unchanged |
| `2S-SILENCE-002` | 2S.1 | built | §2 — six refusals by name, and a `postgres`-role read proving none of the six reached storage |
| `2S-SILENCE-003` | 2S.1 | built | §2 — `reason` and `actor` stored and audited; a blank reason refused |
| `2S-SILENCE-004` | 2S.1 | built | §2 — expiry is a `timestamptz` compared against `now()` at the source; the owner's local day is resolved by the one contract the heartbeat already uses |
| `2S-SILENCE-005` | 2S.1 | built | §2 — trigger-proved ownership, plus a second owner's row planted first and then proved unreachable in both directions |
| `2S-SILENCE-006` | 2S.1 | built | §3 — the undo is exercised through the real router; both shapes handled; the ledger row read afterwards |
| `2S-SILENCE-007` | 2S.2 | built | §1 — the control exists on `/app/notifications` and the suppression it creates is read back; pgTAP §3c calls the RPC and reads the row |
| `2S-SILENCE-008` | 2S.2 | built | §1, §2 — the same mount on `/app`, from the same handler bundle; pgTAP §3d calls the identical RPC |
| `2S-SILENCE-009` | 2S.1 | built | §5 — `run_user_heartbeat` **called**; a suppressed subject produces none, and a suppression narrowed to one notice type leaves the others audible |
| `2S-SILENCE-010` | 2S.1 | built | §5 — the expiry is moved into the past and exactly one notice reappears |
| `2S-SILENCE-011` | 2S.2 | built | §3 — pgTAP §3a … §3d, each verb alone, the other three read and asserted unchanged |
| `2S-CADENCE-001` | 2S.1 | built | §1, §5 — six calls walking the ladder, each with its negative half |
| `2S-CADENCE-002` | 2S.1 | built | §1, §5 — `else false`; silent at 30 days and still silent at a year |
| `2S-CADENCE-003` | 2S.1 | built | §1, §5 — the same four notices either side of the anchor give opposite answers |
| `2S-CADENCE-004` | 2S.1 | baseline | §1, §5 — the cooldown proved **byte-identical**; quiet hours, the cap and the lock re-proved by calling |
| `2S-CADENCE-005` | 2S.1 | baseline | §5 — a day holding **both** a due reminder and a stale nudge, with the cap set to **one**: the reminder survives and the stale nudge does not, with a second control raising the cap to prove the stale nudge was a real competitor rather than an absent one |
| `2S-CADENCE-006` | 2S.1 | baseline | §5 — a two-owner batch delivers to the unsuppressed owner and withholds from the suppressed one |
| `2S-CADENCE-007` | 2S.1 | baseline | §5 — an unknown user raises `P0002`, the failure the batch absorbs |
| `2S-CADENCE-008` | 2S.1 | baseline | the suppression touches no task row and no projection; a silenced subject keeps every existing attention source. Asserted as the absence of any application-layer reader of the new table |
| `2S-REACH-001` | 2S.1 | built | §4 — both task branches point at the subject; asserted on the row the function wrote |
| `2S-REACH-002` | 2S.1 | baseline | §4 — the producer was **already** locale-correct; both locales exercised through real notices. `2S-CLOSE-004` is what makes this sayable |
| `2S-REACH-003` | 2S.1 | built | §4 — all three types enumerated with their destinations; the reminder's is a recorded refusal with a guard that fires if a route appears |
| `2S-REACH-004` | 2S.1 | built | §4 — a named fallback replacing `notFound()`, with indistinguishability preserved and the `empty` state chosen over `error_terminal` |
| `2S-REACH-005` | 2S.1 | baseline | §4 — the first `reminder` notification this product has ever produced. The route was always there; what had never happened is a notice arriving at it, so this proves an existing property rather than building one. **Recorded `built` in this file's first draft and refused by the reconciliation** — the same misfiling that survived five slices of Phase 2R, caught here at the second |
| `2S-ANSWER-001` | 2S.2 | built | the verb sends `status="dismissed"`; pgTAP §3b writes it and reads it back |
| `2S-ANSWER-002` | 2S.2 | built | `action-copy.ts` names what is lost, both locales; pgTAP §2 proves the behaviour the sentence promises — a future notice can still arrive |
| `2S-ANSWER-003` | 2S.2 | built | two controls, two outcomes (pgTAP §3a vs §3b), two sentences (`verbs.test.ts`, both locales) |
| `2S-ANSWER-004` | 2S.2 | built | pgTAP §1 — the heartbeat **called** after a dismissal, no duplicate, exactly one row on the key |
| `2S-ANSWER-005` | 2S.2 | baseline | the page's filter is byte-identical and now guards a state §3b produces |
| `2S-ANSWER-006` | 2S.2 | not-built-by-rule | pgTAP §5 — the `notifications_status_check` members enumerated, each written and accepted, a fourth written and **refused by name**, and the row read after the refusal. Declared kind `rule`, so its delivery IS that recorded refusal; the class was written `**rule**` until slice 2S.4's generator refused it — `rule` is a declared KIND and never one of the five classes |
| `2S-ANSWER-007` | 2S.2 | built | pgTAP §3a — the subject re-read unchanged, the other notice re-read unread, no suppression, read after `reset role` |
| `2S-ANSWER-008` | 2S.2 | built | pgTAP §2 — proved by **calling** `run_user_heartbeat`, not by reading the rule |
| `2S-ACT-001` | 2S.2 | built | `primaryVerbFor` over `verbsForRow`; two subjects in different states render different primaries **in one rendered list** (`home-notices.test.tsx`) |
| `2S-ACT-002` | 2S.2 | built | the rendered row carries exactly two controls at rest, asserted against the DOM and not against the source |
| `2S-ACT-003` | 2S.2 | built | §2's census — `applyWorkItemAction`, named, pre-existing, and the only completion path |
| `2S-ACT-004` | 2S.2 | built | §2's census — `applyTaskDetailCommand` with `reschedule_due`; the owner's zone resolves through the one contract |
| `2S-ACT-005` | 2S.2 | built | the census proves `isEligibleStatus` is imported in exactly one module; a completed subject offers no *concluir* |
| `2S-ACT-006` | 2S.2 | built | the two groups are worded around different nouns, asserted in both locales |
| `2S-ACT-007` | 2S.2 | built | *its limit is stated rather than absorbed* — the control is disabled while pending **and** a forced second click dispatches once — asserted at the authority, by call count. The row-reading half of the requirement's wording rests on the deployed per-row-per-action operation key, which this surface **reuses** rather than reimplements (`2S-TRUST-011`); the key is minted in a ref rather than in the render body, so StrictMode's double render cannot make a legitimate action look like a replay. |
| `2S-ACT-008` | 2S.2 | built | the row survives a thrown action with its content intact; the reason is a closed-set sentence; a stale refusal says so and offers its reload |
| `2S-ACT-009` | 2S.2 | built | the affordance is `UndoAffordance`, the one the Work surfaces mount; the offer comes from the database's own answer and is `null` for both message dispositions. The suppression undo was **exercised against the deployed database** in slice 2S.1's deployment record; the task undo is the Work surfaces' own, already exercised |
| `2S-ACT-010` | 2S.2 | built | the question is in the same panel, names what is lost, and cancelling issues no request — asserted on both surfaces |
| `2S-ACT-011` | 2S.2 | built | §2 — the census, fourteen assertions, with a derived surface list asserted non-empty |
| `2S-ACT-012` | 2S.2 | built | every control is followed by a read of the state it claims to have changed — in the component tests at the dispatch boundary, and in pgTAP §3a … §3d at the row |
| `2S-ATTENTION-001` | 2S.3 | built | §10 — the unanswered notices render on the real `/app`, proved on the hosted project with rows planted for the account under test, and the verbs arrive with them from the one shared mount |
| `2S-ATTENTION-002` | 2S.3 | built | §2, §10 — three unanswered notices about two subjects render **two** rows on the rendered page; the duplicate is planted so the number is able to be wrong, and the collapse is a projection that deletes nothing |
| `2S-ATTENTION-003` | 2S.3 | built | §10 — the number on the heading is compared against the rows a reader can see under it, derived from `queueSize` and never typed |
| `2S-ATTENTION-004` | 2S.3 | built | §10 — the empty state is reached **after** rows were proved on the same account, and it is a real empty state (`Nada precisa de você agora.`) rather than a section that vanished |
| `2S-ATTENTION-005` | 2S.3 | built | §10 — measured against the rendered page on the hosted project, never a fixture; §10.2 is the price paid for the version that measured an error page instead |
| `2S-ATTENTION-006` | 2S.3 | built | §10.4 — opening marks it seen, proved **in the database**: exactly one notice moved to `read`, it is the one the row carried, and the read runs with the destination on screen and no retry, which is what proves the write finished before the navigation |
| `2S-ATTENTION-007` | 2S.3 | baseline | `src/features/shell/home-notices.test.tsx:208` — every pre-existing source of the attention surface still renders and is still counted; **no change was made to any of them**, and `home-view.tsx:462` records why the ordering is deliberate |
| `2S-ATTENTION-008` | 2S.3 | built | §5 — by two independent mechanisms: one projection read by all three surfaces, and every writer invalidating all three routes. `/app/inbox` was missing from both writers and was added |
| `2S-TRUST-001` | across | built | Slice 2S.1 §2 — every suppression carries actor, source, reason, target, time and resulting state; the pgTAP suite writes one through the RPC and reads the row back |
| `2S-TRUST-002` | across | built | Slice 2S.2 — every reversible verb dispatches to `undoWorkOperation`, whose handler is exercised against the database rather than asserted; a control reporting success with no ledger row is a defect and the assertion reads the ledger |
| `2S-TRUST-003` | across | built | Slice 2S.1 deployment record — a seven-way `has_table_privilege` probe on the deployed project returns false for `service_role` on every one; the migration **revokes** explicitly, because `alter default privileges` hands new tables four privileges nobody asked for |
| `2S-TRUST-004` | across | built | Slice 2S.1 deployment record — RLS **enabled and forced**, four owner-scoped policies, and **zero** granted to `public`, all read from the deployed project |
| `2S-TRUST-005` | across | baseline | §2 — all three writers enumerated from the deployed database and the tree, and **this phase added none of them**. No change was made. The requirement's word *writer* is narrower than the tree, and §2 records that rather than reporting only the one that fits |
| `2S-TRUST-006` | across | built | §4 — the one new store holds a subject reference and the owner's own `reason`, and has **no column** a notice's title or body could occupy |
| `2S-TRUST-007` | across | not-built-by-rule | The rule is *zero AI calls and zero credential spend across the phase*, and it held. It is a **live** refusal rather than a vacuous one: the BYOK credential is `active`, so a call was possible and none was made. The two `ai_usage_events` rows in the checkpoint window are the product's extraction and embedding of a capture **the owner made**, itemised in slice 2S.3 §11. Destination: none — the rule is discharged |
| `2S-TRUST-008` | across | not-built-by-rule | The rule is *push is not resumed, not repaired and not claimed* — `OD-2S-6` A. `notification_deliveries` holds **zero** rows and the HTTP 403 is untouched and carried. Refusal 18 enforces it by forbidding the **claim** rather than the word, so *"push is still not working"* stays sayable. Destination: the push initiative, carried in PRD §7.1 |
| `2S-TRUST-009` | across | baseline | Nothing this phase built reads `automation_category_policies` or any `eligible` state; the rows were re-read at closeout and the table holds **zero**. **No change was made** |
| `2S-TRUST-010` | across | built | §3 — the five handlers proved against slice 2S.0's merge commit `39bb4b8`: four present, one absent and authorized. Refusal 20 reads the bundle from the tree so the claim can fail |
| `2S-TRUST-011` | across | baseline | §6 — the mechanism is the pre-existing ref-held per-(row, verb) key, and **no change was made** to it. Its exercise from this surface was **missing** until this slice wrote it: a retry after a thrown round now asserts the SAME key reaches the authority, and a terminal outcome asserts the key rotates. Two mutation controls, two failures |
| `2S-TRUST-012` | across | baseline | The pre-existing `stale_pre_state` refusal is reached **from this surface**: the row is changed underneath a rendered control, the control is submitted, and the refusal returns with its reload affordance. **No change was made** to the mechanism |
| `2S-TRUST-013` | across | built | Slice 2S.2 — every undo the surface offers is followed by a read of the ledger row **and** of the restored subject, so a control reporting success with nothing behind it fails |
| `2S-ACCESS-001` | 2S.3 | built | `attention-notice-row.test.tsx:156` and `:214` — every control names its subject, so twenty rows are twenty distinguishable destinations rather than twenty repetitions of the same word |
| `2S-ACCESS-002` | 2S.3 | built | §4, §10 — the silence consequence states the date **and** the number of days before the owner confirms; the day count walks calendar days in the **owner's** zone after `LDC-GUARD-001` caught it reading the device's |
| `2S-ACCESS-003` | 2S.3 | built | `attention-notice-row.test.tsx:333` — every live region is mounted **before** there is any result to announce; a region created together with its message is never announced |
| `2S-ACCESS-004` | 2S.3 | built | §10 — axe finds no serious violation on all three rendered routes, scanned twice each: menu closed **and** menu open, because `role="menu"`, `aria-expanded` and `aria-describedby` exist only while it is open |
| `2S-ACCESS-005` | 2S.3 | not-built-by-rule | **NOT EXECUTED — OWNER WAIVED**, carried verbatim and restated by the owner on 2026-08-27. No screen-reader evidence is claimed anywhere in this phase; the accessibility tree is asserted instead and is **not** the same thing. Destination: stays waived |
| `2S-ACCESS-006` | 2S.3 | built | §10 — the compact menu opens, moves, activates and closes by keyboard alone on the rendered page, and Escape returns focus to the trigger. The handler sits on the container because the trigger is the list's sibling, which four green focus tests did not notice |
| `2S-ACCESS-007` | 2S.3 | built | `attention-notice-row.test.tsx:318` — one announceable node, and it is the visible one; a second region would announce the same outcome twice |
| `2S-MOBILE-001` | 2S.3 | built | §10 — nothing scrolls sideways at **320px and 375px** on all three rendered surfaces, each measured through its own row contract; and §11, on the owner's iPhone |
| `2S-MOBILE-002` | 2S.3 | built | §10 — the date field's computed `font-size` is read from the rendered page and is ≥16px, the threshold below which iOS zooms; read from the computed style, never from the rule meant to set it |
| `2S-MOBILE-003` | 2S.3 | built | §11 — **held 2026-08-27 on the owner's own iPhone**, against the deployed production build `6d38edc`, five named items, all reported passing. No automated lane substitutes and none is offered as one; §11 also records what the session did **not** cover |
| `2S-MOBILE-004` | 2S.3 | baseline | **This phase's surfaces added no dialog at all.** The dismissal confirmation is an inline panel (`.notification-verb-panel-question`), which `attention-notice-row.test.tsx:291` exercises — deliberately *"the control against a blanket dialog"*. `ConfirmDialog` still carries `useScrollLock` where it is used, so 2R's property is untouched and **no change was made** |
| `2S-MOBILE-005` | 2S.3 | not-built-by-rule | The rule refuses it by name: `2R-DRAWER-NOT-LOCKED` stays an **owner design decision**, carried in PRD §7.1 and not resolved here. Destination: the owner. `.ux-detail` still declares `aria-modal` without locking, and this phase neither repaired nor claimed it |
| `2S-MOBILE-006` | 2S.3 | built | §10 — the primary action, the menu trigger and *Abrir* each measured ≥44px tall **on the rendered page** at a phone viewport, never against a media query, because headless Chromium reports `pointer: coarse` at 1280px |
| `2S-MOBILE-007` | 2S.3 | built | §10 — asserted **geometrically**: the menu's top edge is compared against the row title's bottom edge, because "visible" alone would pass for an element a panel sits on top of |
| `2S-CLOSE-001` | 2S.4 | built | §1 — the generator classifies all 99 exactly once from the records, refuses on duplicate, missing, undeclared or vocabulary-breaking rows, and `--check` compares the committed matrix against a fresh generation byte for byte |
| `2S-CLOSE-002` | 2S.4 | built | Refusals 7 and 8 — a `partial` or `not-built-by-rule` whose evidence names no remainder and no destination is refused, judged on evidence with the row's **own identifier stripped** so a row repeating itself cannot pass |
| `2S-CLOSE-003` | 2S.4 | built | Refusal 10 — a requirement declared `baseline` and classified `built` is refused, and its mutation control flips one row and watches the generator exit non-zero. **Reconciled: all 18 declared `baseline` were delivered `baseline`. Zero in the forbidden direction** — the Phase 2R defect, which had five rows misfiled from that phase's first slice, did not repeat |
| `2S-CLOSE-004` | 2S.4 | built | The reverse direction is deliberately **not** refused, and this phase exercised it for real rather than by control alone: **`2S-CADENCE-008` and `2S-REACH-002` were declared `build` and delivered `baseline`** — the phase discovering that the property already held. Refusing both directions would push a phase toward manufacturing a change to make a label look right |
| `2S-CLOSE-005` | 2S.4 | built | The budget reconciled at closeout — 1 allocated · 1 spent · 1 created · 1 applied, `102 local = 102 hosted`, parity `202608240102`, both counts **re-read live**; refusals 11–13 compare the files on disk against the counts the closing record states |
| `2S-CLOSE-006` | 2S.4 | built | Refusal 6 — the eleven declared families are read with a letters-only pattern and a digit-bearing family is proved **invisible** to it, which is the property that hid `2K-A11Y` from three counts at once |
| `2S-CLOSE-007` | 2S.4 | built | `PHASE_2S_THREAT_MODEL.md` — every threat re-dispositioned against what was built, and a threat closes only when its mitigation **exists and has been exercised**: eighteen closed, one carried, and one raised that the owner decided on 2026-08-27 |
| `2S-CLOSE-008` | 2S.4 | built | Refusal 17 — the nineteen inherited remainders of PRD §7.1 are each looked for in the closing record by name, and a missing one refuses |
| `2S-CLOSE-009` | 2S.4 | not-built-by-rule | The rule is *a hardware proof is never discharged by a document*, and it is enforced twice: refusal 15 refuses `2S-MOBILE-003` classified without naming an owner device session, and no record in this phase reports the device checkpoint as anything but held by a person. Destination: the owner, who held it on 2026-08-27 |
| `2S-CLOSE-010` | 2S.4 | built | **ADR-139, 2026-08-28** — and by nothing else. It stood at `partial` for exactly as long as it should have: the mechanism was built here, and the remainder was the owner's. It is `built` now only by the **combination** the requirement itself names — the completed device checkpoint (slice 2S.3 §11 and §12, on real hardware, in two sittings) **and** the owner's authorization recorded as an ADR. Neither half alone would have done it, and a green pipeline is neither half |
| `2S-CLOSE-011` | 2S.4 | built | Refusal 16 — a successor requirement in the PRD, a `docs/initiatives/phase-2t` directory and a `docs/reports/phase-2t` directory are each refused; none exists |
| `2S-CLOSE-012` | 2S.4 | built | §5 — the query re-run against the deployed database, the result recorded **including the half that did not move**, and the mechanism read from the deployed function rather than the migration file |
| `2S-CLOSE-013` | 2S.4 | built | §3 — the closing record names the authority each inline verb dispatches to, and refusal 21 refuses a record that omits one while refusal 20 refuses a writer absent from the 2S.0 baseline |

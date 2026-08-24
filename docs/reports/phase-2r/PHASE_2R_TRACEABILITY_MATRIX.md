# Phase 2R — Traceability matrix

**Generated, never typed.** `node scripts/generate-phase-2r-traceability.mjs`
reads the PRD, the coverage report and the six slice acceptance records and
writes this file, or refuses and writes nothing. A matrix that is 72 of 73
correct reads as complete, which is why a refusal produces no file at all.

**73 declared · 73 classified · 0 unclassified.**

| Class | Count |
|---|---:|
| `built` | 51 |
| `baseline` | 17 |
| `partial` | 2 |
| `not-built-by-rule` | 3 |
| `undelivered` | 0 |

| Requirement | Slice | Class | Evidence |
|---|---|---|---|
| `2R-FOUNDATION-001` | 2R.0 | baseline | §2 — three independent reads, closed column list, delegated artifact scan, non-vacuity control |
| `2R-FOUNDATION-002` | 2R.0 | baseline | §3 — ten clauses observed live on `pg_proc.prosrc` and re-asserted against the migration that defines the function, with three absent-clause controls |
| `2R-FOUNDATION-003` | 2R.0 | baseline | §4 — five groups asserted **by position**, four named inputs as a closed set, and the dialog's real height limits at both breakpoints |
| `2R-FOUNDATION-004` | 2R.0 | baseline | §5 — the contract named; the second authority enumerated as eight call sites; the divergence executed; reachability proved from `pg_constraint`; destination recorded |
| `2R-FOUNDATION-005` | 2R.0 | built | §6 — the write path, the command union, the deployed boundary and the migration count all asserted unchanged |
| `2R-FOUNDATION-006` | 2R.0 | baseline | §7 — live re-read with a probe control in the same statement; audit §10.3 **confirmed** |
| `2R-MODEL-001` | 2R.1 | built | §3, §6 — created through the validated boundary; pgTAP §4 |
| `2R-MODEL-002` | 2R.1 | built | §3 — sixteen refusals in TypeScript, eleven in SQL, one driven at the CHECK constraint |
| `2R-MODEL-003` | 2R.1 | built | §3 — the version gate runs before the shape check, refusing `unknown-version` |
| `2R-MODEL-004` | 2R.1 | baseline | §5 — asserted as an equality; **no change was made** to the non-recurring path |
| `2R-MODEL-005` | 2R.1 | built | §4 — a partial unique index, proved by a refused second insert |
| `2R-MODEL-006` | 2R.1 | built | §4 — executed against real Postgres; the skip-forward reading is recorded as a decision |
| `2R-MODEL-007` | 2R.1 | built | §4 — idempotent **by the database**, proved by attempting the duplicate |
| `2R-MODEL-008` | 2R.1 | built | §6 — two owners, the stranger's row proved to exist before it is probed |
| `2R-MODEL-009` | 2R.1 | built | §7 — the post-deploy block refuses a deploy that moved anything else |
| `2R-TIME-001` | 2R.1 | built | §2 — wall clock preserved across a transition; the instant moves |
| `2R-TIME-002` | 2R.1 | built | §2 — spring-forward, pinned three times and paired against the native answer |
| `2R-TIME-003` | 2R.1 | built | §2 — fall-back, same treatment |
| `2R-TIME-004` | 2R.1 | built | §2 — the clamp, asserted exact rather than approximate |
| `2R-TIME-005` | 2R.2 | baseline | the second surface reads the page's one zone-bound formatter; no second authority added |
| `2R-TIME-006` | 2R.2 | baseline | no browser zone is read; the wall clock crosses the boundary and the database resolves it |
| `2R-TIME-007` | 2R.2 | built | no instant is computed client-side; `2R-SERIES-*` instants are the RPC's |
| `2R-SERIES-001` | 2R.2 | built | §3 — both scopes offered, narrower pre-selected, three no-write cases |
| `2R-SERIES-002` | 2R.2 | built | pgTAP §8 (2R.1 suite) — the rule is unchanged after a detach |
| `2R-SERIES-003` | 2R.2 | built | pgTAP §8 — the rule moves and earlier occurrences keep their values |
| `2R-SERIES-004` | 2R.2 | built | pgTAP §8, plus the badge that makes it observable on screen |
| `2R-SERIES-005` | 2R.2 | built | pgTAP §8 — ended, with every past occurrence still present |
| `2R-SERIES-006` | 2R.2 | built | `phase_2r_series_scope.sql` §1 — six assertions, the series still active and the next one materialised |
| `2R-SERIES-007` | 2R.2 | built | `phase_2r_series_scope.sql` §2 — pressed twice, `status = 'undone'`, second press idempotent with `affected: 0` |
| `2R-SERIES-008` | 2R.2 | built | §2 — occurrence cancellation names its consequence before it asks, and is offered no undo it cannot honour |
| `2R-SERIES-009` | 2R.2 | built | §3 — the applied scope is read from the RPC, driven apart from the request in a test |
| `2R-SURFACE-001` | 2R.3 | built | §11 — the delivered contract: **one frequency select plus one conditional weekday group shown only for `weekly`**, named inputs five → **six** where the sixth is a single name for all seven day controls, and `monthlyDay`, `monthlyWeekday` and `yearly` still add no field at all. The requirement's property — *the modal gains the control without becoming a form* — is asserted by comparing the field list before and after each choice. *(§1 recorded "one select, four → five" and that was true of the first version; the device checkpoint superseded it when Monday/Wednesday/Friday would otherwise have taken three reminders. The earlier reading is kept in §1 and §11 rather than rewritten.)* |
| `2R-SURFACE-002` | 2R.3 | built | §1 — three occurrences before saving, from the RPC, in the owner's zone |
| `2R-SURFACE-003` | 2R.3 | built | §2 — the list and the calendar both say it repeats and how, from one formatter |
| `2R-SURFACE-004` | 2R.3 | built | §4 — the rule never leaves the server; the sweep asserts what cannot appear |
| `2R-SURFACE-005` | 2R.3 | baseline | §2 — already true by construction; asserted rather than built |
| `2R-SURFACE-006` | 2R.3 | built | the typed `copy.ts` block; no locale ternary added |
| `2R-SURFACE-007` | 2R.3 | built | `satisfies Record<Locale, …>` makes a missing key a build error; the journey renders the second locale |
| `2R-SURFACE-008` | 2R.3 | built | §3 named "controlled fields plus the select reconciliation". That evidence was **incomplete**: the requirement was silently false for `weekdays` and `important`, which a form reset emptied while the surface still showed them. The reconciliation it cites is now **deleted**; the requirement holds because the reset no longer happens |
| `2R-NOTIFY-001` | 2R.4 | baseline | §3 — withheld inside the window, delivered outside it, delivered again once it passed, and never marked `sent` while withheld |
| `2R-NOTIFY-002` | 2R.4 | baseline | §3 — five due occurrences across five series deliver three; the two over the cap stay scheduled and due; the three delivered each materialise one future successor; a second run the same day adds nothing |
| `2R-NOTIFY-003` | 2R.4 | baseline | the cooldown is scoped to `task_overdue`/`task_stale` **by name** and the heartbeat contains no series concept. Asserted on the deployed function rather than on a fixture, because the requirement is about what the rule *covers*. **This one is a read, and the record does not call it a proof** |
| `2R-NOTIFY-004` | 2R.4 | baseline | §4 — a forced failure, survived, with the next user still delivered to |
| `2R-NOTIFY-005` | 2R.4 | baseline | §2. The plan expected code; the mechanism already existed. Manufacturing a change to justify the label would have been the dishonest option |
| `2R-NOTIFY-006` | 2R.4 | baseline | §5 — no content column, no delivery row, and a control proving the in-app surface is untouched |
| `2R-NOTIFY-007` | 2R.4 | not-built-by-rule | a new guard in `phase-2r-declarations.test.ts` forbids a **push claim** across the phase's records, with a mutation control planting the forbidden sentence and the permitted refusal. It forbids the act, not the word, because the HTTP 403 remainder has to stay nameable |
| `2R-TRUST-001` | 2R.5 | built | the materialisation trigger writes an `audit_logs` row carrying actor `system`, the completed reminder as before-state, the new instant, sequence and timezone as after-state, and a reason — and writes it **only when a row actually appeared**, so the audit records writes rather than attempts |
| `2R-TRUST-002` | 2R.5 | built | the migration contains **zero** occurrences of `automation_categ`; materialisation carries no policy state and is reported nowhere as autonomy |
| `2R-TRUST-003` | 2R.5 | baseline | §2 — re-read live at closeout: `automation_category_policies` holds **zero** rows, so all six categories read through the computed default, unchanged from the phase's baseline. **No change was made** |
| `2R-TRUST-004` | 2R.5 | baseline | the one migration the phase spent moved no grant, RLS policy, retention rule or authority beyond its own new relation, asserted against its own diff in `PHASE_2R_SLICE_01_DEPLOYMENT.md`; the five slices after it created no migration to move anything with. **No change was made** |
| `2R-TRUST-005` | 2R.5 | built | `public.reminder_series` grants `authenticated` **select and nothing else** — no insert, update or delete grant and no delete policy for anyone — so every write goes through a `security definer` RPC validating `auth.uid()`. A browser could not write these rows if it tried |
| `2R-TRUST-006` | 2R.5 | built | where the rule reaches no next instant the trigger returns **without inserting**, and the preview renders the RPC's own sentence instead of a date. Neither surface shows a guess |
| `2R-TRUST-007` | 2R.5 | not-built-by-rule | the signed rule is the requirement's own: no AI call is made by this phase. Zero credentials spent across six slices and two corrective rounds; the destination for anything needing one is a later initiative, and no half of this phase was recorded as passing on an unspent credential |
| `2R-ACCESS-001` | 2R.3 | built | the composer case operates the control by keyboard; the journey repeats it in a browser |
| `2R-ACCESS-002` | 2R.3 | built | the scope choice is a `fieldset`/`legend` radiogroup (slice 2R.2); the new select is labelled |
| `2R-ACCESS-003` | 2R.3 | built | both live regions render **empty before** their first sentence, asserted on an idle page |
| `2R-ACCESS-004` | 2R.3 | partial | axe at `serious` is written and runs **only in the manual lane**. Remainder: **`2R-AXE-MANUAL-LANE`** — destination, the closing record's evidence list |
| `2R-ACCESS-005` | 2R.3 | not-built-by-rule | the signed rule is the requirement's own: no screen-reader claim is made anywhere in this phase. No record describes any part of it as screen-reader evidence; `phase-2r-declarations.test.ts` enforces the refusal and was not touched. Its destination is `2P-ACCESS-005`, which stays **NOT EXECUTED — OWNER WAIVED**. *(Class corrected at closeout: it read `built`, and a rule's delivery is its recorded refusal.)* |
| `2R-MOBILE-001` | 2R.3 | partial | now asserted at 375px on a **rendered page in CI** for the public surfaces (§12), and in the manual lane behind auth. The remainder is the lane, not the behaviour |
| `2R-MOBILE-002` | 2R.3 | built | the dialog gained a height bound and a scroll container at every width (§3), guarded by the inverted 2R.0 assertion; the journey scrolls save into view and asserts it is in the viewport |
| `2R-MOBILE-003` | 2R.3 | built | approved on the owner's own iPhone at the **third** run, 2026-08-24 (§20). Three runs, five defects, all fixed and each re-tested on hardware. **Not substituted and not claimed** — no Playwright project, including the emulated WebKit one, was ever offered as evidence for it |
| `2R-CLOSE-001` | 2R.5 | built | `scripts/generate-phase-2r-traceability.mjs` emits **73 classified, 0 unclassified**, and refuses rather than emitting a partial matrix |
| `2R-CLOSE-002` | 2R.5 | built | the generator refuses a `partial`, `undelivered` or `not-built-by-rule` row whose evidence — with its own identifier **stripped first** — names no remainder and no destination |
| `2R-CLOSE-003` | 2R.5 | built | classifications are read from the slices' records, never typed; `--check` refuses a matrix that differs from a fresh generation byte for byte |
| `2R-CLOSE-004` | 2R.5 | built | the generator refuses a requirement the coverage report assigns to no slice |
| `2R-CLOSE-005` | 2R.5 | built | the generator refuses a requirement whose declared criterion cell is empty or trivial |
| `2R-CLOSE-006` | 2R.5 | built | a second, looser declaration pattern admitting digits finds anything the strict one cannot see, and refuses it by name. The two-sided control lives in the declaration guard |
| `2R-CLOSE-007` | 2R.5 | built | the generator refuses a phase that spent a migration without a deployment record naming it, and the record names `202608230101` |
| `2R-CLOSE-008` | 2R.5 | built | the declaration guard refuses an `OD-2R-*` marked signed with no accepted ADR naming it; ADR-132 signs all nine |
| `2R-CLOSE-009` | 2R.5 | built | the guard refuses a record marking `2R-MOBILE-003` satisfied with no owner device session, and the generator refuses evidence that names none. The checkpoint took **three runs** and a person closed it |
| `2R-CLOSE-010` | 2R.5 | built | the generator refuses a successor requirement anywhere in this phase's PRD; Phase 2S is not started, not planned and not named as active |
| `2R-CLOSE-011` | 2R.5 | built | the generator refuses a closing record that drops any of audit §7's inherited remainders, checked by name |
| `2R-CLOSE-012` | 2R.5 | built | the mechanism exists and **the phase is not closed by it**: closure requires an owner decision recorded as an ADR after a device checkpoint, and this record explicitly does not perform one |

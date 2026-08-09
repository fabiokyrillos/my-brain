# Phase 2L — Traceability matrix

**Generated** by `scripts/generate-phase-2l-traceability.mjs`, which refuses to emit
anything when a requirement is unclassified, classified twice, classified without a
resolvable citation, classified as partial with no destination, classified as
not-built-by-rule with no rule, or classified in a way that contradicts a signed
decision — and which reconciles the migration budget by looking at the directory.

**82 requirements declared · 82 classified · 0 unclassified.**

71 built · 5 baseline · 5 partial · 1 not-built-by-rule · 0 undelivered

**Migration budget: 1 allocated · 0 spent.**

| id | slice | classification | evidence |
|---|---|---|---|
| `2L-AUDIT-001` | 2L.0 | built | Section 2 - statuses, actions, policies, eligibility and undo strategies re-derived from `taxonomy.ts` at the implementation baseline; no divergence from the audit's 1.5, and the call-site census is now `phase-2l-work-authority-guard.test.ts` rather than a paragraph |
| `2L-AUDIT-002` | 2L.0 | built | Section 2 - `detailControlsFor` iterates `TASK_COMMAND_ACTIONS`, asks `actionPolicy` and takes `choices` from `allowedTargetValues`; the guard additionally asserts `detail-controls.ts` names no status and no priority literal |
| `2L-AUDIT-003` | 2L.0 | built | Section 3 - two round trips per item, one `undo_operations` reservation plus one `audit_logs` row per applied item, and a refused item rolls back its own reservation, so the ceiling of 50 is confirmed safe rather than assumed |
| `2L-AUDIT-004` | 2L.0 | built | Section 4 - five enforcement points named, all three view declarations identical in the same order, and the writer proved to hold no copy; conclusion: OD-2L-2 A needs no migration |
| `2L-AUDIT-005` | 2L.0 | built | Section 5 - `task-derivation.ts` is OD-2L-1 option B as executable code: three outcomes, only two of them levels, and `undetermined` structurally incapable of carrying one |
| `2L-AUDIT-006` | 2L.0 | built | Section 6 - the inherited residuals dispositioned with a destination each; `2K-AUDIT-002` and `2K-EXPL-007` leave the phase, `2K-A11Y-007` is inherited as a stated limitation, and none was created here |
| `2L-EDIT-001` | 2L.1 | built | Section 3 - the list mounts `TaskDetailControls`; controls derived in `work-projection.ts` from `detailControlsFor(row.status)`, asserted against the derivation rather than a literal in `work-projection.test.ts` |
| `2L-EDIT-002` | 2L.1 | built | Section 3 - no Server Action, RPC, table or column added; `phase-2l-work-authority-guard.test.ts` still pins `apply_task_command` at exactly one call site |
| `2L-EDIT-003` | 2L.1 | baseline | Section 3 - the four declared outcomes with localized copy are `applyTaskDetailCommand`'s, unchanged and tested in `detail-actions.test.ts`; quick edit inherits them by mounting the same component |
| `2L-EDIT-004` | 2L.1 | baseline | Section 3 - the four value refusals and their sentences are `buildDetailPatch`'s and `detail-controls-copy.ts`'s, proved in `detail-controls.test.ts`; inherited verbatim rather than reimplemented |
| `2L-EDIT-005` | 2L.1 | baseline | Section 3 - the staleness refusal and its refresh affordance are `applyTaskDetailCommand`'s `stale_pre_state` branch, tested where it lives; inherited verbatim |
| `2L-EDIT-006` | 2L.1 | baseline | Section 3 - replay under one operation key is `apply_task_command`'s idempotency, surfaced as `replayed`; inherited verbatim rather than reimplemented |
| `2L-EDIT-007` | 2L.1 | built | Section 3 - `TaskDetailSurface` is the whole surface and both routes are a locale check and a call; `panel` selects a frame and a back affordance only, asserted in `page.architecture.test.ts` |
| `2L-EDIT-008` | 2L.1 | built | Section 3 - `UndoAffordance` on the Work list's outcome region and on the detail's; `undoWorkOperation` reuses the existing undo-router call site, so the census stays at four modules |
| `2L-EDIT-009` | 2L.1 | built | Section 3 - structural: `apply_task_command` returns `undoId: null` for a no-change, so an irreversible operation has nothing to offer and the component takes no decision |
| `2L-EDIT-010` | 2L.1 | baseline | Section 3 - `cancel_task` submits `request_cancel` and the server issues the confirmation against its own resolution; inherited from the detail controls and re-asserted in `quick-edit.test.tsx` |
| `2L-BULK-001` | 2L.2 | built | Section 2 - `selection.ts` plus the bar: visible, countable and dismissible without applying, proved in `selection.test.ts` and `bulk-bar.test.tsx` |
| `2L-BULK-002` | 2L.2 | built | Section 2 - `selectAllShown` takes the page's own ids as its argument, so no arm of it can mean "everything matching" |
| `2L-BULK-003` | 2L.2 | built | Section 2 - the ceiling derives from `WORK_PAGE_SIZE`; a refusal returns the unchanged selection, `selectAllShown` refuses whole, and the bound is on screen from the first selection |
| `2L-BULK-004` | 2L.2 | built | Section 2 - derived from two predicates and asserted both by re-derivation and by name; `cancel_task` excluded by name and by test |
| `2L-BULK-005` | 2L.2 | built | Section 2 - `previewBulk` partitions by the same predicate the apply path asks, driven over one set of fixtures; rendered continuously so Apply is never reachable without it |
| `2L-BULK-006` | 2L.2 | built | Section 2 - `requiresConfirmation` is computed from the set membership, and the Server Action refuses a destructive verb before reading anything |
| `2L-BULK-007` | 2L.2 | not-built-by-rule | Section 2 - under OD-2L-3 option A no bulk-eligible operation requires a confirmation, so a confirmation authorizing exactly one previewed set has no subject. A rule-driven absence, signed by ADR-103 |
| `2L-BULK-008` | 2L.2 | built | Section 2 - the loop catches per item; the canonical test drives three items with the middle one absent and asserts the RPC calls that actually happened |
| `2L-BULK-009` | 2L.2 | built | Section 2 - four kinds with no-change counted apart from both applied and refused; a partial is reachable from exactly one condition |
| `2L-BULK-010` | 2L.2 | built | Section 2 - one key per task and verb, asserted distinct at the RPC in `bulk-actions.test.ts` |
| `2L-BULK-011` | 2L.2 | partial | Section 1 - foreign and deleted are byte-identical and asserted; ineligible stays distinct and reveals nothing, being reachable only for a row that came back from the caller's own resolution. Remainder: none in behaviour; the divergence from the plan's phrasing is the destination, recorded in this record's section 1 |
| `2L-BULK-012` | 2L.2 | built | Section 2 - the undoable subset is derived from the presence of an undo id, never from the outcome label, so an item the domain wrote no reversal for cannot appear |
| `2L-VIEW-001` | 2L.3 | built | Section 3 - `work-views.ts` declares the three ids and each view's default ordering; names and descriptions stay in copy because they are translated, and the predicates stay in SQL where they are builder clauses |
| `2L-VIEW-002` | 2L.3 | built | Section 3 - no fourth reported view; `workViews` unchanged and the vocabulary guard now reads the new declaration site and asserts the old one only re-exports |
| `2L-VIEW-003` | 2L.3 | built | Section 3 - completed and cancelled are reachable through the named state filter, linked from the Work surface, and the existing cancelled-task recovery route keeps working and stays linked |
| `2L-VIEW-004` | 2L.3 | built | Sections 3 and 4 - filters over task columns plus the two relation filters, each expressible in the URL and asserted per parameter in `work-query.test.ts` |
| `2L-VIEW-005` | 2L.3 | built | Section 3 - a closed ordering set, expressible in the URL, with the view's declared default; there is deliberately no by-priority ordering and the reason is recorded |
| `2L-VIEW-006` | 2L.3 | built | Section 3 - grouping runs over the page that came back and cannot issue a query at all; each group states its own count, proved in `work-grouping.test.ts` |
| `2L-VIEW-007` | 2L.3 | built | Section 3 - one parser and one serializer; no cookie, preference or storage on the route, the view, the controls or the parser, asserted across all four files |
| `2L-VIEW-008` | 2L.3 | built | Section 3 - every parameter fails closed per parameter, a repeated one resolves to the default, and the state filter cannot widen a view |
| `2L-VIEW-009` | 2L.3 | built | Sections 3 and 5 - pagination carries the whole query, every ordering ends with the id so a page boundary is stable, and a page past the end renders an empty state |
| `2L-RETURN-001` | 2L.3 | built | Section 5 - the position travels with each task link, serialized once per page in the projection, and the detail's back affordance resolves it |
| `2L-RETURN-002` | 2L.3 | built | Section 5 - carried in the URL and nowhere else; no server-side state, no stored preference, no client-persisted position, asserted on the source |
| `2L-RETURN-003` | 2L.3 | built | Section 5 - a strict schema plus a named forbidden list, each field planted one at a time; the whole position falls back rather than being ignored |
| `2L-RETURN-004` | 2L.3 | built | Section 5 - every load is a fresh owner-scoped query, asserted by the absence of caching directives rather than by trusting today's code |
| `2L-RETURN-005` | 2L.3 | built | Section 5 - a non-first page that comes back empty resolves to the first page and the surface says so; the choice of nearest is recorded rather than claimed as exact |
| `2L-MOBILE-001` | 2L.4 | built | Section 1 - every control measured from paint at the mobile viewport over all four Work fixtures; the widened locator found three real defects, all now at the WCAG 2.5.8 minimum |
| `2L-MOBILE-002` | 2L.4 | built | Section 4 - the bulk bar's box is proved not to intersect any row's box, geometrically rather than by asserting it is not fixed-position |
| `2L-MOBILE-003` | 2L.4 | built | Section 4 - every control measured without hovering: it has a box, is visible and has non-zero opacity |
| `2L-MOBILE-004` | 2L.4 | built | Section 2 - a permanent guard over thirteen named surfaces that fires on a handler added in preparation, does not fire on a comment, and asserts its own completeness against the components on disk |
| `2L-MOBILE-005` | 2L.4 | built | Section 5 - a control mid-flight is disabled rather than re-triggerable, and the one destructive verb stays behind its server-issued confirmation |
| `2L-MOBILE-006` | 2L.4 | built | Section 5 - the selection survives a re-render, and the count is announced in its own polite region apart from the outcome's |
| `2L-MOBILE-007` | 2L.4 | built | Section 4 - scroll width never exceeds client width, and every row action's box lies inside the viewport; the filter controls remain rendered at the mobile viewport |
| `2L-MOBILE-008` | 2L.4 | partial | Section 6 - every mobile behaviour is proved at an emulated viewport and the record says so. Remainder: a real-device session, which needs owner-run hardware. Destination: the same standing as G-2J.4b, carried past close |
| `2L-MOBILE-009` | 2L.4 | built | Section 4 - reflow proved at 320 CSS pixels and at an emulated 200 percent zoom, with no control losing its box; the emulation method is stated rather than implied |
| `2L-MOBILE-010` | 2L.4 | built | Section 3 - guarded on the keydown and again inside the submit handler; never discarded by a re-render because the inputs are uncontrolled and the flag is a ref |
| `2L-PRIVACY-001` | 2L.1 | built | Section 2 - `work` joins `GOVERNED_SURFACES` with its consumers; both surfaces resolve through `ProtectedContent`, and the convergence census proves the surface key appears in exactly one module |
| `2L-PRIVACY-002` | 2L.1 | built | Sections 2.1 and 2.3 - re-read per page, never stored; no sensitivity column, no backfill, no migration, and `toTaskSensitivity` fails closed to the most protective level rather than to `undetermined` |
| `2L-PRIVACY-003` | 2L.1 | built | Section 2.5 - masked in place with a local reveal; the row, its state, its dates, its relations and its four actions survive, and the masked row stays openable through a stub that carries the link without the title |
| `2L-PRIVACY-004` | 2L.1 | built | Sections 2.2 and 2.7 - a manual task resolves to `undetermined`, the arm never asks for a level, and the partial coverage is stated on the list when something is masked and on the detail for a manual task |
| `2L-PRIVACY-005` | 2L.1 | built | Section 2.2 - removed, foreign and unreadable are one branch, proved byte-identical at the derivation and again at the projection |
| `2L-PRIVACY-006` | 2L.1 | built | Section 2.1 - owner scope stated in the query as well as under RLS, bounded to the page's own ids; no grant, no security-definer helper, no service-role client |
| `2L-PRIVACY-007` | 2L.1 | built | Sections 2.4 and 2.6 - one component, mounted by the list, the detail and Hoje; the convergence guard asserts each surface and the one-module census |
| `2L-PRIVACY-008` | 2L.1 | built | Section 2.5 - no event gained a property and no classification is emitted; the telemetry guard asserts no emitter imports the derivation at all |
| `2L-ACCESS-001` | 2L.5 | built | Section 2 - four Work fixtures, each added in the slice that built its surface rather than at closeout, and each running at both viewports on every CI run |
| `2L-ACCESS-002` | 2L.5 | built | Section 2 - the axe scan reports no serious or critical violation on any Work fixture, at desktop and at the mobile project |
| `2L-ACCESS-003` | 2L.5 | built | Section 2 - accessible names carry the object: the row checkbox names the item, the reveal names the item, and the active filter is exposed through aria-current rather than only as a colour |
| `2L-ACCESS-004` | 2L.5 | built | Section 2 - the lane's focus walk measures a painted indicator on every focusable control, and the Work fixtures are inside that walk |
| `2L-ACCESS-005` | 2L.5 | built | Section 2 - the controls are links, buttons and native form controls throughout, with no custom widget and no focus trap outside the one dialog the detail already had |
| `2L-ACCESS-006` | 2L.5 | built | Section 2 - one polite region per concern; a bulk result announces once and moves focus once, to the result, rather than per item |
| `2L-ACCESS-007` | 2L.5 | built | Section 2 - this phase introduced no motion at all, which is an evidenced negative rather than a claim about a reduced-motion query |
| `2L-ACCESS-008` | 2L.5 | partial | Section 2 - reported as NOT EXECUTED rather than rounded up. Remainder: a real screen-reader session and a real-device session. Destination: owner-run hardware, the same standing as G-2J.4b, carried past close |
| `2L-METRICS-001` | 2L.5 | built | Section 1 - every property is a closed enum, a boolean or a policy version; the guard asserts no builder produces a title, note, description, name, query or free-text property |
| `2L-METRICS-002` | 2L.5 | built | Section 1 - both events are emitted from the Work surfaces and both are consumed by the existing task-command funnel, so neither is a producer nobody reads |
| `2L-METRICS-003` | 2L.5 | built | Section 1 - both names appear in the migration chain as well as in the application vocabulary, so a declared-but-unwritable event cannot reach a deployment |
| `2L-METRICS-004` | 2L.5 | built | Section 1 - the enforcement points are enumerated by name and proved to name one vocabulary; the Work-only modules emit nothing outside the two, and the Work undo emits exactly one |
| `2L-METRICS-005` | 2L.5 | partial | Section 1 - quick edit, bulk apply and undo each report a closed outcome through the deployed vocabulary. Remainder: selection and bulk preview, which have no admitting event name. Destination: the successor phase that spends a migration on the Work event vocabulary; inventing one here would produce a producer the deployed CHECK rejects |
| `2L-METRICS-006` | 2L.5 | built | Section 1 - the measures this phase can compute are computable from the two events alone; the ones that would have needed a selection or preview event are removed rather than approximated, which is what 2L-METRICS-005 records |
| `2L-METRICS-007` | 2L.5 | built | Section 1 - the guard asserts no Work path constructs a provider, records AI usage or requests a rate-limit slot |
| `2L-CLOSE-001` | 2L.5 | built | Section 3 - all 82 requirements classified exactly once by a generator that refuses rather than prints an unresolved claim |
| `2L-CLOSE-002` | 2L.5 | built | Section 3 - every partial and undelivered row names its remainder and its destination, and the generator refuses a row that does not |
| `2L-CLOSE-003` | 2L.5 | built | Section 3 - the budget is reconciled by looking at the migration directory rather than by restating a number; 1 allocated and 0 spent, which is a legitimate close |
| `2L-CLOSE-004` | 2L.5 | partial | Section 4 - hosted parity is reported as unmoved at 202608090089 from the migration chain and the recorded deployment state. Remainder: a live migration-list reading, which this phase never needed because it changed no schema. Destination: recorded as a limitation rather than claimed as executed |
| `2L-CLOSE-005` | 2L.5 | built | Section 4 - every unexecuted check is named as unexecuted: hosted probes, real device, screen reader, authenticated online journeys, hydrated interactivity, and any run against a real database |
| `2L-CLOSE-006` | 2L.5 | built | The closing report restates ADR-055's 2026-10-27 expiry as neither satisfied nor superseded; this phase adds no semantic retrieval of any kind |
| `2L-CLOSE-007` | 2L.5 | built | The closing report's successor section re-audits the roadmap successor against the closed product and stops for owner authorization, creating no successor artifact and declaring no successor requirement |

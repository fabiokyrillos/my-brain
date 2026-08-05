# EGC.1 — Organizations and Contexts · Acceptance record

**Slice EGC.1 of Entity Graph Completion.** Governed by
[`ENTITY_GRAPH_COMPLETION_PRD.md`](../../ENTITY_GRAPH_COMPLETION_PRD.md) and
[`ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md`](../../ENTITY_GRAPH_COMPLETION_IMPLEMENTATION_PLAN.md)
§"Slice EGC.1", on the evidence in
[`ENTITY_GRAPH_FINDINGS.md`](./ENTITY_GRAPH_FINDINGS.md).

Branch `codex/egc-slice-1`, six commits from `main` at `4071a2f`.

---

## 1. What this slice closes

`public.organizations` and `public.contexts` were created by `202607160003` with
forced RLS, four own-row policies and full `authenticated` CRUD. For fifteen days
nothing in the application wrote either of them — the only writer of any kind was
`persist_entry_interpretation` (`202607160005`). So a company could appear in the
owner's data because a capture mentioned it, and the Company selector on a Person
or a Project could report "no company recorded yet" while owning no way to make
one. That is `EG-04`: a dead end presented as a choice.

The slice gives both tables a route, a create path, an edit path, a place in the
navigation, a localized audit vocabulary, and a create-and-select affordance on
the Company selector. It adds **no migration, no column, no grant, no policy and
no privileged boundary**.

---

## 2. Acceptance gates

| Gate | Requirement | Result | Evidence |
| --- | --- | --- | --- |
| **A1** | Migration-chain head still `202607310064` | **PASS** | `202607310064_reminder_lifecycle_command.sql` is the last file; `migration-head.test.ts` (G-0.3) green in the full suite |
| **A2** | Grants and policies on both tables unchanged, **non-vacuously** | **PASS (CI)** | `supabase/tests/egc_entity_graph_surfaces.sql` §1–2. Asserts all four privileges *present* for `authenticated` before asserting `anon` holds none; names all four policies per table rather than counting them. Executed by the `database` CI job |
| **A3** | `direct-write-guard.test.ts` unchanged, `tasks` allowlist still empty | **PASS** | `git diff` touches no guard file; the allowlist is still `[]` |
| **A4** | An organization created on the Person form is selectable **in the same action**, and `people.organization_id` is the created row | **PASS** | `online-entity-graph.spec.ts` "gate A4", desktop + Pixel 7. Asserts after a **reload**, so a value that never reached storage cannot pass; then opens the company's own page and finds the person there |
| **A5** | Two owners, each seeing only their own, the stranger's absence asserted **after** the owner's positive count | **PASS (CI)** | `egc_entity_graph_surfaces.sql` §4, six assertions. Read side both directions; write side proves an UPDATE with no `user_id` predicate changes nothing, then reads the row back as a role that can see it — so "changed nothing" is distinguished from "deleted it" |
| **A6** | A duplicate name returns a localized message, not a `23505` | **PASS** | `actions.test.ts` — both locales asserted, and the refused input echoed back |
| **A7** | `audit_logs` rows for every create and update, `actor = 'user'`, no user content beyond the changed fields | **PASS** | `actions.test.ts` per action; `egc_entity_graph_surfaces.sql` §5 proves the row shape is accepted, that a row forged for another owner is refused by policy, that `actor` is closed at the database, and that `audit_logs` is still append-only for `authenticated` |
| **A8** | Locale-ternary count ≤ the G-0.4 baseline | **PASS** | **266**, exactly the baseline. Every new sentence goes through `entities/copy.ts` |
| **A9** | Desktop + Pixel 7 journeys, both locales, on all four new routes | **PASS** | `online-entity-graph.spec.ts` **8/8**; `online-route-audit.spec.ts` **18/18** with both routes across four viewports (375/412/1440/1920) and both locales |
| **A10** | Lint 0, typecheck 0, full Vitest green, production build exit 0 | **PASS with one stated exception** | Lint 0, typecheck 0, build exit 0, Vitest **3249 passed / 2 failed** — see §5 |

---

## 3. What was delivered

| Plan task | Delivered |
| --- | --- |
| 1.1 schemas | `organizationCreateSchema`, `organizationUpdateSchema`, `contextCreateSchema`, `contextUpdateSchema`; `asContextKind` |
| 1.2 actions | `createOrganization`, `updateOrganization`, `createContext`, `updateContext`, `createOrganizationForSubject` |
| 1.3 `loadOrganizations` | Added beside `loadOrganizationOptions`; the module header's read-only sentence amended rather than deleted |
| 1.4 `contexts.ts` | `loadContexts`, `loadContextOptions` (bounded at 200, matching `relation-options.ts`) |
| 1.5 routes | `app/organizations`, `app/organizations/[organizationId]`, `app/contexts`, `app/contexts/[contextId]` |
| 1.6 copy | 43 keys per locale in `entities/copy.ts`; zero new inline ternaries |
| 1.7 capabilities | Both in the `context` group, `visibility: "more"`, `nested: true` |
| 1.8 history vocabulary | `organization` and `context` entity types; `create_organization`, `update_organization`, `create_context`, `update_context`; both locales; both linkable in `subject-route.ts` and resolvable in `projection.ts` |
| 1.9 create-and-select | `InlineOrganizationCreate`, a **sibling** form of the edit form |
| 1.10 UX-04 outcome | `entityHref` now routes both; the comment saying they had no page is amended with the reason it was true |

**Two loaders with deliberately opposite failure contracts.** A list page *is* its
rows, so `loadContexts`/`loadOrganizations` throw rather than render an empty
state they did not measure. An options list is one optional control on somebody
else's page, so `loadContextOptions`/`loadOrganizationOptions` degrade to empty.
Both directions are tested, because getting the pair backwards is invisible until
the day a query fails.

---

## 4. The adversarial review, and what it found

A hostile review of the whole diff produced **thirteen findings**. All thirteen
were remediated in `f591719`; none was argued down.

**Three BLOCKERs, every one in the pgTAP file, none reachable locally** — Docker
is unavailable on this machine, so the suite could not be executed before the
`database` CI job would have run it:

1. A data-modifying `WITH` attached to a scalar sub-SELECT. Postgres refuses that
   at **parse** time (`0A000`) — an aborted transaction, not a failing assertion,
   which would have taken every later assertion with it and left `plan(26)` unmet.
2. `person_contexts` and `task_contexts` each carry **two** foreign keys to
   `contexts`: the inline cascading one from `202607160009` and the composite
   `(user_id, context_id)` ownership key `202607170016:79-103` added. The scalar
   subqueries would have raised `21000`. Rewritten as existence tests — which is
   also the claim EGC-DEC-1 actually rests on.
3. `people` and `projects` likewise carry two keys each to `organizations`, so
   the aggregate evaluated to `'a,n'` where the assertion expected `'n'` — and
   the prose beside it was wrong about the catalog it claimed to read.

**One HIGH.** `createOrganizationForSubject` performed its assignment with no
pre-read, so linking a person who *already had* a company recorded `after_state`
alone. The previous association vanished with no record of what it was — in the
single write in the module that could silently discard a relation, while the
file's own header claims read-before-write as a stated property.

**One MEDIUM worth naming separately, because it is older than this slice.**
Cancel-after-a-refusal permanently killed the reopen control on all three forms,
including the two that shipped in Phase 2F. Guarding the whole `open` expression
with `dismissed !== state` meant the reopen click set `openedFor` to the very
state object `dismissed` already held; the form stayed shut, and because it was
not rendered no new state could arrive to unstick it. **The Edit button was dead
until a page reload.** Two tests stopped exactly one click short of catching it.
`dismissed` now guards only the error clause, and both forms carry a regression
test that clicks the one extra time.

The rest: two identical accessible names on simultaneously visible buttons; the
ternary ceiling reading 267 because a comment *quoted* the pattern it claimed not
to add; two journey assertions satisfied by the fixture's own name; a
nested-highlight assertion behind a conditional that silently skipped in any
worker without a prior test's rows; `subjectId` reaching a write without uuid
validation, so a malformed request left an orphan organization reported as a
partial success; a consumer-less `createdId` whose test comment described a
mechanism that does not exist; `vocabulary.test.ts` not actually naming the
TypeScript writers its comment claimed; and `optionalText`'s `4000` documented as
the product ceiling it is rather than the column bound it is not.

**No security finding.** Cross-tenant read, cross-tenant write, forged input
reaching a write, forged audit rows and user content treated as instructions were
each attempted and could not be constructed.

---

## 5. The two failing tests, stated rather than rounded off

`src/features/task-commands/sql-reachability.test.ts` fails 2 of its 46
assertions on this machine. **They are not a regression and not this slice's.**
Verified by checkout: the identical two failures occur on `main` at `4071a2f`,
whose merge-SHA CI run `30661600312` was green on all three jobs.

The cause is the Windows CRLF checkout diagnosed by the UX remediation's Slice H
(`core.autocrlf = true`, no `.gitattributes`). The two assertions match literals
containing a newline immediately after non-whitespace — `"\n  select\n    r.id,"`
and `/order by\n/` — which never match `\r\n`. Every migration file in the tree
is 100% CRLF. Linux CI reads LF and passes.

It is **not fixed here**, deliberately: it is a test-robustness defect in another
feature, and mixing it into a feature branch is exactly what the commit discipline
forbids. It is already recorded as repository maintenance in
`PRODUCT_UX_CLOSEOUT.md` §8.

---

## 6. Invariants, measured

| Invariant | Claim | Measured |
| --- | --- | --- |
| EGC-INVARIANT-001 | Migration head `202607310064` | Unchanged; G-0.3 test green |
| EGC-INVARIANT-002 | Zero grant changes, zero policy changes | No SQL added outside `supabase/tests/`; pgTAP §1–2 asserts the posture positively |
| — | Zero new privileged boundaries | No RPC, no `SECURITY DEFINER`, no `service_role` client; pgTAP §1 asserts no definer function by any of the four names exists |
| — | No AI call | No `src/lib/ai` import anywhere in the diff |
| — | No `tasks`/`reminders` write change | The only new reference is a `select` on `tasks` from the context detail page |
| EGC-SURFACE-002 | Locale ternaries ≤ 266 | **266** |
| EGC-DEC-1 | No deletion path | No `.delete(` added; pgTAP §6 reads the cascades the decision rests on |
| EGC-ASSOC-003 | One application writer per table | Every `.from("organizations"\|"contexts")` outside `actions.ts` is a `select` |

---

## 7. Deferred to EGC.2, by design

`person_contexts` stays **read-only** on the context detail page. EGC.2 owns the
single writer for that table, and adding a second one here is exactly the
duplication `EGC-ASSOC-003` exists to prevent.

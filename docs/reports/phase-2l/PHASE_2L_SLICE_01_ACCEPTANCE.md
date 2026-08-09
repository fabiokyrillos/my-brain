# Phase 2L — Slice 2L.1 · acceptance record

**Status:** executed. **Zero migrations. Zero new write paths. Zero new grants,
policies or RPCs.** Hosted parity remains `202608090089`, 89 migrations.

**Baseline:** `main` at `a9a4586b0cec01015c5a4da697528b1d191e2090` — the 2L.0 merge
commit, CI green on all three jobs at that exact SHA. Branch
`codex/phase-2l-slice-1`.
**Authorization:** ADR-103 (implementation through closeout; all five decisions signed).
**Requirements covered:** `2L-EDIT-001…010`; `2L-PRIVACY-001…008`;
`2L-ACCESS-001…004`, `-006`, `-007` for the surfaces this slice builds.

---

## 1. The mandatory pre-slice review, and what 2L.0 changed

The plan requires 2L.1 to be reviewed against the product as 2L.0 left it, before
implementation. It was, and it moved four premises. **None of them is a decision:**
every one is a fact the plan asserted about the repository that turned out to be
differently shaped, and every one is reconciled below without touching a signed
decision, the migration ceiling, the ceiling of 50, or any of OD-2L-1 B, OD-2L-2 A,
OD-2L-3 A, OD-2L-4 50 or OD-2L-5 A.

| The plan said | What is actually there | How it was reconciled |
|---|---|---|
| Create `src/features/operations/copy.ts`, "the typed copy module the surface currently lacks" | `work-actions-copy.ts` already exists and is typed — but its records are keyed by `WorkSurfaceAction` and `WorkCommandRefusal`, which are the *status path's* vocabularies | `copy.ts` created alongside it, for the vocabularies this slice adds. Folding them together would make one record whose halves are indexed by unrelated key types. |
| Quick edit needs a control set built for the list | `detailControlsFor(status)` and `TaskDetailControls` already derive and render every verb, bounded by the policy, with the destructive verb behind a server-issued confirmation | The list **mounts the same component**. `2L-EDIT-001…006` and `-010` are inherited rather than re-implemented, which is why this slice's own tests assert only what is genuinely new. |
| The task detail's controls can be derived on the list | `WorkItemView` carries `humanState`, which is lossy by design — `inbox` and `todo` are both `not_started` — so eligibility cannot be answered from it | Derived in `work-projection.ts`, which has the row's real status, and passed down as `editControlsByTaskId`. |
| Undo "where it belongs" is an affordance to add | The whole mechanism already exists — `undo_operations` with a 24h expiry, `public.undo_operation`, an owner-scoped re-read, a tested Server Action — and **exactly one surface offers it**: the natural-language console | Only the affordance was built. `undoWorkOperation` reuses `task-commands/actions.ts`'s existing call site, so the 2L.0 undo-router census is unchanged. |

**A fifth item is a genuine finding rather than a premise.** `apply_task_command`
already returns `undoId` on `applied` and `undoId: null` on `no_change`
(2E-UPDATE-009 forbids a no-change to write an undo row). That makes `2L-EDIT-009`
— "an operation the domain cannot reverse never offers undo" — **structural**: the
surface has no decision to take, and the test that proves it drives the component
with `null` rather than asserting a rule.

**No new decision was required and none was taken.** Everything above is a
narrowing: it adds no capability and no authority.

---

## 2. `2L-PRIVACY-001…008` — OD-2L-1 option B, in the product

`work` joins `GOVERNED_SURFACES` **with its consumers**, which is the condition
2L.0 recorded for letting it in at all.

### 2.1 The reads

| Surface | Query | Bound |
|---|---|---|
| Work list | one `entries(id, sensitivity)` read per **page** | `.eq("user_id", …)` **and** `.in("id", <the page's own source ids>)` |
| Task detail | the classification joins the query that was already fetching the provenance excerpt | `.eq("user_id", …)` and `.eq("id", <the task's own source>)` |

A page with no task from an entry performs **no read at all**, and a page whose
fifty tasks share three sources performs one read of three ids — asserted by test,
including that `from("entries")` is called exactly once.

**`2L-PRIVACY-006`:** owner scope is stated *in the query* rather than left to RLS
alone. RLS is and remains the boundary; stating `user_id` means the map cannot
contain a foreign row even if a policy were later loosened, and it matches how
every other query in `work-projection.ts` is written. No grant, no
`security definer` helper, no service-role client, no new policy.

### 2.2 The three answers, and the one that is not a level

| Input | Result | Rendered |
|---|---|---|
| readable source | `{ kind: "derived", level }` | that level's rule |
| source present, absent from the owner-scoped read | `{ kind: "derived", level: "highly_sensitive" }` | masked, revealable |
| no source (manual task) | `{ kind: "undetermined" }` | shown; **no level is ever asked for** |

`resolveTaskContent`'s `undetermined` arm returns the shown answer **directly**. It
does not look a level up and never produces the string `normal`. The rendered
result matches `normal`'s; the reasoning must not, and `2L-PRIVACY-004` is about
the reasoning.

**Removed, foreign and unreadable stay one branch.** They are one thing — absent
from the map — so there is no branch that could leak which. Proved byte-identical
at the derivation and again at the projection.

### 2.3 Fail-closed, in the direction that matters

`toTaskSensitivity` narrows the value crossing the projection boundary and resolves
anything unrecognised to **`highly_sensitive`, never to `undetermined`**. The two
absences are different claims: `undetermined` says *this task has no source*, which
is a fact about the task, while an unreadable value says *something here is wrong*,
which is a fact about the code. Letting the second decay into the first would
publish content in the clear because a caller forgot to derive one. The existing
`projection-mappers.test.ts` fixture — which declares no classification — now
asserts `highly_sensitive`, and that is the mechanism proving itself.

### 2.4 Convergence is structural, not remembered

`ProtectedContent` is the only component that asks `resolveTaskContent` what to
render, and both surfaces mount it. `sensitivity-convergence.test.ts` gained two
tests: the positive half (each surface mounts it; the component consumes the
contract) and a **census** proving `resolveContent("work", …)` appears in exactly
one module in the whole of `src/`.

### 2.5 What is withheld, and what deliberately is not

Withheld: the row's title and description (together — masking one and printing the
other protects nothing), and on the detail the title, the description and the
provenance excerpt, which is the entry whose classification produced the mask.

**Not withheld, and recorded rather than absorbed:**

- **The row survives.** Its state, dates, relations, badges and four actions all
  stay, so the count and the pagination keep describing the set the user owns and
  a masked task remains operable (`2L-PRIVACY-003`/`-008`).
- **The masked row stays openable.** The stub is the link. Putting the withheld
  title into an `href` would defeat the mask; leaving the row unopenable would be
  a functional loss the decision never asked for.
- **The content reaches the client.** The reveal is local and in-place, so the text
  has to be there to reveal — the same posture `card.tsx` and `review-body.tsx`
  have taken since Phase 2J/2K. This is a **presentation** contract, never an
  authorization boundary, and it is stated here so no closing report can imply the
  bytes never left the server.
- **The `title` hidden input still carries the rendered title** on the action
  forms, as the resolution *query hint* 2F-SURFACE-004 makes non-authoritative.
  It is not rendered content and the reveal is one click away; changing it would
  alter the resolution path, which this slice does not touch. Recorded as an
  inherited property of the masking contract, not a new one.
- **Nothing reaches telemetry.** No event gained a property, no classification is
  emitted, and no event was declared (`2L-PRIVACY-008`).

### 2.6 Hoje was found printing what Work had started withholding

**The diff review turned this up, and it is a defect this slice created rather
than one it inherited.** Hoje renders task titles — the priority section and the
"for today" list, both fed by the *same* `loadWorkProjection` items the Work list
reads. `tasks` carried no classification at all before Phase 2L, so Hoje printing
a title was not a divergence: there was nothing to diverge from. The moment the
Work list began withholding one, a user could see the same task masked on
`/app/work` and printed in full on `/app`.

That is exactly the "two surfaces of one product meant two answers" the central
contract's own header says it exists to prevent, so it is fixed here rather than
recorded for later. `HomeTaskView` and `HomePriorityView` carry the same
`TaskSensitivity`, and both rows mount the same `ProtectedContent`.

**The whole row is withheld, not only the title.** The reason chip says *why this
task is urgent* and the due label says *when*; both are facts about a task the
owner asked to be protected, and a masked title beside "Atrasada" is a mask that
leaks the interesting half. The row stays, so the count and the ordering keep
telling the truth, and one click restores all of it in place.

`home-view.tsx` now consumes the contract twice, for two different subjects —
`presentationFor("hoje", …)` for the attention entries Phase 2J governed, and
`ProtectedContent` for the task rows this phase classified. Both are the
contract; neither is a second rule, and the convergence guard asserts both.

### 2.7 The partial coverage is stated, not admitted later

`2L-PRIVACY-004` requires the partiality to be visible where a user could be
misled. Two places, and only two: the Work list, **when at least one row is
actually masked** — a page where nothing is withheld would be told about a
mechanism it has not met — and the task detail's provenance section for a manual
task, which is the one screen that says the task came from nothing and therefore
the one screen where "so nothing protects it" belongs.

---

## 3. `2L-EDIT-001…010`

| Requirement | How |
|---|---|
| `-001` editable from the list, derived from `actionPolicy` | `detailControlsFor(row.status)` in the projection; the row renders what it is given |
| `-002` no second write path | `QuickEdit` mounts `TaskDetailControls` → `applyTaskDetailCommand` → `list_task_command_candidates` → `apply_task_command`. The 2L.0 authority census is unchanged and still pins `apply_task_command` at one call site |
| `-003`/`-004`/`-005`/`-006` outcomes, value refusals, staleness, replay | Inherited verbatim from the component and its Server Action, tested where they live |
| `-007` responsive detail | `TaskDetailSurface`, mounted by the route and by the intercepting `@panel/(.)[taskId]`; `panel` selects a frame and a back affordance and nothing else |
| `-008` undo where the operation happened | `UndoAffordance`, on the list's outcome region and on the detail's |
| `-009` never offered for an irreversible operation | Structural: `undoId` is `null` for `no_change` |
| `-010` destructive unreachable in one step | Inherited: `cancel_task` submits `request_cancel`, and the server issues the confirmation against its own resolution |

**The responsive detail, stated precisely.** Wide: the list keeps its place and the
task docks beside it. Narrow: the task **is** the surface and the list is
`display: none` rather than covered — the difference between a surface and an
untrapped modal, since a covered list stays in the accessibility tree and stays
reachable by a screen reader while the user believes they are on the task. The slot
renders `null` for every route that is not an intercepted task, so a hard load of
the list, of the recovery route or of the detail's own URL shows exactly one
surface, and switching Work views does not leave a panel open over a list it no
longer belongs to.

---

## 4. Accessibility — entered in the slice that builds the surface

`2L-ACCESS-001` is explicit that the lane is entered here and not at closeout.
Two fixtures added to `e2e/accessibility.spec.ts` — the Work list (an ordinary row
and a masked one, with the status controls, the quick-edit disclosure, the reveal
and the undo) and the task panel — and both viewports run green.

| Check | Desktop | Mobile |
|---|---|---|
| axe, no serious or critical | ✅ | ✅ |
| visible focus, measured from paint | ✅ (both fixtures in the walk) | ✅ |
| rendered touch targets ≥ minimum | skipped by design (desktop) | ✅ |

`accessibility-mirror-guard.test.ts` gained two tests pinning every load-bearing
class in the new fixtures back to the component that emits it, so a rename breaks
the guard rather than silently invalidating a green lane. It also **fixed a latent
defect in itself**: the suggestions fixture check sliced from its own builder to
`const SURFACES = [`, which passed only because that builder happened to be last.
Appending two builders made it read their markup. It is now bounded to its own
function.

---

## 5. Executed, and not executed

**Executed locally:** focused suites green; `npm run lint` zero-error;
`npm run typecheck` zero-error; `npm test` — **5046 passing, 0 failing tests**
(3 test *files* fail to load on the documented Windows shebang-parse baseline,
green in CI); `npm run build` green; `git diff --check` clean;
`npx playwright test e2e/accessibility.spec.ts` green at `--project=desktop` and
`--project=mobile`.

**NOT executed, and not inferred:** any hosted probe; any real-device session; any
screen-reader session; any authenticated online journey; hydrated interactivity in
a browser — which means the panel's *interception behaviour* (soft navigation
renders the panel, a hard load renders the full surface) is proved **structurally,
by the route files and their tests, and not by a browser**. That limitation is
named here rather than left for the closing report, and `2L-ACCESS-008` remains
open exactly as it was.

---

## 6. Budget and posture

| Item | Before | After |
|---|---|---|
| Migrations | 89 | 89 |
| Hosted parity | `202608090089` | `202608090089` |
| `apply_task_command` call sites | 1 | 1 |
| `undo_operation` caller modules | 4 | 4 |
| Locale-ternary count | ≤ 266 | ≤ 266 (all new copy is typed) |
| Product events declared | — | none |
| RLS policies, grants, roles, secrets | — | none touched |
| Signup / rollout state | — | untouched |

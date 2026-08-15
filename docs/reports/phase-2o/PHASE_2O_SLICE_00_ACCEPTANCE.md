# Phase 2O — Slice 2O.0 acceptance record

**Foundations: the activation contract, and a registry that means something.**

- **Authorization:** implementation through closeout, **ADR-118** (2026-08-15),
  over the plan ADR-115 authorized, the twelve decisions ADR-116 signed and the
  interpretation ADR-117 confirmed.
- **Requirements:** `2O-ACTIVATION-001` … `-007` (7 of 116).
- **Migrations:** **none created, none spent.** 94 local = 94 hosted, parity
  `202608140094`, unchanged by this slice.
- **Baseline:** `main` `57beb06`, worktree clean, no open PR, CI green on both
  merge SHAs (`e4f2668`, `57beb06`), rollout gate **25 pass · 3 fail · 2
  owner-signature**, signup closed.

---

## 1. What shipped

| | |
|---|---|
| `src/features/activation/contracts.ts` | the five activation facts as ordered, derived, three-valued data |
| `src/features/activation/activation-view.ts` | the server-side derivation, one independent wrapped read per fact |
| `src/features/shell/capabilities.ts` | the `uncontrolled` state, the `columns` anchor, four missing rows, `scheduled_reviews` disambiguated, `consumerlessPreferenceColumns` derived |
| `src/features/shell/capability-copy.ts` | typed copy in both locales, keyed by a type derived from the registry |
| `src/features/shell/capability-summary.tsx` | the registry's first product consumer |
| `src/app/[locale]/app/settings/page.tsx` | mounts it, between the controls and Dados e IA |
| `src/app/settings-extended.css` | its styling, tokens only |
| `src/lib/closeout/capability-registry-guard.test.ts` | the two-directional guard |

**Zero migrations. No RLS change, no new authority, no new Server Action, no
new RPC, no CSP change, no schema change.** The slice reads existing tables and
renders existing data.

---

## 2. The re-audit, and the three divergences it found

Precondition 3 of the plan's §8. Run against `57beb06` before any file changed.

**The tree had not moved where it matters.** The delta from the plan's baseline
`9cc1175` is `docs/` plus two governance guards — **zero product-code files** —
so every finding in `PHASE_2O_CURRENT_EXPERIENCE_AUDIT.md` still describes the
tree it was written against, and none had to be re-executed.

Per requirement, against the tree rather than against the plan:

| Requirement | Already true? | Evidence |
|---|---|---|
| `-001` typed activation module | **no** | no `activation` module existed under `src/features/` |
| `-002` derived, no stored state | constraint | `OD-2O-3` **A** makes the prohibition absolute |
| `-003` three-valued | **no** | — |
| `-004` registry has a consumer | **no** | `getCapabilityRegistryView` was imported by exactly one file: its own test |
| `-005` tree-derived `consumerEvidence` guard | **no** | no such guard existed |
| `-006` `scheduled_reviews` ambiguous | **yes, ambiguous** | `state:"future"`, `consumerEvidence:[]`, while `review-schedule.ts` reads all three columns |
| `-007` nine columns recorded | **partially** | 5 of 9 had a row; `privacy_preferences`, `quiet_periods`, `avatar_path` and `ai_provider` had none |

### D1 — the registry's keys are not the schema's column names

`autonomy` ≠ `autonomy_level`; `reasoning_route` ≠ `reasoning_model`; `avatar`
≠ `avatar_path`. A guard asserting *"the nine consumer-less columns are
recorded"* had nothing to resolve one to the other and **would have passed
vacuously**.

**Resolved in this slice** by adding `columns: readonly string[]` to every row,
in the schema's own spelling, and checking each name against
`database.types.ts`. The nine are then **derived** from the registry rather than
listed a second time, so there is no second list to keep true.

### D2 — two of the nine are written with a literal, not passed through

`2O-ACTIVATION-007` says the settings payload *"keeps carrying them, so no save
wipes a value"*. That is **imprecise for `ai_provider`**:
`buildSettingsPayload` sends the literal `"openai"` on every save, and
`embedding_model` is sent as the literal `"text-embedding-3-small"`. Neither is
a pass-through.

**Not repaired here, deliberately.** `embedding_model` is protected by ADR-117
Decision 4 — it *"may not be removed, altered, renamed, re-defaulted or
migrated"* — and `ai_provider` belongs to `2O-AICONFIG`, in slice 2O.4.
Repairing either here would be this slice widening itself on a finding rather
than on a requirement. **Recorded, named, and carried with a destination.** The
registry row for `ai_provider` states the fact: inertness *with* a write path is
still no consumer.

### D3 — three of the nine are absent from the payload entirely

`privacy_preferences`, `quiet_periods` and `avatar_path` are not selected and
not written, so a save cannot wipe them. The requirement's intent holds; the
mechanism is different from the one it describes. **No change made.**

### A fourth thing, recorded because a future reader will grep for it

`activation-view.ts` reads `profiles.locale`, and `locale_preference`'s registry
row still says `future`. That is **not** a contradiction: `consumerEvidence`
records *behavioural* consumers — code whose output changes because of the
stored value — and an activation read observes whether a value is **set**.
Counting a read like that as a consumer would let any column acquire one by
being looked at. Stated in the guard's own header so the distinction is not
rediscovered.

---

## 3. Requirement by requirement

**`2O-ACTIVATION-001` — built.** `activationFacts` declares five facts with an
explicit `order` and a `derivedFrom` list. Order is data, not the accident of an
array literal. `contracts.test.ts` asserts five, `[1,2,3,4,5]`, no duplicate key,
and a non-empty source list per fact.

**`2O-ACTIVATION-002` — built.** No fact holds state. The refusal is shaped as a
check over the **declared sources** rather than a search of the tree, because a
stored flag would arrive there first: every `derivedFrom` name is asserted not
to match `/onboard|activation|progress|step|cursor|tour|wizard|checklist/i`,
with a control proving the pattern matches the shape it forbids. The five
sources are `profiles`, `user_ai_credentials`, `entries`,
`entry_task_candidate_resolutions` and `tasks` — every one of which exists for
its own reasons.

**`2O-ACTIVATION-003` — built.** `ActivationFactState` is
`satisfied | unsatisfied | unreadable`, and completeness is three-valued for the
same reason: `yes` when all are satisfied, `no` when at least one was read and
found false, `unknown` when nothing is known to be missing and something could
not be read. Asserted in both directions, including that a failed read is
**never** reported as unsatisfied. `loadActivationProgress` wraps each read
independently, so one unreadable table leaves the other four answerable — proved
by a stubbed error, a stubbed rejection, and an assertion that the other four
still answer.

This is also why the module does **not** call `loadCredentialMetadata`: that
function returns `ABSENT_CREDENTIAL` on error, correctly for a settings panel,
and here "absent" and "unreadable" must be told apart.

**`2O-ACTIVATION-004` — built.** `CapabilitySummary` renders
`getCapabilityRegistryView("settings")` filtered to `visible`, and
`/app/settings` mounts it. A stale row now changes what a user sees: flip a row
to `visible: false` and its paragraph leaves Ajustes; flip one to `visible: true`
and **the build fails** until copy exists, because `VisibleSettingsCapabilityKey`
is derived from the registry as a type and `CapabilitySummaryCopy` is keyed by
it. That is the failure mode `transparency/contracts.ts` argued for, applied
here.

**`2O-ACTIVATION-005` — built, with a planted divergence per direction.** See §4.

**`2O-ACTIVATION-006` — built.** The row moves from `future` to a new
`uncontrolled` state, gains `consumerEvidence` naming `day-review/review-schedule`
and `day-review-projection`, and gains the three columns it governs. `future` now
means *no behavioural consumer* and `uncontrolled` means *real consumers, no
authorized control*; the two are asserted mutually exclusive, so the row can no
longer be read both ways.

`visible: false` **stays**, because `OD-2O-6` **A** signs controls for exactly
these three and `2O-PREF-004` builds them in slice 2O.3 — the requirement itself
says the row's final wording is fixed by that outcome. A guard asserts
`review-schedule.ts` still contains no `cron`, `pg_cron` or `scheduleJob`, so
`/app/reviews`'s *"nada é executado por horário configurado"* stays true and
this slice cannot make it false by accident.

The vocabulary `uncontrolled` is also what ADR-117 requires of `embedding_model`
— *real consumers, no authorized control*. **That row is not created here**: it
is `2O-AICONFIG-004`'s, in slice 2O.4. Only the vocabulary it will need is.

**`2O-ACTIVATION-007` — built.** All nine now have a row; the four that had none
were added. None has a control, all nine are `visible: false`, and the component
test asserts neither the key nor any column name reaches the rendered
interface — in **both** locales, paired with a planted marker proving the page
rendered, so the absence cannot pass on a blank page (`R-2O-16`). The columns are
**kept**, per `OD-2O-7` **A**, and asserted still present in
`database.types.ts`. `planning_day` and `planning_time` are asserted **out** of
the nine and out of the form: `2M-AUDIT-005` retired them by decision, not for
want of a consumer, and cataloguing them here would have quietly pulled a
retired decision back into scope.

---

## 4. The guard, and the six mutations that prove it can fail

`2O-ACTIVATION-005` requires a planted-divergence control **in both directions**.
Two are built into the test and run every time; four more were executed against
the real tree — mutate, run, restore — because a control that only ever runs
against a fixture proves the fixture.

| Mutation applied to the real tree | Result |
|---|---|
| a row claims `thisConsumerDoesNotExist2O` | **guard fired** |
| the form renders `favouriteColour`, which no row governs | **guard fired** |
| the form renders `autonomyLevel`, one of the nine | **guard fired** |
| the settings page stops mounting `CapabilitySummary` | **guard fired** |
| the only product reader stops calling `getCapabilityRegistryView` | **guard fired** |
| `scheduled_reviews` reverts to `future` | **guard fired** |
| a row becomes `visible: true` with no copy written | **`tsc` refused, in both locales** |

Every file was restored from a backup and the guard verified green again (22/22),
with `typecheck` clean.

The seventh is the one that is not a test at all. `VisibleSettingsCapabilityKey`
is `Extract`ed from the registry, and `CapabilitySummaryCopy.entries` is keyed by
it, so flipping `locale_preference` to `visible: true` produced **TS2741 twice**
— once for `pt-BR` and once for `en`. That is the mechanism `2O-ACTIVATION-004`
asks for, working at compile time rather than at render time, and it is why
`getCapabilityRegistryView` is generic: annotated with the widened
`CapabilityRegistryView` it returned `key: string`, the consumer needed a cast,
and **the cast silently removed the guarantee**. `tsc` caught that during this
slice, which is the argument for not writing the cast.

**Direction A** resolves each `consumerEvidence` token against a corpus of
`src/`, `supabase/functions/` and `supabase/migrations/`, **excluding test
files** — a token that appears only in a test is a fixture, not a consumer, and
counting it would let a row prove itself by being asserted about. The corpus is
asserted non-empty (>500 files, >1MB) because a scan that silently starts
matching nothing is indistinguishable from one that is correct, and this
repository has had exactly that: a census that returned zero consumers because
it ran from the wrong working directory.

**Direction B** extracts the controls the preferences form renders, converts each
to its column, and requires a row to govern it. Hidden inputs are removed first
— `<input type="hidden" name="locale">` carries the route back to the Server
Action and is not a control anyone is offered. That is a distinction, not an
exemption, and a case asserts the removal does not swallow a real control
standing beside a hidden one.

---

## 5. Gates

| Gate | Result |
|---|---|
| `npm run lint` | **zero errors** |
| `npm run typecheck` | **zero errors** |
| `npm test` | **7654 passed, 0 failed**; 3 test *files* fail to parse on Windows only — the long-standing `#!/usr/bin/env node` shebang issue in `scripts/*.mjs`, identical before and after this slice (baseline 7590 → 7654, **+64**) and green in CI |
| `npm run build` | **passes**; `/[locale]/app/settings` compiles as a dynamic route |
| `git diff --cached --check` | **clean** |
| Mutation controls | **6 applied to the real tree, 6 fired**, every file restored, guard verified green again |
| Migrations created | **0** |
| Hosted parity | `202608140094`, read live, unchanged |
| Rollout gate | **25 · 3 · 2**, unchanged; no code in this slice reads or writes it |
| Signup | closed, untouched |

### What was NOT executed, stated rather than implied

**An authenticated browser render of `/app/settings` against `next start`.** The
plan's proof-obligation table scopes that to slices **2O.1 – 2O.7**, and this
slice is outside it — but the slice does change a rendering surface, and this
repository has shipped two surfaces green that never rendered, so the reasoning
is recorded rather than left implicit:

- `CapabilitySummary` is a **Server Component with no client boundary** — no
  `"use client"`, no hook, no browser API — rendering inside a Server Component
  page. Its only prop is a `string`.
- Its import graph is `capabilities.ts` and `capability-copy.ts`, neither of
  which imports `server-only` or anything that would invert the boundary.
- `npm run build` compiled the route, and eight component tests render it in
  both locales.

That is compile-time and unit evidence. **It is not a production render**, and
this record does not claim one. The first authenticated browser proof is due in
slice 2O.1, where the plan requires it, and it will cover this surface.

---

## 6. What this slice did not do

No migration. No deploy. No secret. No `config.toml`. No CSP change. No RLS or
grant change. No new `SECURITY DEFINER` function. No new authority for
`authenticated`. No control for any preference without a consumer. No model call
to render anything. No change to `embedding_model`, its column, its default or
its routing. No absorption of a declined residual. No successor phase started,
scoped or named, and **A13 was not retargeted**.

**Carried forward, with destinations:**

- **D2** — `ai_provider`'s hardcoded write, to `2O-AICONFIG` in slice 2O.4.
- **`embedding_model`'s registry row** — to `2O-AICONFIG-004` in slice 2O.4; the
  `uncontrolled` vocabulary it needs exists now.
- **`scheduled_reviews`'s final wording and `visible` value** — to `2O-PREF-004`
  in slice 2O.3, exactly as `2O-ACTIVATION-006` specifies.
- **The appearance control** (`2O-PREF-013` … `-015`) — slice 2O.3. Nothing in
  this slice writes `data-theme`, and the audit's record of that gap stays
  asserted.

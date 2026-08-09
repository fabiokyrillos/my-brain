# Phase 2K — Slice 2K.1 acceptance

**Card state vocabulary, read-only previews, and a sensitivity policy for Conversar.**

**Written after execution, from executed evidence.** Every gate below was run in this session and its result is reported as executed, skipped or not proved — never inferred.

**Authorization.** **ADR-101** (2026-08-09), the owner's implementation authorization for slices 2K.1–2K.8. ADR-097 authorized planning only and required a separate accepted ADR before implementation; that is gate **G5**, and ADR-101 discharges it. ADR-101 also signs **OD-2K-1** and **OD-2K-4**, so no later slice starts on an unsigned decision.

**Baseline.** `main` = `9d93263e3d2ef391ebb6b0595b7ab9e1daa73ff3` (PR #146, slice 2K.0), CI green on that exact merge SHA across all three jobs. Local = linked = remote migration head **`202608080087`**, 87 migrations, re-proved live by `npx supabase migration list --linked` in this session (`2K-AUDIT-003`).

**Migration budget.** **`1 allocated · 0 spent`.** This slice creates none and needs none.

---

## 1. Requirements this slice claims

| Id | Claim | Where the evidence is |
|---|---|---|
| `2K-CARD-001` | **built** | `src/features/conversation-cards/contracts.ts` declares ten states as a closed list; `contracts.test.ts` names each one individually and asserts no duplicates; `copy.test.ts` asserts every state has **distinct** copy in both locales |
| `2K-CARD-002` | **built** | The state arrives on the card and is rendered as itself. `card.test.tsx` renders every member of the vocabulary and asserts `data-state`; `phase-2k-card-guard.test.ts` fails the build if any module in the feature reads `.disposition`, `.willMutate` or a `preview.*` field |
| `2K-CARD-003` | **built** (contract) / **baseline** (tasks) | `cardMutability` declares mutability per type. For task cards the immutability is still the literal type `willMutate: false` at `preview.ts:135`, untouched by this slice |
| `2K-CARD-004` | **baseline** | No card in this slice mutates anything. The one route that writes on recognition, `capture_intent`, is pre-existing and documented as such at `assistant/actions.ts` |
| `2K-CARD-005` | **built** (guard) | The composer still renders the console's own `TaskCommandResult`; the card feature builds no preview, fingerprint or confirmation. Both asserted structurally |
| `2K-CARD-006` | **not claimed here** | Memory preview and staleness witness belong to **2K.2**. The contract this slice ships is what 2K.2 consumes; no memory card is rendered yet |
| `2K-CARD-007` | **built** | `read-only-preview.tsx` + `read-only-preview.test.tsx` render all five read-only types with a type label, an optional bounded snippet, a link and their source |
| `2K-CARD-008` | **built** | `mayRenderMutatingControl` is the single decision site; `ConversationCardView` **drops** controls passed for a read-only type, proved by rendering; the guard proves the read-only module contains no posting control, and fires on a planted one |
| `2K-CARD-009` | **built** | Reversal is a discriminated union on the card, resolved by an exhaustive `switch`. `card.test.tsx` asserts an archival card never shows the task window and vice versa |
| `2K-PRIVACY-001` | **built** | `chat` joins `GOVERNED_SURFACES`; `sensitivity-boundary.test.ts` green; `sensitivity-convergence.test.ts` gains the positive assertion that the card reads `resolveContent("chat", …)` |
| `2K-PRIVACY-002` | **built** | Masked in place with a local, transient reveal; `copy.test.ts` asserts no count-shaped copy exists in either locale |
| `2K-PRIVACY-003/004` | **not claimed here** | They land in **2K.4**, where `chat/actions.ts` stops persisting an excerpt and the render-time re-read arrives. The plan's 2K.4 section says exactly this; the PRD lists the family as cross-cutting across 2K.1/2K.4/2K.5. Both readings are satisfied by delivering the mechanism here and the persistence change there |
| `2K-PRIVACY-005` | **baseline, re-proved** | `toSensitivityLevel` still fails closed. This slice **exercises** it: `readOnlyPreviewCard` takes an optional classification and an omitted one resolves to the most protective level, asserted directly |
| `2K-PRIVACY-006` | **baseline** | ADR-093 untouched. The guard asserts `search` is still **absent** from `GOVERNED_SURFACES` |
| `2K-A11Y-001` | **partial, in progress by design** | The Conversar card states joined the accessibility lane **in this slice**, not at closeout. Later slices extend it further |

---

## 2. What was built

**One closed card grammar.** `CONVERSATION_CARD_STATES` declares ten states; `CONVERSATION_CARD_TYPES` declares seven object types, partitioned exactly once into the two OD-2K-B allows to mutate and the five it does not. `cardMutability` and `mayRenderMutatingControl` are the single decision sites, so the rule lives in one place rather than at every call site.

**`expired` is a card state, not a task-command outcome.** Slice 2K.0's measurement M1 established that `TASK_COMMAND_OUTCOMES` has no `expired` member and that ADR-047 refuses to add one. The contract's own comment says so, so a future reader cannot mistake this vocabulary for permission to widen that one.

**Reversibility is a value, not a boolean.** `ConversationCardReversal` is a three-arm union — `none`, `undo_window`, `archival` — resolved by an exhaustive `switch` rather than a ternary. That is `2K-CARD-009` made mechanical: a fourth kind added later fails the build here instead of silently rendering a sibling's sentence, which is precisely the "memory card inherits the task card's 24-hour window" failure OD-2K-3 forbids.

**`unavailable` is one shape with no cause parameter.** `unavailableCard(cardType)` takes exactly one argument — asserted by `unavailableCard.length === 1` — carries no object id, no snippet and no href, and produces byte-identical output for deleted, foreign and suspended causes. This is `2K-CONT-008` groundwork built now because the builder is where a cause parameter would otherwise be added later.

**Conversar is governed for sensitivity, for the first time.** `chat` joins `GOVERNED_SURFACES` with the same posture as every other in-app content surface: `normal` and `private` shown, the most protective level **masked in place** with a local reveal. `search` remains absent, so ADR-093 is not re-opened.

**A real consumer, not a contract with nobody using it.** The `capture_intent` route's bare "open the entry" link became a read-only preview card for the entry it created. Same destination; what changed is that it now arrives inside the one grammar and provably cannot grow a mutating control. The now-unused `captureNextStep` copy was removed rather than left declared — the defect `assistant/copy.ts` already records having made once.

---

## 3. Gates, as executed

| Gate | Command | Result |
|---|---|---|
| Tests first | new test files written and run **before** implementation | **Executed.** 5 files failed, 4 assertions failed for the right reasons (`GOVERNED_SURFACES` missing `"chat"`, modules absent) |
| Focused | `npx vitest run src/features/conversation-cards src/lib/closeout/phase-2k-card-guard.test.ts src/features/sensitivity` | **Executed, green** — 9 files, 94 tests including the neighbouring guards |
| Lint | `npm run lint` | **Executed, zero errors** |
| Types | `npm run typecheck` | **Executed, zero errors** |
| Full unit | `npm test` | **Executed** — 280 files passed, **4686 tests passed, 0 test failures**. 3 files failed to load: `hosted-auth-parity`, `signup-hardening-admin-boundary`, `storage-orphan-scanner`. These are the **known Windows-local baseline** (shebang parse), green in CI, and unrelated to this diff |
| Build | `npm run build` | **Executed, green** |
| Browser, both viewports | `npx playwright test e2e/accessibility.spec.ts --project=desktop --project=mobile` | **Executed** — 21 passed, 1 skipped (the desktop touch-target skip is the spec's own mobile-only contract). The new `Conversar cards` surface passes axe at both viewports |
| Whitespace | `git diff --check` | **Executed, clean** |
| Diff review | line by line over 22 files | **Executed** |
| Migrations | none created | **`1 allocated · 0 spent`** |
| pgTAP | not applicable — no database change | **Declared, not skipped silently** |
| Real device / assistive technology | not run | **NOT PROVED.** Never inferred from the axe pass |

---

## 4. Negative controls and non-vacuity

A guard that cannot fail is not a guard, so each detector was executed against a planted violation rather than read:

- The mutating-control detector fires on `<form action={…}>`, on `formAction=… type="submit"`, and on `useActionState(…)`, and does **not** fire on a plain `<Link>`.
- The re-derived-state detector fires on `preview.disposition` and on `preview.willMutate`, and does **not** fire on `switch (card.state)`.
- The card guard asserts the feature it polices **exists** and contains the four named modules. Without that, every absence assertion in the file would pass over an empty directory.
- `ConversationCardView` dropping a control for a read-only type is proved **against its own positive control**: the identical control **is** rendered for a mutable type in the very next test, so the refusal is not a component that renders nothing.
- The read-only preview's "no button" assertion is paired with the masked case, where exactly one button exists and is `type="button"` — so "no controls" is never satisfied by a component that failed to render.
- The accessibility mirror guard now re-derives the card's class names, `data-state`, `aria-expanded`, its pt-BR copy **and every declared state** from the sources, so a state added to the vocabulary without a fixture breaks the guard instead of leaving the lane silently under-scanned.

---

## 5. Security and authority

- **No new RLS policy, grant, secret, external service or write path.** The card feature reads nothing from the database; it is a contract, copy and two components.
- **No service-role client** anywhere in the feature, asserted structurally.
- **Presentation is not authorization.** `mayRenderMutatingControl` decides what is *drawn*; ownership remains RLS, exactly as `sensitivity/contracts.ts:8-12` states for the surface contract it extends.
- **Retrieved content stays data.** The snippet is rendered as text inside a `<p>`; nothing in the feature can emit a command. The guard additionally asserts the feature carries no continuity or suggestion vocabulary, so this slice cannot quietly anticipate 2K.3 or 2K.6 and claim their requirements at close.
- **No existence oracle.** `unavailableCard` cannot express a cause.

---

## 6. UX and mobile, as executed

Both locales are covered by typed copy (`copy.ts`), with `locale-ternary-guard.test.ts` green — this slice adds no inline ternary and the ceiling is unchanged.

At Pixel 7 width the reveal and open controls stretch to the card's width and carry a **44px** rendered minimum, above WCAG 2.2 AA 2.5.8's 24px. That was measured in a real browser by `2J-ACCESS-006`, not asserted from CSS. Focus indicators are painted and measured by `2J-ACCESS-005`, which now walks the card controls too. Long unbroken snippet text wraps rather than pushing the card off-screen (`overflow-wrap: anywhere`).

The ten card states are given distinct tones from `experience.css`'s six, because T-2K-07's failure is a shared visual grammar flattening `expired` into `done`.

---

## 7. Limitations, stated rather than rounded up

1. **No screen-reader session.** Never executed for this surface, and an axe pass is not one.
2. **The lane renders a mirror, not the component.** `e2e/accessibility.spec.ts` composes fixtures from the real stylesheets and the exact DOM; `accessibility-mirror-guard.test.ts` bounds the drift, and this slice extended that guard rather than only the fixture.
3. **Hydrated interactivity is not proved in a browser.** The reveal toggle is proved in jsdom (`card.test.tsx`) and its markup is proved in a browser. The two together are not a hydrated-browser proof, and are not reported as one.
4. **`2K-PRIVACY-003/004` are not delivered here.** The mechanism is; the persistence change is 2K.4's.
5. **Only one card producer exists so far.** `capture_intent`. The thread's citation block becomes a producer in 2K.4, once the render-time source re-read exists — rendering the *legacy stored excerpt* through the mask now would have reproduced a historical excerpt from a copy, which OD-2K-2 forbids.
6. **Three test files fail to load on Windows.** Pre-existing environmental baseline, zero failing tests, green in CI.

---

## 8. What this slice did not do

No migration. No deployment. No RLS, grant or policy change. No change to `match_internal_knowledge`, to retrieval, to the task-command pipeline, to `chat/actions.ts`, or to any persisted shape. No memory undo, no continuity payload, no suggestions, no explanation panel — 2K.2, 2K.3, 2K.5 and 2K.6 own those, and the guard asserts this feature has not started them. Signup remains closed; the rollout gate is untouched at 25 pass · 3 fail · 2 owner-signature; Phase 2K is not progress toward it.

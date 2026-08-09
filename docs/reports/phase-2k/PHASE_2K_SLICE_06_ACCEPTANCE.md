# Phase 2K — Slice 2K.6 acceptance

**Contextual suggestions — deterministic, capped at three, and zero when none is honest.**

**Written after execution, from executed evidence.** Every gate is reported as executed, skipped or **NOT PROVED** — never inferred.

**Authorization.** ADR-101, which signs **OD-2K-4**.

**Baseline.** `main` = `73e298afec11ec4508d352f2c23b6ffd28b99b2f` (PR #151, slice 2K.5), **CI green on that exact merge SHA across all three jobs**. Hosted parity unchanged at `202608080087`.

**Migration budget.** **`1 allocated · 0 spent`.**

---

## 1. Requirements this slice claims

| Id | Claim | Evidence |
|---|---|---|
| `2K-SUGG-001` | **built** | `MAX_SUGGESTIONS = 3`, applied inside the derivation. Proved against a state that could produce five, against a single source that alone exceeds the cap, and against the empty case which returns **zero** |
| `2K-SUGG-002` | **built** | A pure function. No provider, no `recordAIUsage`, no rate-limit slot, no `async`, no client, no fetch — asserted structurally, with each detector proved against a planted violation. The same input produces the identical output on five consecutive runs |
| `2K-SUGG-003` | **built** | The hard-coded example and its inline locale ternary are gone. The page no longer contains "Marina" or "Experimente:", and `locale-ternary-guard.test.ts` is green |
| `2K-SUGG-004` | **built** | Copy lives in the feature's typed `copy.ts`, both locales, per ADR-036 |
| `2K-SUGG-005` | **partial** | The category is a closed enum and `suggestionTelemetryCategory` narrows a suggestion to it through a return type that **has no field a name could occupy**. The event itself belongs to slice **2K.8**, which owns the telemetry vocabulary and its migration. **Remainder:** wiring the event. **Destination:** 2K.8 |

---

## 2. What was removed

```
pt ? "Experimente: «O que combinei com Marina?»" : "Try: «What did I agree with Marina?»"
```

A fixed example, in an inline locale ternary, naming a person the user may not have. A new user learned exactly one question shape; a returning user with a full Brain saw the same string forever. Fixing it also discharges a small standing ADR-036 debt.

---

## 3. Why determinism is a security property here, not a style preference

T-2K-10: *"contextual suggestions derived from current state"* invites a **model call per page load** — spending the user's own BYOK credential on something they did not ask for, on every render of the primary surface. Caching would reduce the cost without making an unrequested billed call legitimate.

So the property asserted is not "the suggestions are cheap" but that the module is **incapable of costing anything**: no provider construction, no usage record, no rate-limit admission, and no `async` at all. An `async` export would be the first sign it had started reaching for something. This is the same reasoning ADR-094 applied when it refused to rank priorities with a model call.

---

## 4. Why the value is a `{category, name}` pair and never a sentence

OD-2K-4 permits a suggestion to **name** a person or project the user can currently read — *a suggestion that cannot say "Marina" is not contextual* — and forbids that name from ever entering telemetry, which may carry a **closed category** only.

Keeping the two apart **in the type** is what makes that enforceable. A rendered sentence could be logged whole; a pair cannot. `suggestionTelemetryCategory` returns `{category}` and its return type has no field a name could occupy, so the narrowing happens once, in a signature, rather than at each call site by convention. The sentence is built in `copy.ts`, and the derivation module produces no string at all — asserted.

---

## 5. Sensitivity, stated rather than assumed

`people` and `projects` carry **no `sensitivity` column**. The threat model records this as the reason mutating cards for them were excluded — "the masking analysis would not transfer" — and the generated types confirm it.

So there is no classification to consult and nothing to mask: these are the user's own names, on their own screen, behind RLS. That is stated here because **"no mask" and "mask not applied" look identical from the outside**, and a closing report that left it implicit would be inviting the wrong reading.

---

## 6. Three smaller decisions

**The cap is interleaved, not "all the people first."** Three slots, two sources. Taking every person first would let a user with three people never see a project suggestion, which makes the feature look like it only knows one kind of thing. Alternating spends the cap on variety and falls back cleanly when one source is empty.

**They are text, not controls.** A suggestion tells the user what they *could* type. A control that submitted the question on their behalf would put words in their mouth and turn a hint into an action — and the composer is one field away. The component has no button, no form and no handler, and the accessibility fixture asserts the *absence* too, so the mirror cannot silently stop representing it.

**A blank name is dropped rather than rendered.** "Ask me about &nbsp;" is worse than no suggestion — OD-2K-4's "omit in doubt" applied to the smallest case.

---

## 7. A guard of mine retired, for the second time

Slice 2K.1 asserted that the card feature "carries no continuity payload and no suggestion derivation **yet**". Both *yets* have now arrived — continuity in 2K.3, suggestions in 2K.6 — and **a guard whose premise expires is a guard that fails on correct work**.

It is replaced by a statement about what each thing *is*, not whether it exists: the continuity payload's strict schema refuses each forbidden field by name, and the suggestions module is proved incapable of costing anything. The retired assertion now asserts that **both replacement guards exist**, so the retirement cannot quietly become "nobody checks either any more".

---

## 8. Gates, as executed

| Gate | Command | Result |
|---|---|---|
| Tests first | derivation and guard tests before implementation | **Executed**, red for the right reasons |
| Focused | `npx vitest run src/features/conversation-cards src/lib/closeout/phase-2k-suggestion-guard.test.ts src/lib/closeout/locale-ternary-guard.test.ts` | **Executed, green** |
| Lint | `npm run lint` | **Executed, zero errors** |
| Types | `npm run typecheck` | **Executed, zero errors** |
| Full unit | `npm test` | **Executed** — 296 files passed, **4878 tests passed, 0 failing tests**. 3 files fail to *load* on Windows — the known local baseline, green in CI |
| Locale ternary ceiling | `locale-ternary-guard.test.ts` | **Green.** This slice **removes** one and adds none |
| Build | `npm run build` | **Executed, green** |
| Browser, both viewports | `npx playwright test e2e/accessibility.spec.ts --project=desktop --project=mobile` | **Executed** — 31 passed, 1 skipped |
| Whitespace | `git diff --check` | **Executed, clean** |
| Migrations | none created | **`1 allocated · 0 spent`** |
| pgTAP | not applicable — no database change | **Declared, not skipped silently** |
| Real device / assistive technology | not run | **NOT PROVED** |

---

## 9. Negative controls and non-vacuity

- **The cost detector is proved against three planted violations** — a provider construction, a usage record and a rate-limit admission — and proved *not* to fire on the real derivation call.
- **Determinism is executed, not asserted**: five consecutive runs over the same input, compared.
- **The cap is proved to live in the module, not the renderer** — the row is asserted to contain no `slice(0, 3)` of its own, because a cap applied where a list is drawn holds until somebody draws it somewhere else.
- **Purity is proved by mutation**: the input object is serialized before and after, and compared.
- **The telemetry narrowing is proved by absence** — the serialized payload contains neither the name nor the id.
- **The "no control" property is asserted on both the component and its accessibility fixture**, so the mirror cannot drift into representing something the product does not render.

---

## 10. Limitations, stated rather than rounded up

1. **`2K-SUGG-005` is partial.** The bounded category and its narrowing exist; the event does not. Wiring it belongs to 2K.8, which owns the telemetry vocabulary and the single budgeted migration. Recorded as a remainder with a destination rather than claimed.
2. **Suggestions derive from people and projects only.** The chat index holds no other already-authorized state, and OD-2K-4's other permitted sources — the Hoje / Trabalho / Precisa-de-você projections — would each be a new query on a surface that is not those views. Named as a bounded choice rather than an oversight.
3. **No screen-reader session.**
4. **The empty-empty case shows nothing.** A user with no people and no projects sees the empty state's own sentence and no suggestions. That is OD-2K-4's instruction, and it is the honest outcome — but it does mean the surface teaches a brand-new user less than the hard-coded example pretended to.

---

## 11. What this slice did not do

No migration, no deployment, no schema change. **No provider call, no BYOK spend, no rate-limit slot.** No suggestion originates from retrieved content, and none carries a mutation payload — the derivation reads two lists of names the caller already fetched under RLS and returns values. No RLS policy, grant, secret, external service or write path. Signup remains closed; the rollout gate is untouched at 25 pass · 3 fail · 2 owner-signature.

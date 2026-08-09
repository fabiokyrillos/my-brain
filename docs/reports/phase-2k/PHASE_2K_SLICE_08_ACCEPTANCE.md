# Phase 2K — Slice 2K.8 acceptance

**Accessibility, mobile, content-free telemetry, security and closeout.**

**Written after execution, from executed evidence.** Every gate is reported as executed, skipped or **NOT PROVED** — never inferred.

**Authorization.** ADR-101, which authorizes creating, merging and **deploying** the single migration OD-2K-C budgeted.

**Baseline.** `main` = `9c36e1be352421e05cb9b384424b457c58100efb` (PR #152, slice 2K.6), **CI green on that exact merge SHA across all three jobs**.

**Migration budget.** **`1 allocated · 1 spent`** — `202608090088_phase_2k_conversation_telemetry.sql`. The ceiling was never an obligation and `1 · 0` would have been a legitimate close; it is spent because telemetry cannot be delivered honestly without a database that names the events.

---

## 1. A correction this slice found, and is reporting rather than absorbing

**The Phase 2K PRD declares 79 requirements, not 68.**

ADR-097, ADR-098, `docs/STATE.md`, `docs/reports/README.md` and the PRD's own §4 preamble all say "68 requirements across eleven families". The traceability generator extracts them from the PRD and counts **79**, across the same eleven families:

`2K-ACT` 9 · `2K-CARD` 9 · `2K-CONT` 8 · `2K-METRICS` 8 · `2K-SRC` 8 · `2K-A11Y` 7 · `2K-EXPL` 7 · `2K-AUDIT` 6 · `2K-CLOSE` 6 · `2K-PRIVACY` 6 · `2K-SUGG` 5.

No requirement is duplicated and none is outside the `2K-` namespace, so this is a **counting error in the authorizing documents**, not a scope change. It was repeated in five places, which is exactly the failure mode the traceability contract was written against: *"if a single table produced the PRD, the plan and the matrix, one wrong premise would propagate into all three and appear confirmed three times."*

**It is corrected by appending, never by rewriting.** ADR-097 and ADR-098 are accepted and append-only; the correction is recorded here, in the closing report, in `CHANGELOG.md` and in `STATE.md`. **All 79 are classified.** Classifying 68 and calling it complete would have been the more comfortable option and the wrong one.

---

## 2. Requirements this slice claims

| Id | Claim | Evidence |
|---|---|---|
| `2K-A11Y-001` | **built** | Conversar's card states, controls, resumption, sources, explanation and suggestions all joined `e2e/accessibility.spec.ts`'s `SURFACES` **as each slice landed**, never at closeout — six fixtures added across 2K.1–2K.6, each pinned to its component by `accessibility-mirror-guard.test.ts`. Supersedes 2K.1's `partial`, which was true of 2K.1 |
| `2K-A11Y-002` | **built** | `2J-ACCESS-001` runs axe over every Conversar surface at desktop **and** Pixel 7. Zero serious or critical violations |
| `2K-A11Y-003` | **built** | `2J-ACCESS-006` measures rendered target size from paint at Pixel 7. Every new control carries a 44px minimum — above WCAG 2.2 AA 2.5.8's 24px — and the check is what caught a real 16px defect the first time this lane ran |
| `2K-A11Y-004` | **built** | `2J-ACCESS-005` measures focus from computed style, asserting the union of outline, box-shadow and border so a design that uses either passes and one that paints nothing fails |
| `2K-A11Y-005` | **baseline, preserved** | The composer's single polite live region is untouched, and `TaskCommandResult` still renders `silent` so a turn cannot be announced twice. No slice added a second region |
| `2K-A11Y-006` | **built** | Exactly one focus move per resolved turn. The resumption is the only thing on the thread that moves focus, and it fires once on arrival; the composer's own effect fires only on an action round |
| `2K-A11Y-007` | **partial** | Thumb reach, no hover dependency and both locales are proved at Pixel 7 width in a real browser; `isComposing` on Enter is preserved and untouched. **Remainder:** no real-device session — an emulated Pixel 7 is not a phone. **Destination:** carried past close as a named residual, with the same standing as G-2J.4b |
| `2K-METRICS-001` | **built** | Three event names and the `conversation` surface are declared in `product-analytics/contracts.ts` and **derived** from it everywhere else. The migration was *assembled* from `202608080086`'s own text rather than retyped |
| `2K-METRICS-002` | **built** | Every property is a closed enum or a boolean. The guard walks each declared shape and fails anything that is neither, and asserts no content-shaped **key** on any Phase 2K arm |
| `2K-METRICS-003` | **built, vacuously — and it says so** | Phase 2K declares **no duration at all**, so there is nothing to bucket. Asserted as an absence rather than claimed as a bucketing mechanism this phase never built |
| `2K-METRICS-004` | **partial** | Both gates the previous defect taught this repository to watch were widened together, with a name-by-name agreement block that refuses to run vacuously. **A THIRD existed and the deployment probe found it**: `private.record_product_event` carries a hardcoded SURFACE allowlist, in the same function `202608080087` edited, and `conversation` is not in it. **Remainder:** that surface allowlist. **Destination:** an owner decision on a second migration — see `PHASE_2K_DEPLOYMENT.md` |
| `2K-METRICS-005` | **built** | `post_2j_product_event_write_path.sql` **extended, never duplicated**: three legal payloads added, and the suite's existing set-difference assertions in both directions make an omission fail rather than pass quietly. One added assertion names the three explicitly |
| `2K-METRICS-006` | **built** | Negative controls: an undeclared event name and an undeclared property are each refused with `22023`. Non-vacuity: accepted events must return a non-null id, and the historical-gate probe asserts it refuses exactly **seven** — the number that rose from four when this phase added three |
| `2K-METRICS-007` | **partial** | The consumer exists, is RLS-scoped, authenticates as the owner, writes nothing, and distinguishes "not deployed yet" from "a quiet week". **The producer is INERT on the deployed project** — every event is refused `22023 Unsupported product surface`. **Remainder:** the surface allowlist admitting `conversation`. **Destination:** an owner decision on a second migration — see `PHASE_2K_DEPLOYMENT.md` |
| `2K-METRICS-008` | **built** | Zero fixture residue proved after the hosted probe, **by construction**: every write was refused by the surface gate, so no row was created, and the probe file was deleted. Recorded in `PHASE_2K_DEPLOYMENT.md` |
| `2K-CLOSE-001` | **built** | All **79** declared requirements classified exactly once, by a generator that refuses to emit anything otherwise |
| `2K-CLOSE-002` | **built** | Every `partial` names its remainder and destination, enforced by the generator rather than by review |
| `2K-CLOSE-003` | **built** | Budget reconciled per slice: 2K.0–2K.6 spent nothing, 2K.8 spent one. `1 allocated · 1 spent` |
| `2K-CLOSE-004` | **built** | ADR-055's status restated: retired unmet by ADR-099, expiry `2026-10-27` **not yet reached** at close, no renewal date written, and the retrieval that ships today untouched |
| `2K-CLOSE-005` | **built** | Real-device, assistive-technology, provider and hosted checks are each labelled executed, skipped or **NOT PROVED** in §5, and the screen-reader session is reported as an evidenced negative rather than inferred from an axe pass |
| `2K-CLOSE-006` | **built** | The signup rollout gate is restated as untouched at 25 pass · 3 fail · 2 owner-signature, and Phase 2K is explicitly **not** progress toward it |

---

## 3. The telemetry, and the three decisions inside it

**Three events, and the count is the point.** `2K-METRICS-007` requires a **consumer** before close, because SH.6 shipped a producer with none and its quota refusals recorded nothing for weeks while the code read as though they did. These three are exactly what `phase-2k-conversation-funnel-reader.mjs` asks questions of. A fourth name nothing reads would be SH.6's failure wearing a different label.

**The migration was assembled, not retyped.** The validator is ~280 lines and must be re-declared whole, because Postgres cannot extend a `case` arm in place. A hand-copy is how a pre-existing arm gets silently dropped — which is a defect that deploys clean and then refuses at runtime, inside a path that swallows the error. So the file was generated from `202608080086`'s own text, with the three arms inserted and every pre-existing name asserted present.

**The verification block that did not exist before.** `202608080087` had to delete a third vocabulary copy that had been silently rejecting `rate_limit_refused` since `202608070081`. This migration's final block extracts every name from the CHECK and asserts the validator knows each one — **name by name**, and refusing to run if the extraction returns fewer than 30. That is the check which would have caught that defect a phase earlier.

---

## 4. Five pins moved, because a migration moved the chain

Adding a migration is supposed to be noticed. Five guards noticed, and each was updated in the same commit, which is the documented protocol rather than an inconvenience:

- `egc-invariants.test.ts`'s authorized chain head, whose own comment says the pin is moved by the slice that adds a migration, deliberately and visibly.
- `post-2h-retention-correction.test.ts`'s successor list — *"nothing follows that somebody did not deliberately account for."*
- `telemetry-parity.test.ts`'s `MIGRATION` pin, which must read the newest declaration or it reports a name "dropped" that was simply added later.
- `docs/DATABASE.md`'s allowlist count, 30 → 33, whose own parenthetical predicted this: the guard extracts the list from the chain so the next widening fails the build rather than letting the text age.
- `docs/SECURITY.md`'s chain head.

---

## 5. Gates, as executed

| Gate | Result |
|---|---|
| Lint / typecheck | **Executed, zero errors** |
| Full unit | **Executed** — 4898 tests passed, 0 failing tests. 3 files fail to *load* on Windows (the known local baseline, green in CI) |
| Build | **Executed, green** |
| Browser, both viewports | **Executed** — every Conversar surface scanned by axe at desktop and Pixel 7; targets and focus measured from paint |
| pgTAP | **Written and extended; executed in CI only** — no local Docker on this machine |
| Traceability generator | **Executed.** It refused four times before it emitted, on real findings |
| `git diff --check` | **Executed, clean** |
| Migration | **One, created.** Applied to the deployed project — see the deployment record |
| **Screen-reader session** | **NOT PROVED.** Never executed for this surface. An axe pass is not one, and this record does not treat it as one |
| **Real-device mobile** | **NOT PROVED.** An emulated Pixel 7 is not a phone |
| **Hydrated interactivity in a browser** | **NOT PROVED.** Proved in jsdom; the markup is proved in a browser; the two together are not the third thing |
| **Zero-source provider prose** | **NOT PROVED.** Needs a real OpenAI call; ADR-101 does not authorize spending the owner's credential, and no slice did so silently |
| **Authenticated online journeys** | **NOT EXECUTED.** The `online-*` lane needs live credentials and is manual |

---

## 6. Security posture at close

- **No new RLS policy, grant, secret, external service or second write path** across the whole phase.
- **No service-role client** on any product path. The consumer authenticates as the owner and RLS does the bounding — a measurement path that could read across owners is one that has to be trusted rather than bounded.
- **The continuity payload is incapable of authorizing**, proved against a planted instance of each of twelve forbidden fields, and R17 is asserted by the generator itself.
- **Retrieved content cannot produce a mutation.** The answer schema still declares exactly two fields.
- **No existence oracle.** `unavailableCard` takes no cause parameter; the explanation payload carries no count, rate or sensitivity fact.
- **Signup remains closed.** The rollout gate reads **25 pass · 3 fail · 2 owner-signature** and is untouched. Phase 2K is **not** progress toward it.

---

## 7. What remains open at close

1. **`2K-METRICS-007` and `2K-METRICS-008` are partial until the deployment probe runs.** Their remainder is named and their destination is the deployment record.
2. **No screen-reader session, and no real-device mobile session.**
3. **The zero-source provider prose**, narrowed by 2K.4 to what the provider *says* rather than whether the product *tells the user*.
4. **Historical citation excerpts** remain the named residual OD-2K-2 declared — contained by a renderer that never reads one.
5. **Relation references are not editable from a card**, and **interpretation correction has no domain effect**. Both declared, both with destinations.

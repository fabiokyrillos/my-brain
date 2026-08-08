# Phase 2J — Today, Capture and Attention · Implementation Plan

**Status:** PLANNING ONLY. Implementation is **not** authorized. Nothing in this document
may be executed before the owner's implementation authorization.

Governing pair with `PHASE_2J_PRD.md`. Evidence base:
`docs/reports/phase-2j/PHASE_2J_CURRENT_EXPERIENCE_AUDIT.md`.

---

## 1. Ordering, and why it is this order

**2J.0 → 2J.1 → 2J.2 → 2J.3 → 2J.4 → 2J.5 → 2J.6 → 2J.7**

The accessibility lane runs **first**, not last. Phase 2I ended with `2I-CLOSE-002` partial
because browser-level verification was deferred to the end and then not reached. Putting
the lane first inverts that: it discharges the residual on surfaces that already exist and
are stable, and every subsequent slice inherits a lane it must not break. A lane written
after the surfaces it audits is a lane shaped by them.

Hoje precedes attention because the attention surface is reached *from* Hoje, and building
the destination before its entry point repeats the mistake Phase 2I avoided by ordering
palette → search → Library.

Capture precedes voice because voice is a third modality of a surface that must exist
first. Building voice into the current split surfaces would mean building it twice.

Sensitivity (2J.6) lands after the surfaces exist because it is a **cross-cutting
predicate** and applying it to surfaces that are still moving produces per-component drift
— exactly what `2J-PRIVACY-001` forbids. Its owner decision, however, is needed *before*
2J.1 acceptance, not before 2J.6 starts.

Telemetry closes because `2J-METRICS-007` requires each event to have a producer **and** a
consumer, and the consumers are the surfaces built above.

## 2. Gates

A gate is a measurement or a decision that must complete before the slice it names starts.
A gate is never discharged by writing a document.

| Gate | Before | Discharged by |
| --- | --- | --- |
| **G-2J.0** | 2J.0 | The chosen scan dependency is added, pinned, and shown to run in CI's existing browser job — not merely installed. |
| **G-2J.1** | 2J.1 | The `/app/today` vs `/app` resolution is chosen and its deep-link inventory enumerated from the route tree, so `2J-HOJE-002` is provable rather than hoped for. |
| **G-2J.2** | 2J.2 | The qualifying reason set is re-derived from `list_needs_attention`'s SQL, not from `contracts.ts` alone — the RPC is the source, the TypeScript is a mirror. |
| **G-2J.3** | 2J.3 | The no-second-write-path guard exists and **fails** against a deliberately introduced second path, before the unified surface is written. |
| **G-2J.4a** | 2J.4 | **OD-2J-2 answered.** |
| **G-2J.4b** | 2J.4 | Recording measured on a real iOS Safari and a real Android Chrome: the container each emits, the ceiling that applies, and the permission flow. Assumptions from this plan do not discharge it. |
| **G-2J.4c** | 2J.4 | One transcription round-trip proved end-to-end against a BYOK credential, with the ledger row written, before any UI is built on it. |
| **G-2J.6** | 2J.6 | **OD-2J-1 answered.** |
| **G-2J.7** | 2J.7 | Every declared event has a named consumer. An event with no reader is not added to the constraint. |

`OD-2J-3` gates only `2J-HOJE-004`'s shape and does not block the slice: the deterministic
derivation is the default and ships unless the owner chooses otherwise.

## 3. Slices

### 2J.0 — Accessibility lane (`2J-ACCESS`, 8 requirements, 0 migrations)

**User problem.** Phase 2I shipped a palette, a search surface and a Library whose
accessibility is asserted only by component test. Nobody has run them in a browser.

**Work.** Add the scan dependency (`2J-ACCESS-002`). Add a local Playwright spec —
alongside `foundation.spec.ts`, so CI's `database` job runs it on both the desktop and
Pixel 7 projects — covering the automated scan (`001`), the keyboard journey (`003`), focus
restoration (`004`), visible focus (`005`), rendered touch targets measured from bounding
boxes (`006`) and `prefers-reduced-motion` under emulation (`007`).

**Not automated.** The screen-reader session (`008`). It is recorded as manual with reader,
platform, date and outcome, or it closes as an evidenced negative. Calling it automated
would be the over-claim Phase 2I's `baseline` class exists to prevent.

**Acceptance evidence.** The spec runs in CI on a PR; a deliberately broken contrast or a
removed label makes it fail.

**Risk.** The scan may surface pre-existing violations in surfaces this phase did not
build. Those are recorded and triaged, not silently baselined away. A suppression list, if
one is needed, is itself reviewed.

### 2J.1 — Hoje as one destination (`2J-HOJE`, 10 requirements, 0 migrations)

**Current journey.** The user taps *Hoje* and lands on a filtered Work list. The cockpit
they wanted is at `/app`, which the navigation reaches by a different label.

**Target journey.** One Hoje. Capture first on mobile. Up to three deterministic priorities.
Overdue distinguished from due-today.

**Technical dependencies.** `work-projection.ts` (owns the `today` definition — do not fork
it), `home-projection.ts`, `home-dashboard.tsx`, `home-view.tsx`, the navigation
constants Phase 2I settled.

**Write-path impact.** None. Every change is composition and routing.
**AI/provider impact.** None — `2J-HOJE-004` is deterministic by requirement.
**Migration impact.** None.

**Acceptance evidence.** Deep-link inventory with each old URL's resolution; a test that
fewer than three qualifying items renders fewer than three; a test that a failing section
leaves Hoje rendered.

### 2J.2 — *Precisa de você* (`2J-ATTN`, 12 requirements, 0 migrations)

**Target journey.** A dedicated surface over `list_needs_attention` with reason filtering,
deterministic order, and in-place resolution where resolution is already a single bounded
action.

**The design constraint that decides this slice.** Every item's `primaryAction` today is a
link. Making resolution in-place means invoking the *existing* action for that reason — not
inventing a generic "resolve" mutation. Where the reason genuinely needs full entry context
(`review_interpretation` most obviously), the surface navigates and says why.

**Explicit non-work.** Snooze (`009`), dismissal (`008`) and — unless an equivalent-and-safe
set is found — bulk (`010`). Each closes as an evidenced negative with its destination.

**Write-path impact.** Reuses existing per-reason actions. No new mutation is introduced.
**Migration impact.** None. Admitting `configure_ai_credential` would cost one; `003`
forbids it.

**Acceptance evidence.** A two-account pgTAP or integration proof that the surface returns
only the caller's rows, in both directions — the Phase 2I standard, because a policy
written `user_id = auth.uid()` and one written for a literal are indistinguishable from one
side.

### 2J.3 — Unified capture (`2J-CAPTURE`, 7 requirements, 0 migrations)

**Target journey.** One surface, modality chosen inside it, nothing classified first.

**The invariant.** `captureEntry` stays the only entry-write path; `uploadAttachment` stays
the only attachment path. The surface dispatches; it does not unify records.

**G-2J.3 first.** The guard is written and proved to fail against a planted second path
*before* the surface is built. A guard written afterwards is a guard shaped to pass.

**Write-path impact.** None added. **Migration impact.** None.

**Acceptance evidence.** The guard, red then green; an idempotency test showing a retried
submit produces one entry.

### 2J.4 — Voice and reviewable transcription (`2J-VOICE`, 15 requirements, 1 avoidable migration)

The largest slice, and the only one touching the provider interface.

**Sequence.** G-2J.4a (owner) → G-2J.4b (device measurement) → G-2J.4c (one proved
round-trip with a ledger row) → provider method → recorder → composer integration → states
→ guards.

**Provider work.** A fifth method on `AIProvider` (`2J-VOICE-003`). Authorization,
confirmation and the write stay outside it, as with every other method. The model is a
routing constant (`004`) — no `agent_preferences` column.

**Cost and credential.** The user's BYOK credential, resolved through `resolveOwnCredential`
(`002`). No project key, no new secret, no new vendor. The ledger row precedes any dependent
write (`005`).

**Retention.** Nothing durable (`013`). No bucket, no table, no retention class, no deletion
cascade entry. A guard asserts the absence, in the shape Phase 2I used to prove zero
pin/favourite columns — re-derived from the schema every run, so a future migration breaks
it rather than silently invalidating the claim.

**Browser reality.** `014` is the requirement most likely to be got wrong from a desk.
Safari emits `audio/mp4`, Chromium `audio/webm`; the size ceiling is a duration ceiling in
practice and must be enforced before upload. G-2J.4b exists because this must be measured.

**Failure contract.** A failed transcription preserves the draft (`011`). A cancelled
recording discards audio immediately (`008`). Permission denial is a state, not a toast
(`009`). Nothing is interpreted before confirmation (`015`).

**Migration impact.** M2 only, and avoidable — see PRD §7.

### 2J.5 — End of day and review continuity (`2J-DAY`, 6 requirements, 0 migrations)

**Reuse, do not rebuild.** `generateReview(period: "daily")` and `loadReviewListProjection`
exist and work. This slice adds reachability from Hoje, an unresolved-work summary from
projections that already exist, and an explicit close.

**The hard rule.** `2J-DAY-004` — nothing mutates automatically. Ending a day is a reading,
not a transaction. Any action arising from it goes through an existing write path with
explicit confirmation (`005`).

**Migration impact.** None. No new review period (`006`).

### 2J.6 — Sensitivity behaviour (`2J-PRIVACY`, 5 requirements, 0 migrations)

Blocked on **OD-2J-1**. Implemented as a single data module in the shape
`search/contracts.ts` uses, so a guard can assert it. It is an expectation layer over forced
RLS, never a replacement for it (`003`), and it introduces no service-role path.

Note for the implementer: the attention projection renders a 240-character
`originalPreview` of `entries.original_content`. `2J-PRIVACY-005` exists because a preview
is content.

### 2J.7 — Telemetry and closeout (`2J-METRICS` + `2J-CLOSE`, 11 requirements, 1 migration)

**M1** extends `product_events`' event-name constraint and re-declares
`private.validate_product_event_properties` verbatim plus the new arms — the repository's
established convention, because Postgres cannot extend a `case` arm in place. The diff
against the previous migration is exactly the lines the new events add.

**The property allow-list is the enforcement** for `2J-METRICS-006`. Content-free is a
database property here, not a code review habit.

**Closeout** generates the fail-closed matrix (`2J-CLOSE-001`), reconciles the budget per
slice (`002`), restates ADR-055 as neither satisfied nor superseded (`003`), and records
every deferral with its destination (`004`).

## 4. Budget rules

- **2 allocated.** M1 to 2J.7, M2 to 2J.4. Reconciled **per slice**, not by count.
- A migration is **never created to justify the allocation**. `2 allocated · 1 spent` is a
  success if M2 is refused; `2 allocated · 0 spent` is a success if telemetry is descoped.
- A third migration is an **owner amendment**, not an implementation decision.
- No migration is created during planning.

## 5. CI policy — ADR-090, unchanged

**This planning PR:** one complete green PR-head run, full diff review, merge. No repeated
green runs; a rerun is not an acceptance ritual.

**Every later code/migration PR:** one complete green PR-head run → full diff review →
merge → one complete green exact-merge-SHA run → only then deploy.

Rerun only for a real failure, a fixed defect, or concrete evidence of a flake. A flake is
a defect with an owner.

Two standing local-environment facts, so a future session does not misread them: the
Windows baseline runs ~54 fewer tests than CI and reports 3 failed *files* / 0 failed tests
from a shebang parse — chain guards and pgTAP speak only in CI, and an iteration should be
budgeted for that. There is no local Docker; migrations and pgTAP run in CI only.

## 6. Definition of done, per slice

Test-first for new behaviour · zero lint and type errors · unit and integration/DB
behavioural tests · Playwright journeys desktop **and** mobile, both locales where copy or
locale behaviour changes · migrations applied and linted (`npx supabase db lint --linked
--level warning`) · production build passes · `STATE.md` / `CHANGELOG.md` / `TODO.md`
updated, `DECISIONS.md` when a decision is architectural · a slice acceptance document under
`docs/reports/phase-2j/`.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| The unified capture surface becomes a second write path | G-2J.3's guard is written and proved red first |
| Voice measured from documentation rather than devices | G-2J.4b requires real iOS Safari and Android Chrome |
| Audio survives cancellation or failure | `2J-VOICE-008` and `013`, each with a guard, not a code comment |
| Sensitivity decided per component | `2J-PRIVACY-001`/`002` make it one asserted data module |
| Telemetry carrying content | Enforced by the DB property allow-list, not by review |
| The accessibility lane deferred again | It is slice **zero** and a pre-code gate |
| The audit over-states what ships | Every claim in the audit cites a file, route, RPC or constraint; the `baseline` class stays in the matrix |
| A phase that cannot close | Etapa 3+ is out; every deferral is named with a destination |

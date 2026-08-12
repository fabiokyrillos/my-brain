# Local Day Correction — Implementation Plan

Five units, five branches, five pull requests. No unit is partially implemented, no branch is
reused, and CI is green on both the head and the exact merge SHA of each.

**Migration budget: ZERO.** Parity stays `202608120092`, migrations stay at 92, `verify:edge-parity`
stays green, no Edge Function changes.

---

## Unit 1 — the contract and the guard *(no surface is fixed)*

The guard is created and proved **before** any repair, so the baseline is recorded mechanically
rather than asserted in prose.

- `src/lib/time/owner-timezone.ts` — `resolveOwnerTimeZone`, the one resolver (`LDC-CONTRACT-001`).
- `src/lib/time/instant-format.test.ts` — the locale-vs-zone property (`LDC-CONTRACT-002`).
- `src/lib/closeout/local-day-correction-guard.test.ts` — tree-wide over `src/`, four families,
  `OPEN_OCCURRENCES` carrying all **31** occurrences with exact counts (`LDC-GUARD-001`).
- Governance: ADR-111, this plan, the PRD, the audit, the threat model, STATE/TODO/CHANGELOG.

**Proof obligations, all discharged in-unit:** the detector fires on each family and stays silent on
the correct form beside it; a real planted defect in a non-exempt file fails the corpus scan by
name and line; a real *repair* of an exempt file fails the liveness assertion until its row is
deleted.

## Unit 2 — daily-cycle

`entry-review.tsx`, `inbox-item.tsx`, `needs-attention-item.tsx`, `technical-details.tsx`
(`LDC-DAILY-001`). Each moves onto `formatInstant`/`instantFormatter` with the owner's zone threaded
from the surface that already loads it.

Removes the four rows from `OPEN_OCCURRENCES` **and** empties
`HOST_ZONE_FORMATTERS_CARRIED_PAST_CLOSE` in `phase-2m-fixed-offset-guard.test.ts`, retiring the
liveness assertion that exists only to keep that list honest (`LDC-GUARD-002`). Phase 2M's
carry-past-close debt is discharged here.

## Unit 3 — the contextual pages

`people` (×2), `projects`, `memories`, `inbox`, `files`, `chat` (`LDC-CONTEXT-001`). Server
Components: each already authenticates and most already read the profile — where one does not, the
zone joins the existing round trip rather than adding one.

`LDC-CONTEXT-002` is the constraint that makes this unit boring on purpose: sensitivity, masking,
provenance, ordering, pagination and return-position must be **byte-identical** afterwards. Nothing
here implements or anticipates Phase 2N.

## Unit 4 — agent, search, shell, sources, and the three further families

Formatters: `agent/actions.ts`, `question-outcome-panel`, `question-preview-panels`,
`conversation-sources/source-list`, `search/search-surface`, `shell/home-dashboard`.

Beyond the seventeen, the census surfaced three families the phase guard never looked for:

- **`LDC-AGENT-002`** — `generateReview` computes its period with `setHours(0,0,0,0)`, `getDay()`,
  `getDate()`, `getFullYear()`, `getMonth()` (seven host-zone operations) and stores
  `toISOString().slice(0, 10)` as the summary's dates. On the server that is UTC. It loads
  `profiles.timezone` eleven lines later and uses it only for the prompt.
- **`LDC-HOME-001`** — Home's `todayLabel` is the clearest instance of the whole initiative: the
  header formats `new Date()` with no zone while the list beneath it uses
  `workProjection.timezone`. This is meaning, not formatting.
- **`LDC-MISC-001`** — the BYOK validated-at date (browser zone), the `toLocaleString` round-trip
  that fakes a local `Date` at two call sites, the `±730`-day picker bounds sliced off a UTC ISO
  string, and `planner-view`'s `shiftDay` — which is *correct* but is a second copy of civil-date
  arithmetic, so it moves onto the contract and the `utc-day-slice` family reaches zero honestly
  rather than by exemption.

At the end of this unit `OPEN_OCCURRENCES` is **empty** and all four families are at zero tree-wide.

## Unit 5 — journeys, hosted proof, closeout

Playwright desktop and mobile in both locales; authenticated verification against production on the
merged bytes; two zones that are on **different calendar days at the same instant**; a DST case in
each hemisphere; zero residue; final census; closeout documents; then a re-audit of slice 2N.0
against the new `main` **without implementing it**.

---

## Gates, per unit

`npm run lint` · `npm run typecheck` · `npm test` · `npm test` with `CI=1` · `npm run build` ·
`git diff --check` · draft PR → CI green on head → review the whole diff → ready → merge → **CI
green on the exact merge SHA** → update the handoff → re-audit the next unit.

The three Windows shebang-parse failures are a known local limitation, not a pass; they are green in
CI and are read there.

## Stop conditions

A migration, a column, a schema/RLS/grant/policy/RPC change, a new preference, a divergence between
the stored zone and the current authority, a date with no identifiable semantics, a material change
to a domain's meaning, a fix requiring persistent reprocessing, a change to a signed Phase 2N
contract, a concurrent `main` touching the same call sites, or any need to modify push or
notifications.

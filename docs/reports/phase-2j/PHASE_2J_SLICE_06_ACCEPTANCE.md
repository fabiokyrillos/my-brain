# Phase 2J.6 — Sensitivity convergence: acceptance

**Slice:** `2J.6` · **Status:** closed · **Migrations:** 0

Every row below cites the artifact that proves it. A row without a resolving
citation is a refusal in `generate-phase-2j-traceability.mjs`, not a warning.

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2J-PRIVACY-001` | **built** | One typed contract (`src/features/sensitivity/contracts.ts`) governs Hoje, attention, receipts, notifications and review summaries. `sensitivity-convergence.test.ts` proves each surface either consumes it or has nothing to consume it for. |
| `2J-PRIVACY-002` | **built** | The rules are data in one module; `sensitivity-boundary.test.ts` fails the build if any surface branches on a literal level of its own. |
| `2J-PRIVACY-003` | **built** | Presentation only -- ownership still comes from the authenticated query plus forced RLS. `toSensitivityLevel` fails **closed**: an unreadable classification is treated as the most protective level. |
| `2J-PRIVACY-004` | **built** | Masking happens **in place**, so counts stay truthful and no N-hidden affordance exists. Asserted directly. |
| `2J-PRIVACY-005` | **built** | The attention projection carries `entries.sensitivity` next to the 240-character preview it classifies, so the two can never be assembled from different rows. |


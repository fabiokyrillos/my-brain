# Phase 2J.7 — Telemetry and closeout: acceptance

**Slice:** `2J.7` · **Status:** closed · **Migrations:** 1 (`202608080086`)

Every row below cites the artifact that proves it. A row without a resolving
citation is a refusal in `generate-phase-2j-traceability.mjs`, not a warning.

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2J-METRICS-001` | **undelivered** | Hoje's first-useful-action event was not declared. Declaring it needs a **third migration** -- `product_events.event_name` is a database CHECK and the phase's two-migration budget is spent -- which ADR-095 names as a stop condition. **Destination:** a future phase with migration budget. |
| `2J-METRICS-002` | **built** | `attention_item_resolved` carries reason class, action and a **bucket**; producer in `needs-attention-list.tsx`, consumer in `scripts/phase-2j-experience-funnel.mjs`. |
| `2J-METRICS-003` | **built** | `capture_mode_selected` carries the modality and nothing else; producer in `capture-mode-reporter.tsx`. |
| `2J-METRICS-004` | **built** | `voice_transcription_finished` carries outcome plus `draftEdited` and `additionalSegment` booleans; producer in `voice-composer.tsx`. |
| `2J-METRICS-005` | **undelivered** | Review started/completed was not declared, for the same reason as `2J-METRICS-001`: a third migration is a stop condition. **Destination:** a future phase with migration budget. |
| `2J-METRICS-006` | **built** | No captured text, transcript, filename, entity name, task title or provider error can be recorded -- enforced by the per-event **key whitelist** in `validate_product_event_properties`, which `phase-2j-telemetry-guard.test.ts` reads from the migration's own arms. |
| `2J-METRICS-007` | **built** | Every declared event has a producer **and** a consumer, asserted in both directions. The consumer is `npm run measure:2j:funnel`, which reads one owner's events through that owner's own session and says out loud when it finds nothing. |
| `2J-CLOSE-001` | **built** | `scripts/generate-phase-2j-traceability.mjs`, fail-closed, mutation-proved by `phase-2j-traceability.test.ts`. |
| `2J-CLOSE-002` | **built** | The budget is reconciled **per slice**: M2 to 2J.4, M1 to 2J.7. Asserted by the generator. |
| `2J-CLOSE-003` | **built** | ADR-055 is restated in `PHASE_2J_REPORT.md` as neither satisfied nor superseded; this phase added no semantic retrieval. |
| `2J-CLOSE-004` | **built** | Every deferral -- snooze, dismissal, O Brain percebeu, the two undelivered metrics, and both partials -- is recorded with a destination in `PHASE_2J_REPORT.md`. |


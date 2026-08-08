# Phase 2J.3 — Unified capture: acceptance

**Slice:** `2J.3` · **Status:** closed · **Migrations:** 0

Every row below cites the artifact that proves it. A row without a resolving
citation is a refusal in `generate-phase-2j-traceability.mjs`, not a warning.

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2J-CAPTURE-001` | **built** | `UnifiedCapture` offers text, file and -- once 2J.4 landed -- voice, as a tablist. |
| `2J-CAPTURE-002` | **built** | Text dispatches to the unchanged `captureEntry`. |
| `2J-CAPTURE-003` | **built** | Files dispatch to the unchanged `uploadAttachment`. The two contracts stay separate behind one surface. |
| `2J-CAPTURE-004` | **built** | `capture-write-path-guard.test.ts`, **written first and proved red against a planted second caller of `capture_entry_async` before the surface existed** (gate G-2J.3). It also found a legitimate pre-existing caller the first allowlist wrongly excluded. |
| `2J-CAPTURE-005` | **built** | No type, project, person or tag control exists before capture; asserted, and the surface says so in copy. |
| `2J-CAPTURE-006` | **baseline** | The idempotency-key contract predates this phase and is preserved unchanged for every modality. |
| `2J-CAPTURE-007` | **baseline** | `CaptureReceipt`'s shape and its link back to the entry are unchanged. |


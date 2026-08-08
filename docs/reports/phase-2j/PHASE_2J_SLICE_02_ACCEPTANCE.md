# Phase 2J.2 — Precisa de voce: acceptance

**Slice:** `2J.2` · **Status:** closed · **Migrations:** 0

Every row below cites the artifact that proves it. A row without a resolving
citation is a refusal in `generate-phase-2j-traceability.mjs`, not a warning.

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2J-ATTN-001` | **baseline** | The surface already existed at `/app/inbox?view=needs-you` with tabs, the list and keyset pagination, reachable from Hoje. **The phase's audit predicted this and it happened anyway** -- asserting it is not building it. |
| `2J-ATTN-002` | **built** | The qualifying set is exactly `trackedAttentionReasons`; `attention-actionability.test.tsx` asserts the four context-needing reasons offer no inline action. |
| `2J-ATTN-003` | **built** | `configure_ai_credential` stays outside the queue and the reason is documented at the call site: the analytics enum validating attention reasons is enforced in the database, so admitting it is a migration. |
| `2J-ATTN-004` | **not built, by rule** | Memory conflicts have **no schema representation anywhere** -- re-derived, not asserted. Inventing a table for them would be the duplication the parent PRD itself warns against. |
| `2J-ATTN-005` | **built** | Reason filters narrow the already-loaded page client-side; chips appear only for reasons actually present, and no second query shape exists over `list_needs_attention`. |
| `2J-ATTN-006` | **baseline** | Deterministic keyset ordering predates this phase in `list_needs_attention`; unchanged. |
| `2J-ATTN-007` | **built** | In-place retry for `retry_processing`, reusing the existing `reprocessEntry` action injected as a prop. **The audit of what in-place can honestly mean is the slice's real content:** four of five reasons are decisions, not clicks. |
| `2J-ATTN-008` | **not built, by rule** | Dismissal is **not offered**, and `attention-actionability.test.tsx` asserts its absence. An attention-only dismissal would record resolved while the entry still said otherwise. |
| `2J-ATTN-009` | **not built, by rule** | Snooze is out of phase: it is the one attention action needing state the schema does not have, and adding it would turn a zero-migration slice into a schema change for a convenience. **Destination:** a future phase with budget. |
| `2J-ATTN-010` | **built** | Bulk retry, offered only for the semantically equivalent and independently safe set, only above one item, each with its own operation key. |
| `2J-ATTN-011` | **built** | Every control is a labelled button with a visible name -- no hover-only affordance and no gesture without a visible equivalent. |
| `2J-ATTN-012` | **built** | Empty, filtered-empty and failure states are distinct and separately asserted. |


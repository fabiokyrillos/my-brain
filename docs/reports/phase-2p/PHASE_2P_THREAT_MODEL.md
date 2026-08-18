# Phase 2P — Threat model

**Status:** planning posture; implementation not authorized.

| ID | Threat | Required mitigation |
|---|---|---|
| T-1 | unified composer creates a second entry writer | actions remain injected; write-path census fails on a new caller |
| T-2 | transcript is submitted before owner review | explicit send is the only entry mutation |
| T-3 | audio survives success, error or navigation | memory-only chunks, track cleanup and no storage/schema path |
| T-4 | restored draft replays an old authority | never persist operation/idempotency keys |
| T-5 | raw confidence authorizes a wrong mutation | calibrated type policy plus ambiguity and conflict refusals |
| T-6 | automation creates duplicate people | owner-scoped candidate resolution before create |
| T-7 | co-mention becomes a relationship fact | refuse inferred relation writes; keep 2N residual visible |
| T-8 | automatic write cannot be explained or undone | minimal audit reason and bounded undo receipt |
| T-9 | confirmation replay duplicates materialization | server-side idempotency and terminal-state gate |
| T-10 | queue removal hides an unresolved question | terminal predicate derives from all unresolved classes |
| T-11 | conversation error exposes provider or user content | closed diagnostic categories, content-free telemetry |
| T-12 | chat navigation promotes a broken route | repair and hosted proof precede promotion in the same slice |
| T-13 | attachment affordance bypasses validation | reuse the existing upload action and schema |
| T-14 | settings tabs duplicate or reset writes | one existing save contract, section ownership and preservation tests |
| T-15 | moving notification controls disconnects consumers | route move only; consent and delivery readers remain the authority |
| T-16 | nested modals lose focus or submit twice | one modal level, focus restore, pending lock and idempotency |
| T-17 | graph reveals inferred or masked data | draw only the owner-scoped explainable projection |
| T-18 | calendar/modal loses timezone context | owner timezone remains explicit at every date boundary |
| T-19 | tests claim real-device accessibility | hardware claims stay NOT EXECUTED until owner evidence |
| T-20 | implementation absorbs rollout/push residuals | explicit exclusions and closeout disposition |

Every slice acceptance record must disposition the threats it touches. A threat
cannot close from prose alone when its mitigation is executable.

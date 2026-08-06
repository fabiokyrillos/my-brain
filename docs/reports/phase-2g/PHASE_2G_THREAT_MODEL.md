# Phase 2G Threat Model — Conversational Creation

**Companion to the governing pair in `docs/initiatives/phase-2g/`.** Threats are
numbered `T-2G-*`; each names its mitigation and where the mitigation is
proven. The definition study's risk register (§15, R1–R12) is the ancestor;
withdrawn risks are dispositioned rather than dropped.

## Threats and mitigations

| # | Threat | Mitigation | Proven where |
| --- | --- | --- | --- |
| T-2G-1 | The taxonomy and the deployed `create_task_command` drift — a refused create surfaces a database error instead of a product refusal (study R1) | One importable contract module; parity test reads the emitter; no hand-copied verb list (2G-CREATE-003) | 2G.1 tests |
| T-2G-2 | The policy-version bump silently invalidates a stored fingerprint or an unexpired confirmation and nobody notices (study R2) | The invalidation is exercised against stored artifacts, not reasoned about (2G-CREATE-004) | 2G.1 tests |
| T-2G-3 | A second creation path appears by accident — a shortcut insert for the "simple" case (study R5) | `direct-write-guard.test.ts` with the empty `tasks` allowlist is an acceptance gate per slice; the build reds if it moves (2G-ROUTE-001, 2G-SAFETY-001) | every slice |
| T-2G-4 | The model over-classifies — questions become task creations (study R7) | Preview-then-confirm makes every misclassification a visible, discardable preview rather than a row (2G-ROUTE-002) | 2G.2 journeys |
| T-2G-5 | Creation duplicates capture — "registre que…" yields a task where the owner wanted an entry, or vice versa (study R6) | Routing is declared data; the preview names the object type before any write; ambiguity asks (2G-CAPTURE-001/002) | 2G.2/2G.3 tests |
| T-2G-6 | Replay or retry creates duplicates | Operation key idempotency + canonical fingerprint + single-use confirmation consumed transactionally (2G-ROUTE-007, 2G-CAPTURE-006) | 2G.2/2G.3 tests |
| T-2G-7 | Cross-owner writes through relation resolution — a command names someone else's project | `resolveRelationReference` resolves against owned rows only; RLS and composite-FK ownership proofs unchanged; isolation asserted non-vacuously | 2G.2 tests |
| T-2G-8 | Prompt injection: stored content (an entry, a memory, retrieved chat context) smuggles a creation instruction | A creation can originate only from the owner's live composer turn; retrieved content enters prompts as untrusted data, never instructions (2G-SAFETY-005 and the standing chat contract) | 2G.2 tests |
| T-2G-9 | Spend amplification | The create verb adds zero provider calls (one `parseTaskCommand` per turn, unchanged); capture routing spends on the owner's own BYOK key, bounded by `max_output_tokens` (shipped by BYOK) and SH.6 quotas | 2G.2/2G.3 acceptance |
| T-2G-10 | Telemetry leaks conversational content | Content-minimized events: outcome classifications and declared vocabulary only; the migration widens an allowlist value, it does not add content (2G-SAFETY-004) | 2G.3 review |
| T-2G-11 | A gateless account spends or fails dishonestly | `openAiGate` returns a declared value before any provider construction; routed captures store `awaiting_ai_configuration` with no job (2G-SAFETY-002, 2G-CAPTURE-004) | 2G.2/2G.3 tests |
| T-2G-12 | Provider failure is mistaken for product refusal, or vice versa | Distinct declared codes and copy; a provider failure creates nothing and burns nothing (2G-SAFETY-003) | 2G.2 tests |
| T-2G-13 | A suspended account holding a valid JWT reaches `create_task_command` directly through PostgREST | **Named residual, not new and not closed here.** Recorded by SH.3's adversarial review with its destination; partial mitigation stands (such an account cannot capture or have jobs executed; the composer path is behind `assertActiveAccount`). Extending the predicate needs a `create or replace` this budget does not carry | recorded; TODO.md |
| T-2G-14 | The phase is judged against an inflated promise (study R12) | The PRD states the create verb is an addressability fix; the value claim is "the natural sentence works" | PRD §1 |

## Dispositioned ancestors

- **R3/R10/R11 (spend ceiling reaching the worker; fail-open ledger under a
  cap; per-user caps against open signup)** — withdrawn with the ceiling itself
  (study §22): under BYOK the owner is not the payer, SH.6 owns the
  infrastructure quotas, and signup is closed and gate-kept. R10 returns in
  full if any future decision makes a ledger-reading ceiling enforcing.
- **R4 (invisible stalled heartbeat)** — unchanged Phase 2H deferral, re-raised
  at closeout (2G-CLOSE-002).
- **R8 (Phase 2H never happens)** — mitigated the only way available: the
  closeout re-raises every 2H deferral by name.
- **R9 (the funnel stays empty)** — not mitigable by engineering; 2G-CLOSE-003
  records the measured funnel so ADR-055's expiry (2026-10-27) is judged on
  evidence.

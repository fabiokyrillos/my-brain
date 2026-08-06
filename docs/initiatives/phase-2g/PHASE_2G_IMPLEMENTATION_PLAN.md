# Phase 2G Implementation Plan — Conversational Creation

**Status: GOVERNING — authorized by ADR-083 (owner decision, 2026-08-05).**
Companion to [`PHASE_2G_PRD.md`](./PHASE_2G_PRD.md); threat model at
[`docs/reports/phase-2g/PHASE_2G_THREAT_MODEL.md`](../../reports/phase-2g/PHASE_2G_THREAT_MODEL.md).
Slice reports and acceptance evidence file into `docs/reports/phase-2g/`.

## 1. Migration budget

**One migration total.** An estimate approved by ADR-083, not a licence; a
slice that needs more than its allocation stops and asks (the BYOK.1
discipline), and any increase is an owner ADR plus an append-only amendment
here and in the PRD. Every migration updates `AUTHORIZED_MIGRATION_HEAD` in
`src/lib/closeout/egc-invariants.test.ts` in the same commit.

| Slice | Migrations | Content |
| --- | --- | --- |
| 2G.1 | 0 | contract only — the zero is re-established by an executed inventory gate (2G-CREATE-005) before the slice is planned in detail |
| 2G.2 | 0 | routing and UI over deployed RPCs |
| 2G.3 | 1 | `create or replace private.validate_product_event_properties` — widen `captureSource` with a composer-specific value; nothing else |
| 2G.4 | 0 | traceability, journeys, reconciliation (read-only) |

Signup Hardening's eight-migration budget is spent and cannot be reused.
Nothing is borrowed from Phase 2H.

## 2. Slice sequence

Hard ordering: 2G.1 before 2G.2 (a contract before its consumer — the Phase 2E
precedent); 2G.3 after 2G.2 and separately gated; 2G.4 last. Each slice is its
own branch and PR; deletion-class, routing-class and closeout work never share
a PR.

### 2G.1 — The create-intent contract (0 migrations)

**Pre-slice gate G-2G.1 (blocking):** execute the inventory that re-establishes
the zero-migration claim — no database object pins the verb list; the
product-event validator allowlists event names and outcomes, not action verbs;
`task_command_confirmations`' CHECK already admits `create_task`;
`apply_task_command`'s fifteen-literal list is not on the creation path.
Transcript into the slice acceptance report.

Delivers:
- The creation-intent classification in the one importable contract module
  (prompt, schema, validation — ADR-039 shape), recognized for pt-BR and en
  phrasings; the matcher does not run for it (2G-CREATE-001…003).
- The `TASK_COMMAND_POLICY_VERSION` bump with the policy-lock digests updated
  in the same commit, and the invalidation consequence exercised against a
  stored fingerprint and an unexpired confirmation (2G-CREATE-004).
- One-creation-per-turn (2G-CREATE-006).
- No routing change, no UI, no RPC change. The composer's observable behavior
  is unchanged in this slice — `unsupported_action` still renders until 2G.2
  routes the new classification.

### 2G.2 — Creation from the composer (0 migrations)

Delivers:
- Routing the creation intent to `preview_task_command_creation` →
  `issue_task_command_creation_confirmation` → `create_task_command`
  (2G-ROUTE-001); the `no_match` offer untouched (2G-ROUTE-003).
- The preview/confirm surface in the composer, undo affordance, refusal
  narrowing for out-of-scope surfaces in both locales
  (2G-ROUTE-002/004/005).
- Provenance and idempotency proofs (2G-ROUTE-006/007).
- Authenticated journeys desktop + mobile, both locales, including one refusal
  journey (2G-ROUTE-008).
- Acceptance gates: `direct-write-guard.test.ts` green with the `tasks`
  allowlist still empty; grant census unchanged; BYOK gate behavior proven for
  the gated and gateless states (2G-SAFETY-001/002).

### 2G.3 — Capture routing (1 migration; separately gated)

The gate: this slice ships only as scoped — the declared-data routing, the
telemetry migration, and nothing else. If detailed design shows it needs more
than its one migration or a new privileged boundary, it stops and asks.

Delivers:
- Declared-data routing of explicit capture requests to `captureEntry` with
  `source = 'chat'`; ambiguity asks (2G-CAPTURE-001/002).
- The one migration: `captureSource` allowlist gains a composer value;
  `AUTHORIZED_MIGRATION_HEAD` moves in the same commit (2G-CAPTURE-003).
- No-credential, quota-refusal and idempotency behavior proven
  (2G-CAPTURE-004…006).

### 2G.4 — Convergence and closeout (0 migrations)

Delivers:
- `scripts/generate-phase-2g-traceability.mjs` + closeout test, fail-closed
  over every `2G-*` ID (2G-CLOSE-001).
- Documentation reconciliation: `STATE.md`, `TODO.md`, `CHANGELOG.md`,
  `SECURITY.md`, handoff; Phase 2H deferrals re-raised (2G-CLOSE-002).
- Non-destructive hosted verification on disposable fixtures, cleaned with
  zero residue proven; the measured funnel statement for ADR-055's evidence
  gate (2G-CLOSE-003).
- The phase's final report in `docs/reports/phase-2g/`.

## 3. Definition of done, per slice

Thematic commits; application, database/journey and edge-worker CI green on
the PR **and on the exact merge SHA**; acceptance report and adversarial
review in `docs/reports/phase-2g/`; branch preserved; `main` clean and
synchronized; `STATE.md`/`CHANGELOG.md`/`TODO.md` updated (DECISIONS.md when a
decision was made); zero lint/type errors; test-first for new behavior.

## 4. Rollout and rollback boundaries

- Everything in 2G.1/2G.2/2G.4 is application-level: rollback is a revert PR.
- 2G.3's migration is an additive allowlist widening inside an internal
  `SECURITY DEFINER` validator; if capture routing is reverted at the app
  layer, the widened value is unused and harmless. Migrations remain
  append-only — rollback is never an edit to an applied migration.
- Hosted verification is non-destructive and uses disposable fixtures only.
  Nothing in this phase touches signup posture, retention scheduling, SMTP,
  legal/monitoring signatures, or the rollout gate's semantics.
- The deployed worker is untouched: no Edge Function change is in scope. If a
  slice finds it needs one, it stops and records the finding.

## 5. Owner tasks that remain open throughout (recorded, not blocking)

Carried from Signup Hardening's close; none blocks repository-safe 2G work:

1. **Retention activation** — `npm run sh6:retention-dry-run`, review counts,
   then only under explicit separate authorization
   `npm run sh6:retention-schedule -- --enable`. Enabling **is** the
   authorization of the first live purge; purged rows are unrecoverable.
2. **Rollout gates toward public signup** — custom SMTP via Resend with a
   verified sending domain (RG-DEP-1); backup restored into a disposable
   project with evidence (RG-DEP-3); professional legal review signature
   (RG-LEG-4); monitoring adequacy signature (RG-DEP-4); then one fully green
   `npm run rollout:verify`, an owner-only flip of `disable_signup`, and a
   second green run against the open state (SH-ROLLOUT-005).

Documentation of these tasks is not their completion, and this phase performs
none of them.

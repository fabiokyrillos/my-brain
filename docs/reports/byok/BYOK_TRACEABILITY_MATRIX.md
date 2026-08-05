# BYOK — traceability matrix

**Generated 2026-08-02**, against `main` after the acceptance matrix and the
rotation window merged. Migration head `202608010069`; **zero migrations were
added by the closeout**.

## 0. What this measures, and what it does not

It measures **id-traceability**: for each requirement id declared in
`docs/initiatives/byok/BYOK_PRD.md`, whether that id appears in shipped code, tests, migrations,
journeys or CI.

It does **not** measure implementation. A requirement can be fully implemented
and behaviourally proven while its id is never written down next to the code —
`BYOK-USAGE-*` is the clearest case: the `ai_usage_events` ledger has shipped
since Phase 2X, every BYOK path writes to it, and the acceptance runs observed
those rows moving. Its ids simply were never cited in a comment.

Reporting those two things as one number would be the dishonest move in both
directions: it would either claim 131/131 on the strength of behaviour nobody
tied back, or claim 84/131 while a working system sits underneath. So the
census is reported as it is, and the untraced remainder is dispositioned by
family below rather than averaged away.

## 1. Census

| | Count |
| --- | --- |
| Declared requirement ids in the PRD | **131** |
| Cited in code, tests, migrations, journeys or CI | **80** |
| Cited only in acceptance reports | **4** |
| Not cited anywhere | **47** |

| Family | Declared | In code/tests | Reports only | Untraced |
| --- | --- | --- | --- | --- |
| `BYOK-ADAPTER` | 7 | 7 | 0 | 0 |
| `BYOK-CAPTURE` | 6 | 6 | 0 | 0 |
| `BYOK-COPY` | 7 | 1 | 0 | 6 |
| `BYOK-CRYPTO` | 7 | 6 | 1 | 0 |
| `BYOK-DEC` | 9 | 4 | 2 | 3 |
| `BYOK-DELETE` | 6 | 2 | 0 | 4 |
| `BYOK-FINGERPRINT` | 5 | 4 | 0 | 1 |
| `BYOK-GUARD` | 6 | 6 | 0 | 0 |
| `BYOK-JOBS` | 8 | 7 | 0 | 1 |
| `BYOK-LIFECYCLE` | 9 | 4 | 0 | 5 |
| `BYOK-MASTER` | 12 | 4 | 1 | 7 |
| `BYOK-OPERATIONS` | 6 | 0 | 0 | 6 |
| `BYOK-QUOTA` | 4 | 2 | 0 | 2 |
| `BYOK-RESOLVER` | 8 | 7 | 0 | 1 |
| `BYOK-ROTATE` | 4 | 2 | 0 | 2 |
| `BYOK-SCHEMA` | 15 | 14 | 0 | 1 |
| `BYOK-USAGE` | 5 | 0 | 0 | 5 |
| `BYOK-VALIDATE` | 7 | 4 | 0 | 3 |

**Five families are fully traced**: `BYOK-ADAPTER`, `BYOK-CAPTURE`,
`BYOK-CRYPTO`, `BYOK-GUARD` and — one short — `BYOK-SCHEMA`. Those are the
families where a mistake is unrecoverable, which is the right place for the
citation discipline to have held.

## 2. Disposition of the 47 untraced ids

Each line says what is true, not what is convenient.

| Family | Untraced | Disposition |
| --- | --- | --- |
| `BYOK-COPY` (6) | 002–007 | **Implemented, behaviourally proven, uncited.** Every sentence lives in `src/features/byok/copy.ts` in both locales and each was read off the screen during the C11 journeys in pt-BR and English on desktop and Pixel 7. The ids are not written next to the strings. |
| `BYOK-USAGE` (5) | 001–005 | **Implemented, behaviourally proven, uncited.** The `ai_usage_events` ledger predates BYOK; the isolation matrix observed per-owner attribution and the removal gate observed the ledger *not* moving when no credential existed. |
| `BYOK-OPERATIONS` (6) | 001–006 | **NOT implemented, and named as such.** These describe operator surfaces — dashboards, alerting, an admin view of credential health. None exists. `2F-OPERATIONS-002` recorded the same gap before BYOK and it is unchanged. This is the largest honest hole in the initiative. |
| `BYOK-MASTER` (7) | 002, 003, 006, 008, 010–012 | **Mixed.** The provisioning and independence rules are satisfied and evidenced in `BYOK_G03_MASTER_KEY_PROCEDURE.md` §7–§8 rather than cited in code; the rotation-window rules are now implemented by `BYOK-ROTATION` and cited there under a different family name. |
| `BYOK-LIFECYCLE` (5) | 004, 005, 007–009 | **Implemented, uncited.** Save, rotate, remove, reconfigure and the gated states were each executed end to end in the C11 journey and the removal gate. |
| `BYOK-DELETE` (4) | 003–006 | **Partly deferred.** Cascade-on-account-deletion is proven by `byok_residue.sql` and by this session's fixture cleanup (zero orphaned rows, non-vacuous controls). The *product* deletion flow does not exist — it is Signup Hardening's, not BYOK's. |
| `BYOK-VALIDATE` (3) | 003, 005, 006 | **Implemented, uncited.** Exercised by the live validation lane and by the C11 journey's invalid-candidate case, which confirmed an active credential survives a rejected replacement. |
| `BYOK-DEC` (3) | 3, 6, 8 | **Design decisions**, recorded in the PRD and in `BYOK_SECURITY_DEFINITION.md`. Nothing to cite in code. |
| `BYOK-QUOTA` (2), `BYOK-ROTATE` (2) | — | **Implemented, uncited.** Quota/failure classification is in `validation.ts`; rotation-conflict behaviour was executed under genuine contention. |
| `BYOK-FINGERPRINT` (1), `BYOK-JOBS` (1), `BYOK-RESOLVER` (1), `BYOK-SCHEMA` (1) | — | **Implemented, uncited.** Each family's remaining ids are cited; these single stragglers are covered by the same modules and the same tests. |

**The one requirement family that is genuinely not built is `BYOK-OPERATIONS`.**
It is carried forward as a named residual risk rather than counted as delivered.

## 3. Gate execution

| Gate | State | Evidence |
| --- | --- | --- |
| G-0.1 … G-0.5 | **SATISFIED** | `BYOK_G01/G02/G03` reports; `ADR-070`; `G05_HOSTED_SIGNUP_CLOSURE_EVIDENCE.md` |
| BYOK.1 … BYOK.4 | **CLOSED** | Slice acceptance records, each with green merge-SHA CI |
| BYOK.5 — deployment, E2 | **PASS** | `BYOK_DEPLOYED_ACCEPTANCE.md` §1 |
| E1 — owner sync + async on their own credential | **PASS** | §10: credential opens in Node; OWNER-ASYNC completes on the deployed worker, ledger 8 → 10 |
| E3 — remove / re-add | **PASS on disposable accounts; REFUSED on the owner's**, deliberately | §10 and the removal gate |
| E5 — remote smoke after cutover | **PASS** | all five remote smokes green |
| C10 — genuine concurrent rotation | **PASS** | `e2e/byok-isolation-and-rotation.spec.ts` — same witness, `Promise.all`, one winner, one declared conflict |
| C11 — Settings journeys | **PASS 4/4** | desktop + Pixel 7 × pt-BR + English, real provider calls |
| Two-user isolation, real credentials | **PASS** | cryptographic identity binding + resolver isolation, sync and async |
| Removal / queued jobs / capture lifecycle | **PASS** | `e2e/byok-removal-jobs-capture.spec.ts` |
| Bounded pending processing | **PASS** | 25 of 26, partial message asserted |
| Zero-secret residue | **PASS** | six product tables, zero matches; fixture sweep with non-vacuous controls |
| Master-key loss drill | **EXECUTED, for real** | §5 — it happened against the deployment |
| Two-key bounded rotation window | **BUILT and DRILLED** on disposable material | `rotation.ts` + Deno twin + parity lock + `byok:rotate-master-key`; production run is an owner action |

## 4. Residual risks, stated rather than closed

1. **`BYOK-OPERATIONS` is not built.** No operator dashboard, no alerting, no
   admin view of credential health. Unchanged from `2F-OPERATIONS-002`.
2. **The production master-key rotation has never been run.** The code is built
   and drilled on disposable material; the live run needs an owner-authorised
   key change. There is **no undo**: a rotation begun with a wrong current key
   strands every row it touches, which is why `byok:verify-runtime` must print
   `IN PARITY` first and why `--limit` exists.
3. **Six orphaned storage objects predate this work** — `user-files/<uuid>/…`
   from 2026-07-16, owned by users deleted long since. Database rows cascade;
   **storage objects do not**. Not caused by BYOK and not deleted here
   (irreversible, and outside this initiative's scope), but it is precisely the
   gap Signup Hardening's account-deletion requirement has to close.
4. **`BYOK_VALIDATION_OPENAI_API_KEY` and the two disposable product
   credentials should be revoked** at platform.openai.com now that their lanes
   have run. Revoking an external key is outside the implementer's
   administrative boundary.
5. **Compromise, pepper rotation and validation-key procedures remain written,
   not drilled** — `BYOK_INCIDENT_RUNBOOK.md` §4, §5, §6 say so at the top of
   each section.
6. **47 of 131 requirement ids are untraced**, dispositioned in §2. The risk is
   not that the behaviour is absent — most of it was executed this session —
   but that a future change could remove one without a citation failing.

# Phase 2K — Slice 2K.0 acceptance

**Slice.** 2K.0 — Evidence, measurement and the ADR-055 decision.
**Authorization.** Owner authorized **slice 2K.0 only**, 2026-08-08. Implementation of 2K.1–2K.8 is **not** authorized.
**Written after execution**, from executed evidence. Every result below was produced by a command run in this session; nothing is inferred from documents.

---

## 1. Baseline

| Fact | Value | How proved |
|---|---|---|
| Base SHA | `1e72d4b26333418c432aec88a753fd6a382fcbfc` | `git rev-parse HEAD` on `main` |
| Branch | `codex/phase-2k-slice-0` | branched from the base SHA |
| `main` vs `origin/main` | **0 / 0** | `git rev-list --left-right --count` |
| Worktree at start | **clean** | `git status --porcelain` empty |
| PR #145 | **MERGED**, merge SHA `1e72d4b…` | `gh pr view 145` |
| CI on merge SHA | run `31283662066` — **success** | `gh run list --commit 1e72d4b…` |
| Hosted parity | **local = remote = `202608080087`** | `npx supabase migration list --linked` |
| Migrations | **87** | `ls supabase/migrations/*.sql \| wc -l` |
| Concurrent 2K.0 work | **none** | no other `*2k*` branch; no open PRs |
| A13 target | **Phase 2L** (the successor) | `grep` on the guard |
| 2K.0 acceptance report | **absent** before this slice | `ls` returned nothing |

No pre-existing change was present, so none was altered.

## 2. Requirements covered

`2K-AUDIT-001` · `2K-AUDIT-002` · `2K-AUDIT-003` · `2K-AUDIT-004` · `2K-AUDIT-005` · `2K-AUDIT-006`.

---

## 3. Measurements

### M1 — Do task-command confirmations expire independently of object change? (closes OD-2K-5)

**Question.** Does a confirmation carry a TTL, and what makes one inapplicable?
**Method.** Read `supabase/migrations/202607260059_phase_2e_destructive_confirmation.sql` in full (3256 lines) — table DDL, `issue_task_command_confirmation`, the consumption block inside `apply_task_command`, the staleness gate, the grants — plus `TASK_COMMAND_OUTCOMES` and ADR-047. **Not** a keyword search: the whole artifact.
**Environment.** Local repository at the base SHA. Deployed equivalence follows from proved chain parity, since `202607260059` is in the applied chain.
**Fixtures.** None. Read-only.

**Result — measured, and the answer is no.**

1. **There is no expiry column.** The table is `id, user_id, task_id, action, operation_key, request_fingerprint, status ('issued'|'consumed'), created_at, consumed_at`. No `expires_at`, no interval, no age predicate anywhere in the file.
2. **The absence is deliberate and pre-recorded.** The migration header (lines 38–47) states it and cites **ADR-047 — "The destructive confirmation is a server-minted row, addressed by its own id, with no expiry."** Its stated reasoning: the digest binds the observed pre-state and the staleness gate refuses a moved pre-state, so *"an outdated confirmation is unusable rather than dangerous"*; and the decisive argument, that `2E-UX-001`'s outcome vocabulary is closed and *"an expired confirmation has no member in it"*.
3. **Three fact-based refusals replace a TTL:**
   - object moved → the **twelve-column** staleness gate raises **`55P03`** (`status`, `due_at`, `planned_at`, `manual_priority`, `completed_at`, `cancelled_at`, `intentional_no_due`, `no_due_reason`, `created_at`, `updated_at` and two more compared with `is distinct from`);
   - already spent, or never issued → the consumption `UPDATE` is guarded on six predicates and `row_count <> 1` raises **`P0001` / `2E_CONFIRMATION_REQUIRED`**;
   - payload changed under the same key → **`P0001` / `2E_IDEMPOTENCY_MISMATCH`**. Re-binding was considered and rejected: *"A changed proposal is a new request; it carries a new key."*
4. **`issuedAt` is the hinge for continuity.** It reaches the fingerprint through `observedBefore` (one of the seven hashed inputs), so **a re-derivation minted with a fresh clock yields a different fingerprint and cannot consume the earlier confirmation.**
5. **A failed apply does not burn the confirmation.** Consumption is a guarded `UPDATE` inside the mutating transaction; any later raise rolls it back and the retry finds the row still `issued`.
6. **Write posture.** `enable` + `force` RLS, select-own policy, `revoke all` from `public`/`anon`, and `authenticated` holds **`select` only** — both writers are `SECURITY DEFINER`. No role, including `service_role`, may `INSERT`/`UPDATE`/`DELETE` it (ADR-047 clause 2).
7. **Vocabulary constraint.** `TASK_COMMAND_OUTCOMES` contains `rejected_stale` and **no `expired`**.

**OD-2K-5 closure.** *Confirmations do not expire on time; they become inapplicable on facts, through three distinct refusals.* Phase 2K's card state `expired` is a **presentation** state over those three refusals and must map onto `rejected_stale` for task commands — it may not widen the closed outcome vocabulary. Continuity (2K.3) must carry the original pinned `issuedAt` or state plainly that a fresh confirmation is required; it must never mint a new clock silently and report the resulting refusal as a fault.

### M2 — What does a zero-source answer produce?

**Question.** What does the product do, and say, when retrieval returns nothing above the 0.2 floor?
**Method.** Read `src/lib/ai/openai-provider.ts` `answerFromKnowledge`, `src/lib/ai/chat-schema.ts`, `src/features/chat/actions.ts`, the thread renderer, and `src/features/chat/actions.test.ts`.
**Environment.** Local repository. **Structural half measured; provider-prose half NOT PROVED — see §7.**
**Fixtures.** None.

**Result — the product has no structural representation of insufficiency.**

1. `chatAnswerSchema` is exactly `{ answer: string, citedSourceIds: string[] }`. **No insufficiency field.**
2. With an empty source set the prompt sends the literal `Internal sources:\nNone` — `sources || "None"`.
3. The system prompt already asks the model to *"say that plainly"* if sources are insufficient. That is **prose**: unstructured, unverifiable, and varying with `responseDetail` and `agentStyle`.
4. `citedSourceIds` is filtered against `availableIds`; with no sources that set is empty, so **every** cited id is stripped and the array is always `[]` by construction.
5. The renderer draws the sources block only when `citations.length > 0`, so a zero-source answer renders as **plain prose with no marker**.
6. **The finding that changes the requirement:** `citations.length === 0` is **ambiguous**. It is produced both by "nothing was retrieved" and by "sources were retrieved and the model cited none". An insufficiency signal derived from the citation count would therefore be wrong in the second case. `2K-SRC-005` was amended to require deriving it from the **retrieval result**.
7. **No test covers the empty-source case** in `src/features/chat/actions.test.ts`.

### M3 — Does any surface render `occurred_at`?

**Question.** Is the freshness value the audit said is discarded actually discarded?
**Method.** Exhaustive `grep` for `occurredAt` / `occurred_at` across `src/lib/ai/`, `src/features/chat/` and the chat routes; read `ChatSource` and the persisted `Citation` type.
**Environment.** Local repository. **Fixtures.** None.

**Result — confirmed discarded.** `occurred_at` is selected by `match_internal_knowledge`, mapped to `ChatSource.occurredAt` (`chat/actions.ts:202`), and written into the model prompt as an XML attribute (`openai-provider.ts:312`). It appears in **no `.tsx` file**, and the persisted `Citation` shape is `{ id, type, sourceId, excerpt }` — **it is not even stored**. It reaches the model and never the user.

---

## 4. Owner-scope proof

The audit named a gap at §5.4: `match_internal_knowledge` is the RPC behind every grounded answer and **no database test asserted its owner scoping**.

**Created:** `supabase/tests/phase_2k_knowledge_retrieval_ownership.sql` — 11 assertions, no migration, no schema change.

Design decisions that make it non-vacuous:

- **Two owners, identical vectors.** Both owners' rows and the query vector are the same 1536-dimension vector, so every row scores identically and **ownership is the only discriminator**. Different vectors would let an assertion pass because a row merely ranked below the limit.
- **Section 0 — non-vacuity**, read as table owner before any role switch: both owners really do have retrievable rows.
- **Section 1 — structural, from `pg_proc`/`pg_class` rather than from the migration text**: `prosecdef = false` (SECURITY INVOKER), both tables RLS `ENABLED` **and** `FORCED`, `anon` lacks execute.
- **Section 2 — positive control**, the part that makes the denial mean anything: the same session, in the same transaction, retrieves **its own two rows**, both arms of the `union all` exercised.
- **Section 3 — the boundary**, asserted in **both directions**.

**Execution status: NOT YET EXECUTED LOCALLY.** This workstation has no Docker, so the local Supabase stack and pgTAP cannot run here. Its evidence comes from CI's `database` job, which runs `supabase db reset` over the whole chain and then the pgTAP suite. **This report does not claim it passed** — §9 records the CI result.

## 5. Hosted probes

One probe, **read-only, zero writes**, executed against the linked project.

| Call | Result | What it establishes |
|---|---|---|
| `POST /rest/v1/rpc/match_internal_knowledge` as **service_role** | **HTTP 200 → `array(0)`** | The deployed function exists with the expected signature and is callable — so the refusal below is not "the endpoint is broken". It returns **zero rows even to service_role**, because it is `security invoker` and `auth.uid()` is null under that role. The RPC is not a bypass door. |
| the same call as **anon/publishable** | **HTTP 401 → `42501 permission denied for table entry_embeddings`** | `anon` is refused, and refused at the *table* level — stronger than the function grant alone. |

**Zero residue by construction.** The probe issues no `INSERT`, `UPDATE`, `DELETE` or `UPSERT` and creates no account. Nothing was written, so nothing had to be cleaned. The probe script was run from a temporary file outside the repository and from a temporary copy inside it that was deleted and its absence asserted in the same command; `git status` afterwards showed only the intended new pgTAP file.

**Local vs hosted, distinguished as required.** M1 and M3 are **local source measurements**; their applicability to the deployed instance rests on proved chain parity (`202608080087`, local = remote) plus the fact that each artifact has a single definition site in the chain. The probe in this section is a **hosted** measurement. The pgTAP suite is a **CI** measurement. They are not interchangeable and are not reported as such.

## 6. OD-2K-6 / ADR-055 — recorded, not re-decided

**ADR-099** records the retirement OD-2K-6 signed in ADR-098:

- at the ADR-055 expiry the **widening** leaves the active roadmap — `source_type` widening, backfill, pipeline, job type, new index, new semantic infrastructure;
- the retrieval that **ships today** over entries and memories is **not removed, not disabled, not degraded, not deprecated**;
- **no renewal date is written** — the artificial renewal OD-2K-6 forbids by name;
- resumption requires all five of: new measurable demand signal, new audit, new ADR, own budget, explicit authorization;
- the ADR-055 spike remains permitted **by ADR-055**, is not a Phase 2K deliverable, and is not a route back into the retired scope.

The thresholds are recorded as **never met**: the funnel is empty, the spike tier was never executed, and at one real user the planning tier authorizes nothing beyond the spike by ADR-055's own terms.

## 7. Limitations and items NOT proved

Recorded as limitations, **not** upgraded to passes.

1. **The prose a zero-source answer produces is NOT PROVED.** Producing it requires a real OpenAI call. A disposable hosted account has no BYOK credential, so `openAiGate` refuses **before** any provider call and no answer can be generated; using the owner's credential would spend their money and write permanent rows (`conversations`, `conversation_messages`, `audit_logs`, `ai_usage_events`) into their real account, which this slice is not authorized to do. Independently, the prose is not a contract — it varies with model, `responseDetail` and `agentStyle` — so a single sample would not be reproducible evidence. **The structural half is fully measured and is what `2K-SRC-005` needs.** Destination: the 2K.4 acceptance, if a credentialed environment is authorized.
2. **The pgTAP suite has not run on this workstation** (no Docker). CI is its execution evidence; §9 records the outcome.
3. **A behavioural hosted probe of retrieval with real rows was not run.** It would require creating an account and embedded fixtures; the CI pgTAP suite proves the same property against the full chain, and the deployed function is provably the same definition (single definition site + proved parity).
4. **No screen-reader or real-device work** belongs to this slice and none was done.

## 8. Deviations

**None.** No measurement required a functional change, no conclusion required a migration, and nothing invaded slice 2K.1.

## 9. Tests and results

Recorded exactly, including the known local baseline.

### 9.1 — Executed locally on this branch

| Gate | Result |
|---|---|
| `npm run lint` | **0 errors** |
| `npm run typecheck` | **0 errors** |
| `npm test` | **4619 passed · 0 failed tests**; **3 failed FILES** — see the baseline note |
| `npx vitest run src/lib/closeout/` | **591 passed · 0 failed tests**; **2 failed FILES** — same baseline |
| `npm run build` | **succeeded** |
| `git diff --check` | **clean** |

**The failed FILES are the documented Windows baseline, not regressions.** `src/features/auth/hosted-auth-parity.test.ts`, `src/lib/closeout/signup-hardening-admin-boundary.test.ts` and `src/lib/closeout/storage-orphan-scanner.test.ts` fail to *load* on this workstation because the bundler cannot parse a `#!/usr/bin/env node` shebang in the scripts they import. **Zero tests fail.** The same three files were measured failing on clean `main` earlier in this work and pass in CI, where the `application` job runs the same suite. They are reported here as a **known environmental limitation, not as a pass**.

### 9.2 — CI

pgTAP cannot run on this workstation (no Docker), so `phase_2k_knowledge_retrieval_ownership.sql` is executed by CI's `database` job, which runs `supabase db reset` over the whole 87-migration chain and then the pgTAP suite. **This report does not claim the suite passed before CI executed it**; the PR records the run id and outcome.

## 10. Migration budget

**1 allocated · 0 spent.** This slice created no migration, altered no schema, function, constraint, RLS policy, grant or job, and performed no deployment. The single budgeted migration remains unspent and destined for the Conversar telemetry vocabulary in slice 2K.8.

## 11. Files changed

| File | Change |
|---|---|
| `supabase/tests/phase_2k_knowledge_retrieval_ownership.sql` | **new** — 11 pgTAP assertions; a test, not a migration |
| `docs/DECISIONS.md` | **ADR-099** appended — the ADR-055 retirement, recorded |
| `docs/initiatives/phase-2k/PHASE_2K_PRD.md` | OD-2K-5 closed by measurement; `2K-AUDIT-002/003`, `2K-ACT-005`, `2K-CONT-006`, `2K-SRC-004/005` carry their measured constraints |
| `docs/reports/phase-2k/PHASE_2K_SLICE_00_ACCEPTANCE.md` | **new** — this report |
| `docs/TODO.md`, `docs/STATE.md`, `docs/CHANGELOG.md` | slice state, the retirement, and the closed decision |

## 12. Confirmations

- **No functional behaviour was implemented.** No component, no Server Action, no route, no schema, no product code of any kind. The only non-documentation file added is a database **test**.
- **Slice 2K.1 was not started.** No card vocabulary, no `conversation-cards`, no `conversation-sources`, no sensitivity-surface change, no continuity, no undo, no suggestions, no telemetry.
- **No migration created or applied. No deployment. Hosted state unchanged.**
- **OD-2K-1 and OD-2K-4 were neither decided nor implemented**, as instructed. They remain open and gate later slices.

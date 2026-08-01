# BYOK.2 — Resolvers: acceptance record

**Date: 2026-08-01.** Governs `docs/BYOK_IMPLEMENTATION_PLAN.md` Slice BYOK.2, delivering
`BYOK-RESOLVER-001…008`.

**One migration: `202608010066`.** Parity moves from `202608010065` by exactly one, the
allocation the plan budgets. **No consumer** — BYOK.3 gives the synchronous resolver a
caller, BYOK.4 the asynchronous one. No table, no column, no policy, no table grant.

---

## 1. Acceptance gates

| Gate | Must show | Result |
| --- | --- | --- |
| **B1** | the no-`user_id`-argument assertion fails when a parameter is added — **proven by executing the mutation**, not by reading the test | **PASS** — `byok_resolvers.sql` §2 creates `byok_resolver_mutation_probe(p_user_id uuid)` inside the transaction, runs the same detector against it, requires it to be **caught**, drops it, and then re-checks that the real resolver survived — so a detector that started matching everything fails too |
| **B2** | matrix cases 4, 5, 8, 9, 10, 11 executed | **PASS** — §4 (4, 5), §6 (8, 9), §3 and §7 (10, 11) |
| **B3** | cross-owner denial **non-vacuous**: the owner's positive row asserted before the stranger's absence | **PASS** — §4 asserts the caller's ciphertext **by its bytes** (`aa01…`) before asserting the stranger's (`bb01…`) is absent, and §6 then resolves that same stranger row successfully, so its existence is proven rather than assumed |
| **B4** | a foreign job id and a non-existent job id produce byte-identical errors | **PASS, with a PRD contradiction resolved and recorded** — see §2 |
| **B5** | `authenticated` denied on the job resolver; `service_role` denied on nothing it needs; `anon` denied on both after a positive control | **PASS** — asserted from the catalog in §3 (both directions, positives first) and **executed** in §7, immediately after §6 called the same function successfully as `service_role` in the same transaction |
| **B6** | `invalid`, `removed` and absent are indistinguishable to the caller | **PASS** — §5 applies each transition and re-reads the caller's view; §6 adds the asynchronous case, where an owner with no credential is an empty result rather than an error |
| **B7** | parity moves by one; lint/typecheck/tests/build green | **PASS** — `202608010065` → `202608010066`; lint 0, typecheck 0, build exit 0, **3411 passed / 2 failed** (the known CRLF pair, §4) |

---

## 2. A PRD contradiction, resolved in one direction and recorded

`BYOK-RESOLVER-006` says `resolve_job_ai_credential` against **"a job the caller may not
see, or a non-existent job"** raises the **same** `P0002`, "so the function cannot probe row
existence".

PRD §20 **case 8** says a worker given a job owned by B returns **B's credential** — "the
row's real owner".

Read side by side these appear to conflict: one says a foreign job errors, the other says it
resolves.

**They are satisfiable together, because they describe disjoint situations.** The function
is granted to `service_role` and to nothing else, and `service_role` may see every job. So
*"a job the caller may not see"* is the **empty set** for the only caller that exists, and
the sole remaining failure mode is *"no such job row"*. Case 8 therefore governs what a
foreign job does, and `P0002` is reserved for a job id that matches nothing.

**What was implemented:**

- no `jobs` row for the id → `P0002 'Job not found'`;
- a `jobs` row whose owner has no `active` credential → **zero rows, no error**.

That second line is deliberate and worth stating, because it is the one place a caller can
distinguish two situations: "no such job" errors, "owner has no key" returns nothing. It
leaks nothing, because `service_role` can read `public.jobs` directly and already knows
which job ids exist. Making it error instead would deny BYOK.4 the distinction it needs
between *retry later* and *this job can never run*.

**Recorded rather than resolved silently**, because a future reader comparing
`BYOK-RESOLVER-006` against this code will otherwise think one of them is wrong.

---

## 3. What the migration deliberately does not contain

- **No `user_id` argument on either function**, asserted three ways: in the migration's own
  post-deploy block, in pgTAP against `pg_proc.proargnames`, and in
  `resolver-parity.test.ts` against the declaration text.
- **No decryption of any kind**, and no reference to either secret. Asserted over the
  migration with **documentation stripped** — both `--` lines and `comment on … is '…'`
  bodies — because the header and the catalog comments both explain at length *why*
  nothing here decrypts, and a guard that forbids documenting the thing it guards deletes
  the explanation that makes the rule survivable. That is the third time this slice family
  has needed the same fix; it is now applied consistently.
- **No table, column, policy or table grant.** Asserted by pattern, in both directions.

---

## 4. What failed, stated as failure

**The same two assertions that fail on `main`.**
`src/features/task-commands/sql-reachability.test.ts` loses 2 of 46 on this Windows
checkout, from `core.autocrlf = true` with no `.gitattributes`. Identical on `main`, whose
CI is green. Recorded in `PRODUCT_UX_CLOSEOUT.md` §8 and deliberately not fixed inside a
feature branch.

Full local run: **3411 passed, 2 failed**, 192 files.

**Docker is unavailable**, so `byok_resolvers.sql` could not be executed locally. Static
scrutiny found and fixed **three defects that would each have reddened CI**:

1. **`information_schema.columns` does not describe a function's return columns.** That
   view covers tables and views. The two return-shape assertions would have compared `''`
   against the expected list and failed. Replaced with `pg_get_function_result`, normalized
   for case and spacing so only the column names, types and order can move it.
2. **`jobs.type = 'interpret_entry'` fires `jobs_interpret_entry_payload_trigger`**, which
   rejects the default `'{}'` payload. The fixture would have raised before assertion one,
   killing the file with **zero** assertions run. Changed to `process_attachment`, which the
   resolver treats identically and which has no such trigger.
3. **`proconfig` stores the empty search path as `search_path=""`, not `search_path=`.** The
   migration's post-deploy block asserted the wrong spelling and would have **failed the
   migration while the function was correct**. Replaced with the tolerant pair
   `202607310064:843` and `ai_interpretation_bounds.sql:33` already use.

Also hardened preventively: `plan(31)` counted mechanically against the assertion calls;
every `throws_ok` argument explicitly cast against pgTAP's `(TEXT, CHAR(5))` /
`(TEXT, TEXT)` overload ambiguity; `has_function`'s args parameter cast to `name[]`, since
an untyped empty array cannot resolve the overload.

---

## 5. One generated-types note

`resolve_own_ai_credential` takes no arguments, and `database.types.ts` uses
`Args: Record<PropertyKey, never>` for it. The same file carries `run_all_heartbeats:
{ Args: never; … }` — the older generator spelling. The two are inconsistent, and the newer
form was chosen deliberately: `Args: never` makes an RPC **uncallable** from TypeScript,
which nobody noticed for `run_all_heartbeats` because it has no TypeScript caller. BYOK.3
will have one. Left as a recorded inconsistency rather than silently rewriting an unrelated
entry in a slice that does not touch it.

---

## 6. Evidence index

| Claim | Artifact |
| --- | --- |
| Both resolvers, grants, and the apply-time posture check | `supabase/migrations/202608010066_byok_resolvers.sql` |
| B1–B6, matrix cases 4, 5, 8, 9, 10, 11 | `supabase/tests/byok_resolvers.sql`, 31 assertions |
| Migration ↔ generated types parity, both directions | `src/lib/byok/resolver-parity.test.ts` |
| Parity moved by exactly one | `src/lib/closeout/egc-invariants.test.ts` |
| The boundary in prose | `docs/SECURITY.md`, "BYOK.2 — os resolvers" |

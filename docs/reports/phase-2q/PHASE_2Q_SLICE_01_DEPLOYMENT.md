# Phase 2Q — Slice 2Q.1 deployment record

**The one allocated migration is applied. Parity `202608190099` → `202608210100`,
100 local = 100 hosted, advanced by exactly one.**

- **Migration:** `202608210100_phase_2q_slice_1_summary_citations.sql`
- **Applied at:** 2026-08-21, from `main` at merge SHA **`c7c8db0`**, worktree clean
- **Budget:** **1 allocated · 1 spent.** A second migration of any kind is a stop
  condition (`OD-2Q-7` A, `OD-2Q-4` A, ADR-128 Decision 3)
- **Hosted data written by this record:** one synthetic, owner-scoped fixture,
  **removed**, with a two-sided residue control — §4. Nothing else.

---

## 1. The thirteen gates, each with its evidence

| # | Gate | Evidence |
|---:|---|---|
| 1 | Migration and pgTAP | CI `database` job **step 8**, `Run the pgTAP suite (post-revocation posture)` → success. 28 assertions in `supabase/tests/phase_2q_summary_citations.sql` |
| 2 | Database lint | **step 9**, `Lint the database` → success |
| 3 | Whole chain on an empty database | **step 7**, `Apply the whole migration chain to an empty database` → success |
| 4 | Positive and negative controls | in the pgTAP file: the cited task really is deleted before the byte-identity assertion; the owner **can** read their own row before the isolation assertion says another's is invisible |
| 5 | Green pull request | PR #279 on head `7927cb4`, **3/3**, executed steps **9 / 11 / 23** (the two non-`success` steps are `if: failure()` artifact collectors, `skipped`) |
| 6 | Green **merge SHA** | **`c7c8db0`**, run `32507230577`, **3/3**, executed steps **9 / 11 / 23** |
| 7 | Local bytes = merged bytes | `sha256` of the working-tree file equals `sha256` of the blob in the merge commit: `fd3ea482…a51a`; git object id identical both sides: `9a7d0334b2eb34b155fe765e33c59c59a8479d1e` |
| 8 | Hosted list read before applying | `202608210100` present locally, **absent remotely** |
| 9 | Dry run showing **exactly one** pending | `Would push these migrations: • 202608210100_phase_2q_slice_1_summary_citations.sql` — one line |
| 10 | Application | `supabase db push --linked` → `Applying migration 202608210100…` / `Finished supabase db push.` |
| 11 | Hosted proof | §2 and §3 |
| 12 | Parity advanced by exactly one | `202608190099` → `202608210100`; **100 local = 100 hosted** |
| 13 | Zero residue, two-sided | §4 |

---

## 2. The deployed posture, read live and compared to the recorded pre-state

`2Q-CITE-002` asserts the table's posture is **unchanged**. The pre-state was read
live in the slice 2Q.0 acceptance record, at parity `202608190099`, precisely so
this comparison could be made against something rather than against a memory.

| Property | Pre-state (`202608190099`) | Now (`202608210100`) | Verdict |
|---|---|---|---|
| Columns | 14 | **15** | the one allocated column, and only it |
| `citations` type / null / default | — | `jsonb` / `NO` / `'[]'::jsonb` | as declared |
| Policies | 3: `insert_own`, `select_own`, `update_own` | **identical, same names** | unchanged |
| Policy roles | `authenticated` alone, all three | **`authenticated` alone, all three** | unchanged |
| Grants | `authenticated`: INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE — **no DELETE** | **byte-identical string** | unchanged |
| RLS | enabled | enabled | unchanged |
| **Forced** RLS | enabled | enabled | unchanged |
| Foreign keys on the table | 1 | 1 | unchanged |
| Constraints **on `citations`** | — | **0** | no FK, no check |
| Non-internal triggers | 1 | 1 | unchanged |
| Rows with `citations is null` | — | **0** | the default reached every existing row |

**No policy, grant, constraint or trigger moved.** The column inherited the
table's posture, which is what `2Q-CITE-002` claims and what a column addition
is supposed to do — asserted rather than assumed.

---

## 3. The fourth parity proof, and a pre-existing divergence it surfaced

Slice 2Q.1's acceptance record named this proof as **owed** rather than implying
it: `supabase gen types typescript --linked` cannot run before the migration is
applied, because the generator reads the **deployed** database. It has now run.

### For what this slice changed: byte-identical

The generated `summaries` block and the committed `summaries` block are
**identical**, and both carry `citations: Json` on `Row` and `citations?: Json` on
`Insert` and `Update`. **The hand-added entry is exactly what the generator
produces**, which is the whole point of the check — and the reason ADR-041's
mechanism (hand-add, then prove) is honest rather than a shortcut.

### Elsewhere: a divergence that predates this slice, reported rather than absorbed

The two files also differ in **305 lines** that have nothing to do with
`summaries`. Characterised rather than waved at:

- **Ordering.** `entry_person_candidate_resolutions`, `rate_limit_events`,
  `apply_entity_deletion`, `begin_push_delivery` and `finish_push_delivery`
  appear in both files, in **different positions**.
- **Six RPC entries render differently.** The committed file declares
  `count_prunable_error_events`, `count_prunable_scheduled_job_health`,
  `prune_error_events` and `prune_scheduled_job_health`; the generated file
  declares `count_prunable_rate_limit_events` and `prune_rate_limit_events`
  instead.

**All six functions exist in the deployed database.** Verified directly against
`pg_proc`, not inferred from the generator: four of them are **overloaded** (a
no-argument form and a `p_window interval` form), and the two the generator emits
are not. The installed CLI (v2.106.0) evidently renders overloaded functions
differently from whatever produced the committed entries. **Neither file is wrong
about the schema; they disagree about how to describe overloads.**

**It predates slice 2Q.1 by construction**, and this is proved rather than
claimed: the whole diff this slice made to `database.types.ts` is **3 insertions,
0 deletions**, and all four disputed entries were already present at `e3a3668` —
the commit before it.

**It is recorded and not repaired here.** Repairing it would rewrite ~305 lines of
RPC typing that no requirement in this phase names, could break typed RPC calls,
and is exactly the scope creep a slice must not do. **Destination: the owner**, as
a separate item. It is not a schema drift, not a data risk, and not a Phase 2Q
remainder — it is a finding this slice's gate happened to be the first thing to
look for.

---

## 4. Hosted proof, and the two-sided residue control

**A zero count over an empty table satisfies every residue marker.** So the probe
was made to see something first.

### Positive side — planted, and seen

One synthetic auth user (`…dead`, `phase-2q-residue-probe@example.test`) and one
summary row carrying a citation envelope:

| Probe | Value |
|---|---|
| Summaries visible for the fixture | **1** |
| `citations -> sources -> 0 ->> 'type'` | **`task`** — a task is stored **as a task**, hosted |
| `citations -> 'reach'` | **`["entry","task"]`** — the review's own reach, not chat's |
| Keys on the stored reference | **4** — `{id, type, sourceId, support}`, **nowhere to put content** |
| Profile rows created by the `on_auth_user_created` trigger | **1** |

### Negative side — removed, and no longer seen

`delete from auth.users where id = '…dead'`, then the **same probes**:

| Probe | After |
|---|---|
| Summaries for the fixture | **0** |
| Profiles for the fixture | **0** |
| `auth.users` by id | **0** |
| `auth.users` by the fixture's email | **0** |
| Summaries by the `model` marker `residue-probe` | **0** |
| Summaries whose envelope contains the fixture's source id | **0** |

### The control that the zeroes are real

| Probe | After |
|---|---|
| Summaries readable **at all** | **1** — the owner's own pre-existing review |
| Columns on `summaries` | **15** |

The probe can still see, and the column still exists. **Zero residue.**

### What this proves, and what it does not

It proves the **deployed column** stores and returns a well-formed envelope, that
a task is stored as a task hosted, that the reference shape carries exactly four
identifier fields, and that the fixture left nothing behind.

It proves **nothing about RLS**, because these statements run as `postgres`, which
bypasses it. RLS is proved in pgTAP under `set local role authenticated` with the
owner's JWT claims — including the two-sided isolation assertion and the `42501`
refusal of `delete` — and CI ran that on the merge SHA.

It proves **nothing about a rendered link**, which is slice 2Q.2's boundary.

---

## 5. `2Q-CITE-008`, observed on the deployed database

The one pre-existing review row carries `citations = '[]'::jsonb` — **not NULL**.
That is the requirement's hosted observation: a review written before the
producer existed parses to the **`unknown`** evidence state, which means *"nobody
recorded whether the Brain found anything"*, rather than to
`no_qualifying_evidence`, which would claim the Brain looked and came back empty.

`summaries` rows: **1**. Rows with a non-empty envelope: **0** — correct, because
no review has been generated since the producer shipped.

---

## 6. The half of the hosted proof that is UNSPENDABLE, not passed

Slice 2Q.1's plan asks for *"a **generated** review's row read back with its
envelope"*. That requires a real `generateReview` call, which is a **paid AI
call** against the owner's BYOK credential.

**ADR-128 Decision 5 forbids spending one without a further authorization**, and
this record does not claim it. Measured rather than assumed:

- `OPENAI_API_KEY` is **absent** from this environment.
- `public.user_ai_credentials` exists on the deployed project, so the owner may
  hold a stored credential — which is precisely why generating would spend
  **theirs**.

**Recorded as `UNSPENDABLE`, never as a pass** — the same treatment
`2P-CHAT-007-JOURNEY` already carries, and the treatment the implementation
plan's risk 3 names in advance.

**It blocks nothing downstream.** Slices 2Q.2 and 2Q.3 need a review row *with* an
envelope, which a synthetic owner-scoped fixture supplies without any AI call.
The real producer's end-to-end proof is **item 1 of the owner's device
checkpoint** — *"a new review with sources"* — where the owner generates it
themselves, on their own device, with their own credential.

---

## 7. What did not change

Signup closed · rollout **25 pass · 3 fail · 2 owner-signature** · `RG-DEP-3`
still not closable by writing a file · push HTTP 403 not resumed ·
`2P-ACCESS-005` **WAIVED, NOT PASSED** · `2P-REVIEW-CITATIONS` still **NOT
DELIVERED** (a stored envelope is not a link the owner can click) · no successor
phase started or planned · no grant, policy, retention rule or execute privilege
moved anywhere · no product event vocabulary widened · no automatic writer
created.

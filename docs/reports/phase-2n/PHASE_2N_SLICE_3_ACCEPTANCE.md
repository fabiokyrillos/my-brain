# Phase 2N slice 2N.3 — acceptance: what the Brain knows, corrects, and can remove

Slice 2N.3 is **complete and deployed**. It shipped in two units with an
intermediate re-audit between them, because the second unit is the phase's only
irreversible operation and a deletion built before retrieval eviction works
produces an object that is deleted and still retrievable.

| | Unit M1 | Re-audit | Unit M3 |
| --- | --- | --- | --- |
| PR | **#211** → `ab86208` | **#213** → `456750b` | **#215** → `20fbbd0`, **#216** → `0b7565c` |
| CI on that exact merge SHA | green ×3 | green ×3 | green ×3 |
| Migration | `202608130093` | none | `202608140094` |
| Acceptance | `PHASE_2N_SLICE_3_M1_ACCEPTANCE.md` | `PHASE_2N_SLICE_3_DELETION_REAUDIT.md` | this document |

**Migrations: 94 local = 94 hosted, parity `202608140094`, read live.** Budget
`3 allocated · 2 spent`; **M2 remains allocated to slice 2N.7, unspent and
non-transferable, and a fourth is a STOP CONDITION.**

## 1. What the intermediate re-audit changed about the work

`2N-CORRECT-013` requires the per-type consequences to be confirmed **before**
M3 is written. That re-audit did not merely confirm them — it **measured** three
things the schema does not say, and each one changed what M3 had to be.

**The cascade does not reach the tables that matter most.** `entry_entities`,
`entity_aliases`, `entity_tags` and `entity_attachments` carry
`entity_type`/`entity_id` as an **unconstrained pair**, validated only by a
`BEFORE INSERT OR UPDATE` trigger that never fires on the parent's delete.
Deleting a person left every one of them alive, pointing at a dead id — and
`entry_entities` has four live readers, so an entry would have gone on reporting
a mention of someone the owner deleted. **That is the partial deletion
`2N-CORRECT-012` forbids**, and no `on delete cascade` would have prevented it.

**The ownership keys do not block the delete.** Every relation table holds two
keys to its parent: a single-column `CASCADE`/`SET NULL`, and a composite
`(user_id, id)` with `NO ACTION`. Which wins is not readable from the catalogue.
Measured: **the delete succeeds**. A re-audit that read `NO ACTION` as
"protected" would have concluded deletion was already impossible and stopped for
the wrong reason.

**A true undo is possible, and it was proved by executing it.** A fully
populated person — relationships in **both** directions with types, descriptions
and confidences; a project association with a `role`; a context; a task
assignment with a `role`; a task `waiting`; a memory with a real 1536-dimension
embedding; an alias; an entry mention — was snapshotted with `to_jsonb`, deleted,
restored with `jsonb_populate_recordset` under the **same ids**, and compared:
**nine row sets byte-identical**. Repeated for project and memory. The embedding
survives the round trip at **cosine distance 0**, so a restored memory is
retrieved exactly as before **with no provider call**.

Verdict: **M3 AUTORIZÁVEL DENTRO DO CONTRATO EXISTENTE**, with fourteen stop
conditions checked individually and none found.

## 2. The one deviation, surfaced rather than absorbed

`§6.3` predicted M3 would create *"one new function, no new table"*. A
confirmation that is server-issued, single-use and fingerprint-bound **is a
row**, and the only existing store — `task_command_confirmations` — is welded to
tasks by a foreign key and a **closed** `CHECK` that Phase 2E's own tests defend.

The re-audit stopped and put it to the owner rather than choosing, because
**after deployment, removing a table costs a fourth migration, which is a stop
condition**. The owner authorized it: **ADR-113**. One table inside M3, not an
additional migration, budget unchanged, and §6.3's sentence **preserved verbatim
and annotated** rather than rewritten — the mechanism ADR-109, ADR-110 and
ADR-112 already use.

## 3. Requirement classification, re-derived from source

### `2N-KNOWS` (9) — M1

| Id | Class | Evidence |
| --- | --- | --- |
| 001, 002, 007 | `baseline` | Shipped by UX-10 and 2N.0. Not re-claimed. |
| 003 | **built** | Both memory surfaces derive through `deriveClaimProvenance`; three copy strings deleted. |
| 004 | **built** | Three freshness facts where the page showed two. |
| 005 | `not-built-by-rule` | The epistemic three-way is not representable; asserted against schema, types and copy with a non-vacuity control. |
| 006 | `baseline` (words) / **made true by M1** | The sentence was true of the citation list; M1 made it true of retrieval. |
| 008 | **built** | The detail page's two pickers truncated in silence. |
| 009 | **built (guard)** | No provider import reaches either memory surface. |

### `2N-CORRECT` (13)

| Id | Class | Evidence |
| --- | --- | --- |
| 001 | `baseline` | `updateMemory`, `setMemoryLifecycle`, `correct_entry_interpretation`. |
| 002 | `baseline` + **guard now live** | The archive/delete distinction stopped being free the moment both controls sat on one page. `phase-2n-deletion-guard.test.ts` refuses archival wording in deletion copy, in both locales. |
| 003 | **built — M1** | Eviction at the bound, proved against the table rather than the citation list. |
| 004 | **built — M3** | The enumerated set is asserted by pgTAP per table, including the four no cascade reaches. |
| 005 | **built — M3** | Server-issued single-use confirmation; registered undo, proved to restore identity. |
| 006 | **built — M3** | Audit carries actor, target, time, consequence counts and resulting state — and **no content**. |
| 007 | **built — M3** | The undo targets `undoId`; the client cannot call it without one. |
| 008 | **built (guard)** | No feature module issues a table delete; control proves the scan can see one. |
| 009 | **built — M3** | One validated owner-scoped path. Its rationale is now a **proof**: `authenticated` holds no `DELETE` on two of the affected tables, so a client sequence *cannot* complete correctly. |
| 010 | **built — M3** | The preview counts in SQL and never estimates; one census, three readers. |
| 011 | **built — M3** | Removal from retrieval is same-statement by construction; asserted at retrieval with a control taken **before** the deletion. |
| 012 | **built — M3** | Whole-or-nothing, and four retentions named as retention in the preview. |
| 013 | **satisfied** | The re-audit ran before implementation and found no un-undoable propagation. |

### `2N-IDENTITY-005…007` (3)

All three close `not-built-by-rule` under `OD-2N-3` **A**, asserted against
migrations, types and the app with a control, not narrated.

**Totals for the slice: 25 requirements — 15 built, 5 baseline, 5
`not-built-by-rule`.**

## 4. What M3 is, and why each part of it is shaped that way

**`SECURITY DEFINER` is forced, not preferred.** `authenticated` holds no
`DELETE` on `entry_entities` or `entity_attachments`, so a `SECURITY INVOKER`
path would remove **zero** rows and **raise nothing** — RLS filters a `DELETE`
silently, and the most dangerous failure available here is the quiet one.

**The price of that was measured, not assumed.** `postgres` holds
`rolbypassrls`, so inside the function RLS is **not consulted at all** and the
`FORCE ROW LEVEL SECURITY` these tables carry protects nothing. The explicit
`user_id = v_owner` predicate on every statement is the **only** isolation there
is — so the suite asserts it against a second owner's identical person **with
RLS bypassed**, because a check run under RLS could not tell "protected" from
"deleted".

**One consequence census, three readers.** A second copy of those counts would
be a second definition, and the two would drift exactly once, silently, in the
direction that makes the preview a lie. It returns `NULL` when the subject is
not the caller's, so **absent, foreign and unreadable collapse into one answer**
with no branch that could tell them apart.

**The fingerprint helper is `private` and granted to nobody** — stronger than
Phase 2E's, whose helper is granted to `authenticated` and derivable by the
caller, which is precisely why `202607250057` records that it cannot be
evidence.

**Consumption is the last write, inside the same transaction**, so a failed
apply returns the confirmation instead of burning it, and the owner does not pay
for the world moving.

**Content lives only in the 24-hour reservation.** `audit_logs` is permanent, so
content there would be retention rather than removal. Asserted, with a control
proving the same phrase *is* findable in the undo reservation.

## 5. Proofs

| Proof | Result |
| --- | --- |
| pgTAP, M3, from an empty database in CI | **43/43** across nine sections |
| Hosted structural proof, read live after deploy | table present, RLS **enabled and forced**, **0** client write grants, definer + empty `search_path`, `authenticated` **cannot** execute the fingerprint helper, **3** undo handlers, **0** cron schedules |
| Hosted behavioural proof, as `authenticated`, rolled back | preview counts exact; foreign → `P0002` identical to absent; facts moved → `55P03` and the confirmation **not burned**; delete leaves people=0, relationships=0 and **aliases=0**; undo returns the **same id** with its note, its relationship description and both aliases; the other owner's person invisible and untouched |
| Hosted journey, `--workers=1`, both locales × desktop and Pixel 7 | **14/14** |
| Regression 2N.0 foundations | **12/12** |
| Regression M1 knowledge | **12/12** |
| Regression 2N.1 person | **14/14** |
| Regression 2N.2 project | **28/28** — the run §67 recorded as **not executed** |
| Owner-scoped residue, 22 markers + control | **zero**, and the control plants a person, a project and an alias and proves the probe finds all three |
| Byte parity | worktree, git and the deployed file share one `sha256` |
| GoTrue rate limit | **no 429**, across roughly 110 sign-ins run serially |

## 6. Defects found by verification, and what each one cost

Six defects were found by something checking rather than by reading the diff
again. They are listed because the pattern is the finding.

1. **The undo button vanished before it could be pressed.** `applyDeletion`
   called `revalidatePath`, and Next's documentation states a Server Function's
   `revalidatePath` *"updates the UI immediately (if viewing the affected
   path)"* — so a successful deletion destroyed the component about to offer the
   undo. **Worse than no undo, because the preview promised it.** Found by the
   hosted journey; nothing else could have.
2. **`isPending` did not update**, because the preview action is called from
   `onClick` rather than a form action and was not wrapped in a transition. The
   loading sentence and the disabled confirm button both depend on it.
3. **A `"use server"` module exported a constant.** Typechecks, then fails at
   the RSC boundary. Found by reading; CI's existing guard confirmed it.
4. **`jsonb_build_object` turns a `CASE` with no `ELSE` into JSON `null`**, which
   `coalesce` can never repair because JSON null is not SQL NULL. The undo
   handler would have received `null` where it expected a list.
5. **`'cron'::regnamespace` raises when the schema is absent**, which is how CI
   builds this database — so the guard that forbids scheduling would have
   toppled the migration on a clean database. **A guard that errors on a clean
   database is not a guard.**
6. **The new guard read its own prose.** The rule "deletion copy never says
   archive" failed because `copy.ts`'s header explains that rule and therefore
   contains the word — the failure M1 recorded twice in one migration. Then it
   failed again, correctly: Portuguese spells the noun *arquivo* (a **file**)
   with the same five letters as the verb *arquivar*, and the copy legitimately
   says "os arquivos continuam na sua biblioteca" because `2N-CORRECT-012`
   requires it to say what is kept. The stem was **narrowed** to `arquiva`, with
   a control proving the narrowed stem still refuses the sentence it exists to
   refuse — the difference between fixing a guard and weakening one.

Three further defects were in the journey itself and each made a test lie: a
bulk insert whose rows carried different keys; a staleness test that moved the
world **before** issuance, so the confirmation was validly bound to the changed
facts and the test failed by *passing*; and an assertion on a sibling test's
fixture, which passed only when that sibling had run.

## 7. Recorded, not smoothed

- **`online-memories.spec.ts:85` still fails on mobile**: a 21 px touch target
  against a 44 px minimum, reproduced at `289f1f8` before any of this slice's
  surface changes. `.list-row-main a` carries no sizing rule on **any** list
  surface. Destination **`2N-MOBILE`**. Not weakened, skipped or deleted.
- **Mobile is a viewport simulation on Pixel 7 metrics, not a device**, and **no
  screen-reader run is claimed.**
- **The lane is a local production build against the hosted Supabase**, not the
  Vercel deployment.
- **The undo window is 24 hours** and the deleted content lives in
  `undo_operations.before_state` for it. That is retention, it is named as
  retention in the preview, and after the window the deletion is permanent.
- **`entity_tags` has no `entity_type` CHECK**, so a future writer could point
  one at a memory. M3 deletes tags for every type including `memory`, so the
  census stays uniform and a later widening is picked up without a change.
- M3's internal check that no `cron.job` names the confirmation table passes
  **vacuously** where pg_cron is absent. It is guarded by `to_regclass` for that
  reason, and the assertion that matters — that this migration creates no
  schedule — is also asserted statically by the closeout guard.

## 8. Closing state

`main` at `0b7565c`, clean. **94 migrations local = 94 hosted, parity
`202608140094`.** Budget `3 allocated · 2 spent`, **M2 reserved for 2N.7**,
non-transferable, **a fourth is a STOP CONDITION**. Signup closed, rollout
**25 · 3 · 2**, push not resumed, **Phase 2O not started, not planned and not
retargeted**, and A13 still guarding the roadmap successor.

**Slice 2N.3 is COMPLETE. Slices 2N.4–2N.7 remain.**

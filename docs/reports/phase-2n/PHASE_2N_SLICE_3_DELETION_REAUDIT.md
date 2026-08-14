# Phase 2N slice 2N.3 — intermediate deletion re-audit, against `main` at `0f521f4` and the database M1 produced

This is the document `2N-CORRECT-013`, `OD-2N-11` **B** and the slice's internal
sequencing require **before M3 may be written at all**. The initial re-audit
(`PHASE_2N_SLICE_3_REAUDIT.md` §6) named the questions; this answers them
against the tree and the database that M1 left behind.

**Every consequence below was derived from `pg_constraint`, `pg_trigger`,
`pg_policies`, `information_schema.role_table_grants` and the live consumers —
never from a table's name.** Where the answer could not be read, it was
**measured**, by planting a fixture, performing the operation and observing the
result inside a `DO` block whose only exit is a `raise`, so nothing committed.
Four such probes ran. The owner's data was not modified.

## 0. Baseline, confirmed live

| Fact | Read from | Value |
| --- | --- | --- |
| `main` | `git rev-parse HEAD` | `0f521f4`, clean, `0 0` against `origin/main` |
| Open PRs | `gh pr list --state open` | none |
| CI on merge SHAs | `repos/:owner/:repo/commits/<sha>/check-runs` | `ab86208` and `0f521f4`: **all three jobs `success`** |
| Local migrations | `supabase/migrations/*.sql` | **93**, last `202608130093` |
| Hosted migrations | Supabase read-only `list_migrations` | **93**, last `202608130093` |
| Parity | set difference both ways | **no local-only, no remote-only, identical** |
| Budget | `OD-2N-14` B | **3 allocated · 1 spent (M1) · M3 for 2N.3 · M2 for 2N.7 · non-transferable · a fourth is a STOP CONDITION** |

Signup closed, rollout **25 · 3 · 2**, push not resumed, Phase 2O not started,
A13 unchanged. Nothing below alters any of these.

## 1. The structural fact the plan did not carry: every relation has *two* foreign keys

Each table that references `people` or `projects` carries **two** constraints to
the same parent: a single-column key with a referential action, and a composite
**ownership** key `(user_id, id)` with **`NO ACTION`**. None is `DEFERRABLE`.

```
person_relationships_person_id_fkey            (person_id)            -> people(id)          CASCADE
person_relationships_person_owner_fk           (user_id, person_id)   -> people(user_id, id) NO ACTION
```

Whether `NO ACTION` **blocks** the delete or is satisfied because `CASCADE`
already removed the child is not readable from the catalogue — the two are
after-triggers on the same event and the outcome depends on firing order. It was
therefore **measured**, not reasoned about.

**Measured: the delete succeeds.** `delete from public.people where id = …`
returned `rows=1`. The ownership keys do not block deletion; they constrain
*writes*, and the cascade satisfies them before they are checked.

This matters because a re-audit that assumed `NO ACTION` meant "protected" would
have concluded deletion was already impossible and stopped for the wrong reason.

## 2. Propagation, per type — measured

### 2.1 Person

| Effect | Table / column | Mechanism | Evidence |
| --- | --- | --- | --- |
| **Rows deleted by cascade** | `person_relationships` — **both** `person_id` and `related_person_id` | `CASCADE` | probe: 2 planted → 0 remain |
| | `person_projects` (carries `role`) | `CASCADE` | probe: 1 → 0 |
| | `person_contexts` | `CASCADE` | `person_contexts_person_id_fkey`; destroyed and restored in probe 3 |
| | `task_people` (carries `role`) | `CASCADE` | probe: 1 → 0 |
| **Foreign keys nulled** | `tasks.waiting_on_person_id` | `SET NULL` | probe: task row survives, column null |
| | `memories.person_id` | `SET NULL` | probe: memory row survives, column null |
| **Deletions blocked** | **none** | — | measured, §1 |
| **Rows left ORPHANED** | `entry_entities` (`entity_type='person'`) | **no FK at all** | probe: 1 planted → **1 remains** |
| | `entity_aliases` (`entity_type='person'`) | **no FK at all** | probe: 1 planted → **1 remains** |
| | `entity_attachments` (`entity_type='person'`) | **no FK at all** | `pg_constraint`: FKs only to `attachments` and `auth.users` |
| | `entity_tags` | **no FK, and `entity_type` has no CHECK** | `pg_constraint` |
| | `audit_logs` (`entity_type`, `entity_id`) | **no FK** — append-only by design | probe: 1 planted → **1 remains** |
| | `product_events` (`subject_type`, `subject_id`) | **no FK** — append-only by design | column scan |
| **Rows preserved, link severed** | `tasks`, `memories` | the row survives; only the column is nulled | probe |
| **Rows preserved, untouched** | `attachments`, `entries`, `organizations`, `contexts` | never referenced by the delete | probe |

**The orphans are the finding.** The four polymorphic link tables carry
`entity_type`/`entity_id` as an **unconstrained pair**, validated only by
`validate_polymorphic_entity_owner`, a **`BEFORE INSERT OR UPDATE`** trigger. It
never fires on the parent's delete. Nothing cascades and nothing nulls: the rows
simply survive, pointing at an id that no longer resolves.

That is not theoretical. `entry_entities` has live consumers —
`people/[personId]/page.tsx:77`, `projects/[projectId]/page.tsx:100`,
`interpretations/data.ts:252` and `daily-cycle/entry-outcome-projection.ts:208`
— so an entry would keep reporting a mention of a person the owner deleted.
`entity_aliases` gained its first readers in 2N.0/2N.1
(`features/entities/aliases.ts`, and `search/actions.ts:188` resolves nicknames
through it for the `person` and `project` domains).

**A deletion that leaves them is precisely the partial deletion
`2N-CORRECT-012` forbids.** M3 must remove them explicitly; the cascade will
not.

One mitigation is already in place and is recorded rather than assumed: search
matches alias ids against `spec.table.id` (`search/actions.ts:192-194`), so an
orphaned alias yields an id with no row and **leaks nothing**. The orphan is a
correctness defect, not an exposure.

### 2.2 Project

| Effect | Table / column | Mechanism | Evidence |
| --- | --- | --- | --- |
| **Rows deleted by cascade** | `person_projects`, `task_projects` | `CASCADE` | probe: cascaded away = true |
| **Foreign keys nulled** | `memories.project_id` | `SET NULL` | probe: memory survives, column null |
| **Deletions blocked** | none | — | probe: `rows=1` |
| **Rows left ORPHANED** | `entry_entities`, `entity_aliases`, `entity_attachments`, `entity_tags`, `audit_logs`, `product_events` — all with `'project'` | **no FK** | probe |
| **Rows preserved, link severed** | `memories` | the row survives; only `project_id` is nulled | probe |
| **Rows preserved, untouched** | `tasks`, `people`, `attachments`, `organizations` | never referenced by the delete | probe |

Same shape as person, one hop smaller. `organizations` is untouched: `projects`
references it, not the reverse.

### 2.3 Memory

| Effect | Table / column | Mechanism | Evidence |
| --- | --- | --- | --- |
| **Rows deleted by cascade** | **none** | — | `pg_constraint`: **no FK anywhere references `memories`** |
| **Foreign keys nulled** | none | — | same |
| **Deletions blocked** | none | — | probe: row count 1 → 0 |
| **Rows left ORPHANED** | `audit_logs` rows written by `updateMemory` / `setMemoryLifecycle` | no FK — append-only by design | column scan |
| | `entity_tags` *could* hold `entity_type='memory'` — the column has **no CHECK** — but the table has **zero rows and no writer in `src/`** | — | `pg_constraint`, grep |
| **Rows preserved** | everything else | — | probe |

`entity_aliases`, `entity_attachments` and `entry_entities` **cannot** reference
a memory: their `entity_type` CHECKs do not admit the value. Read from
`pg_constraint`, not inferred.

## 3. Effects on the surfaces and on retrieval

| Question | Answer | Evidence |
| --- | --- | --- |
| **Retrieval — memory** | Removed in the same statement. `match_internal_knowledge` reads `public.memories` directly; no row, no candidate. `2N-CORRECT-011` satisfied **by construction**, not by a second step. | `202608130093` |
| **Retrieval — person / project** | Neither participates in `match_internal_knowledge`, which unions **entries and memories only**. They participate in **lexical** search, which reads `people`/`projects` directly — so removal is likewise same-statement. | `search/contracts.ts:134-181` |
| **Persisted citations** | **Already correct, and it anticipates deletion.** Since 2K.4 a citation persists a **structured reference only** — the 220-char excerpt was removed, and `parseCitations` drops the legacy shape "on the floor". `resolveOne` returns `unavailableCard` for a reference that does not resolve, **the same shape** it uses for an archived memory and for a failed read: *"it must not distinguish 'gone' from 'unreadable'."* | `conversation-sources/contracts.ts:7-28`, `resolve-sources.ts:125-127,170-177` |
| **Historical sources** | No source content is retained in a message. Deleting a memory therefore removes it from history's *content*, leaving only an unresolvable reference rendered as unavailable. | same |
| **Tasks** | Survive. A `waiting` task loses `waiting_on_person_id`; **no CHECK requires a `waiting` task to name a person**, so the state is representable — and silently changes what the task means. It must appear in the preview. | `pg_constraint` on `tasks` |
| **Files** | `attachments` rows and storage objects are **not** touched. Only the `entity_attachments` link is removed. The file stays in the library — retention the preview must state. | `pg_constraint` |
| **Aliases / tags** | Orphan unless M3 removes them. §2.1. | probe |
| **Relations / contexts / project associations** | Cascade away, carrying `role`, `relationship_type`, `description`, `confidence`, `valid_from`, `valid_until`. | probe |
| **Audit trail** | Retained. Append-only, `authenticated` holds `INSERT`/`SELECT` and **no `DELETE`**. Correct, and it is retention to disclose. | grants |
| **Undo operations** | `undo_operations.entity_ids` may name a deleted id in a *historical* record. No live undo is invalidated by these deletions: task undos target tasks, which survive. | column scan |
| **Timelines** | `entry_entities` is what draws them; orphans keep drawing a dead entity until M3 removes them. | consumers above |
| **Person page** | 404 after deletion. Its alias, entry-mention and association panels vanish with it. | page reads |
| **Project page** | Same. | page reads |
| **Memory page** | Same; the memory list loses the row. | page reads |
| **Immediately gone for the user** | The entity's page, its row in every list and in search, its relations, its associations, its roles, its nickname resolution, and — for a memory — its participation in answers. | above |
| **May remain visible** | The audit trail entry recording the deletion; a past chat answer's citation slot, rendered as unavailable; the file that was linked; the task that was waiting, now waiting on nobody. | above |

## 4. Authority, read from grants — and why M3 must be `SECURITY DEFINER`

| Table | `authenticated` holds | Consequence |
| --- | --- | --- |
| `people`, `projects`, `memories`, `entity_aliases`, `entity_tags` | `SELECT, INSERT, UPDATE, DELETE` | a client-side multi-delete is **possible** — which is what makes `2N-CORRECT-009` a live rule rather than an academic one |
| `entry_entities`, `entity_attachments` | `SELECT` only — **no `DELETE`, no `INSERT`** | a client sequence **cannot** clean them, so it would *necessarily* produce partial deletion |
| `undo_operations` | `SELECT` only | the compensation cannot be recorded from the client |
| `audit_logs` | `INSERT`, `SELECT` — no `DELETE` | the trail cannot be rewritten |

Two conclusions follow, and neither is a preference:

1. **A client-side deletion is not merely forbidden, it is impossible to do
   correctly.** `2N-CORRECT-009`'s rationale is now proved from grants.
2. **M3 must be `SECURITY DEFINER`**, because a `SECURITY INVOKER` path would
   delete **zero** `entry_entities` rows and **raise nothing** — RLS filters a
   `DELETE` silently. The most dangerous available failure is the quiet one.

The same is true of the undo: restoring `entry_entities` needs `INSERT`, which
`authenticated` does not hold. **`public.undo_operation` is already
`SECURITY DEFINER` with `search_path=""`** and dispatches to private handlers, so
the compensation needs **no new authority** — it reuses the authority that ships.

## 5. Can the undo be registered inside M3? — yes, and this is measured

`private.undo_operation_handlers` is a **table** (`action_type` primary key →
`handler_function`), created by `202607250052`, with a trigger refusing any write
to `public.undo_operations` whose `action_type` has no registered handler.
Twelve handlers are registered today; none is for a person, project or memory.

Registering one is **one function plus one `insert`** — not a schema change.
It therefore fits **inside M3's own file** without becoming a second migration's
worth of responsibility. The question §6 left open is answered: **it fits.**

`memories/undo.ts:23-25` records that registering a handler "*would* cost a
migration and is out under OD-2K-C." That was Phase 2K's budget, not a
prohibition. **`OD-2N-11` B is a later signature that funds exactly this**, so
the standing decision is superseded by authorization rather than by drift.

## 6. The undo truth contract — **proved by execution, not argued**

The contract says an undo is true only if it restores identity, content,
necessary relations, enumerated associations, validity state, recoverability,
observable behaviour and owner isolation — and that recreating an entity under a
new id, or restoring text without its relations, is **not** an undo.

So the claim was not reasoned about. A probe planted a fully populated person —
two relationships in both directions with types, descriptions and confidences; a
project association with a `role`; a context; a task assignment with a `role`; a
task `waiting` on them; a memory carrying a real 1536-dimension embedding; an
alias; an entry mention — then **snapshotted with `to_jsonb`, deleted the way M3
would (polymorphic rows explicitly, then the parent), restored with
`jsonb_populate_recordset` under the same ids, and compared the two snapshots**.

```
people                   restored_identical = true
person_relationships     restored_identical = true      (both directions, roles, confidences)
person_projects          restored_identical = true      (role preserved)
person_contexts          restored_identical = true
task_people              restored_identical = true      (role preserved)
entity_aliases           restored_identical = true      (normalized_alias recomputed to the same value)
entry_entities           restored_identical = true
tasks_waiting            restored_identical = true
memories_person          restored_identical = true      (full row, embedding included)
```

Repeated for the other two types:

```
[PROJECT] projects / person_projects / task_projects /
          entity_aliases / entry_entities / memories_project      all restored_identical = true
[MEMORY]  rows after delete = 0
[MEMORY]  full row restored_identical (incl. embedding) = true
```

Two secondary results carry the weight:

- **The embedding survives a `jsonb` round trip exactly.** Tested independently
  through both `to_jsonb(value::text)` and `to_jsonb(row(...))`: text identical,
  **cosine distance 0**. So a restored memory has the *same* retrieval
  behaviour, and **no provider call is needed to rebuild it**. This was the
  single largest technical risk to a true undo and it is closed by measurement.
- **`entity_aliases.normalized_alias` is recomputed by the
  `entity_aliases_prepare` trigger on re-insert and lands on the same value** —
  determinism proved rather than assumed.

There are **no identity or serial columns** on any affected table; every key is
a client-settable `uuid`. **Restoration preserves identity; it does not mint a
substitute.**

### 6.1 What is restored, per type

| | Person | Project | Memory |
| --- | --- | --- | --- |
| identity (same id) | ✅ | ✅ | ✅ |
| content / attributes | ✅ | ✅ | ✅ |
| necessary relations | ✅ both directions | ✅ | n/a |
| enumerated associations, with roles | ✅ | ✅ | n/a |
| validity state | ✅ (`valid_from`/`valid_until` on relations) | ✅ | ✅ |
| recoverability (retrieval) | ✅ | ✅ | ✅ embedding restored bit-identical |
| observable behaviour | ✅ page, lists, search, nickname resolution | ✅ | ✅ page, list, citations resolve again |
| owner isolation | ✅ every statement owner-predicated | ✅ | ✅ |

### 6.2 What is **not** restored, and must be said out loud

None of these can be "restored" because none of them *should* be — but a product
that stays silent about them would be claiming more than it does.

1. **The audit rows recording the deletion remain.** Append-only, and
   `2N-CORRECT-006` requires them. The undo writes its own row; the trail then
   reads *deleted, then restored*, which is the truth.
2. **`product_events` telemetry rows remain.** Append-only and content-free.
3. **The undo window is 24 hours** (`undo_operations.expires_at` default
   `now() + 24:00:00`, swept by `prune_undo_operations`). After it, the deletion
   is permanent. This is a limit to state before the user confirms, not after.
4. **The snapshot is retained for that window.** The deleted content lives in
   `undo_operations.before_state` until the undo expires or is consumed. Under
   `2N-CORRECT-012` this is **retention and must be named as retention in the
   preview** — a user deleting a sensitive memory is entitled to know the text
   survives for a day so the undo can exist. `undo_operations` is owner-scoped
   with `SELECT`-only for `authenticated`.
5. **A linked file is not deleted** — only its link. Retention, to be stated.
6. **The undo can fail if the world moved.** If the owner deletes a task during
   the window, restoring its `task_people` row cannot succeed. The correct
   behaviour is to fail **whole** and say so — never to restore a subset. The
   preview may promise an undo; it may not promise the world will hold still.

One adjacent risk was raised and **closed by reading the trigger rather than its
name**: `entity_attachments` carries an `AFTER INSERT` quota trigger, so a
restore could in principle be refused by a ceiling. It cannot —
`private.enforce_entry_attachment_quota` filters `inserted.entity_type = 'entry'`,
and the rows M3 restores are `'person'` and `'project'`. The quota is never
consulted for them.

## 7. Risks

### 7.1 Isolation risks

| Risk | Status |
| --- | --- |
| Deletion reaching a foreign row | Every table is `FORCE`d RLS and owner-predicated; M3 runs `SECURITY DEFINER`, so **RLS is bypassed and owner scope becomes M3's own obligation** — an explicit `user_id = auth.uid()` predicate on **every** statement, asserted by pgTAP, not by inspection. This is the sharpest risk M3 carries. |
| Undo consuming another owner's reservation | `undo_operation` already resolves by `(auth.uid(), p_undo_id)`; handlers additionally refuse an `action_type` they do not own. Reused, not re-invented. |
| Confirmation usable by another owner | Must be resolved by `(auth.uid(), operation_key)` exactly as `apply_task_command` does; a caller-supplied digest is **not** evidence — `202607250057:49-53` established this and it holds here. |

### 7.2 Existence risks

| Risk | Status |
| --- | --- |
| Preview revealing a foreign entity | **Absent, foreign and unreadable must be one answer.** RLS makes a foreign row unreadable; the preview must therefore return the *same* outcome for all three, and must not distinguish "no such person" from "not yours". This is the same defect class the initial re-audit found live on the memory page. |
| Error messages leaking | No message may name a subject or carry content; telemetry may carry no content. |
| Citations revealing a deleted memory | **Already closed** by `resolveOne` — `unavailableCard` is shared with the archived and unreadable cases. §3. |

## 8. Requirements affected

| Id | Effect of this re-audit |
| --- | --- |
| `2N-CORRECT-004` | The enumerated set is **larger than §6.3's list**: it adds `entity_tags`, and it adds the fact that **no cascade covers any of the four polymorphic tables**. §6.3's phrase "safe deletion spans …" is right about *which* tables and wrong about *how* they are reached. |
| `2N-CORRECT-005` | Satisfiable: a real undo is proved for all three types. The confirmation needs a store — §9. |
| `2N-CORRECT-006` | Satisfiable with the existing `audit_logs` contract. |
| `2N-CORRECT-007` | Satisfiable: the snapshot is keyed by recorded ids, never by re-resolved names. |
| `2N-CORRECT-009` | **Rationale upgraded from rule to proof** — a client sequence cannot clean `entry_entities`/`entity_attachments` at all. |
| `2N-CORRECT-010` | Satisfiable: every number in the preview is countable in SQL; **no estimate is needed**. |
| `2N-CORRECT-011` | Satisfied **by construction** for all three types. §3. |
| `2N-CORRECT-012` | Requires the preview to name four retentions: audit trail, telemetry, linked files, and the 24-hour undo snapshot. |
| `2N-CORRECT-013` | **Answered: no propagation was found that cannot be truthfully undone.** §6. |
| `2N-SEC-005` | **Engaged** — §9. Satisfied by one clause. |
| `2N-KNOWS-002` / `2N-CORRECT-002` | The archive-vs-delete guard stops being free once deletion ships: it must then also refuse deletion copy that reads as archival and archival copy that reads as removal. |

## 9. The one finding that deviates from a signed plan line

`§6.3` states: *"**Affects.** One new function. **No new table**, so
`2N-SEC-005`'s cascade requirement is not engaged."*

**That prediction is wrong, and the re-audit's job is to say so.**

A server-issued, single-use confirmation bound to a fingerprint **is a row**.
The only such store that exists is `task_command_confirmations`, and it is
structurally welded to tasks:

```
task_command_confirmations_task_owner_fk    FOREIGN KEY (user_id, task_id) REFERENCES tasks(user_id, id) ON DELETE CASCADE
task_command_confirmations_action_check     CHECK (action = ANY (ARRAY['cancel_task','create_task']))
task_command_confirmations_subject_check    CHECK ((action='cancel_task' AND task_id IS NOT NULL) OR (action='create_task' AND task_id IS NULL))
```

Reusing it would mean adding a subject column, rewriting two CHECKs and widening
a **closed** Phase 2E vocabulary that `taxonomy.ts:188` and `copy.ts` assert
against — putting deletion into the task-command taxonomy and breaking the tests
that keep that vocabulary closed. That is strictly worse than one new table.

Dropping the confirmation row instead — binding only a fingerprint the caller
returns — was considered and **refused**: the fingerprint helper is granted to
`authenticated` and derivable from values the caller already holds, which is
exactly why `202607260059` rejected a caller-supplied digest, and single-use
cannot be enforced without state.

**So M3 creates one table.** Assessment:

- It does **not** change a signed decision. `OD-2N-11` **B** requires "explicit
  confirmation" and does not specify storage; it gets precisely what it signed.
- It does **not** require a fourth migration. The table fits inside M3.
- It **engages `2N-SEC-005`**, which costs one clause:
  `user_id uuid not null references auth.users(id) on delete cascade`.
- §6.3 sits under *"Proof that the signed decisions need no further migration."*
  That proof still holds — no fourth migration is hidden. Only the
  implementation shape §6.3 predicted was inaccurate.

**Recorded prominently so the owner may overrule it.** If the owner prefers M3
to create no table, the honest consequence is that deletion ships **without** a
single-use server-issued confirmation, which contradicts the stated M3 minimum
contract — so the recommendation is to accept the table.

## 10. Stop conditions — checked, one by one

| Stop condition | Found? |
| --- | --- |
| A propagation that cannot be truthfully undone | **NO** — §6, proved by execution for all three types |
| A fourth migration needed | **NO** — everything fits in M3 |
| An additional migration needed for undo | **NO** — the handler registry is a table row; `undo_operation` already has the authority |
| Identity or relations unrestorable | **NO** — same uuids, all relations and roles restored byte-identically |
| Deletion able to reach foreign data | **NO**, and it becomes M3's own obligation once `SECURITY DEFINER` bypasses RLS — carried as the sharpest risk, with pgTAP owed |
| Existence oracle | **NO** in the shipped citation path; **a design obligation** for the preview |
| `source_type` widening needed | **NO** |
| Backfill needed | **NO** |
| Merge or split needed | **NO** |
| Material change to a signed decision | **NO** — §9 corrects a plan *prediction*, not a signature |
| Unplanned change to RLS, grants or authority | **NO** new grant and **no** policy change; M3 uses `SECURITY DEFINER` with an explicit owner predicate, the shape `202607260059` already uses |
| Consequences not enumerable | **NO** — live references are exhaustively enumerable from FKs plus the polymorphic pair; historical records are deliberately retained, which is disclosure, not an unknown |
| Provider spend | **NO** — the embedding is restored from the snapshot, never regenerated |
| Physical-hardware dependency | **NO** |
| Material baseline divergence | **NO** — §0 |

## 11. What M3 must do, as this audit establishes it

1. **`SECURITY DEFINER`**, `search_path = ''`, fully qualified references,
   explicit `auth.uid()` authentication, an explicit owner predicate on every
   statement, least-privilege grants with explicit `revoke`.
2. **Delete the four polymorphic link sets explicitly** — `entry_entities`,
   `entity_aliases`, `entity_attachments`, `entity_tags` — for the subject.
   The cascade does not reach them and a `SECURITY INVOKER` path would remove
   zero of two of them **without raising**.
3. **Snapshot before deleting**, with `to_jsonb`, every row it destroys or nulls,
   into `undo_operations.before_state`; restore with `jsonb_populate_recordset`
   under the **same ids**.
4. **Register one handler per type** in `private.undo_operation_handlers`, each
   refusing an `action_type` it does not own.
5. **One new confirmation table**, owner-scoped, single-use, fingerprint-bound,
   `on delete cascade` from `auth.users`, consumed by a guarded `UPDATE` **inside
   the same transaction** so a failed apply does not burn it.
6. **Count, never estimate**, in the preview; return one indistinguishable
   outcome for absent, foreign and unreadable subjects.
7. **Name the four retentions** — audit trail, telemetry, linked files, and the
   24-hour snapshot — and call them retention, not removal.
8. **Say that a `waiting` task will be left waiting on nobody**, because the
   schema permits it and the meaning changes silently.

## 12. Conclusion

Every propagation was enumerated from the catalogue and the consumers, and every
one of them was measured. For each of person, project and memory, the full set
of destroyed and nulled rows was snapshotted, destroyed and restored **byte for
byte, under the same identities, with relations, roles, validity windows and the
retrieval embedding intact**, with no provider call. The remaining
irreversibilities — the audit trail, the telemetry, the retained file, and the
24-hour window — are things that *should* persist, and the contract's answer to
them is disclosure before confirmation, which `2N-CORRECT-012` already requires.

One deviation is recorded and not smoothed: M3 needs a confirmation table that
§6.3 predicted it would not need. It changes no signature, needs no fourth
migration, and satisfies `2N-SEC-005` with one clause.

**M3 AUTORIZÁVEL DENTRO DO CONTRATO EXISTENTE**

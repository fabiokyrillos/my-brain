# Phase 2N — closing report

**People, projects, memory, files and relations.** Authorized for planning by
ADR-108, its seventeen decisions signed by ADR-109, amended by ADR-110,
authorized through closeout by ADR-112, and extended once by ADR-113.

| Fact | Value |
| --- | --- |
| Requirements | **127 declared · 127 classified · 0 unclassified** |
| Classification | **93 built · 20 baseline · 3 partial · 11 not-built-by-rule · 0 undelivered** |
| Migrations | **`3 allocated · 2 spent`** — M1 `202608130093`, M3 `202608140094`, **M2 UNSPENT** |
| Parity | **94 local = 94 hosted, `202608140094`**, read live |
| Slices | 2N.0 → 2N.7, eight. **The seven before this one are merged with CI green on their exact merge SHAs**; 2N.7 is this change, and its own merge SHA is verified at the close rather than claimed here |

The matrix is `PHASE_2N_TRACEABILITY_MATRIX.md`, **generated** by
`scripts/generate-phase-2n-traceability.mjs` and re-checked in CI. It reads the
PRD for what was declared and the eight acceptance records for what was
evidenced, and **writes nothing at all** when the two disagree.

---

## 1. What the phase changed for the person using the product

Before it, the Brain could hold a great deal about a person and could not
**account** for any of it. After it:

- **Every claim says where it came from.** A memory, a task, a relation and a
  file each state whether the owner recorded it or the product derived it, and
  from what — and where nothing can be substantiated, they say that instead of
  guessing.
- **Sensitive content is withheld consistently.** Six governed surfaces obey one
  contract; the mask travels with the content rather than being remembered by
  each page.
- **The product can forget.** A person, a project or a memory can be removed —
  transactionally, with a preview that enumerates the consequences, an explicit
  confirmation, and an undo proved to restore the same rows under the same ids.
- **Two facts that cannot both be right are said to be in conflict** instead of
  one being quietly relabelled.
- **Files show what they are linked to**, in both directions, and say plainly
  that nothing here can create a new link yet.
- **Relations have a surface**, with a complete list first and a drawing that
  shows only the part whose origin can be substantiated.

## 2. What it refused to build, and why that is the phase's best work

Four times the honest answer was *no*, and each refusal is recorded with its
reason rather than as an omission.

- **Entity merge** (`OD-2N-3` A). Declining it also declined duplicate
  surfacing, because surfacing a duplicate with no way to resolve it puts an
  item in front of the owner with no available action.
- **Persisted inferred relations** (`OD-2N-8` A) — and this one did not hold,
  which §4 covers.
- **A decorative graph.** `2N-RELATION-011` is a refusal clause, and slice 2N.6
  used it: the drawing shows edges it can explain and **lists the rest without
  drawing them**, saying so on the page.
- **Telemetry.** M2 closes **unspent**. Six candidate events were derived from
  the phase's own stated purpose, steelmanned, and refused — because a better
  instrument already existed, or the answer changed no pending decision, or
  recording it would have contradicted a signed privacy decision.
  `PHASE_2N_SLICE_7_M2_VERDICT.md` is the measurement.

## 3. The defects the phase found in itself

Each was found by something **checking**, not by re-reading, and each is in the
record with what it cost.

| Found by | Defect |
| --- | --- |
| A census that looked one step to the side | On a `highly_sensitive` file the product withheld the name, description and document text — then printed the **people extracted from inside the document** and task titles often lifted verbatim from it |
| A browser | A successful deletion called `revalidatePath` on the page the dialog sat on, **destroying the component about to offer the undo** |
| A browser | Two shipped surfaces had never actually rendered; the RSC boundary is only real in a production build |
| An `axe` scan of the real page | A new background tint pushed an **inherited** text colour from 4.62:1 to 4.30:1. `--muted` is referenced across this codebase and **defined nowhere** |
| A mutation control | The traceability generator's *"every partial names a destination"* check accepted the row's **own id** as the destination — so it passed for any partial that existed. Three rows had been passing vacuously |
| Reading the schema instead of the plan | `person_relationships.related_person_id` is always `null`, so **there is no person-to-person edge in this product** |

## 4. Two signed premises that are false in the tree

The phase's most uncomfortable findings, both surfaced rather than smoothed, and
both carrying a remainder that needs a migration and an owner decision.

**`OD-2N-8` A said no inferred relation is persisted.** The trigger
`link_interpreted_entities` still writes a co-mention into `person_projects` and
`person_contexts` on **every interpretation**. The threat model states that this
signature — not the graph's design — is what makes the graph acceptable. Slice
2N.6 stopped the product **claiming** those links were owner-authored and
refuses to **draw** them; it cannot stop them being written.
**T-3 is live.** Remainder **`2N-RELATION-TRIGGER`**.

**`2N-IDENTITY-008` said no inference may create a persisted identity.**
`persist_interpretation` inserts `people`, `projects`, `contexts` and
`organizations` rows from the model's extracted names **with no user act**.
Nothing in Phase 2N created that path and nothing in Phase 2N could close it
without a migration. Remainder **`2N-IDENTITY-EXTRACTION`**.

**Neither is transferable into M2**, which is telemetry's allocation and closes
unspent regardless.

## 5. The three partials, each with a remainder and a destination

| Requirement | Remainder | Destination |
| --- | --- | --- |
| `2N-FILES-008` | `entity_attachments` has a reader and **no writer**; `authenticated` holds `SELECT` only | **`2N-FILES-WRITER`** — restore `INSERT` or add a definer RPC: new authority, an owner decision |
| `2N-RELATION-003` | The co-mention trigger still persists inference | **`2N-RELATION-TRIGGER`** — a migration, an owner decision, a stop condition |
| `2N-IDENTITY-008` | Extraction creates identities with no user act | **`2N-IDENTITY-EXTRACTION`** — a migration, an owner decision, a stop condition |

## 6. Threats

All twenty-three dispositioned in `PHASE_2N_SLICE_7_ACCEPTANCE.md` §2. **Two
remain live**: **T-3** (above) and **T-19**, retention sweeps still unscheduled —
inherited, a rollout-gate residual, and **no Phase 2N migration schedules one**,
which M3 enforces by refusing to deploy if a sweep exists.

## 7. Restated exactly as inherited, and approved by nothing here

- **Push** is implemented and hosted, **failing on a real iPhone with HTTP 403**,
  cause unproven, and **NEVER VALIDATED ON ANDROID**.
- **ADR-055** is **neither satisfied nor superseded** and expires
  **2026-10-27**.
- **Signup is closed** (`enable_signup = false`); the rollout gate stands at
  **25 pass · 3 fail · 2 owner-signature**.
- **No screen-reader run has been executed** and none is claimed. Open residual
  beside `2L-ACCESS-008`.
- **`2N-MOBILE`** — `online-memories.spec.ts:85`, a 21px touch target against a
  44px minimum, reproduced unchanged in every slice since 2N.3.

## 8. The successor

**Re-audited and NOT started.** No successor requirement, governing artifact or
scope exists anywhere in the repository, the phase-start guard **A13 is not
retargeted**, and starting one needs its own owner authorization.

---

**Phase 2N is COMPLETE.** 127 of 127 classified from source, two of three
allocations spent, the third closed unspent by measurement rather than by
oversight — which `2N-CLOSE-003` records as a correct outcome, and an unnecessary
spend as a defect.

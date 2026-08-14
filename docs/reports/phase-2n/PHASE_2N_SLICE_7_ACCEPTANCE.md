# Phase 2N slice 2N.7 — acceptance

**Telemetry, security, accessibility and closeout. M2 closes UNSPENT.**

| Fact | Value |
| --- | --- |
| Migrations | **ZERO created by this slice.** 94 local = 94 hosted, parity **`202608140094`** |
| Budget | `3 allocated · 2 spent (M1, M3)` · **M2 UNSPENT by measurement**, see `PHASE_2N_SLICE_7_M2_VERDICT.md` |
| New authority | **none** — zero RPCs, grants, indexes, policies, writers, jobs, workers, dependencies |
| Requirements | **35 classified here**, closing the phase's declared 127 |

---

## 1. M2 closes unspent, and the measurement is a document

`2N-METRICS-002` makes M2 conditional and the plan states the standard in terms:
*"an unspent allocation is not a defect; a migration created to use one up fails
the close."*

`PHASE_2N_SLICE_7_M2_VERDICT.md` is the measurement. Six candidates derived from
the phase's own stated purpose, each steelmanned and each refused for a named
reason in one of three classes: **a better instrument already exists and is the
authority** (`audit_logs`, `undo_operations`, or a direct owner-scoped query);
**the answer changes no pending decision**; or **recording it would contradict a
signed privacy decision**.

Two facts from the census are worth carrying: **all 39 declared event names have
producers** once the census reads `supabase/functions/` as well as `src/` — three
live only in the Deno worker — and **no funnel reader has ever read a real event
belonging to a real owner**, which Phase 2M's own acceptance records in its §5.

## 2. `2N-SEC-001` — every threat dispositioned

All twenty-three, each **mitigated with named evidence** or **accepted in writing
with a reason**. Nothing is left silent, and the two that are still live are said
plainly.

| Threat | Disposition |
| --- | --- |
| T-1 merge | **Refused by signature** — `OD-2N-3` A. Nothing of merge is built; `2N-IDENTITY-005…007` close `not-built-by-rule` |
| T-2 enumeration | **Mitigated** — every contextual page `notFound()`s on a foreign id; 2N.6's projection makes removed, foreign and unreadable one arm by construction |
| T-3 unsourced relation | **LIVE, and accepted in writing.** `link_interpreted_entities` still persists co-mention. 2N.6 stopped the product *claiming* those links are owner-authored and refuses to *draw* them; closing the persistence is a migration and a stop condition. Remainder **`2N-RELATION-TRIGGER`** |
| T-4 sourceless memory | **Mitigated** — `deriveClaimProvenance`; a `null` `source_entry_id` never renders as owner-authored |
| T-5 removed but retrieved | **Mitigated by M1** — validity-aware retrieval, `202608130093` |
| T-6 partial deletion | **Mitigated by M3** — one transactional definer path, `202608140094`; nine row sets proved byte-identical across delete/restore |
| T-7 orphaned file | **Accepted** — the storage-orphan scanner reads zero and is inherited from Signup Hardening; unchanged by this phase |
| T-8 sensitive file exposed | **Mitigated** — 2N.5's census found the live leak in the derived tag cloud and closed it |
| T-9 silent resolution | **Mitigated** — 2N.4 surfaces the inverted validity window instead of calling it archived |
| T-10 unauthorized correction | **Mitigated** — every mutation reuses an existing audited Server Action; the relations surface owns no writer at all |
| T-11 graph oracle | **Mitigated by refusal** — 2N.6 draws only edges whose origin it can substantiate, and says so where it does not |
| T-12 count oracle | **Mitigated** — `visibleCount` over everything; masked in place, never dropped |
| T-13 search leak | **Mitigated** — ADR-110 narrowed the `people` domain to drop `notes`; ADR-093's default exclusion untouched |
| T-14 timezone | **Mitigated** — ADR-111's initiative repaired 31 occurrences; the tree-wide guard's `OPEN_OCCURRENCES` is **empty** and 453 assertions pass |
| T-15 stale read | **Mitigated** — classification and validity are re-read at render time, never cached beside content |
| T-16 TOCTOU | **Mitigated by M3** — a server-issued, single-use, fingerprint-bound confirmation; facts moved after issuance answer `55P03` **without burning it** |
| T-17 wrong undo | **Mitigated** — the undo handler registry keys by operation id; 2N.3 proved restore under the same ids |
| T-18 telemetry content | **Closed by refusal** — no 2N event is declared, so there is no payload to leak. §1 |
| T-19 retention | **Accepted, inherited** — sweeps remain unscheduled; a rollout-gate residual, not a 2N one, and no 2N migration schedules one |
| T-20 account deletion | **Mitigated** — M3's one new table carries `on delete cascade` from `auth.users` |
| T-21 push dependency | **Mitigated by rule** — `OD-2N-16` A; no 2N requirement depends on push or on hardware |
| T-22 undo claiming too much | **Mitigated** — 2N.3's re-audit answered its own stop condition by executing it rather than arguing it |
| T-23 unclassifiable free text | **Mitigated** — ADR-110 for `people.notes`; 2N.6 extended the same posture to `person_relationships.description`, which was printing in the clear one section below it |

**Two remain live and both are named, not smoothed**: T-3, whose remainder is a
migration and an owner decision, and T-19, which is inherited and belongs to the
rollout gate.

## 3. Classification

Thirty-five requirements, closing the phase's declared 127. The rest were
classified by the slices that delivered them and are read from those records by
the generator.

### `2N-METRICS` — the allocation closes unspent

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2N-METRICS-001` | **not-built-by-rule** | `OD-2N-15` A's own conditional: no candidate survives `2N-METRICS-003`. See the M2 verdict |
| `2N-METRICS-002` | **not-built-by-rule** | M2 unspent by the conditional the requirement itself carries; `2N-CLOSE-003` records that as correct |
| `2N-METRICS-003` | **not-built-by-rule** | Applied to six candidates, and it is what refused all six; `OD-2N-15` A |
| `2N-METRICS-004` | **not-built-by-rule** | No event is declared, so there is no payload to keep content-free; `OD-2N-15` A |
| `2N-METRICS-005` | **not-built-by-rule** | The rule that refused C1 and C3; no producer with no reader was created. `OD-2N-15` A |
| `2N-METRICS-006` | **baseline** | The three copies already move together, asserted tree-wide by `phase-2m-telemetry-guard.test.ts`; delivered by Phase 2M and not re-claimed here |
| `2N-METRICS-007` | **not-built-by-rule** | No hosted telemetry proof exists because no event does; `OD-2N-15` A |

### `2N-SEC`

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2N-SEC-001` | **built** | §2 — all twenty-three threats dispositioned, two named live |
| `2N-SEC-004` | **built** | M3's confirmation is server-issued, single-use and fingerprint-bound; a preview authorizes nothing, proved hosted at `55P03` with the confirmation unburned |
| `2N-SEC-005` | **built** | `entity_deletion_confirmations`, the phase's only new table, carries `user_id … references auth.users (id) on delete cascade` |
| `2N-SEC-006` | **built** | No retention value is minted by either migration, and M3 **refuses to deploy** if a sweep was scheduled — a verification block, not a promise |

### `2N-ACCESS`, `2N-MOBILE`, `2N-TIME`

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2N-ACCESS-006` | **built** | A scan of the phase corpus finds **no claim** of screen-reader conformance, and the real run is carried as an open residual with a destination beside `2L-ACCESS-008` |
| `2N-MOBILE-004` | **built** | `2L-MOBILE-008` is re-stated as **open** here, not absorbed: it names Work surfaces this phase does not cover |
| `2N-TIME-002` | **baseline** | Restated `[BASELINE]` by ADR-112 Decision 3; the tree-wide guard covers Phase 2N's directories and its four families are at zero |
| `2N-TIME-004` | **baseline** | Restated by ADR-112 Decision 4; `HOST_ZONE_FORMATTERS_CARRIED_PAST_CLOSE` is retired and no exemption list was re-created |
| `2N-TIME-005` | **baseline** | Restated by ADR-112 Decision 5; the census is 31, delivered by ADR-111's initiative and not claimed by this phase |
| `2N-TIME-006` | **baseline** | Restated by ADR-112 Decision 6; the repair was not absorbed into `2N.0` |

### `2N-CLOSE`

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2N-CLOSE-001` | **built** | `scripts/generate-phase-2n-traceability.mjs` — reads four row shapes, refuses on any unclassified or doubly-classified id, writes nothing when it refuses |
| `2N-CLOSE-002` | **built** | The generator refuses a `partial` whose evidence names no destination; every partial in the matrix carries one |
| `2N-CLOSE-003` | **built** | §1 and the matrix header: `3 allocated · 2 spent`, each named to its exclusive destination, M2 unspent by measurement |
| `2N-CLOSE-004` | **built** | §5 restates push and Android exactly as inherited, and neither is treated as approved |
| `2N-CLOSE-005` | **built** | §5 restates ADR-055 as neither satisfied nor superseded, expiring 2026-10-27 |
| `2N-CLOSE-006` | **built** | The successor is re-audited and **not started**; no requirement declared, no governing artifact created, the phase-start guard not retargeted |

### Classification debts earlier slices never settled

Ten declared requirements reached no acceptance record. The closing slice is
where a phase settles that, and each is classified against what was actually
delivered rather than against what was intended.

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2N-PERSON-001` | **baseline** | The page already loaded by id under forced RLS with `notFound()` on a miss; every read the phase added preserves it, including 2N.6's projection |
| `2N-PERSON-002` | **baseline** | Identity, organization and the explainer render as before; the `notes` half was restated by ADR-110 and delivered by 2N.0's masking |
| `2N-PERSON-005` | **built** | Tasks on the person page derive through `task-derivation.ts`, the same rule the Work surface uses; `source_entry_id` travels with the title so the level can be derived at all |
| `2N-PERSON-007` | **built** | Every mutation offered reuses an existing audited Server Action; asserted by `egc-reachability.test.ts`, and 2N.6 added a surface that owns no writer at all |
| `2N-PERSON-008` | **built** | 2N.5's first reader of `entity_attachments` renders linked files on the page under the file classification contract; empty by construction, and the page says so |
| `2N-IDENTITY-006` | **not-built-by-rule** | Merge is not built — `OD-2N-3` A. No suggestion, no RPC, no relinking. Destination: a future identity phase |
| `2N-IDENTITY-007` | **not-built-by-rule** | Reversibility is decided in advance for a future phase — `OD-2N-4` A, conditional. Nothing of it is built here |
| `2N-IDENTITY-008` | **partial** | **The property does not hold and this close says so.** `persist_interpretation` inserts `people`, `projects`, `contexts` and `organizations` rows from the model's extracted names with **no user act** — inference creating a persisted identity, which is exactly what this forbids. Nothing in Phase 2N created that path and nothing in Phase 2N can close it without a migration. Remainder: gate entity creation behind a confirmation. **Destination `2N-IDENTITY-EXTRACTION`** — an owner decision and a stop condition, **not transferable into M2** |
| `2N-CORRECT-013` | **built** | 2N.3's re-audit answered its own stop condition by executing it: a fully populated person, project and memory were snapshotted, deleted, restored under the same ids and compared — nine row sets byte-identical, the embedding surviving at cosine distance 0 |
| `2N-PRIVACY-011` | **built** | 2N.0's acceptance §8 records it moving partial → built after the hosted journey executed the posture end to end in both locales on desktop and mobile |

### Adjudications

Two ids two records classify differently. The generator refuses rather than
picking, and the closing slice settles them — in both cases in favour of the
slice that **delivered** the property over the slice that **inherited** it.

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2N-KNOWS-007` | **built** | 2N.0 delivered it — classification read from the current row at render time, with `sensitivity` selected beside the content it governs. 2N.3 re-stated it as `baseline` because by then it was inherited; the delivering slice's class is the phase's class |
| `2N-KNOWS-009` | **built** | 2N.3 delivered the guard that no provider import reaches either memory surface. 2N.3-M1 re-stated it as `baseline` from the other side of the same migration; the delivering slice's class stands |

---

## 4. Gates

| Gate | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| Full unit suite | recorded in §6 |
| `npm run build` | clean |
| `git diff --check` | clean |
| Traceability generator | **127 declared · 127 classified · 0 unclassified** |
| Migrations | **94 local = 94 hosted**, parity `202608140094`, read live and read-only |

**No hosted journey is run for this slice and none is claimed.** It ships no
product code and no surface: its deliverables are a measurement, a generator, a
disposition and a record. The phase's surfaces were proved by their own slices,
and re-running them here would prove nothing this slice changed.

## 5. Restated exactly as inherited

- **Push and Android.** Implemented and hosted. **Failing on a real iPhone with
  HTTP 403**, cause unproven. **NEVER VALIDATED ON ANDROID.** Destination
  unchanged, and **neither is approved by this close**.
- **ADR-055** is **neither satisfied nor superseded**, and expires
  **2026-10-27**.
- **Signup is closed** (`enable_signup = false`) and the rollout gate stands at
  **25 pass · 3 fail · 2 owner-signature**, refusing to open.
- **No screen-reader run has been executed**, and none is claimed. Open residual
  beside `2L-ACCESS-008`.

## 6. Proofs

*(completed at the end of the slice — see the closing report)*

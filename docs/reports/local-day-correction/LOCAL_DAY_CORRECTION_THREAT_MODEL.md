# Local Day Correction — Threat Model

Proportional to the change: a render-boundary correction with **zero** database, auth, network or
schema surface. The threats worth stating are the ones this kind of work actually produces — a fix
that looks right and is not, a guard that stops guarding, and a correctness change that quietly
becomes a behaviour change.

| id | threat | why it is credible here | mitigation | state |
|---|---|---|---|---|
| **T-1** | A surface is repaired in appearance only, while the *filter* or *ordering* behind it still uses the wrong day | the defect is a rendering call, so the obvious fix is a rendering fix; `home-dashboard` is exactly the case where the label and the query are different code | `LDC-HOME-001` requires "today" to be **computed** in the owner's zone, and Unit 5 proves list and detail converge on the same day | closed in Unit 4/5 |
| **T-2** | An occurrence is closed by deleting it from the detector rather than from the code | the fastest way to a green guard | `OPEN_OCCURRENCES` asserts an **exact count in both directions**; the corpus is the whole tree, so removing a row makes the file fail the scan instead of passing | closed in Unit 1 |
| **T-3** | The guard degrades to vacuous — a pattern stops matching and every absence passes trivially | this has happened in this repository before (`2K-METRICS-007`) | mutation controls per family, plus a real planted defect proved to fail by name and line, and a real repair proved to fail the liveness assertion | closed in Unit 1 |
| **T-4** | The exemption list outlives the defect and silently keeps a repaired file exempt | the failure mode `2M-TIME-007` was written to avoid | every row must **still** hold its exact count; a repaired file fails until its row is deleted | closed in Unit 1 |
| **T-5** | Threading a zone into a Server Component adds a round trip per row, or an N+1 | seventeen call sites, several inside `.map()` | the zone is resolved **once per request** and passed down; bound formatters (`instantFormatter`) are constructed once per surface, never per row | Units 2–4 |
| **T-6** | The narrowed zone validation changes behaviour for a stored value | the resolver is stricter than the three copies it replaces (rejects bare `EST`) | `profileSchema.ianaTimezone` already requires `"/"` or `"UTC"`, so the product cannot store one; `owner-timezone.test.ts` asserts the read and write rules against each other | closed in Unit 1 |
| **T-7** | A wall date is "corrected" into an instant | `planned_at` is a day the user chose; converting it would move it | `parseLocalDate`/`formatLocalDate` operate on `LocalDate`, never on `Date`; OD-2M-3 A is untouched and no row in the audit is a wall date | closed by scope |
| **T-8** | Sensitivity, masking or provenance regresses while editing a contextual page | Units 3 touches the pages ADR-110 just governed | `LDC-CONTEXT-002` requires those properties byte-identical; existing sensitivity guards run unchanged in every gate | Unit 3 |
| **T-9** | The fix is proved only on a host that is already in the owner's zone | the developer machine is `America/Sao_Paulo`, which is the default — a wrong zone and the right zone agree there all day | production proof uses **two zones that are on different calendar days at the same instant**, plus a DST case in each hemisphere | Unit 5 |
| **T-10** | A concurrent `main` edits the same call sites | Phase 2N planning merged the day before | each unit re-audits against current `main` before editing; a divergence is a stop condition | per unit |
| **T-11** | The initiative drifts into Phase 2N implementation | it touches exactly the pages 2N will rebuild | the PRD forbids it, no 2N requirement is created or satisfied, and slice 2N.0 is re-audited but **not** implemented | per unit |
| **T-12** | A "correctness" change alters a domain's meaning without saying so | `generateReview` will start covering a different period than it did yesterday | stated explicitly in the report as a **behaviour change that is the point**: the period becomes the owner's day; no stored summary is rewritten or reprocessed | Unit 4 |

## Non-threats, stated so they are not re-derived

- **No new data is read.** Every surface repaired here either already loads `profiles.timezone` or
  adds it to a query that is already authenticated and already owner-scoped by RLS.
- **No stored value changes.** The contract modules are pure presentation and pure computation;
  `instant-format.ts` has no writer, asserted by its own test.
- **No new trust boundary.** Nothing here parses untrusted input, calls a provider, sends a
  notification or writes to an append-only ledger.
- **Zero migrations.** Parity remains `202608120092` and 92 migrations; any need for one is a stop
  condition, not a decision.

# Phase 2O — slice 2O.8 acceptance record

**Readiness, telemetry, security and closeout.**

- **Requirements:** `2O-READY-001` … `-005`, `2O-METRICS-001` … `-005`,
  `2O-SEC-001` … `-005`, `2O-CLOSE-001` … `-004` (19 of 116; **116 delivered
  cumulatively**).
- **Baseline:** `main` = `origin/main` = `8859e40`, worktree clean, no open PR,
  CI green on all three job families at `d35fb2e` and `8859e40`, **97 local = 97
  hosted, parity `202608160097`**, rollout gate **25 pass · 3 fail · 2
  owner-signature** re-read by running it.
- **Migrations created: ZERO.** Both allocations close unspent, for two
  different reasons.

---

## 1. The re-audit, against the `main` slice 2O.7 produced

§86 recorded three findings and said to treat them as a starting point. **All
three reproduce**, and re-running them found a fourth that §86 did not have.

| Finding | Re-run result |
|---|---|
| The rollout gate is unchanged | **Reproduces.** Re-read by running `npm run rollout:verify`, not quoted: **25 pass · 3 fail · 2 owner-signature**, with `RG-QUO-3`, `RG-DEP-1`, `RG-DEP-3` failing and `RG-LEG-4`, `RG-DEP-4` unsigned. |
| `2O-METRICS` has no producer | **Reproduces, and the other conjunct fails too.** `grep` for `recordProductEvent` across `src/features/activation/` and `src/features/onboarding/` returns **zero**. And there is no consumer: `scripts/` holds funnel readers for 2F, 2J, 2K and 2M and **none for 2O**. |
| `product_events` has three copies of its vocabulary | **Reproduces as a risk and not as a divergence.** Read live from the deployed project: the check constraint carries **39** literals, the TypeScript contract declares **39**, and the sorted lists are **identical**. This phase widens nothing, so they stay identical. |

### The fourth: a requirement whose remainder closed and was never re-classified

`2O-PREF-002` was classified **`partial`** by slice 2O.3, because the consent
record had no surface anywhere in the product and reaching the policy *documents*
is not reaching the record of what you accepted and when.

**Slice 2O.5 built that surface and said so** — *"Ajustes now reaches the
account's own acceptance history and not only the legal documents"* — but its
classification table covers `2O-PRIVACY` and `2O-CONSENT`, so **the requirement
was never re-classified**. The last recorded class is 2O.3's `partial`.

**Verified in the tree rather than taken from the record**, because §86 exists
because a recorded finding was read instead of re-run: `ConsentSection` is
imported at `src/app/[locale]/app/settings/page.tsx:19` and **mounted at line
180**; `src/features/privacy/consent-record.ts` reads `policy_acceptances`; and
the component's own header states the closure it enables.

**This is the mirror of the failure this repository usually guards against.** The
standing risk is over-stating shipped UX — Phase 2I's audit did it three times.
Here the matrix would have **under-stated** it, carrying a remainder that closed
three slices ago. Both directions are wrong, and only a closeout that re-derives
from source catches the second.

---

## 2. What shipped

**Four documents, one generator, one guard. No product code.**

1. **`PHASE_2O_READINESS_DOSSIER.md`** — the rollout gate's real output,
   transcribed whole, with the five unsatisfied gates restated and their actors
   named.
2. **`PHASE_2O_SLICE_8_M1_VERDICT.md`** — the measurement that closes M1
   unspent: the five activation questions written down, the producer searched
   for and absent, the consumer searched for and absent.
3. **`PHASE_2O_SECURITY_DISPOSITION.md`** — the threat model executed against
   this tree, sixteen threats disposed, live risks and inherited residuals
   stated without softening.
4. **`PHASE_2O_TRACEABILITY_MATRIX.md`** — **generated**, carrying
   `Do not edit by hand`.
5. **`scripts/generate-phase-2o-traceability.mjs`** — the fail-closed generator,
   with `--check`.
6. **`src/lib/closeout/phase-2o-traceability.test.ts`** — the guard, with
   planted defects proving each refusal can fire.

And one correction: **ADR-120**, on `2O-NOTIFY-005`.

---

## 3. `2O-NOTIFY-005`, corrected rather than built

The requirement asked for an **important-reminder override** to be stated where
consent is given. Slice 2O.6 went looking for the third bound and found no
object; the owner has now decided that the product's rule is right and the
requirement was the artifact that was wrong.

**The rule, signed by ADR-120:** quiet hours always wins; the daily cap continues
to apply; **no type, priority or urgency passes either**; and the surface states
the absence explicitly.

**The product already does this**, and the copy is not new:

> *"Não existe exceção. Nenhum aviso — de nenhum tipo, com nenhuma urgência —
> passa por cima do período silencioso ou do máximo diário."*

`decideDelivery` in `governance.ts` confirms it in the other direction: the
refusal order runs consent → type → frequency → **quiet hours** → duplicate →
cooldown → daily cap, with **no exemption branch anywhere in it**.

**Nothing was built.** No override, no priority field, no exemption path, no
migration, no vocabulary change, no edit to the delivery engine. The PRD's
sentence changed and **the superseded text is quoted beneath it**; the identifier
is unchanged and **nothing was renumbered** — 116 declared before, 116 after.

**Slices 2O.6's and 2O.7's records are untouched.** A record states what was true
when it was written, and editing one to agree with a later decision destroys the
only evidence of what was believed at the time. This is ADR-119's pattern,
applied a second time.

---

## 4. The generator, and the four defects it found in itself

`2O-CLOSE-002` requires the matrix to be **generated, never typed**. The
generator reads the PRD for what was declared and the eight acceptance records
for what was evidenced, and refuses rather than writing a partial matrix.

**It found four defects, and every one was mine.** Three produced a
**refusal**, which is the generator working. The fourth produced a **plausible
wrong answer**, which is the one worth reading.

### 4.1 The row key is not the first identifier on the row

The first version scanned each line for a full identifier. Slice 2O.2's `-003`
row reads *"…so `2O-ACTIVATION-001`'s first fact is true from the moment the
account exists"* — so the scan keyed that row to `2O-ACTIVATION-001` and reported
a **conflict** with slice 2O.0: `built` against `partial`, over two records that
never disagreed about anything.

**An evidence cell routinely cites other requirements, and citing one is not
classifying it.** The key is now read **positionally** — the first cell of a
table row, or the text before the class in prose — so nothing further right can
rename the subject. The same fix made `2O-ONBOARD-003` resolve, which the scan
had been losing for the mirror-image reason.

### 4.2 A prose row was handed an empty evidence string

`evidenceWithoutSubject` sliced table cells unconditionally. A prose
classification has no cells, so the slice returned nothing — and **an empty
string names no destination**, so a prose `partial` would have failed a check it
never actually took. Slices 2O.0 and 2O.1 classify in prose and happen to contain
no `partial`, so the defect was latent: **it would have fired the first time a
prose record carried one.**

### 4.3 The separator character is inside one of the class names

`normalizeClass` stripped every dash before matching, so that a prose line
reading ``` `-001` — built ``` would resolve. That turned **`not-built-by-rule`**
into `not built by rule`, and all five telemetry requirements became
unclassifiable at once.

**A class name containing the character used to separate an id from its class is
a real collision, and the separator is what must be narrowed — never the class.**
Only leading dashes go now.

### 4.4 A four-column table meant the class column was not the class column

This is the one that did not refuse.

The adjudications were first written in their own table — `| Requirement | Was |
Now | Why |` — because *was* and *now* is how a human reads an overturned
classification. The generator reads a row's class **positionally, from the second
cell**, and in that shape the second cell is **`Was`**.

So it read `2O-PREF-002` as `partial` — the class the adjudication exists to
overturn — and **wrote a matrix saying so**. No refusal, no warning, and a
document that looked complete and under-stated a requirement that shipped three
slices ago. **The count was 105/3 before and 106/2 after, and nothing but reading
the rendered row distinguished them.**

**The fix is not a smarter parser.** The generator now has exactly **one row
shape per record**, and the adjudicated requirements take their row in the same
table as everything else, with *was* and *now* written in the evidence prose. A
second table shape is a second thing to get wrong, and a positional rule is only
sound while the positions are the same everywhere.

**The lesson is the one this phase keeps re-learning from a new direction:** a
gate that refuses is telling you something; a gate that answers is only telling
you something if you check the answer against the thing itself. Two of my own
edit scripts made the mirror error the same hour — one matched `---` against a
table separator instead of a section break, and left a fragment of the old table
behind that the generator then read as a second classification.

### 4.5 What it refuses, and the controls that prove each refusal can fire

`src/lib/closeout/phase-2o-traceability.test.ts` plants a defect per refusal,
asserts the generator refuses, and removes it. **A guard that has never failed is
a guard nobody has tested.**

| Refusal | Planted defect |
|---|---|
| a declared id nothing classifies | remove one id's row from a record |
| an id classified that the PRD does not declare | add a row for `2O-GHOST-001` |
| a duplicate declaration | declare an existing id twice in the PRD |
| a silent conflict | make a later record disagree without saying so |
| a silent adjudication | the same, with the marker removed |
| a `partial` with no destination | strip the destination from a remainder |
| a vacuous remainder | replace a remainder with three words |
| `not-built-by-rule` with no rule | strip the citation |
| the id satisfying its own destination | a remainder naming only itself |
| a migration budget that does not reconcile | add a phase-prefixed migration file |

**The ninth is the one worth naming.** A row reading *"`2O-ONBOARD-003` —
destination: `2O-ONBOARD-003`"* names nowhere, and a naive check passes on it
because the requirement's own identifier matches a token. The generator **strips
the subject before testing**, so a row can never discharge the obligation by
containing itself.

---

## 5. Classification

| Requirement | Class | Evidence |
|---|---|---|
| `2O-READY-001` | **built** | `PHASE_2O_READINESS_DOSSIER.md` §2 — per gate, what is satisfied, what is not, and who must act |
| `2O-READY-002` | **built** | §1 transcribes `npm run rollout:verify`'s output whole, run 2026-08-18 against `8859e40`; not restated from memory |
| `2O-READY-003` | **built** | signup closed; `config.toml` unchanged; no secret touched; rollout script unchanged; CSP unchanged — five absences, each checkable |
| `2O-READY-004` | **built** | all five restated as owner or operator work with current state; **none closed by writing a file**, and the dossier says why `RG-DEP-3` and `RG-DEP-4` cannot be |
| `2O-READY-005` | **built** | zero migrations, so no schedule could be armed by one; `RG-QUO-3` left `FAIL` rather than closed. Scheduling is authorization |
| `2O-METRICS-001` | **not-built-by-rule** | the five activation questions are written down in the M1 verdict §2, before any name — and no name follows, under `OD-2O-8` **A** and ADR-118 Decision 3 |
| `2O-METRICS-002` | **not-built-by-rule** | `OD-2O-8` **A** and ADR-118 Decision 3: no real producer and no real consumer. Both conjuncts measured and absent — verdict §3, §4 |
| `2O-METRICS-003` | **not-built-by-rule** | no event declared, so no key added that could hold content. Closes on `OD-2O-8` **A** and ADR-118 Decision 3, the same rule as `-002` |
| `2O-METRICS-004` | **not-built-by-rule** | no widening, under `OD-2O-8` **A** and ADR-118 Decision 3. Verified anyway: hosted check constraint 39 literals, contract 39, sorted lists identical |
| `2O-METRICS-005` | **not-built-by-rule** | there is no consumer to execute, under `OD-2O-8` **A** and ADR-118 Decision 3. The owner-scoped residue rule is recorded for the next phase that ships telemetry |
| `2O-SEC-001` | **built** | every Phase 2O read runs on `requireUser`'s request-scoped client; the one `service_role` string under `privacy/` is a comment, not a call — disposition §1 |
| `2O-SEC-002` | **built** | zero migrations means zero grants; `authenticated` holds exactly what it held at `202608160097`; no definer created |
| `2O-SEC-003` | **built** | the export runs as the caller, so foreign rows are unreachable to the statement rather than filtered by the export's logic — including the trigger-validated polymorphic tables |
| `2O-SEC-004` | **built** | the phase added no automatic action; the dismissal is reversible and proved across a reload; `signOutEverywhere` acts only on the caller's own session and surfaces every real error |
| `2O-SEC-005` | **built** | sixteen threats disposed in `PHASE_2O_SECURITY_DISPOSITION.md` §5; live risks, accepted risks and inherited residuals stated in §6 without softening |
| `2O-CLOSE-001` | **built** | 116 declared, 116 classified from source, 0 unclassified; the generator refuses a vacuous remainder and a rule-less `not-built-by-rule` |
| `2O-CLOSE-002` | **built** | matrix generated by `scripts/generate-phase-2o-traceability.mjs`, carrying `Do not edit by hand`; `--check` compares byte for byte; counts in `STATE.md`, `TODO.md` and `CHANGELOG.md` re-derived from it |
| `2O-CLOSE-003` | **built** | budget reported as allocated versus spent: **2 allocated · 0 spent**; M1 unspent by measurement, M2 unspent by construction, neither reallocated |
| `2O-CLOSE-004` | **built** | the successor is re-audited in §7 and **not started**; A13 returns an empty signal list and was **not retargeted** by this closeout |

### Adjudications, stated rather than applied silently

A later record may overturn an earlier class only by **saying so**, and the
generator refuses any that does not. Two requirements are adjudicated here, and
both take their row in the table above rather than in a table of their own —
see §4.4 for why that matters more than it looks.

| Requirement | Class | Evidence |
|---|---|---|
| `2O-PREF-002` | **built** | **Re-evaluated at closeout**, from `partial` (2O.3). The remainder — the account's own acceptance history had no surface — closed in slice 2O.5, which built `ConsentSection` and mounted it on Ajustes at `settings/page.tsx:180`; no record re-classified it. Verified in the tree, not read off the claim |
| `2O-ACCESS-006` | **partial** | **Re-stated, not promoted**, from `partial` (2O.7) — the class does not move. The screen-reader session is **NOT EXECUTED**; what was missing was the destination, which slice 2O.7 stated in prose and omitted from its row. Remainder: a real VoiceOver session naming device, software and version. **Destination: owner.** ADR-118 Decision 8 permits no other outcome, and this slice's evidence is documentation — exactly what may not promote it |

**`2O-PREF-002` moves and `2O-ACCESS-006` does not, and the difference is the
point.** One had a remainder that a later slice actually closed; the other has a
remainder that nothing has closed and that no document may close.


---

## 6. Gates

| Gate | Result |
|---|---|
| `npm run lint` | zero errors |
| `npm run typecheck` | zero errors |
| `npm test` | full suite green |
| `npm run build` | production build passes |
| `git diff --check` | clean — no CRLF, no trailing whitespace |
| closeout guards | green, including the new traceability guard |
| `npm run rollout:verify` | **25 · 3 · 2**, unchanged |
| `docs:phase-2o:traceability --check` | matrix matches its sources |
| migrations local vs hosted | **97 = 97**, parity `202608160097` |
| CI on the head | green on all three job families |

---

## 7. The successor, re-audited and not started

**Re-audited against the tree this phase leaves, per `2O-CLOSE-004`.**

- **No `2P-*` requirement is declared anywhere** in `src/`, `docs/` or
  `supabase/`. The one file containing the string is the A13 detector itself,
  whose pattern is `/^- \*\*2P-[A-Z]+-\d{3}/m` — **the guard naming what it
  forbids is not the thing it forbids.**
- **No `PHASE_2P_*` governing artifact exists**, and there is no
  `docs/initiatives/phase-2p/` or `docs/reports/phase-2p/`.
- **No accepted ADR names the successor in its heading.** ADR-120, this phase's
  last, is about a notification bound.
- **No source or migration file is marked as successor implementation.**
- **A13 returns an empty start-signal list**, and this closeout **did not
  retarget it**. `R-2O-24` puts any retarget in the next authorization's own
  commit, and ADR-118 Decision 6 repeats it.

**The roadmap's lettered sequence ends at 2O.** What comes next is unscoped,
unnamed and unauthorized, and this record deliberately does not name it — a
closeout that named the successor would start it in the act of describing it,
which is the failure `R-2O-10` was written for.

---

## 8. What this slice did not do

- **Did not open signup**, alter the rollout gate, touch `config.toml` or modify
  a secret.
- **Did not close `RG-DEP-3` or `RG-DEP-4` by writing a file** — the temptation
  this slice was warned about by name, and the dossier is the file that would
  have been it.
- **Did not create a migration.** Zero for the phase; **M1 and M2 both close
  unspent** and neither was reallocated.
- **Did not invent a telemetry event** to spend M1, build an artificial
  producer, or call documentary code a consumer.
- **Did not build a notification override**, create a priority, or edit the
  delivery engine.
- **Did not promote `2O-ACCESS-006`.** The screen-reader session stays **NOT
  EXECUTED**.
- **Did not restyle the forty-nine unreached elements**, or touch the four
  inherited target exceptions.
- **Did not resume the push HTTP 403 track**, claim an Android run, or absorb a
  declined Phase 2N residual.
- **Did not retarget A13**, name the successor, or start it.
- **Did not incorporate, apply, merge or rebase** branch
  `codex/fix-needs-attention-confirmation` or migration
  `202608170098_confirm_entry_interpretation.sql`. That work is not Phase 2O's,
  and none of its requirements is counted here.

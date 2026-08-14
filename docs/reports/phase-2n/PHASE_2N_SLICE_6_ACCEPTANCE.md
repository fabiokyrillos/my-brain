# Phase 2N slice 2N.6 — acceptance

**Relations, and a secondary graph that draws only what it can explain.**

| Fact | Value |
| --- | --- |
| PR | **#223** |
| Migrations | **ZERO created.** 94 local = 94 hosted, parity **`202608140094`**, read live |
| Budget | `3 allocated · 2 spent (M1, M3)` · **M2 reserved for 2N.7, untouched** · a fourth is a **STOP CONDITION** |
| New authority | **none** — zero RPCs, zero grants, zero indexes, zero policies, zero writers, zero jobs, zero workers |
| Dependencies added | **none** |
| Requirements | **12: 8 built · 3 baseline · 1 partial · 0 not-built-by-rule** |

---

## 1. The verdict, and what it cost to reach it

`2N-RELATION-011` is a refusal clause, so the slice opened with a measurement
rather than a component. `PHASE_2N_SLICE_6_EDGE_CATALOG.md` classifies ten
candidates against the schema and answers the clause point by point:

> ### 2N.6 AUTORIZÁVEL DENTRO DO CONTRATO EXISTENTE

Three measurements decided the shape of everything after it.

### 1.1 There is no person-to-person edge in this product

`person_relationships.related_person_id` is written `null` by the only writer the
table has ever had, and `relationship-vocabulary.ts:9-15` records what a null
means: *related to the owner*. Across all 94 migrations the only other insert is
M3's undo restore.

So that table is a **star centred on the owner**, not a graph between people. The
user question *"which people are related"* is answered by two real edges sharing
a node — never by a line drawn between two people, which would have to be
synthesized from a shared project, a shared context or a co-mention.

### 1.2 The premise that authorizes the graph does not hold in the tree

`PHASE_2N_THREAT_MODEL.md` states it plainly:

> **What makes it acceptable is T-3's signature, not the graph's own design.**
> Under `OD-2N-8` A no inferred relation exists to be drawn.

Measured against `main`: `202607160011:4-38` creates `link_interpreted_entities`
and its `after insert` trigger on `entry_entities`. On every interpretation that
extracts a person beside a project or a context, it inserts a `person_projects` /
`person_contexts` row carrying `least(a.confidence, b.confidence)` — a
**co-mention, persisted automatically, with no provenance**. That is `OD-2N-8`'s
**refused option C**. It has never been dropped, and `entry_entities` is written
by the live interpretation RPC, so the path is the product's primary flow.

**Removing it is a migration, and a fourth migration is a stop condition.** So
this slice repairs the *claim* and refuses to draw what it cannot explain; it
does not and cannot repair the persistence.

### 1.3 So the claim was already wrong on a shipped surface

`association-panel.tsx:163-167` rendered **"Informado por você"** for every
association row on the person and project pages, including the trigger's,
justified by a comment reasoning that the tables carry no `source_entry_id`
*"so there is nothing else the origin could be"*.

**That confuses the absence of a provenance column with the absence of another
writer.** It is true of `person_relationships` and false of the other two. A live
`2N-RELATION-002`/`-008`/`-009` defect on a surface 2N.1 and 2N.2 shipped, of
exactly the shape 2N.5's census found one domain over.

### 1.4 The discriminator, and the one direction it proves in

The owner's creation actions write an `audit_logs` row; the trigger writes none.

- `audit_logs` is **exempt from every retention sweep by decision**
  (`202608050077:45`, SH-RETENTION-006), so the proof does not decay.
- `audit_logs_user_entity_idx (user_id, entity_type, entity_id)` already exists,
  so **no index is created**.
- `authenticated` already holds `select` on it under forced RLS, and the project
  page already reads it. **No grant, no RPC, no new authority.**

Narrowed to the two `associate_*` actions on purpose: `update_person_project_role`
and `end_person_*` write rows with the same `entity_type` and `entity_id`, and
reading either as proof of **authorship** would be inference.

**Presence proves owner-authorship. Absence proves nothing** — an owner action
whose best-effort audit insert failed is indistinguishable from the trigger — so
absence resolves to *not attributable*, never to *informed by you*. The
false-negative direction understates what is known; the other fabricates an
origin.

---

## 2. What shipped

### 2.1 One projection, two presentations

`projection.ts` is pure — no client, no `user_id`, no I/O — and both
presentations receive **one `RelationProjection` value**. The list renders all of
it; the drawing renders the subset `isDrawable` admits. **Neither can report a
different bound**, because there is one `Bounded<RelationEdge>` and both read it:
a type-level property, not a convention.

The **list is canonical and rendered first**, in the DOM and on the page. The
drawing receives a strict subset, so it cannot acquire exclusive information
without somebody deliberately giving it some — asserted by guard.

### 2.2 What is drawn, and what is only listed

| Edge | Origin | Drawn |
| --- | --- | --- |
| person → you (`person_relationships`) | owner-authored, **structurally** — one writer in the whole repository | **yes** |
| person ↔ project, person ↔ context | owner-authored **when the audit row proves it** | **only then** |
| person → organization, project → organization | owner-authored **structurally** — the interpretation RPC inserts `(user_id, name)` and never sets `organization_id` | **yes** |
| everything else | — | **no** |

An unattributable link is **listed under its own heading, with an honest
sentence, and deliberately not drawn**. The surface says so:

> Estes vínculos existem e continuam nas páginas de pessoa e de projeto. Eles não
> entram no desenho porque o Cérebro não consegue dizer de onde vieram.

Refused by name, with reasons: `entity_attachments` (no writer, empty by
construction, governed label), `entry_entities` (a mention is not a relation, and
its node label would be entry content), `entity_aliases` (a node property),
person↔person (does not exist), tasks (Work's domain), and a relation *proposal*
(the extraction schema has **no relation field at all**; building one needs a
store, therefore a migration).

### 2.3 Rendering, chosen by comparison

**HTML anchors positioned by CSS over an `aria-hidden` SVG that holds only
geometry.** Compared against inline SVG, canvas and a library on accessibility,
touch targets, bundle, SSR, hydration, CSP, Next 16 and maintenance
(catalogue §4).

- Every node is a real `<a>`: native focus, the product's own `:focus-visible`
  outline, 44px+ targets from the stylesheet, and a name it already has.
- The SVG carries **no text, no `title`, no `aria-*`, no `data-*` derived from
  content**. It cannot leak because there is nothing in it to leak.
- **Zero client JavaScript** for the drawing, and **zero dependencies added**.
- The SVG sits **behind** opaque node boxes, so a line can never cross a label.
- The node box height is **fixed**, not a floor — the diff review's finding: a
  two-line name under `min-height` would grow past its row and sit on the node
  below while `layout.test.ts` went on passing, because the arithmetic never saw
  the text.

### 2.4 `graph` joins the sensitivity contract, with its consumer

`contracts.ts` reserved the key in 2N.0 and stated the condition: *"It joins in
2N.6, with its consumer, or not at all."*

The consumer is real and named: **`person_relationships.description`**, resolved
by `resolveGraphContent` and rendered through the same `ProtectedContent` every
other governed subject uses.

**And the same change makes the person page converge.** That page masked
`people.notes` and printed `description` in the clear **one section below it** —
two unclassifiable free-text fields about the same human being, on one page,
under two postures, both matching ADR-110 Decision 4's predicate word for word.
That was a divergence rather than a distinction, and `2N-PRIVACY-001` exists to
end it.

**`person_projects.role` is deliberately unchanged.** It describes a function on
a project rather than the person, and it renders in the clear on **both**
contextual pages today; extending Decision 4's posture to it is an owner
question, recorded with a destination (`2N-PRIVACY-FREETEXT`) rather than taken.

### 2.5 Route and navigation

`/app/relations`, `context` group, **`more` visibility**. That is the requirement
rather than restraint: `2N-RELATION-006` says the graph *"is never primary
navigation"*, and `2I-SHELL-001`'s four primaries are asserted **unchanged**.

Named **Relações / Relations**, not *Grafo*: the canonical presentation on that
page is a list, and the name should not promise a picture to a reader who may
never see one. The sensitivity key stays `graph`, because that is the word 2N.0
reserved for the drawn half.

---

## 3. Classification, re-derived from the PRD

| Requirement | Class | Basis |
| --- | --- | --- |
| `2N-RELATION-001` create/update/end + validity | **baseline** | EGC.2's eight Server Actions. This slice adds none and changes none |
| `2N-RELATION-002` every rendered relation states its origin | **built** | Three honest arms replace one false claim. The re-audit read this as *"largely ships"*; that reading rested on `provenance/contracts.ts`'s premise, which §1.2 measured false for two of three tables |
| `2N-RELATION-003` only owner-authored relations persist | **partial** | The trigger still persists co-mention associations. Remainder **`2N-RELATION-TRIGGER`**; see §5 |
| `2N-RELATION-004` corrected and ended through an existing path, audited | **baseline** | The same eight actions. The relations surface owns **no writer** and links to them |
| `2N-RELATION-005` confidence never rendered as certainty | **baseline** | It already held by omission. This slice extends it to a new surface, adds the first structural guard for it and renders a sentence explaining the omission — improvements to an inherited property, not a new delivery of it |
| `2N-RELATION-006` secondary, only authorized relations, no migration | **built** | `more` visibility, drawn subset, zero migrations |
| `2N-RELATION-007` complete, non-degraded text equivalent | **built** | One projection, list first, superset. Screen-reader **structure** asserted; no session claimed — `2N-ACCESS-006` |
| `2N-RELATION-008` existing rows owner-authored without inventing provenance | **built** | The invention is removed; the claim is now made only where it is provable |
| `2N-RELATION-009` every edge explainable | **built** | Type, role, validity, origin, and a link to the page that owns the write |
| `2N-RELATION-010` no meaning from position, distance, cluster, centrality | **built** | No force layout, no clustering, no degree sizing; the refusal is **rendered** in both locales |
| `2N-RELATION-011` refuse rather than ship a misleading graph | **built** | Executed: catalogue first, verdict issued, and the drawing withholds what it cannot explain instead of drawing it prettily |
| `2N-ACCESS-004` non-visual equivalent for any graph affordance | **built** | The list is canonical, first, and complete |

**8 built · 3 baseline · 1 partial · 0 not-built-by-rule.**

### A note on `2N-RELATION-002`'s classification

The requirement anticipates two arms — *authored by you*, or *derived, and from
what*. Reality has three, because the trigger records **nothing** about which
interpretation produced a row, so *"derived from what"* is unanswerable for those
links and correlating them by time or by person would be the inference this
phase forbids by name.

It is classified **built** because the obligation is on what the product
*renders*: it never states an origin it cannot substantiate, and there is no
relation whose derivation it knows and fails to state. The unanswerable case is a
property of the schema, and it is carried by `-003`'s partial rather than hidden.
A reader who thinks that reading is too generous has everything needed here to
disagree with it.

---

## 4. Proofs

### 4.1 Local

| Proof | Result |
| --- | --- |
| Unit + component tests for the slice | **110 passing** (contracts 13, projection 20, layout 12, list 13, diagram 14, guard 38) |
| Structural guards | **38 assertions, each with a mutation control**; two narrowings with **two-sided** controls |
| Full suite | **7263 passing, 0 failing** (3 failed *files* = the Windows-only shebang parse baseline, green in CI) |
| Lint | clean |
| Typecheck | clean |
| Production build | clean; `/[locale]/app/relations` present in the route table |
| `git diff --check` | clean |

**The two narrowings, recorded because the class keeps recurring.** A bare
`graph` token in a migration filename matched Phase 2C's
`202607220044_phase_2c_slice_5_task_graph` and its follow-up; a bare `content\s*:`
in the stylesheet matched `align-content: start` on a correct file. Both were
**narrowed to what discriminates, never weakened**, and each carries a control
proving it still refuses what it exists to refuse **and** still allows what it
must.

### 4.2 Hosted

A **local production build against the hosted Supabase project**, `--workers=1`,
serially. Not a Vercel deployment.

| Lane | Result |
| --- | --- |
| 2N.6 journey, **desktop**, pt-BR + en | **23/23** |
| 2N.6 journey, **Pixel 7**, pt-BR + en | **23/23** |
| EGC.2 relationships regression, desktop + Pixel 7 | **8/8** |
| 2N.1 person regression, desktop + Pixel 7 | **14/14** |
| 2N.0 foundations regression, desktop + Pixel 7 | **12/12** |
| 2N.2 project regression, desktop | **14/14** |
| 2N.5 library regression, desktop | **16/16** |
| **Total** | **46 journeys for 2N.6 + 64 regressions = 110 hosted executions** |

**No `429` across roughly 190 sign-ins**, run serially and spaced.

Two of the twenty-three are an **`axe-core` scan of the real page**, at both
viewports and in both locales, asserting **zero `serious` or `critical`**
violations with the drawing on screen. That is a different instrument from
`accessibility.spec.ts`, which scans *mirrored fixtures*: this runs against the
app's own chrome, stylesheets and landmarks. It found a real defect — §6.4.

**The pairings that carry the file.** The drawing is proved non-empty by three
assertions *before* Rafael's absence from it is claimed, so *"not drawn"* cannot
pass on a picture that failed to render. The cross-tenant control asserts the
stranger sees **their own** relation first, so *"does not see the owner's"*
cannot pass on a blank page. The masked-note assertion is preceded by a marker
proving the row rendered, and followed by a DOM sweep proving the string reached
**no attribute** either.

**The removal journey runs end to end through the product's own form** on the
person page — `2N-RELATION-004` requires an existing authority path, and the
relations surface deliberately owns no writer — and it plants its own row so a
second run is not asserting against a relation the first already ended.

### 4.3 Zero residue, with a control that discriminates

`scripts/verify-phase-2n-slice-6-cleanup.mjs`. **All 11 residue reads at zero and
all 7 control assertions green.**

None of the three relation tables carries a text column, so residue is reachable
only by **joining through the marked person** — and a probe that silently failed
to join would read zero against a table full of relations. The control therefore
plants **two** marked people, gives **one** a relationship, and requires the probe
to find exactly one:

```
ok   probe FINDS both planted people: 2
ok   relation probe FINDS exactly the related one: 1
ok   relation probe IGNORES the unrelated one: 0
ok   audit probe FINDS the planted row: 1
ok   cascade removes both people / the relationship / the audit row: 0 / 0 / 0
```

The audit row is read **directly**, because `audit_logs.entity_id` carries no
foreign key: a row that outlived the association it describes is precisely the
residue worth naming, and a probe reaching it through that association would go
blind at the moment it mattered.

**And it ran after a deliberately failed journey.** The desktop lane's first pass
failed its removal test (§6.1) and left four accounts and their fixtures behind;
the probe reads zero afterwards, which is the second half of *"prove cleanup
after a failure"* rather than a claim about the happy path.

---

## 5. Partials and remainders

### `2N-RELATION-003` — **partial**, remainder `2N-RELATION-TRIGGER`

`link_interpreted_entities` still persists co-mention associations into
`person_projects` and `person_contexts` on every interpretation. Closing it means
dropping a trigger, which is **a migration and therefore a stop condition**, and
it is **not transferable into M2**, which stays reserved for 2N.7's telemetry.

The proposal half of the requirement is **satisfied as written**: *"extraction
**may** produce a proposal"* is permissive, the extraction schema has no relation
field, and this slice built no producer.

### `2N-FILES-008` — **partial**, remainder `2N-FILES-WRITER`, preserved unchanged

2N.6 creates **no writer for `entity_attachments`** and uses the graph to justify
nothing. The table is refused as an edge source for three independent reasons
(catalogue E5), and 2N.5's classification is carried forward untouched.

### `2N-PRIVACY-FREETEXT` — a question, not a defect

Should ADR-110 Decision 4's posture extend to `person_projects.role` on the
contextual pages? 2N.6 does not decide it and does not act on it. The relations
surface renders `role` exactly as the person and project pages do, so the three
converge.

---

## 6. What the hosted run found, and what it did not

### 6.1 One journey failed, and the product was right

The removal journey waited for **"Relação encerrada"** after ending a
relationship. The end succeeded — the panel showed *"Nenhuma relação
registrada."* in the same DOM the failure printed — but the sentence never
appeared.

**The test was wrong, not the product.** That string exists and reaches only an
`sr-only` live region **inside the row being removed**, so `revalidatePath`
unmounts it in the same commit that sets it. The visible confirmation an owner
receives is the row's absence and the panel's empty state, which is what the
journey waits for now.

**The underlying behaviour is recorded, not repaired.** A successful *end* is
announced to a screen reader through a region that is destroyed before it can be
read — the §69 shape (`revalidatePath` destroying the thing that was about to
speak) one component over. Destination **`2N-RELATION-END-ANNOUNCEMENT`**, to be
taken with 2N.7's accessibility work. It is **not** needed by the graph's
contract, and fixing it while nearby is how a slice acquires scope nobody
authorized.

### 6.2 One inherited assertion had to change, and it is a claim rather than a bump

`online-relationships.spec.ts:148` asserted the relationship's description was
**visible** after a server re-read. §2.4's convergence makes that false, so the
assertion was rewritten to the new posture — withheld on a page re-read from the
server, and the exact saved text produced by an explicit reveal. **The storage
proof it existed for is unchanged and its shape is stronger**: a round trip that
lost the sentence fails here exactly as it did before.

### 6.3 The axe scan found a contrast defect this slice had introduced

Two nodes, `serious`, `color-contrast`: the **origin sentence inside an
unattributable row**, in both locales.

The cause is a collision between an inherited colour and a new background.
`.provenance-note` is `color: var(--muted, #64748b)` and **`--muted` is defined
nowhere in this codebase** — a pre-existing fault 2N.4 recorded — so every one of
those notes renders at the hardcoded fallback. `#64748b` is **4.62:1 on white**,
which passes, and **4.30:1 on `--mist`**, which does not. Tinting the
unattributable row is what tipped it over, and the tint was this slice's.

Fixed by giving `.relations-origin` the product's own `--ink-soft` token —
**6.15:1 on white and 5.73:1 on the tint** — so the row keeps its grouping and
the sentence clears the threshold on both backgrounds. The shared
`.provenance-note` is deliberately **left alone**: its own surfaces are outside
this slice, and repairing the undefined `--muted` token is not this slice's to
do.

**No structural guard would have caught this**, and no unit test could: jsdom
applies no external stylesheet, so a contrast failure is invisible to every
assertion in the repository except one run in a real browser against the real
page.

### 6.4 What the hosted run proved that no unit test could

The page **rendered**, in a real browser, at two viewports, in two locales. That
is not a formality in this repository: handoff §58 records two surfaces that
shipped green and never rendered, and the RSC boundary is only real in a
production build. Keyboard focus, the 44px minimum, the absence of horizontal
document overflow and the emptiness of the SVG's accessibility tree are all
measured here rather than asserted about jsdom.

## 7. Recorded, not smoothed

- **`online-memories.spec.ts:85` still fails on mobile** — a **21px** touch
  target against a 44px minimum, cause `.list-row-main a` carrying no sizing rule
  on any list surface. **Not weakened, deleted, skipped or marked passing.**
  Destination **`2N-MOBILE`**. Checked against the owner's criterion and it does
  **not** apply here: the relations surface shares no component with it, and its
  own controls are chips with `min-height: 44px` — asserted in the journey rather
  than assumed.
- **There is no selection model**, and that is a design decision rather than an
  omission. The drawing carries no client state at all, so the only state a node
  has is **focus**, which is visible and native. A selection would have meant
  client JavaScript, a second state to keep in step with the list, and an
  affordance with nothing to do — the surface offers links, and following one is
  the interaction.
- **Mobile is a viewport simulation, not a device**, and **no screen-reader
  session is claimed** (`2N-ACCESS-006`). Structure is asserted — headings, a
  named region, a described figure, a list-first DOM order, an `aria-hidden`
  geometry layer.
- **The error state is proved by unit test, not by a hosted journey.** Forcing a
  read failure against the hosted database would mean breaking it. The loader
  returns an outcome and the page renders it; the copy exists in both locales.
- **The loading state is inherited**, from `src/app/[locale]/app/loading.tsx` —
  the streaming fallback ADR-112 Decision 7a repaired in 2N.0. This route builds
  none of its own, which is the point: a second one would be a second answer.
- **`attachment_interpretations` bounds** and the other items 2N.5 recorded are
  untouched by this slice.
- **`2N-RELATION-END-ANNOUNCEMENT`** — see §6.1. Found by the hosted run, not by
  re-reading, and recorded with a destination rather than absorbed.

---

## 8. Unchanged

Signup **closed**. Rollout gate **25 pass · 3 fail · 2 owner-signature**. Push
**not resumed** — HTTP 403 on a real iPhone, Android **NOT EXECUTED**. ADR-055 is
neither satisfied nor superseded and expires **2026-10-27**. **Phase 2O is not
started, not planned and not retargeted**, and **A13 still guards the roadmap
successor**.

**Slice 2N.7 — telemetry, security, accessibility and closeout, with M2 — is the
only slice left, and it is NOT started.**

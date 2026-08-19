# Phase 2P — Slice 2P.6 acceptance: the company is edited where it is shown, a memory is written deliberately, and Relations opens on the drawing

**Requirements:** `2P-PERSON-001` … `-004`, `2P-MEMORY-001` … `-004`,
`2P-RELATION-001` … `-004`.

**Baseline:** `main` `1cf595950cf9ce0d794fce4c98109dbec2984d12`. **Zero
migrations** — 99 local = 99 hosted, parity `202608190099`, read live from
`supabase_migrations.schema_migrations` and unchanged by this slice. Both Phase
2P allocations remain spent; a third remains a stop condition. Signup closed;
rollout 25 pass · 3 fail · 2 owner-signature. No automation enabled.

---

## 1. The owner corrected a requirement, and the correction is executable

`2P-PERSON-001` said *"Company and role are editable from their displayed
section"*. **`people` has no `role` column** — measured live against the deployed
schema, its columns are `id, user_id, organization_id, name, notes, created_at,
updated_at` — so half the sentence named a field the product does not have, and
building it as written meant adding one. That is a third Phase 2P migration and
therefore a stop condition.

The owner **refused the column** and corrected the wording by amendment. The
prior text is preserved in ADR-121 and in the PRD; **the count stays 87** and no
ID was renumbered, reused or removed. The signed contract: the company is edited
on the person's page; there is **no global role for a person**; a project role
belongs to `person_projects`; a task role belongs to `task_people`; each is
edited in its own relation's context; neither is duplicated onto `people`; no
global title is synthesized from the several roles; the absence of a role
produces no inference; and no column, table, RPC or migration is created for it.

`src/lib/closeout/phase-2p-person-role-guard.test.ts` makes that executable —
because the risk is not disagreement, it is a later reader finding a person page
with no global role, deciding the requirement is unmet, and adding the obvious
column. It asserts the amendment, the preserved prior wording, the plan's copy of
it, the absence of the column in the generated schema, and the two shapes that
would reintroduce it (a migration adding it, a data-access call reading it).

**It forbids the act, not the word.** A guard scanning for the string
`people.role` would fail on its own docstring and on the amendment explaining the
refusal — the failure this repository has already recorded. Its non-vacuity case
proves each matcher fires on the statement it forbids, stays silent on
`task_people`, on `roles`, and on prose that merely discusses the refusal.

---

## 2. The re-audit against `1cf5959`, and the two places §97 was wrong

§97 re-audited the twelve requirements before this slice began. Two of its
findings did not survive re-measurement, and both mattered.

| # | §97 recorded | Measured on `1cf5959` |
|---|---|---|
| 1 | *"`createRecord` already returns `{ undoId, expiresAt }` from the RPC, so the undo exists"* | **False.** `CreateRecordState` is `{status, message}` and the memory branch was a plain `INSERT`. The `undoId` lines in `operations/actions.ts` belong to other actions (`2L-EDIT-008`). The undo that exists is the archive transition OD-2K-3 signed. |
| 2 | *"`role` exists only on `person_projects` and `task_people`"* — true, but the shape was not looked at | `task_people`'s **primary key is `(task_id, person_id, role)`** and `task_people_role_check` admits exactly four values. So a task role is a closed vocabulary, one person may hold two roles on one task, and "the role of this person on this task" is not a well-formed question. |

Both changed the design. (1) sent the memory composer to
`createProposedMemory` — which is idempotent, audits, and returns the created id
an undo needs — instead of to a `createRecord` that could not support one. (2)
made `previousRole` part of the task-role request, because without it the write
would have to guess which of a person's rows it is changing.

The rest of §97 held: `createOrganizationForSubject` and the
`createdButNotLinked` state ship; `ConfirmDialog` exists with three consumers;
`memories/lifecycle.ts`, `undo.ts` and `read.ts` are baseline; the relations list
is already the complete projection; `2N-RELATION-TRIGGER` is a hard boundary.

---

## 3. Pessoas

**`2P-PERSON-001` — built.** The company left the disclosure for the section that
displays it. It used to mean scrolling to a `<details>`, opening a nine-field
form, finding the selector inside it, and — to add a company that did not exist —
opening a *second* disclosure beside that form. Three openings for one intention.

`linkPersonOrganization` is deliberately narrow. Reusing `updatePerson` would
have meant carrying the stored name and notes as hidden inputs — values rendered
at some earlier moment — so a note edited in between would be silently reverted
by a company change, with the audit row recording the revert as intentional.
That is the cross-section clobber slice 2P.5 repaired one domain over. Its test
asserts the payload contains **only** `organization_id` and `updated_at`.

The **role** half is the correction's: `person_projects.role` was already edited
in its relation's context and is re-proved rather than rebuilt;
`task_people.role` gains its **first application writer**. The person page read
it and never rendered it. `updateTaskPersonRole` names which row it changes,
turns the primary-key collision into *"this person already has that role"* rather
than an outage, writes nothing when the role is unchanged, and keeps the task's
governed title out of the audit trail.

The role editor was **extracted, not written twice**: `RoleEditor` serves the
free-text project role and the four-value task role, and the difference is one
prop.

**`2P-PERSON-002` — built** (baseline extended). `createOrganizationForSubject`
is reused unchanged; what is new is that selecting and creating are two panes of
**one** dialog rather than two nested surfaces.

**`2P-PERSON-003` — built.** The behaviour and the copy shipped before this
slice; what was missing was the *refusal of the retry*, which is behaviour rather
than wording: on `createdButNotLinked` the dialog returns to the selector, where
the company that now exists can be picked. The branch is taken on a `code`, not
on a localized sentence — a message comparison would break silently the first
time either translation is reworded, and the symptom would be a create field left
in front of the owner with a name that has already worked.

**`2P-PERSON-004` — built.** One dialog, never two: proved in a real browser,
because jsdom cannot tell a dialog swapping panes from two stacked. Keyboard
opens it, focus lands on the select rather than a hidden input, Escape closes it,
focus returns to the opener, and the database is unchanged — asserted there, not
on the screen.

---

## 4. Memórias

**`2P-MEMORY-001` — built.** `InlineCreateForm` is gone from `/app/memories`. It
was an `<input maxLength={4000}>` showing about sixty characters, with an
`sr-only` label and a placeholder for a name.

**`2P-MEMORY-002` — built.** The dialog says what makes a memory durable and
names the case it is *not* for: something that happened once is a record, not a
memory. `kind` stays `fact` — ten literals is not a choice a person makes about
their own sentence, and it is what this page has always stored. The optional
validity and source are asked for *when relevant*, and neither is relevant to a
sentence written from scratch about what is true now: validity is editable on the
memory's own page, and a source does not exist.

**`2P-MEMORY-003` — built.** Two panes: write, then review the exact string that
will be stored, rendered rather than summarized. The undo is
`undoProposedMemory`, which **archives** and says archived — asserted negatively
against deletion wording. It is withdrawn once used, and it is **not offered on a
duplicate**: that memory predates the act, and archiving it would undo a decision
the owner did not just make.

**`2P-MEMORY-004` — built.** The write is `createProposedMemory`, unchanged: same
BYOK gate, same rate-limit degradation, same `embedMemory`, same owner scope. The
only addition is `origin`, which reaches **one expression** — the audit reason —
so the trail stops claiming the assistant proposed a sentence the owner typed.

**And one way to write a memory, not two.** `createRecord`'s memory branch is
**deleted** rather than left dormant, and `createSchema` no longer admits
`memory`, so a forged kind is a refusal rather than a second unaudited route into
`public.memories`. The composer states there is **no source record**: the row's
`source_entry_id` is null, the column is `on delete set null`, and the list
renders that `unsourced` — claiming *"informed by you"* would put the two
surfaces in disagreement about the same row.

---

## 5. Relações

**`2P-RELATION-001` — built.** Two tabs, drawing first, and they are **links**
carrying `?view=`. Each view has its own address, so the text resolves with
JavaScript off, back and forward behave, and `2N-ACCESS-004`'s refusal of a
gesture-only path is satisfied by the browser rather than by a keyboard handler.
An unrecognised or repeated parameter opens the drawing rather than refusing.

**`2P-RELATION-002` — built** (baseline, now a claim about a tab). Both
presentations render from the **same `projection` variable**, so the drawing is a
filter over what the list holds and cannot acquire exclusive information. The
list additionally carries the edges the drawing may not show.

**2N's DOM-ordering guard was retargeted, not relaxed.** It asserted
`<RelationList` came before `<RelationDiagram` in the page source. `OD-2P-10`
makes that impossible, and the ordering was only ever a proxy for
`2N-RELATION-007`. The property is now asserted directly — one projection feeds
both, the text is one real link away, the drawing still renders none of the
list's fields — with two mutation controls replacing the old one.

**`2P-RELATION-003` — built.** Focus is a GET form over the same projection, so a
focused view can only ever be a subset. A foreign id, a non-person and nonsense
take the **same arm**, so the parameter cannot be used to test whether an id
exists. Each drawn row links to that edge's own row in the text tab, where its
origin note lives. **Nothing on the surface writes**, asserted by a guard over
four files.

Every anchor is **positional**. `relationEdgeKey` is
`kind|from|to|qualifier` and the qualifier for a `person_owner` edge is the
stored relationship type — the owner's own word about another person — so an id
built from it would put that word in the DOM and, through a link, in the address
bar and browser history. The position is taken over the projection's *unsplit*
order, because indexing either rendered group would make two rows share an
anchor and open the explanation of a different relation.

**`2P-RELATION-004` — built.** The honest reading of the gap: the query was
already bounded and the figure already scrolled inside its own box, so a phone
got **the same SVG behind a horizontal scroll**. `RelationCompactList` is the
different, bounded representation — the drawn edges as text, capped at 12, with
what it left out stated. The drawing is **kept**, not replaced: the requirement
asks for an alternative when the graph cannot fit, not for phones to lose the
picture.

Its `display: block` sits **after** the base rule. A media query written above
the rule it overrides adds no specificity, so the alternative would be silently
dead on every phone — a failure this repository has already paid for, and one
only a rendered page catches. The guard asserts the ordering and its control
shows the assertion failing on the dead layout.

---

## 6. What the browser found that nothing below it could

**A dialog that closes while its own transition is still applying freezes
permanently.** The company saved, the row was in the database — proved by polling
PostgREST before touching the screen — the server logged nothing, and the dialog
sat at *Salvando…* past a sixty-second wait, forever.

It took three builds and four authenticated runs to isolate, because every cheap
explanation was wrong:

| Hypothesis | Refuted by |
|---|---|
| hosted latency | the write landed in seconds; the wait was 60s and never resolved |
| the `revalidatePath` pattern is expensive | the inline role editor revalidates the **same route** on the same page and passes in 8.7s |
| move it into `after()` | the surface then saved and went on rendering *Sem empresa* — **the call must be synchronous**, or the response carries no re-render |
| remove revalidation | the dialog closed correctly, which is what named the interaction |

The mechanism the evidence points at: the successful state arrives together with
the re-rendered page, and the transition that owns `pending` is still applying
that payload. Closing unmounts the `<form>` that dispatched it — `ConfirmDialog`
renders `null` when shut — taking the in-flight dispatcher out from under React
mid-commit.

**Both dialogs now derive openness from `pending`** rather than closing from an
effect. That is not only what the lint rule wanted: a stored *close me* flag is a
second source of truth about whether a round has finished, and two sources of
truth about exactly that **was** the failure. Which state is the current outcome
is keyed on the pane the owner last submitted from — an event, not a guess about
which of two objects is newer, and a fixed preference cannot work because both
orders are reachable. The memory composer takes the same shape before it can
bite: it is exposed today only because `revalidateMemory` still uses resolved
paths that invalidate nothing.

**Three `revalidatePath` call sites were repaired** — the ones this slice's own
surfaces need, as ADR-123's amendment scopes. The first draft shipped a *hybrid*
path, `/[locale]/app/people/<uuid>`, which is worse than either form it mixes: it
looks targeted and matches no route file at all. The remaining sites stay
recorded debt.

---

## 7. Evidence

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors (1 pre-existing warning in `costs/page.tsx`, untouched) |
| `npm test` | **8590 passed, 0 failed**; 3 failed *files* are the recorded Windows shebang baseline, green in CI |
| `npm run build` | passes |
| authenticated desktop | **9 passed, 1 flaky** (green on retry), 1 skipped (mobile-only) |
| authenticated mobile | **9 passed, 1 flaky** (green on retry) — all 10 green |
| migrations | **zero**; 99 local = 99 hosted, parity `202608190099` unchanged |
| fixture residue | **zero**, with a two-sided control: 4 of 5 tables hold rows the open pattern matches, so the fixture-pattern zeros are absences rather than empty tables |

The journeys ran against `next start` on a **rebuilt** artifact, with the server
stopped and restarted after every rebuild.

### The one retry, and exactly what it compensates for

Measured across eleven runs: the **first Server Action issued against a freshly
started server** can sit past a sixty-second wait with `pending` still true while
the row it wrote is already committed. Every subsequent action settles in five to
fifteen seconds, including the second company save through the identical dialog,
and every one of these tests passes when it is the run's first.

It is a warm-up cost, not a wrong result: no run has produced a wrong value, a
missing write, or a write that should not have happened. **It is left recorded
rather than hidden** — see §8.

---

## 8. Open, and not closed by this record

- **First-action warm-up.** The first Server Action after a server start can
  exceed sixty seconds. It is compensated by one retry in the journey and named
  here as an observation for the owner; it is not a defect this slice diagnosed
  to root cause, and it is not claimed as fixed.
- The six remainders inherited from §97 stay open and unabsorbed:
  `2P-ATTENTION-008`'s browser half; `2P-CHAT-007-JOURNEY`; `RG-DEP-3`; the four
  missing review flows (`2P-AUTONOMY-FLOW-PROJECT`, `-ORGANIZATION`, `-MEMORY`,
  `-RELATION`); `2P-APPEARANCE-HYDRATION`; and the remaining `revalidatePath`
  call sites outside the three this slice's surfaces needed.
- No screen-reader run is claimed. The dialog's contract is inherited from
  `ConfirmDialog`'s existing tests plus the keyboard journey above; real
  VoiceOver evidence remains ADR-122 Decision 6's closeout gate.

**Cumulative: 63 of 87.**

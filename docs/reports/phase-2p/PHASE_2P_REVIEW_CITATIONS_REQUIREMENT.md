# `2P-REVIEW-CITATIONS` — links from a review to the records it was written from

**Status: NOT DELIVERED. High priority for the roadmap successor.**
**No migration is created in this unit.** The owner's instruction is explicit that
the requirement be documented and carried forward, not implemented here.

**Do not read the "Fontes" / "Ações" sections on `/app/reviews/[reviewId]` as
delivery of this.** Those sections state what the row can prove — the period, the
model, the kind — and say plainly that the individual records are not linked.
A section headed "Links" is not the same thing as a link to the task the review
is talking about.

---

## 1. What the owner asked for

> *"Se a revisão disser que eu concluí a tarefa X, deve existir um link para a
> tarefa X real. O mesmo princípio vale para outros objetos reais mencionados
> pela revisão."*

---

## 2. Re-confirmed against the code and the deployed database (2026-08-20)

The earlier audit's conclusion held, and the re-check found the shape of the fix
is **already shipped elsewhere in this product**, which the earlier audit did not
say.

### 2.1 The identifiers exist during generation, and they are already validated

`generateReview` (`src/features/agent/actions.ts`) builds the source set it hands
to the provider:

| source | id it is given | real table |
|---|---|---|
| entries in the window | `entry:<uuid>` | `entries` |
| tasks touched in the window | `memory:<uuid>` | **`tasks`** — the prefix is a misnomer |

The provider returns `citedSourceIds`, and `openai-provider.ts:337` already
**filters them against the ids it was actually given**:

```ts
citedSourceIds: parsed.citedSourceIds.filter((id) => availableIds.has(id)),
```

So a fabricated id cannot survive the provider call. This is the single most
important fact for this requirement: **the ids that reach `generateReview` are
already real, owner-scoped ids of rows read under RLS in that same request.**

### 2.2 Where they are discarded

`src/features/agent/actions.ts`, the `summaries` upsert. The insert writes
`content`, `original_content`, `title`, `status`, `model`, `input_tokens`,
`output_tokens`, `generated_at` and the four period columns. **`answer.citedSourceIds`
is never referenced again.** The value is alive in memory and is dropped on the
floor at the moment of the write.

### 2.3 `summaries` cannot hold them

Columns as deployed (`database.types.ts`, confirmed against the hosted schema):

```
content, generated_at, id, input_tokens, model, original_content,
output_tokens, period_end, period_start, period_type, status, title,
updated_at, user_id
```

`Relationships: []`. The only foreign key is `user_id → auth.users`. There is no
column that could hold a citation, and no join table.

---

## 3. The minimal model — and it is not invented

**`conversation_messages.citations` already does exactly this**, for chat, and has
since Phase 2K. The successor requirement should reuse that shape rather than
design a second one:

- `src/features/chat/actions.ts` turns `citedSourceIds` into `references`
  (`{ id, type, sourceId, support }`) with a `flatMap` that **drops any id not in
  the supplied source set** — the fabricated-id stripping is the filter, not a
  check somebody has to remember;
- `buildCitationsEnvelope` wraps them with the retrieval explanation;
- the envelope is written to the **`citations` JSON column** on the message row.

**So the minimal model is one column:**

```
alter table public.summaries add column citations jsonb;
```

No new table, no new relationship rows, no polymorphic link table, and therefore
none of the composite-FK ownership machinery those would require.

### 3.1 Which object types can be linked safely today

Only the two the generator actually reads:

| type | route | id source |
|---|---|---|
| entry | `/{locale}/app/inbox/{id}` | `entry:<uuid>` |
| task | `/{locale}/app/work/{id}` | `memory:<uuid>` (the prefix is wrong; the id is a task) |

**People, projects, organizations and memories are NOT linkable**, because
`generateReview` never puts them in the source set. A future widening of the
source set is a separate decision with its own retrieval cost, and must not be
smuggled in with this.

### 3.2 Owner scope

Every id in the envelope was read under RLS, in the same request, for the same
`user_id` that owns the summary row. The column inherits `summaries`' own RLS and
forced row-level security; **no new policy is required**. The render path must
still re-read each record by id under the reader's own session — never trust the
stored envelope as proof the row still exists or is still theirs.

### 3.3 When the object is removed or is no longer readable

Follow chat's rule, which this product already ships: `resolve-sources.ts`
re-reads each cited source **at render time, against its current
classification**, and a citation whose row does not come back is simply not
rendered as a link. The stored envelope is a *claim about what was cited*, never
a guarantee that the target is still there.

This is also why the column must not be a foreign key: a review is a historical
statement, and deleting a task must not rewrite what a past review said.

### 3.4 No links from text

**A link may only be born from a canonical, owner-scoped identifier in the stored
envelope.** Never from matching a name in the Markdown against a record.

The renderer already enforces the second half structurally: `markdown.ts`'s
`authorizeHref` admits an internal route **only if its UUID is in the allow-set
the caller passes**, and `reviews/[reviewId]/page.tsx` passes an **empty set**
today. When the envelope exists, the page passes the ids from the envelope — and
nothing else changes. The mechanism is already tested in both directions.

---

## 4. Does it really need a migration?

**Yes.** One column on one table. There is no way to persist a citation without
somewhere to put it, and nothing in the current schema can hold it.

**It is not created here.** The owner's instruction for this unit is
"Não crie migration nesta unidade", and this record exists so the successor can
spend one deliberately.

---

## 5. The requirement, as it should be carried forward

> **`2P-REVIEW-CITATIONS` (high priority).** A generated review links to the real
> records it was written from. Persist the provider's already-validated
> `citedSourceIds` on the summary row, in the `conversation_messages.citations`
> shape, and render each as a link **only** when the record still resolves under
> the reader's own session. A link may be born **only** from a canonical,
> owner-scoped identifier — **never** from a name inferred out of the Markdown.
> Entries and tasks only; widening the source set is a separate decision.
> Costs **one migration**: `summaries.citations jsonb`.

**This does not block Phase 2P from closing.** It is an extension of scope beyond
what 2P was authorized to deliver, it is explicit, and it is traceable from
`TODO.md`, from `STATE.md` and from the page's own copy, which tells the owner
the limit rather than hiding it behind an empty list.

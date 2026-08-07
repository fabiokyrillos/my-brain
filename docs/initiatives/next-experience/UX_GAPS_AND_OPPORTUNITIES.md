# Gaps and opportunities — the PRD's scope mapped onto existing contracts

**Date:** 2026-08-07. Companion to `CURRENT_EXPERIENCE_AUDIT.md` and
`UX_PRD_REVIEW.md`. Nothing here authorizes implementation.

The instruction was to map the proposed UX changes onto existing product
contracts and to separate the change classes, **without letting backend
complexity silently redefine the UX goal.** So this document reads in the UX's
direction: each row starts from what the user would experience and then says
what it costs.

---

## 1. Change classification

**UI** = components and copy only. **App** = Server Actions, projections,
data-access. **Schema** = a migration. **AI** = prompt, schema or routing.
**Priv** = touches a privileged boundary (RLS, grants, `SECURITY DEFINER`,
service-role, worker). **Ext** = an external service dependency.

| PRD slice | UI | App | Schema | AI | Priv | Ext | Note |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | --- |
| 0.1 visual language | ✅ | | | | | | |
| 0.2 trust components | ✅ | | | | | | **Must include the interpreting/failed state** (F-4). |
| 0.3 mobile shell + universal states | ✅ | | | | | | Shell exists; states are the work. |
| 1.1 reduced navigation | ✅ | | | | | | **Mostly shipped** — renders an existing grouping (F-1). |
| 1.2 Biblioteca | ✅ | ~ | | | | | "recentes, fixados, precisa de atenção" needs a projection. |
| 1.3 command palette | ✅ | ~ | | | | | Reads existing routes and actions. |
| **1.4 global lexical search** | ✅ | ✅ | **likely** | | | | Cross-entity search over 7 types. See §2. |
| 2.1 Hoje: capture + priorities | ✅ | ~ | | | | | `home-projection.ts` exists. |
| 2.2 Hoje: context + closing | ✅ | ~ | | | | | |
| 2.3 Precisa de você | ✅ | ~ | | | | | **`attention-projection.ts` already exists.** Mostly a surface. |
| 2.4 unified capture | ✅ | ~ | | | | | |
| **2.5 voice + transcription** | ✅ | ✅ | **likely** | ✅ | **✅** | **✅** | The largest. See §3. |
| 3.1 actionable cards in chat | ✅ | ✅ | | ~ | | | `task-commands/` preview+confirm exists. |
| 3.2 chat ↔ product continuity | ✅ | | | | | | |
| 3.3 sources per answer | ✅ | ✅ | | ~ | | | Retrieval + ID-stripping already exist. |
| 3.4 "how the Brain got there" | ✅ | ~ | | ~ | | | Interpretation data is stored. |
| 3.5 contextual suggestions | ✅ | ~ | | ✅ | | | **Cost question** (F-6). |
| **3.6 semantic search** | ✅ | ✅ | **likely** | ✅ | | | **ADR-055, expires 2026-10-27.** |
| 4.1 quick edit + task panel | ✅ | ~ | | | | | Verbs shipped in product-ux. |
| 4.2 bulk actions | ✅ | ✅ | ~ | | ~ | | See §4 — this is the sleeper. |
| 4.3 Work views | ✅ | ~ | ~ | | | | Saved views may need storage. |
| 4.4 calendar | ✅ | ✅ | **maybe none** | | | | See §5 — possibly zero migrations. |
| 4.5 daily planner | ✅ | ✅ | ~ | ✅ | | | Cost question (F-6). |
| 4.6 reviews | ✅ | ✅ | ~ | ~ | | | `generateReview` exists. |
| 4.7 mobile notifications | ✅ | ✅ | ~ | | | ~ | Push would be Ext; in-app is not. |
| 5.1 person page | ✅ | ✅ | | | | | Relations already modelled. |
| 5.2 project page | ✅ | ✅ | | ✅ | | | "resumo explicável com fontes" is AI. |
| 5.3 what the Brain knows | ✅ | ~ | | | | | **Largely shipped.** |
| **5.4 memory conflicts** | ✅ | ✅ | **✅** | ✅ | ~ | | See §6 — the most likely real migration. |
| 5.5 smart file library | ✅ | ✅ | ~ | ✅ | | | Attachment pipeline exists. |
| 5.6 relationship graph | ✅ | ✅ | | | | | Data exists; visualisation does not. |
| 6.1 onboarding | ✅ | ✅ | ~ | | | | **Depends on Q7.** |
| 6.2 progressive personalization | ✅ | ✅ | ~ | | | | `agent_preferences` has `future` keys already declared. |
| 6.3 privacy centre | ✅ | ✅ | ~ | | ~ | | **Mostly shipped by SH.** `exportação` is new. |
| 6.4 mobile activation polish | ✅ | | | | | | PWA exists. |

✅ = required · ~ = possible/partial · blank = not required

---

## 2. Global search (1.4) — the highest-leverage slice, and the first schema question

Seven entity types, lexical, filterable, with an empty state. The user-facing
promise is simple; the implementation choice is not.

**The opportunity:** this is the single change that most reduces the cost of
having twenty-one destinations (F-2), and it is the one that would **generate
the usage evidence ADR-055 has been waiting for** (F-5). Shipping it early
serves the UX goal *and* resolves a dated commitment.

**The choice:** Postgres full-text (`tsvector` + GIN per searchable table, or one
materialized search table) versus `ILIKE` scans. At current data volumes `ILIKE`
would work and would need **zero** migrations; at any real volume it will not,
and retrofitting FTS later touches every table again.

**Recommendation:** decide this in planning, not in the slice. If FTS, it is one
migration and it should be **budgeted explicitly** rather than discovered.

---

## 3. Voice (2.5) — where the UX goal must not be redefined by the backend

**The UX goal is small and clear**: speak, see an editable draft, keep typing,
record another piece, confirm. §2.5 specifies it precisely and it is good.

**The backend surface it lands on is not small**, and the risk here is the one
the instruction names — that the contracts quietly shrink the flow. Named so
they do not:

| Contract | The question | Where it must NOT go |
| --- | --- | --- |
| **BYOK** | Whose key pays for Whisper? | A project key. ADR-072 closed that; `project-key-guard.test.ts` enforces it. |
| **Rate limiting** | Does a transcription consume an AI slot? | An exemption. PRD §14.2 V-6: *no exemptions, including the owner.* |
| **Retention** | Is the audio kept? | An unsigned new window. §14.1's signed windows do not name audio. |
| **Storage quota** | Does audio count against the upload ceiling? | Silently not counting. |
| **Job pipeline** | Is transcription a new job type or an attachment? | A second write path. Phase 2F holds one. |

**The cheapest correct answer is discard-by-default**: the audio is transcribed
and thrown away, and the draft is the artifact. That removes the retention
class, the quota interaction and most of the privacy surface **in one product
decision** — and §2.5 step 8 already requires telling the user which it is, so
the PRD has anticipated it.

**It does not shrink the UX at all.** Every one of §2.5's eight steps survives
intact. This is the shape to aim for: a *product* decision that removes backend
complexity, rather than backend complexity removing a product step.

---

## 4. Bulk actions (4.2) — the sleeper

Reads as a UI feature. It is a **write-path** feature.

Phase 2F established one write path, with per-action authorization, audit and
undo. A bulk operation must therefore be **N audited operations with N undo
entries** — or one operation with a compensating batch undo. It also meets the
quota triggers, which are `AFTER INSERT … FOR EACH STATEMENT` precisely because
a row trigger could not see the earlier rows of its own multi-row insert.

§4.2 already asks for the right behaviour — *"resultado parcial compreensível
quando algum item não puder mudar"* — which is exactly what a per-item authorized
path produces. Good instinct; it just costs more than a checkbox column.

**Recommendation: plan it as a write-path slice, not a list-UI slice.**

---

## 5. Calendar (4.4) — possibly zero migrations

Everything it displays exists: tasks with due dates, reminders, reviews, and
extracted-but-unconfirmed dates from interpretations. External integrations are
explicitly out of scope (§6.1, §14).

So it may be **a projection and a view over existing tables**. That would make
one of the PRD's largest slices (3–4 weeks) schema-free.

**Recommendation: verify in planning.** If true, it is the best
value-per-migration in the initiative and argues for pulling it earlier than
Etapa 4.

---

## 6. Memory conflicts (5.4) — the most likely genuine migration

§5.4 requires detecting incompatible claims, offering five resolutions, **never
resolving automatically**, and showing future impact.

A conflict is a durable object: two memories, a detection reason, a state, a
resolution, an actor, a time, and an undo. That is a table, RLS, grants and an
undo handler. Detection is an AI judgement, so it must go through a strict
validated schema and record model, confidence and prompt version — the standing
rule for AI-produced domain writes.

**This is the initiative's clearest migration**, and it is well-aligned with
every existing invariant rather than in tension with any.

---

## 7. Opportunities the PRD does not claim

Worth surfacing; **none is a recommendation to widen scope.**

1. **The `Mais` menu already carries a grouping nobody renders.** `group:
   "context" | "reflection" | "organization" | "transparency" | "preferences"`
   is already in `capabilities.ts`. Biblioteca is the `context` group; the other
   four are §5.3's "atividade e configurações". **The PRD's whole §5 IA is
   already modelled as data.** This is the cheapest structural win available.
2. **`agent_preferences` already declares §6.2's keys as `future`** —
   `scheduled_reviews`, `autonomy`, `follow_up_intensity`, `privacy_default`,
   `locale_preference`, `reasoning_route`, `background_route`, all with
   `visible: false`. Progressive personalization is partly a matter of making
   declared-but-hidden capabilities real, and `capabilities.ts` already tracks
   which have consumers.
3. **Retiring the 266 locale ternaries pays for itself here.** §12 demands both
   languages per etapa; the conversion is otherwise a sweep nobody will schedule.
4. **The error sink has no product consumer.** `error_events` records failures
   with a closed vocabulary. §4.8 ("nenhuma tela sem próximo passo") and §6.1's
   "falhas recuperáveis" in Precisa de você could consume it — turning an
   operator surface into a user-facing recovery affordance at low cost.

---

## 8. What must not weaken — the invariant list, restated as UX constraints

The objective says *"without weakening the security, privacy, data-integrity and
one-write-path invariants established through Phase 2H."* Restated as things a
designer can hold:

| Invariant | What it means for this initiative |
| --- | --- |
| **One write path** | A bulk action, a card action and a voice capture all go through the same authorized Server Action / RPC as the single-item path. No surface gets its own shortcut. |
| **RLS is the trust boundary** | No new surface reads across users. A graph view expands only from the user's own items. |
| **AI proposes, the user disposes** | Cards preview and confirm. Memory conflicts never auto-resolve (§5.4 already says so). The planner never moves a task silently (§4.5 already says so). |
| **Every automatic action is auditable and reversible** | Bulk operations need real, tested undo — not a toast. |
| **AI writes go through a validated schema** | Transcription, conflict detection and project summaries all record model, operation, confidence and prompt version. |
| **Ambiguity becomes a pending question** | Voice transcription is a **draft**, never an action (§11.4 already says so). |
| **The user pays** | Proactive AI work is opt-in and its cost is visible (F-6). |
| **Fail-closed rate limiting** | No exemption for a new capability, including voice. |
| **Untrusted content is data, never instructions** | A transcript, a file and a chat source are all untrusted input. |
| **User content is never lost to a configuration gap** | Capture succeeds even when interpretation cannot run — the existing rule, which every new capture surface inherits. |

**None of these is in tension with the PRD's direction.** Several — §4.3, §4.4,
§11.4, §5.4's "nunca resolver conflito automaticamente" — are the same
commitments arrived at from the product side, which is the strongest available
signal that the PRD and the architecture want the same product.

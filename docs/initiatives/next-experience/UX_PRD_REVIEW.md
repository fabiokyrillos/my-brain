# Adversarial review — `MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md`

**Reviewed:** 2026-08-07, at commit `5b60705`.
**Reviewer's posture:** adversarial on substance, **protective of product
intent**. This review does not rewrite the PRD into architecture-first language
and does not renegotiate what the owner wants the product to be. Where it
pushes, it pushes on *sequencing, evidence, and unstated dependencies* — not on
direction.

**Headline: this is a good PRD.** It is specific, it names its rejections, it
resists its own scope creep, and §11's risk list is the part most PRDs omit.
The findings below are almost all *sequencing and premise* findings, which is
the useful kind at this stage.

---

## 1. Verdict on each thing the review was asked to evaluate

| Dimension | Verdict |
| --- | --- |
| Primary user problem | **Correct and confirmed by the code.** §3.1 is right: capability is not the constraint. |
| Target user journey | **Strong.** §2's eight-step arc is the clearest statement of this product that exists anywhere in the repository, including its own PRD. |
| Friction being removed | **Named concretely**, per §3.2, and every symptom is real. |
| Current experience | **Understated in one direction** — see F-1. |
| Desired experience | **Clear.** §3.3 is testable. |
| Information architecture | **Good, and mostly already built** — F-1. |
| Navigation | **Same.** The remaining delta is `Biblioteca`. |
| Discoverability | **The real gap**, and the PRD under-weights it relative to navigation — F-2. |
| Interaction cost | Addressed via cards, quick-edit, bulk. Sound. |
| Responsiveness / perceived performance | **A gap** — F-4. Asynchronous capture is barely acknowledged. |
| Empty states | Explicitly in scope (§6.1, §12). Good. |
| Error states | Same. Good. |
| Mobile behaviour | **Excellent, and the strongest organising principle in the document.** |
| Accessibility | §4.10 makes it a completion requirement, not a pass. Correct. |
| Onboarding | Well placed at Etapa 6 with a caveat that it closes last. |
| AI interactions | **Good, with one omission** — F-6, cost. |
| Task / capture flows | Strong. §2.5's voice flow is unusually well specified. |
| Notification / reminder experience | Good; §4.7's "medir utilidade sem estimular notificações artificiais" is the right instinct. |
| Settings complexity | Addressed by progressive disclosure. Sound. |
| Progressive disclosure | A stated principle (§4.5) and used consistently. |
| Consistency across surfaces | Etapa 0 exists precisely for this. Correct call. |

---

## 2. Findings

### F-1 — Etapa 1's navigation work is largely already shipped **(high, sequencing)**

§5.1/§5.4 propose a destination model the code already implements: `home`,
`inbox` (**already renamed** from "Caixa" to Registros), `work` (**already
absorbs** `today`, `tasks`, `waiting` as aliases), `chat`, and **capture as the
global centre action** in a five-slot mobile bar. Evidence:
`src/features/shell/capabilities.ts` §76–98.

**What is genuinely missing is `Biblioteca`** — and the six members it would
group are *already tagged* `group: "context"` in the same file. The grouping
exists as data and is not rendered.

**So the real problem is not navigation size; it is that `Mais` is a flat list
of twelve.** That is a narrower, cheaper, more tractable statement.

**Recommendation:** rewrite slice 1.1 as *"render the grouping that already
exists"* and fold most of it into 1.2. Reclaim the estimate. **Do not skip the
renaming** — Início→Hoje and Brain→Conversar are cheap and they matter for the
§2 narrative — but price them as copy, not as an IA rebuild.

### F-2 — Discoverability, not navigation, is the load-bearing problem **(high)**

§3.2 lists "muitos destinos de navegação competem pela atenção" first. Given
F-1, that framing points at the wrong remedy. Twelve flat items behind `Mais` is
not an attention-competition problem — nothing is competing, because nothing is
visible. It is a **retrieval** problem.

The PRD already contains the right answer and ranks it third: **the command
palette (1.3) and global search (1.4) are the highest-leverage items in Etapa
1**, because they make destination count almost irrelevant. §11.6 nearly says
this ("command palette por toque … mantêm acesso sem poluir a barra").

**Recommendation:** promote 1.3 and 1.4 ahead of the Biblioteca work. If only
one Etapa 1 slice ships, it should be search.

### F-3 — Voice is the largest single unknown and is priced like a known **(high)**

Slice 2.5 is estimated 2–3 weeks. It is **entirely greenfield**: no
`MediaRecorder`, no `getUserMedia`, no audio path, no transcription provider,
no audio storage policy anywhere in `src/`.

It also lands on **five** existing contracts at once: BYOK (whose key pays for
Whisper?), the rate limiter (does a transcription consume an AI slot?), storage
quotas, the attachment/job pipeline, and the retention schedule (audio is a new
retained class and **§14.1's signed windows do not name it**).

**And §2.5's own step 8 hides a decision the PRD defers:** *"o usuário deve
saber se o áudio original será mantido ou descartado antes de confirmar"* — that
is a **retention decision**, and §15's Definition of Ready correctly lists it as
requiring owner approval. Good that it is named; it should be named as a
**blocking prerequisite**, not a line in a readiness list.

**Recommendation:** re-estimate to 4–6 weeks, or split: a spike that answers the
five contract questions, then the flow. **Discard-by-default** is the
recommendation if the owner wants the cheapest correct answer — it removes the
retention class, the storage quota interaction, and the privacy surface in one
decision.

### F-4 — Asynchronous capture is under-acknowledged **(medium)**

Since Phase 2X, `captureEntry` persists and returns **immediately**;
interpretation happens in a worker. The UI must express *"saved, thinking"* as a
first-class state, and a worker failure must be recoverable in the UI.

§6.1 lists "estados vazios, carregamento, erro e processamento" and §0.3 lists
"banner de processamento", so the PRD is not blind to it — but it reads as
polish, and it is **architecture**. Every surface that shows an entry inherits
it: Hoje, Registros, Precisa de você, the capture receipt, and the conversation.

**Recommendation:** make the interpreting/failed/retryable state an explicit
Etapa 0 component contract (slice 0.2), so later slices consume it rather than
each inventing one.

### F-5 — Slice 3.6 collides with a dated commitment **(high, and it has a clock)**

**ADR-055 expires 2026-10-27** — the nearest dated commitment in the repository,
about eleven weeks out. It defers semantic retrieval behind a measured evidence
standard whose funnel is currently **empty**.

The PRD's slice 3.6 is that decision arriving from the product side, and §10.3
already warns against "busca semântica antes de fontes e qualidade de
recuperação" — the right instinct, arrived at independently.

**Recommendation:** state the relationship explicitly. Either this initiative
**produces the evidence** ADR-055 wanted (which argues for shipping 1.4's
lexical search early, so a real funnel exists), or the expiry is resolved on
product grounds. Both are fine. Letting the date pass silently is not.

### F-6 — The PRD never mentions cost, and this product is BYOK **(medium)**

Under BYOK the **user** pays for every model call. This initiative adds several
new recurring costs: transcription per capture, semantic embeddings, project
summaries, the daily planner, and contextual suggestions.

§7.3 measures trust; nothing measures **spend**. The product already has a costs
page and an `ai_usage_events` ledger, and the existing invariant is that
**nothing spends a user's money without an explicit act** — which is why nothing
is bulk-processed when a key is activated.

Two slices sit close to that line: **4.5 (planejador diário)** and **3.5
(sugestões contextuais)**, both of which imply proactive model calls.

**Recommendation:** add a principle to §4 — *"proactive AI work is opt-in and
its cost is visible"* — and a §7 metric for per-user cost trend. This is a
product decision, not an engineering constraint, which is why it belongs in the
PRD rather than in a plan.

### F-7 — Estimates assume a team that does not exist **(medium, honesty)**

§8 assumes "2 pessoas de produto/engenharia frontend, 1 backend/IA
compartilhada, 1 designer, apoio parcial de QA". The actual team is **one owner
plus this agent.** §10.1's "14–20 months" is therefore a number for a different
organisation.

The PRD is honest that these are "estimativas de calendário, não compromissos",
and §15.5 asks the owner to approve them "como instrumento de priorização". That
is the correct framing and it should be kept.

**Recommendation:** keep the ranges as *relative* sizing, and delete or
explicitly re-label the absolute calendar totals. A "14–20 months" figure in a
document read six months from now will be treated as a commitment by whoever
finds it.

### F-8 — `exportação de dados` is listed as if it exists **(low, but it is a legal surface)**

§6.3 lists it among privacy-centre contents alongside items that **are** shipped
(consent, deletion, credential, sessions). It does not exist. It is also the
kind of thing a legal reviewer asks about under portability, and the
`RG-LEG-4` packet now records it as planned-not-shipped.

**Recommendation:** mark it explicitly as new, and decide whether it is in this
initiative or routed to the rollout track.

### F-9 — "Empresas" in Biblioteca is `organizations` **(trivial)**

Naming only; the route exists. Worth pinning so the Biblioteca slice does not
discover a rename mid-flight.

### F-10 — Localization debt will be met, unavoidably **(medium, cost)**

**266 inline locale ternaries across 34 files** (UX-22, deferred at product-ux
close). §12 requires copy in both languages for every completed etapa, and the
canonical mechanism is a typed feature `copy.ts`.

Every slice that touches one of those 34 files inherits the conversion for that
surface. This is not a reason to avoid the work — it is a reason to **budget
it** rather than be surprised by it slice after slice.

**Recommendation:** make "the surfaces this slice touches use `copy.ts`" part of
the Etapa 0 definition of done, so the debt is retired incrementally by the work
that would otherwise trip over it.

---

## 3. What the PRD gets right and should not be talked out of

Listed because a review that only finds problems distorts the decision.

1. **§4.7 — "Silêncio também é um resultado."** Rare and correct.
2. **§4.3 — original, interpretation and action are visually distinct.** This is
   the product's core epistemic commitment, and it matches an architecture that
   already never overwrites the original.
3. **Mobile-first as sequencing rather than as a viewport.** §10.3 correctly
   names "entregar desktop e adaptar mobile no final" as a cost multiplier.
4. **Etapa 0 before everything.** Most redesigns skip this and pay for it.
5. **§6.2's rejections**, especially gamification and unrestricted AI autonomy.
   The second is an *alignment with an existing invariant*, not just taste.
6. **§11's risk table.** §11.2 (conversation becoming a widget gallery) and
   §11.4 (voice causing loss of control) are the two failure modes most likely
   to actually occur.
7. **§13's ordering rule** — nothing in the backlog starts before search, Hoje,
   Precisa de você, Conversar, sources and the mobile foundation are stable.
8. **The graph as a secondary tool.** §14 is right, and it is the discipline
   most often lost.

---

## 4. Where the PRD is silent and a plan will need an answer

Not defects — gaps a planning phase must close.

| # | Question | Why it cannot be deferred |
| --- | --- | --- |
| Q1 | **Is the audio original kept or discarded?** | Blocks slice 2.5 entirely: it decides a retention class, a storage quota interaction, and a privacy-policy line. §15.4 already routes it; it should be answered *before* the slice is planned. |
| Q2 | **Which key pays for transcription?** | BYOK holds that the user pays. Whisper under the user's key is consistent; a project key would re-open what ADR-072 closed. |
| Q3 | **Does a transcription consume an AI rate-limit slot?** | PRD §14.2 V-5 signed "background provider-reaching work consumes the owner's AI slot". Voice is new provider-reaching work. |
| Q4 | **Is the daily planner proactive or invoked?** | Decides whether it spends the user's money unasked. See F-6. |
| Q5 | **Does the calendar need a new table?** | It reads tasks, reminders, reviews and extracted dates — all existing. It may need **zero** migrations, which would be a significant finding for the budget. |
| Q6 | **Does memory-conflict detection need schema?** | Almost certainly yes — a conflict is a durable object with a resolution and an audit trail. This is the initiative's most likely genuine migration. |
| Q7 | **Does the initiative open signup?** | §6.1 includes onboarding. Onboarding for whom? The rollout gate is fail-closed and no public user has ever existed. **These must not be quietly coupled.** |

**Q7 is the one to settle first.** It changes what "activation metrics" in §7.1
even mean — today they would be measured over three hand-created accounts.

---

## 5. Definition of Ready — assessment

§15 asks the owner to approve six things. Against this review:

| # | Item | State |
| --- | --- | --- |
| 1 | Direction: mobile-first contextual assistant | **Ready.** Confirmed by the code and by the existing shell. |
| 2 | The new primary navigation | **Ready, and cheaper than assumed** (F-1). |
| 3 | The order of the etapas | **Ready with one amendment** — promote search/palette ahead of Biblioteca (F-2). |
| 4 | Voice flow **and the audio-retention decision** | **NOT ready.** Q1 is unanswered and blocks slice 2.5 (F-3). |
| 5 | Estimates as a prioritisation instrument | **Ready if the absolute totals are re-labelled** (F-7). |
| 6 | Integrations and demo mode out of scope | **Ready.** |

**Plus one the PRD does not list and should: Q7 — does this initiative assume
public signup opens?**

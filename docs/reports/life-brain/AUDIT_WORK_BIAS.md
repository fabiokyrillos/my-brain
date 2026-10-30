# Work-bias audit — My Brain as a whole-life brain

Repo: `D:\Projetos\GitHub\my-brain` @ `main` (b38d656). Read-only audit; no repo file was modified. Every claim below is cited `file:line`. Where a claim is an inference about model behaviour (section 3) it is marked **inferred** — no extraction call was executed.

Two pre-existing, **uncommitted** life-brain artifacts exist in the working tree: `e2e/online-life-brain-baseline.spec.ts` and `docs/reports/life-brain/evidence/baseline/` (52 PNGs + `measurements.json`). `git status` lists both as `??`; `docs/initiatives/life-brain/` does not exist. The baseline spec's technical-vocabulary scan found only `interpretação` (9 routes), `embedding` (4), `tokens` (2), `interpretation` (2), `nan` (4) — it does not measure work vocabulary.

---

## 1. Extraction contract

### 1.1 Source of truth — `src/lib/ai/extraction-schema.ts`

Concept enum, verbatim (`extraction-schema.ts:36-56`):

```
"raw_record", "completed_activity", "task", "subtask", "reminder", "appointment",
"reference", "decision", "idea", "person_note", "project_note", "pending_question",
"blocker", "dependency", "status_update", "lasting_preference", "personal_memory",
"request_received", "waiting_for_third_party"
```

There is **no entity-type enum in the schema**: entity *types* are the four array fields of `entryExtractionSchema` (`:81-94`): `contexts`, `organizations`, `projects`, `people`, each an array of `entityCandidateSchema` `{ name, confidence, evidence, inferred }` (`:58-63`). The database pins the same four: `entry_entities.entity_type in ('context','organization','project','person')` (`supabase/migrations/202607160003_intelligent_capture.sql:93`), mirrored in `supabase/functions/_shared/entity-resolution.ts:13`.

Other fields (`:65-94`): `taskCandidateSchema { title, description|null, dueAt (storable instant)|null, waitingOn|null, parentIndex|null, confidence, explicit }`; `pendingQuestionSchema { question, reason, confidence }`; root `{ language: "pt-BR"|"en", occurredAt, isRetroactive, summary, concepts (min 1), contexts, organizations, projects, people, taskCandidates, pendingQuestions, confidence }`.

**Absent from the contract:** sensitivity, life area/domain, places/locations, amounts/currency, event start–end, recurrence, people roles/specialties, memory proposals. `occurredAt` is the only date the entry itself carries; `dueAt` lives only inside task candidates.

### 1.2 Worker copy — `supabase/functions/process-jobs/entry.ts`

- Versions: `EXTRACTION_STRATEGY_VERSION = "entry-extraction-v1"`, `EXTRACTION_PROMPT_VERSION = "2026-08-22.1"` (`entry.ts:53-54`; Node twin `src/lib/ai/openai-provider.ts:75-76`).
- `CONCEPTS` list (`entry.ts:87-92`) and a hand-written JSON Schema with `strict: true` and every field `required` (`entry.ts:106-135`, sent at `:312-319`).
- The call (`entry.ts:289-321`): `reasoning.effort = "low"`, system = `SYSTEM_PROMPT`, user = `Locale`, `IANA timezone`, `Current time`, `Known user context` (existing contexts/organizations/projects/people, `:279-284`), then `<entry>…</entry>`.
- Validation path: `normalizeExtractionInstants` → `validateExtraction` (`entry.ts:361-373`) from `supabase/functions/_shared/extraction-validation.ts` (`EXTRACTION_CONCEPTS :29-49`, `validateExtraction :390`).
- Embedding: `summary + "\n\n" + original_content` → `/v1/embeddings` (`entry.ts:398-416`), independent of any classification.

### 1.3 The prompt, and where it steers toward work (`entry.ts:56-85`; byte-identical in `openai-provider.ts:100`)

Neutral parts: "You extract personal knowledge and possible actions from one user entry." (`:56`); truth rules `:58-69` (no invention, `dueAt` null unless defensible, pending question on ambiguity, instants with offset).

Work-leaning parts, quoted:

- `:72` people — "A role, a pronoun or a group is not a name." (fine) — but `:73` organizations: **"companies, clients, institutions, schools, public bodies — something a person can belong to or work for."**
- `:74` projects: **"a named, continuing body of work the entry treats as a thing in its own right. A deliverable somebody is asking for is not a project"**.
- `:75` contexts: **"the area of life or work the entry belongs to, such as Trabalho, Casa, Saúde or Estudos."** — the one explicitly life-aware line (but see §2(a): the worker cannot create a context it names).
- `:77` **"a name you cannot place in any of them is not extracted at all."** — a city, a clinic, a shop, a product, a medication has no field and is dropped by rule.
- `:79-83` every worked example is corporate: *"Preciso montar a apresentação de resultados pro Túlio. Ele é da Vale."*, *"Reunião do Projeto Aurora com a Marina"*, *"Assinei o contrato com a Ambev"*, *"Falar com o pessoal do jurídico"*.
- `:63` the only explicit-command examples are "crie uma tarefa" / "me lembre".

The concept vocabulary itself is half project-management: `blocker`, `dependency`, `status_update`, `request_received`, `waiting_for_third_party`, `project_note`, `subtask`. Life-side members exist (`appointment`, `idea`, `lasting_preference`, `personal_memory`, `completed_activity`, `reference`) but, per §3, none of them triggers any product behaviour beyond a label chip.

The remote classification lane `src/lib/ai/extraction-classification.remote.test.ts` samples only work sentences: `:213` (Sweepstakes report / Royal Caribbean), `:322` (Latam Airlines contract), `:341` (jurídico). The parity corpus base is "Reunião com Ana sobre o relatório trimestral" with context `Trabalho` (`src/lib/ai/extraction-parity.test.ts:26-28`).

### 1.4 How a parity change must be done

Two independent guards, both in the Vitest CI job:

1. **`src/lib/ai/extraction-parity.test.ts`** is *behavioural*: a ≥110-case corpus goes through `entryExtractionSchema.safeParse` and `validateExtraction`; accept/reject must agree and normalized values must be `toEqual` (`:276-298`). So any new field or enum member must be added to **both** `src/lib/ai/extraction-schema.ts` and `supabase/functions/_shared/extraction-validation.ts` (+ `extraction-normalization.ts` if it is an instant), and the corpus extended.
2. **`src/lib/ai/extraction-contract.test.ts`** is *textual*: it reads both source files and asserts the `SYSTEM_PROMPT` template literal in `entry.ts` equals the `systemPrompt` literal in `openai-provider.ts`, and that `EXTRACTION_PROMPT_VERSION` / `EXTRACTION_STRATEGY_VERSION` match (`:35-50`). It also pins prompt content: the four `- people:/organizations:/projects:/contexts:` definitions (`:109-114`), "named for the first time" and "not the set of people you are allowed to return" (`:116-123`), "task title is never a project" (`:125-127`), "attaches a person to an organization produces both" (`:129-131`), "Never invent names", "Evidence must be a short phrase grounded in the entry.", "add one short pending question", "add a pending question rather than choosing a name" (`:133-141`), an `Examples of that line:` block containing `people: <Name>. organizations: <Name>`, `people: none, because naming a company names no person`, `people: none, because no individual is named` (`:143-156`), and forbids the tokens `garo`, `royal caribbean`, `sweepstakes` (`:166-172`).

Therefore a life-aware prompt edit = edit `entry.ts:56-85` **and** `openai-provider.ts:100-…` identically, bump `EXTRACTION_PROMPT_VERSION` in both (`entry.ts:54`, `openai-provider.ts:76`), keep every pinned sentence/pattern above, and extend (not replace) the examples block. A schema change additionally touches `entry.ts:87-135` (strict JSON Schema: new fields must be in `required`), the two validators, and the persist RPCs (§6) — although the full extraction JSON is already stored verbatim as `entry_interpretations.raw_output` (`202607170028_phase_2x_candidate_action_consistency.sql:227`), so new fields survive in `raw_output` even before they are columnised.

---

## 2. Data model

59 public tables (`src/lib/supabase/database.types.ts`); the relevant ones:

| Table | Columns that matter here | Source |
|---|---|---|
| `contexts` | `name`, `kind` CHECK `('work','personal','custom')` default `custom`, unique `(user_id, lower(name))` | `202607160003:1-10`; types `:677` |
| `organizations`, `projects` (`status` active/paused/completed/archived, `organization_id`), `people` (`name`, `notes`, `organization_id`) | | `202607160003:12-45`; types `:1798,:2256,:1905` |
| `entries` | `original_content`, `occurred_at`, `is_retroactive`, `sensitivity` (normal/private/highly_sensitive), `source` (`web,chat,whatsapp,gmail,calendar,import,api`), `status` | `202607160003:46-62`; types `:974` |
| `entry_interpretations` | `concepts text[]`, `extracted_dates jsonb`, `extracted_{contexts,organizations,projects,people} jsonb`, `task_candidates jsonb`, `pending_questions jsonb`, `is_record_only`, `element_*` trust, `raw_output` | types `:1219` |
| `tasks` | `status` CHECK `inbox,todo,in_progress,waiting,blocked,deferred,completed,cancelled`; `due_at`, `planned_at`, `intentional_no_due`, `no_due_reason`, `waiting_on_person_id`, `manual_priority`, `dynamic_priority`, `parent_task_id`, `source_entry_id`, `candidate_index`, `completed_at`, `cancelled_at` | `202607160003:103-127`; types `:2883` |
| `task_people` (role, incl. `waiting_on`), `task_projects`, `task_contexts`, `task_dependencies`, `person_contexts`, `person_projects`, `person_relationships` | | `202607160009:6-47` |
| `reminders` | `remind_at`, `task_id`, `entry_id`, `series_id`, `important`, `snoozed_until`, `status` scheduled/sent/snoozed/cancelled; `reminder_series` (2R) | `202607160007:33-49`; types `:2423`; `202608230101:500` |
| `memories` | `kind` CHECK `preference,relationship,responsibility,rule,recurring_info,professional_context,habit,restriction,goal,fact`; `sensitivity`; `valid_from/valid_until`; `person_id`, `project_id`, `embedding` | `202607160006:3-25`; types `:1542` |
| `tags`, `entity_tags` (`entity_type` free text, ownership by trigger) | | `202607160009:48-58`; types `:2606,:932` |
| `summaries` | `period_type`, `period_start`, `period_end` (reviews) | types `:2552` |
| `pending_questions`, `entry_person_candidate_resolutions`, `entity_aliases`, `attachments`, `entity_attachments` (`entity_type` CHECK includes `conversation,decision,activity` with no matching tables) | | `202607160007:13-32,118-127`; `202608160095:3` |

Grep results: no `create type … as enum` anywhere; no `life_area`, `domain`, `category`, `location`, `place`, `address`, `start_at/end_at`, `all_day` column in any migration (only prose comments matched). Public `Enums` block in types is empty (`database.types.ts:4049-4051`). Concept values are **not** pinned by a DB CHECK — `concepts` is `text[]`, only its length is bounded (`202607170028:345-346`), and the bounds migration says so explicitly: "The database does not learn which fields are required, which concepts exist" (`202607250053_pre_2e_ai_interpretation_bounds.sql:21`).

### Answers

**(a) Life area / domain.** The only notion is `contexts.kind ∈ {work, personal, custom}` plus the free-form context name. The product copy frames contexts exactly that way: *"Âmbitos que separam o que é trabalho do que é pessoal."* (`src/features/entities/copy.ts:292`, kinds `:300`) — although the Library page already says *"Áreas da sua vida."* (`src/features/library/copy.ts:64`). Crucially, **the worker cannot create a context**: since `202607170020`, `persist_resolved_entry_entities` only links entities that already resolve exactly by normalized name or alias (`resolve_owned_entity_exact`, `202607170020_interpretation_revisions.sql:335-381`) — `if resolved_id is not null then insert into entry_entities` (`:417-428`), otherwise the mention is silently dropped. The original auto-create with the `Trabalho→work / Pessoal→personal / else custom` mapping lives only in the superseded `202607160005_persist_interpretation_rpc.sql:58-66`. People got a confirmable-suggestion path later (`202608160095`), contexts/projects/organizations did not. So the prompt's "Saúde" example (`entry.ts:75`) produces a link only if the user hand-created a context named Saúde.

**(b) Events with a period.** None. The calendar is explicitly "a reading" over five existing sources and states *"there is **no event entity** (OD-2M-3 A refused one), no new table, no new column"* (`src/features/calendar/calendar-projection.ts:41-51`); lanes are `tasks.due_at` (Prazos), `tasks.planned_at` (Intenção), `reminders.remind_at`, `summaries` period, and an unconfirmed `entries.occurred_at` "suggestion" dot rendered with `title: null` (`:238-278`, `:440-452`). The `appointment` concept has no consumer besides labels (`src/features/interpretations/copy.ts:83`, `src/features/daily-cycle/technical-details.tsx:125`). `extracted_dates` is always written as exactly one element `{value: occurred_at, label: 'occurred_at'}` (`202607170028:228`); only the manual revision editor can add more (`interpretations/copy.ts:36-39`).

**(c) Past fact vs future pending.** Representable but thin: a past fact is an entry with `occurred_at` (+ `is_retroactive`) and concepts such as `completed_activity`; a pending item is a `taskCandidate` with `dueAt` that becomes a `tasks` row only after confirmation (`confirm_entry_task_candidates`, `202607160009:100-128`). The UI collapses the "fact" case into `isRecordOnly` = "ready and no valid task candidates" (`src/features/daily-cycle/projection-mappers.ts:336`), labelled *"Só registro"* / *"nada a fazer"* (`src/features/daily-cycle/records-copy.ts:105,120`). There is no journal/timeline surface for facts, and no automatic memory from `personal_memory`/`lasting_preference`: no migration inserts into `memories` except a deletion-restore (`202608140094:763`); memories are written only by the user (`src/features/memories/actions.ts:216-245`) or proposed by the assistant composer (`src/features/assistant/memory-proposal.ts`).

**(d) Locations / places.** None — no column, no extraction field, and the prompt rule at `entry.ts:77` drops any name that is not a person/org/project/context.

---

## 3. Where each phrase lands today (**inferred** from prompt + schema + persistence + UI; not executed)

Common to all: the entry is saved first (`capture_entry_async`), interpreted by the worker, embedded (`entry.ts:407`) and therefore **findable in Conversar via `match_internal_knowledge`** (`202608130093_phase_2n_slice_3_validity_aware_retrieval.sql:98-109`, entries + memories, no sensitivity predicate) and in Buscar; shown in Registros (`/app/inbox`) and in History. `entries.sensitivity` stays `'normal'` for every one of them (no writer exists — §5).

| Phrase | Likely concepts | Entities | Task candidates / dates | What is lost | Lands on |
|---|---|---|---|---|---|
| "Fui no médico hoje, Dr. Silva, cardiologista" | `completed_activity`, `person_note` | people: *Dr. Silva* (prompt `:72` treats a name as enough); becomes a **person candidate suggestion** for the user to confirm (`202608160095`); contexts: maybe *Saúde* → dropped unless pre-created | none; `occurredAt` = now | specialty "cardiologista" (no role/notes field written by extraction), health domain, that it is a visit | Registros as "Só registro"; a title-less suggestion dot on today's calendar; chat finds the text |
| "Preciso fazer o exame de sangue até sexta" | `task` | none | 1 candidate, `dueAt` = Friday 23:59:59 local (`entry.ts:66`), `explicit=false` → needs confirmation | health domain; no context link; no reminder (the `reminder` concept is inert; reminders come only from task commands/series, `202607260058:1374`, `src/features/reminders/series-actions.ts:180`) | after confirm: `/app/work` (**"Trabalho"**), Hoje on Friday, calendar "Prazos" lane; chat yes |
| "Tenho um evento dia 12" | `appointment` (+ probably a pending question "qual evento?") | none | no task; `occurredAt` either now or the 12th — the prompt only defines occurredAt for "when no date is stated" (`:64`) | the event itself: title, time, duration, place; nothing is scheduled | Registros; at best a `title: null` suggestion dot on the 12th (`calendar-projection.ts:448`); no reminder; chat yes |
| "Vou viajar pra Lisboa de 3 a 10 de dezembro" | `appointment`/`raw_record` | *Lisboa* fits no field → dropped by `:77`; no org/project | no task (prompt forbids inventing work); a single `occurredAt` cannot hold a range | the period, the destination, any prep checklist | Registros only; calendar shows nothing for 3–10 Dec (one suggestion dot at most); chat yes |
| "Paguei R$ 350 de conta de luz" | `completed_activity` | none (utility unnamed); *Casa*/*Finanças* context only if pre-created | none | amount, currency, category, recurrence, that it is finance (remains `normal` sensitivity → fully visible in chat/search) | Registros "Só registro"; chat yes |
| "Ideia: app pra organizar receitas" | `idea` | projects: none (`:74` "named, continuing body of work") | none | nothing structural is kept; no Ideas surface exists (nav list `src/i18n/messages.ts:17-89` has none) | Registros with an "Ideia" chip in technical details; chat/search yes |
| "Ana faz aniversário em 5 de maio" | `person_note` (+ maybe `reminder`) | people: *Ana* linked if she exists, else a person suggestion | no task; date may land in `occurredAt` (5 May) or nowhere; no recurrence in the contract | the birthday as a durable recurring fact; no reminder/series; `people.notes` is never written by extraction | Registros; chat yes (text only) |

Fixtures and seeds are work-domain throughout: contrato/relatório/reunião/Aurora/Atlas/Vale/Ambev/Royal Caribbean/Latam/jurídico (`src/features/daily-cycle/inbox-projection.test.ts:30`, `attention-projection.test.ts:46`, `agent/question-preview-projection.test.ts:44`, `e2e/online-account-suspension.spec.ts:155`, `e2e/online-phase-2p-reviews.spec.ts:100`, `e2e/online-question-outcome.spec.ts:95`, `scripts/remote-*`). Life-domain exceptions: `src/features/conversation-sources/resolve-sources.test.ts:72` ("resultado do exame", the only `highly_sensitive` fixture), `scripts/remote-entry-processing-smoke.mjs:354` ("buy milk tomorrow…"), the memories placeholder "prefiro reuniões pela manhã" (`src/features/memories/copy.ts:211`).

---

## 4. Work-biased copy

| file:line | copy | why it reads work-only |
|---|---|---|
| `src/i18n/messages.ts:31` / `:112` | nav `work: "Trabalho"` / `"Work"` | the whole task list is named *Work*; a blood test lives under "Trabalho" |
| `src/features/daily-cycle/work-view.tsx:28-36` | `eyebrow: "EXECUÇÃO"`, `title: "Trabalho"`, `"Visões de Trabalho"`, waiting: *"Tarefas que dependem de outra pessoa."*, `waitingNote: "Contexto de pessoas e follow-up completo…"` | execution/follow-up framing |
| `src/features/daily-cycle/work-modes.tsx:30` | *"Modos de Trabalho"* | ditto, on the calendar too |
| `src/features/shell/home-copy.ts:165,176` | *"Aguardando outras pessoas"*, *"Ver todo o trabalho"* | Home CTA says "work" |
| `src/features/daily-cycle/copy.ts:132` / task-detail-copy `:68` | *"Ver seu trabalho"*, back link *"Trabalho"* | |
| `src/i18n/messages.ts:54` / `:118`, `src/features/entities/copy.ts:256-290,362-376`, `src/features/search/copy.ts:55`, `src/features/agent/automation-copy.ts:88` | organizations = *"Empresas" / "Companies"*, *"Nova empresa"*, *"Empresa criada e vinculada."* | a clinic, school, gym, bank or airline is an "Empresa" |
| `src/features/library/copy.ts:61-63` | people *"Quem aparece no seu trabalho."*, projects *"No que você está trabalhando."*, organizations *"Empresas e clientes."* | Library describes every lens through work |
| `src/features/entities/copy.ts:292,300` | *"Âmbitos que separam o que é trabalho do que é pessoal."*, kinds Trabalho/Pessoal/Personalizado | binary work/personal taxonomy |
| `src/features/palette/copy.ts:50,56` | work synonyms `["trabalho","tarefas","todo","aguardando","pendencias"]`; organizations `["empresas","organizacoes","clientes"]` | |
| `src/features/interpretations/copy.ts:96` + concept enum | *"Aguardando terceiro"*, Bloqueio, Dependência, Atualização, Pedido recebido, Nota de projeto | PM vocabulary surfaced to the user |
| `supabase/functions/process-jobs/entry.ts:73-83` (= `openai-provider.ts`) | org definition "companies, clients…work for"; examples Vale/Aurora/Ambev/jurídico | model is taught only corporate cases |
| `src/features/memories/copy.ts:211,258` | placeholder *"prefiro reuniões pela manhã…"*; kind *"Contexto profissional"* (no "contexto de saúde/família") | |
| `src/features/task-commands/copy.ts:485,500` | *"marque a tarefa do relatório como feita"*, *"a nota fiscal da Acme"* | command examples are office tasks |
| `src/features/entities/copy.ts:350` | role placeholder *"revisora do contrato"* | |
| `src/features/entry/copy.ts:51` | *"separa tarefas, pessoas, projetos e datas"* | landing claim omits events, places, health, money |
| `src/features/capture/composer-copy.ts:39` | *"Registre uma tarefa, decisão, conversa ou ideia…"* | task/decision-first (mild) |
| `docs/PRD.md:11,16` | *"Prevent work from disappearing…"*; first user "manages professional and personal contexts at once" | the PRD already asks for both; the vocabulary followed only one |

Genuinely life-neutral today: Home sections *"Precisa de você"*, *"Hoje e atrasado"*, *"Adiante"*, *"Encerrar o dia"* (`home-copy.ts:119-147`); calendar *"Prazos"/"Intenção"* (`calendar/copy.ts:123`); memories kinds `habit`, `goal`, `restriction`, `rule`; relationship types include spouse/partner/parent/child/sibling/friend (`src/features/entities/relationship-vocabulary.ts:66-81`); Library *"Áreas da sua vida."*; chat *"Pergunte sobre o que você já registrou."* (`src/app/[locale]/app/chat/page.tsx:141`); onboarding steps (`src/features/onboarding/copy.ts:42-79`); assistant copy (`src/features/assistant/copy.ts:72-99`).

---

## 5. Sensitivity & privacy

- Levels: `normal | private | highly_sensitive`, CHECKed on `entries` (`202607160003:53`), `memories` and one more chat_memory table (`202607160006:13,45`), `attachments` (`202607160007:111`); mirrored as `SENSITIVITY_LEVELS` (`src/features/sensitivity/contracts.ts:42`). Those **five column definitions are the only `sensitiv*` matches in all 103 migrations** — no RPC, view or retrieval function filters by it.
- **Detection: none.** The extraction contract has no sensitivity output; no product code writes `entries.sensitivity` (grep for updates/inserts setting it found only a test contract literal, `src/features/conversation-cards/contracts.ts:248`). The only writer in the product is the memory edit form (`src/features/memories/actions.ts:216-245`, `memory-edit-form.tsx:225-232`). Every captured entry — a diagnosis, a salary, a bill — is `'normal'`.
- Presentation contract (`contracts.ts:1-39`, rules `:210-226`): `highly_sensitive` is **masked in place, revealable** on attention/Hoje, chat, work, calendar; `private` is shown; notifications `omit` content (`:36-38`, `notificationCopy :274`). Search excludes `highly_sensitive` by default behind an explicit scope (`src/features/search/actions.ts:33,113,205-208`; `contracts.ts:12-22`). Tasks and reminders have no column and derive from the source entry at render time, failing closed to `highly_sensitive` when the source is unreadable (`src/features/sensitivity/task-derivation.ts`; `work-projection.ts:323-361`; `calendar-projection.ts:68-70,155-170`).
- Embeddings and chat retrieval ignore classification entirely: the embedding text is summary + original (`entry.ts:407`); `match_internal_knowledge` (`202608130093:89-119`) has no predicate; chat masks only at render by re-reading the current level (`contracts.ts:52-63`; `src/features/chat/actions.ts:294-307`).
- Push: payload carries at most a reminder title resolved inside the sender (`supabase/functions/_shared/notification-payload.ts:21-23`; heartbeat `202610280103_notify_heartbeat_destination.sql:190-216`). Whether the derived sensitivity of the reminder's source entry is consulted before putting that title on a lock screen was **not verified**.
- A "health" life area would need: (1) a writer for `entries.sensitivity` — deterministic (life area → default `private`) or user-set at capture/review — because today no classification is ever assigned; (2) a decision on retrieval (embedding/chat currently include everything, search excludes only `highly_sensitive`); (3) reminder titles for health tasks, since the push path is title-bearing since ADR-143/144; (4) the existing derivation to tasks/reminders/calendar then works unchanged.

---

## 6. Constraints and a minimal extend-not-replace proposal

**What a schema change costs here**

- 103 append-only migrations (`docs/ENGINEERING_STANDARDS.md:27`); regenerate `src/lib/supabase/database.types.ts` in the same slice (`:16,:35`; `docs/DATABASE.md:64` `supabase gen types typescript --linked`).
- 75 pgTAP files; 25 already touch `entry_interpretations`/the persist RPC (e.g. `supabase/tests/entry_interpretation_worker.sql`, `interpretation_revisions.sql`, `candidate_action_consistency.sql`, `ai_interpretation_bounds.sql`). CI `database` job: `db reset` over the whole chain + pgTAP + `supabase db lint --schema public,private` + foundation e2e.
- Parity: both validators + both prompts + both version constants (§1.4), plus `src/lib/ai/extraction-schema.test.ts` and the ≥110-case corpus.
- Persist RPCs are `create or replace` of multi-hundred-line functions: `persist_entry_interpretation` / `persist_reprocessed_entry_interpretation` / `correct_entry_interpretation` (latest `202607170028`), `persist_resolved_entry_entities` (`202607170020:383`). Any new columnised field is a new migration redefining them.
- Deployed enum pins (memory note *a-feature-vocabulary-can-be-pinned-by-a-deployed-enum*; `private.require_product_event_enum`): `product_events` event names and property enums (`surface`, `orientation`…) are DB constraints — a new "life" surface or event name costs a migration (`docs/CHANGELOG.md:4099`). Domain CHECKs that would need widening: `contexts.kind` (`202607160003:6`), `memories.kind` (`202607160006:9`), `tasks.status` (`202607160003:111`), `reminders.status`, `entries.source` (`:50`).
- Governance: `docs/DECISIONS.md` ends at **ADR-144** (`:2191`; 146 `## ADR-` headings including amendments). OD-2M-3 A explicitly refused an event entity (`calendar-projection.ts:50`), so events need an ADR that supersedes it. A new initiative must create `docs/initiatives/life-brain/` **and** `docs/reports/life-brain/` before its first file (taxonomy guards).

**Minimal model (reuse first)**

1. **Life area = `contexts`.** Widen `contexts.kind` CHECK to a small closed vocabulary (`work, personal, health, finance, home, family, travel, learning, custom`) — one migration; and restore auto-linking for contexts by either (i) auto-creating contexts the model names (they are low-risk, unlike people — the superseded logic at `202607160005:58-66` is the template, extended with a name→kind map for Saúde/Finanças/Casa/Família/Viagem/Estudos) or (ii) reusing the person-suggestion pattern (`202608160095`) for context candidates. Tasks already carry `task_contexts`; entries carry `entry_entities`. Filters on Work/Calendar already group by context (`work-projection.ts:542`).
2. **Events with period = new `events` table**, because nothing existing holds a start–end: `(user_id, id, title, starts_at, ends_at, all_day, location text, context_id, source_entry_id, source_interpretation_id, status, created_by)` with the usual composite-FK/RLS/undo conventions; extraction gains `eventCandidates[]` `{ title, startsAt, endsAt|null, allDay, location|null, confidence, explicit }` confirmed like task candidates (idempotent RPC + undo row); the calendar gets a sixth lane in `calendar-projection.ts`. Cheapest precursor without a table: have the persist RPC write real `extracted_dates` entries (the `{value,label}` jsonb shape already exists) from a new `dates[]` extraction field, so "dia 12" and "3–10 de dezembro" at least appear as dates on the entry.
3. **Past fact vs pending = already representable; add a reading.** Keep `completed_activity` + `occurred_at` as the fact signal and `taskCandidates` as the pending signal; replace the "Só registro / nada a fazer" framing with a fact/journal projection (new mapper over existing columns, zero migration), and route `personal_memory`/`lasting_preference` concepts into the existing assistant memory-proposal path rather than auto-writing `memories`.
4. **Sensitivity** — do not let the model classify alone: derive a default (`health`/`finance` context → `entries.sensitivity = 'private'`) inside the persist RPC, expose a user override, and keep the presentation contract as is.
5. **Prompt** — add life examples alongside the corporate ones, define contexts with the kind vocabulary, and say explicitly that a city/clinic/shop belongs in `location`/context rather than being dropped; bump `EXTRACTION_PROMPT_VERSION` in both runtimes.

**Not verified:** actual model output for the seven phrases; whether any UI writes `tags`/`entity_tags`; whether the push sender consults derived sensitivity before sending a reminder title; the exact body of `confirm_entry_task_candidates_v5` beyond the relation-linking shown in `202607160009:100-128`.

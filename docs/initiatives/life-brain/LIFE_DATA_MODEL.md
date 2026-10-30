# Life Brain — Modelo de dados para a vida inteira

Status: governing artifact (ADR-145). Cada coluna e tabela nova tem justificativa; a regra é **estender o que existe**. Estado atual em `docs/reports/life-brain/INVESTIGATION.md` §3 e `AUDIT_WORK_BIAS.md` §2.

## 1. O que existe e é reaproveitado

| Necessidade | Já existe | Como é reaproveitado |
| --- | --- | --- |
| Fato passado ("fui ao médico") | `entries.occurred_at`, `entries.is_retroactive`, conceito `completed_activity`, `entry_entities` → pessoas | Nada novo. Ganha área da vida (§2) e uma projeção "linha do tempo" por área. |
| Pendência futura ("preciso fazer o exame") | `taskCandidates` → `tasks` confirmadas, `tasks.due_at`, lembretes por trigger | Nada novo. Ganha área da vida via `tasks.context_id` já existente (`task_contexts`). |
| Pessoa com papel ("Dr. Silva, cardiologista") | `people`, `people.notes`, sugestões confirmáveis (`202608160095`) | A extração passa a devolver `role`; a confirmação grava em `notes`. Sem coluna nova. |
| Área da vida | `contexts` + `contexts.kind CHECK ('work','personal','custom')`, `task_contexts`, `entry_entities(kind='context')` | **Amplia o CHECK** (§2). Um contexto por área. |
| Memórias duradouras ("prefiro…", "Ana faz aniversário…") | `memories` (kind, validade, vetor) | Conceitos `lasting_preference`/`personal_memory` passam a gerar **proposta** de memória (caminho que já existe no assistente), não só chip. |
| Sensibilidade | `entries/memories/attachments.sensitivity` | Passa a ter **escritor**: padrão por área na RPC de persistência (§4). |
| Busca | `match_internal_knowledge`, `/app/search` (`ilike`) | A RPC ganha janela de datas (§5); a busca textual é reutilizada pelo chat. |

## 2. Área da vida — ampliar `contexts.kind`

**Decisão:** área da vida é um `context` com `kind` num vocabulário fechado, um por área por usuário, criado sob demanda.

```sql
-- migration LB-M1 (append-only)
alter table public.contexts drop constraint contexts_kind_check;
alter table public.contexts add constraint contexts_kind_check check (
  kind in ('work','personal','custom',
           'health','family','home','finance','travel','study','leisure','ideas')
);
create unique index if not exists contexts_user_area_unique
  on public.contexts (user_id, kind) where kind not in ('custom');
```

- `work` e `personal` continuam válidos (compatibilidade; `personal` vira "Pessoal — geral").
- `private.ensure_life_area_context(p_user_id, p_kind)` (SECURITY DEFINER, `search_path` seguro, `service_role` apenas) devolve o `context_id` da área, criando-o com o nome localizado padrão se não existir. O worker chama na persistência quando `lifeArea.confidence ≥ 0.6`.
- Justificativa de não criar tabela `life_areas`: contextos já são vinculáveis a registros e tarefas por tabelas de junção com ownership comprovada; uma tabela nova exigiria duas junções novas, políticas, grants e pgTAP equivalentes para representar a mesma coisa.

**Extração:** o schema ganha `lifeArea: { kind: enum, confidence: number } | null`; o prompt define cada área com 1 frase e exemplos de vida; validador de ambos os runtimes e corpus de paridade atualizados; `EXTRACTION_PROMPT_VERSION` e `STRATEGY_VERSION` sobem juntas.

## 3. Eventos com período — nova tabela `events`

**Decisão:** uma tabela `events`, porque nenhuma coluna existente representa "algo que acontece de X a Y" (OD-2M-3 A recusou a entidade quando o calendário só projetava tarefas e lembretes; a necessidade mudou e o ADR-145 supera aquela decisão).

```sql
-- migration LB-M2 (append-only)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  starts_at timestamptz not null,
  ends_at timestamptz check (ends_at is null or ends_at >= starts_at),
  all_day boolean not null default false,
  location text check (location is null or char_length(location) <= 240),
  context_id uuid,
  source_entry_id uuid,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_context_owned foreign key (user_id, context_id) references public.contexts (user_id, id),
  constraint events_source_owned foreign key (user_id, source_entry_id) references public.entries (user_id, id)
);
alter table public.events enable row level security;
alter table public.events force row level security;
-- políticas owner-only para authenticated (select); escrita só por RPC validada
```

- **Candidatos:** a extração devolve `eventCandidates[] { title, startsAt, endsAt?, allDay, location?, confidence, explicit }` gravados em `entry_interpretations.raw_output` (já guarda o JSON inteiro) e expostos pela projeção de Registros como candidatos confirmáveis — mesma UX das tarefas. A confirmação chama `confirm_entry_event_candidates` (idempotente, grava auditoria e undo como `confirm_entry_task_candidates_v5`).
- **Calendário:** sexta faixa `event` na projeção, com período desenhado como barra em Semana/Mês.
- **Viagem:** é um evento `all_day` com `ends_at`; "o que está ligado" = registros e tarefas com área `travel` cujo `occurred_at`/`due_at` cai no intervalo ± 7 dias. Sem tabela de ligação; é uma consulta.
- **Sensibilidade:** derivada do `source_entry_id` como tarefas já fazem (`work-sensitivity derives from source entry`).

## 4. Sensibilidade por área

Na RPC de persistência da interpretação, após resolver `lifeArea`:

```
health, finance  -> entries.sensitivity = 'private'   (se ainda 'normal')
outras           -> inalterado
```

O usuário pode subir para `highly_sensitive` ou baixar para `normal` no registro. O chat passa a respeitar (`LB-B-010`); o push já omite conteúdo exceto título de lembrete — o título de um lembrete derivado de tarefa de saúde passa a ser genérico ("Você tem um lembrete de saúde").

## 5. Recuperação

`match_internal_knowledge` ganha `p_since timestamptz default null, p_until timestamptz default null` aplicados a `entries.occurred_at` e `memories.valid_from`, e a ordenação continua por similaridade; o re-rank por recência é feito na aplicação quando a pergunta tem marcador temporal. A função é recriada inteira (regra do repositório: extrair o corpo e comparar por teste de paridade, como ADR-144 Decision 2). Opcional na mesma migration: índice `entries (user_id, occurred_at desc)` se não existir.

Tarefas, lembretes, pessoas e arquivos entram no chat por **busca textual na aplicação** (reaproveitando `search/actions.ts`), não por vetor: são curtos, estruturados e mudam de estado; a verdade está nas colunas.

## 6. Orçamento de migrations

| Migration | Conteúdo | Slice |
| --- | --- | --- |
| LB-M1 | `contexts.kind` ampliado; índice único por área; `private.ensure_life_area_context`; sensibilidade por área na RPC de persistência | C.1 |
| LB-M2 | tabela `events` + RLS + `confirm_entry_event_candidates` + undo + auditoria | C.3 |
| LB-M3 | `match_internal_knowledge` com janela de datas | B.3 |

Três migrations no total; uma quarta é condição de parada. Nenhuma é aplicada no projeto hospedado sem autorização do dono para aquele PR (LB-X-002). Cada uma vem com pgTAP (estrutura, RLS, negação cross-user, idempotência), `supabase db lint`, `database.types.ts` regenerado e os testes de paridade da extração.

## 7. O que deliberadamente não é criado

- `life_areas` como tabela (§2).
- `facts` como tabela — um fato é um registro com data e área.
- `trips` como tabela — é um evento com período e uma consulta.
- `ideas` como tabela — é uma lente por conceito.
- `amounts`/`transactions` — fora de escopo nesta iniciativa; o valor fica no texto e é encontrável.

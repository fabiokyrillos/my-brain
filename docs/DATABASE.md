# Database Design

## Convenções

Todas as entidades do usuário carregam `user_id uuid not null`; horários usam `timestamptz`; conteúdo original é imutável por trigger; relações relevantes são normalizadas. RLS é habilitada e forçada, com políticas explícitas de select, insert, update e delete.

## Tabelas implementadas

- Identidade: `profiles`, `agent_preferences`.
- Conhecimento: `contexts`, `organizations`, `projects`, `people`, `person_relationships`, `person_contexts`, `person_projects`, `tags`, `entity_tags`.
- Captura: `entries`, `entry_interpretations`, `entry_entities`.
- Trabalho: `tasks`, `task_dependencies`, `task_people`, `task_projects`, `task_contexts`, `reminders`, `pending_questions`.
- Inteligência: `memories`, `entry_embeddings`, `conversations`, `conversation_messages`.
- Conteúdo: `summaries`, `attachments`, `attachment_interpretations`, `entity_attachments`.
- Controle: `notifications`, `audit_logs`, `undo_operations`, `heartbeat_runs`, `jobs`.

## Regras importantes

- `created_at` é ingestão; `occurred_at` é o momento do fato.
- Capturas retroativas marcam revisões sobrepostas como `outdated`.
- Pessoas, projetos e contextos que aparecem juntos criam associações temporais atuais.
- Tarefas confirmadas preservam `candidate_index`, hierarquia e vínculos normalizados.
- Undo cancela somente entidades criadas pela operação armazenada.
- Notificações usam `dedupe_key`; heartbeat registra inclusive execuções silenciosas, respeita o limite diário e permite exceção apenas para lembretes importantes.

## Busca vetorial

`entry_embeddings` e `memories.embedding` usam `extensions.vector(1536)` e índices HNSW de cosseno. `match_internal_knowledge` executa com a identidade do usuário e retorna somente fontes permitidas pela RLS.

## Storage

O bucket `user-files` é privado, limitado a 25 MB e a MIME types permitidos. O primeiro segmento do path é o UUID autenticado. A aplicação gera URLs assinadas de dez minutos.

## Automação

`pg_cron` chama `run_all_heartbeats()` a cada hora. `run_user_heartbeat` avalia silêncio, tarefas atrasadas, tarefas sem movimento e lembretes vencidos, e cria notificações deduplicadas.

## Ainda planejado

Provider configs/BYOK, integrações, eventos de webhook, tópicos dedicados e telemetria financeira por chamada serão adicionados antes de produção, quando seus fluxos existirem.

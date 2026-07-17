# Database Design

## Convenções

Todas as entidades do usuário carregam `user_id uuid not null`; horários usam `timestamptz`; conteúdo original é imutável por trigger; relações relevantes são normalizadas. RLS é habilitada e forçada. Cada tabela expõe somente as operações necessárias: registros append-only, de auditoria e controlados por workers usam RPCs validadas ou service role.

## Tabelas implementadas

- Identidade: `profiles`, `agent_preferences`.
- Conhecimento: `contexts`, `organizations`, `projects`, `people`, `person_relationships`, `person_contexts`, `person_projects`, `tags`, `entity_tags`.
- Captura: `entries`, `entry_interpretations`, `entry_entities`.
- Trabalho: `tasks`, `task_dependencies`, `task_people`, `task_projects`, `task_contexts`, `reminders`, `pending_questions`.
- Inteligência: `memories`, `entry_embeddings`, `conversations`, `conversation_messages`.
- Conteúdo: `summaries`, `attachments`, `attachment_interpretations`, `entity_attachments`.
- Controle: `notifications`, `audit_logs`, `undo_operations`, `heartbeat_runs`, `jobs`.
- Custos de IA: `ai_model_pricing`, `ai_usage_events`.

## Regras importantes

- `created_at` é ingestão; `occurred_at` é o momento do fato.
- Capturas retroativas marcam revisões sobrepostas como `outdated`.
- Pessoas, projetos e contextos que aparecem juntos criam associações temporais atuais.
- Tarefas confirmadas preservam `candidate_index`, hierarquia e vínculos normalizados.
- Undo cancela somente entidades criadas pela operação armazenada.
- Notificações usam `dedupe_key`; heartbeat registra inclusive execuções silenciosas, respeita o limite diário e permite exceção apenas para lembretes importantes.
- Relacionamentos concretos usam FKs compostas para impedir referências a entidades de outro usuário; `entry_entities`, `entity_attachments` e `entity_tags` validam ownership polimórfico por trigger.
- `ai_usage_events` é append-only, isolada por usuário e idempotente por request id; cada evento congela preços e custo ou permanece explicitamente `unpriced`.

## Busca vetorial

`entry_embeddings` e `memories.embedding` usam `extensions.vector(1536)` e índices HNSW de cosseno. `match_internal_knowledge` executa com a identidade do usuário e retorna somente fontes permitidas pela RLS.

## Storage

O bucket `user-files` é privado, limitado a 25 MB e a MIME types permitidos. O primeiro segmento do path é o UUID autenticado. A aplicação gera URLs assinadas de dez minutos.

## Automação

`pg_cron` chama `run_all_heartbeats()` a cada hora. `run_user_heartbeat` usa data/fuso/locale do usuário, lock por usuário, quiet hours, limite diário e cooldown rolante. Itens acima do limite permanecem pendentes; falhas ficam isoladas e registradas sem abortar os demais usuários.

## Ainda planejado

Provider configs/BYOK, integrações, eventos de webhook, tópicos dedicados e reconciliação com a fatura do provedor permanecem planejados para depois do pré-MVP.

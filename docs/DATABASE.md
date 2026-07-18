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
- Comportamento de produto: `product_events`.

## Regras importantes

- `created_at` é ingestão; `occurred_at` é o momento do fato.
- Capturas retroativas marcam revisões sobrepostas como `outdated`.
- Pessoas, projetos e contextos que aparecem juntos criam associações temporais atuais.
- Tarefas confirmadas preservam `candidate_index`, hierarquia e vínculos normalizados.
- Undo cancela somente entidades criadas pela operação armazenada.
- Notificações usam `dedupe_key`; heartbeat registra inclusive execuções silenciosas, respeita o limite diário e permite exceção apenas para lembretes importantes.
- Relacionamentos concretos usam FKs compostas para impedir referências a entidades de outro usuário; `entry_entities`, `entity_attachments` e `entity_tags` validam ownership polimórfico por trigger.
- `ai_usage_events` é append-only, isolada por usuário e idempotente por request id; cada evento congela preços e custo ou permanece explicitamente `unpriced`.
- `product_events` é um ledger privado de comportamento do funil, separado de auditoria, jobs e custos de IA. Aceita apenas os 17 eventos e propriedades versionadas em allowlist, usa `user_id` + `idempotency_key` para deduplicação e não admite captura original, resumo, títulos, respostas, evidências, prompts, conteúdo de arquivos ou erros brutos.
- A escrita em `product_events` ocorre somente por `record_product_event` (usuário autenticado) ou `record_product_event_for_user` (somente service role/worker). A leitura é RLS do próprio usuário; não há mutação direta para `authenticated` nem `service_role`.
- Eventos sintéticos de desenvolvimento/teste devem usar `is_synthetic = true` e ser removidos pelo cleanup descartável. A finalidade é observar a experiência, não criar histórico de domínio; a retenção máxima é 180 dias e o purge operacional deve existir antes do piloto.
- A migration `025` adiciona o tipo de job `interpret_entry` sem mudar o contrato de `process_attachment`. O payload é validado no banco: captura inicial contém apenas `entry_id` e `mode: initial`; reprocessamento adiciona somente `operation_key` validada. Conteúdo original, output de IA e detalhes internos não entram em `jobs.payload`.
- `capture_entry_async` grava `entries` e o job inicial na mesma transação e usa chave de idempotência por usuário. `enqueue_entry_reprocessing` exige ownership, é idempotente pela operation key e não altera a interpretação/revisão corrente. Ambas retornam somente recibos sanitizados.
- Claims de entrada são exclusivos de `service_role`: `claim_entry_interpretation_job` e `claim_next_entry_interpretation_job` aceitam somente jobs elegíveis e owned, validam tipo/payload, usam lease, attempts e `FOR UPDATE SKIP LOCKED`. A migration `025` não criou worker, dispatch ou uma nova tabela.
- A migration `026` (Slice 2X.4) estende `begin_entry_interpretation`, `fail_entry_interpretation`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation` e `fail_entry_reprocessing` com um parâmetro opcional `p_service_user_id`, honrado somente quando o chamador é `service_role`; o caminho `auth.uid()` do fluxo síncrono não muda. Cada função foi recriada com `drop function` seguido de `create or replace function` sob o mesmo nome (mesmo padrão de `claim_attachment_job` na migration `019`), preservando exatamente um overload e nenhuma ambiguidade de assinatura para os chamadores existentes. A migration também habilita `pg_net` e agenda `my-brain-entry-dispatch` (`pg_cron`, a cada minuto) chamando a Edge Function `process-jobs` em modo `dispatch` via `net.http_post`, com URL e segredo lidos do Supabase Vault por nome — nenhum valor fica na migration ou no repositório; a consulta é guardada por `where exists`, portanto um tick de cron antes da configuração dos segredos é um no-op seguro.
- A migration `027` corrige uma regressão introduzida pela `025`: a constraint `jobs_interpret_entry_payload_check` referenciava `private.is_valid_entry_interpretation_job_payload`, cujo `execute` havia sido revogado de todos os papéis. O PostgreSQL verifica a ACL de uma função referenciada em uma CHECK constraint na inicialização do plano, não apenas quando o ramo é avaliado — então mesmo um insert de `process_attachment` (que deveria fazer o `OR` de tipo curto-circuitar em valor) falhava com `permission denied`, quebrando todo upload de arquivo desde a `025`. A correção substitui a CHECK constraint por um trigger `BEFORE INSERT OR UPDATE` com `WHEN (new.type = 'interpret_entry')`, cuja função é `SECURITY DEFINER`; disparo de trigger não exige que o papel que grava na tabela tenha `EXECUTE` na função disparada, então o validador privado permanece com seu `revoke all` original — nenhum privilégio foi ampliado.
- Slice 2X.5 não adiciona migration. `captureEntry` e `reprocessEntry` passam a chamar `capture_entry_async`/`enqueue_entry_reprocessing` como o único caminho de produção; os contratos, grants e comportamento dessas RPCs (e das seis estendidas por `p_service_user_id` na migration `026`) permanecem exatamente os já documentados e verificados nas migrations `025`/`026`/`027`.
- A migration `028` (Slice 2X.7) liga a confirmação de candidato à interpretação atual. `entry_interpretations.is_record_only` passa a ser persistido (falso em `persist_entry_interpretation`/`persist_reprocessed_entry_interpretation`, igual ao patch em `correct_entry_interpretation`, copiado do snapshot em `undo_operation`); antes disso `record-only` só existia como efeito transitório sobre o `status` calculado, nunca como coluna consultável. `tasks` ganha `source_interpretation_id` (FK composta `(user_id, id)` para `entry_interpretations`) e `operation_key`; o backfill é conservador — só preenche `source_interpretation_id` para tarefas de entradas com exatamente uma interpretação já criada, deixando `null` (proveniência não inventada) quando há histórico de correção/reprocessamento. A constraint única antiga `(source_entry_id, candidate_index)` é substituída por dois índices únicos parciais: um preservando o comportamento legado quando `source_interpretation_id is null`, outro autoritativo por `(source_interpretation_id, candidate_index)` — sem essa mudança, um candidato legítimo no mesmo índice de uma versão mais nova nunca conseguia materializar, pois colidia silenciosamente com a linha da versão antiga via `ON CONFLICT DO NOTHING`. A nova RPC `confirm_entry_task_candidates` exige o `id` da interpretação que a UI declara como atual, recusa interpretações `record-only`, e é idempotente por `operation_key`; `confirm_entry_tasks` permanece como RPC de compatibilidade (sem novo consumidor), apenas com o alvo do `ON CONFLICT` ajustado ao novo índice parcial legado.
- Exercitar `confirm_entry_tasks`/`confirm_entry_task_candidates` como papel `authenticated` real (não apenas via `service_role` ou pgTAP) contra o projeto linkado revelou que a RPC pré-existente `confirm_entry_tasks` nunca havia funcionado para um usuário autenticado real: era `SECURITY INVOKER` mas fazia `SELECT ... FOR UPDATE` em `entry_interpretations` (sem `UPDATE` grant para `authenticated`, propositalmente, pois interpretações são imutáveis) e inseria em `undo_operations`/`audit_logs` (sem `INSERT` grant para `authenticated`, pois são tabelas append-only escritas normalmente só através de RPCs `SECURITY DEFINER`). Ambas as funções passam a ser `SECURITY DEFINER` — o mesmo padrão já usado por `persist_entry_interpretation`, `correct_entry_interpretation` e `undo_operation` — preservando a filtragem manual por `current_user_id := auth.uid()` e `where user_id = current_user_id` já presente nelas. `confirm_entry_tasks` também ganhou o par explícito `grant ... to authenticated` / `revoke ... from public, anon` que as demais RPCs já têm (antes era executável por `anon`, inofensivo apenas porque a função também recusa `auth.uid()` nulo).
- O mesmo exercício ao vivo revelou que qualquer RPC que levanta SQLSTATE `40001` (`serialization_failure`) — incluindo a já publicada `correct_entry_interpretation` — trava a requisição até o timeout do gateway do projeto linkado, um comportamento de plataforma/pooler, não deste código. `confirm_entry_task_candidates` sinaliza "interpretação não é mais a atual" com `55P03` (já comprovado rápido em produção por `begin_entry_reprocessing`) em vez de `40001`. O caminho equivalente de `correct_entry_interpretation` (usado desde a Fase 2B) não foi alterado nesta slice — está fora do escopo da 2X.7 — mas é uma pendência urgente registrada em `DECISIONS.md` e `TODO.md`.

## Busca vetorial

`entry_embeddings` e `memories.embedding` usam `extensions.vector(1536)` e índices HNSW de cosseno. `match_internal_knowledge` executa com a identidade do usuário e retorna somente fontes permitidas pela RLS.

## Storage

O bucket `user-files` é privado, limitado a 25 MB e a MIME types permitidos. O primeiro segmento do path é o UUID autenticado. A aplicação gera URLs assinadas de dez minutos.

## Automação

`pg_cron` chama `run_all_heartbeats()` a cada hora. `run_user_heartbeat` usa data/fuso/locale do usuário, lock por usuário, quiet hours, limite diário e cooldown rolante. Itens acima do limite permanecem pendentes; falhas ficam isoladas e registradas sem abortar os demais usuários.

## Ainda planejado

Provider configs/BYOK, integrações, eventos de webhook, tópicos dedicados e reconciliação com a fatura do provedor permanecem planejados para depois do pré-MVP.

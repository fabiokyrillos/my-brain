# Architecture

## Topologia atual

```text
Browser/PWA -> Next.js App Router -> Supabase Auth/Postgres/Storage
                         |                    |
                         +-> AIProvider       +-> pg_cron -> heartbeat SQL
                              |               +-> Edge Function heartbeat
                              +-> OpenAI       +-> jobs duráveis
```

Next.js atua como backend-for-frontend autenticado. O navegador usa Supabase somente com sessão e RLS; chave OpenAI e operações administrativas permanecem no servidor ou na Edge Function. Postgres é a fonte de verdade.

## Fatias verticais

- Identidade: sessão, perfil, preferências e isolamento multitenant.
- Captura: original imutável, origem, `created_at`, `occurred_at` e sensibilidade.
- Interpretação: schema Zod, conceitos, confiança, entidades, tarefas e perguntas.
- Trabalho: tarefas, subtarefas, dependências, relações, lembretes e desfazer.
- Conhecimento: contextos, organizações, projetos, pessoas e associações temporais.
- Inteligência: embeddings, pgvector, memórias, chat fundamentado e fontes internas.
- Proatividade: heartbeat, silêncio, deduplicação, notificações e auditoria de execuções.
- Conteúdo: revisões persistidas, anexos privados, URLs assinadas e jobs.
- Controle de IA: roteamento por operação, preços versionados, ledger append-only e agregação de custo no banco.
- Observabilidade de produto: ledger privado `product_events` com taxonomia e propriedades fechadas, projeções de funil sem conteúdo pessoal e RPCs próprias; não substitui `audit_logs`, `jobs` nem `ai_usage_events`.
- Ciclo diário: mapeamento server-only e fail-closed de oito estados internos de `entries`/`jobs` para cinco estados de produto (`src/features/daily-cycle/lifecycle.ts`); Caixa e Início compartilham a mesma projeção e o mesmo componente de linha, sem enum interno vazando para HTML/CSS (Slice 2X.6).

## Fluxo de captura

1. A Action `captureEntry` autentica e persiste `entries`/`jobs` atomicamente via `capture_entry_async`, sem chamar IA e sem redirecionar.
2. A Action devolve imediatamente um `CaptureReceipt` sanitizado (nunca expõe job id, status interno ou provider) e agenda, via `after()` do Next.js, um kick não bloqueante do worker mais eventos de produto best-effort — nada disso atrasa a resposta ao usuário.
3. O worker implantado (`process-jobs/entry.ts`, Slice 2X.4) processa o job de ponta a ponta: extração OpenAI validada por Zod, entity resolution, cálculo de confiança e persistência via RPC transacional (interpretação, entidades, data do evento e auditoria).
4. O embedding é gerado separadamente pelo worker; falha de embedding não destrói a interpretação.
5. A drenagem agendada (`pg_cron`/`pg_net`) garante conclusão mesmo se o kick direto falhar ou a aba for fechada.
6. A UI apresenta o recibo, limpa e refoca o campo para a próxima captura, e oferece um link seguro para a revisão; ao abrir, a revisão mostra interpretação, original e tarefas candidatas assim que o worker terminar.
7. Uma RPC idempotente cria somente tarefas selecionadas, liga pessoas/projetos/contextos e grava compensação de undo.

## Portabilidade de IA

`AIProvider` expõe `extractEntry`, `embedText` e `answerFromKnowledge`. A implementação OpenAI usa Responses API com Structured Outputs e embeddings. Regras de autorização, confirmação, RLS e undo ficam fora do provider.

Cada carga escolhe sua rota em `agent_preferences` (`chat`, extração, revisão, arquivo, background e embedding). Uma chamada bem-sucedida registra tokens e snapshot de preço em `ai_usage_events` antes de persistências de domínio subsequentes. O dashboard consome `get_ai_cost_summary`, evitando agregação limitada pelo teto de linhas da API.

## Assincronia

O pré-MVP possui tabela `jobs` com status, tentativas, próxima tentativa, prioridade e idempotência. Uploads criam jobs e invocam a Edge Function autenticada `process-jobs`, que usa URL assinada e persiste uma interpretação separada. Falhas ficam disponíveis para nova tentativa. Heartbeat roda no banco, independente desse worker.

O Slice 2X.3 adicionou somente o contrato de entrada: `capture_entry_async` persiste uma entry `saved` e um job `interpret_entry` mínimo de forma atômica; `enqueue_entry_reprocessing` cria o job correspondente sem executar IA ou trocar a revisão atual. Claims por ID e por próximo elegível reutilizam as transições de lease da fila, mas aceitam somente `service_role`, payload válido e entry owned.

O Slice 2X.4 entrega o worker e o dispatch automático desses jobs, sem cortar a UI para o fluxo assíncrono. `process-jobs` foi dividido em `index.ts` (autenticação, lookup de tipo e roteamento), `dispatch.ts` (router fail-closed por tipo e o loop de drenagem agendada) e processadores dedicados por tipo: `attachment.ts` (comportamento preservado, apenas extraído) e `entry.ts` (novo, pipeline único para os modos `initial` e `reprocess`). O processador de entrada nunca confia apenas no payload do job: recarrega a entry, chama `begin_entry_interpretation`/`begin_entry_reprocessing`, executa a extração compartilhada e persiste via `persist_entry_interpretation`/`persist_reprocessed_entry_interpretation`, com falha tratada por `fail_entry_interpretation`/`fail_entry_reprocessing` — as mesmas RPCs do fluxo síncrono, estendidas na migration `026` com um parâmetro opcional `p_service_user_id` restrito a `service_role`, já que essas RPCs derivam o usuário de `auth.uid()`, inexistente para um worker sem sessão. O ranking de entidades e o cálculo de confiança reutilizam os módulos determinísticos de `src/features/interpretations/` via cópias Deno em `supabase/functions/_shared/` (portáveis porque não têm dependência de Node/Next.js); a chamada ao provider OpenAI é replicada no runtime Deno porque `src/lib/ai/openai-provider.ts` importa `server-only`, que lança incondicionalmente fora de um bundler — ver ADR-021.

Invocação direta (autenticada, por `jobId`, contrato inalterado) continua disponível para os dois tipos de job. Drenagem automática usa `pg_net` e `pg_cron` (`my-brain-entry-dispatch`, a cada minuto) chamando `process-jobs` em modo `dispatch`, autenticado por um segredo de worker validado no código da função; a URL da função e o segredo ficam no Supabase Vault, nunca no repositório. A drenagem é exclusiva de `interpret_entry`: anexos continuam com invocação direta por upload, sem consumidor não supervisionado nesta fase. Heartbeat roda no banco, independente desse worker.

O Slice 2X.5 corta a UI para esse caminho assíncrono: `captureEntry` e `reprocessEntry` (`src/features/capture/actions.ts`, `src/features/interpretations/actions.ts`) não chamam mais IA nem esperam a interpretação — persistem via `capture_entry_async`/`enqueue_entry_reprocessing`, devolvem um `CaptureReceipt`/confirmação de enfileiramento honesta e agendam um kick não bloqueante (`kickEntryInterpretationWorker`, em `src/lib/jobs/entry-worker.ts`) mais eventos `capture_save_succeeded`/`capture_processing_enqueued` através de `after()`. Como o kick é apenas uma otimização de latência — a drenagem agendada já cobre o caso de falha —, seu erro é engolido e nunca propagado à resposta do usuário. `src/features/agent/actions.ts` ganhou `retryProcessingJob`, que generaliza o retry manual já usado por anexos (`retryAttachmentJob`, inalterado) para jobs `interpret_entry`: um job `failed` elegível recebe apenas um kick; um job `exhausted` precisa de um novo `enqueue_entry_reprocessing`, já que trabalho exaurido nunca é reclamado de novo pela fila. Sem consumidor de UI ainda para essa ação nesta fase — ela existe para a fila "Precisa de você" dos Slices 2X.10/2X.11. O orquestrador Node síncrono (`src/features/interpretations/interpret-entry.ts`) foi removido por ficar inalcançável: toda extração de produção agora roda exclusivamente no worker Deno.

O Slice 2X.6 dá o primeiro consumidor de produção à projeção pura definida no Slice 2X.1: `src/features/daily-cycle/inbox-projection.ts` lê a página de `entries` do owner, o `interpret_entry` mais recente de cada entry (via `payload->>entry_id`), a interpretação atual (`task_candidates`), perguntas abertas e tarefas já materializadas, e alimenta `resolveDailyCycleLifecycle` por entry. Quando o mapper recusa uma combinação desconhecida (`fallback: true`, devolve `null`), o loader não descarta a entry — o original é sempre preservado — e constrói um item `could_not_organize`/`resolve_consistency` explícito em vez disso. `InboxItemRow` (`src/features/daily-cycle/inbox-item.tsx`) só recebe o DTO `InboxItemView`, nunca uma row do Supabase ou o status interno de oito estados; a página `/inbox` e um novo painel "Atividade recente" na Início chamam a mesma projeção e renderizam o mesmo componente, garantindo que as duas superfícies concordem sobre o estado de uma entry. `recordOnly` e `hasConsistencyIssue` ainda são passados como `false` nesta fatia porque a coluna `is_record_only` e a proveniência de candidato chegam somente no Slice 2X.7, em uma migration ainda não numerada (o `026` do plano original de implementação já foi consumido pelo Slice 2X.4 — ver ADR-021); até lá, um candidato marcado como somente-registro mas com `task_candidates` residual no JSON aparece como "precisa de confirmação" em vez de "pronto".

## Limite de confiança

Server actions e Edge Functions validam identidade e comandos; RLS forçada continua sendo o limite multitenant. Relacionamentos concretos provam ownership com FKs compostas `(user_id, id)` e relações polimórficas usam triggers de validação. Tabelas append-only ou controladas pelo domínio não expõem mutação direta ao papel `authenticated`.

## Observabilidade de produto

`product_events` existe somente para entender o ciclo diário e orientar convergência de UX. O frontend trabalha com contratos serializáveis e allowlists; o limite server-only revalida a entrada e retorna apenas um acknowledgement. PostgreSQL revalida a mesma taxonomia, ownership de IDs opacos, RLS, idempotência e privilégio mínimo. A instrumentação é best effort: indisponibilidade analítica não pode modificar o resultado da ação principal. Nenhum emissor, painel ou experiência visual é criado no Slice 2X.2.

## Ambientes adiados

Google OAuth e Vercel permanecem fora do fluxo atual por decisão de produto. Nenhum scaffold pago ou dependência externa é necessário para testar localmente.

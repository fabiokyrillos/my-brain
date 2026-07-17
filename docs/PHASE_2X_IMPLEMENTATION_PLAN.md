# Fase 2X — Convergência do Produto — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a fundação entregue pelas Fases 2A e 2B em um ciclo diário simples — capturar, acompanhar, resolver o que exige intervenção e executar trabalho — sem antecipar capacidades de domínio das Fases 2C–2F.

**Architecture:** A implementação deve preservar as tabelas e garantias atuais como fonte de verdade, adicionar somente persistência indispensável e introduzir uma camada estreita de projeções do ciclo diário entre o domínio persistido e a UI. A fila `jobs` e a Edge Function `process-jobs` passam a processar interpretações de entrada; páginas e componentes centrais recebem DTOs de produto, enquanto lifecycle, confiança, evidências, políticas e proveniência permanecem no servidor e aparecem somente por progressive disclosure.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript 5, next-intl 4.13.2, Supabase/PostgreSQL/RLS/RPC/Edge Functions, Zod 4.4.3, Vitest 4.1.10, Testing Library, Playwright 1.61.1 e scripts Node de smoke remoto.

## Global Constraints

- Este plano implementa exclusivamente `docs/PHASE_2X_PRD.md`, formalmente aprovado em 2026-07-17.
- A 2X é convergência do produto, não expansão funcional.
- Não implementar editor avançado de candidatos, dependências, subtarefas, split/merge, perguntas conversacionais completas, NLP para atualização de tarefas, onboarding, automações do piloto ou hardening específico do MVP.
- Preservar original imutável, revisões append-only, ponteiro atual, ownership, RLS, audit, undo, idempotência, leases e proteção contra worker stale.
- Reutilizar `jobs`; não adicionar provedor externo de fila ou plataforma genérica de read models.
- Componentes centrais não podem importar `Database["public"]["Tables"]`, interpretar estados internos nem decidir por score, policy ou evidência.
- Copy e acessibilidade devem funcionar em `pt-BR` e `en`, desktop e mobile.
- Cada slice termina com suíte completa verde, um único commit coeso e rollback isolável.
- Antes de editar código Next.js durante a execução, ler a documentação pertinente em `node_modules/next/dist/docs/`, conforme `AGENTS.md`.
- Este documento não contém código de implementação; contratos são especificados por nomes, campos, invariantes e responsabilidades.

---

## 1. Status, escopo e uso do documento

Este é o plano técnico de execução da Fase 2X. Ele refina os sete macro-slices do PRD em dezoito slices de implementação pequenos. O documento deve ser usado como contrato entre produto, arquitetura, engenharia e QA.

O executor deve:

1. trabalhar na ordem definida, salvo bloqueio documentado;
2. abrir cada slice com os testes de contrato ou comportamento indicados;
3. preservar compatibilidade com o estado implantado pelo slice anterior;
4. executar os gates globais antes do commit;
5. criar exatamente um commit por slice;
6. não misturar correções ou refactors alheios ao objetivo do slice;
7. interromper a progressão se um gate remoto obrigatório falhar.

O executor não deve interpretar o cronograma como autorização para iniciar a implementação. A execução depende de solicitação posterior explícita.

## 2. Baseline verificado após a Fase 2B

### 2.1 Rotas do ciclo atual

| Superfície | Rota atual | Situação relevante para a 2X |
| --- | --- | --- |
| Início | `/{locale}/app` | Dashboard consulta e apresenta conceitos de domínio diretamente. |
| Captura dedicada | `/{locale}/app/capture` | Usa `captureEntry` e aguarda interpretação antes do redirect. |
| Caixa | `/{locale}/app/inbox` | Lista registros, mas não é ainda a projeção canônica do estado humano. |
| Revisão da entrada | `/{locale}/app/inbox/{entryId}` | Carrega revisão ampla, trust, evidências, histórico e ações no fluxo principal. |
| Hoje | `/{locale}/app/today` | Consulta `tasks` diretamente. |
| Tarefas | `/{locale}/app/tasks` | Consulta `tasks` diretamente e permite criação existente. |
| Aguardando | `/{locale}/app/waiting` | Consulta `tasks` diretamente. |
| Jobs | `/{locale}/app/jobs` | Superfície técnica; não deve entrar na navegação comum. |
| Perguntas | `/{locale}/app/questions` | Resposta básica já existe; conversação completa continua na 2D. |
| Revisões | `/{locale}/app/reviews` | Capacidade existente, mas algumas promessas/configurações precisam ser auditadas. |

### 2.2 Actions existentes diretamente afetadas

- `src/features/capture/actions.ts`: `captureEntry` salva, interpreta, cria embedding, persiste interpretação e redireciona de forma síncrona.
- `src/features/interpretations/actions.ts`: `correctInterpretation`, `undoInterpretationCorrection` e `reprocessEntry`.
- `src/features/tasks/actions.ts`: `confirmTaskCandidates` e undo da materialização.
- `src/features/agent/actions.ts`: `answerPendingQuestion`, `retryAttachmentJob` e outras Actions secundárias.
- `src/features/operations/actions.ts`: mutações de tarefa já existentes e pontos de instrumentação do funil de trabalho.

### 2.3 Banco e processamento existentes

- `entries` possui oito estados internos: `saved`, `interpreting`, `awaiting_review`, `partially_processed`, `completed`, `recoverable_error`, `terminal_error` e `reprocessing`.
- `entry_interpretations` é append-only e `entries.current_interpretation_id` identifica a revisão atual.
- `entry_interpretations.task_candidates` e `pending_questions` ainda são snapshots JSON; `pending_questions` também possui projeção persistida própria.
- `tasks` identifica origem por `source_entry_id` e `candidate_index`, mas não prova hoje a interpretação de origem.
- `jobs` já possui lease, retry, backoff, exhaustion, reaper e stale-worker protection.
- `process-jobs` processa apenas `process_attachment` e contém a lógica do worker em um único arquivo.
- `audit_logs` e `undo_operations` não devem ser usados como analytics de produto.

### 2.4 Gates já estabelecidos

- Vitest, ESLint, TypeScript e build de produção.
- Playwright autenticado em desktop e Pixel 7.
- pgTAP/SQL estrutural quando o ambiente local permitir.
- Smokes remotos de Supabase, fila e revisões de interpretação.
- Migrations locais e linked remotas sincronizadas.

## 3. Decisões arquiteturais da execução

### 3.1 Bounded context de projeção

Criar `src/features/daily-cycle/` como fronteira específica da experiência diária. Não criar `read-model-framework`, registradores genéricos, event bus de produto ou abstrações sem consumidor concreto.

Responsabilidades do diretório:

- contratos serializáveis usados por Server Components e Actions;
- mapeamento determinístico de estado interno para estado de produto;
- cálculo server-only de ações disponíveis;
- projeções de Caixa, Precisa de você, revisão e Trabalho;
- copy tipada e fallbacks seguros;
- nenhum acesso direto pelo cliente a lifecycle, trust, policy ou evidência.

### 3.2 Persistência mínima

São planejadas quatro migrations aditivas, a partir do head atual `023`:

| Migration | Finalidade | Princípio de rollback |
| --- | --- | --- |
| `202607170024_phase_2x_product_events.sql` | Ledger privado de eventos do funil e RPCs com allowlist. | Parar emissões antes de remover RPC/tabela. |
| `202607170025_phase_2x_entry_processing_jobs.sql` | Captura + enqueue atômicos, job de interpretação, claims e dispatch. | Manter caminho síncrono disponível até o corte da UI; wrappers existentes permanecem. |
| `202607170026_phase_2x_candidate_action_consistency.sql` | Proveniência de candidato, `record-only` explícito e confirmação vinculada à interpretação atual. | RPC antigo permanece temporariamente; coluna nova é nullable para dados anteriores. |
| `202607170027_phase_2x_needs_attention_projection.sql` | RPC produto-específica e índices para a fila Precisa de você. | Remover consumidor antes da RPC; nenhuma fonte de verdade nova. |

Se outra migration for incorporada antes da execução, os números devem ser renumerados de forma monotônica, preservando a ordem e os nomes semânticos acima.

### 3.3 Evolução compatível da fila

- Adicionar o tipo `interpret_entry`; não renomear `process_attachment`.
- Payload mínimo: `entry_id`, `mode` (`initial` ou `reprocess`) e `operation_key` somente quando aplicável.
- Não duplicar conteúdo original no payload do job.
- Adicionar claims específicos para entrada; `complete_job`, `fail_job` e `reap_expired_jobs` continuam compartilhados.
- `process-jobs` deve despachar por tipo e preservar o fluxo de anexos sem regressão.
- A invocação direta pode iniciar o processamento, mas um dispatch agendado e autenticado deve drenar pending/retry sem depender de página aberta.
- A UI só troca para captura assíncrona depois que o smoke remoto provar enqueue, dispatch, lease, retry e conclusão.

### 3.4 Projeções em TypeScript e RPCs no banco

O banco decide atomicidade, ownership, concorrência e elegibilidade relacional. A camada `daily-cycle` decide apresentação humana, copy, fallbacks e DTOs. RPCs não devem retornar rótulos localizados nem JSX-ready data.

### 3.5 Compatibilidade de rotas

- Criar `/{locale}/app/work` como rota canônica de Trabalho.
- Preservar `today`, `tasks` e `waiting` como redirects seguros, com locale e filtro equivalentes.
- Manter `inbox/{entryId}` como rota canônica da revisão nesta fase.
- Usar `inbox?view=needs-you` para a fila filtrada; não criar uma taxonomia paralela de URLs.
- Manter rotas secundárias alcançáveis pelo agrupamento Mais.

### 3.6 Observabilidade separada

Quatro conceitos permanecem distintos:

1. `audit_logs`: mudanças de domínio e responsabilidade;
2. `jobs`: execução e recuperação técnica;
3. `ai_usage_events`: consumo/custo de IA;
4. `product_events`: comportamento agregado do funil sem conteúdo pessoal.

## 4. Contratos que devem existir antes da UI

### 4.1 Estados e motivos de produto

`ProductState` deve aceitar somente:

- `saved`;
- `organizing`;
- `needs_attention`;
- `ready`;
- `could_not_organize`.

`AttentionReason` deve aceitar somente:

- `review_interpretation`;
- `confirm_existing_candidates`;
- `answer_existing_question`;
- `retry_processing`;
- `resolve_consistency`.

O mapeamento e sua precedência vivem em `src/features/daily-cycle/lifecycle.ts`; nenhum componente pode recalculá-los.

### 4.2 DTOs de produto

| DTO | Campos obrigatórios | Observação de fronteira |
| --- | --- | --- |
| `CaptureReceipt` | `entryId`, `persisted`, `productState`, `messageKey`, `safeHref?`, `replayed` | Nunca expõe job ID, status interno ou provider. |
| `InboxItemView` | `entryId`, `title`, `originalPreview`, `productState`, `attentionReason?`, `significantAt`, `availableActions`, `originalPreserved` | `availableActions` é calculado no servidor. |
| `NeedsAttentionItemView` | `key`, `kind`, `entryId`, `title`, `explanation`, `primaryAction`, `secondaryAction?`, `occurredAt`, `groupKey` | Um entry pode agrupar múltiplos sinais relacionados. |
| `InterpretationReviewView` | `entryId`, `productState`, `understanding`, `humanFields`, `attentionItems`, `actionableCandidates`, `materializedTasks`, `availableActions`, `original`, `hasTechnicalDetails` | Não contém scores, policy ou evidência bruta. |
| `InterpretationTechnicalDetailsView` | `entryId`, `versions`, `source`, `model`, `scores`, `policies`, `signals`, `evidence`, `overrides`, `comparisons`, `provenance` | Carregado separadamente ou isolado em payload explicitamente secundário. |
| `WorkItemView` | `taskId`, `title`, `description?`, `dueAt?`, `humanState`, `origin`, `availableActions` | Não expõe enum persistido como copy. |

### 4.3 Resultado de Actions tocadas pela 2X

Não criar uma interface universal para todo o produto. Criar uma base discriminada em `src/features/daily-cycle/action-result.ts`, especializada por Action.

Campos comuns:

- `ok`;
- `code` estável e independente de locale;
- `messageKey`;
- `entityId?`;
- `productState?`;
- `undoId?`;
- `retryable`;
- `fieldErrors?`.

Regras:

- erros Supabase/OpenAI nunca atravessam o contrato;
- sucesso de persistência é diferente de sucesso de organização;
- replay idempotente retorna sucesso com `replayed=true` quando aplicável;
- conflito de versão retorna código próprio e nenhuma ação stale;
- copy é resolvida por `src/features/daily-cycle/copy.ts`.

### 4.4 Actions e contratos finais

| Action | Entrada validada | Resultado específico |
| --- | --- | --- |
| `captureEntry` | conteúdo, locale, source, idempotency key, safe return target | `CaptureReceipt` em sucesso; sem redirect obrigatório. |
| `correctInterpretation` | entry, expected version, operation key, patch, reason | nova versão, estado recalculado e undo quando disponível. |
| `undoInterpretationCorrection` | entry, undo, locale | estado recalculado e código idempotente/conflito. |
| `reprocessEntry` | entry, operation key, locale | confirmação de enqueue, não confirmação de conclusão. |
| `confirmTaskCandidates` | entry, current interpretation, indexes, operation key, locale | tarefas materializadas, undo e estado recalculado. |
| `undoTaskCreation` | entry, undo, locale | tarefas canceladas e projeção recalculada. |
| `retryProcessingJob` | job/entry, locale | retry iniciado/agendado ou terminal; substitui acoplamento exclusivo a anexo na superfície do ciclo diário. |
| `answerPendingQuestion` | question, answer, locale | pergunta resolvida e item removido da projeção pública. |
| `recordProductInteraction` | nome allowlisted, superfície, subject IDs opacos, session ID, propriedades allowlisted | best-effort; nunca muda o resultado da ação principal. |

## 5. RPCs planejadas e RPCs preservadas

### 5.1 Novas RPCs

| RPC | Quem chama | Responsabilidade |
| --- | --- | --- |
| `record_product_event` | usuário autenticado via servidor | Validar evento/propriedades e inserir evento próprio. |
| `record_product_event_for_user` | service role/worker | Registrar conclusão/falha técnica para o owner sem aceitar conteúdo. |
| `capture_entry_async` | `captureEntry` | Inserir original e job `interpret_entry` em uma única transação idempotente. |
| `claim_entry_interpretation_job` | worker com job específico | Claim leased por ID, owner, tipo e worker. |
| `claim_next_entry_interpretation_job` | dispatch interno | Claim da próxima tentativa elegível com `skip locked`. |
| `enqueue_entry_reprocessing` | `reprocessEntry` | Criar job de modo `reprocess` com operation key sem executar IA na Action. |
| `confirm_entry_task_candidates` | `confirmTaskCandidates` | Confirmar somente candidatos da interpretação atual, não record-only, com idempotência. |
| `list_needs_attention` | projeção server-only | Retornar chaves/motivos/IDs atuais e agrupados, sem copy ou detalhes técnicos. |

### 5.2 RPCs existentes reutilizadas ou regressadas

- `persist_entry_interpretation`;
- `begin_entry_reprocessing`;
- `persist_reprocessed_entry_interpretation`;
- `fail_entry_interpretation`;
- `fail_entry_reprocessing`;
- `correct_entry_interpretation`;
- `undo_operation`;
- `complete_job`;
- `fail_job`;
- `reap_expired_jobs`;
- `get_job_queue_metrics`.

O plano não autoriza remover `claim_attachment_job` ou `confirm_entry_tasks` durante a 2X. Eles permanecem como contratos de compatibilidade até um cleanup posterior explicitamente aprovado.

## 6. Mapa de arquivos planejado

### 6.1 Novos arquivos de aplicação

| Arquivo | Responsabilidade única |
| --- | --- |
| `src/features/daily-cycle/contracts.ts` | DTOs, enums públicos e ações disponíveis. |
| `src/features/daily-cycle/action-result.ts` | Base discriminada e códigos das Actions da 2X. |
| `src/features/daily-cycle/copy.ts` | Copy PT-BR/en por estado, motivo e resultado. |
| `src/features/daily-cycle/lifecycle.ts` | Matriz interna → produto e precedência. |
| `src/features/daily-cycle/inbox-projection.ts` | Query/mapeamento de `InboxItemView`. |
| `src/features/daily-cycle/attention-projection.ts` | Query/mapeamento de `NeedsAttentionItemView`. |
| `src/features/daily-cycle/review-projection.ts` | `InterpretationReviewView`. |
| `src/features/daily-cycle/technical-details-projection.ts` | `InterpretationTechnicalDetailsView`. |
| `src/features/daily-cycle/work-projection.ts` | `WorkItemView` e filtros existentes. |
| `src/features/daily-cycle/capture-receipt.tsx` | Feedback de persistência e continuidade. |
| `src/features/daily-cycle/needs-attention-list.tsx` | Lista agrupada com ações já suportadas. |
| `src/features/daily-cycle/entry-review.tsx` | Blocos humanos A–D da revisão. |
| `src/features/daily-cycle/technical-details.tsx` | Bloco E recolhido e acessível. |
| `src/features/daily-cycle/work-view.tsx` | Visões existentes de Trabalho. |
| `src/features/product-analytics/contracts.ts` | Taxonomia, propriedades e allowlists. |
| `src/features/product-analytics/server.ts` | Emissão server-only e sanitização. |
| `src/features/product-analytics/actions.ts` | Action best-effort para eventos de interação. |
| `src/features/shell/capabilities.ts` | Classificação estática operacional/informativo/avançado/oculto. |
| `src/app/[locale]/app/work/page.tsx` | Rota canônica de Trabalho. |

Cada módulo lógico acima deve ter teste vizinho `.test.ts` ou `.test.tsx` quando possuir decisão ou renderização.

### 6.2 Novos arquivos Supabase e smoke

- as quatro migrations `024–027` descritas na seção 3.2;
- `supabase/tests/product_events.sql`;
- `supabase/tests/entry_processing_jobs.sql`;
- `supabase/tests/candidate_action_consistency.sql`;
- `supabase/tests/needs_attention_projection.sql`;
- `supabase/functions/process-jobs/attachment.ts`;
- `supabase/functions/process-jobs/entry.ts`;
- `supabase/functions/process-jobs/dispatch.ts`;
- testes Deno ou módulos puros equivalentes para o dispatch;
- `scripts/remote-product-events-smoke.mjs`;
- `scripts/remote-entry-processing-smoke.mjs`;
- `scripts/remote-daily-cycle-smoke.mjs`.

### 6.3 Arquivos existentes com mudança prevista

- `src/features/capture/actions.ts`;
- `src/features/capture/quick-capture-form.tsx`;
- `src/features/interpretations/actions.ts`;
- `src/features/interpretations/data.ts` — deixa de ser contrato direto da página e pode ser reduzido a infraestrutura das projeções;
- `src/features/interpretations/revision-editor.tsx` — permanece apenas onde a capacidade existente é necessária;
- `src/features/tasks/actions.ts`;
- `src/features/tasks/task-candidate-form.tsx`;
- `src/features/agent/actions.ts` e `forms.tsx`;
- `src/features/operations/actions.ts` e `task-list.tsx`;
- `src/features/shell/home-dashboard.tsx`, `app-shell.tsx` e `navigation-links.tsx`;
- páginas de Home, captura, Caixa, detalhe, Hoje, Tarefas, Aguardando, Perguntas, Revisões, Jobs, Custos e Configurações;
- `src/i18n/messages.ts`;
- `src/lib/supabase/database.types.ts` após cada migration;
- `supabase/functions/process-jobs/index.ts` e `deno.json`;
- `e2e/intelligent-capture.spec.ts`, `e2e/foundation.spec.ts` e `e2e/online-mobile-navigation.spec.ts`;
- `package.json` para scripts de verificação 2X;
- documentação permanente listada no fechamento.

---

## 7. Especificação técnica por épico

## Épico 1 — Captura assíncrona e retorno imediato

### Objetivo técnico

Separar a durabilidade do original da execução de IA. A Action deve concluir quando `entries` e `jobs` forem persistidos atomicamente, devolver `CaptureReceipt` e permitir continuidade; o worker existente assume interpretação inicial e reprocessamento com lease, idempotência e retry.

### Superfícies e persistência

| Item solicitado | Especificação |
| --- | --- |
| Componentes afetados | Modificar `QuickCaptureForm`; criar `CaptureReceiptView`; ajustar estados pending/success e preservação do textarea. O formulário não usa “Interpretando…” durante a chamada; usa “Salvando…” e, depois, “Salvo. Estou organizando.”. |
| Rotas afetadas | Home, `/capture`, `/inbox`, `/inbox/{entryId}` e `/jobs` para regressão técnica. A captura na Home permanece na Home; a rota dedicada permanece nela e oferece “Ver registro”. |
| Server Actions afetadas | Reescrever `captureEntry`; converter `reprocessEntry` para enqueue; generalizar a ação de retry exposta no ciclo diário sem quebrar `retryAttachmentJob`. |
| RPCs afetadas | Novas `capture_entry_async`, `claim_entry_interpretation_job`, `claim_next_entry_interpretation_job`, `enqueue_entry_reprocessing`; reutilizar `complete_job`, `fail_job`, `reap_expired_jobs`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`, `fail_entry_interpretation` e `fail_entry_reprocessing`. |
| Tabelas | `entries`, `jobs`, `entry_interpretations`, `entry_entities`, `pending_questions`, `ai_usage_events`, `product_events`; leitura das entidades já suportadas pelo resolver. |
| Migrations necessárias | `025`: tipo/payload de job, captura transacional, claims, índice por entry no payload, enqueue de reprocessamento e suporte ao dispatch agendado. Não criar nova tabela de fila. |
| Edge Functions afetadas | Refatorar `process-jobs/index.ts` em auth/dispatch; mover anexos para `attachment.ts`; adicionar `entry.ts` e `dispatch.ts`. Preservar `process_attachment`. |
| Projeções novas | `CaptureReceipt`; estado inicial do `InboxItemView`; contagem `organizing` para Home; retry action em revisão/atenção. |
| DTOs novos | `CaptureReceipt` e entrada mínima server-only do worker; payload do job não é DTO público. |
| Contratos de Action | `captureEntry` retorna `captured`, `capture_replayed`, `validation_failed`, `session_expired` ou `capture_failed`; sucesso contém receipt. `reprocessEntry` retorna `reprocessing_queued`, não “reinterpretado”. |

### Testes e documentação

| Camada | Cobertura obrigatória |
| --- | --- |
| Testes unitários | Schema/idempotency key; Action diferencia persistência de organização; receipt e copy; formulário limpa só após `persisted=true`; falha preserva texto; safe return target; worker dispatch por tipo; erro sanitizado. |
| Testes de integração | RPC atômica não deixa entry sem job; replay não duplica; cross-user negado; claims exclusivos; stale worker negado; retry/exhaustion; resultado persistido reutilizado; reprocessamento concorrente. |
| Playwright | Capturar e interagir com a tela antes da IA; receipt sem redirect; item `saved/organizing`; conclusão para `ready`; mobile/PT-BR/en; falha recuperável sem duplicar original. |
| Smoke remoto | `remote-entry-processing-smoke.mjs`: captura, replay, dispatch direto/agendado, claim concorrente, persistência, retry, exhaustion, RLS, reprocessamento e cleanup. O corte da UI é bloqueado até esse smoke passar. |
| Documentação a atualizar | `ARCHITECTURE.md`, `DATABASE.md`, `AI_AGENT.md`, `SECURITY.md`, `DECISIONS.md`, `STATE.md`, `CHANGELOG.md`, `TODO.md` e relatório final 2X. |

## Épico 2 — Fila “Precisa de você”

### Objetivo técnico

Produzir uma fila derivada, owner-scoped e fail-closed que reúna apenas decisões já suportadas: revisar interpretação, confirmar candidatos atuais, responder pergunta básica existente, retry manual necessário e resolver inconsistência. A fila não é nova fonte de verdade.

### Superfícies e persistência

| Item solicitado | Especificação |
| --- | --- |
| Componentes afetados | Criar `NeedsAttentionList`, item agrupado, empty state e badge/preview na Home; adicionar filtro na Caixa. Reutilizar componentes de ação existentes por meio de contratos adaptados. |
| Rotas afetadas | Home; `/inbox?view=needs-you`; `/inbox/{entryId}` como destino das ações. `/questions` e `/jobs` continuam secundárias, não são duplicadas. |
| Server Actions afetadas | `correctInterpretation`, `confirmTaskCandidates`, `answerPendingQuestion`, `retryProcessingJob` e undos devem revalidar Home, Caixa filtrada, detalhe e Trabalho quando aplicável. |
| RPCs afetadas | Nova `list_needs_attention`; usar `confirm_entry_task_candidates`, `undo_operation` e RPCs de retry/estado existentes. |
| Tabelas | `entries`, `entry_interpretations`, `pending_questions`, `tasks`, `jobs`, `undo_operations`; `entry_entities` apenas quando necessário ao título humano. |
| Migrations necessárias | `027`: RPC e índices parciais/owner-scoped. Não criar tabela `needs_attention`. |
| Edge Functions afetadas | Nenhuma mudança de comportamento além do estado do job produzido pelo Épico 1. |
| Projeções novas | `NeedsAttentionItemView[]`, agrupamento por entry, contagem e preview para Home. |
| DTOs novos | `NeedsAttentionItemView`, `AttentionReason`, `AttentionAction` e cursor/resultado paginado server-only. |
| Contratos de Action | Toda ação devolve estado recalculado ou sinal de revalidação. A fila não remove otimisticamente item sem sucesso; conflito retorna `action_no_longer_available`. |

### Testes e documentação

| Camada | Cobertura obrigatória |
| --- | --- |
| Testes unitários | Elegibilidade de cada motivo; exclusão de retry automático, pergunta respondida, candidato stale/record-only/materializado; agrupamento; precedência; copy e empty state. |
| Testes de integração | RPC só retorna owner; current pointer obrigatório; concorrência ação × refresh; paginação/cursor estável; item desaparece após ação; inconsistência falha fechada. |
| Playwright | Home mostra preview; filtro da Caixa lista os mesmos itens; resolver pergunta/candidato/retry remove item; navegação preserva locale; desktop/mobile. |
| Smoke remoto | `remote-daily-cycle-smoke.mjs`: fixtures para todos os motivos, exclusões, agrupamento, RLS cross-user e recálculo pós-ação. |
| Documentação a atualizar | `ARCHITECTURE.md`, `DATABASE.md`, `STATE.md`, `CHANGELOG.md`, `TODO.md` e inventário de projeções no relatório 2X. |

## Épico 3 — Projeção humana do lifecycle

### Objetivo técnico

Centralizar o mapeamento das oito condições internas e do estado de job nos cinco estados públicos, com precedência determinística e localização tipada. Nenhuma página ou componente decide lifecycle.

### Superfícies e persistência

| Item solicitado | Especificação |
| --- | --- |
| Componentes afetados | Badges/labels de Home, Caixa, revisão, receipt e status global. Componentes recebem `productState` e `messageKey`, não enums internos. |
| Rotas afetadas | Home, `/capture`, `/inbox`, `/inbox/{entryId}` e `/work` quando a origem é exibida. |
| Server Actions afetadas | Todas as Actions tocadas pela 2X retornam `productState` quando a mutação pode alterá-lo. |
| RPCs afetadas | Nenhuma RPC nova própria; consome saídas das RPCs dos Épicos 1, 2 e 5. |
| Tabelas | Leitura server-only de `entries`, `jobs`, `entry_interpretations`, `pending_questions` e `tasks`. |
| Migrations necessárias | Nenhuma exclusiva. Cobertura estrutural garante que novos estados internos falhem fechados até serem mapeados. |
| Edge Functions afetadas | Worker deve deixar entry/job em combinação que o mapper interprete sem ambiguidades. |
| Projeções novas | Função única de `ProductStateProjection`, usada por Inbox, Review e Home. |
| DTOs novos | `ProductState`, `ProductStateView` e `AttentionReason`. |
| Contratos de Action | `productState` nunca é texto localizado; `code` e `messageKey` permanecem estáveis. Estado desconhecido retorna `could_not_organize` ou inconsistência, nunca `ready`. |

### Testes e documentação

| Camada | Cobertura obrigatória |
| --- | --- |
| Testes unitários | Matriz completa; precedência; retry futuro; terminal; current candidate; record-only; pergunta respondida; status desconhecido; localização nos dois idiomas. |
| Testes de integração | Mesma fixture produz mesmo estado em Home, Caixa e detalhe; mudanças de job/candidate recalculam corretamente. |
| Playwright | Transições visíveis `saved → organizing → ready/needs_attention`; sem enum técnico em UI. |
| Smoke remoto | Coberto por smokes de entry processing e daily cycle; comparar estado esperado a partir das fixtures. |
| Documentação a atualizar | `ARCHITECTURE.md`, `DATABASE.md`, `DECISIONS.md`, `STATE.md` e matriz de estado no relatório. |

## Épico 4 — Revisão simplificada com progressive disclosure

### Objetivo técnico

Substituir a tela que expõe a revisão técnica completa por uma composição em cinco blocos: compreensão, o que exige ação, próximos passos, original e detalhes técnicos recolhidos. O payload principal não depende do payload técnico.

### Superfícies e persistência

| Item solicitado | Especificação |
| --- | --- |
| Componentes afetados | Criar `EntryReview`, `ReviewUnderstanding`, `ReviewAttention`, `ReviewNextActions`, `OriginalRecord` e `TechnicalDetails`; adaptar `RevisionEditor` e `TaskCandidateForm` para receber subcontratos. |
| Rotas afetadas | `/inbox/{entryId}`; links vindos de Home/Caixa. Não criar editor avançado de tarefas. |
| Server Actions afetadas | Correção, undo, reprocessamento, confirmação/undo de candidatos e resposta básica devem usar o Action result convergido. |
| RPCs afetadas | Nenhuma exclusiva; usa revisão atual, candidate consistency e undo existentes. |
| Tabelas | `entries`, `entry_interpretations`, `entry_entities`, `tasks`, `pending_questions`, `undo_operations`; dados técnicos lidos apenas pela projeção técnica. |
| Migrations necessárias | Nenhuma exclusiva. A migration `026` fornece `is_record_only` e proveniência. |
| Edge Functions afetadas | Nenhuma exclusiva; estado de reprocessamento assíncrono deve aparecer como organização, não bloquear a tela. |
| Projeções novas | `InterpretationReviewView` e `InterpretationTechnicalDetailsView` separados. |
| DTOs novos | Os dois DTOs, `ReviewHumanField`, `ActionableCandidateView`, `MaterializedTaskView` e `AvailableReviewAction`. |
| Contratos de Action | Resultados discriminam `saved`, `queued`, `conflict`, `no_longer_available` e `failed`; feedback fica junto à ação e não exige query string técnica. |

### Testes e documentação

| Camada | Cobertura obrigatória |
| --- | --- |
| Testes unitários | Mapper principal sem trust; mapper técnico completo; detalhes recolhidos; foco/live region; action visibility; original sempre presente; fallbacks de JSON inválido. |
| Testes de integração | Current pointer; history separado; payload principal não consulta/parseia trust para funcionar; conflict de versão; revalidação após undo/reprocess. |
| Playwright | Fluxo principal sem abrir detalhes; abrir/fechar detalhes por teclado; corrigir; record-only; confirmar/undo; mobile/PT-BR/en. |
| Smoke remoto | Reutilizar smoke de revisões e adicionar asserts de proveniência/current pointer necessários à projeção. |
| Documentação a atualizar | `ARCHITECTURE.md`, `STATE.md`, `CHANGELOG.md`, `TODO.md` e screenshots/evidência no relatório final. |

## Épico 5 — Coerência entre interpretação, candidatos e ações

### Objetivo técnico

Garantir no limite transacional que uma ação só materializa candidato da interpretação atual, com proveniência explícita, record-only respeitado, idempotência e conflito seguro. Corrigir a dependência atual de `source_entry_id + candidate_index` sem apagar tarefas já confirmadas.

### Superfícies e persistência

| Item solicitado | Especificação |
| --- | --- |
| Componentes afetados | `TaskCandidateForm`, seção de próximos passos e fila de atenção. Componentes recebem candidatos já filtrados; não comparam versões ou arrays. |
| Rotas afetadas | `/inbox/{entryId}`, Home, `/inbox?view=needs-you` e `/work` após materialização. |
| Server Actions afetadas | `confirmTaskCandidates`, undo da criação, `correctInterpretation` e `reprocessEntry` como causadores de recálculo. |
| RPCs afetadas | Nova `confirm_entry_task_candidates`; regressão de `correct_entry_interpretation`, `persist_reprocessed_entry_interpretation` e `undo_operation`; manter `confirm_entry_tasks` compatível, sem novos consumidores. |
| Tabelas | `tasks` ganha `source_interpretation_id` e `operation_key`/proveniência idempotente; `entry_interpretations` ganha `is_record_only`; usa `entries.current_interpretation_id` e `undo_operations`. |
| Migrations necessárias | `026`: colunas/FKs compostas owner-safe, backfill conservador, novo unique parcial, RPC de confirmação e atualização dos RPCs que persistem/reconstroem revisão. |
| Edge Functions afetadas | `entry.ts` deve persistir interpretação correta para o modo e nunca aceitar conclusão stale. |
| Projeções novas | Função server-only de candidatos acionáveis reutilizada por review e attention. |
| DTOs novos | `ActionableCandidateView` com `sourceInterpretationId` interno, `candidateIndex`, conteúdo humano e ações; `CandidateValidity` não é exibido. |
| Contratos de Action | Entrada exige `expectedInterpretationId` e `operationKey`; retorno inclui task IDs/undo/state. Stale retorna `candidate_no_longer_current`; record-only retorna `candidate_not_actionable`. |

### Testes e documentação

| Camada | Cobertura obrigatória |
| --- | --- |
| Testes unitários | Validade por current pointer; record-only; materializado; correction/reprocess/undo; duplicidade; fail-closed. |
| Testes de integração | Confirmar × corrigir concorrente; replay idempotente; cross-owner; FK de interpretação; tarefa confirmada sobrevive a correção; undo não ressuscita stale; backfill não inventa proveniência. |
| Playwright | Corrigir antes de confirmar remove candidato antigo; record-only zera ações; candidato válido cria tarefa em Trabalho; undo remove tarefa sem reexpor inválido. |
| Smoke remoto | Estender `remote-daily-cycle-smoke.mjs` com concorrência, idempotência, RLS, current pointer e tarefa persistente. |
| Documentação a atualizar | `DATABASE.md`, `ARCHITECTURE.md`, `SECURITY.md`, `DECISIONS.md`, `STATE.md`, `CHANGELOG.md`, `TODO.md`. |

## Épico 6 — Convergência de Home, Trabalho e Caixa

### Objetivo técnico

Fazer as três superfícies consumirem projeções consistentes: Home como resumo acionável, Caixa como registro e estado, Trabalho como consolidação das visões de tarefas já existentes.

### Superfícies e persistência

| Item solicitado | Especificação |
| --- | --- |
| Componentes afetados | `HomeDashboard`, `NeedsAttentionList`, `InboxList`/itens, `WorkView`, `TaskList` adaptado. |
| Rotas afetadas | Home, `/inbox`, `/inbox?view=needs-you`, nova `/work`; `/today`, `/tasks`, `/waiting` viram aliases/redirects preservando filtros. |
| Server Actions afetadas | Capture, confirmação/undo de tarefas e mutações existentes de task revalidam Home/Caixa/Trabalho de forma explícita. |
| RPCs afetadas | `list_needs_attention`; demais queries de Trabalho podem permanecer Supabase server-only dentro da projeção, sem RPC nova. |
| Tabelas | `entries`, `jobs`, `tasks`, `pending_questions`, revisões atuais. |
| Migrations necessárias | Apenas `027` para atenção/índices; nenhuma tabela `home` ou `work`. |
| Edge Functions afetadas | Nenhuma exclusiva. |
| Projeções novas | `HomeView` composto, `InboxItemView`, `NeedsAttentionItemView`, `WorkItemView`. |
| DTOs novos | `HomeDailyCycleView`, `InboxPageView`, `WorkPageView` e filtros `today/all/waiting`. |
| Contratos de Action | Revalidation matrix centralizada; Actions não conhecem componentes, apenas paths canônicos. |

### Testes e documentação

| Camada | Cobertura obrigatória |
| --- | --- |
| Testes unitários | Composição da Home; contagens; filtros; ordenação; origem humana/Brain; redirects e locale. |
| Testes de integração | Mesma fonte produz estado consistente nas três superfícies; tarefa criada aparece em Work; cursor/paginação. |
| Playwright | Captura → atenção → revisão → confirmação → Trabalho; Home e Caixa atualizam; aliases antigos funcionam. |
| Smoke remoto | Fixtures de daily cycle verificam query de atenção e materialização; não requer nova Edge Function. |
| Documentação a atualizar | `ARCHITECTURE.md`, `STATE.md`, `CHANGELOG.md`, `TODO.md`, screenshots e mapa de rotas. |

## Épico 7 — Reorganização da arquitetura de informação

### Objetivo técnico

Reduzir a navegação primária a Início, Caixa, Trabalho e Brain, com captura global e Mais agrupado em Contexto, Reflexão, Transparência/Avançado e Preferências, preservando acessibilidade e deep links.

### Superfícies e persistência

| Item solicitado | Especificação |
| --- | --- |
| Componentes afetados | `NavigationLinks`, `AppShell`, mobile More, capability registry, active-route resolver e ícone global de notificações. |
| Rotas afetadas | Todas as rotas autenticadas para classificação; canônicas: Home, Caixa, Trabalho e Brain. Aliases de trabalho redirecionam; Jobs nunca aparece na navegação comum. |
| Server Actions afetadas | Nenhuma de domínio; sign-out e captura global apenas sofrem regressão de reachability. |
| RPCs afetadas | Nenhuma. |
| Tabelas | Nenhuma. |
| Migrations necessárias | Nenhuma. |
| Edge Functions afetadas | Nenhuma. |
| Projeções novas | `NavigationView` estática por locale/capacidade; não é read model persistido. |
| DTOs novos | `NavigationGroup`, `NavigationDestination`, `CapabilityState`. |
| Contratos de Action | Não aplicável; links mantêm locale e destinos internos seguros. |

### Testes e documentação

| Camada | Cobertura obrigatória |
| --- | --- |
| Testes unitários | Grupos, ordem, active state em aliases/subrotas, locale, item oculto, touch target e aria labels. |
| Testes de integração | AppShell desktop/mobile e redirects sem loops. |
| Playwright | Todos os destinos alcançáveis; primários consistentes; Mais por teclado/touch; Jobs ausente; sem perda de locale. |
| Smoke remoto | Não necessário; coberto por build e Playwright online. |
| Documentação a atualizar | `ARCHITECTURE.md`, `STATE.md`, `CHANGELOG.md`, `TODO.md` e mapa de IA no relatório. |

## Épico 8 — Verdade operacional e remoção de promessas não implementadas

### Objetivo técnico

Criar um inventário executável de capacidades visíveis e garantir que status, configurações e copy correspondam a consumidores reais. Campos persistidos sem efeito não geram controles ativos.

### Superfícies e persistência

| Item solicitado | Especificação |
| --- | --- |
| Componentes afetados | Home status, `NavigationLinks`, configurações, formulários de preferências, Revisões e mensagens de captura/retry. |
| Rotas afetadas | Home, `/settings`, `/reviews`, `/costs`, `/history`, `/jobs`, além de todas as rotas auditadas por copy. |
| Server Actions afetadas | Actions de settings só aceitam controles operacionais visíveis; capture/reprocess/retry usam mensagens semanticamente distintas. |
| RPCs afetadas | Nenhuma nova; consumidores atuais de `save_profile_settings` e heartbeat/review são inventariados. |
| Tabelas | `agent_preferences`, `profiles`, `jobs` e tabelas consumidoras apenas para comprovar comportamento; não remover colunas na 2X. |
| Migrations necessárias | Nenhuma por padrão. Ocultar é preferível a remover persistência, preservando reversibilidade. |
| Edge Functions afetadas | `heartbeat` e `process-jobs` são auditadas como consumidores reais; sem expansão de automações. |
| Projeções novas | `CapabilityRegistryView` estática para shell/settings; status global derivado apenas de saved/organizing/attention. |
| DTOs novos | `CapabilityDefinition` com `state`, `surface`, `consumerEvidence` e `visible`; não é enviado integralmente ao cliente. |
| Contratos de Action | Códigos distinguem `saved`, `queued`, `completed`, `retry_scheduled` e `failed`; nenhum sucesso promete execução ainda pendente. |

### Testes e documentação

| Camada | Cobertura obrigatória |
| --- | --- |
| Testes unitários | Capability visibility; status global observável; campos futuros ocultos; auditoria lexical PT-BR/en para promessas proibidas sem evidência. |
| Testes de integração | Controle visível tem Action/consumer; controle oculto não é submetido; modelo/custos ficam avançados. |
| Playwright | Settings comum não mostra promessa futura; status da Home muda por dados reais; transparência segue alcançável em Mais. |
| Smoke remoto | Somente regressão dos consumidores reais existentes no `remote-supabase-smoke.mjs`. |
| Documentação a atualizar | Novo inventário promessa → consumidor → evidência no relatório; `AI_AGENT.md`, `ARCHITECTURE.md`, `STATE.md`, `CHANGELOG.md`, `TODO.md`. |

## Épico 9 — Instrumentação do funil de produto

### Objetivo técnico

Registrar eventos allowlisted do ciclo sem conteúdo pessoal, separados de audit, jobs e AI ledger, e permitir derivar tempos/conversões definidos no PRD.

### Superfícies e persistência

| Item solicitado | Especificação |
| --- | --- |
| Componentes afetados | Pequenos emissores client-side em captura, atenção, revisão, detalhes técnicos e Trabalho; nenhum componente conhece Supabase. |
| Rotas afetadas | Home, capture, inbox, detalhe e work; não criar dashboard de analytics na 2X. |
| Server Actions afetadas | Nova `recordProductInteraction`; instrumentar Actions de captura, correção, confirmação, resposta, retry e status de task de forma best-effort. |
| RPCs afetadas | `record_product_event` e `record_product_event_for_user`. |
| Tabelas | Nova `product_events`; referências opcionais por IDs opacos sem FK que impeça retenção/limpeza. |
| Migrations necessárias | `024`: tabela, constraints/allowlists, índices, RLS, grants, RPCs e política de retenção documentada. |
| Edge Functions afetadas | `process-jobs` emite completed/failed para o owner; falha da telemetria não falha o job. |
| Projeções novas | Nenhuma UI de analytics. Funções server-only de agregação podem existir somente para verificação interna das métricas do PRD. |
| DTOs novos | `ProductEventName`, `ProductSurface`, `ProductEventPayload`, propriedades por evento e `ProductEventResult`. |
| Contratos de Action | Action retorna somente ack best-effort; rejeita nome/chave não allowlisted; não recebe texto livre, original, resumo, resposta, prompt, evidência ou erro bruto. |

### Testes e documentação

| Camada | Cobertura obrigatória |
| --- | --- |
| Testes unitários | Taxonomia dos 17 eventos; allowlist por evento; sanitização; dedupe; falha best-effort; proibição de conteúdo. |
| Testes de integração | RLS owner; service role controlada; eventos inválidos rejeitados; índices/retention; Action principal não falha com analytics indisponível. |
| Playwright | Jornada produz eventos esperados; `technical_details_opened` somente ao abrir; não assertar conteúdo sensível. |
| Smoke remoto | `remote-product-events-smoke.mjs`: insert permitido, payload proibido, RLS, worker event, dedupe e cleanup. |
| Documentação a atualizar | `DATABASE.md`, `SECURITY.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `STATE.md`, `CHANGELOG.md`, política de retenção e dicionário de eventos. |

## Épico 10 — Arquitetura de projeção e simplificação do domínio da UI

### Objetivo técnico

Estabelecer uma fronteira concreta, limitada ao ciclo diário, na qual páginas carregam projeções e componentes renderizam DTOs. Tipos persistidos, trust, evidence, policy, JSON parsing e lifecycle ficam em módulos server-only.

### Superfícies e persistência

| Item solicitado | Especificação |
| --- | --- |
| Componentes afetados | HomeDashboard, Caixa, NeedsAttentionList, EntryReview, TechnicalDetails, WorkView, TaskCandidateForm e receipt. |
| Rotas afetadas | Home, capture, inbox, inbox detail e work; aliases apenas redirecionam. |
| Server Actions afetadas | Todas as Actions listadas na seção 4.4 convergem para resultados estáveis, sem impor mudança global às Actions fora da 2X. |
| RPCs afetadas | Usa as RPCs produto-específicas dos demais épicos; não criar RPC genérica de read model. |
| Tabelas | Nenhum componente acessa tabela. Módulos server-only podem usar `database.types.ts`, queries e RPCs mantendo RLS. |
| Migrations necessárias | Nenhuma exclusiva; 024–027 fornecem apenas dados/atomicidade que não podem ser projetados com segurança no cliente. |
| Edge Functions afetadas | Nenhuma exclusiva; o worker entrega estados persistidos que as projeções consomem. |
| Projeções novas | Todas as seis projeções mínimas do PRD, mais composições Home/Inbox/Work sem nova plataforma. |
| DTOs novos | Os DTOs da seção 4.2 e subtipos fechados; todos serializáveis e validados na fronteira. |
| Contratos de Action | Base discriminada e especializações da seção 4.3; copy localizada na borda; erro interno nunca atravessa. |

### Testes e documentação

| Camada | Cobertura obrigatória |
| --- | --- |
| Testes unitários | Contratos, validação JSON, fallback, action availability, type consistency e mapper único. Teste arquitetural impede imports de `database.types` em componentes centrais e termos internos proibidos. |
| Testes de integração | Queries owner-scoped; páginas usam loaders da feature; technical details separado; mudança de enum interno exige só ajuste do mapper. |
| Playwright | Fluxo completo funciona sem detalhes técnicos; detalhes permanecem acessíveis; nenhum enum/score/policy aparece inadvertidamente. |
| Smoke remoto | Smokes validam a matéria-prima e as RPCs; projeção visual é validada pelo Playwright online. |
| Documentação a atualizar | `ARCHITECTURE.md` com dependências permitidas, `ENGINEERING_STANDARDS.md` com regra de projeção, `DECISIONS.md`, `STATE.md`, `CHANGELOG.md`, `TODO.md` e relatório final. |

### 7.1 Rastreabilidade dos requisitos do PRD

| Família do PRD | Faixa | Épico proprietário | Slices de implementação | Evidência principal |
| --- | --- | --- | --- | --- |
| Captura assíncrona | `ASY-001`–`ASY-015` | 1 | 2X.3–2X.5 | pgTAP, worker tests, remote entry smoke e Playwright de latência. |
| Retorno imediato | `RET-001`–`RET-007` | 1 | 2X.5 | Action/form tests e Playwright sem redirect. |
| Precisa de você | `NY-001`–`NY-015` | 2 | 2X.10–2X.11 | SQL/projection tests, daily-cycle smoke e Playwright. |
| Estado humano | `STA-001`–`STA-010` | 3 | 2X.1 e 2X.6 | matriz unitária e consistência Home/Caixa/review. |
| Revisão progressiva | `REV-001`–`REV-012` | 4 | 2X.8–2X.9 | component/integration tests e Playwright acessível. |
| Coerência de ações | `COH-001`–`COH-011` | 5 | 2X.7 e 2X.10 | pgTAP, concorrência remota e candidate journey. |
| Convergência do fluxo | `FLOW-001`–`FLOW-021` | 6 | 2X.6, 2X.11 e 2X.12 | projection tests e jornada captura → Trabalho. |
| Arquitetura de informação | `IA-001`–`IA-013` | 7 | 2X.13 | shell tests e reachability desktop/mobile. |
| Verdade operacional | `TRU-001`–`TRU-012` | 8 | 2X.14 | capability registry, copy scan e Playwright. |
| Métricas | `MET-001`–`MET-024` | 9 | 2X.2 e 2X.15 | privacy/unit tests, event smoke e funnel assertions. |
| Projeções de produto | `PROJ-001`–`PROJ-020` | 10 | 2X.1, 2X.6, 2X.8, 2X.10, 2X.12 e 2X.16 | contract/architecture tests e páginas migradas. |
| Requisitos transversais | `XG-001`–`XG-035` | Todos | 2X.1–2X.18 | gates por slice, E2E completo, smokes e relatório final. |

---

## 8. Estratégia de slices

### 8.1 Regra de independência e reversão

Cada slice deve produzir um estado implantável. “Independente” significa que o slice pode ser revisado, testado, implantado e revertido sem reverter outro commit posterior ainda não iniciado. Dependências anteriores podem existir e estão declaradas.

Para preservar rollback:

- migrations são aditivas enquanto houver código antigo em produção;
- contratos novos convivem com Actions/RPCs antigas até o consumidor migrar;
- redirects só entram quando a rota canônica nova estiver verde;
- eventos são best-effort e nunca bloqueiam domínio;
- o caminho síncrono de captura só é removido do consumidor depois do worker remoto estar provado;
- remoção física de compatibilidade fica fora da 2X, salvo aprovação separada.

### 8.2 Gate obrigatório de todo slice

Antes do commit de qualquer slice, executar e registrar:

1. testes focados do slice em modo run;
2. `npm test`;
3. `npm run lint`;
4. `npm run typecheck`;
5. `npm run build`;
6. Playwright quando o slice tocar UI/rotas;
7. pgTAP/SQL e smoke remoto quando tocar migration, RPC ou Edge Function;
8. `git diff --check` e revisão do escopo staged;
9. confirmação de que o working tree não contém arquivos alheios ao commit.

Falha em qualquer gate impede o commit e o início do slice seguinte.

## Slice 2X.1 — Contratos do ciclo diário e guardrails arquiteturais

**Resultado implantável:** contratos e matriz de estado existem, são testados e não alteram ainda a experiência visual.

**Épicos cobertos:** 3 e 10.

**Dificuldade:** média. **Risco:** baixo. **Impacto no usuário:** nenhum imediato. **Dependências:** nenhuma. **Estimativa relativa:** 3 pontos.

**Arquivos:**

- criar `src/features/daily-cycle/contracts.ts`;
- criar `src/features/daily-cycle/action-result.ts`;
- criar `src/features/daily-cycle/copy.ts`;
- criar `src/features/daily-cycle/lifecycle.ts`;
- criar testes vizinhos para os quatro módulos;
- modificar `src/features/interpretations/copy.ts` somente para eliminar duplicidade, sem mudar UI.

**Ordem de execução:**

- [ ] Definir em teste os cinco `ProductState`, cinco `AttentionReason`, DTOs e Action result discriminado.
- [ ] Definir em teste toda a matriz dos oito estados internos combinados com job, perguntas, candidatos, record-only e tarefas materializadas.
- [ ] Implementar contratos serializáveis, sem imports de React ou Supabase.
- [ ] Implementar mapper fail-closed e copy PT-BR/en.
- [ ] Adicionar teste arquitetural inicial que proíbe tipos de banco nos novos contratos.
- [ ] Executar gate global.
- [ ] Criar um único commit sugerido: `test(phase-2x): define daily cycle product contracts`.

**Rollback isolado:** remover somente o novo diretório e a deduplicação de copy; nenhum consumidor de produção depende dele ainda.

## Slice 2X.2 — Fundação privada de eventos de produto

**Resultado implantável:** eventos allowlisted podem ser gravados e verificados, mas nenhum fluxo principal depende da telemetria.

**Épicos cobertos:** 9 e 10.

**Dificuldade:** média. **Risco:** médio. **Impacto no usuário:** nenhum visível. **Dependências:** 2X.1. **Estimativa relativa:** 3 pontos.

**Arquivos:**

- criar migration `202607170024_phase_2x_product_events.sql`;
- criar `supabase/tests/product_events.sql`;
- regenerar `src/lib/supabase/database.types.ts`;
- criar `src/features/product-analytics/contracts.ts`, `server.ts`, `actions.ts` e testes;
- criar `scripts/remote-product-events-smoke.mjs`;
- adicionar script focado ao `package.json`.

**Ordem de execução:**

- [ ] Especificar em pgTAP tabela, check constraints, RLS, grants, índices, funções e negação cross-user.
- [ ] Especificar em Vitest a taxonomia dos 17 eventos e allowlist de propriedades por evento.
- [ ] Implementar migration e gerar tipos.
- [ ] Implementar emissor server-only e Action best-effort sem conteúdo livre.
- [ ] Implementar smoke remoto com usuários descartáveis, payload proibido, RLS, dedupe e cleanup.
- [ ] Aplicar em ambiente linked somente após lint/reset local ou revisão estrutural equivalente.
- [ ] Executar gate global, pgTAP e smoke remoto.
- [ ] Criar um único commit sugerido: `feat(analytics): add private product funnel events`.

**Rollback isolado:** como nenhum fluxo emite ainda, revogar/remover RPCs e tabela por migration compensatória; não reescrever `audit_logs`.

## Slice 2X.3 — Contrato atômico de captura e jobs de entrada

**Resultado implantável:** banco aceita captura + enqueue atômicos e claims de interpretação, enquanto a UI continua no caminho síncrono antigo.

**Épicos cobertos:** 1, 3, 5 e 10.

**Dificuldade:** alta. **Risco:** alto. **Impacto no usuário:** nenhum imediato. **Dependências:** 2X.1 e 2X.2. **Estimativa relativa:** 5 pontos.

**Arquivos:**

- criar migration `202607170025_phase_2x_entry_processing_jobs.sql`;
- criar `supabase/tests/entry_processing_jobs.sql`;
- regenerar `src/lib/supabase/database.types.ts`;
- iniciar `scripts/remote-entry-processing-smoke.mjs` cobrindo somente contratos de banco;
- atualizar `docs/DATABASE.md` com job type/payload e ownership.

**Ordem de execução:**

- [ ] Especificar atomicidade, idempotência e ownership de `capture_entry_async`.
- [ ] Especificar payload mínimo e índice por `entry_id` sem original duplicado.
- [ ] Especificar claims por ID e próximo elegível com lease, `skip locked`, attempts e type guard.
- [ ] Especificar `enqueue_entry_reprocessing` sem executar IA.
- [ ] Implementar RPCs e grants service/authenticated mínimos; preservar wrappers de anexo.
- [ ] Gerar tipos e provar que o código antigo compila sem consumir as RPCs novas.
- [ ] Executar concorrência, cross-user, replay, stale worker e rollback parcial no smoke remoto.
- [ ] Executar gate global e testes de banco.
- [ ] Criar um único commit sugerido: `feat(db): add atomic entry capture job contracts`.

**Rollback isolado:** código atual não usa os contratos; migration compensatória remove funções/índices novos sem tocar entries/jobs criados pelo fluxo antigo.

## Slice 2X.4 — Worker de interpretação e dispatch automático

**Resultado implantável:** jobs de entrada criados por fixture são processados de ponta a ponta e retries elegíveis são drenados automaticamente; captura de produção ainda pode permanecer síncrona.

**Épicos cobertos:** 1, 3, 5 e 9.

**Dificuldade:** muito alta. **Risco:** alto. **Impacto no usuário:** nenhum até o corte. **Dependências:** 2X.2 e 2X.3. **Estimativa relativa:** 8 pontos.

**Arquivos:**

- criar `supabase/functions/process-jobs/attachment.ts` movendo comportamento existente sem mudança;
- criar `supabase/functions/process-jobs/entry.ts`;
- criar `supabase/functions/process-jobs/dispatch.ts`;
- reduzir `supabase/functions/process-jobs/index.ts` a autenticação, claim e roteamento;
- modificar `supabase/functions/process-jobs/deno.json`;
- adicionar testes do dispatch/resultado;
- concluir `scripts/remote-entry-processing-smoke.mjs`;
- modificar `scripts/remote-job-reliability-smoke.mjs` apenas para regressão de anexos;
- documentar configuração segura do dispatch agendado.

**Ordem de execução:**

- [ ] Congelar em testes/remote smoke o comportamento atual de `process_attachment`.
- [ ] Extrair processador de anexo sem alterar payload, modelo, usage, lease ou mensagens.
- [ ] Especificar dispatch por type e rejeição de type/payload desconhecido.
- [ ] Implementar processador de entrada usando um único pipeline para `initial` e `reprocess`.
- [ ] Persistir AI usage e product events como efeitos independentes do resultado principal.
- [ ] Implementar invocação direta autenticada e invocação interna agendada com segredo/Vault, sem service key no repositório.
- [ ] Provar pending, retry futuro, exhaustion, lease expired, worker stale, persisted-result reuse e failure sanitization.
- [ ] Implantar versão nova da Edge Function e executar smoke de anexos e de entradas.
- [ ] Executar gate global.
- [ ] Criar um único commit sugerido: `feat(jobs): process entry interpretations asynchronously`.

**Rollback isolado:** redeploy da versão anterior de `process-jobs`; RPCs 025 permanecem inativas para a UI. O rollback não apaga jobs pending.

## Slice 2X.5 — Corte vertical da captura para assíncrono

**Resultado implantável:** usuário salva e continua imediatamente; a entrada progride pelo worker já provado.

**Épicos cobertos:** 1, 3, 6, 9 e 10.

**Dificuldade:** alta. **Risco:** alto. **Impacto no usuário:** muito alto. **Dependências:** 2X.1–2X.4. **Estimativa relativa:** 5 pontos.

**Arquivos:**

- modificar `src/features/capture/actions.ts` e testes;
- modificar `src/features/capture/quick-capture-form.tsx` e testes;
- criar `src/features/daily-cycle/capture-receipt.tsx` e teste;
- modificar Home e `/capture` para continuidade/receipt;
- modificar `src/features/interpretations/actions.ts` para enqueue de reprocessamento;
- adaptar retry de entrada em `src/features/agent/actions.ts` sem quebrar anexos;
- atualizar `e2e/intelligent-capture.spec.ts`.

**Ordem de execução:**

- [ ] Especificar Action result de persistência, replay, validation, session e storage failure.
- [ ] Especificar formulário: texto preservado em falha, limpeza após receipt, foco restaurado e capturas consecutivas.
- [ ] Trocar `captureEntry` pela RPC atômica e por kick não bloqueante do worker.
- [ ] Remover redirect obrigatório e renderizar receipt com safe href.
- [ ] Trocar `reprocessEntry` por enqueue e copy honesta.
- [ ] Emitir eventos de save/enqueue sem bloquear a Action.
- [ ] Executar Playwright com resposta de IA deliberadamente atrasada e confirmar interação antes da conclusão.
- [ ] Executar smokes remotos de entrada, anexos e eventos, além do gate global.
- [ ] Criar um único commit sugerido: `feat(capture): return immediately after durable enqueue`.

**Rollback isolado:** reverter Action/form para o caminho síncrono; worker e RPCs permanecem compatíveis e jobs já criados continuam processáveis.

## Slice 2X.6 — Estado humano em Caixa e Home

**Resultado implantável:** Caixa e Home usam o mesmo mapper e exibem os cinco estados humanos sem expor lifecycle interno.

**Épicos cobertos:** 3, 6 e 10.

**Dificuldade:** média. **Risco:** médio. **Impacto no usuário:** alto. **Dependências:** 2X.1 e 2X.5. **Estimativa relativa:** 3 pontos.

**Arquivos:**

- criar `src/features/daily-cycle/inbox-projection.ts` e testes;
- modificar `src/features/shell/home-dashboard.tsx` e testes;
- modificar páginas Home e Caixa;
- criar/adaptar item de Caixa orientado a `InboxItemView`;
- modificar `src/i18n/messages.ts`.

**Ordem de execução:**

- [ ] Especificar queries mínimas e owner-scoped para entry atual + job relevante.
- [ ] Especificar JSON/fallback e estado desconhecido fail-closed.
- [ ] Implementar `InboxItemView` sem exportar rows Supabase.
- [ ] Migrar Caixa e blocos correspondentes da Home para a projeção.
- [ ] Remover cálculos e copy de lifecycle dessas páginas/componentes.
- [ ] Cobrir transições, vazio, paginação e ambos os locales em testes.
- [ ] Executar Playwright desktop/mobile e gate global.
- [ ] Criar um único commit sugerido: `feat(inbox): project human processing states`.

**Rollback isolado:** reverter os consumidores para queries antigas; contratos e captura assíncrona permanecem válidos.

## Slice 2X.7 — Proveniência e confirmação segura de candidatos

**Resultado implantável:** nenhuma tarefa nova pode nascer de candidato stale, record-only ou de revisão diferente da current.

**Épicos cobertos:** 2, 4, 5 e 10.

**Dificuldade:** muito alta. **Risco:** alto. **Impacto no usuário:** alto. **Dependências:** 2X.1, 2X.3 e 2X.5. **Estimativa relativa:** 8 pontos.

**Arquivos:**

- criar migration `202607170026_phase_2x_candidate_action_consistency.sql`;
- criar `supabase/tests/candidate_action_consistency.sql`;
- regenerar `src/lib/supabase/database.types.ts`;
- modificar `src/features/tasks/actions.ts` e testes;
- modificar `src/features/tasks/task-candidate-form.tsx` e testes;
- modificar loaders de interpretação somente na fronteira server-only;
- estender `scripts/remote-daily-cycle-smoke.mjs`.

**Ordem de execução:**

- [ ] Especificar colunas, owner FK, backfill conservador e unique por interpretação/candidate.
- [ ] Especificar `is_record_only` em persist, correction, reprocess e undo.
- [ ] Especificar nova RPC com expected current interpretation e operation key.
- [ ] Provar em integração as corridas confirmar × corrigir e confirmar × reprocessar.
- [ ] Implementar migration sem remover RPC antiga.
- [ ] Migrar a Action para a nova RPC e o componente para candidato projetado.
- [ ] Garantir que tarefa já confirmada sobreviva a correção e que undo não ressuscite candidato inválido.
- [ ] Executar pgTAP, smoke remoto, Playwright focal e gate global.
- [ ] Criar um único commit sugerido: `fix(tasks): bind candidate actions to current interpretation`.

**Rollback isolado:** reverter Action para RPC antiga somente se ainda não houver dependência dos novos campos; migration aditiva fica instalada até cleanup seguro. Não apagar proveniência já gravada.

## Slice 2X.8 — Projeções separadas de revisão e detalhes técnicos

**Resultado implantável:** a página de detalhe recebe DTO principal e DTO técnico separados, mantendo inicialmente equivalência funcional visual.

**Épicos cobertos:** 3, 4, 5 e 10.

**Dificuldade:** alta. **Risco:** médio. **Impacto no usuário:** médio. **Dependências:** 2X.1, 2X.6 e 2X.7. **Estimativa relativa:** 5 pontos.

**Arquivos:**

- criar `src/features/daily-cycle/review-projection.ts` e teste;
- criar `src/features/daily-cycle/technical-details-projection.ts` e teste;
- modificar `src/features/interpretations/data.ts` e testes para virar infraestrutura interna;
- modificar `src/app/[locale]/app/inbox/[entryId]/page.tsx`;
- adicionar teste arquitetural de imports.

**Ordem de execução:**

- [ ] Fixar por teste o contrato humano sem scores/policies/evidence.
- [ ] Fixar por teste o contrato técnico separado e completo.
- [ ] Implementar queries e validações server-only, preservando current pointer e ownership.
- [ ] Adaptar a página para consumir somente os dois loaders de projeção.
- [ ] Garantir que falha do detalhe técnico não declare a entrada pronta nem destrua o fluxo principal.
- [ ] Proibir import de `database.types.ts` na página e futuros componentes centrais.
- [ ] Executar testes focados, Playwright de regressão da revisão e gate global.
- [ ] Criar um único commit sugerido: `refactor(review): separate product and technical projections`.

**Rollback isolado:** reverter a página e loaders; migration 026 e Actions seguras permanecem independentes.

## Slice 2X.9 — Revisão progressiva orientada à decisão

**Resultado implantável:** revisão mostra primeiro compreensão e ações; original e detalhes continuam disponíveis sem dominar o fluxo.

**Épicos cobertos:** 2, 4, 5 e 10.

**Dificuldade:** alta. **Risco:** médio. **Impacto no usuário:** muito alto. **Dependências:** 2X.7 e 2X.8. **Estimativa relativa:** 5 pontos.

**Arquivos:**

- criar `src/features/daily-cycle/entry-review.tsx` e testes;
- criar `src/features/daily-cycle/technical-details.tsx` e testes;
- adaptar `src/features/interpretations/revision-editor.tsx`;
- adaptar `src/features/tasks/task-candidate-form.tsx`;
- modificar CSS relevante em `src/app/globals.css` ou arquivo de feature existente;
- atualizar `e2e/intelligent-capture.spec.ts`.

**Ordem de execução:**

- [ ] Especificar renderização dos blocos A–E e ordem de foco.
- [ ] Especificar visibilidade de ações exclusivamente por `availableActions`.
- [ ] Implementar compreensão, atenção, próximos passos e original.
- [ ] Implementar detalhes recolhidos com `details/summary` ou mecanismo acessível equivalente.
- [ ] Adaptar editor existente sem criar edição avançada de candidato.
- [ ] Garantir live regions, foco pós-Action e touch targets.
- [ ] Executar Playwright correction, record-only, candidate confirm/undo e technical disclosure em PT-BR/en, desktop/mobile.
- [ ] Executar gate global.
- [ ] Criar um único commit sugerido: `feat(review): prioritize decisions with progressive disclosure`.

**Rollback isolado:** reverter composição visual e manter loaders novos; nenhuma persistência muda.

---

## Slice 2X.10 — Consulta e projeção de “Precisa de você”

**Resultado implantável:** backend produz uma fila correta e paginável para fixtures reais, ainda sem alterar Home/Caixa.

**Épicos cobertos:** 2, 3, 5 e 10.

**Dificuldade:** alta. **Risco:** alto. **Impacto no usuário:** nenhum até o consumidor. **Dependências:** 2X.6 e 2X.7. **Estimativa relativa:** 5 pontos.

**Arquivos:**

- criar migration `202607170027_phase_2x_needs_attention_projection.sql`;
- criar `supabase/tests/needs_attention_projection.sql`;
- regenerar `src/lib/supabase/database.types.ts`;
- criar `src/features/daily-cycle/attention-projection.ts` e testes;
- concluir fixtures de atenção em `scripts/remote-daily-cycle-smoke.mjs`.

**Ordem de execução:**

- [ ] Especificar em SQL os cinco motivos permitidos e todas as exclusões do PRD.
- [ ] Especificar current pointer, record-only, materialização, perguntas respondidas e retry futuro.
- [ ] Especificar agrupamento por entry, precedência, cursor e limite máximo.
- [ ] Implementar RPC retornando somente IDs, reason codes, timestamps e chaves; sem copy ou trust.
- [ ] Implementar mapper para `NeedsAttentionItemView` com queries owner-scoped adicionais mínimas.
- [ ] Provar RLS, concorrência e desaparecimento após cada ação suportada.
- [ ] Executar pgTAP, smoke remoto e gate global.
- [ ] Criar um único commit sugerido: `feat(attention): project supported user decisions`.

**Rollback isolado:** nenhum consumidor de UI existe; remover RPC/índices por migration compensatória e apagar módulo de projeção.

## Slice 2X.11 — “Precisa de você” na Home e Caixa

**Resultado implantável:** Home mostra contagem/preview e Caixa oferece filtro canônico com a mesma projeção.

**Épicos cobertos:** 2, 3, 6 e 10.

**Dificuldade:** alta. **Risco:** médio. **Impacto no usuário:** muito alto. **Dependências:** 2X.9 e 2X.10. **Estimativa relativa:** 5 pontos.

**Arquivos:**

- criar `src/features/daily-cycle/needs-attention-list.tsx` e testes;
- modificar `src/features/shell/home-dashboard.tsx` e testes;
- modificar páginas Home e Caixa;
- modificar componentes de filtro/paginação da Caixa;
- modificar `src/i18n/messages.ts`;
- atualizar Playwright.

**Ordem de execução:**

- [ ] Especificar lista, agrupamento, ação primária/secundária e empty state.
- [ ] Integrar preview limitado na Home sem duplicar regra.
- [ ] Integrar `view=needs-you` na Caixa com cursor/URL estável.
- [ ] Ligar Actions já suportadas e revalidar as duas superfícies somente após sucesso.
- [ ] Emitir viewed/opened apenas via contrato analytics best-effort.
- [ ] Validar foco, leitor de tela, locale, mobile e touch.
- [ ] Executar Playwright para cada motivo e remoção pós-ação; executar gate global.
- [ ] Criar um único commit sugerido: `feat(attention): add needs-you daily queue`.

**Rollback isolado:** remover filtro/preview; RPC e projeção permanecem sem consumidor e não alteram domínio.

## Slice 2X.12 — Trabalho como rota canônica e projeção de tarefas

**Resultado implantável:** `/work` reúne Hoje, Todas e Aguardando usando `WorkItemView`; URLs antigas continuam válidas por redirect.

**Épicos cobertos:** 3, 5, 6 e 10.

**Dificuldade:** alta. **Risco:** médio. **Impacto no usuário:** alto. **Dependências:** 2X.6 e 2X.7. **Estimativa relativa:** 5 pontos.

**Arquivos:**

- criar `src/features/daily-cycle/work-projection.ts` e testes;
- criar `src/features/daily-cycle/work-view.tsx` e testes;
- criar `src/app/[locale]/app/work/page.tsx`;
- converter páginas Today, Tasks e Waiting em redirects/aliases seguros;
- adaptar `src/features/operations/task-list.tsx` e Actions apenas onde necessário;
- atualizar Playwright de rotas.

**Ordem de execução:**

- [ ] Definir filtros `today`, `all` e `waiting`, ordenação, paginação e estados humanos.
- [ ] Implementar projeção owner-scoped sem tipo persistido no componente.
- [ ] Implementar rota canônica e troca de view por query/controle acessível.
- [ ] Preservar criação manual e mutações de task já existentes sem adicionar editor avançado.
- [ ] Adicionar redirects com locale e filtro correspondente.
- [ ] Provar que tarefa confirmada aparece em Trabalho e que undo recalcula.
- [ ] Executar Playwright de rota/alias, desktop/mobile e gate global.
- [ ] Criar um único commit sugerido: `feat(work): converge existing task views`.

**Rollback isolado:** remover rota Work e restaurar páginas antigas; projeção pode permanecer sem consumidor.

## Slice 2X.13 — Navegação primária e agrupamento Mais

**Resultado implantável:** desktop e mobile compartilham Início, Caixa, Trabalho e Brain; captura é global e demais destinos ficam agrupados.

**Épicos cobertos:** 6, 7 e 8.

**Dificuldade:** média. **Risco:** médio. **Impacto no usuário:** muito alto. **Dependências:** 2X.11 e 2X.12. **Estimativa relativa:** 3 pontos.

**Arquivos:**

- criar `src/features/shell/capabilities.ts` e teste inicial;
- modificar `src/features/shell/navigation-links.tsx`;
- modificar `src/features/shell/app-shell.tsx` e testes;
- modificar CSS de navegação desktop/mobile;
- atualizar `e2e/online-mobile-navigation.spec.ts` e `e2e/foundation.spec.ts`.

**Ordem de execução:**

- [ ] Definir classificação concreta de todas as rotas: primário, Contexto, Reflexão, Transparência/Avançado e Preferências.
- [ ] Definir Jobs como alcançável apenas por contexto técnico explícito, nunca na navegação comum.
- [ ] Implementar árvore desktop e Mais mobile com a mesma ordem conceitual.
- [ ] Implementar active state para Work e aliases/subrotas.
- [ ] Preservar notificações no ícone global e captura visualmente distinta.
- [ ] Validar tab order, Escape/fechamento, touch target e viewport.
- [ ] Executar Playwright de reachability em ambos os locales/dispositivos e gate global.
- [ ] Criar um único commit sugerido: `feat(shell): converge daily information architecture`.

**Rollback isolado:** reverter shell/navigation; rotas canônicas e redirects continuam acessíveis diretamente.

## Slice 2X.14 — Verdade operacional de status, configurações e copy

**Resultado implantável:** toda promessa visível possui consumidor/evidência; preferências futuras ficam ocultas ou claramente informativas.

**Épicos cobertos:** 7 e 8.

**Dificuldade:** média. **Risco:** médio. **Impacto no usuário:** alto. **Dependências:** 2X.13. **Estimativa relativa:** 3 pontos.

**Arquivos:**

- completar `src/features/shell/capabilities.ts` e testes;
- modificar Home status;
- modificar páginas/componentes de Settings e Reviews;
- modificar `src/features/profile/settings-form.tsx`, payload/schema e testes quando controles forem ocultados;
- revisar `src/i18n/messages.ts` e copy local de features;
- criar seção de inventário em `docs/PHASE_2X_REPORT.md` durante a execução.

**Ordem de execução:**

- [ ] Inventariar cada controle/mensagem com consumer e teste existentes.
- [ ] Classificar concretamente como operacional, informativo, avançado ou futuro/oculto.
- [ ] Ocultar horário/promessa de revisão automática quando não houver execução comprovada.
- [ ] Mover roteamento por modelo e custos para avançado/transparência.
- [ ] Substituir “Brain ativo/atento” estático por “Tudo salvo”, contagem organizando ou atenção real.
- [ ] Diferenciar salvar, enqueue, processar, retry e concluir em PT-BR/en.
- [ ] Rodar scanner lexical e Playwright de Settings/Home; executar gate global.
- [ ] Criar um único commit sugerido: `fix(product): align visible promises with behavior`.

**Rollback isolado:** restaurar visibilidade/copy; nenhuma coluna ou capacidade é removida.

## Slice 2X.15 — Instrumentação completa do funil diário

**Resultado implantável:** os 17 eventos do PRD são emitidos nos pontos corretos e permitem derivar métricas sem conteúdo pessoal.

**Épicos cobertos:** 1, 2, 4, 6, 8 e 9.

**Dificuldade:** alta. **Risco:** médio. **Impacto no usuário:** baixo e indireto. **Dependências:** 2X.2, 2X.5, 2X.9, 2X.11, 2X.12 e 2X.14. **Estimativa relativa:** 5 pontos.

**Arquivos:**

- modificar Actions de capture, interpretations, tasks, agent e operations;
- adicionar emissores pequenos aos componentes Home/attention/review/work;
- modificar `src/features/product-analytics/contracts.ts`, `server.ts`, `actions.ts` e testes;
- estender `scripts/remote-product-events-smoke.mjs`;
- atualizar Playwright para verificar somente nomes/contagens seguros.

**Ordem de execução:**

- [ ] Mapear cada evento a exatamente um owner de emissão e um ponto sem duplicidade.
- [ ] Instrumentar backend para save/enqueue/completed/failed/corrected/confirmed/answered/retry/status change.
- [ ] Instrumentar views/opens/technical disclosure como eventos de interação deduplicados por sessão.
- [ ] Garantir que eventos de worker usem service RPC owner-scoped.
- [ ] Provar que indisponibilidade de analytics não muda Action, job ou UI.
- [ ] Implementar consultas internas de verificação para latência e conversões, sem dashboard novo.
- [ ] Executar testes de privacidade, smoke remoto, Playwright e gate global.
- [ ] Criar um único commit sugerido: `feat(analytics): instrument the daily product funnel`.

**Rollback isolado:** remover chamadas de emissão; tabela/RPC permanecem inertes e não afetam domínio.

## Slice 2X.16 — Fechamento da fronteira de projeções

**Resultado implantável:** Home, Caixa, revisão e Trabalho não importam rows do banco, não parseiam trust/policy/evidence e não calculam ações/lifecycle.

**Épicos cobertos:** 3, 4, 5, 6 e 10.

**Dificuldade:** média. **Risco:** médio. **Impacto no usuário:** baixo; reduz risco futuro. **Dependências:** 2X.6, 2X.8, 2X.10, 2X.11 e 2X.12. **Estimativa relativa:** 3 pontos.

**Arquivos:**

- modificar páginas/componentes centrais residuais encontrados pelo audit;
- reduzir ou tornar server-only `src/features/interpretations/data.ts`;
- adicionar `src/features/daily-cycle/architecture.test.ts`;
- modificar `docs/ENGINEERING_STANDARDS.md` e `docs/ARCHITECTURE.md`.

**Ordem de execução:**

- [ ] Rodar inventário de imports e termos internos nas quatro superfícies.
- [ ] Migrar qualquer query, JSON parse, score check ou enum restante para projeção específica.
- [ ] Garantir payload técnico separado e não necessário ao fluxo principal.
- [ ] Adicionar teste arquitetural para arquivos centrais e lista explícita de dependências proibidas.
- [ ] Confirmar que Actions e projeções reutilizam a mesma regra de validade de candidato.
- [ ] Revisar DRY/YAGNI e remover abstrações sem segundo consumidor real.
- [ ] Executar testes focados e gate global.
- [ ] Criar um único commit sugerido: `refactor(ui): enforce product projection boundaries`.

**Rollback isolado:** reverter apenas migrações de consumidores; nenhum schema muda.

## Slice 2X.17 — Jornada convergida, acessibilidade e regressão online

**Resultado implantável:** a jornada diária completa passa em PT-BR/en, desktop/mobile, incluindo falhas e progressive disclosure.

**Épicos cobertos:** todos.

**Dificuldade:** alta. **Risco:** alto. **Impacto no usuário:** muito alto. **Dependências:** 2X.5–2X.16. **Estimativa relativa:** 5 pontos.

**Arquivos:**

- reorganizar `e2e/intelligent-capture.spec.ts` em cenários determinísticos por contrato;
- atualizar `e2e/foundation.spec.ts`;
- atualizar `e2e/online-mobile-navigation.spec.ts`;
- modificar `scripts/online-playwright.mjs` se necessário para matriz de projetos;
- corrigir somente defeitos descobertos dentro do escopo 2X.

**Ordem de execução:**

- [ ] Cobrir captura imediata, organizing, ready e needs_attention.
- [ ] Cobrir correção, record-only, candidate current, materialização e undo.
- [ ] Cobrir pergunta básica, retry recuperável e terminal.
- [ ] Cobrir Home/Caixa/Trabalho/Brain/Mais e redirects legados.
- [ ] Cobrir detalhes técnicos recolhidos, teclado, foco, live regions e touch targets.
- [ ] Executar matriz Chromium desktop + Pixel 7 em `pt-BR` e `en` contra linked project.
- [ ] Executar suíte completa local e build após qualquer correção.
- [ ] Criar um único commit sugerido: `test(phase-2x): cover the converged daily journey`.

**Rollback isolado:** testes podem ser revertidos junto das correções estritamente associadas; não há migration.

## Slice 2X.18 — Gate remoto, documentação permanente e encerramento

**Resultado implantável:** banco/Edge/local estão sincronizados, regressões remotas passam e documentação descreve a realidade implantada.

**Épicos cobertos:** todos.

**Dificuldade:** média. **Risco:** médio. **Impacto no usuário:** indireto. **Dependências:** 2X.1–2X.17. **Estimativa relativa:** 3 pontos.

**Arquivos:**

- finalizar `scripts/remote-product-events-smoke.mjs`;
- finalizar `scripts/remote-entry-processing-smoke.mjs`;
- finalizar `scripts/remote-daily-cycle-smoke.mjs`;
- modificar `scripts/remote-supabase-smoke.mjs` e `package.json` para o gate agregado;
- atualizar `docs/PHASE_2_PLAN.md`, `ARCHITECTURE.md`, `DATABASE.md`, `AI_AGENT.md`, `SECURITY.md`, `ENGINEERING_STANDARDS.md`, `DECISIONS.md`, `STATE.md`, `CHANGELOG.md` e `TODO.md`;
- criar `docs/PHASE_2X_REPORT.md`.

**Ordem de execução:**

- [ ] Executar migration sync e database lint contra o projeto linked.
- [ ] Executar smokes 2A, 2B, eventos, processamento de entrada, daily cycle e Supabase completo.
- [ ] Executar Playwright online final em desktop/mobile e ambos os locales.
- [ ] Executar `npm test`, lint, typecheck e build em workspace limpo.
- [ ] Atualizar cada documento permanente apenas com fatos comprovados e evidência dos comandos.
- [ ] Registrar limitações externas sem marcar como concluídas.
- [ ] Verificar matriz PRD → épico → slice → evidência e ausência de capacidades 2C–2F.
- [ ] Criar um único commit sugerido: `docs(phase-2x): close product convergence evidence`.

**Rollback isolado:** reverter scripts/documentação; não reverter migrations ou produto já validado. Se um smoke revelar defeito, abrir slice corretivo antes do 2X.18 em vez de esconder a falha neste commit.

---

## 9. Cronograma consolidado

### 9.1 Escala de estimativa

- 1 ponto: mudança muito pequena, baixa coordenação;
- 3 pontos: mudança média e focal;
- 5 pontos: mudança ampla com múltiplas camadas;
- 8 pontos: mudança crítica com banco, worker, concorrência ou corte de comportamento.

Os pontos são relativos e não equivalem automaticamente a dias. A velocidade deve ser calibrada após 2X.1–2X.3.

| Slice | Entrega | Dificuldade | Risco | Impacto no usuário | Dependências | Estimativa |
| --- | --- | --- | --- | --- | --- | --- |
| 2X.1 | Contratos e matriz de estados | Média | Baixo | Nenhum imediato | — | 3 |
| 2X.2 | Ledger privado de eventos | Média | Médio | Nenhum visível | 2X.1 | 3 |
| 2X.3 | Captura/enqueue e claims no banco | Alta | Alto | Nenhum imediato | 2X.1–2X.2 | 5 |
| 2X.4 | Worker de entrada e dispatch | Muito alta | Alto | Nenhum até o corte | 2X.2–2X.3 | 8 |
| 2X.5 | Corte da captura assíncrona | Alta | Alto | Muito alto | 2X.1–2X.4 | 5 |
| 2X.6 | Estados humanos em Home/Caixa | Média | Médio | Alto | 2X.1, 2X.5 | 3 |
| 2X.7 | Proveniência e candidatos seguros | Muito alta | Alto | Alto | 2X.1, 2X.3, 2X.5 | 8 |
| 2X.8 | Projeções separadas de revisão | Alta | Médio | Médio | 2X.1, 2X.6, 2X.7 | 5 |
| 2X.9 | Revisão progressiva | Alta | Médio | Muito alto | 2X.7–2X.8 | 5 |
| 2X.10 | Backend Precisa de você | Alta | Alto | Nenhum até consumo | 2X.6–2X.7 | 5 |
| 2X.11 | Fila na Home e Caixa | Alta | Médio | Muito alto | 2X.9–2X.10 | 5 |
| 2X.12 | Trabalho canônico | Alta | Médio | Alto | 2X.6–2X.7 | 5 |
| 2X.13 | Arquitetura de informação | Média | Médio | Muito alto | 2X.11–2X.12 | 3 |
| 2X.14 | Verdade operacional | Média | Médio | Alto | 2X.13 | 3 |
| 2X.15 | Instrumentação completa | Alta | Médio | Baixo/indireto | 2X.2, 2X.5, 2X.9, 2X.11–2X.14 | 5 |
| 2X.16 | Fechamento da fronteira UI | Média | Médio | Baixo/indireto | 2X.6, 2X.8, 2X.10–2X.12 | 3 |
| 2X.17 | Jornada E2E completa | Alta | Alto | Muito alto | 2X.5–2X.16 | 5 |
| 2X.18 | Gate remoto e documentação | Média | Médio | Indireto | 2X.1–2X.17 | 3 |

**Total relativo:** 82 pontos.

### 9.2 Caminho crítico

O caminho que bloqueia valor diário é:

`2X.1 → 2X.2 → 2X.3 → 2X.4 → 2X.5 → 2X.6 → 2X.7 → 2X.8 → 2X.9 → 2X.10 → 2X.11 → 2X.13 → 2X.14 → 2X.15 → 2X.16 → 2X.17 → 2X.18`.

`2X.12` pode começar depois de `2X.7` em paralelo conceitual, mas deve ser integrado antes de `2X.13`. Durante execução com commits lineares, manter a ordem numérica para simplificar rollback e revisão.

### 9.3 Por que esta ordem reduz risco

1. contratos impedem que o redesenho replique o acoplamento atual;
2. analytics básico entra antes do corte e continua não bloqueante;
3. banco e worker são provados sem trocar a experiência em produção;
4. captura só muda depois do dispatch remoto;
5. candidato recebe garantia transacional antes da nova fila e review o promoverem;
6. projeções são introduzidas antes do redesign visual;
7. fila e Trabalho existem antes da navegação convergir;
8. promessas e instrumentação são fechadas sobre superfícies já estáveis;
9. E2E e smokes finais validam o ciclo completo, não componentes isolados.

## 10. Matriz de testes por responsabilidade

| Responsabilidade | Unitário | Integração/SQL | Playwright | Smoke remoto |
| --- | --- | --- | --- | --- |
| Estado humano | matriz e precedência | fixtures consistentes | transições visíveis | combinação entry/job real |
| Captura | Action/form/receipt | atomicidade/idempotência | retorno imediato | dispatch/lease/retry |
| Candidato | validade/action contract | concorrência/RLS/undo | correction → confirm | current pointer/proveniência |
| Atenção | elegibilidade/grouping | RPC/cursor/exclusões | resolver item | fixtures dos cinco motivos |
| Revisão | DTO/render/disclosure | current/history split | fluxo principal/técnico | revisão e ownership |
| Trabalho | filtros/DTO | query/paginação | aliases/mutação | materialização real |
| IA | grupos/active state | AppShell | desktop/mobile/reachability | não aplicável |
| Verdade | registry/copy scan | consumer evidence | settings/status | consumers existentes |
| Analytics | allowlists/best-effort | RLS/dedupe | eventos de interação | payload/worker/RLS |
| Fronteira UI | architecture test | loaders owner-scoped | ausência de internals | matéria-prima via RPC |

## 11. Comandos de verificação previstos

Durante a execução, usar os scripts existentes e os novos scripts adicionados pelos slices:

- local: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`;
- Playwright: `npm run test:e2e` e `npm run test:e2e:online`;
- remote baseline: `npm run test:remote`, `npm run test:remote:jobs`, `npm run test:remote:interpretations`;
- remote 2X: scripts dedicados de events, entry processing e daily cycle, agregados sob `npm run test:remote:2x` no slice final;
- banco: Supabase migration list/sync, database lint e testes SQL conforme disponibilidade local/linked;
- Edge Function: deploy explícito, versão registrada e smoke antes do corte da UI.

Saídas esperadas devem ser registradas no relatório final com quantidade de testes, duração relevante, versão implantada e limitações externas reais.

## 12. Gates de segurança e produto

### 12.1 Gate antes do corte assíncrono

Não executar 2X.5 enquanto 2X.4 não provar remotamente:

- dispatch sem página aberta;
- lease exclusivo;
- retry elegível;
- exhaustion terminal;
- preservação do original;
- persistência idempotente;
- regressão de anexos;
- ownership/RLS.

### 12.2 Gate antes de expor Precisa de você

Não executar 2X.11 enquanto 2X.7 e 2X.10 não provarem:

- current interpretation;
- record-only;
- tarefa materializada;
- pergunta respondida;
- retry automático excluído;
- concorrência e cross-user;
- fail-closed em inconsistência.

### 12.3 Gate antes de mudar navegação

Não executar 2X.13 enquanto Work e Needs You não estiverem funcionais e todos os destinos secundários tiverem classificação/reachability definida.

### 12.4 Gate de fronteira de fase

Rejeitar qualquer mudança que introduza:

- edição avançada de tarefa/candidato;
- nova semântica de dependência/subtarefa;
- split/merge;
- loop conversacional novo;
- atualização NLP de tarefa;
- onboarding ou automação de piloto;
- plataforma genérica de projections/events/jobs.

## 13. Documentação de fechamento

O slice 2X.18 deve atualizar:

| Documento | Conteúdo obrigatório |
| --- | --- |
| `PHASE_2_PLAN.md` | 2X entre 2B e 2C, slices reais e status. |
| `ARCHITECTURE.md` | fluxo async, bounded context `daily-cycle`, dependências permitidas e IA. |
| `DATABASE.md` | migrations 024–027, tabelas, RPCs, índices, RLS e rollback. |
| `AI_AGENT.md` | worker de entrada, dispatch, retries e verdade das automações. |
| `SECURITY.md` | analytics sem conteúdo, Vault/dispatch, ownership/RLS. |
| `ENGINEERING_STANDARDS.md` | regra de DTO/projeção e proibição de row/internal lifecycle na UI central. |
| `DECISIONS.md` | ADRs de projeção limitada, async capture e product events separados. |
| `STATE.md` | somente capacidades implantadas e verificadas. |
| `CHANGELOG.md` | mudanças técnicas e evidência de verificação. |
| `TODO.md` | conclusão 2X e itens explicitamente mantidos em 2C–2F. |
| `PHASE_2X_REPORT.md` | requisitos, commits, migrations, versões Edge, testes, smokes, screenshots, riscos residuais e inventário de promessas. |

## 14. Definition of Done da Fase 2X

A fase somente termina quando:

1. os dezoito commits são coesos, ordenados e individualmente reversíveis;
2. migrations 024–027 estão sincronizadas e documentadas;
3. captura retorna após persistência/enqueue e não espera IA;
4. fila existente processa entrada com dispatch, lease, retry e exhaustion;
5. estados humanos são idênticos em Home, Caixa e revisão;
6. Precisa de você contém apenas ações válidas já suportadas;
7. confirmação de candidato prova current interpretation e record-only;
8. review principal não depende de trust/evidence/policy;
9. detalhes técnicos permanecem acessíveis e separados;
10. Trabalho é a rota canônica e aliases permanecem seguros;
11. navegação primária reflete o ciclo diário em desktop/mobile;
12. nenhum controle ou texto promete comportamento não operacional;
13. eventos do funil são privados, allowlisted e não bloqueantes;
14. componentes centrais não importam tipos persistidos nem calculam lifecycle;
15. todos os testes locais, Playwright online e smokes remotos passam;
16. documentação permanente corresponde ao ambiente implantado;
17. nenhuma capacidade das Fases 2C–2F foi antecipada.

## 15. Auto-revisão obrigatória antes da execução

Antes de iniciar 2X.1, o executor deve confirmar:

- cada requisito do PRD aponta para ao menos um épico e um slice deste plano;
- nomes de DTOs, Action results, migrations e RPCs são consistentes entre seções;
- toda migration possui teste SQL, tipo gerado, smoke e rollback;
- toda rota nova possui compatibilidade de locale/deep link;
- cada Action tocada tem contrato de erro/sucesso e revalidation matrix;
- cada evento tem owner único e allowlist;
- nenhum item do plano exige capacidade 2C–2F;
- nenhum passo contém implementação implícita, arquivo indefinido ou evidência “por inspeção”;
- o working tree está limpo ou o escopo de arquivos preexistentes está explicitamente preservado.

Somente após essa revisão e uma autorização explícita de implementação deve o primeiro slice ser iniciado.

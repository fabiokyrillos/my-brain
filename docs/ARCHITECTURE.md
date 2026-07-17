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

## Fluxo de captura

1. O server action autentica e grava `entries.original_content`.
2. O provider OpenAI produz saída estruturada validada por Zod.
3. Uma RPC transacional persiste interpretação, entidades, data do evento e auditoria.
4. O embedding é gerado separadamente; falha de embedding não destrói a interpretação.
5. A UI apresenta interpretação, original e tarefas candidatas.
6. Uma RPC idempotente cria somente tarefas selecionadas, liga pessoas/projetos/contextos e grava compensação de undo.

## Portabilidade de IA

`AIProvider` expõe `extractEntry`, `embedText` e `answerFromKnowledge`. A implementação OpenAI usa Responses API com Structured Outputs e embeddings. Regras de autorização, confirmação, RLS e undo ficam fora do provider.

Cada carga escolhe sua rota em `agent_preferences` (`chat`, extração, revisão, arquivo, background e embedding). Uma chamada bem-sucedida registra tokens e snapshot de preço em `ai_usage_events` antes de persistências de domínio subsequentes. O dashboard consome `get_ai_cost_summary`, evitando agregação limitada pelo teto de linhas da API.

## Assincronia

O pré-MVP possui tabela `jobs` com status, tentativas, próxima tentativa, prioridade e idempotência. Uploads criam jobs e invocam a Edge Function autenticada `process-jobs`, que usa URL assinada e persiste uma interpretação separada. Falhas ficam disponíveis para nova tentativa. Heartbeat roda no banco, independente desse worker.

O Slice 2X.3 adiciona somente o contrato de entrada: `capture_entry_async` persiste uma entry `saved` e um job `interpret_entry` mínimo de forma atômica; `enqueue_entry_reprocessing` cria o job correspondente sem executar IA ou trocar a revisão atual. Claims por ID e por próximo elegível reutilizam as transições de lease da fila, mas aceitam somente `service_role`, payload válido e entry owned. A UI, Server Actions existentes, Edge Function `process-jobs` e dispatch continuam no fluxo síncrono/attachment atual até o Slice 2X.4/2X.5.

## Limite de confiança

Server actions e Edge Functions validam identidade e comandos; RLS forçada continua sendo o limite multitenant. Relacionamentos concretos provam ownership com FKs compostas `(user_id, id)` e relações polimórficas usam triggers de validação. Tabelas append-only ou controladas pelo domínio não expõem mutação direta ao papel `authenticated`.

## Observabilidade de produto

`product_events` existe somente para entender o ciclo diário e orientar convergência de UX. O frontend trabalha com contratos serializáveis e allowlists; o limite server-only revalida a entrada e retorna apenas um acknowledgement. PostgreSQL revalida a mesma taxonomia, ownership de IDs opacos, RLS, idempotência e privilégio mínimo. A instrumentação é best effort: indisponibilidade analítica não pode modificar o resultado da ação principal. Nenhum emissor, painel ou experiência visual é criado no Slice 2X.2.

## Ambientes adiados

Google OAuth e Vercel permanecem fora do fluxo atual por decisão de produto. Nenhum scaffold pago ou dependência externa é necessário para testar localmente.

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

## Fluxo de captura

1. O server action autentica e grava `entries.original_content`.
2. O provider OpenAI produz saída estruturada validada por Zod.
3. Uma RPC transacional persiste interpretação, entidades, data do evento e auditoria.
4. O embedding é gerado separadamente; falha de embedding não destrói a interpretação.
5. A UI apresenta interpretação, original e tarefas candidatas.
6. Uma RPC idempotente cria somente tarefas selecionadas, liga pessoas/projetos/contextos e grava compensação de undo.

## Portabilidade de IA

`AIProvider` expõe `extractEntry`, `embedText` e `answerFromKnowledge`. A implementação OpenAI usa Responses API com Structured Outputs e embeddings. Regras de autorização, confirmação, RLS e undo ficam fora do provider.

## Assincronia

O pré-MVP possui tabela `jobs` com status, tentativas, próxima tentativa, prioridade e idempotência. Uploads criam jobs e invocam a Edge Function autenticada `process-jobs`, que usa URL assinada e persiste uma interpretação separada. Falhas ficam disponíveis para nova tentativa. Heartbeat roda no banco, independente desse worker.

## Ambientes adiados

Google OAuth e Vercel permanecem fora do fluxo atual por decisão de produto. Nenhum scaffold pago ou dependência externa é necessário para testar localmente.

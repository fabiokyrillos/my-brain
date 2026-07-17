# Implementation Plan

Atualizado em 2026-07-17. “Concluído” abaixo significa fluxo vertical testado; itens parciais permanecem explicitamente listados.

## Fase 1 — Fundação: concluída no pré-MVP

Next.js estrito, Supabase online, auth por e-mail, signup validado, recuperação PKCE completa, settings atômicas, RLS/ownership endurecidos, shell responsivo e PT-BR/EN. Google OAuth permanece oculto até configuração e E2E dedicados.

## Fase 2 — Captura e interpretação: concluída

Original imutável, origem, datas retroativas, Structured Outputs, entidades, confiança, perguntas normalizadas e UI de interpretação.

## Fase 3 — Trabalho e undo: núcleo concluído

Tarefas, subtarefas, relações, status, prazos, confirmação seletiva, auditoria e undo estão ativos. Edição avançada de todos os 24 campos e decomposição assistida continuam como refinamento.

## Fase 4 — Inteligência fundamentada: núcleo concluído

Chat, embeddings, pgvector, memórias, fontes clicáveis e timelines estão ativos. Busca híbrida textual e conclusão automática por linguagem natural ainda faltam.

## Fase 5 — Proatividade: núcleo concluído

Jobs, heartbeat horário, períodos silenciosos, notificações, lembretes, deduplicação e página técnica existem. Worker genérico com backoff ainda precisa processar a fila.

## Fase 6 — Revisões: parcial funcional

As quatro revisões podem ser geradas e persistidas; registros retroativos invalidam períodos afetados. Agendamento automático das revisões, edição versionada e aprendizado com correções ainda faltam.

## Fase 7 — Arquivos: núcleo concluído

Upload privado, validação, URL assinada, job durável e análise de imagem/PDF/documento/planilha funcionam pela Edge Function. O original e a interpretação ficam separados. Retentativa automática periódica e associação confirmada das tarefas candidatas são os refinamentos restantes.

## AI Routing and Cost Control — concluída

Perfis de custo, rotas por operação, normalização de usage, pricing versionado, ledger append-only, agregação completa no PostgreSQL e dashboard estão implementados. Migrations `015` a `018` estão aplicadas e o `process-jobs` final foi publicado e exercitado com chamada real.

## Fase 8 — PWA e hardening: parcial funcional

Manifest, ícone, service worker seguro para assets, offline sem cache sensível e layout móvel estão ativos. Sincronização persistente de rascunhos, observabilidade completa e preparação de Vercel permanecem adiadas.

## Gate do Sprint 1.5

- Banco remoto: migrations aplicadas até `202607170018`, histórico sincronizado e db lint sem erros.
- Smoke remoto: auth, settings, RLS, ownership, heartbeat, ledger/agregação e worker real passaram com dados efêmeros.
- pgTAP está ampliado para policies, ownership e ledger; execução via CLI continua dependente de Docker Desktop.
- Lint, typecheck, Vitest, cobertura, build e Playwright serão registrados no fechamento final do sprint.

## Próxima prioridade recomendada

Concluir o gate integral do Sprint 1.5 e decidir a entrada na próxima fase. Agendamento automático de revisões, retentativa periódica, edição avançada e conclusão por linguagem natural permanecem no roadmap; Google OAuth e Vercel continuam fora do caminho crítico.

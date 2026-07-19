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
- ESLint e TypeScript passaram sem erros; o build de produção do Next.js 16.2.10 foi concluído.
- Vitest passou em 27 arquivos e 87 testes; cobertura instrumentada: 93,66% statements, 61,61% branches, 90,62% functions e 95,88% lines.
- Playwright público passou 4 testes com 10 skips online esperados; a matriz ligada ao Supabase passou 11 testes com 3 skips explícitos de escopo/quota, e o fluxo final de recuperação passou novamente de forma direcionada.
- `npm run test:remote` validou auth, settings atômicas, RLS, ownership, heartbeat, ledger, agregação e o worker publicado com dados descartáveis.
- O Sprint 1.5 está concluído. As limitações externas restantes são Docker para pgTAP, SMTP próprio antes de produção e atualização compatível do Next/PostCSS.

## Próxima prioridade recomendada

Iniciar o planejamento da Fase 2 sobre a arquitetura atual, sem recomeço. A primeira fatia deve incluir critérios operacionais de lease, retry/backoff, recuperação de jobs e observabilidade antes de ampliar automações. Agendamento automático de revisões, edição avançada e conclusão por linguagem natural permanecem no roadmap; Google OAuth e Vercel continuam fora do caminho crítico.

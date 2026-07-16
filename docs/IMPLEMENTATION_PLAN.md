# Implementation Plan

Atualizado em 2026-07-16. “Concluído” abaixo significa fluxo vertical testado; itens parciais permanecem explicitamente listados.

## Fase 1 — Fundação: concluída no pré-MVP

Next.js estrito, Supabase online, auth por e-mail, recuperação, perfil, RLS, shell responsivo e PT-BR/EN. Google OAuth foi adiado por decisão do usuário.

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

## Fase 8 — PWA e hardening: parcial funcional

Manifest, ícone, service worker seguro para assets, offline sem cache sensível e layout móvel estão ativos. Sincronização persistente de rascunhos, observabilidade completa e preparação de Vercel permanecem adiadas.

## Gate atual

- ESLint: passou.
- TypeScript: passou.
- Vitest: 30 testes passaram.
- Build Next.js: passou, incluindo todas as rotas e manifest.
- Supabase migrations: aplicadas até `202607160014`; db lint sem erros.
- E2E online desktop: passou.
- E2E online mobile: passou.
- Edge Function heartbeat: publicada e validada com HTTP 200.
- Auditoria visual no Chrome autenticado: Início, Configurações e Arquivos aprovados; erros observados são atributos injetados por extensões do navegador no modo dev.

## Próxima prioridade recomendada

Implementar o worker de jobs para processar arquivos, gerar revisões programadas e aplicar retentativas; depois ampliar edição de tarefas e conclusão por linguagem natural. Google OAuth e Vercel permanecem fora do caminho crítico até nova decisão do usuário.

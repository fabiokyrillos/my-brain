# Slice

Slice 2X.1 — Contratos do ciclo diário e guardrails arquiteturais. Executado em 2026-07-17 na branch `codex/phase-2-intelligent-capture`. Commit único: `test(phase-2x): define daily cycle product contracts`.

# Objetivo

Estabelecer a fronteira pura de produto para o ciclo diário antes de qualquer consumidor de UI: estados humanos, motivos de atenção, DTOs serializáveis, resultados de Action estáveis, copy localizada e matriz determinística de lifecycle.

# Escopo

- Implementados os cinco `ProductState`: `saved`, `organizing`, `needs_attention`, `ready` e `could_not_organize`.
- Implementados os cinco `AttentionReason` autorizados.
- Definidos os DTOs de produto previstos para receipt, Caixa, atenção, revisão, detalhe técnico e Trabalho, sem dependência de React, Supabase ou tipos do banco.
- Implementado o resultado discriminado de Action, com códigos estáveis, `messageKey`, `entityId`, `productState`, `undoId`, `retryable`, `replayed` e `fieldErrors` quando aplicáveis.
- Implementado o mapper fail-closed para os oito lifecycle states internos, jobs, retry futuro, perguntas abertas, candidatos válidos, record-only, tarefas materializadas e inconsistências.
- Implementada copy tipada em PT-BR e inglês.
- Nenhuma tela, rota, Server Action existente, migration, RPC, Edge Function, telemetria ou comportamento visual foi alterado.

# Critérios de aceite

- Atendido — contratos aceitam exclusivamente os cinco estados públicos e cinco motivos de atenção aprovados.
- Atendido — DTOs são serializáveis e o teste rejeita `Date` e funções.
- Atendido — Action result é discriminado por `ok` e por conjuntos estáveis de códigos de sucesso e falha.
- Atendido — matriz cobre oito estados internos, cinco estados de job, retry, perguntas, candidatos, record-only, tarefas materializadas, precedência e fallback.
- Atendido — estado ou job desconhecido resulta em `could_not_organize`, nunca em `ready`.
- Atendido — copy tipada existe para PT-BR e inglês.
- Atendido — guardrail de fonte proíbe React, Supabase, tipos de banco e imports de módulos UI nos quatro módulos iniciais.
- Não aplicável — Playwright, smoke remoto e testes SQL, pois o slice não toca UI, rotas, migrations, RPCs ou Edge Functions.

# Arquivos alterados

- `src/features/daily-cycle/contracts.ts` — contratos, DTOs, ações disponíveis e verificação de serialização.
- `src/features/daily-cycle/action-result.ts` — resultado de Action discriminado, códigos estáveis e guardas de runtime.
- `src/features/daily-cycle/copy.ts` — copy tipada PT-BR/inglês.
- `src/features/daily-cycle/lifecycle.ts` — matriz interna para estado de produto e precedência fail-closed.
- `src/features/daily-cycle/contracts.test.ts` — contratos, serialização e guardrail arquitetural.
- `src/features/daily-cycle/action-result.test.ts` — códigos e discriminação do resultado de Action.
- `src/features/daily-cycle/copy.test.ts` — cobertura de copy nos dois locales.
- `src/features/daily-cycle/lifecycle.test.ts` — matriz de lifecycle, jobs, pendências e fallbacks.
- `docs/STATE.md`, `docs/TODO.md` e `docs/CHANGELOG.md` — estado permanente e evidências da entrega.

# Decisões tomadas

- O diretório `daily-cycle` é uma fronteira específica da experiência diária; não foi criado framework genérico de read models.
- `interpretations/copy.ts` não foi alterado: seus rótulos continuam descrevendo o lifecycle interno já exibido pela experiência atual, enquanto a nova copy cobre apenas a projeção pública da 2X.
- Jobs desconhecidos, estados internos desconhecidos e a combinação `saved` com job concluído falham fechados para `could_not_organize` com `resolve_consistency`.
- Falha terminal prevalece sobre candidatos herdados; retry ativo prevalece sobre falha recuperável; record-only suprime somente candidatos de tarefa; tarefas materializadas suprimem o candidato equivalente.

# Migrations

Nenhuma migration foi necessária. Não houve alteração de dados, schema ou necessidade de rollback de banco.

# RPCs

Nenhuma RPC foi criada ou alterada. Os contratos antecipam apenas a fronteira estável que as Actions tocadas por slices posteriores deverão retornar.

# Edge Functions

Nenhuma Edge Function foi criada, alterada ou implantada.

# Testes executados

- Baseline antes da implementação: `npm test` — 39 arquivos e 147 testes passando.
- TDD red: os quatro novos arquivos de teste falharam como esperado antes da existência dos módulos.
- Focado: `npm test -- src/features/daily-cycle/contracts.test.ts src/features/daily-cycle/action-result.test.ts src/features/daily-cycle/copy.test.ts src/features/daily-cycle/lifecycle.test.ts` — 4 arquivos e 24 testes passando.
- Completo: `npm test` — 43 arquivos e 171 testes passando.
- `npm run lint` — passou sem erros.
- `npm run typecheck` — passou sem erros.
- `npm run build` — build de produção Next.js 16.2.10 passou.
- `git diff --check` — executado antes do commit para verificar whitespace do escopo staged.

# Evidências

- Os testes de lifecycle verificam os oito estados internos, os cinco estados de job, retry futuro/expirado, candidatos, perguntas, record-only, tarefas materializadas, falha terminal e fallback desconhecido.
- O teste arquitetural lê os quatro arquivos da fronteira e falha se encontrar imports de React, Supabase, `database.types`, `Database["public"]` ou módulos `.tsx`.
- Nenhum teste remoto, Playwright ou smoke foi necessário porque não há consumidor de runtime neste slice.

# Limitações

- Os contratos ainda não possuem projeções que leiam o banco nem consumidores em Home, Caixa, revisão ou Trabalho; isso pertence a slices posteriores.
- Não há mudança visível para o usuário neste slice.
- A telemetria privada, a captura assíncrona e a fila “Precisa de você” permanecem fora do escopo e não foram iniciadas.

# Riscos

- Slices posteriores devem usar o mapper central, e não recriar regras de lifecycle em páginas ou componentes. O guardrail inicial protege os novos módulos; a auditoria dos consumidores atuais continua planejada para os slices de projeção e fechamento da fronteira.
- A validade relacional de candidatos continua sendo responsabilidade das queries/RPCs existentes até que os próximos slices conectem os DTOs a essas fontes.

# Próximo slice

Slice 2X.2 — Fundação privada de eventos de produto — é o próximo slice elegível conforme o plano, depende de 2X.1 e não foi iniciado. Antes dele, devem ser mantidos os gates globais e deve haver autorização explícita para tocar migration, RPC, tipos gerados, testes SQL e smoke remoto.

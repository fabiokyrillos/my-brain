# Slice

Slice 2X.3 — Fundação de Product Projections. Data: 2026-07-17. Branch: `codex/phase-2-intelligent-capture`.

# Objetivo

Estabelecer uma fronteira pura entre entidades internas e os DTOs de produto que futuras superfícies de UI poderão consumir, sem alterar qualquer rota, página, componente ou fluxo de usuário.

# Escopo

- Tornar `CaptureReceipt`, `InboxItemView`, `NeedsAttentionItemView`, `WorkItemView` e `AvailableAction` explicitamente imutáveis no contrato TypeScript.
- Criar contratos de fonte serializáveis para adaptadores server-side futuros, independentes de React, Supabase e `database.types`.
- Criar mapeadores puros e fail-closed para os quatro DTOs de produto.
- Derivar o estado de Caixa exclusivamente pela matriz de lifecycle já aprovada; converter os estados internos conhecidos de tarefa para estados humanos; validar ações e destinos locais seguros.
- Cobrir serialização, forma estável, campos obrigatórios, ausência de campos internos, mapeamento, imutabilidade, fail-closed e dependências arquiteturais proibidas.

Não foram alteradas páginas, rotas, componentes, Server Actions, Edge Functions, RPCs, migrations, telemetria, Home, Caixa, Trabalho ou Precisa de você.

# Critérios de aceite

- Atendido — os quatro DTOs são serializáveis, não expõem colunas internas e usam apenas tipos independentes de React, Supabase e `database.types`.
- Atendido — cada mapper é puro, não acessa banco nem chama RPC e retorna `null` para dados inválidos, estados desconhecidos, ações desconhecidas ou destinos inseguros.
- Atendido — a projeção de Caixa usa a matriz de lifecycle do Slice 2X.1; a projeção de Trabalho converte somente os status internos suportados e a origem conhecida.
- Atendido — testes impedem imports React/Supabase/database types, imports de componentes, acesso a tabelas e chamadas RPC no módulo novo.
- Atendido — não houve mudança de UI, rotas ou comportamento de usuário.

Desvio aprovado: a autorização deste slice delimitou uma fundação de projeções isolada. Os consumidores com queries owner-scoped, a integração visual e o trabalho de captura/jobs permanecem fora deste commit e requerem autorização de slice posterior.

# Arquivos alterados

- `src/features/daily-cycle/contracts.ts` — marcou os quatro DTOs de produto e `AvailableAction` como readonly.
- `src/features/daily-cycle/projection-mappers.ts` — contratos de fonte e mapeadores puros/fail-closed.
- `src/features/daily-cycle/projection-mappers.test.ts` — contratos, serialização, imutabilidade, mapeamento, fail-closed e guardrails arquiteturais.
- `docs/STATE.md` — registrou o estado do Slice 2X.3 e a ausência de consumidor de runtime.
- `docs/TODO.md` — registrou a conclusão do Slice 2X.3 e manteve o Slice 2X.4 pendente de autorização.
- `docs/CHANGELOG.md` — registrou a mudança e as verificações realizadas.
- `docs/reports/PHASE_2X_SLICE_03_REPORT.md` — evidência factual do slice.

# Decisões tomadas

- Reutilizar os DTOs de `contracts.ts` do Slice 2X.1 em vez de criar uma segunda hierarquia de contratos ou uma plataforma genérica de read models.
- Localizar os mapeadores em `src/features/daily-cycle/`, o bounded context existente, e não em uma camada global de projections.
- Modelar entidades internas como contratos de fonte serializáveis. Loaders futuros adaptam rows/RPCs na borda server-side; a UI recebe apenas os quatro DTOs de produto.
- Falhar de modo fechado com `null` quando a entrada não puder produzir uma projeção confiável, em vez de inferir `ready` ou expor lifecycle interno.
- Congelar apenas novas estruturas clonadas pelo mapper; as entidades de entrada não são modificadas.

# Migrations

Nenhuma migration foi criada ou aplicada.

# RPCs

Nenhuma RPC foi criada, alterada ou chamada.

# Edge Functions

Nenhuma Edge Function foi criada, alterada ou implantada.

# Testes executados

- `npx vitest run src/features/daily-cycle/projection-mappers.test.ts src/features/daily-cycle/contracts.test.ts src/features/daily-cycle/lifecycle.test.ts` — 3 arquivos e 23 testes passando.
- `npm test` — 47 arquivos e 204 testes passando.
- `npm run lint` — passando.
- `npm run typecheck` — passando.
- `npm run build` — build de produção Next.js 16.2.10 passando.
- `git diff --check` — executado sem saída de erro após as alterações finais.

Playwright, smoke remoto e testes SQL não foram executados: não houve UI, rota, migration, RPC ou Edge Function neste slice.

# Evidências

- O teste focado primeiro falhou porque o módulo de mapeadores ainda não existia; após a implementação mínima, os 23 testes focados passaram.
- O gate completo passou com 47 arquivos e 204 testes Vitest, seguido de lint, typecheck e build de produção bem-sucedidos.
- Os testes de arquitetura leem o código-fonte do mapper e verificam a ausência de imports React/Supabase/database types, acesso `.from(...)` e chamadas `.rpc(...)`.

# Limitações

- Não há loader owner-scoped nem consumidor de UI; esta fundação ainda não altera a experiência do produto.
- A origem das entidades internas continua a cargo de slices futuros. Nenhum row Supabase existente foi adaptado neste commit.
- As projeções de revisão técnica e de detalhes de interpretação não fazem parte deste slice.

# Riscos

- Uma integração futura pode ignorar os mapeadores e voltar a expor tipos persistidos à UI. O guardrail deste slice protege o módulo novo; a auditoria das superfícies consumidoras permanece para os slices de integração.
- Um novo status interno de tarefa ou lifecycle exigirá extensão explícita do mapper e dos testes; entradas desconhecidas permanecem ocultas por fail-closed até então.

# Próximo slice

O Slice 2X.4 não foi iniciado. Qualquer próximo slice precisa de autorização explícita e deve preservar esta fronteira: adaptação owner-scoped no servidor antes de entregar DTOs para uma rota ou componente.

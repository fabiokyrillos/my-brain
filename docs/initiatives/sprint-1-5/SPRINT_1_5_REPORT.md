# Relatório de encerramento — Sprint 1.5

Data: 2026-07-17  
Branch: `codex/sprint-1-5-foundation-hardening`  
Resultado: concluído, com limitações externas documentadas

## Resumo executivo

O Sprint 1.5 consolidou a Fase 1 sem adicionar uma nova capacidade de produto. A fundação agora possui fluxos completos de autenticação, navegação mobile integral, isolamento de dados endurecido, ownership validado no banco, heartbeat determinístico e lossless, consultas paginadas, tratamento consistente de erros, settings atômicas e controle auditável de rotas/custos de IA.

A arquitetura atual deve ser evoluída, não substituída. A recomendação é autorizar o planejamento da Fase 2 sobre a base existente, mantendo como condições de produção — não como bloqueios de desenvolvimento — SMTP próprio, execução de pgTAP em Docker/CI e resolução compatível dos advisories transitivos do Next/PostCSS.

## Problemas corrigidos

### Autenticação

- Recuperação de senha concluída com callback PKCE allowlisted, sessão de recuperação protegida, validação de senha, atualização, sign-out e novo login.
- Signup validado no servidor com Zod, normalização de nome/e-mail, senha forte de 12 caracteres e confirmação.
- Erros do provedor não vazam em URLs; throttling de e-mail recebe código estável e mensagem localizada.
- Google OAuth foi ocultado porque o provedor não está configurado e validado.
- Rotas autenticadas preservam somente as continuações necessárias de callback/reset.

### Mobile e UX operacional

- Todas as áreas autenticadas passaram a ser alcançáveis no mobile por navegação primária e overflow acessível.
- O menu mantém alvos de toque adequados, localização PT-BR/EN e regressão Playwright dedicada.
- Estados de erro da aplicação e do Supabase foram tornados explícitos e seguros.

### Banco, RLS e ownership

- Policies genéricas de mutação foram removidas de tabelas append-only ou controladas pelo domínio.
- Relacionamentos concretos agora usam FKs compostas por `user_id`; alvos polimórficos usam triggers de ownership.
- Escritas privilegiadas foram concentradas em RPCs/workers validados.
- Testes estruturais e comportamentais cobrem policies, grants, ownership cruzado e negações entre usuários.

### Heartbeat

- Datas e limites diários agora respeitam timezone e dia local do usuário.
- Conteúdo e destinos são localizados.
- Cooldown de tarefas usa janela móvel de 24 horas.
- O cap é aplicado antes da inserção; candidatos excedentes permanecem pendentes e não são descartados.
- Execuções concorrentes por usuário usam advisory lock.
- Falhas são sanitizadas, registradas e isoladas por usuário no processamento em lote.

### Dados, performance e erros

- Listagens potencialmente ilimitadas receberam paginação lookahead.
- URLs assinadas de arquivos são obtidas em lote, removendo o padrão N+1.
- Resultados do Supabase usam contratos compartilhados; erros relevantes são verificados no Next.js e nas Edge Functions.
- Perfil e preferências são persistidos atomicamente por RPC.
- A aplicação possui error boundary autenticado sem exposição de detalhes internos.

### AI Routing and Cost Control

- Perfis e rotas por operação foram finalizados.
- Usage do provedor é normalizado e registrado imediatamente após uma chamada paga bem-sucedida, antes de persistências posteriores.
- Pricing é versionado; o ledger é append-only, idempotente e guarda o snapshot de preço.
- Agregações completas são calculadas no PostgreSQL sob RLS, sem teto cliente de 5.000 linhas.
- Dashboard de custos, chamadas recentes e rastreabilidade foram validados em Playwright.
- Migrations locais/remotas estão sincronizadas até `202607170018`.
- `process-jobs` versão 8 está ativo e foi exercitado com análise real de arquivo via OpenAI.

## Validação executada

| Gate | Resultado |
|---|---|
| ESLint | passou, zero erros |
| TypeScript | passou, zero erros |
| Vitest | 27 arquivos, 87 testes passando |
| Build | Next.js 16.2.10, build de produção aprovado |
| Playwright público | 4 passando, 10 skips online esperados sem credenciais |
| Playwright ligado ao remoto | 11 passando, 3 skips explícitos de escopo/quota |
| Recuperação final direcionada | 1/1 passando após o hardening do harness |
| Smoke Supabase remoto | passou: auth, settings, RLS, ownership, heartbeat, ledger, agregação e worker real |
| Migrations | `001` a `018` sincronizadas local/remoto |
| Supabase db lint | passou no schema remoto, nível `error` |
| Edge Functions | `heartbeat` ativa v3; `process-jobs` ativa v8 |
| Dependency audit | 3 advisories moderados transitivos; sem correção compatível disponível |

Os três skips da matriz online são deliberados e visíveis: o teste de navegação exclusivamente mobile não roda no projeto desktop; o signup com entrega de e-mail não é duplicado no projeto mobile; e a execução final encontrou a quota de e-mail do Supabase hospedado esgotada. Nesse último caso, a UI e o código estável de throttling foram verificados, enquanto validação, recuperação, troca de senha e novo login continuaram passando.

## Cobertura atual

- Statements: 93,66% (266/284).
- Branches: 61,61% (305/495).
- Functions: 90,62% (87/96).
- Lines: 95,88% (233/243).

Esses percentuais descrevem somente os módulos importados/instrumentados pelo Vitest; não representam cobertura do repositório inteiro. Playwright, pgTAP estrutural e o smoke remoto cobrem fronteiras que não entram nesses números.

## Problemas adiados

- Execução dos arquivos pgTAP via CLI: o Supabase CLI exige Docker e o Docker Desktop não está disponível nesta estação. O schema lint e os caminhos comportamentais de maior risco passaram no projeto remoto descartável.
- Lease, reaper, retry/backoff e recuperação de jobs presos em `running`.
- SMTP próprio e teste de entrega em caixa real antes de produção.
- Inclusão de Playwright, db lint, pgTAP, audit e limiar de cobertura no CI.
- CSP sem `unsafe-eval`, HSTS de deployment, validação/malware scanning de uploads e observabilidade ampliada.
- Consumidores operacionais para preferências hoje apenas persistidas.
- Google OAuth permanece oculto até configuração e E2E próprios.

Nenhum item crítico descoberto na revisão foi silenciosamente adiado. Os itens acima são dependências externas ou hardening operacional de fases seguintes.

## Riscos restantes

1. Um crash do worker pode deixar jobs em `running`; este é o maior risco arquitetural para ampliar automações.
2. O serviço de e-mail embutido do Supabase tem quota baixa e não é adequado para lançamento sem SMTP próprio.
3. Os testes pgTAP existem, mas ainda não foram executados localmente nesta estação por falta de Docker.
4. Há três advisories moderados transitivos em PostCSS dentro do Next.js; `npm audit fix --force` propõe downgrade incompatível e foi rejeitado.
5. Branch coverage de 61,61% ainda deixa combinações condicionais sem prova unitária, especialmente em formulários e componentes de UI.
6. O CI atual ainda não reproduz todo o gate remoto executado neste sprint.

## Qualidade da arquitetura

A arquitetura é sólida para continuar o pré-MVP: limites de tenancy estão no banco, operações sensíveis têm caminhos explícitos, o ledger de IA é auditável, o heartbeat é determinístico e a validação online é reproduzível sem persistir service-role keys. O projeto não está “sem backend”; ele usa um backend distribuído entre PostgreSQL/RLS/RPCs, Edge Functions e server actions com fronteiras agora mais claras.

Ainda não é uma fundação de produção completa. O principal próximo investimento arquitetural deve ser confiabilidade operacional da fila, seguido por gates de CI e observabilidade. Esses trabalhos são evoluções incrementais; não justificam reescrita nem troca de Supabase.

## Recomendação para iniciar a Fase 2

Recomendação: **sim, iniciar o planejamento da Fase 2**.

Condições para a execução:

1. Planejar uma fatia vertical pequena e manter as migrations append-only.
2. Não ampliar processamento assíncrono sem critérios de lease, retry/backoff, idempotência e reaper.
3. Manter RLS/ownership, testes de negação cruzada, smoke remoto e os quatro documentos permanentes como definition of done.
4. Tratar SMTP, pgTAP em Docker/CI e advisories do Next/PostCSS como gates obrigatórios antes de produção.

## Commits principais do sprint

- `3aa0946` — documentação permanente de estado.
- `0201963` — jornadas seguras de autenticação.
- `40272ba` — navegação mobile completa.
- `5099f81` — hardening da fundação e conclusão do controle de custos de IA.
- `a89210a` — fechamento do gate remoto de qualidade.


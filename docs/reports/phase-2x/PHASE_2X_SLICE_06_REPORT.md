# Slice

Slice 2X.6 — Estado humano em Caixa e Home. Data: 2026-07-17. Branch: `codex/phase-2-intelligent-capture`.

# Objetivo

Fazer Caixa e Home consumirem o mesmo mapper de estado humano (`resolveDailyCycleLifecycle`, Slice 2X.1) e exibirem exclusivamente os cinco estados de produto (`saved`, `organizing`, `needs_attention`, `ready`, `could_not_organize`), sem expor lifecycle interno de oito estados, JSON bruto ou cálculo de estado duplicado em página/componente.

# Escopo

- `src/features/daily-cycle/inbox-projection.ts` (novo): `loadInboxProjection`, query owner-scoped e paginada que lê `entries`, o `interpret_entry` mais recente de cada entry (`payload->>entry_id`), `task_candidates` da interpretação atual, `pending_questions` abertas e `tasks` materializadas não canceladas; alimenta `resolveDailyCycleLifecycle` por entry e devolve `InboxItemView[]`.
- `src/features/daily-cycle/inbox-item.tsx` (novo): `InboxItemRow`, componente puramente apresentacional que recebe um `InboxItemView` e `locale`, renderiza título, prévia do original, badge de estado localizado e o motivo de atenção (quando presente) via `getDailyCycleCopy` — nunca recebe row do Supabase nem string de lifecycle interno.
- `src/app/[locale]/app/inbox/page.tsx`: reescrita para chamar `loadInboxProjection` e renderizar `InboxItemRow`, removendo a leitura direta de `entries.status`/`lifecycleLabels` e o cálculo de paginação que antes vivia na página.
- `src/features/shell/home-dashboard.tsx`: novo painel "05 / RECENTE", que chama a mesma `loadInboxProjection` e renderiza o mesmo `InboxItemRow`; conecta a chave de copy `home.recent`, presente em `src/i18n/messages.ts` desde a Fase 2X mas sem consumidor até agora.
- `src/app/operations.css`: modificadores `.status-badge.*` usados pela Caixa trocados dos oito valores internos de `entries.status` para os cinco estados de produto; `.entry-status-*` da página de detalhe (fora do escopo desta slice) permanece intocado.

Não foram alterados: nenhuma migration, nenhuma RPC, nenhuma Edge Function, a página de detalhe da entrada (`/inbox/[entryId]`, escopo dos Slices 2X.8/2X.9), a fila "Precisa de você" (Slices 2X.10/2X.11), Trabalho (`/tasks`/`/today`/`/waiting`, fora do escopo desta slice), e os contratos `src/features/daily-cycle/contracts.ts`/`lifecycle.ts`/`projection-mappers.ts` entregues pelo Slice 2X.1.

# Critérios de aceite

- Atendido — Caixa e Home usam o mesmo mapper (`resolveDailyCycleLifecycle`, via `loadInboxProjection`) e exibem os cinco estados humanos sem enum interno vazando para HTML/CSS ou copy.
- Atendido — queries são mínimas e owner-scoped: uma leitura paginada de `entries`, mais três leituras auxiliares em lote (`jobs`, `entry_interpretations`, `pending_questions`, `tasks`) filtradas pelos IDs da página atual; nenhuma consulta N+1 por entry.
- Atendido — JSON/fallback e estado desconhecido são fail-closed: quando o mapper recusa uma combinação (`fallback: true`, devolve `null`), o loader constrói um item `could_not_organize`/`resolve_consistency` explícito em vez de descartar a entry — o original nunca desaparece da Caixa.
- Atendido — transições, vazio, paginação e ambos os locales estão cobertos em teste: 12 casos em `inbox-projection.test.ts` (todo estado/motivo alcançável a partir de dados reais de query, o fallback fail-closed, `hasNext`, href seguro por locale), 4 em `inbox-item.test.tsx`, 4 em `home-dashboard.test.tsx` (primeira cobertura deste componente).
- Atendido — cálculos e copy de lifecycle foram removidos das páginas/componentes: `inbox/page.tsx` não importa mais `lifecycleLabels`; nenhum componente central lê `entries.status` diretamente.
- Desvio documentado, não regressão — `recordOnly`/`hasConsistencyIssue` são passados como `false` nesta slice porque a coluna `is_record_only` e a proveniência de candidato só chegam no Slice 2X.7 (fora da dependência declarada desta slice, que é apenas 2X.1 e 2X.5). Um candidato corrigido como "somente registrar" mas com `task_candidates` residual no JSON aparece como `needs_attention`/`confirm_existing_candidates` em vez de `ready` até 2X.7. Documentado em `docs/CHANGELOG.md`, `docs/ARCHITECTURE.md` e `docs/TODO.md`.
- Não aplicável — nenhuma migration foi necessária ou planejada para este slice; nenhuma RPC nova.
- Não aplicável — Playwright online (jornada autenticada completa) não pôde ser reexecutado neste workstation por ausência de credenciais `ONLINE_SUPABASE_*` (ver "Limitações"); a suíte pública offline (`desktop`+`mobile`) passou integralmente.

# Arquivos alterados

- `src/features/daily-cycle/inbox-projection.ts` (novo) — `loadInboxProjection`.
- `src/features/daily-cycle/inbox-projection.test.ts` (novo) — 12 testes.
- `src/features/daily-cycle/inbox-item.tsx` (novo) — `InboxItemRow`.
- `src/features/daily-cycle/inbox-item.test.tsx` (novo) — 4 testes.
- `src/app/[locale]/app/inbox/page.tsx` — reescrita para consumir a projeção e o novo componente.
- `src/features/shell/home-dashboard.tsx` — painel "Atividade recente" adicionado.
- `src/features/shell/home-dashboard.test.tsx` (novo) — 4 testes, primeira cobertura deste componente.
- `src/app/operations.css` — modificadores `.status-badge.*` da Caixa migrados para os cinco estados de produto.
- `docs/ARCHITECTURE.md` — nova fatia vertical "Ciclo diário" e parágrafo descrevendo a projeção e sua limitação conhecida.
- `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md` — estado permanente, backlog e changelog técnico.

# Decisões tomadas

- **`inbox-projection.ts` como módulo server-only de acesso a dados, separado dos mappers puros do Slice 2X.1**: `projection-mappers.ts` permanece livre de Supabase/React (guardrail arquitetural testado desde 2X.1); a nova query/composição vive em um arquivo próprio, consistente com a distinção que o plano de implementação já traçava entre "módulos server-only podem usar `database.types.ts`" e "componentes centrais não podem".
- **Fallback explícito em vez de propagar `null`**: em vez de deixar a página lidar com itens `null` ou lançar, o loader constrói um `InboxItemView` `could_not_organize`/`resolve_consistency` diretamente quando o mapper recusa a combinação. A alternativa (descartar o item) violaria a garantia central do produto de que o original é sempre preservado e sempre visível.
- **Latest job por entry via `payload->>entry_id` e `order by created_at desc`**: mesmo padrão de filtro já usado em produção por `retryProcessingJob` (`src/features/agent/actions.ts`, Slice 2X.5); reaproveitado em lote (`.in(...)`) em vez de uma query por entry, e o primeiro job por `entry_id` na ordenação desc é sempre o mais recente.
- **`recordOnly`/`hasConsistencyIssue` conservadoramente `false`**: como não existe hoje nenhuma coluna persistida para "esta correção foi somente registro" (a RPC de correção só grava esse booleano em `audit_logs.after_state`, não em `entry_interpretations`) nem para inconsistência de proveniência de candidato, inventar uma heurística aqui seria adivinhar em vez de reportar. A dependência declarada do Slice 2X.6 é apenas 2X.1/2X.5 — a coluna `is_record_only` é entrega explícita do Slice 2X.7. Passar `false` é o valor fail-closed correto: na pior hipótese superestima "precisa de confirmação", nunca esconde algo do usuário.
- **`InboxItemRow` reaproveitado em Home e Caixa**: em vez de duas apresentações diferentes para o mesmo DTO, a Home usa o mesmo componente dentro de um painel mais estreito, garantindo — por construção, não por convenção — que as duas superfícies concordem sobre o estado de uma entry, exatamente o resultado implantável descrito pelo slice.
- **Reaproveitar a chave de copy `home.recent` já existente** em vez de adicionar uma nova: o Slice 2X.1/2X.5 já havia deixado essa chave pt-BR/en pronta e sem consumidor; usá-la evita duplicar tradução.

# Migrations

Nenhuma. Este slice reutiliza integralmente as tabelas e o mapper já entregues pelos Slices 2X.1–2X.5.

# RPCs

Nenhuma nova nem alterada. O loader usa apenas `select` owner-scoped (RLS aplicada pela sessão do usuário autenticado), sem chamar nenhuma RPC.

# Edge Functions

Nenhuma alterada.

# Testes executados

- `npm test` — 53 arquivos e 248 testes Vitest passando (20 novos: 12 em `inbox-projection.test.ts`, 4 em `inbox-item.test.tsx`, 4 em `home-dashboard.test.tsx`).
- `npm run lint` — passando, zero erros.
- `npm run typecheck` — passando, zero erros.
- `npm run build` — build de produção Next.js 16.2.10 passando.
- `npx playwright test --project=desktop` — 2 testes públicos passando, 5 pulos esperados (jornadas online).
- `npx playwright test --project=mobile` — 2 testes públicos passando, 5 pulos esperados (jornadas online).

# Evidências

- `npm test`: `Test Files 53 passed (53)` / `Tests 248 passed (248)`.
- `npx eslint .` e `npx tsc --noEmit`: sem saída (zero erros/avisos).
- `npm run build`: `✓ Compiled successfully` e rotas `/[locale]/app` e `/[locale]/app/inbox` listadas como `ƒ` (dinâmicas), inalteradas na topologia de rotas.
- `npx playwright test --project=desktop` / `--project=mobile`: `2 passed`, `5 skipped` em ambos — os 5 pulos são as jornadas que exigem `ONLINE_SUPABASE_*` (mesmo padrão de slices anteriores).

# Limitações

- **Playwright online não executado neste workstation**: as specs `intelligent-capture.spec.ts`, `online-auth.spec.ts` e `online-mobile-navigation.spec.ts` são puladas automaticamente (`test.skip`) porque `ONLINE_SUPABASE_URL`/`ONLINE_SUPABASE_PUBLISHABLE_KEY`/`ONLINE_SUPABASE_SERVICE_ROLE_KEY` não estão configuradas neste ambiente — a mesma classe de limitação externa já registrada para pgTAP/Docker em slices anteriores, não uma regressão introduzida por esta slice. A cobertura unitária desta slice (`inbox-projection.test.ts`) exercita a query e o mapeamento diretamente contra fixtures realistas equivalentes ao que a jornada online veria; a lacuna real é apenas a renderização de ponta a ponta contra o banco linkado.
- **`recordOnly`/`hasConsistencyIssue` incompletos até o Slice 2X.7**: ver "Critérios de aceite" e "Decisões tomadas" — limitação documentada, dependência explícita da próxima slice, não um defeito desta.
- Coverage percentual não foi recalculado nesta slice (última medição explícita é da baseline da Fase 2B); os números continuam documentados como tal em `STATE.md`.

# Riscos

- Um usuário com muitos registros em processamento simultâneo gera até quatro queries em lote adicionais por página de 50 entries (jobs, interpretações, perguntas, tarefas); nenhuma delas é N+1 por entry, mas o volume cresce linearmente com o tamanho da página. Mitigação: o tamanho de página já é limitado por `PAGE_SIZE` (50) em toda a aplicação.
- O fallback fail-closed (`could_not_organize`/`resolve_consistency`) nunca foi observado com dados reais nesta slice — só é exercitado pelo teste unitário com um `entries.status` sintético inválido. Mitigação: o valor é estritamente mais seguro que a alternativa (esconder a entry), e a CHECK constraint de `entries.status` no banco já impede a maioria dos valores verdadeiramente desconhecidos.

# Próximo slice

O próximo slice elegível é o Slice 2X.7 — Proveniência e confirmação segura de candidatos. Suas dependências (2X.1, 2X.3 e 2X.5) estão satisfeitas. Autorização explícita ainda é necessária antes de iniciá-lo; ele deve adicionar a migration com `is_record_only`/proveniência de candidato que este slice já deixou como limitação documentada.

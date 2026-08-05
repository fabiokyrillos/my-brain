# Slice

Slice 2X.12 — Trabalho como rota canônica e projeção de tarefas. Data: 2026-07-18. Branch: `codex/phase-2-intelligent-capture`. Commit único: `feat(work): converge existing task views` (o hash é registrado pelo relatório externo de implementação após a criação do commit).

# Objetivo

Entregar `/{locale}/app/work` como a superfície canônica e localizada das capacidades de tarefa já existentes, reunindo Hoje, Todas e Aguardando sobre `WorkItemView`, sem alterar schema, infraestrutura, lifecycle persistido ou organização da navegação primária.

# Escopo

- Projeção `server-only`, explicitamente owner-scoped, como único leitor de `tasks` da página Work.
- Filtros, timezone, ordenação determinística, paginação por página e fail-closed via `toWorkItemView`.
- UI PT-BR/en baseada somente em DTOs de produto, com estados/origens/datas humanas e ações existentes.
- Criação manual preservada; nenhum editor avançado.
- Redirects de `/today`, `/tasks`, `/waiting` com locale/view/page equivalentes.
- Revalidação de Work em ambos os locales após criação/mutação/confirmacão/undo de tarefas.
- Cobertura Vitest, arquitetura, Playwright offline e extensão do spec online já protegido por credenciais.
- Documentação permanente afetada. Nenhuma mudança de navegação primária (2X.13) ou analytics (2X.15).

# Critérios de aceite

- Atendido — `today`: prazos anteriores ao início do próximo dia no timezone do perfil, excluindo `completed`/`cancelled`, `due_at asc` e `id asc`.
- Atendido — `all`: não canceladas, `updated_at desc` e `id asc`.
- Atendido — `waiting`: somente `waiting`, `updated_at desc` e `id asc`.
- Atendido — ownership explícito por `user_id` mesmo com RLS; página sem query direta de `tasks`.
- Atendido — timezone do perfil usado no cutoff e na apresentação; ausente/inválido usa `America/Sao_Paulo`.
- Atendido — DTO/origem/estado/ações vindos de `toWorkItemView`; row inválida é descartada sem fallback perigoso.
- Atendido — tabs acessíveis com `aria-current`, foco visível, links nativos e targets de 44px; copy completa PT-BR/en e nenhum enum bruto.
- Atendido — paginação por página preserva `view`; Needs Attention keyset não foi tocada.
- Atendido — criação manual e concluir/aguardar/retomar/reabrir preservados; edição avançada não adicionada.
- Atendido — aliases preservam locale, view equivalente e page.
- Atendido — Actions relevantes revalidam Work em pt-BR e en.
- Atendido — spec online confirma tarefa em Work e ausência após undo; execução foi corretamente pulada pela falta das três credenciais, sem ser reportada como pass.
- Não aplicável — migration/RPC/Edge Function/infra: nenhuma necessária conforme brief e implementação.

# Arquivos alterados

- Novos: `work-projection.ts`/teste, `work-view.tsx`/teste, `app/[locale]/app/work/page.tsx`/teste arquitetural, `features/operations/actions.test.ts`, este relatório.
- Rotas convertidas: `today/page.tsx`, `tasks/page.tsx`, `waiting/page.tsx`.
- UI/Action/paginação/CSS: `task-list.tsx`, `operations/actions.ts`, `tasks/actions.ts`/teste, `pagination-links.tsx`, `operations.css`.
- E2E: `foundation.spec.ts`, `intelligent-capture.spec.ts`.
- Permanentes: `ARCHITECTURE.md`, `STATE.md`, `CHANGELOG.md`, `TODO.md`.

# Decisões tomadas

- A projeção consulta `profiles` antes de `tasks` porque o mesmo timezone define tanto o cutoff de Hoje quanto a apresentação de prazo; a página não executa nenhuma query própria.
- O cutoff é o início UTC do próximo dia local e usa comparação exclusiva (`due_at < cutoff`), evitando o frágil padrão `23:59:59.999` e respeitando mudanças de offset IANA.
- O tie-break é `id asc` em todas as views. A paginação continua offset/page porque essa é a compatibilidade existente de Work; nenhuma parte da paginação keyset de Precisa de você mudou.
- `TaskList` continua submetendo a Server Action existente, mas decide renderização exclusivamente pelos IDs de ação do DTO; nenhuma comparação com status persistido permanece no componente.
- Manual creation aparece na view All, equivalente à antiga `/tasks`; as outras views preservam seu foco e não ganham editor/controle novo.
- A Proxy protege `/app` antes que o redirect de page rode para usuários sem sessão. Por isso, o Playwright offline prova proteção de todos os aliases, o teste arquitetural chama os módulos e prova destinos exatos, e o spec online autenticado prova a cadeia real quando credenciais existem.

# Migrations

Nenhuma. `supabase migration list --linked` mostra local/remoto sincronizados até `202607180031`.

# RPCs

Nenhuma criada ou alterada. Work usa query Supabase server-only existente e owner-scoped.

# Edge Functions

Nenhuma afetada.

# Testes executados

- RED: `npm test -- src/features/daily-cycle/work-projection.test.ts src/features/daily-cycle/work-view.test.tsx src/app/[locale]/app/work/page.architecture.test.ts src/features/operations/actions.test.ts src/features/tasks/actions.test.ts` — exit 1, 5 files/18 falhas esperadas, 7 testes existentes passando; causas: módulos/rota/redirects/revalidação ausentes.
- RED adicional de fronteira: `npm test -- src/features/operations/actions.test.ts` — exit 1, `applyWorkItemAction is not a function`, provando antes da implementação que a tradução de ação de produto ainda não existia na Server Action.
- GREEN focado final: comando inicial mais `src/features/shell/pagination-links.test.tsx` — 6 files/29 tests passing.
- Completo: `npm test` — 68 files/375 tests passing.
- `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check` — limpos; build lista `/[locale]/app/work` e os aliases.
- `npx playwright test --project=desktop --project=mobile` — 6 passing, 10 skipped por credenciais online ausentes.
- `npx supabase migration list --linked` — exit 0, local/remoto sincronizados por `202607180031`.

# Evidências

- RED: `Test Files 5 failed`; `Tests 18 failed | 7 passed`.
- RED adicional: `Test Files 1 failed`; `Tests 1 failed | 2 passed`.
- GREEN focado: `Test Files 6 passed`; `Tests 29 passed`.
- Suite completa: `Test Files 68 passed`; `Tests 375 passed`.
- Build Next.js `16.2.10`: `Compiled successfully`; route manifest contém `ƒ /[locale]/app/work`.
- Playwright offline: `6 passed`, `10 skipped`.
- Credenciais: `ONLINE_SUPABASE_URL=False`, `ONLINE_SUPABASE_PUBLISHABLE_KEY=False`, `ONLINE_SUPABASE_SERVICE_ROLE_KEY=False`.
- Migration list: todas as linhas local/remote iguais até `202607180031`.

# Limitações

- Playwright autenticado não executado: as três credenciais `ONLINE_SUPABASE_*` não existem no processo. O spec foi atualizado, mas nenhuma alegação de pass online é feita.
- A organização de navegação continua a mesma e pode apontar primeiro aos aliases; reorganizá-la pertence exclusivamente ao Slice 2X.13.
- Nenhuma auditoria manual com leitor de tela real foi executada; roles/names/`aria-current`, teclado nativo, foco CSS, target de toque e desktop/mobile offline têm cobertura automatizada.

# Riscos

- A conversão timezone→UTC usa `Intl.DateTimeFormat` IANA e iteração de offset; testes cobrem o cutoff local e fallback inválido, e a comparação exclusiva evita limite ambíguo. Nova regressão deveria ser adicionada se o produto passar a aceitar fusos com transições históricas relevantes para deadlines futuros.
- Rows com estado/origem desconhecidos deixam de aparecer (fail-closed) em vez de mostrar enum interno ou ação incorreta; isso é intencional e deve provocar atualização do mapper quando um novo estado persistido for introduzido.

# Próximo slice

Slice 2X.13 — navegação primária e agrupamento Mais. As dependências 2X.11/2X.12 estão satisfeitas, mas o slice não foi iniciado e exige autorização própria e novo ciclo RED/GREEN/gates.

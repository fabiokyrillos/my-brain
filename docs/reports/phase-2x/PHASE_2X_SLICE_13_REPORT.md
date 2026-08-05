# Slice

Slice 2X.13 — Navegação primária e agrupamento Mais. Data: 2026-07-19. Branch: `codex/phase-2-intelligent-capture`. Commit único: `feat(shell): converge daily information architecture` (o hash é registrado pelo relatório externo de implementação após a criação do commit).

# Objetivo

Convergir a arquitetura de informação diária em desktop e mobile para Início, Caixa, Trabalho e Brain, preservar captura/notificações como ações globais, agrupar destinos secundários com a mesma semântica nas duas superfícies e manter todos os contratos de rota/localização/acessibilidade sem introduzir estado de domínio no shell.

# Escopo

- Novo contrato puro `src/features/shell/capabilities.ts` para classificar todas as páginas autenticadas, construir hrefs canônicos localizados e resolver active state.
- Árvore desktop e Mais mobile com os grupos Contexto, Reflexão, Organização, Transparência e Preferências na mesma ordem.
- Captura global destacada, Notificações no ícone global e Jobs apenas por contexto técnico explícito.
- Active state para Caixa default/`needs-you`/revisão aninhada, Work canônico/views/aliases e Brain/conversas aninhadas.
- Locale switch com preservação de pathname/query, copy PT-BR/inglês e remoção de status estáticos não observáveis.
- Ordem DOM/visual/tab mobile alinhada, Escape com restauração de foco, touch targets de 44 px e menu limitado ao viewport.
- Cobertura Vitest/Playwright e atualização de `STATE.md`, `TODO.md`, `CHANGELOG.md`, `ARCHITECTURE.md`, `DECISIONS.md` e deste relatório.

# Critérios de aceite

- [x] Desktop e mobile usam Início/Home, Caixa/Inbox, Trabalho/Work e Brain como os quatro destinos primários.
- [x] Captura permanece global e visualmente distinta; Notificações permanece no ícone global.
- [x] Todos os destinos secundários continuam alcançáveis nos cinco grupos aprovados, sem Jobs na navegação comum.
- [x] Nenhuma rota canônica, alias legado, subrota ou query view foi removida ou alterada.
- [x] Active state é determinístico, segment-bounded e nunca marca dois primários para a mesma URL.
- [x] Navegação e troca de locale preservam locale e query significativa.
- [x] Mais/More funciona com teclado/leitor de tela/touch, fecha com Escape e devolve foco ao summary.
- [x] Ordem DOM e visual/tab mobile coincidem; controles visíveis medem ao menos 44 px.
- [x] Copy PT-BR/inglês usa conceitos de produto e não expõe Jobs, enums, banco ou promessas falsas.
- [x] Componentes de navegação não consultam Supabase nem calculam lifecycle, atenção, task ou estado persistido.

# Arquivos alterados

- `src/features/shell/capabilities.ts` e `capabilities.test.ts`.
- `src/features/shell/navigation-links.tsx`.
- `src/features/shell/app-shell.tsx` e `app-shell.test.tsx`.
- `src/i18n/messages.ts`.
- `src/app/mobile-navigation.css`.
- `e2e/foundation.spec.ts` e `e2e/online-mobile-navigation.spec.ts`.
- `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` e este relatório.

# Decisões tomadas

- Uma única capabilities registry representa rotas e conceitos de produto para as duas superfícies; não foi criado framework genérico.
- Query string não participa da seleção primária: Caixa/Work continuam ativos enquanto seus próprios controles de view representam o filtro interno.
- Work absorve os aliases `/today`, `/tasks` e `/waiting`; Caixa absorve `/inbox/[entryId]`; Brain absorve `/chat/[conversationId]`.
- ADR-028 supersede apenas a lista concreta de ADR-010 e preserva seus contratos de reachability, semântica nativa, viewport e 44 px.
- "Brain atento"/"Brain ativo" foram removidos porque não havia consumidor observável capaz de sustentá-los.

# Migrations

Nenhuma. Local e linked permanecem sincronizados até `202607180031`.

# RPCs

Nenhuma RPC criada ou alterada.

# Edge Functions

Nenhuma Edge Function, deployment, segredo ou infraestrutura alterados.

# Testes executados

- RED inicial: o módulo de capacidades ausente e a hierarquia antiga falharam como esperado; o segundo RED comprovou divergência entre ordem DOM e visual/tab; o re-review acrescentou regressões RED para alias legado aninhado e alvos globais menores que 44 px.
- Focused GREEN: `npm test -- src/features/shell/capabilities.test.ts src/features/shell/app-shell.test.tsx` — 2 arquivos, 9 testes aprovados.
- Full Vitest: `npm test` — 69 arquivos, 382 testes aprovados.
- `npm run lint` — aprovado, zero erros.
- `npm run typecheck` — aprovado, zero erros.
- `npm run build` — Next.js 16.2.10 aprovado.
- Playwright offline: `npm run test:e2e` — 6 aprovados, 10 online credential-gated skips; desktop e mobile executados.
- Playwright online direcionado: `npm run test:e2e:online -- e2e/online-mobile-navigation.spec.ts` — 2 aprovados; desktop/mobile, PT-BR/inglês, grupos, active state, Jobs oculto, 44 px e Escape/foco.
- `git diff --check` — aprovado; somente avisos LF/CRLF preexistentes do ambiente Windows.
- `npx supabase migration list` — histórias local/remota idênticas até `202607180031`.
- Re-review independente após os ajustes — PASS, sem achados acionáveis remanescentes.

# Evidências

- Matriz pura cobre todas as 24 páginas/variações autenticadas atuais, inclusive aliases e subrotas representativas.
- Testes de shell validam hierarquia, agrupamento, destinos canônicos, PT-BR/inglês, remoção de promessas estáticas, Escape/foco e ordem DOM/tab.
- Journey remoto autenticado criou usuários descartáveis, navegou as duas localidades nos dois viewports e removeu os usuários no teardown.
- O login remoto exigiu até cerca de 25 s no primeiro aquecimento; o teste usa limite explícito de 30 s e repetições finais completaram em cerca de 11 s por viewport.

# Limitações

O comando Playwright offline não injeta `ONLINE_SUPABASE_*` e, corretamente, registra 10 skips; o runner online linkado materializou as três credenciais e passou separadamente, portanto não existe lacuna online para esta slice.

# Riscos

- Uma nova rota autenticada pode ficar sem classificação se a registry não for atualizada; a matriz exaustiva e ADR-028 tornam essa obrigação explícita.
- Alterações futuras de aliases legados devem preservar matching exato para não criar active states falsos em caminhos desconhecidos.
- O menu mobile permanece baseado em `details/summary`; mudanças de markup devem preservar Escape/foco, ordem DOM/visual e targets de 44 px.

# Próximo slice

Slice 2X.14 somente após autorização explícita e novo ciclo RED/GREEN/gates. Nenhum trabalho da Slice 2X.14 foi iniciado.

# Slice

Slice 2X.11 — "Precisa de você" na Home e Caixa. Data: 2026-07-18. Branch: `codex/phase-2-intelligent-capture`.

# Objetivo

Conectar a projeção "Precisa de você" (Slice 2X.10, `list_needs_attention`/`loadAttentionProjection`) às duas superfícies de produto que a consomem nesta fase: Início mostra contagem e prévia; Caixa oferece o filtro canônico `?view=needs-you` sobre a mesma projeção. Nenhuma lógica de elegibilidade, motivo ou precedência é recriada nesta fatia — ambas as superfícies apenas hidratam e renderizam o que `loadAttentionProjection` já decide.

# Escopo

- `src/features/daily-cycle/needs-attention-item.tsx` (novo) e teste — linha de apresentação pura, compartilhada por Início e Caixa.
- `src/features/daily-cycle/needs-attention-list.tsx` (novo, client component) e teste — lista com acumulação de páginas via Server Action, para a fila completa da Caixa.
- `src/features/daily-cycle/attention-actions.ts` (novo) e teste — `loadMoreNeedsAttention`, wrapper autenticado de `loadAttentionProjection` para o único ponto de paginação client-driven desta fatia.
- `src/features/shell/home-dashboard.tsx` e teste — novo painel "Precisa de você".
- `src/app/[locale]/app/inbox/page.tsx` — novo componente de abas (`InboxViewTabs`) e ramo `?view=needs-you`.
- `src/i18n/messages.ts` — novas chaves `home.needsAttention`, `home.needsAttentionEmpty`, `home.viewAll`.
- `src/app/operations.css` — classes novas para painel, abas, lista e botão de carregar mais.
- `e2e/intelligent-capture.spec.ts` — desvio de Precisa de você inserido no fluxo online existente (não executado nesta sessão).
- `docs/ARCHITECTURE.md`, `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md` — documentação permanente.

Não alterados nesta fatia: `src/features/daily-cycle/attention-projection.ts`, `lifecycle.ts`, `contracts.ts`, `projection-mappers.ts`, `review-projection.ts` (além de reaproveitar `attentionActionId`, já exportada desde o Slice 2X.10); qualquer RPC ou migration; `confirm_entry_task_candidates`/`correct_entry_interpretation`/qualquer Server Action de domínio pré-existente; `src/features/daily-cycle/inbox-projection.ts`/`inbox-item.tsx` (a Caixa "Todos" continua exatamente como estava); navegação primária/`app-shell.tsx` (fora do escopo — Slice 2X.13); Trabalho (Slice 2X.12).

# Critérios de aceite

- Atendido — Início mostra módulo com contagem e primeiros itens (FLOW-002/NY-011): painel "Precisa de você" com `loadAttentionProjection(supabase, { locale, limit: 3 })`, contagem honesta (`items.length` mais `+` apenas quando `hasNext`), até 3 itens de prévia, estado vazio, link "Ver tudo".
- Atendido — Caixa possui view/filtro "Precisa de você" (NY-012): `InboxViewTabs` com duas abas, `aria-current="page"` na ativa; ramo `needs-you` carrega a primeira página via `loadAttentionProjection` (sem cursor — URL estável e sem paginação bruta na querystring).
- Atendido — resolver uma ação recalcula/remove o item sem exigir refresh manual do usuário quando ele volta à fila (NY-013): cada visita a `?view=needs-you` chama `loadAttentionProjection` de novo no servidor; nenhum estado obsoleto é cacheado no cliente entre navegações. A remoção pós-confirmação em si já é responsabilidade e evidência do Slice 2X.10 (RPC/loader), não recriada aqui.
- Atendido — paginação/cursor preservados exatamente como o Slice 2X.10 definiu (NY-014): `NeedsAttentionList` nunca deriva cursor de índice de lista; sempre envia o par `{ occurredAt, entryId }` retornado por `nextCursor`; ordenação permanece a da RPC.
- Atendido — nunca deriva cursor de índice/paginação; sempre envia os dois valores juntos; mantém ordenação determinística; não duplica/pula itens entre páginas; impede requisições de "carregar mais" duplicadas (botão desabilitado durante `isPending`); trata página vazia subsequente corretamente (`hasNext=false` simplesmente oculta o botão); preserva itens já carregados se uma página posterior falhar; evita loop de retry automático (nenhum retry acontece sem novo clique); estado do cliente é baseado em `NeedsAttentionItemView[]`, nunca em linha bruta da RPC.
- Atendido — nenhum componente central recalcula elegibilidade/motivo/precedência: `NeedsAttentionItemRow`/`NeedsAttentionList`/`InboxViewTabs`/painel da Início consomem exclusivamente `NeedsAttentionItemView` e o resultado já decidido de `loadAttentionProjection`/`loadMoreNeedsAttention`.
- Atendido — nenhum outro mapeamento de ação criado: `NeedsAttentionItemRow` usa `copy.actions[item.primaryAction.id]`, a mesma tabela de copy já usada por toda a experiência; `item.primaryAction.id` já vem de `attentionActionId` (Slice 2X.10/2X.8).
- Atendido — não expõe status interno, motivo SQL, nome de campo de banco ou detalhe técnico: `NeedsAttentionItemRow` só renderiza `title`/`explanation`/timestamp/rótulo de ação localizados; nenhum `kind`/`reason`/enum aparece como texto.
- Atendido — copy/rota/hierarquia/interação seguem o plano: rota `?view=needs-you` (não uma taxonomia paralela); abas "Todos"/"Precisa de você"; link "Ver tudo" na Início.
- Atendido — testes primeiro: os 13 testes novos (`needs-attention-item`, `needs-attention-list`, `attention-actions`) mais os 5 novos/ajustados em `home-dashboard.test.tsx` foram escritos e confirmados falhando (módulo inexistente ou comportamento ausente) antes da implementação correspondente.
- Atendido — gate global (suíte completa, lint, typecheck, build, `git diff --check`, Playwright offline) executado e verde — ver "Testes executados".
- Limitação documentada, não regressão — Playwright online autenticado estendido mas não executado (sem credenciais `ONLINE_SUPABASE_*`) — ver "Limitações".
- Não aplicável nesta fatia (fora do escopo autorizado, ver "Decisões tomadas") — eventos `needs_attention_viewed`/`needs_attention_item_opened` não são emitidos.

# Arquivos alterados

- `src/features/daily-cycle/needs-attention-item.tsx` (novo) — `NeedsAttentionItemRow`.
- `src/features/daily-cycle/needs-attention-item.test.tsx` (novo) — 4 testes.
- `src/features/daily-cycle/needs-attention-list.tsx` (novo) — `NeedsAttentionList`, client component.
- `src/features/daily-cycle/needs-attention-list.test.tsx` (novo) — 6 testes.
- `src/features/daily-cycle/attention-actions.ts` (novo) — `loadMoreNeedsAttention`.
- `src/features/daily-cycle/attention-actions.test.ts` (novo) — 3 testes.
- `src/features/shell/home-dashboard.tsx` — novo painel "Precisa de você"; renumeração decorativa dos demais `panel-kicker` (02→06).
- `src/features/shell/home-dashboard.test.tsx` — 5 casos novos/ajustados (painel, contagem com/sem `+`, estado vazio, link "Ver tudo"; um caso pré-existente ganhou `{ selector: ".status-badge" }` para desambiguar de "Precisa de você" do novo heading).
- `src/app/[locale]/app/inbox/page.tsx` — `InboxViewTabs` e ramo `?view=needs-you`.
- `src/i18n/messages.ts` — `home.needsAttention`, `home.needsAttentionEmpty`, `home.viewAll` (pt-BR/en).
- `src/app/operations.css` — classes do painel/abas/lista/botão.
- `e2e/intelligent-capture.spec.ts` — desvio de Precisa de você inserido antes da confirmação de candidatos.
- `docs/ARCHITECTURE.md`, `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md` — documentação permanente.
- `docs/reports/PHASE_2X_SLICE_11_REPORT.md` (este arquivo).

# Decisões tomadas

- **Acumulação client-side em vez de cursor na URL para a fila da Caixa.** As exigências gerais de paginação desta tarefa (preservar itens já carregados se uma página posterior falhar; impedir requisições duplicadas de "carregar mais"; evitar loop de retry automático) não são alcançáveis com navegação `Link` puramente server-rendered, pois uma falha ali substituiria a lista inteira renderizada. `NeedsAttentionList` é o primeiro componente cliente deste projeto a dirigir paginação por Server Action; não introduz nenhuma abstração além deste único ponto de consumo (nenhum framework genérico de "lista paginada"). A URL `?view=needs-you` permanece estável e "bookmarkável" — só a primeira página é renderizada no servidor; o estado de páginas adicionais não é refletido na URL, coerente com XG-027 (um refresh reconstrói a partir do zero, o que é esperado para uma fila viva, não um defeito).
- **Contagem da Início mostra só o que a página limitada prova, nunca um total prometido.** `list_needs_attention` deliberadamente não varre o histórico completo do usuário (XG-025), então não existe uma contagem exata barata de se obter. `{items.length}` mais `+` quando `hasNext` é o sinal honesto disponível sem uma segunda consulta ilimitada — coerente com TRU-002/TRU-A04 (nenhuma mensagem pode prometer mais do que realmente aconteceu/é conhecido).
- **`needs_attention_viewed`/`needs_attention_item_opened` não são emitidos por esta fatia.** Ambos os nomes de evento e seus schemas de propriedade já existem (Slice 2X.2), mas conectar emissores client-side de visualização/abertura é explicitamente escopo do mapa de arquivos do Slice 2X.15 ("adicionar emissores pequenos aos componentes Home/attention/review/work"), e nenhum emissor client-side de qualquer evento existe ainda neste projeto (`recordProductInteraction` não tinha nenhum consumidor de produção antes desta fatia). Construir esse padrão agora para um único ponto de chamada seria exatamente o tipo de abstração prematura de consumidor único que os padrões de engenharia deste projeto desencorajam. A ordem de execução do plano ("Emitir viewed/opened apenas via contrato analytics best-effort") é lida como uma restrição sobre *como* instrumentar, caso a instrumentação aconteça nesta fatia — não como um mandato que anule a atribuição explícita de propriedade do Slice 2X.15 nem a regra geral de evitar refactors oportunistas fora do escopo pedido.
- **Nenhum filtro além de "Todos"/"Precisa de você".** O conjunto completo de filtros da Caixa do PRD (Todos, Precisa de você, Organizando, Prontos, Com problema — FLOW-010) não é escopo desta fatia; o mapa de arquivos do próprio Slice 2X.11 no plano de implementação autoriza somente o filtro canônico `view=needs-you`.
- **`NeedsAttentionItemRow` reaproveitado integralmente entre Início e Caixa**, seguindo o mesmo padrão já estabelecido por `InboxItemRow` no Slice 2X.6 — nenhuma segunda implementação de linha foi criada.
- **Renumeração decorativa dos `panel-kicker` da Início** (02→06) para abrir espaço ao novo painel logo após "01 / AGORA": puramente textual/CSS, sem teste dependente dos números antigos, sem mudança de comportamento.

# Migrations

Nenhuma. Esta fatia consome exclusivamente `list_needs_attention`/`loadAttentionProjection`, ambos já implantados e verificados pelo Slice 2X.10. Local e remoto permanecem sincronizados em `031`.

# RPCs

Nenhuma nova e nenhuma alterada. `loadMoreNeedsAttention` é uma Server Action TypeScript que chama `loadAttentionProjection`, que por sua vez chama a RPC `list_needs_attention` já existente sem alterar seu contrato.

# Edge Functions

Nenhuma afetada.

# Estrutura de componentes

- `NeedsAttentionItemRow` (server-safe, sem `"use client"`): título, explicação, timestamp localizado, rótulo de ação (`copy.actions[primaryAction.id]`), link de linha inteira para `/{locale}/app/inbox/{entryId}`.
- `NeedsAttentionList` (`"use client"`): recebe `initialItems`/`initialCursor`/`initialHasNext`/`locale`/`loadMore` (a Server Action `loadMoreNeedsAttention` passada como prop, padrão suportado pelo App Router); mantém `items`/`cursor`/`hasNext`/`error`/`isPending` em estado local via `useState`/`useTransition`; nunca lê `database.types` ou linha bruta.
- `loadMoreNeedsAttention` (Server Action): autentica via `supabase.auth.getUser()` (mesmo padrão de `captureEntry`, sem usar `requireUser` porque este não deve redirecionar em uma chamada client-invocada), retorna `{ ok: false, code: "session_expired" }` sem sessão, ou `{ ok: false, code: "action_failed" }` se `loadAttentionProjection` lançar, nunca deixando a promise rejeitar sem tratamento no navegador.
- Início: chama `loadAttentionProjection` diretamente (sem paginação — é sempre a primeira página, limite pequeno); nenhum componente cliente novo é necessário para a prévia.
- Caixa: `InboxViewTabs` (função local em `page.tsx`, não extraída para arquivo próprio — usada em um único lugar, ~10 linhas, sem precedente de extração para navegações tão pequenas neste projeto) mais o ramo `needs-you` que delega a `NeedsAttentionList`.

# Paginação

- Contrato keyset preservado exatamente como o Slice 2X.10 definiu: `{ occurredAt, entryId }` sempre enviados juntos; nunca derivado de índice de lista; ordenação permanece a decidida pela RPC (`occurred_at desc, entry_id desc`).
- "Carregar mais" desabilitado durante requisição em andamento (`isPending`), prevenindo cliques duplicados.
- Página subsequente vazia: `hasNext=false` simplesmente oculta o botão; não há estado de erro nem loop.
- Falha de página subsequente: itens já carregados são preservados; erro localizado aparece (`role="alert"`); nenhum retry automático ocorre — só um novo clique do usuário tenta de novo.
- Estado do cliente é sempre `NeedsAttentionItemView[]`/`AttentionCursor`, nunca uma linha bruta de RPC.
- A URL `?view=needs-you` não carrega cursor — permanece estável entre visitas; um refresh reconstrói a partir da primeira página do servidor (XG-027), o que é o comportamento correto para uma fila que muda conforme o usuário resolve itens.

# Testes executados

- `npx vitest run src/features/daily-cycle/needs-attention-item.test.tsx src/features/daily-cycle/needs-attention-list.test.tsx src/features/daily-cycle/attention-actions.test.ts` — focado, 13/13 verdes, confirmados falhando antes da implementação.
- `npx vitest run src/features/shell/home-dashboard.test.tsx` — focado, 8/8 verdes (5 novos/ajustados).
- `npm test` — 64 arquivos / 357 testes, verde (13 novos frente à baseline pós-Slice 2X.10 de 340).
- `npx tsc --noEmit` — limpo.
- `npm run lint` — limpo.
- `npm run build` — build de produção Next.js 16.2.10 concluído sem erro; rotas `/[locale]/app` e `/[locale]/app/inbox` compilam.
- `npx playwright test --project=desktop --project=mobile` — 4 passando, 10 skips esperados (sem `ONLINE_SUPABASE_*`), idêntico à baseline do Slice 2X.10; nenhuma regressão.
- `git diff --check` — limpo (apenas os avisos pré-existentes de LF/CRLF do Git no Windows).
- Migrations: `supabase migration list` não executado nesta fatia (nenhuma migration nova); sincronização permanece a mesma do Slice 2X.10 (`031`).

# Evidências

- `npm test`: `Test Files 64 passed (64)` / `Tests 357 passed (357)`.
- `npx eslint .` e `npx tsc --noEmit`: sem saída.
- `npm run build`: `✓ Compiled successfully`, rotas listadas incluindo `/[locale]/app` e `/[locale]/app/inbox`.
- Playwright offline: `4 passed`, `10 skipped`.

# Empty/loading/error states

- Início: estado vazio ("Nada precisa de você agora."/"Nothing needs you right now.") quando `items.length === 0`.
- Caixa: estado vazio dedicado ("Nada precisa de você agora"/"Nothing needs you right now" com texto explicativo) quando a primeira página não tem itens.
- Carregando: botão "Carregar mais" mostra `LoaderCircle` e fica desabilitado durante `isPending`; nenhum spinner de página inteira é necessário pois a primeira página já chega renderizada pelo servidor.
- Erro: mensagem localizada (`role="alert"`) aparece abaixo da lista já carregada sem escondê-la; o botão permanece habilitado para nova tentativa manual.

# Acessibilidade

- `InboxViewTabs`: `aria-current="page"` na aba ativa; links com `min-height:44px` (`.inbox-view-tabs a`), consistente com o padrão de toque já estabelecido no restante do arquivo.
- `NeedsAttentionItemRow`: `<a>` de linha inteira (mesmo padrão de `InboxItemRow`, já testado por leitores de tela em fatias anteriores); nenhum ícone com significado não também presente em texto.
- Botão "Carregar mais": elemento `<button>` nativo, navegável e ativável por teclado; `aria-hidden="true"` no ícone de carregamento.
- Erro de "carregar mais": `role="alert"` garante anúncio por leitor de tela sem precisar de foco manual.
- Não foi executada auditoria com leitor de tela real nem `axe`/Lighthouse automatizado nesta fatia; a cobertura é de asserções de papel/nome acessível (`getByRole`) nos testes de componente.

# Desktop/mobile

Nenhum breakpoint existente foi removido. `.inbox-view-tabs` ganha `flex-wrap:wrap` em `max-width:600px` para não estourar a largura em telas estreitas; os demais elementos reaproveitam `.list-row`/`.list-stack`/`.panel`, já responsivos desde fatias anteriores. Validação visual real em navegador (desktop ou mobile) não foi executada — ver "Limitações".

# Localização

Toda copy nova segue os padrões já estabelecidos: `src/i18n/messages.ts` para as três novas chaves do painel da Início (mesmo arquivo/mecanismo que `t.priority`/`t.waiting`/etc. já usam); ternários locais `pt ? "..." : "..."` para abas da Caixa e mensagens de `needs-attention-list.tsx`, consistente com o padrão já usado por `inbox-item.tsx`/`entry-review.tsx`/`copy.ts`. Nenhuma string nova foi hardcoded em um único idioma.

# Testes online (Playwright autenticado)

`e2e/intelligent-capture.spec.ts` foi estendido com um desvio inserido logo antes da confirmação de candidatos (momento em que a entrada tem certamente um candidato não confirmado e nenhuma pergunta aberta, portanto aparece com o motivo `confirm_existing_candidates`): visita à Início confirma o heading "Precisa de você" e uma contagem não-zero; clique em "Ver tudo" navega para `/pt-BR/app/inbox?view=needs-you` com a aba correta marcada `aria-current="page"`; clique na linha do item navega de volta para a página de revisão da mesma entrada; uma visita direta à URL localizada em inglês confirma o rótulo "Needs you" na aba ativa.

**Não executado nesta sessão** — este workstation não tem `ONLINE_SUPABASE_URL`/`ONLINE_SUPABASE_PUBLISHABLE_KEY`/`ONLINE_SUPABASE_SERVICE_ROLE_KEY` configurados. Nenhuma alegação de execução real é feita para este spec; a suíte reporta "skipped" para todo o arquivo, como já documentado em todas as fatias anteriores que dependem do mesmo ambiente.

Este slice **não** tenta provar, no Playwright online, que uma entrada totalmente confirmada desaparece da fila: o status final da entrada nesta fixture específica é ambíguo por design do próprio teste pré-existente (`expect(["awaiting_review", "completed"]).toContain(entries[0].status)`), e se a entrada permanecer `awaiting_review`, ela corretamente continua na fila sob o motivo `review_interpretation` — não é um bug, é o comportamento correto de `resolveDailyCycleLifecycle`. Esse invariante de remoção já está provado deterministicamente no nível de unidade/RPC pelo próprio Slice 2X.10 (`attention-projection.test.ts` e o caso de regressão em `needs_attention_projection.sql`), sob uma fixture controlada; não há necessidade de reprová-lo aqui sob uma fixture ambígua.

# Limitações

- Playwright online autenticado não executado (sem credenciais nesta máquina) — ver acima.
- Validação visual manual não executada: nenhuma captura de tela ou navegação manual em navegador real foi feita para confirmar o resultado visual do painel/abas/lista novos; a validação disponível é testes de componente, build de produção bem-sucedido, e Playwright offline (que não visita rotas autenticadas).
- A contagem da Início é sempre um limite inferior (`items.length`, `+` quando `hasNext`), nunca o total exato da fila completa do usuário, por design (ver "Decisões tomadas") — isso é intencional, não uma limitação a corrigir.
- `needs_attention_viewed`/`needs_attention_item_opened` não são emitidos por esta fatia (ver "Decisões tomadas"); permanece trabalho do Slice 2X.15.
- O conjunto completo de filtros da Caixa (Organizando, Prontos, Com problema) não foi adicionado — fora do escopo autorizado desta fatia.

# Rollback

Reverter apenas os arquivos listados em "Arquivos alterados" restaura o comportamento do Slice 2X.10 (RPC/projeção sem consumidor de UI) sem qualquer efeito em dado persistido: nenhuma migration, RPC, coluna ou linha foi criada ou alterada por esta fatia. `attention-projection.ts`, `lifecycle.ts`, `contracts.ts` e `review-projection.ts` — todos não tocados — continuam funcionando exatamente como antes caso Início/Caixa voltem à composição anterior.

# Confirmação de escopo

O Slice 2X.12 (Trabalho como rota canônica e projeção de tarefas) não foi iniciado nesta sessão. Nenhum arquivo de `work-projection.ts`, `work-view.tsx`, rota `/work`, ou redirect de `today`/`tasks`/`waiting` foi criado ou modificado.

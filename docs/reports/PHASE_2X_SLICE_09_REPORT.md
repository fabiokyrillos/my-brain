# Slice

Slice 2X.9 — Revisão progressiva orientada à decisão. Data: 2026-07-18. Branch: `codex/phase-2-intelligent-capture`.

# Objetivo

Reorganizar a página de detalhe da entrada (`/inbox/{entryId}`) em uma composição decisão-primeiro: compreensão, o que exige atenção, próximos passos e original sempre visíveis, com todo o restante (confiança por elemento, histórico imutável de versões, dados estruturados extraídos) recolhido atrás de um único detalhe técnico. O payload principal não pode depender do payload técnico, e a visibilidade de cada ação deve vir exclusivamente de `view.availableActions` — não de contagens brutas de array ou de outras condições ad hoc. Esta fatia constrói inteiramente sobre as duas projeções que o Slice 2X.8 já separou (`InterpretationReviewView`/`InterpretationTechnicalDetailsView`); nenhuma delas foi alterada.

# Escopo

- `src/features/daily-cycle/entry-review.tsx` (novo): `EntryReview` compõe, nesta ordem, `ReviewUnderstanding` (heading com `view.understanding`, badge de `productState`, e — pela primeira vez — os `humanFields` do DTO, renderizados como uma lista compacta de fatos; nota inline quando `productState === "organizing"`), `ReviewAttention` (renderiza `view.attentionItems[0]`, se existir; recebe `attentionAction`/`attentionDetail` como slots preenchidos pela página, nunca decide sozinho o que mostrar), `ReviewNextActions` (wrapper com heading fixo em torno de qualquer conteúdo de ação que a página injete) e `OriginalRecord` (o `<details>` de registro original, já existente, agora com `defaultOpen` explícito).
- `src/features/daily-cycle/technical-details.tsx` (novo): `TechnicalDetails` consolida em um único `<details>` recolhido: o painel de confiança por elemento (scores/policies/signals/evidence/overrides, movido de `page.tsx` sem alteração de lógica), o histórico imutável de versões com comparações campo-a-campo, e uma seção nova de dados estruturados extraídos (conceitos, datas identificadas, vínculos de entidade, menções) — conteúdo que não faz parte de nenhum DTO público (nem `InterpretationReviewView` nem `InterpretationTechnicalDetailsView` o modelam), mas que continuava disponível via `editableCurrent`/`extractedMentions` da projeção de revisão (tipos já exportados desde o Slice 2X.8) e que este slice preserva em vez de descartar. Quando `hasTechnicalDetails` é `false`, o componente não renderiza nada; quando é `true` mas `technical` é `null` (falha de carregamento), renderiza uma mensagem de fallback dentro do próprio `<details>` em vez de ocultar a seção ou quebrar a página.
- `src/features/interpretations/revision-editor.tsx`: `InterpretationRevisionEditor` ganhou a prop opcional `showSummary` (default `true`); quando `false`, omite o parágrafo `.interpretation-current-summary` que duplicava o texto já mostrado como heading principal em `ReviewUnderstanding`. Nenhuma outra prop, validação ou comportamento do formulário de correção mudou.
- `src/features/tasks/task-candidate-form.tsx`: avaliado e mantido sem alteração — sua API já era um subcontrato adequado (candidatos + índices indisponíveis, ambos já escopados por interpretação desde o Slice 2X.7); a única adaptação necessária para o novo layout é no ponto de chamada (`page.tsx` agora decide se o renderiza usando `view.availableActions`, não o componente).
- `src/app/[locale]/app/inbox/[entryId]/page.tsx`: reescrita para orquestrar `EntryReview`/`TechnicalDetails` como slots, preservando 1:1 a lógica de dados/Actions existente (`editableCurrent`, `taskCandidates`, `unavailableCandidateIndexes`, `taskUndoId`, `correctionUndoId`, `entityOptions`, `extractedMentions`, `history`, `errorMessage`). Três mudanças reais de comportamento, todas dentro do escopo pedido: (1) visibilidade de correção/undo/confirmação agora vem de `view.availableActions`, não de `Boolean(correctionUndoId)`/`taskCandidates.length > 0`; (2) o texto específico da pergunta pendente (antes num `.question-block` dedicado) ou da mensagem de erro passa a aparecer como detalhe dentro do bloco de atenção; (3) o painel de confiança, o histórico e o bloco "Versão atual" (conceitos/datas/vínculos/menções) saem do fluxo principal e entram no `<details>` técnico.
- `src/app/operations.css`: novas classes para os blocos (`.entry-review`, `.review-facts`, `.review-organizing-note`, `.attention-notice`/`.attention-safety-note`/`.attention-detail`, `.technical-details`/`.technical-details-body`), reaproveitando ao máximo classes já existentes (`.notice-card`, `.interpretation-actions`, `.original-entry`, `.interpretation-trust-panel`, `.interpretation-history`) para não duplicar estilo. Nenhuma classe existente foi removida ou renomeada.
- `e2e/intelligent-capture.spec.ts`: `waitForOrganized` passa a esperar pelo texto "Ver detalhes técnicos" (em vez do heading "Confiança por elemento", agora recolhido); as duas asserções que dependiam do painel de confiança/histórico (pt-BR e en) abrem o `<details>` antes de checar. Nenhum outro passo, seletor ou asserção do fluxo foi alterado.
- `docs/ARCHITECTURE.md`, `docs/STATE.md`, `docs/CHANGELOG.md`, `docs/TODO.md`: documentação permanente atualizada.

Não foram alterados nesta fatia: `src/features/daily-cycle/review-projection.ts`, `src/features/daily-cycle/technical-details-projection.ts`, `src/features/daily-cycle/lifecycle.ts`, `src/features/daily-cycle/contracts.ts`, `src/features/tasks/actions.ts`, `src/features/interpretations/actions.ts`, `src/features/tasks/task-candidate-form.tsx`; nenhuma migration, RPC, ou schema; `page.architecture.test.ts` (continua passando sem edição, pois a página segue importando só das duas projeções); a fila "Precisa de você" (Slices 2X.10/2X.11); Trabalho/Home/Caixa (fora do escopo desta fatia).

# Critérios de aceite

- Atendido — os quatro blocos (compreensão, atenção, próximos passos, original) estão sempre visíveis e não dependem do carregamento técnico: `technical`/`hasTechnicalDetails` só afetam o quinto bloco (`TechnicalDetails`), nunca `view` (que já vinha só da projeção de revisão desde o Slice 2X.8).
- Atendido — visibilidade de ação exclusivamente por `view.availableActions`: `canRetry`, `canCorrect`, `canUndoCorrection` e `canConfirmCandidates` em `page.tsx` são todos `view.availableActions.some(...)`; nenhum deles usa mais `Boolean(correctionUndoId)`/`taskCandidates.length` diretamente para decidir renderização (o valor em si — `correctionUndoId`, `taskUndoId` — continua sendo passado como dado para o formulário, não como gate de visibilidade).
- Atendido — detalhes técnicos usam `<details>`/`<summary>` nativo, recolhido por padrão, navegável por teclado sem JavaScript adicional (`technical-details.test.tsx` confirma ausência do atributo `open` por padrão).
- Atendido — falha de carregamento técnico não derruba nem esconde a revisão principal: `TechnicalDetails` recebe `technical: null` e `hasTechnicalDetails: true` nesse caso e renderiza uma mensagem de fallback dentro do próprio disclosure (testado em `technical-details.test.tsx`); a página mantém o `try/catch` já existente desde o Slice 2X.8.
- Atendido — `InterpretationRevisionEditor`/`TaskCandidateForm` adaptados sem editor avançado de candidato: o primeiro ganhou uma prop puramente de apresentação (`showSummary`); o segundo não precisou de nenhuma mudança de código, apenas de um ponto de chamada mais preciso.
- Atendido — PT-BR/en e desktop/mobile: toda copy nova segue o padrão `pt ? "..." : "..."` já usado no arquivo; nenhuma media query existente foi removida, e as novas regras CSS incluem um ajuste `max-width:600px` consistente com os breakpoints já estabelecidos. Validação visual real em navegador (não só CSS/testes) não foi executada — ver "Limitações".
- Atendido — testes primeiro: todos os 21 testes novos (13 + 7 + 1) foram escritos e confirmados falhando (módulo inexistente ou comportamento ausente) antes da implementação correspondente.
- Atendido — gate global (testes focados, suíte completa, lint, typecheck, build, `git diff --check`, Playwright offline) executado e verde — ver "Testes executados".
- Limitação documentada, não regressão — Playwright online autenticado (`e2e/intelligent-capture.spec.ts`) foi reescrito linha a linha contra a nova estrutura mas não pôde ser executado nesta máquina (sem credenciais `ONLINE_SUPABASE_*`) — ver "Limitações".

# Arquivos alterados

- `src/features/daily-cycle/entry-review.tsx` (novo) — `EntryReview` e os quatro subcomponentes de bloco.
- `src/features/daily-cycle/entry-review.test.tsx` (novo) — 13 testes.
- `src/features/daily-cycle/technical-details.tsx` (novo) — `TechnicalDetails`.
- `src/features/daily-cycle/technical-details.test.tsx` (novo) — 7 testes.
- `src/features/interpretations/revision-editor.tsx` — prop `showSummary` opcional.
- `src/features/interpretations/revision-editor.test.tsx` — 1 teste novo.
- `src/app/[locale]/app/inbox/[entryId]/page.tsx` — reescrita para compor `EntryReview`/`TechnicalDetails`.
- `src/app/operations.css` — novas classes para o layout decisão-primeiro.
- `e2e/intelligent-capture.spec.ts` — seletores atualizados para o detalhe técnico recolhido.
- `docs/ARCHITECTURE.md`, `docs/STATE.md`, `docs/CHANGELOG.md`, `docs/TODO.md` — documentação permanente.
- `docs/reports/PHASE_2X_SLICE_09_REPORT.md` (este arquivo).

# Decisões tomadas

- **`humanFields` e o conteúdo estruturado extraído (conceitos/datas/vínculos/menções) não viram campos novos de DTO**: `InterpretationReviewView.humanFields` já existia desde o Slice 2X.1/2X.8 e nunca tinha sido consumido — este slice o consome pela primeira vez em `ReviewUnderstanding`. O conteúdo estruturado, por outro lado, não está em nenhum DTO (nem revisão nem técnico); em vez de estender `contracts.ts` (proibido pelo escopo — "não adicionar campos de fatia futura"), ele é passado para `TechnicalDetails` via uma prop `structured` local ao componente, tipada a partir de `EntryReviewEditableCurrent` (tipo já exportado por `review-projection.ts` desde o Slice 2X.8). Isso preserva toda a informação que a página já mostrava sem tocar nenhum contrato público.
- **Pergunta pendente e mensagem de erro viram `attentionDetail`, não uma seção própria**: o antigo `.question-block` dedicado e a mensagem de erro do `could_not_organize` cumpriam o mesmo papel — detalhar o item de atenção genérico. Consolidá-los em um único slot (`attentionDetail`, calculado em `page.tsx` a partir de `attentionReason`) evita duplicar layout/CSS para duas variações do mesmo conceito, sem perder informação.
- **`confirm_existing_candidates` gated por `view.availableActions`, não por `taskCandidates.length`**: o código anterior usava `taskCandidates.length > 0` (array bruto, não filtrado por `unavailableCandidateIndexes`) para decidir se renderizava `TaskCandidateForm`; `view.availableActions` já usa a contagem corretamente escopada por interpretação (`actionableCandidates`, protegida pelo hotfix F1). A mudança é estritamente mais correta e elimina o único ponto da página que ainda decidia visibilidade de ação por conta própria em vez de delegar ao DTO — sem tocar `lifecycle.ts`, `review-projection.ts` ou qualquer lógica já coberta por teste de regressão do F1.
- **`TaskCandidateForm` deliberadamente não alterado**: cogitado adaptar sua assinatura para aceitar `ActionableCandidateView[]` em vez de `TaskCandidate[]` bruto, mas isso removeria a exibição de confiança (`candidate.confidence`, ausente do DTO público) e arriscaria os seletores exatos que `e2e/intelligent-capture.spec.ts` já testa ("Criar N tarefas", "Desfazer criação") sem nenhum ganho de correção — o componente já recebe exatamente os dados escopados por interpretação que precisa, providos pela projeção desde o Slice 2X.7/2X.8. Avaliado e descartado como refactor oportunístico.
- **`InterpretationRevisionEditor.showSummary` como prop opcional em vez de remover o parágrafo incondicionalmente**: só há um call site (`page.tsx`), mas tornar o comportamento antigo o padrão (`true`) preserva compatibilidade caso outro consumidor apareça, e documenta explicitamente por que o novo call site passa `false` (evitar duplicar o heading).
- **`ReviewAttention` recebe ações como slot (`children`/`attentionAction`), nunca as constrói**: mantém o componente puro/testável sem Actions do servidor, e reforça a regra "componentes centrais não decidem por policy/evidência" — quem decide se `EntryReprocessButton` aparece é `page.tsx`, a partir de `view.availableActions`, exatamente como o "Próximos passos" já fazia antes.

# Migrations

Nenhuma. O plano declara implicitamente nenhuma migration nova para este slice (arquivos listados são só de aplicação/CSS/E2E). `supabase migration list --linked` permanece sincronizado local/remoto até `202607180029` (hotfix anterior), inalterado por esta fatia.

# RPCs

Nenhuma nova e nenhuma alterada. A fatia é inteiramente de composição/apresentação sobre projeções já existentes.

# Estrutura da página: antes e depois

**Antes (Slice 2X.8):** editor de correção sempre visível no topo (com resumo duplicado) → grade de duas colunas ("Versão atual": conceitos/datas/vínculos/menções/classificações/perguntas pendentes; "Confiança por elemento": trust panel completo) → seção de próximas ações (candidatos ou registro-somente) → histórico imutável com comparações → rodapé com modelo. Registro original em `<details>` logo após o cabeçalho. Banners de erro/organizando fora de qualquer estrutura de blocos.

**Depois (Slice 2X.9):** cabeçalho com compreensão + `humanFields` (bloco A) → atenção, só quando há algo pendente, com ação e detalhe específico injetados (bloco B) → próximas ações: candidatos/registro-somente seguidos do editor de correção sem resumo duplicado (bloco C) → registro original, sempre presente (bloco D) → um único `<details>` recolhido com tudo que era "grade de duas colunas" mais histórico mais o "Versão atual" reclassificado como dado estruturado extraído (bloco E). Nenhum bloco depende do bloco E para decidir seu próprio conteúdo.

# Estado de produto e `availableActions`

Nenhuma nova regra de precedência foi criada — `resolveDailyCycleLifecycle` (Slice 2X.1) e as computações de `availableActions`/`attentionItems` (Slice 2X.8, `review-projection.ts`) permanecem a única fonte. O que mudou é que `page.tsx` agora lê exclusivamente esse array para decidir o que renderizar, em vez de recomputar condições equivalentes (mas não idênticas) a partir de dados brutos — fechando a única divergência restante entre "o que o DTO diz que é possível" e "o que a página realmente mostra".

# Progressive disclosure

O detalhe técnico usa `<details>`/`<summary>` nativo (sem JavaScript, acessível por teclado/leitor de tela por padrão do navegador), recolhido na carga inicial da página. Três seções internas (painel de confiança, histórico, dados estruturados) só renderizam quando têm conteúdo (`Object.keys(technical.scores).length > 0`, `history.length > 0`, pelo menos um de conceitos/datas/vínculos/menções não vazio) — o disclosure em si só aparece quando `hasTechnicalDetails` é `true`, ou seja, quando existe uma interpretação atual.

# Acessibilidade

- `ReviewAttention`/`ReviewNextActions` usam `aria-label` explícito na seção (pt-BR/en); o card de atenção reaproveita a estrutura `.notice-card` já testada por leitores de tela em Slices anteriores.
- Ícones decorativos (`AlertTriangle`, `Clock3`, `Sparkles`, `Quote`, `ShieldCheck`, `History`, `Brain`) recebem `aria-hidden="true"` — nenhum ícone carrega significado que não esteja também em texto.
- `<details>`/`<summary>` do bloco técnico e de cada elemento de confiança (`.trust-card`) são navegáveis e ativáveis por teclado nativamente; o `<summary>` do bloco técnico ganhou uma regra `:focus-visible` explícita, consistente com os outros controles interativos do arquivo.
- Feedback de Actions (`role="status"`/`role="alert"`) não mudou — continua vindo de `InterpretationRevisionEditor`/`TaskCandidateForm`, inalterados nesse aspecto.
- Não foi executada auditoria com leitor de tela real nem `axe`/Lighthouse automatizado nesta fatia; a cobertura é de asserções de papel/nome acessível (`getByRole`) nos testes de componente e nos passos de Playwright existentes.

# Desktop/mobile

Nenhum breakpoint existente foi removido. `.entry-review` limita a largura de leitura dos blocos decisão-primeiro (`max-width:760px`) dentro do `.content-page` mais largo (1180px), evitando que o card de próximas ações — antes só ocupando ~40% da grade de duas colunas — fique esticado de forma pouco legível em telas largas. Uma nova regra `@media(max-width:600px)` ajusta o padding do `<details>` técnico e o espaçamento de `.review-facts`, seguindo o mesmo padrão de redução de padding já usado pelas outras seções do arquivo nesse breakpoint. Validação visual real em viewport móvel (dispositivo ou emulador) não foi executada nesta fatia — ver "Limitações".

# Localização

Toda copy nova segue o padrão existente (`locale === "pt-BR"`/`pt ? "..." : "..."`) já usado em `page.tsx` e nos componentes de `daily-cycle`; nenhuma string nova foi hardcoded em um único idioma. `technical-details.tsx` reaproveita literalmente os mapas de rótulo (`policyLabels`, `originLabels`, `evidenceLabels`, `overrideLabels`, `fieldLabels`) que já existiam em `page.tsx`, apenas movidos, sem tradução nova a validar.

# Testes executados

- Testes focados por arquivo, em ordem de escrita (TDD): `entry-review.test.tsx` (13/13), `technical-details.test.tsx` (7/7), `revision-editor.test.tsx` (4/4, incluindo o novo caso), `page.architecture.test.ts` (2/2, inalterado).
- Suíte completa: `npx vitest run` — 60 arquivos, 323 testes, todos passando (302 pré-existentes + 21 novos).
- `npm run lint` — zero erros, zero avisos (um aviso de variável não usada foi corrigido durante a implementação, antes deste relatório).
- `npx tsc --noEmit` — zero erros.
- `npm run build` — build de produção concluído com sucesso (Turbopack, todas as rotas geradas, incluindo `/[locale]/app/inbox/[entryId]`).
- `git diff --check` — sem erros de espaço em branco (apenas avisos cosméticos de CRLF/LF do Git no Windows).
- Playwright offline: `--project=desktop` (2 passed, 5 skipped) e `--project=mobile` (2 passed, 5 skipped) — total 4 passed / 10 skipped, idêntico à linha de base anterior à fatia. Os specs pulados exigem `ONLINE_SUPABASE_*`.
- Migrations: `npx supabase migration list` confirmado sincronizado local/remoto até `202607180029`, sem mudança (nenhuma migration nesta fatia).

# Limitações

- **Playwright online autenticado não executado**: `e2e/intelligent-capture.spec.ts` foi atualizado seletor a seletor para a nova estrutura (abrir o `<details>` técnico antes de verificar o painel de confiança/histórico; `waitForOrganized` agora espera pelo texto "Ver detalhes técnicos"), mas este ambiente não tem `ONLINE_SUPABASE_URL`/`ONLINE_SUPABASE_PUBLISHABLE_KEY`/`ONLINE_SUPABASE_SERVICE_ROLE_KEY` configurados (`.env.local` não contém essas chaves). A suíte reporta "skipped", não "passed" — nenhuma alegação de execução real é feita para este spec.
- **Validação visual manual não executada**: nenhuma captura de tela ou navegação manual em navegador real (desktop ou mobile) foi feita para confirmar o resultado visual do novo layout; a validação disponível é: testes de componente (estrutura/ordem/conteúdo DOM), o guardrail arquitetural, e o Playwright offline existente (que não visita `/inbox/{entryId}` sem autenticação).
- **`answer_existing_question` continua sem UI de resposta nesta página**: como antes desta fatia, responder uma pergunta pendente continua sendo feito em `/questions`; este slice apenas torna o texto da pergunta visível como `attentionDetail` no bloco de atenção — não implementa um formulário de resposta inline (fora de escopo, ver `PHASE_2X_IMPLEMENTATION_PLAN.md` restrições gerais).

# Rollback

Reverter apenas os arquivos listados em "Arquivos alterados" restaura o comportamento do Slice 2X.8 sem qualquer efeito em dado persistido: nenhuma migration, RPC, coluna, ou linha foi criada ou alterada por esta fatia. `review-projection.ts`, `technical-details-projection.ts`, `lifecycle.ts` e `contracts.ts` — todos não tocados — continuam funcionando exatamente como antes caso a página volte à composição anterior.

# Confirmação de escopo

O Slice 2X.10 (consulta/projeção "Precisa de você") não foi iniciado. Nenhum arquivo de `attention-projection.ts`, `needs-attention-list.tsx`, ou RPC `list_needs_attention` foi criado ou modificado nesta sessão.

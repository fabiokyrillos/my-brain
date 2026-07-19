# Slice

Slice 2X.8 — Projeções separadas de revisão e detalhes técnicos. Data: 2026-07-18. Branch: `codex/phase-2-intelligent-capture`.

# Objetivo

Fazer a página de detalhe da entrada carregar dados exclusivamente através de dois DTOs de produto separados — um humano (`InterpretationReviewView`, já especificado no Slice 2X.1, sem scores/policies/evidence) e um técnico (`InterpretationTechnicalDetailsView`, completo) — em vez de uma única função que devolve linhas de tabela e status internos diretamente para o componente de página, mantendo equivalência funcional/visual inicial (nenhuma reorganização de layout ainda; isso é o Slice 2X.9).

# Escopo

- `src/features/daily-cycle/review-projection.ts` (novo): mapper puro `toEntryReviewProjection` que produz `InterpretationReviewView` (entendimento, campos humanos, itens de atenção, candidatos acionáveis, tarefas materializadas, ações disponíveis, registro original, `hasTechnicalDetails`) mais os dados editáveis não-congelados (`editableCurrent`, `entityOptions`, `taskCandidates`, `extractedMentions`, `history`, `taskUndoId`, `correctionUndoId`, `unavailableCandidateIndexes`) que `InterpretationRevisionEditor`/`TaskCandidateForm` — inalterados nesta slice — continuam exigindo. `productState`/`availableActions` vêm de `resolveDailyCycleLifecycle` (Slice 2X.1), nunca de uma leitura direta de `entries.status`. Um loader `server-only` fino (`loadEntryReviewProjection`) reidrata `loadInterpretationReview` mais uma consulta própria a `jobs`/`pending_questions` (mesmo formato de consulta que `inbox-projection.ts` já usa desde o Slice 2X.6) e alimenta o mapper.
- `src/features/daily-cycle/technical-details-projection.ts` (novo): mapper puro `toEntryTechnicalDetailsView` que produz o `InterpretationTechnicalDetailsView` completo (scores/policies/signals/evidence/overrides por elemento, comparações campo-a-campo entre versões consecutivas, proveniência por tarefa, `model`/`source`/`versions`) mais um loader `server-only` fino (`loadEntryTechnicalDetailsProjection`) que executa sua **própria** chamada independente a `loadInterpretationReview` — deliberadamente separada da chamada do loader de revisão, para que uma falha nesta projeção nunca possa bloquear ou distorcer a revisão principal.
- `src/features/interpretations/data.ts`: `loadInterpretationReview` passa a ser infraestrutura interna — comentário e novo tipo exportado `InterpretationReviewData` documentam que só os dois módulos acima devem importá-la; nenhuma página importa mais esta função.
- `src/app/[locale]/app/inbox/[entryId]/page.tsx`: reescrita para carregar exclusivamente via `loadEntryReviewProjection`/`loadEntryTechnicalDetailsProjection`. Não importa `database.types`, não lê `entries.status`/`entry.processing_error`/nenhuma linha crua do Supabase. Badge de status, avisos de erro/organização e visibilidade do botão de nova tentativa vêm de `productState`/`availableActions`.
- `src/app/[locale]/app/inbox/[entryId]/page.architecture.test.ts` (novo): proíbe `database.types`, `Database["public"]`, `@/lib/supabase/server` e `entry.status` no arquivo da página; confirma que a página só importa os dois novos loaders de projeção.
- `src/app/operations.css`: classes `.entry-status-*` passam a usar os cinco `ProductState` (reaproveitando as cores já estabelecidas em `.status-badge.*` desde o Slice 2X.6) em vez dos oito `entries.status` internos.
- `docs/ARCHITECTURE.md`, `docs/STATE.md`, `docs/CHANGELOG.md`, `docs/TODO.md`: documentação permanente atualizada.

Não foram alterados nesta slice: `src/features/interpretations/revision-editor.tsx`, `src/features/tasks/task-candidate-form.tsx` (ambos fora da lista de arquivos do plano — continuam recebendo exatamente as mesmas formas de prop de antes, agora originadas da projeção em vez de uma chamada direta ao Supabase na página); nenhuma migration (o plano declara "Migrations necessárias: Nenhuma exclusiva" para este slice); a reorganização visual em cinco blocos A–E de decisão-primeiro (Slice 2X.9); a fila "Precisa de você" (Slices 2X.10/2X.11).

# Critérios de aceite

- Atendido — o contrato humano (`InterpretationReviewView`) é fixado por teste sem nenhum campo de score/policy/evidence/signal: `review-projection.test.ts` monta o DTO a partir de fixtures realistas e verifica tanto a forma quanto, via `JSON.stringify`, a ausência literal dessas palavras no `view` serializado.
- Atendido — o contrato técnico (`InterpretationTechnicalDetailsView`) é fixado por teste como completo: `technical-details-projection.test.ts` cobre scores/policies/signals/evidence/overrides por elemento, comparações versão-a-versão, proveniência por tarefa e serializabilidade total (`isDailyCycleSerializable`).
- Atendido — consultas e validações são `server-only`, preservam o ponteiro de interpretação atual (`entries.current_interpretation_id`, via `selectCurrentInterpretation` já existente em `loadInterpretationReview`) e ownership (RLS do cliente Supabase autenticado da página, inalterado).
- Atendido — a página consome somente os dois loaders de projeção; nenhuma outra fonte de dados.
- Atendido — falha do detalhe técnico não declara a entrada pronta nem destrói o fluxo principal: os dois loaders fazem chamadas independentes a `loadInterpretationReview`; a página envolve a chamada técnica em `try/catch` e renderiza sem o painel de confiança/comparações quando ela falha, enquanto `productState` (que decide se a entrada está "pronta") vem inteiramente da projeção de revisão, que não depende da técnica.
- Atendido — import de `database.types.ts` é proibido na página (e documentado como regra para futuros componentes centrais) por `page.architecture.test.ts`.
- Atendido — testes focados, Playwright de regressão offline e gate global executados (ver "Testes executados"); Playwright online específico não pôde ser re-executado por falta de credenciais (ver "Limitações"), mas a reescrita foi feita linha a linha contra os seletores/textos exatos que esse spec exige.
- Desvio menor, deliberado e documentado — como consequência direta de centralizar o lifecycle no mapper compartilhado (Épico 3, coberto por este slice): `recoverable_error` e `terminal_error` (antes só o primeiro oferecia retry) agora convergem para `could_not_organize`/`retry_processing` e ambos oferecem o botão de nova tentativa; e o aviso "Reinterpretação em andamento" (exclusivo de `reprocessing`) passa a ser o mesmo aviso `organizing` compartilhado que Caixa/Início já mostram desde o Slice 2X.6, agora também visível para uma primeira interpretação ainda em andamento (antes, silenciosa). Nenhum dos dois é uma regressão funcional — ambos os casos já ofereciam alguma forma de feedback/retry antes; a mudança é de escopo de aplicação, não de existência do recurso.

# Arquivos alterados

- `src/features/daily-cycle/review-projection.ts` (novo) — mapper + loader.
- `src/features/daily-cycle/review-projection.test.ts` (novo) — 10 testes.
- `src/features/daily-cycle/technical-details-projection.ts` (novo) — mapper + loader.
- `src/features/daily-cycle/technical-details-projection.test.ts` (novo) — 7 testes.
- `src/app/[locale]/app/inbox/[entryId]/page.tsx` — reescrita para consumir só as duas projeções.
- `src/app/[locale]/app/inbox/[entryId]/page.architecture.test.ts` (novo) — 2 testes de guardrail arquitetural.
- `src/features/interpretations/data.ts` — `loadInterpretationReview` documentada como infraestrutura interna; novo tipo exportado `InterpretationReviewData`.
- `src/app/operations.css` — `.entry-status-*` recodificado para os cinco `ProductState`.
- `docs/ARCHITECTURE.md`, `docs/STATE.md`, `docs/CHANGELOG.md`, `docs/TODO.md` — documentação permanente.
- `docs/reports/PHASE_2X_SLICE_08_REPORT.md` (este arquivo).

# Decisões tomadas

- **Dois loaders independentes, cada um chamando `loadInterpretationReview` separadamente, em vez de uma única carga compartilhada**: o critério de aceite exige que a falha do detalhe técnico nunca bloqueie ou distorça a revisão principal. Compartilhar uma única carga entre os dois projetores criaria acoplamento exatamente onde o requisito pede independência; o custo é uma segunda ida ao banco por carregamento de página, aceito explicitamente como limitação (ver abaixo) em vez de otimizado prematuramente.
- **Mapper puro separado do loader `server-only`, em ambos os arquivos**: replica o padrão já estabelecido por `inbox-projection.ts`/`projection-mappers.ts` (Slice 2X.6) e por `contracts.ts`/`lifecycle.ts` (Slice 2X.1) — o mapper é testável com fixtures simples, sem simular ~10 tabelas do Supabase; só o loader (fino, sem lógica de decisão) precisa de um teste com `loadInterpretationReview` mockado.
- **`EntryReviewProjection` como superconjunto de `InterpretationReviewView`, não uma tipagem 1:1**: o DTO público `InterpretationReviewView` (Slice 2X.1) é propositalmente mínimo — não carrega os campos estruturados que `InterpretationRevisionEditor`/`TaskCandidateForm` (ambos fora da lista de arquivos desta slice, portanto não reescritos) já exigem hoje (entidades com tipo/id para o formulário de correção, `TaskCandidate[]` completo para o formulário de confirmação). Em vez de reescrever esses dois componentes só para aceitar a forma mínima — o que seria escopo do Slice 2X.9 e um refactor oportunístico não pedido — a projeção devolve o DTO congelado (`view`) ao lado de dados editáveis não-congelados. Isso preserva "a página não lê Supabase diretamente" (o requisito real) sem inventar uma reescrita de UI fora de escopo.
- **`resolveDailyCycleLifecycle` reaproveitado, não reimplementado**: `productState`/`attentionReason` para a página de detalhe usam a mesma função pura do Slice 2X.1 que `inbox-projection.ts` já usa — incluindo a mesma consulta a `jobs`/`pending_questions` que o Slice 2X.6 já fazia para a Caixa. Nenhuma lógica de lifecycle nova foi escrita; só a superfície de consumo mudou.
- **`hasConsistencyIssue: false` mantido como limitação conhecida, não resolvida aqui**: mesmo valor conservador que `inbox-projection.ts` já usa desde o Slice 2X.6, documentado ali como pendência explícita até os Slices 2X.10/2X.11 (fila "Precisa de você"). Resolvê-lo aqui seria escopo de outra slice.
- **Convergência de `recoverable_error`/`terminal_error` e de `reprocessing`/`interpreting` na UI (ver "Critérios de aceite")**: aceita como consequência correta, não como bug, porque é exatamente o que o Épico 3 (explicitamente coberto por este slice) pede — nenhuma página decide nuance de lifecycle por conta própria; a matriz de precedência mora só em `lifecycle.ts`.

# Migrations

Nenhuma. O plano declara "Migrations necessárias: Nenhuma exclusiva" para o Slice 2X.8. `supabase migration list --linked` permanece sincronizado local/remoto até `202607180029` (hotfix anterior), inalterado por esta slice.

# RPCs

Nenhuma nova e nenhuma alterada. Os dois loaders reaproveitam integralmente `loadInterpretationReview` (consultas diretas via `select`, RLS do cliente autenticado) — nenhuma RPC nova foi necessária.

# Edge Functions

Nenhuma alterada.

# Testes executados

- `npm test` — 57 arquivos e 286 testes Vitest passando (19 novos: 10 em `review-projection.test.ts`, 7 em `technical-details-projection.test.ts`, 2 em `page.architecture.test.ts`, distribuídos em 3 arquivos novos).
- `npm run lint` — passando, zero erros.
- `npx tsc --noEmit` — passando, zero erros.
- `npm run build` — build de produção Next.js 16.2.10 passando; topologia de rotas inalterada.
- `git diff --check` — limpo (só avisos de LF/CRLF pré-existentes do Git no Windows, sem erro de whitespace).
- `npx playwright test --project=desktop --project=mobile` — 4 testes públicos passando, 10 pulos esperados (jornadas online, incluindo `intelligent-capture.spec.ts`, que exercitaria esta página diretamente).

# Evidências

- `npm test`: `Test Files 57 passed (57)` / `Tests 286 passed (286)`.
- `npx eslint .` e `npx tsc --noEmit`: sem saída.
- `npm run build`: `✓ Compiled successfully`; rota `/[locale]/app/inbox/[entryId]` presente e inalterada na topologia.
- `npx playwright test --project=desktop --project=mobile`: `4 passed`, `10 skipped` (mensagem de skip: credenciais `ONLINE_SUPABASE_*` ausentes).
- `git status --short`: só os arquivos listados em "Arquivos alterados" aparecem como modificados/novos.

# Limitações

- **Nenhuma verificação online real desta página nesta execução**: `intelligent-capture.spec.ts` — o spec que exercita exatamente esta página (heading "Confiança por elemento"/"Trust by element", `.revision-timeline`, disclosure do original, fluxo de correção/undo/confirmação) — está marcado `test.skip` neste workstation por falta de `ONLINE_SUPABASE_URL`/`ONLINE_SUPABASE_PUBLISHABLE_KEY`/`ONLINE_SUPABASE_SERVICE_ROLE_KEY`. A reescrita foi conduzida linha a linha contra os seletores/textos exatos desse spec (classe `.entry-heading`, heading exato "Confiança por elemento", classe `.revision-timeline` com o texto "v2 · Correção do usuário", heading "Immutable history" em inglês, texto "Ver registro original", todos os rótulos de botão do editor/formulário existentes) para preservar compatibilidade, mas isso não substitui a execução real. Mesma limitação de ambiente já documentada para as slices anteriores (2X.5, 2X.6, 2X.7).
- **Duas idas ao banco em vez de uma por carregamento de página**: ver "Decisões tomadas" — aceito deliberadamente para manter independência real entre as duas projeções.
- **`InterpretationReviewView.humanFields`/`attentionItems` ainda não são o que a página renderiza diretamente**: a página continua renderizando a partir de `editableCurrent`/`extractedMentions`/`history` (dados ricos, não a forma genérica `humanFields`) porque a UI de blocos A–E orientada por esses campos genéricos é o Slice 2X.9. O DTO `view` já existe, é testado e é o que a página usa para `productState`/`availableActions`/badge/avisos — mas seu conteúdo humano detalhado (`humanFields`, `attentionItems`) ainda não tem um consumidor visual direto nesta slice.
- **pgTAP**: não aplicável a este slice — nenhuma migration foi criada.

# Riscos

- A convergência de `recoverable_error`/`terminal_error` (ambos agora oferecendo retry) é uma pequena expansão de comportamento, não uma restrição — o pior caso é um usuário ver um botão "Tentar novamente" em um estado que antes não o oferecia. Sem risco de dado ou de segurança; `reprocessEntry`/`enqueue_entry_reprocessing` já eram seguros para serem chamados em qualquer estado antes desta slice.
- Duplicar a carga de `loadInterpretationReview` por página aumenta o número de consultas por requisição; não medido nesta slice (sem carga de produção real para comparar). Se isso se tornar mensurável, uma slice futura pode compartilhar uma única carga entre os dois projetores sem violar o requisito de independência de falha (por exemplo, com `Promise.allSettled` sobre uma única leitura compartilhada em vez de duas).

# Próximo slice

O próximo slice elegível é o Slice 2X.9 — Revisão progressiva orientada à decisão. Suas dependências declaradas (2X.7 e 2X.8) estão satisfeitas. Autorização explícita ainda é necessária antes de iniciá-lo. O Slice 2X.9 não foi iniciado nesta execução.

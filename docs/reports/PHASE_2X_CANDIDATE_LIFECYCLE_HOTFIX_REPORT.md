# Hotfix

Correção do escopo de `hasMaterializedTaskForCandidates` para a interpretação/candidato atual (achado F1 da revisão de arquitetura das Slices 2X.5–2X.8). Data: 2026-07-18. Branch: `codex/phase-2-intelligent-capture`. Fora da sequência de slices — não é Slice 2X.9.

# Objetivo

Corrigir o defeito de correção F1 documentado em `docs/reports/PHASE_2X_SLICES_2X5_2X8_ARCHITECTURE_REVIEW.md`: `hasMaterializedTaskForCandidates`, o insumo do mapeador de lifecycle que decide se `productState` pode resolver para `ready`, era calculado por entry inteira ("existe alguma task não cancelada para este entry") em vez de por interpretação/candidato ("todos os candidatos da interpretação atual já têm task materializada"). Confirmar apenas um de dois candidatos de uma única interpretação (sem correção nem reprocessamento) fazia o badge de status ler `ready` enquanto `TaskCandidateForm` ainda exibia o segundo candidato não confirmado — badge, lista de ações disponíveis e formulário renderizado discordando sobre o mesmo entry.

# Escopo

- `src/features/interpretations/data.ts`: novo helper puro exportado `hasUnconfirmedTaskCandidates(candidateCount, unavailableCandidateIndexes)`, colocado ao lado de `computeUnavailableCandidateIndexes` (a mesma computação interpretação-escopada que `actionableCandidates` já usava corretamente). Retorna `true` se algum índice em `[0, candidateCount)` não está no conjunto já coberto.
- `src/features/daily-cycle/review-projection.ts` (`loadEntryReviewProjection`): `hasMaterializedTaskForCandidates` passa de `data.tasks.length > 0` para `!hasUnconfirmedTaskCandidates(taskCandidateCount, data.unavailableCandidateIndexes)`, reaproveitando o `unavailableCandidateIndexes` que `loadInterpretationReview` já calculava corretamente.
- `src/features/daily-cycle/inbox-projection.ts`: a query de `tasks` passa a selecionar também `source_interpretation_id,candidate_index` (antes apenas `source_entry_id`); as tasks são agrupadas por `source_entry_id`, e `computeUnavailableCandidateIndexes` roda por entry contra o `current_interpretation_id` de cada entry antes de alimentar o mesmo helper novo.
- Testes: `src/features/interpretations/data.test.ts` (6 casos novos para `hasUnconfirmedTaskCandidates`), `src/features/daily-cycle/inbox-projection.test.ts` (4 casos novos), `src/features/daily-cycle/review-projection.test.ts` (5 casos novos), `src/features/daily-cycle/lifecycle-consistency.test.ts` (novo arquivo, 1 caso cruzando Inbox e Review contra o mesmo fixture).
- `docs/CHANGELOG.md`, `docs/STATE.md`, `docs/TODO.md`, `docs/reports/PHASE_2X_SLICES_2X5_2X8_ARCHITECTURE_REVIEW.md` — documentação permanente.

Não alterado nesta correção: `src/features/daily-cycle/lifecycle.ts` (o contrato de `resolveDailyCycleLifecycle` já estava correto, confirmado pelos próprios testes de `lifecycle.test.ts`); semântica de confirmação de candidatos; `TaskCandidateForm`; qualquer RPC ou migration; `database.types.ts`; qualquer funcionalidade da Slice 2X.9 (não iniciada).

# Causa raiz

`lifecycle.ts` já especificava corretamente o contrato: `hasMaterializedTaskForCandidates` deveria significar "os candidatos acionáveis da interpretação atual já têm cobertura materializada", e `candidateNeedsConfirmation` só é `true` quando essa flag é `false`. Nenhum dos dois loaders computava a flag dessa forma:

- `inbox-projection.ts` buscava apenas `source_entry_id` em `tasks` e marcava `hasMaterializedTaskForCandidates: materializedEntryIds.has(entry.id)` — verdadeiro assim que qualquer task não cancelada existisse para o entry, independente de qual interpretação ou candidato a originou.
- `review-projection.ts` usava `data.tasks.length > 0`, onde `data.tasks` é toda task não cancelada do entry, sem filtro por `source_interpretation_id`.

Enquanto isso, `actionableCandidates` (em `review-projection.ts`) e `TaskCandidateForm` (via `unavailableCandidateIndexes`) já usavam a computação correta e escopada por interpretação (`computeUnavailableCandidateIndexes`). O resultado observável era a incoerência badge/ações/formulário descrita acima — exatamente a classe de problema "interpretação ↔ candidato ↔ ação" que o PRD (Épico 5, invariantes COH) pretende eliminar.

# Regra corrigida

`hasMaterializedTaskForCandidates` agora é derivado, nos dois loaders, da mesma fonte interpretação-escopada: para cada índice de candidato `0..candidateCount-1` da interpretação atual, o candidato só conta como coberto se `computeUnavailableCandidateIndexes` já o marcou indisponível (task própria da interpretação atual, ou proveniência legada não comprovável — a mesma regra conservadora já usada por `actionableCandidates`). `hasUnconfirmedTaskCandidates` centraliza essa checagem como função pura testável isoladamente, evitando uma segunda derivação divergente da mesma informação.

# Critérios de aceite

- Atendido — cenário 1 (zero candidatos): sem candidatos, `hasValidTaskCandidates` já é `false` em ambos os loaders, então o gate de confirmação nunca é avaliado; `hasUnconfirmedTaskCandidates(0, [])` também retorna `false` por construção.
- Atendido — cenário 2 (um candidato, não confirmado): `needs_attention`/`confirm_existing_candidates` (testado em ambos os loaders).
- Atendido — cenário 3 (um candidato, confirmado): `ready` (testado em ambos os loaders; o teste pré-existente de `inbox-projection.test.ts` que já cobria isso foi atualizado para incluir `source_interpretation_id`/`candidate_index` no fixture).
- Atendido — cenário 4 (dois candidatos, apenas um confirmado): continua `needs_attention`/`confirm_existing_candidates` — este é o teste de regressão do F1; reproduzido como falha antes da correção, passando depois, em ambos os loaders.
- Atendido — cenário 5 (dois candidatos, ambos confirmados): `ready` em ambos os loaders.
- Atendido — cenário 6 (task de interpretação mais antiga): não conta como cobertura da interpretação atual — testado em ambos os loaders.
- Atendido — cenário 7 (task de índice de candidato incompatível): não conta como cobertura do candidato restante — testado em ambos os loaders.
- Atendido — cenário 8 (tasks canceladas): não contam como cobertura — já garantido pelo filtro `.neq("status","cancelled")` nas duas queries de `tasks`, inalterado por esta correção (apenas colunas adicionais foram selecionadas, o filtro de status não mudou).
- Atendido — cenário 9 (interpretação record-only): não expõe confirmação de candidato acionável — já coberto por teste pré-existente de `toEntryReviewProjection` (`current.isRecordOnly` esvazia `actionableCandidates`); `lifecycle.ts`'s `!input.recordOnly` gate, inalterado, continua sendo a proteção final independente do valor de `hasMaterializedTaskForCandidates`.
- Atendido — cenário 10 (índices já indisponíveis pelas regras de consistência existentes): permanecem não-acionáveis — `hasUnconfirmedTaskCandidates` consome exatamente o mesmo `unavailableCandidateIndexes`/`computeUnavailableCandidateIndexes` que `actionableCandidates` já usava, então os dois nunca podem divergir por construção.
- Atendido — cenário 11 (Inbox, Home e Review resolvem o mesmo estado): Home consome `loadInboxProjection` diretamente (mesmo componente que `/inbox`), e um novo teste dedicado (`lifecycle-consistency.test.ts`) roda o mesmo fixture (uma interpretação, dois candidatos, um confirmado) através de `loadInboxProjection` e `loadEntryReviewProjection` e afirma que ambos resolvem `needs_attention`/`confirm_existing_candidates`.
- Atendido — nenhuma mudança em `lifecycle.ts`, no contrato de `resolveDailyCycleLifecycle`, na semântica de confirmação/undo de candidatos, em `TaskCandidateForm`, ou em qualquer RPC/migration/schema.
- Atendido — teste-primeiro: os testes de regressão de `inbox-projection.test.ts` e `review-projection.test.ts` foram escritos e confirmados falhando contra o código pré-correção antes de qualquer mudança de implementação.

# Arquivos alterados

- `src/features/interpretations/data.ts` — novo helper puro `hasUnconfirmedTaskCandidates`.
- `src/features/interpretations/data.test.ts` — 6 novos casos.
- `src/features/daily-cycle/review-projection.ts` — `hasMaterializedTaskForCandidates` recalculado em `loadEntryReviewProjection`.
- `src/features/daily-cycle/review-projection.test.ts` — 5 novos casos.
- `src/features/daily-cycle/inbox-projection.ts` — query de `tasks` estendida, agrupamento por entry, `hasMaterializedTaskForCandidates` recalculado.
- `src/features/daily-cycle/inbox-projection.test.ts` — 4 novos casos; 1 fixture pré-existente atualizado.
- `src/features/daily-cycle/lifecycle-consistency.test.ts` (novo) — 1 caso de consistência cruzada Inbox/Review.
- `docs/CHANGELOG.md`, `docs/STATE.md`, `docs/TODO.md`, `docs/reports/PHASE_2X_SLICES_2X5_2X8_ARCHITECTURE_REVIEW.md` — documentação permanente.
- `docs/reports/PHASE_2X_CANDIDATE_LIFECYCLE_HOTFIX_REPORT.md` (este arquivo).

# Decisões tomadas

- **Um helper puro compartilhado em vez de duplicar a lógica em cada loader**: `hasUnconfirmedTaskCandidates` é colocado ao lado de `computeUnavailableCandidateIndexes` em `interpretations/data.ts` (a fonte que `actionableCandidates` já usava corretamente) para que os dois loaders consumam exatamente a mesma derivação, em vez de duas computações independentes do mesmo fato — o padrão de risco que a própria revisão de arquitetura nomeou como o novo tema desta janela de trabalho ("divergência silenciosa de duas derivações do mesmo fato dentro do mesmo runtime").
- **Nenhuma mudança em `lifecycle.ts`**: seu contrato já estava correto e coberto por testes (`lifecycle.test.ts:90-94`); o defeito estava inteiramente na forma como os loaders computavam o insumo, não na função pura que o consome. Manter `lifecycle.ts` intocado minimiza a superfície de revisão e o raio de impacto.
- **Nome do campo preservado (`hasMaterializedTaskForCandidates`)**: embora a revisão sugerisse considerar um nome como `hasUnconfirmedCandidates` invertido, uma renomeação tocaria `lifecycle.ts`, `lifecycle.test.ts` e os dois loaders sem alterar comportamento — julgado desnecessário para este hotfix estritamente corretivo.
- **`inbox-projection.ts` ganha as mesmas colunas que `interpretations/data.ts` já lia**: `tasks.source_interpretation_id`/`candidate_index` já existiam no schema e já eram lidos por `loadInterpretationReview`; nenhuma migration foi necessária, apenas estender o `select()` existente.
- **`recordOnly` de `inbox-projection.ts` permanece hardcoded `false`**: esse é um gap pré-existente, não relacionado ao F1 (a Slice 2X.6 nunca buscou `is_record_only` para o loader do Inbox), e explicitamente fora do escopo autorizado deste hotfix ("não abordar oportunisticamente outros achados"). Não piorado nem corrigido por esta mudança — o comportamento para entries record-only no Inbox é idêntico antes e depois.

# Migrations

Nenhuma. `tasks.source_interpretation_id` e `tasks.candidate_index` já existiam (migration `028`, Slice 2X.7) e já eram lidos por `src/features/interpretations/data.ts`; esta correção apenas estendeu um `select()` já existente em `inbox-projection.ts` para incluir colunas já presentes no schema. Local e remoto permanecem sincronizados em `029`.

# RPCs

Nenhuma alterada.

# Edge Functions

Nenhuma alterada.

# Testes executados

- `npx vitest run src/features/daily-cycle/review-projection.test.ts src/features/interpretations/data.test.ts` — 2 casos falhando antes da correção de `review-projection.ts` (prova de teste-primeiro), 27/27 passando depois.
- `npx vitest run src/features/daily-cycle/inbox-projection.test.ts` — 3 casos falhando antes da correção de `inbox-projection.ts` (prova de teste-primeiro), 16/16 passando depois.
- `npx vitest run src/features/daily-cycle src/features/interpretations` — 20 arquivos/142 testes passando (inclui o novo `lifecycle-consistency.test.ts`).
- `npm test` — 58 arquivos e 302 testes Vitest passando (35 novos frente à baseline de 267 pós-hotfix de migration `029`).
- `npm run lint` — passando, zero erros.
- `npx tsc --noEmit` — passando, zero erros.
- `npm run build` — build de produção Next.js 16.2.10 passando.
- `git diff --check` — sem erros de espaço em branco (apenas avisos normais de conversão LF/CRLF do Git no Windows).
- `npm run test:e2e` (Playwright offline, `desktop`+`mobile`, contra um dev server local iniciado para esta verificação) — 4/4 passando, 10 skips esperados (mesma baseline da Slice 2X.8; este workstation não tem credenciais `ONLINE_SUPABASE_*`).

# Evidências

- `npm test`: `Test Files 58 passed (58)` / `Tests 302 passed (302)`.
- `npx eslint .` e `npx tsc --noEmit`: sem saída.
- `npm run build`: `✓ Compiled successfully`.
- Antes da correção, `review-projection.test.ts` reportou `expected 'ready' to be 'needs_attention'` para os dois casos de regressão; `inbox-projection.test.ts` reportou o mesmo padrão para os três casos de regressão — confirmando a reprodução exata do defeito F1 descrito na revisão de arquitetura.
- `npm run test:e2e`: `4 passed (25.2s)`, `10 skipped`.

# Limitações

- Nenhuma migration ou infraestrutura linkada foi tocada ou necessária para esta correção; nenhuma verificação remota adicional foi executada (não havia RPC, schema ou comportamento server-side para verificar — a correção é inteiramente TypeScript, em duas funções de leitura já cobertas por Vitest).
- `inbox-projection.ts`'s `recordOnly: false` hardcoded permanece um gap pré-existente e não relacionado ao F1 (ver "Decisões tomadas"); não corrigido aqui por estar fora do escopo autorizado.

# Riscos

- Nenhum risco novo introduzido. A correção estritamente restringe quando `hasMaterializedTaskForCandidates` pode ser `true` (de "qualquer task existe" para "todos os candidatos atuais estão cobertos"), então o único comportamento observável que muda é que entries antes incorretamente marcadas `ready` com um candidato pendente agora corretamente aparecem como `needs_attention` — nunca o inverso.

# Confirmações finais

- Nenhuma mudança de banco de dados ou infraestrutura foi necessária para este hotfix.
- A Slice 2X.9 não foi iniciada por este trabalho: nenhuma reorganização de layout, novo bloco de UI, ou funcionalidade de divulgação progressiva foi adicionada. O único código de produção alterado foi a derivação de um booleano em dois loaders já existentes.

# Próximo (não é um slice)

Este hotfix resolve a condição registrada em `docs/reports/PHASE_2X_SLICES_2X5_2X8_ARCHITECTURE_REVIEW.md` (seção 10) para o início da Slice 2X.9. A Slice 2X.9 continua exigindo autorização explícita antes de começar; nenhum trabalho dela foi iniciado por este hotfix.

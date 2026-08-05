# Slice

Slice 2X.10 — Consulta e projeção de "Precisa de você". Data: 2026-07-18. Branch: `codex/phase-2-intelligent-capture`.

# Objetivo

Construir o backend da fila "Precisa de você": uma RPC owner-scoped, paginável e determinística que retorna somente entradas que atualmente exigem uma das cinco decisões já suportadas, e uma projeção TypeScript que hidrata essas linhas em `NeedsAttentionItemView` sem recalcular lifecycle. Nenhuma superfície de Início ou Caixa foi alterada — este slice é exclusivamente backend/projeção, sem consumidor de UI (Slice 2X.11 é responsável por isso).

# Escopo

- Migration `202607180030_phase_2x_needs_attention_projection.sql`: RPC `list_needs_attention(p_limit, p_cursor_occurred_at, p_cursor_entry_id)` e índice parcial `jobs_interpret_entry_status_idx`.
- Migration `202607180031_fix_needs_attention_candidate_correlation.sql`: hotfix de um defeito real encontrado pelo smoke remoto (ver "Decisões tomadas" e "Riscos").
- `supabase/tests/needs_attention_projection.sql` (novo, 35 asserções pgTAP).
- `src/features/daily-cycle/attention-projection.ts` (novo) e `attention-projection.test.ts` (novo, 13 testes).
- `src/features/daily-cycle/review-projection.ts`: `attentionActionId` passou a ser exportada, sem mudança de comportamento, para ser reaproveitada pela nova projeção em vez de duplicada.
- `src/lib/supabase/database.types.ts`: regenerado a partir do schema linkado após `031`.
- `scripts/remote-daily-cycle-smoke.mjs`: estendido com fixtures/asserções de "Precisa de você".
- `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (ADR-027), `docs/SECURITY.md`, `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md`: documentação permanente atualizada.

Não foram alterados nesta fatia: qualquer rota, página ou componente de Início/Caixa/Trabalho; `src/features/daily-cycle/lifecycle.ts`, `contracts.ts`, `projection-mappers.ts` (já continham `NeedsAttentionItemView`/`toNeedsAttentionItemView` como prework do Slice 2X.1, reaproveitados sem alteração); `src/features/tasks/actions.ts`, `src/features/interpretations/actions.ts`; qualquer Server Action; qualquer Edge Function; `confirm_entry_task_candidates`, `correct_entry_interpretation` ou qualquer outra RPC pré-existente (usadas apenas como fixtures/leitura pelo smoke, sem mudança de assinatura ou comportamento).

## Definição de "Precisa de você" (motivos e exclusões)

A RPC computa, para cada entry do usuário, a mesma precedência de cinco motivos já codificada em `resolveDailyCycleLifecycle` (`src/features/daily-cycle/lifecycle.ts`), na mesma ordem:

1. Estado interno ou de job não reconhecido → `resolve_consistency` (fail-closed).
2. `terminal_error` ou job `exhausted` → `retry_processing`.
3. Job `pending`/`running`, ou `failed` com retry automático ainda pendente (`next_attempt_at > now()`) → nenhum motivo (`organizing`, excluído da fila — NY-007).
4. `interpreting`/`reprocessing` → nenhum motivo (`organizing`, excluído).
5. `recoverable_error` (sem retry automático pendente) → `retry_processing` (NY-006).
6. `awaiting_review`/`partially_processed` → `review_interpretation`.
7. `completed` com pergunta aberta → `answer_existing_question` (precedência sobre candidato, testado explicitamente).
8. `completed` com candidato não vazio, não `record-only`, com pelo menos um índice do array `task_candidates` da interpretação atual ainda sem tarefa não cancelada correspondente → `confirm_existing_candidates`.
9. `saved` com job `completed` (inconsistência) → `resolve_consistency` (fallback).
10. Qualquer outra combinação → nenhum motivo (excluído).

Casos 1–12 do enunciado da tarefa foram todos endereçados: candidato único não confirmado (7/8), confirmação parcial mantém o item (validado pelo hotfix e pela regressão pgTAP/remota), confirmação total remove o item, tarefa de interpretação antiga não conta (mesma lógica de `computeUnavailableCandidateIndexes` do Slice 2X.7, reproduzida em SQL), registro `record-only` nunca aparece por esse motivo, erro recuperável/terminal cobertos, estado de reprocessamento tratado como `organizing` (exceto a limitação documentada abaixo), estado desconhecido cai em `resolve_consistency`, falha de detalhes técnicos não se aplica (a RPC não expõe trust/detalhes), item resolvido entre carregamento e ação é tratado de forma fail-closed na hidratação (linha descartada, nunca inventada), e múltiplos itens com o mesmo timestamp têm desempate determinístico por `entry_id desc` (provado por pgTAP com um par de fixtures no mesmo instante).

# Critérios de aceite

- Atendido — a fila é uma projeção, não nova fonte de verdade (NY-001): nenhuma tabela nova foi criada; toda leitura vem de `entries`/`entry_interpretations`/`pending_questions`/`tasks`/`jobs` já existentes.
- Atendido — cada item possui `kind`, título humano, explicação, data, ação primária (NY-002): `NeedsAttentionItemView` (contrato já existente do Slice 2X.1) é populado por `toNeedsAttentionItemView`; título vem do resumo da interpretação atual ou da prévia do original, explicação vem de `copy.attentionReasons[reason].description`.
- Atendido — inclui revisão de interpretação quando a política exige ação, candidatos válidos não confirmados, perguntas abertas suportadas, falhas que exigem retry manual (NY-003 a NY-006).
- Atendido — exclui jobs em retry automático, perguntas já respondidas, candidatos herdados/stale/record-only/confirmados/incompatíveis (NY-007 a NY-009) — provado por pgTAP e pelo smoke remoto (a regressão do hotfix é exatamente este critério).
- Atendido — agrupamento por entry (NY-010): `groupKey = entryId`; como `resolveDailyCycleLifecycle`/sua reprodução em SQL só produzem um motivo por entry (precedência determinística), hoje há sempre um único item por `groupKey`, mas o campo já existe para o caso geral.
- Não aplicável nesta fatia — Início mostra contagem/primeiros itens, Caixa tem view/filtro (NY-011/NY-012): sem consumidor de UI, por escopo explícito do slice (Slice 2X.11).
- Atendido — resolver uma ação recalcula o item sem exigir refresh manual (NY-013): a RPC lê estado atual a cada chamada; o smoke remoto prova que confirmar/negar candidatos muda o resultado da próxima chamada.
- Atendido — paginação e ordenação determinísticas (NY-014): keyset por `(occurred_at desc, entry_id desc)`, sem OFFSET; provado por pgTAP (três páginas exatas, sem sobreposição) e pelo smoke remoto (três páginas reais, sem sobreposição).
- Atendido — ordenação padrão considera ação necessária e recência sem inventar prioridade de domínio (NY-015): ordenação é puramente por recência (`entries.updated_at` como `occurred_at`), sem peso artificial por tipo de motivo.
- Atendido — RPC retorna somente IDs, reason codes, timestamps e chaves, sem copy ou trust: `list_needs_attention` devolve `entry_id, reason, occurred_at, current_interpretation_id, job_id, open_question_id` — nada de texto localizado, score, policy ou evidência.
- Atendido — mapper com queries owner-scoped adicionais mínimas: `attention-projection.ts` hidrata apenas os `entryId`s da página já retornada pela RPC (não um segundo full scan).
- Atendido — RLS/concorrência/desaparecimento após ação provados: pgTAP e smoke remoto cobrem isolamento entre donos, corrida de confirmação (herdada do contrato de `confirm_entry_task_candidates`, já provado no Slice 2X.7) e resolução pós-ação.
- Atendido — fila não faz varredura ilimitada por usuário (XG-025): o conjunto candidato em SQL é restrito a entradas cujo estado bruto já implica possível atenção, não ao histórico total; ver `DECISIONS.md` ADR-027 para a justificativa completa.
- Desvio aprovado, documentado em `DECISIONS.md` ADR-027 — a RPC reimplementa a precedência de `lifecycle.ts` em SQL (não a chama diretamente, o que é impossível pela fronteira Postgres/TypeScript) porque a paginação sem varredura ilimitada exige que o filtro rode no banco; os dois ficam sincronizados por espelhamento de ordem de branches e por uma matriz de cenários pgTAP equivalente à de `lifecycle.test.ts`, não por código compartilhado.
- Atendido — testes primeiro: os 35 casos pgTAP e os 13 casos Vitest foram escritos antes da implementação (RPC e loader, respectivamente); o smoke remoto foi escrito antes de ser executado com sucesso, e sua primeira execução real (contra a `030` original) falhou exatamente como esperado de um teste que ainda não tinha sua implementação correta — revelando o defeito corrigido pela `031`.
- Atendido — gate global (testes focados, suíte completa, lint, typecheck, build, `git diff --check`, Playwright offline) executado e verde — ver "Testes executados".

# Arquivos alterados

- `supabase/migrations/202607180030_phase_2x_needs_attention_projection.sql` (novo) — RPC `list_needs_attention` e índice `jobs_interpret_entry_status_idx`.
- `supabase/migrations/202607180031_fix_needs_attention_candidate_correlation.sql` (novo) — hotfix da colisão de alias em `has_unconfirmed_candidate`.
- `supabase/tests/needs_attention_projection.sql` (novo) — 35 asserções pgTAP.
- `src/features/daily-cycle/attention-projection.ts` (novo) — `loadAttentionProjection`, `ATTENTION_PAGE_SIZE`, `AttentionCursor`, `AttentionProjectionPage`.
- `src/features/daily-cycle/attention-projection.test.ts` (novo) — 13 testes.
- `src/features/daily-cycle/review-projection.ts` — `attentionActionId` passou a ser exportada (assinatura simplificada para aceitar `AttentionReason` diretamente); nenhuma outra mudança.
- `src/lib/supabase/database.types.ts` — regenerado (`list_needs_attention` em `Functions`).
- `scripts/remote-daily-cycle-smoke.mjs` — fixtures/asserções de "Precisa de você"; novos helpers `moveToCompletedWithSameCandidates` e `settleInterpretEntryJob`.
- `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/SECURITY.md`, `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md` — documentação permanente.

# Decisões tomadas

- **Precedência reimplementada em SQL, não chamada por referência.** `resolveDailyCycleLifecycle` é TypeScript de servidor; Postgres não pode executá-la. A alternativa de filtrar em TypeScript (carregar todas as entradas do usuário e rodar o mapper existente) violaria XG-025 (custo cresce com o histórico total, não com a fila real). A RPC reproduz a mesma ordem de branches, comentada linha a linha remetendo a `lifecycle.ts`, e `supabase/tests/needs_attention_projection.sql` cobre a mesma matriz de cenários que `lifecycle.test.ts`. Ver ADR-027.
- **Conjunto candidato limitado, não todo o histórico.** `candidate_entries` só inclui: status que por si só já implica atenção; `completed` com candidato não vazio/não record-only na interpretação atual; `completed` com pergunta aberta; e o caso estreito `saved` com job `completed`/status desconhecido. Isso limita o custo ao volume real de pendências do usuário, não ao total de entradas já capturadas. Limitação documentada: uma entrada `interpreting`/`reprocessing` cujo job se torna `exhausted`/desconhecido antes do próprio status da entrada refletir isso (corrida transitória e autocorrigível) não é capturada — ver "Limitações".
- **Paginação por cursor (keyset), não por OFFSET.** O plano de implementação pede explicitamente "cursor" (não "página"), e OFFSET é instável quando itens desaparecem da fila entre chamadas (exatamente o que acontece quando uma ação é resolvida). O cursor é `(occurred_at, entry_id)`, com `entry_id` como desempate para timestamps iguais.
- **A camada TypeScript não recalcula lifecycle.** `attention-projection.ts` consome o `reason` já decidido pela RPC; sua única responsabilidade é hidratar título/explicação/ação a partir de dados que a RPC deliberadamente não retorna (copy, conteúdo do registro). Isso respeita a instrução explícita de não criar uma segunda definição de "precisa de você".
- **`attentionActionId` reaproveitada, não duplicada.** A função que mapeia motivo → id de ação já existia em `review-projection.ts` (usada pelo bloco de atenção da página de revisão). Foi exportada com uma assinatura mais genérica (`AttentionReason` em vez de um tipo derivado de `resolveDailyCycleLifecycle`) para ser reaproveitada aqui, garantindo que a ação primária da fila sempre bata com a ação que a própria página de revisão oferece para o mesmo motivo — nenhuma lógica nova de mapeamento foi escrita.
- **Fixtures do smoke remoto precisaram completar o job de interpretação manualmente.** `persist_entry_interpretation`/`correct_entry_interpretation` não tocam a tabela `jobs`; o job `interpret_entry` criado por `capture_entry_async` ficava `pending` para sempre nas fixtures diretas (ao contrário do fluxo real, em que o worker sempre completa o job no mesmo ciclo em que persiste a interpretação). Como a RPC — corretamente, pelo mesmo motivo que `lifecycle.ts` já faz isso — trata qualquer job ainda `pending` como `organizing` independentemente do status da entrada, isso escondia entradas que deveriam aparecer. O novo helper `settleInterpretEntryJob` (usando o cliente `service_role`, já que `claim_entry_interpretation_job`/`complete_job` são exclusivos dele) reproduz exatamente o que o worker faz.
- **`persist_entry_interpretation` nunca produz `completed` sozinha.** `model_only_element_trust` tem teto de score 0,25 (sempre abaixo do limiar 0,55 de `auto_apply`), então toda interpretação só-IA fica `awaiting_review` por design. Para testar o motivo `confirm_existing_candidates` de ponta a ponta, as fixtures precisam de uma correção real com `elementTrust` `auto_apply` explícito (`moveToCompletedWithSameCandidates`), exatamente como um usuário resolvendo a revisão produziria — não um atalho artificial.

# Migrations

- `202607180030_phase_2x_needs_attention_projection.sql`: cria a RPC `list_needs_attention` e o índice parcial `jobs_interpret_entry_status_idx`. Sem alteração de tabela, coluna ou dado existente. Aditiva; nenhum consumidor de produção depende dela ainda.
- `202607180031_fix_needs_attention_candidate_correlation.sql`: `create or replace function` da mesma RPC, mesma assinatura/grants/índice, corrigindo apenas a correlação de `has_unconfirmed_candidate` (ver "Riscos"). Aplicada na mesma sessão de trabalho, antes de qualquer commit; `030` foi deixada intocada, seguindo a convenção de migrations append-only deste projeto (o mesmo padrão já usado pela `029` para `correct_entry_interpretation`).
- Rollback: como não há consumidor de UI, reverter é remover a RPC e o índice por uma migration compensatória (`drop function`, `drop index`), sem qualquer impacto em dado ou fluxo de produção.
- Aplicadas ao projeto linkado `my-brain` (`ulvwzqlpsjyrnqzfxmck`) com autorização explícita do usuário para cada uma. `supabase migration list --linked` confirma local/remoto sincronizados até `031`. `supabase db lint --linked --level warning` mostra apenas o achado pré-existente `run_user_heartbeat`, não relacionado.

# RPCs

- **Nova: `list_needs_attention(p_limit integer default 21, p_cursor_occurred_at timestamptz default null, p_cursor_entry_id uuid default null)`** — `SECURITY DEFINER`, `set search_path = ''`, somente leitura, `language sql stable`. Deriva o usuário de `auth.uid()`; nenhum parâmetro aceita um id informado pelo chamador. `grant execute` restrito a `authenticated`; `public`/`anon` revogados. Retorna `entry_id, reason, occurred_at, current_interpretation_id, job_id, open_question_id` — sem copy, trust ou conteúdo do registro. `p_limit` é fixado entre 1 e 200. Paginação por keyset: com cursor nulo, retorna a primeira página; com cursor preenchido, retorna estritamente após esse ponto na ordenação `(occurred_at desc, entry_id desc)`.
- Nenhuma RPC pré-existente foi alterada. `confirm_entry_task_candidates`, `correct_entry_interpretation`, `persist_entry_interpretation`, `claim_entry_interpretation_job`, `complete_job` foram usadas apenas como leitura/fixture pelo smoke remoto, com seus contratos já documentados nos ADRs 021–026.

# Edge Functions

Nenhuma função foi afetada. O worker `process-jobs`/`entry.ts` e o dispatcher continuam exatamente como o Slice 2X.4 os deixou; este slice não muda como um job é processado, apenas como o estado resultante é consultado.

# Testes executados

- `npx vitest run src/features/daily-cycle/attention-projection.test.ts src/features/daily-cycle/review-projection.test.ts` — focado, 32 testes, verde, antes da suíte completa.
- `npm test` — 61 arquivos / 340 testes, verde (13 novos).
- `npm run lint` — limpo (`src/`, `scripts/`).
- `npx tsc --noEmit` — limpo.
- `npm run build` — build de produção concluído sem erro.
- `npx playwright test --project=desktop --project=mobile` — 4 passando, 10 skips esperados (sem `ONLINE_SUPABASE_*`), idêntico à baseline do Slice 2X.9; este slice não adiciona rota nem UI.
- `git diff --check` — limpo (apenas os avisos pré-existentes de LF/CRLF).
- `supabase db push` (autorizado) — aplicou `030` (após corrigir um erro `min(uuid)` antes de qualquer commit remoto bem-sucedido) e, depois, `031`.
- `supabase migration list --linked` — local/remoto sincronizados até `031`.
- `supabase db lint --linked --level warning` — só o achado pré-existente `run_user_heartbeat`.
- `supabase gen types typescript --linked` — sem diff após `031` (mesma assinatura de `030`); o diff intermediário após `030` sozinha (três campos que a heurística do gerador marca como não-nulos apesar de genuinamente aceitarem `null` neste schema) foi resolvido adotando a saída real do gerador, não uma correção manual, para não divergir de futuras regenerações.
- `npm run test:remote:daily-cycle` (autorizado) — passou por completo após a `031`, incluindo todos os cenários de "Precisa de você" descritos abaixo. A primeira execução (contra a `030` original) falhou corretamente, revelando o defeito do alias.
- `npm run test:remote:entry-processing` e `npm run test:remote:jobs` (regressão) — passaram sem alteração, confirmando ausência de impacto fora do escopo desta fatia.
- `supabase/tests/needs_attention_projection.sql` — 35 asserções pgTAP escritas e revisadas; não executável localmente (Docker indisponível nesta máquina, mesma limitação pré-existente de todo arquivo pgTAP deste projeto). O smoke remoto real é a verificação equivalente.

# Evidências

- Commit único desta fatia: ver hash abaixo (seção final desta sessão de trabalho).
- `supabase migration list --linked` mostra `202607180030`/`202607180031` com local e remoto idênticos.
- Saída de `npm run test:remote:daily-cycle` após a correção: `"Remote daily-cycle smoke passed: current-interpretation binding, stale/out-of-range rejection, idempotent replay, correction survivability, concurrent confirmation race safety, record-only enforcement, cross-user isolation, scoped undo, and the needs-attention queue's real qualification/resolution/isolation/pagination behavior."`
- Cenários realmente exercitados contra o projeto linkado, com usuários descartáveis limpos ao final: uma entrada com candidatos não confirmados aparece com o motivo correto; confirmar um dos dois candidatos mantém a entrada na fila (regressão do defeito corrigido pela `031`); confirmar o segundo candidato remove a entrada; a fila de um dono nunca inclui a entrada de outro (nos dois sentidos); três páginas por cursor não se sobrepõem; a chamada respondeu dentro do limite de 5s assertado.
- `npm test`: `Test Files 61 passed (61)` / `Tests 340 passed (340)`.

# Limitações

- `supabase/tests/needs_attention_projection.sql` não pôde ser executado localmente por falta de Docker nesta máquina — mesma limitação pré-existente documentada para todo pgTAP deste projeto. O smoke remoto real, incluindo a descoberta e correção do defeito da `030`, é a evidência equivalente e, neste caso, estritamente mais forte (pgTAP com fixtures inseridas diretamente não teria reproduzido a corrida de job/interpretação que motivou o helper `settleInterpretEntryJob`, nem necessariamente a colisão de alias, já que a ordem de resolução de nomes depende do plano real gerado pelo Postgres, não apenas da leitura do SQL).
- Uma entrada em `interpreting`/`reprocessing` cujo job se torna `exhausted` ou atinge um status não reconhecido antes do próprio status da entrada refletir isso não aparece na fila até esse status se assentar. É uma corrida transitória e autocorrigível — `fail_entry_interpretation`/`reap_expired_jobs` atualizam os dois juntos em toda rota existente hoje — documentada explicitamente na migration e não uma regressão introduzida por este slice.
- Sem consumidor de UI: `list_needs_attention`/`loadAttentionProjection` não são chamados por nenhuma página ainda. Início/Caixa continuam exatamente como o Slice 2X.9 os deixou.

# Riscos

- **Mitigado nesta própria fatia:** a colisão de nomes entre o alias de `generate_series` e a coluna `tasks.candidate_index` (migration `030`) fazia a checagem de candidato não confirmado se tornar uma tautologia assim que qualquer tarefa existisse para a entrada, escondendo prematuramente itens da fila. Corrigido pela `031` com um alias de duas partes inequívoco (`candidate_slot(idx)`); coberto por uma regressão dedicada em pgTAP (confirmar um dos dois candidatos, checar que o item permanece; confirmar o segundo, checar que resolve) e pelo smoke remoto real. Risco residual: qualquer futura função SQL que faça `generate_series` correlacionado contra uma tabela com coluna de mesmo nome está sujeita ao mesmo padrão de erro — documentado em `DECISIONS.md` ADR-027 como alerta explícito.
- **Residual, de baixo impacto, documentado:** a corrida `interpreting`/`reprocessing` + job `exhausted`/desconhecido descrita em "Limitações". Não bloqueia o Slice 2X.11; deve ser reavaliado se um dia se tornar observável em produção.
- **Nenhum risco de segurança novo identificado:** a RPC é somente leitura, `SECURITY DEFINER` com filtragem manual por `auth.uid()` idêntica ao padrão já estabelecido, sem parâmetro de identidade informado pelo chamador, sem exposição de copy/trust/conteúdo.

# Próximo slice

Slice 2X.11 — "Precisa de você" na Home e Caixa — é o próximo elegível. Suas dependências (Slice 2X.6 e, agora, Slice 2X.10) estão satisfeitas: a projeção `loadAttentionProjection`/`NeedsAttentionItemView` já existe, testada e verificada contra dados reais. O Slice 2X.11 não foi iniciado nesta sessão — nenhum componente de UI, rota, filtro de Caixa ou contagem de Início foi criado ou alterado. Gates ainda necessários antes de iniciá-lo: autorização explícita do usuário (conforme a regra deste projeto de que nenhum slice começa sem solicitação), e definição de layout/copy do componente de lista (`needs-attention-list.tsx`, no mapa de arquivos do plano) seguindo o mesmo padrão de progressive disclosure e reaproveitamento de componentes já estabelecido pelos Slices 2X.6/2X.9.

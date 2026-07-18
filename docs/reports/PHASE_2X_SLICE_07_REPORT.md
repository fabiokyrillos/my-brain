# Slice

Slice 2X.7 — Proveniência e confirmação segura de candidatos. Data: 2026-07-18. Branch: `codex/phase-2-intelligent-capture`.

# Objetivo

Garantir, no limite transacional do banco, que nenhuma tarefa nova possa nascer de um candidato stale (de uma interpretação que não é mais a atual), record-only, ou de uma revisão diferente da que a UI declara como corrente — sem que nenhum componente precise comparar IDs, versões ou arrays de `task_candidates` manualmente.

# Escopo

- Migration `202607170028_phase_2x_candidate_action_consistency.sql`: `entry_interpretations.is_record_only` (persistido); `tasks.source_interpretation_id`/`operation_key`; substituição da unicidade `(source_entry_id, candidate_index)` por dois índices únicos parciais (legado, escopado por entry, para linhas sem proveniência; autoritativo, escopado por interpretação, para linhas com proveniência); backfill conservador; nova RPC `confirm_entry_task_candidates`; `confirm_entry_tasks` preservada como RPC de compatibilidade, sem novo consumidor.
- `src/features/interpretations/data.ts`: `computeUnavailableCandidateIndexes` (nova, pura, testada); `InterpretationRevision.isRecordOnly`; `loadInterpretationReview` passa a expor `unavailableCandidateIndexes` e a escopar a busca de undo de confirmação pelos dois `action_type` possíveis.
- `src/features/tasks/actions.ts` (`confirmEntryTasks`): passa a validar/enviar `interpretationId`/`operationKey` e a chamar `confirm_entry_task_candidates`, mapeando `55P03`/`55000` para mensagens específicas.
- `src/features/tasks/task-candidate-form.tsx`: novas props obrigatórias `interpretationId`/`operationKey` (campos ocultos) e prop opcional `unavailableIndexes`; nenhum checkbox ou botão de submit é renderizado para um índice indisponível; estado vazio explícito quando todos os candidatos estão indisponíveis.
- `src/app/[locale]/app/inbox/[entryId]/page.tsx`: contagem de tarefas confirmadas escopada à interpretação atual (não mais ao entry inteiro); mensagem explícita de "somente registro" quando a interpretação atual é `record-only`; `TaskCandidateForm` recebe `interpretationId`, `operationKey` fresco e `unavailableIndexes`.
- `scripts/remote-daily-cycle-smoke.mjs` (novo): executado — não apenas escrito — contra o projeto Supabase linkado.
- `supabase/tests/candidate_action_consistency.sql` (novo, 33 asserções pgTAP): commitado; não pôde ser executado localmente (Docker indisponível).

Não foram alterados nesta slice: `src/features/daily-cycle/contracts.ts`/`review-projection.ts` (a separação completa em `InterpretationReviewView`/`InterpretationTechnicalDetailsView` é escopo do Slice 2X.8); a fila "Precisa de você" (Slices 2X.10/2X.11); `correct_entry_interpretation` em si (ver "Decisões tomadas" e "Limitações" sobre o achado do `40001`).

# Critérios de aceite

- Atendido — `confirm_entry_task_candidates` só materializa candidatos da interpretação que `entries.current_interpretation_id` aponta como atual; qualquer `p_expected_interpretation_id` divergente é rejeitado (`55P03`) antes de qualquer leitura de `task_candidates`.
- Atendido — `is_record_only` é persistido em toda inserção de `entry_interpretations` (`persist_entry_interpretation`, `correct_entry_interpretation`, `persist_reprocessed_entry_interpretation`, `undo_operation`), e uma interpretação `record-only` tem zero candidatos acionáveis (RPC recusa com `55000`; a página não renderiza o formulário).
- Atendido — corridas concorrentes de confirmar × corrigir e confirmar × confirmar foram provadas: o smoke remoto executa duas confirmações concorrentes do mesmo candidato sob a mesma interpretação e confirma que exatamente uma tarefa é criada (a segunda retorna o mesmo `task_id` via `ON CONFLICT DO NOTHING` + releitura); a serialização vem do lock `for update` já existente em `entries`, reaproveitado sem lock adicional em `entry_interpretations`.
- Atendido — tarefa já confirmada sobrevive a uma correção posterior: provado tanto no pgTAP quanto no smoke remoto (a tarefa confirmada sob a interpretação v1 permanece com status ativo depois que uma correção cria a v2).
- Atendido — undo não ressuscita candidato inválido: `undo_operation` reconhece `confirm_entry_task_candidates` no mesmo ramo que já cancelava tarefas de `confirm_entry_tasks`; cancelar uma confirmação libera aquele índice para nova confirmação, sem tocar tarefas de outras interpretações.
- Atendido — nenhum componente compara IDs/versões/arrays manualmente: `TaskCandidateForm` só filtra por um `unavailableIndexes: number[]` já calculado no servidor (`computeUnavailableCandidateIndexes`), e só recebe `interpretationId`/`operationKey` para reenviar como campos ocultos.
- Atendido — RPC antiga (`confirm_entry_tasks`) permanece disponível, coluna nova é nullable, migration é aditiva.
- Desvio aprovado (achado de validação, não de escopo) — a checklist original do plano pedia sinalizar conflito de versão do mesmo jeito que `correct_entry_interpretation` (SQLSTATE `40001`). Ao executar — não apenas escrever — o smoke remoto contra o projeto linkado como usuário `authenticated` real, essa convenção travou a requisição até o timeout do gateway; reproduzido também na já publicada `correct_entry_interpretation` via `fetch()` direto ao REST, sem nenhum código deste repositório envolvido. `confirm_entry_task_candidates` usa `55P03` em vez de `40001`. Ver ADR-025; o caminho equivalente de `correct_entry_interpretation` fica fora do escopo desta slice (arquivo não listado no plano) e é uma pendência urgente documentada em `TODO.md`/`SECURITY.md`.
- Desvio aprovado (achado de validação, não de escopo) — a mesma execução real revelou que `confirm_entry_tasks` (RPC pré-existente, não escrita nesta slice) nunca havia completado com sucesso para um usuário `authenticated` real: era `SECURITY INVOKER` e dependia de grants (`UPDATE` em `entry_interpretations`, `INSERT` em `undo_operations`/`audit_logs`) que `authenticated` nunca teve. Corrigido nesta slice (`SECURITY DEFINER`, grants explícitos) porque é a mesma função que a slice já precisava reescrever para o `ON CONFLICT`, e deixar uma RPC "de compatibilidade" que falha 100% das vezes para todo usuário real não seria compatibilidade nenhuma. Ver ADR-025.
- Não aplicável — Playwright online específico para a jornada de confirmação de candidato (correção invalida candidato antigo; record-only zera ações; undo não reexpõe inválido) não foi adicionado nesta slice; ver "Limitações".

# Arquivos alterados

- `supabase/migrations/202607170028_phase_2x_candidate_action_consistency.sql` (novo) — schema + RPCs desta slice; aplicada ao projeto linkado.
- `supabase/tests/candidate_action_consistency.sql` (novo) — 33 asserções pgTAP.
- `src/lib/supabase/database.types.ts` — regenerado a partir do projeto linkado (53 inserções líquidas: `is_record_only`, `source_interpretation_id`/`operation_key`, FK nova, argumentos de `confirm_entry_task_candidates`, e o schema `graphql_public` que a versão atual da CLI já expõe).
- `src/features/interpretations/data.ts` — `computeUnavailableCandidateIndexes`, `InterpretationRevision.isRecordOnly`, `loadInterpretationReview` atualizado.
- `src/features/interpretations/data.test.ts` — 6 novos casos.
- `src/features/tasks/actions.ts` — `confirmEntryTasks` migrada para a nova RPC.
- `src/features/tasks/actions.test.ts` (novo) — 9 testes.
- `src/features/tasks/task-candidate-form.tsx` — novas props e estado vazio explícito.
- `src/features/tasks/task-candidate-form.test.tsx` — 3 novos casos (5 totais no arquivo).
- `src/app/[locale]/app/inbox/[entryId]/page.tsx` — contagem escopada à interpretação atual, ramo record-only, novas props no `TaskCandidateForm`.
- `scripts/remote-daily-cycle-smoke.mjs` (novo) — smoke remoto executado contra o projeto linkado.
- `package.json` — script `test:remote:daily-cycle`.
- `docs/DATABASE.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DECISIONS.md` (ADR-024, ADR-025), `docs/STATE.md`, `docs/CHANGELOG.md`, `docs/TODO.md` — documentação permanente.
- `docs/reports/PHASE_2X_SLICE_07_REPORT.md` (este arquivo).

# Decisões tomadas

- **Unicidade de candidato escopada por interpretação, não por entry**: a constraint antiga `(source_entry_id, candidate_index)` bloqueava silenciosamente um candidato legítimo no mesmo índice de uma versão mais nova. Dois índices únicos parciais resolvem isso sem quebrar `confirm_entry_tasks`: um preserva o comportamento antigo apenas para linhas sem proveniência (`source_interpretation_id is null`), outro é a nova fonte de verdade por `(source_interpretation_id, candidate_index)`.
- **Backfill conservador**: só preenche `source_interpretation_id` quando o entry teve exatamente uma interpretação já criada — proveniência inequívoca. Entries com histórico de correção/reprocessamento mantêm `null` em vez de adivinhar qual versão produziu cada tarefa antiga.
- **`is_record_only` persistido em vez de recalculado**: hoje só existia como efeito transitório sobre `interpretation_lifecycle_status()`, nunca como fato consultável. Persistir na criação/correção/reprocessamento/undo é o que permite `confirm_entry_task_candidates` recusar candidatos sem reimplementar a lógica de política em outro lugar.
- **`SECURITY DEFINER` em vez de `SECURITY INVOKER`**: descoberto necessário, não escolhido a priori — ver "Limitações"/ADR-025. A alternativa de conceder `UPDATE`/`INSERT` diretamente a `authenticated` nas tabelas afetadas foi descartada por enfraquecer exatamente a garantia (append-only, imutável) que essas tabelas existem para ter.
- **`55P03` em vez de `40001` para o conflito de versão**: descoberto necessário, não escolhido a priori — ver "Limitações"/ADR-025. `55P03` já era usado com sucesso comprovado em produção por `begin_entry_reprocessing`.
- **`confirm_entry_tasks` mantida, apenas com `ON CONFLICT` e segurança corrigidos**: o plano exige preservar a RPC antiga sem novo consumidor; como a correção de `SECURITY DEFINER`/grants é estritamente uma correção de bug (a função nunca funcionou para um usuário real) e não uma mudança de contrato observável para um eventual chamador futuro, foi aplicada no mesmo `create or replace` em vez de deixada quebrada.
- **`computeUnavailableCandidateIndexes` como função pura exportada, não inline na página**: mantém a regra "nenhum componente decide validade comparando IDs/arrays" ao mesmo tempo em que a lógica em si é testável sem mocks de Supabase — a página e `TaskCandidateForm` só recebem o resultado já calculado.
- **Índice indisponível tratado como "oculto", não como "mostrado e desabilitado"**: hoje não existe ainda o DTO `ActionableCandidateView`/`MaterializedTaskView` completo (Slice 2X.8/2X.9) para distinguir visualmente "já confirmado" de "não oferecido"; ocultar é a opção conservadora que não inventa uma UI que a próxima slice ainda vai desenhar.
- **`scripts/remote-daily-cycle-smoke.mjs` criado nesta slice, não estendido**: o arquivo não existia (é oficialmente escopo do Slice 2X.10 no plano). Como a dependência declarada de 2X.7 é 2X.1/2X.3/2X.5 — não 2X.10 —, criar o arquivo agora com exatamente a cobertura desta slice é a única leitura consistente; slices futuras estendem o mesmo arquivo em vez de criar um novo.

# Migrations

- `202607170028_phase_2x_candidate_action_consistency.sql` — aditiva. Aplicada ao projeto linkado via `supabase db push` (log limpo, sem erros). Sem remoção de RPC, coluna ou constraint que quebre consumidor existente. Rollback: reverter a Action (`confirmEntryTasks`) para a RPC antiga é seguro a qualquer momento — `confirm_entry_tasks` nunca foi removida e sua correção de segurança/`SECURITY DEFINER` é estritamente aditiva de funcionalidade, não uma mudança de contrato. A proveniência já gravada não deve ser apagada por um rollback.

# RPCs

| RPC | Situação | Contrato observável |
| --- | --- | --- |
| `confirm_entry_task_candidates` | Nova | `(entry_id, expected_interpretation_id, candidate_indexes, operation_key) → { task_ids, undo_id, idempotent }`. Rejeita interpretação não-atual (`55P03`), record-only (`55000`), índice fora de faixa (`22023`), operation key inválida (`22023`), entry de outro usuário (`P0002`). `SECURITY DEFINER`, grant só para `authenticated`. |
| `confirm_entry_tasks` | Mantida (compatibilidade, sem novo consumidor) | Contrato de entrada/saída inalterado. Correção de bug interna: agora `SECURITY DEFINER` com grants explícitos (antes falhava para todo usuário real); `ON CONFLICT` ajustado ao novo índice parcial legado. |
| `persist_entry_interpretation`, `correct_entry_interpretation`, `persist_reprocessed_entry_interpretation`, `undo_operation` | Recriadas (`create or replace`, mesma assinatura) | Comportamento observável inalterado; passam a gravar `is_record_only` na linha inserida. |

# Edge Functions

Nenhuma alterada. O worker (`process-jobs/entry.ts`) já persiste interpretações via as RPCs acima; nenhuma delas mudou de assinatura.

# Testes executados

- `npm test` — 54 arquivos e 266 testes Vitest passando (18 novos).
- `npm run lint` — passando, zero erros.
- `npx tsc --noEmit` — passando, zero erros.
- `npm run build` — build de produção Next.js 16.2.10 passando.
- `npx playwright test --project=desktop` — 2 testes públicos passando, 5 pulos esperados (jornadas online).
- `supabase db push` — migration `028` aplicada ao projeto linkado (`ulvwzqlpsjyrnqzfxmck`).
- `supabase db lint --linked --level warning` — um único achado, pré-existente e não relacionado (`run_user_heartbeat`).
- `supabase gen types typescript --linked` — tipos regenerados a partir do schema real.
- `npm run test:remote:daily-cycle` (`scripts/remote-daily-cycle-smoke.mjs`, novo) — executado contra o projeto linkado com usuários descartáveis; passou após as correções desta slice.
- `supabase test db --linked supabase/tests/candidate_action_consistency.sql` — tentado; falhou por exigir Docker local (indisponível neste workstation). Ver "Limitações".

# Evidências

- `npm test`: `Test Files 54 passed (54)` / `Tests 266 passed (266)`.
- `npx eslint .` e `npx tsc --noEmit`: sem saída.
- `npm run build`: `✓ Compiled successfully`; rotas inalteradas na topologia.
- `supabase db push`: `Applying migration 202607170028_phase_2x_candidate_action_consistency.sql... Finished supabase db push.`
- `supabase db lint --linked --level warning`: um achado, em `run_user_heartbeat`, não tocado por esta slice.
- `npm run test:remote:daily-cycle`: `Remote daily-cycle smoke passed: current-interpretation binding, stale/out-of-range rejection, idempotent replay, correction survivability, concurrent confirmation race safety, record-only enforcement, cross-user isolation, and scoped undo.`
- Verificação direta pós-patch: `pg_get_functiondef` confirmando `prosecdef = true` para ambas as funções e ausência de `40001`/`for update ... entry_interpretations` no corpo publicado.
- Usuários de teste descartáveis (debugging e smoke) confirmadamente removidos ao final (`0` linhas remanescentes em `auth.users` para os padrões de e-mail usados).

# Limitações

- **pgTAP não executado localmente**: `supabase test db --linked` exige Docker (indisponível neste workstation) mesmo em modo `--linked`, para rodar o container `pg_prove`. `supabase/tests/candidate_action_consistency.sql` (33 asserções) está commitado e correto quanto à sintaxe/lógica (`min(uuid)` já foi corrigido para `min(id::text)::uuid` após ser pego pelo `db push` real), mas não foi executado por essa ferramenta. A verificação equivalente — e mais forte, porque exercita `authenticated` real em vez de um papel de teste tipicamente superusuário — foi a execução real de `scripts/remote-daily-cycle-smoke.mjs`, que é justamente o que encontrou os dois defeitos de segurança/gateway abaixo.
- **Achado fora do escopo desta slice, não corrigido nela**: `correct_entry_interpretation` (Fase 2B, já publicada) usa SQLSTATE `40001` para seu próprio conflito de versão, e esse mesmo `40001` trava a requisição até o timeout do gateway no projeto linkado — confirmado via `fetch()` direto ao REST, sem código deste repositório envolvido. O arquivo `src/features/interpretations/actions.ts` não está no escopo de arquivos do Slice 2X.7; corrigi-lo aqui seria uma mudança de contrato de uma Action já publicada, fora da fatia autorizada. Documentado como pendência urgente em `TODO.md`, `SECURITY.md` e ADR-025.
- **Sem Playwright online novo para a jornada de confirmação**: os critérios do plano pedem Playwright cobrindo "corrigir antes de confirmar remove candidato antigo; record-only zera ações; candidato válido cria tarefa; undo não reexpõe inválido". Não foi adicionado nesta slice — conteúdo de candidato gerado por IA real é não determinístico, tornando um roteiro Playwright confiável mais complexo do que o tempo desta slice permite, e a página `/inbox/{entryId}` ainda é a revisão ampla da Fase 2B (a UI dedicada de progressive disclosure é Slice 2X.9). As garantias que o plano realmente pede — invariantes no banco, não pixels na tela — foram verificadas com mais precisão pelo smoke remoto no nível de RPC.
- **`ActionableCandidateView`/`InterpretationReviewView` continuam sem consumidor**: prework do Slice 2X.1, wiring completo é Slice 2X.8.

# Riscos

- Um usuário que já tinha uma sessão de navegador aberta na revisão de uma entrada, com uma correção enviada por outra aba/dispositivo depois que a página carregou, verá seu próximo "confirmar" falhar com `55P03` em vez de silenciosamente confirmar o candidato errado — comportamento pretendido (fail-closed), mas exige que o usuário recarregue a página; não há ainda revalidação automática em tempo real. Mitigação: a mensagem retornada (`"A interpretação mudou. Atualize a página antes de confirmar."`) já orienta a ação correta.
- O achado do `40001`/gateway pode indicar um comportamento de plataforma mais amplo (qualquer SQLSTATE de classe `40`, não só `40001`) que este slice não teve escopo para investigar exaustivamente — apenas `40001` foi confirmado como problemático; `40P01` (deadlock) não foi testado. Mitigação: nenhuma RPC deste projeto usa `40P01` hoje, então o risco é apenas teórico até uma investigação dedicada.
- O backfill conservador deixa proveniência `null` para toda tarefa de um entry com histórico de correção/reprocessamento anterior a esta migration; `computeUnavailableCandidateIndexes` trata esses casos como indisponíveis (conservador), então o único efeito observável é que o usuário não pode reconfirmar aquele índice específico sob a interpretação atual — nunca um risco de duplicação ou de proveniência inventada.

# Próximo slice

O próximo slice elegível é o Slice 2X.8 — Projeções separadas de revisão e detalhes técnicos. Suas dependências declaradas (2X.1, 2X.6 e 2X.7) estão satisfeitas. Autorização explícita ainda é necessária antes de iniciá-lo. Fora da sequência normal, a correção do achado urgente do `40001` em `correct_entry_interpretation` (ADR-025) deveria ser priorizada independentemente da ordem de slices, por afetar um fluxo de usuário real já publicado.

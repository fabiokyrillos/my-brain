# Slice

Slice 2X.3 — Contrato atômico de captura e jobs de entrada. Data: 2026-07-17. Branch: `codex/phase-2-intelligent-capture`.

# Objetivo

Entregar o contrato de banco que persiste captura e enfileiramento de interpretação de forma atômica, idempotente e owner-scoped, sem mudar a UI atual nem iniciar worker ou dispatch.

# Escopo

- Migration `025` com payload mínimo para jobs `interpret_entry`, índices e uma única job ativa por entry.
- RPCs autenticadas de captura e enqueue de reprocessamento, com recibos sanitizados, idempotência e auditoria.
- Claims exclusivamente service-role por ID e próximo job elegível, protegidos por tipo, payload, ownership, lease, attempts e `SKIP LOCKED`.
- Tipos Supabase regenerados, contrato pgTAP e smoke remoto descartável.
- Reconciliação documental: o commit histórico `9f0c1e6` de Product Projections é preservado como prework e não é creditado como este slice oficial.

Não foram alterados UI, rotas, componentes, Server Actions existentes, Edge Functions, worker, dispatch, telemetria, projeções nem o fluxo síncrono atual de captura/reprocessamento.

# Critérios de aceite

- Atendido — `capture_entry_async` exige usuário autenticado, cria entry `saved` e job `interpret_entry` na mesma transação, usa idempotência por usuário e retorna somente `entry_id`, status e indicação de replay.
- Atendido — o payload inicial contém somente `entry_id` e `mode: initial`; reprocessamento usa `mode: reprocess` e operation key validada, sem conteúdo original, saída de IA ou detalhes internos.
- Atendido — `enqueue_entry_reprocessing` exige ownership, é idempotente, bloqueia job ativo concorrente e não modifica estado, revisão ou interpretação corrente da entry.
- Atendido — claims de entrada são restritos a `service_role`, validam payload/type/ownership, respeitam retry/attempts/lease e usam `FOR UPDATE SKIP LOCKED`.
- Atendido — wrappers e payloads de anexo, `complete_job`, `fail_job` e `reap_expired_jobs` permaneceram compatíveis; o smoke remoto exerceu stale worker e recuperação pelo reaper contra jobs de entrada.
- Atendido — migration `025` está aplicada e sincronizada, os tipos foram gerados e o lint remoto não encontrou erros.
- Atendido com limitação externa — o contrato pgTAP foi criado, mas não executou neste workstation porque Docker Desktop não está disponível.
- Atendido — nenhum worker, dispatch, Edge Function, UI ou mudança de rota do Slice 2X.4 foi iniciado.

# Arquivos alterados

- `supabase/migrations/202607170025_phase_2x_entry_processing_jobs.sql` — contrato de payload, índices, RPCs, grants e claims de jobs de entrada.
- `supabase/tests/entry_processing_jobs.sql` — especificação pgTAP para atomicidade, rollback, idempotência, ownership, payload, lease, retry, stale worker, reaper e compatibilidade de anexo.
- `src/lib/supabase/database.types.ts` — tipos gerados a partir do schema remoto com as quatro RPCs novas.
- `scripts/remote-entry-processing-smoke.mjs` — smoke descartável dos contratos de banco contra o projeto vinculado.
- `package.json` — comando `test:remote:entry-processing`.
- `docs/reports/PHASE_2X_PROJECTIONS_PREWORK_REPORT.md` — relatório histórico de Product Projections renomeado/reclassificado como prework.
- `docs/reports/PHASE_2X_SLICE_03_REPORT.md` — este relatório do slice oficial.
- `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md` — contrato, limites, reconciliação e estado permanente.

# Decisões tomadas

- Reutilizar a tabela `jobs` e as transições de lease existentes em vez de introduzir plataforma ou tabela de fila nova.
- Manter o contrato inicial estritamente durável: captura cria somente entry + job e não chama IA, RPC externa ou Edge Function.
- Usar validação privada de payload na constraint, sem liberar a função privada como superfície pública; operações permitidas usam RPCs `SECURITY DEFINER`.
- Usar chave de captura por usuário e operation key apenas no payload de reprocessamento para separar replay de captura do comando explícito de reprocessar.
- Não modificar `process-jobs` nem o caminho de UI antes do Slice 2X.4 provar o worker e o dispatch.

# Migrations

`202607170025_phase_2x_entry_processing_jobs.sql` foi aplicada ao projeto Supabase vinculado e a lista local/remota está sincronizada até `025`.

A migration é aditiva: preserva `process_attachment`, wrappers de anexo e as transições existentes de completar, falhar e recuperar jobs. Um rollback isolado exige migration compensatória para remover as RPCs, índices e constraint novos; ela não deve apagar entries/jobs já persistidos pelo fluxo antigo.

# RPCs

- `capture_entry_async(p_original_content, p_locale, p_source, p_idempotency_key)` — authenticated; grava entry e job inicial atomicamente e retorna recibo sanitizado.
- `enqueue_entry_reprocessing(p_entry_id, p_operation_key)` — authenticated; exige entry owned, preserva a interpretação atual e retorna recibo sanitizado.
- `claim_entry_interpretation_job(p_job_id, p_user_id, p_worker_id, p_lease_seconds)` — somente service role; concede lease a job de entrada elegível.
- `claim_next_entry_interpretation_job(p_worker_id, p_lease_seconds)` — somente service role; seleciona o próximo job de entrada elegível com `SKIP LOCKED`.
- `claim_attachment_job`, `complete_job`, `fail_job` e `reap_expired_jobs` não foram modificadas e foram mantidas como contratos de compatibilidade.

# Edge Functions

Nenhuma Edge Function foi criada, alterada ou implantada. `process-jobs` não consome `interpret_entry` neste slice; worker e dispatch pertencem ao Slice 2X.4.

# Testes executados

- `node --check scripts/remote-entry-processing-smoke.mjs` — passou.
- `npm run test:remote:entry-processing` — passou contra dados e usuários descartáveis no projeto Supabase vinculado.
- `npx supabase migration list --linked` — passou com local/remoto sincronizados até `202607170025`.
- `npx supabase db lint --linked --level error` — passou sem erro de schema.
- `npx supabase test db --local supabase/tests/entry_processing_jobs.sql` — não executou: banco local indisponível na porta `54322`.
- `npx supabase test db --linked supabase/tests/entry_processing_jobs.sql` — não executou: Supabase CLI requer a imagem `pg_prove` via Docker Desktop, indisponível neste workstation.
- `npm test` — 47 arquivos e 204 testes Vitest passando.
- `npm run lint` — passando.
- `npm run typecheck` — passando.
- `npm run build` — build de produção Next.js 16.2.10 passando.
- `git diff --check` — passou sem erro após as alterações finais.

# Evidências

- Migration `025` aplicada pelo comando `npx supabase db push --linked` após dry-run, seguida de sincronização confirmada por `npx supabase migration list --linked`.
- Smoke remoto concluído com código de saída zero, cobrindo capture/replay, payload mínimo, negação de claim autenticado, claim concorrente, stale worker, retry, reaper, ownership e reprocessamento.
- Tipos foram regenerados diretamente do projeto vinculado e incluem as quatro RPCs do contrato.
- O histórico `9f0c1e61a0c3211937c750a79d00d22cad2da562` permanece preservado; apenas seu relatório/documentação foi reclassificado como prework.

# Limitações

- A UI continua usando o fluxo síncrono de captura/reprocessamento; as RPCs novas não possuem consumidor de produção ainda.
- Não existe worker nem dispatch para `interpret_entry`; jobs criados pelo novo contrato aguardam o Slice 2X.4.
- O pgTAP do slice não pôde ser executado neste workstation sem Docker Desktop, embora o smoke remoto tenha coberto os caminhos críticos contra o banco vinculado.

# Riscos

- Jobs `interpret_entry` podem permanecer pending até a implantação do worker; a UI atual não os cria, e o risco é limitado a fixtures/chamadas explícitas às novas RPCs. Mitigação: não fazer o corte de captura antes do Slice 2X.5 e do proof end-to-end.
- Mudanças futuras no payload devem atualizar a constraint, RPCs, tipos, pgTAP e smoke na mesma alteração. Mitigação: payload mínimo validado e fail-closed.
- O reprocessamento assíncrono futuro precisa coordenar seu job com a semântica de revisão imutável existente. Mitigação: este slice não modifica a interpretação corrente; o worker deverá usar os contratos de reprocessamento já existentes.

# Próximo slice

O próximo slice elegível é o Slice 2X.4 — Worker de interpretação e dispatch automático. As dependências de contratos, jobs, claims e tipos estão satisfeitas. Ainda serão necessários testes de Edge Function/dispatch, smoke remoto de execução ponta a ponta, gates globais e uma autorização explícita antes de iniciá-lo.

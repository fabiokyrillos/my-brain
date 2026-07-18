# Hotfix

Correção de conflito de correção sem timeout de gateway. Data: 2026-07-18. Branch: `codex/phase-2-intelligent-capture`. Fora da sequência de slices — não é Slice 2X.8.

# Objetivo

Eliminar o travamento até timeout de gateway no caminho de conflito de versão de `correct_entry_interpretation` (Fase 2B, já publicada), preservando assinatura, autorização, concorrência otimista, transacionalidade e toda semântica de validação/persistência existente.

# Escopo

- Migration `202607180029_fix_correction_conflict_gateway_timeout.sql`: `create or replace` de `correct_entry_interpretation` com a mesma assinatura `(uuid, integer, jsonb, text, text)`; única mudança comportamental é o SQLSTATE do `raise exception` de conflito de versão (`40001` → `55P03`). Inclui verificação pós-deploy que inspeciona a atribuição literal `errcode = '40001'`/`errcode = '55P03'` no corpo publicado da função.
- `src/features/interpretations/actions.ts` (`correctInterpretation`): a checagem `error.code === "40001"` passa a ser `error.code === "55P03"`; o fallback por conteúdo de mensagem (`/version|concurrent/i`) permanece inalterado.
- `src/features/interpretations/actions.test.ts`: novo caso cobrindo o mapeamento de `55P03` para a mensagem localizada de recarregar/tentar novamente.
- `supabase/tests/interpretation_revisions.sql`: duas novas asserções pgTAP (plano elevado de 44 para 46).
- `scripts/remote-interpretation-revisions-smoke.mjs`: a corrida concorrente já existente ganhou medição de tempo decorrido, checagem do SQLSTATE `55P03`, contagem de linhas de interpretação antes/depois da corrida (prova de não escrita parcial) e checagem de que o ponteiro de interpretação atual não foi sobrescrito pela correção perdedora.
- `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/DECISIONS.md` (ADR-026), `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md` — documentação permanente.

Não alterado nesta correção: qualquer funcionalidade do Slice 2X.8; `undo_operation` (mantém seu próprio `40001` distinto); `confirm_entry_task_candidates`, `confirm_entry_tasks`, ou qualquer outra RPC; `database.types.ts` (assinatura preservada, regeneração não produziu diff real).

# Critérios de aceite

- Atendido — assinatura de `correct_entry_interpretation` preservada (`uuid, integer, jsonb, text, text`); nenhum chamador precisou mudar contrato de entrada/saída.
- Atendido — todo comportamento de sucesso preservado: replay idempotente por `operation_key`, validação de patch/entity-links, cálculo de `lifecycle_status`, persistência de `is_record_only` (migration `028`), inserts de `entry_entities`/`pending_questions`, atualização de `entries`, `undo_operations` e `audit_logs` — corpo copiado linha a linha da definição autoritativa anterior (migration `028`), exceto o SQLSTATE do conflito.
- Atendido — checagens de ownership preservadas (`current_user_id = auth.uid()`, `where user_id = current_user_id` em toda leitura/escrita, validação de `entity_is_owned` para entity links).
- Atendido — proteção de concorrência otimista preservada: a comparação `current_interpretation.version <> p_expected_version` é idêntica; apenas o SQLSTATE levantado mudou.
- Atendido — transacionalidade preservada: nenhuma mudança de estrutura de controle, apenas o argumento `errcode` do `raise exception`.
- Atendido — apenas o comportamento de erro do conflito de versão foi alterado; nenhuma outra branch de erro (autenticação, validação de patch, entidade não pertencente ao dono, entry/interpretação não encontrada) foi tocada.
- Atendido — conflito não convertido em sucesso: a branch continua levantando exceção (agora `55P03`), nunca retornando um resultado de sucesso.
- Atendido — nenhum detalhe interno de banco exposto: a mensagem de usuário permanece "Interpretation changed; reload before saving" no banco e a mensagem localizada mapeada pela Action é inalterada.
- Atendido — nenhuma migration histórica aplicada foi editada; `202607180029` é estritamente aditiva (uma nova migration com `create or replace function`).
- Atendido — nenhuma RPC não relacionada foi alterada.
- Atendido — mapeamento de erro cliente/servidor atualizado no menor escopo possível: uma linha em `src/features/interpretations/actions.ts`.
- Atendido — prova remota autenticada real de resposta limitada no tempo: ~530ms, muito abaixo do timeout de gateway observado (~60s) na Fase 2B/Slice 2X.7.
- Desvio (achado durante a execução, corrigido antes da aplicação final) — a primeira tentativa de aplicar a migration falhou por um falso positivo na própria verificação pós-deploy: um comentário inline explicativo continha os dígitos `40001` literalmente, e `pg_get_functiondef` preserva o corpo da função PL/pgSQL como texto literal, incluindo comentários. A transação inteira (incluindo o `create or replace` correto) sofreu rollback automaticamente — confirmado via `supabase migration list --linked` mostrando a migration não aplicada no remoto após a falha, sem qualquer escrita parcial. Corrigido reescrevendo o comentário sem a sequência literal `40001` e tornando a verificação precisa (inspeciona `errcode = '40001'`/`errcode = '55P03'` como atribuição real, não uma busca por substring numérica arbitrária). Ver "Limitações".

# Arquivos alterados

- `supabase/migrations/202607180029_fix_correction_conflict_gateway_timeout.sql` (novo) — hotfix; aplicado ao projeto linkado.
- `supabase/tests/interpretation_revisions.sql` — duas novas asserções pgTAP; plano `44` → `46`.
- `src/features/interpretations/actions.ts` — uma linha alterada (`error.code === "55P03"`).
- `src/features/interpretations/actions.test.ts` — um novo caso de teste.
- `scripts/remote-interpretation-revisions-smoke.mjs` — corrida concorrente existente estendida com medição de tempo, checagem de SQLSTATE, contagem de linhas antes/depois e checagem do ponteiro de interpretação atual.
- `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/DECISIONS.md` (ADR-026), `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md` — documentação permanente.
- `docs/reports/PHASE_2X_CORRECTION_CONFLICT_HOTFIX_REPORT.md` (este arquivo).

# Decisões tomadas

- **`create or replace function` sob a mesma assinatura, corpo copiado verbatim**: evita qualquer risco de mudança de contrato para os chamadores existentes (`src/features/interpretations/actions.ts`) e minimiza a superfície de revisão a uma única linha semântica (o `errcode`).
- **`55P03` em vez de um novo código não usado no schema**: já validado rápido e correto em produção pela Slice 2X.7 (`begin_entry_reprocessing`, `confirm_entry_task_candidates`); ADR-025 já recomendava esse valor como o padrão a seguir para RPCs futuras. Reutilizá-lo aqui fecha exatamente a lacuna que ADR-025 deixou aberta.
- **Verificação pós-deploy corrigida para inspecionar a atribuição literal `errcode = '...'`, não uma substring numérica arbitrária**: a primeira tentativa (`position('40001' in pg_get_functiondef(...))`) confundiu um comentário explicativo com uma ocorrência real do SQLSTATE. A versão corrigida (`position('errcode = ''40001''' in definition)`) só pode ser acionada por uma atribuição real de `errcode`, tornando a verificação ao mesmo tempo mais precisa e mais difícil de burlar acidentalmente por texto não relacionado em qualquer lugar do corpo da função.
- **`undo_operation` não tocado**: seu próprio `40001` (`'Cannot undo after a newer interpretation revision'`) é um sinal de conflito distinto, em uma ação diferente (desfazer, não corrigir), e não estava no escopo autorizado deste hotfix (correção de uma única RPC nomeada, não uma varredura do schema). Registrado como risco residual explícito em `TODO.md`/`SECURITY.md`.
- **Extensão do smoke remoto existente em vez de um novo script**: a corrida de correção concorrente que já prova "exatamente um vencedor, um perdedor com erro" em `scripts/remote-interpretation-revisions-smoke.mjs` é o ponto exato onde a prova de tempo limitado, SQLSTATE e ausência de escrita parcial precisa existir — estendê-la evita infraestrutura duplicada, conforme pedido.

# Migrations

- `202607180029_fix_correction_conflict_gateway_timeout.sql` — aditiva. Primeira tentativa de `supabase db push` falhou na própria verificação pós-deploy (falso positivo, ver "Decisões tomadas"/"Limitações"); toda a transação sofreu rollback sem escrita parcial, confirmado por `supabase migration list --linked` mostrando a coluna remota vazia para `029` após a falha. Corrigida e reaplicada com sucesso (`Finished supabase db push`); `supabase migration list --linked` confirma local e remoto sincronizados em `029`. Sem remoção de RPC, coluna ou constraint que quebre consumidor existente. Rollback: reverter para a definição da migration `028` de `correct_entry_interpretation` (idêntica exceto pelo SQLSTATE) é seguro a qualquer momento via nova migration `create or replace` — nenhum dado foi alterado por este hotfix, apenas o comportamento de erro de uma branch de exceção.

# RPCs

| RPC | Situação | Contrato observável |
| --- | --- | --- |
| `correct_entry_interpretation` | Recriada (`create or replace`, mesma assinatura) | Comportamento de sucesso, autorização, idempotência e persistência inalterados. Único comportamento observável alterado: o conflito de versão (`current_interpretation.version <> p_expected_version`) agora retorna SQLSTATE `55P03` em vez de `40001`. |

# Edge Functions

Nenhuma alterada. `correct_entry_interpretation` é chamada apenas pela Action `correctInterpretation` (`src/features/interpretations/actions.ts`), nunca por uma Edge Function.

# Testes executados

- `npx vitest run src/features/interpretations/actions.test.ts` — falhando antes da correção do mapeamento de erro (prova de teste-primeiro), passando depois.
- `npm test` — 54 arquivos e 267 testes Vitest passando (1 novo).
- `npm run lint` — passando, zero erros.
- `npx tsc --noEmit` — passando, zero erros.
- `npm run build` — build de produção Next.js 16.2.10 passando.
- `git diff --check` — sem erros de espaço em branco (apenas avisos normais de conversão LF/CRLF do Git no Windows).
- `supabase migration list --linked` — antes: `029` pendente. Após a primeira tentativa falha: `029` ainda pendente (rollback confirmado). Após a correção: `029` aplicada e sincronizada local/remoto.
- `supabase db push` — primeira tentativa falhou na verificação pós-deploy (ver acima); segunda tentativa (após a correção do comentário/verificação) concluída com sucesso.
- `supabase db lint --linked --level warning` — um único achado, pré-existente e não relacionado (`run_user_heartbeat`), idêntico ao estado pré-hotfix.
- `supabase gen types typescript --linked` — regenerado; diff comparado byte a byte contra o arquivo commitado mostrou apenas uma diferença de BOM (marca de ordem de bytes) introduzida pelo redirecionamento do shell usado para a comparação, não uma diferença real de schema — confirma que a assinatura da RPC foi totalmente preservada. `database.types.ts` não foi alterado.
- `npm run test:remote:interpretations` (`scripts/remote-interpretation-revisions-smoke.mjs`, estendido) — executado contra o projeto linkado com usuários descartáveis; passou.
- pgTAP (`supabase test db --linked supabase/tests/interpretation_revisions.sql`) — não executado; Docker indisponível neste workstation (mesma limitação pré-existente documentada em todo o projeto). As duas novas asserções estão commitadas e corretas quanto à sintaxe/lógica.

# Evidências

- `npm test`: `Test Files 54 passed (54)` / `Tests 267 passed (267)`.
- `npx eslint .` e `npx tsc --noEmit`: sem saída.
- `npm run build`: `✓ Compiled successfully`.
- Primeira tentativa de `supabase db push`: `ERROR: correct_entry_interpretation still raises the gateway-hanging SQLSTATE 40001 (SQLSTATE P0001)` — falha da própria verificação pós-deploy, não da lógica de negócio; `supabase migration list --linked` confirmou nenhuma aplicação parcial.
- Segunda tentativa de `supabase db push` (após a correção): `Applying migration 202607180029_fix_correction_conflict_gateway_timeout.sql... Finished supabase db push.`
- `supabase migration list --linked`: `202607180029 | 202607180029 | 202607180029` (local e remoto sincronizados).
- `supabase db lint --linked --level warning`: um achado, em `run_user_heartbeat`, não tocado por este hotfix.
- `npm run test:remote:interpretations`: `Version-conflict correction returned in 530ms with SQLSTATE 55P03.` seguido de `Remote interpretation revision smoke passed: immutability, append-only correction, idempotency, concurrency (bounded-time 55P03 conflict, no gateway hang), ownership, rollback, audit, undo, aliases, reprocessing, sanitization, RLS, and cleanup.`
- Usuários de teste descartáveis do smoke remoto removidos ao final (rotina de limpeza do próprio script, sem erro reportado).

# Limitações

- **pgTAP não executado localmente**: mesma limitação de ambiente (Docker indisponível) documentada em todo o projeto. As duas novas asserções em `interpretation_revisions.sql` estão commitadas e corretas quanto à sintaxe/lógica, mas não foram executadas por essa ferramenta. A verificação equivalente — e neste caso mais forte, pois exercitou `authenticated` real e encontrou um defeito real de primeira tentativa — foi a execução real de `scripts/remote-interpretation-revisions-smoke.mjs`.
- **`undo_operation`'s SQLSTATE `40001` permanece intocado**: é um sinal de conflito distinto ("não é mais possível desfazer, uma revisão mais nova existe"), em uma ação diferente, e estava fora da autorização explícita deste hotfix (correção de uma única RPC nomeada). Não confirmado como travando o gateway, mas é a mesma classe de risco de plataforma. Ver `TODO.md`/`SECURITY.md`.
- **Falha de primeira tentativa não é um defeito de produção, mas vale registrar para trabalho futuro em migrations com verificação pós-deploy**: qualquer script `DO $verification$` que busque por uma substring dentro de `pg_get_functiondef()` deve preferir inspecionar uma atribuição/token específico (como `errcode = '...'`) em vez de uma substring numérica genérica, já que comentários explicativos no próprio corpo da função são preservados literalmente e podem colidir.

# Riscos

- O `undo_operation`'s próprio `40001` (ver "Limitações") é um risco residual explícito, não corrigido por este hotfix, e deveria ser investigado em um trabalho dedicado antes que um usuário real o acione em produção.
- O achado original da Slice 2X.7 (ADR-025) já registrava que apenas `40001` foi confirmado como problemático nesta plataforma; `40P01` (deadlock) e outras classes `40` não foram testadas. Este hotfix não expandiu essa investigação — o risco permanece teórico, mas não descartado.

# Próximo (não é um slice)

Este hotfix não altera a elegibilidade do Slice 2X.8 nem inicia qualquer trabalho dele. O próximo slice elegível continua sendo o Slice 2X.8 — Projeções separadas de revisão e detalhes técnicos, cujas dependências (2X.1, 2X.6 e 2X.7) já estavam satisfeitas antes deste hotfix. Autorização explícita continua sendo necessária antes de iniciá-lo.

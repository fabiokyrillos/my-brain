# Slice

Slice 2X.4 — Worker de interpretação e dispatch automático. Data: 2026-07-17. Branch: `codex/phase-2-intelligent-capture`.

# Objetivo

Fazer jobs `interpret_entry` criados pelo contrato do Slice 2X.3 serem processados de ponta a ponta — extração de IA, entity resolution, cálculo de confiança e persistência — por um worker implantado, alcançável tanto por invocação direta autenticada quanto por drenagem automática agendada, sem cortar a captura de produção para o fluxo assíncrono.

# Escopo

- `supabase/functions/process-jobs` dividido em `index.ts` (autenticação, lookup de tipo, claim e roteamento), `dispatch.ts` (router fail-closed por tipo e loop de drenagem agendada), `attachment.ts` (comportamento de anexo extraído sem alteração) e `entry.ts` (novo processador de entrada, pipeline único para os modos `initial` e `reprocess`).
- Migration `026`: estende as seis RPCs de persistência de interpretação (`begin_entry_interpretation`, `fail_entry_interpretation`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`, `fail_entry_reprocessing`) com `p_service_user_id` opcional restrito a `service_role`; habilita `pg_net`; agenda `my-brain-entry-dispatch` via `pg_cron` lendo URL e segredo do Supabase Vault.
- Migration `027`: corrige uma regressão do Slice 2X.3 que quebrava qualquer insert autenticado em `jobs` (ver seção Riscos/Decisões).
- Reuso genuíno (mesmo código-fonte, portado) dos módulos determinísticos `entity-resolution.ts`, `trust-builders.ts` e `trust-policy.ts` via `supabase/functions/_shared/`.
- Invocação direta autenticada (contrato `{ jobId }` inalterado) e drenagem agendada (`pg_net`/`pg_cron`, segredo dedicado) implantadas e verificadas remotamente.
- Emissão best-effort de `capture_processing_completed`/`capture_processing_failed` via `record_product_event_for_user`, independente do resultado do job.

Não foram alterados: UI, rotas, Server Actions existentes (`captureEntry`, `reprocessEntry` continuam síncronas), contrato de payload dos jobs, `capture_entry_async`/`enqueue_entry_reprocessing`/`claim_entry_interpretation_job`/`claim_next_entry_interpretation_job` do Slice 2X.3, nem qualquer funcionalidade do Slice 2X.5.

# Critérios de aceite

- Atendido — jobs `interpret_entry` (modos `initial` e `reprocess`) são processados de ponta a ponta pelo worker implantado, verificado por invocação direta real contra o projeto vinculado.
- Atendido — existe um dispatcher explícito e fail-closed: tipos suportados são `process_attachment` e `interpret_entry`; um tipo desconhecido é rejeitado antes de qualquer claim, sem inferir comportamento a partir do payload.
- Atendido — anexo e entrada têm processadores independentes (`attachment.ts` e `entry.ts`); o comportamento de anexo foi extraído sem alteração de payload, modelo, usage, lease ou mensagens (mesma suíte de regressão remota passou antes e depois da extração).
- Atendido — retries funcionam corretamente: o job da fila usa exatamente `complete_job`/`fail_job`/`reap_expired_jobs` já existentes; falha de IA aciona `fail_job` (retry/exhaustion da fila) e, em paralelo, `fail_entry_interpretation`/`fail_entry_reprocessing` (estado da entry), com `p_terminal` derivado do status retornado por `fail_job`.
- Atendido — stale workers continuam protegidos: nenhuma transição de lease foi reimplementada; o worker usa exclusivamente as RPCs de lease já auditadas (`claim_entry_interpretation_job`, `claim_next_entry_interpretation_job`, `complete_job`, `fail_job`, `reap_expired_jobs`).
- Atendido — o fluxo síncrono atual da UI permanece exatamente igual; nenhuma página passou a usar `capture_entry_async`; nenhuma funcionalidade do Slice 2X.5 foi antecipada.
- Atendido com desvio documentado — uma migration adicional (`027`) foi necessária para corrigir uma regressão de privilégio do Slice 2X.3 descoberta ao executar o smoke de regressão de anexos exigido por este slice; autorização explícita foi obtida antes de implementá-la (ver Decisões).
- Atendido com limitação externa — o contrato pgTAP e o arquivo de teste Deno foram escritos, mas não puderam ser executados neste workstation (Docker Desktop e runtime Deno indisponíveis); a implantação real (que resolve todo o grafo de módulos Deno, incluindo os imports de `_shared/`) e os smokes remotos serviram como verificação equivalente.

# Arquivos alterados

- `supabase/migrations/202607170026_phase_2x_entry_interpretation_worker.sql` — RPCs de interpretação estendidas para `service_role`, extensão `pg_net`, cron de drenagem agendada.
- `supabase/migrations/202607170027_fix_entry_interpretation_job_payload_check_privilege.sql` — substitui a CHECK constraint por trigger `SECURITY DEFINER`.
- `supabase/tests/entry_interpretation_worker.sql` — pgTAP para a superfície de assinatura/privilégio da migration `026`.
- `supabase/functions/process-jobs/index.ts` — reduzido a autenticação, lookup de tipo, claim e roteamento.
- `supabase/functions/process-jobs/dispatch.ts` — router fail-closed por tipo e loop de drenagem.
- `supabase/functions/process-jobs/attachment.ts` — processador de anexo, extraído do `index.ts` original sem alteração de comportamento.
- `supabase/functions/process-jobs/entry.ts` — processador de entrada (novo), pipeline único `initial`/`reprocess`.
- `supabase/functions/process-jobs/dispatch.test.ts` — teste Deno do router de tipos (não executado neste workstation).
- `supabase/functions/_shared/entity-resolution.ts`, `trust-builders.ts`, `trust-policy.ts` — cópias Deno dos módulos determinísticos de `src/features/interpretations/`.
- `src/lib/supabase/database.types.ts` — regenerado a partir do schema remoto após as migrations `026`/`027`.
- `src/lib/ai/usage-order.test.ts` — assertion existente repontada de `index.ts` para `attachment.ts`; nova assertion equivalente para `entry.ts`.
- `scripts/remote-entry-processing-smoke.mjs` — estendido com invocação direta real (initial e reprocess) e drenagem agendada.
- `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/DECISIONS.md` (ADR-021, ADR-022), `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md` — arquitetura, contrato de banco, controles de segurança, decisões e estado permanente.

# Decisões tomadas

- **Acesso service-role às RPCs de interpretação (ADR-021):** as seis RPCs do Slice 2B derivam o usuário de `auth.uid()`, inexistente para um worker sem sessão. Em vez de forjar um JWT de usuário (nova superfície de segredo/assinatura) ou duplicar as RPCs, cada função foi recriada (`drop function` + `create or replace function`, mesmo padrão da migration `019`) com um `p_service_user_id` opcional restrito a `service_role`, preservando um único overload e zero mudança no caminho `auth.uid()`.
- **Reuso Deno vs. reimplementação:** `src/lib/ai/openai-provider.ts` importa `server-only`, cujo módulo padrão lança incondicionalmente fora de um bundler (verificado diretamente em `node_modules/server-only/index.js`), tornando-o impossível de importar no runtime Deno. Os módulos puramente algorítmicos (`entity-resolution.ts`, `trust-builders.ts`, `trust-policy.ts`) não têm essa dependência e foram portados verbatim para `supabase/functions/_shared/`; apenas a chamada HTTP à OpenAI (prompt, schema, versões) foi duplicada em `entry.ts`, seguindo o precedente já existente de `attachment.ts`.
- **Dispatch agendado via `pg_net`/Vault, não um servidor Next.js:** o projeto não tem deploy público do Next.js (Vercel foi deliberadamente adiado), então um dispatch agendado só pode alcançar computação já implantada e acessível pela rede — a Edge Function. `pg_net` foi habilitado e um cron por minuto chama `process-jobs` em modo `dispatch`, autenticado por um segredo dedicado de Edge Function; a URL e o segredo também residem no Supabase Vault (lidos por nome), nunca no repositório.
- **Drenagem exclusiva de `interpret_entry`:** não existe `claim_next_attachment_job`; criar um consumidor não supervisionado para anexos está fora do escopo deste slice (consistente com `TODO.md`, que mantém isso como decisão deliberada até um fluxo concreto exigir o contrário).
- **Correção de privilégio via trigger, não grant amplo (ADR-022):** ao rodar `test:remote:jobs` (exigido por este slice), um insert autenticado de job `process_attachment` falhou com `permission denied for function is_valid_entry_interpretation_job_payload`. Investigação confirmou que a migration `025` revogou `EXECUTE` dessa função de todos os papéis, e o PostgreSQL verifica a ACL de uma função referenciada em uma CHECK constraint na inicialização do plano — não apenas quando o ramo é avaliado — então mesmo o `OR` de tipo, que deveria curto-circuitar em valor, exigia a permissão. Isso quebrava todo upload de arquivo desde a `025`, sem detecção porque o smoke que faria um insert autenticado direto não havia sido reexecutado após aquela migration. Autorização explícita foi obtida antes de corrigir. A correção evita ampliar qualquer grant: a constraint foi substituída por um trigger `BEFORE INSERT OR UPDATE` com `WHEN (new.type = 'interpret_entry')`, cuja função é `SECURITY DEFINER` — disparo de trigger não exige que o papel que grava na tabela tenha `EXECUTE` na função disparada, então o validador privado manteve seu `revoke all` original.

# Migrations

- `202607170026_phase_2x_entry_interpretation_worker.sql` — aditiva; aplicada ao projeto vinculado. Impacto de dados: nenhum (apenas assinaturas de função e cron). Compatibilidade: total — o caminho `auth.uid()` das seis RPCs permanece idêntico; rollback isolado exigiria recriar as seis funções na forma anterior (sem `p_service_user_id`) e remover o cron/`pg_net`, sem tocar `entries`/`jobs`/`entry_interpretations` já persistidos.
- `202607170027_fix_entry_interpretation_job_payload_check_privilege.sql` — aditiva; aplicada ao projeto vinculado. Impacto de dados: nenhum. Compatibilidade: total — mesma validação, mesmo `errcode`; rollback isolado exigiria recriar a CHECK constraint original (reintroduzindo a regressão) ou uma variante correta.
- Ambas sincronizadas: `npx supabase migration list --linked` confirma histórico local/remoto até `202607170027`; `npx supabase db lint --linked --level error` sem achados após cada uma.

# RPCs

- `begin_entry_interpretation`, `fail_entry_interpretation`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`, `fail_entry_reprocessing` — estendidas (mesmo nome, um parâmetro opcional adicional); grants explícitos passam a incluir `service_role`.
- `capture_entry_async`, `enqueue_entry_reprocessing`, `claim_entry_interpretation_job`, `claim_next_entry_interpretation_job`, `complete_job`, `fail_job`, `reap_expired_jobs`, `claim_attachment_job`, `record_ai_usage`, `record_product_event_for_user` — reutilizadas sem alteração de contrato.
- `private.is_valid_entry_interpretation_job_payload` — grants inalterados (continua revogada de todos os papéis).
- `private.enforce_entry_interpretation_job_payload()` (nova, função de trigger) — `SECURITY DEFINER`, revogada de todos os papéis; não é chamada diretamente, apenas disparada pelo trigger `jobs_interpret_entry_payload_trigger`.

# Edge Functions

`process-jobs` reimplantada duas vezes nesta sessão (a segunda após corrigir a ordem de registro de usage descoberta ao escrever o teste de regressão — ver Testes). Gatilhos: invocação HTTP direta autenticada (`{ jobId }`, contrato inalterado) e chamada agendada por `pg_cron`/`pg_net` em modo `{ mode: "dispatch" }` autenticada por `x-dispatch-secret`. Comportamento de falha: tipo desconhecido ou payload inválido falha antes de qualquer claim; falha durante processamento aciona `fail_job` (retry/exhaustion da fila) e a RPC de falha correspondente na entry, com erro sempre sanitizado e limitado a 500 caracteres antes de qualquer persistência ou log.

# Testes executados

- `npm test` — 47 arquivos e 205 testes Vitest passando (inclui a nova assertion de ordenação de usage para `entry.ts` e a assertion existente repontada para `attachment.ts`).
- `npm run lint` — passando.
- `npm run typecheck` — passando.
- `npm run build` — build de produção Next.js 16.2.10 passando.
- `git diff --check` — passou sobre o escopo staged deste slice.
- `npx supabase db push --linked` (migrations `026` e `027`), `npx supabase migration list --linked`, `npx supabase db lint --linked --level error` — passando.
- `npx supabase gen types typescript --linked --schema public` — tipos regenerados e conferidos manualmente (novo `p_service_user_id` presente nas seis RPCs).
- `npx supabase functions deploy process-jobs --project-ref ulvwzqlpsjyrnqzfxmck` — bem-sucedido nas duas implantações; resolveu com sucesso o grafo de módulos Deno completo, incluindo os imports cross-directory de `_shared/`.
- `npm run test:remote:entry-processing` (estendido) — passou: contrato atômico do 2X.3 (capture/replay, payload, lease exclusivo, retry, stale worker, reaper, isolamento de reprocessamento) mais invocação direta real do worker em modo `initial` e `reprocess`, negação de segredo de drenagem incorreto e drenagem agendada processando uma entry de fixture sem `jobId` explícito.
- `npm run test:remote:jobs` — falhou antes da correção da migration `027` (`permission denied for function is_valid_entry_interpretation_job_payload`); passou depois.
- `npm run test:remote` (regressão completa, inclui o worker de anexo real via HTTP) — passou após a correção.
- Verificação ad hoc com um usuário descartável adicional (script temporário, removido após a execução) confirmou que o evento `capture_processing_completed` é persistido com as propriedades esperadas (`processingMode`, `durationMs`, `outcome`) e removido pela exclusão do usuário.
- `supabase/tests/entry_interpretation_worker.sql` (pgTAP) — não executado: `supabase test db` exige Docker Desktop, indisponível neste workstation.
- `supabase/functions/process-jobs/dispatch.test.ts` (Deno) — não executado: nenhum runtime Deno instalado neste workstation (`deno` não encontrado em PATH via Bash e PowerShell). A implantação bem-sucedida da função (que compila/empacota todo o módulo, incluindo este mesmo diretório) é a evidência indireta mais próxima disponível; não é um substituto real para `deno test`.

# Evidências

- `npx supabase migration list --linked` confirma sincronização local/remota até `202607170027`.
- Saída de `npm run test:remote:entry-processing`: *"Remote entry-processing smoke passed: atomic capture, bounded payloads, idempotency, ownership, exclusive leases, retries, stale-worker protection, recovery, reprocessing isolation, direct worker invocation (initial and reprocess), and unattended dispatch drain."*
- Saída de `npm run test:remote:jobs` após a correção: *"Remote job reliability smoke passed: exclusive lease, stale-worker denial, recovery, exhaustion, sanitization, metrics, and RLS."*
- Saída de `npm run test:remote`: *"Remote Supabase smoke passed: auth, atomic settings, RLS, ownership, heartbeat, AI ledger, aggregation, and deployed file worker."*
- Verificação ad hoc: uma linha em `product_events` com `event_name = "capture_processing_completed"` e `properties = {"outcome":"ready","durationMs":<n>,"processingMode":"initial"}`, lida pela sessão do próprio usuário de teste antes da limpeza.
- Grants ao vivo confirmados via `information_schema.role_routine_grants` antes e depois da correção da migration `027` (somente `postgres` antes; comportamento correto sem grant ampliado depois, via trigger).

# Limitações

- pgTAP (`entry_interpretation_worker.sql`) e o teste Deno (`dispatch.test.ts`) foram escritos mas não executados neste workstation, pelas razões já registradas em slices anteriores (Docker) e, para Deno, pela ausência do runtime na máquina. A implantação real mais os smokes remotos cobriram os mesmos caminhos críticos com dados reais.
- `entity-resolution.ts`, `trust-builders.ts` e `trust-policy.ts` agora existem em duas cópias (Node e Deno) que precisam ser mantidas manualmente em sincronia até que uma solução de pacote compartilhado exista; cada cópia Deno sinaliza isso no cabeçalho do arquivo.
- A UI continua no fluxo síncrono; `capture_entry_async`/`enqueue_entry_reprocessing` não têm consumidor de produção. O Slice 2X.5 é o responsável por esse corte.
- O worker de anexos continua sem drenagem agendada, por decisão deliberada (sem `claim_next_attachment_job`, fora de escopo).

# Riscos

- Divergência futura entre as cópias Node e Deno dos módulos de trust/entity-resolution é o principal risco de manutenção introduzido por este slice. Mitigação: cabeçalhos explícitos nos três arquivos Deno apontando para o ADR-021 e para os arquivos-fonte Node.
- A migration `027` demonstra que uma CHECK constraint que referencia uma função revogada de todos os papéis pode quebrar silenciosamente qualquer escrita na tabela protegida, não apenas o caminho que a função deveria validar. Mitigação: preferir o padrão trigger `SECURITY DEFINER` para qualquer validação futura que dependa de uma função de schema `private`; a regressão original não foi detectada porque o smoke afetado não foi reexecutado após a migration `025` — os relatórios de slice agora registram explicitamente quais smokes remotos foram (re)executados.
- Jobs `interpret_entry` agora são processados automaticamente; um volume inesperado de jobs elegíveis poderia manter o drenador ocupado por vários ciclos de cron consecutivos. Mitigação: o loop de drenagem é limitado (25 jobs ou 50 segundos por invocação) e cada claim usa `SKIP LOCKED`, então invocações sobrepostas não competem incorretamente pelo mesmo job.

# Próximo slice

O próximo slice elegível é o Slice 2X.5 — Corte vertical da captura para assíncrono. Suas dependências (2X.1–2X.4) estão satisfeitas: contratos de produto, jobs de entrada, worker e dispatch estão implantados e provados de ponta a ponta. Ainda serão necessários, antes de iniciá-lo: autorização explícita, e — conforme o próprio plano — a decisão de produto sobre `CaptureReceipt`/UI de recibo, já que este slice não alterou nenhuma página, Server Action ou rota.

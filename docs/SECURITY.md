# Security

## Controles ativos

- Supabase Auth com cookies atualizados pelo proxy do Next.js.
- `user_id` e RLS forçada em todas as tabelas pertencentes ao usuário.
- Policies de menor privilégio por tabela, RLS forçada também nas relações e grants diretos removidos de registros controlados pelo domínio.
- FKs compostas e triggers polimórficos impedem relacionamentos com entidades de outro usuário.
- Original imutável, saída de IA validada por Zod e RPCs transacionais.
- Chave OpenAI somente no servidor; nenhuma chave é `NEXT_PUBLIC_*`.
- Edge Function heartbeat protegida por segredo aleatório armazenado no Supabase.
- Bucket privado, path por UUID, limite de 25 MB, allowlist de MIME e URL assinada curta.
- Prompt injection tratado separando política de sistema e conteúdo do usuário.
- Logs não incluem texto integral nem secrets; auditoria registra motivo e IDs.
- Ledger de IA append-only, RPC restrita ao próprio usuário, metadados com allowlist e agregação sob RLS do chamador.
- Ledger privado de comportamento do produto separado de auditoria, jobs e custos de IA, com RLS forçada, escrita exclusiva por RPC, allowlist de eventos/propriedades, IDs opacos opcionais, idempotência por usuário e bloqueio de qualquer texto pessoal, evidência, prompt, resposta ou erro bruto.
- Captura de entrada assíncrona preparada por RPCs transacionais: `capture_entry_async` deriva o usuário de `auth.uid()`, valida entrada e persiste entry + job na mesma transação; `enqueue_entry_reprocessing` exige a entry owned e não toca a interpretação corrente. Recibos não retornam conteúdo, detalhes de job ou erros internos.
- Jobs `interpret_entry` aceitam somente payloads mínimos validados. Seus claims são restritos a `service_role`, conferem tipo, payload, ownership, elegibilidade, tentativas e lease com `SKIP LOCKED`.
- O worker de interpretação (Slice 2X.4) roda como `service_role` sem sessão de usuário. As RPCs de persistência (`begin_entry_interpretation`, `fail_entry_interpretation`, `persist_entry_interpretation`, `begin_entry_reprocessing`, `persist_reprocessed_entry_interpretation`, `fail_entry_reprocessing`) exigem `p_service_user_id` explícito nesse caso, validado contra `auth.role() = 'service_role'`; o caminho `auth.uid()` do fluxo síncrono continua idêntico e nenhuma chamada autenticada pode informar esse parâmetro. O worker nunca confia apenas no payload do job: recarrega a entry por `id` + `user_id` antes de qualquer chamada de IA ou persistência.
- Invocação direta do worker reaproveita a autenticação por Bearer token já existente, com o mesmo contrato de requisição (`{ jobId }`). A drenagem agendada usa um cabeçalho de segredo dedicado (`x-dispatch-secret`), validado no código da função contra um segredo de Edge Function separado do `HEARTBEAT_SECRET`; nenhum dos dois é a service role key. A URL da função e o segredo de drenagem também existem como segredos no Supabase Vault, lidos por `pg_cron`/`pg_net` — nenhum valor está no repositório.
- A drenagem agendada processa somente `interpret_entry`; não existe claim "próximo elegível" para anexos, então o caminho de upload permanece inalterado e sem consumidor não supervisionado.
- O ranking de entidades e o cálculo de confiança do worker reutilizam, por importação direta (mesmo arquivo-fonte, sem reescrita de lógica), os módulos determinísticos já usados pelo fluxo síncrono, copiados para `supabase/functions/_shared/` porque o runtime Deno não pode importar `src/lib/ai/openai-provider.ts` (marcado `server-only`, que lança incondicionalmente fora de um bundler). A chamada ao provider OpenAI é replicada no runtime Deno com o mesmo prompt, schema e constantes de versão.
- Migração `027`: um trigger `SECURITY DEFINER` substituiu uma CHECK constraint que, por depender da ACL de uma função revogada de todos os papéis, quebrava qualquer insert autenticado em `jobs` (incluindo anexos) desde a migration `025`. A correção não amplia privilégio algum — o validador interno continua com `execute` revogado de todos; apenas o mecanismo de disparo muda de CHECK constraint para trigger, que não exige `EXECUTE` do papel que grava na tabela.
- Service worker limita cache a assets estáticos públicos.

## Verificações executadas

- Migrations remotas sincronizadas até `202607170025`; `supabase db lint --linked --level error` sem erros.
- Smoke remoto descartável valida auth, settings atômicas, RLS, ownership, heartbeat lossless/localizado, ledger/agregação de IA e o worker de arquivo publicado.
- Migration `024` está sincronizada e o smoke remoto descartável valida allowlist, payload proibido, idempotência, RLS, negação cross-user e a RPC restrita a service role para `product_events`.
- Migration `025` está sincronizada; o smoke remoto descartável valida capture/replay atômicos, payload sem conteúdo, ownership, negação de claim autenticado, lease exclusivo, retry, stale worker, recuperação por reaper e isolamento de reprocessamento.
- Migrations `026` e `027` estão sincronizadas; `db lint --linked --level error` permanece sem achados. O smoke remoto de entrada foi estendido e valida invocação direta autenticada (initial e reprocess) processada de ponta a ponta pelo worker implantado, negação de segredo de drenagem incorreto e drenagem agendada processando um job de fixture sem `jobId` explícito. O smoke de confiabilidade de jobs (anexos) e o smoke remoto completo (incluindo o worker de arquivo publicado via HTTP) foram executados após a correção da migration `027` e passaram.
- A emissão best-effort de `capture_processing_completed`/`capture_processing_failed` pelo worker foi verificada com um usuário descartável adicional: o evento foi persistido com as propriedades esperadas e removido pela exclusão do usuário ao final.
- Arquivo de teste, dados e usuário são removidos ao final.
- Desktop e mobile executam o mesmo cenário.

## Necessário antes de produção

- Rate limiting distribuído para operações de IA e upload.
- CSP/HSTS e headers de produção revisados no domínio final.
- Detecção de assinatura real de arquivos, antivírus e worker isolado.
- Exportação, exclusão de conta e política formal de retenção.
- Job operacional de purge de `product_events` com retenção máxima de 180 dias antes do piloto; até então, o ledger deve permanecer privado, mínimo e identificado por `is_synthetic` nos testes.
- BYOK com envelope encryption e rotação.
- Alertas e reconciliação de custo/latência com billing do provedor.
- Teste pgTAP integral em CI com banco limpo.

Google OAuth e callbacks públicos serão configurados somente quando o usuário retomar essa integração.

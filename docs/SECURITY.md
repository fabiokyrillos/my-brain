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
- Service worker limita cache a assets estáticos públicos.

## Verificações executadas

- Migrations remotas sincronizadas até `202607170018`; `supabase db lint --linked --level error` sem erros.
- Smoke remoto descartável valida auth, settings atômicas, RLS, ownership, heartbeat lossless/localizado, ledger/agregação de IA e o worker de arquivo publicado.
- Migration `024` está sincronizada e o smoke remoto descartável valida allowlist, payload proibido, idempotência, RLS, negação cross-user e a RPC restrita a service role para `product_events`.
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

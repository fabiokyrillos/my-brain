# Security

## Controles ativos

- Supabase Auth com cookies atualizados pelo proxy do Next.js.
- `user_id` e RLS forçada em todas as tabelas pertencentes ao usuário.
- Quatro políticas explícitas por tabela e RLS também nas relações.
- Original imutável, saída de IA validada por Zod e RPCs transacionais.
- Chave OpenAI somente no servidor; nenhuma chave é `NEXT_PUBLIC_*`.
- Edge Function heartbeat protegida por segredo aleatório armazenado no Supabase.
- Bucket privado, path por UUID, limite de 25 MB, allowlist de MIME e URL assinada curta.
- Prompt injection tratado separando política de sistema e conteúdo do usuário.
- Logs não incluem texto integral nem secrets; auditoria registra motivo e IDs.
- Service worker limita cache a assets estáticos públicos.

## Verificações executadas

- `supabase db lint` sem erros.
- Teste online cria usuário descartável e valida captura, original, IA, tarefas, undo, chat, fontes, revisão, upload e heartbeat.
- Arquivo de teste, dados e usuário são removidos ao final.
- Desktop e mobile executam o mesmo cenário.

## Necessário antes de produção

- Rate limiting distribuído para operações de IA e upload.
- CSP/HSTS e headers de produção revisados no domínio final.
- Detecção de assinatura real de arquivos, antivírus e worker isolado.
- Exportação, exclusão de conta e política formal de retenção.
- BYOK com envelope encryption e rotação.
- Observabilidade de custo/latência e alertas.
- Teste pgTAP integral em CI com banco limpo.

Google OAuth e callbacks públicos serão configurados somente quando o usuário retomar essa integração.

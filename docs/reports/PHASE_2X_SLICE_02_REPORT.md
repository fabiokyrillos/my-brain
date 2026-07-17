# Slice

2X.2 — Fundação privada de eventos de produto.

# Objetivo

Disponibilizar uma base privada, mínima e verificável para medir o funil do ciclo diário sem coletar conteúdo pessoal, sem alterar o fluxo principal e sem expandir o domínio do produto.

# Escopo

- Ledger `public.product_events` com 17 eventos fechados, propriedades específicas por evento, RLS forçada, idempotência por `user_id` + `idempotency_key`, índices de funil e marcação `is_synthetic`.
- RPC autenticada `record_product_event` e RPC de worker `record_product_event_for_user`, ambas com validação no banco e privilégio mínimo.
- Contratos TypeScript serializáveis, parser allowlisted, boundary server-only best effort e Server Action que retorna apenas acknowledgement.
- Testes Vitest, contrato pgTAP, tipos Supabase regenerados e smoke remoto descartável.

# Arquivos alterados

- `supabase/migrations/202607170024_phase_2x_product_events.sql`
- `supabase/tests/product_events.sql`
- `src/features/product-analytics/contracts.ts`
- `src/features/product-analytics/server.ts`
- `src/features/product-analytics/actions.ts`
- Testes vizinhos de contratos, boundary e action.
- `src/lib/supabase/database.types.ts`
- `scripts/remote-product-events-smoke.mjs` e `package.json`.
- Documentação permanente de banco, segurança, arquitetura, decisões, estado, backlog e changelog.

# Decisões tomadas

- `product_events` é separado de `audit_logs`, `jobs` e `ai_usage_events`; nenhum desses ledgers é reutilizado como proxy de comportamento de produto.
- A allowlist é duplicada de forma deliberada em TypeScript e PostgreSQL: o primeiro reduz envios inválidos, o segundo continua autoritativo quando uma action é contornada.
- A action não retorna detalhes de telemetria e o boundary converte indisponibilidade analítica em resultado best effort, sem erro bruto nem mutação do resultado principal.
- `server-only` foi adicionado como dependência mínima porque a documentação local do Next.js recomenda a marcação de DAL server-only e o pacote não estava presente para a resolução de testes.
- Retenção máxima de 180 dias é uma regra documentada; o job de purge continua explicitamente fora deste slice e obrigatório antes do piloto.

# Migrations

- `202607170024_phase_2x_product_events.sql` aplicada ao projeto Supabase vinculado.
- Histórico local/remoto sincronizado até `202607170024`.

# RPCs

- `record_product_event(...)`: apenas chamador autenticado; deriva o owner de `auth.uid()`.
- `record_product_event_for_user(...)`: apenas `service_role`; exige `p_user_id` explícito.
- Helpers privados validam propriedades, faixas, enums e ownership do subject opcional.

# Edge Functions

Nenhuma Edge Function criada, modificada ou publicada.

# Testes executados

- Vitest focado de `product-analytics`: 3 arquivos e 28 testes passaram.
- `npm run typecheck` passou após regenerar os tipos do schema remoto.
- `npx supabase@2.109.1 db lint --linked --level error` passou sem achados.
- `npm run test:remote:product-events` passou com usuários sintéticos descartáveis e cleanup.
- `npm test` passou: 46 arquivos e 199 testes.
- `npm run lint`, `npm run typecheck` e `npm run build` passaram.
- `git diff --check` passou antes do stage final.
- `npx supabase@2.109.1 test db --linked supabase/tests/product_events.sql` não executou: o runner requer Docker Desktop e, na tentativa remota, também informou ausência de `SUPABASE_DB_PASSWORD`.

# Evidências

- Dry-run remoto identificou somente a migration `202607170024_phase_2x_product_events.sql`.
- Aplicação remota da migration foi concluída; `migration list --linked` confirmou a versão `202607170024` local/remota.
- Tipos foram regenerados com `supabase@2.109.1 gen types typescript --linked --schema public`.
- Smoke remoto passou: allowlist, payload proibido, idempotência, ownership de subject, RLS, controle de worker service-role e cleanup.

# Critérios de aceite

- [x] Taxonomia fechada de 17 eventos e propriedades por evento, sem payload aberto ou texto pessoal.
- [x] Escrita validada apenas por RPC, leitura owner-scoped por RLS e negação de cross-user/worker não autorizado.
- [x] Deduplicação por usuário/chave e identificador de tráfego sintético.
- [x] Falha analítica não propaga erro bruto nem altera o fluxo principal.
- [x] Migration remota, tipos gerados, lint remoto e smoke descartável verificados.
- [x] Gate completo e revisão final de diff concluídos.

# Limitações

- O pgTAP `supabase/tests/product_events.sql` está versionado, mas `supabase test db --linked` não executa neste workstation: a CLI requer Docker Desktop e, na tentativa remota, informou ausência de `SUPABASE_DB_PASSWORD`. O smoke remoto equivalente passou com dados descartáveis.
- Não há emissor, dashboard, rota, UI, telemetria visual nem job de retenção neste slice; todos permanecem fora de escopo.

# Riscos

- Uma nova propriedade ou evento exige alteração coordenada nos contratos, SQL e testes; valores desconhecidos são rejeitados para evitar coleta acidental.
- A retenção depende de um purge operacional futuro; o ledger é limitado e privado até que esse requisito pré-piloto seja implementado.

# Próximo slice

Slice 2X.3 permanece não iniciado. Ele exige autorização explícita e deve consumir esta fundação sem criar eventos livres, sem expor telemetria à UI e sem iniciar capacidades reservadas às fases 2C–2F.

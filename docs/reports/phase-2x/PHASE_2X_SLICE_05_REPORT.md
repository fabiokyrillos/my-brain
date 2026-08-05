# Slice

Slice 2X.5 — Corte vertical da captura para assíncrono. Data: 2026-07-17. Branch: `codex/phase-2-intelligent-capture`.

# Objetivo

Fazer o usuário salvar e continuar imediatamente: `captureEntry` e `reprocessEntry` param de chamar IA e de esperar a interpretação, persistindo apenas via as RPCs atômicas do Slice 2X.3 e devolvendo um recibo/confirmação de enfileiramento honesto; a entrada progride pelo worker e pelo dispatch já provados no Slice 2X.4.

# Escopo

- `src/features/capture/actions.ts`: `captureEntry` reescrito para chamar `capture_entry_async`, calcular o estado de produto via `resolveDailyCycleLifecycle`, construir um `CaptureReceipt` via `toCaptureReceipt` e retornar sem redirect.
- `src/features/capture/quick-capture-form.tsx`: novo `CaptureState` discriminado (`idle | success | error`), rótulo "Salvando…"/"Saving…" durante o pending, reset/refoco do campo após o recibo e rotação da chave de idempotência somente após sucesso confirmado.
- `src/features/daily-cycle/capture-receipt.tsx` (novo): `CaptureReceiptView`, primeiro consumidor real do mapper `toCaptureReceipt` (prework do Slice 2X.1/2X.3).
- `src/features/shell/home-dashboard.tsx` e `src/app/[locale]/app/capture/page.tsx`: passam `captureSource` (`home`/`capture_page`) para a Action decidir analytics e a presença do link seguro de registro.
- `src/features/interpretations/actions.ts`: `reprocessEntry` reescrito para chamar `enqueue_entry_reprocessing` e devolver copy honesta de enfileiramento.
- `src/features/interpretations/copy.ts`: rótulo pendente do botão de reprocessamento corrigido para refletir um enqueue, não uma chamada de IA em andamento.
- `src/features/agent/actions.ts`: nova `retryProcessingJob`, generalizando retry manual para jobs `interpret_entry` sem alterar `retryAttachmentJob`.
- `src/lib/jobs/entry-worker.ts` (novo): `kickEntryInterpretationWorker`, nudge não bloqueante compartilhado pelas três Actions acima.
- `e2e/intelligent-capture.spec.ts`: fluxo de captura atualizado para o recibo imediato, prova de interatividade antes da conclusão e espera por polling até o worker organizar a entrada.
- Removido: `src/features/interpretations/interpret-entry.ts` (orquestrador de extração síncrona, agora inalcançável) e duas asserções agora obsoletas em `src/lib/ai/usage-order.test.ts`.
- Corrigido como pré-requisito para o teste do novo componente: `src/test/setup.ts` passou a registrar `cleanup()` do Testing Library em `afterEach` global (lacuna preexistente, sem `globals: true` no Vitest, que permitia vazamento de DOM entre testes do mesmo arquivo).

Não foram alterados: nenhuma migration, nenhuma RPC, nenhuma Edge Function, `retryAttachmentJob`, `entity-resolution.ts`/`trust-builders.ts`/`trust-policy.ts` (Node, canônicos para as cópias Deno por ADR-021), e nenhuma funcionalidade dos Épicos 2–10 (fila "Precisa de você", projeções de Home/Caixa/Trabalho, arquitetura de informação).

# Critérios de aceite

- Atendido — `captureEntry` persiste via `capture_entry_async` e retorna sem chamar IA nem redirecionar; o recibo chega com `productState` correto (`organizing` no caminho novo; recalculado via `resolveDailyCycleLifecycle` no caminho de replay).
- Atendido — o formulário preserva o texto em falha (campo não controlado, inalterado no erro), limpa e refoca o campo após o recibo, e permite capturas consecutivas com uma nova chave de idempotência por captura.
- Atendido — `reprocessEntry` enfileira via `enqueue_entry_reprocessing` e devolve confirmação de enfileiramento, não de conclusão.
- Atendido — eventos `capture_save_succeeded`/`capture_save_failed`/`capture_processing_enqueued` são registrados como efeito best-effort dentro de `after()`, sem atrasar a resposta da Action.
- Atendido — Playwright online prova interação antes da conclusão: campo limpo, focado e botão habilitado imediatamente após o recibo, antes de qualquer espera pela IA.
- Atendido — smokes remotos de entrada, anexos (regressão) e eventos de produto, mais o smoke completo, passaram sem alteração de contrato após o corte.
- Atendido com escopo adicional documentado — `retryProcessingJob` (Épico 2, contrato especificado na seção 4.4 do plano) foi implementado nesta slice por constar explicitamente na lista de arquivos do Épico 1/Slice 2X.5 ("adaptar retry de entrada em `src/features/agent/actions.ts` sem quebrar anexos"); não tem consumidor de UI ainda, consistente com o padrão já usado pelos Slices 2X.3/2X.4 de entregar capacidade de servidor antes da slice de UI que a consome.
- Não aplicável — nenhuma migration foi necessária ou planejada para este slice.

# Arquivos alterados

- `src/features/capture/actions.ts` — `captureEntry` reescrito: RPC atômica, cálculo de lifecycle, `CaptureReceipt`, kick e eventos via `after()`.
- `src/features/capture/actions.test.ts` — reescrito para o novo contrato (persistência, replay, validação, sessão, falha de storage, kick/analytics não bloqueantes).
- `src/features/capture/quick-capture-form.tsx` — `CaptureState` discriminado, reset/refoco, rotação de idempotency key, copy "Salvando…"/"Saving…", renderização do recibo.
- `src/features/capture/quick-capture-form.test.tsx` — reescrito para o novo contrato.
- `src/features/daily-cycle/capture-receipt.tsx` (novo) — `CaptureReceiptView`.
- `src/features/daily-cycle/capture-receipt.test.tsx` (novo).
- `src/features/shell/home-dashboard.tsx` — `captureSource="home"`.
- `src/app/[locale]/app/capture/page.tsx` — `captureSource="capture_page"`.
- `src/features/interpretations/actions.ts` — `reprocessEntry` reescrito para enqueue; imports de extração removidos.
- `src/features/interpretations/actions.test.ts` — teste de `reprocessEntry` reescrito; `correctInterpretation`/`undoInterpretationCorrection` inalterados.
- `src/features/interpretations/copy.ts` — rótulo pendente do reprocessamento corrigido em `pt-BR`/`en`.
- `src/features/agent/actions.ts` — nova `retryProcessingJob`.
- `src/features/agent/retry-processing-job.test.ts` (novo).
- `src/lib/jobs/entry-worker.ts` (novo) — `kickEntryInterpretationWorker`.
- `src/lib/jobs/entry-worker.test.ts` (novo).
- `src/lib/ai/usage-order.test.ts` — duas asserções do caminho Node síncrono removidas (agora inexistente); as duas asserções do worker Deno permanecem.
- `src/features/interpretations/interpret-entry.ts` — removido (inalcançável).
- `src/test/setup.ts` — registra `cleanup()` do Testing Library em `afterEach` global.
- `e2e/intelligent-capture.spec.ts` — passo de captura reescrito; helper `waitForOrganized` adicionado.
- `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/DECISIONS.md` (ADR-023), `docs/STATE.md`, `docs/TODO.md`, `docs/CHANGELOG.md` — arquitetura, contrato de banco, controles de segurança, decisão, estado permanente.

# Decisões tomadas

Ver `docs/DECISIONS.md` ADR-023 para o texto completo. Resumo:

- **Nudge/analytics via `after()` do Next.js**, não chamada síncrona nem fire-and-forget sem garantia: `after()` é o mecanismo documentado pela própria plataforma para exatamente este caso (trabalho que não deve atrasar a resposta), e é seguro chamar de volta o mesmo cliente Supabase da requisição dentro dele.
- **`retryProcessingJob` como Action separada de `retryAttachmentJob`**, em vez de generalizar a Action existente ou reimplementar toda a recuperação de anexos: um job `failed` elegível recebe só um kick (a fila já drena automaticamente); um job `exhausted` precisa de um novo `enqueue_entry_reprocessing`, porque trabalho exaurido nunca é reclamado de novo. Manter `retryAttachmentJob` intocada evita qualquer regressão no caminho de anexos já testado.
- **Remoção de `interpret-entry.ts`, preservação de `entity-resolution.ts`/`trust-builders.ts`/`trust-policy.ts`**: o orquestrador ficou genuinamente inalcançável e não tem relação documentada com o worker Deno; os três módulos determinísticos continuam sendo a fonte canônica que a ADR-021 documenta como base das cópias `_shared/`, e essa relação não muda só porque o chamador síncrono desapareceu — apagá-los resolveria antecipadamente o risco de divergência Node/Deno que a Architecture Review (F1/F2) explicitamente marcou para tratar depois, fora desta slice.
- **`safeHref` condicionado a `captureSource`**: a Action, não o componente, decide se o recibo inclui o link "Ver registro" — presente na página dedicada `/capture`, ausente na Home, que permanece na Home conforme o plano.

# Migrations

Nenhuma. Este slice reutiliza integralmente os contratos de banco das migrations `024`–`027`, já aplicadas e verificadas em slices anteriores.

# RPCs

Nenhuma nova. `capture_entry_async` e `enqueue_entry_reprocessing` passam a ser chamadas pelo caminho de produção pela primeira vez; seus contratos, grants e comportamento permanecem exatamente os documentados e testados no Slice 2X.3.

# Edge Functions

Nenhuma alterada. `process-jobs`/`dispatch.ts`/`entry.ts`/`attachment.ts` permanecem exatamente como entregues no Slice 2X.4.

# Testes executados

- `npm test` — 50 arquivos e 228 testes Vitest passando.
- `npm run lint` — passando.
- `npm run typecheck` — passando.
- `npm run build` — build de produção Next.js 16.2.10 passando.
- `npx playwright test` (sem credenciais online) — 4 testes públicos passando, 10 pulos esperados (incluindo `intelligent-capture.spec.ts`, que exige credenciais online).
- `npm run test:remote:entry-processing` — passou: captura/replay atômicos, payload limitado, idempotência, ownership, lease exclusivo, retry, stale worker, recovery, isolamento de reprocessamento, invocação direta do worker (initial e reprocess) e drenagem agendada.
- `npm run test:remote:jobs` — passou: lease exclusivo, negação de stale worker, recovery, exhaustion, sanitização, métricas e RLS (regressão de anexos).
- `npm run test:remote:product-events` — passou: allowlist, payloads proibidos, idempotência, ownership de subject, RLS, controle de worker service-role e limpeza descartável.
- `npm run test:remote` — passou: auth, settings atômicas, RLS, ownership, heartbeat, ledger/agregação de IA e worker de arquivo implantado.
- `npm run test:e2e:online -- e2e/intelligent-capture.spec.ts --project=desktop` — passou (~1.1 min).
- `npm run test:e2e:online -- e2e/intelligent-capture.spec.ts --project=mobile` — passou (~1.0 min).

# Evidências

- Saída de `npm run test:remote:entry-processing`: *"Remote entry-processing smoke passed: atomic capture, bounded payloads, idempotency, ownership, exclusive leases, retries, stale-worker protection, recovery, reprocessing isolation, direct worker invocation (initial and reprocess), and unattended dispatch drain."*
- Saída de `npm run test:remote:jobs`: *"Remote job reliability smoke passed: exclusive lease, stale-worker denial, recovery, exhaustion, sanitization, metrics, and RLS."*
- Saída de `npm run test:remote:product-events`: *"Remote product-events smoke passed: allowlist, forbidden payloads, idempotency, subject ownership, RLS, service-role worker control, and disposable cleanup."*
- Saída de `npm run test:remote`: *"Remote Supabase smoke passed: auth, atomic settings, RLS, ownership, heartbeat, AI ledger, aggregation, and deployed file worker."*
- Saída do Playwright online desktop: *"1 passed (1.1m)"*; mobile: *"1 passed (59.0s)"*, incluindo a jornada completa (correção, undo, confirmação de tarefas, chat, revisões, arquivos, configurações, heartbeat, undo final) executada contra uma entrada que agora é processada de forma assíncrona.
- `npx tsc --noEmit` e `npx eslint .` sem saída (zero erros).

# Limitações

- `retryProcessingJob` não tem consumidor de UI nesta slice; será conectado pelos Slices 2X.10/2X.11 (fila "Precisa de você").
- Coverage percentual não foi recalculado nesta slice (última medição explícita é da baseline da Fase 2B); os números continuam documentados como tal em `STATE.md`.
- pgTAP e o teste Deno seguem com as mesmas limitações externas já registradas em slices anteriores (Docker Desktop e runtime Deno indisponíveis neste workstation); nenhuma migration nova foi adicionada nesta slice, então nenhum contrato SQL novo ficou sem cobertura estrutural.

# Riscos

- O nudge do worker é best-effort: se ele falhar silenciosamente de forma sistemática (não apenas ocasional), o usuário passaria a depender inteiramente do dispatch agendado (até 1 minuto de atraso) sem qualquer sinal visível disso. Mitigação: o dispatch agendado já é verificado remotamente a cada slice: 2X.4 e 2X.5.
- Eventos de produto `capture_save_succeeded`/`capture_processing_enqueued` usam uma chave de idempotência gerada por chamada (não derivada da chave de captura), então uma nova tentativa de rede rara poderia contar o evento mais de uma vez. Aceitável para telemetria de produto best-effort; não afeta a persistência do domínio, que permanece idempotente pela chave de captura.

# Próximo slice

O próximo slice elegível é o Slice 2X.6 — Estado humano em Caixa e Home. Suas dependências (2X.1 e 2X.5) estão satisfeitas: contratos de produto e a captura assíncrona estão implantados e provados de ponta a ponta. Autorização explícita ainda é necessária antes de iniciá-lo.

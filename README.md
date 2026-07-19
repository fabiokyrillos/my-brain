# My Brain

Agente pessoal contextual em Next.js, TypeScript, Supabase e OpenAI. O pré-MVP já possui captura em linguagem natural, interpretação estruturada, tarefas confirmadas, chat com fontes internas, memória, heartbeat, revisões, arquivos privados e auditoria.

## O que funciona agora

- Auth por e-mail/senha, signup validado, recuperação PKCE completa, perfil e preferências atômicas.
- Supabase online com RLS forçada, policies de menor privilégio e ownership composto nos relacionamentos.
- Captura imutável, datas retroativas, entidades, confiança e perguntas pendentes.
- Confirmação seletiva de tarefas, subtarefas, relações, auditoria e desfazer.
- Chat com embeddings `text-embedding-3-small`, busca pgvector e fontes internas clicáveis.
- Tarefas, Hoje, Aguardando, Projetos, Pessoas, linhas do tempo e Memórias.
- Heartbeat horário via Supabase Cron e Edge Function protegida por segredo.
- Notificações internas, lembretes, revisões manuais e invalidação retroativa.
- Upload privado de imagens, PDF, texto, CSV, DOCX e XLSX, com URL assinada, job durável e análise estruturada pela OpenAI.
- PWA instalável; o service worker guarda somente assets públicos, nunca conteúdo autenticado.
- Rotas de IA por tipo de trabalho, ledger imutável de uso, preços versionados e dashboard de custos calculados.
- Interface PT-BR/EN responsiva, com acesso mobile a toda a arquitetura de informação.

Google OAuth e Vercel foram deliberadamente adiados enquanto o produto permanece em pré-MVP.

## Configuração local

Requisitos: Node.js 22+ e um projeto Supabase vinculado. Docker é necessário apenas para a suíte local do Supabase.

```powershell
npm install
Copy-Item .env.example .env.local
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npm run dev
```

Variáveis mínimas em `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
OPENAI_API_KEY=
```

Não coloque service role, segredo do heartbeat ou chave OpenAI em variáveis `NEXT_PUBLIC_*`.

## Verificação

```powershell
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run test:e2e
npm run test:remote
npx supabase db lint --linked --level warning
```

O E2E online usa credenciais temporárias obtidas da CLI, cria um usuário descartável, testa o fluxo completo e remove usuário, dados e arquivo ao terminar.

```powershell
npx playwright test e2e/intelligent-capture.spec.ts --project=desktop
npx playwright test e2e/intelligent-capture.spec.ts --project=mobile
```

## Supabase operacional

```powershell
npx supabase functions deploy heartbeat --project-ref SEU_PROJECT_REF --no-verify-jwt
npx supabase functions deploy process-jobs --project-ref SEU_PROJECT_REF
npx supabase secrets set HEARTBEAT_SECRET=VALOR_FORTE --project-ref SEU_PROJECT_REF
```

O cron do banco executa `run_all_heartbeats()` a cada hora. A Edge Function oferece uma entrada operacional adicional e exige `x-heartbeat-secret`.

## Documentação

- `docs/PRD.md` — visão e requisitos do produto.
- `docs/ARCHITECTURE.md` — topologia e limites atuais.
- `docs/DATABASE.md` — entidades, RLS, vetores e automações.
- `docs/AI_AGENT.md` — contratos de extração, chat e heartbeat.
- `docs/SECURITY.md` — controles ativos e lacunas antes de produção.
- `docs/IMPLEMENTATION_PLAN.md` — status honesto por fase.
- `docs/STATE.md` — estado operacional atual e gate da próxima fase.
- `docs/DECISIONS.md` — ADRs append-only.
- `docs/CHANGELOG.md` — mudanças técnicas por fase.
- `docs/TODO.md` — backlog, riscos e trabalho atual.

# My Brain

Agente pessoal contextual construído com Next.js, TypeScript e Supabase. A fundação entregue inclui autenticação, perfil e preferências, isolamento por usuário, interface responsiva bilíngue e documentação do produto completo.

## Pré-requisitos

- Node.js 22+
- Docker Desktop para Supabase local
- Supabase CLI (`npx supabase --version`)

## Configuração local

```bash
npm install
Copy-Item .env.example .env.local
npx supabase start
npx supabase status
npm run dev
```

Copie a URL, publishable key e service-role key exibidas pelo Supabase para `.env.local`. A service-role key é exclusiva do servidor e não deve ser usada em componentes cliente.

Abra `http://localhost:3000`. Com Supabase configurado, rotas `/pt-BR/app` e `/en/app` exigem sessão.

## Google OAuth

No Google Cloud, crie um cliente OAuth Web e use a callback fornecida pelo Supabase. Em Supabase Auth > Providers, habilite Google. Configure como URLs permitidas:

- `http://localhost:3000/pt-BR/auth/callback`
- `http://localhost:3000/en/auth/callback`
- as URLs equivalentes da Vercel

## Verificação

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx supabase db reset
npx supabase test db
```

Os dois últimos comandos exigem Docker. A migration cria `profiles` e `agent_preferences`, o trigger de cadastro, índices, RLS forçada e políticas explícitas de leitura, criação, atualização e exclusão.

## Vincular um projeto Supabase

Depois que o projeto existir e você estiver autenticado na CLI:

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Cadastre os secrets no Supabase/Vercel; nunca os versione. Edge Functions e Cron serão promovidos nas fases que introduzem processamento assíncrono e heartbeat.

## Documentação

- `docs/PRD.md`: visão, jornadas e critérios de produto.
- `docs/ARCHITECTURE.md`: limites e topologia.
- `docs/DATABASE.md`: convenções, entidades, índices e RLS.
- `docs/AI_AGENT.md`: pipeline, autonomia, confiança e heartbeat.
- `docs/SECURITY.md`: controles e ciclo de vida.
- `docs/IMPLEMENTATION_PLAN.md`: oito fases verticais.

# Life Brain — Investigação (fase 1)

Data: 2026-10-30. Base: `main` em `b38d656`. Autoria: sessão autônoma autorizada pelo dono em 2026-10-30 (ADR-145).

Este relatório consolida três auditorias executadas em paralelo sobre o repositório e uma captura visual de todas as rotas. Cada afirmação aponta para arquivo:linha ou para um screenshot. As auditorias completas estão ao lado deste arquivo:

- [`AUDIT_UX_COMPONENTS.md`](./AUDIT_UX_COMPONENTS.md) — trabalho de UX anterior, tokens, inventário de componentes, navegação, cheiros por página, composers.
- [`AUDIT_CHAT_RETRIEVAL.md`](./AUDIT_CHAT_RETRIEVAL.md) — fluxo do chat, recuperação, custo, segurança, as quatro perguntas de vida.
- [`AUDIT_WORK_BIAS.md`](./AUDIT_WORK_BIAS.md) — contrato de extração, modelo de dados, onde cada frase cai, copy, sensibilidade, custo de mudar.
- [`evidence/baseline/`](./evidence/baseline/) — 86 screenshots (iPhone 390×844 @2x e desktop 1440×900, pt-BR; en nas rotas que mudam primeiro) + `measurements.json` (overflow, alvos < 44px, assinaturas de classe de botão, links sublinhados, palavras técnicas por rota). Gerados por `e2e/online-life-brain-baseline.spec.ts` contra o dev server local e o projeto Supabase vinculado.

## 0. O que não consegui ver, e por quê

- **Páginas de detalhe** (`/inbox/[id]`, `/work/[id]`, `/people/[id]`, `/projects/[id]`, `/memories/[id]`, `/reminders/[id]`, `/reviews/[id]`, `/chat/[id]`): a conta de teste (`ONLINE_AUTH_TEST_EMAIL`) tem tarefas e avisos, mas **nenhum registro, pessoa, projeto, memória, lembrete ou conversa**. O spec procura o primeiro link de detalhe em cada lista e não achou nenhum (`measurements.json`, linhas `*-detail` com `"(no detail link found)"`). A semeadura do fixture denso (`scripts/redesign-dense-fixture.mjs seed`) foi **recusada pelo classificador de permissões** desta sessão por escrever no projeto hospedado; não insisti. Os cheiros dessas páginas vêm da leitura do código (§1.4).
- **As quatro perguntas de vida não foram executadas contra o modelo** — isso custaria chamadas reais de IA na conta de teste. O que está em §2.5 é o traço do caminho de código, confirmado pelos testes unitários existentes (124 testes, 10 arquivos, verdes).
- **Tema escuro** não foi fotografado; a avaliação de elevação vem dos tokens (`src/app/tokens.css:183-184`).
- O círculo escuro com "N" no canto inferior esquerdo de **todos** os screenshots é o indicador do Next.js dev tools, não é produto.

---

## 1. Auditoria visual

### 1.1 Rotas

44 `page.tsx` sob `src/app/[locale]/`: 38 em `app/*` (incluindo 3 redirecionadores `today`, `tasks`, `waiting`, um segmento paralelo `work/@panel` e 8 seções de `settings/[section]`), 5 em `auth/*`, mais `consent`, `legal/[document]`, `account/delete`, `account-state`. Lista completa em `e2e/online-life-brain-baseline.spec.ts` (`ROUTES`).

### 1.2 Premissa corrigida: não existe camada de componentes

O brief falava em Tailwind v4 + `class-variance-authority`. Os dois estão instalados, mas **nenhum dos dois é usado**: `@import "tailwindcss"` em `globals.css:1` mapeia só 5 variáveis em `@theme inline` (`globals.css:58`); em 303 arquivos `.tsx`, 6 usam alguma utility; `cva(` tem **zero** chamadas. Toda a aparência vem de **28 stylesheets escritas à mão em `src/app/*.css`, 11.023 linhas, 1.166 seletores distintos**, importadas globalmente numa cascata cuja ordem é documentada em comentário (`globals.css:20-28`) porque é a única coisa que decide quem vence. Não há `src/components`. Não há `Button`, `Link`, `Card`, `Input`, `Badge`, `EmptyState`, `Sheet` reutilizáveis — há ~1.100 nomes de classe por página.

Contagens (comandos em `AUDIT_UX_COMPONENTS.md` §3):

| Coisa | Número |
| --- | --- |
| `<button>` em TSX / classNames distintos / sem classe | 200 / 43 / 30 |
| Famílias paralelas de botão em CSS | 7 (`button-primary/secondary`, `ux-action-*`, `task-command-*`, `reminder-button*`, `entity-edit-*`, `push-action`, `voice-finish`) |
| Seletores que pintam `background: var(--action-primary)` | 8 |
| `<Link>` em TSX / classNames distintos / sem classe | 153 / 42 / 51 |
| `<input>` / `<select>` crus | 286 / 55 |
| Implementações de "tabs" | 5 |
| `role="status"` colocados à mão (sem Toast) | 93 |
| Valores distintos de `padding:` / `gap:` em CSS | 252 / 113 |
| Literais `px` vs `rem` | 2.396 vs 159 |
| `font-size` distintos vs tokens `--type-*` | 31 vs 14 |
| `box-shadow` distintos vs `--elevation-*` | 22 vs 5 |
| `border-radius` distintos vs `--radius-*` | 18 vs 5 |
| Ternários `locale === "pt-BR"` inline restantes | 31 em 13 arquivos (12 em `tasks/candidate-editor.tsx`, 1.401 linhas) |

### 1.3 O que os planos anteriores prometeram, o que foi entregue, e por que ainda está feio

| Documento | Prometeu | Entregue | Ficou pela metade |
| --- | --- | --- | --- |
| `product-ux/MY_BRAIN_PRODUCT_AUDIT.md` + `PRODUCT_UX_FINDINGS.md` (jul/2026) | 35 achados; "um instrumento diário coerente" | 30 resolvidos, 4 retidos, 1 adiado (`PRODUCT_UX_CLOSEOUT.md:28-33`) | **só 3 dos 35 eram da categoria "visual"** (`CLOSEOUT.md:56`). A remediação foi de ciclo de vida/IA, não de aparência. |
| `MY_BRAIN_DESIGN_SYSTEM_PLAN.md` | contrato de componentes (`Button` 5 variantes × 6 estados, `IconButton`, `Input`, `Badge`, `Surface`, `ListRow`, `Tabs`, `Sheet`, `EmptyState`…, `:171-226`) e remoção do CSS por página (`:313-341`) | DS-01 cor semântica (ADR-114 "Papel e Console", `tokens.css`), DS-02 tokens de tipo (mas `data-density` nunca é setado por nenhum TSX), DS-05 estados universais (`experience/universal-state.tsx`), DS-06 componentes de confiança, DS-07 paleta de comandos | **DS-03 primitivas de ação/formulário: não feito. DS-04 sistema de lista: parcial (42 famílias `*row*`). DS-08 consolidação de breakpoints: não feito (600/899/900/1080 em duas grafias). DS-10 regressão visual: não feito (`toHaveScreenshot` = 0; as 199 PNGs de `ux-evidence/` são de julho, antes do tema atual).** O número de seletores *subiu* (plano contava ~805 blocos; hoje 1.166). |
| `MY_BRAIN_MOBILE_FIRST_EXPERIENCE_PRD.md` (do dono) | barra móvel **Hoje · Trabalho · Capturar · Conversar · Mais** (§5.4) | barra atual **Hoje · Registros · [+] · Trabalho · Brain** (`shell/capabilities.ts:587`) | **Conversar não está na barra** — é `visibility: "more"` dentro de "Brain" (`capabilities.ts:422`). A funcionalidade principal fica atrás de um menu. |
| `next-experience/*` (ago/2026) | "a navegação já está entregue; o problema é descoberta" | virou as fases 2I–2S, todas fechadas por ADR | nenhuma fase 2I–2S teve um **gate visual**; os gates contam requisitos, migrations, SHAs e checkpoints no aparelho. "O produto ficou correto mais rápido do que ficou desenhado." |

Diagnóstico (detalhe em `AUDIT_UX_COMPONENTS.md` §1.9):

1. **Os tokens foram encaixados embaixo de 11k linhas de CSS por página em vez de substituí-las.** Cor ficou consistente; ritmo, densidade e forma não.
2. **Sem camada de primitivas, cada feature inventou seus controles** (7 famílias de botão, 5 de tabs, 40 famílias `*card*`).
3. **A escala tipográfica é pequena para um produto de celular**: body 13.5px, label 12.5px, caption 12px, eyebrow 11px (`tokens.css:82-86`). O plano de julho já alertava ("97 declarações ≤12px"); o token codificou em vez de corrigir.
4. **Elevação desligada no escuro** (`--elevation-1/2: none`, `tokens.css:183-184`): no tema que a maioria dos iPhones usa por padrão, cartões e linhas se separam só por fio de 1px.
5. **Monoespaçada demais**: eyebrows, metadados, datas, contagens e até o placeholder do chat em `--font-mono`, o que faz informação comum parecer log.
6. **22 destinos em 6 grupos**, com vocabulário interno exposto (Contextos, Relações, Perguntas pendentes, Histórico, Custos de IA, Memórias, "Brain" como seção, Processamento).
7. **Cada página abre com a mesma pilha** eyebrow + título display + parágrafo explicativo, que consome 30–40% da primeira tela do iPhone antes de qualquer conteúdo (ver `home`, `chat`, `work`, `files`, `relations`, `calendar-plan` em `evidence/baseline/`).

### 1.4 Notas por página (iPhone 390, pt-BR; 1 = pior, 5 = pronto)

Medições em `measurements.json`. Nenhuma rota teve overflow horizontal; nenhuma rota devolveu 5xx. "Alvos < 44" conta elementos interativos visíveis na primeira tela abaixo do piso de toque.

| Rota | Nota | Problemas concretos (evidência) |
| --- | --- | --- |
| `/auth/login`, `/register`, `/recover` | 4 | Cartão limpo. Links de rodapé com 16–18px de altura (`auth-register`: 4 alvos < 44); "SEU CONTEXTO, DE VOLTA" em mono. |
| `/app` (Hoje) | 3 | Hero bonito, mas: placeholder só de trabalho ("Registre uma tarefa, decisão, conversa ou ideia…", `capture/composer-copy.ts:39`); o painel "Primeiros passos" é uma pilha de 7 cartões com 3 botões pretos (`home-pt-BR-iphone-390.png`, tela 2); 8 blocos nomeados num scroll (`home-copy.ts:121-174`); **nenhuma porta para o chat**; "Buscar e agir" com 38px; 1 palavra técnica visível ("interpretação"). |
| `/app/capture` | 3 | Mesma pilha de cabeçalho; o composer é o mesmo de Hoje; conteúdo acaba em 50% da tela. |
| `/app/inbox` (Registros) | 3 | Pills de visão rolam horizontalmente ("Só…" cortado); cada aviso é um cartão com eyebrow mono "AVISO", data mono, link "Abrir" de 29×44 e **dois botões empilhados** ("Concluir tarefa", "Mais ações"); itens idênticos repetidos. |
| `/app/work` (Trabalho) e `/tasks` | **1.5** | Título + lead + quick-add + botão "Adicionar" renderizado em **duas linhas** (ícone em cima, texto embaixo) + tira de 3 lentes + 3 pills + 2 acordeões + "Selecionar as que estão nesta página": **a primeira tarefa fica abaixo da dobra**. No desktop (`tasks-pt-BR-desktop-1440.png`): checkbox sozinho numa célula vazia de ~200px, título à direita, chip "NÃO INICIADA", "Concluir", "Aguardar" e "Editar aqui" numa terceira linha. 48 botões na página. |
| `/app/waiting`, `/work/cancelled` | 2 | Mesma casca do Trabalho, redirecionando para `?view=`. |
| `/app/projects`, `/people`, `/organizations`, `/contexts` | 3 | Lista fina: cabeçalho, input + botão preto grande, tira de lentes, caixa azul de estado vazio. Copy: "Quem aparece nas suas conversas, decisões e acompanhamentos." |
| `/app/relations` | **1.5** | Quatro parágrafos explicando o que o desenho significa antes do desenho; tira de lentes; par de pills; bloco âmbar com mais prosa (`relations-pt-BR-iphone-390.png`). |
| `/app/calendar` | 2 | Tira de 3 lentes + "FORMATO" (4 pills) + período (3 botões) + "O QUE MOSTRAR" (5 pills) = **15 controles antes do primeiro evento**. |
| `/app/calendar/plan` | 2 | Cinco títulos e seis frases sobre um dia vazio ("Esta tela não cria tarefas. Ela só organiza o que já existe."). |
| `/app/reminders` | 3 | Lista com pills "Pendentes" de 40px; 5 alvos < 44. |
| `/app/reviews` | 2.5 | Segmentado Dia/Semana/Mês, depois título "Hoje", data, lead, aviso em itálico, mais um par Hoje/Amanhã e uma linha "COMO O DIA FICOU" — três camadas de navegação temporal numa tela. |
| `/app/library` (Brain) | 2.5 | Cartões com contagem "0" e copy de trabalho ("Quem aparece no seu trabalho", "No que você está trabalhando"); 6 alvos < 44. |
| `/app/memories` | 2.5 | Caixa explicativa de dois parágrafos + caixa azul de vazio. |
| `/app/files` | 2 | Linha de busca, tira de lentes, frase explicativa, zona de upload, botão preto full-width, "ESTADO" (5 pills) e "TIPO" (4 pills) — com o pill ativo **azul**, enquanto em Registros/Trabalho é **preto**. |
| `/app/search` | 3 | Formulário simples; botão preto full-width; caixa azul. Funciona. |
| `/app/chat` (Conversar) | **2** — e é a função principal | Eyebrow "CONVERSA COM CONTEXTO", título display, lead; formulário com label mono, placeholder serif cheio de exemplos de trabalho ("o que combinei com Marina? · mude a prioridade da tarefa do relatório"), "Enviar" preto full-width, dica de teclado mono ("Enter envia · Shift+Enter…") num celular; tira de lentes; caixa azul. **Nenhuma conversa visível.** Composer não é fixo e vem depois de até 200 mensagens no thread (`chat/[conversationId]/page.tsx:184-203`). |
| `/app/questions` | 3 | Lista fina. "Perguntas pendentes" como destino de navegação. |
| `/app/notifications` | **1.5** | 50 não lidos × (título, corpo, chip "Não lida", data mono, "Abrir", "Concluir tarefa", "Mais ações") = **103 botões, página de ~14.000px**; tab "← Voltar para Ajustes"; subtítulo "Somente sinais relevantes, com deduplicação e respeito ao silêncio." |
| `/app/history` | 2.5 | Log de auditoria; a mesma linha "Você adicionou a tarefa à lista · TAREFA · Este item não está mais disponível." repetida dezenas de vezes; "FILTROS" em mono dentro de um input. |
| `/app/jobs` | 2.5 | Página de fila ("Processamento") exposta ao usuário sob "Dados e IA". |
| `/app/costs` | 2.5 | Dashboard de faturamento ("US$ 0,0000", "Tokens no mês", "Limites da conta… meia-noite UTC"); 2 palavras técnicas visíveis ("embedding", "tokens"). |
| `/app/settings` (+8 seções) | 3 | Eyebrow "PREFERÊNCIAS OPERACIONAIS", subtítulo "Somente preferências com consumer verificável. Cada seção tem link próprio."; no celular a lista de 8 seções ocupa a tela toda antes do conteúdo; `settings` exibe "nan" em algum lugar (`technicalWords`); `settings/ai` tem 2 links sublinhados crus e "embedding"/"interpretação" visíveis. |

**As cinco piores:** Trabalho (`/app/work`), Notificações, Relações, Calendário + Planejar, e Conversar (pela distância entre o que é e o que precisa ser). Arquivos vem logo depois.

### 1.5 Navegação

Registro em `src/features/shell/capabilities.ts:385-488` (26 chaves): 4 primárias (Hoje, Registros, Trabalho, Brain) + 2 globais (Captura, Notificações) + 15 em "Mais" em 5 grupos (Contexto 8, Reflexão 2, Organização 2, Transparência 2, Preferências 1) + `jobs` só por contexto. Tabela completa com rótulos em `AUDIT_UX_COMPONENTS.md` §4. Redundâncias: `today`/`tasks`/`waiting` são aliases; `questions` é um estado de pipeline promovido a destino; `relations` e `contexts` são conceitos de dados; `history`, `costs`, `jobs` são operação. Jargão: Contextos, Relações, Perguntas pendentes, Histórico, Custos de IA, Memórias, Processamento, "Roteamento de IA", "Automação por categoria".

### 1.6 Composer de captura × composer do chat

São **dois componentes** sem nada em comum: `capture/composer.tsx:88` (Hoje e `/capture`; texto + anexo + voz, dois `<form>`s irmãos) e `assistant/assistant-composer.tsx:43` (`/chat`; só texto, `intent="ask"` oculto). O chat decide entre registrar e perguntar por `decideAssistantRoute` (`assistant/routing.ts:49-70`): abertura de memória → proposta; **15 frases de abertura** ("registre que", "anote isso"…, `capture-intent.ts:44-60`) → captura; > 1000 caracteres → conhecimento; **todo o resto vai primeiro ao modelo de comandos de tarefa** e só `not_a_task_command` cai para a resposta com fontes. Não há alternância visível para o usuário; registrar a partir do chat depende de digitar uma abertura. Resultado: três superfícies de entrada, dois composers e uma heurística de frases.

---

## 2. Conversar com a memória

### 2.1 Fluxo

`AssistantComposer` → `runAssistantTurn` (`assistant/actions.ts:103-298`) → `decideAssistantRoute` → (`task-commands/actions.ts:926`, cobrado como `task_command`) → fallthrough `sendChatMessage` (`chat/actions.ts`) → `embedText` + RPC `match_internal_knowledge` → `answerFromKnowledge` (`openai-provider.ts:325-351`) → persiste mensagens → **redirect** para `/chat/[id]`. Uma pergunta simples custa **2 chamadas ao modelo de texto + 1 embedding**.

### 2.2 O que o chat vê e não vê

Uma única RPC: `public.match_internal_knowledge(p_query_embedding, p_match_count default 8)` (`202608130093_…:74-119`): `UNION ALL` de `entry_embeddings ⋈ entries` e `memories` em vigor, ordenado por similaridade de cosseno, limite 8 (máx. 20). **Sem** parâmetro de data, **sem** predicado de sensibilidade, **sem** full-text (`tsvector`, `tsquery`, `pg_trgm`, `gin` = 0 migrations). O `UNION ALL` com alias calculado derrota os índices HNSW (`TODO.md:792`, M23).

| Tipo de registro | Tabela | Vetor | Texto | O chat alcança? | Citado como |
| --- | --- | --- | --- | --- | --- |
| Registros (original + resumo da IA) | `entries` + `entry_embeddings` | sim (hnsw) | não | **sim** | `entry` |
| Interpretações (conceitos, entidades, candidatas) | `entry_interpretations` | não (só o resumo dobrado no vetor do registro) | não | só indiretamente | — |
| Memórias | `memories` | sim (nulo se o rate-limit recusou) | não | **sim**, se em vigor e com vetor | `memory` |
| Tarefas (status, prazo, aguardando) | `tasks` | não | não | **não** (só Revisões injetam com similaridade falsa 1, `agent/actions.ts:997-1003`) | `task` (só revisões) |
| Lembretes / séries | `reminders`, `reminder_series` | não | não | **não** | — |
| Pessoas / projetos / empresas / contextos | `people`, `projects`, … | não | não | **não** (só sugestões do estado vazio) | — |
| Arquivos (texto extraído) | `attachments`, `attachment_interpretations` | não | não | **não** | — |
| Eventos de calendário | **não existe tabela** — calendário é projeção de tarefas/lembretes/registros | — | — | não | — |
| Revisões / resumos | `summaries` | não | não | **não** | — |
| Mensagens anteriores da conversa | `conversation_messages` | não | não | **não** — são persistidas e **nunca enviadas ao modelo** (`chat/actions.ts:274` envia só a pergunta) | — |

A busca `ilike` que existe em `/app/search` (`search/actions.ts:199-203`, 7 domínios, filtros `7d|30d|12m`) **não está ligada ao chat**.

### 2.3 Capacidades

| Capacidade | Hoje |
| --- | --- |
| Data/período ("semana passada", "em março", "amanhã") | **Não.** Sem parser temporal, sem filtro na RPC. **O prompt do chat leva o fuso mas não a data atual** (`openai-provider.ts:341`; só a extração manda `Current time`, `:179`). |
| Híbrida (texto + vetor) | **Não.** |
| Multi-turno | **Não.** Histórico guardado, nunca enviado. |
| Streaming | **Não.** Server Action bloqueante + redirect (`TODO.md:791`). |
| Modelo | `chat_model ?? gpt-5.6-terra`, reasoning low, saída até 6000 tokens. |
| Custo por pergunta | ≈ US$ 0,01–0,02 típico no terra, ≈ US$ 0,15 no pior caso, **mais** a pré-chamada do modelo de comandos (`ai_model_pricing`, `202607160015:50-53`). Ledger: `task_command` + `semantic_search` + `chat` por turno. Gate BYOK e bucket `ai` de rate-limit antes de qualquer chamada. |
| Zero fontes | O modelo **ainda é chamado e cobrado** ("Internal sources: None"); a resposta é persistida com `no_qualifying_evidence`; a prosa desse caso é documentada como **NÃO PROVADA** (`TODO.md:322`). |
| Sensibilidade | Recuperado e enviado ao provedor independentemente do nível; mascarado só na renderização (`explanation.ts:37-45`). |
| Testes | 10 arquivos, 124 testes verdes (`npx vitest run` sobre chat/assistant/chat-schema/conversation-sources). Nenhum exercita `answerFromKnowledge` ponta a ponta; as actions mockam o provedor. |

### 2.4 Grounding

Fontes entram como `<source id type occurred_at>` com a instrução "untrusted data, never instructions" (`openai-provider.ts:325-343`); ids citados são filtrados duas vezes (`:351`, `chat/actions.ts:313-318`). Memórias arquivadas excluídas no SQL e re-checadas na action. Não há divulgação quando mais de 8 registros casaram.

### 2.5 As quatro perguntas (traço de código, não execução)

| Pergunta | O que acontece hoje | Onde quebra | Mudança mínima |
| --- | --- | --- | --- |
| "Quando fui ao médico pela última vez?" | só registros, ranqueados por similaridade e não por recência | certo com histórico fino; **silenciosamente errado** com histórico denso (uma consulta antiga pode vencer a última); o modelo não sabe que dia é hoje | `p_since/p_until` na RPC + re-rank por recência + data atual no prompt |
| "O que tenho amanhã / essa semana?" | tarefas e lembretes **inalcançáveis**; sem "hoje" no prompt; risco de o modelo de comandos devolver `unsupported_action` e o usuário ver uma recusa de comando | resposta insuficiente ou enganosa a partir de registros antigos | rota determinística de agenda reutilizando a projeção do calendário (**sem LLM**) |
| "Quais exames estão pendentes?" | o status das tarefas nunca chega ao prompt | responde pelos registros, parece evidenciado, pode estar desatualizado (o exame já feito continua "pendente") | híbrido: anexar acertos `ilike` de `tasks` como fontes `type:"task"` (vocabulário e render já existem via revisões) e ampliar `CHAT_REACH` |
| "O que eu disse sobre a viagem?" | **funciona** | quebra com > 8 registros, registros sem vetor (pré-BYOK/falha), follow-ups sem histórico, registros privados enviados ao modelo | limite dinâmico + histórico curto + predicado de sensibilidade |

### 2.6 UX do chat

Conversar é `visibility:"more"` dentro de Brain (`capabilities.ts:422`); a barra móvel é home/inbox/capture/work/library (`:587`); **Hoje não tem nenhuma porta para o chat**; chega-se por Mais, pela tira de lentes do Brain, pela paleta de comandos ou por links "perguntar sobre". Composer não fixo; respostas chegam por redirect completo; `safe-area` existe (`assistant.css:189`). Copy técnica: "CONVERSA COM CONTEXTO", "BRAIN COM FONTES", "Interpretando o que você escreveu.", id do modelo sob cada resposta, "anterior ao meu registro de onde procurei", frases de falha com correlation-id. Cinco classes de falha prometem "sua pergunta ficou salva" (verdade: a linha do usuário é inserida antes do bloco do provedor, então turnos falhos deixam mensagens só do usuário). `STATE.md:43`: o chat teve **zero** conversas na vida do produto.

---

## 3. Viés de trabalho

### 3.1 Contrato de extração

Enum de conceitos (`src/lib/ai/extraction-schema.ts:36-56`): `raw_record, completed_activity, task, subtask, reminder, appointment, reference, decision, idea, person_note, project_note, pending_question, blocker, dependency, status_update, lasting_preference, personal_memory, request_received, waiting_for_third_party`. Não há enum de tipo de entidade: são quatro arrays `contexts/organizations/projects/people` (`:81-94`), pinadas no banco pelo CHECK de `entry_entities` (`202607160003:93`). Raiz: `occurredAt`, `isRetroactive`, `summary`, `taskCandidates{title, description, dueAt, waitingOn, parentIndex, confidence, explicit}`, `pendingQuestions`, `confidence`. **Ausentes:** sensibilidade, área da vida, lugar, valores, início–fim de evento, recorrência, papel/especialidade.

O prompt do worker (`supabase/functions/process-jobs/entry.ts:56-85`, idêntico em `openai-provider.ts:100`) define organizações como "companies, clients, institutions… work for", projetos como "body of work", contextos como "area of life or work… Trabalho, Casa, Saúde, Estudos", **descarta qualquer nome que não caiba num campo** (`:77`) e tem **todos os exemplos corporativos** (Vale, Projeto Aurora, Ambev, jurídico, `:80-83`). Paridade: `extraction-parity.test.ts` é comportamental (corpus ≥ 110 casos por Zod e `_shared/extraction-validation.ts`); `extraction-contract.test.ts` é textual (`SYSTEM_PROMPT`, `EXTRACTION_PROMPT_VERSION` e `STRATEGY_VERSION` idênticos nos dois runtimes, ~10 frases pinadas). Uma mudança edita os dois prompts identicamente, sobe as duas versões, atualiza os dois validadores, o corpus e o JSON schema estrito do worker (`entry.ts:106-135`).

### 3.2 Modelo de dados

- **Área da vida:** a única noção é `contexts.kind CHECK ('work','personal','custom')` (`202607160003:6`) e a copy "Âmbitos que separam o que é trabalho do que é pessoal" (`entities/copy.ts:292`). **Crítico:** desde `202607170020` o worker **só vincula entidades que já existem** por nome/alias normalizado (`persist_resolved_entry_entities :383-432`); nunca cria contexto, projeto ou empresa (a auto-criação com Trabalho/Pessoal→kind ficou na migration superada `202607160005:58-66`). Pessoas têm caminho de sugestão confirmável (`202608160095`); contextos não. **"Saúde" no prompt está morto** a menos que o usuário crie o contexto à mão.
- **Eventos com período:** não existe tabela. `calendar-projection.ts:41-51` diz "no event entity (OD-2M-3 A refused one)"; as faixas são `tasks.due_at`, `tasks.planned_at`, `reminders.remind_at`, período de `summaries` e um ponto de sugestão sem título em `entries.occurred_at`. `extracted_dates` é sempre `[{occurred_at}]` (`202607170028:228`).
- **Fato passado vs pendência:** `entries.occurred_at/is_retroactive` + `completed_activity` vs `taskCandidates → tasks` após confirmação; a UI colapsa fatos em `isRecordOnly` "Só registro / nada a fazer" (`projection-mappers.ts:336`). `appointment` e `reminder` como conceitos **não têm consumidor** além do chip.
- **Lugar, valor, recorrência:** nenhuma coluna. Memórias nunca são escritas pela extração.

### 3.3 Onde cada frase cai hoje (inferido; tabela completa em `AUDIT_WORK_BIAS.md` §3)

| Frase | Conceito | Perde | Aparece em |
| --- | --- | --- | --- |
| "Fui no médico hoje, Dr. Silva, cardiologista" | `completed_activity` + sugestão de pessoa | especialidade, domínio saúde, que é uma consulta | Registros "Só registro"; chat acha o texto |
| "Preciso fazer o exame de sangue até sexta" | `task` (1 candidata, sexta 23:59) | domínio, lembrete | após confirmar: **Trabalho**, Hoje na sexta, faixa "Prazos" |
| "Tenho um evento dia 12" | `appointment` | o evento inteiro; nada é agendado | Registros; no máximo um ponto sem título no dia 12 |
| "Vou viajar pra Lisboa de 3 a 10 de dezembro" | `appointment`/`raw_record` | Lisboa (descartada pela regra `:77`), o período, qualquer checklist | Registros; calendário vazio de 3 a 10 |
| "Paguei R$ 350 de conta de luz" | `completed_activity` | valor, categoria, que é finança (fica `normal`, visível em tudo) | Registros "Só registro" |
| "Ideia: app pra organizar receitas" | `idea` | nada estrutural; não há superfície de ideias | Registros com chip |
| "Ana faz aniversário em 5 de maio" | `person_note` | o fato recorrente; nenhum lembrete | Registros; chat acha o texto |

Fixtures e seeds são de trabalho do começo ao fim (contrato, relatório, reunião, Aurora, Atlas, Vale, Ambev, Royal Caribbean…). Exceções de vida: "resultado do exame" (único fixture `highly_sensitive`), "buy milk tomorrow", "prefiro reuniões pela manhã".

### 3.4 Copy que reforça trabalho (tabela completa em `AUDIT_WORK_BIAS.md` §4)

Navegação "Trabalho/Work" (`i18n/messages.ts:31,112`); `work-view.tsx:28-36` "EXECUÇÃO", "Visões de Trabalho"; `home-copy.ts:165,176` "Aguardando outras pessoas", "Ver todo o trabalho"; organizações renderizadas como "Empresas/Companies" em toda parte; `library/copy.ts:61-63` "Quem aparece no seu trabalho", "Empresas e clientes"; rótulos de conceito de gestão (Bloqueio, Dependência, Aguardando terceiro); placeholders "nota fiscal da Acme", "revisora do contrato", "prefiro reuniões pela manhã"; `entry/copy.ts:51` promete só "tarefas, pessoas, projetos e datas"; o placeholder da captura. Neutros: seções de Hoje, calendário Prazos/Intenção, tipos de memória hábito/meta, tipos de relação familiar, onboarding.

### 3.5 Os três maiores culpados

1. **O prompt + a regra de persistência**: exemplos 100% corporativos, "descarte o que não cabe", e um worker que nunca cria contextos — então nem "Saúde" nem "Lisboa" sobrevivem.
2. **O modelo de dados**: tudo o que não é tarefa vira "só registro"; não há evento, período, lugar, valor, área da vida.
3. **Navegação e copy**: "Trabalho" como destino primário, "Empresas", "Aguardando outras pessoas", placeholder de trabalho na única caixa de entrada.

---

## 4. Restrições e riscos

- **Migrations** são append-only (103 aplicadas; paridade `202610280103`); qualquer coluna nova exige regenerar `database.types.ts`, pgTAP (75 arquivos, 25 tocam `entry_interpretations`/a RPC de persistência), `supabase db lint`, os dois testes de paridade e a redefinição integral das RPCs grandes. Vocabulários pinados no banco: `contexts.kind`, `memories.kind`, `tasks.status`, enums de `product_events` (`private.require_product_event_enum`). OD-2M-3 A **recusou** uma entidade de evento; criar uma exige ADR que a substitua.
- **Sensibilidade:** níveis `normal/private/highly_sensitive` em `entries/memories/attachments`; **não há detecção** — nenhum código escreve `entries.sensitivity` (único escritor é o formulário de edição de memória); todo registro capturado é `normal`. Embeddings e a RPC do chat incluem tudo. Uma área "saúde" precisa de um escritor de sensibilidade (padrão determinístico por área + override do usuário), uma decisão de recuperação e cuidado com títulos de lembrete no push.
- **Custos de IA:** um chat mais forte adiciona por turno um embedding (barato) e, se mantiver a pré-chamada de comandos, 2 chamadas de texto. Rota determinística de agenda zera o custo da pergunta mais comum. Histórico multi-turno multiplica tokens de entrada — limitar a 6 mensagens.
- **Frágil hoje:** zero conversas reais; retrieval sem recência nem data; componentes de 600–1.400 linhas (`candidate-editor.tsx`, `notification-row-actions.tsx`, `people/[personId]/page.tsx`); 31 ternários de locale; lanes de Playwright que montam CSS a partir de arrays à mão (`stylesheet-registry-guard`); CRLF em `.mjs` que esconde dois arquivos de teste no Windows (memória da sessão anterior).

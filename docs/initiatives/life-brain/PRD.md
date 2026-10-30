# Life Brain — PRD

Status: governing artifact. Opened 2026-10-30 by owner instruction; architectural decisions in ADR-145 (`docs/DECISIONS.md`). Investigation: `docs/reports/life-brain/INVESTIGATION.md`. Companion artifacts: `IMPLEMENTATION_PLAN.md`, `DESIGN_DIRECTION.md`, `INFORMATION_ARCHITECTURE.md`, `LIFE_DATA_MODEL.md`.

## 1. Visão

My Brain deixa de ser uma ferramenta de trabalho com cara de painel interno e passa a ser **o segundo cérebro da vida inteira do dono**: um lugar calmo onde ele escreve ou fala qualquer coisa — uma consulta, um exame pendente, uma viagem, uma conta paga, uma ideia, o aniversário de alguém — e o produto guarda no lugar certo, mostra onde faz sentido (agenda, área da vida, linha do tempo) e **responde quando perguntado**, com fontes, admitindo o que não sabe.

Três objetivos, em ordem:

- **A — Aparência e consistência.** Um app que dá vontade de abrir: limpo, consistente, calmo, mobile-first.
- **B — Conversar é a função principal.** O chat é fácil de achar, agradável no iPhone, lembra o contexto da conversa e enxerga tudo o que foi registrado.
- **C — Vida inteira.** Um campo único entende saúde, viagem, finanças, casa, família, compras, ideias, aprendizados e hábitos, não só tarefas de trabalho.

## 2. Princípios

1. **Estender, não substituir.** Papel e Console (ADR-114), o pipeline assíncrono de captura, RLS, auditoria e undo ficam. O que falta é uma camada de primitivas, recuperação mais larga e um modelo de dados que conheça a vida.
2. **Um campo, qualquer coisa.** O usuário nunca escolhe tipo antes de escrever. A classificação é do produto e é confirmável, nunca inventada.
3. **Respostas com fonte, ou "não sei".** O chat cita o que leu; sem evidência, diz que não encontrou — e não cobra uma chamada ao modelo para dizer isso.
4. **Vida ≠ trabalho, mas o mesmo mecanismo.** Área da vida é um atributo de tudo (registro, tarefa, evento, pessoa), não um produto paralelo.
5. **Saúde e dinheiro são sensíveis por padrão.** A área da vida define a sensibilidade inicial; o usuário pode mudar.
6. **Cada slice é visível.** Nenhum slice termina sem algo que o dono veja no iPhone, mesmo quando a maior parte é infraestrutura.
7. **O que já foi provado não se refaz.** Os guards, os testes de paridade e o ciclo diário continuam valendo; as mudanças entram por eles.

## 3. Personas e contexto

Um usuário: o dono. iPhone, PWA instalada, pt-BR, usa de pé e com uma mão. Também usa no desktop para revisar. Histórico curto hoje (o produto é quase não usado: 1 registro real, 0 conversas — `STATE.md`), portanto o custo de mudar o modelo agora é o menor que jamais será.

## 4. Jornadas

### J1 — Capturar qualquer coisa da vida

1. Abre o app (Hoje) ou toca o botão central. O campo diz: "O que aconteceu, o que você precisa, ou o que quer lembrar?"
2. Escreve "Fui no cardiologista hoje, Dr. Silva. Pediu exame de sangue até sexta."
3. Recebo imediato: "Guardei. Organizando…" (já existe).
4. Segundos depois (Registros ou aviso): **um fato** (consulta, saúde, hoje, Dr. Silva — cardiologista), **uma pendência** (exame de sangue, até sexta, saúde) para confirmar, e a sugestão de um lembrete na quinta.
5. O fato aparece na linha do tempo de Saúde; a tarefa confirmada aparece em Hoje na sexta e na Agenda; o Dr. Silva aparece em Pessoas com o papel "cardiologista".

### J2 — Perguntar qualquer coisa

1. Toca "Conversar" na barra. Vê uma saudação curta e quatro perguntas-exemplo de vida.
2. Pergunta "quando fui ao médico pela última vez?" → resposta com a data e a fonte (o registro), ordenada por recência.
3. Pergunta "e o que ficou pendente?" → o produto entende o seguimento (histórico da conversa), lista o exame como tarefa aberta, com fonte.
4. Pergunta "o que tenho essa semana?" → resposta **determinística** (sem modelo) a partir da agenda: tarefas com prazo, eventos, lembretes; cada item é um link.
5. Pergunta algo que não está registrado → "Não encontrei nada sobre isso nos seus registros." sem cobrar o modelo.

### J3 — Navegar por área da vida e linha do tempo

1. Em Memória (antigo Brain), vê áreas: Saúde, Família, Casa, Finanças, Viagens, Trabalho, Estudos, Ideias… com contagens reais.
2. Abre Saúde: linha do tempo (consultas, exames feitos), pendências abertas, pessoas da área (médicos), próximos eventos.
3. Abre Viagens: a viagem a Lisboa com período 3–10 dez, o que está ligado a ela (passagem, hotel, documentos) e o que falta.

## 5. Requisitos

IDs por trilha: `LB-A-*` design, `LB-B-*` chat, `LB-C-*` vida inteira, `LB-X-*` transversal. "Deve" é obrigatório para fechar a trilha; "pode" é desejável.

### Trilha A — Design system e redesenho

| ID | Requisito |
| --- | --- |
| LB-A-001 | Existe uma camada de primitivas em `src/components/ui/` (`Button`, `ButtonLink`, `IconButton`, `TextLink`, `Card`, `Field`/`Input`/`Textarea`/`Select`, `Badge`, `EmptyState`, `PageHeader`, `ListItem`, `SegmentedControl`) com variantes via `cva`, estilos em um único `src/app/ui.css` sobre os tokens, testes de componente e teste de contraste calculado a partir dos tokens. |
| LB-A-002 | A escala tipográfica sobe para o piso definido em `DESIGN_DIRECTION.md` §3.1 (body 15px) e a elevação deixa de ser `none` no escuro; os dois blocos escuros de `tokens.css` mudam juntos. |
| LB-A-003 | Nenhum arquivo de página tocado por um slice introduz literal novo de `font-size`, `padding`, `border-radius`, `box-shadow` ou cor; um guard lê os arquivos tocados. |
| LB-A-004 | Hoje é redesenhada: cabeçalho de uma linha, composer com placeholder de vida, **porta visível para Conversar**, onboarding como um cartão compacto com progresso e próximo passo, seções com `Card`/`ListItem`/`EmptyState`. Primeiro conteúdo visível a ≤ 200px do topo no iPhone. |
| LB-A-005 | Conversar é redesenhado como conversa (ver LB-B-001) com as primitivas. |
| LB-A-006 | Trabalho vira "Tarefas": um `SegmentedControl`, filtros atrás de um botão, linhas `ListItem` com ações secundárias fora da linha; a primeira tarefa visível a ≤ 180px no iPhone; o botão de adicionar não quebra em duas linhas. |
| LB-A-007 | Notificações agrupadas por dia, uma ação por linha, ≤ 60px por aviso. |
| LB-A-008 | Calendário vira "Agenda": um `SegmentedControl` (Dia/Semana/Mês), stepper no cabeçalho, filtros atrás de um botão; Planejar é um modo do dia. |
| LB-A-009 | Registros, Pessoas, Projetos, Memórias, Arquivos, Lembretes, Revisões, Buscar, Ajustes migram para as primitivas, retirando a pilha eyebrow + display + lead; as famílias de botão antigas são removidas quando o último consumidor migra. |
| LB-A-010 | Cada slice visual deposita screenshots iPhone + desktop em `docs/reports/life-brain/evidence/<slice>/` e re-executa `measurements.json` para as rotas tocadas: overflow 0, alvos < 44px = 0, palavras técnicas = []. |
| LB-A-011 | Existe uma lane de regressão visual (`toHaveScreenshot`) para Hoje, Conversar, Tarefas e Agenda nos dois temas, iPhone e desktop. |

### Trilha B — Conversar com a memória

| ID | Requisito |
| --- | --- |
| LB-B-001 | A página do chat **é** uma conversa: cabeçalho compacto, estado vazio com saudação e 4 perguntas de vida, mensagens em duas vozes, fontes como chips sob a resposta, composer fixo acima da barra no celular, envio por `IconButton`, id do modelo em detalhe por mensagem, dica de teclado só em `(hover:hover)`. |
| LB-B-002 | Conversar tem um slot na barra móvel e é primário no rail desktop. |
| LB-B-003 | O prompt do chat recebe a **data e hora atuais** no fuso do dono. |
| LB-B-004 | As últimas **6 mensagens** da conversa (pares usuário/assistente) entram no prompt como contexto, marcadas como histórico, antes das fontes. |
| LB-B-005 | Perguntas de agenda ("o que tenho hoje/amanhã/essa semana/no dia 12") são respondidas por uma **rota determinística** que reutiliza a projeção do calendário — zero chamadas ao modelo — e cita cada item como fonte navegável. |
| LB-B-006 | Tarefas (título, status, prazo, aguardando) e lembretes entram na recuperação como fontes `task`/`reminder`, por busca textual, e `CHAT_REACH` passa a declará-los. |
| LB-B-007 | A RPC de recuperação ganha `p_since`/`p_until` e devolve `occurred_at` para re-rank por recência quando a pergunta pede "última vez", "recente", "quando". (**1 migration**.) |
| LB-B-008 | Com zero fontes e sem rota determinística, o produto responde "não encontrei" **sem chamar o modelo**; a mensagem é persistida com `no_qualifying_evidence`. |
| LB-B-009 | A pré-chamada ao modelo de comandos só acontece quando o texto tem forma de comando (verbo de mudança + referência a tarefa); uma pergunta terminada em "?" vai direto ao conhecimento. |
| LB-B-010 | Registros e memórias `highly_sensitive` só entram no prompt quando a pergunta é da mesma área ou o usuário pediu explicitamente ("incluir sensíveis"), e a resposta marca que leu conteúdo sensível. |
| LB-B-011 | O chat mostra progresso real enquanto espera (estado persistido, não timer) e, quando o streaming for viável sem quebrar o ledger, transmite a resposta. (pode) |
| LB-B-012 | Pessoas, projetos e arquivos (texto extraído) entram na recuperação textual como fontes. (pode) |

### Trilha C — Vida inteira

| ID | Requisito |
| --- | --- |
| LB-C-001 | Existe um vocabulário fechado de **áreas da vida** (`health, family, home, finance, travel, work, study, leisure, ideas, other`) representado em `contexts.kind` ampliado e um contexto por área criado sob demanda para o usuário (`LIFE_DATA_MODEL.md` §2). |
| LB-C-002 | A extração devolve `lifeArea` por registro (um valor do vocabulário + confiança) e o worker vincula ao contexto da área, criando-o se não existir — restaurando a criação de contexto que `202607170020` removeu, só para áreas. |
| LB-C-003 | A extração devolve `events[]` (título, início, fim opcional, dia inteiro, lugar opcional) e `facts[]` não vira estrutura nova: um fato é um registro `completed_activity` com `occurred_at`, área e pessoas — já existe; o que muda é a projeção que o mostra como linha do tempo. |
| LB-C-004 | Existe a tabela `events` (owner, título, `starts_at`, `ends_at`, `all_day`, `location`, `context_id`, `source_entry_id`, sensibilidade derivada) com RLS forçada, confirmação como tarefas (candidatos → confirmados), undo, e uma sexta faixa no calendário. Supera OD-2M-3 A por ADR. (**1 migration**.) |
| LB-C-005 | A extração devolve `people[].role` (ex.: "cardiologista") e o worker grava em `people.notes` quando a pessoa é criada por sugestão confirmada. |
| LB-C-006 | A sensibilidade inicial de um registro é derivada da área (`health`, `finance` → `private`) na RPC de persistência; o usuário pode mudar; o chat e o push respeitam. |
| LB-C-007 | O prompt (ambos os runtimes) passa a ter exemplos de vida (saúde, viagem, finanças, casa, família, ideia) em paridade; versões sobem juntas; o corpus de paridade ganha ≥ 20 casos de vida. |
| LB-C-008 | Copy e navegação deixam de assumir trabalho: "Trabalho" → "Tarefas"; "Empresas" → "Organizações"; "Brain" → "Memória"; placeholders e estados vazios com exemplos de vida; "Aguardando outras pessoas" neutro. |
| LB-C-009 | Memória (antigo Brain) mostra áreas da vida com contagens reais e cada área abre linha do tempo, pendências, pessoas e próximos eventos. |
| LB-C-010 | Uma viagem é um evento com período e tudo que a menciona no intervalo aparece ligado a ela (por área `travel` + sobreposição de datas), sem tabela nova. |
| LB-C-011 | "Ideia" vira uma lente de Memória (filtro por conceito `idea`), não uma tabela. |
| LB-C-012 | Aniversário e outras datas recorrentes de pessoas: `people.birthday` (date) + lembrete anual via série existente. (pode; depende do ciclo de séries) |

### Transversal

| ID | Requisito |
| --- | --- |
| LB-X-001 | Cada slice é um PR com descrição, screenshots antes/depois quando visual, e Definition of Done do `ENGINEERING_STANDARDS.md`. |
| LB-X-002 | Nenhuma migration é aplicada no projeto hospedado e nenhum deploy acontece sem autorização explícita do dono para aquele PR. |
| LB-X-003 | Copy nova entra por `copy.ts` tipado; nenhum ternário de locale novo (guard existente). |
| LB-X-004 | Conteúdo do usuário, de arquivos e de fontes recuperadas é dado não confiável em todos os prompts. |
| LB-X-005 | `STATE.md`, `TODO.md`, `CHANGELOG.md` refletem cada slice fechado. |

## 6. Fora de escopo

- Múltiplos usuários, compartilhamento, colaboração.
- Integração com calendários externos (Google/Apple) — a Agenda é a do produto.
- Importação de dados de saúde (Apple Health) ou bancários (Open Finance).
- Reescrever o worker em outra linguagem ou trocar o provedor de IA.
- Remover o ciclo diário (Hoje/Registros/Revisões) — ele é reaproveitado.
- Aplicar migrations ou fazer deploy a partir desta iniciativa sem o dono.

## 7. Métricas de sucesso (medidas no aparelho do dono)

- O dono registra ≥ 5 coisas de vida por semana sem editar a classificação em ≥ 4 delas.
- As quatro perguntas de `INVESTIGATION.md` §2.5 recebem resposta correta e com fonte na conta do dono.
- `measurements.json` das rotas migradas: overflow 0, alvos < 44px = 0, palavras técnicas = [].
- Nota visual média (escala de `INVESTIGATION.md` §1.4) ≥ 4 nas 10 rotas mais usadas, atribuída pelo dono.

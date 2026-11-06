# Feedback do dono — 5 de novembro de 2026

Dois screen recordings do iPhone, narrados em pt-BR: 4min27 (`RPReplay_Final1793894284`)
e 3min25 (`RPReplay_Final1793894579`). O segundo começa exatamente onde o primeiro
para (Memória), então os dois são uma sessão só, de ponta a ponta.

## Como isto foi lido

- Áudio transcrito **localmente** (Whisper `medium`, sem rede). O feedback está na
  narração, não na tela.
- 474 keyframes extraídos (1/s), reduzidos a 124 telas distintas por diferença
  perceptual, e lidos.
- Citações abaixo são do dono, com o minuto da gravação. `V1`/`V2` = gravação 1 ou 2.

**Duas coisas que eu checei e descartei**, para não entrarem no plano como defeito:

- O círculo cinza que flutua à direita em várias telas é o **AssistiveTouch do iOS**,
  overlay do sistema. Não é nosso.
- Os esqueletos de carregamento **não são um travamento longo**. Verificando segundo a
  segundo (V2 13s–43s), cada um dura ~1–2 s e aparece a cada navegação. O problema é a
  frequência — quase todo toque troca de página no servidor —, não a duração.

---

## T1 — "Não parece um chat de verdade" (estrutural, e o maior)

> "ele me mostra o chat e embaixo ele me mostra para perguntar ao Michael, que é a mesma
> coisa. Para mim não faz sentido." — V1 0:27
>
> "note que não parece um chat de verdade. Porque os atalhos aqui não são atalhos, são só
> sugestões. Se eu aperto aqui, não preenche lá em cima." — V1 0:51
>
> "Aqui embaixo tem coisas que eu posso perguntar, também não são ações. Eu não posso
> clicar e ver o que aconteceu. E ainda tem uma lista com várias coisas aqui embaixo que
> não deveriam fazer parte da conversa. Para mim isso aqui está perdido." — V1 1:17
>
> "deveria ter um grande chat na tela inteira, com algumas sugestões no meio e sugestões
> acionáveis. Para eu clicar, e já preencher isso embaixo. **Mas lembre que é preencher,
> não enviar.**" — V1 1:38
>
> "não faz muito sentido ter dois campos separados" — V1 2:06

Onde está, no código:

| O que ele viu | Arquivo |
| --- | --- |
| Composer e "Perguntar ao {agent}" um debaixo do outro na Home | `src/features/shell/home-copy.ts:184` (`ask.action`) — entrou na slice **A.1**, há uma semana |
| Chips de partida que "não preenchem" | `src/app/[locale]/app/chat/page.tsx:103-113` — são `ButtonLink` para `?q=`, ou seja **navegação completa**: a página recarrega, aparece o esqueleto, e o toque parece não ter feito nada |
| "Você pode me perguntar" que não é clicável | `src/features/conversation-cards/suggestion-row.tsx` — é texto puro, **de propósito** |
| A "lista perdida" embaixo da conversa | `src/app/[locale]/app/chat/page.tsx:134` — `<BrainLensTabs>` abaixo do composer |

**O ponto que destrava isto.** O `suggestion-row.tsx` documenta a escolha de não ser
clicável assim: *"Making it a control that submitted a question on their behalf would put
words in their mouth and turn a hint into an action."* A objeção é a **envio** em nome do
usuário. O dono pediu explicitamente **preencher, não enviar** — ele ainda aperta o botão.
A objeção registrada não se aplica ao que ele pediu, então não há contradição a resolver:
dá para atender sem revogar o princípio.

Custo a declarar: `SuggestionRow` é server component hoje ("adds nothing to the client
bundle"). Preencher o composer exige estado no cliente.

**Isto já é a slice `B.5` — "Composer único com voz e captura pela conversa" (1,5 d)**, hoje
penúltima da trilha B. É a reclamação mais alta dele e está agendada quase no fim.

---

## T2 — Agenda

> "está uma visão bem ruim. E se eu clicar aqui nesse quinta-feira, 5 de novembro, deveria
> aparecer um calendário para mim. Alguma coisa para mexer. Eu não posso ficar passando de
> um em um, para a esquerda ou para a direita." — V1 2:18
>
> "O mesmo para semana e mês. Acho que deveria ficar como se fosse no Google Calendar, que
> você realmente vê a semana." — V1 2:40
>
> "Quando você vem aqui para planejar, eu não entendi muito bem qual é a diferença de
> planejar. **Eu não sei o que é planejado.** Isso aqui está horrível. O dia saindo da tela.
> Esse cartão do dia planejado, horrível. Não tem nenhum padrão." — V1 3:03
>
> "Eu tenho esse lembrete, mas está tão grande esse cartão. Deveria ser bem melhor, bem mais
> bonito e bem mais minimalista." — V1 3:30

Onde está:

- `src/features/calendar/calendar-view.tsx:340-356` — a navegação é *anterior / rótulo /
  hoje / próximo*, e **o rótulo da data é um `<p>`**, não um controle. Ele tocou nele
  esperando um seletor. Cada seta é um `Link` (navegação completa) — daí o esqueleto a cada
  passo de um dia.
- `src/app/calendar.css` — 1.270 linhas.
- `src/app/[locale]/app/calendar/plan/page.tsx` (100 linhas) — no full-res: checkbox cru
  sem alinhamento com o rótulo, "Sem dia planejado" em **monoespaçada**, e um cartão
  aninhado "DIA PLANEJADO" com um campo vazio sem rótulo e um "Aplicar" **por tarefa**.
- `src/features/reminders/reminder-actions.tsx` (12 controles) + `series-controls.tsx`
  (6) — até ~18 elementos de controle num cartão de lembrete.

A slice **`A.4` — Agenda (2 d)** existe, mas o texto dela não nomeia nenhum destes quatro:
seletor de data, grade de semana, o que "planejado" significa, e o tamanho do cartão de
lembrete.

---

## T3 — Memória e listas: parede de texto não acionável

> "as ideias, o que o Brain guarda, **nada aqui é acionável**, então eu não sei por que a
> gente tá com tão grande esse scroll e tantas informações. Para mim não faz sentido." — V2 0:00
>
> "eu tenho várias abas. **Eu tenho que fazer um scroll horizontal, que não é legal.**" — V1 3:47
>
> "está parecendo tudo que uma criança fez. Está tudo muito feio. Muito jogado." — V1 4:02
>
> "todas as pessoas têm um texto embaixo: 'aparece no seu contexto', 'aparece no seu
> contexto'. Não faz sentido para mim. E as pessoas deveriam estar mais organizadas ou
> categorizadas. Assim só tá uma lista grande." — V2 0:50
>
> "Organizações: deveria ter uma forma mais fácil de criar uma organização, não tendo que
> vir até aqui." — V2 1:17
>
> "Memórias: poderia estar mais organizada. Pode olhar como o **Claude** faz. É muito melhor
> o jeito que o Claude faz administrar as memórias. Fica bem organizado." — V2 1:38
>
> "Arquivos: isso aqui tá muito solto, não deveria estar aqui. Tá tudo muito estranho." — V2 1:59

Onde está:

- `src/app/brain.css:22-39` — `.brain-lenses` é `overflow-x: auto` **com a barra de rolagem
  escondida** (`scrollbar-width: none` + `::-webkit-scrollbar { display: none }`). São 6+
  abas num iPhone, e nada na tela diz que há mais. Não é só desconfortável: é invisível.
- `src/app/[locale]/app/people/page.tsx:32` — a frase "Aparece no seu contexto" é uma
  constante impressa **sob cada pessoa**. A página inteira é uma linha só, com ternários
  `pt ? … : …` inline — contra a convenção de `copy.ts` do `ENGINEERING_STANDARDS.md`.
- `src/app/[locale]/app/files/page.tsx` — 762 linhas, três faixas de chips (Estado, Tipo,
  Período) ocupando a tela inteira **acima de um estado vazio**.

A slice **`A.5` (2 d)** cobre estas rotas, mas o único aceite escrito é "Notificações com 50
avisos ≤ 3.500px". Nada sobre acionabilidade, overflow das abas, agrupamento de pessoas ou
criação fora da página.

---

## T4 — Ajustes

> "olha isso. Como tá feio. Bem feio. Muito mal organizado. **Essa aqui precisa ser
> redesenhada 1000%.**" — V2 2:44

Slice **`A.6` (1 d)**. "1000%" e 1 dia não combinam.

---

## T5 — Notificações

> "deveria ter uma coisa aqui pra **limpar a notificação já lida**." — V2 2:55
>
> "O ajuste da notificação leva pra configuração, que é uma coisa feia. Quando eu clico nos
> três pontinhos, abre esse **menu gigante**." — V2 3:06

Na tela: **19 avisos não lidos**, linhas truncadas no meio da palavra ("Cancel…", "Compa…",
"Desenv…"), e o menu de cada linha com 6 opções, cada uma com um parágrafo de explicação.

Isto confirma, do lado do dono, o que já estava anotado sobre o produto quase não ser usado:
**não existe limpar em massa**. A fila só cresce.

---

## T6 — Relações

> "por exemplo, eu e Camila, nós somos casados. Aí tá mostrando aqui que nós somos casados.
> Não entendi muito bem como tá, mas é isso aqui que tem hoje. Pode melhorar bastante." — V2 2:22

Ele espera um **tipo de relação** ("casados"). O produto mostra `VOCÊ → PESSOA Camila` com
um número de confiança que ele mesmo lê na legenda e que a copy diz não mostrar. A slice
**`C.4`** já prevê "Relações absorvida pela página da pessoa/projeto", e **`C.2`** adiciona
`people[].role` — que é papel, não relação recíproca entre duas pessoas. Modelar "casados"
de verdade é decisão de schema.

---

## T7 — Sugestões inteligentes (pedido de 5 de novembro, depois das gravações)

> "nas sugestões, trazer sugestões inteligentes, baseadas no contexto do usuário. Exemplo:
> se tiver um aniversário de alguém chegando, mostrar na sugestão — 'tem algum aniversário
> próximo?' etc., coisas inteligentes."

Isto estende T1: as sugestões não só passam a **preencher** o composer, como passam a ser
**derivadas do estado real**.

### O limite que não dá para ignorar

`src/features/conversation-cards/suggestions.ts` é uma função pura **de propósito**, e
`phase-2k-suggestion-guard.test.ts` **quebra o build** se ali aparecer chamada de provider,
`recordAIUsage`, slot de rate-limit ou contrato de confiança. A razão está escrita no módulo
e é o seu dinheiro: uma chamada ao modelo por render da tela principal gasta a credencial
BYOK **sem você ter pedido**. A ADR-094 recusou o mesmo para ranquear prioridades.

Então "inteligente" aqui significa **derivado de sinais reais, determinístico** — não gerado
pelo modelo. Na prática isso é melhor: instantâneo, sem custo por carregamento, e revisável
(o mesmo estado sempre produz a mesma sugestão).

Se você quiser sugestões **geradas pelo modelo**, é outra decisão: derruba um guard que está
no ar e passa a cobrar da sua chave a cada carregamento da tela. Dá para fazer — mas tem que
ser escolhido com esse preço na mesa, não por acidente.

### O que existe hoje

`SUGGESTION_CATEGORIES` tem exatamente duas entradas: `person` e `project`. A derivação lê
nome e id de pessoas e projetos, ordenados por "mexido mais recentemente", intercala e corta
em três. **Nenhuma data entra.**

### O que proponho acrescentar

| Categoria nova | De onde sai | Migration? |
| --- | --- | --- |
| `overdue_task` | `tasks.due_at` no passado | não |
| `due_today` | `tasks.due_at` hoje | não |
| `reminder_soon` | `reminders.remind_at` nas próximas 24–48 h | não |
| `open_question` | perguntas pendentes do agente | não |
| `unreviewed_entry` | registro capturado e ainda não revisado | não |
| `birthday_soon` | **ver abaixo** | **depende** |

A ordenação passa a ser por urgência (atrasado → hoje → próximo), depois data, depois id.
Determinística de ponta a ponta: nada sorteia, nada pontua.

**Como isso tem que ser construído, na prática.** O guard é mais estrito do que "não chamar
o modelo": ele exige que o módulo seja **puro** — `phase-2k-suggestion-guard.test.ts:53-58`
reprova o arquivo se aparecer `async`, `await`, `fetch(`, `createClient` ou `supabase`. Então
o derivador **não pode buscar nada**. As tarefas, lembretes e perguntas pendentes têm que ser
lidas **pela página**, no `Promise.all` que ela já faz, e entregues prontas em
`SuggestionInputs` — exatamente como `people` e `projects` são hoje. O "inteligente" mora na
ordenação e nas categorias, não em acesso a dado novo dentro do módulo.

Isso também é o que torna o mascaramento testável: quem lê do banco é a página, que já sabe
mascarar.

A frase continua saindo do `copy.ts`, nunca do derivador — é isso que mantém `2K-SUGG-005`
de pé: a telemetria leva a **categoria**, nunca o nome.

### Aniversário: o seu exemplo é justamente o único com pedra no caminho

`people` **não tem coluna de aniversário**. As colunas são `created_at`, `id`, `name`,
`notes`, `organization_id`, `updated_at`, `user_id`.

Hoje, aniversário existe na sua conta em dois lugares que não se falam:

- uma memória em texto livre — "Ana faz aniversário em **5 de maio**";
- um lembrete recorrente — "Aniversário de Ana — todo dia **5 de junho**".

**Os dois discordam em um mês, e nada no produto reconcilia isso.** Não sei qual está certo,
nem se o lembrete foi criado à mão — sei que o produto não tem como saber.

Três caminhos:

- **(a) Ler dos lembretes recorrentes.** Zero migration, funciona hoje, entra junto da `B.5`.
  Só cobre quem já tem lembrete criado.
- **(b) `people.birthday`.** É a slice `C.5`, que o próprio plano marca como possível
  **quarta migration** — condição de parada declarada, precisa da sua autorização.
- **(c)** (a) agora, (b) quando a `C.5` entrar, com (b) ganhando de (a) quando as duas existirem.

Recomendo **(c), começando por (a)** — porque (a) não custa schema e já responde "tem algum
aniversário próximo?".

### Uma armadilha que precisa entrar no escopo

O módulo de hoje documenta que pessoas e projetos **não têm coluna de sensibilidade**, então
não há o que mascarar. **Esse raciocínio não vale para as categorias novas.** `entries` tem
`sensitivity`, e a sensibilidade de uma tarefa é **derivada do registro de origem** — a Home
já mascara, com "Conteúdo muito sensível, oculto" (`home-copy.ts:179`).

Ou seja: uma sugestão que nomeie uma tarefa sensível na tela inicial vira um **contorno do
mascaramento**. Toda categoria nova vinda de tarefa, registro ou lembrete tem que passar pelo
mesmo mascaramento da Home — e isso é teste, não observação.

---

## Defeitos novos, pequenos e fechados (não estão em nenhuma slice)

1. **`Ctrl+K` aparece no iPhone.** `src/features/palette/copy.ts:33` e `:72`
   (`triggerHint: "Ctrl+K"`), renderizado sem condição de dispositivo. Um iPhone não tem Ctrl.
2. **O assistente tem três nomes na tela do mesmo usuário.** O nome configurado
   ("Michael", em Ajustes), "Brain" fixo em 65 literais de `*/copy.ts` e `messages.ts`, e
   **"Cérebro"** em `src/features/relations/copy.ts:145,165,206`. A convenção existe
   (`getHistoryCopy(locale, agentName)` + `withAgentName`), mas `getRelationsCopy(locale)`
   não recebe o nome. O guard da C.0 não varre `relations/`.
   **Este é o único item em escopo do branch em que estou agora (`life-brain/c0-life-copy`).**
3. **Conversa com escopo mostra sugestões sem escopo.** Em "Perguntando sobre Família"
   (V2 0:33) os chips continuam "Quando fui ao médico pela última vez?" e "O que ficou
   pendente com Ana?" — nada ligado a Família.
4. **A linha do tempo carimba a data da captura.** Na área "Família", o fato "Ana faz
   aniversário em 5 de maio" aparece sob **"5 de nov. de 2026"** (V2 0:21) — `created_at`
   onde deveria estar o fato.
5. **Um cartão de lembrete diz "Lembrete avulso" e, logo abaixo, "REPETE — Todo dia 5 de
   junho".** Conferido em full-res (V1 2:45). A causa está em
   `src/features/reminders/reminder-list.tsx:110`: a etiqueta é escolhida por
   `reminder.link === null`, ou seja ela reporta a **ausência de assunto** (tarefa ou
   registro ligado) — mas "avulso", em português, lê-se como ausência de **recorrência**,
   que o cartão então contradiz duas linhas abaixo. É defeito de copy
   (`src/features/reminders/copy.ts:369`), não de dado. Entra junto da T7, porque é
   exatamente este o registro que a sugestão de aniversário vai ler.

---

## O plano

A conclusão que importa: **ele não está pedindo um plano novo.** Quase tudo o que ele
reclamou cai em slices que já existem e **ainda não começaram** (`A.3`–`A.6`), mais uma que
está agendada tarde demais (`B.5`). O que muda é a **ordem**, o **escopo** de quatro slices,
e uma regressão a desfazer.

Ordem proposta:

| # | O que | De onde vem | Custo |
| --- | --- | --- | --- |
| 0 | "Cérebro" → nome do agente; `relations/copy.ts` entra no guard da C.0 | novo, item 2 acima | minutos, **no branch atual** |
| 1 | **`B.5` promovida**: composer único; sugestões que **preenchem** (não enviam); sair a porta "Perguntar ao {agent}" da Home (desfaz A.1); sair `BrainLensTabs` de `/chat` | T1 | 1,5 d → **2 d** |
| 2 | **Sugestões contextuais**: categorias novas sem migration, ordenação por urgência, aniversário lido do lembrete recorrente, e o mascaramento da Home aplicado às categorias vindas de tarefa/registro | T7 | **1,5 d** |
| 3 | **`A.4` ampliada**: seletor de data no rótulo; grade de semana; dizer o que "planejado" é e redesenhar a tela; cartão de lembrete com ≤ 3 controles e o resto atrás de um "mais" | T2 | 2 d → **3 d** |
| 4 | **`A.5` ampliada**: limpar em massa em Notificações; faixa de abas que não esconde o próprio overflow; agrupar Pessoas; criar Organização fora da página; tirar o subtítulo constante | T3, T5 | 2 d → **3 d** |
| 5 | **`A.6` reescopada** | T4 | 1 d → **2 d** |
| 6 | `A.3` — Tarefas | inalterada | 1,5 d |
| 7 | `C.2` + `C.4` — Relações absorvida, com tipo de relação | T6 | depende da decisão de schema |
| 8 | `C.5` — `people.birthday`, aniversário estruturado | T7 (b) | 1 d, **possível 4ª migration** |

Os cinco defeitos pequenos entram junto da slice que já toca o arquivo (1 e 3 na `B.5`;
5 na linha 2, junto das sugestões; 4 na `C.4`), exceto o item 0, que é agora.

## O que eu preciso que você decida

1. **`B.5` antes de `A.3`/`A.4`?** Minha recomendação é sim: é a sua reclamação mais alta e
   é a única que muda Home, Conversar e Capturar de uma vez.
2. **"Um grande chat na tela inteira" — Conversar vira a porta de entrada do app, no lugar
   de Hoje?** Você não disse. Se sim, a barra inferior muda de novo, uma semana depois da A.2.
3. **Sugestões determinísticas ou geradas pelo modelo?** Recomendo determinísticas, e é o que
   o plano acima assume. Geradas pelo modelo derrubam o guard `phase-2k-suggestion-guard` e
   passam a cobrar da sua chave BYOK a cada carregamento da tela principal.
4. **Aniversário estruturado (`people.birthday`, slice `C.5`) entra agora?** Sem ele, a
   sugestão de aniversário só enxerga quem já tem lembrete recorrente criado. Com ele, é
   possivelmente a **quarta migration** — condição de parada declarada, que só você autoriza.
5. **Relação tipada ("casados") é para valer?** Isso é tabela ou coluna nova — mesma questão
   de migration do item 4.
6. **"Como o Claude faz" com memórias** precisa de uma referência concreta antes de virar
   escopo. Não vou adivinhar o que você viu.

## O que eu não fiz

- Não rodei o app nem medi tempo de carregamento. O que digo sobre os esqueletos vem de
  contar quadros, não de instrumentação.
- Não mudei nenhuma linha de código, e não mexi em `IMPLEMENTATION_PLAN.md`: a reordenação
  acima é proposta, não aplicada.

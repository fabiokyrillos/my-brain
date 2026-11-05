# Life Brain — Plano de implementação

Status: governing artifact (ADR-145). PRD: `PRD.md`. Um PR por slice; branch `life-brain/<slice>`. Estimativa relativa em "dias de sessão" (d): 1 d ≈ uma sessão autônoma longa com CI verde.

## 0. Ordem e lógica

Fundação visual primeiro (desbloqueia todo o resto e é o que o dono vê), depois o chat (valor percebido maior por slice), depois a vida inteira (precisa de migrations e do dono para aplicar). As trilhas se intercalam para que cada semana tenha algo visível:

```
A.0 → A.1 → B.0 → A.2 → B.1 → C.0 → A.3 → B.2 → C.1(M1) → A.4 → B.3(M3) → C.2 → C.3(M2) → A.5 → C.4 → B.4 → C.5 → A.6 → B.5
```

Migrations: **3 alocadas** (LB-M1 em C.1, LB-M3 em B.3, LB-M2 em C.3). Uma quarta é condição de parada. Nenhuma aplicada no hospedado sem autorização do dono para aquele PR.

## 1. Trilha A — Design system e redesenho

### A.0 — Fundação de UI (1 d) — **em execução nesta sessão**

- **Objetivo:** primitivas + tokens, sem mudar rotas.
- **Arquivos:** `src/components/ui/{button,icon-button,text-link,card,field,input,textarea,select,badge,empty-state,page-header,list-item,segmented-control}.tsx`, `src/components/ui/index.ts`, `src/app/ui.css`, `src/app/tokens.css` (escala tipográfica, elevação escura, tokens de controle/ícone/z/acento), `src/app/globals.css` (import), os 5 arrays `STYLESHEETS` em `e2e/*.spec.ts`.
- **Migrations:** 0.
- **Testes:** componente (render, variantes, `aria-busy`, `aria-label` obrigatório em `IconButton`, link vs botão); `contrast.test.ts` calcula pares de tokens nos dois temas; `ui-css-scope.test.ts` garante que `ui.css` só estiliza classes `ui-*`; guard dos dois blocos escuros continua verde; `stylesheet-registry-guard`.
- **Aceite visual:** nenhum (sem rota tocada); `npm run build` verde; lanes `accessibility`, `layout-contracts`, `daily-surfaces`, `calendar` verdes com `ui.css` no array.
- **Riscos:** a subida da escala tipográfica pode estourar truncamentos em listas densas → re-rodar o baseline e comparar `overflowPx`. Nome de classe colide → prefixo `ui-` e teste de escopo.
- **IA:** 0.

### A.1 — Hoje e Conversar redesenhados (1,5 d) — **em execução nesta sessão**

- **Objetivo:** provar a direção nas duas telas mais importantes.
- **Arquivos:** `src/features/shell/home-view.tsx`, `home-copy.ts`, `src/features/onboarding/onboarding-panel.tsx` (cartão compacto), `src/features/capture/composer-copy.ts` (placeholder), `src/app/[locale]/app/chat/page.tsx`, `chat/[conversationId]/page.tsx`, `src/features/assistant/assistant-composer.tsx`, `assistant/copy.ts`, `src/app/chat.css`, `src/app/assistant.css`, `src/features/conversation-cards/suggestions.ts` (sugestões de vida).
- **Migrations:** 0.
- **Testes:** `home-view.test.tsx` (porta para Conversar presente; ordem das seções preservada), `assistant-composer.test.tsx`, teste da página do chat (estado vazio com 4 perguntas), `home-mirror-guard`, Playwright `foundation.spec.ts` + `daily-surfaces.spec.ts` desktop+mobile, `online-life-brain-baseline` nas rotas `home`, `chat` em pt-BR e en.
- **Aceite visual:** `evidence/slice-a1/` com antes/depois; `measurements.json`: alvos < 44 = 0, palavras técnicas = [], primeiro conteúdo ≤ 200px.
- **Riscos:** o thread de chat tem 3 lanes Playwright que endereçam `.chat-message.user/.assistant` → manter as classes. `revalidatePath` vs undo (memória do repo) → não tocar nas actions.
- **IA:** 0.

### A.2 — Barra e rail novos (1 d)

- Barra `Hoje · Conversar · [+] · Agenda · Memória`; rail com Registros e Tarefas como secundários; redirects `/app/library → /app/memory`, `/app/calendar → /app/agenda` (ou manter rotas e só trocar rótulos — decidir no slice; recomendação: **manter rotas, trocar rótulos e grupos**, zero redirects).
- Arquivos: `shell/capabilities.ts`, `navigation-links.tsx`, `i18n/messages.ts`, `capabilities.test.ts`, `app-shell.test.tsx`, `mobile-reachability-guard.test.ts`, `e2e/layout-contracts.spec.ts` (`MOBILE_BAR`), `online-mobile-navigation.spec.ts`.
- Aceite: todas as 22 rotas continuam alcançáveis (guard), screenshots da barra nos dois temas.

### A.3 — Tarefas (1,5 d)

- `work-view.tsx`, `tasks/*` lista, `task-commands` botões → `Button`; `SegmentedControl` Hoje/Todas/Aguardando; filtros em sheet; linhas `ListItem`; quick-add em `IconButton` + campo. Retira `button-primary/secondary` de `operations.css` quando o último consumidor sair.
- Testes: `work-view.test.tsx`, `candidate-editor` ternários migrados para `copy.ts` (−12 ternários), Playwright `daily-surfaces` + `online-conversational-creation`.
- Aceite: primeira tarefa ≤ 180px no iPhone; "Adicionar" não quebra; ≤ 2 tipos de controle de seleção.
- **Parte 1 implementada 2026-11-03:** `PageHeader compact`, quick-add com `IconButton` (não quebra), `SegmentedControl` das visões, filtros atrás de um botão `ghost` com contagem, `Badge` nos chips. Falta: linhas `ListItem`, `Sheet`, `candidate-editor`, retirar `button-primary/secondary`, e a meta de 180px.
- **Parte 2 implementada 2026-11-03:** quick-add atrás do "+" do cabeçalho; visões e barra de ferramentas numa linha só. Primeira tarefa no fixture: 286px (era ~380). Os modos Lista · Calendário · Planejar **ficam até A.4** (sair só daqui deixaria uma aba "Lista" de mão única em Calendário e Planejar); A.4 os remove de todas as páginas de uma vez.
- **Parte 3 implementada 2026-11-04:** linhas em três posições (seleção · título + uma linha de meta · estado + ações); no celular, as ações num painel de baixo atrás de um "⋯" — o `ConfirmDialog` existente apresentado de baixo, via portal (o `Sheet` é a apresentação, não um segundo modal); sem gestos. `candidate-editor`: 11 ternários para o registro tipado. Ficam: `button-primary/secondary` (9 consumidores fora de Tarefas) e a meta de 180px (A.4).

### A.4 — Agenda (2 d)

- Calendário + Planejar + Lembretes como lentes; stepper de data no cabeçalho; filtros em sheet; faixa de eventos preparada (consome C.3 quando existir). `calendar.css` (1.270 linhas) encolhe.
- Testes: `calendar.spec.ts`, `online-calendar.spec.ts`, `calendar-mirror-guard`.
- **Implementado 2026-11-04 (ADR-149):** `AgendaHeader` (título "Agenda" + lentes Calendário · Planejar · Lembretes) nas três rotas, sem mudar URL; a faixa "Lista · Calendário · Planejar" saiu de todas as páginas; `AgendaStepper` no cabeçalho; orientação Dia · Semana · Mês · Lista num `SegmentedControl` e as faixas atrás de um botão "O que mostrar"; o lembrete da própria tarefa dobrado na linha dela, na projeção. `calendar.css` 1.270 → ~1.030 linhas. Ficam: a faixa de eventos (C.3) e o resto da meta de 180px de Tarefas (barra superior e padding, A.6).
- **Decisão do dono (2026-10-31, achado de B.1):** o lembrete automático de uma tarefa com prazo (`tasks_create_due_reminder`, 1 h antes do `due_at`) deixa de aparecer como item separado quando a própria tarefa está na janela. Ele é dobrado na linha da tarefa **na projeção** (`calendar-projection.ts`), para que a Agenda e a resposta de agenda do chat (B.1) mudem juntas. Teste: uma tarefa com prazo amanhã gera um item com o horário do lembrete visível, e `online-agenda-answer.spec.ts` passa a esperar 1 item.

### A.5 — Registros, Notificações, Memória e listas (2 d)

- Registros e Notificações com `ListItem` e uma ação por linha; Memória (antigo Brain) com áreas; Pessoas/Projetos/Organizações/Arquivos/Memórias/Buscar com `PageHeader compact` e estados vazios quietos. Retira a pilha eyebrow+display+lead dessas rotas.
- Aceite: Notificações com 50 avisos ≤ 3.500px.
- **Implementado 2026-11-05 (ADR-153):** `PageHeader compact` em Registros, Notificações, Memória, Pessoas, Projetos, Organizações, Áreas, Arquivos, Memórias e Buscar (sem eyebrow; a ação ou o formulário de criar no cabeçalho, embaixo do título no celular); estados vazios quietos (`ux-state-quiet`); aviso do histórico em duas linhas com "Abrir" e um "⋯" (verbos com o primário primeiro) — **50 avisos ≈ 3.320px a 390px**; "Abrir" passa pela whitelist de destino e continua sem marcar como lido; botões de Registros (tentar de novo, carregar mais) no `Button`; Memória abre com as **áreas da vida** do dono, como portas, sem contagem. Ficam: o rótulo "Contextos" → "Áreas da vida" (C.4) e os demais consumidores de `button-primary/secondary` (A.6).

### A.6 — Ajustes, Avançado e regressão visual (1 d)

- Ajustes com seções em `ListItem` no celular e "Avançado" agrupando Histórico, Uso de IA, Em andamento; lane `toHaveScreenshot` para Hoje, Conversar, Tarefas, Agenda nos dois temas; remoção dos seletores superados e consolidação de breakpoints.
- **Parte 1 implementada 2026-11-05:** Ajustes com `PageHeader compact` (sem eyebrow nem ternário); no celular as seções viram linhas de lista entre divisórias (a ativa marcada por uma borda à esquerda, não só por cor); grupo **Avançado** com Histórico, Custos de IA e Em andamento (links, nunca seções; os nomes são os do menu). Ficam: os 28 usos de `button-primary/secondary` em seis formulários (cada um com largura e margem próprias no CSS — trocar sem revisão visual de cada um é arriscado), a lane `toHaveScreenshot` (baselines dependem do sistema; precisam de um runner fixo) e a consolidação de breakpoints.

## 2. Trilha B — Conversar com a memória

### B.0 — O chat sabe que dia é hoje e lembra a conversa (0,5 d) — **candidato a esta sessão**

- `openai-provider.ts` (`answerFromKnowledge` recebe `now` + `history`), `chat/actions.ts` (carrega as últimas 6 mensagens e passa), `chat-schema.ts` se precisar; `AIProvider` interface.
- Testes: unit do prompt (data presente; histórico marcado como histórico, antes das fontes; fontes continuam "untrusted"); `chat/actions.test.ts`.
- Migrations 0. IA: +~300 tokens de entrada por turno.

### B.1 — Agenda determinística e "não encontrei" sem modelo (1 d)

- `assistant/routing.ts`: detector de pergunta de agenda (hoje/amanhã/semana/dia N/mês) → `agenda-answer.ts` reutiliza `calendar-projection`; resposta persistida como mensagem do assistente com fontes `task`/`reminder` (vocabulário existente). Zero fontes e sem rota → resposta fixa sem chamada.
- Testes: roteador (20 frases pt-BR/en), projeção para fontes, action persiste sem cobrar.
- IA: **−1 chamada** nos casos cobertos.

### B.2 — Tarefas e lembretes como fontes (1 d)

- `chat/actions.ts` anexa acertos `ilike` de `tasks`/`reminders` (reaproveita `search/actions.ts`) como fontes `task`/`reminder`; `CHAT_REACH` ampliado; render já existe (revisões). Pré-chamada de comandos só para forma de comando (LB-B-009).
- Testes: fontes mistas citadas e validadas; comando vs pergunta.
- **Implementado 2026-11-04 (ADR-147):** casamento por título em `tasks`/`reminders` (não reaproveita `searchEverything`, que casa a pergunta inteira como uma string); o que Tarefas esconderia nunca vai ao prompt; `reminder` citável sem conteúdo, e a agenda cita os lembretes; três frases de alcance por era; pergunta sem verbo de mudança pula o parse de comandos.

### B.3 — Recência e janela de datas (1 d, **LB-M3**)

- Parser temporal pt-BR/en ("semana passada", "em março", "última vez") → `p_since/p_until`; re-rank por `occurred_at`. pgTAP para a RPC (M7/M8 do TODO).
- **Implementado 2026-11-04 (ADR-150):** migration `202611040105` (assinatura de quatro argumentos, janela dentro de cada ramo antes do limite; a de dois delega), `chat/temporal-window.ts` (um período por pergunta; recência só reordena), `chat/knowledge-retrieval.ts` (fallback só para `PGRST202` até a aplicação no hospedado). pgTAP de 19 asserções. Aplicação no hospedado aguarda o dono.

### B.4 — Sensibilidade no chat (0,5 d)

- Predicado de sensibilidade na aplicação (não na RPC): `highly_sensitive` só com pedido explícito ou mesma área; marcador na resposta.
- **Implementado 2026-11-05 (ADR-155):** `classifyKnowledgeSources` lê o nível e a área (leitura atual) das fontes recuperadas, falhando fechado; `admitsToChatPrompt` no contrato de sensibilidade; léxico pt-BR/en para "incluir sensíveis" e para as áreas; exclusão silenciosa (`2K-EXPL-005`), `readSensitive` no envelope e uma frase sob as fontes quando a resposta leu conteúdo muito sensível.

### B.5 — Composer único com voz e captura pela conversa (1,5 d)

- `Composer` com `mode`; roteador (pergunta/comando/relato); `VoiceComposer` compartilhado; retirada de `assistant-composer.tsx`.

### B.6 — Progresso real e streaming (1 d, pode)

- Estado persistido de "pensando" (job de chat) e streaming quando o ledger permitir.

## 3. Trilha C — Vida inteira

### C.0 — Copy e exemplos de vida (0,5 d)

- "Trabalho" → "Tarefas", "Empresas" → "Organizações", "Brain" → "Memória", placeholders e estados vazios; prompt **inalterado** (paridade intocada). `messages.ts`, `*copy.ts`, testes de copy.
- **Implementado 2026-11-02.** "Brain" → "Memória" já tinha saído em A.2 (o lugar); "Brain" como ator (o nome do assistente) fica. "Tarefas" chega antes de A.3, que muda só o layout. Guard: `src/lib/closeout/life-brain-c0-copy-guard.test.ts`. "Contextos" → "Áreas da vida" fica para C.1.

### C.1 — Área da vida (2 d, **LB-M1**)

- Schema `lifeArea` na extração (ambos os runtimes + paridade + corpus com ≥ 20 casos de vida); `contexts.kind` ampliado; `ensure_life_area_context`; vínculo na persistência; sensibilidade padrão por área; chip de área em Registros.
- pgTAP: CHECK, índice único, função definer, negação cross-user, idempotência.
- **Implementado 2026-11-04 (ADR-148, LB-M1 `202611040104`):** o vínculo é um passo separado e não bloqueante depois da persistência (`link_entry_life_area`), em vez de recriar `persist_entry_interpretation`; o dono ganhou `set_entry_sensitivity` e o controle na página do registro, porque nada escrevia `entries.sensitivity`. **Migration escrita e testada, não aplicada no hospedado** até o "pode aplicar" do dono no PR.

### C.2 — Pessoas com papel e memórias propostas (1 d)

- `people[].role` na extração; gravação em `notes` na confirmação; `lasting_preference`/`personal_memory` → proposta de memória.
- **Implementado 2026-11-04 (ADR-151):** `role` nos dois runtimes (versões `entry-extraction-v3` / `2026-11-04.2`), gravado como nota da pessoa criada por sugestão confirmada (só com nota vazia), mostrado ao lado do nome; o cartão de proposta do assistente na página do registro, com a origem e a sensibilidade do registro. Zero migrations.

### C.3 — Eventos com período (2,5 d, **LB-M2**)

- Tabela `events`, candidatos, confirmação/undo, faixa no calendário, viagem como período. Supera OD-2M-3 A.
- **Implementado 2026-11-04 (ADR-152):** migration `202611040106` (tabela, confirmação idempotente com undo registrado, cancelamento), `eventCandidates` nos dois runtimes (`entry-extraction-v4` / `2026-11-04.3`), "Pôr na agenda?" na página do registro, sexta faixa `event` no calendário, na agenda do chat e de Hoje. As três migrations do Life Brain estão gastas.

### C.4 — Linha do tempo por área e Ideias (1,5 d)

- `/app/memory/areas/[area]`: linha do tempo (fatos), pendências, pessoas, eventos; lente Ideias; Relações absorvida pela página da pessoa/projeto.
- **Implementado 2026-11-05 (ADR-154):** a página do contexto **é** a página da área (mesma URL, LB-OD-2): próximos eventos (uma viagem lista os registros do período), linha do tempo dos registros que a leitura **atual** arquiva na área, pendências abertas e pessoas; superfície governada `area` (altamente sensível mascarado no lugar). Memória com **contagens reais** por área e a lente **Ideias** (filtro pelo conceito `idea`). O destino passa a se chamar **Áreas da vida**. Fica: Relações continua uma lente própria.

### C.5 — Aniversários e datas recorrentes (1 d, pode)

- `people.birthday` + série anual (reutiliza `reminder_series`). Pode exigir uma quarta migration → **condição de parada**, decidir com o dono.

## 4. Resumo

| Slice | Trilha | d | Migration | Visível para o dono |
| --- | --- | --- | --- | --- |
| A.0 | A | 1 | — | tipografia maior, elevação no escuro |
| A.1 | A | 1,5 | — | Hoje e Conversar novos |
| B.0 | B | 0,5 | — | respostas que sabem a data e o contexto |
| A.2 | A | 1 | — | barra nova |
| B.1 | B | 1 | — | "o que tenho amanhã?" responde |
| C.0 | C | 0,5 | — | nomes de vida |
| A.3 | A | 1,5 | — | Tarefas limpa |
| B.2 | B | 1 | — | "quais exames pendentes?" responde |
| C.1 | C | 2 | M1 | área da vida nos registros |
| A.4 | A | 2 | — | Agenda |
| B.3 | B | 1 | M3 | "quando foi a última vez?" certo |
| C.2 | C | 1 | — | médico com especialidade |
| C.3 | C | 2,5 | M2 | viagem no calendário |
| A.5 | A | 2 | — | listas e avisos limpos |
| C.4 | C | 1,5 | — | Saúde com linha do tempo |
| B.4 | B | 0,5 | — | sensíveis protegidos no chat |
| C.5 | C | 1 | (M4?) | aniversários |
| A.6 | A | 1 | — | Ajustes/Avançado, regressão visual |
| B.5 | B | 1,5 | — | um composer, voz no chat |
| B.6 | B | 1 | — | streaming |
| **Total** | | **≈ 25 d** | 3 (+1 condicional) | |

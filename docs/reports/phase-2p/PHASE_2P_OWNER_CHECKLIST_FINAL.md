# CHECKPOINT FINAL — só dois itens

Você já aprovou os itens **2, 3, 4, 6 e 8** de Revisões, e tudo o mais que não
reprovou. **Nada disso deve ser refeito.** O calendário não foi tocado.

Aqui estão apenas as **duas correções** que você pediu. Cerca de **2 minutos**.

**Sem VoiceOver** — continua dispensado por você e registrado como **não
executado**, nunca como aprovado.

---

## 1. Velocidade das abas

- Abra **Revisões** no iPhone.
- **Toque em Semana.**
- **Esperado — imediatamente, sem esperar:** o botão *Semana* muda de aparência
  no instante do toque, com um pontinho discreto ao lado indicando que está
  carregando.
- **Esperado logo em seguida:** o conteúdo da semana aparece.
- **Esperado — o que NÃO deve acontecer:** a tela **não** fica em branco, e o
  conteúdo do período anterior **não** some antes do novo chegar.
- Toque em **Mês**, depois em **Dia**. Mesma coisa.

**O que foi medido** (build de produção, antes e depois):

| | antes | depois |
|---|---|---|
| toque → botão responde (iPhone) | 1 643 ms | **112–132 ms** |
| toque → conteúdo (iPhone) | 2 021 ms | **181–356 ms** |
| toque → botão responde (Android) | 1 427 ms | **13–25 ms** |
| toque → conteúdo (Android) | 1 865 ms | **48–341 ms** |

**Reprovar se:** o toque ainda parecer não fazer nada por um instante, ou se a
tela piscar em branco entre um período e outro.

---

## 2. Conteúdo visível sem clique adicional

- Ainda em Revisões, toque em **Abrir revisão** em qualquer revisão.
- **Esperado:** o texto da revisão já está **na tela**, formatado, sem nenhum
  botão de *Mostrar resumo*.
- **Esperado:** continua sendo texto de verdade — títulos, listas com
  marcadores, negrito — e **nenhum `##` ou `**`**.

**Reprovar se:** ainda houver um passo a mais para ler a própria revisão.

---

## O que continua sem prova, registrado com honestidade

| Item | Estado |
|---|---|
| **VoiceOver** | **NÃO EXECUTADO** — dispensado por você |
| **Links da revisão para tarefas/pessoas específicas** | **NÃO ENTREGUE.** Registrado como `2P-REVIEW-CITATIONS`, **alta prioridade para a fase seguinte**. Custa **uma migration**, que **não foi criada**. Especificado em `PHASE_2P_REVIEW_CITATIONS_REQUIREMENT.md`. A seção "Fontes" que existe hoje **não** é entrega disso — ela diz o que a linha consegue provar e **admite** que não sabe apontar os itens |
| Telemetria das abas Semana e Mês | Não emitida; o vocabulário de eventos está fechado e implantado |
| Contraste em modo escuro (busca global e barra do Trabalho, no WebKit) | Pré-existente, provado; registrado como `A11Y-WEBKIT-DARK-CONTRAST` |

---

## Como responder

Para cada um dos dois: **aprovado** ou **reprovado + o que você viu**.

**Se os dois forem aprovados, eu encerro formalmente a Phase 2P.**
Não inicio nem planejo a fase seguinte sem nova autorização sua.

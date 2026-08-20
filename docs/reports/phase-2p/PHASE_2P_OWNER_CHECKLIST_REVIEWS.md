# CHECKPOINT DO DONO — A EXPERIÊNCIA DE REVISÕES

Você já aprovou captura por texto/voz/arquivo, configurações, notificações,
acesso direto a Lembretes e a Revisões, o cartão *Precisa de você*, e tudo o que
não reprovou explicitamente. **Não refaça nada disso.** O calendário recebeu a
correção de responsividade na rodada três e **não foi alterado aqui**.

O único escopo desta rodada é **Revisões**, redesenhada por inteiro.

**Sem VoiceOver** — permanece dispensado por você e continua registrado como
**não executado**, nunca como aprovado.

Cerca de **6 minutos**: iPhone para os passos 1–7, uma olhada no desktop no fim.

---

## 1. As abas

- Abra **Revisões**.
- **Esperado:** logo abaixo do título *Revisões* e da linha de introdução,
  **três opções numa faixa compacta: Dia · Semana · Mês**. A selecionada tem
  fundo claro e texto forte; as outras são discretas.
- **No iPhone:** as três ocupam a largura em colunas iguais, nenhuma espremida,
  todas confortáveis de tocar. **Nada rola para o lado.**
- **Toque em Semana.** O endereço passa a terminar em `?period=week`.
- **Puxe para recarregar.** Continua na Semana.
- **Volte** (gesto ou botão). Volta para Dia. **Avance.** Volta para Semana.

**Reprovar se:** as três não couberem, alguma ficar espremida, a página rolar
para o lado, ou recarregar/voltar perder a aba escolhida.

---

## 2. O período atual

Ainda na aba **Semana**:

- **Esperado — no topo:** *Esta semana*, com o **intervalo de datas** logo
  abaixo do nome, em letra menor.
- Abaixo: um resumo em uma linha (*Como a semana ficou*), seguido das seções —
  o que foi concluído, intenções, prazos, registros capturados.
- **Esperado — o que NÃO deve aparecer:** **nenhuma seção chamada "O que não
  pôde ser lido"**. Se tudo foi lido, deve haver apenas uma linha discreta
  dizendo que todas as fontes foram lidas.

**Reprovar se:** aparecer uma seção de erro numa página que funcionou, ou se o
intervalo de datas competir com o título.

---

## 3. Gerar uma revisão

Ainda na **Semana**:

- **Esperado:** dentro do bloco *Revisões desta semana*, **exatamente dois
  botões** — *Revisão da semana* e *Planejar a semana*.
- Vá para **Dia**: **um** botão (*Resumo do dia*). Vá para **Mês**: **um**
  botão (*Revisão do mês*).
- **Esperado:** a antiga faixa de quatro botões não existe mais em lugar nenhum.

**Reprovar se:** algum botão sumiu de vez, ou se uma aba oferece um botão que
não é do período dela.

---

## 4. O histórico

Role até o fim de qualquer aba.

- **Esperado:** *Dias anteriores* / *Semanas anteriores* / *Meses anteriores*,
  conforme a aba.
- Cada linha traz **tipo, período, estado e o botão *Abrir revisão*** — e mais
  nada.
- **Esperado — o que NÃO deve aparecer:** **nenhum botão "Mostrar resumo"** e
  **nenhum texto da revisão** dentro da lista.
- **Esperado:** a revisão do período atual **não aparece duas vezes** — está em
  cima, não no histórico.

**Reprovar se:** o texto bruto voltar a expandir dentro da lista, ou a mesma
revisão aparecer nos dois lugares.

---

## 5. A página da revisão

- Toque em **Abrir revisão** em qualquer revisão.
- **Esperado:** uma página só dela, com endereço próprio. No topo: *Voltar para
  Revisões*, o título, o intervalo, o estado e quando foi gerada.
- **Esperado:** o conteúdo começa **oculto**, com o botão *Mostrar resumo* —
  isso é a regra de privacidade que você assinou e continua valendo.
- **Toque em Mostrar resumo.**

---

## 6. O conteúdo (o ponto principal)

- **Esperado:** o texto aparece como **texto formatado de verdade** — títulos em
  negrito e tamanho maior, listas com marcadores, palavras em negrito.
- **Esperado — o que NÃO deve aparecer:** **nenhum `##`, `###`, `**` ou `-`**
  solto na tela.
- **No iPhone:** as linhas quebram bem, nada encosta na borda, **nada rola para
  o lado** — mesmo numa revisão longa.

**Reprovar se:** você vir qualquer marcador de Markdown na tela.

---

## 7. Fontes, links e uma ação

Ainda na página da revisão:

- **Fontes:** deve dizer de onde a revisão foi escrita (seus registros e tarefas
  do período), o modelo, e **admitir honestamente** que não consegue apontar os
  itens individuais.
- **Links:** *Ver este período no calendário* deve abrir o calendário **no
  período certo** (semana para uma revisão semanal, mês para mensal).
- *Voltar para Revisões* volta para **a aba certa**.
- **Ação:** se a revisão for do período **em andamento**, há um botão para
  gerá-la de novo. Se for de um período **que já passou**, não há botão — e a
  página explica por quê.

**Reprovar se:** algum link levar ao lugar errado, ou se um botão de gerar
aparecer numa revisão antiga (ele escreveria outra linha, não aquela).

---

## 8. Desktop, rápido

- Abra Revisões no computador.
- **Esperado:** a faixa Dia · Semana · Mês fica **compacta**, do tamanho do
  conteúdo — não uma barra gigante atravessando a tela.
- **Esperado:** a página tem hierarquia — o período atual é o assunto, o
  histórico é mais discreto embaixo. Não é uma pilha de caixas iguais.

---

## O que continua sem prova

Registrado com honestidade, não como aprovado:

| Item | Estado |
|---|---|
| **VoiceOver** | **NÃO EXECUTADO** — dispensado por você |
| Links da revisão para tarefas/pessoas/projetos específicos | **Não entregues.** O texto é gravado sem as referências, e persisti-las exigiria uma migration que não foi gasta |
| Telemetria das abas Semana e Mês | **Não emitida.** O vocabulário de eventos está fechado e implantado; ampliá-lo exigiria uma migration |
| Classificação de sensibilidade por revisão | **Não existe.** `summaries` não tem a coluna, então toda revisão é tratada como sensível |

---

## Como responder

Para cada item de 1 a 8: **aprovado** ou **reprovado + o que você viu**.
Se reprovar, uma frase basta — eu volto e corrijo.

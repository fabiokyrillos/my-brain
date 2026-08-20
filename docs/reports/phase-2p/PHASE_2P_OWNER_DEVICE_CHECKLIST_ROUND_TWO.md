# CHECKPOINT DO DONO — SEGUNDA RODADA NO IPHONE

Você reprovou o **passo 7** e apontou quatro problemas. Os quatro foram
corrigidos. Este roteiro verifica **só o que mudou** — os passos 1 a 6 já foram
aprovados e não precisam ser refeitos, salvo se você quiser.

**VoiceOver não é necessário.** Sua dispensa está registrada como
*NOT EXECUTED — owner waived hardware validation*, e nenhum passo abaixo pede
leitor de tela.

Cerca de 10 minutos, no Safari do iPhone.

---

## O que bloqueia o fechamento da Phase 2P

### 1. Calendário — o que estava colado na borda

- Abra **Trabalho → Calendário**.
- **Esperado:** o título **Calendário** aparece **grande**, como título de
  página — não mais menor que a data.
- **Esperado:** texto e controles têm respiro nas laterais. **Nada encostado na
  borda da tela.**
- Deslize o dedo para os lados.
- **Esperado:** a página **não anda de lado**. Nenhuma rolagem horizontal.

### 2. Calendário — os filtros

- Ainda no calendário, olhe a faixa de controles.
- **Esperado:** duas famílias, cada uma com um rótulo em cima:
  **FORMATO** (Dia · Semana · Mês · Agenda) e **O QUE MOSTRAR** (Prazos ·
  Intenções · Lembretes · Revisões · Datas sugeridas).
- **Esperado:** as setas de período e a data ficam **separadas** dos filtros.
- **Esperado:** **"Todos os lembretes" não está mais no meio dos controles** —
  agora fica abaixo da faixa, como link.

### 3. Calendário — os três formatos

- Toque em **Dia**, depois **Semana**, depois **Mês**.
- **Esperado:** cada um abre o formato correspondente, e o botão tocado fica
  marcado.
- **Esperado:** no **Mês**, a grade aparece dentro de uma moldura arredondada,
  como os outros blocos do produto — e continua sem rolagem lateral.
- Avance e volte um mês.
- **Esperado:** anda de mês em mês, sem pular nenhum.

### 4. Lembretes — o caminho direto

- Toque em **Hoje** na barra de baixo.
- **Esperado:** logo abaixo do campo de captura há uma linha **IR PARA** com
  **Calendário · Lembretes · Revisões**.
- Toque em **Lembretes**.
- **Esperado:** abre a página de lembretes **direto**, sem passar por Trabalho.

### 5. Revisões — o caminho direto

- Volte para **Hoje**.
- Toque em **Revisões** na mesma linha.
- **Esperado:** abre a página de revisões. **Sem precisar da busca.**

### 6. Home — o card "Precisa de você"

- Fique em **Hoje** e role até **Precisa de você**.
- **Esperado:** quando houver algum item, o texto ocupa a largura disponível.
  **Nenhuma palavra sozinha por linha.**
- **Esperado:** a data e a ação quebram para a linha de baixo quando não cabem,
  em vez de espremer o título.
- *Se não houver nada pendente, o card dirá "Nada precisa de você agora" — isso
  também está correto, e é só avisar que estava vazio.*

### 7. Uma última passada de borda

- Percorra **Hoje**, **Calendário (Mês)** e **Lembretes**.
- **Esperado:** em nenhuma delas a página anda de lado, e nada fica escondido
  atrás da barra de baixo.

---

## O que **não** bloqueia

| Item | Situação |
|---|---|
| VoiceOver | dispensado por você; registrado como NOT EXECUTED |
| Push / notificação no aparelho | HTTP 403 conhecido, não retomado |
| Uma resposta real da Conversa | não há credencial de IA neste ambiente |
| Recorrência de lembrete | a tabela não tem coluna para isso |
| Evento de telemetria do mês | você recusou a migration |
| Os quatro fluxos de revisão ausentes | sem fluxo de revisão no produto |
| `RG-DEP-3` | continua INCOMPLETE |
| Lentidão da **primeira** ação após o app ficar parado | aquecimento, não erro |

---

## Como reportar uma falha — sem conteúdo pessoal

Para cada passo que falhar, mande **só**:

1. O **número do passo**.
2. O que você esperava e o que aconteceu, em uma frase.
3. **Modelo do iPhone e versão do iOS.**
4. Safari ou app instalado na tela de início.
5. Se aparecer um **código de referência**, copie só ele.

**Não** envie o texto das suas entradas, nomes de pessoas ou empresas, títulos
de tarefas ou lembretes, nem captura que mostre qualquer um deles. Se precisar
mostrar a tela, cubra o conteúdo antes.

Se tudo passar: diga *"rodada dois ok"* — e eu fecho a Phase 2P.

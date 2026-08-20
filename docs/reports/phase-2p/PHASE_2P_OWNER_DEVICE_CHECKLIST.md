# CHECKPOINT DO DONO — IPHONE REAL E VOICEOVER NECESSÁRIOS

Tudo que não exige aparelho está entregue. **A Phase 2P não fecha sem este
roteiro**, e a fase seguinte não foi iniciada nem planejada.

Você vai precisar de: um **iPhone real**, Safari (e o app instalado na tela de
início, onde indicado), e **VoiceOver**. Reserve cerca de 25 minutos.

---

## Antes de começar

1. Abra o app no Safari do iPhone e faça login normalmente.
2. Ligue o VoiceOver apenas nos passos que pedem (**8** a **11**). Nos demais,
   deixe desligado — dois modos ao mesmo tempo escondem qual dos dois falhou.
3. Se algo falhar, use a seção **Como reportar** no fim. **Não copie o conteúdo
   das suas anotações** em lugar nenhum.

---

## O que bloqueia a Phase 2P

Os passos **1 a 12**. Sem eles a fase não fecha.

### 1. Captura por texto

- Vá em **Capturar**.
- **Esperado:** o campo de texto está pronto para digitar assim que a tela
  abre — nenhuma aba, nenhum botão "Escrever" antes dele.
- Digite uma frase curta e toque em **Registrar**.
- **Esperado:** aparece a confirmação; o texto sai do campo.

### 2. Teclado do sistema não esconde a ação

- Ainda em **Capturar**, toque no campo para o teclado subir.
- **Esperado:** o campo onde você digita **e** o botão de registrar continuam
  visíveis e alcançáveis com o teclado aberto. Nada fica atrás do teclado.
- *(Este é o passo que nenhum teste automatizado consegue fazer: o teclado do
  iOS não é programável.)*

### 3. Transcrição de voz

- Toque no **microfone**, ao lado do enviar.
- Fale uma frase curta e pare.
- **Esperado:** o texto transcrito é **inserido no rascunho editável**, você
  consegue editar, digitar mais e gravar outro trecho.
- **Esperado:** nada é registrado até você tocar em **Registrar**.
- Toque em **descartar** sem enviar.
- **Esperado:** o rascunho some e **nenhuma entrada é criada**.

### 4. Arquivo

- Toque no **clipe** (à esquerda do compositor) e escolha uma foto ou PDF
  qualquer.
- **Esperado:** o nome do arquivo aparece; existe um controle para remover.
- Envie.
- **Esperado:** aparece a confirmação de envio.

### 5. Configurações

- Vá em **Configurações**.
- **Esperado:** uma **lista** de seções, não uma fileira de abas espremida.
- Entre em três seções diferentes.
- **Esperado:** cada uma abre a sua própria tela; o **voltar do Safari** retorna
  para a anterior, e o **avançar** volta para frente.

### 6. Notificações

- Vá em **Configurações → Notificações**.
- **Esperado:** é uma tela de **histórico** — não tem controles de preferência
  misturados; existe **um** link de volta para as preferências.

### 7. Relações e calendário mensal

- Vá em **Relações**.
- **Esperado:** abre no **Desenho**, e existe um segundo destino
  **Todos os vínculos** com o mesmo conteúdo em texto.
- **Esperado:** no telefone, a representação cabe na tela — **sem rolagem
  lateral da página**.
- Vá em **Calendário** e escolha **Mês**.
- **Esperado:** o mês aparece inteiro, o rótulo diz o **nome do mês**, o dia de
  hoje é marcado **por uma palavra** (não só por cor), e não há rolagem lateral.
- Avance e volte um mês.
- **Esperado:** anda de mês em mês, sem pular nenhum.

### 8. VoiceOver — captura *(ligue o VoiceOver agora)*

- Vá em **Capturar** e navegue pelos controles deslizando para a direita.
- **Esperado:** todo controle é anunciado com um **nome** — nunca só "botão".
  O clipe deve dizer algo como *"Anexar arquivo"*; o microfone e o registrar
  também têm nome.
- Registre uma frase curta.
- **Esperado:** o resultado é **falado** (salvando, e depois o resultado) sem
  que você precise procurar na tela.

### 9. VoiceOver — navegação entre seções

- Vá em **Configurações** e percorra a lista de seções.
- **Esperado:** a seção em que você está é anunciada como **página atual**.
- Abra uma seção com o VoiceOver.
- **Esperado:** o VoiceOver anuncia que **mudou de página** e lê o título novo.
- **Esperado:** o comportamento é de **link**, não de aba: o voltar do Safari
  funciona.

### 10. VoiceOver — lembretes: criar e cancelar

- Vá em **Lembretes** e toque em **Novo lembrete**.
- **Esperado:** o foco entra no diálogo; deslizando, você **não sai** dele.
- Preencha e salve.
- **Esperado:** o diálogo fecha, o resultado é **falado**, e o novo lembrete
  aparece na lista **sem você recarregar a página**.
- Agora **cancele** esse lembrete (ele pergunta antes).
- **Esperado:** o resultado é falado e a linha **sai da lista sozinha**.
- Vá na aba de cancelados e **reative**.
- **Esperado:** volta para os agendados, também sem recarregar.

### 11. VoiceOver — revisão

- Vá em **Precisa de você** (ou **Caixa de entrada**) e abra uma entrada com
  algo pendente.
- **Esperado:** a tela diz **o que ainda falta resolver** e não pede para
  confirmar de novo algo já resolvido.
- Resolva o que houver.
- **Esperado:** a entrada **sai da fila**, e ao voltar e atualizar **não
  reaparece**.
- *(Este passo cobre a única parte da fila que nunca foi renderizada num
  navegador autenticado.)*

### 12. Foco, zoom, reflow e alvos de toque *(pode desligar o VoiceOver)*

- Em **Ajustes do iOS → Tela e brilho → Zoom de exibição**, escolha o modo
  **maior** (ou aumente o tamanho do texto ao máximo).
- Volte ao app e percorra **Capturar**, **Configurações**, **Relações**,
  **Calendário (Mês)** e **Lembretes**.
- **Esperado:** nada some, nada fica cortado, e **nenhuma tela rola de lado**.
- **Esperado:** todos os botões continuam grandes o bastante para acertar com o
  dedo de primeira.
- Conecte um teclado externo, se tiver, e use **Tab**.
- **Esperado:** dá para ver **onde o foco está** em todo controle.

---

## O que **não** bloqueia a Phase 2P

Fique à vontade para pular. Se testar e algo falhar, é bom saber — mas é
**remainder**, não bloqueio:

| Item | Situação |
|---|---|
| Push / notificação no aparelho | HTTP 403 conhecido, não retomado nesta fase |
| Uma resposta real da Conversa | não há credencial de IA neste ambiente; a autorização ficou **não gasta porque é ingastável** |
| Recorrência de lembrete | a tabela não tem coluna para isso; você corrigiu o requisito |
| Evento de telemetria do mês | você recusou a migration; ausência de evento não é evento quebrado |
| Os quatro fluxos de revisão ausentes | projetos, empresas, memórias e relações não têm fluxo de revisão |
| `RG-DEP-3` (restore do backup) | continua INCOMPLETE |
| Lentidão da **primeira** ação após o app ficar parado | é aquecimento, não resultado errado |

---

## Como reportar uma falha — sem conteúdo pessoal

Para cada passo que falhar, me mande **só isto**:

1. O **número do passo** (ex.: `passo 10`).
2. **O que você esperava** e **o que aconteceu**, em uma frase.
3. **VoiceOver ligado ou desligado.**
4. **Modelo do iPhone e versão do iOS.**
5. Safari ou app instalado na tela de início.
6. Se aparecer um **código de referência** na tela (uma sequência de letras e
   números), copie **só ele**.

**Não** envie: o texto das suas entradas, nomes de pessoas ou empresas, títulos
de tarefas ou lembretes, nem captura de tela que mostre qualquer um deles. Se
precisar mostrar a tela, cubra o conteúdo antes.

Se **tudo** passar, basta dizer *"passos 1 a 12 ok"* — e eu fecho a Phase 2P.

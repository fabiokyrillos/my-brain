# Revisão arquitetural da experiência do produto — pós-Fases 2A e 2B

- **Data:** 2026-07-17
- **Branch analisada:** `codex/phase-2-intelligent-capture`
- **Escopo:** experiência atual do produto, da captura à execução, considerando toda a base existente após as Fases 2A e 2B
- **Natureza:** revisão crítica de produto e arquitetura; nenhuma implementação proposta neste documento foi executada

## 1. Resumo executivo

O My Brain chegou a um ponto incomum para um produto pré-MVP: a fundação técnica está mais madura do que a experiência que a expõe.

As Fases 2A e 2B resolveram problemas difíceis e importantes. O produto agora preserva o original, registra o ciclo de processamento, impede concorrência indevida, mantém interpretações imutáveis, permite correção e undo, calcula confiança por evidência e protege operações críticas no banco. Essa base é forte e deve ser preservada.

O problema atual não é falta de arquitetura. É que a arquitetura aparece demais para o usuário.

Hoje, a jornada principal se parece mais com uma bancada de inspeção de um sistema de IA do que com um “segundo cérebro” para uso diário:

1. o usuário registra algo;
2. precisa aguardar a interpretação síncrona;
3. é retirado do fluxo e levado para uma página extensa;
4. encontra versões, políticas, evidências, classificações, percentuais, bloqueios e metadados;
5. confirma candidatos de tarefa pouco editáveis;
6. chega a uma gestão de tarefas muito mais simples do que a revisão que a precedeu.

Há, portanto, um desequilíbrio claro:

- a captura promete fluidez, mas bloqueia durante o processamento;
- a revisão oferece profundidade técnica demais;
- a execução oferece controle de menos;
- configurações prometem comportamentos que ainda não estão completamente operacionais;
- a navegação expõe quase toda a arquitetura de informação ao mesmo tempo.

### Veredito

Eu não iniciaria a Fase 2C no escopo atual.

Antes de ampliar candidatos de tarefa com dependências, subtarefas, split/merge e outros recursos avançados, faria uma fase curta de convergência de produto. O objetivo seria transformar a excelente fundação das Fases 2A e 2B em um ciclo diário simples, previsível e honesto.

Para um piloto privado com 30 usuários, o produto está tecnicamente demonstrável, mas ainda não está pronto para ser avaliado como experiência final. Um piloto hoje mediria principalmente tolerância à complexidade e à fricção, não o real valor do conceito.

## 2. Base e método da revisão

Esta análise considera:

- o PRD, a arquitetura, o plano de implementação e o plano atual da Fase 2;
- os relatórios do Sprint 1.5 e da Fase 2B;
- os ADRs existentes, especialmente os contratos de jobs e revisões imutáveis;
- as rotas e componentes atuais de Home, Captura, Caixa de entrada, detalhe da interpretação, Tarefas, Hoje, Aguardando, Perguntas, Revisões, Chat, Pessoas, Projetos, Memórias, Arquivos, Histórico, Custos e Configurações;
- os fluxos cobertos pelos testes end-to-end;
- as screenshots desktop e mobile entregues em `docs/screenshots/`.

A revisão avalia o comportamento atual, não apenas a intenção documentada. Quando uma tela afirma que algo acontecerá, mas o fluxo operacional ainda não fecha esse ciclo, isso é tratado como risco de produto mesmo que o dado já seja armazenado corretamente.

## 3. Diagnóstico em uma frase

**O My Brain já sabe preservar, interpretar e auditar; ainda precisa aprender a desaparecer da frente do usuário.**

## 4. Experiência completa atual: da captura à execução

### 4.1 Entrada no produto

A Home estabelece uma boa intenção: pergunta “O que merece sua atenção agora?” e coloca a captura como ação dominante. Visualmente, a tela é limpa, calma e diferenciada. A hierarquia tipográfica transmite um produto pessoal, não um gerenciador corporativo genérico.

Ao mesmo tempo, a Home tenta representar quatro papéis diferentes:

- ponto de captura;
- lista de prioridades;
- monitor de itens aguardando;
- monitor de perguntas;
- indicação de horário de revisão.

Os cartões secundários são principalmente informativos. “Aguardando terceiros” e “Perguntas pendentes” não são links nem oferecem ação direta. O horário mostrado é uma preferência armazenada, não a garantia de que uma revisão automática realmente acontecerá. A tela parece mais inteligente do que o ciclo operacional atual.

No mobile, a composição mantém boa identidade, mas usa muito espaço vertical para pouca informação executável. Para uso várias vezes ao dia, a experiência precisa privilegiar velocidade e retomada, não apenas presença visual.

### 4.2 Captura

O usuário pode capturar pela Home ou pela rota dedicada. O formulário aceita texto, preserva o conteúdo original e informa que o Brain organizará sem alterá-lo.

O fluxo real é:

1. validar a entrada;
2. inserir `entries` com status `saved`;
3. iniciar a interpretação;
4. chamar o provedor de IA;
5. persistir a interpretação;
6. tentar gerar embedding;
7. somente então redirecionar para o detalhe da entrada.

Isso significa que a captura é tecnicamente durável, mas experiencialmente síncrona. O botão muda para “Interpretando…”, e o usuário precisa permanecer no fluxo até a operação terminar.

Essa escolha contradiz a promessa mais valiosa da interface: registrar sem interromper o pensamento.

O provedor possui limite de tempo, mas, para um usuário, qualquer espera longa depois de apertar “Registrar” transforma captura em processamento. Em uso diário, isso incentiva três comportamentos ruins:

- registrar menos coisas;
- escrever entradas menores e menos naturais;
- abrir outro aplicativo rápido para não interromper o raciocínio.

Quando a interpretação falha, o original foi salvo e a mensagem explica isso. A proteção de dados é correta. Porém, o usuário permanece no formulário, com o texto ainda visível, e pode interpretar a situação como uma tentativa incompleta e reenviar a mesma entrada.

Offline, o texto permanece apenas naquela tela e não é salvo no dispositivo. A decisão é defensável por privacidade, mas reduz a confiabilidade do My Brain como captura ubíqua, especialmente no mobile.

### 4.3 Redirecionamento e revisão da interpretação

Após uma captura bem-sucedida, o usuário é redirecionado imediatamente para o detalhe da Caixa de entrada.

A página mostra:

- status do ciclo de interpretação;
- registro original preservado;
- versão atual;
- conceitos;
- datas identificadas;
- entidades vinculadas;
- menções extraídas;
- classificações por campo;
- perguntas pendentes;
- confiança por elemento;
- política aplicada;
- sinais, evidências e bloqueios;
- controles de correção, undo e reprocessamento;
- tarefas candidatas;
- histórico imutável e comparação entre versões;
- origem, versão e modelo usado.

Tudo isso é valioso para auditoria, testes e investigação. Quase nada disso deveria estar no primeiro plano de uma revisão cotidiana.

O usuário precisa entender conceitos como:

- “Aplicação automática”;
- “Aplicado e sinalizado”;
- “Revisão solicitada”;
- “Bloqueado até confirmação”;
- classificação de resumo, conceitos, data e vínculos;
- fato, interpretação, inferência e sugestão;
- evidências, sinais, overrides e confiança;
- versão, origem e modelo.

O produto transfere para o usuário o trabalho de interpretar o interpretador.

### 4.4 Correção

A correção é tecnicamente muito boa:

- valida versão esperada;
- é idempotente;
- preserva histórico;
- cria nova revisão;
- mantém ownership;
- audita;
- permite undo compensatório.

Mas o editor pede que o usuário revise quase o esquema interno inteiro: resumo, conceitos, data do acontecimento, datas extraídas, entidades, classificações, perguntas e motivo da correção.

Isso cria custo desproporcional para correções simples. “O prazo é sexta, não quinta” deveria exigir uma interação curta sobre a data. Hoje, essa correção acontece dentro de um formulário de revisão estrutural.

Há ainda uma inconsistência importante entre interpretação e ação:

- uma correção cria nova interpretação;
- os `task_candidates` da versão anterior são carregados para a nova versão sem serem recalculados;
- o `raw_output` recebe os campos corrigidos, mas mantém os candidatos anteriores;
- a seção “Próximas ações” continua lendo esses candidatos.

Assim, o resumo ou a data podem ser corrigidos enquanto o candidato de tarefa permanece baseado na leitura anterior. A arquitetura preserva evidência, mas a experiência pode oferecer ao usuário uma ação incompatível com a correção que ele acabou de fazer.

O modo “somente registro” sofre do mesmo problema de projeção: ele influencia o ciclo da interpretação, porém os candidatos já extraídos continuam fazendo parte da versão e podem continuar aparecendo na seção de ações. Para o usuário, “só guardar” deveria remover qualquer pressão para criar tarefa.

### 4.5 Reprocessamento

O reprocessamento tem lease, timeout, idempotência e proteção da versão atual até o fim. Tecnicamente, isso é sólido.

O significado de produto ainda não está suficientemente definido.

Reprocessar uma entrada que já recebeu correção humana pode gerar uma nova interpretação a partir do original e torná-la a versão atual. Mesmo com histórico e undo, isso pode ser percebido como o Brain desfazendo uma correção do usuário.

Antes da próxima fase, o produto precisa distinguir claramente:

- **tentar novamente**, para uma entrada que falhou;
- **reanalisar**, para produzir uma sugestão de nova leitura;
- **substituir a leitura atual**, que deveria exigir comparação e confirmação quando houver correção humana anterior.

### 4.6 Confirmação de tarefas candidatas

Se a extração contém candidatos, todos começam selecionados. O usuário pode desmarcar alguns, visualizar título, descrição, prazo e um percentual de confiança, e então criar as tarefas escolhidas.

O fluxo oferece:

- confirmação seletiva;
- criação transacional;
- feedback de sucesso;
- undo da criação.

Ainda não oferece:

- editar título ou descrição;
- ajustar prazo;
- escolher projeto, pessoa ou contexto;
- indicar “Aguardando”;
- corrigir uma tarefa sem corrigir a interpretação inteira;
- rejeitar ou dispensar candidatos com significado explícito;
- explicar por que o candidato foi gerado em linguagem natural;
- resolver inconsistência com uma correção recém-feita.

A confirmação é segura, mas não é confortável. O usuário escolhe entre aceitar quase como veio ou não criar.

### 4.7 Execução da tarefa

Depois da confirmação, a tarefa aparece nas superfícies de trabalho.

O produto possui:

- `Tarefas`, com a lista geral;
- `Hoje`, com prazos de hoje e atrasados;
- `Aguardando`, para itens dependentes de terceiros;
- cartão de prioridades na Home.

Na lista, o usuário pode:

- concluir;
- mover para Aguardando;
- retomar;
- reabrir uma concluída.

Não há uma experiência completa de tarefa:

- não há detalhe da tarefa;
- não há edição de título, descrição ou prazo;
- não há replanejamento ou adiamento explícito;
- não há prioridade visível e ajustável;
- não há projeto/pessoa/contexto visível na linha principal;
- não há follow-up associado ao estado Aguardando;
- não há motivo do bloqueio;
- não há dependências ou subtarefas;
- não há gesto de conclusão com undo imediato na própria lista.

O resultado é um funil invertido: o usuário recebe uma página sofisticada para avaliar a interpretação, mas uma lista básica para realizar o trabalho.

### 4.8 Perguntas pendentes

A fila de perguntas é uma boa decisão: quando há ambiguidade, o sistema pergunta em vez de inventar.

Hoje, responder uma pergunta:

- salva a resposta;
- marca a pergunta como `answered`;
- remove o item da fila aberta.

Mas a resposta não fecha o ciclo completo:

- não cria nova interpretação;
- não recalcula confiança;
- não atualiza candidatos;
- não mostra a consequência antes de aplicar;
- não oferece undo do efeito;
- não remove semanticamente a pergunta da revisão imutável já exibida no detalhe.

Por isso, “Responder” parece uma ação de produto acabada, mas funciona principalmente como encerramento administrativo da fila.

### 4.9 Revisões e proatividade

Há geração manual de resumo diário, revisão semanal, planejamento semanal e revisão mensal. O conteúdo é fundamentado nos registros e a geração usa preferências reais de modelo, estilo e nível de detalhe.

Porém:

- a geração é manual;
- a documentação reconhece que revisões automáticas ainda não estão completas;
- Configurações permite escolher horários de revisão e planejamento como se o comportamento já estivesse programado;
- a Home mostra uma preferência de horário em um cartão que visualmente sugere ritmo operacional.

Esse é um risco de confiança. Um usuário configura sexta-feira às 19h e espera que algo aconteça. Se nada acontecer, ele não conclui que “o consumer ainda não existe”; conclui que o Brain não é confiável.

## 5. Partes da UX que ainda parecem artificiais ou excessivamente técnicas

### 5.1 A personificação afirma mais do que o sistema entrega

“Brain atento”, “Brain ativo”, “o Brain fecha o dia” e configurações de autonomia criam a expectativa de presença contínua. O produto ainda é majoritariamente reativo, com algumas rotinas específicas.

Uma personificação forte funciona somente quando o comportamento é previsível. Caso contrário, ela amplifica a decepção.

### 5.2 Confiança como porcentagem transmite falsa precisão

Percentuais são úteis para observabilidade, mas o usuário não sabe a diferença prática entre 78%, 83% e 91%. A pergunta real é:

- posso confiar e seguir;
- preciso confirmar algo;
- o Brain não sabe.

A interface deveria priorizar essa consequência, deixando o número e as evidências como detalhes opcionais.

### 5.3 Políticas internas aparecem como linguagem de produto

`auto_apply`, `apply_and_flag`, `request_review` e `block_until_confirmation` possuem traduções, mas continuam sendo categorias do motor de decisão. Para um usuário, os equivalentes deveriam ser ações claras:

- “Pronto”;
- “Confira esta data”;
- “Escolha entre estas pessoas”;
- “Não fiz nada sem sua confirmação”.

### 5.4 Metadados técnicos ocupam a navegação e as telas

Exemplos atuais:

- modelo e versão no rodapé da interpretação;
- tipo de ação, ator e tipo de entidade no Histórico;
- status e `period_type` em Revisões;
- percentuais de confiança em Memórias;
- tokens, catálogo, preço por milhão e roteamento por função em Custos e Configurações;
- fila de Jobs como rota de produto;
- tipos de entidade em inglês dentro do editor.

Esses dados devem continuar existindo, mas a maioria pertence a uma camada “Detalhes técnicos” ou a uma área administrativa.

### 5.5 A página de revisão parece um formulário de anotação de dataset

Editar classificações de resumo, conceitos, datas e vínculos é poderoso, porém artificial para uso cotidiano. O usuário quer corrigir o que está errado, não rotular a natureza epistemológica de cada campo.

### 5.6 Estados internos aparecem diretamente

O produto possui um ciclo interno rico: `saved`, `interpreting`, `awaiting_review`, `partially_processed`, `completed`, `recoverable_error`, `terminal_error` e `reprocessing`.

Essa precisão é adequada para banco e observabilidade. A interface diária precisa de uma projeção menor:

- **Salvo**;
- **Organizando**;
- **Precisa de você**;
- **Pronto**;
- **Não consegui organizar**.

## 6. Onde a experiência exige esforço desnecessário

### 6.1 Capturar exige esperar e mudar de contexto

O usuário não consegue “soltar” o pensamento e seguir. Ele precisa acompanhar a interpretação e chega automaticamente à revisão detalhada.

### 6.2 Toda captura bem-sucedida vira potencial sessão de auditoria

Mesmo entradas simples são levadas para a mesma superfície profunda. Não há diferenciação forte entre:

- algo já compreendido e seguro;
- algo com uma única dúvida;
- algo que exige revisão completa.

### 6.3 Corrigir uma parte exige abrir o editor inteiro

Uma correção pontual deveria acontecer junto ao campo. Hoje, o usuário entra em um modo de edição amplo e encontra controles que não precisava tocar.

### 6.4 O usuário decide duas vezes sobre a mesma intenção

Ele corrige a interpretação e depois ainda precisa lidar com candidatos que podem continuar baseados na leitura anterior.

### 6.5 A execução está fragmentada

Home, Hoje, Tarefas e Aguardando representam variações do mesmo conjunto. O usuário precisa aprender onde cada tarefa aparecerá em vez de trabalhar em uma superfície única com visões.

### 6.6 Aguardando não possui contexto suficiente

Mover para Aguardando não pede quem deve responder, quando acompanhar ou qual foi o combinado. A lista comunica estado, mas não reduz o trabalho mental de acompanhamento.

### 6.7 Perguntas são respondidas sem efeito visível

O usuário fornece informação e não vê “o que mudou”. Isso reduz a motivação para responder futuras perguntas.

### 6.8 A navegação exige que o usuário entenda a ontologia do produto

No desktop, quase todas as áreas são apresentadas no mesmo nível: Hoje, Caixa, Tarefas, Aguardando, Projetos, Pessoas, Lembretes, Perguntas, Chat, Memórias, Revisões, Arquivos, Histórico, Custos e Configurações.

Essa arquitetura é completa, mas não priorizada.

### 6.9 Configurações transfere decisões de engenharia para o usuário

Escolher modelo para chat, extração, raciocínio, revisão, arquivos, background e embedding é adequado para desenvolvimento, usuários avançados ou administração de custos. Para o usuário cotidiano, isso aumenta ansiedade e cria a possibilidade de degradar a experiência sem entender a consequência.

## 7. Funcionalidades implementadas que ainda não transmitem produto acabado

| Funcionalidade | O que já está implementado | Por que ainda parece incompleta |
| --- | --- | --- |
| Captura inteligente | original durável, interpretação, embedding, lifecycle e falha recuperável | bloqueia a interação, redireciona sempre para revisão e não oferece captura offline confiável |
| Revisões imutáveis | versionamento, correção, comparação, audit, undo e concorrência | a UX expõe o mecanismo e exige edição estrutural demais |
| Confiança | motor determinístico, evidências e políticas por elemento | apresenta falsa precisão e vocabulário interno |
| Reprocessamento | lease, timeout, idempotência e nova versão | o significado frente a correções humanas não está claro |
| Tarefas candidatas | seleção, confirmação transacional e undo | não há edição; candidatos permanecem inalterados após certas correções |
| Tarefas | listas e mudanças básicas de status | não há detalhe, edição, planejamento, priorização ou contexto operacional |
| Aguardando | estado e lista dedicados | falta pessoa, próximo follow-up e motivo |
| Perguntas pendentes | fila, resposta e encerramento | resposta não reinterpreta nem mostra consequência |
| Revisões | quatro tipos de revisão manual e fundamentada | horários configuráveis sugerem automação inexistente ou parcial |
| Configurações do agente | dados ricos e roteamento de IA persistido | vários controles ainda não têm consequência compatível com a promessa da tela |
| Projetos e Pessoas | criação, listagem, detalhe, vínculos e timeline | pouca edição, curadoria, merge ou correção de entidades |
| Memórias | criação, listagem, importância e confiança | falta ciclo claro de confirmação, correção e descarte |
| Arquivos | upload, análise, original privado, falha e retry | análise e candidatos ficam parcialmente isolados do fluxo principal de decisão |
| Histórico | trilha de auditoria real | apresenta nomes técnicos de ações e entidades em vez de narrativa humana |
| Custos de IA | ledger e detalhamento rigoroso | é uma excelente tela operacional, mas está alta demais na arquitetura do usuário comum |

## 8. Telas que deveriam ser redesenhadas antes de novas funcionalidades

### Prioridade 0 — Detalhe da Caixa de entrada

É a tela que mais precisa mudar porque é o destino obrigatório da captura atual e concentra o maior volume de linguagem técnica.

Proposta de estrutura:

1. **O que entendi** — uma frase editável;
2. **O que merece sua atenção** — somente campos duvidosos;
3. **Ações sugeridas** — tarefas editáveis ou opção “só guardar”;
4. **Registro original** — recolhido, sempre disponível;
5. **Como o Brain chegou nisso** — detalhes progressivos;
6. **Histórico** — recolhido e narrado em linguagem humana.

Confiança, sinais, versões, origem e modelo continuariam acessíveis, mas não dominariam a página.

### Prioridade 0 — Tarefas, Hoje e Aguardando

As três telas deveriam se tornar uma única experiência de trabalho com visões:

- Hoje;
- Próximas;
- Aguardando;
- Sem data;
- Concluídas.

Cada tarefa deveria permitir, no mínimo, editar título, prazo, projeto/pessoa, estado e próximo acompanhamento sem sair do fluxo.

### Prioridade 0 — Configurações

Antes do piloto, cada controle deve obedecer a uma regra simples:

> se não altera o comportamento observável, não deve parecer ativo.

A tela principal deveria conter apenas:

- identidade;
- idioma e fuso;
- estilo de resposta;
- notificações realmente operacionais;
- privacidade realmente aplicada.

Roteamento de modelos, preços e controles avançados deveriam ficar em “Avançado” ou ser ocultados no piloto.

### Prioridade 1 — Home

A Home tem boa identidade visual, mas precisa se tornar mais operacional:

- confirmação de captura instantânea;
- uma fila “Precisa de você”;
- prioridades reais, não apenas os cinco primeiros itens pela ordenação atual;
- cartões clicáveis;
- retomada da última ação;
- menos altura vazia no mobile;
- nenhuma promessa de revisão automática que não seja executada.

### Prioridade 1 — Caixa de entrada

A lista atual é cronológica e preserva bem o registro, mas precisa de triagem:

- Precisa de você;
- Organizando;
- Pronto;
- Só registros;
- Falhou;
- pesquisa e filtros simples.

O usuário diário não quer revisar tudo; quer revisar somente as exceções.

### Prioridade 1 — Perguntas pendentes

A resposta precisa mostrar a consequência:

- “Com isso, vou atualizar a data para sexta”;
- “Vou manter somente como registro”;
- “Vou sugerir uma tarefa para confirmar”.

Depois da resposta, o item deve desaparecer da fila e o detalhe da entrada deve refletir uma nova versão ou uma resolução claramente registrada.

### Prioridade 2 — Áreas secundárias

- mover Custos para Configurações > Uso;
- mover Histórico para Configurações > Atividade e para o contexto de cada objeto;
- não tratar Jobs como conceito de produto;
- integrar Lembretes à experiência de tarefa/notificação;
- agrupar Pessoas, Projetos, Memórias e Arquivos em uma área de contexto ou biblioteca;
- manter Chat mais próximo das ações primárias, pois ele expressa melhor a promessa de “Brain” do que várias telas técnicas.

## 9. Fluxos que podem ser simplificados

### 9.1 Captura ideal

Fluxo atual:

`Registrar → aguardar IA → abrir detalhe → inspecionar → decidir`

Fluxo recomendado:

`Registrar → confirmação imediata de salvo → continuar o que estava fazendo`

Em segundo plano:

`Organizar → autoaplicar somente o seguro → colocar exceções em Precisa de você`

O detalhe só deveria abrir automaticamente se a captura começou explicitamente em modo de revisão.

### 9.2 Revisão ideal

Fluxo atual:

`Entrada → esquema completo → confiança → correção → candidatos → histórico`

Fluxo recomendado:

`Entendi isto → há uma dúvida aqui → sugiro estas ações → confirmar`

Detalhes técnicos permanecem disponíveis por progressive disclosure.

### 9.3 Execução ideal

Fluxo atual:

`Home / Hoje / Tarefas / Aguardando → ações diferentes e limitadas`

Fluxo recomendado:

`Trabalho → escolher visão → agir na própria linha/cartão`

### 9.4 Perguntas ideal

Fluxo atual:

`Responder → marcar como respondida`

Fluxo recomendado:

`Responder → mostrar nova compreensão → confirmar efeito quando necessário → registrar versão e undo`

### 9.5 Arquitetura de informação ideal para o piloto

Navegação primária:

- Início;
- Caixa / Revisar;
- Trabalho;
- Falar com o Brain;
- Mais.

A captura permanece como ação global.

Em “Mais”:

- Contexto: Projetos, Pessoas, Memórias e Arquivos;
- Reflexão: Revisões;
- Preferências: Configurações;
- Transparência: Atividade e Uso de IA.

## 10. Decisões arquiteturais da Fase 2 a revisar antes da 2C

### 10.1 Manter: snapshots imutáveis e ponteiro atual

Não há razão para recuar dessa decisão. Ela protege o original, suporta undo real e cria a base correta para confiança.

O que deve mudar é a projeção de leitura: o usuário não precisa navegar pelo modelo de armazenamento.

### 10.2 Revisar: interpretação síncrona como parte da submissão

O ADR-018 manteve reprocessamento síncrono enquanto não existisse um consumidor assíncrono concreto. O uso diário agora fornece esse caso concreto.

A captura deveria finalizar assim que o original for persistido. A interpretação deveria usar a infraestrutura de lease da Fase 2A por meio de uma única implementação compartilhada, sem duplicar prompt ou provider.

Essa revisão não significa criar uma plataforma genérica. Significa aplicar a fila durável existente ao principal trabalho que o usuário não deveria esperar na tela.

### 10.3 Revisar: reprocessamento que promove automaticamente uma nova versão

Para falhas, “tentar novamente” pode promover o resultado.

Para uma entrada já corrigida por usuário, uma nova análise deveria nascer como proposta comparável. A promoção a atual deve preservar ou pedir confirmação sobre divergências em campos corrigidos manualmente.

### 10.4 Revisar: candidatos como evidência e como estado editável

Os candidatos extraídos pertencem ao snapshot imutável como evidência do que o modelo propôs.

O que o usuário edita é outra coisa: uma decisão desejada antes de materializar tarefas. A Fase 2C não deve mutar a evidência original nem inflar `raw_output` com estado de formulário.

O contrato recomendado é:

1. snapshot guarda o candidato original;
2. uma projeção/draft representa a decisão do usuário;
3. uma operação transacional materializa as tarefas;
4. audit e undo registram a consequência;
5. o estado da UI distingue aceito, editado, dispensado e já criado.

### 10.5 Revisar: confiança como parte principal da interface

Manter pesos, thresholds, hard overrides e evidência persistida. Remover essa estrutura do primeiro nível visual.

O produto deveria projetar confiança em consequências, não em telemetria.

### 10.6 Revisar: múltiplos padrões de mutação

Hoje, operações críticas de interpretação e confirmação usam RPCs transacionais, enquanto mudanças simples de tarefas, respostas a perguntas e algumas criações usam ações diretas diferentes.

Não é necessário criar um command bus genérico. Porém, antes de ampliar tarefas, deve existir um único limite de domínio para as operações de tarefa que precisam de consistência, audit e undo. Esse mesmo limite deve servir à confirmação de candidato e à edição manual.

### 10.7 Revisar: configurações persistidas antes da capacidade operacional

Persistir preferências futuras é aceitável. Apresentá-las como comportamento ativo não é.

Cada preferência precisa declarar uma destas situações:

- operacional;
- usada apenas para recomendação;
- em breve e desabilitada;
- interna/avançada.

### 10.8 Revisar: ciclo da pergunta pendente

Uma pergunta não deveria ser apenas uma linha mutável separada do snapshot que a gerou. A resposta deve alimentar uma nova interpretação ou uma resolução de decisão vinculada, com consequência explícita.

### 10.9 Manter, mas esconder: profundidade de observabilidade

Custos, modelos, jobs, audit, sinais de confiança e versões são diferenciais operacionais. Reduzir sua presença não significa removê-los. Significa tratá-los como infraestrutura de confiança acessível quando necessária.

## 11. Maiores riscos de produto em um MVP privado com 30 usuários

### P0 — A promessa de fluidez falha no primeiro hábito

Se a captura exigir espera e revisão, o usuário não formará o hábito de registrar tudo. Sem volume de uso, o Brain nunca acumula contexto suficiente para demonstrar valor.

### P0 — O produto promete autonomia que ainda não é observável

Horários de revisão, autonomia, follow-up e o status “Brain atento” criam expectativa contínua. Comportamento ausente ou inconsistente será percebido como falha de confiança.

### P0 — Uma correção pode coexistir com uma ação candidata desatualizada

Esse é o risco de produto mais delicado do fluxo atual. O usuário corrige a compreensão e, logo abaixo, ainda pode confirmar uma tarefa baseada na versão anterior do candidato.

### P0 — O produto ajuda mais a revisar do que a executar

Depois do esforço de interpretação, a tarefa resultante não pode ser realmente planejada ou editada. O usuário pode voltar ao gerenciador de tarefas que já utilizava.

### P1 — Sobrecarga de navegação mascara a proposta central

Com tantas áreas no mesmo nível, usuários diferentes podem experimentar partes isoladas e concluir que o produto é um conjunto de módulos, não um Brain coerente.

### P1 — Respostas e correções não fecham todos os loops

Perguntas respondidas sem reinterpretação, candidatos não recalculados e análises de arquivo isoladas criam sensação de “demo”: a interface aceita uma ação, mas o restante do sistema não se reorganiza de maneira visível.

### P1 — Falsa precisão prejudica confiança

Percentuais e políticas podem fazer usuários superestimarem ou subestimarem a IA. Alguns obedecerão a 92% como se fosse certeza; outros desconfiarão ao ver 78% em tudo.

### P1 — Falta de onboarding para o primeiro resultado valioso

As telas vazias são bonitas, porém o usuário precisa descobrir sozinho o que registrar, como uma captura vira ação e quando responder ao Brain. Para 30 usuários, isso gera suporte manual e resultados muito diferentes.

### P1 — O piloto não mede o funil de valor

Sem telemetria de produto, será difícil separar:

- problema de interpretação;
- problema de confiança;
- problema de usabilidade;
- falta de valor percebido.

O piloto precisa medir pelo menos captura salva, tempo de confirmação, revisão solicitada, edição, candidato aceito/dispensado, tarefa concluída e retenção semanal.

### P1 — Captura mobile não é resiliente fora de conexão

Para um produto que quer substituir memória imediata, perder a capacidade de salvar quando a conexão oscila é um risco de hábito, mesmo que seja uma decisão consciente de privacidade.

### P2 — Entidades acumulam sem curadoria suficiente

Projetos, pessoas e memórias automáticos podem gerar duplicatas ou contexto obsoleto. A resolução determinística reduz o problema, mas o usuário ainda precisa de merge, correção e arquivamento simples.

### P2 — Custos e modelos distraem da utilidade

Usuários podem escolher modelos pelo preço sem compreender qualidade e depois atribuir resultados piores ao produto. Para o piloto, o sistema deveria oferecer um perfil recomendado e esconder o roteamento fino.

## 12. Oportunidades concretas de reduzir complexidade

| Complexidade atual | Simplificação recomendada |
| --- | --- |
| 15 ou mais destinos visíveis | 4 destinos primários, captura global e um menu Mais |
| Home, Hoje, Tarefas e Aguardando separados | uma superfície de Trabalho com visões |
| oito estados internos de interpretação | quatro ou cinco estados humanos |
| confiança, política, sinais e evidências abertos | consequência primeiro; detalhes sob demanda |
| editor de interpretação completo | correção inline do campo relevante |
| pergunta em fila separada | decisão integrada à entrada e ao Review Center |
| histórico técnico global | atividade narrada no contexto do objeto; histórico global avançado |
| Custos como destino principal | Uso de IA dentro de Configurações |
| roteamento por sete funções | perfil recomendado; configuração fina avançada |
| Lembretes como módulo próprio | agendamento/notificação dentro do trabalho |
| candidatos de arquivos isolados | mesmo fluxo de decisão usado por capturas de texto |
| Pessoas, Projetos, Memórias e Arquivos dispersos | uma área Contexto/Conhecimento com filtros |
| reprocessar como ação genérica | tentar novamente em falha; reanalisar como proposta em conteúdo corrigido |

## 13. Como a Fase 2C deveria mudar

### 13.1 O que manter

- confirmação explícita de tarefas implícitas;
- edição antes da criação;
- seleção individual;
- criação transacional;
- audit e undo;
- vínculo com a interpretação e evidência original;
- timezone correto;
- ownership e RLS.

### 13.2 O que reduzir no primeiro corte

O escopo atual da 2C inclui título, descrição, status, prioridade, datas, projeto, contexto, pessoa, dependências, subtarefas, motivo sem prazo, split/merge, record-only, reject e cancel.

Isso é grande demais antes de validar o ciclo básico.

Primeiro corte recomendado:

- selecionar ou dispensar candidato;
- editar título;
- editar descrição curta;
- ajustar prazo;
- escolher projeto ou pessoa quando relevante;
- escolher “A fazer” ou “Aguardando”;
- confirmar;
- desfazer.

Adiar:

- dependências;
- subtarefas avançadas;
- split/merge;
- planned date separada de due date;
- motivo obrigatório para ausência de prazo;
- matriz completa de prioridade;
- cancelamento semântico avançado;
- automações derivadas da estrutura de subtarefas.

Esses recursos devem voltar somente se o piloto mostrar que usuários tentam expressá-los nas capturas e não conseguem concluir o trabalho.

### 13.3 O que adicionar antes do editor avançado

- captura assíncrona e confirmação imediata;
- fila “Precisa de você”;
- revisão simplificada;
- projeção humana de estados e confiança;
- uma superfície de tarefas realmente editável;
- remoção ou desativação de promessas não operacionais em Configurações;
- métricas do funil de valor.

### 13.4 O que reordenar

Perguntas que fecham a interpretação são mais importantes do que dependências e split/merge. Edição manual de tarefas é mais importante do que atualização de tarefas por linguagem natural. Verdade de produto nas configurações é mais importante do que ampliar autonomia.

## 14. Ordem revisada para as próximas fases

### Fase 2C revisada — Convergência do ciclo diário

Objetivo: transformar a fundação atual em um produto simples de usar várias vezes por dia.

Escopo:

- captura salva imediatamente e interpretação desacoplada;
- retorno ao contexto anterior após capturar;
- fila “Precisa de você”;
- detalhe da entrada com progressive disclosure;
- estados e confiança em linguagem humana;
- Home acionável;
- unificação conceitual de Hoje, Tarefas e Aguardando;
- auditoria de todas as promessas de Configurações;
- instrumentação do funil do piloto.

### Fase 2D revisada — Da sugestão à tarefa executável

Objetivo: fechar o caminho entre interpretação e trabalho real.

Escopo:

- editor mínimo de candidato;
- seleção e dispensa explícita;
- título, descrição, prazo, projeto/pessoa e estado inicial;
- mesma operação de domínio para criação e edição posterior;
- audit e undo;
- consistência obrigatória após correção da interpretação;
- integração de candidatos de texto e arquivos.

### Fase 2E revisada — Perguntas que resolvem, não apenas fecham

Objetivo: fazer cada resposta melhorar visivelmente o estado do Brain.

Escopo:

- resposta natural e opções sugeridas;
- efeito previsto;
- nova interpretação ou resolução vinculada;
- atualização de confiança e candidatos;
- deferir, ignorar e marcar como irrelevante;
- audit, resultado e undo;
- integração com Chat e com a fila “Precisa de você”.

### Fase 2F revisada — Prontidão para o MVP privado

Objetivo: lançar para 30 usuários medindo valor, não tolerância.

Escopo:

- onboarding para o primeiro ciclo completo;
- perfis recomendados e remoção de configurações enganosas;
- comportamento real para revisões programadas ou ocultação dos horários;
- resiliência de captura mobile/offline com decisão explícita de privacidade;
- limpeza e merge básico de entidades;
- suporte e recuperação de conta adequados ao piloto;
- dashboards internos de ativação, revisão, aceitação, conclusão e retenção;
- teste moderado com usuários antes de ampliar autonomia.

### Pós-MVP — somente após evidência do piloto

1. atualizações de tarefas em linguagem natural, antigo escopo da 2E;
2. retroatividade completa e invalidação de revisões históricas, antigo escopo da 2F;
3. dependências, subtarefas avançadas e split/merge;
4. automação mais autônoma;
5. revisão mais ampla de canais e integrações.

## 15. Critério recomendado para liberar o piloto de 30 usuários

Eu liberaria o piloto quando estes comportamentos fossem verdadeiros:

- registrar algo produz confirmação de salvamento quase imediata;
- o usuário pode sair da tela enquanto o Brain organiza;
- somente exceções aparecem como pendência;
- uma correção nunca deixa ação contraditória visível;
- “somente registro” realmente não pressiona criação de tarefa;
- um candidato pode ser ajustado antes de virar tarefa;
- uma tarefa pode ser editada e executada sem voltar à interpretação;
- responder uma pergunta mostra o que mudou;
- nenhuma configuração promete rotina inexistente;
- o usuário comum não precisa ver jobs, modelos, políticas ou nomes internos de estado;
- o piloto mede o caminho captura → revisão → tarefa → conclusão;
- onboarding conduz ao primeiro resultado em poucos minutos.

## 16. Conclusão

As Fases 2A e 2B não foram um desvio; foram a base correta. Elas reduziram riscos de perda, concorrência, confiança e reversibilidade que seriam muito caros depois.

O próximo passo, porém, não deveria ser continuar adicionando profundidade ao mesmo fluxo de revisão.

O My Brain precisa agora converter:

- lifecycle em tranquilidade;
- confiança em decisões claras;
- versões em segurança silenciosa;
- candidatos em trabalho editável;
- perguntas em aprendizado visível;
- automação em promessas que realmente se cumprem.

A recomendação final é substituir a Fase 2C atual por uma fase de convergência do ciclo diário, mover o editor mínimo de candidatos para a fase seguinte e adiar recursos avançados até que um piloto privado demonstre necessidade real.

O produto já possui uma arquitetura capaz de sustentar um bom segundo cérebro. O trabalho mais importante agora é fazer essa arquitetura deixar de parecer trabalho para o usuário.

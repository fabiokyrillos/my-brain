# PRD — My Brain Mobile-First Product Experience

**Status:** Proposto para revisão do owner

**Data:** 2026-08-07

**Tipo:** iniciativa de produto e experiência, posterior à Phase 2H

**Direção:** assistente pessoal contextual, confiável e prioritariamente mobile

**Documento relacionado:** [`MY_BRAIN_UX_ROADMAP.md`](./MY_BRAIN_UX_ROADMAP.md)

## 1. Resumo executivo

O My Brain já possui captura em linguagem natural, interpretação revisável, tarefas, conversa, perguntas pendentes, pessoas, empresas, projetos, contextos, memórias, lembretes, revisões, arquivos, notificações, histórico, custos de IA e preferências. O problema principal já não é ausência de capacidade: é a experiência fragmentada para descobrir, compreender e usar essas capacidades todos os dias.

Esta iniciativa transforma o produto em uma experiência coerente com uma promessa simples:

> Tirar algo da cabeça, entender o que merece atenção, conversar sobre o contexto e transformar informação em ação confiável — especialmente pelo celular.

A iniciativa prioriza:

1. uma navegação menor e uma linguagem visual consistente;
2. `Hoje` como centro do uso diário;
3. captura multimodal, incluindo voz com transcrição revisável;
4. uma caixa única `Precisa de você`;
5. `Conversar` como principal interface inteligente e acionável;
6. respostas com fontes, explicações e confirmação;
7. uma experiência de Trabalho, calendário e planejamento realmente diária;
8. páginas úteis de pessoas, projetos, memórias e arquivos;
9. privacidade, personalização e onboarding progressivos;
10. evolução mobile-first desde o início, e não como adaptação posterior.

## 2. Decisão de produto

O My Brain será posicionado primeiro como um **assistente pessoal contextual**. Tarefas e conhecimento são capacidades centrais, mas não definem isoladamente o produto.

O produto deve parecer uma única jornada:

1. **Capturar** o que o usuário pensa, diz, recebe ou observa.
2. **Compreender** o conteúdo sem apagar o original.
3. **Perguntar** quando existir ambiguidade.
4. **Confirmar** antes de produzir efeitos relevantes.
5. **Agir** por meio de tarefas, lembretes, vínculos e organização.
6. **Lembrar** o que continua válido.
7. **Recuperar e explicar** informações usando fontes visíveis.
8. **Revisar** o dia, a semana e os compromissos assumidos.

## 3. Problema do usuário

### 3.1 Problema principal

O usuário encontra muitas páginas e capacidades, mas precisa entender a estrutura interna do produto para chegar ao que deseja. Isso aumenta o custo de navegação, enfraquece a percepção de inteligência e dificulta criar hábito no celular.

### 3.2 Sintomas atuais

- muitos destinos de navegação competem pela atenção;
- decisões aparecem separadas entre Registros, Perguntas, notificações e falhas;
- `Hoje` ainda não funciona como um cockpit completo do dia;
- `Conversar` oferece capacidade relevante, mas ainda não é a interface visual e acionável central;
- tarefas exigem mais navegação e formulários do que o uso diário ideal;
- pessoas e projetos não resumem claramente relações, compromissos e contexto recente;
- fontes, inferências e incertezas não estão sempre apresentadas da maneira mais compreensível;
- captura ainda é predominantemente textual;
- páginas secundárias variam em densidade, acabamento e clareza;
- a experiência mobile ainda é uma adaptação da estrutura ampla do produto.

### 3.3 Resultado desejado

Um usuário deve conseguir, pelo celular e sem conhecer a estrutura interna do produto:

- capturar texto ou voz em segundos;
- descobrir o que precisa de atenção;
- conversar e executar ações por cards claros;
- localizar qualquer informação;
- planejar e conduzir o dia;
- compreender de onde veio uma resposta;
- revisar e corrigir o que o Brain lembra;
- navegar entre tarefas, pessoas, projetos, arquivos e memórias sem perder contexto.

## 4. Princípios de experiência

1. **Mobile primeiro.** Toda slice deve ser desenhada primeiro para largura móvel e depois expandida para desktop.
2. **Uma ação principal por momento.** Cada tela deve deixar claro o próximo passo mais útil.
3. **Original, interpretação e ação são diferentes.** A interface nunca deve misturá-los visualmente.
4. **A IA propõe; o usuário controla.** Ações relevantes devem possuir prévia, confirmação ou desfazer proporcional ao risco.
5. **Explicar sem sobrecarregar.** Fontes e raciocínio ficam disponíveis por progressive disclosure.
6. **Convergir antes de expandir.** Capacidades existentes devem ganhar uma jornada coesa antes de novas integrações.
7. **Silêncio também é um resultado.** O produto não deve inventar urgência para aumentar engajamento.
8. **Nenhuma tela sem próximo passo.** Vazios, falhas e bloqueios devem orientar uma ação segura.
9. **Continuidade entre superfícies.** Captura, conversa, registro, tarefa e memória devem manter contexto e retorno previsível.
10. **Acessibilidade é requisito de conclusão.** Teclado, leitor de tela, contraste, movimento reduzido e alvos de toque fazem parte da entrega.

## 5. Nova arquitetura da experiência

### 5.1 Navegação principal

Os destinos primários serão:

- **Hoje**
- **Registros**
- **Trabalho**
- **Conversar**
- **Biblioteca**
- **Capturar**, como ação global destacada

### 5.2 Biblioteca

`Biblioteca` agrupa:

- Memórias
- Pessoas
- Projetos
- Empresas
- Contextos
- Arquivos

### 5.3 Configurações e atividade

Uma área secundária agrupa:

- Notificações
- Histórico
- Custos de IA
- Processamentos
- Preferências
- Privacidade e conta

### 5.4 Navegação mobile

A barra inferior mobile contém:

- Hoje
- Trabalho
- Capturar
- Conversar
- Mais

`Capturar` ocupa a posição central e deve aceitar texto e voz. `Mais` abre Biblioteca, Registros, atividade e configurações. Links antigos continuam acessíveis e não obrigam o usuário a reaprender URLs salvas.

## 6. Escopo aprovado

### 6.1 Incluído

- simplificação da navegação e da hierarquia de informação;
- redesign completo de `Hoje`;
- busca global e command palette;
- captura unificada por texto, voz e arquivos já suportados;
- transcrição de voz revisável antes do envio;
- detalhe de Registro apresentado como uma história compreensível;
- caixa única `Precisa de você`;
- experiência avançada de Trabalho;
- planejador diário;
- conversa com cards acionáveis;
- fontes e explicações das respostas;
- central de memórias e conflitos;
- páginas contextuais de pessoas e projetos;
- grafo de relações como ferramenta secundária;
- biblioteca inteligente de arquivos;
- calendário;
- revisões diária, semanal e mensal;
- notificações por nível de urgência e uso mobile;
- onboarding por ativação real;
- estados vazios, carregamento, erro e processamento;
- evolução mobile-first;
- sistema visual e componentes consistentes;
- personalização progressiva;
- central de privacidade e controle.

### 6.2 Fora de escopo

- modo de demonstração;
- reescrever capacidades já funcionais apenas para trocar tecnologia;
- transformar o produto em uma rede social ou ferramenta de colaboração ampla;
- autonomia irrestrita para a IA executar ações sensíveis;
- gamificação baseada em streaks, culpa ou notificações artificiais;
- substituir o My Brain por um gerenciador de tarefas genérico;
- integrações externas da seção 18 durante as etapas principais.

## 7. Métricas de sucesso

As métricas devem ser medidas sem registrar conteúdo pessoal.

### 7.1 Ativação

- tempo mediano até a primeira captura;
- percentual que conclui primeira captura, primeira tarefa e primeira memória;
- percentual que configura IA e processa uma entrada pendente;
- retorno no dia seguinte e na primeira semana.

### 7.2 Uso diário

- percentual de sessões iniciadas por `Hoje`, `Capturar` ou `Conversar`;
- tempo até concluir a primeira ação útil;
- decisões resolvidas em `Precisa de você`;
- tarefas concluídas, adiadas ou corrigidas sem abandonar a tela;
- uso mobile em relação ao desktop.

### 7.3 Confiança

- abertura de fontes e explicações;
- taxa de edição antes da confirmação;
- taxa de desfazer;
- sugestões descartadas;
- conflitos de memória resolvidos;
- respostas reportadas como incorretas ou sem fonte suficiente.

### 7.4 Retenção saudável

- usuários que realizam revisão diária ou semanal;
- retornos originados por notificações úteis;
- notificações silenciadas ou desativadas;
- recorrência de uso sem depender de aumento de notificações.

## 8. Roadmap por etapas e slices

As estimativas assumem uma equipe de referência com 2 pessoas de produto/engenharia frontend, 1 pessoa de backend/IA compartilhada, 1 designer de produto e apoio parcial de produto/QA. São estimativas de calendário, não compromissos.

### Etapa 0 — Contrato visual e mobile-first

**Prioridade:** P0

**Estimativa:** 4–6 semanas

**Objetivo:** criar a base para que as etapas seguintes não reconstruam navegação, estados e componentes repetidamente.

#### Slice 0.1 — Linguagem visual e estados

**Estimativa:** 1–2 semanas

- definir cores semânticas para informação, sucesso, atenção, risco, sugestão da IA e conteúdo arquivado;
- distinguir visualmente texto do usuário, interpretação, sugestão e ação confirmada;
- padronizar tipografia, espaçamento, elevação, bordas e densidade;
- definir comportamento para modo escuro apenas se puder ser entregue completo; caso contrário, mantê-lo fora desta iniciativa.

**Aceite:** os estados principais possuem significado consistente e não dependem apenas de cor.

#### Slice 0.2 — Componentes de confiança

**Estimativa:** 1–2 semanas

- card de sugestão;
- card de confirmação;
- card de fonte;
- banner de processamento;
- feedback com desfazer;
- chips de pessoa, projeto, empresa e contexto;
- linha do tempo;
- painel lateral no desktop e tela completa equivalente no mobile.

**Aceite:** capturas, registros, conversa e tarefas podem reutilizar a mesma linguagem de ação e confiança.

#### Slice 0.3 — Shell mobile e estados universais

**Estimativa:** 2 semanas

- barra inferior mobile;
- cabeçalhos compactos;
- áreas de toque adequadas;
- comportamento de teclado virtual e safe areas;
- padrões de vazio, loading, erro recuperável, erro terminal e offline;
- retorno de foco e preservação de contexto após ações.

**Aceite:** todas as novas slices possuem contrato mobile, teclado e leitor de tela antes de serem consideradas concluídas.

### Etapa 1 — Convergência da navegação e descoberta

**Prioridade:** P0

**Estimativa:** 5–7 semanas

**Dependência:** Etapa 0

#### Slice 1.1 — Navegação reduzida

**Estimativa:** 1–2 semanas

- adotar Hoje, Registros, Trabalho, Conversar e Biblioteca;
- mover superfícies secundárias para atividade/configurações;
- preservar links e rotas existentes;
- manter estado de navegação consistente entre desktop e mobile.

#### Slice 1.2 — Biblioteca

**Estimativa:** 1–2 semanas

- criar uma entrada única para Memórias, Pessoas, Projetos, Empresas, Contextos e Arquivos;
- mostrar recentes, fixados e itens que precisam de atenção;
- evitar um novo dashboard de métricas.

#### Slice 1.3 — Command palette

**Estimativa:** 1–2 semanas

- abrir em todas as telas por teclado;
- navegar para páginas;
- iniciar captura, conversa e tarefa;
- exibir ações disponíveis para o contexto atual;
- oferecer entrada equivalente por toque no mobile.

#### Slice 1.4 — Busca global lexical

**Estimativa:** 2 semanas

- buscar tarefas, registros, memórias, pessoas, projetos, empresas e arquivos;
- identificar claramente o tipo de cada resultado;
- oferecer filtros de tipo e período;
- apresentar estados de vazio e reformulação.

**Fora desta slice:** busca semântica e respostas compostas, que entram após fontes e explicabilidade.

### Etapa 2 — Hoje, captura e atenção

**Prioridade:** P0

**Estimativa:** 8–11 semanas

**Dependências:** Etapas 0 e 1

#### Slice 2.1 — Hoje: captura e prioridades

**Estimativa:** 2 semanas

- captura no topo;
- até três prioridades do dia;
- prazos e atrasos;
- acesso imediato ao plano diário;
- ausência de métricas decorativas.

#### Slice 2.2 — Hoje: contexto e encerramento

**Estimativa:** 1–2 semanas

- `Aguardando retorno`;
- `O Brain percebeu`;
- perguntas e registros pendentes;
- encerramento do dia;
- continuidade para revisão diária.

#### Slice 2.3 — Precisa de você

**Estimativa:** 2 semanas

- reunir sugestões de tarefa, ambiguidades, perguntas, conflitos, falhas recuperáveis e configuração pendente;
- filtros por tipo;
- confirmar, editar, dispensar e adiar;
- ações repetidas em lote somente para itens equivalentes e seguros.

#### Slice 2.4 — Captura unificada

**Estimativa:** 1–2 semanas

- um único campo para texto e anexos suportados;
- recibo claro após captura;
- revisar agora, deixar para depois ou desfazer;
- nunca exigir classificação antecipada.

#### Slice 2.5 — Gravação de voz e transcrição revisável

**Estimativa:** 2–3 semanas

A transcrição deve usar Whisper ou serviço compatível com a mesma finalidade, mantendo a escolha do provedor invisível para a experiência do usuário.

Fluxo obrigatório:

1. iniciar gravação;
2. pausar ou concluir o trecho;
3. enviar o áudio para transcrição;
4. mostrar a transcrição como rascunho editável;
5. permitir continuar digitando;
6. permitir gravar outro trecho, acrescentando nova transcrição;
7. permitir apagar texto ou trechos;
8. só capturar quando o usuário confirmar.

Requisitos adicionais:

- estado explícito de gravação e duração;
- cancelamento antes do envio;
- tratamento de permissão negada;
- indicação de transcrição em andamento;
- preservação do rascunho se a transcrição falhar;
- nenhum áudio deve virar ação ou memória automaticamente;
- o usuário deve saber se o áudio original será mantido ou descartado antes de confirmar.

### Etapa 3 — Conversar como interface principal

**Prioridade:** P0 — foco estratégico

**Estimativa:** 9–13 semanas

**Dependências:** Etapas 0–2

#### Slice 3.1 — Cards acionáveis na conversa

**Estimativa:** 2–3 semanas

- prévias de tarefa, memória, pessoa e registro;
- confirmação, edição e descarte no próprio card;
- escolhas visuais quando houver múltiplos candidatos;
- resultado da ação e desfazer na conversa.

#### Slice 3.2 — Continuidade entre conversa e produto

**Estimativa:** 1–2 semanas

- abrir tarefa, registro, memória, pessoa ou projeto sem perder a conversa;
- voltar para a posição anterior;
- preservar o contexto visual da ação que originou a navegação;
- permitir retomar confirmações pendentes.

#### Slice 3.3 — Fontes por resposta

**Estimativa:** 2 semanas

- mostrar registros, memórias, tarefas, pessoas, projetos e arquivos usados;
- abrir a fonte no ponto relevante quando possível;
- distinguir informação direta de inferência;
- informar quando a resposta não possui fonte pessoal suficiente.

#### Slice 3.4 — Como o Brain chegou nisso

**Estimativa:** 1–2 semanas

- progressive disclosure para interpretação, incertezas, informações conflitantes e itens ignorados;
- linguagem humana, sem expor detalhes internos desnecessários;
- opção de corrigir a origem ou o entendimento.

#### Slice 3.5 — Sugestões contextuais

**Estimativa:** 1–2 semanas

- atalhos como `Resuma meu dia`, `Quem está esperando por mim?`, `O que mudou no projeto?`;
- sugestões determinadas pelo contexto da tela e não por uma lista fixa excessiva;
- no máximo três sugestões visíveis por vez.

#### Slice 3.6 — Busca semântica e respostas compostas

**Estimativa:** 2–3 semanas

- linguagem natural para recuperar conteúdo relacionado;
- combinação de busca por palavras, significado, tipo, data e relações;
- resposta sempre ligada às fontes recuperadas;
- correção ou reformulação quando o resultado for fraco.

### Etapa 4 — Trabalho, calendário e rituais

**Prioridade:** P1

**Estimativa:** 12–17 semanas

**Dependências:** Etapas 0–3; partes podem iniciar após a Etapa 2

#### Slice 4.1 — Edição rápida e painel de tarefa

**Estimativa:** 2–3 semanas

- editar título e propriedades sem abandonar a lista;
- painel lateral no desktop e tela completa no mobile;
- ações rápidas por estado;
- feedback imediato e desfazer.

#### Slice 4.2 — Seleção e ações em massa

**Estimativa:** 2 semanas

- seleção múltipla;
- alterar estado, prazo, prioridade, projeto e contexto;
- prévia antes de operações destrutivas;
- resultado parcial compreensível quando algum item não puder mudar.

#### Slice 4.3 — Visões de Trabalho

**Estimativa:** 2–3 semanas

- lista;
- kanban;
- agrupamento por projeto, pessoa, prioridade e prazo;
- filtros salvos;
- densidade ajustável;
- linha do tempo apenas onde datas suficientes existirem.

#### Slice 4.4 — Calendário

**Estimativa:** 3–4 semanas

- dia, semana, mês e agenda;
- tarefas, lembretes, revisões e datas extraídas ainda não confirmadas;
- distinção visual entre compromisso confirmado e sugestão;
- criação e reagendamento por toque;
- integrações externas permanecem fora.

#### Slice 4.5 — Planejador diário

**Estimativa:** 2–3 semanas

- sugerir um plano com base em prazo, prioridade, duração e dependências;
- aceitar, reorganizar ou ignorar;
- nunca mover silenciosamente tarefas;
- adaptar-se ao tempo disponível informado pelo usuário.

#### Slice 4.6 — Revisões e encerramento

**Estimativa:** 2 semanas

- revisão diária;
- revisão semanal;
- revisão mensal;
- transformar conclusões em tarefas, memórias ou ajustes somente após confirmação.

#### Slice 4.7 — Notificações úteis no mobile

**Estimativa:** 2 semanas

- níveis `Agora`, `Hoje` e `Resumo`;
- ação rápida na notificação;
- explicação do motivo;
- agrupamento e deduplicação;
- controle por tipo, frequência e período silencioso;
- medir utilidade sem estimular notificações artificiais.

### Etapa 5 — Contexto, memória e arquivos

**Prioridade:** P1

**Estimativa:** 13–18 semanas

**Dependências:** Etapas 0, 1 e 3; pode avançar em paralelo à Etapa 4 com uma segunda equipe

#### Slice 5.1 — Página contextual de pessoa

**Estimativa:** 2 semanas

- identidade, empresa e relação;
- projetos e tarefas em comum;
- últimas interações;
- compromissos de ambas as partes;
- aguardando a pessoa e pessoa aguardando o usuário;
- memórias e registros relacionados.

#### Slice 5.2 — Página contextual de projeto

**Estimativa:** 2–3 semanas

- objetivo e situação;
- próximos passos;
- tarefas e pessoas;
- decisões recentes;
- riscos e bloqueios;
- registros, arquivos e memórias;
- resumo atual explicável e com fontes.

#### Slice 5.3 — O que o Brain sabe

**Estimativa:** 2 semanas

- memórias agrupadas por significado para o usuário;
- origem, validade, sensibilidade, relações e uso recente;
- revisão de memórias importantes e sensíveis;
- arquivar, reativar e editar com retorno previsível.

#### Slice 5.4 — Conflitos de memória

**Estimativa:** 2–3 semanas

- detectar afirmações potencialmente incompatíveis;
- manter anterior, substituir, contextualizar, definir validade ou descartar;
- nunca resolver conflito automaticamente;
- mostrar o impacto futuro da decisão.

#### Slice 5.5 — Biblioteca inteligente de arquivos

**Estimativa:** 3–4 semanas

- resumo e tópicos;
- pessoas, datas, empresas e projetos citados;
- tarefas e memórias sugeridas;
- visualização e origem por página/trecho quando disponível;
- coleções, recentes e busca no conteúdo;
- comparação entre arquivos em uma slice posterior somente após a busca básica estar estável.

#### Slice 5.6 — Grafo de relações

**Estimativa:** 2–3 semanas

- ferramenta secundária, nunca navegação principal;
- explorar relações entre pessoas, empresas, projetos, tarefas, registros, memórias e arquivos;
- começar pelo item atual e expandir sob demanda;
- oferecer alternativa em lista para mobile e acessibilidade;
- limitar densidade e evitar um grafo global ilegível.

### Etapa 6 — Ativação, preferências e controle

**Prioridade:** P1 antes de abertura pública ampla

**Estimativa:** 7–10 semanas

**Dependências:** experiências centrais das Etapas 1–3

#### Slice 6.1 — Onboarding por primeira conquista

**Estimativa:** 2–3 semanas

- idioma e fuso;
- nome e estilo do assistente;
- configuração da IA;
- primeira captura;
- primeira revisão de interpretação;
- primeira tarefa;
- primeira memória;
- chegada a `Hoje` já com contexto.

#### Slice 6.2 — Personalização progressiva

**Estimativa:** 2 semanas

- horário de trabalho;
- semana de calendário;
- estilo de planejamento;
- frequência de revisões;
- iniciativa do Brain;
- quantidade máxima de sugestões;
- confirmações obrigatórias por categoria;
- apresentar preferências avançadas somente quando forem relevantes.

#### Slice 6.3 — Privacidade e controle

**Estimativa:** 2–3 semanas

- dados guardados;
- memórias em vigor;
- ações recentes;
- credencial de IA;
- conteúdo aguardando processamento;
- consentimentos;
- exportação de dados;
- sessões ativas;
- exclusão de conta;
- modo privado para captura ou conversa futura, sem prometer anonimato incompatível com o funcionamento real.

#### Slice 6.4 — Polimento de ativação mobile

**Estimativa:** 1–2 semanas

- instalação como app;
- orientação para notificações no momento de valor, não no primeiro acesso;
- recuperação de onboarding interrompido;
- retomada de rascunhos;
- teste completo em aparelhos e tamanhos representativos.

## 9. O que pode ser desenvolvido em paralelo

Depois da Etapa 0:

- Etapa 1 deve liderar, pois altera como todas as superfícies são encontradas.
- Etapa 2 pode começar assim que navegação e componentes principais estabilizarem.
- Etapa 3 deve receber a maior concentração de produto e design, conforme a decisão de priorizar `Conversar`.
- Etapas 4 e 5 podem avançar em paralelo com equipes separadas após fontes, cards e navegação contextual estarem definidos.
- Etapa 6 começa parcialmente em paralelo, mas o onboarding final só deve ser fechado quando a jornada real das Etapas 1–3 existir.

O grafo, o calendário mensal completo, comparação de arquivos e personalização avançada não devem bloquear o lançamento das jornadas centrais.

## 10. Estimativa consolidada

| Entrega | Estimativa de calendário |
| --- | ---: |
| Etapa 0 — Fundação visual/mobile | 4–6 semanas |
| Etapa 1 — Navegação e descoberta | 5–7 semanas |
| Etapa 2 — Hoje, captura e atenção | 8–11 semanas |
| Etapa 3 — Conversar | 9–13 semanas |
| Etapa 4 — Trabalho e rituais | 12–17 semanas |
| Etapa 5 — Contexto e conhecimento | 13–18 semanas |
| Etapa 6 — Ativação e controle | 7–10 semanas |

### 10.1 Uma equipe de referência

- núcleo P0, Etapas 0–3: **6–9 meses**;
- iniciativa completa, com sequência majoritariamente linear: **14–20 meses**.

### 10.2 Duas equipes coordenadas

- núcleo P0: **4–6 meses**;
- iniciativa completa, paralelizando Trabalho e Contexto: **9–14 meses**.

### 10.3 Fatores que aumentam a estimativa

- redesign visual amplo sem componentes compartilhados primeiro;
- tentativa de entregar desktop e adaptar mobile somente no final;
- busca semântica antes de fontes e qualidade de recuperação;
- calendário com integrações externas na primeira versão;
- grafo global em vez de exploração contextual;
- processamento de novos formatos de arquivo além dos já suportados;
- decisões tardias sobre retenção de áudio, privacidade e notificações.

## 11. Riscos de produto e mitigação

### 11.1 O produto continuar parecendo complexo

**Risco:** adicionar cards, calendário e grafo sem reduzir navegação aumenta a complexidade.

**Mitigação:** Etapa 1 precede expansão e limita destinos primários.

### 11.2 Conversar virar uma coleção de widgets

**Risco:** cards demais tornam a conversa pesada.

**Mitigação:** apenas ações, escolhas e fontes usam cards; respostas comuns continuam textuais.

### 11.3 Proatividade virar ruído

**Risco:** notificações e sugestões reduzem confiança.

**Mitigação:** limites, silêncio, explicação do motivo e medição de desativação.

### 11.4 Voz causar perda de controle

**Risco:** transcrição errada virar ação.

**Mitigação:** transcrição é rascunho editável; captura exige confirmação explícita.

### 11.5 Busca responder além das fontes

**Risco:** uma resposta convincente não refletir os dados do usuário.

**Mitigação:** fontes por resposta, distinção entre fato e inferência e recusa quando a evidência for insuficiente.

### 11.6 Mobile receber uma versão reduzida demais

**Risco:** esconder capacidades importantes atrás de `Mais`.

**Mitigação:** command palette por toque, busca global e ações contextuais mantêm acesso sem poluir a barra principal.

## 12. Critérios globais de conclusão

Uma etapa só pode ser considerada concluída quando:

- seus fluxos principais funcionarem em mobile e desktop;
- estados vazio, loading, erro, offline e processamento estiverem cobertos;
- ações sensíveis possuírem confirmação ou desfazer coerente;
- navegação por teclado, foco e leitor de tela estiverem verificadas;
- textos existirem em português e inglês;
- nenhum conteúdo pessoal for incluído em métricas;
- eventos de uso necessários para medir o resultado estiverem definidos;
- a experiência não exigir conhecimento de termos internos;
- documentação de ajuda e microcopy refletirem o comportamento realmente entregue.

## 13. Backlog futuro — não entra nas etapas principais

Os itens abaixo permanecem como oportunidades futuras e devem passar por PRDs próprios:

- captura por e-mail;
- integração com calendários externos;
- extensão de navegador;
- compartilhamento para o My Brain pelo menu do celular;
- WhatsApp ou Telegram;
- importação de outros aplicativos de notas;
- contatos;
- sincronização com gerenciadores de tarefas;
- preparação automática para reuniões;
- transcrição de reuniões;
- wearables;
- espaços compartilhados;
- agentes especializados por projeto;
- API pessoal;
- automações configuráveis.

Nenhum desses itens deve começar antes de busca global, `Hoje`, `Precisa de você`, `Conversar`, fontes e a fundação mobile estarem suficientemente estáveis.

## 14. Decisões registradas

- O item “modo de demonstração” está rejeitado e não pertence ao roadmap desta iniciativa.
- Integrações externas permanecem apenas no backlog.
- Voz segue o fluxo gravação → transcrição → revisão/continuação → confirmação.
- `Conversar` é o foco estratégico central depois da fundação e da captura.
- Fontes e explicabilidade são requisitos do produto, não acabamento opcional.
- Pessoas e projetos precisam de redesign profundo, não apenas ajustes de estilo.
- Calendário e experiência mobile são prioridades explícitas.
- O grafo é ferramenta secundária e não substitui busca, listas ou páginas contextuais.
- O roadmap deve consumir capacidades existentes antes de propor novos domínios.

## 15. Definition of Ready para planejamento

A primeira etapa estará pronta para planejamento detalhado quando o owner aprovar:

1. a direção de assistente pessoal contextual mobile-first;
2. a nova navegação principal;
3. a ordem das etapas;
4. o fluxo de voz e a decisão de retenção do áudio original;
5. as faixas de estimativa como instrumento de priorização, não compromisso de entrega;
6. que integrações externas e modo de demonstração não fazem parte do escopo.

Após essa aprovação, cada etapa deve receber um plano próprio. O PRD não autoriza implementação por si só.

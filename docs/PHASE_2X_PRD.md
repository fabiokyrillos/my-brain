# PRD — Fase 2X: Convergência do Produto

- **Produto:** My Brain
- **Fase:** 2X — Convergência do Produto
- **Posição no roadmap:** entre 2B e 2C
- **Status do documento:** PRD detalhado para revisão do produto; implementação não iniciada
- **Data:** 2026-07-17
- **Fonte principal:** `docs/PHASE_2_ARCHITECTURE_REVIEW.md`
- **Branch de referência:** `codex/phase-2-intelligent-capture`

---

## 1. Resumo executivo

A Fase 2X transforma a fundação entregue pelas Fases 2A e 2B em uma experiência coerente de uso diário.

A 2X não expande o domínio do My Brain. Ela reorganiza, simplifica e projeta corretamente capacidades que já existem: captura, processamento, interpretação, confiança, correção, reprocessamento, tarefas candidatas, tarefas, perguntas básicas, Home, Caixa de entrada, navegação, configurações e observabilidade.

O problema central é que a arquitetura atual está mais madura do que a experiência que a expõe. O produto preserva o original, mantém versões imutáveis, calcula confiança por evidência, oferece undo e protege operações concorrentes, mas transfere detalhes desse mecanismo ao usuário. A captura ainda espera a IA, a revisão parece uma bancada de inspeção, estados internos aparecem nas telas, a informação está fragmentada e algumas promessas visuais excedem o comportamento operacional.

A Fase 2X corrige esse desequilíbrio por meio de uma convergência vertical do ciclo diário:

`capturar → continuar → acompanhar → revisar somente exceções → retomar o trabalho`

A fase pode modificar profundamente a arquitetura interna quando isso for necessário para simplificar a experiência. Essa autorização inclui mover a interpretação para a fila durável existente, criar projeções orientadas ao produto, alterar contratos de Server Actions, reorganizar rotas e substituir acoplamentos entre componentes e linhas persistidas.

A fase não pode criar novas capacidades de domínio pertencentes às Fases 2C–2F.

---

## 2. Posição no roadmap

| Fase | Responsabilidade |
| --- | --- |
| 2A — Confiabilidade | jobs duráveis, lease, retry, recuperação, observabilidade operacional |
| 2B — Interpretações | revisões imutáveis, confiança, correção, reprocessamento, ownership e undo |
| **2X — Convergência do produto** | **transformar as capacidades existentes em um ciclo diário simples e coerente** |
| 2C — Editor de tarefas | ampliar o domínio de edição e materialização de candidatos |
| 2D — Perguntas | fechar o ciclo conversacional de ambiguidades |
| 2E — Linguagem natural | atualizar tarefas existentes por linguagem natural |
| 2F — MVP | onboarding, automações do piloto, hardening e lançamento privado |

### 2.1 Regra de pertencimento

Uma mudança pertence à 2X quando:

- a capacidade já existe conceitualmente;
- o usuário já consegue iniciar ou observar o fluxo;
- o problema está em organização, projeção, consistência, linguagem, navegação ou acoplamento;
- a mudança reduz esforço sem adicionar um novo objeto ou nova habilidade de domínio.

Uma mudança não pertence à 2X quando:

- cria uma ação de domínio que o produto ainda não executa;
- adiciona novos campos e relações para ampliar tarefas;
- cria uma nova conversa de resolução;
- adiciona automação de negócio ainda inexistente;
- existe principalmente para lançamento, onboarding ou operação do piloto.

### 2.2 Teste rápido de escopo

Antes de aceitar qualquer item na fase, responder:

1. O usuário já consegue fazer algo equivalente hoje?
2. A mudança apenas torna isso mais simples, coerente ou seguro?
3. A mudança pode ser explicada sem usar “agora o produto também consegue”?

Se a resposta à terceira pergunta for “não”, o item provavelmente pertence a uma fase posterior.

---

## 3. Problema do produto

### 3.1 Problema principal

O My Brain exige que o usuário compreenda e acompanhe o processamento interno para obter valor de capacidades que deveriam operar silenciosamente.

### 3.2 Sintomas atuais

- Capturar bloqueia enquanto a IA interpreta.
- Uma captura bem-sucedida retira o usuário do contexto e abre uma revisão extensa.
- A UI conhece estados como `recoverable_error`, políticas de confiança e estruturas persistidas.
- A tela principal de revisão exibe sinais, políticas, evidências, classificações, versões e modelo.
- Correções humanas podem coexistir com candidatos extraídos antes da correção.
- “Somente registro” não possui projeção suficientemente forte para eliminar sugestões residuais.
- Home, Hoje, Tarefas, Aguardando e Caixa representam partes relacionadas sem um modelo de navegação coeso.
- “Precisa de você” existe implicitamente em diversos estados, mas não como fila de produto.
- Configurações e personificação sugerem comportamentos ainda não inteiramente operacionais.
- Auditoria técnica existe, mas instrumentação do funil de produto não existe como contrato próprio.
- Componentes e páginas centrais interpretam diretamente linhas do banco, lifecycle, confiança e evidência.

### 3.3 Efeito no usuário

- redução do hábito de captura;
- aumento de carga cognitiva;
- dificuldade para distinguir “salvo”, “organizando”, “precisa de mim” e “pronto”;
- desconfiança quando a interface promete mais autonomia do que entrega;
- sensação de demo ou console técnico;
- esforço de revisão maior do que o esforço de execução;
- risco de confirmar uma ação incompatível com uma correção recente.

### 3.4 Por que resolver agora

A Fase 2C ampliará o fluxo de tarefas. Se for implementada sobre as superfícies atuais, aumentará a complexidade do principal caminho antes que seu modelo mental esteja estabilizado. A 2X deve criar o contrato de experiência sobre o qual 2C, 2D e 2E poderão crescer sem duplicar UI, estados ou limites de domínio.

---

## 4. Visão da Fase 2X

Depois da 2X, o My Brain deve parecer rápido, calmo e previsível:

- o usuário registra algo e recebe confirmação imediata;
- a interpretação acontece sem bloquear a captura;
- a Home mostra apenas o que merece atenção agora;
- a Caixa organiza registros por estado humano;
- a fila “Precisa de você” reúne exceções já existentes;
- a revisão mostra primeiro compreensão e consequência;
- detalhes técnicos continuam disponíveis, mas recolhidos;
- o fluxo de Trabalho reúne as visões já existentes;
- nenhuma tela depende de conhecer lifecycle, score, policy ou esquema persistido;
- nenhuma promessa visual afirma comportamento inexistente;
- o funil pode ser medido sem armazenar conteúdo pessoal em telemetria.

### 4.1 Declaração de valor

> Registre e continue. O Brain organiza em segundo plano e só chama você quando uma decisão realmente é necessária.

### 4.2 North Star da fase

**Percentual de capturas que são salvas sem bloquear o usuário e chegam a um estado de produto correto — Pronto, Precisa de você ou Não consegui organizar — sem inconsistência entre interpretação e ações.**

---

## 5. Objetivos

### O1 — Tornar a captura instantânea do ponto de vista do usuário

A confirmação de salvamento não pode depender da chamada de IA, geração de embedding ou persistência da interpretação.

### O2 — Reduzir a revisão à exceção

O usuário não deve precisar abrir ou compreender uma revisão completa quando a interpretação não exige decisão.

### O3 — Criar uma linguagem única de estado

Home, Caixa, revisão e notificações devem representar o mesmo estado de produto com os mesmos rótulos e ações.

### O4 — Eliminar contradições entre interpretação e ações

Nenhum candidato incompatível, herdado ou inválido pode aparecer como ação atual.

### O5 — Convergir o trabalho existente

Home, Hoje, Tarefas e Aguardando devem formar um modelo conceitual único sem adicionar capacidade avançada de tarefa.

### O6 — Reduzir a exposição da arquitetura interna

A experiência principal deve funcionar sem exibir scores, políticas, evidências, modelos, nomes de jobs ou estados persistidos.

### O7 — Tornar a arquitetura de informação proporcional à frequência de uso

Destinos primários devem representar hábitos; áreas técnicas e contextuais devem ser secundárias.

### O8 — Garantir verdade operacional

Controles, status e textos só podem prometer comportamentos observáveis.

### O9 — Medir o ciclo real

A equipe deve conseguir observar ativação, fluidez, atenção, resolução e retomada sem reutilizar audit logs como analytics e sem capturar conteúdo pessoal.

### O10 — Criar uma fronteira de projeção orientada ao produto

Componentes devem consumir contratos da experiência, não o esquema persistido.

---

## 6. Não objetivos

A Fase 2X não implementará:

- editor avançado de tarefas candidatas;
- edição de título, descrição, prioridade ou relações do candidato além do que já existe;
- dependências;
- subtarefas;
- split ou merge de candidatos;
- planned date separada de due date;
- motivos avançados para ausência de prazo;
- perguntas conversacionais completas;
- deferir, ignorar ou resolver semanticamente perguntas;
- NLP para localizar ou atualizar tarefas;
- onboarding;
- automações específicas do piloto;
- geração automática de revisões se ainda não existir operacionalmente;
- canais novos;
- push notifications;
- captura offline persistida;
- aplicativos nativos;
- integrações externas;
- novo provedor de fila;
- command bus genérico;
- plataforma universal de read models;
- reescrita do backend;
- redesign visual completo de áreas fora do ciclo diário;
- hardening específico de lançamento do MVP.

### 6.1 O que pode ser ocultado, mas não implementado

Quando uma capacidade futura já possui controle visível, a 2X pode:

- ocultar o controle;
- desabilitá-lo com explicação honesta;
- movê-lo para uma área avançada;
- alterar o texto para representar o comportamento real.

A 2X não pode tornar essa capacidade operacional se isso ampliar o domínio reservado a 2C–2F.

---

## 7. Usuário primário e jobs to be done

### 7.1 Usuário primário

Pessoa que usa o My Brain várias vezes ao dia para descarregar pensamentos, decisões, compromissos, conversas e tarefas, esperando recuperar contexto e agir sem organizar manualmente cada registro.

### 7.2 Jobs principais da 2X

#### JTBD-01 — Capturar sem interromper

Quando eu lembrar de algo, quero registrar e voltar imediatamente ao que estava fazendo, para não perder o pensamento nem trocar de contexto.

#### JTBD-02 — Saber se está seguro

Depois de capturar, quero saber que o conteúdo foi salvo, mesmo que o Brain ainda esteja organizando.

#### JTBD-03 — Entender quando preciso agir

Quando o Brain não puder concluir sozinho, quero encontrar uma fila curta e clara do que precisa de mim.

#### JTBD-04 — Corrigir sem auditar o sistema

Quando algo estiver errado, quero corrigir apenas aquela parte sem compreender o esquema interno da IA.

#### JTBD-05 — Retomar o trabalho

Quando eu abrir o produto, quero ver o que fazer, o que aguarda terceiros e o que precisa de revisão sem navegar por várias ontologias.

#### JTBD-06 — Confiar nas promessas

Quando eu configurar ou ler um status, quero que ele represente algo que realmente acontece.

---

## 8. Princípios de produto

### P1 — Salvar antes de interpretar

O original durável é o marco de sucesso da captura. IA é processamento posterior.

### P2 — Consequência antes de mecanismo

A interface deve dizer o que aconteceu e o que o usuário pode fazer antes de explicar como o sistema decidiu.

### P3 — Exceção antes de auditoria

O usuário deve revisar somente campos ou decisões que precisam de atenção.

### P4 — Correção humana é autoridade

Uma nova análise nunca pode substituir silenciosamente um campo corrigido pelo usuário.

### P5 — Uma verdade por ação

Um candidato só pode ser apresentado como atual se pertencer à interpretação atual e estiver válido para ação.

### P6 — Estado de produto é projeção

O lifecycle interno continua preciso, mas não é contrato da UI.

### P7 — Progressive disclosure

Detalhes técnicos são preservados e acessíveis sem serem necessários para concluir a tarefa principal.

### P8 — Frequência define navegação

Hábitos diários são primários; contexto, transparência e administração são secundários.

### P9 — Sem controles cenográficos

Persistir uma preferência não basta para dizer que o comportamento existe.

### P10 — Métrica sem conteúdo

Telemetria mede passos e resultados; nunca armazena o texto pessoal capturado ou gerado.

---

## 9. Jornada alvo

### 9.1 Captura comum

1. Usuário abre Home ou captura global.
2. Digita o conteúdo.
3. Aciona “Registrar”.
4. O original e a solicitação de processamento são persistidos.
5. A UI confirma: “Salvo. Estou organizando.”
6. O formulário limpa ou fecha.
7. O usuário permanece ou retorna ao contexto anterior.
8. O processamento avança em segundo plano.
9. A projeção muda para Pronto, Precisa de você ou Não consegui organizar.

### 9.2 Captura sem necessidade de revisão

1. Entrada é interpretada.
2. Nenhuma decisão humana é necessária.
3. Item fica Pronto.
4. A Home não interrompe o usuário.
5. A Caixa mantém o registro disponível.

### 9.3 Captura que precisa de atenção

1. Entrada é interpretada parcialmente ou possui ação que exige confirmação.
2. Um item aparece em “Precisa de você”.
3. O item explica a necessidade em linguagem humana.
4. Usuário abre a revisão focada.
5. Resolve usando capacidade já existente.
6. A projeção é recalculada.

### 9.4 Falha recuperável

1. Original permanece salvo.
2. A fila tenta novamente conforme o contrato existente.
3. Durante retry, estado humano continua “Organizando”.
4. Ao esgotar a tentativa atual recuperável, item mostra “Não consegui organizar”.
5. A ação oferecida é “Tentar novamente”.
6. Detalhes técnicos permanecem ocultos por padrão.

### 9.5 Correção

1. Usuário identifica um campo incorreto.
2. Corrige a parte relevante.
3. Nova revisão imutável é criada.
4. A correção humana torna-se autoridade naquele campo.
5. Candidatos não comprovadamente compatíveis deixam de ser acionáveis.
6. A fila e a tela refletem o novo estado sem mostrar contradição.

### 9.6 Trabalho diário

1. Home resume Hoje e Precisa de você.
2. Trabalho reúne visões Hoje, Todas e Aguardando.
3. Ações existentes — concluir, aguardar, retomar e reabrir — permanecem disponíveis.
4. Edição avançada continua reservada à 2C.

---

## 10. Modelo de estado orientado ao produto

### 10.1 Estados públicos

| Estado de produto | Significado | Tom | Ação primária possível |
| --- | --- | --- | --- |
| `saved` | original persistido; processamento ainda não confirmado | neutro | Ver registro |
| `organizing` | Brain processando ou tentando novamente | informativo | Ver registro |
| `needs_attention` | existe decisão já suportada que exige usuário | atenção | Revisar |
| `ready` | processamento concluído sem pendência atual | sucesso discreto | Abrir |
| `could_not_organize` | processamento não concluiu e exige retry ou informação | erro recuperável | Tentar novamente ou abrir |

Os identificadores acima são contratos de projeção. Os rótulos são localizados:

- Salvo;
- Organizando;
- Precisa de você;
- Pronto;
- Não consegui organizar.

### 10.2 Mapeamento interno mínimo

O mapeamento não deve existir nos componentes. Ele pertence à camada de projeção.

| Condição interna | Estado de produto padrão |
| --- | --- |
| original persistido, job ainda não iniciado | `saved` |
| `saved` com job elegível, `interpreting`, `reprocessing`, job pending/running/failed com retry futuro | `organizing` |
| `awaiting_review` | `needs_attention` |
| `partially_processed` com decisão suportada pendente | `needs_attention` |
| interpretação atual válida com tarefa candidata não resolvida | `needs_attention` |
| pergunta aberta já suportada pela fila atual | `needs_attention` |
| `completed` sem decisão atual | `ready` |
| `recoverable_error` sem retry automático pendente | `could_not_organize` |
| `terminal_error` | `could_not_organize` |

### 10.3 Precedência

Quando mais de uma condição existir:

1. inconsistência de dados nunca vira `ready`;
2. ação humana válida pendente prevalece sobre `ready`;
3. retry ativo prevalece sobre erro recuperável;
4. falha terminal prevalece sobre candidato herdado;
5. “somente registro” suprime candidatos de ação e pode resultar em `ready`;
6. tarefa já confirmada não mantém candidato equivalente em `needs_attention`;
7. pergunta respondida não permanece na fila pública, ainda que exista no snapshot histórico.

### 10.4 Motivos de atenção

`needs_attention` deve possuir um motivo tipado e uma frase humana. Motivos permitidos na 2X:

- `review_interpretation`;
- `confirm_existing_candidates`;
- `answer_existing_question`;
- `retry_processing`;
- `resolve_consistency`.

Adicionar novo motivo que represente capacidade inexistente exige revisão de escopo.

---

## 11. Arquitetura de informação alvo

### 11.1 Navegação primária

- **Início** — captura, Hoje e Precisa de você;
- **Caixa** — todos os registros e seus estados humanos;
- **Trabalho** — visões existentes de tarefas;
- **Brain** — chat fundamentado já existente;
- **Capturar** — ação global;
- **Mais** — destinos secundários.

### 11.2 Conteúdo de “Mais”

#### Contexto

- Projetos;
- Pessoas;
- Memórias;
- Arquivos.

#### Reflexão

- Revisões;
- Perguntas pendentes, enquanto ainda existir como rota separada.

#### Organização

- Lembretes.

#### Transparência

- Histórico;
- Uso/Custos de IA.

#### Preferências

- Configurações.

### 11.3 Notificações

Notificações permanecem acessíveis pelo ícone global. Não precisam ocupar posição equivalente a um hábito primário.

### 11.4 Jobs

Jobs não são conceito de navegação do usuário. Se a rota continuar existindo para suporte, deve ser avançada, não descoberta pelo fluxo normal e não referenciada por textos de produto.

### 11.5 Compatibilidade de URLs

Rotas existentes podem permanecer como aliases, redirects ou visões da nova superfície. Links salvos e testes não devem quebrar sem migração explícita.

---

## 12. Épicos

## Épico 1 — Captura assíncrona e retorno imediato

### 12.1 Problema

A submissão atual aguarda extração, persistência da interpretação e tentativa de embedding antes de liberar o usuário.

### 12.2 Resultado esperado

O usuário recebe confirmação assim que o original e a intenção de processamento são duráveis. IA ocorre em segundo plano na fila já existente.

### 12.3 Requisitos funcionais

- **ASY-001:** O sucesso da captura deve depender da persistência durável do original, não da conclusão da IA.
- **ASY-002:** A criação da entrada e o agendamento do processamento devem ser atômicos ou possuir recuperação determinística quando uma das etapas falhar.
- **ASY-003:** Cada solicitação deve possuir chave idempotente para impedir entrada ou job duplicado por duplo clique, retry de rede ou reenvio da Action.
- **ASY-004:** A infraestrutura de jobs da Fase 2A deve ser reutilizada; nenhum provedor externo de fila será adicionado.
- **ASY-005:** O processamento deve reutilizar uma única implementação de extração, prompt, strategy version, ledger e persistência.
- **ASY-006:** O worker deve obedecer lease, worker identity, retry, exhaustion e stale-worker protection existentes.
- **ASY-007:** A resposta de captura deve retornar `entryId`, resultado de salvamento e próximo estado de produto, sem esperar o provider.
- **ASY-008:** Na Home, a captura deve manter o usuário na Home.
- **ASY-009:** Na captura global, a experiência deve retornar ao contexto seguro anterior quando conhecido; caso contrário, deve ir para Início.
- **ASY-010:** O feedback deve dizer “Salvo. Estou organizando.” e oferecer link opcional “Ver”.
- **ASY-011:** O formulário deve limpar somente depois de confirmação de persistência.
- **ASY-012:** Se o original não puder ser salvo, o texto deve permanecer no formulário e a mensagem deve dizer que nada foi salvo.
- **ASY-013:** Se o original for salvo, mas o job não puder ser criado, a entrada deve permanecer visível em estado recuperável; o usuário não deve ser induzido a reenviar.
- **ASY-014:** Embedding pode falhar sem reclassificar uma interpretação concluída como captura perdida.
- **ASY-015:** Offline persistente continua fora de escopo; a cópia deve declarar honestamente que o texto ainda não foi salvo.

### 12.4 Requisitos de experiência

- O estado pendente do botão cobre apenas a operação de salvamento.
- A UI não exibe “Interpretando…” como bloqueio de submissão.
- O usuário pode navegar assim que receber o recibo.
- Processamento em segundo plano não abre automaticamente a revisão.
- Erro de IA nunca usa a mensagem “não foi possível salvar” quando o original está durável.

### 12.5 Critérios de aceitação

- **ASY-A01:** Com provider artificialmente bloqueado por 120 segundos, a UI confirma a captura antes da conclusão do provider.
- **ASY-A02:** Atualizar a página após o recibo mantém a entrada na Caixa.
- **ASY-A03:** Dois envios com a mesma operation key produzem uma entrada e um processamento lógico.
- **ASY-A04:** Worker que perde lease não consegue persistir resultado tardio.
- **ASY-A05:** Falha de enqueue não perde o original nem gera mensagem ambígua.
- **ASY-A06:** Desktop, mobile, PT-BR e inglês apresentam o mesmo contrato.

### 12.6 Métricas

- latência entre submit e recibo;
- taxa de salvamento;
- taxa de jobs criados por captura;
- taxa de duplicidade evitada;
- taxa de processamento concluído;
- tempo entre salvamento e estado terminal de produto.

---

### 12.7 Problema

Mesmo quando a captura funciona, o redirecionamento obrigatório transforma cada registro em uma sessão de revisão.

### 12.8 Resultado esperado

Capturar é uma ação breve. Revisar é uma ação separada, iniciada somente por intenção do usuário ou por item em Precisa de você.

### 12.9 Requisitos funcionais

- **RET-001:** Nenhuma captura comum deve redirecionar automaticamente para o detalhe após o recibo.
- **RET-002:** O local de origem deve ser preservado no cliente sem aceitar destinos externos ou abertos.
- **RET-003:** A captura dedicada deve apresentar opção explícita “Ver registro” após salvar.
- **RET-004:** A Home deve inserir o registro recém-salvo na projeção local ou revalidada sem exigir refresh manual.
- **RET-005:** Capturas sequenciais devem ser possíveis sem sair da superfície de captura.
- **RET-006:** O feedback de sucesso deve desaparecer sem remover o acesso ao registro recente.
- **RET-007:** Se o processamento terminar enquanto a tela está aberta, a UI pode atualizar discretamente; não deve roubar foco.

### 12.10 Requisitos de experiência

- Nenhum modal de revisão automática.
- Nenhuma navegação inesperada após salvar.
- Nenhum toast persistente bloqueando controles.
- Atualizações em segundo plano usam `aria-live` apropriado sem repetição invasiva.

### 12.11 Critérios de aceitação

- **RET-A01:** Captura na Home termina na Home.
- **RET-A02:** Captura pelo FAB retorna ao local anterior seguro.
- **RET-A03:** Três capturas consecutivas podem ser concluídas sem abrir o detalhe.
- **RET-A04:** Conclusão do job não desloca scroll, foco ou rota.

---

## Épico 2 — Fila “Precisa de você”

### 12.12 Problema

Decisões já existentes estão dispersas entre lifecycle, candidatos, perguntas e erros.

### 12.13 Resultado esperado

Uma fila derivada reúne somente itens em que o usuário pode executar uma ação já suportada.

### 12.14 Requisitos funcionais

- **NY-001:** A fila deve ser uma projeção, não uma nova fonte de verdade do domínio.
- **NY-002:** Cada item deve possuir `kind`, título humano, explicação, data, origem e ação primária.
- **NY-003:** A fila deve incluir revisão da interpretação quando a política consolidada exige ação.
- **NY-004:** A fila deve incluir candidatos válidos ainda não confirmados ou resolvidos.
- **NY-005:** A fila deve incluir perguntas abertas suportadas pela ação atual.
- **NY-006:** A fila deve incluir falhas que realmente exigem retry manual.
- **NY-007:** A fila não deve incluir jobs em retry automático.
- **NY-008:** A fila não deve incluir perguntas já respondidas apenas porque constam em snapshot histórico.
- **NY-009:** A fila não deve incluir candidatos herdados, stale, record-only, já confirmados ou incompatíveis.
- **NY-010:** Um mesmo entry deve ser agrupado quando possuir múltiplos motivos relacionados.
- **NY-011:** A Home deve mostrar contagem e primeiros itens.
- **NY-012:** A Caixa deve possuir view/filtro “Precisa de você”.
- **NY-013:** Resolver uma ação deve remover ou recalcular o item sem refresh manual obrigatório.
- **NY-014:** Paginação e ordenação devem ser determinísticas.
- **NY-015:** A ordenação padrão deve considerar ação necessária e recência sem inventar prioridade de domínio.

### 12.15 Tipos permitidos na 2X

- revisar compreensão existente;
- confirmar candidatos existentes;
- responder pergunta existente;
- tentar processamento novamente;
- resolver inconsistência detectada entre versão e ação.

### 12.16 Critérios de aceitação

- **NY-A01:** Entrada pronta sem pendência não aparece.
- **NY-A02:** Entrada com candidato válido aparece uma vez.
- **NY-A03:** Confirmar candidato remove a pendência correspondente.
- **NY-A04:** Responder pergunta remove a pergunta aberta da fila, sem fingir que houve reinterpretação.
- **NY-A05:** Retry automático não gera pedido prematuro ao usuário.
- **NY-A06:** Nenhum item aponta para controle inexistente.

### 12.17 Métricas

- tamanho da fila por usuário;
- tempo até primeira abertura;
- taxa de resolução por `kind`;
- itens órfãos sem ação válida;
- reentrada de um item após suposta resolução.

---

## Épico 3 — Projeção humana do lifecycle

### 12.18 Problema

Páginas e componentes interpretam diretamente estados persistidos e precisam conhecer exceções técnicas.

### 12.19 Resultado esperado

Todos os pontos da experiência usam o modelo público definido na seção 10.

### 12.20 Requisitos funcionais

- **STA-001:** O mapeamento interno → produto deve existir em um único limite de domínio/projeção.
- **STA-002:** Nenhum componente central deve comparar strings do lifecycle persistido.
- **STA-003:** Home, Caixa, detalhe e fila devem mostrar o mesmo rótulo para o mesmo estado.
- **STA-004:** Cada estado deve possuir rótulo, descrição curta, tom visual e ações permitidas.
- **STA-005:** Estados desconhecidos devem cair em fallback seguro que nunca afirme “Pronto”.
- **STA-006:** Estado visual não pode depender somente do score global do modelo.
- **STA-007:** O estado deve considerar job, interpretação atual, decisões pendentes e validade das ações.
- **STA-008:** Erros seguros podem ser apresentados; mensagens internas, stack, SQL ou provider não.
- **STA-009:** O detalhe técnico pode revelar lifecycle bruto apenas por ação explícita.
- **STA-010:** Traduções devem ser semanticamente equivalentes, não transliterações de enums.

### 12.21 Critérios de aceitação

- **STA-A01:** Busca no código dos componentes centrais não encontra comparações com enums internos.
- **STA-A02:** Matriz de estados possui teste para todas as combinações suportadas.
- **STA-A03:** Estado desconhecido aparece como “Precisa de você” ou “Não consegui organizar”, nunca como sucesso.
- **STA-A04:** PT-BR e inglês não exibem underscore, nome de enum ou status bruto.

---

## Épico 4 — Revisão simplificada com progressive disclosure

### 12.22 Problema

A revisão principal apresenta quase todo o esquema de interpretação e confiança.

### 12.23 Resultado esperado

A tela responde, nesta ordem:

1. O que o Brain entendeu?
2. O que precisa ser conferido?
3. Que ações já existentes estão sugeridas?
4. Onde está o original?
5. Como o Brain chegou nisso, se o usuário quiser saber?

### 12.24 Estrutura obrigatória

#### Bloco A — O que entendi

- resumo atual;
- conceitos relevantes em linguagem humana;
- data e vínculos somente quando úteis;
- correção existente, sem exigir classificação técnica.

#### Bloco B — Precisa de você

- somente campos ou decisões que exigem ação;
- motivo em linguagem natural;
- ação já suportada.

#### Bloco C — Próximas ações

- candidatos válidos da versão atual;
- confirmação seletiva existente;
- nenhum editor avançado.

#### Bloco D — Registro original

- sempre disponível;
- recolhido quando a leitura atual está pronta;
- nunca alterado.

#### Bloco E — Detalhes técnicos

- versão;
- origem;
- modelo;
- confiança por elemento;
- políticas;
- sinais;
- evidências;
- overrides;
- histórico e comparação.

Esse bloco deve iniciar recolhido e ser carregado separadamente quando possível.

### 12.25 Requisitos funcionais

- **REV-001:** A ação primária não pode depender da abertura dos detalhes técnicos.
- **REV-002:** Scores percentuais não aparecem no primeiro nível.
- **REV-003:** Labels `auto_apply`, `apply_and_flag`, `request_review` e `block_until_confirmation` não aparecem no primeiro nível.
- **REV-004:** Nomes de campos internos não aparecem sem tradução humana.
- **REV-005:** Correções pontuais devem focar a área relevante quando o editor existente permitir.
- **REV-006:** O editor estrutural completo pode permanecer em uma ação secundária até ser substituído por fases futuras.
- **REV-007:** Histórico deve narrar “Você corrigiu a data” ou equivalente quando houver informação suficiente.
- **REV-008:** O original deve ser acessível em no máximo uma ação.
- **REV-009:** “Reprocessar” deve usar linguagem distinta para falha e conteúdo já interpretado.
- **REV-010:** Reprocessar conteúdo corrigido não pode substituir silenciosamente campos corrigidos pelo usuário.
- **REV-011:** Se a 2X não puder garantir merge seguro, a ação de reanálise de conteúdo corrigido deve exigir comparação/confirmar ou ser ocultada.
- **REV-012:** O modelo e a versão nunca podem ser necessários para o usuário escolher a ação correta.

### 12.26 Critérios de aceitação

- **REV-A01:** Usuário conclui a ação principal sem abrir detalhes técnicos.
- **REV-A02:** Screenshot inicial não contém política, sinais, overrides ou nome de modelo.
- **REV-A03:** Detalhes continuam disponíveis e refletem o snapshot real.
- **REV-A04:** Correção humana continua imutável, auditada e reversível.
- **REV-A05:** Reanálise nunca promove silenciosamente divergência sobre campo corrigido.

---

## Épico 5 — Coerência entre interpretação, candidatos e ações

### 12.27 Problema

Uma nova revisão pode herdar candidatos da anterior, e a UI pode apresentá-los como atuais mesmo quando a correção altera sua premissa.

### 12.28 Resultado esperado

Toda ação apresentada possui proveniência e validade coerentes com a interpretação atual.

### 12.29 Invariantes

- **COH-001:** Candidato acionável deve estar associado à interpretação que a UI declara como atual.
- **COH-002:** Correção que possa alterar significado, data, entidade, intenção ou classificação invalida candidatos não confirmados herdados.
- **COH-003:** Candidatos inválidos permanecem como evidência histórica, não como ação primária.
- **COH-004:** `record-only` resulta em zero candidatos acionáveis na experiência principal.
- **COH-005:** Tarefa já confirmada é objeto de trabalho; não é removida por correção posterior da interpretação.
- **COH-006:** A UI deve distinguir “tarefa criada” de “sugestão ainda pendente”.
- **COH-007:** Undo da criação recalcula a projeção sem ressuscitar candidato inválido.
- **COH-008:** Pergunta respondida sai da fila pública, mas permanece na evidência histórica.
- **COH-009:** Reprocessamento deve gerar proveniência própria e reavaliar validade de candidatos.
- **COH-010:** Nenhum componente decide validade comparando manualmente IDs, versões ou arrays de task candidates.
- **COH-011:** Se não for possível provar consistência, a ação deve ser ocultada ou bloqueada e o item deve ir para `needs_attention`.

### 12.30 Semântica de reprocessamento

- Falha sem interpretação válida: “Tentar novamente”; resultado válido pode se tornar atual.
- Interpretação pronta sem correção humana: “Reanalisar”; comportamento pode promover nova versão conforme regra atual, com indicação clara.
- Interpretação com correção humana: nova análise não substitui silenciosamente campos corrigidos.
- Divergência material: manter a versão humana atual e apresentar necessidade de revisão usando capacidades já existentes.

### 12.31 Critérios de aceitação

- **COH-A01:** Corrigir data remove candidato com prazo derivado da data anterior da área acionável.
- **COH-A02:** Marcar somente registro remove todas as próximas ações implícitas.
- **COH-A03:** Candidato de versão anterior não pode ser confirmado pela versão atual.
- **COH-A04:** Task criada permanece visível no Trabalho após correção da origem.
- **COH-A05:** Toda ação exibida possui `sourceInterpretationId` e estado de validade na projeção.
- **COH-A06:** Concorrência entre correção e confirmação falha de forma segura e explicável.

---

## Épico 6 — Convergência de Home, Trabalho e Caixa

### 12.32 Problema

As superfícies atuais distribuem o mesmo ciclo entre muitas páginas e usam nomes que não deixam clara a relação entre registro, decisão e execução.

### 12.33 Resultado esperado

- Home responde “o que merece atenção agora?”;
- Caixa responde “o que registrei e como está?”;
- Trabalho responde “o que preciso executar?”.

### 12.34 Home

- **FLOW-001:** Captura é a ação dominante.
- **FLOW-002:** Home mostra módulo Precisa de você com link e contagem.
- **FLOW-003:** Prioridades de hoje devem ser derivadas de tarefas realmente de hoje/atrasadas; não podem chamar os cinco primeiros itens genéricos de prioridade.
- **FLOW-004:** Aguardando deve ser clicável e levar à visão correspondente.
- **FLOW-005:** Perguntas abertas devem levar à resolução existente.
- **FLOW-006:** Cartão de horário de revisão não pode sugerir automação inexistente.
- **FLOW-007:** Estados vazios devem indicar uma ação concreta sem tutorial longo.
- **FLOW-008:** Mobile deve reduzir espaço vazio e manter ações acima da dobra quando possível.

### 12.35 Caixa

- **FLOW-009:** Caixa lista registros com estado de produto, preview, data e motivo de atenção quando aplicável.
- **FLOW-010:** Deve oferecer filtros: Todos, Precisa de você, Organizando, Prontos e Com problema.
- **FLOW-011:** Filtros usam projeção, não enums persistidos.
- **FLOW-012:** Registro original nunca é substituído pelo resumo.
- **FLOW-013:** Falha mostra que o original está salvo.
- **FLOW-014:** Paginação preserva filtro e locale.

### 12.36 Trabalho

- **FLOW-015:** Hoje, Tarefas e Aguardando tornam-se visões de uma mesma superfície conceitual.
- **FLOW-016:** URLs existentes podem continuar funcionando.
- **FLOW-017:** Ações existentes — concluir, aguardar, retomar, reabrir — permanecem.
- **FLOW-018:** A 2X não adiciona edição avançada.
- **FLOW-019:** Cada visão explica seu critério em linguagem curta.
- **FLOW-020:** Estados de tarefa são localizados e nunca exibem enum bruto.
- **FLOW-021:** Aguardando deve deixar claro que contexto de pessoa/follow-up completo virá em fase posterior, sem controle falso.

### 12.37 Critérios de aceitação

- **FLOW-A01:** Usuário alcança captura, Caixa, Precisa de você e Trabalho em no máximo uma ação a partir da Home.
- **FLOW-A02:** Mesmo item possui estado e rótulo consistentes em Home e Caixa.
- **FLOW-A03:** Hoje, Todas e Aguardando preservam ações existentes.
- **FLOW-A04:** Nenhum cartão informativo principal parece clicável sem ser, nem deixa de ser clicável quando representa destino.
- **FLOW-A05:** Desktop e mobile possuem a mesma arquitetura conceitual.

---

## Épico 7 — Reorganização da arquitetura de informação

### 12.38 Problema

A navegação atual apresenta hábitos, contexto, transparência e configuração no mesmo nível.

### 12.39 Resultado esperado

O usuário reconhece os quatro destinos principais sem precisar conhecer a ontologia completa.

### 12.40 Requisitos funcionais

- **IA-001:** Desktop e mobile usam os mesmos grupos conceituais.
- **IA-002:** Início, Caixa, Trabalho e Brain são primários.
- **IA-003:** Captura permanece global e visualmente distinta.
- **IA-004:** Projetos, Pessoas, Memórias e Arquivos ficam em Contexto.
- **IA-005:** Revisões e Perguntas ficam em Reflexão ou na fila quando aplicável.
- **IA-006:** Histórico e Custos ficam em Transparência/Avançado.
- **IA-007:** Configurações ficam em Preferências/perfil.
- **IA-008:** Notificações permanecem no ícone global.
- **IA-009:** Jobs não aparece na navegação comum.
- **IA-010:** O menu Mais deve ser acessível por teclado, leitor de tela e touch.
- **IA-011:** Estado ativo deve funcionar em aliases e subrotas.
- **IA-012:** Nenhum destino existente se torna inacessível sem decisão explícita de remoção.
- **IA-013:** Links históricos devem usar redirect seguro quando a rota canônica mudar.

### 12.41 Critérios de aceitação

- **IA-A01:** Teste de navegação encontra todos os destinos em desktop e mobile.
- **IA-A02:** Jobs, custos e histórico não competem visualmente com captura e trabalho.
- **IA-A03:** Ordem de tab e touch targets atendem acessibilidade existente.
- **IA-A04:** Nenhum link produz perda de locale.

---

## Épico 8 — Verdade operacional e remoção de promessas não implementadas

### 12.42 Problema

Textos e configurações sugerem autonomia, revisões programadas, privacidade e comportamento contínuo além do que é observável.

### 12.43 Resultado esperado

Tudo que parece configurável ou ativo possui consequência real e verificável.

### 12.44 Classificação de capacidade

Cada controle e mensagem deve ser classificado como:

- operacional;
- informativo;
- avançado;
- futuro/oculto.

### 12.45 Requisitos funcionais

- **TRU-001:** “Brain atento” e “Brain ativo” não podem ser status estáticos que implicam processamento contínuo.
- **TRU-002:** Status global, se existir, deve representar condição observável como “Tudo salvo” ou quantidade organizando.
- **TRU-003:** Horários de revisão não podem dizer que o Brain executará revisão automática se a automação não existe.
- **TRU-004:** Campos de revisão semanal e planejamento devem ser ocultados ou descritos somente como preferência futura, sem aparência ativa.
- **TRU-005:** Autonomia, intensidade de follow-up e privacidade padrão devem ser mostradas somente na medida em que possuem consumidores reais.
- **TRU-006:** Roteamento por modelo deve ficar em seção avançada.
- **TRU-007:** Perfil recomendado deve ser padrão para usuário comum.
- **TRU-008:** Custos devem continuar transparentes, mas não ocupar navegação primária.
- **TRU-009:** Mensagens de falha devem distinguir salvar, organizar, reprocessar e executar ação.
- **TRU-010:** Nenhuma copy usa “automaticamente”, “programado”, “autônomo” ou equivalente sem teste de comportamento correspondente.
- **TRU-011:** Controles futuros não podem ser habilitados apenas porque o campo existe no banco.
- **TRU-012:** A fase deve produzir inventário de promessa → consumidor → evidência.

### 12.46 Critérios de aceitação

- **TRU-A01:** Todo controle visível possui teste ou evidência do comportamento que promete.
- **TRU-A02:** Preferências sem consumer não parecem ativas.
- **TRU-A03:** Home não apresenta próxima revisão como evento garantido quando é somente preferência.
- **TRU-A04:** Nenhuma mensagem diz que uma ação ocorreu quando apenas foi agendada.
- **TRU-A05:** Auditoria de copy em PT-BR e inglês não encontra enums ou promessas falsas.

---

## Épico 9 — Instrumentação do funil de produto

### 12.47 Objetivo

Medir se a convergência reduz interrupção, concentra atenção e fecha o ciclo atual.

### 12.48 Separação obrigatória

- `audit_logs` responde quem alterou o domínio e por quê;
- ledger de IA responde consumo e custo;
- jobs respondem processamento;
- eventos de produto respondem como a experiência é usada.

Um não deve substituir o outro.

### 12.49 Eventos mínimos

- **MET-001:** `capture_started`;
- **MET-002:** `capture_save_succeeded`;
- **MET-003:** `capture_save_failed`;
- **MET-004:** `capture_processing_enqueued`;
- **MET-005:** `capture_processing_completed`;
- **MET-006:** `capture_processing_failed`;
- **MET-007:** `needs_attention_viewed`;
- **MET-008:** `needs_attention_item_opened`;
- **MET-009:** `interpretation_review_viewed`;
- **MET-010:** `interpretation_corrected`;
- **MET-011:** `technical_details_opened`;
- **MET-012:** `task_candidates_presented`;
- **MET-013:** `task_candidates_confirmed`;
- **MET-014:** `question_answered_basic`;
- **MET-015:** `processing_retry_requested`;
- **MET-016:** `work_view_viewed`;
- **MET-017:** `task_status_changed`.

### 12.50 Payload permitido

- timestamp;
- versão do app/experiência;
- locale;
- viewport class;
- surface;
- event name;
- duração em milissegundos;
- contagens;
- reason/kind em enum allowlisted;
- resultado booleano;
- identificador técnico pseudonimizado ou owner-scoped quando necessário para funil.

### 12.51 Payload proibido

- original capturado;
- resumo;
- título ou descrição de tarefa;
- pergunta ou resposta;
- nome de pessoa/projeto;
- evidência da IA;
- conteúdo de arquivo;
- prompt ou resposta do modelo;
- stack trace;
- erro bruto do provider/banco.

### 12.52 Métricas derivadas

- tempo de recibo de captura;
- abandono antes do recibo;
- sucesso de processamento;
- tempo salvo → pronto/atenção/erro;
- proporção de capturas que precisam de atenção;
- tempo até abrir atenção;
- taxa de resolução por tipo;
- taxa de confirmação de candidatos existentes;
- taxa de abertura de detalhes técnicos;
- retorno à Home/Trabalho após resolução;
- recorrência de captura por dia/semana.

### 12.53 Requisitos

- **MET-018:** Instrumentação não pode bloquear fluxo de produto.
- **MET-019:** Falha de analytics não altera resultado da ação.
- **MET-020:** Eventos server-side críticos devem ser idempotentes quando derivados de operação idempotente.
- **MET-021:** O mesmo evento lógico não pode ser contado novamente por refresh.
- **MET-022:** Acesso aos dados segue least privilege.
- **MET-023:** Retenção e finalidade devem ser documentadas antes do piloto 2F.
- **MET-024:** Desenvolvimento e teste devem poder excluir ou identificar tráfego sintético.

### 12.54 Critérios de aceitação

- **MET-A01:** Funil de uma captura pode ser reconstruído sem ler conteúdo pessoal.
- **MET-A02:** Duplo envio idempotente não duplica `capture_save_succeeded` lógico.
- **MET-A03:** Falha de telemetria não quebra capture/review/task.
- **MET-A04:** Varredura do payload não encontra campos proibidos.
- **MET-A05:** Eventos sintéticos de E2E não contaminam métrica de usuário real.

---

## Épico 10 — Arquitetura de projeção e simplificação do domínio da UI

### 12.55 Problema

Páginas e componentes centrais selecionam tabelas, recebem tipos gerados do banco, interpretam lifecycle, parseiam confiança e decidem a experiência a partir do modelo persistido. Reorganizar apenas o JSX preservaria o mesmo acoplamento.

### 12.56 Resultado esperado

A UI trabalha com projeções específicas da experiência. Persistência e confiança continuam ricas, mas deixam de ser dependências diretas dos componentes.

### 12.57 Não objetivo arquitetural

Este épico não cria:

- framework genérico de CQRS;
- event sourcing;
- command bus universal;
- schema de read model para todo o produto;
- camada abstrata que envolva toda consulta Supabase;
- duplicação persistida de cada tabela.

O objetivo é criar somente as projeções necessárias às superfícies da 2X.

### 12.58 Contratos de produto mínimos

#### `CaptureReceipt`

Deve representar:

- identificador do registro;
- confirmação de persistência;
- estado de produto inicial;
- mensagem semântica;
- destino seguro opcional;
- chave de idempotência/resultado repetido sem expor detalhes internos.

#### `InboxItemView`

Deve representar:

- `entryId`;
- título/resumo humano;
- preview do original;
- estado de produto;
- motivo de atenção opcional;
- data significativa;
- ações disponíveis;
- indicador de original preservado.

#### `NeedsAttentionItemView`

Deve representar:

- tipo permitido;
- entry relacionado;
- título;
- explicação;
- ação primária;
- ação secundária opcional;
- recência;
- agrupamento.

#### `InterpretationReviewView`

Deve representar:

- compreensão atual;
- campos humanos;
- itens que exigem atenção;
- candidatos acionáveis válidos;
- tarefas já materializadas;
- disponibilidade de correção, undo e retry;
- original;
- indicação de detalhes técnicos disponíveis.

#### `InterpretationTechnicalDetailsView`

Contrato separado e, preferencialmente, carregado sob demanda:

- versões;
- origem;
- modelo;
- scores;
- políticas;
- sinais;
- evidências;
- overrides;
- comparação e proveniência.

#### `WorkItemView`

Deve representar capacidades já existentes:

- tarefa;
- descrição;
- prazo;
- estado humano;
- origem humana/Brain;
- ações existentes permitidas.

### 12.59 Requisitos arquiteturais

- **PROJ-001:** Componentes centrais não podem receber tipos `Database["public"]["Tables"]`.
- **PROJ-002:** Páginas centrais não podem calcular lifecycle humano.
- **PROJ-003:** Páginas centrais não podem parsear `element_confidence`, `element_policy` ou `resolution_evidence`.
- **PROJ-004:** Decisão de mostrar ação deve vir em `availableActions` ou contrato equivalente.
- **PROJ-005:** A UI não pode depender de score numérico para funcionar.
- **PROJ-006:** Detalhes técnicos usam contrato separado do resumo de produto.
- **PROJ-007:** Queries das superfícies centrais devem viver em módulos de feature orientados à experiência.
- **PROJ-008:** Os módulos podem usar tipos gerados e tabelas internamente.
- **PROJ-009:** Server Actions devem retornar resultados discriminados e estáveis, não erros do banco.
- **PROJ-010:** Códigos de resultado devem ser independentes da copy localizada.
- **PROJ-011:** Mensagens PT-BR/inglês devem ser resolvidas na fronteira de apresentação ou copy tipada.
- **PROJ-012:** Projeções devem validar JSON e fallbacks antes de entregar dados à UI.
- **PROJ-013:** Projeção inválida deve falhar fechada: não mostrar ação perigosa nem declarar Pronto.
- **PROJ-014:** `sourceInterpretationId`, versionamento e validade podem existir no DTO para consistência, mas não precisam ser exibidos.
- **PROJ-015:** O detalhe técnico não pode ser necessário para computar o fluxo principal no cliente.
- **PROJ-016:** Não duplicar regra de estado entre Home, Inbox e detalhe.
- **PROJ-017:** Não duplicar regra de validade de candidato entre página e Action.
- **PROJ-018:** Contratos devem ser serializáveis e adequados a Server Components/Actions.
- **PROJ-019:** Toda projeção deve manter ownership por meio das queries/RPCs existentes.
- **PROJ-020:** Nenhuma projeção pode enfraquecer RLS, audit, idempotência, concorrência ou undo.

### 12.60 Contrato de resultado de ação

Actions da 2X devem convergir para formato semanticamente estável, por exemplo:

- `ok`;
- `code`;
- `messageKey` ou mensagem localizada na borda;
- `entityId` quando aplicável;
- `productState` atualizado quando aplicável;
- `undoId` quando aplicável;
- `retryable`;
- `fieldErrors` validados.

O PRD não exige uma interface universal para todas as Actions do produto. Exige consistência nas Actions tocadas pela 2X.

### 12.61 Critérios de aceitação

- **PROJ-A01:** Home, Caixa, revisão e Trabalho renderizam a partir de DTOs de produto.
- **PROJ-A02:** Componentes dessas superfícies não importam tipos de banco.
- **PROJ-A03:** Nenhum componente central conhece nomes internos de policy ou lifecycle.
- **PROJ-A04:** Abrir detalhes técnicos faz uma projeção separada ou usa payload explicitamente separado.
- **PROJ-A05:** Testes de contrato cobrem estado, atenção, ações permitidas e fallbacks.
- **PROJ-A06:** Alterar um nome interno de status não exige alterar componentes, apenas mapeamento/projeção.
- **PROJ-A07:** Regra de validade de candidato é testada no limite de domínio e reaproveitada pela Action.
- **PROJ-A08:** Não surge framework genérico sem consumidor concreto.

---

## 13. Requisitos transversais

### 13.1 Preservação de garantias existentes

- **XG-001:** Original nunca é perdido nem alterado.
- **XG-002:** Migrations continuam append-only.
- **XG-003:** RLS e ownership continuam obrigatórios.
- **XG-004:** Revisões continuam imutáveis.
- **XG-005:** Correção continua idempotente e concorrente por versão esperada.
- **XG-006:** Undo continua compensatório.
- **XG-007:** Uso pago de IA continua registrado.
- **XG-008:** Jobs continuam com lease e stale-worker protection.
- **XG-009:** Erros internos continuam sanitizados.
- **XG-010:** Nenhuma mudança cria segunda implementação de extração.

### 13.2 Acessibilidade

- **XG-011:** Fluxos completos operam por teclado.
- **XG-012:** Focus visible permanece claro.
- **XG-013:** Atualizações assíncronas usam live regions sem spam.
- **XG-014:** Progressive disclosure usa semântica acessível.
- **XG-015:** Touch targets mínimos permanecem atendidos.
- **XG-016:** Estado não depende somente de cor.
- **XG-017:** Menu Mais é navegável e fecha de forma previsível.

### 13.3 Localização

- **XG-018:** Todo fluxo existe em PT-BR e inglês.
- **XG-019:** Datas usam locale e timezone do usuário.
- **XG-020:** Nenhum enum interno aparece como fallback normal.
- **XG-021:** Mensagens de erro distinguem salvar, organizar e agir.

### 13.4 Performance

- **XG-022:** Provider de IA não participa da latência de recibo.
- **XG-023:** Projeções de Home e Caixa usam consultas limitadas e paginadas.
- **XG-024:** Detalhes técnicos pesados não precisam fazer parte do payload inicial.
- **XG-025:** A fila Precisa de você não faz varredura ilimitada por usuário.
- **XG-026:** O alvo de referência é recibo client-side p95 de até 3 segundos em ambiente online suportado e server-side p95 de até 1,5 segundo, excluindo indisponibilidade externa.

### 13.5 Resiliência

- **XG-027:** Refresh em qualquer etapa reconstrói o estado a partir do servidor.
- **XG-028:** UI otimista nunca declara persistência antes do recibo.
- **XG-029:** Retry não duplica entrada, job, interpretação ou evento lógico.
- **XG-030:** Falha parcial produz estado humano seguro.

### 13.6 Segurança e privacidade

- **XG-031:** Todas as projeções são owner-scoped.
- **XG-032:** Rotas técnicas não expõem dados cross-user.
- **XG-033:** Telemetria segue allowlist de payload.
- **XG-034:** Detalhes técnicos não expõem segredo, prompt protegido ou erro bruto.
- **XG-035:** Return URLs aceitam apenas destinos internos permitidos.

---

## 14. Conteúdo e linguagem

### 14.1 Vocabulário preferido

| Interno | Produto PT-BR | Produto EN |
| --- | --- | --- |
| saved/pending | Salvo | Saved |
| interpreting/reprocessing | Organizando | Organizing |
| awaiting_review | Precisa de você | Needs you |
| completed | Pronto | Ready |
| recoverable/terminal error | Não consegui organizar | Could not organize |
| task candidate | Ação sugerida ou tarefa sugerida | Suggested action/task |
| raw entry | Registro original | Original entry |
| reprocess after failure | Tentar novamente | Try again |
| reprocess completed content | Reanalisar | Reanalyze |

### 14.2 Vocabulário restrito ao detalhe técnico

- lifecycle;
- confidence policy;
- score;
- signals;
- evidence;
- overrides;
- worker;
- lease;
- job;
- strategy version;
- prompt version;
- model ID;
- origin enum.

### 14.3 Regras de copy

- explicar resultado antes do processo;
- usar verbos concretos;
- não personificar ação inexistente;
- não dizer “falhou” quando o original está salvo;
- não usar “automático” sem consumer;
- não pedir que o usuário entenda confiança numérica;
- manter textos operacionais curtos.

---

## 15. Requisitos de dados e arquitetura

### 15.1 Mudanças permitidas

- novo tipo de job para interpretação;
- RPC atômica de captura + enqueue ou mecanismo equivalente;
- campos de idempotência/proveniência/validade necessários à coerência;
- projeções server-side;
- view/RPC/query composta quando necessária para eficiência e ownership;
- store separado de eventos de produto;
- índices para consultas da fila e projeções;
- contratos de Action orientados ao produto.

### 15.2 Restrições

- migrations append-only;
- nenhuma atualização destrutiva de snapshots;
- nenhuma duplicação de prompt/provider;
- nenhum bypass de RLS;
- nenhuma regra crítica apenas no cliente;
- nenhum `is_current` mutável em snapshots se o ponteiro atual já resolve;
- nenhuma nova fila externa;
- nenhuma tabela genérica sem consumidor concreto.

### 15.3 Proveniência de ação

Toda sugestão acionável deve permitir provar:

- qual entrada originou;
- qual interpretação originou;
- qual versão era atual;
- se ainda é válida;
- se já foi materializada;
- se pode ser desfeita.

---

## 16. Estratégia de entrega vertical

### Slice 2X.1 — Contratos de projeção e matriz de estados

- contratos DTO;
- mapeamento lifecycle → produto;
- validade de ações;
- testes de contrato;
- sem alteração visual ampla ainda.

### Slice 2X.2 — Captura assíncrona

- persistência + enqueue;
- worker compartilhado;
- recibo;
- continuidade de contexto;
- falhas e idempotência.

### Slice 2X.3 — Caixa e Precisa de você

- projeções de lista;
- filtros;
- agrupamento;
- estados humanos;
- recálculo após ação.

### Slice 2X.4 — Revisão e coerência

- progressive disclosure;
- detalhes técnicos separados;
- invalidação de candidatos;
- record-only;
- semântica de reprocessamento.

### Slice 2X.5 — Home, Trabalho e arquitetura de informação

- Home acionável;
- Trabalho unificado conceitualmente;
- navegação primária/secundária;
- redirects/compatibilidade.

### Slice 2X.6 — Verdade operacional

- inventário de promessas;
- configurações;
- status global;
- copy nos dois locales.

### Slice 2X.7 — Instrumentação e gate final

- eventos;
- privacidade;
- métricas;
- regressões completas;
- documentação permanente.

Cada slice deve ser vertical, verificável e compatível com o estado implantado anterior.

---

## 17. Estratégia de testes

### 17.1 Unitários

- matriz interna → estado de produto;
- precedência de estado;
- motivos de atenção;
- validade de candidato;
- record-only;
- correção humana;
- Action result contracts;
- copy e fallback;
- payload allowlist de analytics.

### 17.2 Componentes

- recibo de captura;
- não redirecionamento;
- fila Precisa de você;
- filtros da Caixa;
- progressive disclosure;
- detalhe técnico recolhido;
- Trabalho e visões;
- navegação desktop/mobile;
- controles ocultos em Configurações;
- live regions e foco.

### 17.3 Banco e integração

- captura + enqueue atômicos;
- idempotência;
- ownership e RLS;
- job lease/retry/exhaustion;
- persistência tardia rejeitada;
- proveniência e validade de candidato;
- concorrência correção × confirmação;
- eventos sem conteúdo proibido;
- rollback em falha parcial.

### 17.4 End-to-end

1. capturar e continuar antes da IA concluir;
2. ver entrada Organizando;
3. processamento concluir e item ficar Pronto;
4. processamento exigir ação e item aparecer em Precisa de você;
5. corrigir interpretação sem candidato stale;
6. usar somente registro sem ação residual;
7. confirmar candidato válido e ver tarefa em Trabalho;
8. desfazer criação;
9. falhar, retry e recuperar;
10. navegar Home/Caixa/Trabalho/Brain/Mais;
11. executar em desktop e mobile;
12. executar em PT-BR e inglês;
13. abrir detalhes técnicos sem afetar o fluxo;
14. verificar telemetria permitida.

### 17.5 Regressão obrigatória

- auth;
- original preservado;
- versionamento imutável;
- audit e undo;
- tarefas existentes;
- perguntas existentes;
- arquivos e worker;
- chat fundamentado;
- custos de IA;
- settings operacionais;
- paginação;
- RLS cross-user;
- build, lint, typecheck e suíte completa.

---

## 18. Critérios globais de aceitação

A Fase 2X somente pode ser marcada como concluída quando:

1. captura confirma salvamento sem esperar IA;
2. usuário pode continuar no contexto anterior;
3. original permanece recuperável em toda falha;
4. fila existente processa interpretação com lease e idempotência;
5. Home, Caixa e detalhe usam estados humanos consistentes;
6. Precisa de você contém somente ações válidas já suportadas;
7. revisão principal funciona sem confiança técnica visível;
8. detalhes técnicos continuam acessíveis;
9. correção humana não é sobrescrita silenciosamente;
10. candidato stale não pode ser confirmado;
11. somente registro não mostra próxima ação implícita;
12. Home, Caixa e Trabalho possuem papéis claros;
13. Hoje/Tarefas/Aguardando convergem sem perder comportamento;
14. arquitetura de informação reduz destinos primários;
15. Jobs não é conceito da navegação comum;
16. configurações não prometem consumers inexistentes;
17. UI central não conhece lifecycle interno;
18. UI central não depende de score/policy/evidence;
19. DTOs de produto isolam componentes das tabelas;
20. Actions tocadas retornam contratos estáveis;
21. telemetria mede o funil sem conteúdo pessoal;
22. PT-BR e inglês passam;
23. desktop e mobile passam;
24. acessibilidade passa;
25. RLS, ownership, audit, undo e concorrência passam;
26. migrations local/remoto permanecem sincronizadas;
27. testes unitários, integração, E2E, lint, typecheck e build passam;
28. documentação permanente reflete o comportamento implantado;
29. 2C–2F não tiveram capacidades antecipadas;
30. nenhum controle falso foi introduzido.

---

## 19. Métricas de sucesso da fase

### 19.1 Métricas técnicas de experiência

- p50/p95 de recibo de captura;
- taxa de captura salva;
- taxa de enqueue;
- taxa de processamento concluído;
- tempo salvo → resultado;
- duplicidade lógica;
- projeções inválidas/fallbacks.

### 19.2 Métricas comportamentais

- capturas por usuário ativo;
- capturas sequenciais;
- abertura de Precisa de você;
- resolução por tipo;
- confirmação de candidatos existentes;
- abertura de detalhes técnicos;
- retorno a Trabalho após revisão;
- recorrência de uso em 7 dias.

### 19.3 Hipóteses a validar depois, não gates de implementação

- captura assíncrona aumenta frequência de registros;
- progressive disclosure reduz abandono da revisão;
- fila concentrada reduz pendências ignoradas;
- menos destinos primários melhora retomada;
- usuários raramente precisam abrir detalhes técnicos.

Essas hipóteses serão avaliadas no piloto da 2F. A 2X deve tornar a medição possível, não exigir resultado estatístico antes do piloto.

---

## 20. Riscos e mitigação

| Risco | Impacto | Mitigação obrigatória |
| --- | --- | --- |
| mover extração para worker duplica provider | divergência e custo | uma única pipeline compartilhada |
| recibo antes do enqueue gera órfão | entrada nunca processada | atomicidade ou reconciliador determinístico |
| projeção mascara erro real | falsa sensação de sucesso | fallback nunca vira Pronto |
| fila Precisa de você vira nova fonte de verdade | sincronização quebrada | derivar de domínio existente |
| invalidação remove ação útil | frustração | preservar evidência e explicar reanálise |
| reprocessamento sobrescreve correção | quebra de confiança | autoridade humana e gate de divergência |
| IA reorganizada vira plataforma genérica | atraso | projeções limitadas às superfícies 2X |
| unificação de rotas quebra links | regressão | aliases/redirects e testes |
| esconder configurações reduz transparência | confusão de usuário avançado | seção Avançado somente para comportamento real |
| analytics captura conteúdo | risco de privacidade | allowlist, testes e separação de audit |
| atualização em background rouba foco | UX instável | revalidação discreta e testes de foco |
| escopo invade 2C | fase infinita | matriz explícita e gate de capacidade nova |

---

## 21. Dependências

### 21.1 Técnicas existentes

- fila e lease da Fase 2A;
- pipeline de extração compartilhada;
- ledger de IA;
- lifecycle de entries;
- snapshots e current pointer da Fase 2B;
- trust engine;
- audit e undo;
- RLS e ownership;
- rotas localizadas;
- testes E2E remotos.

### 21.2 Decisões necessárias no planejamento

O plano de implementação deverá escolher, sem alterar os requisitos:

- forma de enqueue atômico;
- runtime da pipeline compartilhada no worker;
- forma de atualização da UI — revalidation, polling limitado ou mecanismo equivalente;
- persistência ou derivação do estado de validade do candidato;
- forma de armazenar eventos de produto;
- estratégia de aliases/redirects das rotas.

Essas são decisões de “como”, não ambiguidades de “o quê”.

---

## 22. Matriz de fronteira com fases posteriores

| Necessidade | 2X | 2C | 2D | 2E | 2F |
| --- | --- | --- | --- | --- | --- |
| salvar sem esperar IA | sim |  |  |  |  |
| estado humano e Precisa de você | sim |  |  |  |  |
| esconder confiança técnica | sim |  |  |  |  |
| invalidar candidato stale | sim |  |  |  |  |
| editar título/prazo do candidato |  | sim |  |  |  |
| dependências/subtarefas/split |  | sim |  |  |  |
| responder pergunta com reinterpretação |  |  | sim |  |  |
| deferir/ignorar pergunta |  |  | sim |  |  |
| localizar tarefa por linguagem natural |  |  |  | sim |  |
| alterar/cancelar tarefa por NLP |  |  |  | sim |  |
| onboarding |  |  |  |  | sim |
| revisão programada para o piloto |  |  |  |  | sim |
| hardening de lançamento |  |  |  |  | sim |
| instrumentar funil | sim | estende | estende | estende | opera |

---

## 23. Definition of Ready para planejamento

O planejamento da 2X pode começar porque:

- fronteira de escopo foi aprovada;
- abordagem vertical foi aprovada;
- dez épicos estão definidos;
- estados de produto estão definidos;
- arquitetura de informação alvo está definida;
- invariantes de coerência estão definidos;
- contratos de projeção mínimos estão definidos;
- fases posteriores estão protegidas;
- critérios de aceitação são falsificáveis;
- decisões restantes são de implementação.

---

## 24. Definition of Done documental

Ao encerrar a implementação da 2X, devem ser atualizados:

- `docs/STATE.md`;
- `docs/TODO.md`;
- `docs/CHANGELOG.md`;
- `docs/DECISIONS.md` com novos ADRs relevantes;
- `docs/ARCHITECTURE.md`;
- `docs/DATABASE.md` se houver contrato persistido novo;
- `docs/PHASE_2_PLAN.md` inserindo a 2X entre 2B e 2C;
- relatório final próprio da 2X;
- evidência de testes e limitações reais.

---

## 25. Conclusão

A Fase 2X não é uma pausa cosmética entre 2B e 2C. Ela é a fase que transforma segurança arquitetural em simplicidade percebida.

A Fase 2A garantiu que o processamento não se perdesse. A Fase 2B garantiu que interpretações pudessem ser compreendidas, corrigidas e desfeitas. A 2X deve garantir que o usuário não precise pensar em processamento, lifecycle, confiança, políticas ou snapshots para usar essas capacidades.

O critério essencial da fase é:

> tudo que já existe deve parecer uma experiência única; tudo que ainda não existe deve permanecer honestamente nas fases seguintes.

Quando a 2X terminar, a Fase 2C poderá ampliar tarefas sobre um ciclo estável, a 2D poderá fechar perguntas sobre uma fila coerente, a 2E poderá operar por linguagem natural sobre limites de domínio claros e a 2F poderá lançar um MVP que mede valor real em vez de tolerância à complexidade.

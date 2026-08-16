# Sugestões de novas pessoas em registros

## Objetivo

Quando uma interpretação identificar uma pessoa que ainda não existe na conta, o registro deve apresentar uma sugestão explícita e confirmável para criá-la. A interpretação nunca cria uma pessoa canônica sozinha, e a confirmação de tarefas nunca confirma pessoas implicitamente.

O caso de aceitação principal é o registro que menciona `Jaime` e `Giovanna` em uma conta sem pessoas: os dois nomes permanecem na interpretação e aparecem como duas sugestões pendentes. O usuário pode criar, corrigir o nome ou ignorar cada sugestão de forma independente.

## Estado atual e causa

`persist_entry_interpretation` guarda `p_extraction.people` em `entry_interpretations.extracted_people` e chama `persist_resolved_entry_entities`. Essa função cria `entry_entities` apenas quando `resolve_owned_entity_exact` encontra exatamente uma pessoa ou alias canônico já existente. Candidatos sem correspondência ficam somente no JSON da interpretação e não chegam à interface como decisões pendentes.

Esse limite é deliberadamente conservador, mas hoje produz descarte silencioso: a IA reconhece o nome, o registro continua pedindo revisão e a página Pessoas permanece vazia sem explicar por quê.

## Escopo

Esta entrega cobre somente candidatos do tipo `person` extraídos de registros. Contextos, empresas e projetos mantêm o comportamento atual. A entrega não cria relações pessoa-pessoa, não altera o modelo de extração da IA e não associa automaticamente uma pessoa às tarefas confirmadas no mesmo registro.

## Experiência do usuário

Na seção de próximas ações do registro, depois das sugestões de tarefa, aparece um grupo `Pessoas mencionadas` quando a interpretação atual contém pessoas ainda não resolvidas.

Cada item mostra o nome extraído e três possibilidades:

- **Criar pessoa**: confirma o nome exibido e cria ou reutiliza a pessoa canônica.
- **Corrigir nome**: torna o nome editável antes da confirmação.
- **Ignorar**: registra que aquela menção não deve virar pessoa.

Nenhuma opção vem confirmada por padrão. O envio é independente da confirmação de tarefas. O resultado anuncia quantas pessoas foram criadas, vinculadas ou ignoradas e atualiza `O que passou a existir` sem exigir recarga manual.

Uma pessoa que já corresponde exatamente a um nome ou alias canônico não aparece como sugestão: ela continua sendo vinculada automaticamente pelo fluxo atual. Se uma correspondência passar a existir entre a renderização e o envio, a operação reutiliza a pessoa existente em vez de criar duplicata.

## Contrato de persistência

Uma migration cria `public.entry_person_candidate_resolutions`, owner-scoped e protegida por RLS forçada. Cada linha é identificada por `(interpretation_id, candidate_index)` e contém:

- `user_id`, `entry_id` e `interpretation_id` com FKs compostas de ownership;
- `candidate_index`, apontando para a posição em `extracted_people`;
- `disposition`: `confirmed` ou `rejected`;
- `original_name`, copiado do candidato autoritativo no momento da resolução;
- `resolved_name`, obrigatório apenas em `confirmed`;
- `person_id`, obrigatório apenas em `confirmed`;
- `operation_key`, `created_at` e metadados mínimos para replay e auditoria.

O nome e a confiança nunca são aceitos como autoridade a partir do formulário. A RPC recarrega a interpretação atual, indexa `extracted_people` e deriva o candidato pelo índice recebido.

## RPC atômica

A RPC `resolve_entry_person_candidates` recebe:

- `p_entry_id uuid`;
- `p_expected_interpretation_id uuid`;
- `p_resolutions jsonb` com `candidateIndex`, `disposition` e `resolvedName` opcional;
- `p_operation_key text`.

Ela executa, na mesma transação:

1. valida sessão, ownership e que a interpretação esperada ainda é a atual;
2. valida índices únicos, disposições e nomes corrigidos;
3. recusa candidatos que já possuam resolução incompatível;
4. para `confirmed`, procura novamente nome/aliases normalizados;
5. reutiliza a correspondência única ou insere `public.people` com proteção contra corrida pelo índice único existente;
6. cria o `entry_entities` da interpretação atual;
7. persiste a resolução e auditoria;
8. registra uma operação de undo com o estado suficiente para compensação segura;
9. devolve um resultado estável em replay da mesma `operation_key`.

Uma correspondência ambígua nunca é escolhida automaticamente. A RPC retorna um erro tipado para a interface pedir que o usuário escolha uma pessoa existente ou corrija o nome.

## Undo

`Desfazer decisões` cobre também as resoluções de pessoas produzidas por esta operação.

- Se a operação apenas vinculou uma pessoa preexistente, o undo remove o vínculo e a resolução.
- Se criou uma pessoa nova, o undo a remove somente quando ela ainda não possui outros vínculos, relações ou conteúdo dependente.
- Se a pessoa passou a ser usada depois, o undo remove somente o vínculo deste registro e mantém a pessoa canônica, informando essa preservação no resultado.
- Uma resolução `rejected` é simplesmente removida no undo, fazendo a sugestão voltar a ficar pendente.

## Projeção e interface

A projeção de revisão deriva candidatos de `current.extracted_people`, dos `entry_entities` da interpretação atual e de `entry_person_candidate_resolutions`.

Um candidato fica pendente apenas quando:

- possui nome não vazio e confiança válida;
- não tem vínculo canônico já materializado para a mesma identidade normalizada;
- não possui resolução terminal nesta interpretação.

O componente de sugestões recebe somente DTOs congelados. A Server Action valida o formulário com Zod, cria a `operation_key` no servidor quando necessário, chama exclusivamente a RPC e revalida o registro e a página Pessoas após sucesso.

A interface é localizada em português e inglês, acessível por teclado, anuncia seleção/resultado em região viva e preserva o texto digitado quando a ação falha.

## Reinterpretação e identidade

Resoluções pertencem a uma versão de interpretação. Uma reinterpretação nova recalcula os candidatos e não copia rejeições cegamente. Pessoas já confirmadas serão encontradas pelo resolvedor canônico e vinculadas sem nova sugestão. Uma correção que mude `Giovanna` para `Giovana` permanece auditável na resolução original e passa a usar o nome canônico confirmado.

Apelidos continuam obedecendo `entity_aliases`; esta entrega não cria aliases automaticamente a partir de parênteses como `Giovanna (Gigi)`.

## Segurança e limites

- Toda leitura e escrita é owner-scoped e protegida por FKs compostas e RLS forçada.
- A RPC é `SECURITY DEFINER`, tem `search_path = ''`, valida `auth.uid()` e é concedida somente a `authenticated`.
- O payload tem limite de candidatos e de tamanho de nome; índices duplicados são recusados.
- Conteúdo bruto do registro e nomes não entram em eventos de produto.
- A operação não usa `service_role` no caminho de produto.
- A migration é aditiva; não reescreve interpretações históricas nem cria pessoas retroativamente.

## Testes e evidência de conclusão

1. Teste pgTAP reproduz a conta vazia com `Jaime` e `Giovanna`: persistir interpretação não cria pessoas; consultar a projeção produz duas pendências; confirmar cria duas pessoas e dois vínculos.
2. pgTAP cobre correspondência exata, alias, corrida de unicidade, interpretação obsoleta, ownership estrangeiro, replay idempotente, rejeição e undo com/sem uso posterior.
3. Vitest cobre derivação dos DTOs, parsing do formulário, cópia bilíngue e estados pendente/resolvido.
4. Testing Library cobre teclado, edição, ignorar, preservação após falha e anúncio do resultado.
5. Smoke autenticado no Supabase vinculado executa o fluxo real por Server Action e limpa somente seus fixtures por IDs explícitos.
6. Playwright cobre o registro em viewport móvel, confirma uma pessoa, ignora outra e verifica Pessoas e `O que passou a existir`.

## Fora de escopo

- Criação automática sem confirmação.
- Sugestões de novos projetos, contextos ou empresas.
- Inferência ou criação automática de aliases.
- Associação automática das pessoas às tarefas do mesmo registro.
- Backfill dos registros históricos já interpretados.
- Alteração do prompt ou do provedor de IA.

# Life Brain — Arquitetura de informação

Status: governing artifact (ADR-145). Define o menu enxuto, o que vai para "Avançado" e como o composer único funciona em todas as telas. O estado atual está em `docs/reports/life-brain/INVESTIGATION.md` §1.5.

## 1. De 22 destinos para 6

| Hoje (26 chaves, 6 grupos) | Proposta |
| --- | --- |
| Hoje · Registros · Trabalho · Brain (primários) | **Hoje · Conversar · Agenda · Memória · Ajustes** + **Capturar** (botão central) |
| Mais → Contexto (Conversar, Projetos, Pessoas, Empresas, Contextos, Memórias, Arquivos, Relações) | **Memória** absorve: Áreas da vida (novo), Pessoas, Projetos, Organizações, Arquivos, Memórias, Ideias (lente). Contextos deixam de ser destino (são as áreas). Relações vira uma lente dentro de Pessoa/Projeto. |
| Mais → Reflexão (Revisões, Perguntas pendentes) | Revisões vive dentro de **Hoje** ("Encerrar o dia") e de Agenda (semana/mês). Perguntas pendentes vive em **Registros** como filtro "Precisa de você", não como destino. |
| Mais → Organização (Calendário, Lembretes) | **Agenda** absorve Calendário, Planejar e Lembretes (lente). |
| Mais → Transparência (Histórico, Custos de IA) + Processamento | **Ajustes → Avançado**: Histórico, Custos de IA, Processamento, Diagnóstico. |
| Trabalho | **Tarefas**, uma lente de Agenda (lista) e também acessível de Hoje. |
| Registros | Permanece como superfície, acessível de Hoje ("ver tudo") e de Memória; **sai da barra**. |

### Barra móvel (5 slots, capture no centro)

```
Hoje · Conversar · [ + ] · Agenda · Memória
```

Ajustes fica no menu da conta (cabeçalho), como hoje. "Mais" desaparece da barra; a paleta de comandos continua alcançando tudo pelo nome.

### Rail desktop

Hoje, Conversar, Agenda, Memória, (separador) Registros, Tarefas, (rodapé) Ajustes. Captura rápida como botão destacado.

## 2. Mapa de rotas

Rotas antigas continuam respondendo (redirect 308 ou alias) para não quebrar notificações já enviadas, links salvos e os guards de reachability.

| Destino | Rota | Lentes / filtros | Antigos → |
| --- | --- | --- | --- |
| Hoje | `/app` | — | `/app/today` |
| Conversar | `/app/chat`, `/app/chat/[id]` | — | — |
| Agenda | `/app/agenda` | Dia · Semana · Mês · Lista (tarefas) · Lembretes | `/app/calendar`, `/app/calendar/plan`, `/app/work`, `/app/tasks`, `/app/waiting`, `/app/reminders` |
| Memória | `/app/memory` | Áreas · Pessoas · Projetos · Organizações · Arquivos · Memórias · Ideias · Buscar | `/app/library`, `/app/people`, `/app/projects`, `/app/organizations`, `/app/contexts`, `/app/files`, `/app/memories`, `/app/relations`, `/app/search` |
| Área da vida | `/app/memory/areas/[area]` | Linha do tempo · Pendências · Pessoas · Eventos | — |
| Registros | `/app/inbox`, `/app/inbox/[id]` | Precisa de você · Organizando · Falhas · Só registro · Tudo | `/app/questions` |
| Ajustes | `/app/settings/[section]` | Geral · Assistente · IA · Agenda · Avisos · Privacidade · Aparência · Conta · **Avançado** | `/app/history`, `/app/costs`, `/app/jobs`, `/app/notifications` (lista de avisos vira seção de Ajustes → Avisos e ícone de sino) |

A migração de rotas é feita **por slice**, cada um com redirect + atualização de `capabilities.ts`, dos guards (`mobile-reachability-guard`, `capability-registry-guard`, `layout-contracts.spec.ts`) e das mensagens. O vocabulário interno (`route` keys) pode permanecer; o que muda é o que o usuário vê.

## 3. Jargão → produto

| Interno | Produto |
| --- | --- |
| Contextos | Áreas da vida |
| Relações | (lente "Ligações" dentro de uma pessoa/projeto) |
| Perguntas pendentes | Precisa de você |
| Histórico de alterações | Avançado → Histórico |
| Custos de IA | Avançado → Uso de IA |
| Processamento | Avançado → Em andamento |
| Memórias | Memórias (fica; é a palavra do produto para fatos duradouros) |
| Brain | Memória |
| Trabalho | Tarefas |
| Empresas | Organizações |
| Interpretação / interpretando | Organização / organizando |
| Registro "Só registro" | "Guardado" |

## 4. O composer único

Hoje existem dois componentes (`capture/composer.tsx` e `assistant/assistant-composer.tsx`) e uma heurística de 15 frases decide se uma linha do chat vira registro. A proposta:

1. **Um componente, dois modos declarados pela superfície.** `Composer` ganha `mode: "capture" | "converse"`. Em Hoje e Capturar o modo é `capture` (texto, anexo, voz → `captureEntry`). Em Conversar o modo é `converse` (texto, voz → `runAssistantTurn`). O usuário nunca escolhe; a tela escolhe.
2. **No modo `converse`, registrar continua possível** e deixa de depender de abertura: o roteador classifica (a) pergunta — termina em `?` ou começa com interrogativo —, (b) comando — verbo de mudança + referência a tarefa/lembrete —, (c) afirmação/relato — o resto. (c) é **captura** com a resposta do assistente "Guardei como registro de Saúde. Quer que eu crie a pendência do exame?" dentro da conversa. Assim o chat vira também uma porta de captura, e a lista de aberturas vira um atalho, não a regra.
3. **Voz nos dois modos.** O `VoiceComposer` existente passa para o `Composer` compartilhado.
4. **Sempre fixo no celular** acima da barra; no desktop, no rodapé da coluna de conteúdo em Conversar e no topo em Hoje/Capturar.
5. **Uma só folha de estilo** (`ui.css` → `.ui-composer`), retirando as 39 regras de `assistant.css` e as 21 de `experience.css` quando o último consumidor migrar.

Risco: o roteador (c) pode capturar uma frase que era pergunta implícita ("médico semana passada"). Mitigação: ambiguidade → o assistente pergunta ("Registrar isso ou procurar sobre isso?") com dois botões, como já faz em `capture_ambiguous`.

## 5. Ordem de adoção

1. Slice A.1: porta para Conversar em Hoje; chat redesenhado. Barra inalterada.
2. Slice A.2 (**entregue 2026-10-31**): barra **Hoje · Conversar · [+] · Agenda · Memória**; Registros e Trabalho saem da barra para o par secundário do rail e para a faixa "Ir para" de Hoje; guards atualizados; rotas intactas. O rótulo "Tarefas" fica para A.3; o título "Calendário" e o chip "Agenda" da página ficam para A.4.
3. Slice A.3–A.5: Tarefas/Agenda/Memória recebem lentes e absorvem rotas antigas com redirects.
4. Slice C.5: Áreas da vida em Memória.
5. Slice B.5: composer único com modo `converse`.

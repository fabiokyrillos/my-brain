# AI Agent Contract

## Extração

O original é salvo antes de qualquer chamada. A OpenAI recebe o texto como dado não confiável e retorna um schema validado com idioma, data, retroatividade, resumo, 19 conceitos, contextos, organizações, projetos, pessoas, tarefas candidatas, perguntas e confiança.

Modelo padrão de extração/chat: `gpt-5.6-luna`. Modelo de embedding: `text-embedding-3-small`. O modelo escolhido nas Configurações é usado em captura, chat, revisões e arquivos; variáveis server-only continuam como fallback.

## Ações e confirmação

Classificação e associações reversíveis de alta confiança podem ser persistidas. Tarefas candidatas são mostradas selecionadas, mas só são criadas depois da confirmação do usuário. A criação é auditada e gera uma operação compensatória com expiração.

## Chat fundamentado

1. A pergunta vira embedding.
2. A RPC pgvector recupera registros e memórias do próprio usuário.
3. As fontes entram como dados não confiáveis, nunca como instruções.
4. A resposta estruturada pode citar somente IDs fornecidos.
5. IDs inexistentes são removidos deterministicamente.
6. Mensagem, modelo, tokens e fontes ficam persistidos.

Se as fontes forem insuficientes, o agente deve dizer isso em vez de completar lacunas.

## Heartbeat

O heartbeat é determinístico no pré-MVP. Ele respeita `quiet_start`/`quiet_end`, cria avisos diários deduplicados para atrasos e stale tasks, entrega lembretes vencidos e registra quando permaneceu silencioso. O cron roda a cada hora; uma Edge Function protegida oferece acionamento operacional.

## Revisões

Resumo diário, revisão semanal, planejamento semanal e revisão mensal usam entradas/tarefas reais como fontes. Revisões retroativas são marcadas como desatualizadas. Geração automática no horário configurado, edição versionada e aprendizado com correções ainda são próximos passos.

## Arquivos

Uploads privados são validados, persistidos e enfileirados. A Edge Function `process-jobs` valida a sessão, limita o job ao próprio usuário, cria uma URL assinada e envia o arquivo como `input_image` ou `input_file`. Descrição, texto, pessoas, projetos, datas e tarefas candidatas ficam em `attachment_interpretations`; o original não é alterado. Tarefas extraídas não são criadas automaticamente.

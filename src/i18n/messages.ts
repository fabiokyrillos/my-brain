import type { Locale } from "@/lib/preferences";

const messages = {
  "pt-BR": {
    nav: { home: "Início", today: "Hoje", inbox: "Caixa de entrada", tasks: "Tarefas", waiting: "Aguardando", people: "Pessoas", projects: "Projetos", settings: "Configurações", capture: "Captura rápida" },
    home: { eyebrow: "QUINTA, 16 DE JULHO", greeting: "Boa tarde.", prompt: "O que merece sua atenção agora?", placeholder: "Registre uma tarefa, decisão, conversa ou ideia…", send: "Registrar", priority: "Prioridades de hoje", waiting: "Aguardando terceiros", questions: "Perguntas pendentes", recent: "Atividade recente", nextReview: "Próxima revisão", empty: "Seu dia começa aqui", emptyHint: "Registre algo e o Brain organiza o contexto sem tirar você do fluxo." },
  },
  en: {
    nav: { home: "Home", today: "Today", inbox: "Inbox", tasks: "Tasks", waiting: "Waiting", people: "People", projects: "Projects", settings: "Settings", capture: "Quick capture" },
    home: { eyebrow: "THURSDAY, JULY 16", greeting: "Good afternoon.", prompt: "What deserves your attention now?", placeholder: "Capture a task, decision, conversation, or idea…", send: "Capture", priority: "Today's priorities", waiting: "Waiting on others", questions: "Pending questions", recent: "Recent activity", nextReview: "Next review", empty: "Your day starts here", emptyHint: "Capture something and Brain organizes the context without breaking your flow." },
  },
} as const;

export function getMessages(locale: Locale) {
  return messages[locale];
}

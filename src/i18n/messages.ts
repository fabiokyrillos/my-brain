import type { Locale } from "@/lib/preferences";

const messages = {
  "pt-BR": {
    nav: {
      home: "Início",
      today: "Hoje",
      inbox: "Caixa",
      work: "Trabalho",
      tasks: "Tarefas",
      waiting: "Aguardando",
      projects: "Projetos",
      people: "Pessoas",
      reminders: "Lembretes",
      questions: "Perguntas pendentes",
      chat: "Brain",
      memories: "Memórias",
      reviews: "Revisões",
      files: "Arquivos",
      history: "Histórico",
      costs: "Custos de IA",
      notifications: "Notificações",
      settings: "Configurações",
      capture: "Captura rápida",
      more: "Mais",
    },
    navGroups: {
      primary: "Principal",
      context: "Contexto",
      reflection: "Reflexão",
      organization: "Organização",
      transparency: "Transparência",
      preferences: "Preferências",
    },
    shell: {
      mainNavigation: "Navegação principal",
      mobileNavigation: "Navegação móvel",
      switchLanguage: "Mudar idioma para inglês",
    },
  },
  en: {
    nav: {
      home: "Home",
      today: "Today",
      inbox: "Inbox",
      work: "Work",
      tasks: "Tasks",
      waiting: "Waiting",
      projects: "Projects",
      people: "People",
      reminders: "Reminders",
      questions: "Pending questions",
      chat: "Brain",
      memories: "Memories",
      reviews: "Reviews",
      files: "Files",
      history: "History",
      costs: "AI costs",
      notifications: "Notifications",
      settings: "Settings",
      capture: "Quick capture",
      more: "More",
    },
    navGroups: {
      primary: "Primary",
      context: "Context",
      reflection: "Reflection",
      organization: "Organization",
      transparency: "Transparency",
      preferences: "Preferences",
    },
    shell: {
      mainNavigation: "Main navigation",
      mobileNavigation: "Mobile navigation",
      switchLanguage: "Switch language to Portuguese",
    },
  },
} as const;

export function getMessages(locale: Locale) {
  return messages[locale];
}

import type { Locale } from "@/lib/preferences";

const messages = {
  "pt-BR": {
    nav: {
      home: "Início",
      today: "Hoje",
      /*
       * `Registros`, not `Caixa` (UX-03, DEC-1).
       *
       * The route key stays `inbox`, so no URL changes and every existing link
       * keeps working — what changes is only what the destination is *called*.
       * "Caixa" borrowed a mailbox's name for an append-only archive: nothing
       * ever leaves this list, there is no archive, no "done" and no zero state
       * to reach, and its own subtitle already said "everything you entrusted to
       * Brain". The to-organize queue people expected a mailbox to be is the
       * `?view=needs-you` tab inside it, which Slice C promoted onto Home.
       */
      inbox: "Registros",
      work: "Trabalho",
      tasks: "Tarefas",
      waiting: "Aguardando",
      projects: "Projetos",
      people: "Pessoas",
      /*
       * `Empresas`, not `Organizações` (EGC.1).
       *
       * The table is `organizations` and the route key follows it, but the
       * product has called the relation "Empresa" everywhere it was already
       * visible — the Company selector on Person and Project, and both detail
       * heroes. A destination named after the column while every control
       * naming the same thing says `Empresa` would be two words for one idea.
       */
      organizations: "Empresas",
      contexts: "Contextos",
      reminders: "Lembretes",
      questions: "Perguntas pendentes",
      /*
       * `Conversar`, not `Brain` (UX-06, DEC-2).
       *
       * The route key stays `chat` and the URL is unchanged. What changes is
       * that this destination stops being named after the assistant: "Brain"
       * was doing three jobs at once — the product (`My Brain`), this nav
       * label, and the assistant as an actor — and a name the owner can now
       * change in Settings cannot also be a fixed place in the navigation.
       * A destination is a place, so it gets a verb.
       */
      chat: "Conversar",
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
      inbox: "Records",
      work: "Work",
      tasks: "Tasks",
      waiting: "Waiting",
      projects: "Projects",
      people: "People",
      organizations: "Companies",
      contexts: "Contexts",
      reminders: "Reminders",
      questions: "Pending questions",
      chat: "Talk",
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

import type { Locale } from "@/lib/preferences";

/**
 * The entity-editing copy, as one typed record per locale (ADR-036).
 *
 * `satisfies Record<Locale, EntityCopy>` makes a missing key or a missing
 * locale a compile error, so English cannot silently receive Portuguese the way
 * the detail pages' inline `pt ? … : …` ternaries could.
 */

type EntityCopy = {
  readonly edit: string;
  readonly cancel: string;
  readonly save: string;
  readonly saving: string;
  readonly saved: string;
  readonly nameLabel: string;
  readonly descriptionLabel: string;
  readonly notesLabel: string;
  readonly statusLabel: string;
  readonly organizationLabel: string;
  readonly organizationNone: string;
  readonly organizationEmpty: string;
  readonly statuses: Readonly<Record<"active" | "paused" | "completed" | "archived", string>>;
  /** Failures, each one a distinct thing the user can act on. */
  readonly invalidInput: string;
  readonly sessionExpired: string;
  readonly duplicateName: string;
  readonly notFound: string;
  readonly saveFailed: string;
  readonly createFailed: string;
  readonly createdButNotLinked: string;
  /** The read-only relation blocks this slice surfaces. */
  readonly relationships: string;
  readonly relationshipsEmpty: string;
  readonly contexts: string;
  readonly contextsEmpty: string;
  readonly roleOnProject: string;
  readonly noRole: string;
  readonly company: string;
  readonly companyNone: string;
  readonly since: string;
  /** Organizations and contexts as first-class surfaces (EGC.1). */
  readonly created: string;
  readonly createdAndLinked: string;
  readonly organizations: string;
  readonly organizationsIntro: string;
  readonly organizationsEyebrow: string;
  readonly organizationsEmpty: string;
  readonly organizationsEmptyHint: string;
  readonly newOrganization: string;
  readonly createOrganization: string;
  readonly organizationNotFound: string;
  readonly contextsTitle: string;
  readonly contextsIntro: string;
  readonly contextsEyebrow: string;
  readonly contextsListEmpty: string;
  readonly contextsListEmptyHint: string;
  readonly newContext: string;
  readonly createContext: string;
  readonly contextNotFound: string;
  readonly kindLabel: string;
  readonly kinds: Readonly<Record<"work" | "personal" | "custom", string>>;
  readonly linkedPeople: string;
  readonly linkedPeopleEmpty: string;
  readonly linkedProjects: string;
  readonly linkedProjectsEmpty: string;
  readonly linkedTasks: string;
  readonly linkedTasksEmpty: string;
  readonly addCompanyInline: string;
  readonly newCompanyName: string;
  readonly cancelInline: string;
  readonly noDescription: string;
};

const copy = {
  "pt-BR": {
    edit: "Editar",
    cancel: "Cancelar",
    save: "Salvar",
    saving: "Salvando…",
    saved: "Alterações salvas.",
    nameLabel: "Nome",
    descriptionLabel: "Descrição",
    notesLabel: "Notas",
    statusLabel: "Situação",
    organizationLabel: "Empresa",
    organizationNone: "Sem empresa",
    organizationEmpty: "Nenhuma empresa registrada ainda.",
    statuses: {
      active: "Ativo",
      paused: "Pausado",
      completed: "Concluído",
      archived: "Arquivado",
    },
    invalidInput: "Revise os campos.",
    sessionExpired: "Sua sessão expirou.",
    duplicateName: "Esse nome já existe.",
    notFound: "Este registro não existe mais.",
    saveFailed: "Não foi possível salvar agora.",
    createFailed: "Não foi possível criar agora.",
    createdButNotLinked: "A empresa foi criada, mas não foi vinculada. Selecione-a na lista.",
    relationships: "Relação com você",
    relationshipsEmpty: "Nenhuma relação registrada.",
    contexts: "Contextos",
    contextsEmpty: "Nenhum contexto registrado.",
    roleOnProject: "Papel",
    noRole: "Sem papel definido",
    company: "Empresa",
    companyNone: "Sem empresa",
    since: "desde",
    created: "Criado.",
    createdAndLinked: "Empresa criada e vinculada.",
    organizations: "Empresas",
    organizationsIntro: "Empresas reconhecidas nas suas entradas ou criadas por você.",
    organizationsEyebrow: "EMPRESA",
    organizationsEmpty: "Nenhuma empresa ainda.",
    organizationsEmptyHint: "Crie a primeira para poder vinculá-la a pessoas e projetos.",
    newOrganization: "Nova empresa",
    createOrganization: "Criar empresa",
    organizationNotFound: "Esta empresa não existe.",
    contextsTitle: "Contextos",
    contextsIntro: "Âmbitos que separam o que é trabalho do que é pessoal.",
    contextsEyebrow: "CONTEXTO",
    contextsListEmpty: "Nenhum contexto ainda.",
    contextsListEmptyHint: "Crie o primeiro para poder vinculá-lo a pessoas e tarefas.",
    newContext: "Novo contexto",
    createContext: "Criar contexto",
    contextNotFound: "Este contexto não existe.",
    kindLabel: "Tipo",
    kinds: { work: "Trabalho", personal: "Pessoal", custom: "Personalizado" },
    linkedPeople: "Pessoas",
    linkedPeopleEmpty: "Nenhuma pessoa vinculada.",
    linkedProjects: "Projetos",
    linkedProjectsEmpty: "Nenhum projeto vinculado.",
    linkedTasks: "Tarefas",
    linkedTasksEmpty: "Nenhuma tarefa vinculada.",
    addCompanyInline: "Criar nova empresa",
    newCompanyName: "Nome da nova empresa",
    cancelInline: "Cancelar",
    noDescription: "Sem descrição.",
  },
  en: {
    edit: "Edit",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    saved: "Changes saved.",
    nameLabel: "Name",
    descriptionLabel: "Description",
    notesLabel: "Notes",
    statusLabel: "Status",
    organizationLabel: "Company",
    organizationNone: "No company",
    organizationEmpty: "No company recorded yet.",
    statuses: {
      active: "Active",
      paused: "Paused",
      completed: "Completed",
      archived: "Archived",
    },
    invalidInput: "Review the fields.",
    sessionExpired: "Your session expired.",
    duplicateName: "That name already exists.",
    notFound: "This record no longer exists.",
    saveFailed: "We could not save right now.",
    createFailed: "We could not create it right now.",
    createdButNotLinked: "The company was created but not linked. Select it from the list.",
    relationships: "Relationship to you",
    relationshipsEmpty: "No relationship recorded.",
    contexts: "Contexts",
    contextsEmpty: "No context recorded.",
    roleOnProject: "Role",
    noRole: "No role set",
    company: "Company",
    companyNone: "No company",
    since: "since",
    created: "Created.",
    createdAndLinked: "Company created and linked.",
    organizations: "Companies",
    organizationsIntro: "Companies recognized in your entries or created by you.",
    organizationsEyebrow: "COMPANY",
    organizationsEmpty: "No companies yet.",
    organizationsEmptyHint: "Create the first one so you can link it to people and projects.",
    newOrganization: "New company",
    createOrganization: "Create company",
    organizationNotFound: "This company does not exist.",
    contextsTitle: "Contexts",
    contextsIntro: "The scopes that keep work apart from personal life.",
    contextsEyebrow: "CONTEXT",
    contextsListEmpty: "No contexts yet.",
    contextsListEmptyHint: "Create the first one so you can link it to people and tasks.",
    newContext: "New context",
    createContext: "Create context",
    contextNotFound: "This context does not exist.",
    kindLabel: "Kind",
    kinds: { work: "Work", personal: "Personal", custom: "Custom" },
    linkedPeople: "People",
    linkedPeopleEmpty: "No linked people.",
    linkedProjects: "Projects",
    linkedProjectsEmpty: "No linked projects.",
    linkedTasks: "Tasks",
    linkedTasksEmpty: "No linked tasks.",
    addCompanyInline: "Create a new company",
    newCompanyName: "New company name",
    cancelInline: "Cancel",
    noDescription: "No description.",
  },
} satisfies Record<Locale, EntityCopy>;

export function getEntityCopy(locale: Locale): EntityCopy {
  return copy[locale];
}

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
  /** Relationships and associations (EGC.2). */
  readonly duplicateRelation: string;
  readonly foreignTarget: string;
  readonly relationshipAdded: string;
  readonly relationshipEnded: string;
  readonly associationAdded: string;
  readonly associationEnded: string;
  readonly addRelationship: string;
  readonly editRelationship: string;
  readonly endRelationship: string;
  readonly relationshipTypeLabel: string;
  readonly relationshipDescriptionLabel: string;
  readonly relationshipDescriptionHint: string;
  readonly saveRelationship: string;
  readonly unknownRelationship: string;
  readonly addContextAssociation: string;
  readonly contextAssociationLabel: string;
  readonly saveContextAssociation: string;
  readonly removeContextAssociation: string;
  readonly noContextsToAssociate: string;
  /**
   * "You own none of these" and "you have linked them all" are different facts
   * with different next steps, and collapsing them tells an owner to create
   * something they already have. Three sentences rather than one, because the
   * thing that ran out differs per placement.
   */
  readonly allContextsLinked: string;
  readonly allProjectsLinked: string;
  readonly allPeopleLinked: string;
  readonly addProjectAssociation: string;
  readonly projectAssociationLabel: string;
  readonly saveProjectAssociation: string;
  readonly removeProjectAssociation: string;
  readonly noProjectsToAssociate: string;
  readonly addPersonAssociation: string;
  readonly personAssociationLabel: string;
  readonly savePersonAssociation: string;
  readonly removePersonAssociation: string;
  readonly noPeopleToAssociate: string;
  readonly roleLabel: string;
  readonly rolePlaceholder: string;
  readonly saveRole: string;
  /**
   * EGC-REL-009. The Person page shows Company and relationship-to-owner as two
   * separate concerns, and each says what it is for — a company is where someone
   * works, and it has never been a way to say what they are to you.
   */
  readonly companyExplainer: string;
  readonly relationshipExplainer: string;
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
    /*
     * Distinct from `cancel` on purpose. Both controls are on screen at the
     * same time — the inline create only exists while the edit form is open —
     * and two buttons reading "Cancelar" would give a screen-reader user two
     * identical names for two different scopes.
     */
    cancelInline: "Cancelar nova empresa",
    noDescription: "Sem descrição.",
    duplicateRelation: "Isso já está registrado.",
    foreignTarget: "Não encontramos esse registro na sua conta.",
    relationshipAdded: "Relação registrada.",
    relationshipEnded: "Relação encerrada. O histórico continua guardado.",
    associationAdded: "Vínculo criado.",
    associationEnded: "Vínculo encerrado. O histórico continua guardado.",
    addRelationship: "Registrar relação",
    editRelationship: "Editar relação",
    endRelationship: "Encerrar relação",
    relationshipTypeLabel: "Tipo de relação",
    relationshipDescriptionLabel: "Observação",
    relationshipDescriptionHint: "Opcional. Suas palavras, do seu jeito.",
    saveRelationship: "Salvar relação",
    unknownRelationship: "Relação não reconhecida",
    addContextAssociation: "Vincular a um contexto",
    contextAssociationLabel: "Contexto",
    saveContextAssociation: "Vincular contexto",
    removeContextAssociation: "Encerrar vínculo com o contexto",
    noContextsToAssociate: "Crie um contexto antes de vincular alguém a ele.",
    allContextsLinked: "Todos os seus contextos já estão vinculados a esta pessoa.",
    allProjectsLinked: "Todos os seus projetos já estão vinculados a esta pessoa.",
    allPeopleLinked: "Todas as suas pessoas já estão vinculadas a este projeto.",
    addProjectAssociation: "Vincular a um projeto",
    projectAssociationLabel: "Projeto",
    saveProjectAssociation: "Vincular projeto",
    removeProjectAssociation: "Encerrar vínculo com o projeto",
    noProjectsToAssociate: "Crie um projeto antes de vincular alguém a ele.",
    addPersonAssociation: "Vincular uma pessoa",
    personAssociationLabel: "Pessoa",
    savePersonAssociation: "Vincular pessoa",
    removePersonAssociation: "Encerrar vínculo com a pessoa",
    noPeopleToAssociate: "Cadastre uma pessoa antes de vinculá-la a este projeto.",
    roleLabel: "Papel",
    rolePlaceholder: "Ex.: revisora do contrato",
    saveRole: "Salvar papel",
    companyExplainer: "Onde a pessoa trabalha.",
    relationshipExplainer: "Quem essa pessoa é para você.",
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
    cancelInline: "Cancel new company",
    noDescription: "No description.",
    duplicateRelation: "That is already recorded.",
    foreignTarget: "We could not find that record in your account.",
    relationshipAdded: "Relationship recorded.",
    relationshipEnded: "Relationship ended. The history is still kept.",
    associationAdded: "Link created.",
    associationEnded: "Link ended. The history is still kept.",
    addRelationship: "Record a relationship",
    editRelationship: "Edit relationship",
    endRelationship: "End relationship",
    relationshipTypeLabel: "Kind of relationship",
    relationshipDescriptionLabel: "Note",
    relationshipDescriptionHint: "Optional. Your words, your way.",
    saveRelationship: "Save relationship",
    unknownRelationship: "Unrecognized relationship",
    addContextAssociation: "Link to a context",
    contextAssociationLabel: "Context",
    saveContextAssociation: "Link context",
    removeContextAssociation: "End the context link",
    noContextsToAssociate: "Create a context before linking anyone to it.",
    allContextsLinked: "Every one of your contexts is already linked to this person.",
    allProjectsLinked: "Every one of your projects is already linked to this person.",
    allPeopleLinked: "Every one of your people is already linked to this project.",
    addProjectAssociation: "Link to a project",
    projectAssociationLabel: "Project",
    saveProjectAssociation: "Link project",
    removeProjectAssociation: "End the project link",
    noProjectsToAssociate: "Create a project before linking anyone to it.",
    addPersonAssociation: "Link a person",
    personAssociationLabel: "Person",
    savePersonAssociation: "Link person",
    removePersonAssociation: "End the person link",
    noPeopleToAssociate: "Add a person before linking them to this project.",
    roleLabel: "Role",
    rolePlaceholder: "e.g. contract reviewer",
    saveRole: "Save role",
    companyExplainer: "Where this person works.",
    relationshipExplainer: "Who this person is to you.",
  },
} satisfies Record<Locale, EntityCopy>;

export function getEntityCopy(locale: Locale): EntityCopy {
  return copy[locale];
}

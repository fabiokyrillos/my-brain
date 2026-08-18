import type { Locale } from "@/lib/preferences";

/**
 * The composer's copy, as a typed module rather than scattered locale
 * ternaries (`ENGINEERING_STANDARDS`, ADR-036).
 *
 * Two of these strings carry a rule the owner cannot otherwise see, and both
 * are written to be true while they are holding something they care about:
 *
 *  - `rejectedType` and `rejectedSize` name the *rule* rather than the file, so
 *    a refusal never repeats the owner's filename back at them in a message
 *    that may be read aloud or screenshotted.
 *  - `offline` says the draft stays in this tab and that nothing is queued,
 *    because the previous sentence claimed nothing was stored in the browser
 *    and that stopped being true the moment the composer kept a draft.
 */
export type ComposerCopy = {
  readonly entryLabel: string;
  readonly placeholder: string;
  readonly send: string;
  readonly sending: string;
  readonly attach: string;
  readonly sendFile: string;
  readonly removeFile: string;
  readonly rejectedType: string;
  readonly rejectedSize: string;
  readonly dropUnavailable: string;
  readonly draftKept: string;
  readonly discard: string;
  readonly offline: string;
  readonly noClassification: string;
};

export const composerCopy: Record<Locale, ComposerCopy> = {
  "pt-BR": {
    entryLabel: "Nova entrada",
    placeholder: "Registre uma tarefa, decisão, conversa ou ideia…",
    send: "Registrar",
    sending: "Salvando…",
    attach: "Anexar arquivo",
    sendFile: "Enviar arquivo",
    removeFile: "Remover anexo",
    rejectedType: "Este tipo de arquivo não é aceito. Envie imagem, PDF, texto, CSV, DOCX ou XLSX.",
    rejectedSize: "O arquivo passa do limite de 25 MB.",
    dropUnavailable: "Este navegador não aceita arrastar arquivos. Use o botão de anexo.",
    draftKept:
      "Guardado como rascunho nesta aba. Continua aqui se você navegar e voltar, e some quando você fechar a aba.",
    discard: "Descartar",
    offline:
      "Você está offline. O texto continua nesta aba como rascunho, mas nada é enviado nem fica na fila — quando voltar a conexão, envie você mesmo.",
    noClassification: "Não precisa classificar nada antes. Escreva e confirme.",
  },
  en: {
    entryLabel: "New entry",
    placeholder: "Capture a task, decision, conversation, or idea…",
    send: "Capture",
    sending: "Saving…",
    attach: "Attach a file",
    sendFile: "Upload file",
    removeFile: "Remove attachment",
    rejectedType: "That file type is not accepted. Send an image, PDF, text, CSV, DOCX, or XLSX.",
    rejectedSize: "That file is over the 25 MB limit.",
    dropUnavailable: "This browser cannot take dropped files. Use the attach button.",
    draftKept:
      "Kept as a draft in this tab. It stays if you navigate away and come back, and goes when you close the tab.",
    discard: "Discard",
    offline:
      "You are offline. The text stays in this tab as a draft, but nothing is sent and nothing is queued — send it yourself when the connection is back.",
    noClassification: "Nothing needs classifying first. Write it and confirm.",
  },
};

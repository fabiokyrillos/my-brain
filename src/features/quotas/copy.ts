/**
 * What a person reads when a ceiling refuses them — SH-COPY-004, SH-QUOTA-010.
 *
 * ## The number in the sentence is the number in the database
 *
 * SH-QUOTA-010's second half is that no page may state a ceiling the database
 * does not enforce. The only way to make that impossible is to give the
 * sentence and the trigger one source, so every number below is interpolated
 * from `QUOTAS` — the same constants `quotas-parity.test.ts` compares against
 * the PRD sheet *and* against the migration's seed. A copy edit cannot invent a
 * limit, and a ceiling change cannot leave a stale promise behind.
 *
 * ## Why these are separate from the lifecycle and throttle texts
 *
 * SH-SUSPEND-009 keeps three refusal vocabularies apart in the database;
 * SH-COPY-004 keeps them apart on the screen. "Your account is suspended",
 * "too many attempts" and "you have reached today's limit" are three different
 * facts, and a shared "something went wrong" would erase all three.
 *
 * Nothing here names a table, a function, an error code or the content that was
 * refused.
 */

import { QUOTAS } from "@/lib/quotas";
import type { Locale } from "@/lib/preferences";
import type { QuotaDetail } from "./refusal";

export type QuotaRefusalCopy = {
  readonly title: string;
  readonly body: string;
};

const MIB = 1024 * 1024;
const storageMib = Math.round(QUOTAS.storageBytesPerUser / MIB);

const ptBR: Record<QuotaDetail, QuotaRefusalCopy> = {
  QUOTA_ENTRIES_PER_DAY: {
    title: "Limite diário de registros atingido",
    body: `Você já registrou ${QUOTAS.entriesPerDay} entradas hoje. O limite volta a zerar à meia-noite (UTC). Nada do que você escreveu agora foi salvo.`,
  },
  QUOTA_LIVE_JOBS: {
    title: "Fila de processamento cheia",
    body: `Há ${QUOTAS.liveJobsPerUser} trabalhos aguardando ou em andamento na sua conta. Assim que alguns terminarem, você poderá enviar mais.`,
  },
  QUOTA_STORAGE_BYTES: {
    title: "Espaço de arquivos esgotado",
    body: `Sua conta guarda até ${storageMib} MiB de arquivos. Remova algo antes de enviar este arquivo — ele não foi armazenado.`,
  },
  QUOTA_STORAGE_OBJECTS: {
    title: "Limite de arquivos atingido",
    body: `Sua conta guarda até ${QUOTAS.storageObjectsPerUser} arquivos. Remova algum antes de enviar outro — este não foi armazenado.`,
  },
  QUOTA_ATTACHMENTS_PER_DAY: {
    title: "Limite diário de arquivos atingido",
    body: `Você já enviou ${QUOTAS.attachmentsPerDay} arquivos hoje. O limite volta a zerar à meia-noite (UTC).`,
  },
  QUOTA_ATTACHMENTS_PER_ENTRY: {
    title: "Limite de anexos deste registro",
    body: `Cada registro aceita até ${QUOTAS.attachmentsPerEntry} anexos.`,
  },
};

const en: Record<QuotaDetail, QuotaRefusalCopy> = {
  QUOTA_ENTRIES_PER_DAY: {
    title: "Daily entry limit reached",
    body: `You have already captured ${QUOTAS.entriesPerDay} entries today. The limit resets at midnight (UTC). Nothing you just wrote was saved.`,
  },
  QUOTA_LIVE_JOBS: {
    title: "Processing queue is full",
    body: `Your account has ${QUOTAS.liveJobsPerUser} jobs queued or running. Once some finish, you can send more.`,
  },
  QUOTA_STORAGE_BYTES: {
    title: "File storage is full",
    body: `Your account holds up to ${storageMib} MiB of files. Remove something before sending this one — it was not stored.`,
  },
  QUOTA_STORAGE_OBJECTS: {
    title: "File count limit reached",
    body: `Your account holds up to ${QUOTAS.storageObjectsPerUser} files. Remove one before sending another — this one was not stored.`,
  },
  QUOTA_ATTACHMENTS_PER_DAY: {
    title: "Daily file limit reached",
    body: `You have already sent ${QUOTAS.attachmentsPerDay} files today. The limit resets at midnight (UTC).`,
  },
  QUOTA_ATTACHMENTS_PER_ENTRY: {
    title: "Attachment limit for this entry",
    body: `Each entry accepts up to ${QUOTAS.attachmentsPerEntry} attachments.`,
  },
};

export function getQuotaRefusalCopy(locale: Locale, detail: QuotaDetail): QuotaRefusalCopy {
  return (locale === "pt-BR" ? ptBR : en)[detail];
}

/** The one-line form the inline action states use. */
export function quotaRefusalMessage(locale: Locale, detail: QuotaDetail): string {
  const copy = getQuotaRefusalCopy(locale, detail);
  return `${copy.title}. ${copy.body}`;
}

import type { Locale } from "@/lib/preferences";

export type TimeZoneOption = {
  value: string;
  label: string;
};

const options: Record<Locale, TimeZoneOption[]> = {
  "pt-BR": [
    { value: "America/Sao_Paulo", label: "Horário de Brasília · São Paulo e Rio (UTC−03:00)" },
    { value: "America/Cayenne", label: "Guiana Francesa · Caiena (UTC−03:00)" },
    { value: "America/Manaus", label: "Amazonas · Manaus (UTC−04:00)" },
    { value: "America/Cuiaba", label: "Mato Grosso · Cuiabá (UTC−04:00)" },
    { value: "America/Rio_Branco", label: "Acre · Rio Branco (UTC−05:00)" },
    { value: "America/Noronha", label: "Fernando de Noronha (UTC−02:00)" },
    { value: "America/New_York", label: "Leste dos Estados Unidos · Nova York" },
    { value: "America/Chicago", label: "Centro dos Estados Unidos · Chicago" },
    { value: "America/Denver", label: "Montanhas dos Estados Unidos · Denver" },
    { value: "America/Los_Angeles", label: "Oeste dos Estados Unidos · Los Angeles" },
    { value: "Europe/Lisbon", label: "Portugal · Lisboa" },
    { value: "Europe/London", label: "Reino Unido · Londres" },
    { value: "Europe/Paris", label: "Europa Central · Paris" },
    { value: "UTC", label: "Tempo Universal (UTC)" },
  ],
  en: [
    { value: "America/Sao_Paulo", label: "Brasília time · São Paulo and Rio (UTC−03:00)" },
    { value: "America/Cayenne", label: "French Guiana · Cayenne (UTC−03:00)" },
    { value: "America/Manaus", label: "Amazon · Manaus (UTC−04:00)" },
    { value: "America/Cuiaba", label: "Mato Grosso · Cuiabá (UTC−04:00)" },
    { value: "America/Rio_Branco", label: "Acre · Rio Branco (UTC−05:00)" },
    { value: "America/Noronha", label: "Fernando de Noronha (UTC−02:00)" },
    { value: "America/New_York", label: "US Eastern · New York" },
    { value: "America/Chicago", label: "US Central · Chicago" },
    { value: "America/Denver", label: "US Mountain · Denver" },
    { value: "America/Los_Angeles", label: "US Pacific · Los Angeles" },
    { value: "Europe/Lisbon", label: "Portugal · Lisbon" },
    { value: "Europe/London", label: "United Kingdom · London" },
    { value: "Europe/Paris", label: "Central Europe · Paris" },
    { value: "UTC", label: "Coordinated Universal Time (UTC)" },
  ],
};

function humanizeTimeZone(value: string) {
  const parts = value.split("/");
  return parts.at(-1)?.replaceAll("_", " ") ?? value;
}

export function getTimeZoneOptions(locale: Locale, current: string): TimeZoneOption[] {
  const localized = options[locale];
  if (localized.some((option) => option.value === current)) return localized;

  return [
    { value: current, label: `${humanizeTimeZone(current)} · ${locale === "pt-BR" ? "fuso atual" : "current time zone"}` },
    ...localized,
  ];
}

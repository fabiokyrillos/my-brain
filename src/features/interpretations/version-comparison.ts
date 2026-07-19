export type InterpretationSnapshot = {
  version: number;
  summary: string;
  concepts: string[];
  occurredAt: string;
  extractedDates: Array<{ value: string; label?: string | null }>;
  entityLinks: Array<{ entityType: string; entityId: string; name: string }>;
  classifications: Record<string, string>;
};

export type InterpretationChange = {
  field: "summary" | "concepts" | "occurredAt" | "extractedDates" | "entityLinks" | "classifications";
  before: unknown;
  after: unknown;
};

function stable(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stable).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stable(item)]),
    );
  }
  return value;
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export function compareInterpretationVersions(previous: InterpretationSnapshot, current: InterpretationSnapshot) {
  const fields: InterpretationChange["field"][] = [
    "summary",
    "concepts",
    "occurredAt",
    "extractedDates",
    "entityLinks",
    "classifications",
  ];
  return fields.flatMap((field) => equal(previous[field], current[field])
    ? []
    : [{ field, before: previous[field], after: current[field] }]);
}

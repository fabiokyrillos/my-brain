type ServiceError = {
  code?: string;
};

export function requireServiceData<T>(
  result: { data: T; error: ServiceError | null },
  operation: string,
) {
  requireServiceSuccess(result, operation);
  return result.data;
}

export function requireServiceSuccess(
  result: { error: ServiceError | null },
  operation: string,
) {
  if (result.error) {
    throw new Error(`${operation} failed (${result.error.code ?? "unknown"})`);
  }
}

type SupabaseFailure = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};

export class SupabaseQueryError extends Error {
  override readonly cause: SupabaseFailure;

  constructor(operation: string, cause: SupabaseFailure) {
    super(`${operation} failed`);
    this.name = "SupabaseQueryError";
    this.cause = cause;
  }
}

export function requireSupabaseData<T>(
  result: { data: T; error: SupabaseFailure | null },
  operation: string,
) {
  if (result.error) throw new SupabaseQueryError(operation, result.error);
  return result.data;
}

export function requireSupabaseSuccess(
  result: { error: SupabaseFailure | null },
  operation: string,
) {
  if (result.error) throw new SupabaseQueryError(operation, result.error);
}

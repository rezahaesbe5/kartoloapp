// Type FE untuk envelope response 5-field dari backend.
// Sesuai PRD_KARTOLOAPPS.md Section 10.2.

export interface EnvelopeError {
  code: string;
  details?: Record<string, unknown>;
}

export interface ApiEnvelope<TData = Record<string, unknown>> {
  rc: string;
  status: number;
  message: string;
  error: EnvelopeError | null;
  data: TData & { trace_id: string };
}

export function isSuccess<T>(env: ApiEnvelope<T>): boolean {
  return env.rc === '00';
}

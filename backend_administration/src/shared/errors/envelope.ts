import { RESPONSE_CODES, type ErrorType } from './response-codes.js';

export interface EnvelopeError {
  code: string;
  details?: Record<string, unknown>;
}

export interface Envelope<TData extends Record<string, unknown> = Record<string, unknown>> {
  rc: string;
  status: number;
  message: string;
  error: EnvelopeError | null;
  data: TData & { trace_id: string };
}

export interface BuildEnvelopeOptions {
  type: ErrorType;
  traceId: string;
  message?: string;
  data?: Record<string, unknown>;
  error?: EnvelopeError | null;
}

export function buildEnvelope(opts: BuildEnvelopeOptions): Envelope {
  const meta = RESPONSE_CODES[opts.type];
  return {
    rc: meta.rc,
    status: meta.status,
    message: opts.message ?? meta.defaultMessage,
    error: opts.error ?? null,
    data: { ...(opts.data ?? {}), trace_id: opts.traceId },
  };
}

export function successEnvelope<TData extends object>(
  traceId: string,
  data: TData,
  message?: string,
): Envelope<TData & Record<string, unknown>> {
  return buildEnvelope({
    type: 'approved',
    traceId,
    data: data as unknown as Record<string, unknown>,
    message,
  }) as Envelope<TData & Record<string, unknown>>;
}

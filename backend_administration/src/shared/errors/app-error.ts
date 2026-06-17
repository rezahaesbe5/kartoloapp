import type { ErrorType } from './response-codes.js';

export interface AppErrorOptions {
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly code?: string;
  public readonly details?: Record<string, unknown>;

  constructor(type: ErrorType, opts: AppErrorOptions = {}) {
    super(opts.message ?? type);
    this.name = 'AppError';
    this.type = type;
    this.code = opts.code;
    this.details = opts.details;
    if (opts.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

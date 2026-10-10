export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BAND_BLOCKED'
  | 'BAND_LOST'
  | 'BAND_EXPIRED'
  | 'BAND_INACTIVE'
  | 'UNKNOWN_BAND'
  | 'ACCESS_DENIED'
  | 'DUPLICATE_SCAN'
  | 'INVALID_STATE'
  | 'INVALID'
  | 'IDEMPOTENCY_REPLAY'
  | 'INSUFFICIENT_BALANCE'
  | 'WALLET_FROZEN'
  | 'DB_UNREACHABLE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  status: number;
  code: ErrorCode;
  details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (msg = 'Not found') => new ApiError(404, 'NOT_FOUND', msg);
export const forbidden = (msg = 'Forbidden') => new ApiError(403, 'FORBIDDEN', msg);
export const unauthorized = (msg = 'Unauthorized') => new ApiError(401, 'UNAUTHORIZED', msg);
export const conflict = (msg = 'Conflict', code: ErrorCode = 'CONFLICT') =>
  new ApiError(409, code, msg);

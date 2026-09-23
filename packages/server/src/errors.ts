// SPDX-License-Identifier: Apache-2.0

/**
 * Stable machine-readable codes for API and configuration errors. The HTTP
 * layer maps each to a status; `code` strings are part of the API contract.
 */
export type AppErrorCode =
  | 'CONFIG_MISSING'
  | 'CONFIG_INVALID'
  | 'UNAUTHORIZED'
  | 'VALIDATION_FAILED'
  | 'BAD_IDENTIFIER'
  | 'MODEL_NOT_FOUND'
  | 'PASSPORT_NOT_FOUND'
  | 'VERSION_NOT_FOUND'
  | 'DUPLICATE_GTIN'
  | 'DUPLICATE_SERIAL'
  | 'BATCH_TOO_LARGE'
  | 'MIGRATION_FAILED';

/**
 * Error carrying a stable `code` and the HTTP status the API responds with.
 * `message` is human-readable detail and not part of the contract.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;

  constructor(code: AppErrorCode, statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

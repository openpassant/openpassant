// SPDX-License-Identifier: Apache-2.0
import { AppError } from './errors.js';

const GTIN_RE = /^[0-9]{8,14}$/;
// Conservative subset of the GS1 AI 21 character set, safe in URLs.
const SERIAL_RE = /^[A-Za-z0-9._-]{1,32}$/;

/** Validates a GTIN (numeric, 8 to 14 digits). @throws AppError `BAD_IDENTIFIER` */
export function validateGtin(gtin: string): string {
  if (!GTIN_RE.test(gtin)) {
    throw new AppError('BAD_IDENTIFIER', 400, 'gtin must be 8 to 14 digits');
  }
  return gtin;
}

/** Validates a serial number for use in the identifier URL. @throws AppError `BAD_IDENTIFIER` */
export function validateSerial(serial: string): string {
  if (!SERIAL_RE.test(serial)) {
    throw new AppError(
      'BAD_IDENTIFIER',
      400,
      'serial must be 1-32 characters from A-Z, a-z, 0-9, ".", "_" or "-"',
    );
  }
  return serial;
}

/**
 * Builds the passport identifier as a GS1 Digital Link URL:
 * `${BASE_URL}/01/<gtin>/21/<serial>` (HLD §4). The same URL is the QR
 * payload, the API primary key and the public page address.
 */
export function buildIdentifier(baseUrl: string, gtin: string, serial: string): string {
  return `${baseUrl}/01/${validateGtin(gtin)}/21/${validateSerial(serial)}`;
}

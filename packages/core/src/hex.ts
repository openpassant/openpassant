// SPDX-License-Identifier: Apache-2.0
import { CoreError } from './errors.js';

const HEX_CHARS = '0123456789abcdef';
const LOWER_HEX_RE = /^[0-9a-f]*$/;

/**
 * Encodes bytes as lowercase hexadecimal without a 0x prefix, the only hex
 * form used in Passant JSON (crypto spec section 1).
 */
export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += HEX_CHARS[byte >> 4]! + HEX_CHARS[byte & 0x0f]!;
  }
  return out;
}

/**
 * Decodes a lowercase hexadecimal string into bytes.
 *
 * Fails closed: rejects odd-length strings, characters outside `[0-9a-f]`
 * (which includes uppercase hex) and 0x-prefixed strings.
 *
 * @throws CoreError `BAD_HEX`
 */
export function fromHex(hex: string): Uint8Array {
  if (typeof hex !== 'string' || hex.length % 2 !== 0 || !LOWER_HEX_RE.test(hex)) {
    throw new CoreError('BAD_HEX', 'expected even-length lowercase hex without 0x prefix');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

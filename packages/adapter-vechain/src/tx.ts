// SPDX-License-Identifier: Apache-2.0

/** Random 8-byte transaction nonce as 0x-prefixed hex (Thor's maximum width). */
export function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return '0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

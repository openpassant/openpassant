// SPDX-License-Identifier: Apache-2.0

/**
 * Generates a fresh 16-byte salt from the platform CSPRNG
 * (crypto spec section 1). One fresh salt per section per version;
 * salts must never be reused or derived from passport content.
 */
export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  return salt;
}

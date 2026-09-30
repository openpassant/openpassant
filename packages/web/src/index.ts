// SPDX-License-Identifier: Apache-2.0

/**
 * `@openpassant/web` — the in-browser passport verifier. Runs all seven
 * steps of crypto spec section 6 in the visitor's browser: bundle
 * validation and root recomputation via `core`, then the Anchored event
 * read from a public node over plain fetch. No VeChain package is
 * imported anywhere in this package (hard rule: only `adapter-vechain`
 * may), and the page never has to trust the server that served it.
 */

export { verifyPassport } from './verify.js';
export type { FetchLike, VerificationResult } from './verify.js';
export { init, renderResult } from './main.js';

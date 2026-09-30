// SPDX-License-Identifier: Apache-2.0

/**
 * `@openpassant/adapter-vechain` — anchors 32-byte Merkle roots on
 * VeChainThor (testnet) behind the server's AnchorAdapter contract,
 * matched structurally: nothing here imports `server`, and nothing
 * outside this package imports a VeChain package.
 */

export { VeChainAnchorAdapter } from './adapter.js';
export type {
  AnchorReceipt,
  AnchorStatus,
  AnchoredEvent,
  VeChainAnchorAdapterOptions,
} from './adapter.js';
export { deployRegistry, getGenesisId, registryBytecode } from './deploy.js';
export type { DeployResult } from './deploy.js';
export { AdapterError } from './errors.js';
export type { AdapterErrorCode } from './errors.js';
export {
  ANCHOR_SELECTOR,
  ANCHORED_EVENT_SIGNATURE,
  MAINNET_GENESIS_ID,
  TESTNET_GENESIS_ID,
} from './registry.js';

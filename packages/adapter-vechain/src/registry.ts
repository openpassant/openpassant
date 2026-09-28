// SPDX-License-Identifier: Apache-2.0
import { Hex, Keccak256, Txt } from '@vechain/sdk-core';

/**
 * Genesis block ids identifying VeChainThor networks. The adapter compares
 * the connected node's genesis id against the expected one so that a wrong
 * `VECHAIN_NODE_URL` fails closed instead of being obeyed (hard rule 4).
 */
export const TESTNET_GENESIS_ID =
  '0x000000000b2bce3c70bc649a02749e8687721b09ed2e15997f466536b20bb127';

/** Mainnet genesis id, listed only so a mainnet node is recognisably refused. */
export const MAINNET_GENESIS_ID =
  '0x00000000851caf3cfdb6e899cf5958bfb1ac3413d346d43539627e6be7ec1b4a';

/** 4-byte selector of `anchor(bytes32)`. */
export const ANCHOR_SELECTOR = Hex.of(
  Keccak256.of(Txt.of('anchor(bytes32)').bytes).bytes.slice(0, 4),
).toString();

/** topics[0] of the `Anchored(bytes32,address,uint256)` event. */
export const ANCHORED_EVENT_SIGNATURE = Keccak256.of(
  Txt.of('Anchored(bytes32,address,uint256)').bytes,
).toString();

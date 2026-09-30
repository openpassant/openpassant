// SPDX-License-Identifier: Apache-2.0
// Deploys PassantRegistry to the VeChain TESTNET, signed and paid by the
// sponsor key. Run from the package directory with the repo .env:
//   pnpm --filter @openpassant/adapter-vechain deploy:testnet
// Requires: VECHAIN_NODE_URL, VECHAIN_NETWORK=testnet, SPONSOR_PRIVATE_KEY.
import { HexUInt } from '@vechain/sdk-core';
import { deployRegistry } from '../dist/deploy.js';
import { TESTNET_GENESIS_ID } from '../dist/registry.js';

const { VECHAIN_NODE_URL, VECHAIN_NETWORK, SPONSOR_PRIVATE_KEY } = process.env;
if (VECHAIN_NETWORK !== 'testnet') {
  console.error('refusing: VECHAIN_NETWORK must be "testnet" (hard rule 4)');
  process.exit(1);
}
if (!VECHAIN_NODE_URL || !SPONSOR_PRIVATE_KEY) {
  console.error('refusing: VECHAIN_NODE_URL and SPONSOR_PRIVATE_KEY must be set');
  process.exit(1);
}

const result = await deployRegistry(
  VECHAIN_NODE_URL,
  TESTNET_GENESIS_ID,
  HexUInt.of(SPONSOR_PRIVATE_KEY).bytes,
);
console.log('PassantRegistry deployed on testnet');
console.log('  contract:', result.contractAddress);
console.log('  txId    :', result.txId);
console.log('  explorer: https://explore-testnet.vechain.org/transactions/' + result.txId);
console.log('Add to .env:  VECHAIN_CONTRACT_ADDRESS=' + result.contractAddress);

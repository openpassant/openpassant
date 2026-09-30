// SPDX-License-Identifier: Apache-2.0
import { HDKey } from '@vechain/sdk-core';
import { ThorClient } from '@vechain/sdk-network';
import { deployRegistry } from '../src/deploy.js';

/** Local thor-solo node (started via docker; see the package README). */
export const SOLO_URL = process.env['THOR_SOLO_URL'] ?? 'http://localhost:8669';

// thor-solo's built-in developer accounts derive from this PUBLIC mnemonic
// (documented in the thor repository). These are local-chain fixtures, not
// secrets, and hold no value anywhere real.
const SOLO_MNEMONIC =
  'denial kitchen pet squirrel other broom bar gas better priority spoil cross'.split(' ');
const soloRoot = HDKey.fromMnemonic(SOLO_MNEMONIC, HDKey.VET_DERIVATION_PATH);

/** Solo dev account 0: funded; used as sponsor and deployer in tests. */
export const SPONSOR_KEY = soloRoot.deriveChild(0).privateKey!;
/** Solo dev account 1: used as the operator in tests. */
export const OPERATOR_KEY = soloRoot.deriveChild(1).privateKey!;

const keyHex = (key: Uint8Array): string => '0x' + Buffer.from(key).toString('hex');
export const SPONSOR_KEY_HEX = keyHex(SPONSOR_KEY);
export const OPERATOR_KEY_HEX = keyHex(OPERATOR_KEY);

/** The solo chain's genesis id, fetched once; fails fast if solo is down. */
export async function soloGenesisId(): Promise<string> {
  try {
    const genesis = await ThorClient.at(SOLO_URL).blocks.getGenesisBlock();
    if (genesis === null) {
      throw new Error('no genesis block');
    }
    return genesis.id;
  } catch (error) {
    throw new Error(
      `thor-solo is not reachable at ${SOLO_URL} - start it with:\n` +
        "docker run -d -p 127.0.0.1:8669:8669 vechain/thor:v2.5.0 solo --on-demand --api-addr 0.0.0.0:8669 --api-cors '*'\n" +
        `(${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

/** Deploys a fresh registry on solo, paid by dev account 0. */
export async function deployFreshRegistry(): Promise<string> {
  const genesis = await soloGenesisId();
  const result = await deployRegistry(SOLO_URL, genesis, SPONSOR_KEY);
  return result.contractAddress;
}

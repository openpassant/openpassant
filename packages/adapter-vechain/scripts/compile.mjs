// SPDX-License-Identifier: Apache-2.0
// Compiles contracts/PassantRegistry.sol into artifacts/PassantRegistry.json.
// Runs as part of the package build; artifacts/ is generated, not committed.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = readFileSync(`${root}contracts/PassantRegistry.sol`, 'utf8');

const input = {
  language: 'Solidity',
  sources: { 'PassantRegistry.sol': { content: source } },
  settings: {
    // VeChainThor's EVM is Shanghai-aligned post-Galactica.
    evmVersion: 'shanghai',
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((e) => e.severity === 'error');
if (errors.length > 0) {
  console.error(JSON.stringify(errors, null, 2));
  process.exit(1);
}
const contract = output.contracts['PassantRegistry.sol'].PassantRegistry;
mkdirSync(`${root}artifacts`, { recursive: true });
writeFileSync(
  `${root}artifacts/PassantRegistry.json`,
  JSON.stringify(
    {
      contractName: 'PassantRegistry',
      solcVersion: solc.version(),
      evmVersion: 'shanghai',
      abi: contract.abi,
      bytecode: '0x' + contract.evm.bytecode.object,
    },
    null,
    2,
  ) + '\n',
);
console.log(`compiled PassantRegistry (${contract.evm.bytecode.object.length / 2} bytes)`);

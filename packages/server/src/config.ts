// SPDX-License-Identifier: Apache-2.0
import { AppError } from './errors.js';

/** VeChain anchoring configuration (M3/M5). Present only when configured. */
export interface VeChainConfig {
  /** Thor node URL the server talks to; identity verified by genesis id. */
  nodeUrl: string;
  /**
   * Node URL embedded in public pages for the in-browser verifier —
   * distinct because inside Docker the server-side hostname (e.g.
   * `http://thor-solo:8669`) is not reachable from a browser.
   */
  publicNodeUrl: string;
  /** `testnet`, or `solo` for a local development chain. Never mainnet. */
  network: 'testnet' | 'solo';
  /** Deployed PassantRegistry address; null only on solo (auto-deployed). */
  contractAddress: string | null;
  /** Operator key, 0x-prefixed 32-byte hex. Never logged. */
  operatorPrivateKey: string;
  /** Sponsor (VIP-191 gas payer) key, 0x-prefixed 32-byte hex. Never logged. */
  sponsorPrivateKey: string;
}

/** Server configuration, sourced exclusively from environment variables. */
export interface Config {
  /** Origin the passport identifiers live under, no trailing slash. */
  baseUrl: string;
  /** PostgreSQL connection string. */
  databaseUrl: string;
  /** Bearer key protecting the issuing API. */
  issuerApiKey: string;
  /** Anchor batch window in milliseconds (used by M3's scheduler). */
  anchorBatchWindowMs: number;
  /** Maximum leaves per anchor batch. */
  anchorBatchMax: number;
  /** Anchoring, when the VECHAIN_* variables are set; otherwise absent. */
  vechain?: VeChainConfig;
}

function requireVar(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new AppError('CONFIG_MISSING', 500, `missing required environment variable ${name}`);
  }
  return value;
}

function intVar(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new AppError('CONFIG_INVALID', 500, `${name} must be a positive integer`);
  }
  return value;
}

/**
 * Loads and validates configuration, failing closed with a list-style
 * message on the first missing or invalid variable. See `.env.example`.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const baseUrl = requireVar(env, 'BASE_URL').replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+$/.test(baseUrl)) {
    throw new AppError(
      'CONFIG_INVALID',
      500,
      'BASE_URL must be an origin like https://id.example.com with no path',
    );
  }
  return {
    baseUrl,
    databaseUrl: requireVar(env, 'DATABASE_URL'),
    issuerApiKey: requireVar(env, 'ISSUER_API_KEY'),
    anchorBatchWindowMs: intVar(env, 'ANCHOR_BATCH_WINDOW_MS', 600000),
    anchorBatchMax: intVar(env, 'ANCHOR_BATCH_MAX', 1000),
    ...loadVeChain(env),
  };
}

const VECHAIN_VARS = [
  'VECHAIN_NODE_URL',
  'VECHAIN_NETWORK',
  'OPERATOR_PRIVATE_KEY',
  'SPONSOR_PRIVATE_KEY',
] as const;
const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;
const CONTRACT_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Loads the optional VeChain block: absent when no VECHAIN_* variable is
 * set; all-or-nothing otherwise. The network is `testnet`, or `solo` for a
 * local development chain — anything else, mainnet above all, fails closed
 * (hard rule 4). On testnet the contract address is required; on solo it
 * may be omitted and the server deploys a fresh registry at startup.
 * Error messages never echo the values.
 */
function loadVeChain(env: Record<string, string | undefined>): Pick<Config, 'vechain'> {
  const anySet =
    VECHAIN_VARS.some((name) => env[name] !== undefined && env[name] !== '') ||
    (env['VECHAIN_CONTRACT_ADDRESS'] ?? '') !== '';
  if (!anySet) {
    return {};
  }
  for (const name of VECHAIN_VARS) {
    requireVar(env, name);
  }
  const network = env['VECHAIN_NETWORK'];
  if (network !== 'testnet' && network !== 'solo') {
    throw new AppError(
      'CONFIG_INVALID',
      500,
      'VECHAIN_NETWORK must be "testnet" or "solo" (a local development chain); mainnet is forbidden (hard rule 4)',
    );
  }
  const nodeUrl = env['VECHAIN_NODE_URL']!;
  if (!/^https?:\/\//.test(nodeUrl)) {
    throw new AppError('CONFIG_INVALID', 500, 'VECHAIN_NODE_URL must be an http(s) URL');
  }
  const publicNodeUrl = env['VECHAIN_PUBLIC_NODE_URL'] ?? nodeUrl;
  if (!/^https?:\/\//.test(publicNodeUrl)) {
    throw new AppError('CONFIG_INVALID', 500, 'VECHAIN_PUBLIC_NODE_URL must be an http(s) URL');
  }
  const contract = env['VECHAIN_CONTRACT_ADDRESS'] ?? '';
  if (contract === '' && network !== 'solo') {
    throw new AppError(
      'CONFIG_MISSING',
      500,
      'missing required environment variable VECHAIN_CONTRACT_ADDRESS',
    );
  }
  if (contract !== '' && !CONTRACT_ADDRESS_RE.test(contract)) {
    throw new AppError(
      'CONFIG_INVALID',
      500,
      'VECHAIN_CONTRACT_ADDRESS must be a 0x-prefixed 20-byte address',
    );
  }
  for (const name of ['OPERATOR_PRIVATE_KEY', 'SPONSOR_PRIVATE_KEY'] as const) {
    if (!PRIVATE_KEY_RE.test(env[name]!)) {
      throw new AppError('CONFIG_INVALID', 500, `${name} must be 0x-prefixed 32-byte hex`);
    }
  }
  return {
    vechain: {
      nodeUrl,
      publicNodeUrl,
      network,
      contractAddress: contract === '' ? null : contract,
      operatorPrivateKey: env['OPERATOR_PRIVATE_KEY']!,
      sponsorPrivateKey: env['SPONSOR_PRIVATE_KEY']!,
    },
  };
}

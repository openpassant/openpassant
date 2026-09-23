// SPDX-License-Identifier: Apache-2.0
import { AppError } from './errors.js';

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
  };
}

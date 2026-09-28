// SPDX-License-Identifier: Apache-2.0
import jsQRImport from 'jsqr';
import QRCode from 'qrcode';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTH, createSampleModel, createTestContext } from './helpers.js';
import type { TestContext } from './helpers.js';

let ctx: TestContext;
let modelId: string;
let passportId: string;

beforeAll(async () => {
  ctx = await createTestContext();
  modelId = await createSampleModel(ctx.app);
  const minted = await ctx.app.inject({
    method: 'POST',
    url: '/passports:batch',
    headers: AUTH,
    payload: { modelId, serials: ['QR-1', 'QR-2', 'QR-3'] },
  });
  passportId = (minted.json() as { passports: { id: string }[] }).passports[0]!.id;
});
afterAll(async () => {
  await ctx.teardown();
});

/**
 * Decodes a QR bit matrix with a real decoder (jsQR) by synthesising an
 * RGBA bitmap from it: each module becomes a block of pixels with a
 * quiet-zone margin, exactly what a camera would see.
 */
function decodeMatrix(matrix: { size: number; get(r: number, c: number): number }): string | null {
  const scale = 4;
  const margin = 4 * scale;
  const size = matrix.size * scale + margin * 2;
  const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (matrix.get(row, col) === 0) {
        continue;
      }
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = margin + col * scale + dx;
          const y = margin + row * scale + dy;
          const offset = (y * size + x) * 4;
          rgba[offset] = 0;
          rgba[offset + 1] = 0;
          rgba[offset + 2] = 0;
        }
      }
    }
  }
  // jsqr is CJS with an `export default` type; normalise the interop shape.
  const jsQR = jsQRImport as unknown as (
    data: Uint8ClampedArray,
    width: number,
    height: number,
  ) => { data: string } | null;
  return jsQR(rgba, size, size)?.data ?? null;
}

describe('QR generation (acceptance criterion 5)', () => {
  it('serves the QR as SVG at error correction level Q, decoding to exactly the identifier', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/passports/${encodeURIComponent(passportId)}/qr.svg`,
      headers: AUTH,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');

    // The served SVG is byte-identical to one generated from the identifier
    // with the same options...
    const expected = await QRCode.toString(passportId, {
      type: 'svg',
      errorCorrectionLevel: 'Q',
      margin: 2,
    });
    expect(response.body).toBe(expected);

    // ...and that encoding, decoded by a real QR decoder, is exactly the
    // identifier URL.
    const qr = QRCode.create(passportId, { errorCorrectionLevel: 'Q' });
    const matrix = {
      size: qr.modules.size,
      get: (r: number, c: number) => qr.modules.get(r, c),
    };
    expect(decodeMatrix(matrix)).toBe(passportId);
    expect(qr.errorCorrectionLevel.bit).toBe(3); // Q
  });

  it('produces a printable sheet with one labelled QR per passport', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: `/models/${modelId}/qr-sheet.svg`,
      headers: AUTH,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('image/svg+xml');
    const nested = response.body.match(/<svg x="/g) ?? [];
    expect(nested).toHaveLength(3);
    for (const serial of ['QR-1', 'QR-2', 'QR-3']) {
      expect(response.body).toContain(`>${serial}</text>`);
    }
  });

  it('requires authentication and 404s cleanly', async () => {
    const unauthenticated = await ctx.app.inject({
      method: 'GET',
      url: `/passports/${encodeURIComponent(passportId)}/qr.svg`,
    });
    expect(unauthenticated.statusCode).toBe(401);

    const missing = await ctx.app.inject({
      method: 'GET',
      url: `/passports/${encodeURIComponent(passportId + 'X')}/qr.svg`,
      headers: AUTH,
    });
    expect(missing.statusCode).toBe(404);

    const badModel = await ctx.app.inject({
      method: 'GET',
      url: '/models/not-a-uuid/qr-sheet.svg',
      headers: AUTH,
    });
    expect(badModel.statusCode).toBe(404);
  });
});

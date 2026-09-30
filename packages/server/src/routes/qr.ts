// SPDX-License-Identifier: Apache-2.0
import QRCode from 'qrcode';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { AppError } from '../errors.js';
import { escapeHtml } from '../resolver/render.js';
import { decodeId } from './passports.js';

// Error correction level Q survives engraving and wear (HLD §5); the QR
// payload is the identifier URL and nothing else.
const QR_OPTIONS = { type: 'svg', errorCorrectionLevel: 'Q', margin: 2 } as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** QR generation for printing and engraving (M4 brief, in-scope item 3). */
export function registerQrRoutes(app: FastifyInstance, pool: pg.Pool): void {
  app.get<{ Params: { id: string } }>(
    '/passports/:id/qr.svg',
    {
      schema: {
        description: 'The passport identifier as a QR code (SVG, error correction level Q).',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const id = decodeId(request.params.id);
      const exists = await pool.query('select 1 from passports where id = $1', [id]);
      if (exists.rowCount === 0) {
        throw new AppError('PASSPORT_NOT_FOUND', 404, `no passport with id ${id}`);
      }
      const svg = await QRCode.toString(id, QR_OPTIONS);
      return reply.type('image/svg+xml').send(svg);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/models/:id/qr-sheet.svg',
    {
      schema: {
        description:
          'A printable sheet of QR codes for every passport of a model, with serial labels.',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw new AppError('MODEL_NOT_FOUND', 404, `no model with id ${id}`);
      }
      const passports = await pool.query<{ id: string; serial_number: string }>(
        'select id, serial_number from passports where model_id = $1 order by serial_number',
        [id],
      );
      if (passports.rowCount === 0) {
        throw new AppError('MODEL_NOT_FOUND', 404, `no model with id ${id} or it has no passports`);
      }
      const cols = 4;
      const cell = 180;
      const label = 22;
      const rows = Math.ceil(passports.rows.length / cols);
      const rendered = await Promise.all(
        passports.rows.map(async (passport, index) => {
          const x = (index % cols) * cell;
          const y = Math.floor(index / cols) * (cell + label);
          const svg = await QRCode.toString(passport.id, QR_OPTIONS);
          return (
            svg.replace('<svg ', `<svg x="${x}" y="${y}" width="${cell}" height="${cell}" `) +
            `<text x="${x + cell / 2}" y="${y + cell + 14}" text-anchor="middle" font-family="monospace" font-size="12">${escapeHtml(passport.serial_number)}</text>`
          );
        }),
      );
      const width = cols * cell;
      const height = rows * (cell + label);
      const sheet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${rendered.join('')}</svg>`;
      return reply.type('image/svg+xml').send(sheet);
    },
  );
}

// SPDX-License-Identifier: Apache-2.0
import type { JsonObject } from '../validate.js';
import type { VersionView } from './views.js';

/**
 * PROVISIONAL vocabulary. DIN DKE SPEC 99100's attribute identifiers are
 * not freely published, and inventing authoritative-looking IRIs is worse
 * than owning provisional ones (M4 brief). Every term expands under this
 * base until an official alignment replaces it in a later schema version.
 */
export const PROVISIONAL_VOCAB = 'https://openpassant.org/vocab/battery-passport/0.1#';

/**
 * The machine-readable form of the public section (Art. 77(5): open,
 * interoperable, machine-readable). Same data as the HTML page — rendered
 * from the stored canonical bytes — as JSON-LD with the provisional
 * vocabulary, plus the passport identifier, version and anchor pointer.
 */
export function toJsonLd(view: VersionView): JsonObject {
  const document: JsonObject = {
    '@context': {
      '@vocab': PROVISIONAL_VOCAB,
      passportVersion: `${PROVISIONAL_VOCAB}passportVersion`,
    },
    '@type': 'BatteryPassport',
    '@id': view.passportId,
    passportVersion: view.version,
    vocabularyNote: 'Provisional OpenPassant vocabulary; DIN DKE SPEC 99100 alignment pending.',
    ...view.sections.public.doc.data,
  };
  if (view.anchor !== null && view.anchor.status === 'confirmed') {
    document['anchor'] = {
      chain: view.anchor.chain,
      contract: view.anchor.contract,
      txId: view.anchor.txId,
      merkleRoot: view.anchor.root,
    };
  }
  return document;
}

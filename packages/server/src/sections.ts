// SPDX-License-Identifier: Apache-2.0
import { sectionTags, SECTIONS } from '@openpassant/schema';
import type { Section } from '@openpassant/schema';
import type { JsonObject } from './validate.js';

const TAGS = sectionTags();

/**
 * Splits validated passport content into the four section `data` objects
 * by the schema's x-section tags (crypto spec section 2). Sections with no
 * fields come back as `{}` — they are hashed like any other. Content must
 * already be schema-valid, so every field has a tag.
 */
export function splitIntoSections(content: JsonObject): Record<Section, JsonObject> {
  const out = Object.fromEntries(SECTIONS.map((s) => [s, {}])) as Record<Section, JsonObject>;
  for (const [field, value] of Object.entries(content)) {
    out[TAGS[field]!][field] = value;
  }
  return out;
}

// SPDX-License-Identifier: Apache-2.0
import type { JsonValue } from '@openpassant/core';
import type { VersionView } from './views.js';

/** Escapes text for safe interpolation into HTML. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** "ratedCapacityMah" -> "Rated capacity mah" — readable, never invented. */
function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function renderValue(value: JsonValue): string {
  if (value === null) {
    return '<span class="muted">—</span>';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '<span class="muted">none</span>';
    }
    return `<ul>${value.map((item) => `<li>${renderValue(item)}</li>`).join('')}</ul>`;
  }
  if (typeof value === 'object') {
    const rows = Object.entries(value)
      .map(
        ([key, v]) => `<div><dt>${escapeHtml(humanize(key))}</dt><dd>${renderValue(v)}</dd></div>`,
      )
      .join('');
    return `<dl>${rows}</dl>`;
  }
  return escapeHtml(String(value));
}

const STYLE = `
  :root { color-scheme: light; }
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; color: #1c2431; background: #f8f6f1; }
  main { max-width: 44rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
  h1 { font-size: 1.5rem; margin: 0.5rem 0 0; }
  h2 { font-size: 1.05rem; margin: 2rem 0 0.5rem; border-bottom: 1px solid #d8d2c4; padding-bottom: 0.3rem; }
  .id { word-break: break-all; color: #5a6172; font-size: 0.85rem; }
  dl { margin: 0.25rem 0; }
  dl div { display: grid; grid-template-columns: minmax(10rem, 40%) 1fr; gap: 0.5rem; padding: 0.2rem 0; }
  dt { color: #5a6172; }
  dd { margin: 0; }
  dd dl div { grid-template-columns: minmax(8rem, 35%) 1fr; }
  ul { margin: 0; padding-left: 1.2rem; }
  .muted { color: #9aa0ad; }
  .restricted { background: #efece4; border: 1px dashed #c9c2b2; border-radius: 6px; padding: 0.6rem 0.9rem; color: #5a6172; margin: 0.4rem 0; }
  .anchor { border: 1px solid #d8d2c4; border-radius: 6px; padding: 0.8rem 1rem; margin-top: 0.5rem; background: #fff; }
  .versions a { margin-right: 0.6rem; }
  .versions .current { font-weight: 700; }
  #passant-verify { margin-top: 0.75rem; }
  #passant-verify button { font: inherit; padding: 0.45rem 1rem; border-radius: 6px; border: 1px solid #1c2431; background: #1c2431; color: #f8f6f1; cursor: pointer; }
  .verify-ok { color: #1d6b3a; font-weight: 600; }
  .verify-bad { color: #a2231d; font-weight: 600; }
  .small { font-size: 0.85rem; color: #5a6172; }
`;

/**
 * Renders the public passport page: the public section only, rendered
 * from the stored canonical bytes; restricted sections appear as notices,
 * never as data. Meaningful without JavaScript — the in-browser check is
 * the only JS-dependent feature.
 */
export function renderPassportPage(view: VersionView, verifierNodeUrl: string): string {
  const data = view.sections.public.doc.data;
  const versionLinks = Array.from({ length: view.latestVersion }, (_, i) => i + 1)
    .map((n) =>
      n === view.version
        ? `<span class="current">v${n}</span>`
        : `<a href="?version=${n}">v${n}</a>`,
    )
    .join(' ');

  // The proof endpoint lives under the passport's own path; a relative
  // URL would resolve against the parent segment, so build it absolutely.
  const proofPath = `${new URL(view.passportId).pathname}/proof?version=${view.version}`;
  const anchorHtml =
    view.anchor !== null && view.anchor.status === 'confirmed'
      ? `<p>Anchored on <strong>${escapeHtml(view.anchor.chain ?? '')}</strong> at ${escapeHtml(view.anchor.blockTime ?? '')}.<br>
         <span class="small">Transaction ${escapeHtml(view.anchor.txId ?? '')} · registry ${escapeHtml(view.anchor.contract ?? '')}</span></p>
         <div id="passant-verify"
              data-proof-url="${escapeHtml(proofPath)}"
              data-node-url="${escapeHtml(verifierNodeUrl)}">
           <noscript><p class="small">Enable JavaScript to check this passport against the public ledger from your own browser.</p></noscript>
         </div>
         <script src="/assets/verifier.js" defer></script>`
      : `<p>This version is not anchored on the public ledger yet. Check back shortly.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Battery passport ${escapeHtml(view.serialNumber)} — ${escapeHtml(view.modelName)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <p class="small">EU battery passport</p>
  <h1>${escapeHtml(view.modelName)} — ${escapeHtml(view.serialNumber)}</h1>
  <p class="id">${escapeHtml(view.passportId)}</p>
  <p class="versions small">Version: ${versionLinks}</p>

  <h2>Public information</h2>
  ${renderValue(data as JsonValue)}

  <h2>Restricted information</h2>
  <div class="restricted">Detailed composition, spare parts and dismantling information — available to repairers, recyclers and authorities.</div>
  <div class="restricted">Compliance test reports — available to notified bodies and market surveillance authorities.</div>
  <div class="restricted">Battery history and state of health — available to persons with a legitimate interest.</div>

  <h2>Tamper evidence</h2>
  <div class="anchor">
    ${anchorHtml}
  </div>
  <p class="small">Every version of this passport is fingerprinted; the fingerprint is recorded on a public ledger. This page can be checked against it without trusting the server that served it.</p>
</main>
</body>
</html>
`;
}

// SPDX-License-Identifier: Apache-2.0
import { verifyPassport } from './verify.js';
import type { VerificationResult } from './verify.js';

/** Renders a verification result into the container. Exported for tests. */
export function renderResult(container: HTMLElement, result: VerificationResult): void {
  const paragraph = document.createElement('p');
  if (result.status === 'verified') {
    paragraph.className = 'verify-ok';
    paragraph.textContent = `✓ Verified against the public ledger — unchanged since ${new Date(result.blockTime * 1000).toUTCString()}.`;
    const detail = document.createElement('p');
    detail.className = 'small';
    detail.textContent =
      `Anchored by ${result.sender}. Checked from disclosed data: ${result.checkedSections.join(', ')}. ` +
      `Taken on trust (hash only): ${result.trustedSections.join(', ')}.`;
    container.replaceChildren(paragraph, detail);
    return;
  }
  if (result.status === 'not_anchored') {
    paragraph.className = 'small';
    paragraph.textContent = 'This version is not anchored on the public ledger yet.';
    container.replaceChildren(paragraph);
    return;
  }
  paragraph.className = 'verify-bad';
  paragraph.textContent = `✕ Verification failed: ${result.reason}`;
  container.replaceChildren(paragraph);
}

/** Wires the verify button into the page's #passant-verify container. */
export function init(doc: Document): void {
  const container = doc.getElementById('passant-verify');
  if (container === null) {
    return;
  }
  const proofUrl = container.dataset['proofUrl'];
  const nodeUrl = container.dataset['nodeUrl'];
  if (proofUrl === undefined || nodeUrl === undefined) {
    return;
  }
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = 'Check against the public ledger';
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Checking…';
    verifyPassport(proofUrl, nodeUrl)
      .then((result) => renderResult(container, result))
      .catch(() => renderResult(container, { status: 'failed', reason: 'unexpected error' }));
  });
  container.append(button);
}

/* v8 ignore next 3 -- browser entry point, exercised by the e2e test */
if (typeof document !== 'undefined') {
  init(document);
}

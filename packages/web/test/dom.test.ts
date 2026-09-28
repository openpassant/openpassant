// @vitest-environment happy-dom
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { init, renderResult } from '../src/main.js';

function container(): HTMLElement {
  document.body.innerHTML =
    '<div id="passant-verify" data-proof-url="/01/1/21/A/proof?version=1" data-node-url="https://node.example"></div>';
  return document.getElementById('passant-verify')!;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('renderResult', () => {
  it('renders the verified state with checked and trusted sections', () => {
    const target = container();
    renderResult(target, {
      status: 'verified',
      root: '0x' + '11'.repeat(32),
      sender: '0x' + 'ab'.repeat(20),
      blockTime: 1758900000,
      checkedSections: ['public'],
      trustedSections: ['restricted', 'compliance', 'usage'],
    });
    expect(target.querySelector('.verify-ok')?.textContent).toContain('Verified');
    expect(target.textContent).toContain('Checked from disclosed data: public');
    expect(target.textContent).toContain('Taken on trust (hash only): restricted');
  });

  it('renders the not-anchored and failed states', () => {
    const target = container();
    renderResult(target, { status: 'not_anchored' });
    expect(target.textContent).toContain('not anchored');
    renderResult(target, { status: 'failed', reason: 'the roots differ' });
    expect(target.querySelector('.verify-bad')?.textContent).toContain('the roots differ');
  });
});

describe('init', () => {
  it('adds the check button and renders the outcome of a click', async () => {
    const target = container();
    // The 409 path needs no valid bundle machinery.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({}) })),
    );
    init(document);
    const button = target.querySelector('button');
    expect(button?.textContent).toContain('Check against the public ledger');
    button!.click();
    await vi.waitFor(() => {
      expect(target.textContent).toContain('not anchored');
    });
  });

  it('does nothing without the container or its data attributes', () => {
    document.body.innerHTML = '<div id="other"></div>';
    init(document);
    expect(document.querySelector('button')).toBeNull();
    document.body.innerHTML = '<div id="passant-verify"></div>';
    init(document);
    expect(document.querySelector('button')).toBeNull();
  });
});

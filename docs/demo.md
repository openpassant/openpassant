# Demo walkthrough

The exact click-path for a live demo or the demo video. Total runtime ~5 minutes once the
stack is up. Works identically on the offline solo profile and on the testnet; the
testnet version has the better punchline (a real public explorer).

## Setup (before the audience arrives)

1. Stack up and seeded: `docker compose up -d` (with your testnet `.env`, or the solo
   override) and `pnpm demo` completed — it prints the passport URLs and the anchor
   transaction, and saves `demo-out/qr-sheet.svg`.
2. Print `demo-out/qr-sheet.svg` (or keep it open on a second screen to scan).
3. Open, in tabs: a passport page (e.g. `/01/09506000134369/21/DEMO-0001`), and — testnet
   only — the explorer link the demo printed.

## The demo

1. **The problem** (30s). "From February 2027, every e-bike battery sold in the EU needs
   a digital passport. The regulation demands tamper evidence: how do you trust a record
   the manufacturer hosts themselves?"
2. **Scan** (30s). Scan a QR from the sheet with a phone (or open the tab). Walk the
   page: public data, the restricted-section notices, the version selector — "the page
   works without JavaScript; nothing here trusts a wallet or knows what a blockchain is."
3. **Verify** (1m). Press **Check against the public ledger**. Green. "Your browser just
   recomputed the cryptographic fingerprint of this exact page content and compared it
   with the fingerprint anchored on a public chain — it did not take the server's word
   for any of it. It also tells you which parts it checked and which it took on trust."
4. **The chain** (30s, testnet). Show the explorer tab: the `Anchored` event, the root,
   the timestamp, the sponsor-paid fee of ~0.26 VTHO — "ten thousand passports cost about
   ten of these transactions, and the operator never touches tokens."
5. **Tamper** (2m). The reveal. In DevTools → Network, right-click the `proof` request →
   *Override content* (or use a local proxy), change one character of any value — the
   chemistry string, a salt, one hash — reload, press the button again: **red**, with the
   reason. "One character, anywhere, and every browser in the world can see it. That is
   the whole product."
6. **Close** (30s). Append a repair as version 2 (`POST /passports/{id}/versions`), show
   both versions verifying independently: "updates never overwrite — history is
   append-only, each version carries its own proof."

## Recording notes for the video

Same sequence, capture at 1080p, phone scan filmed over the shoulder for step 2; keep the
red-check moment (step 5) as the thumbnail frame.

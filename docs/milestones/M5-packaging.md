# Milestone M5: packaging and demo

## Goal

Make the whole slice reproducible by a stranger: Docker Compose, a quickstart README, a
demo data set and a scripted walkthrough. The HLD "done when": a fresh machine reaches a
working demo in under an hour.

## In scope

1. **Docker Compose** at the repo root: `server` (multi-stage build, non-root, pinned
   base image), `postgres` (pinned major, persistent volume), and an optional `thor-solo`
   profile for fully offline development. One `docker compose up` after copying
   `.env.example` to `.env` and filling the documented variables. Migrations run on
   startup. Testnet remains the default anchor target; the solo profile is explicitly
   labelled as local-only.
2. **`.env.example` finalised**: every variable the stack reads, grouped, each with one
   comment line — which are secrets, which have safe defaults, which the owner must
   provide. Startup fails closed with a clear message listing anything missing.
3. **Demo data set + script**: `pnpm demo` seeds one battery model and a batch of 100
   passports with plausible (clearly fictitious) e-bike battery data, waits for the
   anchor, and prints the identifier URLs plus a QR sheet path. Idempotent to re-run.
4. **Root README rewrite** for the open-source audience: what Passant is (three
   sentences), the quickstart (copy env → compose up → `pnpm demo` → scan/verify), the
   repository map, links to the crypto spec and HLD, licence and contribution note. The
   current handover-pack README moves to `docs/handover.md` unchanged.
5. **Demo walkthrough**: a `docs/demo.md` script of the exact click-path for a live demo
   (mint → explorer → scan → green check → tamper demo showing red), so the owner can
   record the demo video from it. Recording the video itself is the owner's task.
6. A `CONTRIBUTING.md` stub: how to run checks, one-milestone-at-a-time note, DCO/CLA
   left explicitly TBD for the owner.

## Out of scope

CI/CD deployment pipelines, Kubernetes/Helm, TLS termination and reverse-proxy specifics
beyond one documented example, backup automation, monitoring stacks, the hosted service.

## Constraints

- No secrets in images, compose files or the demo data; the demo refuses to run against
  anything but testnet or solo.
- The compose stack must run on plain Docker on Linux and macOS; no host dependencies
  beyond Docker and pnpm for the demo script.
- Images build from the committed lockfile; `docker compose build` is reproducible.

## Runtime dependencies proposed for approval

None. Everything here is packaging and documentation.

## Acceptance criteria

1. `pnpm install && pnpm build && pnpm test && pnpm lint` still exits 0; CI additionally
   builds the Docker image.
2. Timed clean-machine run (fresh VM or container host, empty Docker cache): from
   `git clone` to a scanned-and-verified passport in under one hour following only the
   README, with the actual timing and any friction recorded in the hand-back report.
3. `docker compose up` with the solo profile reaches a green verification with no
   internet access beyond image pulls.
4. `pnpm demo` on a fresh stack seeds, anchors and prints working URLs; re-running it
   does not duplicate data.
5. The README quickstart contains no command that was not executed verbatim during the
   timed run.
6. Compose config passes `docker compose config` validation and container images run as
   non-root, proven in CI.

## Deliverables

Branch `m5-packaging` as a pull request with the hand-back report including the timed-run
log. This closes the MVP slice; the report should also collect the accumulated
out-of-scope ideas from M2–M5 as candidate v0.2 scope.

## If something does not add up

If the one-hour target is unreachable because of external factors (image pull speed,
testnet faucet/funding steps), report the measured time and where it went rather than
trimming the checklist to fit.

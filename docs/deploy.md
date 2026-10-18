# Deploying on a public host

The one documented production example (M5): the compose stack behind Caddy, which
terminates TLS for `BASE_URL` with automatic Let's Encrypt certificates. Any Linux host
with Docker and a public IP works; the steps below name DigitalOcean because that is
where the reference instance runs, and the HLD's EU-region note is satisfied by picking
an EU datacenter (e.g. `ams3`, `fra1`). Replace `id.example.com` with your subdomain.

## 1. Host and DNS

1. Create a droplet: Ubuntu 24.04 (or the Docker marketplace image), **2 GB RAM** (the
   image is built on the host), an EU region, your SSH key. Cloud firewall or `ufw`:
   allow 22, 80 and 443 only.
2. If not using the marketplace image, install Docker Engine with the Compose plugin
   from https://docs.docker.com/engine/install/ubuntu/ (Compose **2.24 or newer** is
   required by `compose.prod.yaml`).
3. At your DNS provider, add an `A` record for `id.example.com` pointing at the
   droplet's IPv4 address. Caddy can only obtain the certificate once the name resolves
   to the host and port 80 is reachable, so do this before the first `up`.

## 2. Configure

On the host:

```sh
git clone --branch v0.1.1 https://github.com/openpassant/openpassant && cd openpassant
```

Copy your `.env` from the machine where you prepared it (`scp .env host:openpassant/`),
or create it from `.env.example`. For production:

- `BASE_URL=https://id.example.com` — the origin on the QR codes; it must be `https`.
- Set `POSTGRES_PASSWORD` to something random. The database is not published outside
  the compose network, but do not run with the default.
- The five `VECHAIN_*`/key variables as for any testnet deployment (see the README).

## 3. Run

```sh
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
docker compose -f compose.yaml -f compose.prod.yaml logs -f caddy   # until "certificate obtained"
```

Check from anywhere:

```sh
curl -sSI https://id.example.com/healthz | head -1        # HTTP/2 200
curl -sS --max-time 5 http://id.example.com:3000/healthz   # must fail: 3000 is not published
```

## 4. Seed and verify

From your laptop, against the public instance:

```sh
SERVER_URL=https://id.example.com ISSUER_API_KEY=... pnpm demo
```

It prints the public identifier URLs, the testnet anchor transaction and saves
`demo-out/qr-sheet.svg`. Print it and scan a code with a phone: the page opens on the
public origin and verifies in the browser (M4 acceptance criterion 7).

## Operating notes

- **Update:** `git fetch --tags && git checkout <tag>`, then the same `up -d --build`.
  Migrations run at server start.
- **Database copy:** `docker compose exec postgres pg_dump -U postgres postgres > backup.sql`.
  Data lives in the `passant-db` volume; certificates in `caddy-data`.
- **Logs:** `docker compose -f compose.yaml -f compose.prod.yaml logs -f server`.
- Compose files are additive: the base file alone publishes port 3000 for local use;
  the solo override swaps the testnet for a throwaway chain; the prod override adds
  Caddy. Do not combine solo and prod on a public host.

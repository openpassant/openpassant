# SPDX-License-Identifier: Apache-2.0
# Passant server image: multi-stage, non-root, built from the lockfile.

FROM node:24.4.1-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm build \
 && pnpm --filter @openpassant/server deploy --prod /srv

FROM node:24.4.1-slim
ENV NODE_ENV=production
WORKDIR /srv
COPY --from=build /srv .
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]

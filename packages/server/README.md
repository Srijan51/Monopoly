# MWT Server

Fastify + Socket.IO authoritative game server for Monopoly World Tour.

## Run

```bash
pnpm install
pnpm --filter @mwt/server dev
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| PORT | 3001 | HTTP + WS port |
| CORS_ORIGIN | http://localhost:5173 | Allowed frontend origin |

## Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm && pnpm install --frozen-lockfile
RUN pnpm --filter @mwt/engine build
CMD ["node", "packages/server/dist/index.js"]
```

## Socket Events

See `src/index.ts` for full event documentation.


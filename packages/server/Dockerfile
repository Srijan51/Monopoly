FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/engine packages/engine
COPY packages/ai packages/ai
COPY packages/server packages/server
COPY data data
COPY tsconfig.json .
RUN npm install -g pnpm && pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @mwt/engine build
RUN pnpm --filter @mwt/server build
EXPOSE 3001
CMD ["pnpm", "--filter", "@mwt/server", "start"]

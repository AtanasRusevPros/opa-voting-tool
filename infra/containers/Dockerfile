FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json dev.sh ./
COPY apps ./apps
COPY packages ./packages
COPY config ./config

RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @planning-poker/web build

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

CMD ["pnpm", "--filter", "@planning-poker/api", "exec", "tsx", "src/server.ts"]

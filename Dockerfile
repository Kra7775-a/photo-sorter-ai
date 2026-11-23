FROM oven/bun:1.4

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY dist ./dist
COPY server ./server

ENV PORT=3001
EXPOSE 3001

CMD ["bun", "server/main.ts"]

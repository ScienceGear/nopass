# NovaBank frontend — dev image (vite dev on :5173)
FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
EXPOSE 5173
ENV API_PROXY_TARGET=http://api:3001
CMD ["bun", "run", "dev", "--host", "0.0.0.0"]

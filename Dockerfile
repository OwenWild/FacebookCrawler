# Must match server/package-lock.json playwright version (browsers live in this image).
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./

ENV NODE_ENV=production

# Discord digest loop (see server/README.md). Override: docker compose run --rm sweeper npm run once
CMD ["npm", "run", "discord"]

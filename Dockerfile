FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=127.0.0.1
ENV PORT=3100

COPY --from=build /app/dist/standalone ./
COPY --from=build /app/public ./public

EXPOSE 3100
CMD ["node", "server.js"]

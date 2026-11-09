FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-slim
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV BODY_SIZE_LIMIT=15M

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/start.js ./start.js

EXPOSE 8080
CMD ["node", "start.js"]

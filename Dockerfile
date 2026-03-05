FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @agentura/worker build
ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/index.js"]

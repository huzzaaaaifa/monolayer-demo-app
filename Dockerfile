# Optional — only needed for "Deploy a Docker image" on the canvas.
# Git-connected deploys use Railpack and do not require this file.

FROM node:20-alpine3.20

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/healthz" > /dev/null || exit 1

CMD ["node", "server.js"]

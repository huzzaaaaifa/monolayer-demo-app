# Build + push this yourself (see README) to deploy monolayer-demo-app via the canvas's
# "Deploy a Docker image" dialog instead of a git repo. The exact same code also deploys
# via a git-connected repo (Railpack, no Dockerfile needed) or an uploaded local folder
# ("Deploy a local folder" / empty-service) — this file only matters for the image path.

FROM node:20-alpine3.20

WORKDIR /app

# Dependencies first so they're cached separately from app code changes.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ./

# Deliberately root, matching what Railpack-built containers do: a freshly-formatted
# EBS volume (or the EC2 host's /mnt/monolayer/volN bind mount) is owned by root, so
# a non-root user can't write to /data and the volume demo card would fail with
# EACCES. A production image should run non-root and manage volume ownership
# (fsGroup/chown at entrypoint) instead — this is a demo shortcut, called out here
# so nobody copies it blindly.

# Documentation only — the platform sets $PORT at runtime and the app listens on it
# regardless (default 3000 if unset), same as the git-connected deploy path.
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/" > /dev/null || exit 1

CMD ["node", "server.js"]

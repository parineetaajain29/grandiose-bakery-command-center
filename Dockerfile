# syntax=docker/dockerfile:1

# Node >=22.13.0 required for unflagged node:sqlite (server/db.ts) — see
# package.json's engines field. bookworm-slim (Debian) chosen over alpine so
# apt/pip work normally for the optimization engine's Python dependency.
FROM node:22-bookworm-slim

# System Python for the optimization engine subprocess
# (server/services/optimization.ts shells out to this via OPTIMIZATION_PYTHON).
# Debian bookworm's pip enforces PEP 668 ("externally-managed-environment");
# --break-system-packages is intentional here — this container exists only to
# run this one app, so there's no other Python environment to protect.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps in their own layer — only invalidated when requirements.txt
# changes. requirements-dev.txt (pytest) is deliberately not installed here;
# it's dev/test-only, never imported by optimization_cli.py at runtime.
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# optimization_engine.py and its thin CLI wrapper must stay siblings of
# bakery-command-center/, exactly like the source repo — server/services/
# optimization.ts resolves REPO_ROOT as three directories up from its own
# file location and expects both the python binary and this script there.
COPY optimization_engine.py optimization_cli.py ./

# Node deps in their own layer — only invalidated when package*.json changes.
COPY bakery-command-center/package.json bakery-command-center/package-lock.json ./bakery-command-center/
WORKDIR /app/bakery-command-center
RUN npm ci

# App source, then build the frontend (tsc -b && vite build -> dist/).
# The server itself is never compiled — it always runs from source via tsx
# (npm start), in production exactly as in dev — so devDependencies (tsx,
# vite, typescript) stay installed in this image rather than pruned; `npm ci
# --omit=dev` would remove tsx and break the running container.
WORKDIR /app
COPY bakery-command-center ./bakery-command-center
WORKDIR /app/bakery-command-center
RUN npm run build

ENV NODE_ENV=production
# Matches the python3 installed above — see the apt-get step. Overridable via
# Render's dashboard if this image is ever rebuilt on a different base.
ENV OPTIMIZATION_PYTHON=/usr/bin/python3

EXPOSE 3001

CMD ["npm", "start"]

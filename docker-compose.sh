#!/usr/bin/env bash
# Wrapper: runs `docker compose` with the correct compose file for this host.
# - macOS (Docker Desktop): docker/docker-compose.apple.yml (no `gpus:` — not supported)
# - Linux / Windows (WSL, etc.): docker/docker-compose.yml (includes `gpus: all` for Ollama)
#
# Usage (from repo root): ./docker-compose.sh up --build
# Override file: DOCKER_COMPOSE_FILE=docker/docker-compose.yml ./docker-compose.sh config
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_DIR="$ROOT/docker"
if [ -n "${DOCKER_COMPOSE_FILE:-}" ]; then
  FILE="$ROOT/$DOCKER_COMPOSE_FILE"
elif [ "$(uname -s)" = "Darwin" ]; then
  FILE="$COMPOSE_DIR/docker-compose.apple.yml"
else
  FILE="$COMPOSE_DIR/docker-compose.yml"
fi
exec docker compose -f "$FILE" --project-directory "$ROOT" "$@"

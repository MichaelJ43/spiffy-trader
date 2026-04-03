#!/usr/bin/env bash
# Wrapper: runs `docker compose` with the correct compose file for this host.
# - macOS (Docker Desktop): docker-compose.apple.yml (no `gpus:` — not supported)
# - Linux / Windows (WSL, etc.): docker-compose.yml (includes `gpus: all` for Ollama)
#
# Usage (from repo root): ./docker-compose.sh up --build
# Override file: DOCKER_COMPOSE_FILE=docker-compose.yml ./docker-compose.sh config
set -euo pipefail

# Repo root: ./script.sh makes dirname "." follow *cwd*—resolve script path, then find Dockerfile.
SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
case "$SCRIPT_PATH" in
  /*) ;;
  *) SCRIPT_PATH="$(pwd)/$SCRIPT_PATH" ;;
esac
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
ROOT="$SCRIPT_DIR"
while [ ! -f "$ROOT/Dockerfile" ] && [ "$ROOT" != "/" ]; do
  ROOT="$(dirname "$ROOT")"
done
if [ ! -f "$ROOT/Dockerfile" ]; then
  for _f in "$SCRIPT_DIR"/*/Dockerfile; do
    if [ -f "$_f" ]; then
      ROOT="$(cd "$(dirname "$_f")" && pwd)"
      break
    fi
  done
fi
if [ ! -f "$ROOT/Dockerfile" ]; then
  echo "docker-compose.sh: could not find Dockerfile (from $SCRIPT_DIR)." >&2
  exit 1
fi
unset _f

if [ -n "${DOCKER_COMPOSE_FILE:-}" ]; then
  FILE="$ROOT/$DOCKER_COMPOSE_FILE"
elif [ "$(uname -s)" = "Darwin" ]; then
  FILE="$ROOT/docker-compose.apple.yml"
else
  FILE="$ROOT/docker-compose.yml"
fi
exec docker compose -f "$FILE" --project-directory "$ROOT" "$@"

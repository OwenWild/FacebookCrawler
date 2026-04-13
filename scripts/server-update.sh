#!/usr/bin/env bash
# Run on the server from the repo clone (e.g. ~/apps/FacebookCrawler).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
git pull --ff-only
docker compose up -d --build
docker compose ps

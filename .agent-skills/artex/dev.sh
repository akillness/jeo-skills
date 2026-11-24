#!/usr/bin/env bash
# Dev mode: run the backend (:8787) + traffic proxy (:8788) together with the frontend next dev (:5173).
# The frontend reverse-proxies /api to the backend; Ctrl-C exits everything.
#
# For the single-binary mode (frontend embedded), see the "Single binary" section of the README; it does not use this script.
set -euo pipefail
cd "$(dirname "$0")"

# On exit, kill all child processes in this process group (backend + frontend).
cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# Backend (plain go run, frontend not embedded); the concurrent work agent count is configured under "System Settings".
# Run this script as your own user: the backend then starts with agent isolation degraded, which it logs in a
# banner and shows in the web UI (agents run as you and can read the keys, config and database credentials).
# Agent isolation needs Linux and a root server; use the Docker image for it. As root, a failed isolation
# self-test stops the start (server/isolation.go).
go run ./cmd/artex -addr :8787 -proxy 127.0.0.1:8788 &

# Frontend hot reload (Vite/Next dev server, /api reverse-proxied to :8787).
( cd web && npm run dev ) &

echo "[dev] backend :8787 / proxy :8788 / frontend http://localhost:5173  (Ctrl-C to exit)"
wait

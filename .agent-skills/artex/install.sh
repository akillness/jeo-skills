#!/usr/bin/env bash
# ARTEX install script: 1) all-Docker  2) local build & run
set -euo pipefail
cd "$(cd "$(dirname "$0")" && pwd)"

info(){ printf '\033[36m[*]\033[0m %s\n' "$*"; }
ok(){   printf '\033[32m[+]\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m[!]\033[0m %s\n' "$*"; }
die(){  printf '\033[31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
ask(){  local p="$1" d="${2:-}" a; read -rp "$p${d:+ [$d]}: " a; echo "${a:-$d}"; }
rand(){ head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24; }
# json_str prints $1 as a JSON string literal: backslash, double quote and the
# control characters read -r can return are escaped.
json_str(){
  local s="$1"
  s="${s//\\/\\\\}"; s="${s//\"/\\\"}"
  s="${s//$'\t'/\\t}"; s="${s//$'\r'/\\r}"
  printf '"%s"' "$s"
}
# sed_repl escapes $1 for the replacement side of s|...|...|: \, | and &.
sed_repl(){ printf '%s' "$1" | sed 's/[\\|&]/\\&/g'; }

# ── docker environment check / auto-install ───────────────────
ensure_docker(){
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "docker and docker compose detected"; return
  fi
  warn "docker / docker compose not detected"
  case "$(uname -s)" in
    Linux)
      if [ "$(ask 'Install Docker automatically? (y/n)' y)" = y ]; then
        install_docker_linux
        sudo usermod -aG docker "$USER" || true
        docker compose version >/dev/null 2>&1 || sudo docker compose version >/dev/null 2>&1 \
          || die "docker installed but 'docker compose' is unavailable; install the compose v2 plugin and retry"
        ok "Docker installed (re-login required for the group change to take effect)"
      else
        die "please install docker yourself and retry"
      fi ;;
    Darwin) die "on macOS please install Docker Desktop: https://www.docker.com/products/docker-desktop/" ;;
    *)      die "please install docker yourself and retry" ;;
  esac
}

# install_docker_linux uses get.docker.com only on the distros it supports. That
# script keys its repo URL off /etc/os-release ID + codename, so on derivatives
# such as Kali it writes a repo for a nonexistent release (debian kali-rolling)
# and leaves apt broken. Other apt-based distros get the distro's own packages.
install_docker_linux(){
  local id="" id_like=""
  if [ -r /etc/os-release ]; then
    id="$(. /etc/os-release && echo "${ID:-}")"
    id_like="$(. /etc/os-release && echo "${ID_LIKE:-}")"
  fi
  case "$id" in
    ubuntu|debian|raspbian|centos|fedora|rhel|sles)
      curl -fsSL https://get.docker.com | sh
      return ;;
  esac
  command -v apt-get >/dev/null 2>&1 \
    || die "automatic Docker install is not supported on '${id:-unknown}'; please install docker + the compose plugin yourself and retry"
  info "'${id:-unknown}' (like: ${id_like:-n/a}) is not supported by get.docker.com; installing from the distro's apt repos"
  # Drop a broken repo left by an earlier get.docker.com run (it fails every apt update).
  # Match the URI and the distro id anywhere in the file: in a one-line .list entry
  # they share a line, but in a deb822 .sources file the URIs and Suites fields are
  # on separate lines. -w keeps "kali" matching inside "kali-rolling".
  local f
  for f in /etc/apt/sources.list.d/docker.list /etc/apt/sources.list.d/docker.sources; do
    if [ -n "$id" ] && [ -f "$f" ] \
      && grep -qF "download.docker.com/linux/debian" "$f" 2>/dev/null \
      && grep -qwF "$id" "$f" 2>/dev/null; then
      warn "removing broken Docker repo $f"
      sudo rm -f "$f"
    fi
  done
  sudo apt-get update
  sudo apt-get install -y docker.io
  # The compose v2 package name varies across Debian derivatives; take the first that exists.
  local p
  for p in docker-compose-plugin docker-compose-v2 docker-compose; do
    if apt-cache madison "$p" 2>/dev/null | grep -q .; then
      sudo apt-get install -y "$p" && break
    fi
  done
  # docker.io only suggests buildx on some releases, and the image build needs it.
  for p in docker-buildx-plugin docker-buildx; do
    if apt-cache madison "$p" 2>/dev/null | grep -q .; then
      sudo apt-get install -y "$p" && break
    fi
  done
  # Kali (and some others) don't start services on package install.
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl enable --now docker || true
  fi
}

# The Dockerfile uses --platform=$BUILDPLATFORM, which needs BuildKit. Without the
# buildx plugin Compose only warns, falls back to the legacy builder and fails on
# the first FROM with 'failed to parse platform'.
ensure_buildx(){
  docker buildx version >/dev/null 2>&1 && return
  case "$(uname -s)" in
    Darwin) die "docker buildx not detected; the image build needs it. Docker Desktop includes it; with Homebrew's docker CLI (e.g. Colima) run 'brew install docker-buildx' and register the plugin as its caveats describe" ;;
    *)      die "docker buildx not detected; the image build needs it. Install docker-buildx-plugin (Docker's repo) or docker-buildx (distro repo) and retry" ;;
  esac
}

# ── 1) All-Docker ───────────────────────────────
install_docker(){
  ensure_docker
  ensure_buildx
  if [ ! -f .env ]; then
    cp .env.example .env 2>/dev/null || true
    local pw key
    pw="$(ask 'Postgres password (press Enter to generate randomly)' "$(rand)")"
    key="$(ask 'ANTHROPIC_API_KEY (may be empty, configure later in the UI)' '')"
    sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(sed_repl "$pw")|" .env
    sed -i.bak "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$(sed_repl "$key")|" .env
    rm -f .env.bak
    ok ".env generated (POSTGRES_PASSWORD set)"
  else
    info "reusing existing .env"
  fi
  info "building the image from this checkout and starting..."
  docker compose up -d --build
  ok "started → http://localhost:8787"
  info "view logs: docker compose logs -f artex"
}

# ── 2) Local build & run ──────────────────────────────
install_local(){
  echo "Database setup:"
  echo "  1) Connect to an existing PostgreSQL"
  echo "  2) Start a PostgreSQL with Docker (requires docker)"
  case "$(ask 'Choose' 1)" in
    2)
      ensure_docker
      local pw; pw="$(ask 'Postgres password (press Enter for random)' "$(rand)")"
      docker run -d --name artex-pg -p 5432:5432 \
        -e POSTGRES_USER=artex -e POSTGRES_PASSWORD="$pw" -e POSTGRES_DB=artex \
        -v artex-pg:/var/lib/postgresql/data postgres:16-alpine
      DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=artex DB_PASS="$pw" DB_NAME=artex DB_SSL=disable ;;
    *)
      DB_HOST="$(ask 'Database host' 127.0.0.1)"
      DB_PORT="$(ask 'Port' 5432)"
      DB_USER="$(ask 'User' artex)"
      DB_PASS="$(ask 'Password' '')"
      DB_NAME="$(ask 'Database name' artex)"
      DB_SSL="$(ask 'sslmode (disable/require)' disable)" ;;
  esac

  # generate config.json (string values JSON-escaped: a password may contain " or \)
  case "$DB_PORT" in (*[!0-9]*|'') die "port must be a number: $DB_PORT" ;; esac
  cat > config.json <<JSON
{
  "database": {
    "host": $(json_str "$DB_HOST"),
    "port": ${DB_PORT},
    "user": $(json_str "$DB_USER"),
    "password": $(json_str "$DB_PASS"),
    "dbname": $(json_str "$DB_NAME"),
    "sslmode": $(json_str "$DB_SSL")
  }
}
JSON
  ok "config.json generated"

  # go environment check
  command -v go >/dev/null 2>&1 || die "Go not detected; please install Go (>=1.26) first: https://go.dev/dl/"
  ok "Go: $(go version)"

  # embedding the frontend requires node to produce the static assets
  if command -v npm >/dev/null 2>&1; then
    info "building frontend static assets..."
    ( cd web && npm ci --ignore-scripts && npm run build:static )
    rm -rf server/webui/dist && mkdir -p server/webui && cp -r web/out server/webui/dist
    info "compiling embedded single binary..."
    CGO_ENABLED=0 go build -tags embedui -trimpath -o artex ./cmd/artex
  else
    warn "npm not detected: building a backend WITHOUT the embedded frontend (run npm run dev separately for the frontend)"
    CGO_ENABLED=0 go build -o artex ./cmd/artex
  fi
  ok "build complete → ./artex"

  info "starting... (Ctrl-C to exit)"
  ./artex
}

echo "=============================="
echo "  ARTEX Install"
echo "  1) All-Docker install"
echo "  2) Run locally (go build)"
echo "=============================="
case "$(ask 'Choose' 1)" in
  1) install_docker ;;
  2) install_local ;;
  *) die "invalid choice" ;;
esac

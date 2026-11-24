# ARTEX from the published GHCR image, with the same PostgreSQL service as
# docker-compose.yml. Use this file to run and update without a git checkout:
#
#   docker compose -f docker-compose.ghcr.yml pull
#   docker compose -f docker-compose.ghcr.yml up -d
#
# The image is published from the next tagged release: v0.7.0 predates the
# GHCR publish step, so the pull above fails with "denied" until then. Use
# `docker compose up -d --build` with docker-compose.yml in the meantime.
#
# Set POSTGRES_PASSWORD in .env. Pin the image with ARTEX_IMAGE_TAG=v0.7.1 in
# .env; unset uses latest. The image carries the built-in /app/skills; this file
# does not mount a host skills/ directory. To use custom skills, copy them into a
# host directory and add `- ./skills:/app/skills` to the artex volumes.
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-artex}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Please set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: ${POSTGRES_DB:-artex}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-artex} -d ${POSTGRES_DB:-artex}"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

  artex:
    image: ghcr.io/baarai/artex:${ARTEX_IMAGE_TAG:-latest}
    # Agent processes run as an unprivileged executor (-exec-uid): no setuid program
    # or file capability may raise them back to root.
    security_opt:
      - "no-new-privileges:true"
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      # Parts, not a pasted URL. PostgresDSN percent-encodes the password, so a
      # value with / ? % @ : or a space still connects.
      ARTEX_PG_HOST: postgres
      ARTEX_PG_PORT: "5432"
      ARTEX_PG_USER: ${POSTGRES_USER:-artex}
      ARTEX_PG_PASSWORD: ${POSTGRES_PASSWORD:?Please set POSTGRES_PASSWORD in .env}
      ARTEX_PG_DBNAME: ${POSTGRES_DB:-artex}
      ARTEX_PG_SSLMODE: disable
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      ARTEX_LLM_PROVIDER: ${ARTEX_LLM_PROVIDER:-}
      ARTEX_LLM_MODEL: ${ARTEX_LLM_MODEL:-}
      ARTEX_LLM_BASE_URL: ${ARTEX_LLM_BASE_URL:-}
      ARTEX_LLM_PROXY: ${ARTEX_LLM_PROXY:-}
      # Exact host:port list the model-list fetch may reach on private addresses
      # (e.g. host.docker.internal:11434 for Ollama).
      ARTEX_LLM_PRIVATE_ENDPOINTS: ${ARTEX_LLM_PRIVATE_ENDPOINTS:-}
      ARTEX_JWT_KEY_DIR: /app/keys
      # Optional: key for secrets at rest; empty = keys/secret.key (generated at
      # first start).
      ARTEX_SECRET_KEY: ${ARTEX_SECRET_KEY:-}
      ARTEX_TRUSTED_PROXIES: ${ARTEX_TRUSTED_PROXIES:-}
      # Untrusted-output boundary: on by default (empty = on); set 0 to disable.
      ARTEX_UNTRUSTED_BOUNDARY: ${ARTEX_UNTRUSTED_BOUNDARY:-}
      ARTEX_UPDATE_CHECK: ${ARTEX_UPDATE_CHECK:-}
      # Noise profile for target requests: off (default) | quiet | balanced | aggressive.
      ARTEX_NOISE_PROFILE: ${ARTEX_NOISE_PROFILE:-}
      ARTEX_TARGET_USER_AGENT: ${ARTEX_TARGET_USER_AGENT:-}
      # Hierarchical run budgets: unset or 0 = unlimited. See README.
      ARTEX_TASK_BUDGET_TOKENS: ${ARTEX_TASK_BUDGET_TOKENS:-}
      ARTEX_TASK_BUDGET_TURNS: ${ARTEX_TASK_BUDGET_TURNS:-}
      ARTEX_INTENT_BUDGET_TOKENS: ${ARTEX_INTENT_BUDGET_TOKENS:-}
      ARTEX_INTENT_BUDGET_TURNS: ${ARTEX_INTENT_BUDGET_TURNS:-}
    ports:
      - "${ARTEX_BIND_ADDR:-127.0.0.1}:8787:8787"
      - "127.0.0.1:8788:8788"
    volumes:
      - ./data:/app/data
      - ./keys:/app/keys
    restart: unless-stopped

volumes:
  pgdata:

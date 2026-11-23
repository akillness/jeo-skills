# Langfuse Self-Hosting Runbook

## Docker Compose Quickstart
```bash
docker compose up -d
```

## Architecture Components
- **Web**: Next.js service exposing port 3000 for web UI, REST API, and telemetry ingestion.
- **Worker**: Background queue processor for ClickHouse ingestion batches, async evaluation jobs, and daily metrics rollup.
- **Postgres**: Operational metadata (projects, API keys, prompt versions, team permissions).
- **ClickHouse**: Columnar analytical store supporting fast aggregation over billions of observation rows.

## Health Checks
- Web API: `GET http://localhost:3000/api/public/health`
- Ready endpoint: `GET http://localhost:3000/api/public/ready`

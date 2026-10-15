# Agentic Documents Assistant pinned-source notes

**Repository:** `TOPDEV99999/AI-Knowledge-Management-Platform` at `dc2a329ececc48f014fb059ad508d8922bb96211` (observed 2026-10-16). The root README calls the app an LLM-powered assistant for complex business-document questions. It combines document retrieval and analytical SQL; treat it as a sample implementation, not a turnkey generic SaaS.

## Architecture from code

- The `backend` is a CDK TypeScript app. Its backend README describes a Lambda container with Bedrock client/orchestrator, API Gateway REST API, Cognito authentication, DynamoDB chat history, SSM parameters, VPC/subnets, Aurora PostgreSQL for both semantic search and SQL, and SageMaker Processing Jobs for ingestion.
- The pinned agent config reads region/model parameter names from environment and SSM, resolves database credentials from Secrets Manager, and builds PGVector/SQLAlchemy connection settings. This is runtime credential access: do not imitate it by exposing secret material or requesting credentials in chat.
- `rag.py` constructs Bedrock embeddings and opens an **existing** PGVector index by configured collection name/connection string. Its retriever uses `k=5, fetch_k=50`; it returns no source documents in the final answer in this snapshot. This does not prove what any live deployment currently returns.
- `sqlqa.py` constrains generated SQL using table metadata/schema, asks for a limited query and delegates execution through the SQL QA chain. The exact permitted table names include `extracted_entities` in this snapshot. Treat model-generated SQL as untrusted; inspect query and target before execution.
- Root structure separates `data-pipelines`, `experiments`, backend, and frontend. Notebooks and `data-pipelines/README.md` describe ingestion; do not infer that ingestion has run just because the infrastructure exists.

## Setup and operations

The root README's setup lists provider/model configuration, credentials, backend/frontend environments, database and vector storage as prerequisites. The backend README lists CDK `synth`, `diff`, and `deploy` as useful commands. Those commands are documentation only in this task. Before giving an exact runnable command, inspect the checked-out `backend/package.json`, `cdk.json`, requirements, region, and deployment docs because the checked snapshot may be stale.

Suggested read-only diagnosis order:

1. Identify whether failure is in ingestion (input documents and extracted-entity load), index availability, embedding/index model compatibility, retrieval result, SQL schema/query, agent/tool routing, API auth, or deployment.
2. For retrieval, verify that the configured collection exists and uses the expected embedding model. Source code opens an existing index; it does not establish that the index was populated.
3. For analytics, inspect the table/column schema and generated SQL against the intended dataset. Do not execute arbitrary generated SQL without explicit target/data authorization and review.
4. For API failures, distinguish Cognito/API Gateway permissions from Lambda/Bedrock, VPC/database connectivity, and configuration/secret resolution.
5. If considering deploy/diff or ingestion, identify account, region, resource changes, dataset, source-document privacy, and likely costs before asking for approval.

## Effect and cost gates

Approval is required before dependency installation or source downloads; AWS authentication/credential entry; importing private documents; cloud access, model-provider calls, or billing; creating/updating/deleting AWS resources; database writes; enabling a public endpoint; or uploading data to an external provider. Treat each as a separate scope, especially CDK deploy versus public API exposure. Do not run CDK, ingestion, model calls, or SQL in this task.

## Offline source preflight

Parent-provided command form:

```bash
python3 .agent-skills/ai-knowledge-management-platform/scripts/preflight.py --repo /absolute/upstream --json
```

Installed-root form: `python3 /absolute/installed/ai-knowledge-management-platform/scripts/preflight.py --json`. Without `--repo`, the helper performs inventory-only checks. It is read-only stdlib code with no subprocess, network, credential-file reads, or writes. The explicit `--repo` path must be absolute and nonsymlink. Its secure traversal requires Python 3.10+ on POSIX Linux/macOS or WSL2 on Windows; unsupported native platforms fail closed. This is helper support, not an upstream app-platform guarantee. It hashes only selected pinned public files, not Git HEAD, all source, package/runtime integrity, AWS settings, or deployment state; PATH checks indicate command presence only, not version. Exit 0 = offline checks pass; 1 = source missing/mismatch; 2 = invalid input. `runtime_verified` is false. These commands are not run here.

## Pinned source links

- [Root architecture and setup](https://github.com/TOPDEV99999/AI-Knowledge-Management-Platform/blob/dc2a329ececc48f014fb059ad508d8922bb96211/README.md)
- [Backend infrastructure overview](https://github.com/TOPDEV99999/AI-Knowledge-Management-Platform/blob/dc2a329ececc48f014fb059ad508d8922bb96211/backend/README.md)
- [CDK backend stack](https://github.com/TOPDEV99999/AI-Knowledge-Management-Platform/blob/dc2a329ececc48f014fb059ad508d8922bb96211/backend/lib/assistant-backend-stack.ts)
- [Backend package manifest](https://github.com/TOPDEV99999/AI-Knowledge-Management-Platform/blob/dc2a329ececc48f014fb059ad508d8922bb96211/backend/package.json)
- [Agent config and secret resolution](https://github.com/TOPDEV99999/AI-Knowledge-Management-Platform/blob/dc2a329ececc48f014fb059ad508d8922bb96211/backend/lib/lambda-functions/agent-executor-lambda-container/agent-executor-lambda/agent/config.py)
- [RAG/index implementation](https://github.com/TOPDEV99999/AI-Knowledge-Management-Platform/blob/dc2a329ececc48f014fb059ad508d8922bb96211/backend/lib/lambda-functions/agent-executor-lambda-container/agent-executor-lambda/agent/rag.py)
- [SQL QA prompt and table scope](https://github.com/TOPDEV99999/AI-Knowledge-Management-Platform/blob/dc2a329ececc48f014fb059ad508d8922bb96211/backend/lib/lambda-functions/agent-executor-lambda-container/agent-executor-lambda/agent/sqlqa.py)
- [License](https://github.com/TOPDEV99999/AI-Knowledge-Management-Platform/blob/dc2a329ececc48f014fb059ad508d8922bb96211/LICENSE): full pinned text says MIT No Attribution (MIT-0). The grant is broad but subject to its terms and warranty/liability disclaimer; this skill includes no copied upstream code.

---
name: "ai-knowledge-management-platform"
description: "Operate or explain TOPDEV99999/AI-Knowledge-Management-Platform, the AWS Agentic Documents Assistant sample combining document RAG, extracted relational entities, SQL question answering, and a ReAct-style agent. Use for its CDK architecture, ingestion pipeline, retrieval/SQL routing, setup, or troubleshooting. Do not treat it as a generic knowledge-management SaaS."
allowed-tools: Bash Read Grep Glob
metadata:
  version: 1.0.0
  source: https://github.com/TOPDEV99999/AI-Knowledge-Management-Platform
  upstream_commit: dc2a329ececc48f014fb059ad508d8922bb96211
---

# Agentic Documents Assistant (AWS sample)

## Instructions

1. **Confirm this exact repository.** It is an AWS-based example app, not a general-purpose knowledge-management platform. Pin source claims to `references/source.json`; inspect the user's checkout before relying on old commands.
2. **Trace the data path:** ingestion notebooks/pipelines extract document text and structured entities; semantic retrieval uses an embedding model and an existing PGVector index; analytical questions use SQL over extracted tables; the LangChain agent can select retrieval, SQL, or tools. Keep these paths distinct in diagnosis.
3. **Use the concrete backend topology.** Pinned CDK backend describes API Gateway, Lambda container/Bedrock orchestration, Cognito, DynamoDB chat history, Aurora PostgreSQL for semantic search and SQL, SSM parameters, VPC and SageMaker ingestion permissions. Do not assume a component is deployed or configured from source alone.
4. **Troubleshoot at the failing boundary:** source preprocessing/load, vector index/embedding compatibility, retrieval settings, SQL schema/query, agent routing, API/auth, or AWS deployment. Verify the target dataset and infrastructure before any mutation.
5. **Gate every external effect separately.** Approval is required before dependency/source installation, AWS login or credential/config changes, private-document access/import, cloud/billing/resource use, database reads/writes, CDK deploy or deletion, public service activation, or paid model/provider uploads. A request to inspect code authorizes none of these.
6. **Protect data and claims.** Never request or reveal secrets. Do not execute generated SQL or deploy a stack as a troubleshooting shortcut. Distinguish source-defined behavior from a live AWS deployment or runtime result.
7. Use `references/upstream.md` for setup/operations, source-specific failure modes and pinned URLs. The offline preflight helper hashes selected files only and does not verify AWS, dependencies, or runtime. Evals are authored scenarios, not run evidence.

## Examples

- "The assistant answers contract questions but misses expiry-date questions." → Trace whether extraction populated the relational entity table and whether SQL QA receives the expected schema; do not assume vector retrieval is responsible.
- "Deploy this to our AWS account." → Explain the CDK path, then request separate approval for credentials, cloud resource creation/billing, and public exposure.
- "Compare knowledge-management products for my team." → Route to product/market research rather than this sample-specific skill.

## Best practices

- Treat the sample's infrastructure as an example architecture; validate account, region, quotas, costs and current AWS APIs before any deployment plan.
- Keep vector retrieval (`PGVector` existing index) separate from SQL analytics (structured extracted table); verify ingestion and schema first.
- Follow least privilege and scope source documents, tables, and cloud permissions explicitly.
- A successful local build, CDK synth, or offline source check is not proof of deployed or secure runtime behavior.

## References

- [Pinned operator notes](references/upstream.md)
- [Pinned evidence and license](references/source.json)
- [Evaluation scenarios](evals/evals.json)
- [Offline source preflight](scripts/preflight.py)

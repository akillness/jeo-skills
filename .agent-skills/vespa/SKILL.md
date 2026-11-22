---
name: vespa
description: >
  Deploy, configure, feed, and query enterprise-scale vector, lexical, and hybrid search applications using vespa-engine/vespa. Manages application packages (services.xml, schemas/*.sd), HNSW tensor indexing, BM25 rank profiles, PyVespa Python integration, and YQL queries.
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  version: 1.0.0
  source: https://github.com/vespa-engine/vespa
---

# vespa

Vespa is the industry-standard AI search and big data serving engine developed by Yahoo and the Vespa team. It combines high-throughput vector search (HNSW), lexical search (BM25), structured SQL-like filtering, and multi-stage online machine learning ranking in a single distributed, low-latency runtime.

## Core Architecture

An application in Vespa is defined as an **Application Package**:
- `services.xml`: Declares container clusters (stateless query & document processing nodes) and content clusters (stateful search & storage nodes with memory indexes).
- `schemas/<name>.sd`: Defines document schemas, field indexing options, tensor types, and ranking profiles.

## Operational Loop

### 1. Preflight Environment Check
Verify local Docker, Vespa CLI, and port availability (8080 for search/feed, 19071 for config server):
```bash
python3 scripts/preflight.py
```

### 2. Scaffold Application Package
Generate a minimal hybrid search application package:
```bash
python3 scripts/sample_app.py --output-dir my-vespa-app
```
Key files generated:
- `services.xml`: Container cluster (port 8080) and content cluster with 1 node.
- `schemas/article.sd`: Hybrid schema with BM25 text indexing and a 384-dimensional dense float tensor (`tensor<float>(x[384])`) indexed with HNSW.

### 3. Deploying to Local Container
Start a Vespa Docker container and deploy the application package:
```bash
# Launch container
docker run -d --name vespa-engine -p 8080:8080 -p 19071:19071 vespaengine/vespa:latest

# Wait for configserver readiness
vespa status configserver --wait 300

# Deploy package
vespa deploy my-vespa-app
vespa status --wait 300
```

### 4. Feeding Documents
Feed documents in JSONL format via `vespa feed` or High-Throughput HTTP/2 feed client:
```bash
vespa feed sample_docs.jsonl
```
Document format:
```json
{
  "put": "id:article:article::1",
  "fields": {
    "title": "Scaling Hybrid Search with Vespa",
    "body": "Vespa provides native HNSW vector indexing and BM25 rank profiles.",
    "embedding": [0.012, -0.045, ...]
  }
}
```

### 5. Querying with YQL (Vespa Query Language)
Perform hybrid search combining dense vector nearest neighbor search with BM25 lexical matching and Reciprocal Rank Fusion:
```bash
vespa query \
  'yql=select * from article where ({targetHits: 100}nearestNeighbor(embedding, query_embedding)) or userInput(@query)' \
  'query=vector database' \
  'input.query(query_embedding)=[0.012, -0.045, ...]' \
  'ranking=hybrid'
```

### 6. PyVespa Python Workflow
For Python applications, PyVespa integrates directly with local Docker or Vespa Cloud:
```python
from vespa.application import Vespa
from vespa.package import ApplicationPackage, Field, Schema, Document, RankProfile

app = Vespa(url="http://localhost", port=8080)
response = app.query(
    yql="select * from article where userInput(@q)",
    q="deep learning",
    ranking="bm25"
)
```

## Best Practices & Failure Boundaries
- **Tensor Memory Overhead**: HNSW memory footprint is dominated by vectors kept in RAM. Always define vector tensors with exact dimensionality (`tensor<float>(x[N])`) or bfloat16/int8 quantization for massive datasets.
- **Multi-Stage Ranking**: Use lightweight BM25 + dot-product vector search for `first-phase` ranking (top 1000 candidates), and complex cross-encoders or ONNX models in `second-phase` (top 100 candidates) to maintain sub-10ms latency.
- **Config Server Port**: Never send document feed or query traffic to port 19071 (config server). Ports: `8080` is data plane (search/feed), `19071` is control plane (deploy/status).

# Vespa Ranking Profiles & Hybrid Search

Ranking profiles define scoring functions that evaluate search matches.

## Multi-Phase Execution
- `first-phase`: Evaluated on all matching documents (cheap arithmetic, BM25, tensor dot products).
- `second-phase`: Evaluated only on the top N candidates from first phase (complex neural networks, GBDTs, cross-encoders).
- `rerank-count`: Number of documents forwarded to second phase (e.g. 100 to 1000).

## Hybrid Ranking Profile Example
```
rank-profile hybrid {
  inputs {
    query(query_embedding) tensor<float>(x[384])
  }
  first-phase {
    expression: 0.4 * bm25(title) + 0.6 * closeness(field, embedding)
  }
  second-phase {
    rerank-count: 200
    expression: onnxModel(cross_encoder).ranking
  }
}
```

# Vespa Schema Reference Guide (.sd)

The schema definition (`schemas/<name>.sd`) configures how documents are parsed, stored, indexed, and queried.

## Field Types
- Primitives: `string`, `int`, `long`, `float`, `double`, `bool`, `byte`
- Collections: `array<type>`, `weightedset<type>`, `map<key, value>`
- Dense Tensor: `tensor<float>(x[dim])`
- Sparse Tensor: `tensor<float>(category{})`
- Mixed Tensor: `tensor<float>(category{}, x[dim])`

## Indexing Statements
- `summary`: Return field in query results.
- `attribute`: Keep in memory for fast ranking, filtering, and grouping.
- `index`: Build inverted index for full-text search.
- `enable-bm25`: Calculate term frequency and inverse document frequency for BM25 ranking.

## HNSW Index Parameters
```
field embedding type tensor<float>(x[384]) {
  indexing: attribute | index
  attribute {
    distance-metric: angular  # or euclidean, dotproduct, geodegrees
  }
  index {
    hnsw {
      max-links-per-node: 16
      neighbors-to-explore-at-insert: 100
    }
  }
}
```

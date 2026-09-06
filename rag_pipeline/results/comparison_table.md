# RAG Retrieval Quality Comparison

**Metric:** Hit-Rate@3 (did the gold chunk appear in top-3 results?)

**Embedding model:** all-MiniLM-L6-v2 (384-dim)

**Gold labelling:** answer spans located by verbatim anchor phrase; a hit requires a retrieved chunk to cover ≥80% of the span.

| Query | Type | Fixed (hit@3 / score) | Structural (hit@3 / score) | Semantic (hit@3 / score) |
|---|---|---|---|---|
| Q1 | Fact lookup | ❌ 0.49 | ❌ 0.51 | ✅ 0.48 |
| Q2 | Fact lookup | ❌ 0.23 | ❌ 0.26 | ❌ 0.19 |
| Q3 | Fact lookup | ❌ 0.33 | ✅ 0.47 | ❌ 0.41 |
| Q4 | Multi-sentence | ❌ 0.27 | ❌ 0.35 | ❌ 0.34 |
| Q5 | Multi-sentence | ✅ 0.57 | ✅ 0.51 | ✅ 0.60 |
| Q6 | Multi-sentence | ✅ 0.48 | ✅ 0.38 | ✅ 0.36 |
| Q7 | Cross-section | ❌ 0.56 | ❌ 0.57 | ❌ 0.54 |
| Q8 | Cross-section | ✅ 0.44 | ❌ 0.47 | ✅ 0.49 |
| Q9 | Cross-section | ✅ 0.43 | ❌ 0.37 | ✅ 0.40 |
| Q10 | Boundary | ❌ 0.34 | ❌ 0.34 | ❌ 0.31 |
| **Total hit@3** | | **4/10** | **3/10** | **5/10** |

## Limitations

- Single document (16 pages, ~41k characters): results may not generalise to larger corpora.
- Single embedding model: a different model may favour different chunking strategies.
- Gold labels were manually assigned by a single reviewer — no independently verified ground truth.
- Sample size of 10 queries is too small for statistical significance.

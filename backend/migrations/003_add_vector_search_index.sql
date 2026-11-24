
-- Migration 003: Add an HNSW index for faster semantic vector retrieval.

BEGIN;

-- Index only chunks that have generated embeddings.
-- Cosine distance matches the existing <=> retrieval operator.
CREATE INDEX document_chunks_embedding_hnsw_idx
ON document_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64)
WHERE embedding IS NOT NULL;

COMMIT;

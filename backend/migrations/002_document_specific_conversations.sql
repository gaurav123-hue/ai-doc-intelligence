
-- Migration 002: Associate conversation history with individual documents.
-- Existing conversation turns remain unassigned because their original
-- document associations cannot be reliably reconstructed.

BEGIN;

-- 1. Add document_id to conversation turns.
-- NULL is retained for historical session-wide conversations.
ALTER TABLE conversation_turns
ADD COLUMN document_id BIGINT;

-- 2. Ensure a conversation's document belongs to the same session.
-- The composite foreign key enforces document/session ownership.
ALTER TABLE documents
ADD CONSTRAINT documents_id_session_id_unique
UNIQUE (id, session_id);

ALTER TABLE conversation_turns
ADD CONSTRAINT conversation_turns_document_session_fk
FOREIGN KEY (document_id, session_id)
REFERENCES documents (id, session_id)
ON DELETE CASCADE;

-- 3. Optimize retrieval of document-specific conversation histories.
CREATE INDEX conversation_turns_document_history_idx
ON conversation_turns (session_id, document_id, created_at, id);

COMMIT;

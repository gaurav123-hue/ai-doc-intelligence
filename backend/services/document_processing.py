
"""Coordinate extraction, chunking, embedding, and persistence for uploaded documents."""

from pathlib import Path

# Import database operations used by the processing pipeline.
from backend.database import (
    save_document_chunks,
    save_chunk_embedding,
    save_extracted_text,
    update_document_status,
)

# Import text-processing and embedding functions.
from backend.services.text_chunking import chunk_text
from backend.services.text_extraction import extract_text
from backend.services.embedding import generate_embeddings


def process_document(document_id: int, file_path: str | Path) -> None:
    """Extract text, generate searchable embeddings, and save processing results."""

    try:
        # Step 1: Extract readable text from the uploaded file.
        extracted_text = extract_text(file_path)

        # Step 2: Save the complete extracted text.
        save_extracted_text(document_id, extracted_text)

        # Step 3: Split the extracted text into overlapping chunks.
        chunks = chunk_text(extracted_text)

        if not chunks:
            raise ValueError("Document text produced no chunks")

        # Step 4: Persist the chunks before generating their embeddings.
        save_document_chunks(document_id, chunks)

        # Step 5: Generate normalized embeddings for all chunks in batches.
        embeddings = generate_embeddings(chunks)

        # Ensure every chunk has a corresponding embedding.
        if len(embeddings) != len(chunks):
            raise ValueError(
                "The number of generated embeddings does not match the chunks"
            )

        # Step 6: Save each embedding against its corresponding chunk ID.
        # Retrieve the newly inserted chunk IDs in their original order.
        from backend.database import get_document_chunk_ids

        chunk_ids = get_document_chunk_ids(document_id)

        if len(chunk_ids) != len(embeddings):
            raise ValueError(
                "The number of stored chunk IDs does not match the embeddings"
            )

        for chunk_id, embedding in zip(chunk_ids, embeddings):
            save_chunk_embedding(chunk_id, embedding)

        # Step 7: Mark the document processed only after all embeddings are saved.
        update_document_status(document_id, "processed")

    except Exception:
        # Mark the document as failed if any processing stage fails.
        try:
            update_document_status(document_id, "failed")
        except Exception:
            pass

        # Preserve the original exception for the caller.
        raise

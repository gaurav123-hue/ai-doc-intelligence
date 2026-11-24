
"""Generate text embeddings using a local Sentence Transformers model."""

from sentence_transformers import SentenceTransformer

# Use the same 384-dimensional model for documents and user questions.
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

# Load the model once so repeated embedding requests can reuse it.
model = SentenceTransformer(MODEL_NAME, local_files_only=True)


def generate_embedding(text: str) -> list[float]:
    """Convert one non-empty text into a normalized embedding."""

    if not text.strip():
        raise ValueError("Text must not be empty")

    embedding = model.encode(
        text,
        normalize_embeddings=True,
    )

    return embedding.tolist()


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate normalized embeddings for multiple text chunks in one batch."""

    if not texts:
        raise ValueError("At least one text is required")

    if any(not text.strip() for text in texts):
        raise ValueError("Texts must not contain empty or whitespace-only values")

    # Encode all chunks together for better processing efficiency.
    embeddings = model.encode(
        texts,
        normalize_embeddings=True,
        batch_size=32,
        show_progress_bar=False,
    )

    # Convert NumPy arrays into standard Python lists.
    return embeddings.tolist()

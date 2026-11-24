
"""Split extracted document text into structure-aware overlapping chunks."""

import re


def _split_sentences(text: str) -> list[str]:
    """Split paragraph text into sentences while preserving punctuation."""

    # Split after sentence-ending punctuation followed by whitespace.
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())

    return [sentence.strip() for sentence in sentences if sentence.strip()]


def _split_fixed_width(
    text: str,
    chunk_size: int,
    overlap: int,
) -> list[str]:
    """Split unstructured or oversized text using fixed-width windows."""

    chunks = []
    step = chunk_size - overlap
    start = 0

    while start < len(text):
        chunk = text[start:start + chunk_size].strip()

        if chunk:
            chunks.append(chunk)

        start += step

    return chunks


def _chunk_sentences(
    sentences: list[str],
    chunk_size: int,
    overlap: int,
) -> list[str]:
    """Group complete sentences into chunks with sentence-level overlap."""

    chunks = []
    start = 0

    while start < len(sentences):
        current_sentences = []
        current_length = 0
        end = start

        # Add complete sentences until the next one exceeds the limit.
        while end < len(sentences):
            sentence = sentences[end]

            # An individual oversized sentence needs fixed-width splitting.
            if len(sentence) > chunk_size:
                break

            additional_length = len(sentence)

            if current_sentences:
                additional_length += 1  # Space between sentences.

            if current_length + additional_length > chunk_size:
                break

            current_sentences.append(sentence)
            current_length += additional_length
            end += 1

        # Handle a sentence that cannot fit into an otherwise empty chunk.
        if not current_sentences:
            oversized_chunks = _split_fixed_width(
                sentences[start],
                chunk_size,
                overlap,
            )
            chunks.extend(oversized_chunks)
            start += 1
            continue

        chunks.append(" ".join(current_sentences))

        if end >= len(sentences):
            break

        # Select complete trailing sentences for the next chunk's context.
        next_start = end

        if overlap > 0:
            overlap_length = 0

            for index in range(end - 1, start - 1, -1):
                sentence_length = len(sentences[index])

                if overlap_length > 0:
                    sentence_length += 1

                if overlap_length + sentence_length > overlap:
                    break

                overlap_length += sentence_length
                next_start = index

        # Always advance to prevent an infinite loop.
        if next_start <= start:
            next_start = end

        start = next_start

    return chunks


def chunk_text(
    text: str,
    chunk_size: int = 1000,
    overlap: int = 150,
) -> list[str]:
    """Split extracted document text while preserving its structure."""

    # Reject invalid settings before processing.
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than zero")

    if overlap < 0 or overlap >= chunk_size:
        raise ValueError(
            "overlap must be non-negative and smaller than chunk_size"
        )

    text = text.strip()

    if not text:
        return []

    # Treat blank lines as paragraph boundaries.
    paragraphs = re.split(r"\n\s*\n", text)

    chunks = []

    for paragraph in paragraphs:
        paragraph = paragraph.strip()

        if not paragraph:
            continue

        sentences = _split_sentences(paragraph)

        # Preserve fixed-width behaviour for unstructured text.
        if (
            len(sentences) == 1
            and len(sentences[0]) > chunk_size
            and not re.search(r"[.!?]", sentences[0])
        ):
            chunks.extend(
                _split_fixed_width(paragraph, chunk_size, overlap)
            )
            continue

        chunks.extend(
            _chunk_sentences(sentences, chunk_size, overlap)
        )

    return chunks

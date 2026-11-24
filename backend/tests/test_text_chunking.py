
"""Tests for document text chunking."""

import pytest

from backend.services.text_chunking import chunk_text


def test_short_text_returns_one_chunk():
    # Short text should not be split unnecessarily.
    assert chunk_text("Hello document") == ["Hello document"]


def test_long_text_is_split_with_overlap():
    # Preserve fixed-width fallback behaviour for unstructured text.
    chunks = chunk_text("abcdefghijkl", chunk_size=6, overlap=2)

    assert chunks == ["abcdef", "efghij", "ijkl"]


def test_empty_text_returns_no_chunks():
    # Empty or whitespace-only input has nothing to index.
    assert chunk_text("   \n  ") == []


def test_invalid_chunk_size_raises_error():
    # A zero-sized chunk would prevent the algorithm from progressing.
    with pytest.raises(ValueError, match="chunk_size"):
        chunk_text("some text", chunk_size=0)


def test_overlap_must_be_smaller_than_chunk_size():
    # Overlap equal to the chunk size would make the step zero.
    with pytest.raises(ValueError, match="overlap"):
        chunk_text("some text", chunk_size=5, overlap=5)


def test_chunks_do_not_exceed_configured_size():
    # Every returned chunk must respect the configured limit.
    chunks = chunk_text(
        "abcdefghijklmnopqrstuvwxyz",
        chunk_size=8,
        overlap=2,
    )

    assert all(len(chunk) <= 8 for chunk in chunks)


def test_negative_overlap_raises_error():
    # Negative overlap is invalid.
    with pytest.raises(ValueError, match="overlap"):
        chunk_text("some text", chunk_size=5, overlap=-1)


def test_sentence_boundaries_are_preserved():
    # Sentences should remain together whenever they fit within a chunk.
    text = "Alpha sentence. Beta sentence. Gamma sentence."

    chunks = chunk_text(text, chunk_size=32, overlap=0)

    assert chunks == [
        "Alpha sentence. Beta sentence.",
        "Gamma sentence.",
    ]


def test_paragraph_boundaries_are_preserved():
    # Separate paragraphs should not be joined when they exceed the limit.
    text = "First paragraph.\n\nSecond paragraph."

    chunks = chunk_text(text, chunk_size=20, overlap=0)

    assert chunks == [
        "First paragraph.",
        "Second paragraph.",
    ]


def test_sentence_overlap_preserves_context():
    # The previous sentence should provide context to the next chunk.
    text = "Alpha sentence. Beta sentence. Gamma sentence."

    chunks = chunk_text(text, chunk_size=32, overlap=15)

    assert chunks == [
        "Alpha sentence. Beta sentence.",
        "Beta sentence. Gamma sentence.",
    ]

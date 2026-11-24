
"""Tests for database operations."""

from unittest.mock import MagicMock, patch

import pytest

from backend.database import (
    check_database_connection,
    create_document,
    get_documents,
    save_conversation_turn,
    get_conversation_history,
    delete_session,
    save_extracted_text,
    update_document_status,
    search_similar_chunks,
)


@patch("backend.database.psycopg.connect")
def test_check_database_connection(mock_connect):
    # Arrange
    mock_connection = MagicMock()
    mock_cursor = MagicMock()

    mock_connect.return_value = mock_connection
    mock_connection.__enter__.return_value = mock_connection
    mock_connection.cursor.return_value.__enter__.return_value = mock_cursor
    mock_cursor.fetchone.return_value = (1,)

    # Act
    result = check_database_connection()

    # Assert
    assert result == 1
    mock_connect.assert_called_once()


@patch("backend.database.psycopg.connect")
def test_create_document(mock_connect):
    # Arrange
    mock_connection = MagicMock()
    mock_cursor = MagicMock()

    mock_connect.return_value = mock_connection
    mock_connection.__enter__.return_value = mock_connection
    mock_connection.cursor.return_value.__enter__.return_value = mock_cursor

    mock_cursor.fetchone.return_value = (
        2,
        "meeting_notes.txt",
        "TXT",
        "pending",
        None,
    )

    # Act
    result = create_document("meeting_notes.txt", "TXT")

    # Assert
    assert result["id"] == 2
    assert result["filename"] == "meeting_notes.txt"
    assert result["file_type"] == "TXT"
    assert result["status"] == "pending"
    assert result["created_at"] is None

    mock_cursor.execute.assert_called_once()
    sql, parameters = mock_cursor.execute.call_args.args

    assert "INSERT INTO documents" in sql
    assert "RETURNING" in sql
    assert parameters == ("meeting_notes.txt", "TXT")


@patch("backend.database.psycopg.connect")
def test_get_documents(mock_connect):
    """Documents should be retrieved only for the requested session."""

    # Arrange
    mock_connection = MagicMock()
    mock_cursor = MagicMock()

    mock_connect.return_value = mock_connection
    mock_connection.__enter__.return_value = mock_connection
    mock_connection.cursor.return_value.__enter__.return_value = mock_cursor

    mock_cursor.fetchall.return_value = [
        (1, "annual_report.pdf", "PDF", "pending", None),
        (2, "meeting_notes.txt", "TXT", "pending", None),
    ]

    # Act
    result = get_documents(session_id=999)

    # Assert
    assert len(result) == 2
    assert result[0]["filename"] == "annual_report.pdf"
    assert result[1]["filename"] == "meeting_notes.txt"
    assert result[0]["status"] == "pending"

    mock_cursor.execute.assert_called_once()

    sql, parameters = mock_cursor.execute.call_args.args

    assert "SELECT" in sql
    assert "FROM documents" in sql
    assert "WHERE session_id = %s" in sql
    assert parameters == (999,)


# ---------------------------------------------------------------------------
# Document processing database tests
# ---------------------------------------------------------------------------

@patch("backend.database.psycopg.connect")
def test_save_extracted_text_uses_upsert(mock_connect):
    """Saving extracted text should insert or update content safely."""

    connection = MagicMock()
    cursor = MagicMock()

    mock_connect.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor

    save_extracted_text(7, "Extracted document text")

    query, parameters = cursor.execute.call_args.args

    assert "INSERT INTO document_contents" in query
    assert "ON CONFLICT (document_id)" in query
    assert parameters == (7, "Extracted document text")


@patch("backend.database.psycopg.connect")
def test_update_document_status(mock_connect):
    """Updating status should target the requested document ID."""

    connection = MagicMock()
    cursor = MagicMock()
    cursor.rowcount = 1

    mock_connect.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor

    update_document_status(7, "processed")

    query, parameters = cursor.execute.call_args.args

    assert "UPDATE documents" in query
    assert parameters == ("processed", 7)


@patch("backend.database.psycopg.connect")
def test_update_document_status_rejects_missing_document(mock_connect):
    """A missing document should not silently appear to update successfully."""

    connection = MagicMock()
    cursor = MagicMock()
    cursor.rowcount = 0

    mock_connect.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor

    with pytest.raises(ValueError, match="does not exist"):
        update_document_status(999999, "processed")


# ---------------------------------------------------------------------------
# Document-specific semantic search tests
# ---------------------------------------------------------------------------

@patch("backend.database.psycopg.connect")
def test_search_similar_chunks_returns_ranked_results(mock_connect):
    """Search should return chunks from the requested document and session."""

    connection = MagicMock()
    cursor = MagicMock()

    mock_connect.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor

    cursor.fetchall.return_value = [
    (
        12,
        7,
        "case 01.PDF",
        3,
        "The court examined the investigation.",
        0.12,
    ),
    (
        13,
        7,
        "case 01.PDF",
        4,
        "The investigation involved several witnesses.",
        0.48,
    ),
    (
        14,
        7,
        "case 01.PDF",
        5,
        "The document contains administrative information.",
        0.82,
    ),
]   
    

    query_embedding = [0.01] * 384
    session_id = 999
    document_id = 7

    results = search_similar_chunks(
        query_embedding,
        session_id=session_id,
        document_id=document_id,
        limit=5,
    )

    assert len(results) == 3
    assert results[0]["distance"] == 0.12
    assert results[1]["distance"] == 0.48
    assert results[2]["distance"] == 0.82
    assert results[0]["chunk_id"] == 12
    assert results[0]["document_id"] == 7
    assert results[0]["filename"] == "case 01.PDF"
    assert results[0]["chunk_index"] == 3
    assert results[0]["chunk_text"] == (
        "The court examined the investigation."
    )
    assert results[0]["distance"] == 0.12

    sql, parameters = cursor.execute.call_args.args

    assert "<=>" in sql
    assert "JOIN documents" in sql
    assert "d.session_id = %s" in sql
    assert "d.id = %s" in sql
    assert "ORDER BY" in sql
    assert "LIMIT" in sql

    assert parameters == (
        str(query_embedding),
        session_id,
        document_id,
        str(query_embedding),
        5,
    )


# ---------------------------------------------------------------------------
# Document-specific conversation tests
# ---------------------------------------------------------------------------

@patch("backend.database.psycopg.connect")
def test_save_conversation_turn(mock_connect):
    """Saving a conversation should persist its document association."""

    connection = MagicMock()
    cursor = MagicMock()

    mock_connect.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor

    cursor.fetchone.return_value = (15, None)

    sources = [{"document_id": 7, "chunk_id": 59}]
    cited_sources = [{"document_id": 7, "chunk_id": 59}]

    citation_validation = {
        "is_valid": True,
        "cited_sources": cited_sources,
        "invalid_sources": [],
    }

    result = save_conversation_turn(
        session_id=999,
        document_id=7,
        question="What is a fair trial?",
        answer="A fair trial protects individual rights.",
        sources=sources,
        cited_source_details=cited_sources,
        citation_validation=citation_validation,
        result_count=1,
    )

    assert result["id"] == 15
    assert result["created_at"] is None

    sql, parameters = cursor.execute.call_args.args

    assert "INSERT INTO conversation_turns" in sql
    assert "session_id" in sql
    assert "document_id" in sql
    assert "question" in sql
    assert "answer" in sql
    assert "sources" in sql
    assert "citation_validation" in sql

    assert parameters[0] == 999
    assert parameters[1] == 7
    assert parameters[2] == "What is a fair trial?"
    assert parameters[3] == "A fair trial protects individual rights."
    assert parameters[7] == 1


@patch("backend.database.psycopg.connect")
def test_get_conversation_history(mock_connect):
    """Conversation history should filter by session and document."""

    connection = MagicMock()
    cursor = MagicMock()

    mock_connect.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor

    cursor.fetchall.return_value = [
        (
            15,
            "What is a fair trial?",
            "A fair trial protects individual rights.",
            [{"document_id": 7, "chunk_id": 59}],
            [{"document_id": 7, "chunk_id": 59}],
            {
                "is_valid": True,
                "cited_sources": [
                    {"document_id": 7, "chunk_id": 59}
                ],
                "invalid_sources": [],
            },
            1,
            None,
        )
    ]

    result = get_conversation_history(
        session_id=999,
        document_id=7,
    )

    assert len(result) == 1
    assert result[0]["id"] == 15
    assert result[0]["question"] == "What is a fair trial?"
    assert result[0]["answer"] == (
        "A fair trial protects individual rights."
    )
    assert result[0]["result_count"] == 1
    assert result[0]["citation_validation"]["is_valid"] is True

    sql, parameters = cursor.execute.call_args.args

    assert "FROM conversation_turns" in sql
    assert "WHERE session_id = %s" in sql
    assert "document_id = %s" in sql
    assert "ORDER BY created_at ASC" in sql
    assert parameters == (999, 7)


# ---------------------------------------------------------------------------
# Session cleanup tests
# ---------------------------------------------------------------------------

@patch("backend.database.psycopg.connect")
def test_delete_session_returns_document_metadata(mock_connect):
    """Deleting a session should return metadata for its uploaded files."""

    connection = MagicMock()
    cursor = MagicMock()

    mock_connect.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor

    cursor.fetchone.side_effect = [
        (999,),
        (999,),
    ]

    cursor.fetchall.return_value = [
        (1, "report.pdf", "PDF", "abc123"),
        (2, "notes.txt", "TXT", "def456"),
    ]

    result = delete_session(session_id=999)

    assert result["session_id"] == 999  # type: ignore
    assert len(result["documents"]) == 2  # type: ignore
    assert result["documents"][0]["filename"] == "report.pdf"  # type: ignore
    assert result["documents"][0]["content_hash"] == "abc123"  # type: ignore
    assert result["documents"][1]["filename"] == "notes.txt"  # type: ignore
    assert result["documents"][1]["content_hash"] == "def456"  # type: ignore

    executed_queries = [
        call.args[0] for call in cursor.execute.call_args_list
    ]

    assert "FOR UPDATE" in executed_queries[0]
    assert "FROM documents" in executed_queries[1]
    assert "DELETE FROM sessions" in executed_queries[2]


@patch("backend.database.psycopg.connect")
def test_delete_session_returns_none_when_missing(mock_connect):
    """Deleting a nonexistent session should return None."""

    connection = MagicMock()
    cursor = MagicMock()

    mock_connect.return_value = connection
    connection.cursor.return_value.__enter__.return_value = cursor

    cursor.fetchone.return_value = None

    result = delete_session(session_id=999999)

    assert result is None

    cursor.execute.assert_called_once()

    sql = cursor.execute.call_args.args[0]
    assert "FOR UPDATE" in sql

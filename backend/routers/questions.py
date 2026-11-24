
"""API routes for submitting questions about uploaded documents."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.database import (
    get_conversation_history,
    get_document_by_id,
    save_conversation_turn,
)
from backend.services.rag import answer_question
from backend.services.sessions import get_authenticated_session

logger = logging.getLogger(__name__)

# The /questions prefix is added in backend/main.py.
router = APIRouter(tags=["Questions"])


class QuestionRequest(BaseModel):
    """Validate questions submitted by the client."""

    question: str = Field(
        min_length=3,
        max_length=2000,
        description="Question to ask about the selected document",
    )

    document_id: int = Field(
        gt=0,
        description="ID of the document being discussed",
    )


@router.post("/preview")
def preview_question(
    request: QuestionRequest,
    session: dict = Depends(get_authenticated_session),
):
    """Preview a question after verifying document ownership."""

    # Ensure the selected document belongs to the active session.
    document = get_document_by_id(
        request.document_id,
        session["id"],
    )

    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found in this session.",
        )

    return {
        "received_question": request.question,
        "session_id": session["id"],
        "document_id": request.document_id,
        "message": "Question received successfully",
    }


@router.post("/ask")
def ask_question(
    request: QuestionRequest,
    session: dict = Depends(get_authenticated_session),
):
    """Generate an answer and persist document-specific conversation."""

    try:
        # Verify document ownership before retrieval or LLM processing.
        document = get_document_by_id(
            request.document_id,
            session["id"],
        )

        if document is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found in this session.",
            )

        # Generate an answer using only the selected document.
        result = answer_question(
            request.question,
            session_id=session["id"],
            document_id=request.document_id,
        )

        # Save the conversation against its session and document.
        conversation = save_conversation_turn(
            session_id=session["id"],
            document_id=request.document_id,
            question=result["question"],
            answer=result["answer"],
            sources=result["sources"],
            cited_source_details=result["cited_source_details"],
            citation_validation=result["citation_validation"],
            result_count=result["result_count"],
        )

        # Include the persistent conversation ID and timestamp.
        result["conversation_id"] = conversation["id"]
        result["created_at"] = conversation["created_at"]

        return result

    except HTTPException:
        # Preserve intentional HTTP errors such as document-not-found.
        raise

    except Exception:
        # Log technical details without exposing them to the API client.
        logger.exception("Failed to generate or save conversation")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to process your question at this time.",
        )


@router.get("/history")
def get_question_history(
    document_id: int,
    session: dict = Depends(get_authenticated_session),
):
    """Retrieve conversation history for one document."""

    try:
        # Verify that the document belongs to the authenticated session.
        document = get_document_by_id(
            document_id,
            session["id"],
        )

        if document is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found in this session.",
            )

        # Retrieve only conversations for this session and document.
        history = get_conversation_history(
            session_id=session["id"],
            document_id=document_id,
        )

        return {
            "document_id": document_id,
            "history": history,
            "count": len(history),
        }

    except HTTPException:
        raise

    except Exception:
        logger.exception("Failed to retrieve conversation history")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve conversation history at this time.",
        )

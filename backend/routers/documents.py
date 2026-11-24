
"""API routes for uploading and listing session-specific documents."""

import hashlib
import logging
from datetime import datetime
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from psycopg.errors import UniqueViolation
from pydantic import BaseModel

from backend.database import (
    SessionDocumentLimitExceeded,
    create_uploaded_document,
    get_document_by_hash,
    get_document_by_id,
    get_documents,
)
from backend.services.document_processing import process_document
from backend.services.sessions import get_authenticated_session


# Keep detailed processing errors in server logs, not API responses.
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["Documents"])

# Store uploaded files outside the source-code directories.
STORAGE_DIR = Path("storage/documents")

# Enforce a 10 MiB upload limit and allow supported extensions only.
MAX_FILE_SIZE = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx"}


class DocumentResponse(BaseModel):
    """Metadata returned by document API endpoints."""

    id: int
    filename: str
    file_type: str | None
    status: str
    created_at: datetime


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    session: dict = Depends(get_authenticated_session),
):
    """Return only documents belonging to the authenticated session."""

    try:
        return get_documents(session["id"])

    except Exception as exc:
        logger.exception(
            "Failed to retrieve documents for session ID %s",
            session["id"],
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve documents",
        ) from exc


@router.get("/{document_id}/preview")
def preview_document(
    document_id: int,
    session: dict = Depends(get_authenticated_session),
):
    """Serve a PDF only if it belongs to the authenticated session."""

    try:
        # Retrieve the document using both its ID and owning session ID.
        document = get_document_by_id(
            document_id,
            session["id"],
        )

        if document is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found",
            )

        # This preview endpoint currently supports PDF files only.
        if document["file_type"] != "PDF":
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Preview is currently available for PDF documents only",
            )

        # Reconstruct the storage path from trusted database values.
        content_hash = document["content_hash"]
        file_path = (
            STORAGE_DIR
            / str(session["id"])
            / f"{content_hash}.pdf"
        )

        if not file_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="The stored document file could not be found",
            )

        # Return the PDF inline so the browser can render it.
        return FileResponse(
            path=file_path,
            media_type="application/pdf",
            filename=document["filename"],
            content_disposition_type="inline",
        )

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception(
            "Failed to preview document ID %s for session ID %s",
            document_id,
            session["id"],
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to preview document",
        ) from exc

@router.post(
    "/upload",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    file: UploadFile = File(...),
    session: dict = Depends(get_authenticated_session),
):
    """Validate, store, register, and process an uploaded document."""

    created_file = False
    destination = None

    try:
        # Strip any client-supplied directory components from the filename.
        filename = Path(file.filename or "").name
        extension = Path(filename).suffix.lower()

        if not filename or extension not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only PDF, TXT, and DOCX files are allowed",
            )

        # Read only one byte beyond the limit to detect oversized uploads.
        content = await file.read(MAX_FILE_SIZE + 1)

        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The file is empty",
            )

        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="The file exceeds the 10 MB limit",
            )

        # Hash the bytes so identical content is detected despite different names.
        content_hash = hashlib.sha256(content).hexdigest()
        file_type = extension.lstrip(".").upper()

        # Check for an existing document within this session.
        existing = get_document_by_hash(
            content_hash,
            session["id"],
        )

        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This file's content already exists as "
                    f"document ID {existing['id']}"
                ),
            )

        # Keep each session's uploaded files in a separate directory.
        session_storage_dir = STORAGE_DIR / str(session["id"])
        session_storage_dir.mkdir(parents=True, exist_ok=True)

        destination = session_storage_dir / f"{content_hash}{extension}"

        # Store the file without overwriting an existing file.
        try:
            with destination.open("xb") as stored_file:
                created_file = True
                stored_file.write(content)

        except FileExistsError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "A file with identical content already exists "
                    "or is being uploaded"
                ),
            ) from exc

        # Register the document and enforce the three-file session limit.
        try:
            document = create_uploaded_document(
                filename=filename,
                file_type=file_type,
                content_hash=content_hash,
                session_id=session["id"],
            )

        except SessionDocumentLimitExceeded as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=str(exc),
            ) from exc

        except UniqueViolation as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A document with identical content already exists",
            ) from exc

        # Extract text, persist it, and mark the document as processed.
        try:
            process_document(document["id"], destination)
            document["status"] = "processed"

        except Exception:
            # Preserve metadata and the uploaded file for possible retry.
            logger.exception(
                "Processing failed for document ID %s",
                document["id"],
            )
            document["status"] = "failed"

        # Return document metadata, even if text processing failed.
        return document

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception(
            "Unexpected upload failure for session ID %s",
            session["id"],
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save uploaded document",
        ) from exc

    finally:
        # Remove a newly created file if database registration never succeeded.
        # Once registered, preserve the file even if processing fails.
        if created_file and destination is not None:
            if "document" not in locals():
                try:
                    destination.unlink(missing_ok=True)
                except OSError:
                    logger.exception(
                        "Could not remove unregistered upload: %s",
                        destination,
                    )

        # Release the uploaded-file resource on every execution path.
        await file.close()

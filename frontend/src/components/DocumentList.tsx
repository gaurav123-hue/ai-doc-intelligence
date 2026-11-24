import "./DocumentList.css";

// Reuse the shared document interface returned by FastAPI.
import type { DocumentItem } from "../services/api";

interface DocumentListProps {
  documents: DocumentItem[];

  // Notify the parent when a document is opened.
  onOpenDocument: (document: DocumentItem) => void;
}

function DocumentList({ documents, onOpenDocument }: DocumentListProps) {
  // Determine the file type from its filename.
  const getFileType = (filename: string) => {
    return filename.split(".").pop()?.toUpperCase() || "FILE";
  };

  // Convert backend status values into user-friendly labels.
  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      uploaded: "Uploaded",
      processing: "Processing document...",
      processed: "Processed",
      failed: "Failed",
    };

    return labels[status.toLowerCase()] || status;
  };

  // Format an ISO date returned by the backend.
  const formatDate = (date?: string) => {
    if (!date) return "—";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "—";
    }

    return parsedDate.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="document-list">
      {documents.length === 0 ? (
        <div className="document-list-empty">
          <div className="document-list-empty-icon">▤</div>

          <h3>No documents yet</h3>

          <p>Upload your first document to start exploring it with AI.</p>
        </div>
      ) : (
        <>
          <div className="document-list-header">
            <span>DOCUMENT NAME</span>
            <span>TYPE</span>
            <span>UPLOADED</span>
            <span>STATUS</span>
            <span />
          </div>

          {documents.map((document) => {
            const fileType = getFileType(document.filename);
            const status = document.status.toLowerCase();

            return (
              <div className="document-list-row" key={document.id}>
                <div className="document-list-name">
                  <div
                    className={`document-type-icon ${fileType.toLowerCase()}`}
                  >
                    {fileType}
                  </div>

                  <strong title={document.filename}>{document.filename}</strong>
                </div>

                <span className="document-list-type">
                  {document.file_type?.toUpperCase() || fileType}
                </span>

                <span className="document-list-date">
                  {formatDate(document.created_at)}
                </span>

                <span>
                  <span className={`document-status ${status}`}>
                    {status === "processing" && (
                      <span
                        className="document-processing-spinner"
                        aria-hidden="true"
                      />
                    )}

                    {status === "processed" && (
                      <span aria-hidden="true">✓ </span>
                    )}

                    {getStatusLabel(status)}
                  </span>
                </span>

                <button
                  className="document-list-open"
                  onClick={() => onOpenDocument(document)}
                  disabled={status !== "processed"}
                >
                  Open →
                </button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export default DocumentList;

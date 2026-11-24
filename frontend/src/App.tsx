// Main application component for the DocuMind document intelligence platform.

import { useCallback, useEffect, useState } from "react";
import "./App.css";

import DocumentUpload from "./components/DocumentUpload";
import DocumentList from "./components/DocumentList";
import ChatPanel from "./components/ChatPanel";
import PdfViewer from "./components/PdfViewer";
import Toast, { type ToastType } from "./components/Toast";

import { getDocumentPreview, type DocumentItem } from "./services/api";

import { useSession } from "./hooks/useSession";
import { useDocuments } from "./hooks/useDocuments";
import { useChat } from "./hooks/useChat";

// Sidebar navigation options.
const navigationItems = [
  { label: "Dashboard", icon: "▦" },
  { label: "My Documents", icon: "▤" },
  { label: "Recent Activity", icon: "◷" },
];

function App() {
  // Connect the dashboard to the backend session lifecycle.
  const {
    session,
    token,
    loading: sessionLoading,
    error: sessionError,
    isNewSession,
    startNewSession,
    terminateSession,
  } = useSession();

  // Fetch and manage documents belonging to the current session.
  const {
    documents,
    loading: documentsLoading,
    uploading,
    error: documentsError,
    uploadFiles,
    isDuplicateError,
  } = useDocuments(token);

  const [activePage, setActivePage] = useState("Dashboard");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  // Track the document currently selected in the workspace.
  const [selectedDocument, setSelectedDocument] = useState<DocumentItem | null>(
    null,
  );

  // Manage AI conversations for the currently selected document.
  const {
    conversations,
    loading: chatLoading,
    sending: chatSending,
    sendQuestion,
  } = useChat(token, selectedDocument?.id ?? null);

  // Store the temporary PDF URL and preview loading/error states.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Track session termination and confirmation dialog visibility.
  const [endingSession, setEndingSession] = useState(false);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);

  // Store the currently displayed notification.
  const [toast, setToast] = useState<{
    message: string;
    type: ToastType;
  } | null>(null);

  // Display a notification throughout the application.
  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
  }, []);

  // Keep the dismissal callback stable.
  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  // Notify the user when a new session is successfully created.
  useEffect(() => {
    if (!sessionLoading && session && isNewSession) {
      showToast(
        "A new workspace session has started. You can upload up to 3 documents.",
        "success",
      );
    }
  }, [sessionLoading, session, isNewSession, showToast]);

  // Notify the user if session initialization fails.
  useEffect(() => {
    if (!sessionLoading && sessionError) {
      showToast(`Session initialization failed: ${sessionError}`, "error");
    }
  }, [sessionLoading, sessionError, showToast]);

  // Fetch the selected PDF using the authenticated session.
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    // Reset the previous preview whenever the selection changes.
    setPreviewUrl(null);
    setPreviewError(null);

    if (!selectedDocument) {
      setPreviewLoading(false);
      return;
    }

    // Only PDF documents are currently supported by the viewer.
    if (selectedDocument.file_type?.toUpperCase() !== "PDF") {
      setPreviewLoading(false);
      setPreviewError("Preview is currently available for PDF documents only.");
      return;
    }

    if (!token) {
      setPreviewLoading(false);
      setPreviewError("Your session is inactive. Please start a new session.");
      return;
    }

    setPreviewLoading(true);

    getDocumentPreview(token, selectedDocument.id)
      .then((blob) => {
        // Ignore responses belonging to an outdated selection.
        if (cancelled) return;

        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch((error) => {
        if (cancelled) return;

        setPreviewError(
          error instanceof Error
            ? error.message
            : "Unable to load document preview.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });

    // Release temporary browser resources when switching documents.
    return () => {
      cancelled = true;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [selectedDocument, token]);

  // Start a fresh session after the previous session has ended.
  const handleStartNewSession = async () => {
    try {
      await startNewSession();

      setActivePage("Dashboard");
      setWorkspaceOpen(false);
      setSelectedDocument(null);
      setShowEndSessionConfirm(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to start a new session.";

      showToast(message, "error");
    }
  };

  // Upload selected files and classify any errors.
  const handleFilesSelected = async (files: File[]) => {
    try {
      await uploadFiles(files);

      showToast(
        files.length === 1
          ? "Document uploaded successfully."
          : `${files.length} documents uploaded successfully.`,
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to upload documents.";

      const lowerMessage = message.toLowerCase();

      // Distinguish the document limit from duplicate-upload conflicts.
      if (
        lowerMessage.includes("maximum") ||
        lowerMessage.includes("three documents") ||
        lowerMessage.includes("3 documents")
      ) {
        showToast(
          "You've reached the maximum of 3 documents for this session.",
          "warning",
        );
      } else if (isDuplicateError(error)) {
        showToast(
          "This document has already been uploaded in your current session.",
          "warning",
        );
      } else {
        showToast(message, "error");
      }
    }
  };

  // Display validation errors reported by the upload component.
  const handleUploadError = (message: string) => {
    showToast(message, "warning");
  };

  // Open the selected document in the AI workspace.
  const handleOpenDocument = (document: DocumentItem) => {
    setSelectedDocument(document);
    setWorkspaceOpen(true);
  };

  // Submit a question using the selected document.
  const handleSendQuestion = async (question: string) => {
    await sendQuestion(question);
  };

  // End the authenticated session after user confirmation.
  const handleEndSession = async () => {
    try {
      setEndingSession(true);

      await terminateSession();

      setWorkspaceOpen(false);
      setSelectedDocument(null);
      setShowEndSessionConfirm(false);

      showToast(
        "Your session has ended. All session documents have been cleared.",
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to end the session.";

      showToast(message, "error");
    } finally {
      setEndingSession(false);
    }
  };

  // Calculate the number of documents ready for AI analysis.
  const processedDocuments = documents.filter(
    (document) => document.status.toLowerCase() === "processed",
  ).length;

  // Only allow questions when the selected document is processed.
  const selectedDocumentReady =
    selectedDocument?.status.toLowerCase() === "processed";

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">D</div>
          <span>DocuMind</span>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-heading">WORKSPACE</p>

          <nav>
            {navigationItems.map((item) => (
              <button
                key={item.label}
                className={`nav-item ${
                  activePage === item.label ? "active" : ""
                }`}
                onClick={() => {
                  setActivePage(item.label);
                  setWorkspaceOpen(false);
                }}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="storage-card">
            <p>Session storage</p>

            <div className="storage-bar">
              <div
                className="storage-progress"
                style={{
                  width: `${(documents.length / 3) * 100}%`,
                }}
              />
            </div>

            <span>{documents.length} of 3 documents uploaded</span>
          </div>

          <button className="profile-button">
            <div className="profile-avatar">G</div>

            <div className="profile-info">
              <strong>My Workspace</strong>
              <span>Personal account</span>
            </div>

            <span className="profile-menu">···</span>
          </button>
        </div>
      </aside>

      {/* Main application area */}
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>

            <strong>{workspaceOpen ? "Document Workspace" : activePage}</strong>
          </div>

          <div className="topbar-actions">
            <span className="session-indicator">
              <span className="status-dot" />

              {sessionLoading
                ? "Connecting..."
                : session
                  ? "Session active"
                  : "Session inactive"}
            </span>

            {session ? (
              <button
                className="end-session-button"
                onClick={() => setShowEndSessionConfirm(true)}
                disabled={sessionLoading || endingSession}
              >
                End session
              </button>
            ) : (
              <button
                className="quick-start-button"
                onClick={handleStartNewSession}
                disabled={sessionLoading}
              >
                {sessionLoading ? "Starting session..." : "+ Start New Session"}
              </button>
            )}
          </div>
        </header>

        {/* AI document workspace */}
        {workspaceOpen ? (
          <section className="ai-workspace">
            <div className="workspace-toolbar">
              <button
                className="back-button"
                onClick={() => setWorkspaceOpen(false)}
              >
                ← Back to documents
              </button>

              <span className="workspace-document-name">
                {selectedDocument?.filename || "Document Workspace"}
              </span>
            </div>

            <div className="workspace-content">
              {/* Left panel: Actual PDF document viewer */}
              <section className="document-viewer">
                <PdfViewer
                  fileUrl={previewUrl}
                  filename={selectedDocument?.filename || ""}
                  loading={previewLoading}
                  error={previewError}
                />
              </section>

              {/* Right panel: Document-specific AI conversation */}
              <ChatPanel
                conversations={conversations}
                loading={chatLoading}
                sending={chatSending}
                disabled={
                  !session || !selectedDocument || !selectedDocumentReady
                }
                onSendQuestion={handleSendQuestion}
              />
            </div>
          </section>
        ) : (
          <section className="dashboard">
            {/* Welcome section */}
            <div className="welcome-section">
              <div>
                <p className="eyebrow">YOUR WORKSPACE</p>

                <h1>Good afternoon 👋</h1>

                <p className="welcome-description">
                  Upload your documents and start exploring them with AI.
                </p>
              </div>
            </div>

            {/* Explain how to begin after a session has ended. */}
            {!session && (
              <div className="quick-start">
                <div className="quick-start-icon">✦</div>

                <div>
                  <h3>Your workspace is inactive</h3>

                  <p>
                    Start a new session to create a fresh workspace and begin
                    uploading documents. Your previous session's documents have
                    been cleared.
                  </p>
                </div>

                <button
                  className="quick-start-button"
                  onClick={handleStartNewSession}
                  disabled={sessionLoading}
                >
                  {sessionLoading ? "Starting..." : "Start New Session →"}
                </button>
              </div>
            )}

            {/* Document upload */}
            <div className="upload-section">
              <div className="section-header">
                <div>
                  <h2>Upload Documents</h2>

                  <p>Add PDF, DOCX, or TXT files to your current session.</p>
                </div>
              </div>

              <DocumentUpload
                uploadedCount={documents.length}
                onFilesSelected={handleFilesSelected}
                onError={handleUploadError}
                disabled={
                  !session ||
                  sessionLoading ||
                  uploading ||
                  documents.length >= 3
                }
              />

              {/* Inline upload status banner */}
              {uploading && (
                <div
                  className="upload-message"
                  role="status"
                  aria-live="polite"
                >
                  <span className="upload-spinner" aria-hidden="true" />
                  <span>Uploading and processing your documents...</span>
                </div>
              )}

              {documentsError && (
                <p role="alert" className="upload-message">
                  {documentsError}
                </p>
              )}
            </div>

            {/* Dashboard statistics */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon blue">▤</div>

                <p>Total documents</p>

                <h2>
                  {documents.length} <span>/ 3</span>
                </h2>

                <small>Current session</small>
              </div>

              <div className="stat-card">
                <div className="stat-icon purple">✦</div>

                <p>Questions asked</p>

                <h2>{conversations.length}</h2>

                <small>
                  {selectedDocument
                    ? selectedDocument.filename
                    : "Select a document to view its history"}
                </small>
              </div>

              <div className="stat-card">
                <div className="stat-icon green">✓</div>

                <p>Processed documents</p>

                <h2>{processedDocuments}</h2>

                <small>Ready for AI analysis</small>
              </div>
            </div>

            {/* Reusable document library */}
            <div className="documents-section">
              <div className="section-header">
                <div>
                  <h2>My Documents</h2>

                  <p>Manage and explore your uploaded documents.</p>
                </div>
              </div>

              {documentsLoading ? (
                <p>Loading your documents...</p>
              ) : (
                <DocumentList
                  documents={documents}
                  onOpenDocument={handleOpenDocument}
                />
              )}
            </div>

            {/* Quick start panel */}
            {session && (
              <div className="quick-start">
                <div className="quick-start-icon">✦</div>

                <div>
                  <h3>Ready to get started?</h3>

                  <p>
                    Upload a document to ask questions, discover insights, and
                    find information faster.
                  </p>
                </div>

                <button
                  className="quick-start-button"
                  onClick={() => {
                    setActivePage("My Documents");
                    setWorkspaceOpen(false);
                  }}
                >
                  Explore your documents →
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Full-screen overlay while documents are uploaded and processed */}
      {uploading && (
        <div className="processing-overlay" role="status" aria-live="polite">
          <div className="processing-modal">
            <div className="processing-spinner" aria-hidden="true" />

            <h2>Processing your document</h2>

            <p>
              Please wait while we upload and prepare your document for AI
              analysis.
            </p>

            <span className="processing-subtext">
              This may take a little while...
            </span>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={closeToast} />
      )}

      {/* Session termination confirmation dialog */}
      {showEndSessionConfirm && (
        <div className="confirmation-overlay">
          <div
            className="confirmation-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="end-session-title"
            aria-describedby="end-session-description"
          >
            <div className="confirmation-icon">!</div>

            <h2 id="end-session-title">End this session?</h2>

            <p id="end-session-description">
              This will permanently delete all documents uploaded during this
              session and clear its conversation history. This action cannot be
              undone.
            </p>

            <div className="confirmation-actions">
              <button
                className="confirmation-cancel"
                onClick={() => setShowEndSessionConfirm(false)}
                disabled={endingSession}
              >
                Cancel
              </button>

              <button
                className="confirmation-confirm"
                onClick={handleEndSession}
                disabled={endingSession}
              >
                {endingSession ? "Ending session..." : "End session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

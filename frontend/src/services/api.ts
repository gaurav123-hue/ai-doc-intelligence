
// Central API service for communicating with the FastAPI backend.

const API_BASE_URL = "/api";

// Custom error class that preserves the HTTP status code.
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Structure returned when a new session is created.
export interface SessionResponse {
  session_id: number;
  session_token: string;
  created_at: string;
  last_activity_at: string;
}

// Structure returned when validating an existing session.
export interface CurrentSession {
  session_id: number;
  created_at: string;
  last_activity_at: string;
  status: "active";
}

// Structure of a document returned by the backend.
export interface DocumentItem {
  id: number;
  filename: string;
  file_type: string | null;
  status: string;
  created_at: string;
}

// Structure of a retrieved document passage.
export interface SourceDetail {
  document_id: number;
  filename: string;
  chunk_id: number;
  chunk_index: number;
  chunk_text: string;
  distance: number;
}

// Structure of citation validation metadata.
export interface CitationValidation {
  is_valid: boolean;
  cited_sources: {
    document_id: number;
    chunk_id: number;
  }[];
  invalid_sources: {
    document_id: number;
    chunk_id: number;
  }[];
}

// Structure of an AI-generated answer.
export interface QuestionResponse {
  question: string;
  answer: string;
  sources: SourceDetail[];
  cited_source_details: SourceDetail[];
  result_count: number;
  citation_validation: CitationValidation;
  conversation_id: number;
  created_at: string;
}

// Structure of a saved conversation turn.
export interface ConversationItem {
  id: number;
  question: string;
  answer: string;
  sources: SourceDetail[];
  cited_source_details: SourceDetail[];
  citation_validation: CitationValidation;
  result_count: number;
  created_at: string;
}

// Structure returned when retrieving conversation history.
export interface ConversationHistoryResponse {
  document_id: number;
  history: ConversationItem[];
  count: number;
}

// Handle successful responses and backend errors consistently.
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = "Something went wrong. Please try again.";

    try {
      const errorData = await response.json();

      message =
        typeof errorData.detail === "string"
          ? errorData.detail
          : message;
    } catch {
      // Keep the default message if the response isn't JSON.
    }

    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

// --------------------------------------------------
// SESSION MANAGEMENT
// --------------------------------------------------

// Create a new workspace session.
export async function startSession(): Promise<SessionResponse> {
  const response = await fetch(`${API_BASE_URL}/sessions/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return handleResponse<SessionResponse>(response);
}

// Validate an existing session using its Bearer token.
export async function getCurrentSession(
  token: string
): Promise<CurrentSession> {
  const response = await fetch(`${API_BASE_URL}/sessions/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return handleResponse<CurrentSession>(response);
}

// End the current workspace session.
export async function endSession(token: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/sessions/end`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  await handleResponse<{
    message: string;
    session_id: number;
  }>(response);
}

// --------------------------------------------------
// DOCUMENT MANAGEMENT
// --------------------------------------------------

// Retrieve documents belonging to the authenticated session.
export async function getDocuments(
  token: string
): Promise<DocumentItem[]> {
  const response = await fetch(`${API_BASE_URL}/documents`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return handleResponse<DocumentItem[]>(response);
}

// Upload a document to the authenticated session.
export async function uploadDocument(
  token: string,
  file: File
): Promise<DocumentItem> {
  const formData = new FormData();

  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/documents/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  return handleResponse<DocumentItem>(response);
}

// Retrieve a PDF file for preview in the authenticated workspace.
export async function getDocumentPreview(
  token: string,
  documentId: number
): Promise<Blob> {
  const response = await fetch(
    `${API_BASE_URL}/documents/${documentId}/preview`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  // Reuse the existing API error format for failed requests.
  if (!response.ok) {
    let message = "Unable to load document preview.";

    try {
      const errorData = await response.json();

      if (typeof errorData.detail === "string") {
        message = errorData.detail;
      }
    } catch {
      // Keep the default message if the response isn't JSON.
    }

    throw new ApiError(message, response.status);
  }

  // Return the PDF bytes for React PDF to render.
  return response.blob();
}

// --------------------------------------------------
// AI QUESTION AND ANSWER
// --------------------------------------------------

// Submit a question about a specific document in the current session.
export async function askQuestion(
  token: string,
  question: string,
  documentId: number
): Promise<QuestionResponse> {
  const response = await fetch(`${API_BASE_URL}/questions/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      question,
      document_id: documentId,
    }),
  });

  return handleResponse<QuestionResponse>(response);
}

// --------------------------------------------------
// CONVERSATION HISTORY
// --------------------------------------------------

// Retrieve previous questions and answers for a specific document.
export async function getQuestionHistory(
  token: string,
  documentId: number
): Promise<ConversationHistoryResponse> {
  const queryParams = new URLSearchParams({
    document_id: String(documentId),
  });

  const response = await fetch(
    `${API_BASE_URL}/questions/history?${queryParams.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return handleResponse<ConversationHistoryResponse>(response);
}

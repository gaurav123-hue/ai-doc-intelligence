
// Custom React hook for managing document-specific AI conversations.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  askQuestion,
  getQuestionHistory,
  type ConversationItem,
} from "../services/api";

// Manage questions, answers, and conversation history for one document.
export function useChat(
  token: string | null,
  documentId: number | null
) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track history requests to prevent outdated responses replacing newer data.
  const historyRequestId = useRef(0);

  // Track the currently selected session and document.
  const selectionRef = useRef({
    token,
    documentId,
  });

  // Track active question requests across document switches.
  const sendRequestId = useRef(0);

  // Keep the current selection available to asynchronous callbacks.
  selectionRef.current = {
    token,
    documentId,
  };

  // Load conversation history for the selected document.
  const refreshHistory = useCallback(async () => {
    const requestId = ++historyRequestId.current;

    if (!token || !documentId) {
      setConversations([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await getQuestionHistory(token, documentId);

      // Ignore responses from an older document selection.
      if (requestId !== historyRequestId.current) {
        return;
      }

      setConversations(response.history);
    } catch (err) {
      // Ignore errors from outdated requests.
      if (requestId !== historyRequestId.current) {
        return;
      }

      const message =
        err instanceof Error
          ? err.message
          : "Unable to load conversation history.";

      setError(message);
      setConversations([]);
    } finally {
      // Only the latest request can update the loading state.
      if (requestId === historyRequestId.current) {
        setLoading(false);
      }
    }
  }, [token, documentId]);

  // Reload history whenever the session or selected document changes.
  useEffect(() => {
    // Invalidate any question request from the previous selection.
    sendRequestId.current += 1;

    setSending(false);
    setConversations([]);
    setError(null);

    void refreshHistory();

    // Invalidate pending history requests when this effect is cleaned up.
    return () => {
      historyRequestId.current += 1;
    };
  }, [refreshHistory]);

  // Submit a question and append its answer to the selected document's chat.
  const sendQuestion = useCallback(
    async (question: string) => {
      if (!token) {
        throw new Error("An active session is required to ask questions.");
      }

      if (!documentId) {
        throw new Error("Please select a document before asking questions.");
      }

      const trimmedQuestion = question.trim();

      if (trimmedQuestion.length < 3) {
        throw new Error("Please enter at least 3 characters.");
      }

      if (trimmedQuestion.length > 2000) {
        throw new Error("Questions cannot exceed 2000 characters.");
      }

      // Capture the selection so answers cannot enter another document's chat.
      const selectedToken = token;
      const selectedDocumentId = documentId;
      const requestId = ++sendRequestId.current;

      setSending(true);
      setError(null);

      try {
        const response = await askQuestion(
          selectedToken,
          trimmedQuestion,
          selectedDocumentId
        );

        // Ignore the response if the user switched documents meanwhile.
        const currentSelection = selectionRef.current;

        if (
          currentSelection.token !== selectedToken ||
          currentSelection.documentId !== selectedDocumentId ||
          requestId !== sendRequestId.current
        ) {
          return null;
        }

        // Convert the API response into a conversation history item.
        const newConversation: ConversationItem = {
          id: response.conversation_id,
          question: response.question,
          answer: response.answer,
          sources: response.sources,
          cited_source_details: response.cited_source_details,
          citation_validation: response.citation_validation,
          result_count: response.result_count,
          created_at: response.created_at,
        };

        // Add the newest conversation at the end of the selected document's chat.
        setConversations((previous) => [
          ...previous,
          newConversation,
        ]);

        return newConversation;
      } catch (err) {
        const currentSelection = selectionRef.current;

        // Do not display errors belonging to a previously selected document.
        if (
          currentSelection.token === selectedToken &&
          currentSelection.documentId === selectedDocumentId &&
          requestId === sendRequestId.current
        ) {
          const message =
            err instanceof Error
              ? err.message
              : "Unable to process your question.";

          setError(message);
        }

        throw err;
      } finally {
        // Only the latest request should update the sending state.
        if (requestId === sendRequestId.current) {
          setSending(false);
        }
      }
    },
    [token, documentId]
  );

  return {
    conversations,
    loading,
    sending,
    error,
    sendQuestion,
    refreshHistory,
  };
}

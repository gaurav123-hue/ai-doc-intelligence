import { useEffect, useRef, useState } from "react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ConversationItem } from "../services/api";
import "./ChatPanel.css";

interface ChatPanelProps {
  conversations: ConversationItem[];
  loading: boolean;
  sending: boolean;
  disabled?: boolean;
  onSendQuestion: (question: string) => Promise<void>;
}

// Remove internal citation identifiers from the visible answer.
// Original answers and citation metadata remain unchanged in the backend.
function formatAnswerForDisplay(answer: string): string {
  return answer
    .replace(/\s*\(ID\s*\d+\)/gi, "")
    .replace(
      /[【\[]\s*(?:Document(?:\s+ID)?\s*:?\s*)?\d+\s*,\s*(?:Chunk(?:\s+ID)?\s*:?\s*)?\d+\s*[】\]]/gi,
      "",
    )
    .replace(
      /Document(?:\s+ID)?\s*:?\s*\d+\s*,\s*Chunk(?:\s+ID)?\s*:?\s*\d+/gi,
      "",
    );
}

function ChatPanel({
  conversations,
  loading,
  sending,
  disabled = false,
  onSendQuestion,
}: ChatPanelProps) {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep the latest conversation visible as messages arrive.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [conversations, sending]);

  // Submit the user's question to the parent component.
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedQuestion = question.trim();

    if (trimmedQuestion.length < 3 || sending || disabled) {
      return;
    }

    setError(null);

    try {
      await onSendQuestion(trimmedQuestion);
      setQuestion("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to send your question.",
      );
    }
  };

  // Allow Enter to send while Shift + Enter inserts a new line.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (question.trim().length >= 3 && !sending && !disabled) {
        event.currentTarget.form?.requestSubmit();
      }
    }
  };

  return (
    <section className="chat-panel">
      {/* Chat header */}
      <header className="chat-header">
        <div className="chat-header-info">
          <div className="chat-header-icon">✦</div>

          <div className="chat-header-text">
            <h2>AI Assistant</h2>
            <p>Your intelligent document assistant</p>
          </div>
        </div>

        <span
          className={`chat-status ${
            disabled ? "unavailable" : sending ? "thinking" : "ready"
          }`}
        >
          <span className="status-dot" />
          {disabled ? "Unavailable" : sending ? "Thinking..." : "Ready"}
        </span>
      </header>

      {/* Conversation messages */}
      <div className="chat-messages">
        {loading ? (
          <div className="chat-loading">
            <div className="chat-loading-spinner" />
            Loading conversation...
          </div>
        ) : conversations.length === 0 ? (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">✦</div>

            <h3>How can I help you today?</h3>

            <p>
              Ask questions, explore key insights, or get a summary of your
              document.
            </p>

            <div className="suggested-questions">
              <button
                type="button"
                onClick={() => setQuestion("Summarize the uploaded document.")}
                disabled={disabled || sending}
              >
                Summarize this document
              </button>

              <button
                type="button"
                onClick={() =>
                  setQuestion("What are the key points in this document?")
                }
                disabled={disabled || sending}
              >
                Find the key points
              </button>
            </div>
          </div>
        ) : (
          conversations.map((conversation) => (
            <article className="conversation-group" key={conversation.id}>
              {/* User question */}
              <div className="chat-message user-message">
                <div className="message-content">
                  <span className="message-label">You</span>

                  <div className="user-question-bubble">
                    <p>{conversation.question}</p>
                  </div>
                </div>

                <div className="message-avatar user-avatar">Y</div>
              </div>

              {/* AI answer */}
              <div className="chat-message assistant-message">
                <div className="message-avatar assistant-avatar">✦</div>

                <div className="message-content">
                  <div className="assistant-answer-header">
                    <span className="message-label">DocuMind AI</span>
                    <span className="answer-status">Response</span>
                  </div>

                  {/* Render the answer as structured Markdown. */}
                  <div className="assistant-answer">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => (
                          <div className="markdown-table-wrapper">
                            <table>{children}</table>
                          </div>
                        ),

                        a: ({ children, href }) => (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {formatAnswerForDisplay(conversation.answer)}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </article>
          ))
        )}

        {/* AI response loading indicator */}
        {sending && (
          <div className="chat-typing">
            <div className="message-avatar assistant-avatar">✦</div>

            <div className="typing-bubble">
              <div className="typing-dots">
                <span />
                <span />
                <span />
              </div>

              <p>DocuMind is thinking...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Question composer */}
      <div className="chat-composer-area">
        {error && (
          <div className="chat-error" role="alert">
            {error}
          </div>
        )}

        <form className="chat-composer" onSubmit={handleSubmit}>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled
                ? "Select a processed document to start asking questions..."
                : "Ask something about your document..."
            }
            rows={2}
            maxLength={2000}
            disabled={disabled || sending || loading}
          />

          <button
            type="submit"
            disabled={
              disabled || sending || loading || question.trim().length < 3
            }
          >
            {sending ? "Thinking..." : "Send"}
          </button>
        </form>

        <p className="chat-input-hint">
          AI responses are generated from your selected document. Press Enter to
          send, Shift + Enter for a new line.
        </p>
      </div>
    </section>
  );
}

export default ChatPanel;

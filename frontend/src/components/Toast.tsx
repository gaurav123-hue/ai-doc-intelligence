
import { useEffect } from "react";
import "./Toast.css";

// Supported notification categories.
export type ToastType = "success" | "error" | "warning" | "info";

// Properties accepted by the Toast component.
interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

// Display a temporary notification.
function Toast({ message, type, onClose }: ToastProps) {
  // Automatically dismiss the notification after five seconds.
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onClose();
    }, 5000);

    // Clear the timeout when the component is removed or updated.
    return () => window.clearTimeout(timeout);
  }, [message, onClose]);

  // Select an icon based on the notification type.
  const icons: Record<ToastType, string> = {
    success: "✓",
    error: "✕",
    warning: "!",
    info: "i",
  };

  return (
    <div
      className={`toast toast-${type}`}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
    >
      <div className="toast-icon">
        {icons[type]}
      </div>

      <p className="toast-message">{message}</p>

      <button
        className="toast-close"
        onClick={onClose}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

export default Toast;

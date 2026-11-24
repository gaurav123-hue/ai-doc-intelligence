
import "./DocumentUpload.css";
import { useRef, useState } from "react";

interface DocumentUploadProps {
  // Number of documents already uploaded in the current session.
  uploadedCount: number;

  // Called when the user selects valid files.
  onFilesSelected: (files: File[]) => void;

  // Notify the dashboard when file validation fails.
  onError?: (message: string) => void;

  // Prevent additional uploads when the session is inactive.
  disabled?: boolean;
}

const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Only formats currently supported by our backend are accepted.
const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt"];

function DocumentUpload({
  uploadedCount,
  onFilesSelected,
  onError,
  disabled = false,
}: DocumentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");

  // Display validation errors locally and notify the dashboard.
  const reportError = (message: string) => {
    setError(message);
    onError?.(message);
  };

  // Validate files before passing them to the parent component.
  const validateFiles = (selectedFiles: File[]) => {
    setError("");

    if (disabled) {
      reportError("Uploads are currently unavailable.");
      return;
    }

    const remainingSlots = MAX_FILES - uploadedCount;

    if (remainingSlots <= 0) {
      reportError("You have reached the 3-document session limit.");
      return;
    }

    if (selectedFiles.length === 0) {
      return;
    }

    if (selectedFiles.length > remainingSlots) {
      reportError(
        `You can upload only ${remainingSlots} more document(s) in this session.`
      );
      return;
    }

    // Validate every selected file before uploading any of them.
    for (const file of selectedFiles) {
      const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;

      if (!SUPPORTED_EXTENSIONS.includes(extension)) {
        reportError(`${file.name} has an unsupported file format.`);
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        reportError(`${file.name} exceeds the 10MB file size limit.`);
        return;
      }

      if (file.size === 0) {
        reportError(`${file.name} is empty.`);
        return;
      }
    }

    onFilesSelected(selectedFiles);
  };

  // Handle files selected through the operating system file picker.
  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);

    validateFiles(files);

    // Reset the input so the same file can be selected again if needed.
    event.target.value = "";
  };

  // Allow users to drop files directly into the upload area.
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const files = Array.from(event.dataTransfer.files);

    validateFiles(files);
  };

  const remainingSlots = Math.max(0, MAX_FILES - uploadedCount);
  const uploadDisabled = disabled || remainingSlots === 0;

  return (
    <div className="upload-component">
      <div
        className={`upload-dropzone ${isDragging ? "dragging" : ""} ${
          uploadDisabled ? "upload-disabled" : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();

          if (!uploadDisabled) {
            setIsDragging(true);
          }
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          multiple
          hidden
          disabled={uploadDisabled}
          onChange={handleFileInput}
        />

        <div className="upload-icon">
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 16V4" />
            <path d="m7 9 5-5 5 5" />
            <path d="M20 16.5v2A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5v-2" />
          </svg>
        </div>

        <h3>
          {uploadDisabled
            ? "Upload limit reached"
            : "Drag and drop your documents here"}
        </h3>

        <p>
          {uploadDisabled
            ? "You cannot upload more documents in this session."
            : "or browse files from your computer"}
        </p>

        <button
          type="button"
          className="upload-browse-button"
          disabled={uploadDisabled}
          onClick={() => fileInputRef.current?.click()}
        >
          Browse files
        </button>

        <div className="upload-requirements">
          <span>PDF</span>
          <span>DOCX</span>
          <span>TXT</span>
          <span>Maximum 10 MB per file</span>
        </div>
      </div>

      {error && (
        <p className="upload-error" role="alert">
          {error}
        </p>
      )}

      <div className="upload-footer">
        <span>
          {uploadedCount} of {MAX_FILES} documents used
        </span>

        <span>{remainingSlots} upload slots remaining</span>
      </div>
    </div>
  );
}

export default DocumentUpload;

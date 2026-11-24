
// Custom React hook for managing session-specific documents.

import { useCallback, useEffect, useState } from "react";

import {
  ApiError,
  getDocuments,
  uploadDocument,
  type DocumentItem,
} from "../services/api";

export function useDocuments(token: string | null) {
  // Store documents retrieved from the backend.
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  // Track document loading and upload states.
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Store errors returned by the backend.
  const [error, setError] = useState<string | null>(null);

  // Fetch documents belonging to the authenticated session.
  const refreshDocuments = useCallback(async () => {
    if (!token) {
      setDocuments([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const result = await getDocuments(token);
      setDocuments(result);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to retrieve documents.";

      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Automatically retrieve documents when the session becomes available.
  useEffect(() => {
    if (!token) {
      setDocuments([]);
      setError(null);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadDocuments = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await getDocuments(token);

        if (isMounted) {
          setDocuments(result);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to retrieve documents."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDocuments();

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Upload files sequentially to respect the session document limit.
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!token) {
        throw new Error("An active session is required to upload files.");
      }

      if (files.length === 0) {
        return;
      }

      // Enforce the three-document limit before making API requests.
      if (documents.length + files.length > 3) {
        throw new Error(
          "A maximum of three documents is allowed per session."
        );
      }

      try {
        setUploading(true);
        setError(null);

        // Upload each file and immediately update the document list.
        for (const file of files) {
          const uploadedDocument = await uploadDocument(token, file);

          setDocuments((currentDocuments) => [
            ...currentDocuments,
            uploadedDocument,
          ]);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to upload documents.";

        setError(message);

        // Refresh to capture uploads that succeeded before a failure.
        try {
          await refreshDocuments();
        } catch {
          // Preserve the original upload error.
        }

        throw err;
      } finally {
        setUploading(false);
      }
    },
    [token, documents.length, refreshDocuments]
  );

  // Identify duplicate uploads for the notification system.
  const isDuplicateError = (err: unknown): boolean => {
    return err instanceof ApiError && err.status === 409;
  };

  return {
    documents,
    loading,
    uploading,
    error,
    refreshDocuments,
    uploadFiles,
    isDuplicateError,
  };
}

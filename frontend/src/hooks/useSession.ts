
// Custom React hook for managing authenticated workspace sessions.

import { useCallback, useEffect, useState } from "react";

import {
  startSession,
  getCurrentSession,
  endSession,
  type CurrentSession,
} from "../services/api";

// Keep the token in sessionStorage so it survives page refreshes.
const SESSION_TOKEN_KEY = "documind_session_token";

// Share an in-progress initialization request.
// This prevents duplicate sessions during React Strict Mode checks.
let initializationPromise: Promise<{
  token: string;
  session: CurrentSession;
  isNewSession: boolean;
}> | null = null;

// Validate an existing session or create a new one.
async function initializeSession() {
  const existingToken = sessionStorage.getItem(SESSION_TOKEN_KEY);

  if (existingToken) {
    try {
      const session = await getCurrentSession(existingToken);

      return {
        token: existingToken,
        session,
        isNewSession: false,
      };
    } catch {
      // Remove an expired or invalid token before creating a new session.
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  }

  // No valid session exists, so create a new one.
  const newSession = await startSession();

  sessionStorage.setItem(
    SESSION_TOKEN_KEY,
    newSession.session_token
  );

  const session = await getCurrentSession(newSession.session_token);

  return {
    token: newSession.session_token,
    session,
    isNewSession: true,
  };
}

export function useSession() {
  const [session, setSession] = useState<CurrentSession | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Indicates whether the current session was newly created.
  const [isNewSession, setIsNewSession] = useState(false);

  // Initialize or restore the workspace session.
  useEffect(() => {
    let isMounted = true;

    if (!initializationPromise) {
      initializationPromise = initializeSession().finally(() => {
        initializationPromise = null;
      });
    }

    const request = initializationPromise;

    request
      .then((result) => {
        if (!isMounted) return;

        setToken(result.token);
        setSession(result.session);
        setIsNewSession(result.isNewSession);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to initialize your session."
        );
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Explicitly create a fresh session after the previous one has ended.
  const startNewSession = useCallback(async () => {
    if (token || session) {
      throw new Error("A session is already active.");
    }

    setLoading(true);
    setError(null);

    try {
      // Ask the backend to create a new workspace session.
      const newSession = await startSession();

      // Save the new authentication token.
      sessionStorage.setItem(
        SESSION_TOKEN_KEY,
        newSession.session_token
      );

      // Retrieve the authenticated session details.
      const currentSession = await getCurrentSession(
        newSession.session_token
      );

      // Update the React state so the UI becomes active immediately.
      setToken(newSession.session_token);
      setSession(currentSession);
      setIsNewSession(true);
    } catch (err: unknown) {
      // Do not retain a token if session initialization fails.
      sessionStorage.removeItem(SESSION_TOKEN_KEY);

      const message =
        err instanceof Error
          ? err.message
          : "Unable to start a new session.";

      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [token, session]);

  // End the current session and remove its local authentication token.
  const terminateSession = useCallback(async () => {
    if (!token) {
      throw new Error("No active session was found.");
    }

    await endSession(token);

    sessionStorage.removeItem(SESSION_TOKEN_KEY);

    setToken(null);
    setSession(null);
    setIsNewSession(false);
    setError(null);
  }, [token]);

  return {
    session,
    token,
    loading,
    error,
    isNewSession,
    startNewSession,
    terminateSession,
  };
}

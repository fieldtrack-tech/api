"use client";

import { useEffect, useRef, useCallback } from "react";

export type SseEventHandler = (event: { type: string; payload: Record<string, unknown>; ts: string }) => void;

/**
 * useServerSentEvents — subscribes to the admin SSE stream.
 *
 * Automatically reconnects on unexpected closure using exponential back-off
 * capped at 30 seconds.  The connection is torn down when the component
 * unmounts or when `enabled` becomes false.
 *
 * @param url     Full URL of the SSE endpoint (include auth token in query if needed)
 * @param onEvent Called with each parsed server event
 * @param enabled Pass false to disable the connection (e.g. when user is not ADMIN)
 */
export function useServerSentEvents(
  url: string,
  onEvent: SseEventHandler,
  enabled = true,
) {
  const retryDelay = useRef(1000);
  const esRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!enabled) return;

    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      retryDelay.current = 1000; // reset back-off on successful open
    };

    es.onmessage = (raw) => {
      try {
        const parsed = JSON.parse(raw.data) as { type: string; payload: Record<string, unknown>; ts: string };
        onEventRef.current(parsed);
      } catch {
        // malformed frame — ignore
      }
    };

    // Named event handlers for typed events the server sends
    const TYPED_EVENTS = ["session.checkin", "session.checkout", "expense.created", "expense.status", "connected"];
    for (const eventType of TYPED_EVENTS) {
      es.addEventListener(eventType, (raw) => {
        try {
          const parsed = JSON.parse((raw as MessageEvent).data) as { type: string; payload: Record<string, unknown>; ts: string };
          onEventRef.current(parsed);
        } catch {
          // malformed frame — ignore
        }
      });
    }

    es.onerror = () => {
      es.close();
      esRef.current = null;
      // Exponential back-off capped at 30 s
      const delay = retryDelay.current;
      retryDelay.current = Math.min(delay * 2, 30_000);
      setTimeout(connect, delay);
    };
  }, [url, enabled]);

  useEffect(() => {
    if (!enabled) return;
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect, enabled]);
}

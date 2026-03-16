"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";

export interface SessionLocation {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recorded_at: string;
  sequence_number: number | null;
}

export function useSessionLocations(sessionId: string | null) {
  return useQuery<SessionLocation[]>({
    queryKey: ["session-locations", sessionId],
    enabled: sessionId !== null,
    queryFn: async () => {
      const res = await apiGet<{ success: true; data: SessionLocation[] }>(
        API.sessionLocations(sessionId!),
      );
      return res.data;
    },
  });
}

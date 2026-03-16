"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  dlq?: number;
}

export interface AdminQueuesResponse {
  success: true;
  queues: {
    analytics: QueueStats;
    distance: QueueStats;
  };
}

export function useAdminQueues() {
  return useQuery<AdminQueuesResponse>({
    queryKey: ["admin", "queues"],
    queryFn: () => apiGet<AdminQueuesResponse>(API.adminQueues),
    refetchInterval: 30_000,
  });
}

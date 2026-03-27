/**
 * Webhook testing tool — API functions.
 * Used exclusively by /webhook-test (admin-only internal tool).
 * All auth is handled automatically by the existing apiPost/apiGet client.
 */
import { apiGet, apiPost } from "@/lib/api/client";

// ─── Webhook types ────────────────────────────────────────────────────────────

export interface CreateWebhookPayload {
  url: string;
  events: string[];
  secret?: string;
}

export interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
}

export type DeliveryStatus = "success" | "failed" | "pending";

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  status: DeliveryStatus;
  response_status: number | null;
  attempt_count: number;
  created_at: string;
  error?: string | null;
  payload?: Record<string, unknown>;
}

// ─── Employee types (used to trigger webhook events) ─────────────────────────

export interface CreateEmployeePayload {
  name: string;
  phone?: string;
  employee_code: string;
}

export interface WebhookEmployeeResult {
  id: string;
  name: string;
  employee_code: string;
  phone?: string | null;
  is_active: boolean;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function createWebhook(
  payload: CreateWebhookPayload
): Promise<WebhookConfig> {
  return apiPost<WebhookConfig>("/admin/webhooks", payload);
}

export async function createEmployee(
  payload: CreateEmployeePayload
): Promise<WebhookEmployeeResult> {
  return apiPost<WebhookEmployeeResult>("/admin/employees", payload);
}

export async function getWebhookDeliveries(): Promise<WebhookDelivery[]> {
  return apiGet<WebhookDelivery[]>("/admin/webhook-deliveries");
}

export async function retryWebhookDelivery(id: string): Promise<void> {
  return apiPost<void>(`/admin/webhook-deliveries/${id}/retry`, {});
}

// ─── Crypto utilities ─────────────────────────────────────────────────────────

/** Generates a cryptographically random 32-byte hex secret. */
export function generateSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Computes HMAC-SHA256 signature in the format `sha256=<hex>`. */
export async function computeHmacSignature(
  secret: string,
  body: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body)
  );
  const hex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

/** Generates a timestamp-based employee code. */
export function generateEmployeeCode(): string {
  return `EMP${Date.now().toString(36).toUpperCase()}`;
}

/** Builds a sample curl command for a webhook endpoint. */
export function buildCurlCommand(
  webhookUrl: string,
  signature: string,
  samplePayload: string
): string {
  return `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Signature: ${signature}" \\
  -d '${samplePayload}'`;
}

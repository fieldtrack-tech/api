"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  buildCurlCommand,
  computeHmacSignature,
  createWebhook,
  generateSecret,
  type WebhookConfig,
} from "@/lib/webhook-api";

const WEBHOOK_EVENTS = [
  { value: "employee.created", label: "employee.created" },
  { value: "session.checkin", label: "session.checkin" },
  { value: "session.checkout", label: "session.checkout" },
  { value: "expense.created", label: "expense.created" },
  { value: "expense.approved", label: "expense.approved" },
  { value: "expense.rejected", label: "expense.rejected" },
];

const SAMPLE_PAYLOAD = JSON.stringify(
  { event: "test.event", timestamp: new Date().toISOString(), data: {} },
  null,
  2
);

export function WebhookSetupCard() {
  const { toast } = useToast();

  const [url, setUrl] = useState("https://webhook.site/");
  const [eventType, setEventType] = useState("employee.created");
  const [secret, setSecret] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [created, setCreated] = useState<WebhookConfig | null>(null);
  const [hmacSig, setHmacSig] = useState<string | null>(null);
  const [curlCmd, setCurlCmd] = useState<string | null>(null);

  function handleGenerateSecret() {
    setSecret(generateSecret());
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setIsBusy(true);
    setCreated(null);
    setHmacSig(null);
    setCurlCmd(null);

    try {
      const config = await createWebhook({
        url: url.trim(),
        events: [eventType],
        secret: secret.trim() || undefined,
      });
      setCreated(config);

      // Compute HMAC if a secret was provided
      if (secret.trim()) {
        const sig = await computeHmacSignature(secret.trim(), SAMPLE_PAYLOAD);
        setHmacSig(sig);
        setCurlCmd(buildCurlCommand(url.trim(), sig, SAMPLE_PAYLOAD));
      }

      toast({ title: "Webhook created", description: `ID: ${config.id}` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to create webhook",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsBusy(false);
    }
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied` });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🔗 Webhook Setup
        </CardTitle>
        <CardDescription>
          Register a webhook endpoint for a specific event
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <form onSubmit={handleCreate} className="space-y-3">
          {/* URL row */}
          <div className="space-y-1">
            <Label htmlFor="wt-url">Webhook URL</Label>
            <div className="flex gap-2">
              <Input
                id="wt-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://webhook.site/…"
                required
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyText(url, "URL")}
                title="Copy URL"
              >
                <ClipboardCopy className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                asChild
                title="Open webhook.site"
              >
                <a
                  href="https://webhook.site"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          {/* Event type */}
          <div className="space-y-1">
            <Label htmlFor="wt-event">Event Type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger id="wt-event">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEBHOOK_EVENTS.map((ev) => (
                  <SelectItem key={ev.value} value={ev.value}>
                    <span className="font-mono text-sm">{ev.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Secret */}
          <div className="space-y-1">
            <Label htmlFor="wt-secret">
              Secret{" "}
              <span className="text-muted-foreground font-normal">
                (optional, for HMAC)
              </span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="wt-secret"
                type="text"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Leave blank to skip signing"
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleGenerateSecret}
                title="Generate random secret"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              {secret && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copyText(secret, "Secret")}
                  title="Copy secret"
                >
                  <ClipboardCopy className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isBusy}>
            {isBusy ? "Creating…" : "Create Webhook"}
          </Button>
        </form>

        {/* Result */}
        {created && (
          <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Webhook registered
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <span className="text-muted-foreground">ID</span>
              <span className="font-mono break-all">{created.id}</span>
              <span className="text-muted-foreground">Events</span>
              <span>
                {created.events.map((ev) => (
                  <Badge key={ev} variant="secondary" className="font-mono text-xs mr-1">
                    {ev}
                  </Badge>
                ))}
              </span>
            </div>

            {/* HMAC signature (bonus) */}
            {hmacSig && (
              <div className="space-y-1 pt-1 border-t">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Sample HMAC Signature (X-Webhook-Signature)
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-background border px-2 py-1 text-xs">
                    {hmacSig}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-7 w-7"
                    onClick={() => copyText(hmacSig, "HMAC signature")}
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Curl command (bonus) */}
            {curlCmd && (
              <div className="space-y-1 pt-1 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Sample curl command
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-xs"
                    onClick={() => copyText(curlCmd, "curl command")}
                  >
                    <ClipboardCopy className="h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded bg-background border px-2 py-1.5 text-xs leading-relaxed">
                  {curlCmd}
                </pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

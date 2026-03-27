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
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2, RefreshCw, Zap } from "lucide-react";
import {
  createEmployee,
  generateEmployeeCode,
  type WebhookEmployeeResult,
} from "@/lib/webhook-api";

export function TriggerEventCard() {
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [employeeCode, setEmployeeCode] = useState(generateEmployeeCode());
  const [isBusy, setIsBusy] = useState(false);
  const [result, setResult] = useState<WebhookEmployeeResult | null>(null);

  async function handleTrigger(e: React.FormEvent) {
    e.preventDefault();
    setIsBusy(true);
    setResult(null);

    try {
      const employee = await createEmployee({
        name: name.trim(),
        phone: phone.trim() || undefined,
        employee_code: employeeCode.trim(),
      });
      setResult(employee);
      // Regenerate code for next attempt
      setEmployeeCode(generateEmployeeCode());
      setName("");
      setPhone("");
      toast({
        title: "Employee created",
        description: `employee.created event fired → ${employee.name}`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to create employee",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          ⚡ Trigger Event
        </CardTitle>
        <CardDescription>
          Create an employee to fire an{" "}
          <code className="rounded bg-muted px-1 text-xs">
            employee.created
          </code>{" "}
          webhook event
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <form onSubmit={handleTrigger} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Name */}
            <div className="space-y-1">
              <Label htmlFor="wt-emp-name">Full Name</Label>
              <Input
                id="wt-emp-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                required
              />
            </div>

            {/* Phone */}
            <div className="space-y-1">
              <Label htmlFor="wt-emp-phone">
                Phone{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="wt-emp-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 0100"
              />
            </div>
          </div>

          {/* Employee code */}
          <div className="space-y-1">
            <Label htmlFor="wt-emp-code">Employee Code</Label>
            <div className="flex gap-2">
              <Input
                id="wt-emp-code"
                type="text"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="EMP001"
                required
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setEmployeeCode(generateEmployeeCode())}
                title="Regenerate code"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button type="submit" className="w-full gap-2" disabled={isBusy}>
            <Zap className="h-4 w-4" />
            {isBusy ? "Creating…" : "Create Employee → Fire Webhook"}
          </Button>
        </form>

        {/* Result */}
        {result && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Event fired:{" "}
                <Badge
                  variant="secondary"
                  className="font-mono text-xs align-middle"
                >
                  employee.created
                </Badge>
              </span>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">ID</span>
              <span className="font-mono">{result.id}</span>
              <span className="text-muted-foreground">Name</span>
              <span>{result.name}</span>
              <span className="text-muted-foreground">Code</span>
              <span className="font-mono">{result.employee_code}</span>
              {result.phone && (
                <>
                  <span className="text-muted-foreground">Phone</span>
                  <span>{result.phone}</span>
                </>
              )}
              <span className="text-muted-foreground">Status</span>
              <Badge
                variant={result.is_active ? "default" : "outline"}
                className="text-xs w-fit"
              >
                {result.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface ObservabilityContext {
  [key: string]: string | number | boolean | null | undefined;
}

export interface CaptureInput {
  message: string;
  level?: "error" | "warning" | "info";
  context?: ObservabilityContext;
  error?: unknown;
}

export function toSerializableContext(
  context: ObservabilityContext | undefined
): Record<string, unknown> {
  if (!context) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export function readTraceId(context: ObservabilityContext | undefined): string | null {
  const value = context?.traceId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function emitDatadogLog(input: CaptureInput): void {
  const apiKey = process.env.DATADOG_API_KEY?.trim();
  if (!apiKey) return;
  const site = process.env.DATADOG_SITE?.trim() || "datadoghq.com";
  const service = process.env.DATADOG_SERVICE?.trim() || "gentle-stream";
  const endpoint = `https://http-intake.logs.${site}/api/v2/logs`;
  const payload = {
    ddsource: "nodejs",
    service,
    status: input.level ?? "error",
    message: input.message,
    context: toSerializableContext(input.context),
  };
  void fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "DD-API-KEY": apiKey,
    },
    body: JSON.stringify([payload]),
  }).catch(() => {
    // best effort only
  });
}

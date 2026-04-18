import {
  emitDatadogLog,
  type ObservabilityContext,
} from "@/lib/observability/shared";

/**
 * Browser-safe error reporting for client components. Avoids Node-only APIs
 * (`createRequire` / `node:module`) so the bundle can load without optional
 * `@sentry/nextjs`. Datadog HTTP logs still work when configured.
 */
export function captureException(
  error: unknown,
  context?: ObservabilityContext
): void {
  emitDatadogLog({
    level: "error",
    message: error instanceof Error ? error.message : "Unknown error",
    context,
    error,
  });
}

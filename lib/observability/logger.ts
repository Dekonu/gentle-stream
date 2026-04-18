import { captureException, captureMessage } from "@/lib/observability";

export interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}

export function logInfo(message: string, context?: LogContext): void {
  captureMessage({
    level: "info",
    message,
    context,
  });
}

export function logWarning(
  message: string,
  context?: LogContext,
  error?: unknown
): void {
  if (error !== undefined) {
    captureException(error, {
      ...(context ?? {}),
      logMessage: message,
      level: "warning",
    });
  }
  captureMessage({
    level: "warning",
    message,
    context,
  });
}

export function logError(
  message: string,
  context?: LogContext,
  error?: unknown
): void {
  if (error !== undefined) {
    captureException(error, {
      ...(context ?? {}),
      logMessage: message,
      level: "error",
    });
    return;
  }
  captureMessage({
    level: "error",
    message,
    context,
  });
}

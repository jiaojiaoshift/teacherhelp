import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { resolveTeachHelperStoragePaths } from "@/lib/server/teachhelper-storage-paths";

export interface SafeAiErrorDiagnostic {
  kind: string;
  status?: number;
  code?: string;
}

export interface AiErrorLogInput {
  diagnosticId: string;
  taskName: string;
  attempt: number;
  maxAttempts: number;
  providerName: string;
  model: string;
  wireApi: string;
  elapsedMs: number;
  diagnostic: SafeAiErrorDiagnostic;
  timestamp?: Date;
  logDirectory?: string;
}

function safeIdentifier(value: string, fallback: string): string {
  const normalized = value.trim().slice(0, 120).replace(/[^A-Za-z0-9_.:-]/g, "_");
  return normalized || fallback;
}

export function createAiErrorDiagnosticId(now = new Date()): string {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `aierr-${timestamp}-${randomUUID().slice(0, 8)}`;
}

export function resolveAiErrorLogDirectory(logDirectory?: string): string {
  return path.resolve(
    logDirectory?.trim() ||
      path.join(resolveTeachHelperStoragePaths().logsDirectory, "ai-errors")
  );
}

export async function appendAiErrorLog(input: AiErrorLogInput): Promise<string> {
  const timestamp = input.timestamp ?? new Date();
  const logDirectory = resolveAiErrorLogDirectory(input.logDirectory);
  const filePath = path.join(
    logDirectory,
    `teachhelper-ai-errors-${timestamp.toISOString().slice(0, 10)}.log`
  );
  const entry = {
    timestamp: timestamp.toISOString(),
    diagnosticId: safeIdentifier(input.diagnosticId, "aierr-unknown"),
    taskName: safeIdentifier(input.taskName, "unknown-task"),
    attempt: Math.max(1, Math.floor(input.attempt)),
    maxAttempts: Math.max(1, Math.floor(input.maxAttempts)),
    providerName: safeIdentifier(input.providerName, "unknown-provider"),
    model: safeIdentifier(input.model, "unknown-model"),
    wireApi: safeIdentifier(input.wireApi, "unknown-wire-api"),
    elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
    diagnostic: {
      kind: safeIdentifier(input.diagnostic.kind, "unknown"),
      ...(typeof input.diagnostic.status === "number"
        ? { status: input.diagnostic.status }
        : {}),
      ...(input.diagnostic.code
        ? { code: safeIdentifier(input.diagnostic.code, "unknown_code") }
        : {})
    }
  };

  await mkdir(logDirectory, { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");

  return filePath;
}

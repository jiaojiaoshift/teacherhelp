const DEFAULT_AI_REQUEST_CONCURRENCY = 12;
const MAX_AI_REQUEST_CONCURRENCY = 25;

export function resolveAiRequestConcurrency(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_AI_REQUEST_CONCURRENCY;
  }

  return Math.min(parsed, MAX_AI_REQUEST_CONCURRENCY);
}

export function resolveQuestionBoxConcurrency(
  sharedValue: string | undefined,
  legacyValue?: string
): number {
  return resolveAiRequestConcurrency(sharedValue ?? legacyValue);
}

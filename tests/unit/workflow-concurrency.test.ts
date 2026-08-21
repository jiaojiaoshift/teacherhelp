import { describe, expect, it } from "vitest";

import {
  resolveAiRequestConcurrency,
  resolveQuestionBoxConcurrency
} from "@/lib/services/workflow-concurrency";

describe("workflow concurrency", () => {
  it("uses twelve page workers by default after the upstream limit is raised", () => {
    expect(resolveQuestionBoxConcurrency(undefined)).toBe(12);
  });

  it("accepts a configured page-worker limit without consuming the upstream ceiling", () => {
    expect(resolveQuestionBoxConcurrency("20")).toBe(20);
    expect(resolveQuestionBoxConcurrency("25")).toBe(25);
    expect(resolveQuestionBoxConcurrency("40")).toBe(25);
  });

  it("uses the legacy page-only setting only when the shared request setting is absent", () => {
    expect(resolveQuestionBoxConcurrency("25", "3")).toBe(25);
    expect(resolveQuestionBoxConcurrency(undefined, "20")).toBe(20);
  });

  it("falls back for invalid or unsafe values", () => {
    expect(resolveQuestionBoxConcurrency("0")).toBe(12);
    expect(resolveQuestionBoxConcurrency("not-a-number")).toBe(12);
  });

  it("uses the same capped request pool for per-question OCR and classification", () => {
    expect(resolveAiRequestConcurrency(undefined)).toBe(12);
    expect(resolveAiRequestConcurrency("25")).toBe(25);
    expect(resolveAiRequestConcurrency("26")).toBe(25);
  });
});

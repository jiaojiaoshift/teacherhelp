import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/document-tasks/route";
import { createDocumentProcessingTask } from "@/lib/services/document-task-service";

const temporaryDirectories: string[] = [];

async function useTemporaryDataRoot() {
  const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-task-route-"));
  temporaryDirectories.push(directory);
  vi.stubEnv("TEACHHELPER_DATA_ROOT", directory);
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("document task routes", () => {
  it("returns an empty revision zero task store before the first save", async () => {
    await useTemporaryDataRoot();

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 0, tasks: [] });
  });

  it("persists valid task checkpoints", async () => {
    await useTemporaryDataRoot();
    const task = createDocumentProcessingTask({
      id: "task-1",
      runId: "run-1",
      documentId: "document-1",
      documentName: "测试卷.pdf"
    });

    const response = await POST(
      new Request("http://localhost/api/document-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: 0, tasks: [task] })
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revision: 1 });
    expect(await (await GET()).json()).toEqual({ revision: 1, tasks: [task] });
  });

  it("reports revision conflicts without replacing current tasks", async () => {
    await useTemporaryDataRoot();
    const task = createDocumentProcessingTask({
      id: "task-current",
      runId: "run-current",
      documentId: "document-current",
      documentName: "current.pdf"
    });
    const request = (tasks: typeof task[]) =>
      new Request("http://localhost/api/document-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: 0, tasks })
      });

    expect((await POST(request([task]))).status).toBe(200);
    const conflict = await POST(request([]));

    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      error: "revision_conflict",
      actualRevision: 1
    });
  });

  it("rejects malformed task payloads", async () => {
    await useTemporaryDataRoot();

    const response = await POST(
      new Request("http://localhost/api/document-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: 0, tasks: [{ id: "partial" }] })
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_document_tasks_payload" });
  });
});

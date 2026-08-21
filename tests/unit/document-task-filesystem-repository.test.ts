import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DocumentTaskFilesystemRepository,
  DocumentTaskRevisionConflictError,
  InvalidDocumentTaskStoreError
} from "@/lib/server/document-task-filesystem-repository";
import { createDocumentProcessingTask } from "@/lib/services/document-task-service";

const temporaryDirectories: string[] = [];

async function createRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-document-tasks-"));
  temporaryDirectories.push(directory);

  return {
    directory,
    repository: new DocumentTaskFilesystemRepository({ rootDirectory: directory })
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("document task filesystem repository", () => {
  it("returns revision zero and no tasks before the first save", async () => {
    const { repository } = await createRepository();

    await expect(repository.load()).resolves.toEqual({
      revision: 0,
      tasks: []
    });
  });

  it("atomically persists and reloads document task checkpoints", async () => {
    const { directory, repository } = await createRepository();
    const task = createDocumentProcessingTask({
      id: "task-1",
      runId: "run-1",
      documentId: "document-1",
      documentName: "圆周难题.pdf",
      createdAt: "2026-08-17T10:00:00.000Z",
      workflowInput: {
        subjectScope: "高中物理",
        questionPageLayoutMode: "single_column",
        hasAnswerSection: false,
        questionPageIds: ["page-1", "page-2"],
        answerPageIds: []
      }
    });

    await expect(
      repository.save({ expectedRevision: 0, tasks: [task] })
    ).resolves.toEqual({ revision: 1 });
    await expect(repository.load()).resolves.toEqual({ revision: 1, tasks: [task] });

    const stored = JSON.parse(
      await readFile(path.join(directory, "document-tasks.json"), "utf8")
    );
    expect(stored).toMatchObject({ version: 1, revision: 1, tasks: [{ id: "task-1" }] });
    expect((await readFile(path.join(directory, "document-tasks.json"), "utf8")).trim()).not.toBe(
      ""
    );
  });

  it("rejects stale revisions without overwriting the latest tasks", async () => {
    const { repository } = await createRepository();
    const task = createDocumentProcessingTask({
      id: "task-current",
      runId: "run-current",
      documentId: "document-current",
      documentName: "current.pdf"
    });

    await repository.save({ expectedRevision: 0, tasks: [task] });

    await expect(
      repository.save({ expectedRevision: 0, tasks: [] })
    ).rejects.toEqual(expect.objectContaining<DocumentTaskRevisionConflictError>({
      name: "DocumentTaskRevisionConflictError",
      actualRevision: 1
    }));
    await expect(repository.load()).resolves.toEqual({ revision: 1, tasks: [task] });
  });

  it("rejects malformed task files instead of treating them as an empty queue", async () => {
    const { directory, repository } = await createRepository();
    await writeFile(
      path.join(directory, "document-tasks.json"),
      JSON.stringify({ version: 1, revision: 2, tasks: [{ id: "partial" }] }),
      "utf8"
    );

    await expect(repository.load()).rejects.toBeInstanceOf(InvalidDocumentTaskStoreError);
  });
});

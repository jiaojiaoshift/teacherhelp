import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildInitialExamLibraryFolders,
  createDefaultSpecializedDocuments
} from "@/lib/services/exam-library-service";
import { buildPrimaryLectureSyncMetadata } from "@/lib/services/lecture-sync-metadata-service";
import { buildHelperPrimaryLectureDownload } from "@/lib/services/mobile-upload-primary-lecture-download-service";
import { buildInitialFolderTree, createCustomFolder } from "@/lib/services/folder-service";

function createFixture() {
  const questionFolders = buildInitialFolderTree();
  const physics = questionFolders.find((folder) => folder.subjectScope === "高中物理");

  if (!physics) {
    throw new Error("missing physics root");
  }

  const chapter = createCustomFolder({
    name: "力学",
    parent: physics
  });
  const topic = createCustomFolder({
    name: "牛顿定律",
    parent: chapter
  });
  const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders.concat(chapter, topic));
  const specializedTopic = examLibraryFolders.find(
    (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === topic.id
  );

  if (!specializedTopic) {
    throw new Error("missing specialized topic");
  }

  const documents = createDefaultSpecializedDocuments({
    folder: specializedTopic,
    subjectScope: specializedTopic.subjectScope
  });
  const primaryLecture = documents.find(
    (document) => document.kind === "lecture" && document.lectureVariant === "primary"
  );

  if (!primaryLecture) {
    throw new Error("missing primary lecture");
  }

  return {
    primaryLecture,
    examLibraryDocuments: documents
  };
}

describe("mobile-upload-primary-lecture-download-service", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds one downloadable primary lecture pdf and stores one exported sync snapshot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00.000Z"));

    const fixture = createFixture();
    const result = await buildHelperPrimaryLectureDownload({
      documentId: fixture.primaryLecture.id,
      examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
        document.id === fixture.primaryLecture.id
          ? {
              ...document,
              questionIds: ["q-1"],
              pendingQuestionIds: ["q-1", "q-2"],
              pendingQuestionBlocks: [
                {
                  key: "block-a",
                  label: "block-a",
                  questionIds: ["q-1", "q-2"]
                }
              ],
              syncStatus: "pending_confirmation"
            }
          : document
      ),
      questionDrafts: [
        {
          id: "q-1",
          questionNumberLabel: "3",
          ocrText: "question one"
        },
        {
          id: "q-2",
          questionNumberLabel: "4",
          ocrText: "question two"
        }
      ]
    });

    expect(result.status).toBe("ready");

    if (result.status !== "ready") {
      return;
    }

    expect(result.fileName).toBe("牛顿定律主讲义_2026-06-03.pdf");
    expect(result.blob.type).toBe("application/pdf");
    expect(result.blob.size).toBeGreaterThan(0);
    expect(
      result.examLibraryDocuments.find((document) => document.id === fixture.primaryLecture.id)
    ).toMatchObject({
      lastExportedSyncMetadata: buildPrimaryLectureSyncMetadata({
        sourceDocumentId: fixture.primaryLecture.id,
        questionIds: ["q-1", "q-2"],
        questionBlocks: [
          {
            key: "block-a",
            label: "block-a",
            questionIds: ["q-1", "q-2"]
          }
        ],
        generatedAt: "2026-06-03T12:00:00.000Z"
      })
    });
  });

  it("stores one pending-question export snapshot instead of one stale current sync snapshot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00.000Z"));

    const fixture = createFixture();
    const staleCurrentMetadata = buildPrimaryLectureSyncMetadata({
      sourceDocumentId: fixture.primaryLecture.id,
      questionIds: ["q-1"],
      questionBlocks: [
        {
          key: "block-a",
          label: "block-a",
          questionIds: ["q-1"]
        }
      ],
      generatedAt: "2026-06-01T12:00:00.000Z"
    });
    const result = await buildHelperPrimaryLectureDownload({
      documentId: fixture.primaryLecture.id,
      examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
        document.id === fixture.primaryLecture.id
          ? {
              ...document,
              questionIds: ["q-1"],
              questionBlocks: [
                {
                  key: "block-a",
                  label: "block-a",
                  questionIds: ["q-1"]
                }
              ],
              pendingQuestionIds: ["q-1", "q-2"],
              pendingQuestionBlocks: [
                {
                  key: "block-a",
                  label: "block-a",
                  questionIds: ["q-1"]
                },
                {
                  key: "block-b",
                  label: "block-b",
                  questionIds: ["q-2"]
                }
              ],
              syncStatus: "pending_confirmation",
              syncMetadata: staleCurrentMetadata
            }
          : document
      ),
      questionDrafts: [
        {
          id: "q-1",
          questionNumberLabel: "3",
          ocrText: "question one"
        },
        {
          id: "q-2",
          questionNumberLabel: "4",
          ocrText: "question two"
        }
      ]
    });

    expect(result.status).toBe("ready");

    if (result.status !== "ready") {
      return;
    }

    expect(
      result.examLibraryDocuments.find((document) => document.id === fixture.primaryLecture.id)
    ).toMatchObject({
      lastExportedSyncMetadata: buildPrimaryLectureSyncMetadata({
        sourceDocumentId: fixture.primaryLecture.id,
        questionIds: ["q-1", "q-2"],
        questionBlocks: [
          {
            key: "block-a",
            label: "block-a",
            questionIds: ["q-1"]
          },
          {
            key: "block-b",
            label: "block-b",
            questionIds: ["q-2"]
          }
        ],
        generatedAt: "2026-06-03T12:00:00.000Z"
      })
    });
  });

  it("rejects one helper primary lecture download when the target document is missing", async () => {
    const result = await buildHelperPrimaryLectureDownload({
      documentId: "missing",
      examLibraryDocuments: [],
      questionDrafts: []
    });

    expect(result).toEqual({
      status: "rejected",
      errorMessage: "主讲义文档不存在"
    });
  });
});

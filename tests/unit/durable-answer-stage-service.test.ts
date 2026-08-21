import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalLibraryFilesystemRepository } from "@/lib/server/local-library-filesystem-repository";
import { resumeDurableAnswerStage } from "@/lib/server/durable-answer-stage-service";
import type { LocalLibrarySnapshot } from "@/lib/services/local-library-contract";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";

const temporaryDirectories: string[] = [];

async function createRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-answer-resume-test-"));
  temporaryDirectories.push(directory);

  return new LocalLibraryFilesystemRepository({ rootDirectory: directory });
}

function buildSnapshot(): LocalLibrarySnapshot {
  const folders = buildInitialFolderTree();
  const examFolders = buildInitialExamLibraryFolders(folders);
  const targetFolder = folders.find(
    (folder) => folder.path.join("/") === "我的题库/高中物理/曲线运动/平抛运动基础"
  );
  const targetExamFolder = examFolders.find(
    (folder) => folder.linkedQuestionFolderId === targetFolder?.id
  );

  if (!targetFolder || !targetExamFolder) {
    throw new Error("fixture folders missing");
  }

  return {
    folders,
    pages: [
      {
        id: "question-page-1",
        documentId: "source-doc-1",
        pageNumber: 1,
        width: 1000,
        height: 1400,
        displayAssetId: "question-page-asset-1",
        analysisStatus: "done",
        reviewStatus: "reviewed"
      }
    ],
    binaryAssets: [
      {
        id: "question-page-asset-1",
        documentId: "source-doc-1",
        pageId: "question-page-1",
        kind: "display",
        mimeType: "image/png",
        byteLength: 5,
        dataUrl: "data:image/png;base64,aGVsbG8="
      }
    ],
    questionDrafts: [
      {
        id: "question-1",
        documentId: "source-doc-1",
        pageIds: ["question-page-1"],
        primaryPageId: "question-page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "question-page-1": { x: 60, y: 80, width: 880, height: 320 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.98,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.96,
        directoryPath: targetFolder.path,
        directoryCandidatePaths: [],
        questionNumberLabel: "1",
        ocrText: "1. first question",
        answerAttachments: []
      },
      {
        id: "question-2",
        documentId: "source-doc-1",
        pageIds: ["question-page-1"],
        primaryPageId: "question-page-1",
        localOrder: 2,
        globalOrder: 2,
        bboxByPage: {
          "question-page-1": { x: 60, y: 420, width: 880, height: 320 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.97,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.95,
        directoryPath: targetFolder.path,
        directoryCandidatePaths: [],
        questionNumberLabel: "1",
        ocrText: "source note\n2. second question",
        answerAttachments: []
      }
    ],
    examLibraryFolders: examFolders,
    examLibraryDocuments: [
      {
        id: "answer-sheet-1",
        folderId: targetExamFolder.id,
        library: "specialized",
        kind: "answer_sheet",
        title: "平抛运动基础答案",
        subjectScope: "高中物理",
        groupId: "group-1",
        isDefault: true,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "resequence",
        questionIds: ["question-1", "question-2"],
        rawPageAssetIds: [],
        placeholderAnswerPage: true,
        allowsQuestionMutations: true
      }
    ],
    examWorkspaceDraft: buildInitialExamWorkspaceDraft()
  };
}

function buildRenderedAnswerPage(textLines: Array<{ text: string; y1: number; y2: number }>) {
  return {
    pageNumber: 2,
    width: 1200,
    height: 1600,
    blob: new Blob(["answer-page"], { type: "image/png" }),
    textLines: textLines.map((line) => ({
      text: line.text,
      normalizedBBox: { x1: 150, y1: line.y1, x2: 850, y2: line.y2 }
    }))
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("durable-answer-stage-service", () => {
  it("atomically adds durable answer assets without changing stable question geometry", async () => {
    const repository = await createRepository();
    const initialSnapshot = buildSnapshot();
    await repository.save({ expectedRevision: 0, snapshot: initialSnapshot });
    const cropRegion = vi
      .fn()
      .mockResolvedValueOnce("data:image/png;base64,YW5zd2VyLTE=")
      .mockResolvedValueOnce("data:image/png;base64,YW5zd2VyLTI=");

    const result = await resumeDurableAnswerStage(
      {
        repository,
        expectedRevision: 1,
        documentId: "source-doc-1",
        answerStartPage: 2,
        pdfArrayBuffer: new ArrayBuffer(8)
      },
      {
        renderPdf: vi.fn().mockResolvedValue([
          buildRenderedAnswerPage([
            { text: "1. A", y1: 90, y2: 105 },
            { text: "answer one", y1: 120, y2: 300 },
            { text: "2. B", y1: 400, y2: 415 },
            { text: "answer two", y1: 440, y2: 800 }
          ])
        ]),
        detectAnswersWithAi: vi.fn(),
        cropRegion
      }
    );

    expect(result).toMatchObject({
      revision: 2,
      questionCount: 2,
      answeredQuestionCount: 2,
      attachmentCount: 2,
      source: "native_pdf_text"
    });
    const loaded = await repository.load();
    expect(loaded.snapshot.questionDrafts.map((question) => question.id)).toEqual([
      "question-1",
      "question-2"
    ]);
    expect(loaded.snapshot.questionDrafts.map((question) => question.bboxByPage)).toEqual(
      initialSnapshot.questionDrafts.map((question) => question.bboxByPage)
    );
    expect(
      loaded.snapshot.questionDrafts.map((question) => question.questionNumberLabel)
    ).toEqual(["1", "2"]);
    expect(loaded.snapshot.questionDrafts.map((question) => question.answerAttachments)).toEqual([
      [expect.objectContaining({ kind: "matched" })],
      [expect.objectContaining({ kind: "matched" })]
    ]);
    expect(loaded.snapshot.binaryAssets).toHaveLength(3);
    expect(loaded.snapshot.examLibraryDocuments[0]).toMatchObject({
      syncStatus: "idle",
      placeholderAnswerPage: false
    });
  });

  it("resumes a partially persisted answer stage without replacing existing attachments", async () => {
    const repository = await createRepository();
    const initialSnapshot = buildSnapshot();
    const existingAttachment = {
      id: "existing-answer-attachment-1",
      assetId: "existing-answer-asset-1",
      kind: "matched" as const
    };
    initialSnapshot.binaryAssets.push({
      id: existingAttachment.assetId,
      documentId: "source-doc-1",
      pageId: "durable-answer-page-source-doc-1-2",
      kind: "display",
      mimeType: "image/png",
      byteLength: 6,
      dataUrl: "data:image/png;base64,YW5zd2Vy"
    });
    initialSnapshot.questionDrafts[0] = {
      ...initialSnapshot.questionDrafts[0],
      answerAttachments: [existingAttachment]
    };
    await repository.save({ expectedRevision: 0, snapshot: initialSnapshot });
    const cropRegion = vi.fn().mockResolvedValue("data:image/png;base64,YW5zd2VyLTI=");

    const result = await resumeDurableAnswerStage(
      {
        repository,
        expectedRevision: 1,
        documentId: "source-doc-1",
        answerStartPage: 2,
        pdfArrayBuffer: new ArrayBuffer(8)
      },
      {
        renderPdf: vi.fn().mockResolvedValue([
          buildRenderedAnswerPage([
            { text: "1. A", y1: 90, y2: 105 },
            { text: "answer one", y1: 120, y2: 300 },
            { text: "2. B", y1: 400, y2: 415 },
            { text: "answer two", y1: 440, y2: 800 }
          ])
        ]),
        detectAnswersWithAi: vi.fn(),
        cropRegion
      }
    );

    expect(result).toMatchObject({
      revision: 2,
      questionCount: 2,
      answeredQuestionCount: 2,
      attachmentCount: 1,
      source: "native_pdf_text"
    });
    expect(cropRegion).toHaveBeenCalledTimes(1);

    const loaded = await repository.load();
    expect(loaded.snapshot.questionDrafts[0].answerAttachments).toEqual([
      existingAttachment
    ]);
    expect(loaded.snapshot.questionDrafts[1].answerAttachments).toEqual([
      expect.objectContaining({ kind: "matched" })
    ]);
    expect(loaded.snapshot.binaryAssets).toHaveLength(3);
    expect(loaded.snapshot.examLibraryDocuments[0]).toMatchObject({
      placeholderAnswerPage: false
    });
  });

  it("falls back to AI detections when native PDF anchors are incomplete", async () => {
    const repository = await createRepository();
    await repository.save({ expectedRevision: 0, snapshot: buildSnapshot() });
    const detectAnswersWithAi = vi.fn().mockResolvedValue([
      {
        id: "ai-answer-1",
        pageId: "durable-answer-page-source-doc-1-2",
        pageNumber: 2,
        answerLabel: "1",
        confidence: 0.98,
        normalizedBBox: { x1: 100, y1: 100, x2: 900, y2: 360 }
      },
      {
        id: "ai-answer-2",
        pageId: "durable-answer-page-source-doc-1-2",
        pageNumber: 2,
        answerLabel: "2",
        confidence: 0.97,
        normalizedBBox: { x1: 100, y1: 380, x2: 900, y2: 800 }
      }
    ]);

    const result = await resumeDurableAnswerStage(
      {
        repository,
        expectedRevision: 1,
        documentId: "source-doc-1",
        answerStartPage: 2,
        pdfArrayBuffer: new ArrayBuffer(8)
      },
      {
        renderPdf: vi.fn().mockResolvedValue([
          buildRenderedAnswerPage([{ text: "1. A", y1: 90, y2: 105 }])
        ]),
        detectAnswersWithAi,
        cropRegion: vi.fn().mockResolvedValue("data:image/png;base64,YW5zd2Vy")
      }
    );

    expect(result.source).toBe("ai_fallback");
    expect(result.answeredQuestionCount).toBe(2);
    expect(detectAnswersWithAi).toHaveBeenCalledTimes(1);
  });

  it("does not commit when both native layout and AI detection are incomplete", async () => {
    const repository = await createRepository();
    await repository.save({ expectedRevision: 0, snapshot: buildSnapshot() });

    await expect(
      resumeDurableAnswerStage(
        {
          repository,
          expectedRevision: 1,
          documentId: "source-doc-1",
          answerStartPage: 2,
          pdfArrayBuffer: new ArrayBuffer(8)
        },
        {
          renderPdf: vi.fn().mockResolvedValue([
            buildRenderedAnswerPage([{ text: "1. A", y1: 90, y2: 105 }])
          ]),
          detectAnswersWithAi: vi.fn().mockResolvedValue([]),
          cropRegion: vi.fn()
        }
      )
    ).rejects.toThrow(/incomplete/i);

    const loaded = await repository.load();
    expect(loaded.revision).toBe(1);
    expect(loaded.snapshot.questionDrafts.every((question) => !question.answerAttachments?.length)).toBe(
      true
    );
    expect(loaded.snapshot.binaryAssets).toHaveLength(1);
  });
});

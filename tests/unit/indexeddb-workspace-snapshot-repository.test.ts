import { beforeEach, describe, expect, it } from "vitest";

import { resetDbForTests } from "@/lib/db/client";
import { IndexedDbWorkspaceSnapshotRepository } from "@/lib/repositories/indexeddb/workspace-snapshot-repository";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";

describe("indexeddb workspace snapshot repository", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("persists and reads back the latest workspace snapshot with phase two fields", async () => {
    const repository = new IndexedDbWorkspaceSnapshotRepository();
    const folders = buildInitialFolderTree();

    await repository.save({
      selectedPageId: "page-1",
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 2,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: "q-12",
              status: "pending"
            },
            {
              id: "match-2",
              answerLabel: "15",
              suggestedQuestionId: null,
              status: "pending"
            }
          ],
          answerSection: {
            status: "confirmed",
            hasAnswerSection: true,
            suggestedSplitPage: 25,
            confirmedSplitPage: 24
          }
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      folders,
      examLibraryFolders: buildInitialExamLibraryFolders(folders),
      examLibraryDocuments: [],
      examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
      mobileUploadTasks: [
        {
          id: "task-1",
          deviceId: "device-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "specialized--folder-1--archive--lecture",
          targetNodePath: ["专题卷库", "高中数学", "函数", "导数", "讲义归档"],
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "张三_高一_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "stored",
          createdAt: "2026-06-03T08:00:00.000Z"
        }
      ],
      pendingUploadedFullPaperDraft: null,
      binaryAssets: [
        {
          id: "asset-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 4096
        }
      ],
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 100, y: 120, width: 800, height: 300 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.91,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.93,
          directoryPath: ["我的题库", "高中数学", "函数"],
          directoryCandidatePaths: [],
          ocrText: "processed prompt",
          lastBulkConfirmationId: null,
          lastSemanticRevisionSource: "initial_classification",
          analysisData: {
            status: "done",
            updatedAt: "2026-06-02T00:00:00.000Z",
            solution: "Step 1",
            answer: "B"
          },
          answerAttachments: [
            {
              id: "answer-1",
              assetId: "asset-answer-1",
              kind: "matched"
            }
          ]
        }
      ],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: "q-1",
      lastBulkConfirmation: null
    });

    const loaded = await repository.load();

    expect(loaded?.selectedPageId).toBe("page-1");
    expect(loaded?.documents).toHaveLength(1);
    expect(loaded?.documents[0].answerSection).toEqual({
      status: "confirmed",
      hasAnswerSection: true,
      suggestedSplitPage: 25,
      confirmedSplitPage: 24
    });
    expect(loaded?.documents[0].pendingAnswerMatch).toBe(true);
    expect(loaded?.documents[0].pendingAnswerMatchCount).toBe(2);
    expect(loaded?.documents[0].pendingAnswerMatches).toEqual([
      {
        id: "match-1",
        answerLabel: "12",
        suggestedQuestionId: "q-12",
        status: "pending"
      },
      {
        id: "match-2",
        answerLabel: "15",
        suggestedQuestionId: null,
        status: "pending"
      }
    ]);
    expect(loaded?.pages).toHaveLength(1);
    expect(loaded?.examLibraryFolders.length).toBeGreaterThan(0);
    expect(loaded?.examWorkspaceDraft.selectedLibrary).toBe("specialized");
    expect(loaded?.mobileUploadTasks).toEqual([
      {
        id: "task-1",
        deviceId: "device-a",
        uploadKind: "lecture_archive_pdf",
        targetNodeId: "specialized--folder-1--archive--lecture",
        targetNodePath: ["专题卷库", "高中数学", "函数", "导数", "讲义归档"],
        originalFileName: "camera-scan.pdf",
        normalizedFileName: "张三_高一_26_06_03.pdf",
        mimeType: "application/pdf",
        status: "stored",
        createdAt: "2026-06-03T08:00:00.000Z"
      }
    ]);
    expect(loaded?.questionDrafts[0]).toMatchObject({
      id: "q-1",
      ocrText: "processed prompt",
      analysisData: {
        status: "done",
        answer: "B"
      }
    });
  });
});

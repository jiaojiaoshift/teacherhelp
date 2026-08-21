import { afterEach, describe, expect, it } from "vitest";

import {
  GET as getMobileUploadWorkspaceSync,
  POST as postMobileUploadWorkspaceSync
} from "@/app/api/mobile-upload/workspace-sync/route";
import {
  clearMobileUploadHelperStateForTests,
  getMobileUploadHelperWorkspaceSnapshot
} from "@/lib/server/mobile-upload-helper-state";
import {
  buildInitialExamLibraryFolders,
  createCustomFullLibraryFolder,
  createDefaultSpecializedDocuments,
  ensureExamLibraryFolders
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { createCustomFolder } from "@/lib/services/folder-service";

function createWorkspaceSyncFixture() {
  const questionFolders = buildInitialFolderTree();
  const physicsSubject = questionFolders.find(
    (folder) => folder.kind === "system" && folder.depth === 1 && folder.subjectScope === "高中物理"
  );

  if (!physicsSubject) {
    throw new Error("missing physics subject");
  }

  const chapter = createCustomFolder({
    name: "力学",
    parent: physicsSubject
  });
  const topic = createCustomFolder({
    name: "牛顿定律",
    parent: chapter
  });
  const allQuestionFolders = questionFolders.concat(chapter, topic);
  const examLibraryFoldersBase = buildInitialExamLibraryFolders(allQuestionFolders);
  const specializedTopicFolder = examLibraryFoldersBase.find(
    (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === topic.id
  );
  const specializedArchiveFolder = examLibraryFoldersBase.find(
    (folder) => folder.role === "lecture_archive" && folder.parentId === specializedTopicFolder?.id
  );
  const fullSubjectFolder = examLibraryFoldersBase.find(
    (folder) => folder.library === "full" && folder.linkedQuestionFolderId === physicsSubject.id
  );
  const fullChapterFolder = examLibraryFoldersBase.find(
    (folder) => folder.library === "full" && folder.linkedQuestionFolderId === chapter.id
  );

  if (!specializedTopicFolder || !specializedArchiveFolder || !fullSubjectFolder || !fullChapterFolder) {
    throw new Error("missing exam library folders");
  }

  const customFullFolder = createCustomFullLibraryFolder({
    parent: fullChapterFolder,
    name: "牛顿定律套卷"
  });

  if (!customFullFolder) {
    throw new Error("missing custom full folder");
  }

  const examLibraryFolders = ensureExamLibraryFolders({
    questionFolders: allQuestionFolders,
    existingExamLibraryFolders: examLibraryFoldersBase.concat(customFullFolder)
  });
  const examLibraryDocuments = createDefaultSpecializedDocuments({
    folder: specializedTopicFolder,
    subjectScope: specializedTopicFolder.subjectScope
  });
  const primaryLecture = examLibraryDocuments.find(
    (document) => document.kind === "lecture" && document.lectureVariant === "primary"
  );

  if (!primaryLecture) {
    throw new Error("missing primary lecture");
  }

  return {
    questionFolders: allQuestionFolders,
    examLibraryFolders,
    examLibraryDocuments,
    specializedTopicFolder,
    specializedArchiveFolder,
    customFullFolder,
    primaryLecture
  };
}

describe("mobile upload workspace sync route", () => {
  afterEach(() => {
    clearMobileUploadHelperStateForTests();
  });

  it("stores one reduced workspace snapshot for later mobile-upload routing", async () => {
    const questionFolders = buildInitialFolderTree();
    const mobileUploadTasks = [
      {
        id: "task-1",
        deviceId: "device-a",
        uploadKind: "lecture_archive_pdf" as const,
        targetNodeId: "specialized-folder-1--archive--lecture",
        targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
        originalFileName: "camera-scan.pdf",
        normalizedFileName: "王明_高二_26_06_03.pdf",
        mimeType: "application/pdf" as const,
        status: "queued" as const,
        createdAt: "2026-06-03T12:08:00.000Z"
      }
    ];

    const response = await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders,
          examLibraryFolders: [],
          examLibraryDocuments: [],
          mobileUploadTasks
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "synced",
      questionFolderCount: questionFolders.length,
      examLibraryFolderCount: 0,
      examLibraryDocumentCount: 0
    });
    expect(getMobileUploadHelperWorkspaceSnapshot()).toEqual({
      questionFolders,
      examLibraryFolders: [],
      examLibraryDocuments: [],
      mobileUploadTasks,
      pendingUploadedFullPaperDraft: null
    });
  });

  it("stores one pending uploaded full-paper draft in the helper workspace snapshot", async () => {
    const questionFolders = buildInitialFolderTree();

    const response = await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders,
          examLibraryFolders: [],
          examLibraryDocuments: [],
          mobileUploadTasks: [
            {
              id: "task-full-1",
              deviceId: "android-full-1",
              uploadKind: "full_paper_pdf" as const,
              targetNodeId: "full-folder-1",
              targetNodePath: ["full-library", "physics", "mechanics", "newton-paper"],
              originalFileName: "suite.pdf",
              normalizedFileName: "suite.pdf",
              mimeType: "application/pdf" as const,
              status: "processing" as const,
              createdAt: "2026-06-04T08:02:00.000Z"
            }
          ],
          pendingUploadedFullPaperDraft: {
            id: "draft-full-1",
            folderId: "full-folder-1",
            fileName: "suite.pdf",
            sourceAssetId: "asset-source-1",
            sourceDocumentId: "draft-full-1",
            sourceUploadTaskId: "task-full-1",
            pageCount: 2,
            answerSection: {
              status: "suggested",
              hasAnswerSection: true,
              suggestedSplitPage: 2,
              confirmedSplitPage: null
            },
            uploadedPdfPages: []
          }
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    expect(response.status).toBe(200);
    expect(getMobileUploadHelperWorkspaceSnapshot()).toMatchObject({
      pendingUploadedFullPaperDraft: {
        id: "draft-full-1",
        sourceUploadTaskId: "task-full-1",
        pageCount: 2
      }
    });
  });

  it("preserves one helper pending uploaded full-paper draft when one stale client sync clears it while the linked task is still active", async () => {
    const questionFolders = buildInitialFolderTree();

    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders,
          examLibraryFolders: [],
          examLibraryDocuments: [],
          mobileUploadTasks: [
            {
              id: "task-full-1",
              deviceId: "android-full-1",
              uploadKind: "full_paper_pdf" as const,
              targetNodeId: "full-folder-1",
              targetNodePath: ["full-library", "physics", "mechanics", "newton-paper"],
              originalFileName: "suite.pdf",
              normalizedFileName: "suite.pdf",
              mimeType: "application/pdf" as const,
              status: "processing" as const,
              createdAt: "2026-06-04T08:02:00.000Z"
            }
          ],
          pendingUploadedFullPaperDraft: {
            id: "draft-full-1",
            folderId: "full-folder-1",
            fileName: "suite.pdf",
            sourceAssetId: "asset-source-1",
            sourceDocumentId: "draft-full-1",
            sourceUploadTaskId: "task-full-1",
            pageCount: 2,
            answerSection: {
              status: "suggested",
              hasAnswerSection: true,
              suggestedSplitPage: 2,
              confirmedSplitPage: null
            },
            uploadedPdfPages: []
          }
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders,
          examLibraryFolders: [],
          examLibraryDocuments: [],
          mobileUploadTasks: [],
          pendingUploadedFullPaperDraft: null
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    expect(getMobileUploadHelperWorkspaceSnapshot()).toMatchObject({
      mobileUploadTasks: [
        expect.objectContaining({
          id: "task-full-1",
          status: "processing"
        })
      ],
      pendingUploadedFullPaperDraft: {
        id: "draft-full-1",
        sourceUploadTaskId: "task-full-1"
      }
    });
  });

  it("preserves helper-created archive documents and tasks when one stale client sync omits them", async () => {
    const fixture = createWorkspaceSyncFixture();

    clearMobileUploadHelperStateForTests();
    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders: fixture.questionFolders,
          examLibraryFolders: fixture.examLibraryFolders,
          examLibraryDocuments: fixture.examLibraryDocuments.concat({
            id: "archive-doc-1",
            folderId: fixture.specializedArchiveFolder.id,
            library: "specialized",
            kind: "lecture",
            lectureVariant: "archive",
            title: "鐜嬫槑_楂樹簩_26_06_03",
            subjectScope: null,
            groupId: null,
            isDefault: false,
            sourceMode: "uploaded_pdf",
            syncBinding: "independent",
            syncStatus: "idle",
            numberingMode: "resequence",
            questionIds: [],
            rawPageAssetIds: ["asset-archive-1"],
            placeholderAnswerPage: false,
            allowsQuestionMutations: false,
            sourceUploadTaskId: "task-archive-1"
          }),
          mobileUploadTasks: [
            {
              id: "task-archive-1",
              deviceId: "android-a",
              uploadKind: "lecture_archive_pdf" as const,
              targetNodeId: fixture.specializedArchiveFolder.id,
              targetNodePath: fixture.specializedArchiveFolder.path,
              originalFileName: "camera-scan.pdf",
              normalizedFileName: "鐜嬫槑_楂樹簩_26_06_03.pdf",
              mimeType: "application/pdf" as const,
              status: "completed" as const,
              createdAt: "2026-06-03T12:08:00.000Z"
            }
          ]
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders: fixture.questionFolders,
          examLibraryFolders: fixture.examLibraryFolders,
          examLibraryDocuments: fixture.examLibraryDocuments,
          mobileUploadTasks: []
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    expect(getMobileUploadHelperWorkspaceSnapshot()).toMatchObject({
      examLibraryDocuments: expect.arrayContaining([
        expect.objectContaining({
          id: "archive-doc-1",
          sourceUploadTaskId: "task-archive-1"
        })
      ]),
      mobileUploadTasks: expect.arrayContaining([
        expect.objectContaining({
          id: "task-archive-1",
          status: "completed"
        })
      ])
    });
  });

  it("preserves one helper-updated primary lecture document when one stale client sync sends the older version", async () => {
    const fixture = createWorkspaceSyncFixture();

    clearMobileUploadHelperStateForTests();
    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders: fixture.questionFolders,
          examLibraryFolders: fixture.examLibraryFolders,
          examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
            document.id === fixture.primaryLecture.id
              ? {
                  ...document,
                  rawPageAssetIds: ["asset-primary-1"],
                  sourceUploadTaskId: "task-primary-1"
                }
              : document
          ),
          mobileUploadTasks: [
            {
              id: "task-primary-1",
              deviceId: "android-b",
              uploadKind: "primary_lecture_pdf" as const,
              targetNodeId: fixture.primaryLecture.id,
              targetNodePath:
                fixture.examLibraryFolders.find((folder) => folder.id === fixture.primaryLecture.folderId)
                  ?.path ?? [],
              originalFileName: "latest.pdf",
              normalizedFileName: "鐗涢】瀹氬緥涓昏涔?pdf",
              mimeType: "application/pdf" as const,
              status: "completed" as const,
              createdAt: "2026-06-03T12:09:00.000Z"
            }
          ]
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders: fixture.questionFolders,
          examLibraryFolders: fixture.examLibraryFolders,
          examLibraryDocuments: fixture.examLibraryDocuments,
          mobileUploadTasks: []
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    expect(
      getMobileUploadHelperWorkspaceSnapshot()?.examLibraryDocuments.find(
        (document) => document.id === fixture.primaryLecture.id
      )
    ).toMatchObject({
      rawPageAssetIds: ["asset-primary-1"],
      sourceUploadTaskId: "task-primary-1"
    });
  });

  it("returns one question-bank target tree filtered to question folders", async () => {
    const fixture = createWorkspaceSyncFixture();

    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders: fixture.questionFolders,
          examLibraryFolders: fixture.examLibraryFolders,
          examLibraryDocuments: fixture.examLibraryDocuments,
          mobileUploadTasks: []
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    const response = await getMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync?uploadKind=question_bank_pdf")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      uploadKind: "question_bank_pdf",
      targetNodes: expect.arrayContaining([
        {
          id: fixture.specializedTopicFolder.linkedQuestionFolderId,
          name: "牛顿定律",
          path: ["我的题库", "高中物理", "力学", "牛顿定律"],
          targetKind: "question_folder"
        }
      ])
    });
  });

  it("returns one full-paper target tree filtered to full-library folders", async () => {
    const fixture = createWorkspaceSyncFixture();

    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders: fixture.questionFolders,
          examLibraryFolders: fixture.examLibraryFolders,
          examLibraryDocuments: fixture.examLibraryDocuments,
          mobileUploadTasks: []
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    const response = await getMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync?uploadKind=full_paper_pdf")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      uploadKind: "full_paper_pdf",
      targetNodes: expect.arrayContaining([
        {
          id: fixture.customFullFolder.id,
          name: "牛顿定律套卷",
          path: ["套卷库", "高中物理", "力学", "牛顿定律套卷"],
          targetKind: "exam_folder"
        }
      ])
    });
    expect(
      payload.targetNodes.some((node: { id: string }) => node.id === fixture.specializedTopicFolder.id)
    ).toBe(false);
  });

  it("returns one lecture-archive target tree filtered to third-level folders", async () => {
    const fixture = createWorkspaceSyncFixture();

    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders: fixture.questionFolders,
          examLibraryFolders: fixture.examLibraryFolders,
          examLibraryDocuments: fixture.examLibraryDocuments,
          mobileUploadTasks: []
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    const response = await getMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync?uploadKind=lecture_archive_pdf")
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      uploadKind: "lecture_archive_pdf",
      targetNodes: expect.arrayContaining([
        {
          id: fixture.specializedTopicFolder.id,
          name: "牛顿定律",
          path: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          targetKind: "exam_folder"
        },
        {
          id: fixture.customFullFolder.id,
          name: "牛顿定律套卷",
          path: ["套卷库", "高中物理", "力学", "牛顿定律套卷"],
          targetKind: "exam_folder"
        }
      ])
    });
    expect(
      payload.targetNodes.some((node: { id: string }) => node.id === fixture.specializedArchiveFolder.id)
    ).toBe(false);
  });

  it("returns one primary-lecture target list filtered to primary lecture documents", async () => {
    const fixture = createWorkspaceSyncFixture();

    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders: fixture.questionFolders,
          examLibraryFolders: fixture.examLibraryFolders,
          examLibraryDocuments: fixture.examLibraryDocuments,
          mobileUploadTasks: []
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    const response = await getMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync?uploadKind=primary_lecture_pdf")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      uploadKind: "primary_lecture_pdf",
      targetNodes: [
        {
          id: fixture.primaryLecture.id,
          name: fixture.primaryLecture.title,
          path: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          targetKind: "exam_document"
        }
      ]
    });
  });

  it("rejects one workspace-target query when upload kind is unsupported", async () => {
    const response = await getMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync?uploadKind=unknown")
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "移动上传用途无效"
    });
  });
  it("rejects one workspace sync post when the payload json is malformed", async () => {
    const response = await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: "{bad-json",
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u5de5\u4f5c\u533a\u5feb\u7167\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
    });
  });

  it("rejects one workspace sync post when the payload json is not one object", async () => {
    const response = await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify([]),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u5de5\u4f5c\u533a\u5feb\u7167\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
    });
    expect(getMobileUploadHelperWorkspaceSnapshot()).toBeNull();
  });

  it("rejects one workspace sync post when one nested snapshot field shape is invalid", async () => {
    const response = await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders: "invalid",
          examLibraryFolders: [],
          examLibraryDocuments: [],
          mobileUploadTasks: []
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u5de5\u4f5c\u533a\u5feb\u7167\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
    });
    expect(getMobileUploadHelperWorkspaceSnapshot()).toBeNull();
  });

  it("rejects one workspace sync post when one snapshot collection contains invalid items", async () => {
    const response = await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders: ["invalid-folder"],
          examLibraryFolders: [],
          examLibraryDocuments: [],
          mobileUploadTasks: []
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u5de5\u4f5c\u533a\u5feb\u7167\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
    });
    expect(getMobileUploadHelperWorkspaceSnapshot()).toBeNull();
  });

  it("rejects one workspace sync post when one required top-level snapshot collection is missing", async () => {
    const invalidPayloads = [
      {
        examLibraryFolders: [],
        examLibraryDocuments: [],
        mobileUploadTasks: []
      },
      {
        questionFolders: [],
        examLibraryDocuments: [],
        mobileUploadTasks: []
      },
      {
        questionFolders: [],
        examLibraryFolders: [],
        mobileUploadTasks: []
      }
    ];

    for (const payload of invalidPayloads) {
      const response = await postMobileUploadWorkspaceSync(
        new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json"
          }
        })
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        status: "rejected",
        errorMessage: "\u5de5\u4f5c\u533a\u5feb\u7167\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
      });
      expect(getMobileUploadHelperWorkspaceSnapshot()).toBeNull();
    }
  });
});

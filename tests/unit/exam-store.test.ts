import { beforeEach, describe, expect, it } from "vitest";

import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useExamStore } from "@/lib/stores/exam-store";

describe("exam-store", () => {
  type HydrateExamStoreSnapshot = Parameters<
    ReturnType<typeof useExamStore.getState>["hydrateWorkspaceState"]
  >[0];

  beforeEach(() => {
    useExamStore.setState({
      examLibraryFolders: useExamStore.getState().examLibraryFolders,
      examLibraryDocuments: [],
      examWorkspaceDraft: {
        selectedLibrary: "specialized",
        selectedFolderId: null,
        selectedDocumentId: null
      },
      mobileUploadTasks: [],
      pendingUploadedFullPaperDraft: null,
      hydrateWorkspaceState: useExamStore.getState().hydrateWorkspaceState,
      setExamLibraryFolders: useExamStore.getState().setExamLibraryFolders,
      createExamLibraryFolder: useExamStore.getState().createExamLibraryFolder,
      deleteExamLibraryFolder: useExamStore.getState().deleteExamLibraryFolder,
      setExamLibraryDocuments: useExamStore.getState().setExamLibraryDocuments,
      upsertExamLibraryDocument: useExamStore.getState().upsertExamLibraryDocument,
      setMobileUploadTasks: useExamStore.getState().setMobileUploadTasks,
      upsertMobileUploadTask: useExamStore.getState().upsertMobileUploadTask,
      setExamWorkspaceDraft: useExamStore.getState().setExamWorkspaceDraft,
      setPendingUploadedFullPaperDraft: useExamStore.getState().setPendingUploadedFullPaperDraft,
      updateUploadedPdfPageReviewStatus:
        useExamStore.getState().updateUploadedPdfPageReviewStatus,
      confirmExamDocumentSync:
        useExamStore.getState().confirmExamDocumentSync,
      confirmPendingUploadedFullPaperDraft:
        useExamStore.getState().confirmPendingUploadedFullPaperDraft,
      patchPendingExamDocumentGroup:
        useExamStore.getState().patchPendingExamDocumentGroup,
      finalizeUploadedPdfDocumentGroup:
        useExamStore.getState().finalizeUploadedPdfDocumentGroup
    });
  });

  it("defaults to the specialized library workspace", () => {
    expect(useExamStore.getState().examWorkspaceDraft).toEqual({
      selectedLibrary: "specialized",
      selectedFolderId: null,
      selectedDocumentId: null
    });
  });

  it("keeps safe defaults when hydrating an old workspace snapshot without exam-library fields", () => {
    const folders = buildInitialFolderTree();

    try {
      useExamStore.getState().hydrateWorkspaceState({
        examLibraryFolders: undefined,
        examLibraryDocuments: undefined,
        examWorkspaceDraft: undefined
      } as unknown as HydrateExamStoreSnapshot);

      expect(useExamStore.getState().examLibraryFolders).toEqual(
        buildInitialExamLibraryFolders(folders)
      );
      expect(useExamStore.getState().examLibraryDocuments).toEqual([]);
      expect(useExamStore.getState().examWorkspaceDraft).toEqual(buildInitialExamWorkspaceDraft());
    } finally {
      useExamStore.setState({
        examLibraryFolders: buildInitialExamLibraryFolders(folders),
        examLibraryDocuments: [],
        examWorkspaceDraft: buildInitialExamWorkspaceDraft()
      });
    }
  });

  it("merges workspace draft updates", () => {
    useExamStore.getState().setExamWorkspaceDraft({
      selectedLibrary: "full",
      selectedFolderId: "full-root"
    });

    expect(useExamStore.getState().examWorkspaceDraft).toEqual({
      selectedLibrary: "full",
      selectedFolderId: "full-root",
      selectedDocumentId: null
    });
  });

  it("upserts one exam library document by id", () => {
    useExamStore.getState().upsertExamLibraryDocument({
      id: "doc-1",
      folderId: "specialized-root",
      library: "specialized",
      kind: "lecture",
      title: "lecture-a",
      subjectScope: null,
      groupId: null,
      isDefault: false,
      sourceMode: "freeform",
      syncBinding: "independent",
      syncStatus: "idle",
      numberingMode: "resequence",
      questionIds: [],
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      allowsQuestionMutations: true
    });
    useExamStore.getState().upsertExamLibraryDocument({
      id: "doc-1",
      folderId: "specialized-root",
      library: "specialized",
      kind: "lecture",
      title: "lecture-b",
      subjectScope: null,
      groupId: null,
      isDefault: false,
      sourceMode: "freeform",
      syncBinding: "independent",
      syncStatus: "idle",
      numberingMode: "resequence",
      questionIds: [],
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      allowsQuestionMutations: true
    });

    expect(useExamStore.getState().examLibraryDocuments).toHaveLength(1);
    expect(useExamStore.getState().examLibraryDocuments[0].title).toBe("lecture-b");
  });

  it("upserts one mobile upload task by id", () => {
    useExamStore.getState().upsertMobileUploadTask({
      id: "task-1",
      deviceId: "device-a",
      uploadKind: "lecture_archive_pdf",
      targetNodeId: "folder-1",
      targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
      originalFileName: "随手命名.pdf",
      normalizedFileName: "张三_高一_26_06_03.pdf",
      mimeType: "application/pdf",
      status: "received",
      createdAt: "2026-06-03T08:00:00.000Z"
    });
    useExamStore.getState().upsertMobileUploadTask({
      id: "task-1",
      deviceId: "device-a",
      uploadKind: "lecture_archive_pdf",
      targetNodeId: "folder-1",
      targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
      originalFileName: "随手命名.pdf",
      normalizedFileName: "张三_高一_26_06_03.pdf",
      mimeType: "application/pdf",
      status: "completed",
      createdAt: "2026-06-03T08:00:00.000Z"
    });

    expect(useExamStore.getState().mobileUploadTasks).toHaveLength(1);
    expect(useExamStore.getState().mobileUploadTasks[0]).toMatchObject({
      id: "task-1",
      status: "completed",
      normalizedFileName: "张三_高一_26_06_03.pdf"
    });
  });

  it("creates one custom full-library folder under the selected parent", () => {
    const parent = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.id === "full-root");

    expect(parent).toBeTruthy();

    const folder = useExamStore.getState().createExamLibraryFolder(parent!.id, "custom-a");

    expect(folder).toMatchObject({
      parentId: parent!.id,
      library: "full",
      kind: "custom",
      name: "custom-a",
      linkedQuestionFolderId: null
    });
    expect(useExamStore.getState().examLibraryFolders.find((item) => item.id === folder?.id)).toBeTruthy();
  });

  it("renames one custom full-library folder and rewrites descendants, documents, and selection", () => {
    const fullRoot = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.id === "full-root");

    expect(fullRoot).toBeTruthy();

    const parent = useExamStore.getState().createExamLibraryFolder(fullRoot!.id, "训练");

    expect(parent).toBeTruthy();

    const child = useExamStore.getState().createExamLibraryFolder(parent!.id, "高频");

    expect(child).toBeTruthy();

    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: child!.id,
          library: "full",
          kind: "paper",
          title: "paper one",
          subjectScope: child!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: child!.id,
        selectedDocumentId: "paper-1"
      }
    });

    const renamed = useExamStore.getState().renameExamLibraryFolder(parent!.id, "强化训练");

    expect(renamed).toMatchObject({
      name: "强化训练",
      path: ["套卷库", "强化训练"]
    });

    const renamedChild = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.name === "高频" && folder.parentId === renamed?.id);

    expect(renamedChild).toMatchObject({
      path: ["套卷库", "强化训练", "高频"]
    });
    expect(useExamStore.getState().examLibraryDocuments[0]).toMatchObject({
      folderId: renamedChild?.id
    });
    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedFolderId: renamedChild?.id,
      selectedDocumentId: "paper-1"
    });
  });

  it("deletes one custom full-library folder subtree and resets selection to its parent", () => {
    const fullRoot = useExamStore
      .getState()
      .examLibraryFolders.find((folder) => folder.id === "full-root");

    expect(fullRoot).toBeTruthy();

    const parent = useExamStore.getState().createExamLibraryFolder(fullRoot!.id, "训练");

    expect(parent).toBeTruthy();

    const child = useExamStore.getState().createExamLibraryFolder(parent!.id, "高频");

    expect(child).toBeTruthy();

    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: child!.id,
          library: "full",
          kind: "paper",
          title: "paper one",
          subjectScope: child!.subjectScope,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: child!.id,
        selectedDocumentId: "paper-1"
      }
    });

    const deletedParent = useExamStore.getState().deleteExamLibraryFolder(parent!.id);

    expect(deletedParent).toMatchObject({
      id: fullRoot!.id
    });
    expect(
      useExamStore.getState().examLibraryFolders.some((folder) => folder.id === parent!.id || folder.id === child!.id)
    ).toBe(false);
    expect(useExamStore.getState().examLibraryDocuments).toEqual([]);
    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedFolderId: fullRoot!.id,
      selectedDocumentId: null
    });
  });

  it("confirms one pending specialized sync across the whole strong-bound group", () => {
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "paper one",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["old-q"],
          pendingQuestionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "lecture-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "lecture",
          title: "lecture one",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["old-q"],
          pendingQuestionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "answer-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "answer_sheet",
          title: "answer one",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["old-q"],
          pendingQuestionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: true,
          pendingPlaceholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    useExamStore.getState().confirmExamDocumentSync("paper-1");

    expect(
      useExamStore.getState().examLibraryDocuments.map((document) => ({
        id: document.id,
        syncStatus: document.syncStatus,
        questionIds: document.questionIds,
        pendingQuestionIds: document.pendingQuestionIds,
        placeholderAnswerPage: document.placeholderAnswerPage,
        pendingPlaceholderAnswerPage: document.pendingPlaceholderAnswerPage
      }))
    ).toEqual([
      {
        id: "paper-1",
        syncStatus: "idle",
        questionIds: ["q-1", "q-2"],
        pendingQuestionIds: undefined,
        placeholderAnswerPage: false,
        pendingPlaceholderAnswerPage: undefined
      },
      {
        id: "lecture-1",
        syncStatus: "idle",
        questionIds: ["q-1", "q-2"],
        pendingQuestionIds: undefined,
        placeholderAnswerPage: false,
        pendingPlaceholderAnswerPage: undefined
      },
      {
        id: "answer-1",
        syncStatus: "idle",
        questionIds: ["q-1", "q-2"],
        pendingQuestionIds: undefined,
        placeholderAnswerPage: false,
        pendingPlaceholderAnswerPage: undefined
      }
    ]);
  });

  it("confirms one pending full-paper sync across the whole strong-bound group", () => {
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "paper-full-1",
          folderId: "full-root",
          library: "full",
          kind: "paper",
          title: "paper one",
          subjectScope: null,
          groupId: "group-full-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          pendingQuestionIds: ["q-2", "q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "lecture-full-1",
          folderId: "full-root",
          library: "full",
          kind: "lecture",
          title: "lecture one",
          subjectScope: null,
          groupId: "group-full-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          pendingQuestionIds: ["q-2", "q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "answer-full-1",
          folderId: "full-root",
          library: "full",
          kind: "answer_sheet",
          title: "answer one",
          subjectScope: null,
          groupId: "group-full-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          pendingQuestionIds: ["q-2", "q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: true,
          allowsQuestionMutations: true
        }
      ]
    });

    useExamStore.getState().confirmExamDocumentSync("paper-full-1");

    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every(
          (document) =>
            document.syncStatus === "idle" &&
            document.questionIds.join(",") === "q-2,q-1" &&
            document.pendingQuestionIds === undefined
        )
    ).toBe(true);
  });

  it("refreshes primary lecture sync metadata after confirming one specialized sync", () => {
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "paper one",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["old-q"],
          pendingQuestionIds: ["q-1", "q-2"],
          pendingQuestionBlocks: [
            {
              key: "block-a",
              label: "Block A",
              questionIds: ["q-1", "q-2"]
            }
          ],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "lecture-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "lecture",
          lectureVariant: "primary",
          title: "lecture one",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["old-q"],
          questionBlocks: [
            {
              key: "old-block",
              label: "Old Block",
              questionIds: ["old-q"]
            }
          ],
          pendingQuestionIds: ["q-1", "q-2"],
          pendingQuestionBlocks: [
            {
              key: "block-a",
              label: "Block A",
              questionIds: ["q-1", "q-2"]
            }
          ],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true,
          syncMetadata: {
            version: 1,
            sourceDocumentId: "lecture-1",
            generatedAt: "2026-06-03T10:00:00.000Z",
            questionIds: ["old-q"],
            blocks: [
              {
                blockId: "old-block",
                questionIds: ["old-q"],
                exportOrder: 0,
                pageRange: {
                  start: 1,
                  end: 1
                },
                anchorBBox: {
                  page: 1,
                  x: 40,
                  y: 40,
                  width: 515,
                  height: 120
                }
              }
            ]
          }
        }
      ]
    });

    useExamStore.getState().confirmExamDocumentSync("paper-1");

    expect(
      useExamStore.getState().examLibraryDocuments.find((document) => document.id === "lecture-1")
    ).toMatchObject({
      syncStatus: "idle",
      questionIds: ["q-1", "q-2"],
      questionBlocks: [
        {
          key: "block-a",
          label: "Block A",
          questionIds: ["q-1", "q-2"]
        }
      ],
      syncMetadata: {
        version: 1,
        sourceDocumentId: "lecture-1",
        questionIds: ["q-1", "q-2"],
        blocks: [
          {
            blockId: "block-a",
            questionIds: ["q-1", "q-2"],
            exportOrder: 0,
            pageRange: {
              start: 1,
              end: 1
            },
            anchorBBox: {
              page: 1,
              x: 40,
              y: 40,
              width: 515,
              height: 160
            }
          }
        ]
      }
    });
  });

  it("commits one pending primary lecture upload snapshot and completes its processing task on confirmation", () => {
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "lecture-primary-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "lecture",
          lectureVariant: "primary",
          title: "primary lecture",
          subjectScope: null,
          groupId: "group-primary-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          questionBlocks: [
            {
              key: "block-a",
              label: "Block A",
              questionIds: ["q-1"]
            }
          ],
          pendingQuestionIds: ["q-1", "q-2"],
          pendingQuestionBlocks: [
            {
              key: "block-a",
              label: "Block A",
              questionIds: ["q-1"]
            },
            {
              key: "block-b",
              label: "Block B",
              questionIds: ["q-2"]
            }
          ],
          pendingManualPlacementQuestionIds: [],
          rawPageAssetIds: ["asset-primary-old"],
          pendingRawPageAssetIds: ["asset-primary-new"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true,
          sourceUploadTaskId: "task-primary-old",
          pendingSourceUploadTaskId: "task-primary-new",
          syncMetadata: {
            version: 1,
            sourceDocumentId: "lecture-primary-1",
            generatedAt: "2026-06-03T10:00:00.000Z",
            questionIds: ["q-1"],
            blocks: [
              {
                blockId: "block-a",
                questionIds: ["q-1"],
                exportOrder: 0,
                pageRange: {
                  start: 1,
                  end: 1
                },
                anchorBBox: {
                  page: 1,
                  x: 40,
                  y: 40,
                  width: 515,
                  height: 120
                }
              }
            ]
          }
        }
      ],
      mobileUploadTasks: [
        {
          id: "task-primary-new",
          deviceId: "pc-workspace",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["Specialized Library", "Physics", "Kinematics", "Primary Lecture"],
          originalFileName: "primary lecture.pdf",
          normalizedFileName: "primary lecture.pdf",
          mimeType: "application/pdf",
          status: "processing",
          createdAt: "2026-06-03T12:00:00.000Z"
        },
        {
          id: "task-unrelated",
          deviceId: "device-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "archive-folder-1",
          targetNodePath: ["Specialized Library", "Physics", "Kinematics", "Lecture Archive"],
          originalFileName: "archive.pdf",
          normalizedFileName: "archive.pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T12:01:00.000Z"
        }
      ]
    });

    useExamStore.getState().confirmExamDocumentSync("lecture-primary-1");

    expect(
      useExamStore.getState().examLibraryDocuments.find((document) => document.id === "lecture-primary-1")
    ).toMatchObject({
      syncStatus: "idle",
      questionIds: ["q-1", "q-2"],
      questionBlocks: [
        {
          key: "block-a",
          label: "Block A",
          questionIds: ["q-1"]
        },
        {
          key: "block-b",
          label: "Block B",
          questionIds: ["q-2"]
        }
      ],
      rawPageAssetIds: ["asset-primary-new"],
      pendingRawPageAssetIds: undefined,
      sourceUploadTaskId: "task-primary-new",
      pendingSourceUploadTaskId: undefined,
      syncMetadata: {
        version: 1,
        sourceDocumentId: "lecture-primary-1",
        questionIds: ["q-1", "q-2"],
        blocks: [
          {
            blockId: "block-a",
            questionIds: ["q-1"],
            exportOrder: 0,
            pageRange: {
              start: 1,
              end: 1
            },
            anchorBBox: {
              page: 1,
              x: 40,
              y: 40,
              width: 515,
              height: 120
            }
          },
          {
            blockId: "block-b",
            questionIds: ["q-2"],
            exportOrder: 1,
            pageRange: {
              start: 2,
              end: 2
            },
            anchorBBox: {
              page: 2,
              x: 40,
              y: 40,
              width: 515,
              height: 120
            }
          }
        ]
      }
    });
    expect(useExamStore.getState().mobileUploadTasks).toEqual([
      expect.objectContaining({
        id: "task-primary-new",
        status: "completed",
        errorMessage: null
      }),
      expect.objectContaining({
        id: "task-unrelated",
        status: "received"
      })
    ]);
  });

  it("does not confirm one pending specialized sync while manual placement is still unresolved", () => {
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "paper one",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["old-q"],
          pendingQuestionIds: ["q-1"],
          pendingQuestionBlocks: [
            {
              key: "牛顿定律".toLowerCase(),
              label: "牛顿定律",
              questionIds: ["q-1"]
            }
          ],
          pendingManualPlacementQuestionIds: ["q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    useExamStore.getState().confirmExamDocumentSync("paper-1");

    expect(useExamStore.getState().examLibraryDocuments[0]).toMatchObject({
      syncStatus: "pending_confirmation",
      questionIds: ["old-q"],
      pendingManualPlacementQuestionIds: ["q-2"]
    });
  });

  it("patches pending specialized sync data across the whole strong-bound group", () => {
    useExamStore.setState({
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "paper one",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["old-q"],
          pendingQuestionIds: ["q-1"],
          pendingQuestionBlocks: [
            {
              key: "牛顿定律".toLowerCase(),
              label: "牛顿定律",
              questionIds: ["q-1"]
            }
          ],
          pendingManualPlacementQuestionIds: ["q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "lecture-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "lecture",
          title: "lecture one",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["old-q"],
          pendingQuestionIds: ["q-1"],
          pendingQuestionBlocks: [
            {
              key: "牛顿定律".toLowerCase(),
              label: "牛顿定律",
              questionIds: ["q-1"]
            }
          ],
          pendingManualPlacementQuestionIds: ["q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    useExamStore.getState().patchPendingExamDocumentGroup("paper-1", {
      pendingQuestionIds: ["q-1", "q-2"],
      pendingQuestionBlocks: [
        {
          key: "牛顿定律".toLowerCase(),
          label: "牛顿定律",
          questionIds: ["q-1", "q-2"]
        }
      ],
      pendingManualPlacementQuestionIds: []
    });

    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every(
          (document) =>
            document.pendingQuestionIds?.join(",") === "q-1,q-2" &&
            document.pendingQuestionBlocks?.[0]?.questionIds.join(",") === "q-1,q-2" &&
            (document.pendingManualPlacementQuestionIds?.length ?? 0) === 0
        )
    ).toBe(true);
  });

  it("confirms the pending uploaded full-paper draft into one trio", () => {
    const folder = useExamStore
      .getState()
      .examLibraryFolders.find((item) => item.library === "full" && item.depth === 1);

    expect(folder).toBeTruthy();

    useExamStore.getState().setPendingUploadedFullPaperDraft({
      id: "full-pdf-1",
      folderId: folder!.id,
      fileName: "suite.pdf",
      sourceAssetId: "asset-source-1",
      sourceDocumentId: "full-pdf-1",
      pageCount: 4,
      answerSection: {
        status: "suggested",
        hasAnswerSection: true,
        suggestedSplitPage: 3,
        confirmedSplitPage: null
      }
    });

    const bundle = useExamStore.getState().confirmPendingUploadedFullPaperDraft({
      hasAnswerSection: true,
      confirmedSplitPage: 3
    });

    expect(bundle).toHaveLength(3);
    expect(useExamStore.getState().examLibraryDocuments).toHaveLength(3);
    expect(useExamStore.getState().pendingUploadedFullPaperDraft).toBeNull();
    expect(useExamStore.getState().examLibraryDocuments[0]).toMatchObject({
      sourceMode: "uploaded_pdf",
      sourceUploadTaskId: undefined,
      uploadedPdfAnswerSection: {
        status: "confirmed",
        hasAnswerSection: true,
        suggestedSplitPage: 3,
        confirmedSplitPage: 3
      }
    });
  });

  it("updates uploaded-pdf page review status across the whole strong-bound trio", () => {
    const folder = useExamStore
      .getState()
      .examLibraryFolders.find((item) => item.library === "full" && item.depth === 1);

    expect(folder).toBeTruthy();

    useExamStore.getState().setPendingUploadedFullPaperDraft({
      id: "full-pdf-1",
      folderId: folder!.id,
      fileName: "suite.pdf",
      sourceAssetId: "asset-source-1",
      sourceDocumentId: "full-pdf-1",
      pageCount: 2,
      answerSection: {
        status: "suggested",
        hasAnswerSection: true,
        suggestedSplitPage: 2,
        confirmedSplitPage: null
      },
      uploadedPdfPages: [
        {
          pageId: "uploaded-page-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          reviewStatus: "unreviewed",
          previewAssetId: "asset-page-1"
        },
        {
          pageId: "uploaded-page-2",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          reviewStatus: "unreviewed",
          previewAssetId: "asset-page-2"
        }
      ]
    });
    useExamStore.getState().confirmPendingUploadedFullPaperDraft({
      hasAnswerSection: true,
      confirmedSplitPage: 2
    });

    useExamStore.getState().updateUploadedPdfPageReviewStatus("full-group-full-pdf-1", "uploaded-page-1", "reviewed");

    expect(
      useExamStore
        .getState()
        .examLibraryDocuments.every(
          (document) =>
            document.uploadedPdfPages?.find((page) => page.pageId === "uploaded-page-1")?.reviewStatus === "reviewed"
        )
    ).toBe(true);
    expect(
      useExamStore.getState().examLibraryDocuments[0].uploadedPdfPages?.find((page) => page.pageId === "uploaded-page-2")
        ?.reviewStatus
    ).toBe("unreviewed");
  });

  it("finalizes one uploaded-pdf review trio and locks the whole group", () => {
    const folder = useExamStore
      .getState()
      .examLibraryFolders.find((item) => item.library === "full" && item.depth === 1);

    expect(folder).toBeTruthy();

    useExamStore.getState().setPendingUploadedFullPaperDraft({
      id: "full-pdf-1",
      folderId: folder!.id,
      fileName: "suite.pdf",
      sourceAssetId: "asset-source-1",
      sourceDocumentId: "full-pdf-1",
      pageCount: 2,
      answerSection: {
        status: "suggested",
        hasAnswerSection: true,
        suggestedSplitPage: 2,
        confirmedSplitPage: null
      },
      uploadedPdfPages: [
        {
          pageId: "uploaded-page-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          reviewStatus: "reviewed",
          previewAssetId: "asset-page-1"
        },
        {
          pageId: "uploaded-page-2",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          reviewStatus: "reviewed",
          previewAssetId: "asset-page-2"
        }
      ]
    });
    const bundle = useExamStore.getState().confirmPendingUploadedFullPaperDraft({
      hasAnswerSection: true,
      confirmedSplitPage: 2
    });

    expect(bundle?.every((document) => document.uploadedPdfWorkflowStatus === "draft_review")).toBe(
      true
    );

    useExamStore.getState().finalizeUploadedPdfDocumentGroup(bundle![0]!.id);

    expect(
      useExamStore.getState().examLibraryDocuments.every(
        (document) =>
          document.groupId === bundle![0]!.groupId
            ? document.uploadedPdfWorkflowStatus === "finalized"
            : true
      )
    ).toBe(true);
  });

  it("completes one processing full-paper mobile upload task when the pending uploaded full-paper draft is confirmed", () => {
    const folder = useExamStore
      .getState()
      .examLibraryFolders.find((item) => item.library === "full" && item.depth === 1);

    expect(folder).toBeTruthy();

    useExamStore.setState({
      mobileUploadTasks: [
        {
          id: "task-full-1",
          deviceId: "android-full-1",
          uploadKind: "full_paper_pdf",
          targetNodeId: folder!.id,
          targetNodePath: folder!.path,
          originalFileName: "suite.pdf",
          normalizedFileName: "suite.pdf",
          mimeType: "application/pdf",
          status: "processing",
          createdAt: "2026-06-04T08:00:00.000Z",
          errorMessage: null
        }
      ]
    });
    useExamStore.getState().setPendingUploadedFullPaperDraft({
      id: "full-pdf-task-1",
      folderId: folder!.id,
      fileName: "suite.pdf",
      sourceAssetId: "asset-source-1",
      sourceDocumentId: "full-pdf-task-1",
      sourceUploadTaskId: "task-full-1",
      pageCount: 2,
      answerSection: {
        status: "suggested",
        hasAnswerSection: true,
        suggestedSplitPage: 2,
        confirmedSplitPage: null
      },
      uploadedPdfPages: [
        {
          pageId: "uploaded-page-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          reviewStatus: "unreviewed",
          previewAssetId: "asset-page-1"
        },
        {
          pageId: "uploaded-page-2",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          reviewStatus: "unreviewed",
          previewAssetId: "asset-page-2"
        }
      ]
    });

    const bundle = useExamStore.getState().confirmPendingUploadedFullPaperDraft({
      hasAnswerSection: true,
      confirmedSplitPage: 2
    });

    expect(bundle).toHaveLength(3);
    expect(bundle?.every((document) => document.sourceUploadTaskId === "task-full-1")).toBe(true);
    expect(useExamStore.getState().mobileUploadTasks).toEqual([
      expect.objectContaining({
        id: "task-full-1",
        status: "completed",
        errorMessage: null
      })
    ]);
  });

  it("clears one exam library without removing documents from the other library", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "specialized-paper-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "平抛运动基础专题卷",
          subjectScope: "高中物理",
          groupId: "specialized-group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "full-paper-1",
          folderId: "full-root",
          library: "full",
          kind: "paper",
          title: "保留的套卷",
          subjectScope: "高中物理",
          groupId: "full-group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "specialized",
        selectedFolderId: "specialized-root",
        selectedDocumentId: "specialized-paper-1"
      }
    });

    (useExamStore.getState() as any).clearExamLibraryDocuments("specialized");

    expect(useExamStore.getState().examLibraryDocuments).toEqual([
      expect.objectContaining({ id: "full-paper-1", library: "full" })
    ]);
    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedFolderId: "specialized-root",
      selectedDocumentId: null
    });
  });
});

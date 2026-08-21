import { create } from "zustand";

import type {
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  ExamWorkspaceDraft,
  MobileUploadPairingSessionEntity,
  MobileUploadTaskEntity,
  UploadedFullPaperDraftEntity
} from "@/lib/domain/entities";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft,
  createUploadedPdfFullPaperBundle,
  createCustomFullLibraryFolder,
  deleteCustomFullLibraryFolder,
  renameCustomFullLibraryFolder
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { buildPrimaryLectureSyncMetadata } from "@/lib/services/lecture-sync-metadata-service";

interface ExamStoreState {
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  examWorkspaceDraft: ExamWorkspaceDraft;
  mobileUploadPairingSession: MobileUploadPairingSessionEntity | null;
  mobileUploadTasks: MobileUploadTaskEntity[];
  pendingUploadedFullPaperDraft: UploadedFullPaperDraftEntity | null;
  hydrateWorkspaceState: (snapshot: {
    examLibraryFolders?: ExamLibraryFolderEntity[] | null;
    examLibraryDocuments?: ExamLibraryDocumentEntity[] | null;
    examWorkspaceDraft?: ExamWorkspaceDraft | null;
    mobileUploadTasks?: MobileUploadTaskEntity[];
    pendingUploadedFullPaperDraft?: UploadedFullPaperDraftEntity | null;
  }) => void;
  setExamLibraryFolders: (folders: ExamLibraryFolderEntity[]) => void;
  createExamLibraryFolder: (parentId: string, name: string) => ExamLibraryFolderEntity | null;
  renameExamLibraryFolder: (folderId: string, name: string) => ExamLibraryFolderEntity | null;
  deleteExamLibraryFolder: (folderId: string) => ExamLibraryFolderEntity | null;
  setExamLibraryDocuments: (documents: ExamLibraryDocumentEntity[]) => void;
  clearExamLibraryDocuments: (library: ExamLibraryFolderEntity["library"]) => void;
  upsertExamLibraryDocument: (document: ExamLibraryDocumentEntity) => void;
  setMobileUploadPairingSession: (session: MobileUploadPairingSessionEntity | null) => void;
  setMobileUploadTasks: (tasks: MobileUploadTaskEntity[]) => void;
  upsertMobileUploadTask: (task: MobileUploadTaskEntity) => void;
  confirmExamDocumentSync: (documentId: string) => void;
  setExamWorkspaceDraft: (draft: Partial<ExamWorkspaceDraft>) => void;
  setPendingUploadedFullPaperDraft: (draft: UploadedFullPaperDraftEntity | null) => void;
  updateUploadedPdfPageReviewStatus: (
    groupId: string,
    pageId: string,
    reviewStatus: "unreviewed" | "reviewed"
  ) => void;
  patchPendingExamDocumentGroup: (
    documentId: string,
    patch: Pick<
      ExamLibraryDocumentEntity,
      "pendingQuestionIds" | "pendingQuestionBlocks" | "pendingManualPlacementQuestionIds"
    >
  ) => void;
  finalizeUploadedPdfDocumentGroup: (documentId: string) => void;
  confirmPendingUploadedFullPaperDraft: (input: {
    hasAnswerSection: boolean;
    confirmedSplitPage: number | null;
  }) => ExamLibraryDocumentEntity[] | null;
}

const initialQuestionFolders = buildInitialFolderTree();

export const useExamStore = create<ExamStoreState>((set, get) => ({
  examLibraryFolders: buildInitialExamLibraryFolders(initialQuestionFolders),
  examLibraryDocuments: [],
  examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
  mobileUploadPairingSession: null,
  mobileUploadTasks: [],
  pendingUploadedFullPaperDraft: null,
  hydrateWorkspaceState: (snapshot) =>
    set({
      examLibraryFolders: Array.isArray(snapshot.examLibraryFolders)
        ? snapshot.examLibraryFolders
        : buildInitialExamLibraryFolders(initialQuestionFolders),
      examLibraryDocuments: Array.isArray(snapshot.examLibraryDocuments)
        ? snapshot.examLibraryDocuments
        : [],
      examWorkspaceDraft: snapshot.examWorkspaceDraft ?? buildInitialExamWorkspaceDraft(),
      mobileUploadPairingSession: null,
      mobileUploadTasks: Array.isArray(snapshot.mobileUploadTasks) ? snapshot.mobileUploadTasks : [],
      pendingUploadedFullPaperDraft: snapshot.pendingUploadedFullPaperDraft ?? null
    }),
  setExamLibraryFolders: (examLibraryFolders) => set({ examLibraryFolders }),
  createExamLibraryFolder: (parentId, name) => {
    const parent = get().examLibraryFolders.find((folder) => folder.id === parentId);

    if (!parent) {
      return null;
    }

    const normalizedName = name.trim();
    const existing = get().examLibraryFolders.find(
      (folder) => folder.parentId === parentId && folder.name === normalizedName
    );

    if (existing) {
      return existing;
    }

    const folder = createCustomFullLibraryFolder({
      parent,
      name: normalizedName
    });

    if (!folder) {
      return null;
    }

    set((state) => ({
      examLibraryFolders: state.examLibraryFolders.concat(folder)
    }));

    return folder;
  },
  renameExamLibraryFolder: (folderId, name) => {
    const result = renameCustomFullLibraryFolder({
      folders: get().examLibraryFolders,
      documents: get().examLibraryDocuments,
      folderId,
      nextName: name
    });

    if (!result) {
      return null;
    }

    set((state) => ({
      examLibraryFolders: result.folders,
      examLibraryDocuments: result.documents,
      examWorkspaceDraft: {
        ...state.examWorkspaceDraft,
        selectedFolderId: state.examWorkspaceDraft.selectedFolderId
          ? result.folderIdMap.get(state.examWorkspaceDraft.selectedFolderId) ??
            state.examWorkspaceDraft.selectedFolderId
          : null
      }
    }));

    return result.renamedFolder;
  },
  deleteExamLibraryFolder: (folderId) => {
    const result = deleteCustomFullLibraryFolder({
      folders: get().examLibraryFolders,
      documents: get().examLibraryDocuments,
      folderId
    });

    if (!result) {
      return null;
    }

    set((state) => {
      const deletedDocumentIdSet = new Set(
        state.examLibraryDocuments
          .filter((document) => !result.documents.some((current) => current.id === document.id))
          .map((document) => document.id)
      );

      return {
        examLibraryFolders: result.folders,
        examLibraryDocuments: result.documents,
        examWorkspaceDraft: {
          ...state.examWorkspaceDraft,
          selectedFolderId: result.deletedFolderIds.includes(
            state.examWorkspaceDraft.selectedFolderId ?? ""
          )
            ? result.parentFolder.id
            : state.examWorkspaceDraft.selectedFolderId,
          selectedDocumentId: deletedDocumentIdSet.has(
            state.examWorkspaceDraft.selectedDocumentId ?? ""
          )
            ? null
            : state.examWorkspaceDraft.selectedDocumentId
        }
      };
    });

    return result.parentFolder;
  },
  setExamLibraryDocuments: (examLibraryDocuments) => set({ examLibraryDocuments }),
  clearExamLibraryDocuments: (library) =>
    set((state) => {
      const removedDocumentIds = new Set(
        state.examLibraryDocuments
          .filter((document) => document.library === library)
          .map((document) => document.id)
      );

      return {
        examLibraryDocuments: state.examLibraryDocuments.filter(
          (document) => document.library !== library
        ),
        examWorkspaceDraft: {
          ...state.examWorkspaceDraft,
          selectedDocumentId: removedDocumentIds.has(
            state.examWorkspaceDraft.selectedDocumentId ?? ""
          )
            ? null
            : state.examWorkspaceDraft.selectedDocumentId
        }
      };
    }),
  upsertExamLibraryDocument: (document) =>
    set((state) => {
      const exists = state.examLibraryDocuments.some((current) => current.id === document.id);

      return {
        examLibraryDocuments: exists
          ? state.examLibraryDocuments.map((current) =>
              current.id === document.id ? document : current
            )
          : state.examLibraryDocuments.concat(document)
      };
    }),
  setMobileUploadPairingSession: (mobileUploadPairingSession) => set({ mobileUploadPairingSession }),
  setMobileUploadTasks: (mobileUploadTasks) => set({ mobileUploadTasks }),
  upsertMobileUploadTask: (task) =>
    set((state) => {
      const exists = state.mobileUploadTasks.some((current) => current.id === task.id);

      return {
        mobileUploadTasks: exists
          ? state.mobileUploadTasks.map((current) => (current.id === task.id ? task : current))
          : state.mobileUploadTasks.concat(task)
      };
    }),
  confirmExamDocumentSync: (documentId) =>
    set((state) => {
      const targetDocument = state.examLibraryDocuments.find((document) => document.id === documentId);

      if (!targetDocument || (targetDocument.pendingManualPlacementQuestionIds?.length ?? 0) > 0) {
        return state;
      }

      const shouldConfirmDocument = (document: ExamLibraryDocumentEntity) => {
        if (targetDocument.groupId && document.groupId === targetDocument.groupId) {
          return true;
        }

        return document.id === targetDocument.id;
      };

      const completedUploadTaskIds = new Set(
        state.examLibraryDocuments
          .filter((document) => shouldConfirmDocument(document))
          .flatMap((document) =>
            document.pendingSourceUploadTaskId ? [document.pendingSourceUploadTaskId] : []
          )
      );

      return {
        examLibraryDocuments: state.examLibraryDocuments.map((document) => {
          if (!shouldConfirmDocument(document)) {
            return document;
          }

          const nextQuestionIds = document.pendingQuestionIds ?? document.questionIds;
          const nextQuestionBlocks = document.pendingQuestionBlocks ?? document.questionBlocks;

          return {
            ...document,
            syncStatus: "idle",
            questionIds: nextQuestionIds,
            questionBlocks: nextQuestionBlocks,
            pendingQuestionIds: undefined,
            pendingQuestionBlocks: undefined,
            pendingManualPlacementQuestionIds: undefined,
            rawPageAssetIds:
              document.pendingRawPageAssetIds ?? document.rawPageAssetIds,
            pendingRawPageAssetIds: undefined,
            sourceUploadTaskId:
              document.pendingSourceUploadTaskId ?? document.sourceUploadTaskId,
            pendingSourceUploadTaskId: undefined,
            placeholderAnswerPage:
              document.pendingPlaceholderAnswerPage ?? document.placeholderAnswerPage,
            pendingPlaceholderAnswerPage: undefined,
            ...(document.kind === "lecture" && document.lectureVariant === "primary"
              ? {
                  syncMetadata: buildPrimaryLectureSyncMetadata({
                    sourceDocumentId: document.id,
                    questionIds: nextQuestionIds,
                    questionBlocks: nextQuestionBlocks
                  })
                }
              : {})
          };
        }),
        mobileUploadTasks: state.mobileUploadTasks.map((task) =>
          completedUploadTaskIds.has(task.id)
            ? {
                ...task,
                status: "completed",
                errorMessage: null
              }
            : task
        )
      };
    }),
  setExamWorkspaceDraft: (draft) =>
    set((state) => ({
      examWorkspaceDraft: {
        ...state.examWorkspaceDraft,
        ...draft
      }
    })),
  setPendingUploadedFullPaperDraft: (pendingUploadedFullPaperDraft) =>
    set({
      pendingUploadedFullPaperDraft
    }),
  updateUploadedPdfPageReviewStatus: (groupId, pageId, reviewStatus) =>
    set((state) => ({
      examLibraryDocuments: state.examLibraryDocuments.map((document) => {
        if (document.groupId !== groupId || !document.uploadedPdfPages?.length) {
          return document;
        }

        return {
          ...document,
          uploadedPdfPages: document.uploadedPdfPages.map((page) =>
            page.pageId === pageId
              ? {
                  ...page,
                  reviewStatus
                }
              : page
          )
        };
      })
    })),
  patchPendingExamDocumentGroup: (documentId, patch) =>
    set((state) => {
      const targetDocument = state.examLibraryDocuments.find((document) => document.id === documentId);

      if (!targetDocument) {
        return state;
      }

      const shouldPatchDocument = (document: ExamLibraryDocumentEntity) => {
        if (targetDocument.groupId && document.groupId === targetDocument.groupId) {
          return true;
        }

        return document.id === targetDocument.id;
      };

      return {
        examLibraryDocuments: state.examLibraryDocuments.map((document) =>
          shouldPatchDocument(document)
            ? {
                ...document,
                pendingQuestionIds: patch.pendingQuestionIds,
                pendingQuestionBlocks: patch.pendingQuestionBlocks,
                pendingManualPlacementQuestionIds: patch.pendingManualPlacementQuestionIds
              }
            : document
        )
      };
    }),
  finalizeUploadedPdfDocumentGroup: (documentId) =>
    set((state) => {
      const targetDocument = state.examLibraryDocuments.find((document) => document.id === documentId);

      if (
        !targetDocument ||
        targetDocument.sourceMode !== "uploaded_pdf" ||
        !targetDocument.groupId
      ) {
        return state;
      }

      return {
        examLibraryDocuments: state.examLibraryDocuments.map((document) =>
          document.groupId === targetDocument.groupId
            ? {
                ...document,
                uploadedPdfWorkflowStatus: "finalized"
              }
            : document
        )
      };
    }),
  confirmPendingUploadedFullPaperDraft: (input) => {
    const pendingDraft = get().pendingUploadedFullPaperDraft;
    const folder = get().examLibraryFolders.find((item) => item.id === pendingDraft?.folderId);

    if (!pendingDraft || !folder) {
      return null;
    }

    const answerSection = {
      ...pendingDraft.answerSection,
      status: "confirmed" as const,
      hasAnswerSection: input.hasAnswerSection,
      confirmedSplitPage: input.hasAnswerSection ? input.confirmedSplitPage : null
    };
    const bundle = createUploadedPdfFullPaperBundle({
      idBase: pendingDraft.id,
      folder,
      fileName: pendingDraft.fileName,
      sourceAssetId: pendingDraft.sourceAssetId,
      sourceUploadTaskId: pendingDraft.sourceUploadTaskId,
      answerSection,
      uploadedPdfPages: pendingDraft.uploadedPdfPages
    });

    set((state) => ({
      examLibraryDocuments: state.examLibraryDocuments.concat(bundle),
      examWorkspaceDraft: {
        ...state.examWorkspaceDraft,
        selectedDocumentId: bundle[0]?.id ?? state.examWorkspaceDraft.selectedDocumentId
      },
      pendingUploadedFullPaperDraft: null,
      mobileUploadTasks: pendingDraft.sourceUploadTaskId
        ? state.mobileUploadTasks.map((task) =>
            task.id === pendingDraft.sourceUploadTaskId
              ? {
                  ...task,
                  status: "completed",
                  errorMessage: null
                }
              : task
          )
        : state.mobileUploadTasks
    }));

    return bundle;
  }
}));

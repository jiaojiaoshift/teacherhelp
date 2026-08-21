"use client";

import { useEffect, useRef, useState } from "react";

import {
  IndexedDbWorkspaceSnapshotRepository,
  LatestWorkspaceSnapshotSaveQueue
} from "@/lib/repositories/indexeddb/workspace-snapshot-repository";
import type { WorkspaceSnapshot } from "@/lib/repositories/indexeddb/workspace-snapshot-repository";
import {
  DocumentTaskClientConflictError,
  DocumentTaskSaveQueue,
  loadDocumentTasks
} from "@/lib/services/document-task-client-service";
import { reconcileDocumentTaskQuestionCounts } from "@/lib/services/document-task-service";
import {
  LocalLibraryConflictError,
  LocalLibrarySaveQueue,
  loadLocalLibrary,
  mergeLocalLibraryIntoWorkspace
} from "@/lib/services/local-library-client-service";
import { buildLocalLibrarySnapshot } from "@/lib/services/local-library-snapshot-service";
import { prepareAiPreviewBlob } from "@/lib/services/ai-image-preview-service";
import {
  ensureDefaultSpecializedDocuments,
  ensureExamLibraryFolders
} from "@/lib/services/exam-library-service";
import { consumeMobileUploadHelperPendingUpload } from "@/lib/services/mobile-upload-pending-upload-consumer-service";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";
import { dataUrlToBlob } from "@/lib/utils/blob-data-url";

const repository = new IndexedDbWorkspaceSnapshotRepository();

interface HelperPendingUploadPayload {
  id: string;
  taskId: string;
  deviceId?: string;
  uploadKind: "question_bank_pdf" | "full_paper_pdf";
  targetNodeId: string;
  targetNodePath: string[];
  originalFileName: string;
  normalizedFileName: string;
  mimeType: "application/pdf";
  createdAt: string;
  byteLength: number;
  base64Data?: string;
  fileUrl?: string;
}

interface HelperProcessedQuestionBankImportPayload {
  id: string;
  task: import("@/lib/domain/entities").MobileUploadTaskEntity;
  documents: import("@/lib/domain/entities").DocumentEntity[];
  pages: import("@/lib/domain/entities").PageEntity[];
  binaryAssets: import("@/lib/domain/entities").BinaryAssetEntity[];
  pagePreviews: Array<{
    pageId: string;
    dataUrl: string;
  }>;
  sourceFileUrl?: string;
}

interface HelperProcessedFullPaperDraftPayload {
  id: string;
  task: import("@/lib/domain/entities").MobileUploadTaskEntity;
  pendingDraft: import("@/lib/domain/entities").UploadedFullPaperDraftEntity;
  binaryAssets: import("@/lib/domain/entities").BinaryAssetEntity[];
  sourceFileUrl?: string;
}

interface HelperProcessedLectureUploadPayload {
  id: string;
  task: import("@/lib/domain/entities").MobileUploadTaskEntity;
  binaryAssets: import("@/lib/domain/entities").BinaryAssetEntity[];
  sourceFileUrl?: string;
}

function mergeEntitiesById<T extends { id: string }>(currentItems: T[], incomingItems: T[]) {
  if (incomingItems.length === 0) {
    return currentItems;
  }

  const mergedItems = currentItems.slice();
  const indexById = new Map(currentItems.map((item, index) => [item.id, index]));
  let changed = false;

  for (const incomingItem of incomingItems) {
    const currentIndex = indexById.get(incomingItem.id);

    if (currentIndex === undefined) {
      indexById.set(incomingItem.id, mergedItems.length);
      mergedItems.push(incomingItem);
      changed = true;
      continue;
    }

    if (JSON.stringify(mergedItems[currentIndex]) !== JSON.stringify(incomingItem)) {
      mergedItems[currentIndex] = incomingItem;
      changed = true;
    }
  }

  return changed ? mergedItems : currentItems;
}

export function WorkspaceHydrator() {
  const [hydrationSettled, setHydrationSettled] = useState(false);
  const localLibrarySaveQueueRef = useRef<LocalLibrarySaveQueue | null>(null);
  const localLibraryErrorReportedRef = useRef(false);
  const documentTaskSaveQueueRef = useRef<DocumentTaskSaveQueue | null>(null);
  const documentTaskErrorReportedRef = useRef(false);
  const hydrateFileStore = useFileStore((state) => state.hydrateWorkspaceState);
  const hydrateFolderStore = useFolderStore((state) => state.hydrateWorkspaceState);
  const hydrateQuestionStore = useQuestionStore((state) => state.hydrateWorkspaceState);
  const hydrateExamStore = useExamStore((state) => state.hydrateWorkspaceState);
  const hydrateDocumentTasks = useWorkbenchStore((state) => state.hydrateDocumentTasks);
  const upsertDocument = useFileStore((state) => state.upsertDocument);
  const upsertPage = useFileStore((state) => state.upsertPage);
  const setPagePreviewUrl = useQuestionStore((state) => state.setPagePreviewUrl);
  const setPagePreviewDataUrl = useQuestionStore((state) => state.setPagePreviewDataUrl);
  const appendBinaryAssets = useQuestionStore((state) => state.appendBinaryAssets);
  const folders = useFolderStore((state) => state.folders);
  const questionDrafts = useQuestionStore((state) => state.questionDrafts);
  const examLibraryFolders = useExamStore((state) => state.examLibraryFolders);
  const examLibraryDocuments = useExamStore((state) => state.examLibraryDocuments);
  const setExamLibraryFolders = useExamStore((state) => state.setExamLibraryFolders);
  const setExamLibraryDocuments = useExamStore((state) => state.setExamLibraryDocuments);
  const setMobileUploadTasks = useExamStore((state) => state.setMobileUploadTasks);
  const setExamWorkspaceDraft = useExamStore((state) => state.setExamWorkspaceDraft);
  const setPendingUploadedFullPaperDraft = useExamStore(
    (state) => state.setPendingUploadedFullPaperDraft
  );
  const documents = useFileStore((state) => state.documents);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      try {
        const [loadedSnapshot, localLibrary, durableDocumentTasks] = await Promise.all([
          repository.load().catch(() => null),
          loadLocalLibrary().catch(() => null),
          loadDocumentTasks().catch(() => null)
        ]);

        if (disposed) {
          return;
        }

        if (localLibrary) {
          localLibrarySaveQueueRef.current = new LocalLibrarySaveQueue({
            revision: localLibrary.revision,
            initialSnapshot: localLibrary.snapshot
          });
        }

        documentTaskSaveQueueRef.current = new DocumentTaskSaveQueue({
          revision: durableDocumentTasks?.revision ?? 0,
          initialTasks: durableDocumentTasks?.tasks ?? []
        });

        const browserSnapshot: WorkspaceSnapshot = loadedSnapshot ?? {
          selectedPageId: useFileStore.getState().selectedPageId,
          documents: useFileStore.getState().documents,
          pages: useFileStore.getState().pages,
          folders: useFolderStore.getState().folders,
          examLibraryFolders: useExamStore.getState().examLibraryFolders,
          examLibraryDocuments: useExamStore.getState().examLibraryDocuments,
          examWorkspaceDraft: useExamStore.getState().examWorkspaceDraft,
          mobileUploadTasks: useExamStore.getState().mobileUploadTasks,
          pendingUploadedFullPaperDraft: useExamStore.getState().pendingUploadedFullPaperDraft,
          binaryAssets: useQuestionStore.getState().binaryAssets,
          questionDrafts: useQuestionStore.getState().questionDrafts,
          crossPageCandidates: useQuestionStore.getState().crossPageCandidates,
          manualMergeQuestionIds: useQuestionStore.getState().manualMergeQuestionIds,
          selectedQuestionId: useQuestionStore.getState().selectedQuestionId,
          lastBulkConfirmation: useQuestionStore.getState().lastBulkConfirmation,
          documentTasks: useWorkbenchStore.getState().documentTasks
        };
        const snapshot = localLibrary
          ? mergeLocalLibraryIntoWorkspace({
              workspaceSnapshot: browserSnapshot,
              localLibrary
            })
          : browserSnapshot;

        hydrateFileStore({
          documents: snapshot.documents,
          pages: snapshot.pages,
          selectedPageId: snapshot.selectedPageId
        });
        hydrateFolderStore(snapshot.folders);
        hydrateQuestionStore({
          binaryAssets: snapshot.binaryAssets,
          questionDrafts: snapshot.questionDrafts,
          crossPageCandidates: snapshot.crossPageCandidates,
          manualMergeQuestionIds: snapshot.manualMergeQuestionIds,
          selectedQuestionId: snapshot.selectedQuestionId,
          lastBulkConfirmation: snapshot.lastBulkConfirmation
        });
        hydrateExamStore({
          examLibraryFolders: snapshot.examLibraryFolders,
          examLibraryDocuments: snapshot.examLibraryDocuments,
          examWorkspaceDraft: snapshot.examWorkspaceDraft,
          mobileUploadTasks: snapshot.mobileUploadTasks,
          pendingUploadedFullPaperDraft: snapshot.pendingUploadedFullPaperDraft
        });
        const browserDocumentTasks = snapshot.documentTasks ?? [];
        const hasDurableDocumentTaskState = Boolean(
          durableDocumentTasks &&
            (durableDocumentTasks.revision > 0 || durableDocumentTasks.tasks.length > 0)
        );
        hydrateDocumentTasks(
          reconcileDocumentTaskQuestionCounts(
            hasDurableDocumentTaskState
              ? durableDocumentTasks?.tasks ?? []
              : browserDocumentTasks,
            snapshot.questionDrafts.map((question) => question.documentId)
          )
        );

        if (
          !hasDurableDocumentTaskState &&
          browserDocumentTasks.length > 0
        ) {
          void documentTaskSaveQueueRef.current
            ?.enqueue(useWorkbenchStore.getState().documentTasks)
            .catch(() => undefined);
        }

      } finally {
        if (!disposed) {
          setHydrationSettled(true);
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, [
    hydrateDocumentTasks,
    hydrateExamStore,
    hydrateFileStore,
    hydrateFolderStore,
    hydrateQuestionStore
  ]);

  useEffect(() => {
    const nextExamLibraryFolders = ensureExamLibraryFolders({
      questionFolders: folders,
      existingExamLibraryFolders: examLibraryFolders
    });

    if (nextExamLibraryFolders !== examLibraryFolders) {
      setExamLibraryFolders(nextExamLibraryFolders);
    }
  }, [examLibraryFolders, folders, setExamLibraryFolders]);

  useEffect(() => {
    const nextDocuments = ensureDefaultSpecializedDocuments({
      questionFolders: folders,
      examLibraryFolders,
      questionDrafts,
      existingDocuments: examLibraryDocuments
    });

    if (nextDocuments !== examLibraryDocuments) {
      setExamLibraryDocuments(nextDocuments);
    }
  }, [
    examLibraryDocuments,
    examLibraryFolders,
    folders,
    questionDrafts,
    setExamLibraryDocuments
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV === "test") {
      return undefined;
    }

    if (!hydrationSettled) {
      return undefined;
    }

    let disposed = false;

    const syncHelperWorkspaceSnapshot = () => {
      if (disposed) {
        return;
      }

      void fetch("/api/mobile-upload/workspace-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          questionFolders: useFolderStore.getState().folders,
          examLibraryFolders: useExamStore.getState().examLibraryFolders,
          examLibraryDocuments: useExamStore.getState().examLibraryDocuments,
          mobileUploadTasks: useExamStore.getState().mobileUploadTasks,
          pendingUploadedFullPaperDraft: useExamStore.getState().pendingUploadedFullPaperDraft,
          questionDrafts: useQuestionStore
            .getState()
            .questionDrafts.map((question) => ({
              id: question.id,
              questionNumberLabel: question.questionNumberLabel ?? null,
              ocrText: question.ocrText ?? null
            }))
        })
      }).catch(() => undefined);
    };

    const unsubscribeFolderStore = useFolderStore.subscribe(() => {
      syncHelperWorkspaceSnapshot();
    });
    const unsubscribeExamStore = useExamStore.subscribe(() => {
      syncHelperWorkspaceSnapshot();
    });
    const unsubscribeQuestionStore = useQuestionStore.subscribe(() => {
      syncHelperWorkspaceSnapshot();
    });

    syncHelperWorkspaceSnapshot();

    return () => {
      disposed = true;
      unsubscribeFolderStore();
      unsubscribeExamStore();
      unsubscribeQuestionStore();
    };
  }, [hydrationSettled]);

  useEffect(() => {
    if (process.env.NODE_ENV === "test") {
      return undefined;
    }

    if (!hydrationSettled) {
      return undefined;
    }

    let disposed = false;
    let isProcessing = false;
    let pollTimer: number | null = null;

    const processPendingUploads = async () => {
      if (disposed || isProcessing) {
        return;
      }

      isProcessing = true;

      try {
        const response = await fetch("/api/mobile-upload/pending-uploads");

        if (!response.ok || disposed) {
          return;
        }

        const payload = (await response.json()) as {
          pendingUploads?: HelperPendingUploadPayload[];
          processedQuestionBankImports?: HelperProcessedQuestionBankImportPayload[];
          processedFullPaperDrafts?: HelperProcessedFullPaperDraftPayload[];
          processedLectureUploads?: HelperProcessedLectureUploadPayload[];
          examLibraryDocuments?: import("@/lib/domain/entities").ExamLibraryDocumentEntity[];
          mobileUploadTasks?: import("@/lib/domain/entities").MobileUploadTaskEntity[];
        };

        const currentExamState = useExamStore.getState();
        const mergedExamLibraryDocuments = mergeEntitiesById(
          currentExamState.examLibraryDocuments,
          payload.examLibraryDocuments ?? []
        );
        const mergedMobileUploadTasks = mergeEntitiesById(
          currentExamState.mobileUploadTasks,
          payload.mobileUploadTasks ?? []
        );

        if (mergedExamLibraryDocuments !== currentExamState.examLibraryDocuments) {
          useExamStore.getState().setExamLibraryDocuments(mergedExamLibraryDocuments);
        }

        if (mergedMobileUploadTasks !== currentExamState.mobileUploadTasks) {
          useExamStore.getState().setMobileUploadTasks(mergedMobileUploadTasks);
        }

        for (const processedImport of payload.processedQuestionBankImports ?? []) {
          if (disposed) {
            return;
          }

          const previewByPageId = new Map(
            processedImport.pagePreviews.map((preview) => [preview.pageId, preview.dataUrl])
          );
          let processedAssets = processedImport.binaryAssets.map((asset) => {
            const previewDataUrl = previewByPageId.get(asset.pageId);

            if (asset.kind !== "display" || !previewDataUrl) {
              return asset;
            }

            return {
              ...asset,
              dataUrl: previewDataUrl,
              blob: dataUrlToBlob(previewDataUrl) ?? asset.blob
            };
          });
          const sourceAsset = processedAssets.find((asset) => asset.kind === "source");

          if (processedImport.sourceFileUrl && sourceAsset) {
            const sourceResponse = await fetch(processedImport.sourceFileUrl);

            if (!sourceResponse.ok) {
              continue;
            }

            const sourceBlob = await sourceResponse.blob();
            processedAssets = processedAssets.map((asset) =>
              asset.id === sourceAsset.id ? { ...asset, blob: sourceBlob } : asset
            );
          }

          processedImport.documents.forEach((document) => {
            useFileStore.getState().upsertDocument(document);
          });
          processedImport.pages.forEach((page) => {
            useFileStore.getState().upsertPage(page);
          });
          processedImport.pagePreviews.forEach((preview) => {
            useQuestionStore.getState().setPagePreviewUrl(preview.pageId, preview.dataUrl);
            useQuestionStore.getState().setPagePreviewDataUrl(preview.pageId, preview.dataUrl);
          });

          const existingAssetIds = new Set(
            useQuestionStore.getState().binaryAssets.map((asset) => asset.id)
          );
          const missingAssets = processedAssets.filter(
            (asset) => !existingAssetIds.has(asset.id)
          );

          if (missingAssets.length > 0) {
            useQuestionStore.getState().appendBinaryAssets(missingAssets);
          }

          useExamStore.getState().upsertMobileUploadTask({
            ...processedImport.task,
            status: "completed",
            errorMessage: null
          });

          await fetch("/api/mobile-upload/pending-uploads", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              processedQuestionBankImportId: processedImport.id,
              nextTaskStatus: "completed"
            })
          }).catch(() => undefined);
        }

        for (const processedDraft of payload.processedFullPaperDrafts ?? []) {
          if (disposed) {
            return;
          }

          let processedAssets = processedDraft.binaryAssets;
          const sourceAsset = processedAssets.find(
            (asset) => asset.id === processedDraft.pendingDraft.sourceAssetId
          );

          if (processedDraft.sourceFileUrl && sourceAsset) {
            const sourceResponse = await fetch(processedDraft.sourceFileUrl);

            if (!sourceResponse.ok) {
              continue;
            }

            const sourceBlob = await sourceResponse.blob();
            processedAssets = processedAssets.map((asset) =>
              asset.id === sourceAsset.id
                ? { ...asset, blob: sourceBlob }
                : asset
            );
          }

          const existingAssetIds = new Set(
            useQuestionStore.getState().binaryAssets.map((asset) => asset.id)
          );
          const missingAssets = processedAssets.filter(
            (asset) => !existingAssetIds.has(asset.id)
          );

          if (missingAssets.length > 0) {
            useQuestionStore.getState().appendBinaryAssets(missingAssets);
          }

          useExamStore.getState().setPendingUploadedFullPaperDraft(processedDraft.pendingDraft);
          useExamStore.getState().setExamWorkspaceDraft({
            selectedLibrary: "full",
            selectedFolderId: processedDraft.pendingDraft.folderId,
            selectedDocumentId: null
          });
          useExamStore.getState().upsertMobileUploadTask({
            ...processedDraft.task,
            status: "processing",
            errorMessage: null
          });

          await fetch("/api/mobile-upload/pending-uploads", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              processedFullPaperDraftId: processedDraft.id,
              nextTaskStatus: "processing"
            })
          }).catch(() => undefined);
        }

        for (const processedUpload of payload.processedLectureUploads ?? []) {
          if (disposed) {
            return;
          }

          let processedAssets = processedUpload.binaryAssets;
          const sourceAsset = processedAssets.find((asset) => asset.kind === "source");

          if (processedUpload.sourceFileUrl && sourceAsset) {
            const sourceResponse = await fetch(processedUpload.sourceFileUrl);

            if (!sourceResponse.ok) {
              continue;
            }

            const sourceBlob = await sourceResponse.blob();
            processedAssets = processedAssets.map((asset) =>
              asset.id === sourceAsset.id ? { ...asset, blob: sourceBlob } : asset
            );
          }

          const existingAssetIds = new Set(
            useQuestionStore.getState().binaryAssets.map((asset) => asset.id)
          );
          const missingAssets = processedAssets.filter(
            (asset) => !existingAssetIds.has(asset.id)
          );

          if (missingAssets.length > 0) {
            useQuestionStore.getState().appendBinaryAssets(missingAssets);
          }

          useExamStore.getState().upsertMobileUploadTask({
            ...processedUpload.task,
            errorMessage: null
          });

          await fetch("/api/mobile-upload/pending-uploads", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              processedLectureUploadId: processedUpload.id,
              nextTaskStatus: processedUpload.task.status
            })
          }).catch(() => undefined);
        }

        for (const pendingUpload of payload.pendingUploads ?? []) {
          if (disposed) {
            return;
          }

          const result = await consumeMobileUploadHelperPendingUpload({
            pendingUpload,
            questionFolders: useFolderStore.getState().folders,
            examLibraryFolders: useExamStore.getState().examLibraryFolders,
            pendingUploadedFullPaperDraft: useExamStore.getState().pendingUploadedFullPaperDraft,
            fileStore: {
              upsertDocument: useFileStore.getState().upsertDocument,
              upsertPage: useFileStore.getState().upsertPage
            },
            questionStore: {
              setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
              setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
              appendBinaryAssets: useQuestionStore.getState().appendBinaryAssets
            },
            examStore: {
              setPendingUploadedFullPaperDraft: useExamStore.getState().setPendingUploadedFullPaperDraft,
              setExamWorkspaceDraft: useExamStore.getState().setExamWorkspaceDraft,
              upsertMobileUploadTask: useExamStore.getState().upsertMobileUploadTask
            },
            fetchImpl: fetch,
            preparePreviewBlob: prepareAiPreviewBlob
          });

          if (result.status === "blocked") {
            continue;
          }

          const acknowledgePayload =
            result.status === "consumed"
              ? {
                  pendingUploadId: pendingUpload.id,
                  nextTaskStatus: result.nextTaskStatus
                }
              : {
                  pendingUploadId: pendingUpload.id,
                  nextTaskStatus: "failed" as const,
                  errorMessage: result.errorMessage
                };

          await fetch("/api/mobile-upload/pending-uploads", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(acknowledgePayload)
          }).catch(() => undefined);
        }
      } finally {
        isProcessing = false;
      }
    };

    void processPendingUploads();
    pollTimer = window.setInterval(() => {
      void processPendingUploads();
    }, 5000);

    return () => {
      disposed = true;

      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
    };
  }, [
    appendBinaryAssets,
    hydrationSettled,
    setExamLibraryDocuments,
    setExamWorkspaceDraft,
    setMobileUploadTasks,
    setPagePreviewDataUrl,
    setPagePreviewUrl,
    setPendingUploadedFullPaperDraft,
    upsertDocument,
    upsertPage
  ]);

  useEffect(() => {
    if (!hydrationSettled) {
      return undefined;
    }

    let disposed = false;
    let persistTimer: number | null = null;
    const indexedDbSaveQueue = new LatestWorkspaceSnapshotSaveQueue<WorkspaceSnapshot>(
      (snapshot) => repository.save(snapshot)
    );

    const captureWorkspaceSnapshot = (): WorkspaceSnapshot => ({
      selectedPageId: useFileStore.getState().selectedPageId,
      documents: useFileStore.getState().documents,
      pages: useFileStore.getState().pages,
      folders: useFolderStore.getState().folders,
      examLibraryFolders: useExamStore.getState().examLibraryFolders,
      examLibraryDocuments: useExamStore.getState().examLibraryDocuments,
      examWorkspaceDraft: useExamStore.getState().examWorkspaceDraft,
      mobileUploadTasks: useExamStore.getState().mobileUploadTasks,
      pendingUploadedFullPaperDraft: useExamStore.getState().pendingUploadedFullPaperDraft,
      binaryAssets: useQuestionStore.getState().binaryAssets,
      questionDrafts: useQuestionStore.getState().questionDrafts,
      crossPageCandidates: useQuestionStore.getState().crossPageCandidates,
      manualMergeQuestionIds: useQuestionStore.getState().manualMergeQuestionIds,
      selectedQuestionId: useQuestionStore.getState().selectedQuestionId,
      lastBulkConfirmation: useQuestionStore.getState().lastBulkConfirmation,
      documentTasks: useWorkbenchStore.getState().documentTasks
    });

    const persistSnapshot = () => {
      if (disposed) {
        return;
      }

      const workspaceSnapshot = captureWorkspaceSnapshot();
      void indexedDbSaveQueue.enqueue(workspaceSnapshot).catch(() => undefined);

      const localLibrarySaveQueue = localLibrarySaveQueueRef.current;

      const documentTaskSaveQueue = documentTaskSaveQueueRef.current;

      if (documentTaskSaveQueue && !documentTaskSaveQueue.blocked) {
        void documentTaskSaveQueue
          .enqueue(workspaceSnapshot.documentTasks ?? [])
          .then(() => {
            documentTaskErrorReportedRef.current = false;
          })
          .catch((error: unknown) => {
            if (documentTaskErrorReportedRef.current) {
              return;
            }

            documentTaskErrorReportedRef.current = true;
            useToastStore.getState().pushToast({
              title:
                error instanceof DocumentTaskClientConflictError
                  ? "任务检查点已被另一个页面更新。当前页面已停止写入，请刷新后继续。"
                  : "任务检查点写入本机失败，浏览器副本仍会保留。",
              tone: "error"
            });
          });
      }

      if (!localLibrarySaveQueue || localLibrarySaveQueue.blocked) {
        return;
      }

      let localLibrarySnapshot;

      try {
        localLibrarySnapshot = buildLocalLibrarySnapshot({
          workspaceSnapshot,
          pagePreviewDataUrls: useQuestionStore.getState().pagePreviewDataUrls
        });
      } catch {
        if (!localLibraryErrorReportedRef.current) {
          localLibraryErrorReportedRef.current = true;
          useToastStore.getState().pushToast({
            title: "本机题库保存失败：题目预览引用不完整，请保留当前页面并检查题库内容。",
            tone: "error"
          });
        }
        return;
      }

      void localLibrarySaveQueue
        .enqueue(localLibrarySnapshot)
        .then(() => {
          localLibraryErrorReportedRef.current = false;
        })
        .catch((error: unknown) => {
          if (localLibraryErrorReportedRef.current) {
            return;
          }

          localLibraryErrorReportedRef.current = true;
          useToastStore.getState().pushToast({
            title:
              error instanceof LocalLibraryConflictError
                ? "本机题库已被另一个页面更新。当前页面已停止写入，请刷新后继续。"
                : "本机题库写入失败，浏览器工作副本已保留；后续修改时会自动重试。",
            tone: "error"
          });
        });
    };

    const schedulePersist = () => {
      if (persistTimer !== null) {
        window.clearTimeout(persistTimer);
      }

      persistTimer = window.setTimeout(() => {
        persistTimer = null;
        persistSnapshot();
      }, 120);
    };

    const unsubscribeFileStore = useFileStore.subscribe(() => {
      schedulePersist();
    });
    const unsubscribeFolderStore = useFolderStore.subscribe(() => {
      schedulePersist();
    });
    const unsubscribeQuestionStore = useQuestionStore.subscribe(() => {
      schedulePersist();
    });
    const unsubscribeExamStore = useExamStore.subscribe(() => {
      schedulePersist();
    });
    const unsubscribeWorkbenchStore = useWorkbenchStore.subscribe(() => {
      schedulePersist();
    });

    schedulePersist();

    return () => {
      disposed = true;
      if (persistTimer !== null) {
        window.clearTimeout(persistTimer);
      }
      unsubscribeFileStore();
      unsubscribeFolderStore();
      unsubscribeQuestionStore();
      unsubscribeExamStore();
      unsubscribeWorkbenchStore();
    };
  }, [hydrationSettled]);

  return null;
}


"use client";

import Link from "next/link";
import { useId, useMemo, useState, type DragEvent } from "react";

import type { FolderEntity } from "@/lib/domain/entities";
import type { SubjectScope } from "@/lib/domain/enums";
import { doesFolderPathMatchPrefix } from "@/lib/services/folder-service";
import {
  syncExamLibraryForQuestionFolderDeletion,
  syncExamLibraryForQuestionFolderRename
} from "@/lib/services/exam-library-service";
import { ensureDurablePagePreviewAssets } from "@/lib/services/library-preview-retention-service";
import { hasCompleteDurableQuestionImages } from "@/lib/services/durable-question-image-service";
import { importFilesIntoWorkspace } from "@/lib/services/workspace-import-service";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFileStore } from "@/lib/stores/file-store";
import { useFolderStore } from "@/lib/stores/folder-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";
import { useWorkbenchStore } from "@/lib/stores/workbench-store";

function FolderTreeNode(props: {
  folder: FolderEntity;
  childFoldersByParentId: Record<string, FolderEntity[]>;
  activeDropTargetId: string | null;
  currentFolderId: string | null;
  isActive: boolean;
  isExpanded: boolean;
  questionCount: number;
  getQuestionCount: (folderId: string) => number;
  isFolderExpanded: (folderId: string) => boolean;
  onCreateFolder: (parentId: string) => void;
  onRenameFolder: (folderId: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onToggleFolder: (folderId: string) => void;
  onDragFolderStart: (folderId: string) => void;
  onDragFolderOver: (folderId: string, event: DragEvent<HTMLDivElement>) => void;
  onDragFolderEnd: () => void;
  onDropFolder: (folderId: string) => void;
}) {
  const children = props.childFoldersByParentId[props.folder.id] ?? [];
  const hasChildren = children.length > 0;
  const draggable = props.folder.kind === "custom";
  const isDropTarget = props.activeDropTargetId === props.folder.id;
  const folderIcon = hasChildren && props.isExpanded ? "📂" : "📁";

  return (
    <div
      className={[
        "rounded-lg border px-3 py-2 text-xs transition",
        props.folder.kind === "pending_bucket"
          ? "border-dashed border-slate-200 bg-white/80 text-slate-500"
          : "border-slate-200 bg-white text-slate-700",
        props.isActive ? "border-sky-200 bg-sky-50 shadow-[0_0_0_1px_rgba(125,211,252,0.35)]" : "",
        isDropTarget ? "border-sky-300 bg-sky-50/70 shadow-[0_0_0_1px_rgba(56,189,248,0.2)]" : ""
      ].join(" ")}
      data-testid={draggable ? `folder-drop-zone-${props.folder.name}` : undefined}
      draggable={draggable}
      onDragEnd={
        draggable
          ? (event) => {
              event.stopPropagation();
              props.onDragFolderEnd();
            }
          : undefined
      }
      onDragOver={
        draggable
          ? (event) => {
              event.stopPropagation();
              props.onDragFolderOver(props.folder.id, event);
            }
          : undefined
      }
      onDragStart={
        draggable
          ? (event) => {
              event.stopPropagation();
              props.onDragFolderStart(props.folder.id);
            }
          : undefined
      }
      onDrop={
        draggable
          ? (event) => {
              event.stopPropagation();
              props.onDropFolder(props.folder.id);
            }
          : undefined
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {hasChildren ? (
            <button
              aria-label={`${props.isExpanded ? "折叠" : "展开"}目录-${props.folder.name}`}
              className="flex h-5 w-5 items-center justify-center rounded text-[11px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={() => props.onToggleFolder(props.folder.id)}
              type="button"
            >
              {props.isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="flex h-5 w-5 items-center justify-center text-[11px] text-slate-300">•</span>
          )}
          <span aria-hidden="true" className="text-sm">
            {folderIcon}
          </span>
          {props.folder.kind === "custom" ? (
            <Link
              aria-current={props.isActive ? "page" : undefined}
              className={[
                "truncate hover:text-sky-700 hover:underline",
                props.isActive ? "font-medium text-sky-700" : ""
              ].join(" ")}
              href={`/folder/${props.folder.id}`}
            >
              {props.folder.name}
            </Link>
          ) : (
            <span className="truncate">{props.folder.name}</span>
          )}
          <span
            aria-label={`目录题目数-${props.folder.name}`}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500"
          >
            {props.questionCount}
          </span>
        </div>
        {props.folder.kind === "custom" ? (
          <div className="flex gap-1">
            <button
              aria-label={`新增子目录-${props.folder.name}`}
              className="rounded-full border border-slate-200 px-2 py-1 text-[10px] text-slate-500"
              onClick={() => props.onCreateFolder(props.folder.id)}
              type="button"
            >
              新增
            </button>
            <button
              aria-label={`重命名目录-${props.folder.name}`}
              className="rounded-full border border-slate-200 px-2 py-1 text-[10px] text-slate-500"
              onClick={() => props.onRenameFolder(props.folder.id)}
              type="button"
            >
              重命名
            </button>
            <button
              aria-label={`删除目录-${props.folder.name}`}
              className="rounded-full border border-rose-200 px-2 py-1 text-[10px] text-rose-600"
              onClick={() => props.onDeleteFolder(props.folder.id)}
              type="button"
            >
              删除
            </button>
          </div>
        ) : null}
      </div>
      {isDropTarget ? (
        <div
          className="mt-2 h-1 rounded-full bg-sky-400"
          data-testid={`folder-drop-indicator-${props.folder.name}`}
        />
      ) : null}
      {hasChildren && props.isExpanded ? (
        <div className="mt-2 space-y-2 border-l border-slate-200 pl-3">
          {children.map((childFolder) => (
            <FolderTreeNode
              key={childFolder.id}
              activeDropTargetId={props.activeDropTargetId}
              childFoldersByParentId={props.childFoldersByParentId}
              currentFolderId={props.currentFolderId}
              folder={childFolder}
              isActive={props.currentFolderId === childFolder.id}
              isExpanded={props.isFolderExpanded(childFolder.id)}
              isFolderExpanded={props.isFolderExpanded}
              getQuestionCount={props.getQuestionCount}
              questionCount={props.getQuestionCount(childFolder.id)}
              onCreateFolder={props.onCreateFolder}
              onDeleteFolder={props.onDeleteFolder}
              onDragFolderEnd={props.onDragFolderEnd}
              onDragFolderOver={props.onDragFolderOver}
              onDragFolderStart={props.onDragFolderStart}
              onDropFolder={props.onDropFolder}
              onRenameFolder={props.onRenameFolder}
              onToggleFolder={props.onToggleFolder}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubjectUploadButton(props: {
  subjectScope: SubjectScope;
  onImport: (subjectScope: SubjectScope, files: FileList | null) => Promise<void>;
}) {
  const inputId = useId();

  return (
    <>
      <label
        className="cursor-pointer rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500"
        htmlFor={inputId}
      >
        上传文件
      </label>
      <input
        accept=".pdf,.png,.jpg,.jpeg"
        aria-label={`上传到${props.subjectScope}`}
        className="hidden"
        id={inputId}
        multiple
        onChange={(event) => void props.onImport(props.subjectScope, event.target.files)}
        type="file"
      />
    </>
  );
}

export function SidebarPanel(props?: { currentFolderId?: string | null }) {
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<string[]>([]);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [activeDropTargetId, setActiveDropTargetId] = useState<string | null>(null);
  const documents = useFileStore((state) => state.documents);
  const pages = useFileStore((state) => state.pages);
  const selectedPageId = useFileStore((state) => state.selectedPageId);
  const selectPage = useFileStore((state) => state.selectPage);
  const upsertDocument = useFileStore((state) => state.upsertDocument);
  const upsertPage = useFileStore((state) => state.upsertPage);
  const deleteDocument = useFileStore((state) => state.deleteDocument);
  const folders = useFolderStore((state) => state.folders);
  const questionDrafts = useQuestionStore((state) => state.questionDrafts);
  const pagePreviewDataUrls = useQuestionStore((state) => state.pagePreviewDataUrls);
  const binaryAssets = useQuestionStore((state) => state.binaryAssets);
  const createFolder = useFolderStore((state) => state.createFolder);
  const renameFolder = useFolderStore((state) => state.renameFolder);
  const deleteFolder = useFolderStore((state) => state.deleteFolder);
  const moveFolder = useFolderStore((state) => state.moveFolder);
  const setPagePreviewUrl = useQuestionStore((state) => state.setPagePreviewUrl);
  const setPagePreviewDataUrl = useQuestionStore((state) => state.setPagePreviewDataUrl);
  const setBinaryAssets = useQuestionStore((state) => state.setBinaryAssets);
  const appendBinaryAssets = useQuestionStore((state) => state.appendBinaryAssets);
  const removeDocumentWorkspaceArtifacts = useQuestionStore(
    (state) => state.removeDocumentWorkspaceArtifacts
  );
  const resetTransientProgress = useWorkbenchStore((state) => state.resetTransientProgress);
  const rewriteDirectoryPaths = useQuestionStore((state) => state.rewriteDirectoryPaths);
  const reassignQuestionsFromDeletedFolder = useQuestionStore(
    (state) => state.reassignQuestionsFromDeletedFolder
  );
  const examLibraryFolders = useExamStore((state) => state.examLibraryFolders);
  const examLibraryDocuments = useExamStore((state) => state.examLibraryDocuments);
  const examWorkspaceDraft = useExamStore((state) => state.examWorkspaceDraft);
  const setExamLibraryFolders = useExamStore((state) => state.setExamLibraryFolders);
  const setExamLibraryDocuments = useExamStore((state) => state.setExamLibraryDocuments);
  const setExamWorkspaceDraft = useExamStore((state) => state.setExamWorkspaceDraft);
  const pushToast = useToastStore((state) => state.pushToast);

  const documentGroups = useMemo(
    () =>
      documents.map((document) => ({
        document,
        pages: document.pageIds
          .map((pageId) => pages.find((page) => page.id === pageId) ?? null)
          .filter((page): page is NonNullable<typeof page> => page !== null)
      })),
    [documents, pages]
  );
  const rootFolders = useMemo(
    () => folders.filter((folder) => folder.depth === 1 && folder.subjectScope),
    [folders]
  );
  const childFoldersByParentId = useMemo(
    () =>
      folders.reduce<Record<string, typeof folders>>((accumulator, folder) => {
        if (!folder.parentId) {
          return accumulator;
        }

        accumulator[folder.parentId] ??= [];
        accumulator[folder.parentId].push(folder);
        return accumulator;
      }, {}),
    [folders]
  );
  const uncategorizedFolder = useMemo(
    () => folders.find((folder) => folder.name === "未分类" && folder.depth === 1) ?? null,
    [folders]
  );
  const folderQuestionCounts = useMemo(
    () =>
      folders.reduce<Record<string, number>>((accumulator, folder) => {
        accumulator[folder.id] = questionDrafts.filter((question) =>
          doesFolderPathMatchPrefix(question.directoryPath, folder.path)
        ).length;

        return accumulator;
      }, {}),
    [folders, questionDrafts]
  );
  const getFolderQuestionCount = (folderId: string) => folderQuestionCounts[folderId] ?? 0;
  const libraryQuestionCount = questionDrafts.length;
  const currentFolderId =
    props?.currentFolderId ??
    (typeof window !== "undefined" && window.location.pathname.startsWith("/folder/")
      ? decodeURIComponent(window.location.pathname.replace("/folder/", ""))
      : null);

  const canDropFolder = (targetFolderId: string) => {
    if (!draggingFolderId || draggingFolderId === targetFolderId) {
      return false;
    }

    const draggingFolder = folders.find((folder) => folder.id === draggingFolderId);
    const targetFolder = folders.find((folder) => folder.id === targetFolderId);

    if (
      !draggingFolder ||
      draggingFolder.kind !== "custom" ||
      !targetFolder ||
      targetFolder.kind !== "custom"
    ) {
      return false;
    }

    return !doesFolderPathMatchPrefix(targetFolder.path, draggingFolder.path);
  };

  const resetDragState = () => {
    setDraggingFolderId(null);
    setActiveDropTargetId(null);
  };

  const isFolderExpanded = (folderId: string) => !collapsedFolderIds.includes(folderId);

  const handleToggleFolder = (folderId: string) => {
    setCollapsedFolderIds((current) =>
      current.includes(folderId)
        ? current.filter((currentFolderId) => currentFolderId !== folderId)
        : current.concat(folderId)
    );
  };

  const handleCreateFolder = (parentId: string) => {
    const name = window.prompt("输入新目录名称");
    if (!name) {
      return;
    }

    createFolder(parentId, name);
  };

  const handleRenameFolder = (folderId: string) => {
    const target = folders.find((folder) => folder.id === folderId);
    if (!target) {
      return;
    }

    const name = window.prompt("输入新目录名称", target.name);
    if (!name) {
      return;
    }

    const renamed = renameFolder(folderId, name);
    if (!renamed) {
      return;
    }

    rewriteDirectoryPaths(target.path, renamed.path);
    const syncResult = syncExamLibraryForQuestionFolderRename({
      questionFolders: useFolderStore.getState().folders,
      existingExamLibraryFolders: examLibraryFolders,
      existingExamLibraryDocuments: examLibraryDocuments,
      previousQuestionPath: target.path,
      nextQuestionPath: renamed.path
    });

    setExamLibraryFolders(syncResult.examLibraryFolders);
    setExamLibraryDocuments(syncResult.examLibraryDocuments);

    if (examWorkspaceDraft.selectedFolderId) {
      const nextSelectedFolderId =
        syncResult.folderIdMap.get(examWorkspaceDraft.selectedFolderId) ??
        examWorkspaceDraft.selectedFolderId;

      if (nextSelectedFolderId !== examWorkspaceDraft.selectedFolderId) {
        setExamWorkspaceDraft({
          selectedFolderId: nextSelectedFolderId
        });
      }
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    const target = folders.find((folder) => folder.id === folderId);
    if (!target || !uncategorizedFolder) {
      return;
    }

    const reassignedCount = useQuestionStore
      .getState()
      .questionDrafts.filter((question) => doesFolderPathMatchPrefix(question.directoryPath, target.path)).length;

    const accepted = window.confirm(
      `确定要删除文件夹“${target.name}”吗？其中的题目将移入“未分类”文件夹。`
    );
    if (!accepted) {
      return;
    }

    const confirmedAgain = window.confirm(`请再次确认删除文件夹“${target.name}”。`);
    if (!confirmedAgain) {
      return;
    }

    const deletedIds = deleteFolder(folderId);
    if (deletedIds.length === 0) {
      return;
    }

    reassignQuestionsFromDeletedFolder(target.path, uncategorizedFolder.path);
    const syncResult = syncExamLibraryForQuestionFolderDeletion({
      questionFolders: useFolderStore.getState().folders,
      existingExamLibraryFolders: examLibraryFolders,
      existingExamLibraryDocuments: examLibraryDocuments
    });

    setExamLibraryFolders(syncResult.examLibraryFolders);
    setExamLibraryDocuments(syncResult.examLibraryDocuments);

    const nextDraft: Partial<typeof examWorkspaceDraft> = {};
    if (examWorkspaceDraft.selectedFolderId) {
      const nextSelectedFolderId =
        syncResult.folderIdMap.get(examWorkspaceDraft.selectedFolderId) ??
        (syncResult.examLibraryFolders.some(
          (folder) => folder.id === examWorkspaceDraft.selectedFolderId
        )
          ? examWorkspaceDraft.selectedFolderId
          : null);

      if (nextSelectedFolderId !== examWorkspaceDraft.selectedFolderId) {
        nextDraft.selectedFolderId = nextSelectedFolderId;
      }
    }

    if (examWorkspaceDraft.selectedDocumentId) {
      const hasSelectedDocument = syncResult.examLibraryDocuments.some(
        (document) => document.id === examWorkspaceDraft.selectedDocumentId
      );

      if (!hasSelectedDocument) {
        nextDraft.selectedDocumentId = null;
      }
    }

    if (Object.keys(nextDraft).length > 0) {
      setExamWorkspaceDraft(nextDraft);
    }

    pushToast({
      title: `文件夹已删除，${reassignedCount} 道题已移至未分类`,
      tone: "info"
    });
  };

  const handleDragFolderStart = (folderId: string) => {
    setDraggingFolderId(folderId);
    setActiveDropTargetId(null);
  };

  const handleDragFolderOver = (targetFolderId: string, event: DragEvent<HTMLDivElement>) => {
    if (!canDropFolder(targetFolderId)) {
      if (activeDropTargetId === targetFolderId) {
        setActiveDropTargetId(null);
      }
      return;
    }

    event.preventDefault();
    setActiveDropTargetId(targetFolderId);
  };

  const handleDropFolder = (targetFolderId: string) => {
    if (!draggingFolderId || !canDropFolder(targetFolderId)) {
      resetDragState();
      return;
    }

    const draggingFolder = folders.find((folder) => folder.id === draggingFolderId);
    if (!draggingFolder) {
      resetDragState();
      return;
    }

    const movedFolder = moveFolder(draggingFolderId, targetFolderId);
    if (movedFolder) {
      rewriteDirectoryPaths(draggingFolder.path, movedFolder.path);

      const syncResult = syncExamLibraryForQuestionFolderRename({
        questionFolders: useFolderStore.getState().folders,
        existingExamLibraryFolders: examLibraryFolders,
        existingExamLibraryDocuments: examLibraryDocuments,
        previousQuestionPath: draggingFolder.path,
        nextQuestionPath: movedFolder.path
      });

      setExamLibraryFolders(syncResult.examLibraryFolders);
      setExamLibraryDocuments(syncResult.examLibraryDocuments);

      if (examWorkspaceDraft.selectedFolderId) {
        const nextSelectedFolderId =
          syncResult.folderIdMap.get(examWorkspaceDraft.selectedFolderId) ??
          examWorkspaceDraft.selectedFolderId;

        if (nextSelectedFolderId !== examWorkspaceDraft.selectedFolderId) {
          setExamWorkspaceDraft({
            selectedFolderId: nextSelectedFolderId
          });
        }
      }
    }

    resetDragState();
  };

  const handleImportIntoSubject = async (subjectScope: SubjectScope, files: FileList | null) => {
    setImportErrorMessage(null);

    const result = await importFilesIntoWorkspace({
      files,
      subjectScope,
      fileStore: {
        upsertDocument,
        upsertPage
      },
      questionStore: {
        setPagePreviewUrl,
        setPagePreviewDataUrl,
        appendBinaryAssets
      },
      fetchImpl: fetch
    });

    if (result.unsupportedFileNames.length > 0) {
      setImportErrorMessage(`不支持的文件类型：${result.unsupportedFileNames.join("、")}`);
    }
  };

  const handleDeleteDocument = (documentId: string) => {
    const targetDocument = documents.find((document) => document.id === documentId);

    if (!targetDocument) {
      return;
    }

    const accepted = window.confirm(`确定删除文件“${targetDocument.name}”吗？相关框题和缓存也会清除。`);
    if (!accepted) {
      return;
    }

    const referencedQuestionIds = new Set(
      examLibraryDocuments.flatMap((document) => [
        ...document.questionIds,
        ...(document.pendingQuestionIds ?? [])
      ])
    );
    const preserveImportedQuestions =
      targetDocument.status === "import_ready" || targetDocument.status === "source_purged";
    const retainedQuestions = questionDrafts.filter(
      (question) =>
        question.documentId === documentId &&
        (preserveImportedQuestions || referencedQuestionIds.has(question.id))
    );
    const retainedPageIds = new Set(
      retainedQuestions.flatMap((question) => question.pageIds)
    );
    const retainedPages = pages.filter(
      (page) => page.documentId === documentId && retainedPageIds.has(page.id)
    );
    const retainedAssetIds = new Set(
      retainedQuestions.flatMap((question) => [
        ...(question.answerAttachments ?? []).map((attachment) => attachment.assetId),
        ...(question.questionImageAttachments ?? []).map((attachment) => attachment.assetId)
      ])
    );

    if (
      targetDocument.status === "import_ready" &&
      retainedQuestions.length > 0 &&
      !hasCompleteDurableQuestionImages({
        questions: retainedQuestions,
        binaryAssets
      })
    ) {
      pushToast({
        title: "高清题目文件尚未完整保存，原文件不会删除；请先重试专题卷同步。",
        tone: "error"
      });
      return;
    }

    retainedPages.forEach((page) => {
      if (page.displayAssetId) {
        retainedAssetIds.add(page.displayAssetId);
      }
    });
    const archivedAssets = ensureDurablePagePreviewAssets({
      pages: retainedPages,
      pagePreviewDataUrls,
      binaryAssets
    });

    if (archivedAssets !== binaryAssets) {
      setBinaryAssets(archivedAssets);
    }

    archivedAssets.forEach((asset) => {
      if (asset.kind === "display" && retainedPageIds.has(asset.pageId)) {
        retainedAssetIds.add(asset.id);
      }
    });

    const result = deleteDocument(documentId);
    if (!result) {
      return;
    }

    retainedPages.forEach((page) => upsertPage(page));
    removeDocumentWorkspaceArtifacts(documentId, result.deletedPageIds, {
      preserveQuestionIds: retainedQuestions.map((question) => question.id),
      preservePageIds: retainedPages.map((page) => page.id),
      preserveAssetIds: Array.from(retainedAssetIds)
    });
    resetTransientProgress();
    pushToast({
      title: retainedQuestions.length
        ? `已删除源文件并保留 ${retainedQuestions.length} 道入库题目：${targetDocument.name}`
        : `已删除文件：${targetDocument.name}`,
      tone: "info"
    });
  };

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">文件列表</h2>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
            {documents.length} 文件
          </span>
        </div>
        {documentGroups.length ? (
          <div className="space-y-2">
            {documentGroups.map(({ document, pages: documentPages }) => (
              <div
                key={document.id}
                className="rounded-lg border border-slate-200 bg-white px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-slate-700">{document.name}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-400">
                      {document.kind} · {documentPages.length} 页
                    </div>
                    {document.subjectScope ? (
                      <div className="mt-2 text-xs text-slate-500">学科：{document.subjectScope}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
                      {document.status}
                    </span>
                    <button
                      aria-label={`删除文件-${document.name}`}
                      className="rounded-full border border-rose-200 px-2 py-1 text-[11px] font-medium text-rose-600 transition hover:border-rose-300 hover:bg-rose-50"
                      onClick={() => handleDeleteDocument(document.id)}
                      type="button"
                    >
                      删除
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  {documentPages.map((page) => {
                    const isSelected = page.id === selectedPageId;

                    return (
                      <button
                        key={page.id}
                        aria-pressed={isSelected}
                        className={[
                          "rounded-lg border px-3 py-2 text-left text-sm transition",
                          isSelected
                            ? "border-sky-300 bg-sky-50 text-sky-700"
                            : "border-slate-200 bg-slate-50/70 text-slate-600 hover:border-sky-200 hover:bg-sky-50/50"
                        ].join(" ")}
                        onClick={() => selectPage(page.id)}
                        type="button"
                      >
                        第 {page.pageNumber} 页
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-500">
            上传 PDF 或图片后，这里会按文件和页码展示待处理内容。
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">目录库</h2>
          <button
            className="rounded-full bg-edu-50 px-3 py-1 text-xs font-medium text-edu-700"
            onClick={() => {
              const rootSubject = rootFolders[0];
              if (rootSubject) {
                handleCreateFolder(rootSubject.id);
              }
            }}
            type="button"
          >
            新建目录
          </button>
        </div>
        <div className="space-y-2">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium">
            <div className="flex items-center gap-2 text-slate-700">
              <span aria-hidden="true" className="text-sm">
                📂
              </span>
              <span className="truncate">我的题库</span>
              <span
                aria-label="目录题目数-我的题库"
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500"
              >
                {libraryQuestionCount}
              </span>
            </div>
          </div>
          {rootFolders.map((subject) => (
            <div
              key={subject.id}
              className={[
                "rounded-lg border px-3 py-3",
                currentFolderId === subject.id
                  ? "border-sky-200 bg-sky-50 shadow-[0_0_0_1px_rgba(125,211,252,0.35)]"
                  : "border-slate-100 bg-slate-50/70"
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    aria-label={`${isFolderExpanded(subject.id) ? "折叠" : "展开"}目录-${subject.name}`}
                    className="flex h-5 w-5 items-center justify-center rounded text-[11px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    onClick={() => handleToggleFolder(subject.id)}
                    type="button"
                  >
                    {isFolderExpanded(subject.id) ? "▾" : "▸"}
                  </button>
                  <span aria-hidden="true" className="text-sm">
                    {isFolderExpanded(subject.id) ? "📂" : "📁"}
                  </span>
                  <div className="truncate text-sm font-medium text-slate-700">{subject.name}</div>
                  <span
                    aria-label={`目录题目数-${subject.name}`}
                    className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500"
                  >
                    {getFolderQuestionCount(subject.id)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {subject.subjectScope ? (
                    <SubjectUploadButton
                      onImport={handleImportIntoSubject}
                      subjectScope={subject.subjectScope}
                    />
                  ) : null}
                  <button
                    aria-label={`新增子目录-${subject.name}`}
                    className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-500"
                    onClick={() => handleCreateFolder(subject.id)}
                    type="button"
                  >
                    新增
                  </button>
                </div>
              </div>
              {isFolderExpanded(subject.id) ? (
                <div className="mt-2 space-y-2">
                  {(childFoldersByParentId[subject.id] ?? []).map((folder) => (
                    <FolderTreeNode
                      key={folder.id}
                      activeDropTargetId={activeDropTargetId}
                      childFoldersByParentId={childFoldersByParentId}
                      currentFolderId={currentFolderId}
                      folder={folder}
                      getQuestionCount={getFolderQuestionCount}
                      isActive={currentFolderId === folder.id}
                      isExpanded={isFolderExpanded(folder.id)}
                      isFolderExpanded={isFolderExpanded}
                      questionCount={getFolderQuestionCount(folder.id)}
                      onCreateFolder={handleCreateFolder}
                      onDeleteFolder={handleDeleteFolder}
                      onDragFolderEnd={resetDragState}
                      onDragFolderOver={handleDragFolderOver}
                      onDragFolderStart={handleDragFolderStart}
                      onDropFolder={handleDropFolder}
                      onRenameFolder={handleRenameFolder}
                      onToggleFolder={handleToggleFolder}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {importErrorMessage ? <p className="mt-3 text-sm text-rose-600">{importErrorMessage}</p> : null}
      </section>
    </div>
  );
}

"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { PagePreview } from "@/components/page-canvas/page-preview";
import type {
  BinaryAssetEntity,
  CrossPageCandidateEntity,
  ExamLibraryDocumentEntity,
  QuestionDraftEntity,
  UploadedPdfPageEntity
} from "@/lib/domain/entities";
import {
  applyExamPaperDeletion,
  applyExamPaperLectureSpacing,
  applyExamPaperQuestionMove,
  applyExamPaperQuestionReplacement,
  createDefaultLectureSpacingState,
  undoExamPaperEdit
} from "@/lib/services/exam-paper-editing-service";
import {
  createQuestionBankFullPaperBundle,
  createIndependentLectureDocument,
  createUploadedPdfLectureDocument
} from "@/lib/services/exam-library-service";
import { buildPrintableExamDocument, buildPrintableExamPdf } from "@/lib/services/exam-print-service";
import { buildPrimaryLectureSyncMetadata } from "@/lib/services/lecture-sync-metadata-service";
import { buildPaperPreview } from "@/lib/services/paper-preview-service";
import {
  renderPdfBlobToPagePreviews,
  getPdfPageCountFromBlob,
  type PdfRenderBatch
} from "@/lib/pdf/pdf-renderer";
import {
  prepareAiPreviewBlob,
  prepareAiPreviewDataUrl
} from "@/lib/services/ai-image-preview-service";
import {
  assertUploadByteLength,
  DEFAULT_PDF_RENDER_BATCH_SIZE,
  MAX_INLINE_SOURCE_ASSET_BYTES,
  selectRepresentativePageNumbers,
  UploadCapacityError
} from "@/lib/services/upload-capacity";
import { dataUrlToBlob, readBlobAsDataUrl } from "@/lib/utils/blob-data-url";
import { buildQuestionDraftsFromDetection } from "@/lib/services/analysis-service";
import { buildCrossPageRequestCandidates } from "@/lib/services/review-service";
import { processWorkspacePrimaryLectureUpload } from "@/lib/services/workspace-primary-lecture-upload-service";
import { useExamStore } from "@/lib/stores/exam-store";
import { useFileStore } from "@/lib/stores/file-store";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useToastStore } from "@/lib/stores/toast-store";

const LIBRARY_LABELS = {
  specialized: "Specialized Library",
  full: "Full Library"
} as const;

const SOURCE_MODE_LABELS = {
  freeform: "Blank Lecture",
  uploaded_pdf: "PDF Document",
  question_bank: "Question Bank"
} as const;

type UploadedPdfAutoDetectProgress = {
  status: "idle" | "running" | "done" | "failed";
  phase: "question_boxes" | "cross_page";
  current: number;
  total: number;
  pageNumber: number | null;
  message: string | null;
};

type FullPaperUploadProgress = {
  status: "idle" | "running" | "done" | "failed";
  phase: "reading" | "rendering" | "answer_section";
  current: number;
  total: number;
  message: string;
};

type AiWorkflowResponseSource =
  | {
      provider: "openai_compatible" | "codex";
    }
  | {
      provider: "local_fallback";
      reason?: string;
      diagnosticId?: string;
    };

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function sortUploadedPdfQuestionsByPageThenLocal(
  questionPages: UploadedPdfPageEntity[],
  questions: QuestionDraftEntity[]
) {
  const pageRankById = new Map(questionPages.map((page, index) => [page.pageId, index]));

  return questions.slice().sort((left, right) => {
    const leftRank = pageRankById.get(left.primaryPageId) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = pageRankById.get(right.primaryPageId) ?? Number.MAX_SAFE_INTEGER;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    if (left.localOrder !== right.localOrder) {
      return left.localOrder - right.localOrder;
    }

    return left.globalOrder - right.globalOrder;
  });
}

function formatUploadedPdfAutoDetectProgress(progress: UploadedPdfAutoDetectProgress) {
  if (progress.message) {
    return progress.message;
  }

  if (progress.status === "done") {
    return "Auto-detect completed";
  }

  if (progress.status === "failed") {
    return "Auto-detect failed";
  }

  if (progress.phase === "cross_page") {
    return `Detecting cross-page joins ${progress.current} of ${progress.total}`;
  }

  return `Detecting question boxes on page ${progress.pageNumber ?? "-"} of ${progress.total}`;
}

function getUploadedPdfAiFailureMessage(
  stage: "Question detection" | "Cross-page detection",
  source?: AiWorkflowResponseSource
) {
  if (source?.provider !== "local_fallback") {
    return null;
  }

  const diagnosticSuffix = source.diagnosticId
    ? ` Diagnostic ID ${source.diagnosticId}.`
    : "";

  if (source.reason === "api_provider_not_selected") {
    return `AI service is not connected. ${stage} stopped.${diagnosticSuffix}`;
  }

  if (source.reason?.includes("missing")) {
    return `${stage} is missing a page image that can be sent to AI.${diagnosticSuffix}`;
  }

  return `${stage} AI request failed. Check ccSwitch routing and retry.${diagnosticSuffix}`;
}

function normalizeCrossPageCandidate(
  value: unknown,
  fallback: {
    documentId: string;
    leftPageId: string;
    rightPageId: string;
  }
): CrossPageCandidateEntity | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<CrossPageCandidateEntity>;

  if (
    typeof candidate.id !== "string" ||
    !Array.isArray(candidate.sourceQuestionIds) ||
    typeof candidate.confidence !== "number"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    documentId: fallback.documentId,
    leftPageId:
      typeof candidate.leftPageId === "string" ? candidate.leftPageId : fallback.leftPageId,
    rightPageId:
      typeof candidate.rightPageId === "string" ? candidate.rightPageId : fallback.rightPageId,
    sourceQuestionIds: candidate.sourceQuestionIds.filter(
      (questionId): questionId is string => typeof questionId === "string"
    ),
    confidence: candidate.confidence,
    status: "suggested"
  };
}

export default function ExamCreatePage() {
  const uploadInputId = useId();
  const fullPaperUploadInputId = useId();
  const primaryLectureUploadInputId = useId();
  const [blankLectureTitle, setBlankLectureTitle] = useState("");
  const [fullLibraryFolderName, setFullLibraryFolderName] = useState("");
  const [renameFullLibraryFolderName, setRenameFullLibraryFolderName] = useState("");
  const [fullPaperTitle, setFullPaperTitle] = useState("");
  const [selectedFullPaperQuestionIds, setSelectedFullPaperQuestionIds] = useState<string[]>([]);
  const [fullPaperNaturalLanguage, setFullPaperNaturalLanguage] = useState("");
  const [fullPaperAnswerSplitDraft, setFullPaperAnswerSplitDraft] = useState("");
  const [fullPaperUploadProgress, setFullPaperUploadProgress] =
    useState<FullPaperUploadProgress>({
      status: "idle",
      phase: "reading",
      current: 0,
      total: 1,
      message: ""
    });
  const [selectedUploadedFullPaperPageId, setSelectedUploadedFullPaperPageId] = useState<string | null>(null);
  const [uploadedPdfAutoDetectProgress, setUploadedPdfAutoDetectProgress] =
    useState<UploadedPdfAutoDetectProgress>({
      status: "idle",
      phase: "question_boxes",
      current: 0,
      total: 0,
      pageNumber: null,
      message: null
    });
  const [selectedEditorQuestionIds, setSelectedEditorQuestionIds] = useState<string[]>([]);
  const [replaceQuestionId, setReplaceQuestionId] = useState<string | null>(null);
  const [draggingEditorQuestionId, setDraggingEditorQuestionId] = useState<string | null>(null);
  const [editorMarqueeRect, setEditorMarqueeRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const editorMarqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const editorPreviewRef = useRef<HTMLDivElement | null>(null);
  const examLibraryFolders = useExamStore((state) => state.examLibraryFolders);
  const examLibraryDocuments = useExamStore((state) => state.examLibraryDocuments);
  const examWorkspaceDraft = useExamStore((state) => state.examWorkspaceDraft);
  const pendingUploadedFullPaperDraft = useExamStore((state) => state.pendingUploadedFullPaperDraft);
  const createExamLibraryFolder = useExamStore((state) => state.createExamLibraryFolder);
  const renameExamLibraryFolder = useExamStore((state) => state.renameExamLibraryFolder);
  const deleteExamLibraryFolder = useExamStore((state) => state.deleteExamLibraryFolder);
  const setExamWorkspaceDraft = useExamStore((state) => state.setExamWorkspaceDraft);
  const setExamLibraryDocuments = useExamStore((state) => state.setExamLibraryDocuments);
  const upsertExamLibraryDocument = useExamStore((state) => state.upsertExamLibraryDocument);
  const upsertMobileUploadTask = useExamStore((state) => state.upsertMobileUploadTask);
  const setPendingUploadedFullPaperDraft = useExamStore((state) => state.setPendingUploadedFullPaperDraft);
  const updateUploadedPdfPageReviewStatus = useExamStore(
    (state) => state.updateUploadedPdfPageReviewStatus
  );
  const confirmExamDocumentSync = useExamStore((state) => state.confirmExamDocumentSync);
  const confirmPendingUploadedFullPaperDraft = useExamStore(
    (state) => state.confirmPendingUploadedFullPaperDraft
  );
  const finalizeUploadedPdfDocumentGroup = useExamStore(
    (state) => state.finalizeUploadedPdfDocumentGroup
  );
  const appendBinaryAssets = useQuestionStore((state) => state.appendBinaryAssets);
  const questionDrafts = useQuestionStore((state) => state.questionDrafts);
  const binaryAssets = useQuestionStore((state) => state.binaryAssets);
  const documents = useFileStore((state) => state.documents);
  const upsertQuestionDrafts = useQuestionStore((state) => state.upsertQuestionDrafts);
  const replaceQuestionsForPage = useQuestionStore((state) => state.replaceQuestionsForPage);
  const addManualQuestionDraft = useQuestionStore((state) => state.addManualQuestionDraft);
  const removeQuestionDraft = useQuestionStore((state) => state.removeQuestionDraft);
  const updateQuestionNumberLabel = useQuestionStore((state) => state.updateQuestionNumberLabel);
  const setCrossPageCandidates = useQuestionStore((state) => state.setCrossPageCandidates);
  const acceptCrossPageCandidate = useQuestionStore((state) => state.acceptCrossPageCandidate);
  const pushToast = useToastStore((state) => state.pushToast);

  const selectedLibrary = examWorkspaceDraft.selectedLibrary;
  const libraryFolders = useMemo(
    () =>
      examLibraryFolders
        .filter((folder) => folder.library === selectedLibrary)
        .sort((left, right) => left.path.join(" / ").localeCompare(right.path.join(" / "), "zh-CN")),
    [examLibraryFolders, selectedLibrary]
  );
  const selectedFolder =
    libraryFolders.find((folder) => folder.id === examWorkspaceDraft.selectedFolderId) ?? null;
  const libraryDocuments = useMemo(
    () =>
      examLibraryDocuments
        .filter((document) => document.library === selectedLibrary)
        .sort((left, right) => left.title.localeCompare(right.title, "zh-CN")),
    [examLibraryDocuments, selectedLibrary]
  );
  const selectedDocument =
    examLibraryDocuments.find((document) => document.id === examWorkspaceDraft.selectedDocumentId) ?? null;
  const selectedUploadedFullPaperGroupPrimaryDocumentId = useMemo(() => {
    if (
      !selectedDocument ||
      selectedDocument.library !== "full" ||
      selectedDocument.sourceMode !== "uploaded_pdf" ||
      !selectedDocument.groupId
    ) {
      return null;
    }

    return (
      examLibraryDocuments.find(
        (document) =>
          document.groupId === selectedDocument.groupId &&
          document.kind === "paper" &&
          document.sourceMode === "uploaded_pdf"
      )?.id ?? selectedDocument.id
    );
  }, [examLibraryDocuments, selectedDocument]);
  const folderPathById = useMemo(
    () =>
      new Map(examLibraryFolders.map((folder) => [folder.id, folder.path.join(" / ")])),
    [examLibraryFolders]
  );
  const selectedOrRootFullFolder =
    selectedLibrary === "full"
      ? selectedFolder ?? examLibraryFolders.find((folder) => folder.id === "full-root") ?? null
      : null;
  const fullLibraryQuestionOptions = useMemo(() => {
    if (selectedLibrary !== "full" || !selectedFolder) {
      return [];
    }

    const blockedDocumentIds = new Set(
      documents.filter((document) => document.pendingAnswerMatch).map((document) => document.id)
    );

    return questionDrafts
      .filter((question) => {
        if (
          !question.directoryPath?.length ||
          selectedFolder.subjectScope === null ||
          question.classificationStatus !== "confirmed" ||
          blockedDocumentIds.has(question.documentId)
        ) {
          return false;
        }

        return question.directoryPath[1] === selectedFolder.subjectScope;
      })
      .sort((left, right) => left.globalOrder - right.globalOrder);
  }, [documents, questionDrafts, selectedFolder, selectedLibrary]);

  useEffect(() => {
    if (!pendingUploadedFullPaperDraft) {
      setFullPaperAnswerSplitDraft("");
      return;
    }

    const nextValue =
      pendingUploadedFullPaperDraft.answerSection.confirmedSplitPage ??
      pendingUploadedFullPaperDraft.answerSection.suggestedSplitPage;

    setFullPaperAnswerSplitDraft(nextValue ? String(nextValue) : "");
  }, [pendingUploadedFullPaperDraft]);

  const uploadedPdfQuestionPages = useMemo(() => {
    if (
      !selectedDocument ||
      selectedDocument.library !== "full" ||
      selectedDocument.sourceMode !== "uploaded_pdf" ||
      !selectedDocument.uploadedPdfPages?.length
    ) {
      return [];
    }

    const answerSection = selectedDocument.uploadedPdfAnswerSection;

    if (answerSection && !answerSection.hasAnswerSection) {
      return selectedDocument.uploadedPdfPages;
    }

    const splitPage =
      answerSection?.confirmedSplitPage ??
      answerSection?.suggestedSplitPage ??
      selectedDocument.uploadedPdfPages.length + 1;

    return selectedDocument.uploadedPdfPages.filter((page) => page.pageNumber < splitPage);
  }, [selectedDocument]);
  const selectedUploadedFullPaperPage = useMemo(
    () =>
      uploadedPdfQuestionPages.find((page) => page.pageId === selectedUploadedFullPaperPageId) ??
      uploadedPdfQuestionPages[0] ??
      null,
    [selectedUploadedFullPaperPageId, uploadedPdfQuestionPages]
  );
  const selectedUploadedFullPaperPageQuestions = useMemo(() => {
    const primaryDocumentId = selectedUploadedFullPaperGroupPrimaryDocumentId ?? selectedDocument?.id ?? null;

    if (!selectedUploadedFullPaperPageId || !primaryDocumentId) {
      return [];
    }

    return questionDrafts
      .filter(
        (question) =>
          question.documentId === primaryDocumentId &&
          question.pageIds.includes(selectedUploadedFullPaperPageId)
      )
      .sort((left, right) => left.localOrder - right.localOrder);
  }, [
    questionDrafts,
    selectedDocument?.id,
    selectedUploadedFullPaperGroupPrimaryDocumentId,
    selectedUploadedFullPaperPageId
  ]);
  const selectedUploadedFullPaperPreviewUrl = useMemo(() => {
    if (!selectedUploadedFullPaperPage) {
      return null;
    }

    return (
      binaryAssets.find((asset) => asset.id === selectedUploadedFullPaperPage.previewAssetId)?.dataUrl ??
      null
    );
  }, [binaryAssets, selectedUploadedFullPaperPage]);
  const selectedEditablePaper =
    selectedDocument &&
    selectedDocument.kind === "paper" &&
    selectedDocument.sourceMode === "question_bank" &&
    selectedDocument.allowsQuestionMutations
      ? selectedDocument
      : null;
  const selectedPrimaryLecture =
    selectedDocument &&
    selectedDocument.kind === "lecture" &&
    selectedDocument.lectureVariant === "primary"
      ? selectedDocument
      : null;
  const selectedPrimaryLectureQuestionIds =
    selectedPrimaryLecture?.syncStatus === "pending_confirmation" &&
    selectedPrimaryLecture.pendingQuestionIds
      ? selectedPrimaryLecture.pendingQuestionIds
      : selectedPrimaryLecture?.questionIds ?? [];
  const selectedPrimaryLectureQuestionBlocks =
    selectedPrimaryLecture?.syncStatus === "pending_confirmation" &&
    selectedPrimaryLecture.pendingQuestionBlocks
      ? selectedPrimaryLecture.pendingQuestionBlocks
      : selectedPrimaryLecture?.questionBlocks;
  const selectedPrimaryLecturePreview = useMemo(() => {
    if (!selectedPrimaryLecture) {
      return null;
    }

    return buildPaperPreview({
      document: {
        numberingMode: selectedPrimaryLecture.numberingMode,
        questionIds: selectedPrimaryLectureQuestionIds,
        questionBlocks: selectedPrimaryLectureQuestionBlocks,
        lectureSpacing: selectedPrimaryLecture.lectureSpacing
      },
      questionDrafts: selectedPrimaryLectureQuestionIds.map((questionId) => {
        const question = questionDrafts.find((candidate) => candidate.id === questionId);

        return {
          id: questionId,
          questionNumberLabel: question?.questionNumberLabel ?? null,
          ocrText: question?.ocrText ?? null
        };
      })
    });
  }, [
    questionDrafts,
    selectedPrimaryLecture,
    selectedPrimaryLectureQuestionBlocks,
    selectedPrimaryLectureQuestionIds
  ]);
  const selectedEditablePaperQuestions = useMemo(() => {
    if (!selectedEditablePaper) {
      return [];
    }

    return selectedEditablePaper.questionIds
      .map((questionId) => questionDrafts.find((question) => question.id === questionId) ?? null)
      .filter((question): question is NonNullable<typeof question> => Boolean(question));
  }, [questionDrafts, selectedEditablePaper]);
  const selectedEditablePaperPreview = useMemo(() => {
    if (!selectedEditablePaper) {
      return null;
    }

    return buildPaperPreview({
      document: {
        numberingMode: selectedEditablePaper.numberingMode,
        questionIds: selectedEditablePaper.questionIds,
        questionBlocks: selectedEditablePaper.questionBlocks
      },
      questionDrafts: selectedEditablePaperQuestions.map((question) => ({
        id: question.id,
        questionNumberLabel: question.questionNumberLabel ?? null,
        ocrText: question.ocrText ?? null
      }))
    });
  }, [selectedEditablePaper, selectedEditablePaperQuestions]);
  const selectedEditableLecture =
    selectedEditablePaper?.groupId
      ? examLibraryDocuments.find(
          (document) =>
            document.groupId === selectedEditablePaper.groupId && document.kind === "lecture"
        ) ?? null
      : null;
  const selectedEditableLectureSpacing =
    selectedEditableLecture?.lectureSpacing ?? createDefaultLectureSpacingState();
  const selectedEditorQuestionIdSet = useMemo(
    () => new Set(selectedEditorQuestionIds),
    [selectedEditorQuestionIds]
  );
  const willDeleteEmptySpecializedBlock = useMemo(() => {
    if (!selectedEditablePaper?.questionBlocks?.length || selectedEditorQuestionIds.length === 0) {
      return false;
    }

    return selectedEditablePaper.questionBlocks.some(
      (block) =>
        block.questionIds.length > 0 &&
        block.questionIds.every((questionId) => selectedEditorQuestionIdSet.has(questionId))
    );
  }, [selectedEditablePaper?.questionBlocks, selectedEditorQuestionIdSet, selectedEditorQuestionIds.length]);
  const replacementCandidates = useMemo(() => {
    if (!selectedEditablePaper || !replaceQuestionId) {
      return [];
    }

    const currentQuestion = questionDrafts.find((question) => question.id === replaceQuestionId);
    const subjectScope =
      currentQuestion?.directoryPath?.[1] ??
      selectedFolder?.subjectScope ??
      selectedEditablePaper.subjectScope;
    const currentDirectoryKey = currentQuestion?.directoryPath?.join("\u0000") ?? "";
    const selectedQuestionIdSet = new Set(selectedEditablePaper.questionIds);

    return questionDrafts
      .filter((question) => {
        if (
          question.id === replaceQuestionId ||
          selectedQuestionIdSet.has(question.id) ||
          question.classificationStatus !== "confirmed" ||
          !question.directoryPath?.length
        ) {
          return false;
        }

        return question.directoryPath[1] === subjectScope;
      })
      .sort((left, right) => {
        const leftPriority = left.directoryPath?.join("\u0000") === currentDirectoryKey ? 1 : 0;
        const rightPriority = right.directoryPath?.join("\u0000") === currentDirectoryKey ? 1 : 0;

        if (leftPriority !== rightPriority) {
          return rightPriority - leftPriority;
        }

        return left.globalOrder - right.globalOrder;
      });
  }, [questionDrafts, replaceQuestionId, selectedEditablePaper, selectedFolder?.subjectScope]);

  useEffect(() => {
    if (!uploadedPdfQuestionPages.length) {
      setSelectedUploadedFullPaperPageId(null);
      return;
    }

    setSelectedUploadedFullPaperPageId((current) =>
      current && uploadedPdfQuestionPages.some((page) => page.pageId === current)
        ? current
        : uploadedPdfQuestionPages[0].pageId
    );
  }, [uploadedPdfQuestionPages]);

  useEffect(() => {
    setSelectedEditorQuestionIds([]);
    setReplaceQuestionId(null);
    setDraggingEditorQuestionId(null);
    setEditorMarqueeRect(null);
    editorMarqueeStartRef.current = null;
  }, [selectedEditablePaper?.id]);

  useEffect(() => {
    if (!editorMarqueeStartRef.current) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const previewRect = editorPreviewRef.current?.getBoundingClientRect();
      const start = editorMarqueeStartRef.current;

      if (!previewRect || !start) {
        return;
      }

      const currentX = Math.max(0, Math.min(event.clientX - previewRect.left, previewRect.width));
      const currentY = Math.max(0, Math.min(event.clientY - previewRect.top, previewRect.height));
      const left = Math.min(start.x, currentX);
      const top = Math.min(start.y, currentY);
      const width = Math.abs(currentX - start.x);
      const height = Math.abs(currentY - start.y);

      setEditorMarqueeRect({
        left,
        top,
        width,
        height
      });
    };

    const handlePointerUp = () => {
      const previewRect = editorPreviewRef.current?.getBoundingClientRect();
      const marqueeRect = editorMarqueeRect;

      if (!previewRect || !marqueeRect) {
        editorMarqueeStartRef.current = null;
        setEditorMarqueeRect(null);
        return;
      }

      const selectionLeft = previewRect.left + marqueeRect.left;
      const selectionTop = previewRect.top + marqueeRect.top;
      const selectionRight = selectionLeft + marqueeRect.width;
      const selectionBottom = selectionTop + marqueeRect.height;

      const selectedIds = selectedEditablePaperPreview?.sections.flatMap((section) =>
        section.items
          .map((item) => {
            const element = document.querySelector<HTMLElement>(
              `[aria-label="paper-editor-preview-item-${section.key}-${item.questionId}"]`
            );
            const rect = element?.getBoundingClientRect();

            if (!rect) {
              return null;
            }

            const intersects =
              rect.left < selectionRight &&
              rect.right > selectionLeft &&
              rect.top < selectionBottom &&
              rect.bottom > selectionTop;

            return intersects ? item.questionId : null;
          })
          .filter((questionId): questionId is string => Boolean(questionId))
      ) ?? [];

      if (selectedIds.length > 0) {
        setSelectedEditorQuestionIds(selectedIds);
      }

      editorMarqueeStartRef.current = null;
      setEditorMarqueeRect(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [editorMarqueeRect, selectedEditablePaperPreview]);

  const handleCreateBlankLecture = () => {
    if (!selectedFolder) {
      return;
    }

    const document = createIndependentLectureDocument({
      id: createId("exam-doc"),
      folder: selectedFolder,
      title: blankLectureTitle
    });

    upsertExamLibraryDocument(document);
    setExamWorkspaceDraft({
      selectedDocumentId: document.id
    });
    setBlankLectureTitle("");
  };

  const handleUploadLecturePdf = async (files: FileList | null) => {
    const file = files?.[0];

    if (!file || !selectedFolder) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return;
    }

    try {
      assertUploadByteLength(file.size);
      await getPdfPageCountFromBlob(file);
    } catch (error) {
      pushToast({
        title: error instanceof UploadCapacityError ? error.message : "PDF 文件大小校验失败",
        tone: "error"
      });
      return;
    }

    const documentId = createId("exam-doc");
    const sourceAssetId = createId("asset-source");
    const sourceAsset: BinaryAssetEntity = {
      id: sourceAssetId,
      documentId,
      pageId: documentId,
      kind: "source",
      mimeType: file.type || "application/pdf",
      byteLength: file.size,
      blob: file
    };
    if (file.size <= MAX_INLINE_SOURCE_ASSET_BYTES) {
      sourceAsset.dataUrl = await readBlobAsDataUrl(file);
    }
    const document = createUploadedPdfLectureDocument({
      id: documentId,
      folder: selectedFolder,
      fileName: file.name,
      sourceAssetId
    });

    appendBinaryAssets([sourceAsset]);
    upsertExamLibraryDocument(document);
    setExamWorkspaceDraft({
      selectedDocumentId: document.id
    });
  };

  const handleUploadFullPaperPdf = async (files: FileList | null) => {
    const file = files?.[0];

    if (!file || !selectedFolder || selectedLibrary !== "full") {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return;
    }

    try {
      assertUploadByteLength(file.size);
    } catch (error) {
      pushToast({
        title: error instanceof UploadCapacityError ? error.message : "PDF 文件大小校验失败",
        tone: "error"
      });
      return;
    }

    setFullPaperUploadProgress({
      status: "running",
      phase: "reading",
      current: 0,
      total: 1,
      message: "正在读取 PDF 文件"
    });

    try {
      setFullPaperUploadProgress({
        status: "running",
        phase: "rendering",
        current: 0,
        total: 1,
        message: "正在解析 PDF 页面"
      });
      const renderedPageMetas = new Map<
      number,
      {
        pageNumber: number;
        width: number;
        height: number;
        byteLength: number;
        blob: Blob;
        textLines?: PdfRenderBatch["pages"][number]["textLines"];
      }
      >();
      const pagePreviewDataUrlsByNumber = new Map<number, string>();
      const answerSampleDataUrlsByNumber = new Map<number, string>();

      const processRenderedPages = async (
        pages: PdfRenderBatch["pages"],
        pageCount: number
      ) => {
        const samplePageNumbers = new Set(selectRepresentativePageNumbers(pageCount));

        for (const renderedPage of pages) {
          let preparedDataUrl: string;
          let displayBlob: Blob;

          if (
            renderedPage.blob.size > 300_000 &&
            typeof prepareAiPreviewBlob === "function"
          ) {
            const boundedBlob = await prepareAiPreviewBlob(renderedPage.blob);

            if (boundedBlob !== renderedPage.blob || boundedBlob.size < renderedPage.blob.size) {
              displayBlob = boundedBlob;
              preparedDataUrl = await readBlobAsDataUrl(boundedBlob);
            } else {
              const rawDataUrl = await readBlobAsDataUrl(renderedPage.blob);
              preparedDataUrl = await prepareAiPreviewDataUrl(rawDataUrl);
              displayBlob = dataUrlToBlob(preparedDataUrl) ?? renderedPage.blob;
            }
          } else {
            const rawDataUrl = await readBlobAsDataUrl(renderedPage.blob);
            preparedDataUrl = await prepareAiPreviewDataUrl(rawDataUrl);
            displayBlob = dataUrlToBlob(preparedDataUrl) ?? renderedPage.blob;
          }
          renderedPageMetas.set(renderedPage.pageNumber, {
            pageNumber: renderedPage.pageNumber,
            width: renderedPage.width,
            height: renderedPage.height,
            byteLength: displayBlob.size,
            blob: displayBlob,
            textLines: renderedPage.textLines
          });
          pagePreviewDataUrlsByNumber.set(renderedPage.pageNumber, preparedDataUrl);

          if (samplePageNumbers.has(renderedPage.pageNumber)) {
            answerSampleDataUrlsByNumber.set(renderedPage.pageNumber, preparedDataUrl);
          }
        }
      };

      const renderedResult = await renderPdfBlobToPagePreviews(file, {
        batchSize: DEFAULT_PDF_RENDER_BATCH_SIZE,
        onProgress: ({ current, total }) => {
          setFullPaperUploadProgress({
            status: "running",
            phase: "rendering",
            current,
            total,
            message: `正在生成页面预览 ${current}/${total}`
          });
        },
        onBatch: async ({ pages, pageCount }) => {
          await processRenderedPages(pages, pageCount);
        }
      });

      // Test adapters and older callers may return pages without invoking onBatch.
      if (renderedResult.length > 0) {
        await processRenderedPages(renderedResult, renderedResult.length);
      }

      const renderedPages = Array.from(renderedPageMetas.values()).sort(
        (left, right) => left.pageNumber - right.pageNumber
      );
      const pageImageDataUrls = Array.from(answerSampleDataUrlsByNumber.entries())
        .sort(([left], [right]) => left - right)
        .map(([, dataUrl]) => dataUrl);
      const sampledPageNumbers = Array.from(answerSampleDataUrlsByNumber.keys()).sort(
        (left, right) => left - right
      );

      setFullPaperUploadProgress({
        status: "running",
        phase: "answer_section",
        current: 0,
        total: 1,
        message: "正在识别答案页起始位置"
      });

      const answerSectionResponse = await fetch("/api/ai/suggest-answer-section", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          documentId: null,
          pageCount: renderedPages.length,
          pageImageDataUrls,
          sampledPageNumbers
        })
      });

      const answerSectionPayload = answerSectionResponse.ok
        ? ((await answerSectionResponse.json()) as {
            answerSection?: {
              hasAnswerSection?: boolean;
              suggestedSplitPage?: number;
            };
          })
        : null;

      const documentId = createId("exam-doc");
      const sourceAssetId = createId("asset-source");
      const sourceAsset: BinaryAssetEntity = {
      id: sourceAssetId,
      documentId,
      pageId: documentId,
      kind: "source",
      mimeType: file.type || "application/pdf",
      byteLength: file.size,
      blob: file
      };
      if (file.size <= MAX_INLINE_SOURCE_ASSET_BYTES) {
        sourceAsset.dataUrl = await readBlobAsDataUrl(file);
      }
      const pagePreviewAssets: BinaryAssetEntity[] = renderedPages.map((renderedPage) => {
        const dataUrl = pagePreviewDataUrlsByNumber.get(renderedPage.pageNumber);

        if (!dataUrl) {
          throw new Error(`Failed to prepare preview for PDF page ${renderedPage.pageNumber}`);
        }

        return {
          id: createId("asset-page-preview"),
          documentId,
          pageId: `uploaded-page-${renderedPage.pageNumber}`,
          kind: "display",
          mimeType: renderedPage.blob.type || "image/png",
          byteLength: renderedPage.byteLength || dataUrl.length,
          dataUrl,
          blob: renderedPage.blob
        };
      });

      const nextPendingDraft = {
        id: documentId,
        folderId: selectedFolder.id,
        fileName: file.name,
        sourceAssetId,
        sourceDocumentId: documentId,
        pageCount: renderedPages.length,
        answerSection: {
          status: "suggested" as const,
          hasAnswerSection: answerSectionPayload?.answerSection?.hasAnswerSection ?? true,
          suggestedSplitPage:
            answerSectionPayload?.answerSection?.suggestedSplitPage ?? renderedPages.length,
          confirmedSplitPage: null
        },
        uploadedPdfPages: renderedPages.map((page, index) => ({
          pageId: `uploaded-page-${index + 1}`,
          pageNumber: page.pageNumber,
          width: page.width,
          height: page.height,
          reviewStatus: "unreviewed" as const,
          previewAssetId: pagePreviewAssets[index].id,
          ...(page.textLines?.length ? { textLines: page.textLines } : {})
        }))
      };

      appendBinaryAssets([sourceAsset, ...pagePreviewAssets]);
      setFullPaperAnswerSplitDraft(
        nextPendingDraft.answerSection.confirmedSplitPage
          ? String(nextPendingDraft.answerSection.confirmedSplitPage)
          : nextPendingDraft.answerSection.suggestedSplitPage
            ? String(nextPendingDraft.answerSection.suggestedSplitPage)
            : ""
      );
      setPendingUploadedFullPaperDraft(nextPendingDraft);
      setFullPaperUploadProgress({
        status: "done",
        phase: "answer_section",
        current: 1,
        total: 1,
        message: "PDF 预处理完成"
      });
    } catch (error) {
      setFullPaperUploadProgress({
        status: "failed",
        phase: "reading",
        current: 0,
        total: 1,
        message:
          error instanceof UploadCapacityError
            ? error.message
            : "PDF 文件预处理失败，请检查文件后重试。"
      });
      pushToast({
        title:
          error instanceof UploadCapacityError
            ? error.message
            : "PDF 文件预处理失败，请检查文件后重试。",
        tone: "error"
      });
    }
  };

  const handleDownloadPrimaryLecturePdf = async () => {
    if (!selectedPrimaryLecture) {
      return;
    }

    const exportedSyncMetadata =
      selectedPrimaryLecture.syncMetadata ??
      buildPrimaryLectureSyncMetadata({
        sourceDocumentId: selectedPrimaryLecture.id,
        questionIds: selectedPrimaryLectureQuestionIds,
        questionBlocks: selectedPrimaryLectureQuestionBlocks
      });
    const printableDocument = buildPrintableExamDocument({
      title: selectedPrimaryLecture.title,
      documentKind: "lecture",
      sourceMode: selectedPrimaryLecture.sourceMode,
      paperPreview: selectedPrimaryLecturePreview
    });
    const pdfDocument = await buildPrintableExamPdf({
      title: printableDocument.fileNameBase,
      html: printableDocument.html
    });
    const objectUrl = URL.createObjectURL(pdfDocument.blob);
    const anchor = document.createElement("a");

    setExamLibraryDocuments(
      examLibraryDocuments.map((document) =>
        document.id === selectedPrimaryLecture.id
          ? {
              ...document,
              lastExportedSyncMetadata: exportedSyncMetadata
            }
          : document
      )
    );
    anchor.href = objectUrl;
    anchor.download = pdfDocument.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const handleUploadPrimaryLecturePdf = (files: FileList | null) => {
    const file = files?.[0];

    if (!file || !selectedPrimaryLecture) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      pushToast({
        title: "Only PDF uploads are supported for primary lecture sync.",
        tone: "error"
      });
      return;
    }

    const result = processWorkspacePrimaryLectureUpload({
      file: {
        name: file.name,
        type: file.type,
        size: file.size
      },
      targetDocumentId: selectedPrimaryLecture.id,
      examLibraryFolders,
      examLibraryDocuments
    });

    if (result.status === "rejected") {
      pushToast({
        title: result.errorMessage,
        tone: "error"
      });
      return;
    }

    appendBinaryAssets([result.sourceAsset]);
    setExamLibraryDocuments(result.examLibraryDocuments);
    upsertMobileUploadTask(result.task);
    pushToast({
      title:
        result.task.status === "processing"
          ? "Primary lecture upload is awaiting sync review."
          : "Primary lecture upload applied.",
      tone: result.task.status === "processing" ? "info" : "success"
    });
  };

  const handleCreateFullLibraryFolder = () => {
    if (!selectedOrRootFullFolder) {
      return;
    }

    const folder = createExamLibraryFolder(selectedOrRootFullFolder.id, fullLibraryFolderName);

    if (!folder) {
      return;
    }

    setExamWorkspaceDraft({
      selectedFolderId: folder.id
    });
    setFullLibraryFolderName("");
  };

  const handleRenameFullLibraryFolder = () => {
    if (!selectedFolder || selectedFolder.library !== "full" || selectedFolder.kind !== "custom") {
      return;
    }

    const renamed = renameExamLibraryFolder(selectedFolder.id, renameFullLibraryFolderName);

    if (!renamed) {
      return;
    }

    setRenameFullLibraryFolderName("");
  };

  const handleDeleteFullLibraryFolder = () => {
    if (!selectedFolder || selectedFolder.library !== "full" || selectedFolder.kind !== "custom") {
      return;
    }

    deleteExamLibraryFolder(selectedFolder.id);
    setRenameFullLibraryFolderName("");
  };

  const handleToggleFullPaperQuestion = (questionId: string) => {
    setSelectedFullPaperQuestionIds((current) =>
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : current.concat(questionId)
    );
  };

  const handleToggleEditorQuestion = (questionId: string) => {
    setSelectedEditorQuestionIds((current) =>
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : current.concat(questionId)
    );
  };

  const handleDeleteSelectedEditorQuestions = (keepEmptyBlocks: boolean) => {
    if (!selectedEditablePaper || selectedEditorQuestionIds.length === 0) {
      return;
    }

    const nextDocuments = applyExamPaperDeletion({
      documents: examLibraryDocuments,
      documentId: selectedEditablePaper.id,
      deletedQuestionIds: selectedEditorQuestionIds,
      keepEmptyBlocks,
      questions: questionDrafts
    });

    setExamLibraryDocuments(nextDocuments);
    setSelectedEditorQuestionIds([]);
  };

  const handleUndoEditorChange = () => {
    if (!selectedEditablePaper) {
      return;
    }

    const nextDocuments = undoExamPaperEdit({
      documents: examLibraryDocuments,
      documentId: selectedEditablePaper.id
    });

    if (!nextDocuments) {
      return;
    }

    setExamLibraryDocuments(nextDocuments);
    setSelectedEditorQuestionIds([]);
  };

  const handleReplaceEditorQuestion = (replacementQuestionId: string) => {
    if (!selectedEditablePaper || !replaceQuestionId) {
      return;
    }

    const nextDocuments = applyExamPaperQuestionReplacement({
      documents: examLibraryDocuments,
      documentId: selectedEditablePaper.id,
      questionId: replaceQuestionId,
      replacementQuestionId,
      questions: questionDrafts
    });

    setExamLibraryDocuments(nextDocuments);
    setReplaceQuestionId(null);
    setSelectedEditorQuestionIds([]);
  };

  const handleUpdateEditorDefaultGap = (gap: number) => {
    if (!selectedEditablePaper) {
      return;
    }

    const nextDocuments = applyExamPaperLectureSpacing({
      documents: examLibraryDocuments,
      documentId: selectedEditablePaper.id,
      defaultGap: gap
    });

    setExamLibraryDocuments(nextDocuments);
  };

  const handleUpdateEditorQuestionGap = (questionId: string, gap: number) => {
    if (!selectedEditablePaper) {
      return;
    }

    const nextDocuments = applyExamPaperLectureSpacing({
      documents: examLibraryDocuments,
      documentId: selectedEditablePaper.id,
      questionId,
      gap
    });

    setExamLibraryDocuments(nextDocuments);
  };

  const handleEditorQuestionDragStart = (questionId: string) => {
    setDraggingEditorQuestionId(questionId);
  };

  const handleEditorQuestionDragEnd = () => {
    setDraggingEditorQuestionId(null);
  };

  const handleEditorPreviewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (draggingEditorQuestionId || event.target !== event.currentTarget) {
      return;
    }

    const previewRect = event.currentTarget.getBoundingClientRect();
    const startX = Math.max(0, Math.min(event.clientX - previewRect.left, previewRect.width));
    const startY = Math.max(0, Math.min(event.clientY - previewRect.top, previewRect.height));

    editorMarqueeStartRef.current = {
      x: startX,
      y: startY
    };
    setEditorMarqueeRect({
      left: startX,
      top: startY,
      width: 0,
      height: 0
    });
  };

  const handleEditorQuestionDropOnQuestion = (targetQuestionId: string) => {
    if (!selectedEditablePaper || !draggingEditorQuestionId) {
      return;
    }

    const nextDocuments = applyExamPaperQuestionMove({
      documents: examLibraryDocuments,
      documentId: selectedEditablePaper.id,
      questionId: draggingEditorQuestionId,
      targetQuestionId,
      position: "before",
      questions: questionDrafts
    });

    setExamLibraryDocuments(nextDocuments);
    setDraggingEditorQuestionId(null);
  };

  const handleEditorQuestionDropOnBlock = (targetBlockKey: string) => {
    if (!selectedEditablePaper || !draggingEditorQuestionId) {
      return;
    }

    const nextDocuments = applyExamPaperQuestionMove({
      documents: examLibraryDocuments,
      documentId: selectedEditablePaper.id,
      questionId: draggingEditorQuestionId,
      targetBlockKey,
      position: "after",
      questions: questionDrafts
    });

    setExamLibraryDocuments(nextDocuments);
    setDraggingEditorQuestionId(null);
  };

  const handleCreateFullPaperFromBank = () => {
    if (!selectedFolder || selectedLibrary !== "full" || selectedFullPaperQuestionIds.length === 0) {
      return;
    }

    const selectedQuestions = fullLibraryQuestionOptions.filter((question) =>
      selectedFullPaperQuestionIds.includes(question.id)
    );

    if (selectedQuestions.length === 0) {
      return;
    }

    const idBase = createId("full-paper");
    const bundle = createQuestionBankFullPaperBundle({
      idBase,
      folder: selectedFolder,
      title: fullPaperTitle,
      questionIds: selectedQuestions.map((question) => question.id),
      hasAnyAnswers: selectedQuestions.some(
        (question) => (question.answerAttachments?.length ?? 0) > 0
      )
    });

    bundle.forEach((document) => {
      upsertExamLibraryDocument(document);
    });
    setExamWorkspaceDraft({
      selectedDocumentId: bundle[0].id
    });
    setFullPaperTitle("");
    setSelectedFullPaperQuestionIds([]);
  };

  const handleApplyNaturalLanguageOrder = async () => {
    if (
      !selectedDocument ||
      selectedDocument.library !== "full" ||
      selectedDocument.sourceMode !== "question_bank" ||
      !selectedDocument.groupId ||
      !fullPaperNaturalLanguage.trim()
    ) {
      return;
    }

    const selectedQuestions = selectedDocument.questionIds
      .map((questionId) => questionDrafts.find((question) => question.id === questionId) ?? null)
      .filter((question): question is NonNullable<typeof question> => Boolean(question));
    const availableQuestions = fullLibraryQuestionOptions
      .filter((question) => !selectedDocument.questionIds.includes(question.id))
      .concat(selectedQuestions);

    if (selectedQuestions.length === 0) {
      return;
    }

    const response = await fetch("/api/ai/reorder-paper", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        documentId: selectedDocument.id,
        instruction: fullPaperNaturalLanguage,
        currentQuestions: selectedQuestions.map((question) => ({
          id: question.id,
          questionNumberLabel: question.questionNumberLabel ?? null,
          ocrText: question.ocrText ?? null
        })),
        availableQuestions: availableQuestions.map((question) => ({
          id: question.id,
          questionNumberLabel: question.questionNumberLabel ?? null,
          ocrText: question.ocrText ?? null
        }))
      })
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as {
      orderedQuestionIds: string[];
    };
    const nextQuestions = payload.orderedQuestionIds
      .map((questionId) => questionDrafts.find((question) => question.id === questionId) ?? null)
      .filter((question): question is NonNullable<typeof question> => Boolean(question));
    const hasAnyAnswers = nextQuestions.some(
      (question) => (question.answerAttachments?.length ?? 0) > 0
    );

    examLibraryDocuments
      .filter((document) => document.groupId === selectedDocument.groupId)
      .forEach((document) => {
        upsertExamLibraryDocument({
          ...document,
          syncStatus: "pending_confirmation",
          pendingQuestionIds: payload.orderedQuestionIds,
          pendingPlaceholderAnswerPage:
            document.kind === "answer_sheet" ? !hasAnyAnswers : undefined
        });
      });

    setFullPaperNaturalLanguage("");
  };

  const handleConfirmFullPaperAnswerSplit = () => {
    if (!pendingUploadedFullPaperDraft) {
      return;
    }

    const fallbackSplitPage =
      pendingUploadedFullPaperDraft.answerSection.suggestedSplitPage ??
      pendingUploadedFullPaperDraft.pageCount;
    const nextSplitPage = Number(fullPaperAnswerSplitDraft || fallbackSplitPage);

    if (!Number.isFinite(nextSplitPage) || nextSplitPage < 1) {
      return;
    }

    const createdDocuments = confirmPendingUploadedFullPaperDraft({
      hasAnswerSection: true,
      confirmedSplitPage: nextSplitPage
    });

    const primaryDocument = createdDocuments?.find((document) => document.kind === "paper") ?? null;

    if (!primaryDocument?.groupId || !pendingUploadedFullPaperDraft.uploadedPdfPages.length) {
      return;
    }

    const questionPages = pendingUploadedFullPaperDraft.uploadedPdfPages.filter(
      (page) => page.pageNumber < nextSplitPage
    );

    void detectUploadedFullPaperQuestionPages({
      document: primaryDocument,
      questionPages,
      targetPages: questionPages,
      autoDetectCrossPage: true
    });
  };

  const handleConfirmFullPaperNoAnswerSection = () => {
    if (!pendingUploadedFullPaperDraft) {
      return;
    }

    const createdDocuments = confirmPendingUploadedFullPaperDraft({
      hasAnswerSection: false,
      confirmedSplitPage: null
    });

    const primaryDocument = createdDocuments?.find((document) => document.kind === "paper") ?? null;
    const questionPages = pendingUploadedFullPaperDraft.uploadedPdfPages;

    if (!primaryDocument?.groupId || !questionPages.length) {
      return;
    }

    void detectUploadedFullPaperQuestionPages({
      document: primaryDocument,
      questionPages,
      targetPages: questionPages,
      autoDetectCrossPage: true
    });
  };

  const syncUploadedPdfQuestionOrder = (input: {
    groupId: string;
    primaryDocumentId: string;
    questionPages: UploadedPdfPageEntity[];
  }) => {
    const orderedQuestionIds = sortUploadedPdfQuestionsByPageThenLocal(
      input.questionPages,
      useQuestionStore
        .getState()
        .questionDrafts.filter((question) => question.documentId === input.primaryDocumentId)
    ).map((question) => question.id);

    useExamStore
      .getState()
      .examLibraryDocuments
      .filter((document) => document.groupId === input.groupId)
      .forEach((document) => {
        upsertExamLibraryDocument({
          ...document,
          questionIds: orderedQuestionIds
        });
      });

    return orderedQuestionIds;
  };

  const detectUploadedFullPaperQuestionPages = async (input: {
    document: ExamLibraryDocumentEntity;
    questionPages: UploadedPdfPageEntity[];
    targetPages: UploadedPdfPageEntity[];
    autoDetectCrossPage?: boolean;
  }) => {
    if (
      input.document.library !== "full" ||
      input.document.sourceMode !== "uploaded_pdf" ||
      input.document.uploadedPdfWorkflowStatus === "finalized" ||
      !input.document.groupId ||
      !input.questionPages.length ||
      !input.targetPages.length
    ) {
      return;
    }

    const primaryDocumentId =
      input.document.kind === "paper"
        ? input.document.id
        : useExamStore
            .getState()
            .examLibraryDocuments.find(
              (document) =>
                document.groupId === input.document.groupId &&
                document.kind === "paper" &&
                document.sourceMode === "uploaded_pdf"
            )?.id ?? input.document.id;

    try {
      setUploadedPdfAutoDetectProgress({
        status: "running",
        phase: "question_boxes",
        current: 0,
        total: input.targetPages.length,
        pageNumber: input.targetPages[0]?.pageNumber ?? null,
        message: null
      });

      for (const [index, questionPage] of input.targetPages.entries()) {
        setUploadedPdfAutoDetectProgress({
          status: "running",
          phase: "question_boxes",
          current: index,
          total: input.targetPages.length,
          pageNumber: questionPage.pageNumber,
          message: null
        });

        const previewAsset = useQuestionStore
          .getState()
          .binaryAssets.find((asset) => asset.id === questionPage.previewAssetId);

        if (!previewAsset?.dataUrl) {
          setUploadedPdfAutoDetectProgress({
            status: "running",
            phase: "question_boxes",
            current: index + 1,
            total: input.targetPages.length,
            pageNumber: questionPage.pageNumber,
            message: null
          });
          continue;
        }

        const response = await fetch("/api/ai/detect-question-boxes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            pageId: questionPage.pageId,
            imageDataUrl: previewAsset.dataUrl,
            subjectScope: selectedFolder?.subjectScope ?? input.document.subjectScope ?? undefined,
            textLines: questionPage.textLines ?? []
          })
        }).catch(() => null);

        if (!response?.ok) {
          throw new Error("Question detection request failed. Check the AI error log and retry.");
        }

        const payload = (await response.json()) as {
          detections: Array<{
            id: string;
            localOrder: number;
            confidence: number;
            normalizedBBox: {
              x1: number;
              y1: number;
              x2: number;
              y2: number;
            };
          }>;
          source?: AiWorkflowResponseSource;
        };
        const fallbackError = getUploadedPdfAiFailureMessage("Question detection", payload.source);

        if (fallbackError) {
          throw new Error(fallbackError);
        }

        if (Array.isArray(payload.detections)) {
          const questions = buildQuestionDraftsFromDetection({
            documentId: primaryDocumentId,
            pageId: questionPage.pageId,
            pageLayoutMode: "single_column",
            detections: payload.detections,
            size: {
              width: questionPage.width,
              height: questionPage.height
            }
          });

          replaceQuestionsForPage(questionPage.pageId, questions);
          updateUploadedPdfPageReviewStatus(input.document.groupId, questionPage.pageId, "reviewed");
        }

        setUploadedPdfAutoDetectProgress({
          status: "running",
          phase: "question_boxes",
          current: index + 1,
          total: input.targetPages.length,
          pageNumber: questionPage.pageNumber,
          message: null
        });
      }

      syncUploadedPdfQuestionOrder({
        groupId: input.document.groupId,
        primaryDocumentId,
        questionPages: input.questionPages
      });

      if (input.autoDetectCrossPage && input.questionPages.length > 1) {
        await detectAndApplyUploadedPdfCrossPageMerges({
          groupId: input.document.groupId,
          primaryDocumentId,
          questionPages: input.questionPages
        });
      }

      syncUploadedPdfQuestionOrder({
        groupId: input.document.groupId,
        primaryDocumentId,
        questionPages: input.questionPages
      });

      setUploadedPdfAutoDetectProgress({
        status: "done",
        phase: input.autoDetectCrossPage ? "cross_page" : "question_boxes",
        current: input.autoDetectCrossPage
          ? Math.max(input.questionPages.length - 1, 0)
          : input.targetPages.length,
        total: input.autoDetectCrossPage
          ? Math.max(input.questionPages.length - 1, 0)
          : input.targetPages.length,
        pageNumber: null,
        message: "Auto-detect completed"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Auto-detect failed";

      setUploadedPdfAutoDetectProgress((progress) => ({
        ...progress,
        status: "failed",
        message
      }));
      pushToast({
        title: message,
        tone: "error"
      });
    }
  };

  const detectAndApplyUploadedPdfCrossPageMerges = async (input: {
    groupId: string;
    primaryDocumentId: string;
    questionPages: UploadedPdfPageEntity[];
  }) => {
    const adjacentPairs = input.questionPages.slice(0, -1).map((page, index) => ({
      leftPage: page,
      rightPage: input.questionPages[index + 1]
    }));

    setUploadedPdfAutoDetectProgress({
      status: "running",
      phase: "cross_page",
      current: 0,
      total: adjacentPairs.length,
      pageNumber: null,
      message: null
    });

    for (const [index, pair] of adjacentPairs.entries()) {
      setUploadedPdfAutoDetectProgress({
        status: "running",
        phase: "cross_page",
        current: index,
        total: adjacentPairs.length,
        pageNumber: null,
        message: null
      });

      const binaryAssets = useQuestionStore.getState().binaryAssets;
      const leftPreviewAsset = binaryAssets.find(
        (asset) => asset.id === pair.leftPage.previewAssetId
      );
      const rightPreviewAsset = binaryAssets.find(
        (asset) => asset.id === pair.rightPage.previewAssetId
      );

      if (!leftPreviewAsset?.dataUrl || !rightPreviewAsset?.dataUrl) {
        continue;
      }

      const response = await fetch("/api/ai/detect-cross-page", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          documentId: input.primaryDocumentId,
          leftPage: pair.leftPage.pageId,
          rightPage: pair.rightPage.pageId,
          leftImageDataUrl: leftPreviewAsset.dataUrl,
          rightImageDataUrl: rightPreviewAsset.dataUrl,
          leftTextLines: pair.leftPage.textLines ?? [],
          rightTextLines: pair.rightPage.textLines ?? [],
          candidates: buildCrossPageRequestCandidates({
            pages: [
              {
                id: pair.leftPage.pageId,
                width: pair.leftPage.width,
                height: pair.leftPage.height
              },
              {
                id: pair.rightPage.pageId,
                width: pair.rightPage.width,
                height: pair.rightPage.height
              }
            ],
            questions: useQuestionStore
              .getState()
              .questionDrafts.filter((question) => question.documentId === input.primaryDocumentId)
          })
        })
      }).catch(() => null);

      if (!response?.ok) {
        throw new Error("Cross-page detection request failed. Check the AI error log and retry.");
      }

      const payload = (await response.json().catch(() => null)) as {
        mergeCandidates?: unknown[];
        source?: AiWorkflowResponseSource;
      } | null;
      const fallbackError = getUploadedPdfAiFailureMessage(
        "Cross-page detection",
        payload?.source
      );

      if (fallbackError) {
        throw new Error(fallbackError);
      }

      const mergeCandidates = Array.isArray(payload?.mergeCandidates)
        ? payload.mergeCandidates
        : [];

      for (const rawCandidate of mergeCandidates) {
        const candidate = normalizeCrossPageCandidate(rawCandidate, {
          documentId: input.primaryDocumentId,
          leftPageId: pair.leftPage.pageId,
          rightPageId: pair.rightPage.pageId
        });

        if (!candidate || candidate.sourceQuestionIds.length < 2) {
          continue;
        }

        const currentQuestions = useQuestionStore
          .getState()
          .questionDrafts.filter((question) => question.documentId === input.primaryDocumentId);
        const currentQuestionIdSet = new Set(currentQuestions.map((question) => question.id));

        if (!candidate.sourceQuestionIds.every((questionId) => currentQuestionIdSet.has(questionId))) {
          continue;
        }

        setCrossPageCandidates(
          useQuestionStore
            .getState()
            .crossPageCandidates.filter((item) => item.id !== candidate.id)
            .concat(candidate)
        );
        acceptCrossPageCandidate(candidate.id);
      }

      setUploadedPdfAutoDetectProgress({
        status: "running",
        phase: "cross_page",
        current: index + 1,
        total: adjacentPairs.length,
        pageNumber: null,
        message: null
      });
    }

    syncUploadedPdfQuestionOrder({
      groupId: input.groupId,
      primaryDocumentId: input.primaryDocumentId,
      questionPages: input.questionPages
    });
  };

  const handleDetectUploadedFullPaperQuestions = async () => {
    if (
      !selectedDocument ||
      selectedDocument.library !== "full" ||
      selectedDocument.sourceMode !== "uploaded_pdf" ||
      selectedDocument.uploadedPdfWorkflowStatus === "finalized" ||
      !uploadedPdfQuestionPages.length ||
      !selectedUploadedFullPaperPageId ||
      !selectedDocument.groupId
    ) {
      return;
    }

    const selectedQuestionPage = uploadedPdfQuestionPages.find(
      (page) => page.pageId === selectedUploadedFullPaperPageId
    );

    if (!selectedQuestionPage) {
      return;
    }

    await detectUploadedFullPaperQuestionPages({
      document: selectedDocument,
      questionPages: uploadedPdfQuestionPages,
      targetPages: [selectedQuestionPage]
    });
  };

  const handleAddManualUploadedFullPaperQuestion = () => {
    if (
      !selectedDocument ||
      selectedDocument.library !== "full" ||
      selectedDocument.sourceMode !== "uploaded_pdf" ||
      selectedDocument.uploadedPdfWorkflowStatus === "finalized" ||
      !selectedDocument.groupId ||
      !selectedUploadedFullPaperPage
    ) {
      return;
    }

    const primaryDocumentId = selectedUploadedFullPaperGroupPrimaryDocumentId ?? selectedDocument.id;
    const allGroupQuestions = useQuestionStore
      .getState()
      .questionDrafts.filter((question) => question.documentId === primaryDocumentId);
    const pageQuestions = allGroupQuestions
      .filter((question) => question.pageIds.includes(selectedUploadedFullPaperPage.pageId))
      .sort((left, right) => left.localOrder - right.localOrder);
    const nextLocalOrder = (pageQuestions.at(-1)?.localOrder ?? 0) + 1;
    const nextGlobalOrder = (allGroupQuestions.at(-1)?.globalOrder ?? 0) + 1;
    const questionId = createId("manual-uploaded-question");

    addManualQuestionDraft({
      questionId,
      documentId: primaryDocumentId,
      pageId: selectedUploadedFullPaperPage.pageId,
      pageNumber: nextLocalOrder,
      width: selectedUploadedFullPaperPage.width,
      height: selectedUploadedFullPaperPage.height,
      globalOrder: nextGlobalOrder
    });
    updateUploadedPdfPageReviewStatus(selectedDocument.groupId, selectedUploadedFullPaperPage.pageId, "reviewed");

    syncUploadedPdfQuestionOrder({
      groupId: selectedDocument.groupId,
      primaryDocumentId,
      questionPages: uploadedPdfQuestionPages
    });
  };

  const handleRemoveUploadedFullPaperQuestion = (questionId: string) => {
    if (
      !selectedDocument?.groupId ||
      selectedDocument.sourceMode !== "uploaded_pdf" ||
      selectedDocument.uploadedPdfWorkflowStatus === "finalized"
    ) {
      return;
    }

    removeQuestionDraft(questionId);

    const primaryDocumentId = selectedUploadedFullPaperGroupPrimaryDocumentId ?? selectedDocument.id;
    syncUploadedPdfQuestionOrder({
      groupId: selectedDocument.groupId,
      primaryDocumentId,
      questionPages: uploadedPdfQuestionPages
    });
  };

  const handleUploadedFullPaperQuestionNumberChange = (
    questionId: string,
    nextValue: string
  ) => {
    if (
      !selectedDocument ||
      selectedDocument.sourceMode !== "uploaded_pdf" ||
      selectedDocument.uploadedPdfWorkflowStatus === "finalized"
    ) {
      return;
    }

    const normalizedQuestionNumber = nextValue.replace(/\D+/g, "").trim();

    updateQuestionNumberLabel(questionId, normalizedQuestionNumber || null);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <section className="rounded-lg border border-slate-100 bg-white p-5">
        <h1 className="text-2xl font-semibold text-slate-900">Exam Workspace</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          This page currently supports independent lecture creation: blank lectures and direct PDF lecture documents.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          {(Object.keys(LIBRARY_LABELS) as Array<keyof typeof LIBRARY_LABELS>).map((library) => (
            <button
              key={library}
              aria-label={`switch-library-${library}`}
              aria-pressed={selectedLibrary === library}
              className={[
                "rounded-lg px-4 py-3 text-sm font-medium transition",
                selectedLibrary === library
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              ].join(" ")}
              onClick={() =>
                setExamWorkspaceDraft({
                  selectedLibrary: library,
                  selectedFolderId: null,
                  selectedDocumentId: null
                })
              }
              type="button"
            >
              {LIBRARY_LABELS[library]}
            </button>
          ))}
        </div>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          Folder
          <select
            aria-label="exam-folder-select"
            className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
            onChange={(event) =>
              setExamWorkspaceDraft({
                selectedFolderId: event.target.value || null,
                selectedDocumentId: null
              })
            }
            value={selectedFolder?.id ?? ""}
          >
            <option value="">Select one folder</option>
            {libraryFolders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.path.join(" / ")}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Blank Lecture</h2>
          <p className="mt-2 text-sm text-slate-500">
            Create an editable independent lecture that can be extended later.
          </p>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Lecture Title
            <input
              aria-label="independent-lecture-title-input"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              onChange={(event) => setBlankLectureTitle(event.target.value)}
              placeholder="untitled lecture"
              type="text"
              value={blankLectureTitle}
            />
          </label>
          <button
            aria-label="create-blank-lecture"
            className="mt-4 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!selectedFolder}
            onClick={handleCreateBlankLecture}
            type="button"
          >
            Create Blank Lecture
          </button>
        </article>

        <article className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">PDF Lecture Document</h2>
          <p className="mt-2 text-sm text-slate-500">
            Upload one PDF as an independent lecture document without question processing.
          </p>
          <div className="mt-4">
            <label
              className={[
                "inline-flex cursor-pointer rounded-lg px-4 py-3 text-sm font-medium transition",
                selectedFolder
                  ? "bg-sky-500 text-white hover:bg-sky-600"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
              ].join(" ")}
              htmlFor={uploadInputId}
            >
              Upload PDF Lecture
            </label>
            <input
              accept=".pdf,application/pdf"
              aria-label="upload-independent-lecture-pdf"
              className="hidden"
              disabled={!selectedFolder}
              id={uploadInputId}
              onChange={(event) => {
                void handleUploadLecturePdf(event.target.files);
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </div>
        </article>
      </section>

      {selectedLibrary === "full" ? (
        <section className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Full Library Folder</h2>
          <p className="mt-2 text-sm text-slate-500">
            Create a custom folder under the currently selected full-library folder.
          </p>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Folder Name
            <input
              aria-label="full-library-folder-name-input"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              onChange={(event) => setFullLibraryFolderName(event.target.value)}
              placeholder="new folder"
              type="text"
              value={fullLibraryFolderName}
            />
          </label>
          <button
            aria-label="create-full-library-folder"
            className="mt-4 rounded-lg border border-slate-200 bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
            onClick={handleCreateFullLibraryFolder}
            type="button"
          >
            Create Folder
          </button>

          {selectedFolder?.library === "full" && selectedFolder.kind === "custom" ? (
            <>
              <label className="mt-5 block text-sm font-medium text-slate-700">
                Rename Selected Folder
                <input
                  aria-label="rename-full-library-folder-name-input"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                  onChange={(event) => setRenameFullLibraryFolderName(event.target.value)}
                  placeholder={selectedFolder.name}
                  type="text"
                  value={renameFullLibraryFolderName}
                />
              </label>
              <button
                aria-label="rename-full-library-folder"
                className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                onClick={handleRenameFullLibraryFolder}
                type="button"
              >
                Rename Folder
              </button>
              <button
                aria-label="delete-full-library-folder"
                className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100"
                onClick={handleDeleteFullLibraryFolder}
                type="button"
              >
                Delete Folder
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      {selectedLibrary === "full" ? (
        <section className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">PDF Paper Document</h2>
          <p className="mt-2 text-sm text-slate-500">
            Upload one PDF to create a strong-bound paper, lecture, and answer sheet trio.
          </p>
          <div className="mt-4">
            <label
              className={[
                "inline-flex cursor-pointer rounded-lg px-4 py-3 text-sm font-medium transition",
                selectedFolder
                  ? "bg-slate-900 text-white hover:bg-slate-700"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
              ].join(" ")}
              htmlFor={fullPaperUploadInputId}
            >
              Upload PDF Paper
            </label>
            <input
              accept=".pdf,application/pdf"
              aria-label="upload-full-paper-pdf"
              className="hidden"
              disabled={!selectedFolder || fullPaperUploadProgress.status === "running"}
              id={fullPaperUploadInputId}
              onChange={(event) => {
                void handleUploadFullPaperPdf(event.target.files);
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </div>
          {fullPaperUploadProgress.status !== "idle" ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-700">
                  {fullPaperUploadProgress.message}
                </span>
                <span className="text-xs text-slate-500">
                  {fullPaperUploadProgress.current}/{fullPaperUploadProgress.total}
                </span>
              </div>
              <div
                aria-label="full-paper-upload-progress"
                aria-valuemax={fullPaperUploadProgress.total}
                aria-valuemin={0}
                aria-valuenow={fullPaperUploadProgress.current}
                className="mt-2 h-2 overflow-hidden rounded-full bg-white"
                role="progressbar"
              >
                <div
                  className={[
                    "h-full rounded-full transition-all",
                    fullPaperUploadProgress.status === "failed"
                      ? "bg-rose-500"
                      : "bg-sky-500"
                  ].join(" ")}
                  style={{
                    width: `${
                      fullPaperUploadProgress.total > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (fullPaperUploadProgress.current /
                                fullPaperUploadProgress.total) *
                                100
                            )
                          )
                        : 0
                    }%`
                  }}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedLibrary === "full" && pendingUploadedFullPaperDraft ? (
        <section className="rounded-lg border border-sky-100 bg-sky-50 p-5">
          <h2 className="text-lg font-semibold text-sky-900">
            Full-paper answer section review pending
          </h2>
          <p className="mt-2 text-sm text-sky-800">
            Confirm where answer pages start, or mark this uploaded PDF as having no answer section.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block text-sm font-medium text-sky-900">
              Split page
              <input
                aria-label="full-paper-answer-split-page-input"
                className="mt-2 w-32 rounded-lg border border-sky-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                min={1}
                onChange={(event) => setFullPaperAnswerSplitDraft(event.target.value)}
                type="number"
                value={fullPaperAnswerSplitDraft}
              />
            </label>
            <button
              aria-label="confirm-full-paper-answer-split"
              className="rounded-lg bg-sky-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-700"
              onClick={handleConfirmFullPaperAnswerSplit}
              type="button"
            >
              Confirm answer split
            </button>
            <button
              aria-label="mark-full-paper-no-answer-section"
              className="rounded-lg border border-sky-200 bg-white px-4 py-3 text-sm font-medium text-sky-800 transition hover:bg-sky-100"
              onClick={handleConfirmFullPaperNoAnswerSection}
              type="button"
            >
              No answer section
            </button>
          </div>
        </section>
      ) : null}

      {selectedLibrary === "full" ? (
        <section className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Question Bank Paper</h2>
          <p className="mt-2 text-sm text-slate-500">
            Create one strong-bound paper, lecture, and answer sheet trio from selected questions.
          </p>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Paper Title
            <input
              aria-label="full-paper-title-input"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              onChange={(event) => setFullPaperTitle(event.target.value)}
              placeholder="custom suite"
              type="text"
              value={fullPaperTitle}
            />
          </label>
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
            {fullLibraryQuestionOptions.length ? (
              <div className="space-y-3">
                {fullLibraryQuestionOptions.map((question) => (
                  <label
                    key={question.id}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                  >
                    <input
                      aria-label={`full-paper-question-toggle-${question.id}`}
                      checked={selectedFullPaperQuestionIds.includes(question.id)}
                      onChange={() => handleToggleFullPaperQuestion(question.id)}
                      type="checkbox"
                    />
                    <div>
                      <div className="font-medium">
                        {question.questionNumberLabel?.trim() || `Q${question.globalOrder}`}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {question.directoryPath?.join(" / ") ?? "Uncategorized"}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                No confirmed question-bank questions are currently available for this full-library folder.
              </div>
            )}
          </div>
          <button
            aria-label="create-full-paper-from-bank"
            className="mt-4 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!selectedFolder || selectedFullPaperQuestionIds.length === 0}
            onClick={handleCreateFullPaperFromBank}
            type="button"
          >
            Create Paper Trio
          </button>
        </section>
      ) : null}

      {selectedLibrary === "full" &&
      selectedDocument &&
      selectedDocument.library === "full" &&
      selectedDocument.sourceMode === "question_bank" ? (
        <section className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Natural Language Reorder</h2>
          <p className="mt-2 text-sm text-slate-500">
            Reorder the current full-paper trio with one natural-language instruction.
          </p>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Instruction
            <textarea
              aria-label="full-paper-nl-input"
              className="mt-2 min-h-24 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
              onChange={(event) => setFullPaperNaturalLanguage(event.target.value)}
              placeholder="把18题调到12题前面"
              value={fullPaperNaturalLanguage}
            />
          </label>
          <button
            aria-label="apply-full-paper-nl-order"
            className="mt-4 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!fullPaperNaturalLanguage.trim()}
            onClick={() => {
              void handleApplyNaturalLanguageOrder();
            }}
            type="button"
          >
            Apply Reorder
          </button>
          {selectedDocument.syncStatus === "pending_confirmation" ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
              <div className="text-sm font-semibold text-amber-900">Sync confirmation required</div>
              <p className="mt-2 text-sm text-amber-800">
                The reordered full-paper trio is staged and will not replace the current paper, lecture, or answer sheet until you confirm it.
              </p>
              <button
                aria-label={`confirm-exam-sync-${selectedDocument.id}`}
                className="mt-3 rounded-lg bg-amber-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-950"
                onClick={() => confirmExamDocumentSync(selectedDocument.id)}
                type="button"
              >
                Confirm full-paper sync
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedPrimaryLecture ? (
        <section className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Primary Lecture Sync</h2>
          <p className="mt-2 text-sm text-slate-500">
            Export the current primary lecture PDF to freeze one sync snapshot, then upload the
            updated PDF back through the same block-level reconciliation flow.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              aria-label="download-primary-lecture-pdf"
              className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
              onClick={() => {
                void handleDownloadPrimaryLecturePdf();
              }}
              type="button"
            >
              Download Current Primary Lecture
            </button>
            <label
              className="inline-flex cursor-pointer rounded-lg bg-sky-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-600"
              htmlFor={primaryLectureUploadInputId}
            >
              Upload Updated Primary Lecture
            </label>
            <input
              accept=".pdf,application/pdf"
              aria-label="upload-primary-lecture-pdf"
              className="hidden"
              id={primaryLectureUploadInputId}
              onChange={(event) => {
                handleUploadPrimaryLecturePdf(event.target.files);
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </div>
        </section>
      ) : null}

      {selectedEditablePaper ? (
        <section className="rounded-lg border border-slate-100 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Paper Editor</h2>
              <p className="mt-2 text-sm text-slate-500">
                Edit one question-bank paper directly from the paper view. Deletions sync to lecture
                and answer sheet immediately.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {selectedEditablePaper.library === "specialized" && willDeleteEmptySpecializedBlock ? (
                <>
                  <button
                    aria-label="paper-editor-delete-selected-keep-empty-blocks"
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={selectedEditorQuestionIds.length === 0}
                    onClick={() => handleDeleteSelectedEditorQuestions(true)}
                    type="button"
                  >
                    Delete And Keep Empty Block
                  </button>
                  <button
                    aria-label="paper-editor-delete-selected-remove-empty-blocks"
                    className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={selectedEditorQuestionIds.length === 0}
                    onClick={() => handleDeleteSelectedEditorQuestions(false)}
                    type="button"
                  >
                    Delete And Remove Empty Block
                  </button>
                </>
              ) : (
                <button
                  aria-label="paper-editor-delete-selected"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={selectedEditorQuestionIds.length === 0}
                  onClick={() => handleDeleteSelectedEditorQuestions(true)}
                  type="button"
                >
                  Delete Selected
                </button>
              )}
              <button
                aria-label="paper-editor-undo"
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!selectedEditablePaper.editorState?.undoStack?.length}
                onClick={handleUndoEditorChange}
                type="button"
              >
                Undo
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div
              aria-label="paper-editor-question-list"
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="text-sm font-semibold text-slate-800">Questions</div>
              <div className="mt-3 space-y-3">
                {selectedEditablePaperQuestions.map((question, index) => (
                  <div
                    aria-label={`paper-editor-list-item-${question.id}`}
                    key={question.id}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
                    draggable
                    onDragEnd={handleEditorQuestionDragEnd}
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={() => handleEditorQuestionDragStart(question.id)}
                    onDrop={() => handleEditorQuestionDropOnQuestion(question.id)}
                  >
                    <label className="flex items-start gap-3">
                      <input
                        aria-label={`paper-editor-question-select-${question.id}`}
                        checked={selectedEditorQuestionIds.includes(question.id)}
                        onChange={() => handleToggleEditorQuestion(question.id)}
                        type="checkbox"
                      />
                      <div className="min-w-0">
                        <div className="font-medium">
                          Q{question.questionNumberLabel?.trim() || index + 1}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          {question.ocrText?.trim() || "No OCR text"}
                        </div>
                        <button
                          aria-label={`paper-editor-open-replace-${question.id}`}
                          className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                          onClick={() =>
                            setReplaceQuestionId((current) =>
                              current === question.id ? null : question.id
                            )
                          }
                          type="button"
                        >
                          Replace
                        </button>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div
              aria-label="paper-editor-preview"
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
              onPointerDown={handleEditorPreviewPointerDown}
              ref={editorPreviewRef}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-800">Lecture Spacing</div>
                  <label className="mt-3 block text-sm font-medium text-slate-700">
                    Default Gap
                    <input
                      aria-label="paper-editor-default-gap-input"
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-4 focus:ring-sky-100"
                      min={0}
                      onChange={(event) =>
                        handleUpdateEditorDefaultGap(Number(event.target.value || 0))
                      }
                      type="number"
                      value={selectedEditableLectureSpacing.defaultGap}
                    />
                  </label>
                  <input
                    aria-label="paper-editor-default-gap-slider"
                    className="mt-3 w-full"
                    max={200}
                    min={0}
                    onChange={(event) =>
                      handleUpdateEditorDefaultGap(Number(event.target.value || 0))
                    }
                    type="range"
                    value={selectedEditableLectureSpacing.defaultGap}
                  />
                </div>

                {replaceQuestionId ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-800">Replacement Candidates</div>
                    <div className="mt-3 space-y-3">
                      {replacementCandidates.length ? (
                        replacementCandidates.map((question) => (
                          <button
                            key={question.id}
                            aria-label={`paper-editor-replace-with-${question.id}`}
                            className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-100"
                            onClick={() => handleReplaceEditorQuestion(question.id)}
                            type="button"
                          >
                            <div className="font-medium">
                              Q{question.questionNumberLabel?.trim() || question.globalOrder}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {question.directoryPath?.join(" / ") ?? "Uncategorized"}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="text-sm text-slate-500">
                          No replacement candidates are available in the current subject.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="text-sm font-semibold text-slate-800">Current Preview</div>
              <div className="mt-3 space-y-4">
                {selectedEditablePaperPreview?.sections.map((section) => (
                  <div
                    key={`paper-editor-preview-section-${section.key}`}
                    className="rounded-lg border border-slate-200 bg-white"
                  >
                    <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
                      {section.label}
                    </div>
                    <div className="space-y-3 p-3">
                      {section.items.map((item) => (
                        <div
                          aria-label={`paper-editor-preview-item-${section.key}-${item.questionId}`}
                          draggable
                          key={`paper-editor-preview-item-${section.key}-${item.questionId}`}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4"
                          onDragEnd={handleEditorQuestionDragEnd}
                          onDragOver={(event) => event.preventDefault()}
                          onDragStart={() => handleEditorQuestionDragStart(item.questionId)}
                          onDrop={() => handleEditorQuestionDropOnQuestion(item.questionId)}
                        >
                          <div className="text-sm font-semibold text-slate-800">
                            Q{item.displayNumber}
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-600">
                            {item.summaryText}
                          </div>
                          <label className="mt-3 block text-xs font-medium text-slate-500">
                            Question Gap
                            <input
                              aria-label={`paper-editor-question-gap-input-${item.questionId}`}
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                              min={0}
                              onChange={(event) =>
                                handleUpdateEditorQuestionGap(
                                  item.questionId,
                                  Number(event.target.value || 0)
                                )
                              }
                              type="number"
                              value={
                                selectedEditableLectureSpacing.perQuestionGapOverrides[item.questionId] ??
                                selectedEditableLectureSpacing.defaultGap
                              }
                            />
                            <input
                              aria-label={`paper-editor-question-gap-slider-${item.questionId}`}
                              className="mt-2 w-full"
                              max={200}
                              min={0}
                              onChange={(event) =>
                                handleUpdateEditorQuestionGap(
                                  item.questionId,
                                  Number(event.target.value || 0)
                                )
                              }
                              type="range"
                              value={
                                selectedEditableLectureSpacing.perQuestionGapOverrides[item.questionId] ??
                                selectedEditableLectureSpacing.defaultGap
                              }
                            />
                          </label>
                        </div>
                      ))}
                      {selectedEditablePaper.questionBlocks?.length ? (
                        <div
                          aria-label={`paper-editor-preview-block-drop-${section.key}`}
                          className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center text-xs font-medium text-slate-500"
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => handleEditorQuestionDropOnBlock(section.key)}
                        >
                          Drop Question Into This Block
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {editorMarqueeRect ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute rounded-lg border border-sky-400 bg-sky-200/20"
                  style={{
                    left: editorMarqueeRect.left + 16,
                    top: editorMarqueeRect.top + 16,
                    width: editorMarqueeRect.width,
                    height: editorMarqueeRect.height
                  }}
                />
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {selectedLibrary === "full" &&
      selectedDocument &&
      selectedDocument.library === "full" &&
      selectedDocument.sourceMode === "uploaded_pdf" &&
      selectedDocument.uploadedPdfWorkflowStatus !== "finalized" &&
      uploadedPdfQuestionPages.length ? (
        <section className="rounded-[18px] border border-slate-100 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Uploaded PDF Question Review</h2>
              <div className="mt-1 text-sm text-slate-500">
                Page {selectedUploadedFullPaperPage?.pageNumber ?? "-"} ·{" "}
                {selectedUploadedFullPaperPage?.reviewStatus === "reviewed" ? "Reviewed" : "Unreviewed"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {uploadedPdfQuestionPages.map((page) => (
                <button
                  key={page.pageId}
                  aria-label={`select-uploaded-full-paper-page-${page.pageNumber}`}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-medium transition",
                    selectedUploadedFullPaperPageId === page.pageId
                      ? "border-slate-900 bg-slate-900 text-white"
                      : page.reviewStatus === "reviewed"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  ].join(" ")}
                  onClick={() => setSelectedUploadedFullPaperPageId(page.pageId)}
                  type="button"
                >
                  P{page.pageNumber}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            <PagePreview
              page={
                selectedUploadedFullPaperPage
                  ? {
                      id: selectedUploadedFullPaperPage.pageId,
                      pageNumber: selectedUploadedFullPaperPage.pageNumber,
                      width: selectedUploadedFullPaperPage.width,
                      height: selectedUploadedFullPaperPage.height
                    }
                  : null
              }
              previewUrl={selectedUploadedFullPaperPreviewUrl}
              questions={selectedUploadedFullPaperPageQuestions}
            />
          </div>
          {uploadedPdfAutoDetectProgress.status !== "idle" ? (
            <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-sky-900">
                  {formatUploadedPdfAutoDetectProgress(uploadedPdfAutoDetectProgress)}
                </span>
                <span className="text-xs font-medium text-sky-700">
                  {uploadedPdfAutoDetectProgress.current}/{uploadedPdfAutoDetectProgress.total}
                </span>
              </div>
              <div
                aria-label="uploaded-full-paper-auto-detect-progress"
                aria-valuemax={uploadedPdfAutoDetectProgress.total}
                aria-valuemin={0}
                aria-valuenow={uploadedPdfAutoDetectProgress.current}
                className="mt-2 h-2 overflow-hidden rounded-full bg-white"
                role="progressbar"
              >
                <div
                  className={[
                    "h-full rounded-full transition-all",
                    uploadedPdfAutoDetectProgress.status === "failed"
                      ? "bg-rose-500"
                      : "bg-sky-500"
                  ].join(" ")}
                  style={{
                    width: `${
                      uploadedPdfAutoDetectProgress.total > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (uploadedPdfAutoDetectProgress.current /
                                uploadedPdfAutoDetectProgress.total) *
                                100
                            )
                          )
                        : 100
                    }%`
                  }}
                />
              </div>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                aria-label="detect-uploaded-full-paper-page-questions"
                className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={uploadedPdfAutoDetectProgress.status === "running"}
                onClick={() => {
                  void handleDetectUploadedFullPaperQuestions();
                }}
                type="button"
              >
                Redetect Current Page
              </button>
              <button
                aria-label="add-manual-uploaded-full-paper-question"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                disabled={uploadedPdfAutoDetectProgress.status === "running"}
                onClick={handleAddManualUploadedFullPaperQuestion}
                type="button"
              >
                Add Manual Question
              </button>
            </div>
            <button
              aria-label="finalize-uploaded-full-paper-trio"
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                uploadedPdfAutoDetectProgress.status === "running" ||
                uploadedPdfQuestionPages.some((page) => page.reviewStatus !== "reviewed")
              }
              onClick={() => finalizeUploadedPdfDocumentGroup(selectedDocument.id)}
              type="button"
            >
              Finalize Uploaded PDF Trio
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {selectedUploadedFullPaperPageQuestions.map((question, index) => (
              <div
                key={question.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="text-sm text-slate-700">
                    <span className="font-semibold">
                      P{selectedUploadedFullPaperPage?.pageNumber ?? "-"} · Q{question.questionNumberLabel?.trim() || index + 1}
                    </span>
                    <span className="ml-2 text-slate-500">
                      {question.source === "manual" ? "Manual" : "Detected"}
                    </span>
                  </div>
                  <label className="min-w-[132px] text-xs font-medium text-slate-500">
                    Question Number
                    <input
                      aria-label={`uploaded-full-paper-question-number-${question.id}`}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                      onChange={(event) =>
                        handleUploadedFullPaperQuestionNumberChange(question.id, event.target.value)
                      }
                      placeholder="digits only"
                      type="text"
                      value={question.questionNumberLabel ?? ""}
                    />
                  </label>
                </div>
                <button
                  aria-label={`remove-uploaded-full-paper-question-${question.id}`}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
                  onClick={() => handleRemoveUploadedFullPaperQuestion(question.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-slate-100 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Current Library Documents</h2>
            <p className="mt-2 text-sm text-slate-500">
              Review documents already created in the current library.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
            {libraryDocuments.length} docs
          </span>
        </div>

        {libraryDocuments.length ? (
          <div className="mt-4 space-y-3">
            {libraryDocuments.map((document) => (
              <div
                key={document.id}
                className={[
                  "overflow-hidden rounded-lg border transition",
                  examWorkspaceDraft.selectedDocumentId === document.id
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-slate-50/70"
                ].join(" ")}
              >
                <button
                  aria-label={`select-current-library-document-${document.id}`}
                  className="block w-full px-4 py-4 text-left transition hover:bg-slate-100/80"
                  onClick={() =>
                    setExamWorkspaceDraft({
                      selectedDocumentId: document.id,
                      selectedFolderId: document.folderId
                    })
                  }
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{document.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {folderPathById.get(document.folderId) ?? document.folderId}
                      </div>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      Lecture
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white px-3 py-1 text-slate-600">
                      {SOURCE_MODE_LABELS[document.sourceMode]}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-slate-600">
                      {document.allowsQuestionMutations ? "Mutable" : "Locked"}
                    </span>
                  </div>
                </button>
                {document.syncStatus === "pending_confirmation" ? (
                  <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="text-sm font-medium text-amber-900">Sync confirmation required</div>
                    <button
                      aria-label={`confirm-exam-sync-${document.id}`}
                      className="mt-3 rounded-full bg-amber-900 px-4 py-2 text-xs font-medium text-white"
                      onClick={() => confirmExamDocumentSync(document.id)}
                      type="button"
                    >
                      Confirm sync
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
            No documents yet. Select one folder and create a lecture first.
          </div>
        )}
      </section>
    </div>
  );
}


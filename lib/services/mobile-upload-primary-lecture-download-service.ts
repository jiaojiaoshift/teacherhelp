import type { ExamLibraryDocumentEntity, QuestionDraftEntity } from "@/lib/domain/entities";
import { buildPrintableExamDocument, buildPrintableExamPdf } from "@/lib/services/exam-print-service";
import { buildPrimaryLectureSyncMetadata } from "@/lib/services/lecture-sync-metadata-service";
import { buildPaperPreview } from "@/lib/services/paper-preview-service";

type HelperPrimaryLectureQuestionDraft = Pick<QuestionDraftEntity, "id" | "questionNumberLabel" | "ocrText">;

export type HelperPrimaryLectureDownloadResult =
  | {
      status: "rejected";
      errorMessage: string;
    }
  | {
      status: "ready";
      fileName: string;
      blob: Blob;
      examLibraryDocuments: ExamLibraryDocumentEntity[];
    };

function resolvePrimaryLectureQuestionIds(document: ExamLibraryDocumentEntity) {
  return document.syncStatus === "pending_confirmation" && document.pendingQuestionIds
    ? document.pendingQuestionIds
    : document.questionIds;
}

function resolvePrimaryLectureQuestionBlocks(document: ExamLibraryDocumentEntity) {
  return document.syncStatus === "pending_confirmation" && document.pendingQuestionBlocks
    ? document.pendingQuestionBlocks
    : document.questionBlocks;
}

export async function buildHelperPrimaryLectureDownload(input: {
  documentId: string;
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  questionDrafts: HelperPrimaryLectureQuestionDraft[];
}): Promise<HelperPrimaryLectureDownloadResult> {
  const targetDocument = input.examLibraryDocuments.find(
    (document) => document.id === input.documentId
  );

  if (!targetDocument || targetDocument.kind !== "lecture" || targetDocument.lectureVariant !== "primary") {
    return {
      status: "rejected",
      errorMessage: "主讲义文档不存在"
    };
  }

  const questionIds = resolvePrimaryLectureQuestionIds(targetDocument);
  const questionBlocks = resolvePrimaryLectureQuestionBlocks(targetDocument);
  const exportedSyncMetadata = buildPrimaryLectureSyncMetadata({
    sourceDocumentId: targetDocument.id,
    questionIds,
    questionBlocks
  });
  const paperPreview = buildPaperPreview({
    document: {
      numberingMode: targetDocument.numberingMode,
      questionIds,
      questionBlocks,
      lectureSpacing: targetDocument.lectureSpacing
    },
    questionDrafts: questionIds.map((questionId) => {
      const question = input.questionDrafts.find((candidate) => candidate.id === questionId);

      return {
        id: questionId,
        questionNumberLabel: question?.questionNumberLabel ?? null,
        ocrText: question?.ocrText ?? null
      };
    })
  });
  const printableDocument = buildPrintableExamDocument({
    title: targetDocument.title,
    documentKind: "lecture",
    sourceMode: targetDocument.sourceMode,
    paperPreview
  });
  const pdfDocument = await buildPrintableExamPdf({
    title: printableDocument.fileNameBase,
    html: printableDocument.html
  });

  return {
    status: "ready",
    fileName: pdfDocument.fileName,
    blob: pdfDocument.blob,
    examLibraryDocuments: input.examLibraryDocuments.map((document) =>
      document.id === targetDocument.id
        ? {
            ...document,
            lastExportedSyncMetadata: exportedSyncMetadata
          }
        : document
    )
  };
}

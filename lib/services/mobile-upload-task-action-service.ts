import type {
  ExamLibraryDocumentEntity,
  MobileUploadTaskEntity
} from "@/lib/domain/entities";

export interface MobileUploadTaskActionDescriptor {
  description: string;
  buttonLabel: string;
  buttonAriaLabel: string;
  tone: "sky" | "emerald" | "amber" | "indigo" | "violet";
  target:
    | {
        kind: "exam_document";
        documentId: string;
      }
    | {
        kind: "exam_folder";
        folderId: string;
        library: "specialized" | "full";
      }
    | {
        kind: "question_folder";
        folderId: string;
      };
}

function createExamDocumentAction(input: {
  task: MobileUploadTaskEntity;
  documentId: string;
  description: string;
  buttonLabel: string;
  tone: MobileUploadTaskActionDescriptor["tone"];
}) {
  return {
    description: input.description,
    buttonLabel: input.buttonLabel,
    buttonAriaLabel: `open-mobile-upload-document-${input.task.id}`,
    tone: input.tone,
    target: {
      kind: "exam_document" as const,
      documentId: input.documentId
    }
  };
}

function findDocumentIdBySourceUploadTaskId(
  documents: ExamLibraryDocumentEntity[],
  taskId: string
) {
  return documents.find((document) => document.sourceUploadTaskId === taskId)?.id ?? null;
}

export function resolveMobileUploadTaskAction(input: {
  task: MobileUploadTaskEntity;
  examLibraryDocuments: ExamLibraryDocumentEntity[];
}): MobileUploadTaskActionDescriptor | null {
  const { task } = input;

  if (task.status === "processing" && task.uploadKind === "primary_lecture_pdf") {
    return createExamDocumentAction({
      task,
      documentId: task.targetNodeId,
      description: "Open the target lecture to continue block-level sync review.",
      buttonLabel: "Open target lecture",
      tone: "sky"
    });
  }

  if (task.status === "processing" && task.uploadKind === "full_paper_pdf") {
    return {
      description: "Open the target full-paper folder to continue uploaded PDF review.",
      buttonLabel: "Continue review",
      buttonAriaLabel: `open-mobile-upload-folder-${task.id}`,
      tone: "indigo",
      target: {
        kind: "exam_folder",
        folderId: task.targetNodeId,
        library: "full"
      }
    };
  }

  if (task.status === "completed" && task.uploadKind === "lecture_archive_pdf") {
    const documentId = findDocumentIdBySourceUploadTaskId(input.examLibraryDocuments, task.id);

    if (!documentId) {
      return null;
    }

    return createExamDocumentAction({
      task,
      documentId,
      description: "Open the archived lecture document created from this upload.",
      buttonLabel: "Open archived lecture",
      tone: "emerald"
    });
  }

  if (task.status === "completed" && task.uploadKind === "primary_lecture_pdf") {
    const documentId =
      input.examLibraryDocuments.find((document) => document.id === task.targetNodeId)?.id ??
      findDocumentIdBySourceUploadTaskId(input.examLibraryDocuments, task.id);

    if (!documentId) {
      return null;
    }

    return createExamDocumentAction({
      task,
      documentId,
      description: "Open the updated primary lecture document saved from this upload.",
      buttonLabel: "Open updated lecture",
      tone: "emerald"
    });
  }

  if (task.status === "failed" && task.uploadKind === "primary_lecture_pdf") {
    return createExamDocumentAction({
      task,
      documentId: task.targetNodeId,
      description: "Open the target lecture to inspect the current block structure before retrying.",
      buttonLabel: "Open target lecture",
      tone: "amber"
    });
  }

  if (task.status === "queued" && task.uploadKind === "full_paper_pdf") {
    return {
      description: "Open the target full-paper folder while this upload waits for downstream processing.",
      buttonLabel: "Open target folder",
      buttonAriaLabel: `open-mobile-upload-folder-${task.id}`,
      tone: "indigo",
      target: {
        kind: "exam_folder",
        folderId: task.targetNodeId,
        library: "full"
      }
    };
  }

  if (task.status === "queued" && task.uploadKind === "question_bank_pdf") {
    return {
      description:
        "Open the target question-bank folder while this upload waits for downstream processing.",
      buttonLabel: "Open target question folder",
      buttonAriaLabel: `open-mobile-upload-question-folder-${task.id}`,
      tone: "violet",
      target: {
        kind: "question_folder",
        folderId: task.targetNodeId
      }
    };
  }

  return null;
}

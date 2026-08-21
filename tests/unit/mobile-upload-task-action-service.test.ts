import { describe, expect, it } from "vitest";

import type {
  ExamLibraryDocumentEntity,
  MobileUploadTaskEntity
} from "@/lib/domain/entities";
import { resolveMobileUploadTaskAction } from "@/lib/services/mobile-upload-task-action-service";

function createTask(
  overrides: Partial<MobileUploadTaskEntity> &
    Pick<MobileUploadTaskEntity, "id" | "uploadKind" | "targetNodeId" | "targetNodePath" | "status">
): MobileUploadTaskEntity {
  return {
    deviceId: "android-a",
    originalFileName: "source.pdf",
    normalizedFileName: "source.pdf",
    mimeType: "application/pdf",
    createdAt: "2026-06-03T10:30:00.000Z",
    errorMessage: null,
    ...overrides
  };
}

function createDocument(
  overrides: Partial<ExamLibraryDocumentEntity> &
    Pick<ExamLibraryDocumentEntity, "id" | "folderId" | "library" | "kind" | "title">
): ExamLibraryDocumentEntity {
  return {
    subjectScope: null,
    groupId: null,
    isDefault: false,
    sourceMode: "question_bank",
    syncBinding: "independent",
    syncStatus: "idle",
    numberingMode: "resequence",
    questionIds: [],
    rawPageAssetIds: [],
    placeholderAnswerPage: false,
    allowsQuestionMutations: true,
    ...overrides
  };
}

describe("mobile-upload-task-action-service", () => {
  it("resolves one action for a processing primary-lecture upload", () => {
    expect(
      resolveMobileUploadTaskAction({
        task: createTask({
          id: "task-primary-processing",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          status: "processing"
        }),
        examLibraryDocuments: []
      })
    ).toEqual({
      description: "Open the target lecture to continue block-level sync review.",
      buttonLabel: "Open target lecture",
      buttonAriaLabel: "open-mobile-upload-document-task-primary-processing",
      tone: "sky",
      target: {
        kind: "exam_document",
        documentId: "lecture-primary-1"
      }
    });
  });

  it("resolves one action for a completed archive upload when the created archive document exists", () => {
    expect(
      resolveMobileUploadTaskAction({
        task: createTask({
          id: "task-archive-1",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "archive-folder-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          status: "completed"
        }),
        examLibraryDocuments: [
          createDocument({
            id: "lecture-archive-task-archive-1",
            folderId: "archive-folder-1",
            library: "specialized",
            kind: "lecture",
            lectureVariant: "archive",
            title: "王明_高二_26_06_03",
            sourceMode: "uploaded_pdf",
            allowsQuestionMutations: false,
            sourceUploadTaskId: "task-archive-1"
          })
        ]
      })
    ).toEqual({
      description: "Open the archived lecture document created from this upload.",
      buttonLabel: "Open archived lecture",
      buttonAriaLabel: "open-mobile-upload-document-task-archive-1",
      tone: "emerald",
      target: {
        kind: "exam_document",
        documentId: "lecture-archive-task-archive-1"
      }
    });
  });

  it("resolves one action for a completed primary-lecture upload", () => {
    expect(
      resolveMobileUploadTaskAction({
        task: createTask({
          id: "task-primary-completed",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          status: "completed"
        }),
        examLibraryDocuments: [
          createDocument({
            id: "lecture-primary-1",
            folderId: "specialized-root",
            library: "specialized",
            kind: "lecture",
            lectureVariant: "primary",
            title: "牛顿定律主讲义",
            sourceUploadTaskId: "task-primary-completed"
          })
        ]
      })
    ).toEqual({
      description: "Open the updated primary lecture document saved from this upload.",
      buttonLabel: "Open updated lecture",
      buttonAriaLabel: "open-mobile-upload-document-task-primary-completed",
      tone: "emerald",
      target: {
        kind: "exam_document",
        documentId: "lecture-primary-1"
      }
    });
  });

  it("resolves one action for a failed primary-lecture upload", () => {
    expect(
      resolveMobileUploadTaskAction({
        task: createTask({
          id: "task-primary-failed",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          status: "failed"
        }),
        examLibraryDocuments: []
      })
    ).toEqual({
      description:
        "Open the target lecture to inspect the current block structure before retrying.",
      buttonLabel: "Open target lecture",
      buttonAriaLabel: "open-mobile-upload-document-task-primary-failed",
      tone: "amber",
      target: {
        kind: "exam_document",
        documentId: "lecture-primary-1"
      }
    });
  });

  it("resolves one action for a queued full-paper upload", () => {
    expect(
      resolveMobileUploadTaskAction({
        task: createTask({
          id: "task-full-queued",
          uploadKind: "full_paper_pdf",
          targetNodeId: "full-folder-1",
          targetNodePath: ["套卷库", "牛顿定律套卷"],
          status: "queued"
        }),
        examLibraryDocuments: []
      })
    ).toEqual({
      description:
        "Open the target full-paper folder while this upload waits for downstream processing.",
      buttonLabel: "Open target folder",
      buttonAriaLabel: "open-mobile-upload-folder-task-full-queued",
      tone: "indigo",
      target: {
        kind: "exam_folder",
        folderId: "full-folder-1",
        library: "full"
      }
    });
  });

  it("resolves one action for a processing full-paper upload", () => {
    expect(
      resolveMobileUploadTaskAction({
        task: createTask({
          id: "task-full-processing",
          uploadKind: "full_paper_pdf",
          targetNodeId: "full-folder-1",
          targetNodePath: ["Full Library", "Kinematics Full Paper"],
          status: "processing"
        }),
        examLibraryDocuments: []
      })
    ).toEqual({
      description: "Open the target full-paper folder to continue uploaded PDF review.",
      buttonLabel: "Continue review",
      buttonAriaLabel: "open-mobile-upload-folder-task-full-processing",
      tone: "indigo",
      target: {
        kind: "exam_folder",
        folderId: "full-folder-1",
        library: "full"
      }
    });
  });

  it("resolves one action for a queued question-bank upload", () => {
    expect(
      resolveMobileUploadTaskAction({
        task: createTask({
          id: "task-qb-queued",
          uploadKind: "question_bank_pdf",
          targetNodeId: "folder-math-1",
          targetNodePath: ["我的题库", "高中数学", "函数"],
          status: "queued"
        }),
        examLibraryDocuments: []
      })
    ).toEqual({
      description:
        "Open the target question-bank folder while this upload waits for downstream processing.",
      buttonLabel: "Open target question folder",
      buttonAriaLabel: "open-mobile-upload-question-folder-task-qb-queued",
      tone: "violet",
      target: {
        kind: "question_folder",
        folderId: "folder-math-1"
      }
    });
  });

  it("returns null when one completed archive upload has no created archive document yet", () => {
    expect(
      resolveMobileUploadTaskAction({
        task: createTask({
          id: "task-archive-missing",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "archive-folder-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          status: "completed"
        }),
        examLibraryDocuments: []
      })
    ).toBeNull();
  });
});

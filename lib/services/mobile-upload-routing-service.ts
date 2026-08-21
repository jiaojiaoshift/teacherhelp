import type {
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  FolderEntity,
  MobileUploadTaskEntity
} from "@/lib/domain/entities";
import {
  normalizePrimaryLectureUploadFileName,
  resolveMobileUploadOperation
} from "@/lib/services/mobile-upload-service";

export type MobileUploadRoute =
  | {
      operation: "question_bank_ingestion";
      targetKind: "question_folder";
      targetNodeId: string;
      targetNodePath: string[];
      normalizedFileName: string;
    }
  | {
      operation: "full_paper_split";
      targetKind: "exam_folder";
      targetFolderId: string;
      targetFolderPath: string[];
      normalizedFileName: string;
    }
  | {
      operation: "archive_only";
      targetKind: "exam_folder";
      targetFolderId: string;
      targetFolderPath: string[];
      normalizedFileName: string;
    }
  | {
      operation: "primary_lecture_update";
      targetKind: "exam_document";
      targetDocumentId: string;
      targetFolderId: string;
      normalizedFileName: string;
    };

export type MobileUploadRouteResult =
  | {
      ok: true;
      route: MobileUploadRoute;
    }
  | {
      ok: false;
      errorMessage: string;
    };

export function resolveMobileUploadRoute(input: {
  task: MobileUploadTaskEntity;
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
}): MobileUploadRouteResult {
  const operation = resolveMobileUploadOperation(input.task.uploadKind);

  if (operation === "question_bank_ingestion") {
    const targetFolder = input.questionFolders.find(
      (folder) => folder.id === input.task.targetNodeId
    );

    if (!targetFolder) {
      return {
        ok: false,
        errorMessage: "题库上传目标目录不存在"
      };
    }

    return {
      ok: true,
      route: {
        operation,
        targetKind: "question_folder",
        targetNodeId: targetFolder.id,
        targetNodePath: targetFolder.path,
        normalizedFileName: input.task.normalizedFileName
      }
    };
  }

  if (operation === "full_paper_split") {
    const targetFolder = input.examLibraryFolders.find(
      (folder) => folder.id === input.task.targetNodeId
    );

    if (!targetFolder || targetFolder.library !== "full" || targetFolder.role === "lecture_archive") {
      return {
        ok: false,
        errorMessage: "套卷上传必须指向套卷库目录"
      };
    }

    return {
      ok: true,
      route: {
        operation,
        targetKind: "exam_folder",
        targetFolderId: targetFolder.id,
        targetFolderPath: targetFolder.path,
        normalizedFileName: input.task.normalizedFileName
      }
    };
  }

  if (operation === "archive_only") {
    const selectedFolder = input.examLibraryFolders.find(
      (folder) => folder.id === input.task.targetNodeId
    );

    if (!selectedFolder) {
      return {
        ok: false,
        errorMessage: "讲义归档上传只能投递到讲义归档目录"
      };
    }

    const targetFolder =
      selectedFolder.role === "lecture_archive"
        ? selectedFolder
        : selectedFolder.depth === 3
          ? input.examLibraryFolders.find(
              (folder) =>
                folder.role === "lecture_archive" && folder.parentId === selectedFolder.id
            ) ?? null
          : null;

    if (!targetFolder) {
      return {
        ok: false,
        errorMessage:
          selectedFolder.depth === 3
            ? "讲义归档目录不存在"
            : "讲义归档上传只能投递到讲义归档目录"
      };
    }

    return {
      ok: true,
      route: {
        operation,
        targetKind: "exam_folder",
        targetFolderId: targetFolder.id,
        targetFolderPath: targetFolder.path,
        normalizedFileName: input.task.normalizedFileName
      }
    };
  }

  const targetDocument = input.examLibraryDocuments.find(
    (document) => document.id === input.task.targetNodeId
  );

  if (!targetDocument || targetDocument.kind !== "lecture" || targetDocument.lectureVariant !== "primary") {
    return {
      ok: false,
      errorMessage: "主讲义上传必须指向一个主讲义文档"
    };
  }

  return {
    ok: true,
    route: {
      operation,
      targetKind: "exam_document",
      targetDocumentId: targetDocument.id,
      targetFolderId: targetDocument.folderId,
      normalizedFileName: normalizePrimaryLectureUploadFileName({
        uploadedFileName: input.task.normalizedFileName || input.task.originalFileName,
        immutableLectureName: targetDocument.immutableName ?? targetDocument.title
      })
    }
  };
}

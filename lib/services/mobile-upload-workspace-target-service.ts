import type {
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  FolderEntity,
  MobileUploadKind
} from "@/lib/domain/entities";
import { MOBILE_UPLOAD_KIND_VALUES } from "@/lib/services/mobile-upload-contract";

export interface MobileUploadWorkspaceTargetNode {
  id: string;
  name: string;
  path: string[];
  targetKind: "question_folder" | "exam_folder" | "exam_document";
}

function compareTargetNodePath(left: MobileUploadWorkspaceTargetNode, right: MobileUploadWorkspaceTargetNode) {
  return left.path.join("/").localeCompare(right.path.join("/"), "zh-CN");
}

export function isMobileUploadKind(value: string): value is MobileUploadKind {
  return MOBILE_UPLOAD_KIND_VALUES.includes(value as MobileUploadKind);
}

export function buildMobileUploadWorkspaceTargetNodes(input: {
  uploadKind: MobileUploadKind;
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
}): MobileUploadWorkspaceTargetNode[] {
  if (input.uploadKind === "question_bank_pdf") {
    return input.questionFolders
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        path: folder.path,
        targetKind: "question_folder" as const
      }))
      .sort(compareTargetNodePath);
  }

  if (input.uploadKind === "full_paper_pdf") {
    return input.examLibraryFolders
      .filter((folder) => folder.library === "full" && folder.role !== "lecture_archive")
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        path: folder.path,
        targetKind: "exam_folder" as const
      }))
      .sort(compareTargetNodePath);
  }

  if (input.uploadKind === "lecture_archive_pdf") {
    return input.examLibraryFolders
      .filter(
        (folder) =>
          folder.role !== "lecture_archive" &&
          folder.depth === 3 &&
          (folder.library === "specialized" || folder.library === "full")
      )
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        path: folder.path,
        targetKind: "exam_folder" as const
      }))
      .sort(compareTargetNodePath);
  }

  const folderPathById = new Map(
    input.examLibraryFolders.map((folder) => [folder.id, folder.path])
  );

  return input.examLibraryDocuments
    .filter((document) => document.kind === "lecture" && document.lectureVariant === "primary")
    .map((document) => ({
      id: document.id,
      name: document.title,
      path: folderPathById.get(document.folderId) ?? [document.title],
      targetKind: "exam_document" as const
    }))
    .sort(compareTargetNodePath);
}

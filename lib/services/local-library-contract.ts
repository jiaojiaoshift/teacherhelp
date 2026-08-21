import type {
  BinaryAssetEntity,
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  ExamWorkspaceDraft,
  FolderEntity,
  PageEntity,
  QuestionDraftEntity
} from "@/lib/domain/entities";

export interface LocalLibrarySnapshot {
  folders: FolderEntity[];
  pages: PageEntity[];
  binaryAssets: BinaryAssetEntity[];
  questionDrafts: QuestionDraftEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  examWorkspaceDraft: ExamWorkspaceDraft;
}

export interface LocalLibraryPayload {
  revision: number;
  snapshot: LocalLibrarySnapshot;
}

export function buildEmptyLocalLibrarySnapshot(): LocalLibrarySnapshot {
  return {
    folders: [],
    pages: [],
    binaryAssets: [],
    questionDrafts: [],
    examLibraryFolders: [],
    examLibraryDocuments: [],
    examWorkspaceDraft: {
      selectedLibrary: "specialized",
      selectedFolderId: null,
      selectedDocumentId: null
    }
  };
}

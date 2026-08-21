import type {
  ExamDocumentQuestionBlock,
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  ExamWorkspaceDraft,
  FolderEntity,
  QuestionDraftEntity,
  UploadedFullPaperDraftEntity
} from "@/lib/domain/entities";
import { doesFolderPathMatchPrefix } from "@/lib/services/folder-service";
import { sanitizeDocumentName } from "@/lib/services/ingestion-service";
import { buildPrimaryLectureSyncMetadata } from "@/lib/services/lecture-sync-metadata-service";
import {
  buildInitialSpecializedQuestionBlocks,
  reconcileSpecializedQuestionBlocks
} from "@/lib/services/specialized-paper-clustering-service";

function areQuestionIdListsEqual(left: string[] | undefined, right: string[]) {
  return (
    (left?.length ?? 0) === right.length &&
    (left ?? []).every((questionId, index) => questionId === right[index])
  );
}

function haveSameQuestionIds(left: string[], right: string[]) {
  const leftIds = new Set(left);
  const rightIds = new Set(right);

  return leftIds.size === rightIds.size && [...leftIds].every((questionId) => rightIds.has(questionId));
}

function areQuestionBlocksEqual(
  left: ExamDocumentQuestionBlock[] | undefined,
  right: ExamDocumentQuestionBlock[]
) {
  return (
    (left?.length ?? 0) === right.length &&
    (left ?? []).every((block, index) => {
      const target = right[index];

      return (
        Boolean(target) &&
        block.key === target.key &&
        block.label === target.label &&
        areQuestionIdListsEqual(block.questionIds, target.questionIds)
      );
    })
  );
}

function createExamLibraryRoot(
  library: "specialized" | "full",
  name: string
): ExamLibraryFolderEntity {
  return {
    id: `${library}-root`,
    parentId: null,
    name,
    library,
    kind: "system",
    subjectScope: null,
    depth: 0,
    path: [name],
    linkedQuestionFolderId: null
  };
}

function createExamLibraryFolderId(library: "specialized" | "full", questionFolderId: string) {
  return `${library}--${questionFolderId}`;
}

function createCustomExamLibraryFolderId(parentId: string, name: string) {
  return `${parentId}--custom--${name}`;
}

function createLectureArchiveFolderId(parentId: string) {
  return `${parentId}--archive--lecture`;
}

function createDefaultSpecializedDocumentTitle(
  folderName: string,
  kind: ExamLibraryDocumentEntity["kind"],
  lectureVariant?: ExamLibraryDocumentEntity["lectureVariant"]
) {
  if (kind === "paper") {
    return `${folderName}专题卷`;
  }

  if (kind === "lecture") {
    return lectureVariant === "blank" ? `${folderName}空白讲义` : `${folderName}主讲义`;
  }

  return `${folderName}答案`;
}

function createPathKey(path: string[]) {
  return path.join("\u0000");
}

function getDefaultDocumentKey(document: Pick<ExamLibraryDocumentEntity, "kind" | "lectureVariant">) {
  if (document.kind !== "lecture") {
    return document.kind;
  }

  return `lecture:${document.lectureVariant ?? "primary"}`;
}

function isPrimaryLectureDocument(
  document: Pick<ExamLibraryDocumentEntity, "kind" | "lectureVariant">
) {
  return document.kind === "lecture" && document.lectureVariant === "primary";
}

function createPrimaryLectureSyncMetadata(input: {
  document: Pick<ExamLibraryDocumentEntity, "id" | "kind" | "lectureVariant">;
  questionIds: string[];
  questionBlocks?: ExamDocumentQuestionBlock[];
}) {
  if (!isPrimaryLectureDocument(input.document)) {
    return undefined;
  }

  return buildPrimaryLectureSyncMetadata({
    sourceDocumentId: input.document.id,
    questionIds: input.questionIds,
    questionBlocks: input.questionBlocks
  });
}

function shouldCreateLectureArchiveFolder(folder: ExamLibraryFolderEntity) {
  return folder.role !== "lecture_archive" && folder.depth === 3;
}

function createLectureArchiveFolder(parentFolder: ExamLibraryFolderEntity): ExamLibraryFolderEntity {
  return {
    id: createLectureArchiveFolderId(parentFolder.id),
    parentId: parentFolder.id,
    name: "讲义归档",
    library: parentFolder.library,
    kind: "system",
    role: "lecture_archive",
    subjectScope: parentFolder.subjectScope,
    depth: parentFolder.depth + 1,
    path: parentFolder.path.concat("讲义归档"),
    linkedQuestionFolderId: null
  };
}

function appendLectureArchiveFolders(folders: ExamLibraryFolderEntity[]): ExamLibraryFolderEntity[] {
  const existingIds = new Set(folders.map((folder) => folder.id));
  const additions = folders
    .filter(shouldCreateLectureArchiveFolder)
    .map(createLectureArchiveFolder)
    .filter((folder) => !existingIds.has(folder.id));

  return additions.length > 0 ? folders.concat(additions) : folders;
}

function transformExamLibraryPathForQuestionFolderRename(input: {
  path: string[];
  library: "specialized" | "full";
  previousQuestionPath: string[];
  nextQuestionPath: string[];
}): string[] {
  const libraryRoot = input.library === "specialized" ? "专题卷库" : "套卷库";
  const previousPrefix = [libraryRoot, ...input.previousQuestionPath.slice(1)];

  if (!doesFolderPathMatchPrefix(input.path, previousPrefix)) {
    return input.path;
  }

  return [libraryRoot, ...input.nextQuestionPath.slice(1), ...input.path.slice(previousPrefix.length)];
}

export function buildInitialExamLibraryFolders(
  questionFolders: FolderEntity[]
): ExamLibraryFolderEntity[] {
  const specializedRoot = createExamLibraryRoot("specialized", "专题卷库");
  const fullRoot = createExamLibraryRoot("full", "套卷库");
  const folders: ExamLibraryFolderEntity[] = [specializedRoot, fullRoot];

  questionFolders
    .filter((folder) => folder.depth >= 1 && folder.depth <= 3)
    .forEach((folder) => {
      const pathWithoutQuestionRoot = folder.path.slice(1);
      folders.push({
        id: createExamLibraryFolderId("specialized", folder.id),
        parentId:
          folder.depth === 1
            ? specializedRoot.id
            : createExamLibraryFolderId("specialized", folder.parentId as string),
        name: folder.name,
        library: "specialized",
        kind: "system",
        subjectScope: folder.subjectScope,
        depth: folder.depth,
        path: [specializedRoot.name, ...pathWithoutQuestionRoot],
        linkedQuestionFolderId: folder.id
      });
    });

  questionFolders
    .filter((folder) => folder.depth >= 1 && folder.depth <= 2)
    .forEach((folder) => {
      const pathWithoutQuestionRoot = folder.path.slice(1);

      folders.push({
        id: createExamLibraryFolderId("full", folder.id),
        parentId:
          folder.depth === 1
            ? fullRoot.id
            : createExamLibraryFolderId("full", folder.parentId as string),
        name: folder.name,
        library: "full",
        kind: "system",
        subjectScope: folder.subjectScope,
        depth: folder.depth,
        path: [fullRoot.name, ...pathWithoutQuestionRoot],
        linkedQuestionFolderId: folder.id
      });
    });

  return appendLectureArchiveFolders(folders);
}

export function ensureExamLibraryFolders(input: {
  questionFolders: FolderEntity[];
  existingExamLibraryFolders?: ExamLibraryFolderEntity[] | null;
}): ExamLibraryFolderEntity[] {
  const existingExamLibraryFolders = Array.isArray(input.existingExamLibraryFolders)
    ? input.existingExamLibraryFolders
    : [];
  const targetSystemFolders = buildInitialExamLibraryFolders(input.questionFolders);
  const existingSystemFolderIds = new Set(
    existingExamLibraryFolders
      .filter((folder) => folder.kind === "system")
      .map((folder) => folder.id)
  );
  const missingSystemFolders = targetSystemFolders.filter(
    (folder) => !existingSystemFolderIds.has(folder.id)
  );

  if (missingSystemFolders.length === 0) {
    return appendLectureArchiveFolders(existingExamLibraryFolders);
  }

  return appendLectureArchiveFolders(existingExamLibraryFolders.concat(missingSystemFolders));
}

export function syncExamLibraryForQuestionFolderRename(input: {
  questionFolders: FolderEntity[];
  existingExamLibraryFolders: ExamLibraryFolderEntity[];
  existingExamLibraryDocuments: ExamLibraryDocumentEntity[];
  previousQuestionPath: string[];
  nextQuestionPath: string[];
}): {
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  folderIdMap: Map<string, string>;
} {
  const nextSystemFolders = buildInitialExamLibraryFolders(input.questionFolders);
  const nextFolderByPath = new Map(
    nextSystemFolders.map((folder) => [createPathKey(folder.path), folder])
  );
  const folderIdMap = new Map<string, string>();
  const nextExamLibraryFolders = nextSystemFolders.slice();

  input.existingExamLibraryFolders
    .filter((folder) => folder.kind === "custom" && folder.library === "full")
    .slice()
    .sort((left, right) => left.depth - right.depth)
    .forEach((folder) => {
      const nextPath = transformExamLibraryPathForQuestionFolderRename({
        path: folder.path,
        library: "full",
        previousQuestionPath: input.previousQuestionPath,
        nextQuestionPath: input.nextQuestionPath
      });
      const parent = nextFolderByPath.get(createPathKey(nextPath.slice(0, -1)));

      if (!parent) {
        return;
      }

      const nextFolder: ExamLibraryFolderEntity = {
        ...folder,
        id: createCustomExamLibraryFolderId(parent.id, nextPath.at(-1) ?? folder.name),
        parentId: parent.id,
        name: nextPath.at(-1) ?? folder.name,
        subjectScope: parent.subjectScope,
        depth: parent.depth + 1,
        path: nextPath
      };

      folderIdMap.set(folder.id, nextFolder.id);
      nextFolderByPath.set(createPathKey(nextFolder.path), nextFolder);
      nextExamLibraryFolders.push(nextFolder);
    });

  input.existingExamLibraryFolders
    .filter((folder) => folder.kind === "system")
    .forEach((folder) => {
      const nextPath = transformExamLibraryPathForQuestionFolderRename({
        path: folder.path,
        library: folder.library,
        previousQuestionPath: input.previousQuestionPath,
        nextQuestionPath: input.nextQuestionPath
      });
      const nextFolder = nextFolderByPath.get(createPathKey(nextPath));

      if (nextFolder) {
        folderIdMap.set(folder.id, nextFolder.id);
      }
    });

  const existingFolderById = new Map(
    input.existingExamLibraryFolders.map((folder) => [folder.id, folder])
  );
  const nextExamLibraryDocuments = input.existingExamLibraryDocuments.map((document) => {
    const previousFolder = existingFolderById.get(document.folderId);

    if (!previousFolder) {
      return document;
    }

    const nextPath = transformExamLibraryPathForQuestionFolderRename({
      path: previousFolder.path,
      library: previousFolder.library,
      previousQuestionPath: input.previousQuestionPath,
      nextQuestionPath: input.nextQuestionPath
    });
    const nextFolder = nextFolderByPath.get(createPathKey(nextPath));

    if (!nextFolder) {
      return document;
    }

    return {
      ...document,
      folderId: nextFolder.id,
      title:
        document.isDefault && nextFolder.library === "specialized" && nextFolder.depth === 3
          ? createDefaultSpecializedDocumentTitle(
              nextFolder.name,
              document.kind,
              document.lectureVariant
            )
          : document.title
    };
  });

  return {
    examLibraryFolders: nextExamLibraryFolders,
    examLibraryDocuments: nextExamLibraryDocuments,
    folderIdMap
  };
}

export function syncExamLibraryForQuestionFolderDeletion(input: {
  questionFolders: FolderEntity[];
  existingExamLibraryFolders: ExamLibraryFolderEntity[];
  existingExamLibraryDocuments: ExamLibraryDocumentEntity[];
}): {
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  folderIdMap: Map<string, string>;
} {
  const nextSystemFolders = buildInitialExamLibraryFolders(input.questionFolders);
  const nextFolderByPath = new Map(
    nextSystemFolders.map((folder) => [createPathKey(folder.path), folder])
  );
  const folderIdMap = new Map<string, string>();
  const nextExamLibraryFolders = nextSystemFolders.slice();

  input.existingExamLibraryFolders
    .filter((folder) => folder.kind === "custom" && folder.library === "full")
    .slice()
    .sort((left, right) => left.depth - right.depth)
    .forEach((folder) => {
      const parent = nextFolderByPath.get(createPathKey(folder.path.slice(0, -1)));

      if (!parent) {
        return;
      }

      const nextFolder: ExamLibraryFolderEntity = {
        ...folder,
        id: createCustomExamLibraryFolderId(parent.id, folder.name),
        parentId: parent.id,
        subjectScope: parent.subjectScope,
        depth: parent.depth + 1
      };

      folderIdMap.set(folder.id, nextFolder.id);
      nextFolderByPath.set(createPathKey(nextFolder.path), nextFolder);
      nextExamLibraryFolders.push(nextFolder);
    });

  input.existingExamLibraryFolders
    .filter((folder) => folder.kind === "system")
    .forEach((folder) => {
      const nextFolder = nextFolderByPath.get(createPathKey(folder.path));

      if (nextFolder) {
        folderIdMap.set(folder.id, nextFolder.id);
      }
    });

  const existingFolderById = new Map(
    input.existingExamLibraryFolders.map((folder) => [folder.id, folder])
  );
  const nextExamLibraryDocuments = input.existingExamLibraryDocuments.flatMap((document) => {
    const previousFolder = existingFolderById.get(document.folderId);

    if (!previousFolder) {
      return [];
    }

    const nextFolder = nextFolderByPath.get(createPathKey(previousFolder.path));

    if (!nextFolder) {
      return [];
    }

    return [
      {
        ...document,
        folderId: nextFolder.id,
        title:
          document.isDefault && nextFolder.library === "specialized" && nextFolder.depth === 3
            ? createDefaultSpecializedDocumentTitle(
                nextFolder.name,
                document.kind,
                document.lectureVariant
              )
            : document.title
      }
    ];
  });

  return {
    examLibraryFolders: nextExamLibraryFolders,
    examLibraryDocuments: nextExamLibraryDocuments,
    folderIdMap
  };
}

export function buildInitialExamWorkspaceDraft(): ExamWorkspaceDraft {
  return {
    selectedLibrary: "specialized",
    selectedFolderId: null,
    selectedDocumentId: null
  };
}

export function createDefaultSpecializedDocuments(
  input: {
    folder: ExamLibraryFolderEntity;
    subjectScope: FolderEntity["subjectScope"];
  }
): ExamLibraryDocumentEntity[] {
  const groupId = `default-group-${input.folder.id}`;

  return [
    {
      id: `paper-${input.folder.id}`,
      folderId: input.folder.id,
      library: "specialized",
      kind: "paper",
      title: `${input.folder.name}专题卷`,
      subjectScope: input.subjectScope,
      groupId,
      isDefault: true,
      sourceMode: "question_bank",
      syncBinding: "strong",
      syncStatus: "idle",
      numberingMode: "resequence",
      questionIds: [],
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      allowsQuestionMutations: true
    },
    {
      id: `lecture-blank-${input.folder.id}`,
      folderId: input.folder.id,
      library: "specialized",
      kind: "lecture",
      lectureVariant: "blank",
      title: createDefaultSpecializedDocumentTitle(input.folder.name, "lecture", "blank"),
      subjectScope: input.subjectScope,
      groupId,
      isDefault: true,
      sourceMode: "question_bank",
      syncBinding: "strong",
      syncStatus: "idle",
      numberingMode: "resequence",
      questionIds: [],
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      allowsQuestionMutations: true
    },
    {
      id: `lecture-primary-${input.folder.id}`,
      folderId: input.folder.id,
      library: "specialized",
      kind: "lecture",
      lectureVariant: "primary",
      title: createDefaultSpecializedDocumentTitle(input.folder.name, "lecture", "primary"),
      immutableName: createDefaultSpecializedDocumentTitle(input.folder.name, "lecture", "primary"),
      subjectScope: input.subjectScope,
      groupId,
      isDefault: true,
      sourceMode: "question_bank",
      syncBinding: "strong",
      syncStatus: "idle",
      numberingMode: "resequence",
      questionIds: [],
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      allowsQuestionMutations: true
    },
    {
      id: `answer-${input.folder.id}`,
      folderId: input.folder.id,
      library: "specialized",
      kind: "answer_sheet",
      title: `${input.folder.name}答案`,
      subjectScope: input.subjectScope,
      groupId,
      isDefault: true,
      sourceMode: "question_bank",
      syncBinding: "strong",
      syncStatus: "idle",
      numberingMode: "resequence",
      questionIds: [],
      rawPageAssetIds: [],
      placeholderAnswerPage: true,
      allowsQuestionMutations: true
    }
  ];
}

function normalizeExamDocumentTitle(title: string, fallback: string): string {
  const withoutPdfExtension = sanitizeDocumentName(title).replace(/\.pdf$/i, "").trim();

  return withoutPdfExtension || fallback;
}

export function createIndependentLectureDocument(input: {
  id: string;
  folder: ExamLibraryFolderEntity;
  title: string;
}): ExamLibraryDocumentEntity {
  return {
    id: input.id,
    folderId: input.folder.id,
    library: input.folder.library,
    kind: "lecture",
    title: normalizeExamDocumentTitle(input.title, "未命名讲义"),
    subjectScope: input.folder.subjectScope,
    groupId: null,
    isDefault: false,
    sourceMode: "freeform",
    syncBinding: "independent",
    syncStatus: "idle",
    numberingMode: "resequence",
    questionIds: [],
    rawPageAssetIds: [],
    placeholderAnswerPage: false,
    allowsQuestionMutations: true
  };
}

export function createUploadedPdfLectureDocument(input: {
  id: string;
  folder: ExamLibraryFolderEntity;
  fileName: string;
  sourceAssetId: string;
}): ExamLibraryDocumentEntity {
  return {
    id: input.id,
    folderId: input.folder.id,
    library: input.folder.library,
    kind: "lecture",
    title: normalizeExamDocumentTitle(input.fileName, "PDF讲义"),
    subjectScope: input.folder.subjectScope,
    groupId: null,
    isDefault: false,
    sourceMode: "uploaded_pdf",
    syncBinding: "independent",
    syncStatus: "idle",
    numberingMode: "resequence",
    questionIds: [],
    rawPageAssetIds: [input.sourceAssetId],
    placeholderAnswerPage: false,
    allowsQuestionMutations: false
  };
}

export function createLectureArchiveDocument(input: {
  id: string;
  folder: ExamLibraryFolderEntity;
  fileName: string;
  sourceAssetId: string;
  sourceUploadTaskId: string;
}): ExamLibraryDocumentEntity {
  return {
    id: input.id,
    folderId: input.folder.id,
    library: input.folder.library,
    kind: "lecture",
    lectureVariant: "archive",
    title: normalizeExamDocumentTitle(input.fileName, "归档讲义"),
    subjectScope: input.folder.subjectScope,
    groupId: null,
    isDefault: false,
    sourceMode: "uploaded_pdf",
    syncBinding: "independent",
    syncStatus: "idle",
    numberingMode: "resequence",
    questionIds: [],
    rawPageAssetIds: [input.sourceAssetId],
    placeholderAnswerPage: false,
    allowsQuestionMutations: false,
    sourceUploadTaskId: input.sourceUploadTaskId
  };
}

function normalizeExamTitle(title: string, fallback: string): string {
  const normalized = title.trim();

  return normalized || fallback;
}

export function createQuestionBankFullPaperBundle(input: {
  idBase: string;
  folder: ExamLibraryFolderEntity;
  title: string;
  questionIds: string[];
  hasAnyAnswers: boolean;
}): ExamLibraryDocumentEntity[] {
  const groupId = `full-group-${input.idBase}`;
  const baseTitle = normalizeExamTitle(input.title, "未命名套卷");

  return [
    {
      id: `${input.idBase}-paper`,
      folderId: input.folder.id,
      library: "full",
      kind: "paper",
      title: baseTitle,
      subjectScope: input.folder.subjectScope,
      groupId,
      isDefault: false,
      sourceMode: "question_bank",
      syncBinding: "strong",
      syncStatus: "idle",
      numberingMode: "custom_numeric",
      questionIds: input.questionIds,
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      allowsQuestionMutations: true
    },
    {
      id: `${input.idBase}-lecture`,
      folderId: input.folder.id,
      library: "full",
      kind: "lecture",
      title: `${baseTitle}讲义`,
      subjectScope: input.folder.subjectScope,
      groupId,
      isDefault: false,
      sourceMode: "question_bank",
      syncBinding: "strong",
      syncStatus: "idle",
      numberingMode: "custom_numeric",
      questionIds: input.questionIds,
      rawPageAssetIds: [],
      placeholderAnswerPage: false,
      allowsQuestionMutations: true
    },
    {
      id: `${input.idBase}-answer`,
      folderId: input.folder.id,
      library: "full",
      kind: "answer_sheet",
      title: `${baseTitle}答案`,
      subjectScope: input.folder.subjectScope,
      groupId,
      isDefault: false,
      sourceMode: "question_bank",
      syncBinding: "strong",
      syncStatus: "idle",
      numberingMode: "custom_numeric",
      questionIds: input.questionIds,
      rawPageAssetIds: [],
      placeholderAnswerPage: !input.hasAnyAnswers,
      allowsQuestionMutations: true
    }
  ];
}

export function createUploadedPdfFullPaperBundle(input: {
  idBase: string;
  folder: ExamLibraryFolderEntity;
  fileName: string;
  sourceAssetId: string;
  sourceUploadTaskId?: string;
  answerSection: UploadedFullPaperDraftEntity["answerSection"];
  uploadedPdfPages: UploadedFullPaperDraftEntity["uploadedPdfPages"];
}): ExamLibraryDocumentEntity[] {
  const groupId = `full-group-${input.idBase}`;
  const baseTitle = normalizeExamDocumentTitle(input.fileName, "PDF套卷");

  return [
    {
      id: `${input.idBase}-paper`,
      folderId: input.folder.id,
      library: "full",
      kind: "paper",
      title: baseTitle,
      subjectScope: input.folder.subjectScope,
      groupId,
      isDefault: false,
      sourceMode: "uploaded_pdf",
      syncBinding: "strong",
      syncStatus: "idle",
      numberingMode: "custom_numeric",
      questionIds: [],
      rawPageAssetIds: [input.sourceAssetId],
      placeholderAnswerPage: false,
      allowsQuestionMutations: false,
      sourceUploadTaskId: input.sourceUploadTaskId,
      uploadedPdfWorkflowStatus: "draft_review",
      uploadedPdfAnswerSection: input.answerSection,
      uploadedPdfPages: input.uploadedPdfPages
    },
    {
      id: `${input.idBase}-lecture`,
      folderId: input.folder.id,
      library: "full",
      kind: "lecture",
      title: `${baseTitle}讲义`,
      subjectScope: input.folder.subjectScope,
      groupId,
      isDefault: false,
      sourceMode: "uploaded_pdf",
      syncBinding: "strong",
      syncStatus: "idle",
      numberingMode: "custom_numeric",
      questionIds: [],
      rawPageAssetIds: [input.sourceAssetId],
      placeholderAnswerPage: false,
      allowsQuestionMutations: false,
      sourceUploadTaskId: input.sourceUploadTaskId,
      uploadedPdfWorkflowStatus: "draft_review",
      uploadedPdfAnswerSection: input.answerSection,
      uploadedPdfPages: input.uploadedPdfPages
    },
    {
      id: `${input.idBase}-answer`,
      folderId: input.folder.id,
      library: "full",
      kind: "answer_sheet",
      title: `${baseTitle}答案`,
      subjectScope: input.folder.subjectScope,
      groupId,
      isDefault: false,
      sourceMode: "uploaded_pdf",
      syncBinding: "strong",
      syncStatus: "idle",
      numberingMode: "custom_numeric",
      questionIds: [],
      rawPageAssetIds: [input.sourceAssetId],
      placeholderAnswerPage: !input.answerSection.hasAnswerSection,
      allowsQuestionMutations: false,
      sourceUploadTaskId: input.sourceUploadTaskId,
      uploadedPdfWorkflowStatus: "draft_review",
      uploadedPdfAnswerSection: input.answerSection,
      uploadedPdfPages: input.uploadedPdfPages
    }
  ];
}

export function ensureDefaultSpecializedDocuments(input: {
  questionFolders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  questionDrafts: Array<
    Pick<QuestionDraftEntity, "id" | "directoryPath" | "documentId"> &
      Partial<
        Pick<
          QuestionDraftEntity,
          "globalOrder" | "answerAttachments" | "questionType" | "chapterTag" | "knowledgeTags"
        >
      >
  >;
  existingDocuments: ExamLibraryDocumentEntity[];
  /** @deprecated Missing answers use placeholder pages and no longer block document sync. */
  blockedDocumentIds?: string[];
}): ExamLibraryDocumentEntity[] {
  const questionFolderById = new Map(input.questionFolders.map((folder) => [folder.id, folder]));
  let changed = false;
  const nextDocuments = input.existingDocuments.slice();

  input.examLibraryFolders
    .filter(
      (folder) =>
        folder.library === "specialized" &&
        folder.depth === 3 &&
        folder.linkedQuestionFolderId !== null
    )
    .forEach((folder) => {
      const linkedQuestionFolder = questionFolderById.get(folder.linkedQuestionFolderId as string);
      const eligibleQuestions = linkedQuestionFolder
        ? input.questionDrafts
            .filter(
              (question) =>
                doesFolderPathMatchPrefix(question.directoryPath, linkedQuestionFolder.path)
            )
            .slice()
            .sort((left, right) => (left.globalOrder ?? 0) - (right.globalOrder ?? 0))
        : [];
      const hasAnyAnswers = eligibleQuestions.some(
        (question) => (question.answerAttachments?.length ?? 0) > 0
      );

      if (!linkedQuestionFolder) {
        return;
      }

      const existingPaperDocument =
        nextDocuments.find(
          (document) =>
            document.folderId === folder.id && document.isDefault && document.kind === "paper"
        ) ?? null;
      const eligibleBlockQuestions = eligibleQuestions.map((question) => ({
        id: question.id,
        globalOrder: question.globalOrder ?? 0,
        questionType: question.questionType ?? null,
        chapterTag: question.chapterTag ?? null,
        knowledgeTags: question.knowledgeTags ?? []
      }));
      const eligibleQuestionIds = eligibleBlockQuestions.map((question) => question.id);
      const reconciliationQuestionIds =
        existingPaperDocument?.syncStatus === "pending_confirmation"
          ? existingPaperDocument.pendingQuestionIds ?? existingPaperDocument.questionIds
          : existingPaperDocument?.questionIds ?? [];
      const reconciliationQuestionBlocks =
        existingPaperDocument?.syncStatus === "pending_confirmation"
          ? existingPaperDocument.pendingQuestionBlocks ?? existingPaperDocument.questionBlocks
          : existingPaperDocument?.questionBlocks;
      const existingPendingManualPlacementQuestionIds =
        existingPaperDocument?.syncStatus === "pending_confirmation"
          ? existingPaperDocument.pendingManualPlacementQuestionIds ?? []
          : [];
      const hasCurrentPendingPlan = Boolean(
        existingPaperDocument?.syncStatus === "pending_confirmation" &&
          existingPaperDocument.pendingQuestionIds !== undefined &&
          existingPaperDocument.pendingQuestionBlocks !== undefined &&
          haveSameQuestionIds(
            existingPaperDocument.pendingQuestionIds.concat(
              existingPendingManualPlacementQuestionIds
            ),
            eligibleQuestionIds
          )
      );
      const blockPlan = hasCurrentPendingPlan
        ? {
            orderedQuestionIds: existingPaperDocument!.pendingQuestionIds!,
            blocks: existingPaperDocument!.pendingQuestionBlocks!,
            manualPlacementQuestionIds: existingPendingManualPlacementQuestionIds
          }
        : existingPaperDocument &&
            (reconciliationQuestionIds.length > 0 ||
              (reconciliationQuestionBlocks?.length ?? 0) > 0)
          ? (() => {
              const eligibleQuestionIdSet = new Set(eligibleQuestionIds);
              const preservedManualPlacementQuestionIds =
                existingPendingManualPlacementQuestionIds.filter((questionId) =>
                  eligibleQuestionIdSet.has(questionId)
                );
              const preservedManualPlacementQuestionIdSet = new Set(
                preservedManualPlacementQuestionIds
              );
              const reconciled = reconcileSpecializedQuestionBlocks({
                currentQuestionIds: reconciliationQuestionIds,
                currentBlocks: reconciliationQuestionBlocks,
                questions: eligibleBlockQuestions.filter(
                  (question) => !preservedManualPlacementQuestionIdSet.has(question.id)
                )
              });
              const manualPlacementQuestionIdSet = new Set(
                preservedManualPlacementQuestionIds.concat(reconciled.manualPlacementQuestionIds)
              );

              return {
                ...reconciled,
                manualPlacementQuestionIds: eligibleQuestionIds.filter((questionId) =>
                  manualPlacementQuestionIdSet.has(questionId)
                )
              };
            })()
          : {
              ...buildInitialSpecializedQuestionBlocks(eligibleBlockQuestions),
              manualPlacementQuestionIds: [] as string[]
            };
      const nextQuestionIds = blockPlan.orderedQuestionIds;
      const nextQuestionBlocks = blockPlan.blocks;
      const pendingManualPlacementQuestionIds = blockPlan.manualPlacementQuestionIds;

      const existingDefaultKinds = new Set(
        nextDocuments
          .filter((document) => document.folderId === folder.id && document.isDefault)
          .map((document) => getDefaultDocumentKey(document))
      );

      createDefaultSpecializedDocuments({
        folder,
        subjectScope: folder.subjectScope
      }).forEach((document) => {
        const defaultDocumentKey = getDefaultDocumentKey(document);
        const nextPrimaryLectureSyncMetadata = createPrimaryLectureSyncMetadata({
          document,
          questionIds: nextQuestionIds,
          questionBlocks: nextQuestionBlocks
        });
        const nextDocument = {
          ...document,
          questionIds: nextQuestionIds,
          questionBlocks: nextQuestionBlocks,
          placeholderAnswerPage:
            document.kind === "answer_sheet" ? !hasAnyAnswers : document.placeholderAnswerPage,
          ...(nextPrimaryLectureSyncMetadata
            ? { syncMetadata: nextPrimaryLectureSyncMetadata }
            : {})
        };

        if (existingDefaultKinds.has(defaultDocumentKey)) {
          const existingIndex = nextDocuments.findIndex(
            (current) =>
              current.folderId === folder.id &&
              current.isDefault &&
              getDefaultDocumentKey(current) === defaultDocumentKey
          );

          if (existingIndex >= 0) {
            const current = nextDocuments[existingIndex];
            const currentPrimaryLectureSyncMetadata =
              current.syncMetadata ??
              createPrimaryLectureSyncMetadata({
                document: current,
                questionIds: current.questionIds,
                questionBlocks: current.questionBlocks
              });
            const isInitialSync =
              current.questionIds.length === 0 &&
              current.pendingQuestionIds === undefined &&
              current.pendingQuestionBlocks === undefined &&
              (current.kind !== "answer_sheet" ||
                (current.placeholderAnswerPage && current.pendingPlaceholderAnswerPage === undefined));
            const sameQuestionIds = areQuestionIdListsEqual(current.questionIds, nextQuestionIds);
            const sameQuestionBlocks = areQuestionBlocksEqual(
              current.questionBlocks,
              nextQuestionBlocks
            );
            const nextPlaceholderAnswerPage =
              current.kind === "answer_sheet" ? !hasAnyAnswers : current.placeholderAnswerPage;
            const placeholderChanged = current.placeholderAnswerPage !== nextPlaceholderAnswerPage;
            const samePendingQuestionIds =
              current.pendingQuestionIds !== undefined &&
              areQuestionIdListsEqual(current.pendingQuestionIds, nextQuestionIds);
            const samePendingQuestionBlocks =
              current.pendingQuestionBlocks !== undefined &&
              areQuestionBlocksEqual(current.pendingQuestionBlocks, nextQuestionBlocks);
            const samePendingManualPlacementQuestionIds =
              areQuestionIdListsEqual(
                current.pendingManualPlacementQuestionIds,
                pendingManualPlacementQuestionIds
              );
            const pendingPlaceholderChanged =
              current.pendingPlaceholderAnswerPage !==
              (current.kind === "answer_sheet" ? nextPlaceholderAnswerPage : undefined);

            if (
              isInitialSync &&
              !(
                current.kind === "answer_sheet" &&
                current.placeholderAnswerPage &&
                nextPlaceholderAnswerPage === false
              ) &&
              (!sameQuestionIds || !sameQuestionBlocks || placeholderChanged)
            ) {
              nextDocuments[existingIndex] = {
                ...current,
                questionIds: nextQuestionIds,
                questionBlocks: nextQuestionBlocks,
                placeholderAnswerPage: nextPlaceholderAnswerPage,
                syncStatus: "idle",
                pendingQuestionIds: undefined,
                pendingQuestionBlocks: undefined,
                pendingManualPlacementQuestionIds: undefined,
                pendingPlaceholderAnswerPage: undefined,
                ...(nextPrimaryLectureSyncMetadata
                  ? { syncMetadata: nextPrimaryLectureSyncMetadata }
                  : {})
              };
              changed = true;
            } else if (current.syncStatus === "pending_confirmation") {
              if (
                !samePendingQuestionIds ||
                !samePendingQuestionBlocks ||
                !samePendingManualPlacementQuestionIds ||
                pendingPlaceholderChanged
              ) {
                nextDocuments[existingIndex] = {
                  ...current,
                  pendingQuestionIds: nextQuestionIds,
                  pendingQuestionBlocks: nextQuestionBlocks,
                  pendingManualPlacementQuestionIds,
                  pendingPlaceholderAnswerPage:
                    current.kind === "answer_sheet" ? nextPlaceholderAnswerPage : undefined,
                  ...(currentPrimaryLectureSyncMetadata
                    ? { syncMetadata: currentPrimaryLectureSyncMetadata }
                    : {})
                };
                changed = true;
              }
            } else if (
              !sameQuestionIds ||
              !sameQuestionBlocks ||
              placeholderChanged ||
              pendingManualPlacementQuestionIds.length > 0
            ) {
              nextDocuments[existingIndex] = {
                ...current,
                syncStatus: "pending_confirmation",
                pendingQuestionIds: samePendingQuestionIds ? current.pendingQuestionIds : nextQuestionIds,
                  pendingQuestionBlocks: samePendingQuestionBlocks
                    ? current.pendingQuestionBlocks
                    : nextQuestionBlocks,
                  pendingManualPlacementQuestionIds: samePendingManualPlacementQuestionIds
                    ? current.pendingManualPlacementQuestionIds
                    : pendingManualPlacementQuestionIds,
                  pendingPlaceholderAnswerPage:
                    current.kind === "answer_sheet" ? nextPlaceholderAnswerPage : undefined,
                  ...(currentPrimaryLectureSyncMetadata
                    ? { syncMetadata: currentPrimaryLectureSyncMetadata }
                    : {})
                };
              changed = true;
            } else if (currentPrimaryLectureSyncMetadata && current.syncMetadata == null) {
              nextDocuments[existingIndex] = {
                ...current,
                syncMetadata: currentPrimaryLectureSyncMetadata
              };
              changed = true;
            }
          }

          return;
        }

        if (nextQuestionIds.length === 0) {
          return;
        }

        nextDocuments.push(nextDocument);
        existingDefaultKinds.add(defaultDocumentKey);
        changed = true;
      });
    });

  return changed ? nextDocuments : input.existingDocuments;
}

export function createCustomFullLibraryFolder(input: {
  parent: ExamLibraryFolderEntity;
  name: string;
}): ExamLibraryFolderEntity | null {
  const normalizedName = input.name.trim();

  if (!normalizedName || input.parent.library !== "full") {
    return null;
  }

  return {
    id: createCustomExamLibraryFolderId(input.parent.id, normalizedName),
    parentId: input.parent.id,
    name: normalizedName,
    library: "full",
    kind: "custom",
    subjectScope: input.parent.subjectScope,
    depth: input.parent.depth + 1,
    path: input.parent.path.concat(normalizedName),
    linkedQuestionFolderId: null
  };
}

export function renameCustomFullLibraryFolder(input: {
  folders: ExamLibraryFolderEntity[];
  documents: ExamLibraryDocumentEntity[];
  folderId: string;
  nextName: string;
}): {
  folders: ExamLibraryFolderEntity[];
  documents: ExamLibraryDocumentEntity[];
  folderIdMap: Map<string, string>;
  renamedFolder: ExamLibraryFolderEntity;
} | null {
  const target = input.folders.find((folder) => folder.id === input.folderId);
  const normalizedName = input.nextName.trim();

  if (
    !target ||
    target.library !== "full" ||
    target.kind !== "custom" ||
    !target.parentId ||
    !normalizedName
  ) {
    return null;
  }

  const parent = input.folders.find((folder) => folder.id === target.parentId);

  if (!parent) {
    return null;
  }

  const siblingConflict = input.folders.find(
    (folder) =>
      folder.parentId === target.parentId &&
      folder.id !== target.id &&
      folder.name === normalizedName
  );

  if (siblingConflict) {
    return null;
  }

  const childFoldersByParentId = input.folders.reduce<Record<string, ExamLibraryFolderEntity[]>>(
    (accumulator, folder) => {
      if (!folder.parentId) {
        return accumulator;
      }

      accumulator[folder.parentId] ??= [];
      accumulator[folder.parentId].push(folder);
      return accumulator;
    },
    {}
  );
  const folderIdMap = new Map<string, string>();

  const rebuildFolder = (
    folder: ExamLibraryFolderEntity,
    nextParent: ExamLibraryFolderEntity,
    overrideName?: string
  ): ExamLibraryFolderEntity[] => {
    const resolvedName = overrideName ?? folder.name;
    const isLectureArchiveFolder = folder.role === "lecture_archive";
    const nextFolder: ExamLibraryFolderEntity = {
      ...folder,
      id: isLectureArchiveFolder
        ? createLectureArchiveFolderId(nextParent.id)
        : createCustomExamLibraryFolderId(nextParent.id, resolvedName),
      parentId: nextParent.id,
      name: isLectureArchiveFolder ? "讲义归档" : resolvedName,
      subjectScope: nextParent.subjectScope,
      depth: nextParent.depth + 1,
      path: nextParent.path.concat(isLectureArchiveFolder ? "讲义归档" : resolvedName),
      kind: isLectureArchiveFolder ? "system" : folder.kind,
      linkedQuestionFolderId: isLectureArchiveFolder ? null : folder.linkedQuestionFolderId
    };

    folderIdMap.set(folder.id, nextFolder.id);

    const children = childFoldersByParentId[folder.id] ?? [];

    return [
      nextFolder,
      ...children.flatMap((child) => rebuildFolder(child, nextFolder))
    ];
  };

  const rebuiltFolders = rebuildFolder(target, parent, normalizedName);
  const rebuiltById = new Map(rebuiltFolders.map((folder) => [folder.id, folder]));
  const removedFolderIds = new Set(folderIdMap.keys());
  const nextFolders = input.folders
    .filter((folder) => !removedFolderIds.has(folder.id))
    .concat(rebuiltFolders);
  const nextDocuments = input.documents.map((document) => ({
    ...document,
    folderId: folderIdMap.get(document.folderId) ?? document.folderId
  }));
  const renamedFolder = rebuiltById.get(folderIdMap.get(target.id) ?? "");

  if (!renamedFolder) {
    return null;
  }

  return {
    folders: nextFolders,
    documents: nextDocuments,
    folderIdMap,
    renamedFolder
  };
}

export function deleteCustomFullLibraryFolder(input: {
  folders: ExamLibraryFolderEntity[];
  documents: ExamLibraryDocumentEntity[];
  folderId: string;
}): {
  folders: ExamLibraryFolderEntity[];
  documents: ExamLibraryDocumentEntity[];
  deletedFolderIds: string[];
  parentFolder: ExamLibraryFolderEntity;
} | null {
  const target = input.folders.find((folder) => folder.id === input.folderId);

  if (
    !target ||
    target.library !== "full" ||
    target.kind !== "custom" ||
    !target.parentId
  ) {
    return null;
  }

  const parentFolder = input.folders.find((folder) => folder.id === target.parentId);

  if (!parentFolder) {
    return null;
  }

  const childFoldersByParentId = input.folders.reduce<Record<string, ExamLibraryFolderEntity[]>>(
    (accumulator, folder) => {
      if (!folder.parentId) {
        return accumulator;
      }

      accumulator[folder.parentId] ??= [];
      accumulator[folder.parentId].push(folder);
      return accumulator;
    },
    {}
  );
  const deletedFolderIds: string[] = [];

  const collectFolderIds = (folder: ExamLibraryFolderEntity) => {
    deletedFolderIds.push(folder.id);

    (childFoldersByParentId[folder.id] ?? []).forEach(collectFolderIds);
  };

  collectFolderIds(target);
  const deletedFolderIdSet = new Set(deletedFolderIds);

  return {
    folders: input.folders.filter((folder) => !deletedFolderIdSet.has(folder.id)),
    documents: input.documents.filter((document) => !deletedFolderIdSet.has(document.folderId)),
    deletedFolderIds,
    parentFolder
  };
}

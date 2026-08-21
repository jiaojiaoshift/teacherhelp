import { normalizeQuestionLibraryDirectoryPath } from "@/lib/services/classification-service";
import {
  ensureDefaultSpecializedDocuments,
  ensureExamLibraryFolders
} from "@/lib/services/exam-library-service";
import {
  buildInitialFolderTree,
  normalizeInitialFolderTree
} from "@/lib/services/folder-service";
import type { LocalLibrarySnapshot } from "@/lib/services/local-library-contract";
import { normalizeCrossPageQuestionWidths } from "@/lib/services/question-layout-normalization-service";

function replaceDocumentEntities<T extends { documentId: string }>(input: {
  existing: T[];
  source: T[];
  documentId: string;
}) {
  return input.existing
    .filter((entity) => entity.documentId !== input.documentId)
    .concat(input.source.filter((entity) => entity.documentId === input.documentId));
}

export function importDocumentIntoLocalLibrary(input: {
  existing: LocalLibrarySnapshot;
  source: LocalLibrarySnapshot;
  documentId: string;
}): LocalLibrarySnapshot {
  const folders = input.existing.folders.length
    ? normalizeInitialFolderTree(input.existing.folders)
    : buildInitialFolderTree();
  const pages = replaceDocumentEntities({
    existing: input.existing.pages,
    source: input.source.pages,
    documentId: input.documentId
  });
  const binaryAssets = replaceDocumentEntities({
    existing: input.existing.binaryAssets,
    source: input.source.binaryAssets,
    documentId: input.documentId
  });
  const importedQuestions = input.source.questionDrafts
    .filter((question) => question.documentId === input.documentId)
    .map((question) => ({
      ...question,
      directoryPath: normalizeQuestionLibraryDirectoryPath(question.directoryPath ?? null),
      directoryCandidatePaths: (question.directoryCandidatePaths ?? []).map(
        (path) => normalizeQuestionLibraryDirectoryPath(path) ?? path
      )
    }));
  const combinedQuestions = input.existing.questionDrafts
    .filter((question) => question.documentId !== input.documentId)
    .concat(importedQuestions);
  const questionDrafts = normalizeCrossPageQuestionWidths({
    pages,
    questions: combinedQuestions
  });
  const examLibraryFolders = ensureExamLibraryFolders({
    questionFolders: folders,
    existingExamLibraryFolders: input.existing.examLibraryFolders
  });
  const examLibraryDocuments = ensureDefaultSpecializedDocuments({
    questionFolders: folders,
    examLibraryFolders,
    questionDrafts,
    existingDocuments: input.existing.examLibraryDocuments
  });

  return {
    ...input.existing,
    folders,
    pages,
    binaryAssets,
    questionDrafts,
    examLibraryFolders,
    examLibraryDocuments
  };
}

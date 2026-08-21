import { create } from "zustand";

import type {
  DocumentEntity,
  DocumentPendingAnswerMatchEntry,
  PageEntity,
  QuestionPageLayoutMode
} from "@/lib/domain/entities";
import { normalizeSubjectScope } from "@/lib/services/folder-service";

interface FileStoreState {
  documents: DocumentEntity[];
  pages: PageEntity[];
  selectedPageId: string | null;
  uploadQueue: string[];
  hydrateWorkspaceState: (snapshot: {
    documents: DocumentEntity[];
    pages: PageEntity[];
    selectedPageId: string | null;
  }) => void;
  upsertDocument: (document: DocumentEntity) => void;
  updateDocumentStatus: (documentId: string, status: DocumentEntity["status"]) => void;
  setDocumentAnswerSectionSuggestion: (
    documentId: string,
    suggestion: {
      hasAnswerSection: boolean;
      suggestedSplitPage: number | null;
    }
  ) => void;
  confirmDocumentAnswerSection: (
    documentId: string,
    confirmation: {
      hasAnswerSection: boolean;
      splitPage?: number | null;
      questionPageLayoutMode?: QuestionPageLayoutMode;
    }
  ) => void;
  setDocumentPendingAnswerMatchSummary: (
    documentId: string,
    summary: {
      pendingCount: number;
    }
  ) => void;
  setDocumentPendingAnswerMatches: (
    documentId: string,
    matches: DocumentPendingAnswerMatchEntry[]
  ) => void;
  updateDocumentPendingAnswerMatchSuggestion: (
    documentId: string,
    matchId: string,
    suggestedQuestionId: string | null
  ) => void;
  updateDocumentPendingAnswerMatchLabel: (
    documentId: string,
    matchId: string,
    answerLabel: string
  ) => void;
  updateDocumentPendingAnswerMatchNormalizedBBox: (
    documentId: string,
    matchId: string,
    normalizedBBox: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  ) => void;
  resolveDocumentPendingAnswerMatch: (documentId: string, matchId: string) => void;
  upsertPage: (page: PageEntity) => void;
  updatePageStatus: (
    pageId: string,
    patch: Partial<Pick<PageEntity, "analysisStatus" | "reviewStatus">>
  ) => void;
  deleteDocument: (
    documentId: string
  ) => { deletedDocumentId: string; deletedPageIds: string[] } | null;
  selectPage: (pageId: string | null) => void;
}

function normalizeDocumentEntity(document: DocumentEntity): DocumentEntity {
  const subjectScope = normalizeSubjectScope(document.subjectScope);

  return {
    ...document,
    ...(subjectScope ? { subjectScope } : {})
  };
}

export const useFileStore = create<FileStoreState>((set, get) => ({
  documents: [],
  pages: [],
  selectedPageId: null,
  uploadQueue: [],
  hydrateWorkspaceState: (snapshot) =>
    set({
      documents: snapshot.documents.map(normalizeDocumentEntity),
      pages: snapshot.pages,
      selectedPageId: snapshot.selectedPageId,
      uploadQueue: []
    }),
  upsertDocument: (document) =>
    set((state) => {
      const normalizedDocument = normalizeDocumentEntity(document);
      const exists = state.documents.some((current) => current.id === normalizedDocument.id);
      return {
        documents: exists
          ? state.documents.map((current) =>
              current.id === normalizedDocument.id ? normalizedDocument : current
            )
          : [...state.documents, normalizedDocument]
      };
    }),
  updateDocumentStatus: (documentId, status) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.id === documentId
          ? {
              ...document,
              status
            }
          : document
      )
    })),
  setDocumentAnswerSectionSuggestion: (documentId, suggestion) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.id === documentId
          ? {
              ...document,
              answerSection: {
                status: "suggested",
                hasAnswerSection: suggestion.hasAnswerSection,
                suggestedSplitPage: suggestion.suggestedSplitPage,
                confirmedSplitPage: document.answerSection?.confirmedSplitPage ?? null
              }
            }
          : document
      )
    })),
  confirmDocumentAnswerSection: (documentId, confirmation) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.id === documentId
          ? {
              ...document,
              ...(confirmation.questionPageLayoutMode
                ? { questionPageLayoutMode: confirmation.questionPageLayoutMode }
                : {}),
              pendingAnswerMatch: confirmation.hasAnswerSection,
              pendingAnswerMatchCount: 0,
              pendingAnswerMatches: confirmation.hasAnswerSection
                ? document.pendingAnswerMatches ?? []
                : [],
              answerSection: {
                status: "confirmed",
                hasAnswerSection: confirmation.hasAnswerSection,
                suggestedSplitPage: document.answerSection?.suggestedSplitPage ?? null,
                confirmedSplitPage: confirmation.hasAnswerSection
                  ? confirmation.splitPage ?? null
                  : null
              }
            }
          : document
      )
    })),
  setDocumentPendingAnswerMatchSummary: (documentId, summary) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.id === documentId
          ? {
              ...document,
              pendingAnswerMatch:
                summary.pendingCount > 0 ? true : document.pendingAnswerMatch ?? false,
              pendingAnswerMatchCount: summary.pendingCount
            }
          : document
      )
    })),
  setDocumentPendingAnswerMatches: (documentId, matches) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.id === documentId
          ? {
              ...document,
              pendingAnswerMatch: matches.length > 0,
              pendingAnswerMatchCount: matches.length,
              pendingAnswerMatches: matches
            }
          : document
      )
    })),
  updateDocumentPendingAnswerMatchSuggestion: (documentId, matchId, suggestedQuestionId) =>
    set((state) => ({
      documents: state.documents.map((document) => {
        if (document.id !== documentId) {
          return document;
        }

        return {
          ...document,
          pendingAnswerMatches: (document.pendingAnswerMatches ?? []).map((match) =>
            match.id === matchId
              ? {
                  ...match,
                  suggestedQuestionId
                }
              : match
          )
        };
      })
    })),
  updateDocumentPendingAnswerMatchLabel: (documentId, matchId, answerLabel) =>
    set((state) => ({
      documents: state.documents.map((document) => {
        if (document.id !== documentId) {
          return document;
        }

        const normalizedAnswerLabel = answerLabel.replace(/\D+/g, "").trim();

        return {
          ...document,
          pendingAnswerMatches: (document.pendingAnswerMatches ?? []).map((match) =>
            match.id === matchId
              ? {
                  ...match,
                  answerLabel: normalizedAnswerLabel
                }
              : match
          )
        };
      })
    })),
  updateDocumentPendingAnswerMatchNormalizedBBox: (documentId, matchId, normalizedBBox) =>
    set((state) => ({
      documents: state.documents.map((document) => {
        if (document.id !== documentId) {
          return document;
        }

        return {
          ...document,
          pendingAnswerMatches: (document.pendingAnswerMatches ?? []).map((match) =>
            match.id === matchId
              ? {
                  ...match,
                  normalizedBBox
                }
              : match
          )
        };
      })
    })),
  resolveDocumentPendingAnswerMatch: (documentId, matchId) =>
    set((state) => ({
      documents: state.documents.map((document) => {
        if (document.id !== documentId) {
          return document;
        }

        const pendingAnswerMatches = (document.pendingAnswerMatches ?? []).filter(
          (match) => match.id !== matchId
        );

        return {
          ...document,
          pendingAnswerMatch: pendingAnswerMatches.length > 0,
          pendingAnswerMatchCount: pendingAnswerMatches.length,
          pendingAnswerMatches
        };
      })
    })),
  upsertPage: (page) =>
    set((state) => {
      const exists = state.pages.some((current) => current.id === page.id);
      const nextPages = exists
        ? state.pages.map((current) => (current.id === page.id ? page : current))
        : [...state.pages, page];

      return {
        pages: nextPages,
        selectedPageId: state.selectedPageId ?? page.id
      };
    }),
  updatePageStatus: (pageId, patch) =>
    set((state) => ({
      pages: state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              ...patch
            }
          : page
      )
    })),
  deleteDocument: (documentId) => {
    const targetDocument = get().documents.find((document) => document.id === documentId);

    if (!targetDocument) {
      return null;
    }

    const deletedPageIds = get()
      .pages.filter(
        (page) => page.documentId === documentId || targetDocument.pageIds.includes(page.id)
      )
      .map((page) => page.id);
    const deletedPageIdSet = new Set(deletedPageIds);

    set((state) => {
      const nextPages = state.pages.filter((page) => !deletedPageIdSet.has(page.id));

      return {
        documents: state.documents.filter((document) => document.id !== documentId),
        pages: nextPages,
        selectedPageId: deletedPageIdSet.has(state.selectedPageId ?? "")
          ? nextPages[0]?.id ?? null
          : state.selectedPageId
      };
    });

    return {
      deletedDocumentId: documentId,
      deletedPageIds
    };
  },
  selectPage: (selectedPageId) => set({ selectedPageId })
}));

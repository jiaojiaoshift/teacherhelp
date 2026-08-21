import { beforeEach, describe, expect, it } from "vitest";

import { useFileStore } from "@/lib/stores/file-store";

describe("file-store", () => {
  beforeEach(() => {
    useFileStore.setState({
      documents: [],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });
  });

  it("appends documents and selects the first page by default", () => {
    useFileStore.getState().upsertDocument({
      id: "doc-1",
      name: "试卷.pdf",
      kind: "pdf",
      status: "uploaded_temp",
      pageIds: ["page-1"]
    });

    useFileStore.getState().upsertPage({
      id: "page-1",
      documentId: "doc-1",
      pageNumber: 1,
      width: 1200,
      height: 1600,
      analysisStatus: "idle",
      reviewStatus: "unreviewed"
    });

    expect(useFileStore.getState().selectedPageId).toBe("page-1");
    expect(useFileStore.getState().documents).toHaveLength(1);
    expect(useFileStore.getState().pages).toHaveLength(1);
  });

  it("normalizes old document subject names when hydrating or upserting documents", () => {
    useFileStore.getState().hydrateWorkspaceState({
      documents: [
        {
          id: "doc-legacy-math",
          name: "math.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: [],
          subjectScope: "初高中数学"
        },
        {
          id: "doc-legacy-physics",
          name: "physics.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: [],
          subjectScope: "初高中物理"
        }
      ],
      pages: [],
      selectedPageId: null
    });

    expect(useFileStore.getState().documents).toEqual([
      expect.objectContaining({
        id: "doc-legacy-math",
        subjectScope: "高中数学"
      }),
      expect.objectContaining({
        id: "doc-legacy-physics",
        subjectScope: "高中物理"
      })
    ]);

    useFileStore.getState().upsertDocument({
      id: "doc-new-legacy",
      name: "legacy.pdf",
      kind: "pdf",
      status: "pages_ready",
      pageIds: [],
      subjectScope: "初高中物理"
    });

    expect(useFileStore.getState().documents.find((document) => document.id === "doc-new-legacy")).toMatchObject({
      subjectScope: "高中物理"
    });
  });

  it("updates an existing page status without replacing other pages", () => {
    useFileStore.setState({
      documents: [],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        }
      ],
      selectedPageId: "page-1",
      uploadQueue: []
    });

    useFileStore.getState().updatePageStatus("page-1", {
      analysisStatus: "done",
      reviewStatus: "reviewed"
    });

    expect(useFileStore.getState().pages).toEqual([
      {
        id: "page-1",
        documentId: "doc-1",
        pageNumber: 1,
        width: 1200,
        height: 1600,
        analysisStatus: "done",
        reviewStatus: "reviewed"
      },
      {
        id: "page-2",
        documentId: "doc-1",
        pageNumber: 2,
        width: 1200,
        height: 1600,
        analysisStatus: "idle",
        reviewStatus: "unreviewed"
      }
    ]);
  });

  it("updates a document status without replacing other documents", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "试卷.pdf",
          kind: "pdf",
          status: "import_ready",
          pageIds: ["page-1"]
        },
        {
          id: "doc-2",
          name: "习题.png",
          kind: "image",
          status: "pages_ready",
          pageIds: ["page-2"]
        }
      ]
    });

    useFileStore.getState().updateDocumentStatus("doc-1", "source_purged");

    expect(useFileStore.getState().documents).toEqual([
      {
        id: "doc-1",
        name: "试卷.pdf",
        kind: "pdf",
        status: "source_purged",
        pageIds: ["page-1"]
      },
      {
        id: "doc-2",
        name: "习题.png",
        kind: "image",
        status: "pages_ready",
        pageIds: ["page-2"]
      }
    ]);
  });

  it("deletes one uploaded document with its pages and moves selection to the next available page", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "试卷-a.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"]
        },
        {
          id: "doc-2",
          name: "试卷-b.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-3"]
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "done",
          reviewStatus: "reviewed"
        },
        {
          id: "page-2",
          documentId: "doc-1",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          analysisStatus: "done",
          reviewStatus: "reviewed"
        },
        {
          id: "page-3",
          documentId: "doc-2",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        }
      ],
      selectedPageId: "page-2",
      uploadQueue: []
    });

    const result = (useFileStore.getState() as any).deleteDocument("doc-1");

    expect(result).toEqual({
      deletedDocumentId: "doc-1",
      deletedPageIds: ["page-1", "page-2"]
    });
    expect(useFileStore.getState().documents.map((document) => document.id)).toEqual(["doc-2"]);
    expect(useFileStore.getState().pages.map((page) => page.id)).toEqual(["page-3"]);
    expect(useFileStore.getState().selectedPageId).toBe("page-3");
  });
  it("stores answer-section split suggestions and keeps other document fields intact", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3"],
          subjectScope: "subject-a"
        }
      ],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });

    useFileStore.getState().setDocumentAnswerSectionSuggestion("doc-1", {
      hasAnswerSection: true,
      suggestedSplitPage: 3
    });

    expect(useFileStore.getState().documents).toEqual([
      {
        id: "doc-1",
        name: "sample.pdf",
        kind: "pdf",
        status: "pages_ready",
        pageIds: ["page-1", "page-2", "page-3"],
        subjectScope: "subject-a",
        answerSection: {
          status: "suggested",
          hasAnswerSection: true,
          suggestedSplitPage: 3,
          confirmedSplitPage: null
        }
      }
    ]);
  });

  it("confirms a document answer-section split and supports no-answer documents", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2", "page-3"],
          answerSection: {
            status: "suggested",
            hasAnswerSection: true,
            suggestedSplitPage: 3,
            confirmedSplitPage: null
          }
        },
        {
          id: "doc-2",
          name: "sample-2.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-4", "page-5"]
        }
      ],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });

    useFileStore.getState().confirmDocumentAnswerSection("doc-1", {
      hasAnswerSection: true,
      splitPage: 2
    });
    useFileStore.getState().confirmDocumentAnswerSection("doc-2", {
      hasAnswerSection: false
    });

    expect(useFileStore.getState().documents).toEqual([
      {
        id: "doc-1",
        name: "sample.pdf",
        kind: "pdf",
        status: "pages_ready",
        pageIds: ["page-1", "page-2", "page-3"],
        pendingAnswerMatch: true,
        pendingAnswerMatchCount: 0,
        pendingAnswerMatches: [],
        answerSection: {
          status: "confirmed",
          hasAnswerSection: true,
          suggestedSplitPage: 3,
          confirmedSplitPage: 2
        }
      },
      {
        id: "doc-2",
        name: "sample-2.pdf",
        kind: "pdf",
        status: "pages_ready",
        pageIds: ["page-4", "page-5"],
        pendingAnswerMatch: false,
        pendingAnswerMatchCount: 0,
        pendingAnswerMatches: [],
        answerSection: {
          status: "confirmed",
          hasAnswerSection: false,
          suggestedSplitPage: null,
          confirmedSplitPage: null
        }
      }
    ]);
  });

  it("persists the selected question-page layout mode with answer confirmation", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-layout",
          name: "double-column.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1", "page-2"]
        }
      ],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });

    useFileStore.getState().confirmDocumentAnswerSection("doc-layout", {
      hasAnswerSection: false,
      questionPageLayoutMode: "double_column"
    });

    expect(useFileStore.getState().documents[0]).toMatchObject({
      questionPageLayoutMode: "double_column",
      answerSection: {
        status: "confirmed",
        hasAnswerSection: false
      }
    });

    useFileStore.getState().setDocumentAnswerSectionSuggestion("doc-layout", {
      hasAnswerSection: true,
      suggestedSplitPage: 2
    });

    expect(useFileStore.getState().documents[0].questionPageLayoutMode).toBe("double_column");
  });

  it("updates one document pending-answer-match summary without touching other documents", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 0
        },
        {
          id: "doc-2",
          name: "sample-2.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-2"],
          pendingAnswerMatch: false,
          pendingAnswerMatchCount: 0
        }
      ],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });

    useFileStore.getState().setDocumentPendingAnswerMatchSummary("doc-1", {
      pendingCount: 3
    });

    expect(useFileStore.getState().documents).toEqual([
      {
        id: "doc-1",
        name: "sample.pdf",
        kind: "pdf",
        status: "pages_ready",
        pageIds: ["page-1"],
        pendingAnswerMatch: true,
        pendingAnswerMatchCount: 3
      },
      {
        id: "doc-2",
        name: "sample-2.pdf",
        kind: "pdf",
        status: "pages_ready",
        pageIds: ["page-2"],
        pendingAnswerMatch: false,
        pendingAnswerMatchCount: 0
      }
    ]);
  });

  it("stores pending answer-match entries and synchronizes count and blocking state", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 0
        } as any
      ],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });

    (useFileStore.getState() as any).setDocumentPendingAnswerMatches("doc-1", [
      {
        id: "match-1",
        answerLabel: "12",
        suggestedQuestionId: "q-12",
        status: "pending"
      },
      {
        id: "match-2",
        answerLabel: "15",
        suggestedQuestionId: null,
        status: "pending"
      }
    ]);

    expect(useFileStore.getState().documents).toEqual([
      {
        id: "doc-1",
        name: "sample.pdf",
        kind: "pdf",
        status: "pages_ready",
        pageIds: ["page-1"],
        pendingAnswerMatch: true,
        pendingAnswerMatchCount: 2,
        pendingAnswerMatches: [
          {
            id: "match-1",
            answerLabel: "12",
            suggestedQuestionId: "q-12",
            status: "pending"
          },
          {
            id: "match-2",
            answerLabel: "15",
            suggestedQuestionId: null,
            status: "pending"
          }
        ]
      }
    ]);

    (useFileStore.getState() as any).setDocumentPendingAnswerMatches("doc-1", []);

    expect(useFileStore.getState().documents).toEqual([
      {
        id: "doc-1",
        name: "sample.pdf",
        kind: "pdf",
        status: "pages_ready",
        pageIds: ["page-1"],
        pendingAnswerMatch: false,
        pendingAnswerMatchCount: 0,
        pendingAnswerMatches: []
      }
    ]);
  });

  it("resolves one pending answer-match entry at a time and unblocks the document after the last entry", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 2,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: "q-12",
              status: "pending"
            },
            {
              id: "match-2",
              answerLabel: "15",
              suggestedQuestionId: null,
              status: "pending"
            }
          ]
        } as any
      ],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });

    (useFileStore.getState() as any).resolveDocumentPendingAnswerMatch("doc-1", "match-1");

    expect(useFileStore.getState().documents[0]).toMatchObject({
      pendingAnswerMatch: true,
      pendingAnswerMatchCount: 1,
      pendingAnswerMatches: [
        {
          id: "match-2",
          answerLabel: "15",
          suggestedQuestionId: null,
          status: "pending"
        }
      ]
    });

    (useFileStore.getState() as any).resolveDocumentPendingAnswerMatch("doc-1", "match-2");

    expect(useFileStore.getState().documents[0]).toMatchObject({
      pendingAnswerMatch: false,
      pendingAnswerMatchCount: 0,
      pendingAnswerMatches: []
    });
  });

  it("updates one pending answer-match suggestion without changing the rest", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 2,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: null,
              status: "pending"
            },
            {
              id: "match-2",
              answerLabel: "15",
              suggestedQuestionId: "q-15",
              status: "pending"
            }
          ]
        } as any
      ],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });

    (useFileStore.getState() as any).updateDocumentPendingAnswerMatchSuggestion("doc-1", "match-1", "q-12");

    expect(useFileStore.getState().documents[0]).toMatchObject({
      pendingAnswerMatches: [
        {
          id: "match-1",
          answerLabel: "12",
          suggestedQuestionId: "q-12",
          status: "pending"
        },
        {
          id: "match-2",
          answerLabel: "15",
          suggestedQuestionId: "q-15",
          status: "pending"
        }
      ]
    });
  });

  it("updates one pending answer-match label with digits only without changing the rest", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 2,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: null,
              status: "pending"
            },
            {
              id: "match-2",
              answerLabel: "15",
              suggestedQuestionId: "q-15",
              status: "pending"
            }
          ]
        } as any
      ],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });

    (useFileStore.getState() as any).updateDocumentPendingAnswerMatchLabel("doc-1", "match-1", "Q18A");

    expect(useFileStore.getState().documents[0]).toMatchObject({
      pendingAnswerMatches: [
        {
          id: "match-1",
          answerLabel: "18",
          suggestedQuestionId: null,
          status: "pending"
        },
        {
          id: "match-2",
          answerLabel: "15",
          suggestedQuestionId: "q-15",
          status: "pending"
        }
      ]
    });
  });

  it("updates one pending answer-match bbox without changing the rest", () => {
    useFileStore.setState({
      documents: [
        {
          id: "doc-1",
          name: "sample.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          pendingAnswerMatch: true,
          pendingAnswerMatchCount: 2,
          pendingAnswerMatches: [
            {
              id: "match-1",
              answerLabel: "12",
              suggestedQuestionId: null,
              status: "pending",
              normalizedBBox: {
                x1: 100,
                y1: 120,
                x2: 800,
                y2: 260
              }
            },
            {
              id: "match-2",
              answerLabel: "15",
              suggestedQuestionId: "q-15",
              status: "pending",
              normalizedBBox: {
                x1: 100,
                y1: 300,
                x2: 800,
                y2: 460
              }
            }
          ]
        } as any
      ],
      pages: [],
      selectedPageId: null,
      uploadQueue: []
    });

    (useFileStore.getState() as any).updateDocumentPendingAnswerMatchNormalizedBBox(
      "doc-1",
      "match-1",
      {
        x1: 150,
        y1: 170,
        x2: 850,
        y2: 310
      }
    );

    expect(useFileStore.getState().documents[0]).toMatchObject({
      pendingAnswerMatches: [
        {
          id: "match-1",
          normalizedBBox: {
            x1: 150,
            y1: 170,
            x2: 850,
            y2: 310
          }
        },
        {
          id: "match-2",
          normalizedBBox: {
            x1: 100,
            y1: 300,
            x2: 800,
            y2: 460
          }
        }
      ]
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft,
  createDefaultSpecializedDocuments,
  createIndependentLectureDocument,
  createLectureArchiveDocument,
  deleteCustomFullLibraryFolder,
  createUploadedPdfLectureDocument,
  ensureExamLibraryFolders,
  ensureDefaultSpecializedDocuments,
  renameCustomFullLibraryFolder,
  syncExamLibraryForQuestionFolderDeletion
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree, createCustomFolder } from "@/lib/services/folder-service";

describe("exam-library-service", () => {
  it("builds specialized and full library roots from the question folder tree", () => {
    const folders = buildInitialExamLibraryFolders(buildInitialFolderTree());

    expect(folders.find((folder) => folder.id === "specialized-root")).toMatchObject({
      library: "specialized"
    });
    expect(folders.find((folder) => folder.id === "full-root")).toMatchObject({
      library: "full"
    });
    expect(folders.filter((folder) => folder.library === "full" && folder.depth === 1).length).toBeGreaterThan(0);
  });

  it("mirrors seeded physics chapters into both exam libraries and topics into the specialized library", () => {
    const folders = buildInitialExamLibraryFolders(buildInitialFolderTree());
    const foldersByPath = new Map(folders.map((folder) => [folder.path.join(" / "), folder]));

    ["电路", "磁场", "电磁感应"].forEach((chapterName) => {
      expect(foldersByPath.get(`专题卷库 / 高中物理 / ${chapterName}`)).toMatchObject({
        library: "specialized",
        depth: 2
      });
      expect(foldersByPath.get(`套卷库 / 高中物理 / ${chapterName}`)).toMatchObject({
        library: "full",
        depth: 2
      });
    });

    expect(foldersByPath.get("专题卷库 / 高中物理 / 电路 / 电路元件认识")).toMatchObject({
      library: "specialized",
      depth: 3
    });
    expect(
      foldersByPath.get("专题卷库 / 高中物理 / 电路 / 电路元件认识 / 讲义归档")
    ).toMatchObject({
      library: "specialized",
      role: "lecture_archive",
      depth: 4
    });
    expect(foldersByPath.has("套卷库 / 高中物理 / 电路 / 电路元件认识")).toBe(false);
  });

  it("builds the default exam workspace draft", () => {
    expect(buildInitialExamWorkspaceDraft()).toEqual({
      selectedLibrary: "specialized",
      selectedFolderId: null,
      selectedDocumentId: null
    });
  });

  it("creates the default specialized paper, lecture and answer sheet trio", () => {
    const baseFolders = buildInitialFolderTree();
    const subjectScope = baseFolders.find((folder) => folder.depth === 1 && folder.subjectScope)?.subjectScope ?? null;

    const documents = createDefaultSpecializedDocuments({
      folder: {
        id: "specialized--folder-1",
        parentId: "specialized-root",
        name: "topic-folder",
        library: "specialized",
        kind: "system",
        subjectScope,
        depth: 3,
        path: ["library", "subject", "chapter", "topic-folder"],
        linkedQuestionFolderId: "folder-1"
      },
      subjectScope
    });

    expect(
      documents.map(
        (document) => `${document.kind}:${document.lectureVariant ?? "none"}`
      )
    ).toEqual([
      "paper:none",
      "lecture:blank",
      "lecture:primary",
      "answer_sheet:none"
    ]);
    expect(documents.every((document) => document.isDefault)).toBe(true);
    expect(documents.every((document) => document.syncBinding === "strong")).toBe(true);
    expect(documents.find((document) => document.lectureVariant === "primary")).toMatchObject({
      immutableName: "topic-folder主讲义"
    });
    expect(documents.find((document) => document.lectureVariant === "blank")?.immutableName).toBeUndefined();
  });

  it("creates a freeform independent lecture document", () => {
    const folder = buildInitialExamLibraryFolders(buildInitialFolderTree()).find(
      (item) => item.library === "specialized" && item.depth === 1
    );

    expect(folder).toBeTruthy();

    const document = createIndependentLectureDocument({
      id: "lecture-freeform-1",
      folder: folder!,
      title: "  practice lecture  "
    });

    expect(document).toMatchObject({
      id: "lecture-freeform-1",
      folderId: folder!.id,
      library: "specialized",
      kind: "lecture",
      title: "practice lecture",
      sourceMode: "freeform",
      syncBinding: "independent",
      allowsQuestionMutations: true,
      rawPageAssetIds: []
    });
  });

  it("creates an uploaded-pdf independent lecture document", () => {
    const folder = buildInitialExamLibraryFolders(buildInitialFolderTree()).find(
      (item) => item.library === "full" && item.depth === 1
    );

    expect(folder).toBeTruthy();

    const document = createUploadedPdfLectureDocument({
      id: "lecture-pdf-1",
      folder: folder!,
      fileName: "review.pdf",
      sourceAssetId: "asset-source-1"
    });

    expect(document).toMatchObject({
      id: "lecture-pdf-1",
      folderId: folder!.id,
      library: "full",
      kind: "lecture",
      title: "review",
      sourceMode: "uploaded_pdf",
      syncBinding: "independent",
      allowsQuestionMutations: false,
      rawPageAssetIds: ["asset-source-1"]
    });
  });

  it("creates one uploaded lecture-archive document under a lecture-archive folder", () => {
    const baseFolders = buildInitialFolderTree();
    const subject = baseFolders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const archiveFolder = buildInitialExamLibraryFolders(baseFolders.concat(chapter, leaf)).find(
      (folder) => folder.role === "lecture_archive" && folder.parentId === `specialized--${leaf.id}`
    );

    expect(archiveFolder).toBeTruthy();

    const document = createLectureArchiveDocument({
      id: "lecture-archive-1",
      folder: archiveFolder!,
      fileName: "张三_高一_26_06_03.pdf",
      sourceAssetId: "asset-source-1",
      sourceUploadTaskId: "task-1"
    });

    expect(document).toMatchObject({
      id: "lecture-archive-1",
      folderId: archiveFolder!.id,
      library: archiveFolder!.library,
      kind: "lecture",
      lectureVariant: "archive",
      title: "张三_高一_26_06_03",
      sourceMode: "uploaded_pdf",
      syncBinding: "independent",
      syncStatus: "idle",
      rawPageAssetIds: ["asset-source-1"],
      allowsQuestionMutations: false,
      sourceUploadTaskId: "task-1"
    });
  });

  it("ensures missing system exam-library folders for new question folders while preserving custom full-library folders", () => {
    const baseFolders = buildInitialFolderTree();
    const subject = baseFolders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const existingExamFolders = buildInitialExamLibraryFolders(baseFolders).concat({
      id: "full-root--custom--folder-a",
      parentId: "full-root",
      name: "folder-a",
      library: "full",
      kind: "custom",
      subjectScope: null,
      depth: 1,
      path: ["套卷库", "folder-a"],
      linkedQuestionFolderId: null
    });

    const nextExamFolders = ensureExamLibraryFolders({
      questionFolders: baseFolders.concat(chapter, leaf),
      existingExamLibraryFolders: existingExamFolders
    });

    expect(nextExamFolders).not.toBe(existingExamFolders);
    expect(
      nextExamFolders.some(
        (folder) =>
          folder.library === "specialized" &&
          folder.kind === "system" &&
          folder.linkedQuestionFolderId === leaf.id
      )
    ).toBe(true);
    expect(
      nextExamFolders.some(
        (folder) =>
          folder.library === "full" &&
          folder.kind === "system" &&
          folder.linkedQuestionFolderId === chapter.id
      )
    ).toBe(true);
    expect(nextExamFolders.find((folder) => folder.id === "full-root--custom--folder-a")).toMatchObject({
      parentId: "full-root",
      kind: "custom"
    });
  });

  it("rebuilds safe defaults when old workspace snapshots have no existing exam-library folders", () => {
    const baseFolders = buildInitialFolderTree();

    const nextExamFolders = ensureExamLibraryFolders({
      questionFolders: baseFolders,
      existingExamLibraryFolders: undefined
    } as unknown as Parameters<typeof ensureExamLibraryFolders>[0]);

    expect(nextExamFolders).toEqual(buildInitialExamLibraryFolders(baseFolders));
    expect(nextExamFolders.some((folder) => folder.id === "specialized-root")).toBe(true);
    expect(nextExamFolders.some((folder) => folder.id === "full-root")).toBe(true);
  });

  it("adds one lecture-archive folder under every existing third-level specialized and full folder", () => {
    const baseFolders = buildInitialFolderTree();
    const subject = baseFolders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const existingExamFolders = buildInitialExamLibraryFolders(baseFolders.concat(chapter, leaf)).concat({
      id: "full-root--custom--folder-a",
      parentId: "full-root",
      name: "folder-a",
      library: "full",
      kind: "custom",
      subjectScope: null,
      depth: 1,
      path: ["\u5957\u5377\u5e93", "folder-a"],
      linkedQuestionFolderId: null
    }, {
      id: "full-root--custom--folder-a--custom--folder-b",
      parentId: "full-root--custom--folder-a",
      name: "folder-b",
      library: "full",
      kind: "custom",
      subjectScope: null,
      depth: 2,
      path: ["\u5957\u5377\u5e93", "folder-a", "folder-b"],
      linkedQuestionFolderId: null
    }, {
      id: "full-root--custom--folder-a--custom--folder-b--custom--folder-c",
      parentId: "full-root--custom--folder-a--custom--folder-b",
      name: "folder-c",
      library: "full",
      kind: "custom",
      subjectScope: null,
      depth: 3,
      path: ["\u5957\u5377\u5e93", "folder-a", "folder-b", "folder-c"],
      linkedQuestionFolderId: null
    });

    const nextExamFolders = ensureExamLibraryFolders({
      questionFolders: baseFolders.concat(chapter, leaf),
      existingExamLibraryFolders: existingExamFolders
    });

    expect(
      nextExamFolders.some(
        (folder) =>
          folder.parentId === `specialized--${leaf.id}` &&
          folder.name === "\u8bb2\u4e49\u5f52\u6863"
      )
    ).toBe(true);
    expect(
      nextExamFolders.some(
        (folder) =>
          folder.parentId === "full-root--custom--folder-a--custom--folder-b--custom--folder-c" &&
          folder.name === "\u8bb2\u4e49\u5f52\u6863"
      )
    ).toBe(true);
  });

  it("removes deleted mirrored folders and default specialized documents after a question-folder deletion", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);
    const specializedLeaf = examFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );

    expect(specializedLeaf).toBeTruthy();

    const result = syncExamLibraryForQuestionFolderDeletion({
      questionFolders: questionFolders.filter((folder) => folder.id !== leaf.id),
      existingExamLibraryFolders: examFolders,
      existingExamLibraryDocuments: createDefaultSpecializedDocuments({
        folder: specializedLeaf!,
        subjectScope: specializedLeaf!.subjectScope
      })
    });

    expect(
      result.examLibraryFolders.some(
        (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
      )
    ).toBe(false);
    expect(result.examLibraryDocuments).toEqual([]);
    expect(result.folderIdMap.has(`specialized--${leaf.id}`)).toBe(false);
  });

  it("ensures default specialized documents exist for every non-empty third-level folder", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);

    const documents = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 2
        },
        {
          id: "q-2",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 1
        }
      ],
      existingDocuments: []
    });

    expect(documents).toHaveLength(4);
    expect(documents.filter((document) => document.kind === "lecture")).toHaveLength(2);
    expect(documents.every((document) => document.folderId === `specialized--${leaf.id}`)).toBe(true);
    expect(documents.every((document) => document.questionIds.join(",") === "q-2,q-1")).toBe(true);
    expect(documents.find((document) => document.kind === "paper")?.questionBlocks).toEqual([
      {
        key: "uncategorized",
        label: "未分类",
        questionIds: ["q-2", "q-1"]
      }
    ]);
  });

  it("adds sync metadata to one primary lecture when creating specialized defaults from folder questions", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);

    const documents = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts: [
        {
          id: "q-2",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 2
        },
        {
          id: "q-1",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 1
        }
      ],
      existingDocuments: []
    });

    expect(
      documents.find(
        (document) => document.kind === "lecture" && document.lectureVariant === "primary"
      )
    ).toMatchObject({
      questionIds: ["q-1", "q-2"],
      syncMetadata: {
        version: 1,
        sourceDocumentId: `lecture-primary-specialized--${leaf.id}`,
        questionIds: ["q-1", "q-2"],
        blocks: [
          {
            blockId: "uncategorized",
            questionIds: ["q-1", "q-2"],
            exportOrder: 0,
            pageRange: {
              start: 1,
              end: 1
            },
            anchorBBox: {
              page: 1,
              x: 40,
              y: 40,
              width: 515,
              height: 160
            }
          }
        ]
      }
    });
  });

  it("does not duplicate existing default specialized documents", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );

    expect(targetFolder).toBeTruthy();

    const existingDocuments = createDefaultSpecializedDocuments({
      folder: targetFolder!,
      subjectScope: targetFolder!.subjectScope
    });
    const documents = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 1
        }
      ],
      existingDocuments
    });

    expect(documents).toHaveLength(4);
    expect(documents.map((document) => document.id)).toEqual(existingDocuments.map((document) => document.id));
    expect(documents.every((document) => document.questionIds.join(",") === "q-1")).toBe(true);
  });

  it("adds sync metadata during one initial sync on an existing default primary lecture", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );

    expect(targetFolder).toBeTruthy();

    const existingDocuments = createDefaultSpecializedDocuments({
      folder: targetFolder!,
      subjectScope: targetFolder!.subjectScope
    });
    const documents = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 1
        }
      ],
      existingDocuments
    });

    expect(
      documents.find(
        (document) => document.kind === "lecture" && document.lectureVariant === "primary"
      )
    ).toMatchObject({
      questionIds: ["q-1"],
      syncMetadata: {
        version: 1,
        sourceDocumentId: `lecture-primary-specialized--${leaf.id}`,
        questionIds: ["q-1"],
        blocks: [
          {
            blockId: "uncategorized",
            questionIds: ["q-1"],
            exportOrder: 0,
            pageRange: {
              start: 1,
              end: 1
            },
            anchorBBox: {
              page: 1,
              x: 40,
              y: 40,
              width: 515,
              height: 120
            }
          }
        ]
      }
    });
  });

  it("updates existing default specialized documents with the current folder question order", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );

    expect(targetFolder).toBeTruthy();

    const existingDocuments = createDefaultSpecializedDocuments({
      folder: targetFolder!,
      subjectScope: targetFolder!.subjectScope
    }).map((document) => ({
      ...document,
      questionIds: ["old-q"]
    }));

    const documents = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts: [
        {
          id: "q-2",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 2
        },
        {
          id: "q-1",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 1
        }
      ],
      existingDocuments
    });

    expect(documents).not.toBe(existingDocuments);
    expect(documents.every((document) => document.questionIds.join(",") === "old-q")).toBe(true);
    expect(documents.every((document) => document.syncStatus === "pending_confirmation")).toBe(true);
  });

  it("backfills current sync metadata for one primary lecture while pending specialized confirmation", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );

    expect(targetFolder).toBeTruthy();

    const existingDocuments = createDefaultSpecializedDocuments({
      folder: targetFolder!,
      subjectScope: targetFolder!.subjectScope
    }).map((document) =>
      document.kind === "lecture" && document.lectureVariant === "primary"
        ? {
            ...document,
            questionIds: ["old-q"]
          }
        : {
            ...document,
            questionIds: ["old-q"]
          }
    );

    const documents = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts: [
        {
          id: "q-2",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 2
        },
        {
          id: "q-1",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 1
        }
      ],
      existingDocuments
    });

    expect(
      documents.find(
        (document) => document.kind === "lecture" && document.lectureVariant === "primary"
      )
    ).toMatchObject({
      questionIds: ["old-q"],
      pendingQuestionIds: ["q-1", "q-2"],
      syncStatus: "pending_confirmation",
      syncMetadata: {
        version: 1,
        sourceDocumentId: `lecture-primary-specialized--${leaf.id}`,
        questionIds: ["old-q"],
        blocks: [
          {
            blockId: "old-q",
            questionIds: ["old-q"],
            exportOrder: 0,
            pageRange: {
              start: 1,
              end: 1
            },
            anchorBBox: {
              page: 1,
              x: 40,
              y: 40,
              width: 515,
              height: 120
            }
          }
        ]
      }
    });
  });

  it("stages specialized pending blocks with stable same-tag insertion inside one existing block", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );

    expect(targetFolder).toBeTruthy();

    const existingDocuments = createDefaultSpecializedDocuments({
      folder: targetFolder!,
      subjectScope: targetFolder!.subjectScope
    }).map((document) => ({
      ...document,
      questionIds: ["q-1", "q-2", "q-4"],
      questionBlocks: [
        {
          key: "牛顿定律".toLowerCase(),
          label: "牛顿定律",
          questionIds: ["q-1", "q-2"]
        },
        {
          key: "欧姆定律".toLowerCase(),
          label: "欧姆定律",
          questionIds: ["q-4"]
        }
      ]
    }));

    const documents = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 1,
          questionType: "选择题",
          chapterTag: "力学",
          knowledgeTags: ["牛顿定律"]
        },
        {
          id: "q-2",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 2,
          questionType: "证明题",
          chapterTag: "力学",
          knowledgeTags: ["牛顿定律"]
        },
        {
          id: "q-3",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 3,
          questionType: "简答题",
          chapterTag: "力学",
          knowledgeTags: ["牛顿定律"]
        },
        {
          id: "q-4",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 4,
          questionType: "填空题",
          chapterTag: "电学",
          knowledgeTags: ["欧姆定律"]
        }
      ],
      existingDocuments
    });

    expect(documents.find((document) => document.kind === "paper")).toMatchObject({
      syncStatus: "pending_confirmation",
      pendingQuestionIds: ["q-1", "q-3", "q-2", "q-4"],
      pendingQuestionBlocks: [
        {
          key: "牛顿定律".toLowerCase(),
          label: "牛顿定律",
          questionIds: ["q-1", "q-3", "q-2"]
        },
        {
          key: "欧姆定律".toLowerCase(),
          label: "欧姆定律",
          questionIds: ["q-4"]
        }
      ]
    });
  });

  it("keeps low-confidence specialized additions out of pending blocks and marks them for manual placement", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );

    expect(targetFolder).toBeTruthy();

    const existingDocuments = createDefaultSpecializedDocuments({
      folder: targetFolder!,
      subjectScope: targetFolder!.subjectScope
    }).map((document) => ({
      ...document,
      questionIds: ["q-1"],
      questionBlocks: [
        {
          key: "牛顿定律".toLowerCase(),
          label: "牛顿定律",
          questionIds: ["q-1"]
        }
      ]
    }));

    const documents = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 1,
          questionType: "选择题",
          chapterTag: "力学",
          knowledgeTags: ["牛顿定律"]
        },
        {
          id: "q-2",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 2,
          questionType: "选择题",
          chapterTag: "光学",
          knowledgeTags: ["凸透镜成像"]
        }
      ],
      existingDocuments
    });

    expect(documents.find((document) => document.kind === "paper")).toMatchObject({
      syncStatus: "pending_confirmation",
      pendingQuestionIds: ["q-1"],
      pendingQuestionBlocks: [
        {
          key: "牛顿定律".toLowerCase(),
          label: "牛顿定律",
          questionIds: ["q-1"]
        }
      ],
      pendingManualPlacementQuestionIds: ["q-2"]
    });
  });

  it("preserves a manually arranged pending specialized block during automatic reconciliation", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );

    expect(targetFolder).toBeTruthy();

    const existingDocuments = createDefaultSpecializedDocuments({
      folder: targetFolder!,
      subjectScope: targetFolder!.subjectScope
    }).map((document) => ({
      ...document,
      questionIds: ["q-1"],
      questionBlocks: [
        {
          key: "newton",
          label: "Newton",
          questionIds: ["q-1"]
        }
      ],
      syncStatus: "pending_confirmation" as const,
      pendingQuestionIds: ["q-1", "q-2"],
      pendingQuestionBlocks: [
        {
          key: "newton",
          label: "Newton",
          questionIds: ["q-1"]
        },
        {
          key: "manual-q-2",
          label: "Manual Q2",
          questionIds: ["q-2"]
        }
      ],
      pendingManualPlacementQuestionIds: []
    }));

    const documents = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 1,
          questionType: "选择题",
          chapterTag: "力学",
          knowledgeTags: ["牛顿定律"]
        },
        {
          id: "q-2",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 2,
          questionType: "选择题",
          chapterTag: "光学",
          knowledgeTags: ["凸透镜成像"]
        }
      ],
      existingDocuments
    });

    expect(documents.every((document) => document.pendingManualPlacementQuestionIds?.length === 0)).toBe(
      true
    );
    expect(documents.find((document) => document.kind === "paper")?.pendingQuestionBlocks).toEqual([
      {
        key: "newton",
        label: "Newton",
        questionIds: ["q-1"]
      },
      {
        key: "manual-q-2",
        label: "Manual Q2",
        questionIds: ["q-2"]
      }
    ]);
  });

  it("does not auto-place an unresolved pending question on a later reconciliation pass", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({ name: "chapter-a", parent: subject! });
    const leaf = createCustomFolder({ name: "topic-a", parent: chapter });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );

    expect(targetFolder).toBeTruthy();

    const questionDrafts = [
      {
        id: "q-1",
        documentId: "doc-1",
        directoryPath: leaf.path,
        globalOrder: 1,
        questionType: "选择题" as const,
        chapterTag: "chapter-a",
        knowledgeTags: ["tag-a"]
      },
      {
        id: "q-2",
        documentId: "doc-1",
        directoryPath: leaf.path,
        globalOrder: 2,
        questionType: "选择题" as const,
        chapterTag: "chapter-b",
        knowledgeTags: ["tag-b", "shared"]
      },
      {
        id: "q-3",
        documentId: "doc-1",
        directoryPath: leaf.path,
        globalOrder: 3,
        questionType: "选择题" as const,
        chapterTag: "chapter-a",
        knowledgeTags: ["tag-a", "shared"]
      }
    ];
    const currentDocuments = createDefaultSpecializedDocuments({
      folder: targetFolder!,
      subjectScope: targetFolder!.subjectScope
    }).map((document) => ({
      ...document,
      questionIds: ["q-1"],
      questionBlocks: [
        {
          key: "tag-a",
          label: "tag-a",
          questionIds: ["q-1"]
        }
      ]
    }));
    const firstPass = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts,
      existingDocuments: currentDocuments
    });

    expect(firstPass.find((document) => document.kind === "paper")).toMatchObject({
      pendingQuestionIds: ["q-1", "q-3"],
      pendingManualPlacementQuestionIds: ["q-2"]
    });

    const secondPass = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts,
      existingDocuments: firstPass
    });

    expect(secondPass.find((document) => document.kind === "paper")).toMatchObject({
      pendingQuestionIds: ["q-1", "q-3"],
      pendingQuestionBlocks: [
        {
          key: "tag-a",
          label: "tag-a",
          questionIds: ["q-1", "q-3"]
        }
      ],
      pendingManualPlacementQuestionIds: ["q-2"]
    });
  });

  it("stages one pending empty sync when a specialized folder no longer has any eligible questions", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );

    expect(targetFolder).toBeTruthy();

    const existingDocuments = createDefaultSpecializedDocuments({
      folder: targetFolder!,
      subjectScope: targetFolder!.subjectScope
    }).map((document) => ({
      ...document,
      questionIds: ["old-q"],
      placeholderAnswerPage: false
    }));

    const documents = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts: [],
      existingDocuments
    });

    expect(documents.find((document) => document.kind === "paper")).toMatchObject({
      questionIds: ["old-q"],
      syncStatus: "pending_confirmation",
      pendingQuestionIds: []
    });
    expect(documents.find((document) => document.kind === "lecture")).toMatchObject({
      questionIds: ["old-q"],
      syncStatus: "pending_confirmation",
      pendingQuestionIds: []
    });
    expect(documents.find((document) => document.kind === "answer_sheet")).toMatchObject({
      questionIds: ["old-q"],
      syncStatus: "pending_confirmation",
      pendingQuestionIds: [],
      placeholderAnswerPage: false,
      pendingPlaceholderAnswerPage: true
    });
  });

  it("marks the default specialized answer sheet as non-placeholder when folder questions already have answers", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examFolders.find(
      (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
    );

    expect(targetFolder).toBeTruthy();

    const documents = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          directoryPath: leaf.path,
          globalOrder: 1,
          answerAttachments: [
            {
              id: "answer-1",
              assetId: "asset-answer-1",
              kind: "matched"
            }
          ]
        }
      ],
      existingDocuments: createDefaultSpecializedDocuments({
        folder: targetFolder!,
        subjectScope: targetFolder!.subjectScope
      })
    });

    expect(documents.find((document) => document.kind === "answer_sheet")).toMatchObject({
      placeholderAnswerPage: true,
      syncStatus: "pending_confirmation"
    });
  });

  it("keeps specialized documents available while answer matching is pending", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.depth === 1 && folder.subjectScope);

    expect(subject).toBeTruthy();

    const chapter = createCustomFolder({
      name: "chapter-a",
      parent: subject!
    });
    const leaf = createCustomFolder({
      name: "topic-a",
      parent: chapter
    });
    const questionFolders = folders.concat(chapter, leaf);
    const examFolders = buildInitialExamLibraryFolders(questionFolders);

    const documents = ensureDefaultSpecializedDocuments({
      questionFolders,
      examLibraryFolders: examFolders,
      questionDrafts: [
        {
          id: "q-pending",
          directoryPath: leaf.path,
          documentId: "doc-pending",
          globalOrder: 1
        }
      ],
      existingDocuments: [],
      blockedDocumentIds: ["doc-pending"]
    });

    expect(documents).toHaveLength(4);
    expect(documents.every((document) => document.questionIds.includes("q-pending"))).toBe(true);
    expect(documents.find((document) => document.kind === "answer_sheet")).toMatchObject({
      placeholderAnswerPage: true
    });
  });

  it("deletes one custom full-library folder subtree together with its documents", () => {
    const examFolders = buildInitialExamLibraryFolders(buildInitialFolderTree());
    const fullRoot = examFolders.find((folder) => folder.id === "full-root");

    expect(fullRoot).toBeTruthy();

    const parent = {
      id: "full-root--custom--训练",
      parentId: "full-root",
      name: "训练",
      library: "full" as const,
      kind: "custom" as const,
      subjectScope: null,
      depth: 1,
      path: ["套卷库", "训练"],
      linkedQuestionFolderId: null
    };
    const child = {
      id: "full-root--custom--训练--custom--高频",
      parentId: parent.id,
      name: "高频",
      library: "full" as const,
      kind: "custom" as const,
      subjectScope: null,
      depth: 2,
      path: ["套卷库", "训练", "高频"],
      linkedQuestionFolderId: null
    };

    const result = deleteCustomFullLibraryFolder({
      folders: examFolders.concat(parent, child),
      documents: [
        {
          id: "paper-1",
          folderId: child.id,
          library: "full",
          kind: "paper",
          title: "paper one",
          subjectScope: null,
          groupId: "group-1",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "paper-2",
          folderId: fullRoot!.id,
          library: "full",
          kind: "paper",
          title: "paper two",
          subjectScope: null,
          groupId: "group-2",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      folderId: parent.id
    });

    expect(result).toMatchObject({
      deletedFolderIds: [parent.id, child.id],
      parentFolder: {
        id: fullRoot!.id
      }
    });
    expect(result?.folders.some((folder) => folder.id === parent.id || folder.id === child.id)).toBe(false);
    expect(result?.documents).toEqual([
      expect.objectContaining({
        id: "paper-2",
        folderId: fullRoot!.id
      })
    ]);
  });

  it("keeps one lecture-archive child as a system archive folder when renaming one custom full-library subtree", () => {
    const examFolders = buildInitialExamLibraryFolders(buildInitialFolderTree());
    const fullRoot = examFolders.find((folder) => folder.id === "full-root");

    expect(fullRoot).toBeTruthy();

    const level1 = {
      id: "full-root--custom--训练",
      parentId: "full-root",
      name: "训练",
      library: "full" as const,
      kind: "custom" as const,
      subjectScope: null,
      depth: 1,
      path: ["套卷库", "训练"],
      linkedQuestionFolderId: null
    };
    const level2 = {
      id: `${level1.id}--custom--高频`,
      parentId: level1.id,
      name: "高频",
      library: "full" as const,
      kind: "custom" as const,
      subjectScope: null,
      depth: 2,
      path: ["套卷库", "训练", "高频"],
      linkedQuestionFolderId: null
    };
    const level3 = {
      id: `${level2.id}--custom--A卷`,
      parentId: level2.id,
      name: "A卷",
      library: "full" as const,
      kind: "custom" as const,
      subjectScope: null,
      depth: 3,
      path: ["套卷库", "训练", "高频", "A卷"],
      linkedQuestionFolderId: null
    };
    const archiveFolder = {
      id: `${level3.id}--archive--lecture`,
      parentId: level3.id,
      name: "讲义归档",
      library: "full" as const,
      kind: "system" as const,
      role: "lecture_archive" as const,
      subjectScope: null,
      depth: 4,
      path: ["套卷库", "训练", "高频", "A卷", "讲义归档"],
      linkedQuestionFolderId: null
    };

    const result = renameCustomFullLibraryFolder({
      folders: examFolders.concat(level1, level2, level3, archiveFolder),
      documents: [
        {
          id: "archive-lecture-1",
          folderId: archiveFolder.id,
          library: "full",
          kind: "lecture",
          lectureVariant: "archive",
          title: "王明_高二_26_06_03",
          subjectScope: null,
          groupId: null,
          isDefault: false,
          sourceMode: "uploaded_pdf",
          syncBinding: "independent",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: [],
          rawPageAssetIds: ["asset-source-1"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: false,
          sourceUploadTaskId: "task-archive-1"
        }
      ],
      folderId: level1.id,
      nextName: "强化训练"
    });

    expect(result).not.toBeNull();

    const renamedLevel1 = result?.renamedFolder;
    const renamedLevel2 = result?.folders.find(
      (folder) => folder.name === "高频" && folder.parentId === renamedLevel1?.id
    );
    const renamedLevel3 = result?.folders.find(
      (folder) => folder.name === "A卷" && folder.parentId === renamedLevel2?.id
    );
    const renamedArchive = result?.folders.find(
      (folder) => folder.role === "lecture_archive" && folder.parentId === renamedLevel3?.id
    );

    expect(renamedArchive).toMatchObject({
      id: `${renamedLevel3?.id}--archive--lecture`,
      parentId: renamedLevel3?.id,
      kind: "system",
      role: "lecture_archive",
      path: ["套卷库", "强化训练", "高频", "A卷", "讲义归档"]
    });
    expect(result?.folderIdMap.get(archiveFolder.id)).toBe(`${renamedLevel3?.id}--archive--lecture`);
    expect(result?.documents).toEqual([
      expect.objectContaining({
        id: "archive-lecture-1",
        folderId: `${renamedLevel3?.id}--archive--lecture`
      })
    ]);
  });
});

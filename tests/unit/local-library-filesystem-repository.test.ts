import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LocalLibraryRevisionConflictError,
  LocalLibraryFilesystemRepository,
  type LocalLibrarySnapshot
} from "@/lib/server/local-library-filesystem-repository";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";

const temporaryDirectories: string[] = [];

async function createRepository() {
  const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-library-test-"));
  temporaryDirectories.push(directory);

  return {
    directory,
    repository: new LocalLibraryFilesystemRepository({ rootDirectory: directory })
  };
}

function buildSnapshot(questionText = "一枚小球做平抛运动"): LocalLibrarySnapshot {
  const folders = buildInitialFolderTree();
  const targetFolder = folders.find(
    (folder) => folder.path.join("/") === "我的题库/高中物理/曲线运动/平抛运动基础"
  );

  if (!targetFolder) {
    throw new Error("Expected fixture folder");
  }

  const examFolders = buildInitialExamLibraryFolders(folders);
  const examFolder = examFolders.find(
    (folder) => folder.linkedQuestionFolderId === targetFolder.id
  );

  if (!examFolder) {
    throw new Error("Expected fixture exam folder");
  }

  return {
    folders,
    pages: [
      {
        id: "page-1",
        documentId: "source-doc-1",
        pageNumber: 1,
        width: 1000,
        height: 1400,
        displayAssetId: "asset-page-1",
        analysisStatus: "done",
        reviewStatus: "reviewed"
      }
    ],
    binaryAssets: [
      {
        id: "asset-page-1",
        documentId: "source-doc-1",
        pageId: "page-1",
        kind: "display",
        mimeType: "image/png",
        byteLength: 12,
        dataUrl: "data:image/png;base64,aGVsbG8="
      }
    ],
    questionDrafts: [
      {
        id: "question-1",
        documentId: "source-doc-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 60, y: 80, width: 880, height: 320 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.98,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryMatchConfidence: 0.96,
        directoryPath: targetFolder.path,
        directoryCandidatePaths: [],
        questionNumberLabel: "1",
        ocrText: questionText,
        answerAttachments: [],
        lastBulkConfirmationId: null
      }
    ],
    examLibraryFolders: examFolders,
    examLibraryDocuments: [
      {
        id: "paper-1",
        folderId: examFolder.id,
        library: "specialized",
        kind: "paper",
        title: "平抛运动基础专题卷",
        subjectScope: "高中物理",
        groupId: "group-1",
        isDefault: true,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "resequence",
        questionIds: ["question-1"],
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        allowsQuestionMutations: true
      }
    ],
    examWorkspaceDraft: buildInitialExamWorkspaceDraft()
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("local library filesystem repository", () => {
  it("writes question, exam document and binary asset files and reads them after a new repository instance", async () => {
    const { directory, repository } = await createRepository();

    const saved = await repository.save({
      expectedRevision: 0,
      snapshot: buildSnapshot()
    });

    expect(saved.revision).toBe(1);
    expect(await readdir(path.join(directory, "questions"))).toHaveLength(1);
    expect(await readdir(path.join(directory, "exam-documents"))).toHaveLength(1);
    expect(await readdir(path.join(directory, "assets"))).toEqual([
      expect.stringMatching(/\.png$/)
    ]);

    const reloadedRepository = new LocalLibraryFilesystemRepository({
      rootDirectory: directory
    });
    const loaded = await reloadedRepository.load();

    expect(loaded.revision).toBe(1);
    expect(loaded.snapshot.questionDrafts).toEqual([
      expect.objectContaining({ id: "question-1", ocrText: "一枚小球做平抛运动" })
    ]);
    expect(loaded.snapshot.examLibraryDocuments).toEqual([
      expect.objectContaining({ id: "paper-1", questionIds: ["question-1"] })
    ]);
    expect(loaded.snapshot.binaryAssets).toEqual([
      expect.objectContaining({
        id: "asset-page-1",
        dataUrl: expect.stringMatching(/^\/api\/local-library\/asset\?id=/)
      })
    ]);

    const asset = await reloadedRepository.readAsset("asset-page-1");
    expect(asset?.mimeType).toBe("image/png");
    expect(asset?.data.toString("utf8")).toBe("hello");
  });

  it("rejects a stale writer without changing the latest catalog", async () => {
    const { directory, repository } = await createRepository();

    await repository.save({ expectedRevision: 0, snapshot: buildSnapshot("revision one") });
    await repository.save({ expectedRevision: 1, snapshot: buildSnapshot("revision two") });

    await expect(
      repository.save({ expectedRevision: 1, snapshot: buildSnapshot("stale overwrite") })
    ).rejects.toBeInstanceOf(LocalLibraryRevisionConflictError);

    const loaded = await repository.load();
    expect(loaded.revision).toBe(2);
    expect(loaded.snapshot.questionDrafts[0]?.ocrText).toBe("revision two");

    const catalog = JSON.parse(
      await readFile(path.join(directory, "catalog.json"), "utf8")
    ) as { revision: number };
    expect(catalog.revision).toBe(2);
  });

  it("keeps an existing asset file when a later snapshot references its local URL", async () => {
    const { repository } = await createRepository();
    const initialSnapshot = buildSnapshot();

    await repository.save({ expectedRevision: 0, snapshot: initialSnapshot });
    const loaded = await repository.load();
    const nextSnapshot = {
      ...loaded.snapshot,
      questionDrafts: loaded.snapshot.questionDrafts.map((question) => ({
        ...question,
        ocrText: "updated metadata"
      }))
    };

    await repository.save({ expectedRevision: 1, snapshot: nextSnapshot });

    const asset = await repository.readAsset("asset-page-1");
    expect(asset?.data.toString("utf8")).toBe("hello");
    expect((await repository.load()).snapshot.questionDrafts[0]?.ocrText).toBe(
      "updated metadata"
    );
  });

  it("persists a Blob-backed source asset without requiring a data URL", async () => {
    const { repository } = await createRepository();
    const snapshot = buildSnapshot();
    const sourceBytes = new Uint8Array([37, 80, 68, 70, 45, 49]);

    snapshot.binaryAssets.push({
      id: "asset-source-pdf",
      documentId: "source-doc-1",
      pageId: "source-doc-1",
      kind: "source",
      mimeType: "application/pdf",
      byteLength: sourceBytes.byteLength,
      blob: new Blob([sourceBytes], { type: "application/pdf" })
    });

    await repository.save({ expectedRevision: 0, snapshot });

    expect((await repository.readAsset("asset-source-pdf"))?.data).toEqual(
      Buffer.from(sourceBytes)
    );
    expect((await repository.load()).snapshot.binaryAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "asset-source-pdf",
          dataUrl: "/api/local-library/asset?id=asset-source-pdf"
        })
      ])
    );
  });

  it("rejects broken question and paper references before committing a new revision", async () => {
    const { repository } = await createRepository();
    const initialSnapshot = buildSnapshot();

    await repository.save({ expectedRevision: 0, snapshot: initialSnapshot });

    const brokenSnapshot = buildSnapshot("must not be committed");
    brokenSnapshot.questionDrafts[0].pageIds = ["missing-page"];
    brokenSnapshot.examLibraryDocuments[0].questionIds = ["missing-question"];

    await expect(
      repository.save({ expectedRevision: 1, snapshot: brokenSnapshot })
    ).rejects.toThrow(/missing-page|missing-question/);

    const loaded = await repository.load();
    expect(loaded.revision).toBe(1);
    expect(loaded.snapshot.questionDrafts[0]?.ocrText).toBe("一枚小球做平抛运动");
  });

  it("rejects missing preview and answer assets before committing", async () => {
    const { repository } = await createRepository();
    const snapshot = buildSnapshot();
    snapshot.pages[0].displayAssetId = "missing-display";
    snapshot.questionDrafts[0].answerAttachments = [
      {
        id: "answer-attachment-1",
        assetId: "missing-answer",
        kind: "matched"
      }
    ];

    await expect(
      repository.save({ expectedRevision: 0, snapshot })
    ).rejects.toThrow(/missing-display|missing-answer/);
    expect((await repository.load()).revision).toBe(0);
  });

  it("rejects a missing durable question crop before committing", async () => {
    const { repository } = await createRepository();
    const snapshot = buildSnapshot();
    snapshot.questionDrafts[0].questionImageAttachments = [
      {
        id: "question-image-1",
        assetId: "missing-question-crop",
        pageId: "page-1",
        pixelWidth: 2000,
        pixelHeight: 700,
        renderDpi: 300,
        version: 1
      }
    ];

    await expect(
      repository.save({ expectedRevision: 0, snapshot })
    ).rejects.toThrow(/missing-question-crop/);
    expect((await repository.load()).revision).toBe(0);
  });
});

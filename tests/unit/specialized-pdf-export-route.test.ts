import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET as exportSpecializedPdf } from "@/app/api/local-library/export-specialized-pdf/route";
import { LocalLibraryFilesystemRepository } from "@/lib/server/local-library-filesystem-repository";
import type { LocalLibrarySnapshot } from "@/lib/services/local-library-contract";

const temporaryDirectories: string[] = [];

async function seedLibrary() {
  const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-specialized-export-"));
  temporaryDirectories.push(directory);
  process.env.TEACHHELPER_LOCAL_LIBRARY_PATH = directory;
  const snapshot: LocalLibrarySnapshot = {
    folders: [],
    pages: [
      {
        id: "page-1",
        documentId: "source-1",
        pageNumber: 1,
        width: 1000,
        height: 1400,
        analysisStatus: "done",
        reviewStatus: "reviewed"
      }
    ],
    binaryAssets: [],
    questionDrafts: [
      {
        id: "question-1",
        documentId: "source-1",
        pageIds: ["page-1"],
        primaryPageId: "page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "page-1": { x: 80, y: 120, width: 840, height: 320 }
        },
        status: "reviewed",
        source: "ai",
        confidence: 0.98,
        crossPageGroupId: null,
        classificationStatus: "confirmed",
        directoryPath: ["我的题库", "高中物理", "静电场", "电场综合"],
        directoryCandidatePaths: [],
        questionNumberLabel: "31",
        ocrText: "带电粒子在复合电场中的运动"
      }
    ],
    examLibraryFolders: [],
    examLibraryDocuments: [
      {
        id: "paper-electrostatics",
        folderId: "specialized-electrostatics",
        library: "specialized",
        kind: "paper",
        title: "电场综合专题卷",
        subjectScope: "高中物理",
        groupId: "group-electrostatics",
        isDefault: true,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "resequence",
        questionIds: ["question-1"],
        rawPageAssetIds: [],
        placeholderAnswerPage: false,
        allowsQuestionMutations: true
      },
      {
        id: "answer-electrostatics",
        folderId: "specialized-electrostatics",
        library: "specialized",
        kind: "answer_sheet",
        title: "电场综合答案",
        subjectScope: "高中物理",
        groupId: "group-electrostatics",
        isDefault: true,
        sourceMode: "question_bank",
        syncBinding: "strong",
        syncStatus: "idle",
        numberingMode: "resequence",
        questionIds: ["question-1"],
        rawPageAssetIds: [],
        placeholderAnswerPage: true,
        allowsQuestionMutations: false
      }
    ],
    examWorkspaceDraft: {
      selectedLibrary: "specialized",
      selectedFolderId: null,
      selectedDocumentId: null
    }
  };

  await new LocalLibraryFilesystemRepository().save({ expectedRevision: 0, snapshot });
}

afterEach(async () => {
  delete process.env.TEACHHELPER_LOCAL_LIBRARY_PATH;
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("specialized PDF export route", () => {
  it("exports one specialized paper as a downloadable PDF", async () => {
    await seedLibrary();

    const response = await exportSpecializedPdf(
      new Request(
        "http://localhost/api/local-library/export-specialized-pdf?documentId=paper-electrostatics"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''%E7%94%B5%E5%9C%BA%E7%BB%BC%E5%90%88%E4%B8%93%E9%A2%98%E5%8D%B7_"
    );
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 8).toString("ascii")).toBe(
      "%PDF-1.4"
    );
  });

  it("does not export answer sheets or unknown document ids", async () => {
    await seedLibrary();

    const answerResponse = await exportSpecializedPdf(
      new Request(
        "http://localhost/api/local-library/export-specialized-pdf?documentId=answer-electrostatics"
      )
    );
    const missingResponse = await exportSpecializedPdf(
      new Request(
        "http://localhost/api/local-library/export-specialized-pdf?documentId=missing"
      )
    );

    expect(answerResponse.status).toBe(404);
    expect(missingResponse.status).toBe(404);
  });
});

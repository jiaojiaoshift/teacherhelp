import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET as getLocalLibrary, POST as saveLocalLibrary } from "@/app/api/local-library/route";
import { GET as getLocalLibraryAsset } from "@/app/api/local-library/asset/route";
import type { LocalLibrarySnapshot } from "@/lib/services/local-library-contract";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";

const temporaryDirectories: string[] = [];

async function useTemporaryLibrary() {
  const directory = await mkdtemp(path.join(tmpdir(), "teachhelper-library-route-test-"));
  temporaryDirectories.push(directory);
  process.env.TEACHHELPER_LOCAL_LIBRARY_PATH = directory;
  return directory;
}

function buildSnapshot(): LocalLibrarySnapshot {
  const folders = buildInitialFolderTree();

  return {
    folders,
    pages: [
      {
        id: "page-1",
        documentId: "doc-1",
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
        documentId: "doc-1",
        pageId: "page-1",
        kind: "display",
        mimeType: "image/png",
        byteLength: 5,
        dataUrl: "data:image/png;base64,aGVsbG8="
      }
    ],
    questionDrafts: [
      {
        id: "question-1",
        documentId: "doc-1",
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
        directoryPath: ["我的题库", "高中物理", "曲线运动", "平抛运动基础"],
        directoryCandidatePaths: [],
        ocrText: "平抛运动题",
        answerAttachments: [],
        lastBulkConfirmationId: null
      }
    ],
    examLibraryFolders: buildInitialExamLibraryFolders(folders),
    examLibraryDocuments: [],
    examWorkspaceDraft: buildInitialExamWorkspaceDraft()
  };
}

afterEach(async () => {
  delete process.env.TEACHHELPER_LOCAL_LIBRARY_PATH;
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("local library routes", () => {
  it("returns an empty revision zero library before the first save", async () => {
    await useTemporaryLibrary();

    const response = await getLocalLibrary();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      revision: 0,
      snapshot: {
        questionDrafts: [],
        examLibraryDocuments: [],
        binaryAssets: []
      }
    });
  });

  it("persists a snapshot as structured local files and returns it from a later GET", async () => {
    const directory = await useTemporaryLibrary();

    const saveResponse = await saveLocalLibrary(
      new Request("http://localhost/api/local-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: 0, snapshot: buildSnapshot() })
      })
    );

    expect(saveResponse.status).toBe(200);
    expect(await saveResponse.json()).toEqual({ revision: 1 });
    expect(await readdir(path.join(directory, "questions"))).toHaveLength(1);
    expect(await readdir(path.join(directory, "assets"))).toHaveLength(1);

    const loadResponse = await getLocalLibrary();
    const loaded = await loadResponse.json();
    expect(loaded.revision).toBe(1);
    expect(loaded.snapshot.questionDrafts).toEqual([
      expect.objectContaining({ id: "question-1", ocrText: "平抛运动题" })
    ]);
    expect(loaded.snapshot.binaryAssets).toEqual([
      expect.objectContaining({
        id: "asset-page-1",
        dataUrl: "/api/local-library/asset?id=asset-page-1"
      })
    ]);
  });

  it("returns 409 for a stale revision without overwriting the current library", async () => {
    await useTemporaryLibrary();
    const request = () =>
      new Request("http://localhost/api/local-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: 0, snapshot: buildSnapshot() })
      });

    expect((await saveLocalLibrary(request())).status).toBe(200);
    const staleResponse = await saveLocalLibrary(request());

    expect(staleResponse.status).toBe(409);
    expect(await staleResponse.json()).toEqual({
      error: "revision_conflict",
      actualRevision: 1
    });
    expect((await getLocalLibrary()).status).toBe(200);
  });

  it("serves only catalogued assets by id", async () => {
    await useTemporaryLibrary();
    await saveLocalLibrary(
      new Request("http://localhost/api/local-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: 0, snapshot: buildSnapshot() })
      })
    );

    const assetResponse = await getLocalLibraryAsset(
      new Request("http://localhost/api/local-library/asset?id=asset-page-1")
    );
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await assetResponse.arrayBuffer()).toString("utf8")).toBe("hello");

    const unknownResponse = await getLocalLibraryAsset(
      new Request("http://localhost/api/local-library/asset?id=..%2Fcatalog.json")
    );
    expect(unknownResponse.status).toBe(404);
  });

  it("accepts a Blob-backed source asset through multipart save", async () => {
    await useTemporaryLibrary();
    const snapshot = buildSnapshot();
    const sourceBytes = new TextEncoder().encode("%PDF-1");
    snapshot.binaryAssets.push({
      id: "asset-source-pdf",
      documentId: "doc-1",
      pageId: "doc-1",
      kind: "source",
      mimeType: "application/pdf",
      byteLength: sourceBytes.byteLength
    });
    const formData = new FormData();
    formData.append("expectedRevision", "0");
    formData.append("snapshot", JSON.stringify(snapshot));
    formData.append(
      "asset:asset-source-pdf",
      new Blob(["%PDF-1"], { type: "application/pdf" }),
      "source.pdf"
    );

    const response = await saveLocalLibrary({
      headers: new Headers({ "Content-Type": "multipart/form-data; boundary=test" }),
      formData: async () => formData
    } as unknown as Request);

    expect(response.status).toBe(200);
    const assetResponse = await getLocalLibraryAsset(
      new Request("http://localhost/api/local-library/asset?id=asset-source-pdf")
    );
    expect(assetResponse.status).toBe(200);
    expect(Buffer.from(await assetResponse.arrayBuffer())).toEqual(Buffer.from(sourceBytes));
  });

  it("rejects malformed save payloads", async () => {
    await useTemporaryLibrary();

    const response = await saveLocalLibrary(
      new Request("http://localhost/api/local-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: "zero", snapshot: {} })
      })
    );

    expect(response.status).toBe(400);
  });
});

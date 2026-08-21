import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getMobileUploadPrimaryLecture } from "@/app/api/mobile-upload/primary-lecture/route";
import {
  clearMobileUploadHelperStateForTests,
  getActiveMobileUploadPairingSession,
  getMobileUploadHelperWorkspaceSnapshot,
  setActiveMobileUploadPairingSession,
  setMobileUploadHelperWorkspaceSnapshot
} from "@/lib/server/mobile-upload-helper-state";
import {
  buildInitialExamLibraryFolders,
  createDefaultSpecializedDocuments
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree, createCustomFolder } from "@/lib/services/folder-service";

function createFixture() {
  const questionFolders = buildInitialFolderTree();
  const physics = questionFolders.find((folder) => folder.subjectScope === "高中物理");

  if (!physics) {
    throw new Error("missing physics root");
  }

  const chapter = createCustomFolder({
    name: "\u529b\u5b66",
    parent: physics
  });
  const topic = createCustomFolder({
    name: "\u725b\u987f\u5b9a\u5f8b",
    parent: chapter
  });
  const allQuestionFolders = questionFolders.concat(chapter, topic);
  const examLibraryFolders = buildInitialExamLibraryFolders(allQuestionFolders);
  const specializedTopic = examLibraryFolders.find(
    (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === topic.id
  );

  if (!specializedTopic) {
    throw new Error("missing specialized topic");
  }

  const examLibraryDocuments = createDefaultSpecializedDocuments({
    folder: specializedTopic,
    subjectScope: specializedTopic.subjectScope
  });
  const primaryLecture = examLibraryDocuments.find(
    (document) => document.kind === "lecture" && document.lectureVariant === "primary"
  );

  if (!primaryLecture) {
    throw new Error("missing primary lecture");
  }

  return {
    questionFolders: allQuestionFolders,
    examLibraryFolders,
    examLibraryDocuments,
    primaryLecture
  };
}

function createPairingSession(overrides?: Partial<ReturnType<typeof getActiveMobileUploadPairingSession>>) {
  return {
    id: "pairing-session-1",
    helperBaseUrl: "http://localhost:3000",
    pairingCode: "834271",
    qrPayload:
      '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://localhost:3000","pairingSessionId":"pairing-session-1","pairingCode":"834271"}',
    createdAt: "2026-06-03T11:55:00.000Z",
    expiresAt: "2026-06-03T12:15:00.000Z",
    pairedDeviceIds: [],
    ...overrides
  };
}

describe("mobile upload primary lecture route", () => {
  afterEach(() => {
    clearMobileUploadHelperStateForTests();
    vi.useRealTimers();
  });

  it("downloads one current primary lecture pdf for one valid paired session and stores its exported snapshot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-03T12:00:00.000Z"));

    const fixture = createFixture();

    setActiveMobileUploadPairingSession(
      createPairingSession({
        expiresAt: "2026-06-03T12:15:00.000Z"
      })
    );
    setMobileUploadHelperWorkspaceSnapshot({
      questionFolders: fixture.questionFolders,
      examLibraryFolders: fixture.examLibraryFolders,
      examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
        document.id === fixture.primaryLecture.id
          ? {
              ...document,
              questionIds: ["q-1"],
              pendingQuestionIds: ["q-1", "q-2"],
              pendingQuestionBlocks: [
                {
                  key: "block-a",
                  label: "Block A",
                  questionIds: ["q-1", "q-2"]
                }
              ],
              syncStatus: "pending_confirmation"
            }
          : document
      ),
      questionDrafts: [
        {
          id: "q-1",
          questionNumberLabel: "3",
          ocrText: "question one"
        },
        {
          id: "q-2",
          questionNumberLabel: "4",
          ocrText: "question two"
        }
      ]
    });

    const response = await getMobileUploadPrimaryLecture(
      new Request(
        `http://localhost:3000/api/mobile-upload/primary-lecture?documentId=${encodeURIComponent(fixture.primaryLecture.id)}&pairedSessionId=pairing-session-1&deviceId=android-a`
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("content-disposition")).toContain('filename="primary-lecture.pdf"');
    expect(response.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''%E7%89%9B%E9%A1%BF%E5%AE%9A%E5%BE%8B%E4%B8%BB%E8%AE%B2%E4%B9%89_2026-06-03.pdf"
    );
    expect((await response.blob()).size).toBeGreaterThan(0);
    expect(getActiveMobileUploadPairingSession()?.pairedDeviceIds).toEqual(["android-a"]);
    expect(
      getMobileUploadHelperWorkspaceSnapshot()?.examLibraryDocuments.find(
        (document) => document.id === fixture.primaryLecture.id
      )
    ).toMatchObject({
      lastExportedSyncMetadata: {
        questionIds: ["q-1", "q-2"]
      }
    });
  });

  it("rejects one primary lecture download when the pairing session is invalid", async () => {
    const response = await getMobileUploadPrimaryLecture(
      new Request(
        "http://localhost:3000/api/mobile-upload/primary-lecture?documentId=lecture-primary-1&pairedSessionId=missing&deviceId=android-a"
      )
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u914d\u5bf9\u4f1a\u8bdd\u65e0\u6548"
    });
  });

  it("rejects one primary lecture download when device id is missing and leaves the pairing session untouched", async () => {
    const fixture = createFixture();

    setActiveMobileUploadPairingSession(createPairingSession());
    setMobileUploadHelperWorkspaceSnapshot({
      questionFolders: fixture.questionFolders,
      examLibraryFolders: fixture.examLibraryFolders,
      examLibraryDocuments: fixture.examLibraryDocuments,
      questionDrafts: []
    });

    const response = await getMobileUploadPrimaryLecture(
      new Request(
        `http://localhost:3000/api/mobile-upload/primary-lecture?documentId=${encodeURIComponent(fixture.primaryLecture.id)}&pairedSessionId=pairing-session-1`
      )
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u8bbe\u5907\u6807\u8bc6\u65e0\u6548"
    });
    expect(getActiveMobileUploadPairingSession()?.pairedDeviceIds).toEqual([]);
  });

  it("registers one paired device even when the helper workspace snapshot is missing", async () => {
    setActiveMobileUploadPairingSession(
      createPairingSession({
        expiresAt: "2099-06-03T12:15:00.000Z"
      })
    );

    const response = await getMobileUploadPrimaryLecture(
      new Request(
        "http://localhost:3000/api/mobile-upload/primary-lecture?documentId=lecture-primary-1&pairedSessionId=pairing-session-1&deviceId=android-missing-workspace"
      )
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u4e3b\u8bb2\u4e49\u6587\u6863\u4e0d\u5b58\u5728"
    });
    expect(getActiveMobileUploadPairingSession()?.pairedDeviceIds).toEqual([
      "android-missing-workspace"
    ]);
  });

  it("registers one paired device even when the requested primary lecture document is missing", async () => {
    const fixture = createFixture();

    setActiveMobileUploadPairingSession(
      createPairingSession({
        expiresAt: "2099-06-03T12:15:00.000Z"
      })
    );
    setMobileUploadHelperWorkspaceSnapshot({
      questionFolders: fixture.questionFolders,
      examLibraryFolders: fixture.examLibraryFolders,
      examLibraryDocuments: fixture.examLibraryDocuments,
      questionDrafts: []
    });

    const response = await getMobileUploadPrimaryLecture(
      new Request(
        "http://localhost:3000/api/mobile-upload/primary-lecture?documentId=missing&pairedSessionId=pairing-session-1&deviceId=android-missing-document"
      )
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u4e3b\u8bb2\u4e49\u6587\u6863\u4e0d\u5b58\u5728"
    });
    expect(getActiveMobileUploadPairingSession()?.pairedDeviceIds).toEqual([
      "android-missing-document"
    ]);
  });
});

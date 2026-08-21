import { describe, expect, it } from "vitest";

import {
  buildPrimaryLectureDownloadUrl,
  buildWorkspaceTargetNodesUrl,
  resolveUploadRequestFileName
} from "@/android-app/src/services/mobile-upload-api";
import { uploadMobilePdf } from "@/android-app/src/services/mobile-upload-api";
import { MAX_UPLOAD_FILE_BYTES } from "@/android-app/src/domain/upload-capacity";

describe("android mobile upload app service helpers", () => {
  it("builds one workspace-target url using the selected upload kind", () => {
    expect(
      buildWorkspaceTargetNodesUrl({
        helperBaseUrl: "http://192.168.1.8:3000/",
        uploadKind: "lecture_archive_pdf"
      })
    ).toBe(
      "http://192.168.1.8:3000/api/mobile-upload/workspace-sync?uploadKind=lecture_archive_pdf"
    );
  });

  it("builds one primary-lecture download url with encoded query parameters", () => {
    expect(
      buildPrimaryLectureDownloadUrl({
        helperBaseUrl: "http://192.168.1.8:3000",
        documentId: "lecture primary/1",
        pairedSessionId: "pairing session/1",
        deviceId: "android device/1"
      })
    ).toBe(
      "http://192.168.1.8:3000/api/mobile-upload/primary-lecture?documentId=lecture+primary%2F1&pairedSessionId=pairing+session%2F1&deviceId=android+device%2F1"
    );
  });

  it("resolves one lecture-archive upload file name from the validated naming draft", () => {
    expect(
      resolveUploadRequestFileName({
        uploadKind: "lecture_archive_pdf",
        selectedFileName: "camera.pdf",
        lectureArchiveDraft: {
          studentName: "王明",
          gradeLabel: "高二",
          year: "26",
          month: "06",
          day: "04"
        }
      })
    ).toBe("王明_高二_26_06_04.pdf");
  });

  it("keeps the selected file name for non-archive uploads", () => {
    expect(
      resolveUploadRequestFileName({
        uploadKind: "question_bank_pdf",
        selectedFileName: "functions.pdf",
        lectureArchiveDraft: null
      })
    ).toBe("functions.pdf");
  });

  it("rejects an oversized mobile file before building the network request", async () => {
    const fetchSpy = async () => {
      throw new Error("network should not be called");
    };
    const oversized = new Blob(["pdf"]);

    Object.defineProperty(oversized, "size", {
      configurable: true,
      value: MAX_UPLOAD_FILE_BYTES + 1
    });

    await expect(
      uploadMobilePdf({
        pairing: {
          type: "teachhelper_mobile_upload_pairing",
          helperBaseUrl: "http://localhost:3000",
          pairingSessionId: "pairing-1",
          pairingCode: "123456"
        },
        deviceId: "android-1",
        uploadKind: "question_bank_pdf",
        targetNode: {
          id: "folder-1",
          name: "物理",
          path: ["题库", "物理"],
          targetKind: "question_folder"
        },
        fileName: "large.pdf",
        fileBlob: oversized,
        fetchImpl: fetchSpy as typeof fetch
      })
    ).rejects.toMatchObject({
      status: 413
    });
  });
});

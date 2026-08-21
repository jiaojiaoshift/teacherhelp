import { describe, expect, it } from "vitest";

import {
  resolveVisibleMobileUploadHelperReadiness,
  summarizeMobileUploadHelperReadiness
} from "@/lib/services/mobile-upload-helper-readiness-service";

describe("mobile-upload-helper-readiness-service", () => {
  it("returns one idle helper state when no pairing session or workspace snapshot exists", () => {
    expect(
      summarizeMobileUploadHelperReadiness({
        activePairingSession: null,
        workspaceSnapshot: null
      })
    ).toEqual({
      receiverReadiness: "idle",
      workspaceSnapshotReady: false,
      hasActivePairingSession: false
    });
  });

  it("returns one awaiting-workspace helper state when one pairing session exists before the workspace sync arrives", () => {
    expect(
      summarizeMobileUploadHelperReadiness({
        activePairingSession: {
          id: "pairing-session-1",
          helperBaseUrl: "http://localhost:3000",
          pairingCode: "834271",
          qrPayload:
            '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://localhost:3000","pairingSessionId":"pairing-session-1","pairingCode":"834271"}',
          createdAt: "2026-06-04T08:00:00.000Z",
          expiresAt: "2099-06-04T08:15:00.000Z",
          pairedDeviceIds: []
        },
        workspaceSnapshot: null
      })
    ).toEqual({
      receiverReadiness: "awaiting_workspace",
      workspaceSnapshotReady: false,
      hasActivePairingSession: true
    });
  });

  it("returns one ready helper state when one synced workspace snapshot already exists", () => {
    expect(
      summarizeMobileUploadHelperReadiness({
        activePairingSession: null,
        workspaceSnapshot: {
          questionFolders: [],
          examLibraryFolders: [],
          examLibraryDocuments: [],
          mobileUploadTasks: []
        }
      })
    ).toEqual({
      receiverReadiness: "ready",
      workspaceSnapshotReady: true,
      hasActivePairingSession: false
    });
  });

  it("does not infer one ready helper state from local upload tasks alone", () => {
    expect(
      resolveVisibleMobileUploadHelperReadiness({
        reportedReadiness: null,
        activePairingSession: null,
        mobileUploadTasks: [
          {
            id: "task-1",
            deviceId: "android-a",
            uploadKind: "lecture_archive_pdf",
            targetNodeId: "archive-folder-1",
            targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
            originalFileName: "camera-scan.pdf",
            normalizedFileName: "王明_高二_26_06_03.pdf",
            mimeType: "application/pdf",
            status: "completed",
            createdAt: "2026-06-03T12:08:00.000Z",
            errorMessage: null
          }
        ]
      })
    ).toEqual({
      receiverReadiness: "idle",
      workspaceSnapshotReady: false,
      hasActivePairingSession: false
    });
  });

  it("treats one expired pairing session as inactive for helper readiness", () => {
    expect(
      summarizeMobileUploadHelperReadiness({
        activePairingSession: {
          id: "pairing-session-expired",
          helperBaseUrl: "http://localhost:3000",
          pairingCode: "834271",
          qrPayload:
            '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://localhost:3000","pairingSessionId":"pairing-session-expired","pairingCode":"834271"}',
          createdAt: "2026-06-04T08:00:00.000Z",
          expiresAt: "2000-06-04T08:15:00.000Z",
          pairedDeviceIds: ["android-a"]
        },
        workspaceSnapshot: null
      })
    ).toEqual({
      receiverReadiness: "idle",
      workspaceSnapshotReady: false,
      hasActivePairingSession: false
    });
  });

  it("does not keep one stale active helper readiness when the local pairing session is already expired", () => {
    expect(
      resolveVisibleMobileUploadHelperReadiness({
        reportedReadiness: {
          receiverReadiness: "awaiting_workspace",
          workspaceSnapshotReady: false,
          hasActivePairingSession: true
        },
        activePairingSession: {
          id: "pairing-session-expired",
          helperBaseUrl: "http://localhost:3000",
          pairingCode: "834271",
          qrPayload:
            '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://localhost:3000","pairingSessionId":"pairing-session-expired","pairingCode":"834271"}',
          createdAt: "2026-06-04T08:00:00.000Z",
          expiresAt: "2000-06-04T08:15:00.000Z",
          pairedDeviceIds: ["android-a"]
        },
        mobileUploadTasks: []
      })
    ).toEqual({
      receiverReadiness: "idle",
      workspaceSnapshotReady: false,
      hasActivePairingSession: false
    });
  });
});

import { describe, expect, it } from "vitest";

import type { MobileUploadTaskEntity } from "@/lib/domain/entities";
import { summarizeMobileUploadReceiverStatus } from "@/lib/services/mobile-upload-receiver-status-service";

function createTask(
  overrides: Partial<MobileUploadTaskEntity> &
    Pick<MobileUploadTaskEntity, "id" | "uploadKind" | "targetNodeId" | "targetNodePath" | "status">
): MobileUploadTaskEntity {
  return {
    deviceId: "android-a",
    originalFileName: "source.pdf",
    normalizedFileName: "source.pdf",
    mimeType: "application/pdf",
    createdAt: "2026-06-03T10:30:00.000Z",
    errorMessage: null,
    ...overrides
  };
}

describe("mobile-upload-receiver-status-service", () => {
  it("returns one idle receiver summary when no mobile upload tasks exist", () => {
    expect(summarizeMobileUploadReceiverStatus([])).toEqual({
      receiverState: "idle",
      pairedDeviceCount: 0,
      activeTaskCount: 0,
      failedTaskCount: 0,
      latestReceivedAt: null,
      latestTaskFileName: null,
      latestDeviceId: null
    });
  });

  it("counts paired devices from one active pairing session even before any upload arrives", () => {
    expect(summarizeMobileUploadReceiverStatus([], ["android-a", "android-b"])).toEqual({
      receiverState: "idle",
      pairedDeviceCount: 2,
      activeTaskCount: 0,
      failedTaskCount: 0,
      latestReceivedAt: null,
      latestTaskFileName: null,
      latestDeviceId: null
    });
  });

  it("does not infer paired devices from historical upload tasks when no active pairing session exists", () => {
    expect(
      summarizeMobileUploadReceiverStatus([
        createTask({
          id: "task-processing",
          deviceId: "android-b",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          normalizedFileName: "牛顿定律主讲义.pdf",
          status: "processing",
          createdAt: "2026-06-03T10:30:00.000Z"
        }),
        createTask({
          id: "task-completed",
          deviceId: "android-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "archive-folder-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          normalizedFileName: "王明_高二_26_06_03.pdf",
          status: "completed",
          createdAt: "2026-06-03T08:00:00.000Z"
        })
      ])
    ).toEqual({
      receiverState: "receiving",
      pairedDeviceCount: 0,
      activeTaskCount: 1,
      failedTaskCount: 0,
      latestReceivedAt: "2026-06-03T10:30:00.000Z",
      latestTaskFileName: "牛顿定律主讲义.pdf",
      latestDeviceId: "android-b"
    });
  });

  it("returns one receiving receiver summary from active tasks while preserving one active pairing-session count", () => {
    expect(
      summarizeMobileUploadReceiverStatus([
        createTask({
          id: "task-stored",
          deviceId: "android-a",
          uploadKind: "question_bank_pdf",
          targetNodeId: "folder-math-1",
          targetNodePath: ["我的题库", "高中数学", "函数"],
          normalizedFileName: "functions.pdf",
          status: "stored",
          createdAt: "2026-06-03T09:00:00.000Z"
        }),
        createTask({
          id: "task-processing",
          deviceId: "android-b",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          normalizedFileName: "牛顿定律主讲义.pdf",
          status: "processing",
          createdAt: "2026-06-03T10:30:00.000Z"
        }),
        createTask({
          id: "task-completed",
          deviceId: "android-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "archive-folder-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          normalizedFileName: "王明_高二_26_06_03.pdf",
          status: "completed",
          createdAt: "2026-06-03T08:00:00.000Z"
        })
      ], ["android-a", "android-b"])
    ).toEqual({
      receiverState: "receiving",
      pairedDeviceCount: 2,
      activeTaskCount: 2,
      failedTaskCount: 0,
      latestReceivedAt: "2026-06-03T10:30:00.000Z",
      latestTaskFileName: "牛顿定律主讲义.pdf",
      latestDeviceId: "android-b"
    });
  });

  it("returns one attention receiver summary when any failed mobile upload exists", () => {
    expect(
      summarizeMobileUploadReceiverStatus([
        createTask({
          id: "task-queued",
          deviceId: "android-a",
          uploadKind: "full_paper_pdf",
          targetNodeId: "full-folder-1",
          targetNodePath: ["套卷库", "牛顿定律套卷"],
          normalizedFileName: "牛顿定律套卷.pdf",
          status: "queued",
          createdAt: "2026-06-03T10:00:00.000Z"
        }),
        createTask({
          id: "task-failed",
          deviceId: "android-c",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          normalizedFileName: "牛顿定律主讲义.pdf",
          status: "failed",
          createdAt: "2026-06-03T11:00:00.000Z",
          errorMessage: "主讲义同步信息与当前题块结构冲突"
        })
      ], ["android-a", "android-c"])
    ).toEqual({
      receiverState: "attention",
      pairedDeviceCount: 2,
      activeTaskCount: 1,
      failedTaskCount: 1,
      latestReceivedAt: "2026-06-03T11:00:00.000Z",
      latestTaskFileName: "牛顿定律主讲义.pdf",
      latestDeviceId: "android-c"
    });
  });

  it("counts one helper backlog lecture replay as one active handoff even after the task itself is completed", () => {
    expect(
      summarizeMobileUploadReceiverStatus(
        [
          createTask({
            id: "task-primary-completed",
            deviceId: "android-b",
            uploadKind: "primary_lecture_pdf",
            targetNodeId: "lecture-primary-1",
            targetNodePath: ["Specialized Library", "Physics", "Mechanics", "Newton"],
            normalizedFileName: "newton_primary_lecture.pdf",
            status: "completed",
            createdAt: "2026-06-03T10:30:00.000Z"
          })
        ],
        [],
        ["task-primary-completed"]
      )
    ).toEqual({
      receiverState: "receiving",
      pairedDeviceCount: 0,
      activeTaskCount: 1,
      failedTaskCount: 0,
      latestReceivedAt: "2026-06-03T10:30:00.000Z",
      latestTaskFileName: "newton_primary_lecture.pdf",
      latestDeviceId: "android-b"
    });
  });
});

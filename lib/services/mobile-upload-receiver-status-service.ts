import type { MobileUploadTaskEntity } from "@/lib/domain/entities";

export interface MobileUploadReceiverStatusSummary {
  receiverState: "idle" | "receiving" | "attention";
  pairedDeviceCount: number;
  activeTaskCount: number;
  failedTaskCount: number;
  latestReceivedAt: string | null;
  latestTaskFileName: string | null;
  latestDeviceId: string | null;
}

function isActiveTaskStatus(status: MobileUploadTaskEntity["status"]) {
  return (
    status === "received" ||
    status === "stored" ||
    status === "queued" ||
    status === "processing"
  );
}

export function summarizeMobileUploadReceiverStatus(
  tasks: MobileUploadTaskEntity[],
  pairedDeviceIds: string[] = [],
  helperBacklogTaskIds: string[] = []
): MobileUploadReceiverStatusSummary {
  const pairedDeviceCount = new Set(pairedDeviceIds).size;

  const activeTaskCount = new Set([
    ...tasks.filter((task) => isActiveTaskStatus(task.status)).map((task) => task.id),
    ...helperBacklogTaskIds
  ]).size;

  if (tasks.length === 0 && activeTaskCount === 0) {
    return {
      receiverState: "idle",
      pairedDeviceCount,
      activeTaskCount: 0,
      failedTaskCount: 0,
      latestReceivedAt: null,
      latestTaskFileName: null,
      latestDeviceId: null
    };
  }
  const failedTaskCount = tasks.filter((task) => task.status === "failed").length;
  const latestTask = tasks
    .slice()
    .sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )[0];

  return {
    receiverState:
      failedTaskCount > 0 ? "attention" : activeTaskCount > 0 ? "receiving" : "idle",
    pairedDeviceCount,
    activeTaskCount,
    failedTaskCount,
    latestReceivedAt: latestTask?.createdAt ?? null,
    latestTaskFileName: latestTask?.normalizedFileName ?? null,
    latestDeviceId: latestTask?.deviceId ?? null
  };
}

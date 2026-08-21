import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentTaskCenter } from "@/components/workbench/document-task-center";
import { pauseDocumentTaskExecution } from "@/lib/services/document-task-controller";
import { createDocumentProcessingTask } from "@/lib/services/document-task-service";
import {
  INITIAL_DOCUMENT_PROCESSING_PROGRESS,
  useWorkbenchStore
} from "@/lib/stores/workbench-store";

vi.mock("@/lib/services/document-task-controller", () => ({
  cancelDocumentTaskExecution: vi.fn(),
  pauseDocumentTaskExecution: vi.fn(),
  resumeDocumentTaskExecution: vi.fn()
}));

describe("document task center", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkbenchStore.getState().hydrateDocumentTasks([]);
    useWorkbenchStore.setState({
      documentProcessingProgress: INITIAL_DOCUMENT_PROCESSING_PROGRESS,
      documentProcessingRetry: null
    });
  });

  it("uses the runtime controller by default", () => {
    const task = {
      ...createDocumentProcessingTask({
        id: "task-default-controller",
        runId: "run-default-controller",
        documentId: "doc-default-controller",
        documentName: "默认控制器.pdf"
      }),
      status: "running" as const
    };
    useWorkbenchStore.getState().enqueueDocumentTask(task);
    useWorkbenchStore.getState().updateDocumentTaskStatus(
      task.id,
      task.runId,
      "running"
    );

    render(<DocumentTaskCenter />);
    fireEvent.click(screen.getByRole("button", { name: "暂停任务" }));

    expect(pauseDocumentTaskExecution).toHaveBeenCalledWith(task.id);
  });

  it("shows the active file and exposes pause and confirmed cancel controls", () => {
    const pause = vi.fn();
    const cancel = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const task = {
      ...createDocumentProcessingTask({
        id: "task-running",
        runId: "run-running",
        documentId: "doc-running",
        documentName: "总综合题目.pdf"
      }),
      status: "running" as const
    };

    useWorkbenchStore.getState().enqueueDocumentTask(task);
    useWorkbenchStore.getState().updateDocumentTaskStatus(
      task.id,
      task.runId,
      "running"
    );

    render(<DocumentTaskCenter onCancel={cancel} onPause={pause} />);

    expect(screen.getByText("总综合题目.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "暂停任务" }));
    expect(pause).toHaveBeenCalledWith("task-running");

    fireEvent.click(screen.getByRole("button", { name: "取消任务" }));
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith("task-running");
  });

  it("resumes a paused task from its saved checkpoint", () => {
    const resume = vi.fn();
    const task = {
      ...createDocumentProcessingTask({
        id: "task-paused",
        runId: "run-paused",
        documentId: "doc-paused",
        documentName: "暂停文件.pdf"
      }),
      status: "paused" as const
    };
    useWorkbenchStore.getState().enqueueDocumentTask(task);

    render(<DocumentTaskCenter onResume={resume} />);

    fireEvent.click(screen.getByRole("button", { name: "继续任务" }));
    expect(resume).toHaveBeenCalledWith("task-paused");
  });

  it("lets the user inspect another file in the document queue", () => {
    const firstTask = createDocumentProcessingTask({
      id: "task-first",
      runId: "run-first",
      documentId: "doc-first",
      documentName: "第一份.pdf",
      createdAt: "2026-08-17T08:00:00.000Z"
    });
    const secondTask = createDocumentProcessingTask({
      id: "task-second",
      runId: "run-second",
      documentId: "doc-second",
      documentName: "第二份.pdf",
      createdAt: "2026-08-17T08:01:00.000Z"
    });
    useWorkbenchStore.getState().enqueueDocumentTask(firstTask);
    useWorkbenchStore.getState().enqueueDocumentTask(secondTask);

    render(<DocumentTaskCenter />);

    fireEvent.click(screen.getByRole("button", { name: "查看任务-第一份.pdf" }));
    expect(useWorkbenchStore.getState().activeDocumentTaskId).toBe("task-first");
    expect(screen.getByText("第一份.pdf", { selector: "div" })).toBeInTheDocument();
  });

  it("shows OCR progress in a fixed bottom-right task panel", () => {
    useWorkbenchStore.getState().setDocumentProcessingProgress({
      status: "running",
      stage: "ocr",
      current: 5,
      total: 12,
      message: "正在 OCR 全文并提取原题号",
      summary: null
    });

    render(<DocumentTaskCenter />);

    const panel = screen.getByLabelText("document-processing-task-center");
    expect(panel).toHaveClass("fixed", "bottom-4", "right-4");
    expect(screen.getByText("正在 OCR 全文并提取原题号")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "document-processing-progress" })).toHaveAttribute(
      "aria-valuenow",
      "5"
    );
    expect(screen.getByText("5 / 12")).toBeInTheDocument();
  });

  it("shows the final workflow counts", () => {
    useWorkbenchStore.getState().setDocumentProcessingProgress({
      status: "done",
      stage: "done",
      current: 1,
      total: 1,
      message: "整卷处理完成",
      summary: {
        questionCount: 24,
        crossPageMergeCount: 2,
        classifiedQuestionCount: 24,
        autoMatchedAnswerCount: 20,
        pendingAnswerCount: 4,
        specializedDocumentCount: 4
      }
    });

    render(<DocumentTaskCenter />);

    expect(screen.getByText("跨页合并 2")).toBeInTheDocument();
    expect(screen.getByText("答案自动匹配 20")).toBeInTheDocument();
    expect(screen.getByText("待复核 4")).toBeInTheDocument();
    expect(screen.getByText("专题文档 4")).toBeInTheDocument();
  });

  it("retries the failed document workflow from the task center", () => {
    const retry = vi.fn();

    useWorkbenchStore.getState().setDocumentProcessingRetry(retry);
    useWorkbenchStore.getState().setDocumentProcessingProgress({
      status: "failed",
      stage: "ocr",
      current: 3,
      total: 12,
      message: "OCR 请求失败",
      summary: null
    });

    render(<DocumentTaskCenter />);

    fireEvent.click(screen.getByRole("button", { name: "重试整卷处理" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });
});

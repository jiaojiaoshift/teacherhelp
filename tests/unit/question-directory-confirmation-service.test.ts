import { describe, expect, it, vi } from "vitest";

import {
  confirmQuestionDirectoryMove,
  QUESTION_DIRECTORY_MOVE_CONFIRM_MESSAGE,
  QUESTION_DIRECTORY_MOVE_SECOND_CONFIRM_MESSAGE,
  requiresQuestionDirectoryMoveConfirmation
} from "@/lib/services/question-directory-confirmation-service";

describe("question-directory-confirmation-service", () => {
  it("does not require confirmation when the current question is not inside a third-level folder", () => {
    expect(
      requiresQuestionDirectoryMoveConfirmation({
        currentPath: ["我的题库", "高中物理", "待定区"],
        nextPath: ["我的题库", "高中物理", "力学"]
      })
    ).toBe(false);
  });

  it("does not require confirmation when the target path stays unchanged", () => {
    expect(
      requiresQuestionDirectoryMoveConfirmation({
        currentPath: ["我的题库", "高中物理", "力学", "牛顿定律"],
        nextPath: ["我的题库", "高中物理", "力学", "牛顿定律"]
      })
    ).toBe(false);
  });

  it("requires double confirmation when moving a question out of one third-level folder", () => {
    const confirm = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(true);

    expect(
      confirmQuestionDirectoryMove({
        currentPath: ["我的题库", "高中物理", "力学", "牛顿定律"],
        nextPath: ["我的题库", "高中物理", "待定区"],
        confirm
      })
    ).toBe(true);

    expect(confirm).toHaveBeenNthCalledWith(1, QUESTION_DIRECTORY_MOVE_CONFIRM_MESSAGE);
    expect(confirm).toHaveBeenNthCalledWith(
      2,
      QUESTION_DIRECTORY_MOVE_SECOND_CONFIRM_MESSAGE
    );
  });

  it("stops when the second confirmation is rejected", () => {
    const confirm = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);

    expect(
      confirmQuestionDirectoryMove({
        currentPath: ["我的题库", "高中物理", "力学", "牛顿定律"],
        nextPath: ["我的题库", "高中物理", "电学", "欧姆定律"],
        confirm
      })
    ).toBe(false);
  });
});

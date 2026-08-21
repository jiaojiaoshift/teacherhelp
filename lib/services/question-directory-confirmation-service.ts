export const QUESTION_DIRECTORY_MOVE_CONFIRM_MESSAGE =
  "确认将当前题目移出已确认目录吗？";

export const QUESTION_DIRECTORY_MOVE_SECOND_CONFIRM_MESSAGE =
  "将同步影响相关默认专题卷内容，是否再次确认移动？";

function createPathKey(path: string[] | null | undefined) {
  return (path ?? []).join("\u0000");
}

export function requiresQuestionDirectoryMoveConfirmation(input: {
  currentPath: string[] | null | undefined;
  nextPath: string[] | null | undefined;
}) {
  if (!input.currentPath || input.currentPath.length < 4) {
    return false;
  }

  return createPathKey(input.currentPath) !== createPathKey(input.nextPath);
}

export function confirmQuestionDirectoryMove(input: {
  currentPath: string[] | null | undefined;
  nextPath: string[] | null | undefined;
  confirm: (message: string) => boolean;
}) {
  if (!requiresQuestionDirectoryMoveConfirmation(input)) {
    return true;
  }

  if (!input.confirm(QUESTION_DIRECTORY_MOVE_CONFIRM_MESSAGE)) {
    return false;
  }

  return input.confirm(QUESTION_DIRECTORY_MOVE_SECOND_CONFIRM_MESSAGE);
}

import type {
  MobileUploadTargetNode,
  MobileUploadTargetTreeNode
} from "./upload-types";

function createBranchNode(input: {
  key: string;
  name: string;
  path: string[];
}): MobileUploadTargetTreeNode {
  return {
    key: input.key,
    name: input.name,
    path: input.path,
    children: [],
    selectableTarget: null
  };
}

function findOrCreateChildBranch(input: {
  parent: MobileUploadTargetTreeNode[];
  segment: string;
  path: string[];
}) {
  const key = input.path.join("/");
  const existingNode = input.parent.find((node) => node.key === key);

  if (existingNode) {
    return existingNode;
  }

  const nextNode = createBranchNode({
    key,
    name: input.segment,
    path: input.path
  });

  input.parent.push(nextNode);

  return nextNode;
}

function shouldAttachTargetToBranch(target: MobileUploadTargetNode) {
  const lastSegment = target.path[target.path.length - 1] ?? "";

  return target.targetKind !== "exam_document" && target.name === lastSegment;
}

export function buildMobileUploadTargetTree(
  targetNodes: MobileUploadTargetNode[]
) {
  const rootNodes: MobileUploadTargetTreeNode[] = [];

  for (const target of targetNodes) {
    let currentLevel = rootNodes;
    let currentBranch: MobileUploadTargetTreeNode | null = null;

    for (let index = 0; index < target.path.length; index += 1) {
      const segment = target.path[index] ?? "";
      const branchPath = target.path.slice(0, index + 1);

      currentBranch = findOrCreateChildBranch({
        parent: currentLevel,
        segment,
        path: branchPath
      });
      currentLevel = currentBranch.children;
    }

    if (!currentBranch) {
      continue;
    }

    if (shouldAttachTargetToBranch(target)) {
      currentBranch.selectableTarget = target;
      continue;
    }

    currentBranch.children.push({
      key: `${currentBranch.key}::${target.id}`,
      name: target.name,
      path: target.path,
      children: [],
      selectableTarget: target
    });
  }

  return rootNodes;
}

import { SUBJECT_SCOPES, type SubjectScope } from "@/lib/domain/enums";
import type { FolderEntity } from "@/lib/domain/entities";

function createFolderId(...parts: string[]): string {
  return parts.join("--");
}

function createCustomFolderId(parentId: string, name: string): string {
  return `${parentId}--custom--${name}`;
}

const INITIAL_HIGH_SCHOOL_PHYSICS_TOPIC_TREE = [
  {
    name: "匀变速运动",
    topics: [
      "匀加速基础",
      "逐差法与比例速算法",
      "运动的图像性质",
      "运动综合类题目",
      "实验:探究小车速度随时间的变化规律"
    ]
  },
  {
    name: "静力学",
    topics: ["支持力与摩擦力分析", "受力分析综合", "整体法与隔离法", "动态平衡专题"]
  },
  {
    name: "牛顿运动定律",
    topics: [
      "牛顿第一与第三定律",
      "牛顿第二定律基础",
      "板块模型",
      "传动带模型",
      "牛顿第二定律综合提高"
    ]
  },
  {
    name: "曲线运动",
    topics: [
      "平抛运动基础",
      "抛体类曲线方程",
      "斜面平抛模型",
      "圆周运动基础",
      "圆盘模型和摆类模型",
      "圆周运动与动力学综合"
    ]
  },
  {
    name: "天体运动",
    topics: ["天体运动基础", "星表模型", "天体运动综合及创新题"]
  },
  {
    name: "功与能量",
    topics: [
      "功与功率基础",
      "机械能，重力势能与动能",
      "动能定理与能量守恒",
      "功能牛二综合题"
    ]
  },
  {
    name: "静电场",
    topics: [
      "静电感应",
      "库仑力与静电场初步",
      "电场力进阶",
      "电势与电势能",
      "电容器",
      "等效重力场",
      "带电粒子在电场中的运动",
      "电场综合"
    ]
  },
  {
    name: "电路",
    topics: [
      "电路元件认识",
      "电源与电动势",
      "欧姆定律与串并联",
      "伏安法测电阻基础",
      "测电阻进阶与创新",
      "电功率基础",
      "闭合电路欧姆定律",
      "电路分析基础",
      "电路分析进阶",
      "高难电路分析",
      "测量电动势与内阻实验",
      "电学实验综合"
    ]
  },
  {
    name: "磁场",
    topics: [
      "磁场通识基础",
      "安培定则",
      "带电粒子在磁场中的三类圆问题",
      "磁场磁聚焦与磁发散",
      "带电粒子在组合场中的运动",
      "带电粒子在复合场中的运动",
      "磁场的实际应用"
    ]
  },
  {
    name: "电磁感应",
    topics: [
      "电磁感应通识基础",
      "楞次定律",
      "法拉第电磁感应",
      "单棒问题",
      "电磁感应图像问题",
      "双棒模型",
      "杆容模型"
    ]
  }
] as const;

const LEGACY_SUBJECT_SCOPE_RENAMES: Record<string, SubjectScope> = {
  初高中数学: "高中数学",
  初高中物理: "高中物理"
};

export function normalizeSubjectSegment(segment: string): string {
  return LEGACY_SUBJECT_SCOPE_RENAMES[segment] ?? segment;
}

export function normalizeSubjectScope(subjectScope: string | null | undefined): SubjectScope | null {
  if (!subjectScope) {
    return null;
  }

  return (LEGACY_SUBJECT_SCOPE_RENAMES[subjectScope] ?? subjectScope) as SubjectScope;
}

function createFolderIdFromPath(path: string[]): string {
  if (path.length === 1 && path[0] === "我的题库") {
    return "root-library";
  }

  if (path.length === 2 && path[0] === "我的题库" && path[1] === "未分类") {
    return "root-uncategorized";
  }

  if (path.length >= 2) {
    const subjectId = createFolderId("root", path[1]);

    if (path.length === 2) {
      return subjectId;
    }

    if (path.length === 3 && path[2] === "待定区") {
      return createFolderId(subjectId, "pending");
    }

    return path.slice(2).reduce((folderId, segment) => createCustomFolderId(folderId, segment), subjectId);
  }

  return createFolderId(...path);
}

function createParentIdFromPath(path: string[]): string | null {
  if (path.length <= 1) {
    return null;
  }

  return createFolderIdFromPath(path.slice(0, -1));
}

function collectDescendantFolderIds(
  childFoldersByParentId: Record<string, FolderEntity[]>,
  folderId: string
): string[] {
  const descendants = childFoldersByParentId[folderId] ?? [];

  return descendants.flatMap((folder) => [folder.id, ...collectDescendantFolderIds(childFoldersByParentId, folder.id)]);
}

function buildChildFoldersByParentId(folders: FolderEntity[]): Record<string, FolderEntity[]> {
  return folders.reduce<Record<string, FolderEntity[]>>((accumulator, folder) => {
    if (!folder.parentId) {
      return accumulator;
    }

    accumulator[folder.parentId] ??= [];
    accumulator[folder.parentId].push(folder);
    return accumulator;
  }, {});
}

function createSubjectFolder(subjectScope: SubjectScope, parentId: string): FolderEntity[] {
  const subjectId = createFolderId("root", subjectScope);
  const pendingId = createFolderId(subjectId, "pending");

  return [
    {
      id: subjectId,
      parentId,
      name: subjectScope,
      kind: "system",
      subjectScope,
      depth: 1,
      path: ["我的题库", subjectScope]
    },
    {
      id: pendingId,
      parentId: subjectId,
      name: "待定区",
      kind: "pending_bucket",
      subjectScope,
      depth: 2,
      path: ["我的题库", subjectScope, "待定区"]
    }
  ];
}

function createSeededCustomFolder(input: {
  parent: FolderEntity;
  name: string;
}): FolderEntity {
  return {
    id: createCustomFolderId(input.parent.id, input.name),
    parentId: input.parent.id,
    name: input.name,
    kind: "custom",
    subjectScope: input.parent.subjectScope as SubjectScope,
    depth: input.parent.depth + 1,
    path: [...input.parent.path, input.name]
  };
}

function createInitialHighSchoolPhysicsFolders(subjectFolder: FolderEntity): FolderEntity[] {
  return INITIAL_HIGH_SCHOOL_PHYSICS_TOPIC_TREE.flatMap((chapterSeed) => {
    const chapter = createSeededCustomFolder({
      parent: subjectFolder,
      name: chapterSeed.name
    });
    const topics = chapterSeed.topics.map((topicName) =>
      createSeededCustomFolder({
        parent: chapter,
        name: topicName
      })
    );

    return [chapter, ...topics];
  });
}

export function normalizeInitialFolderTree(folders: FolderEntity[]): FolderEntity[] {
  const normalizedFolders = folders.map((folder) => {
    const path = folder.path.map(normalizeSubjectSegment);
    const subjectScope = normalizeSubjectScope(folder.subjectScope);
    const name = normalizeSubjectSegment(folder.name);

    return {
      ...folder,
      id: createFolderIdFromPath(path),
      parentId: createParentIdFromPath(path),
      name,
      subjectScope,
      path
    };
  });
  const folderById = new Map<string, FolderEntity>();

  normalizedFolders.forEach((folder) => {
    folderById.set(folder.id, folder);
  });

  const physicsRoot = folderById.get(createFolderId("root", "高中物理"));
  if (physicsRoot) {
    createInitialHighSchoolPhysicsFolders(physicsRoot).forEach((folder) => {
      if (!folderById.has(folder.id)) {
        folderById.set(folder.id, folder);
      }
    });
  }

  return Array.from(folderById.values());
}

export function buildInitialFolderTree(): FolderEntity[] {
  const rootId = "root-library";
  const folders: FolderEntity[] = [
    {
      id: rootId,
      parentId: null,
      name: "我的题库",
      kind: "system",
      subjectScope: null,
      depth: 0,
      path: ["我的题库"]
    }
  ];

  SUBJECT_SCOPES.forEach((subjectScope) => {
    const subjectFolders = createSubjectFolder(subjectScope, rootId);
    folders.push(...subjectFolders);

    if (subjectScope === "高中物理") {
      const subjectFolder = subjectFolders.find((folder) => folder.kind === "system");

      if (subjectFolder) {
        folders.push(...createInitialHighSchoolPhysicsFolders(subjectFolder));
      }
    }
  });

  folders.push({
    id: "root-uncategorized",
    parentId: rootId,
    name: "未分类",
    kind: "system",
    subjectScope: null,
    depth: 1,
    path: ["我的题库", "未分类"]
  });

  return folders;
}

export function createCustomFolder(input: {
  name: string;
  parent: FolderEntity;
}): FolderEntity {
  const normalizedName = input.name.trim();

  return {
    id: createCustomFolderId(input.parent.id, normalizedName),
    parentId: input.parent.id,
    name: normalizedName,
    kind: "custom",
    subjectScope: input.parent.subjectScope as SubjectScope,
    depth: input.parent.depth + 1,
    path: [...input.parent.path, normalizedName]
  };
}

export function findPendingBucketForSubject(
  folders: FolderEntity[],
  subjectScope: SubjectScope
): FolderEntity | null {
  return (
    folders.find(
      (folder) => folder.kind === "pending_bucket" && folder.subjectScope === subjectScope
    ) ?? null
  );
}

export function doesFolderPathMatchPrefix(path: string[] | null | undefined, prefix: string[]): boolean {
  if (!path || prefix.length > path.length) {
    return false;
  }

  return prefix.every((segment, index) => path[index] === segment);
}

export function replaceFolderPathPrefix(
  path: string[] | null | undefined,
  previousPrefix: string[],
  nextPrefix: string[]
): string[] | null | undefined {
  if (!doesFolderPathMatchPrefix(path, previousPrefix)) {
    return path;
  }

  const resolvedPath = path as string[];

  return nextPrefix.concat(resolvedPath.slice(previousPrefix.length));
}

export function collectAiMatchableDirectoryPaths(
  folders: FolderEntity[],
  maxDepth = 3
): string[][] {
  const seen = new Set<string>();
  const paths: string[][] = [];

  folders
    .filter((folder) => folder.kind === "custom")
    .forEach((folder) => {
      const pathWithoutLibraryRoot =
        folder.path[0] === "我的题库" ? folder.path.slice(1) : folder.path;
      const matchablePath = pathWithoutLibraryRoot.slice(0, maxDepth);

      if (matchablePath.length < 2) {
        return;
      }

      const key = matchablePath.join(" / ");
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      paths.push(matchablePath);
    });

  return paths;
}

export function renameFolderTree(input: {
  folders: FolderEntity[];
  folderId: string;
  nextName: string;
}): {
  nextFolders: FolderEntity[];
  previousPath: string[];
  renamedFolder: FolderEntity;
} | null {
  const target = input.folders.find((folder) => folder.id === input.folderId);
  const nextName = input.nextName.trim();

  if (!target || target.kind !== "custom" || !target.parentId || !nextName) {
    return null;
  }

  const parent = input.folders.find((folder) => folder.id === target.parentId);
  if (!parent) {
    return null;
  }

  const siblingConflict = input.folders.find(
    (folder) =>
      folder.parentId === target.parentId && folder.id !== target.id && folder.name === nextName
  );
  if (siblingConflict) {
    return null;
  }

  const childFoldersByParentId = buildChildFoldersByParentId(input.folders);

  const rebuildFolder = (
    folder: FolderEntity,
    nextParent: FolderEntity,
    overrideName?: string
  ): FolderEntity[] => {
    const resolvedName = overrideName ?? folder.name;
    const nextFolder: FolderEntity = {
      ...folder,
      id:
        folder.kind === "custom"
          ? createCustomFolderId(nextParent.id, resolvedName)
          : folder.id,
      parentId: nextParent.id,
      name: resolvedName,
      depth: nextParent.depth + 1,
      path: nextParent.path.concat(resolvedName)
    };

    const children = childFoldersByParentId[folder.id] ?? [];

    return [nextFolder, ...children.flatMap((child) => rebuildFolder(child, nextFolder))];
  };

  const subtreeIds = new Set([
    target.id,
    ...collectDescendantFolderIds(childFoldersByParentId, target.id)
  ]);
  const targetIndex = input.folders.findIndex((folder) => folder.id === target.id);
  const rebuiltSubtree = rebuildFolder(target, parent, nextName);
  const before = input.folders.slice(0, targetIndex).filter((folder) => !subtreeIds.has(folder.id));
  const after = input.folders.slice(targetIndex + 1).filter((folder) => !subtreeIds.has(folder.id));

  return {
    nextFolders: before.concat(rebuiltSubtree, after),
    previousPath: target.path,
    renamedFolder: rebuiltSubtree[0]
  };
}

export function moveFolderTree(input: {
  folders: FolderEntity[];
  folderId: string;
  nextParentId: string;
}): {
  nextFolders: FolderEntity[];
  previousPath: string[];
  movedFolder: FolderEntity;
} | null {
  const target = input.folders.find((folder) => folder.id === input.folderId);
  const nextParent = input.folders.find((folder) => folder.id === input.nextParentId);

  if (
    !target ||
    target.kind !== "custom" ||
    !target.parentId ||
    !nextParent ||
    nextParent.kind === "pending_bucket" ||
    !nextParent.subjectScope
  ) {
    return null;
  }

  const childFoldersByParentId = buildChildFoldersByParentId(input.folders);
  const subtreeIds = new Set([
    target.id,
    ...collectDescendantFolderIds(childFoldersByParentId, target.id)
  ]);

  if (subtreeIds.has(nextParent.id)) {
    return null;
  }

  const siblingConflict = input.folders.find(
    (folder) =>
      folder.parentId === nextParent.id &&
      !subtreeIds.has(folder.id) &&
      folder.name === target.name
  );
  if (siblingConflict) {
    return null;
  }

  const rebuildFolder = (folder: FolderEntity, parent: FolderEntity): FolderEntity[] => {
    const nextFolder: FolderEntity = {
      ...folder,
      id: createCustomFolderId(parent.id, folder.name),
      parentId: parent.id,
      subjectScope: parent.subjectScope as SubjectScope,
      depth: parent.depth + 1,
      path: parent.path.concat(folder.name)
    };

    const children = childFoldersByParentId[folder.id] ?? [];

    return [nextFolder, ...children.flatMap((child) => rebuildFolder(child, nextFolder))];
  };

  const remainingFolders = input.folders.filter((folder) => !subtreeIds.has(folder.id));
  const resolvedNextParent = remainingFolders.find((folder) => folder.id === nextParent.id);

  if (!resolvedNextParent) {
    return null;
  }

  const rebuiltSubtree = rebuildFolder(target, resolvedNextParent);
  const insertAfterIndex = remainingFolders.reduce(
    (lastIndex, folder, index) =>
      doesFolderPathMatchPrefix(folder.path, resolvedNextParent.path) ? index : lastIndex,
    -1
  );

  return {
    nextFolders: remainingFolders
      .slice(0, insertAfterIndex + 1)
      .concat(rebuiltSubtree, remainingFolders.slice(insertAfterIndex + 1)),
    previousPath: target.path,
    movedFolder: rebuiltSubtree[0]
  };
}

export function deleteFolderTree(input: {
  folders: FolderEntity[];
  folderId: string;
}): {
  nextFolders: FolderEntity[];
  deletedFolderIds: string[];
} | null {
  const target = input.folders.find((folder) => folder.id === input.folderId);

  if (!target || target.kind !== "custom") {
    return null;
  }

  const childFoldersByParentId = buildChildFoldersByParentId(input.folders);
  const deletedFolderIds = [target.id, ...collectDescendantFolderIds(childFoldersByParentId, target.id)];
  const deletedFolderIdSet = new Set(deletedFolderIds);

  return {
    nextFolders: input.folders.filter((folder) => !deletedFolderIdSet.has(folder.id)),
    deletedFolderIds
  };
}

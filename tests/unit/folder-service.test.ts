import { describe, expect, it } from "vitest";

import {
  buildInitialFolderTree,
  collectAiMatchableDirectoryPaths,
  createCustomFolder,
  deleteFolderTree,
  normalizeInitialFolderTree,
  moveFolderTree,
  renameFolderTree
} from "@/lib/services/folder-service";

describe("folder-service", () => {
  it("creates first-level subject roots and pending buckets", () => {
    const folders = buildInitialFolderTree();
    const rootFolders = folders
      .filter((folder) => folder.parentId === "root-library")
      .map((folder) => folder.name);

    expect(rootFolders).toEqual([
      "高中数学",
      "高中物理",
      "大学物理",
      "高等数学",
      "未分类"
    ]);
    expect(
      folders.filter((folder) => folder.kind === "pending_bucket").map((folder) => folder.path)
    ).toEqual([
      ["我的题库", "高中数学", "待定区"],
      ["我的题库", "高中物理", "待定区"],
      ["我的题库", "大学物理", "待定区"],
      ["我的题库", "高等数学", "待定区"]
    ]);
  });

  it("seeds high-school physics chapter and topic folders", () => {
    const folders = buildInitialFolderTree();
    const foldersByPath = new Map(folders.map((folder) => [folder.path.join(" / "), folder]));
    const chapters = {
      匀变速运动: [
        "匀加速基础",
        "逐差法与比例速算法",
        "运动的图像性质",
        "运动综合类题目",
        "实验:探究小车速度随时间的变化规律"
      ],
      静力学: ["支持力与摩擦力分析", "受力分析综合", "整体法与隔离法", "动态平衡专题"],
      牛顿运动定律: [
        "牛顿第一与第三定律",
        "牛顿第二定律基础",
        "板块模型",
        "传动带模型",
        "牛顿第二定律综合提高"
      ],
      曲线运动: [
        "平抛运动基础",
        "抛体类曲线方程",
        "斜面平抛模型",
        "圆周运动基础",
        "圆盘模型和摆类模型",
        "圆周运动与动力学综合"
      ],
      天体运动: ["天体运动基础", "星表模型", "天体运动综合及创新题"],
      功与能量: [
        "功与功率基础",
        "机械能，重力势能与动能",
        "动能定理与能量守恒",
        "功能牛二综合题"
      ],
      静电场: [
        "静电感应",
        "库仑力与静电场初步",
        "电场力进阶",
        "电势与电势能",
        "电容器",
        "等效重力场",
        "带电粒子在电场中的运动",
        "电场综合"
      ],
      电路: [
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
      ],
      磁场: [
        "磁场通识基础",
        "安培定则",
        "带电粒子在磁场中的三类圆问题",
        "磁场磁聚焦与磁发散",
        "带电粒子在组合场中的运动",
        "带电粒子在复合场中的运动",
        "磁场的实际应用"
      ],
      电磁感应: [
        "电磁感应通识基础",
        "楞次定律",
        "法拉第电磁感应",
        "单棒问题",
        "电磁感应图像问题",
        "双棒模型",
        "杆容模型"
      ]
    };

    Object.entries(chapters).forEach(([chapterName, topicNames]) => {
      const chapter = foldersByPath.get(`我的题库 / 高中物理 / ${chapterName}`);

      expect(chapter).toMatchObject({
        name: chapterName,
        kind: "custom",
        subjectScope: "高中物理",
        depth: 2,
        path: ["我的题库", "高中物理", chapterName]
      });

      topicNames.forEach((topicName) => {
        expect(foldersByPath.get(`我的题库 / 高中物理 / ${chapterName} / ${topicName}`)).toMatchObject({
          name: topicName,
          parentId: chapter?.id,
          kind: "custom",
          subjectScope: "高中物理",
          depth: 3,
          path: ["我的题库", "高中物理", chapterName, topicName]
        });
      });
    });
  });

  it("exposes seeded physics folders as AI-matchable directory paths", () => {
    expect(collectAiMatchableDirectoryPaths(buildInitialFolderTree())).toEqual(
      expect.arrayContaining([
        ["高中物理", "匀变速运动"],
        ["高中物理", "匀变速运动", "匀加速基础"],
        ["高中物理", "牛顿运动定律", "板块模型"],
        ["高中物理", "功与能量", "功能牛二综合题"],
        ["高中物理", "电路", "测量电动势与内阻实验"],
        ["高中物理", "磁场", "带电粒子在组合场中的运动"],
        ["高中物理", "电磁感应", "法拉第电磁感应"]
      ])
    );
  });

  it("migrates old subject names and backfills seeded physics folders in existing snapshots", () => {
    const newlySeededChapters = new Set(["电路", "磁场", "电磁感应"]);
    const oldFolders = buildInitialFolderTree()
      .filter((folder) => !newlySeededChapters.has(folder.path[2] ?? ""))
      .map((folder) => ({
        ...folder,
        id: folder.id.replaceAll("高中数学", "初高中数学").replaceAll("高中物理", "初高中物理"),
        parentId: folder.parentId
          ?.replaceAll("高中数学", "初高中数学")
          .replaceAll("高中物理", "初高中物理") ?? null,
        name:
          folder.name === "高中数学"
            ? "初高中数学"
            : folder.name === "高中物理"
              ? "初高中物理"
              : folder.name,
        subjectScope:
          folder.subjectScope === "高中数学"
            ? "初高中数学"
            : folder.subjectScope === "高中物理"
              ? "初高中物理"
              : folder.subjectScope,
        path: folder.path.map((segment) =>
          segment === "高中数学" ? "初高中数学" : segment === "高中物理" ? "初高中物理" : segment
        )
      }));
    const legacyPhysicsRoot = oldFolders.find((folder) => folder.name === "初高中物理");

    expect(legacyPhysicsRoot).toBeTruthy();

    const legacyCustom = createCustomFolder({
      name: "电学",
      parent: legacyPhysicsRoot!
    });
    const normalized = normalizeInitialFolderTree(oldFolders.concat(legacyCustom));

    expect(normalized.some((folder) => folder.name === "初高中数学")).toBe(false);
    expect(normalized.some((folder) => folder.name === "初高中物理")).toBe(false);
    expect(normalized).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "root--高中数学",
          name: "高中数学",
          subjectScope: "高中数学",
          path: ["我的题库", "高中数学"]
        }),
        expect.objectContaining({
          id: "root--高中物理",
          name: "高中物理",
          subjectScope: "高中物理",
          path: ["我的题库", "高中物理"]
        }),
        expect.objectContaining({
          name: "电学",
          parentId: "root--高中物理",
          subjectScope: "高中物理",
          path: ["我的题库", "高中物理", "电学"]
        }),
        expect.objectContaining({
          name: "匀加速基础",
          subjectScope: "高中物理",
          path: ["我的题库", "高中物理", "匀变速运动", "匀加速基础"]
        }),
        expect.objectContaining({
          name: "电路元件认识",
          subjectScope: "高中物理",
          path: ["我的题库", "高中物理", "电路", "电路元件认识"]
        }),
        expect.objectContaining({
          name: "磁场的实际应用",
          subjectScope: "高中物理",
          path: ["我的题库", "高中物理", "磁场", "磁场的实际应用"]
        }),
        expect.objectContaining({
          name: "杆容模型",
          subjectScope: "高中物理",
          path: ["我的题库", "高中物理", "电磁感应", "杆容模型"]
        })
      ])
    );
  });

  it("marks pending buckets as system pending folders", () => {
    const folders = buildInitialFolderTree();
    const pendingBuckets = folders.filter((folder) => folder.kind === "pending_bucket");

    expect(pendingBuckets).toHaveLength(4);
    expect(pendingBuckets.every((folder) => folder.parentId)).toBe(true);
  });

  it("creates a custom folder under a subject root and extends the path depth", () => {
    const folders = buildInitialFolderTree();
    const parent = folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    const custom = createCustomFolder({
      name: "函数",
      parent: parent!
    });

    expect(custom).toEqual({
      id: "root--高中数学--custom--函数",
      parentId: parent!.id,
      name: "函数",
      kind: "custom",
      subjectScope: "高中数学",
      depth: 2,
      path: ["我的题库", "高中数学", "函数"]
    });
  });

  it("renames a custom folder and keeps descendant paths in sync", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.name === "高中数学");

    expect(subject).toBeTruthy();

    const algebra = createCustomFolder({
      name: "函数",
      parent: subject!
    });
    const quadratic = createCustomFolder({
      name: "二次函数",
      parent: algebra
    });

    const result = renameFolderTree({
      folders: folders.concat(algebra, quadratic),
      folderId: algebra.id,
      nextName: "代数"
    });

    expect(result).not.toBeNull();
    expect(result?.previousPath).toEqual(["我的题库", "高中数学", "函数"]);
    expect(result?.renamedFolder).toMatchObject({
      name: "代数",
      path: ["我的题库", "高中数学", "代数"]
    });

    const renamedChild = result?.nextFolders.find((folder) => folder.name === "二次函数");
    expect(renamedChild).toMatchObject({
      parentId: "root--高中数学--custom--代数",
      path: ["我的题库", "高中数学", "代数", "二次函数"]
    });
  });

  it("deletes a custom folder subtree only", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.name === "高中数学");
    const physics = folders.find((folder) => folder.name === "高中物理");

    expect(subject).toBeTruthy();
    expect(physics).toBeTruthy();

    const algebra = createCustomFolder({
      name: "函数",
      parent: subject!
    });
    const quadratic = createCustomFolder({
      name: "二次函数",
      parent: algebra
    });
    const mechanics = createCustomFolder({
      name: "力学",
      parent: physics!
    });

    const result = deleteFolderTree({
      folders: folders.concat(algebra, quadratic, mechanics),
      folderId: algebra.id
    });

    expect(result).not.toBeNull();
    expect(result?.deletedFolderIds).toEqual([
      "root--高中数学--custom--函数",
      "root--高中数学--custom--函数--custom--二次函数"
    ]);
    expect(result?.nextFolders.map((folder) => folder.name)).not.toContain("函数");
    expect(result?.nextFolders.map((folder) => folder.name)).not.toContain("二次函数");
    expect(result?.nextFolders.map((folder) => folder.name)).toContain("力学");
  });

  it("moves a custom folder under another custom folder and rebuilds descendant paths", () => {
    const folders = buildInitialFolderTree();
    const math = folders.find((folder) => folder.name === "高中数学");
    const physics = folders.find((folder) => folder.name === "高中物理");

    expect(math).toBeTruthy();
    expect(physics).toBeTruthy();

    const algebra = createCustomFolder({
      name: "函数",
      parent: math!
    });
    const quadratic = createCustomFolder({
      name: "二次函数",
      parent: algebra
    });
    const mechanics = createCustomFolder({
      name: "力学",
      parent: physics!
    });

    const result = moveFolderTree({
      folders: folders.concat(algebra, quadratic, mechanics),
      folderId: algebra.id,
      nextParentId: mechanics.id
    });

    expect(result).not.toBeNull();
    expect(result?.previousPath).toEqual(["我的题库", "高中数学", "函数"]);
    expect(result?.movedFolder).toMatchObject({
      parentId: mechanics.id,
      path: ["我的题库", "高中物理", "力学", "函数"]
    });

    const movedChild = result?.nextFolders.find((folder) => folder.name === "二次函数");
    expect(movedChild).toMatchObject({
      parentId: result?.movedFolder.id,
      path: ["我的题库", "高中物理", "力学", "函数", "二次函数"]
    });
  });

  it("rejects moving a folder into its own descendant", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.name === "高中数学");

    expect(subject).toBeTruthy();

    const algebra = createCustomFolder({
      name: "函数",
      parent: subject!
    });
    const quadratic = createCustomFolder({
      name: "二次函数",
      parent: algebra
    });

    const result = moveFolderTree({
      folders: folders.concat(algebra, quadratic),
      folderId: algebra.id,
      nextParentId: quadratic.id
    });

    expect(result).toBeNull();
  });

  it("collects only existing custom directory paths for AI matching and truncates to level three", () => {
    const folders = buildInitialFolderTree();
    const subject = folders.find((folder) => folder.name === "高中数学");

    expect(subject).toBeTruthy();

    const functions = createCustomFolder({
      name: "函数",
      parent: subject!
    });
    const quadratic = createCustomFolder({
      name: "二次函数",
      parent: functions
    });
    const imageTransform = createCustomFolder({
      name: "图像变换",
      parent: quadratic
    });

    const mathPaths = collectAiMatchableDirectoryPaths(
      folders.concat(functions, quadratic, imageTransform)
    ).filter((path) => path[0] === "高中数学");

    expect(mathPaths).toEqual([
      ["高中数学", "函数"],
      ["高中数学", "函数", "二次函数"]
    ]);
  });
});

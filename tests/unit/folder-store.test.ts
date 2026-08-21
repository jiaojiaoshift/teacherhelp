import { beforeEach, describe, expect, it } from "vitest";

import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useFolderStore } from "@/lib/stores/folder-store";

describe("folder-store", () => {
  beforeEach(() => {
    useFolderStore.setState({
      folders: buildInitialFolderTree(),
      setFolders: useFolderStore.getState().setFolders,
      createFolder: useFolderStore.getState().createFolder,
      renameFolder: useFolderStore.getState().renameFolder,
      deleteFolder: useFolderStore.getState().deleteFolder,
      moveFolder: useFolderStore.getState().moveFolder
    });
  });

  it("creates a custom folder under the target parent", () => {
    const parent = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    const created = useFolderStore.getState().createFolder(parent!.id, "函数");

    expect(created?.path).toEqual(["我的题库", "高中数学", "函数"]);
    expect(useFolderStore.getState().folders.some((folder) => folder.name === "函数")).toBe(true);
  });

  it("renames a custom folder and updates descendant paths", () => {
    const parent = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    const created = useFolderStore.getState().createFolder(parent!.id, "函数");

    expect(created).toBeTruthy();

    const child = useFolderStore.getState().createFolder(created!.id, "二次函数");

    expect(child).toBeTruthy();

    const renamed = useFolderStore.getState().renameFolder(created!.id, "代数");

    expect(renamed).toMatchObject({
      name: "代数",
      path: ["我的题库", "高中数学", "代数"]
    });
    expect(useFolderStore.getState().folders.find((folder) => folder.name === "二次函数")).toMatchObject({
      parentId: renamed?.id,
      path: ["我的题库", "高中数学", "代数", "二次函数"]
    });
  });

  it("deletes a custom folder subtree", () => {
    const parent = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(parent).toBeTruthy();

    const created = useFolderStore.getState().createFolder(parent!.id, "函数");

    expect(created).toBeTruthy();

    useFolderStore.getState().createFolder(created!.id, "二次函数");

    const deletedIds = useFolderStore.getState().deleteFolder(created!.id);

    expect(deletedIds).toEqual([
      "root--高中数学--custom--函数",
      "root--高中数学--custom--函数--custom--二次函数"
    ]);
    expect(useFolderStore.getState().folders.some((folder) => folder.name === "函数")).toBe(false);
    expect(useFolderStore.getState().folders.some((folder) => folder.name === "二次函数")).toBe(false);
  });

  it("moves a custom folder to a new parent and updates descendant paths", () => {
    const math = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");
    const physics = useFolderStore.getState().folders.find((folder) => folder.name === "高中物理");

    expect(math).toBeTruthy();
    expect(physics).toBeTruthy();

    const functions = useFolderStore.getState().createFolder(math!.id, "函数");
    const quadratic = useFolderStore.getState().createFolder(functions!.id, "二次函数");
    const mechanics = useFolderStore.getState().createFolder(physics!.id, "力学");

    expect(functions).toBeTruthy();
    expect(quadratic).toBeTruthy();
    expect(mechanics).toBeTruthy();

    const moved = useFolderStore.getState().moveFolder(functions!.id, mechanics!.id);

    expect(moved).toMatchObject({
      parentId: mechanics!.id,
      path: ["我的题库", "高中物理", "力学", "函数"]
    });
    expect(useFolderStore.getState().folders.find((folder) => folder.name === "二次函数")).toMatchObject({
      parentId: moved?.id,
      path: ["我的题库", "高中物理", "力学", "函数", "二次函数"]
    });
  });

  it("rejects moving a folder into its own descendant", () => {
    const math = useFolderStore.getState().folders.find((folder) => folder.name === "高中数学");

    expect(math).toBeTruthy();

    const functions = useFolderStore.getState().createFolder(math!.id, "函数");
    const quadratic = useFolderStore.getState().createFolder(functions!.id, "二次函数");

    expect(functions).toBeTruthy();
    expect(quadratic).toBeTruthy();

    const moved = useFolderStore.getState().moveFolder(functions!.id, quadratic!.id);

    expect(moved).toBeNull();
    expect(useFolderStore.getState().folders.find((folder) => folder.id === functions!.id)).toMatchObject({
      path: ["我的题库", "高中数学", "函数"]
    });
  });

  it("normalizes old subject names when hydrating a saved workspace", () => {
    const legacyFolders = buildInitialFolderTree().map((folder) => ({
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

    useFolderStore.getState().hydrateWorkspaceState(legacyFolders);

    expect(useFolderStore.getState().folders.some((folder) => folder.name === "初高中数学")).toBe(false);
    expect(useFolderStore.getState().folders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "root--高中数学",
          name: "高中数学",
          subjectScope: "高中数学",
          path: ["我的题库", "高中数学"]
        }),
        expect.objectContaining({
          name: "匀加速基础",
          subjectScope: "高中物理",
          path: ["我的题库", "高中物理", "匀变速运动", "匀加速基础"]
        })
      ])
    );
  });
});

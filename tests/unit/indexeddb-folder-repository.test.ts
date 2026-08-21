import { beforeEach, describe, expect, it } from "vitest";

import { IndexedDbFolderRepository } from "@/lib/repositories/indexeddb/folder-repository";
import { resetDbForTests } from "@/lib/db/client";
import { buildInitialFolderTree } from "@/lib/services/folder-service";

describe("indexeddb folder repository", () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  it("persists and reads back the initial folder tree", async () => {
    const repository = new IndexedDbFolderRepository();
    const folders = buildInitialFolderTree();

    await repository.saveAll(folders);

    const loaded = await repository.listAll();
    expect(loaded).toHaveLength(folders.length);
    expect(loaded.map((folder) => folder.path.join(" / ")).sort()).toEqual(
      folders.map((folder) => folder.path.join(" / ")).sort()
    );
  });
});

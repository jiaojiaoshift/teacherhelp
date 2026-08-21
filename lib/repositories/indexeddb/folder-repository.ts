import type { FolderEntity } from "@/lib/domain/entities";
import { getDb } from "@/lib/db/client";
import { DB_STORES } from "@/lib/db/schema";
import type { FolderRepository } from "@/lib/repositories/interfaces";

export class IndexedDbFolderRepository implements FolderRepository {
  async listAll(): Promise<FolderEntity[]> {
    const db = await getDb();
    const folders = await db.getAll(DB_STORES.folders);

    return folders.sort((left, right) => {
      const leftKey = left.path.join("/");
      const rightKey = right.path.join("/");
      return leftKey.localeCompare(rightKey, "zh-CN");
    });
  }

  async saveAll(folders: FolderEntity[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(DB_STORES.folders, "readwrite");

    await tx.store.clear();

    for (const folder of folders) {
      await tx.store.put(folder, folder.id);
    }

    await tx.done;
  }
}

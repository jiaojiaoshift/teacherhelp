import type { FolderEntity } from "@/lib/domain/entities";

export interface FolderRepository {
  listAll(): Promise<FolderEntity[]>;
  saveAll(folders: FolderEntity[]): Promise<void>;
}

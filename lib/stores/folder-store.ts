import { create } from "zustand";

import type { FolderEntity } from "@/lib/domain/entities";
import {
  buildInitialFolderTree,
  createCustomFolder,
  deleteFolderTree,
  moveFolderTree,
  normalizeInitialFolderTree,
  renameFolderTree
} from "@/lib/services/folder-service";

interface FolderStoreState {
  folders: FolderEntity[];
  hydrateWorkspaceState: (folders: FolderEntity[]) => void;
  setFolders: (folders: FolderEntity[]) => void;
  createFolder: (parentId: string, name: string) => FolderEntity | null;
  renameFolder: (folderId: string, name: string) => FolderEntity | null;
  deleteFolder: (folderId: string) => string[];
  moveFolder: (folderId: string, nextParentId: string) => FolderEntity | null;
}

export const useFolderStore = create<FolderStoreState>((set, get) => ({
  folders: buildInitialFolderTree(),
  hydrateWorkspaceState: (folders) => set({ folders: normalizeInitialFolderTree(folders) }),
  setFolders: (folders) => set({ folders: normalizeInitialFolderTree(folders) }),
  createFolder: (parentId, name) => {
    const parent = get().folders.find((folder) => folder.id === parentId);
    const normalizedName = name.trim();

    if (!parent || !normalizedName) {
      return null;
    }

    const existing = get().folders.find(
      (folder) => folder.parentId === parentId && folder.name === normalizedName
    );
    if (existing) {
      return existing;
    }

    const folder = createCustomFolder({
      name: normalizedName,
      parent
    });

    set((state) => ({
      folders: [...state.folders, folder]
    }));

    return folder;
  },
  renameFolder: (folderId, name) => {
    const result = renameFolderTree({
      folders: get().folders,
      folderId,
      nextName: name
    });

    if (!result) {
      return null;
    }

    set({
      folders: result.nextFolders
    });

    return result.renamedFolder;
  },
  deleteFolder: (folderId) => {
    const result = deleteFolderTree({
      folders: get().folders,
      folderId
    });

    if (!result) {
      return [];
    }

    set({
      folders: result.nextFolders
    });

    return result.deletedFolderIds;
  },
  moveFolder: (folderId, nextParentId) => {
    const result = moveFolderTree({
      folders: get().folders,
      folderId,
      nextParentId
    });

    if (!result) {
      return null;
    }

    set({
      folders: result.nextFolders
    });

    return result.movedFolder;
  }
}));

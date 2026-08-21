import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { DB_NAME, DB_STORES, DB_VERSION } from "@/lib/db/schema";
import type {
  DocumentEntity,
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  FolderEntity,
  PageEntity
} from "@/lib/domain/entities";
import type { WorkspaceSnapshotRecord } from "@/lib/repositories/indexeddb/workspace-snapshot-repository";

interface TeachhelperDbSchema extends DBSchema {
  documents: {
    key: string;
    value: DocumentEntity;
  };
  source_assets: {
    key: string;
    value: Record<string, unknown>;
  };
  pages: {
    key: string;
    value: PageEntity;
  };
  binary_assets: {
    key: string;
    value: Record<string, unknown>;
  };
  questions: {
    key: string;
    value: Record<string, unknown>;
  };
  folders: {
    key: string;
    value: FolderEntity;
  };
  tags: {
    key: string;
    value: Record<string, unknown>;
  };
  analysis_jobs: {
    key: string;
    value: Record<string, unknown>;
  };
  settings: {
    key: string;
    value: Record<string, unknown>;
  };
  ui_snapshots: {
    key: string;
    value: WorkspaceSnapshotRecord;
  };
  exam_libraries: {
    key: string;
    value: ExamLibraryFolderEntity;
  };
  exam_documents: {
    key: string;
    value: ExamLibraryDocumentEntity;
  };
}

export type TeachhelperDb = TeachhelperDbSchema;

let dbPromise: Promise<IDBPDatabase<TeachhelperDbSchema>> | null = null;

function createStores(database: IDBPDatabase<TeachhelperDbSchema>) {
  Object.values(DB_STORES).forEach((storeName) => {
    if (!database.objectStoreNames.contains(storeName)) {
      database.createObjectStore(storeName);
    }
  });
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TeachhelperDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        createStores(database);
      }
    });
  }

  return dbPromise;
}

export async function resetDbForTests() {
  const db = await getDb();
  const storeNames = Object.values(DB_STORES);
  const tx = db.transaction(storeNames, "readwrite");

  await Promise.all(storeNames.map((storeName) => tx.objectStore(storeName).clear()));
  await tx.done;
}

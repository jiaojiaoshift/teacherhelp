import { getDb } from "@/lib/db/client";
import { DB_STORES } from "@/lib/db/schema";
import type {
  BinaryAssetEntity,
  CrossPageCandidateEntity,
  DocumentEntity,
  ExamLibraryDocumentEntity,
  ExamLibraryFolderEntity,
  ExamWorkspaceDraft,
  FolderEntity,
  MobileUploadTaskEntity,
  PageEntity,
  QuestionDraftEntity,
  UploadedFullPaperDraftEntity
} from "@/lib/domain/entities";
import type { DocumentProcessingTask } from "@/lib/services/document-task-service";

interface BulkConfirmationState {
  confirmationId: string;
  documentId: string;
  confirmedCount: number;
  undoSnapshots: Array<{
    id: string;
    status: QuestionDraftEntity["status"];
    classificationStatus: NonNullable<QuestionDraftEntity["classificationStatus"]>;
    lastBulkConfirmationId: string | null;
  }>;
}

export interface WorkspaceSnapshot {
  selectedPageId: string | null;
  documents: DocumentEntity[];
  pages: PageEntity[];
  folders: FolderEntity[];
  examLibraryFolders: ExamLibraryFolderEntity[];
  examLibraryDocuments: ExamLibraryDocumentEntity[];
  examWorkspaceDraft: ExamWorkspaceDraft;
  mobileUploadTasks: MobileUploadTaskEntity[];
  pendingUploadedFullPaperDraft: UploadedFullPaperDraftEntity | null;
  binaryAssets: BinaryAssetEntity[];
  questionDrafts: QuestionDraftEntity[];
  crossPageCandidates: CrossPageCandidateEntity[];
  manualMergeQuestionIds: string[];
  selectedQuestionId: string | null;
  lastBulkConfirmation: BulkConfirmationState | null;
  documentTasks?: DocumentProcessingTask[];
}

const SNAPSHOT_KEY = "workspace-latest";

export interface WorkspaceSnapshotRecord {
  id: string;
  snapshot: WorkspaceSnapshot;
}

type PendingWorkspaceSnapshotSave<T> = {
  snapshot: T;
  waiters: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
  }>;
};

export class LatestWorkspaceSnapshotSaveQueue<T> {
  private inFlight = false;
  private pendingSave: PendingWorkspaceSnapshotSave<T> | null = null;

  constructor(private readonly save: (snapshot: T) => Promise<void>) {}

  enqueue(snapshot: T): Promise<void> {
    const operation = new Promise<void>((resolve, reject) => {
      if (this.pendingSave) {
        this.pendingSave.snapshot = snapshot;
        this.pendingSave.waiters.push({ resolve, reject });
      } else {
        this.pendingSave = {
          snapshot,
          waiters: [{ resolve, reject }]
        };
      }
    });

    this.startSaveLoop();
    return operation;
  }

  private startSaveLoop() {
    if (this.inFlight) {
      return;
    }

    this.inFlight = true;
    void this.drainSaveQueue();
  }

  private async drainSaveQueue() {
    try {
      while (this.pendingSave) {
        const currentSave = this.pendingSave;
        this.pendingSave = null;

        try {
          await this.save(currentSave.snapshot);
          currentSave.waiters.forEach((waiter) => waiter.resolve());
        } catch (error) {
          currentSave.waiters.forEach((waiter) => waiter.reject(error));
        }
      }
    } finally {
      this.inFlight = false;
    }
  }
}

export class IndexedDbWorkspaceSnapshotRepository {
  async load(): Promise<WorkspaceSnapshot | null> {
    const db = await getDb();
    const record = (await db.get(DB_STORES.uiSnapshots, SNAPSHOT_KEY)) as
      | WorkspaceSnapshotRecord
      | undefined;

    return record?.snapshot ?? null;
  }

  async save(snapshot: WorkspaceSnapshot): Promise<void> {
    const db = await getDb();

    await db.put(
      DB_STORES.uiSnapshots,
      {
        id: SNAPSHOT_KEY,
        snapshot
      },
      SNAPSHOT_KEY
    );
  }
}

import { NextResponse } from "next/server";

import {
  DocumentTaskFilesystemRepository,
  DocumentTaskRevisionConflictError,
  InvalidDocumentTaskStoreError,
  isDocumentProcessingTask
} from "@/lib/server/document-task-filesystem-repository";
import type { DocumentProcessingTask } from "@/lib/services/document-task-service";

export const runtime = "nodejs";

interface DocumentTasksRequestBody {
  expectedRevision?: unknown;
  tasks?: unknown;
}

function isValidTasks(value: unknown): value is DocumentProcessingTask[] {
  return Array.isArray(value) && value.every(isDocumentProcessingTask);
}

export async function GET() {
  try {
    return NextResponse.json(await new DocumentTaskFilesystemRepository().load());
  } catch {
    return NextResponse.json({ error: "document_tasks_read_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as DocumentTasksRequestBody | null;

  if (
    !body ||
    !Number.isInteger(body.expectedRevision) ||
    (body.expectedRevision as number) < 0 ||
    !isValidTasks(body.tasks)
  ) {
    return NextResponse.json(
      { error: "invalid_document_tasks_payload" },
      { status: 400 }
    );
  }

  try {
    const result = await new DocumentTaskFilesystemRepository().save({
      expectedRevision: body.expectedRevision as number,
      tasks: body.tasks
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DocumentTaskRevisionConflictError) {
      return NextResponse.json(
        {
          error: "revision_conflict",
          actualRevision: error.actualRevision
        },
        { status: 409 }
      );
    }

    if (error instanceof InvalidDocumentTaskStoreError) {
      return NextResponse.json({ error: "document_tasks_write_failed" }, { status: 500 });
    }

    return NextResponse.json({ error: "document_tasks_write_failed" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  return POST(request);
}

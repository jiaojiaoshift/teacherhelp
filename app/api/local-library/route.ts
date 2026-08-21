import { NextResponse } from "next/server";

import {
  LocalLibraryFilesystemRepository,
  LocalLibraryRevisionConflictError,
  type LocalLibraryAssetBinary
} from "@/lib/server/local-library-filesystem-repository";
import type { LocalLibrarySnapshot } from "@/lib/services/local-library-contract";

export const runtime = "nodejs";

function isBlobFormValue(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Blob).arrayBuffer === "function" &&
    typeof (value as Blob).size === "number"
  );
}

function isLocalLibrarySnapshot(value: unknown): value is LocalLibrarySnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<LocalLibrarySnapshot>;

  return (
    Array.isArray(snapshot.folders) &&
    Array.isArray(snapshot.pages) &&
    Array.isArray(snapshot.binaryAssets) &&
    Array.isArray(snapshot.questionDrafts) &&
    Array.isArray(snapshot.examLibraryFolders) &&
    Array.isArray(snapshot.examLibraryDocuments) &&
    Boolean(snapshot.examWorkspaceDraft) &&
    typeof snapshot.examWorkspaceDraft === "object"
  );
}

export async function GET() {
  try {
    const payload = await new LocalLibraryFilesystemRepository().load();
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "local_library_read_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let expectedRevision: unknown;
  let snapshot: unknown;
  const assetBlobs = new Map<string, LocalLibraryAssetBinary>();
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.startsWith("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);
    const snapshotField = formData?.get("snapshot");

    if (!formData || typeof snapshotField !== "string") {
      return NextResponse.json({ error: "invalid_local_library_payload" }, { status: 400 });
    }

    expectedRevision = formData.get("expectedRevision");
    snapshot = JSON.parse(snapshotField) as unknown;

    for (const [fieldName, value] of formData.entries()) {
      if (!fieldName.startsWith("asset:") || !isBlobFormValue(value)) {
        continue;
      }

      assetBlobs.set(fieldName.slice("asset:".length), value);
    }
  } else {
    const body = (await request.json().catch(() => null)) as
      | { expectedRevision?: unknown; snapshot?: unknown }
      | null;
    expectedRevision = body?.expectedRevision;
    snapshot = body?.snapshot;
  }

  if (
    (typeof expectedRevision === "string"
      ? !/^\d+$/.test(expectedRevision)
      : !Number.isInteger(expectedRevision)) ||
    Number(expectedRevision) < 0 ||
    !isLocalLibrarySnapshot(snapshot)
  ) {
    return NextResponse.json({ error: "invalid_local_library_payload" }, { status: 400 });
  }

  try {
    const result = await new LocalLibraryFilesystemRepository().save({
      expectedRevision: Number(expectedRevision),
      snapshot,
      assetBlobs
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LocalLibraryRevisionConflictError) {
      return NextResponse.json(
        {
          error: "revision_conflict",
          actualRevision: error.actualRevision
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "local_library_write_failed" }, { status: 500 });
  }
}

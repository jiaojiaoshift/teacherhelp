import { NextResponse } from "next/server";

import { migrateLegacyLibraryToDesktop } from "@/lib/server/desktop-library-migration";
import { resolveTeachHelperStoragePaths } from "@/lib/server/teachhelper-storage-paths";

export const runtime = "nodejs";

export async function POST() {
  const sourceDirectory = process.env.TEACHHELPER_LEGACY_LIBRARY_PATH?.trim();

  if (!sourceDirectory) {
    return NextResponse.json({
      status: "skipped",
      reason: "source_not_configured"
    });
  }

  try {
    const result = await migrateLegacyLibraryToDesktop({
      sourceDirectory,
      targetDirectory: resolveTeachHelperStoragePaths().libraryDirectory
    });

    return NextResponse.json(
      result.status === "migrated"
        ? {
            status: result.status,
            fileCount: result.fileCount,
            byteLength: result.byteLength,
            sha256: result.sha256
          }
        : {
            status: result.status,
            reason: result.reason
          }
    );
  } catch {
    return NextResponse.json(
      { error: "desktop_library_migration_failed" },
      { status: 500 }
    );
  }
}

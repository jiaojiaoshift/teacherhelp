import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

import { resolveTeachHelperStoragePaths } from "@/lib/server/teachhelper-storage-paths";

function sanitizeToken(token: string) {
  const normalized = token.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160);
  return normalized || "pending-upload";
}

function resolvePendingUploadDirectory() {
  return path.join(resolveTeachHelperStoragePaths().tempDirectory, "mobile-upload-files");
}

export function resolveMobileUploadHelperFilePath(fileToken: string) {
  return path.join(resolvePendingUploadDirectory(), `${sanitizeToken(fileToken)}.pdf`);
}

export async function writeMobileUploadHelperFile(
  fileToken: string,
  bytes: ArrayBuffer | Uint8Array | Blob
) {
  const directory = resolvePendingUploadDirectory();
  const filePath = resolveMobileUploadHelperFilePath(fileToken);
  const temporaryPath = `${filePath}.tmp`;

  await mkdir(directory, { recursive: true });

  try {
    if (typeof Blob !== "undefined" && bytes instanceof Blob && typeof bytes.stream === "function") {
      await pipeline(
        Readable.fromWeb(
          bytes.stream() as Parameters<typeof Readable.fromWeb>[0]
        ),
        createWriteStream(temporaryPath)
      );
    } else if (bytes instanceof ArrayBuffer) {
      await writeFile(temporaryPath, new Uint8Array(bytes));
    } else if (bytes instanceof Uint8Array) {
      await writeFile(temporaryPath, bytes);
    } else {
      await writeFile(temporaryPath, new Uint8Array(await bytes.arrayBuffer()));
    }

    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }

  return filePath;
}

export async function readMobileUploadHelperFile(fileToken: string) {
  return await readFile(resolveMobileUploadHelperFilePath(fileToken));
}

export function createMobileUploadHelperFileReadStream(fileToken: string) {
  return createReadStream(resolveMobileUploadHelperFilePath(fileToken));
}

export async function getMobileUploadHelperFileByteLength(fileToken: string) {
  const fileStats = await stat(resolveMobileUploadHelperFilePath(fileToken));
  return fileStats.size;
}

export async function removeMobileUploadHelperFile(fileToken: string) {
  await rm(resolveMobileUploadHelperFilePath(fileToken), { force: true });
}

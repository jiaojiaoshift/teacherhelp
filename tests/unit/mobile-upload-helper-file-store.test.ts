import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMobileUploadHelperFileReadStream,
  readMobileUploadHelperFile,
  removeMobileUploadHelperFile,
  resolveMobileUploadHelperFilePath,
  writeMobileUploadHelperFile
} from "@/lib/server/mobile-upload-helper-file-store";

describe("mobile upload helper file store", () => {
  const fileToken = "test-pending-upload-400-pages";

  afterEach(async () => {
    await removeMobileUploadHelperFile(fileToken);
    vi.unstubAllEnvs();
  });

  it("writes and reads a pending upload without converting it to base64", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);

    await writeMobileUploadHelperFile(fileToken, bytes);

    expect(existsSync(resolveMobileUploadHelperFilePath(fileToken))).toBe(true);
    expect(await readMobileUploadHelperFile(fileToken)).toEqual(Buffer.from(bytes));

    await removeMobileUploadHelperFile(fileToken);
    expect(existsSync(resolveMobileUploadHelperFilePath(fileToken))).toBe(false);
  });

  it("writes a Blob through its stream without reading the whole Blob as an ArrayBuffer", async () => {
    const blob = new Blob([new Uint8Array([37, 80, 68, 70])], {
      type: "application/pdf"
    });
    Object.defineProperty(blob, "stream", {
      configurable: true,
      value: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([37, 80, 68, 70]));
            controller.close();
          }
        })
    });
    const arrayBufferSpy = vi.spyOn(blob, "arrayBuffer");

    await writeMobileUploadHelperFile(fileToken, blob);

    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(await readMobileUploadHelperFile(fileToken)).toEqual(
      Buffer.from([37, 80, 68, 70])
    );
  });

  it("exposes a read stream for large files instead of requiring a full Buffer", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49]);
    await writeMobileUploadHelperFile(fileToken, bytes);

    const chunks: Buffer[] = [];
    for await (const chunk of createMobileUploadHelperFileReadStream(fileToken)) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    expect(Buffer.concat(chunks)).toEqual(Buffer.from(bytes));
  });
});

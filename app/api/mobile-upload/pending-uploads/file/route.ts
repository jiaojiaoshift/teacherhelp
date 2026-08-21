import { NextResponse } from "next/server";
import { Readable } from "node:stream";

import {
  createMobileUploadHelperFileReadStream,
  getMobileUploadHelperFileByteLength
} from "@/lib/server/mobile-upload-helper-file-store";
import {
  getMobileUploadHelperPendingUploads,
  getMobileUploadHelperProcessedFullPaperDrafts,
  getMobileUploadHelperProcessedLectureUploads,
  getMobileUploadHelperProcessedQuestionBankImports
} from "@/lib/server/mobile-upload-helper-state";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  const pendingUpload = id
    ? getMobileUploadHelperPendingUploads().find((upload) => upload.id === id)
    : null;
  const processedDraft = id
    ? getMobileUploadHelperProcessedFullPaperDrafts().find((draft) => draft.id === id)
    : null;
  const processedImport = id
    ? getMobileUploadHelperProcessedQuestionBankImports().find(
        (currentImport) => currentImport.id === id
      )
    : null;
  const processedLectureUpload = id
    ? getMobileUploadHelperProcessedLectureUploads().find(
        (currentUpload) => currentUpload.id === id
      )
    : null;

  const fileToken =
    pendingUpload?.fileToken ??
    processedDraft?.sourceFileToken ??
    processedImport?.sourceFileToken ??
    processedLectureUpload?.sourceFileToken;

  if (!fileToken) {
    return NextResponse.json(
      { errorMessage: "移动上传临时文件不存在" },
      { status: 404 }
    );
  }

  try {
    const byteLength = await getMobileUploadHelperFileByteLength(fileToken);
    const stream = createMobileUploadHelperFileReadStream(fileToken);

    return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": pendingUpload?.mimeType ?? "application/pdf",
        "Content-Length": String(byteLength),
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json(
      { errorMessage: "移动上传临时文件读取失败" },
      { status: 404 }
    );
  }
}

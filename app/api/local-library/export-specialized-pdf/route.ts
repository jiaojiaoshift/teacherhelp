import { NextResponse } from "next/server";

import { LocalLibraryFilesystemRepository } from "@/lib/server/local-library-filesystem-repository";
import { buildSpecializedPaperPdf } from "@/lib/server/specialized-paper-pdf-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const documentId = new URL(request.url).searchParams.get("documentId")?.trim();

  if (!documentId) {
    return NextResponse.json({ error: "invalid_document_id" }, { status: 400 });
  }

  try {
    const repository = new LocalLibraryFilesystemRepository();
    const { snapshot } = await repository.load();
    const document = snapshot.examLibraryDocuments.find(
      (candidate) =>
        candidate.id === documentId &&
        candidate.library === "specialized" &&
        candidate.kind === "paper"
    );

    if (!document) {
      return NextResponse.json({ error: "specialized_paper_not_found" }, { status: 404 });
    }

    const pdf = await buildSpecializedPaperPdf({
      document: {
        title: document.title,
        numberingMode: document.numberingMode,
        questionIds: document.questionIds,
        questionBlocks: document.questionBlocks
      },
      questions: snapshot.questionDrafts,
      pages: snapshot.pages,
      readAsset: (assetId) => repository.readAsset(assetId)
    });

    return new Response(Uint8Array.from(pdf.data), {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(pdf.fileName)}`,
        "Content-Type": "application/pdf"
      }
    });
  } catch {
    return NextResponse.json({ error: "specialized_pdf_export_failed" }, { status: 500 });
  }
}

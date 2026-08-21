import { NextResponse } from "next/server";

import {
  DurableAnswerStageIncompleteError,
  DurableAnswerStageValidationError,
  resumeDurableAnswerStage
} from "@/lib/server/durable-answer-stage-service";
import { LocalLibraryRevisionConflictError } from "@/lib/server/local-library-filesystem-repository";
import { validateUploadByteLength } from "@/lib/services/upload-capacity";

export const runtime = "nodejs";

function isUploadedPdf(value: FormDataEntryValue | null): value is File {
  return (
    value !== null &&
    typeof value !== "string" &&
    value.type.toLowerCase() === "application/pdf" &&
    value.size > 0
  );
}

function parseNonNegativeInteger(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function buildSafeErrorDiagnostic(error: unknown) {
  if (!(error instanceof Error)) {
    return { name: "UnknownError", code: null, stackFrames: [] };
  }

  const code = (error as Error & { code?: unknown }).code;
  const stackFrames = (error.stack ?? "")
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.includes("teachhelper"))
    .slice(0, 8);

  return {
    name: error.name || "Error",
    code: typeof code === "string" || typeof code === "number" ? code : null,
    stackFrames
  };
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file") ?? null;
  const documentId = String(formData?.get("documentId") ?? "").trim();
  const expectedRevision = parseNonNegativeInteger(formData?.get("expectedRevision") ?? null);
  const answerStartPage = parseNonNegativeInteger(formData?.get("answerStartPage") ?? null);

  if (
    !isUploadedPdf(file) ||
    !documentId ||
    expectedRevision === null ||
    answerStartPage === null ||
    answerStartPage < 1
  ) {
    return NextResponse.json({ error: "invalid_answer_stage_request" }, { status: 400 });
  }

  const fileSizeValidation = validateUploadByteLength(file.size);

  if (!fileSizeValidation.ok) {
    return NextResponse.json(
      { error: fileSizeValidation.code, errorMessage: fileSizeValidation.message },
      { status: 413 }
    );
  }

  try {
    const result = await resumeDurableAnswerStage({
      expectedRevision,
      documentId,
      answerStartPage,
      pdfArrayBuffer: await file.arrayBuffer()
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

    if (error instanceof DurableAnswerStageValidationError) {
      return NextResponse.json({ error: "invalid_answer_stage_target" }, { status: 400 });
    }

    if (error instanceof DurableAnswerStageIncompleteError) {
      return NextResponse.json({ error: "answer_detection_incomplete" }, { status: 422 });
    }

    console.error("[resume-answer-stage] failed", buildSafeErrorDiagnostic(error));
    return NextResponse.json({ error: "answer_stage_failed" }, { status: 500 });
  }
}

import {
  buildLectureArchiveUploadFileName,
  validateLectureArchiveNamingDraft
} from "../domain/lecture-archive-naming";
import { validateMobileUploadFileSize } from "../domain/upload-capacity";
import type {
  LectureArchiveNamingDraft,
  MobileUploadKind,
  MobileUploadPairingQrPayload,
  MobileUploadTargetNode
} from "../domain/upload-types";

export interface MobileUploadHttpError extends Error {
  status?: number;
}

type FetchLike = typeof fetch;

export interface FetchWorkspaceTargetNodesResult {
  uploadKind: MobileUploadKind;
  targetNodes: MobileUploadTargetNode[];
}

export interface UploadPdfRequestInput {
  pairing: MobileUploadPairingQrPayload;
  deviceId: string;
  uploadKind: MobileUploadKind;
  targetNode: MobileUploadTargetNode;
  fileName: string;
  fileBlob: Blob;
  fetchImpl?: FetchLike;
}

export interface DownloadPrimaryLectureResult {
  blob: Blob;
  fileName: string;
}

function joinHelperUrl(helperBaseUrl: string, relativePath: string) {
  return new URL(relativePath, helperBaseUrl.endsWith("/") ? helperBaseUrl : `${helperBaseUrl}/`).toString();
}

function createHttpError(message: string, status?: number): MobileUploadHttpError {
  const error = new Error(message) as MobileUploadHttpError;

  error.status = status;

  return error;
}

async function readJsonBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  return (await response.json()) as Record<string, unknown>;
}

function parseLectureArchiveDraftFromFileName(fileName: string): LectureArchiveNamingDraft | null {
  const baseName = fileName.replace(/\.pdf$/i, "");
  const [studentName, gradeLabel, year, month, day, ...rest] = baseName.split("_");

  if (rest.length > 0 || !studentName || !gradeLabel || !year || !month || !day) {
    return null;
  }

  return {
    studentName,
    gradeLabel,
    year,
    month,
    day
  };
}

async function extractHttpError(response: Response) {
  const payload = await readJsonBody(response);
  const errorMessage =
    (typeof payload?.errorMessage === "string" && payload.errorMessage) ||
    `请求失败（${response.status}）`;

  return createHttpError(errorMessage, response.status);
}

function parseContentDispositionFileName(contentDisposition: string | null) {
  if (!contentDisposition) {
    return "primary-lecture.pdf";
  }

  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);

  if (encodedMatch?.[1]) {
    return decodeURIComponent(encodedMatch[1]);
  }

  const quotedMatch = contentDisposition.match(/filename="([^"]+)"/i);

  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  return "primary-lecture.pdf";
}

export function buildWorkspaceTargetNodesUrl(input: {
  helperBaseUrl: string;
  uploadKind: MobileUploadKind;
}) {
  const url = new URL(
    joinHelperUrl(input.helperBaseUrl, "/api/mobile-upload/workspace-sync")
  );

  url.searchParams.set("uploadKind", input.uploadKind);

  return url.toString();
}

export function buildPrimaryLectureDownloadUrl(input: {
  helperBaseUrl: string;
  documentId: string;
  pairedSessionId: string;
  deviceId: string;
}) {
  const url = new URL(
    joinHelperUrl(input.helperBaseUrl, "/api/mobile-upload/primary-lecture")
  );

  url.searchParams.set("documentId", input.documentId);
  url.searchParams.set("pairedSessionId", input.pairedSessionId);
  url.searchParams.set("deviceId", input.deviceId);

  return url.toString();
}

export function resolveUploadRequestFileName(input: {
  uploadKind: MobileUploadKind;
  selectedFileName: string;
  lectureArchiveDraft: LectureArchiveNamingDraft | null;
}) {
  if (input.uploadKind !== "lecture_archive_pdf") {
    return input.selectedFileName;
  }

  if (!input.lectureArchiveDraft) {
    return input.selectedFileName;
  }

  return buildLectureArchiveUploadFileName(input.lectureArchiveDraft);
}

export async function fetchWorkspaceTargetNodes(input: {
  helperBaseUrl: string;
  uploadKind: MobileUploadKind;
  fetchImpl?: FetchLike;
}) {
  const response = await (input.fetchImpl ?? fetch)(
    buildWorkspaceTargetNodesUrl({
      helperBaseUrl: input.helperBaseUrl,
      uploadKind: input.uploadKind
    })
  );

  if (!response.ok) {
    throw await extractHttpError(response);
  }

  return (await response.json()) as FetchWorkspaceTargetNodesResult;
}

export async function uploadMobilePdf(input: UploadPdfRequestInput) {
  const fileSizeValidation = validateMobileUploadFileSize(input.fileBlob.size);

  if (!fileSizeValidation.ok) {
    throw createHttpError(fileSizeValidation.message, 413);
  }

  if (input.uploadKind === "lecture_archive_pdf") {
    const namingDraft = parseLectureArchiveDraftFromFileName(input.fileName);
    const validationResult = namingDraft
      ? validateLectureArchiveNamingDraft(namingDraft)
      : {
          isValid: false,
          errors: {
            studentName: "讲义归档文件名不符合命名规则"
          }
        };

    if (!validationResult.isValid) {
      throw createHttpError("讲义归档文件名不符合命名规则");
    }
  }

  const formData = new FormData();

  formData.append("file", input.fileBlob, input.fileName);
  formData.append("fileName", input.fileName);
  formData.append("deviceId", input.deviceId);
  formData.append("pairedSessionId", input.pairing.pairingSessionId);
  formData.append("uploadKind", input.uploadKind);
  formData.append("targetNodeId", input.targetNode.id);
  formData.append("targetNodePath", JSON.stringify(input.targetNode.path));

  const response = await (input.fetchImpl ?? fetch)(
    joinHelperUrl(input.pairing.helperBaseUrl, "/api/mobile-upload/receive"),
    {
      method: "POST",
      body: formData
    }
  );

  if (!response.ok) {
    throw await extractHttpError(response);
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function downloadPrimaryLecturePdf(input: {
  helperBaseUrl: string;
  documentId: string;
  pairedSessionId: string;
  deviceId: string;
  fetchImpl?: FetchLike;
}) {
  const response = await (input.fetchImpl ?? fetch)(
    buildPrimaryLectureDownloadUrl({
      helperBaseUrl: input.helperBaseUrl,
      documentId: input.documentId,
      pairedSessionId: input.pairedSessionId,
      deviceId: input.deviceId
    })
  );

  if (!response.ok) {
    throw await extractHttpError(response);
  }

  return {
    blob: await response.blob(),
    fileName: parseContentDispositionFileName(
      response.headers.get("content-disposition")
    )
  } satisfies DownloadPrimaryLectureResult;
}

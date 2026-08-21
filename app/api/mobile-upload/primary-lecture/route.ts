import {
  getActiveMobileUploadPairingSession,
  getMobileUploadHelperWorkspaceSnapshot,
  setActiveMobileUploadPairingSession,
  setMobileUploadHelperWorkspaceSnapshot
} from "@/lib/server/mobile-upload-helper-state";
import {
  registerPairedMobileUploadDevice,
  resolveMobileUploadPairingSessionState
} from "@/lib/services/mobile-upload-pairing-service";
import { buildHelperPrimaryLectureDownload } from "@/lib/services/mobile-upload-primary-lecture-download-service";

function buildPdfDownloadDisposition(fileName: string) {
  return `attachment; filename="primary-lecture.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId") ?? "";
  const pairedSessionId = searchParams.get("pairedSessionId") ?? "";
  const deviceId = (searchParams.get("deviceId") ?? "").trim();
  const activePairingSession = getActiveMobileUploadPairingSession();

  if (!deviceId) {
    return Response.json(
      {
        status: "rejected",
        errorMessage: "\u79fb\u52a8\u8bbe\u5907\u6807\u8bc6\u65e0\u6548"
      },
      {
        status: 400
      }
    );
  }

  if (!activePairingSession || activePairingSession.id !== pairedSessionId) {
    return Response.json(
      {
        status: "rejected",
        errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u914d\u5bf9\u4f1a\u8bdd\u65e0\u6548"
      },
      {
        status: 409
      }
    );
  }

  if (resolveMobileUploadPairingSessionState(activePairingSession) === "expired") {
    return Response.json(
      {
        status: "rejected",
        errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u914d\u5bf9\u4f1a\u8bdd\u5df2\u8fc7\u671f"
      },
      {
        status: 409
      }
    );
  }

  const pairedSession = registerPairedMobileUploadDevice({
    session: activePairingSession,
    deviceId
  });

  setActiveMobileUploadPairingSession(pairedSession);

  const workspaceSnapshot = getMobileUploadHelperWorkspaceSnapshot();

  if (!workspaceSnapshot) {
    return Response.json(
      {
        status: "rejected",
        errorMessage: "\u4e3b\u8bb2\u4e49\u6587\u6863\u4e0d\u5b58\u5728"
      },
      {
        status: 404
      }
    );
  }

  const result = await buildHelperPrimaryLectureDownload({
    documentId,
    examLibraryDocuments: workspaceSnapshot.examLibraryDocuments,
    questionDrafts: workspaceSnapshot.questionDrafts ?? []
  });

  if (result.status === "rejected") {
    return Response.json(result, {
      status: 404
    });
  }

  setMobileUploadHelperWorkspaceSnapshot({
    questionFolders: workspaceSnapshot.questionFolders,
    examLibraryFolders: workspaceSnapshot.examLibraryFolders,
    examLibraryDocuments: result.examLibraryDocuments,
    mobileUploadTasks: workspaceSnapshot.mobileUploadTasks,
    ...(workspaceSnapshot.questionDrafts
      ? {
          questionDrafts: workspaceSnapshot.questionDrafts
        }
      : {})
  });

  const pdfBuffer = await result.blob.arrayBuffer();

  return new Response(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": buildPdfDownloadDisposition(result.fileName)
    }
  });
}


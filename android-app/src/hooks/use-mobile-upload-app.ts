import { startTransition, useEffect, useState } from "react";

import * as DocumentPicker from "expo-document-picker";
import { fetch as expoFetch } from "expo/fetch";
import { Directory, File as ExpoFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import {
  buildMobileUploadTargetTree
} from "../domain/target-tree";
import {
  buildLectureArchiveUploadFileName,
  validateLectureArchiveNamingDraft
} from "../domain/lecture-archive-naming";
import {
  parseMobileUploadPairingQrPayload
} from "../domain/pairing";
import { validateMobileUploadFileSize } from "../domain/upload-capacity";
import type {
  LectureArchiveNamingDraft,
  MobileUploadKind,
  MobileUploadPairingQrPayload,
  MobileUploadTargetNode,
  MobileUploadTargetTreeNode
} from "../domain/upload-types";
import {
  downloadPrimaryLecturePdf,
  fetchWorkspaceTargetNodes,
  resolveUploadRequestFileName,
  uploadMobilePdf
} from "../services/mobile-upload-api";
import {
  loadStoredDeviceId,
  loadStoredPairingPayload,
  saveStoredDeviceId,
  saveStoredPairingPayload
} from "../services/device-session-storage";

interface SelectedPdfAsset {
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
}

interface AppStatus {
  tone: "neutral" | "success" | "error";
  title: string;
  detail: string;
}

function createTwoDigit(value: number) {
  return String(value).padStart(2, "0");
}

function createInitialLectureArchiveDraft(): LectureArchiveNamingDraft {
  const now = new Date();

  return {
    studentName: "",
    gradeLabel: "",
    year: createTwoDigit(now.getFullYear() % 100),
    month: createTwoDigit(now.getMonth() + 1),
    day: createTwoDigit(now.getDate())
  };
}

function createDeviceId() {
  return `android-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function toReadableError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "发生未知错误";
}

export function useMobileUploadApp() {
  const [deviceId, setDeviceId] = useState("");
  const [pairingPayload, setPairingPayload] =
    useState<MobileUploadPairingQrPayload | null>(null);
  const [manualPairingPayloadText, setManualPairingPayloadText] = useState("");
  const [selectedUploadKind, setSelectedUploadKind] =
    useState<MobileUploadKind>("question_bank_pdf");
  const [targetNodes, setTargetNodes] = useState<MobileUploadTargetNode[]>([]);
  const [targetTree, setTargetTree] = useState<MobileUploadTargetTreeNode[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<SelectedPdfAsset | null>(null);
  const [lectureArchiveDraft, setLectureArchiveDraft] =
    useState<LectureArchiveNamingDraft>(createInitialLectureArchiveDraft);
  const [status, setStatus] = useState<AppStatus>({
    tone: "neutral",
    title: "等待配对",
    detail: "先扫描 PC 页面上的二维码，或粘贴二维码 JSON 内容。"
  });
  const [isBusy, setIsBusy] = useState(false);
  const [lastDownloadedLectureUri, setLastDownloadedLectureUri] =
    useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const storedDeviceId = await loadStoredDeviceId();
      const nextDeviceId = storedDeviceId || createDeviceId();

      if (!storedDeviceId) {
        await saveStoredDeviceId(nextDeviceId);
      }

      setDeviceId(nextDeviceId);

      const storedPairingPayload = await loadStoredPairingPayload();

      if (storedPairingPayload) {
        setPairingPayload(storedPairingPayload);
        setManualPairingPayloadText(JSON.stringify(storedPairingPayload, null, 2));
        setStatus({
          tone: "success",
          title: "已恢复上次配对",
          detail: storedPairingPayload.helperBaseUrl
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (!pairingPayload) {
      setTargetNodes([]);
      setTargetTree([]);
      setSelectedTargetId(null);
      return;
    }

    void refreshTargets(selectedUploadKind, pairingPayload);
  }, [pairingPayload, selectedUploadKind]);

  const selectedTargetNode =
    targetNodes.find((node) => node.id === selectedTargetId) ?? null;

  const uploadFileName = resolveUploadRequestFileName({
    uploadKind: selectedUploadKind,
    selectedFileName: selectedPdf?.name ?? "upload.pdf",
    lectureArchiveDraft:
      selectedUploadKind === "lecture_archive_pdf" ? lectureArchiveDraft : null
  });

  async function refreshTargets(
    uploadKind = selectedUploadKind,
    activePairing = pairingPayload
  ) {
    if (!activePairing) {
      return;
    }

    setIsBusy(true);

    try {
      const result = await fetchWorkspaceTargetNodes({
        helperBaseUrl: activePairing.helperBaseUrl,
        uploadKind,
        fetchImpl: expoFetch as typeof fetch
      });
      const nextTree = buildMobileUploadTargetTree(result.targetNodes);

      startTransition(() => {
        setTargetNodes(result.targetNodes);
        setTargetTree(nextTree);
        setSelectedTargetId((current) =>
          result.targetNodes.some((node) => node.id === current)
            ? current
            : result.targetNodes[0]?.id ?? null
        );
      });
      setStatus({
        tone: "success",
        title: "目录树已刷新",
        detail: `已获取 ${result.targetNodes.length} 个可选节点`
      });
    } catch (error) {
      setStatus({
        tone: "error",
        title: "目录树加载失败",
        detail: toReadableError(error)
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function applyPairingPayloadText(rawValue: string) {
    const result = parseMobileUploadPairingQrPayload(rawValue);

    if (result.status === "invalid") {
      setStatus({
        tone: "error",
        title: "配对失败",
        detail: result.errorMessage
      });
      return false;
    }

    await saveStoredPairingPayload(result.value);
    setPairingPayload(result.value);
    setManualPairingPayloadText(JSON.stringify(result.value, null, 2));
    setStatus({
      tone: "success",
      title: "配对成功",
      detail: `${result.value.helperBaseUrl} / 会话 ${result.value.pairingCode}`
    });

    return true;
  }

  async function applyScannedPairingPayload(rawValue: string) {
    return await applyPairingPayloadText(rawValue);
  }

  function updateLectureArchiveField(
    field: keyof LectureArchiveNamingDraft,
    value: string
  ) {
    setLectureArchiveDraft((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function pickPdf() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];

    if (!asset) {
      return;
    }

    setSelectedPdf({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? "application/pdf",
      size: asset.size ?? null
    });
    setStatus({
      tone: "success",
      title: "PDF 已选择",
      detail: asset.name
    });
  }

  async function uploadSelectedPdf() {
    if (!pairingPayload) {
      setStatus({
        tone: "error",
        title: "无法上传",
        detail: "请先完成配对。"
      });
      return;
    }

    if (!selectedTargetNode) {
      setStatus({
        tone: "error",
        title: "无法上传",
        detail: "请先选择目标目录或主讲义文档。"
      });
      return;
    }

    if (!selectedPdf) {
      setStatus({
        tone: "error",
        title: "无法上传",
        detail: "请先选择一个 PDF 文件。"
      });
      return;
    }

    if (selectedPdf.size !== null) {
      const fileSizeValidation = validateMobileUploadFileSize(selectedPdf.size);

      if (!fileSizeValidation.ok) {
        setStatus({
          tone: "error",
          title: "文件过大",
          detail: fileSizeValidation.message
        });
        return;
      }
    }

    if (selectedUploadKind === "lecture_archive_pdf") {
      const validationResult = validateLectureArchiveNamingDraft(
        lectureArchiveDraft
      );

      if (!validationResult.isValid) {
        setStatus({
          tone: "error",
          title: "命名未通过校验",
          detail: Object.values(validationResult.errors).join("；")
        });
        return;
      }
    }

    setIsBusy(true);

    try {
      const file = new ExpoFile(selectedPdf.uri);

      await uploadMobilePdf({
        pairing: pairingPayload,
        deviceId,
        uploadKind: selectedUploadKind,
        targetNode: selectedTargetNode,
        fileName: uploadFileName,
        fileBlob: file,
        fetchImpl: expoFetch as typeof fetch
      });
      setStatus({
        tone: "success",
        title: "上传成功",
        detail: `${uploadFileName} 已发送到 ${selectedTargetNode.name}`
      });
    } catch (error) {
      setStatus({
        tone: "error",
        title: "上传失败",
        detail: toReadableError(error)
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function downloadPrimaryLecture() {
    if (!pairingPayload || !selectedTargetNode) {
      setStatus({
        tone: "error",
        title: "无法下载",
        detail: "请先完成配对并选择主讲义文档。"
      });
      return;
    }

    setIsBusy(true);

    try {
      const result = await downloadPrimaryLecturePdf({
        helperBaseUrl: pairingPayload.helperBaseUrl,
        documentId: selectedTargetNode.id,
        pairedSessionId: pairingPayload.pairingSessionId,
        deviceId,
        fetchImpl: expoFetch as typeof fetch
      });
      const directory = new Directory(Paths.document, "teachhelper-primary-lectures");

      directory.create({
        idempotent: true,
        intermediates: true
      });

      const file = new ExpoFile(directory, result.fileName);

      file.create({
        overwrite: true,
        intermediates: true
      });
      file.write(new Uint8Array(await result.blob.arrayBuffer()));
      setLastDownloadedLectureUri(file.uri);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/pdf",
          dialogTitle: "打开或分享主讲义 PDF"
        });
      }

      setStatus({
        tone: "success",
        title: "主讲义已下载",
        detail: file.uri
      });
    } catch (error) {
      setStatus({
        tone: "error",
        title: "主讲义下载失败",
        detail: toReadableError(error)
      });
    } finally {
      setIsBusy(false);
    }
  }

  return {
    deviceId,
    pairingPayload,
    manualPairingPayloadText,
    selectedUploadKind,
    targetTree,
    selectedTargetId,
    selectedTargetNode,
    selectedPdf,
    lectureArchiveDraft,
    lectureArchivePreviewName: buildLectureArchiveUploadFileName(
      lectureArchiveDraft
    ),
    uploadFileName,
    status,
    isBusy,
    lastDownloadedLectureUri,
    setManualPairingPayloadText,
    setSelectedUploadKind,
    setSelectedTargetId,
    applyPairingPayloadText,
    applyScannedPairingPayload,
    refreshTargets,
    updateLectureArchiveField,
    pickPdf,
    uploadSelectedPdf,
    downloadPrimaryLecture
  };
}

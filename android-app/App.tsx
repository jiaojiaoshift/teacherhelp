import { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { SectionCard } from "./src/components/section-card";
import { TargetNodeTree } from "./src/components/target-node-tree";
import { UploadKindPicker } from "./src/components/upload-kind-picker";
import { useMobileUploadApp } from "./src/hooks/use-mobile-upload-app";

export default function App() {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const app = useMobileUploadApp();

  const statusBoxStyle =
    app.status.tone === "success"
      ? styles.statusSuccess
      : app.status.tone === "error"
        ? styles.statusError
        : styles.statusNeutral;

  const handleOpenScanner = async () => {
    if (!cameraPermission?.granted) {
      const permissionResult = await requestCameraPermission();

      if (!permissionResult.granted) {
        return;
      }
    }

    setScannerOpen(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>TeachHelper Android</Text>
          <Text style={styles.heroTitle}>手机上传、主讲义往返、局域网直连</Text>
          <Text style={styles.heroDescription}>
            使用 PC 页面二维码配对后，手机端可直接投递题库 PDF、套卷 PDF、讲义归档和主讲义更新。
          </Text>
          <View style={styles.heroMetaRow}>
            <Text style={styles.heroMetaLabel}>设备 ID</Text>
            <Text style={styles.heroMetaValue}>{app.deviceId || "初始化中..."}</Text>
          </View>
        </View>

        <SectionCard
          title="1. 配对"
          description="优先扫描 PC 页面二维码；如果临时无法扫码，也可以直接粘贴二维码 JSON。"
        >
          <View style={styles.buttonRow}>
            <Pressable onPress={handleOpenScanner} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {scannerOpen ? "重新扫码" : "打开扫码器"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => app.applyPairingPayloadText(app.manualPairingPayloadText)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>应用粘贴内容</Text>
            </Pressable>
          </View>

          {scannerOpen ? (
            <View style={styles.scannerShell}>
              <CameraView
                style={styles.scanner}
                barcodeScannerSettings={{
                  barcodeTypes: ["qr"]
                }}
                onBarcodeScanned={async ({ data }) => {
                  const applied = await app.applyScannedPairingPayload(data);

                  if (applied) {
                    setScannerOpen(false);
                  }
                }}
              />
            </View>
          ) : null}

          <TextInput
            value={app.manualPairingPayloadText}
            onChangeText={app.setManualPairingPayloadText}
            multiline
            placeholder='粘贴二维码 JSON，例如 {"type":"teachhelper_mobile_upload_pairing", ... }'
            placeholderTextColor="#8b8f88"
            style={styles.multilineInput}
          />

          {app.pairingPayload ? (
            <View style={styles.infoPanel}>
              <Text style={styles.infoTitle}>当前已配对</Text>
              <Text style={styles.infoText}>
                地址：{app.pairingPayload.helperBaseUrl}
              </Text>
              <Text style={styles.infoText}>
                会话：{app.pairingPayload.pairingCode}
              </Text>
            </View>
          ) : null}
        </SectionCard>

        <SectionCard
          title="2. 上传用途与目标树"
          description="用途不同，PC 返回的目录树也不同。讲义归档走三级目录；主讲义回传走主讲义文档节点。"
        >
          <UploadKindPicker
            selectedValue={app.selectedUploadKind}
            onChange={app.setSelectedUploadKind}
          />

          <Pressable
            onPress={() => app.refreshTargets()}
            style={styles.ghostButton}
          >
            <Text style={styles.ghostButtonText}>刷新目标树</Text>
          </Pressable>

          <TargetNodeTree
            nodes={app.targetTree}
            selectedTargetId={app.selectedTargetId}
            onSelect={(target) => app.setSelectedTargetId(target.id)}
          />
        </SectionCard>

        {app.selectedUploadKind === "lecture_archive_pdf" ? (
          <SectionCard
            title="3. 讲义归档命名"
            description="上传讲义归档时文件名固定为：姓名_年级_年_月_日.pdf。"
          >
            <View style={styles.gridRow}>
              <TextInput
                value={app.lectureArchiveDraft.studentName}
                onChangeText={(value) =>
                  app.updateLectureArchiveField("studentName", value)
                }
                placeholder="姓名"
                placeholderTextColor="#8b8f88"
                style={[styles.singleInput, styles.flexTwo]}
              />
              <TextInput
                value={app.lectureArchiveDraft.gradeLabel}
                onChangeText={(value) =>
                  app.updateLectureArchiveField("gradeLabel", value)
                }
                placeholder="年级"
                placeholderTextColor="#8b8f88"
                style={styles.singleInput}
              />
            </View>
            <View style={styles.gridRow}>
              <TextInput
                value={app.lectureArchiveDraft.year}
                onChangeText={(value) => app.updateLectureArchiveField("year", value)}
                placeholder="年"
                keyboardType="number-pad"
                placeholderTextColor="#8b8f88"
                style={styles.singleInput}
              />
              <TextInput
                value={app.lectureArchiveDraft.month}
                onChangeText={(value) => app.updateLectureArchiveField("month", value)}
                placeholder="月"
                keyboardType="number-pad"
                placeholderTextColor="#8b8f88"
                style={styles.singleInput}
              />
              <TextInput
                value={app.lectureArchiveDraft.day}
                onChangeText={(value) => app.updateLectureArchiveField("day", value)}
                placeholder="日"
                keyboardType="number-pad"
                placeholderTextColor="#8b8f88"
                style={styles.singleInput}
              />
            </View>

            <View style={styles.previewPanel}>
              <Text style={styles.previewLabel}>预览文件名</Text>
              <Text style={styles.previewValue}>{app.lectureArchivePreviewName}</Text>
            </View>
          </SectionCard>
        ) : null}

        <SectionCard
          title="4. PDF 操作"
          description="题库 PDF、套卷 PDF、讲义归档直接上传；主讲义模式可先下载当前版本，再上传编辑后的 PDF。"
        >
          <View style={styles.buttonRow}>
            <Pressable onPress={app.pickPdf} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>选择 PDF</Text>
            </Pressable>
            <Pressable
              onPress={app.uploadSelectedPdf}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                {app.isBusy ? "处理中..." : "上传到 PC"}
              </Text>
            </Pressable>
          </View>

          {app.selectedUploadKind === "primary_lecture_pdf" ? (
            <Pressable
              onPress={app.downloadPrimaryLecture}
              style={styles.ghostButton}
            >
              <Text style={styles.ghostButtonText}>下载当前主讲义</Text>
            </Pressable>
          ) : null}

          <View style={styles.infoPanel}>
            <Text style={styles.infoTitle}>当前准备上传</Text>
            <Text style={styles.infoText}>
              目标：{app.selectedTargetNode?.name ?? "未选择"}
            </Text>
            <Text style={styles.infoText}>
              文件：{app.selectedPdf?.name ?? "未选择 PDF"}
            </Text>
            <Text style={styles.infoText}>提交名：{app.uploadFileName}</Text>
            {app.lastDownloadedLectureUri ? (
              <Text style={styles.infoText}>
                最近下载：{app.lastDownloadedLectureUri}
              </Text>
            ) : null}
          </View>
        </SectionCard>

        <SectionCard
          title="5. 状态"
          description="所有网络结果和校验结果都会写在这里，便于手机端定位问题。"
        >
          <View style={[styles.statusBox, statusBoxStyle]}>
            <Text style={styles.statusTitle}>{app.status.title}</Text>
            <Text style={styles.statusDetail}>{app.status.detail}</Text>
          </View>
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#efe8dc"
  },
  scrollContent: {
    padding: 18,
    gap: 16
  },
  hero: {
    backgroundColor: "#0f766e",
    borderRadius: 28,
    padding: 22,
    gap: 8
  },
  heroEyebrow: {
    color: "#d6fbf1",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  heroTitle: {
    color: "#f8fafc",
    fontSize: 29,
    fontWeight: "800",
    lineHeight: 36
  },
  heroDescription: {
    color: "#d7efe9",
    fontSize: 14,
    lineHeight: 21
  },
  heroMetaRow: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
    paddingTop: 12,
    gap: 4
  },
  heroMetaLabel: {
    color: "#d6fbf1",
    fontSize: 12,
    fontWeight: "700"
  },
  heroMetaValue: {
    color: "#ffffff",
    fontSize: 14
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  primaryButton: {
    backgroundColor: "#0f766e",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700"
  },
  secondaryButton: {
    backgroundColor: "#fff7e8",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d7c8a9",
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  secondaryButtonText: {
    color: "#8a4b08",
    fontSize: 14,
    fontWeight: "700"
  },
  ghostButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cad5d1",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignSelf: "flex-start"
  },
  ghostButtonText: {
    color: "#0f3d3e",
    fontSize: 13,
    fontWeight: "700"
  },
  scannerShell: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#c7d7d1"
  },
  scanner: {
    height: 260
  },
  multilineInput: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#ddd6c8",
    backgroundColor: "#f8f4ec",
    minHeight: 120,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: "#1f2937",
    textAlignVertical: "top"
  },
  infoPanel: {
    borderRadius: 18,
    backgroundColor: "#f7f3eb",
    borderWidth: 1,
    borderColor: "#ddd6c8",
    padding: 14,
    gap: 6
  },
  infoTitle: {
    color: "#1f2937",
    fontSize: 14,
    fontWeight: "700"
  },
  infoText: {
    color: "#5b6157",
    fontSize: 13,
    lineHeight: 19
  },
  gridRow: {
    flexDirection: "row",
    gap: 10
  },
  singleInput: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#ddd6c8",
    backgroundColor: "#f8f4ec",
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#1f2937"
  },
  flexTwo: {
    flex: 2
  },
  previewPanel: {
    borderRadius: 16,
    backgroundColor: "#eef8ff",
    borderWidth: 1,
    borderColor: "#bfdcf4",
    padding: 14,
    gap: 4
  },
  previewLabel: {
    color: "#1d4f73",
    fontSize: 12,
    fontWeight: "700"
  },
  previewValue: {
    color: "#16324f",
    fontSize: 15,
    fontWeight: "700"
  },
  statusBox: {
    borderRadius: 18,
    padding: 16,
    gap: 6
  },
  statusNeutral: {
    backgroundColor: "#f4efe5",
    borderWidth: 1,
    borderColor: "#ddd6c8"
  },
  statusSuccess: {
    backgroundColor: "#e8f7f4",
    borderWidth: 1,
    borderColor: "#9bd5ca"
  },
  statusError: {
    backgroundColor: "#fff0ec",
    borderWidth: 1,
    borderColor: "#f2bbb0"
  },
  statusTitle: {
    color: "#1f2937",
    fontSize: 16,
    fontWeight: "700"
  },
  statusDetail: {
    color: "#4b5563",
    fontSize: 13,
    lineHeight: 20
  }
});

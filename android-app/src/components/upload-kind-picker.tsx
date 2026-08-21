import { Pressable, StyleSheet, Text, View } from "react-native";

import type { MobileUploadKind } from "../domain/upload-types";

const OPTIONS: Array<{
  value: MobileUploadKind;
  label: string;
  description: string;
  accent: string;
}> = [
  {
    value: "question_bank_pdf",
    label: "题库 PDF",
    description: "进入题库目录树，上传后自动走题库导入流程",
    accent: "#0f766e"
  },
  {
    value: "full_paper_pdf",
    label: "套卷 PDF",
    description: "进入套卷库目录树，上传后走现有套卷拆分流程",
    accent: "#b45309"
  },
  {
    value: "lecture_archive_pdf",
    label: "讲义归档",
    description: "进入三级目录树，并在上传前执行固定命名校验",
    accent: "#2563eb"
  },
  {
    value: "primary_lecture_pdf",
    label: "主讲义回传",
    description: "选择主讲义文档，支持下载当前版本并上传更新版",
    accent: "#7c3aed"
  }
];

interface UploadKindPickerProps {
  selectedValue: MobileUploadKind;
  onChange: (value: MobileUploadKind) => void;
}

export function UploadKindPicker({
  selectedValue,
  onChange
}: UploadKindPickerProps) {
  return (
    <View style={styles.container}>
      {OPTIONS.map((option) => {
        const isSelected = option.value === selectedValue;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.option,
              { borderColor: isSelected ? option.accent : "#d8d4cc" },
              isSelected && { backgroundColor: "#fffaf0" }
            ]}
          >
            <View style={[styles.badge, { backgroundColor: option.accent }]} />
            <View style={styles.optionText}>
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionDescription}>{option.description}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  option: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start"
  },
  badge: {
    width: 12,
    height: 12,
    borderRadius: 999
  },
  optionText: {
    flex: 1,
    gap: 4
  },
  optionLabel: {
    color: "#1f2937",
    fontSize: 16,
    fontWeight: "700"
  },
  optionDescription: {
    color: "#6b6f66",
    fontSize: 12,
    lineHeight: 18
  }
});

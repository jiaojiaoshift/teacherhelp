import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type {
  MobileUploadTargetNode,
  MobileUploadTargetTreeNode
} from "../domain/upload-types";

interface TargetNodeTreeProps {
  nodes: MobileUploadTargetTreeNode[];
  selectedTargetId: string | null;
  onSelect: (target: MobileUploadTargetNode) => void;
}

function collectExpandableKeys(nodes: MobileUploadTargetTreeNode[]) {
  const keys = new Set<string>();

  const walk = (nextNodes: MobileUploadTargetTreeNode[]) => {
    for (const node of nextNodes) {
      if (node.children.length > 0) {
        keys.add(node.key);
        walk(node.children);
      }
    }
  };

  walk(nodes);

  return keys;
}

export function TargetNodeTree({
  nodes,
  selectedTargetId,
  onSelect
}: TargetNodeTreeProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedKeys(collectExpandableKeys(nodes));
  }, [nodes]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  };

  const renderNodes = (currentNodes: MobileUploadTargetTreeNode[], depth: number) =>
    currentNodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isExpanded = expandedKeys.has(node.key);
      const isSelected = node.selectableTarget?.id === selectedTargetId;

      return (
        <View key={node.key}>
          <View style={styles.row}>
            {hasChildren ? (
              <Pressable
                onPress={() => toggleExpanded(node.key)}
                style={styles.chevronButton}
              >
                <Text style={styles.chevronText}>{isExpanded ? "▾" : "▸"}</Text>
              </Pressable>
            ) : (
              <View style={styles.chevronSpacer} />
            )}
            <Pressable
              onPress={() => {
                if (node.selectableTarget) {
                  onSelect(node.selectableTarget);
                  return;
                }

                if (hasChildren) {
                  toggleExpanded(node.key);
                }
              }}
              style={[
                styles.nodeButton,
                { marginLeft: depth * 10 },
                isSelected && styles.nodeButtonSelected
              ]}
            >
              <Text style={styles.nodeName}>{node.name}</Text>
              {node.selectableTarget ? (
                <Text style={styles.nodeKind}>
                  {node.selectableTarget.targetKind === "exam_document"
                    ? "主讲义"
                    : "可选"}
                </Text>
              ) : null}
            </Pressable>
          </View>
          {hasChildren && isExpanded ? renderNodes(node.children, depth + 1) : null}
        </View>
      );
    });

  return <View style={styles.container}>{renderNodes(nodes, 0)}</View>;
}

const styles = StyleSheet.create({
  container: {
    gap: 4
  },
  row: {
    flexDirection: "row",
    alignItems: "center"
  },
  chevronButton: {
    width: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  chevronSpacer: {
    width: 22
  },
  chevronText: {
    color: "#5b6157",
    fontSize: 15
  },
  nodeButton: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f6f2ea",
    borderWidth: 1,
    borderColor: "#e1dbcf",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  nodeButtonSelected: {
    backgroundColor: "#e0f2f1",
    borderColor: "#0f766e"
  },
  nodeName: {
    color: "#1f2937",
    fontSize: 14,
    fontWeight: "600",
    flex: 1
  },
  nodeKind: {
    color: "#6b6f66",
    fontSize: 11
  }
});

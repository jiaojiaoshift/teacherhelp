import type { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

interface SectionCardProps extends PropsWithChildren {
  title: string;
  description?: string;
}

export function SectionCard({
  title,
  description,
  children
}: SectionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fffdf8",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#d9d2c5",
    padding: 18,
    gap: 6
  },
  title: {
    color: "#0f3d3e",
    fontSize: 20,
    fontWeight: "700"
  },
  description: {
    color: "#6b6f66",
    fontSize: 13,
    lineHeight: 19
  },
  content: {
    marginTop: 10,
    gap: 12
  }
});

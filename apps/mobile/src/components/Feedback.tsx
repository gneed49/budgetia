import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

export function ErrorBanner({ message }: { message: string }) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.error}>
      <Ionicons name="alert-circle-outline" size={21} color={colors.coral} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function LoadingBlock({ label = "Chargement…" }: { label?: string }) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.mint} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  error: {
    flexDirection: "row",
    gap: spacing.xs,
    alignItems: "flex-start",
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { flex: 1, color: colors.ink, fontSize: 13, lineHeight: 18 },
  loading: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: { color: colors.muted, fontSize: 13 },
});

import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { type BudgetSpace } from "../api";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

export function BudgetSpaceBar(props: {
  spaces: BudgetSpace[];
  activeSpaceId: string;
  onSelect: (spaceId: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);

  return (
    <View style={styles.shell}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {props.spaces.map((space) => {
          const active = space.id === props.activeSpaceId;
          return (
            <Pressable
              key={space.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${space.name}, ${space.kind === "personal" ? "budget personnel" : "budget partagé"}`}
              onPress={() => props.onSelect(space.id)}
              style={({ pressed }) => [
                styles.space,
                active && styles.spaceActive,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={space.kind === "personal" ? "person-outline" : "people-outline"}
                size={16}
                color={active ? colors.mintDark : colors.muted}
              />
              <Text
                numberOfLines={1}
                style={[styles.label, active && styles.labelActive]}
              >
                {space.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    shell: {
      minHeight: 54,
      justifyContent: "center",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.canvas,
    },
    content: {
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xs,
    },
    space: {
      maxWidth: 180,
      minHeight: 36,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.round,
      backgroundColor: colors.surface,
    },
    spaceActive: {
      borderColor: colors.mint,
      backgroundColor: colors.mintSoft,
    },
    label: { color: colors.muted, fontSize: 12, fontWeight: "700" },
    labelActive: { color: colors.mintDark, fontWeight: "900" },
    pressed: { opacity: 0.68 },
  });

import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { type Category } from "@budgetia/domain";

import { radii, spacing, type ThemeColors, useThemeStyles } from "../theme";

export function CategoryFilters(props: {
  categories: Category[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const styles = useThemeStyles(createStyles);
  const selected = new Set(props.selectedIds);
  function toggle(id: string): void {
    props.onChange(
      selected.has(id)
        ? props.selectedIds.filter((item) => item !== id)
        : [...props.selectedIds, id],
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: props.selectedIds.length === 0 }}
        onPress={() => props.onChange([])}
        style={[
          styles.filter,
          props.selectedIds.length === 0 && styles.filterActive,
        ]}
      >
        <Text
          style={[
            styles.filterText,
            props.selectedIds.length === 0 && styles.filterTextActive,
          ]}
        >
          Toutes
        </Text>
      </Pressable>
      {props.categories.map((category) => {
        const active = selected.has(category.id);
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => toggle(category.id)}
            style={[styles.filter, active && styles.filterActive]}
          >
            <View style={[styles.dot, { backgroundColor: category.color }]} />
            <Text style={[styles.filterText, active && styles.filterTextActive]}>
              {category.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  content: { gap: spacing.xs, paddingRight: spacing.lg },
  filter: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  filterActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  filterTextActive: { color: colors.canvas },
  dot: { width: 8, height: 8, borderRadius: radii.round },
});

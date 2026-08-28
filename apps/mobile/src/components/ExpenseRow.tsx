import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { type Expense } from "@budgetia/domain";

import { formatMoney, formatShortDate } from "../format";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

export function ExpenseRow(props: {
  expense: Expense;
  onEdit?: (expense: Expense) => void;
  onDelete?: (expense: Expense) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const { expense } = props;
  return (
    <View style={styles.row}>
      <View
        style={[styles.icon, { backgroundColor: `${expense.categoryColor}24` }]}
      >
        <Ionicons
          name={expense.categoryIcon as keyof typeof Ionicons.glyphMap}
          size={22}
          color={expense.categoryColor}
        />
      </View>
      <View style={styles.copy}>
        <Text style={styles.note} numberOfLines={1}>
          {expense.note || expense.categoryName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {expense.categoryName} · {formatShortDate(expense.spentAt)}
          {expense.source === "chatgpt" ? " · ChatGPT" : ""}
        </Text>
      </View>
      <Text style={styles.amount}>{formatMoney(expense.amountCents)}</Text>
      {props.onEdit ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Modifier ${expense.note || expense.categoryName}`}
          hitSlop={8}
          onPress={() => props.onEdit?.(expense)}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Ionicons name="pencil-outline" size={19} color={colors.mintDark} />
        </Pressable>
      ) : null}
      {props.onDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Supprimer ${expense.note || expense.categoryName}`}
          hitSlop={8}
          onPress={() => props.onDelete?.(expense)}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Ionicons name="trash-outline" size={19} color={colors.coral} />
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.round,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0 },
  note: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  meta: { marginTop: 4, color: colors.muted, fontSize: 12 },
  amount: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  action: {
    width: 38,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.6 },
});

import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  formatPeriodLabel,
  todayISO,
  type Category,
  type ChartType,
  type Expense,
  type Period,
} from "@budgetia/domain";

import { BudgetApi, type BudgetSettings } from "../api";
import { BudgetChart } from "../components/BudgetChart";
import { ChartTypeControl, PeriodControl } from "../components/Controls";
import { ErrorBanner, LoadingBlock } from "../components/Feedback";
import { ExpenseRow } from "../components/ExpenseRow";
import { formatMoney } from "../format";
import { useSummary } from "../hooks";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

export function HomeScreen(props: {
  api: BudgetApi;
  categories: Category[];
  expenses: Expense[];
  settings: BudgetSettings | null;
  refreshVersion: number;
  error: string | null;
  onAdd: () => void;
  onRefresh: () => void;
  onOpenExpenses: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [period, setPeriod] = useState<Period>("month");
  const [chartType, setChartType] = useState<ChartType>("donut");
  const referenceDate = todayISO();
  const { summary, loading, error } = useSummary(
    props.api,
    period,
    referenceDate,
    [],
    props.refreshVersion,
  );
  const budget = props.settings?.monthlyBudgetCents ?? 0;
  const monthTotal = period === "month" ? summary?.totalCents ?? 0 : 0;
  const progress = budget > 0 ? Math.min(monthTotal / budget, 1) : 0;
  const comparison = summary?.comparisonPercentage;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bonjour</Text>
          <Text style={styles.periodLabel}>{formatPeriodLabel(period, referenceDate)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Actualiser"
          onPress={props.onRefresh}
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        >
          <Ionicons name="refresh" size={21} color={colors.mintDark} />
        </Pressable>
      </View>

      {props.error ? <ErrorBanner message={props.error} /> : null}

      <View style={styles.amountHeader}>
        <View>
          <Text style={styles.eyeline}>Dépenses sur la période</Text>
          <Text style={styles.total}>{formatMoney(summary?.totalCents ?? 0)}</Text>
          {comparison !== null && comparison !== undefined ? (
            <View style={styles.comparisonRow}>
              <Ionicons
                name={comparison <= 0 ? "trending-down" : "trending-up"}
                size={17}
                color={comparison <= 0 ? colors.mintDark : colors.coral}
              />
              <Text
                style={[
                  styles.comparison,
                  { color: comparison <= 0 ? colors.mintDark : colors.coral },
                ]}
              >
                {comparison > 0 ? "+" : ""}
                {comparison} %
              </Text>
              <Text style={styles.comparisonCaption}>vs période précédente</Text>
            </View>
          ) : null}
        </View>
        <ChartTypeControl selected={chartType} onChange={setChartType} />
      </View>

      {loading && !summary ? (
        <LoadingBlock label="Calcul du budget…" />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : (
        <BudgetChart type={chartType} summary={summary} />
      )}

      <PeriodControl selected={period} onChange={setPeriod} />

      {period === "month" && budget > 0 ? (
        <View style={styles.budgetProgress}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Budget mensuel</Text>
            <Text style={styles.budgetCopy}>
              {formatMoney(monthTotal)} / {formatMoney(budget)}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.max(progress * 100, monthTotal ? 3 : 0)}%`,
                  backgroundColor: progress >= 0.9 ? colors.coral : colors.mint,
                },
              ]}
            />
          </View>
          <Text style={styles.progressCaption}>
            {monthTotal <= budget
              ? `${formatMoney(budget - monthTotal)} disponibles`
              : `${formatMoney(monthTotal - budget)} au-dessus du budget`}
          </Text>
        </View>
      ) : null}

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Dépenses récentes</Text>
        <Pressable
          accessibilityRole="button"
          onPress={props.onOpenExpenses}
          hitSlop={8}
        >
          <Text style={styles.link}>Voir tout</Text>
        </Pressable>
      </View>
      <View>
        {props.expenses.length ? (
          props.expenses.slice(0, 5).map((expense) => (
            <ExpenseRow key={expense.id} expense={expense} />
          ))
        ) : (
          <Text style={styles.emptyList}>
            Votre première dépense apparaîtra ici.
          </Text>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={props.onAdd}
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
      >
        <Ionicons name="add" size={25} color={colors.onPrimary} />
        <Text style={styles.addButtonText}>Ajouter une dépense</Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.xl },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  greeting: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: -1 },
  periodLabel: { marginTop: 5, color: colors.muted, fontSize: 14, fontWeight: "600" },
  avatar: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
    backgroundColor: colors.mintSoft,
  },
  amountHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  eyeline: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  total: {
    marginTop: 5,
    color: colors.ink,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1.2,
    fontVariant: ["tabular-nums"],
  },
  comparisonRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5 },
  comparison: { fontSize: 14, fontWeight: "800" },
  comparisonCaption: { color: colors.muted, fontSize: 12 },
  budgetProgress: { gap: spacing.xs },
  progressTrack: {
    height: 8,
    overflow: "hidden",
    borderRadius: radii.round,
    backgroundColor: colors.mintSoft,
  },
  progressFill: { height: "100%", borderRadius: radii.round },
  progressCaption: { color: colors.muted, fontSize: 12 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: "900" },
  budgetCopy: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  link: { color: colors.mintDark, fontSize: 14, fontWeight: "800" },
  emptyList: {
    paddingVertical: spacing.xl,
    color: colors.muted,
    textAlign: "center",
  },
  addButton: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.mintDark,
  },
  addButtonText: { color: colors.onPrimary, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.7 },
});

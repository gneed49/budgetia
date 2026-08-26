import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  formatPeriodLabel,
  movePeriod,
  todayISO,
  type Category,
  type ChartType,
  type Period,
  type SeriesPoint,
} from "@budgetia/domain";

import { BudgetApi } from "../api";
import { BudgetChart } from "../components/BudgetChart";
import { CategoryFilters } from "../components/CategoryFilters";
import {
  ChartTypeControl,
  PeriodControl,
  PeriodNavigator,
} from "../components/Controls";
import { ErrorBanner, LoadingBlock } from "../components/Feedback";
import { formatMoney } from "../format";
import { useSummary } from "../hooks";
import { radii, spacing, type ThemeColors, useThemeStyles } from "../theme";

export function AnalyticsScreen(props: {
  api: BudgetApi;
  categories: Category[];
  refreshVersion: number;
}) {
  const styles = useThemeStyles(createStyles);
  const [period, setPeriod] = useState<Period>("year");
  const [referenceDate, setReferenceDate] = useState(todayISO());
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(todayISO().slice(0, 7));
  const { summary, loading, error } = useSummary(
    props.api,
    period,
    referenceDate,
    categoryIds,
    props.refreshVersion,
  );
  const detailReference = `${selectedMonth}-15`;
  const detail = useSummary(
    props.api,
    "month",
    detailReference,
    categoryIds,
    props.refreshVersion,
  );

  useEffect(() => {
    if (period === "year") {
      const year = referenceDate.slice(0, 4);
      setSelectedMonth((current) =>
        current.startsWith(year) ? current : `${year}-01`,
      );
    }
  }, [period, referenceDate]);

  const monthPoints = useMemo(
    () => (period === "year" ? summary?.series ?? [] : []),
    [period, summary],
  );

  function selectPoint(point: SeriesPoint): void {
    if (period === "year") setSelectedMonth(point.startDate.slice(0, 7));
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Analyse</Text>
        <ChartTypeControl selected={chartType} onChange={setChartType} />
      </View>

      <PeriodNavigator
        label={formatPeriodLabel(period, referenceDate)}
        onPrevious={() => setReferenceDate((current) => movePeriod(period, current, -1))}
        onNext={() => setReferenceDate((current) => movePeriod(period, current, 1))}
      />
      <PeriodControl selected={period} onChange={setPeriod} />

      <View>
        <Text style={styles.eyeline}>Total des dépenses</Text>
        <Text style={styles.total}>{formatMoney(summary?.totalCents ?? 0)}</Text>
        <Text style={styles.meta}>
          {summary?.transactionCount ?? 0} transaction
          {(summary?.transactionCount ?? 0) > 1 ? "s" : ""}
        </Text>
      </View>

      <CategoryFilters
        categories={props.categories}
        selectedIds={categoryIds}
        onChange={setCategoryIds}
      />

      {loading && !summary ? (
        <LoadingBlock label="Préparation du graphique…" />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : (
        <BudgetChart
          type={chartType}
          summary={summary}
          selectedKey={period === "year" ? selectedMonth : null}
          onPointPress={selectPoint}
        />
      )}

      {period === "year" ? (
        <View style={styles.monthRail}>
          <Text style={styles.railLabel}>Choisir un mois à détailler</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.months}
          >
            {monthPoints.map((point) => {
              const active = point.key === selectedMonth;
              return (
                <Pressable
                  key={point.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Détail ${point.label} ${point.key.slice(0, 4)}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => selectPoint(point)}
                  style={[styles.month, active && styles.monthActive]}
                >
                  <Text style={[styles.monthLabel, active && styles.monthLabelActive]}>
                    {point.label}
                  </Text>
                  <Text style={[styles.monthAmount, active && styles.monthLabelActive]}>
                    {formatMoney(point.amountCents, 0)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {period === "year" ? (
        <View style={styles.detail}>
          <View style={styles.detailHeading}>
            <View>
              <Text style={styles.detailTitle}>
                {formatPeriodLabel("month", detailReference)}
              </Text>
              <Text style={styles.detailSubtitle}>Détail du mois sélectionné</Text>
            </View>
            <Text style={styles.detailTotal}>
              {formatMoney(detail.summary?.totalCents ?? 0)}
            </Text>
          </View>
          {detail.loading && !detail.summary ? (
            <LoadingBlock />
          ) : detail.error ? (
            <ErrorBanner message={detail.error} />
          ) : (
            <BudgetChart type={chartType} summary={detail.summary} compact />
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.xl },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: -1 },
  eyeline: { color: colors.muted, fontSize: 14, fontWeight: "600" },
  total: {
    marginTop: 4,
    color: colors.ink,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
  },
  meta: { marginTop: 3, color: colors.muted, fontSize: 12 },
  monthRail: { gap: spacing.sm },
  railLabel: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  months: { gap: spacing.xs, paddingRight: spacing.lg },
  month: {
    width: 72,
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  monthActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  monthLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  monthAmount: { marginTop: 3, color: colors.ink, fontSize: 12, fontWeight: "800" },
  monthLabelActive: { color: colors.canvas },
  detail: {
    gap: spacing.md,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  detailTitle: { color: colors.ink, fontSize: 23, fontWeight: "900" },
  detailSubtitle: { marginTop: 3, color: colors.muted, fontSize: 12 },
  detailTotal: { color: colors.mintDark, fontSize: 18, fontWeight: "900" },
});

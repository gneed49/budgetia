import { useMemo } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Svg, {
  Circle,
  G,
  Line,
  Polyline,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import { type ChartType, type SeriesPoint, type SpendingSummary } from "@budgetia/domain";

import { formatMoney } from "../format";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

interface BudgetChartProps {
  type: ChartType;
  summary: SpendingSummary | null;
  selectedKey?: string | null;
  onPointPress?: (point: SeriesPoint) => void;
  compact?: boolean;
}

function DonutChart({ summary, width }: { summary: SpendingSummary; width: number }) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const horizontal = width >= 330;
  const size = horizontal ? Math.min(width * 0.4, 150) : Math.min(width, 220);
  const center = size / 2;
  const radius = size * 0.32;
  const stroke = size * 0.13;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <View style={horizontal ? styles.donutLayout : undefined}>
      <View style={styles.donutRow}>
        <Svg width={size} height={size} accessibilityLabel="Répartition par catégorie">
          <G transform={`rotate(-90 ${center} ${center})`}>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke={colors.mintSoft}
              strokeWidth={stroke}
            />
            {summary.categoryTotals.map((category) => {
              const length = summary.totalCents
                ? (category.amountCents / summary.totalCents) * circumference
                : 0;
              const dashOffset = -offset;
              offset += length;
              return (
                <Circle
                  key={category.categoryId}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={category.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${Math.max(length - 2, 0)} ${circumference}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="butt"
                />
              );
            })}
          </G>
          <SvgText
            x={center}
            y={center - 5}
            textAnchor="middle"
            fill={colors.muted}
            fontSize="12"
            fontWeight="600"
          >
            Total
          </SvgText>
          <SvgText
            x={center}
            y={center + 19}
            textAnchor="middle"
            fill={colors.ink}
            fontSize="18"
            fontWeight="800"
          >
            {formatMoney(summary.totalCents, 0)}
          </SvgText>
        </Svg>
      </View>
      <View style={[styles.legend, horizontal && styles.legendHorizontal]}>
        {summary.categoryTotals.slice(0, 6).map((category) => (
          <View key={category.categoryId} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: category.color }]} />
            <Text style={styles.legendName} numberOfLines={1}>
              {category.name}
            </Text>
            <Text style={styles.legendAmount}>{formatMoney(category.amountCents)}</Text>
            <Text style={styles.legendPercentage}>{category.percentage} %</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TimeSeriesChart({
  summary,
  width,
  type,
  selectedKey,
  onPointPress,
  compact,
}: {
  summary: SpendingSummary;
  width: number;
  type: "bar" | "line";
  selectedKey?: string | null;
  onPointPress?: (point: SeriesPoint) => void;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const height = compact ? 190 : 230;
  const padding = { top: 18, right: 8, bottom: 34, left: 36 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(...summary.series.map((point) => point.amountCents), 1);
  const step = chartWidth / Math.max(summary.series.length, 1);
  const barWidth = Math.max(Math.min(step * 0.5, 24), 7);
  const points = summary.series.map((point, index) => ({
    source: point,
    x: padding.left + step * index + step / 2,
    y: padding.top + chartHeight - (point.amountCents / max) * chartHeight,
  }));

  return (
    <Svg width={width} height={height} accessibilityLabel="Évolution des dépenses">
      {[0, 0.5, 1].map((ratio) => {
        const y = padding.top + chartHeight * ratio;
        return (
          <G key={ratio}>
            <Line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke={colors.border}
              strokeWidth="1"
              strokeDasharray="4 5"
            />
            <SvgText
              x={padding.left - 5}
              y={y + 3}
              textAnchor="end"
              fill={colors.muted}
              fontSize="9"
            >
              {formatMoney(Math.round(max * (1 - ratio)), 0)}
            </SvgText>
          </G>
        );
      })}

      {type === "bar" ? (
        <G>
          {points.map(({ source, x, y }) => {
            const selected = source.key === selectedKey;
            return (
              <Rect
                key={source.key}
                x={x - barWidth / 2}
                y={y}
                width={barWidth}
                height={padding.top + chartHeight - y}
                rx={barWidth / 2}
                fill={selected ? colors.mintDark : colors.mint}
                opacity={selected ? 1 : 0.62}
                onPress={() => onPointPress?.(source)}
              />
            );
          })}
        </G>
      ) : (
        <G>
          <Polyline
            points={points.map(({ x, y }) => `${x},${y}`).join(" ")}
            fill="none"
            stroke={colors.mint}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map(({ source, x, y }) => {
            const selected = source.key === selectedKey;
            return (
              <Circle
                key={source.key}
                cx={x}
                cy={y}
                r={selected ? 6 : 4}
                fill={selected ? colors.mintDark : colors.surface}
                stroke={colors.mint}
                strokeWidth="3"
                onPress={() => onPointPress?.(source)}
              />
            );
          })}
        </G>
      )}

      {points.map(({ source, x }) => (
        <SvgText
          key={`label-${source.key}`}
          x={x}
          y={height - 12}
          textAnchor="middle"
          fill={source.key === selectedKey ? colors.ink : colors.muted}
          fontSize={summary.series.length > 8 ? "9" : "10"}
          fontWeight={source.key === selectedKey ? "800" : "500"}
          onPress={() => onPointPress?.(source)}
        >
          {source.label}
        </SvgText>
      ))}
    </Svg>
  );
}

export function BudgetChart({
  type,
  summary,
  selectedKey = null,
  onPointPress,
  compact = false,
}: BudgetChartProps) {
  const styles = useThemeStyles(createStyles);
  const window = useWindowDimensions();
  const width = useMemo(() => Math.min(window.width - 48, 408), [window.width]);

  if (!summary || summary.totalCents === 0) {
    return (
      <View style={[styles.empty, compact && styles.emptyCompact]}>
        <Text style={styles.emptyTitle}>Aucune dépense sur cette période</Text>
        <Text style={styles.emptyText}>
          Ajoutez une dépense ou élargissez les filtres pour afficher le graphique.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {type === "donut" ? (
        <DonutChart summary={summary} width={width} />
      ) : (
        <TimeSeriesChart
          summary={summary}
          width={width}
          type={type}
          selectedKey={selectedKey}
          {...(onPointPress ? { onPointPress } : {})}
          compact={compact}
        />
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
  },
  donutLayout: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  donutRow: { alignItems: "center", justifyContent: "center" },
  legend: {
    width: "100%",
    gap: spacing.sm,
    paddingHorizontal: spacing.xxs,
    marginTop: spacing.xs,
  },
  legendHorizontal: {
    flex: 1,
    minWidth: 0,
    gap: 7,
    marginTop: 0,
    paddingHorizontal: 0,
  },
  legendRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: { width: 8, height: 8, borderRadius: radii.round },
  legendName: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "700" },
  legendAmount: {
    minWidth: 58,
    textAlign: "right",
    color: colors.ink,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  legendPercentage: {
    width: 36,
    textAlign: "right",
    color: colors.muted,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  empty: {
    minHeight: 230,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  emptyCompact: { minHeight: 160 },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});

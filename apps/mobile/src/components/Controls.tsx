import { Ionicons } from "@expo/vector-icons";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { type ChartType, type Period } from "@budgetia/domain";

import { periodLabel } from "../format";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

interface SegmentedControlProps<T extends string> {
  values: readonly T[];
  selected: T;
  label: (value: T) => string;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<T extends string>({
  values,
  selected,
  label,
  onChange,
  style,
}: SegmentedControlProps<T>) {
  const styles = useThemeStyles(createStyles);
  return (
    <View style={[styles.segmented, style]}>
      {values.map((value) => {
        const active = value === selected;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(value)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {label(value)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PeriodControl(props: {
  selected: Period;
  onChange: (period: Period) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SegmentedControl
      values={["week", "month", "year"] as const}
      selected={props.selected}
      label={periodLabel}
      onChange={props.onChange}
      style={props.style}
    />
  );
}

const chartIcons: Record<ChartType, keyof typeof Ionicons.glyphMap> = {
  donut: "pie-chart-outline",
  bar: "bar-chart-outline",
  line: "analytics-outline",
};

export function ChartTypeControl(props: {
  selected: ChartType;
  onChange: (type: ChartType) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.chartTypes}>
      {(["donut", "bar", "line"] as const).map((type) => {
        const active = props.selected === type;
        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={`Graphique ${type}`}
            accessibilityState={{ selected: active }}
            onPress={() => props.onChange(type)}
            style={({ pressed }) => [
              styles.chartType,
              active && styles.chartTypeActive,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={chartIcons[type]}
              size={22}
              color={active ? colors.ink : colors.muted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export function PeriodNavigator(props: {
  label: string;
  onPrevious: () => void;
  onNext: () => void;
  disableNext?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.navigator}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Période précédente"
        onPress={props.onPrevious}
        hitSlop={8}
        style={styles.iconButton}
      >
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </Pressable>
      <Text style={styles.navigatorLabel}>{props.label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Période suivante"
        disabled={props.disableNext}
        onPress={props.onNext}
        hitSlop={8}
        style={[styles.iconButton, props.disableNext && styles.disabled]}
      >
        <Ionicons name="chevron-forward" size={22} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  segmented: {
    minHeight: 48,
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  segment: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  segmentActive: {
    margin: 3,
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: colors.mintSoft,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  segmentTextActive: {
    color: colors.mintDark,
    fontWeight: "800",
  },
  chartTypes: {
    flexDirection: "row",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  chartType: {
    width: 46,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  chartTypeActive: {
    backgroundColor: colors.mintSoft,
  },
  navigator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navigatorLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.ink,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.72 },
});

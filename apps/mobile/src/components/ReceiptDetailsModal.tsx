import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  PRODUCT_GROUPS,
  type Expense,
  type ReceiptDetails,
} from "@budgetia/domain";

import { BudgetApi } from "../api";
import { formatMoney, formatShortDate } from "../format";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";
import { ErrorBanner } from "./Feedback";

export function ReceiptDetailsModal(props: {
  visible: boolean;
  api: BudgetApi;
  expense: Expense | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [details, setDetails] = useState<ReceiptDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.visible || !props.expense) return;
    let active = true;
    setDetails(null);
    setError(null);
    props.api
      .getReceiptDetails(props.expense.id)
      .then((value) => {
        if (active) setDetails(value);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Détail indisponible.");
        }
      });
    return () => {
      active = false;
    };
  }, [props.api, props.expense, props.visible]);

  const groupTotals = useMemo(() => {
    if (!details) return [];
    const totals = new Map<string, number>();
    for (const item of details.items) {
      totals.set(item.productGroup, (totals.get(item.productGroup) ?? 0) + item.amountCents);
    }
    return PRODUCT_GROUPS.flatMap((group) => {
      const amountCents = totals.get(group.key) ?? 0;
      return amountCents > 0 ? [{ ...group, amountCents }] : [];
    }).sort((left, right) => right.amountCents - left.amountCents);
  }, [details]);

  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{details?.merchant || "Détail du ticket"}</Text>
              <Text style={styles.subtitle}>
                {props.expense
                  ? `${props.expense.categoryName} · ${formatShortDate(props.expense.spentAt)}`
                  : "Lignes validées"}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={props.onClose} style={styles.close}>
              <Ionicons name="close" size={23} color={colors.ink} />
            </Pressable>
          </View>

          {!details && !error ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.mintDark} />
              <Text style={styles.loadingText}>Chargement du ticket…</Text>
            </View>
          ) : null}
          {error ? <ErrorBanner message={error} /> : null}
          {details ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              <View style={styles.totalCard}>
                <View>
                  <Text style={styles.totalLabel}>Total validé</Text>
                  <Text style={styles.totalValue}>{formatMoney(props.expense?.amountCents ?? 0)}</Text>
                </View>
                <View style={styles.lineCount}>
                  <Ionicons name="receipt-outline" size={18} color={colors.mintDark} />
                  <Text style={styles.lineCountText}>{details.items.length} ligne(s)</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Répartition par pôle produit</Text>
              <View style={styles.groups}>
                {groupTotals.map((group) => (
                  <View key={group.key} style={styles.group}>
                    <View style={[styles.groupDot, { backgroundColor: group.color }]} />
                    <Text style={styles.groupLabel}>{group.label}</Text>
                    <Text style={styles.groupAmount}>{formatMoney(group.amountCents)}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.sectionTitle}>Produits et services</Text>
              <View>
                {details.items.map((item) => {
                  const group = PRODUCT_GROUPS.find((candidate) => candidate.key === item.productGroup)!;
                  return (
                    <View key={item.id} style={styles.item}>
                      <View style={[styles.itemIndex, { backgroundColor: `${group.color}25` }]}>
                        <View style={[styles.groupDot, { backgroundColor: group.color }]} />
                      </View>
                      <View style={styles.itemCopy}>
                        <Text style={styles.itemLabel}>{item.label}</Text>
                        <Text style={styles.itemGroup}>{group.label}</Text>
                      </View>
                      <Text style={styles.itemAmount}>{formatMoney(item.amountCents)}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={styles.privacyNote}>
                <Ionicons name="shield-checkmark-outline" size={18} color={colors.mintDark} />
                <Text style={styles.privacyText}>La photo originale n’est pas conservée par Budgetia.</Text>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.backdrop },
  sheet: { width: "100%", maxWidth: 560, maxHeight: "90%", minHeight: "45%", alignSelf: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.canvas },
  handle: { width: 42, height: 4, alignSelf: "center", marginTop: spacing.sm, borderRadius: radii.round, backgroundColor: colors.border },
  header: { minHeight: 88, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerCopy: { flex: 1, paddingRight: spacing.sm },
  title: { color: colors.ink, fontSize: 24, fontWeight: "900" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 13 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, backgroundColor: colors.surface },
  loading: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: spacing.sm, color: colors.muted, fontSize: 13 },
  content: { paddingBottom: spacing.lg },
  totalCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.mintSoft },
  totalLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  totalValue: { marginTop: 3, color: colors.ink, fontSize: 28, fontWeight: "900", fontVariant: ["tabular-nums"] },
  lineCount: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radii.round, backgroundColor: colors.surface },
  lineCountText: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.xs, color: colors.ink, fontSize: 17, fontWeight: "900" },
  groups: { gap: 2 },
  group: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  groupDot: { width: 10, height: 10, borderRadius: radii.round },
  groupLabel: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "700" },
  groupAmount: { color: colors.ink, fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] },
  item: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemIndex: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: radii.round },
  itemCopy: { flex: 1 },
  itemLabel: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  itemGroup: { marginTop: 3, color: colors.muted, fontSize: 11 },
  itemAmount: { color: colors.ink, fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
  privacyNote: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.lg, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.surface },
  privacyText: { flex: 1, color: colors.muted, fontSize: 11 },
});

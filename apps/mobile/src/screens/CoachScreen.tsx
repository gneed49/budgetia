import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  buildBudgetCoachInsights,
  formatPeriodLabel,
  movePeriod,
  todayISO,
  type BudgetCoachInsight,
  type Category,
  type CategoryBudgetPosition,
} from "@budgetia/domain";

import { BudgetApi } from "../api";
import { ErrorBanner, LoadingBlock } from "../components/Feedback";
import { formatMoney } from "../format";
import { useCategoryBudgets } from "../hooks";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

const insightIcon: Record<
  BudgetCoachInsight["kind"],
  keyof typeof Ionicons.glyphMap
> = {
  alert: "alert-circle",
  watch: "eye",
  positive: "trending-down",
  info: "sparkles",
};

export function CoachScreen(props: {
  api: BudgetApi;
  categories: Category[];
  refreshVersion: number;
  onMutated: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [referenceDate, setReferenceDate] = useState(todayISO());
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    props.categories[0]?.id ?? null,
  );
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const budgets = useCategoryBudgets(
    props.api,
    referenceDate,
    props.refreshVersion,
  );
  const insights = useMemo(
    () => buildBudgetCoachInsights(budgets.positions),
    [budgets.positions],
  );
  const totalLimit = budgets.positions.reduce(
    (sum, position) => sum + position.limitCents,
    0,
  );
  const totalSpent = budgets.positions.reduce(
    (sum, position) => sum + position.spentCents,
    0,
  );

  useEffect(() => {
    setSelectedCategoryId((current) =>
      current && props.categories.some((category) => category.id === current)
        ? current
        : props.categories[0]?.id ?? null,
    );
  }, [props.categories]);

  useEffect(() => {
    setAmount("");
    setFeedback(null);
    setActionError(null);
  }, [referenceDate]);

  function edit(position: CategoryBudgetPosition): void {
    if (!position.categoryId || !position.categoryActive) return;
    setSelectedCategoryId(position.categoryId);
    setAmount(String(position.limitCents / 100));
    setFeedback(null);
    setActionError(null);
  }

  async function save(): Promise<void> {
    if (!selectedCategoryId) return;
    setSaving(true);
    setFeedback(null);
    setActionError(null);
    try {
      await props.api.setCategoryBudgetLimit({
        categoryId: selectedCategoryId,
        referenceDate,
        amount,
      });
      setAmount("");
      setFeedback("Plafond enregistré pour ce mois.");
      budgets.refresh();
      props.onMutated();
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "Enregistrement impossible.",
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(position: CategoryBudgetPosition): void {
    if (!position.categoryId) return;
    Alert.alert(
      "Supprimer ce plafond ?",
      `Le plafond de « ${position.categoryName} » sera retiré uniquement pour ce mois. Les dépenses restent intactes.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            setSaving(true);
            setFeedback(null);
            setActionError(null);
            void props.api
              .deleteCategoryBudgetLimit({
                categoryId: position.categoryId!,
                referenceDate,
              })
              .then(() => {
                setFeedback("Plafond supprimé. Les dépenses n’ont pas changé.");
                budgets.refresh();
                props.onMutated();
              })
              .catch((reason: unknown) => {
                setActionError(
                  reason instanceof Error
                    ? reason.message
                    : "Suppression impossible.",
                );
              })
              .finally(() => setSaving(false));
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyeline}>ANALYSE VÉRIFIABLE</Text>
          <Text style={styles.title}>Coach budget</Text>
          <Text style={styles.subtitle}>
            Des repères calculés depuis vos montants, sans lecture de vos notes.
          </Text>
        </View>
        <View style={styles.coachIcon}>
          <Ionicons name="sparkles" size={24} color={colors.mintDark} />
        </View>
      </View>

      <View style={styles.monthPicker}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mois précédent"
          onPress={() => setReferenceDate((date) => movePeriod("month", date, -1))}
          style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {formatPeriodLabel("month", referenceDate)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mois suivant"
          onPress={() => setReferenceDate((date) => movePeriod("month", date, 1))}
          style={({ pressed }) => [styles.monthButton, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.ink} />
        </Pressable>
      </View>

      {budgets.error ? <ErrorBanner message={budgets.error} /> : null}
      {actionError ? <ErrorBanner message={actionError} /> : null}
      {feedback ? (
        <View style={styles.success}>
          <Ionicons name="checkmark-circle" size={20} color={colors.mintDark} />
          <Text style={styles.successText}>{feedback}</Text>
        </View>
      ) : null}

      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>Catégories plafonnées</Text>
          <Text style={styles.summaryValue}>{budgets.positions.length}</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryMoney}>
          <Text style={styles.summaryLabel}>Utilisé</Text>
          <Text style={styles.summaryAmount}>
            {formatMoney(totalSpent)} / {formatMoney(totalLimit)}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>À retenir</Text>
          <View style={styles.localBadge}>
            <Ionicons name="shield-checkmark" size={13} color={colors.mintDark} />
            <Text style={styles.localBadgeText}>Calcul local</Text>
          </View>
        </View>
        <View style={styles.insights}>
          {insights.map((insight) => (
            <View key={insight.id} style={styles.insightCard}>
              <View
                style={[
                  styles.insightIcon,
                  insight.kind === "alert" && { backgroundColor: colors.dangerSoft },
                ]}
              >
                <Ionicons
                  name={insightIcon[insight.kind]}
                  size={19}
                  color={insight.kind === "alert" ? colors.coral : colors.mintDark}
                />
              </View>
              <View style={styles.insightCopy}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightMessage}>{insight.message}</Text>
              </View>
              {insight.amountCents !== null ? (
                <Text
                  style={[
                    styles.insightAmount,
                    insight.kind === "alert" && { color: colors.coral },
                  ]}
                >
                  {formatMoney(insight.amountCents, 0)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.editorCard}>
        <Text style={styles.sectionTitle}>Définir un plafond</Text>
        <Text style={styles.editorHint}>
          Un plafond est propre à une catégorie et au mois affiché.
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryChoices}
        >
          {props.categories.map((category) => {
            const selected = category.id === selectedCategoryId;
            return (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  setSelectedCategoryId(category.id);
                  const current = budgets.positions.find(
                    (position) => position.categoryId === category.id,
                  );
                  setAmount(current ? String(current.limitCents / 100) : "");
                }}
                style={({ pressed }) => [
                  styles.categoryChoice,
                  selected && {
                    borderColor: category.color,
                    backgroundColor: colors.mintSoft,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.amountRow}>
          <TextInput
            accessibilityLabel="Montant du plafond mensuel"
            value={amount}
            onChangeText={setAmount}
            placeholder="Ex. 350"
            placeholderTextColor={colors.muted}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <Text style={styles.currency}>€ / mois</Text>
          <Pressable
            accessibilityRole="button"
            disabled={saving || !selectedCategoryId || !amount.trim()}
            onPress={() => void save()}
            style={({ pressed }) => [
              styles.saveButton,
              (saving || !selectedCategoryId || !amount.trim()) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.saveButtonText}>{saving ? "…" : "Enregistrer"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Suivi par catégorie</Text>
        {budgets.loading && !budgets.positions.length ? (
          <LoadingBlock label="Calcul des plafonds…" />
        ) : budgets.positions.length ? (
          <View style={styles.positionList}>
            {budgets.positions.map((position) => {
              const progress = Math.min(Math.max(position.percentage, 0), 100);
              const statusColor =
                position.status === "exceeded"
                  ? colors.coral
                  : position.status === "watch"
                    ? colors.amber
                    : colors.mint;
              return (
                <View key={position.limitId} style={styles.positionCard}>
                  <View style={styles.positionTop}>
                    <View style={styles.positionIdentity}>
                      <View
                        style={[
                          styles.categoryIcon,
                          { backgroundColor: `${position.categoryColor}22` },
                        ]}
                      >
                        <Ionicons
                          name={position.categoryIcon as keyof typeof Ionicons.glyphMap}
                          size={18}
                          color={position.categoryColor}
                        />
                      </View>
                      <View>
                        <Text style={styles.positionName}>{position.categoryName}</Text>
                        <Text style={[styles.positionStatus, { color: statusColor }]}>
                          {position.status === "exceeded"
                            ? `Dépassé de ${formatMoney(Math.abs(position.remainingCents))}`
                            : position.status === "watch"
                              ? `${formatMoney(position.remainingCents)} restants · vigilance`
                              : `${formatMoney(position.remainingCents)} restants`}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.positionAmount}>
                      {formatMoney(position.spentCents)} / {formatMoney(position.limitCents)}
                    </Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${progress}%`, backgroundColor: statusColor },
                      ]}
                    />
                  </View>
                  <View style={styles.positionFooter}>
                    <Text style={styles.positionMeta}>
                      {position.percentage.toFixed(1)} % utilisé
                      {position.trendPercentage === null
                        ? ""
                        : ` · ${position.trendPercentage > 0 ? "+" : ""}${position.trendPercentage.toFixed(1)} % vs mois précédent`}
                    </Text>
                    {position.categoryActive && position.categoryId ? (
                      <View style={styles.positionActions}>
                        <Pressable onPress={() => edit(position)} hitSlop={8}>
                          <Text style={styles.actionLink}>Modifier</Text>
                        </Pressable>
                        <Pressable onPress={() => confirmDelete(position)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={17} color={colors.coral} />
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={styles.archived}>Catégorie supprimée</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="speedometer-outline" size={28} color={colors.mintDark} />
            <Text style={styles.emptyTitle}>Aucun plafond ce mois-ci</Text>
            <Text style={styles.emptyText}>
              Choisissez une catégorie et un montant pour démarrer le suivi.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.securityNote}>
        <Ionicons name="lock-closed" size={17} color={colors.muted} />
        <Text style={styles.securityText}>
          Cette version du coach utilise uniquement des totaux structurés. Une future IA
          recevra des catégories anonymisées, jamais vos notes ou libellés de tickets.
        </Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.xl },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  headerCopy: { flex: 1 },
  eyeline: {
    color: colors.mintDark,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: { color: colors.ink, fontSize: 32, fontWeight: "900", letterSpacing: -0.8 },
  subtitle: { marginTop: 5, color: colors.muted, fontSize: 14, lineHeight: 20 },
  coachIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mintSoft,
  },
  monthPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  monthButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
  },
  monthLabel: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  success: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.mintSoft,
  },
  successText: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "600" },
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.navySoft,
  },
  summaryLabel: { color: colors.surface, opacity: 0.78, fontSize: 12, fontWeight: "700" },
  summaryValue: { color: colors.surface, fontSize: 28, fontWeight: "900" },
  summaryDivider: { width: 1, height: 38, marginHorizontal: spacing.lg, backgroundColor: colors.surface, opacity: 0.25 },
  summaryMoney: { flex: 1 },
  summaryAmount: { marginTop: 4, color: colors.surface, fontSize: 17, fontWeight: "900" },
  section: { gap: spacing.sm },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  localBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.round, backgroundColor: colors.mintSoft },
  localBadgeText: { color: colors.mintDark, fontSize: 11, fontWeight: "800" },
  insights: { gap: spacing.xs },
  insightCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  insightIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, backgroundColor: colors.mintSoft },
  insightCopy: { flex: 1 },
  insightTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  insightMessage: { marginTop: 2, color: colors.muted, fontSize: 11, lineHeight: 15 },
  insightAmount: { color: colors.mintDark, fontSize: 13, fontWeight: "900" },
  editorCard: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  editorHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  categoryChoices: { gap: spacing.xs, paddingVertical: 2 },
  categoryChoice: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radii.round, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  categoryDot: { width: 8, height: 8, borderRadius: radii.round },
  categoryText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  categoryTextActive: { color: colors.ink, fontWeight: "900" },
  amountRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs },
  input: { flex: 1, minHeight: 46, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface, color: colors.ink, fontSize: 16, fontWeight: "800" },
  currency: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  saveButton: { width: "100%", minHeight: 46, paddingHorizontal: spacing.sm, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, backgroundColor: colors.mint },
  saveButtonText: { color: colors.onPrimary, fontSize: 12, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  positionList: { gap: spacing.sm },
  positionCard: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface },
  positionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  positionIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  categoryIcon: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radii.sm },
  positionName: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  positionStatus: { marginTop: 2, fontSize: 11, fontWeight: "700" },
  positionAmount: { color: colors.ink, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  progressTrack: { height: 8, overflow: "hidden", borderRadius: radii.round, backgroundColor: colors.mintSoft },
  progressFill: { height: "100%", borderRadius: radii.round },
  positionFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  positionMeta: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 14 },
  positionActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  actionLink: { color: colors.mintDark, fontSize: 11, fontWeight: "900" },
  archived: { color: colors.muted, fontSize: 10, fontStyle: "italic" },
  emptyCard: { alignItems: "center", gap: spacing.xs, padding: spacing.xl, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  emptyText: { color: colors.muted, fontSize: 12, lineHeight: 17, textAlign: "center" },
  securityNote: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.surfaceRaised },
  securityText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.62 },
});

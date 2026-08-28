import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  formatPeriodLabel,
  getPeriodRange,
  movePeriod,
  todayISO,
  type Category,
  type Expense,
} from "@budgetia/domain";

import { BudgetApi } from "../api";
import { AddExpenseModal } from "../components/AddExpenseModal";
import { CategoryFilters } from "../components/CategoryFilters";
import { PeriodNavigator } from "../components/Controls";
import { ErrorBanner, LoadingBlock } from "../components/Feedback";
import { ExpenseRow } from "../components/ExpenseRow";
import { formatMoney } from "../format";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

export function ExpensesScreen(props: {
  api: BudgetApi;
  categories: Category[];
  refreshVersion: number;
  onAdd: () => void;
  onMutated: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [referenceDate, setReferenceDate] = useState(todayISO());
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const categoryKey = categoryIds.join(",");

  useEffect(() => {
    let active = true;
    const range = getPeriodRange("month", referenceDate);
    setLoading(true);
    setError(null);
    props.api
      .listExpenses({
        ...range,
        ...(categoryIds.length ? { categoryIds } : {}),
        limit: 500,
      })
      .then((items) => {
        if (active) setExpenses(items);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Dépenses indisponibles.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // categoryKey is the stable primitive representation of the filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.api, props.refreshVersion, referenceDate, categoryKey]);

  function confirmDelete(expense: Expense): void {
    Alert.alert(
      "Supprimer cette dépense ?",
      `${expense.note || expense.categoryName} · ${formatMoney(expense.amountCents)}`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            void props.api
              .deleteExpense(expense.id)
              .then(() => {
                setExpenses((items) => items.filter((item) => item.id !== expense.id));
                props.onMutated();
              })
              .catch((reason: unknown) =>
                setError(reason instanceof Error ? reason.message : "Suppression impossible."),
              );
          },
        },
      ],
    );
  }

  const total = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>Dépenses</Text>
            <Text style={styles.subtitle}>Retrouvez et filtrez chaque mouvement.</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajouter une dépense"
            onPress={props.onAdd}
            style={styles.add}
          >
            <Ionicons name="add" size={25} color={colors.onPrimary} />
          </Pressable>
        </View>

        <PeriodNavigator
          label={formatPeriodLabel("month", referenceDate)}
          onPrevious={() =>
            setReferenceDate((current) => movePeriod("month", current, -1))
          }
          onNext={() =>
            setReferenceDate((current) => movePeriod("month", current, 1))
          }
        />
        <CategoryFilters
          categories={props.categories}
          selectedIds={categoryIds}
          onChange={setCategoryIds}
        />

        <View style={styles.summary}>
          <View>
            <Text style={styles.summaryLabel}>Total filtré</Text>
            <Text style={styles.summaryAmount}>{formatMoney(total)}</Text>
          </View>
          <View style={styles.count}>
            <Text style={styles.countValue}>{expenses.length}</Text>
            <Text style={styles.countLabel}>dépenses</Text>
          </View>
        </View>

        {error ? <ErrorBanner message={error} /> : null}
        {loading && !expenses.length ? (
          <LoadingBlock />
        ) : expenses.length ? (
          <View>
            {expenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                onEdit={setEditingExpense}
                onDelete={confirmDelete}
              />
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={30} color={colors.mint} />
            <Text style={styles.emptyTitle}>Aucune dépense trouvée</Text>
            <Text style={styles.emptyCopy}>
              Essayez un autre mois ou retirez certains filtres.
            </Text>
          </View>
        )}
      </ScrollView>
      <AddExpenseModal
        visible={editingExpense !== null}
        api={props.api}
        categories={props.categories}
        expense={editingExpense}
        onClose={() => setEditingExpense(null)}
        onSaved={props.onMutated}
      />
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.xl },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: -1 },
  subtitle: { marginTop: 4, color: colors.muted, fontSize: 13 },
  add: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
    backgroundColor: colors.mintDark,
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  summaryLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  summaryAmount: {
    marginTop: 3,
    color: colors.ink,
    fontSize: 28,
    fontWeight: "900",
    fontVariant: ["tabular-nums"],
  },
  count: { alignItems: "flex-end" },
  countValue: { color: colors.mintDark, fontSize: 20, fontWeight: "900" },
  countLabel: { color: colors.muted, fontSize: 12 },
  empty: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radii.lg,
  },
  emptyTitle: { marginTop: spacing.sm, color: colors.ink, fontSize: 17, fontWeight: "800" },
  emptyCopy: { marginTop: spacing.xs, color: colors.muted, fontSize: 13, textAlign: "center" },
});

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { addDays, todayISO, type Category } from "@budgetia/domain";

import { BudgetApi } from "../api";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";
import { ErrorBanner } from "./Feedback";

export function AddExpenseModal(props: {
  visible: boolean;
  api: BudgetApi;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [spentAt, setSpentAt] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (props.visible) {
      setAmount("");
      setCategoryId(props.categories[0]?.id ?? "");
      setNote("");
      setSpentAt(todayISO());
      setError(null);
    }
  }, [props.categories, props.visible]);

  async function save(): Promise<void> {
    if (!amount.trim() || !categoryId) {
      setError("Indiquez un montant et une catégorie.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await props.api.addExpense({
        amount,
        categoryId,
        ...(note.trim() ? { note: note.trim() } : {}),
        spentAt,
        requestId: `mobile-${Date.now()}`,
      });
      props.onSaved();
      props.onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={props.onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Nouvelle dépense</Text>
              <Text style={styles.subtitle}>Trois informations suffisent.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              onPress={props.onClose}
              style={styles.close}
            >
              <Ionicons name="close" size={23} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Montant</Text>
            <View style={styles.amountField}>
              <TextInput
                autoFocus
                value={amount}
                onChangeText={setAmount}
                placeholder="0,00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                inputMode="decimal"
                style={styles.amountInput}
                accessibilityLabel="Montant de la dépense"
              />
              <Text style={styles.currency}>€</Text>
            </View>

            <Text style={styles.label}>Catégorie</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categories}
            >
              {props.categories.map((category) => {
                const selected = categoryId === category.id;
                return (
                  <Pressable
                    key={category.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Catégorie ${category.name}`}
                    accessibilityState={{ selected }}
                    onPress={() => setCategoryId(category.id)}
                    style={[styles.category, selected && styles.categorySelected]}
                  >
                    <View
                      style={[
                        styles.categoryIcon,
                        { backgroundColor: `${category.color}24` },
                      ]}
                    >
                      <Ionicons
                        name={category.icon as keyof typeof Ionicons.glyphMap}
                        size={20}
                        color={category.color}
                      />
                    </View>
                    <Text
                      style={[
                        styles.categoryText,
                        selected && styles.categoryTextSelected,
                      ]}
                    >
                      {category.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.twoColumns}>
              <View style={styles.column}>
                <Text style={styles.label}>Date</Text>
                <TextInput
                  value={spentAt}
                  onChangeText={setSpentAt}
                  placeholder="AAAA-MM-JJ"
                  style={styles.input}
                  accessibilityLabel="Date au format année mois jour"
                />
              </View>
              <View style={styles.quickDates}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSpentAt(todayISO())}
                  style={styles.quickDate}
                >
                  <Text style={styles.quickDateText}>Aujourd’hui</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSpentAt(addDays(todayISO(), -1))}
                  style={styles.quickDate}
                >
                  <Text style={styles.quickDateText}>Hier</Text>
                </Pressable>
              </View>
            </View>

            <Text style={styles.label}>Note (facultative)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              maxLength={160}
              placeholder="Ex. Courses du week-end"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            {error ? <ErrorBanner message={error} /> : null}

            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.submit,
                (pressed || saving) && styles.pressed,
              ]}
            >
              <Ionicons name="checkmark" size={22} color={colors.onPrimary} />
              <Text style={styles.submitText}>
                {saving ? "Enregistrement…" : "Ajouter la dépense"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.backdrop,
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "92%",
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.canvas,
  },
  handle: {
    width: 42,
    height: 4,
    alignSelf: "center",
    marginTop: spacing.sm,
    borderRadius: radii.round,
    backgroundColor: colors.border,
  },
  header: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: colors.ink, fontSize: 25, fontWeight: "900" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 13 },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.round,
    backgroundColor: colors.surface,
  },
  label: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  amountField: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: colors.ink,
  },
  amountInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 42,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  currency: { color: colors.ink, fontSize: 32, fontWeight: "800" },
  categories: { gap: spacing.xs, paddingRight: spacing.lg },
  category: {
    minWidth: 104,
    minHeight: 86,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  categorySelected: { borderColor: colors.ink, borderWidth: 2 },
  categoryIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.round,
  },
  categoryText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  categoryTextSelected: { color: colors.ink },
  twoColumns: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  column: { flex: 1 },
  quickDates: { flexDirection: "row", gap: spacing.xs, paddingBottom: 1 },
  quickDate: {
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 10,
    borderRadius: radii.sm,
    backgroundColor: colors.mintSoft,
  },
  quickDateText: { color: colors.mintDark, fontSize: 11, fontWeight: "800" },
  input: {
    minHeight: 50,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 15,
  },
  submit: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.xl,
    borderRadius: radii.md,
    backgroundColor: colors.mintDark,
  },
  submitText: { color: colors.onPrimary, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.72 },
});

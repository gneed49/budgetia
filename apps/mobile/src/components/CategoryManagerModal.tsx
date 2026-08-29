import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
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

import { type Category } from "@budgetia/domain";

import { BudgetApi, type CategoryUsage } from "../api";
import { formatMoney } from "../format";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";
import { ErrorBanner } from "./Feedback";

export function CategoryManagerModal(props: {
  visible: boolean;
  api: BudgetApi;
  category: Category | null;
  categories: Category[];
  usage: CategoryUsage | null;
  colors: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#52B788");
  const [transferToCategoryId, setTransferToCategoryId] = useState<string | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = useMemo(
    () => props.categories.filter((category) => category.id !== props.category?.id),
    [props.categories, props.category?.id],
  );
  const selectedTarget = targets.find(
    (category) => category.id === transferToCategoryId,
  );

  useEffect(() => {
    if (!props.visible || !props.category) return;
    setName(props.category.name);
    setColor(props.category.color);
    setTransferToCategoryId(null);
    setError(null);
  }, [props.category, props.visible]);

  async function save(): Promise<void> {
    if (!props.category) return;
    setSaving(true);
    setError(null);
    try {
      const result = await props.api.updateCategory({
        categoryId: props.category.id,
        name,
        color,
        ...(transferToCategoryId
          ? { transferToCategoryId }
          : {}),
      });
      const moved = result.transferredExpenseCount;
      props.onSaved(
        moved > 0
          ? `« ${result.category.name} » modifiée et ${moved} dépense${moved > 1 ? "s" : ""} transférée${moved > 1 ? "s" : ""}.`
          : `« ${result.category.name} » a été modifiée.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Modification impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWithTransfer(): Promise<void> {
    if (!props.category || !transferToCategoryId || !selectedTarget) return;
    setSaving(true);
    setError(null);
    try {
      const result = await props.api.deleteCategory({
        categoryId: props.category.id,
        strategy: "transfer",
        transferToCategoryId,
      });
      props.onSaved(
        `« ${props.category.name} » supprimée ; ${result.affectedExpenseCount} dépense${result.affectedExpenseCount > 1 ? "s" : ""} transférée${result.affectedExpenseCount > 1 ? "s" : ""} vers « ${selectedTarget.name} ».`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteWithExpenses(): Promise<void> {
    if (!props.category) return;
    setSaving(true);
    setError(null);
    try {
      const result = await props.api.deleteCategory({
        categoryId: props.category.id,
        strategy: "delete_expenses",
      });
      props.onSaved(
        `« ${props.category.name} » et ${result.affectedExpenseCount} dépense${result.affectedExpenseCount > 1 ? "s" : ""} supprimée${result.affectedExpenseCount > 1 ? "s" : ""}.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  }

  function confirmDeleteWithExpenses(): void {
    if (!props.category) return;
    const expenseCount = props.usage?.expenseCount ?? 0;
    Alert.alert(
      "Supprimer définitivement ?",
      expenseCount > 0
        ? `La catégorie « ${props.category.name} » et ses ${expenseCount} dépense${expenseCount > 1 ? "s" : ""} seront supprimées. Cette action est irréversible.`
        : `La catégorie « ${props.category.name} » sera supprimée.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Tout supprimer",
          style: "destructive",
          onPress: () => void deleteWithExpenses(),
        },
      ],
    );
  }

  const category = props.category;
  return (
    <Modal
      visible={props.visible && Boolean(category)}
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
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Gérer la catégorie</Text>
              <Text style={styles.subtitle}>
                {props.usage?.expenseCount ?? 0} dépense
                {(props.usage?.expenseCount ?? 0) > 1 ? "s" : ""} · {formatMoney(
                  props.usage?.totalCents ?? 0,
                )}
              </Text>
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

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Nom</Text>
            <TextInput
              accessibilityLabel="Nom de la catégorie"
              value={name}
              onChangeText={setName}
              maxLength={40}
              placeholder="Nom de la catégorie"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Text style={styles.label}>Couleur</Text>
            <View style={styles.colorChoices}>
              {props.colors.map((choice) => (
                <Pressable
                  key={choice}
                  accessibilityRole="button"
                  accessibilityLabel={`Couleur ${choice}`}
                  accessibilityState={{ selected: color === choice }}
                  onPress={() => setColor(choice)}
                  style={[
                    styles.colorChoice,
                    { backgroundColor: choice },
                    color === choice && styles.colorChoiceActive,
                  ]}
                />
              ))}
            </View>

            <View style={styles.transferSection}>
              <View style={styles.transferTitleRow}>
                <Ionicons name="swap-horizontal" size={19} color={colors.mintDark} />
                <Text style={styles.transferTitle}>Transférer les dépenses</Text>
              </View>
              <Text style={styles.transferCopy}>
                Facultatif lors d’une modification. Sélectionnez une destination pour
                déplacer toutes les dépenses existantes.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: transferToCategoryId === null }}
                onPress={() => setTransferToCategoryId(null)}
                style={[
                  styles.targetRow,
                  transferToCategoryId === null && styles.targetRowSelected,
                ]}
              >
                <View style={styles.keepIcon}>
                  <Ionicons name="archive-outline" size={18} color={colors.muted} />
                </View>
                <Text style={styles.targetName}>Conserver dans cette catégorie</Text>
                {transferToCategoryId === null ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.mintDark} />
                ) : null}
              </Pressable>
              {targets.map((target) => {
                const selected = transferToCategoryId === target.id;
                return (
                  <Pressable
                    key={target.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Transférer vers ${target.name}`}
                    accessibilityState={{ selected }}
                    onPress={() => setTransferToCategoryId(target.id)}
                    style={[styles.targetRow, selected && styles.targetRowSelected]}
                  >
                    <View
                      style={[styles.targetIcon, { backgroundColor: `${target.color}24` }]}
                    >
                      <Ionicons
                        name={target.icon as keyof typeof Ionicons.glyphMap}
                        size={18}
                        color={target.color}
                      />
                    </View>
                    <Text style={styles.targetName}>{target.name}</Text>
                    {target.isFallback ? (
                      <Text style={styles.fallbackLabel}>Secours</Text>
                    ) : null}
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={20} color={colors.mintDark} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {error ? <ErrorBanner message={error} /> : null}

            <Pressable
              accessibilityRole="button"
              disabled={saving || name.trim().length < 2}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || saving || name.trim().length < 2) && styles.disabled,
              ]}
            >
              <Ionicons name="checkmark" size={20} color={colors.onPrimary} />
              <Text style={styles.primaryButtonText}>
                {saving
                  ? "Enregistrement…"
                  : transferToCategoryId
                    ? "Modifier et transférer"
                    : "Enregistrer les modifications"}
              </Text>
            </Pressable>

            {category?.isFallback ? (
              <View style={styles.fallbackNotice}>
                <Ionicons name="shield-checkmark-outline" size={21} color={colors.mintDark} />
                <Text style={styles.fallbackNoticeText}>
                  Catégorie de secours permanente. Vous pouvez la renommer « Autre »,
                  mais elle reste disponible pour les dépenses non classées.
                </Text>
              </View>
            ) : (
              <View style={styles.dangerZone}>
                <Text style={styles.dangerTitle}>Supprimer la catégorie</Text>
                <Text style={styles.dangerCopy}>
                  Transférez ses dépenses vers la destination choisie, ou supprimez-les
                  définitivement avec la catégorie.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving || !transferToCategoryId}
                  onPress={() => void deleteWithTransfer()}
                  style={({ pressed }) => [
                    styles.transferDeleteButton,
                    (pressed || saving || !transferToCategoryId) && styles.disabled,
                  ]}
                >
                  <Ionicons name="git-branch-outline" size={19} color={colors.mintDark} />
                  <Text style={styles.transferDeleteText}>
                    Transférer puis supprimer
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={confirmDeleteWithExpenses}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    (pressed || saving) && styles.disabled,
                  ]}
                >
                  <Ionicons name="trash-outline" size={19} color={colors.coral} />
                  <Text style={styles.deleteButtonText}>
                    Supprimer avec les dépenses
                  </Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: colors.backdrop,
    },
    sheet: {
      width: "100%",
      maxWidth: 520,
      maxHeight: "94%",
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
      gap: spacing.sm,
    },
    headerCopy: { flex: 1 },
    title: { color: colors.ink, fontSize: 24, fontWeight: "900" },
    subtitle: { marginTop: 4, color: colors.muted, fontSize: 13 },
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
    input: {
      minHeight: 52,
      paddingHorizontal: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
      color: colors.ink,
      fontSize: 15,
    },
    colorChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    colorChoice: { width: 36, height: 36, borderRadius: radii.round },
    colorChoiceActive: { borderWidth: 3, borderColor: colors.ink },
    transferSection: {
      gap: spacing.xs,
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    transferTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    transferTitle: { color: colors.ink, fontSize: 16, fontWeight: "900" },
    transferCopy: { color: colors.muted, fontSize: 12, lineHeight: 18 },
    targetRow: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
    },
    targetRowSelected: { borderColor: colors.mint, backgroundColor: colors.mintSoft },
    targetIcon: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radii.round,
    },
    keepIcon: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radii.round,
      backgroundColor: colors.canvas,
    },
    targetName: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "700" },
    fallbackLabel: {
      color: colors.mintDark,
      fontSize: 10,
      fontWeight: "900",
      textTransform: "uppercase",
    },
    primaryButton: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      marginTop: spacing.xl,
      borderRadius: radii.md,
      backgroundColor: colors.mintDark,
    },
    primaryButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: "900" },
    fallbackNotice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.xs,
      marginTop: spacing.lg,
      padding: spacing.sm,
      borderRadius: radii.sm,
      backgroundColor: colors.mintSoft,
    },
    fallbackNoticeText: {
      flex: 1,
      color: colors.ink,
      fontSize: 12,
      lineHeight: 18,
    },
    dangerZone: {
      gap: spacing.xs,
      marginTop: spacing.xl,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    dangerTitle: { color: colors.ink, fontSize: 16, fontWeight: "900" },
    dangerCopy: { color: colors.muted, fontSize: 12, lineHeight: 18 },
    transferDeleteButton: {
      minHeight: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.mint,
      borderRadius: radii.sm,
      backgroundColor: colors.surface,
    },
    transferDeleteText: { color: colors.mintDark, fontSize: 13, fontWeight: "900" },
    deleteButton: {
      minHeight: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.coral,
      borderRadius: radii.sm,
      backgroundColor: colors.dangerSoft,
    },
    deleteButtonText: { color: colors.coral, fontSize: 13, fontWeight: "900" },
    disabled: { opacity: 0.48 },
  });

import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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

import {
  PRODUCT_GROUPS,
  normalizeCategoryName,
  parseMoneyToCents,
  parseReceiptText,
  todayISO,
  type Category,
  type ProductGroup,
} from "@budgetia/domain";

import { recognizeReceiptText } from "../../modules/budgetia-receipt-ocr/src/BudgetiaReceiptOcrModule";
import { BudgetApi } from "../api";
import { formatMoney } from "../format";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";
import { ErrorBanner } from "./Feedback";

interface EditableLine {
  key: string;
  label: string;
  amount: string;
  productGroup: ProductGroup;
}

function moneyInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function safeCents(value: string): number {
  try {
    return parseMoneyToCents(value);
  } catch {
    return 0;
  }
}

function newLine(): EditableLine {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label: "",
    amount: "",
    productGroup: "other",
  };
}

function discardCachedImage(uri: string | null): void {
  if (!uri || Platform.OS === "web" || !uri.startsWith(Paths.cache.uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup must never hide a validated receipt or break modal closing.
  }
}

export function ReceiptScannerModal(props: {
  visible: boolean;
  api: BudgetApi;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [reviewing, setReviewing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [spentAt, setSpentAt] = useState(todayISO());
  const [note, setNote] = useState("");
  const [printedTotal, setPrintedTotal] = useState("");
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const preferredCategoryId = useMemo(
    () =>
      props.categories.find((category) => {
        const name = normalizeCategoryName(category.name);
        return name.includes("aliment") || name.includes("course");
      })?.id ?? props.categories[0]?.id ?? "",
    [props.categories],
  );

  useEffect(() => {
    if (!props.visible) return;
    setReviewing(false);
    setScanning(false);
    setSaving(false);
    setImageUri(null);
    setMerchant("");
    setCategoryId(preferredCategoryId);
    setSpentAt(todayISO());
    setNote("");
    setPrintedTotal("");
    setLines([]);
    setExpandedLine(null);
    setWarnings([]);
    setError(null);
  }, [preferredCategoryId, props.visible]);

  useEffect(() => () => discardCachedImage(imageUri), [imageUri]);

  const lineTotal = lines.reduce((sum, line) => sum + safeCents(line.amount), 0);
  const expectedTotal = printedTotal.trim() ? safeCents(printedTotal) : 0;
  const totalsMatch = expectedTotal > 0 && expectedTotal === lineTotal;

  function beginManual(): void {
    setReviewing(true);
    setLines([newLine()]);
    setPrintedTotal("");
    setWarnings([
      "Saisissez chaque ligne utile, puis vérifiez que leur somme correspond au total du ticket.",
    ]);
  }

  async function selectImage(source: "camera" | "library"): Promise<void> {
    if (Platform.OS === "web") {
      setError("Le scan OCR est disponible dans l’app Android ou iOS installée.");
      return;
    }
    setError(null);
    try {
      const permission = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(
          source === "camera"
            ? "Autorisez l’appareil photo pour scanner un ticket."
            : "Autorisez l’accès aux photos pour choisir un ticket.",
        );
        return;
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
      const uri = result.assets?.[0]?.uri;
      if (result.canceled || !uri) return;
      setImageUri(uri);
      setScanning(true);
      const recognized = await recognizeReceiptText(uri);
      const analysis = parseReceiptText(recognized.text);
      const nextLines = analysis.items.map((item, index) => ({
        key: `ocr-${Date.now()}-${index}`,
        label: item.label,
        amount: moneyInput(item.amountCents),
        productGroup: item.productGroup,
      }));
      const lineSum = analysis.items.reduce((sum, item) => sum + item.amountCents, 0);
      setMerchant(analysis.merchant);
      setLines(nextLines.length ? nextLines : [newLine()]);
      setPrintedTotal(
        analysis.detectedTotalCents
          ? moneyInput(analysis.detectedTotalCents)
          : lineSum > 0
            ? moneyInput(lineSum)
            : "",
      );
      setWarnings(analysis.warnings);
      setReviewing(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Le ticket n’a pas pu être analysé.",
      );
    } finally {
      setScanning(false);
    }
  }

  function updateLine(key: string, patch: Partial<EditableLine>): void {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  async function save(): Promise<void> {
    setError(null);
    if (!categoryId) {
      setError("Choisissez la catégorie globale de la dépense.");
      return;
    }
    if (!lines.length || lines.some((line) => !line.label.trim() || safeCents(line.amount) < 1)) {
      setError("Chaque ligne doit avoir un libellé et un montant positif.");
      return;
    }
    if (!totalsMatch) {
      setError("Le total imprimé doit être égal à la somme des lignes validées.");
      return;
    }
    setSaving(true);
    try {
      await props.api.addReceiptExpense({
        categoryId,
        merchant,
        note: note.trim() || (merchant ? `Ticket ${merchant}` : "Ticket de caisse"),
        spentAt,
        requestId: `receipt-mobile-${Date.now()}`,
        items: lines.map((line) => ({
          label: line.label.trim(),
          amountCents: parseMoneyToCents(line.amount),
          productGroup: line.productGroup,
        })),
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
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Scanner un ticket</Text>
              <Text style={styles.subtitle}>
                {reviewing ? "Vérifiez chaque ligne avant l’enregistrement." : "Analyse privée, directement sur cet appareil."}
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

          {!reviewing ? (
            <View style={styles.captureContent}>
              <View style={styles.privacyCard}>
                <View style={styles.privacyIcon}>
                  <Ionicons name="shield-checkmark" size={28} color={colors.mintDark} />
                </View>
                <Text style={styles.privacyTitle}>La photo reste privée</Text>
                <Text style={styles.privacyCopy}>
                  Budgetia reconnaît le texte sur l’appareil. Seules les lignes que vous confirmez sont enregistrées ; jamais la photo ni le texte brut.
                </Text>
              </View>
              {scanning ? (
                <View style={styles.scanning}>
                  <ActivityIndicator color={colors.mintDark} size="large" />
                  <Text style={styles.scanningTitle}>Lecture du ticket…</Text>
                  <Text style={styles.scanningCopy}>Gardez l’app ouverte quelques secondes.</Text>
                </View>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void selectImage("camera")}
                    style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
                  >
                    <Ionicons name="camera" size={24} color={colors.onPrimary} />
                    <Text style={styles.primaryActionText}>Photographier le ticket</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void selectImage("library")}
                    style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
                  >
                    <Ionicons name="images-outline" size={22} color={colors.ink} />
                    <Text style={styles.secondaryActionText}>Choisir une photo</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={beginManual} style={styles.manualAction}>
                    <Text style={styles.manualText}>Saisir les lignes manuellement</Text>
                  </Pressable>
                </>
              )}
              {error ? <ErrorBanner message={error} /> : null}
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.reviewContent}
            >
              {imageUri ? (
                <View style={styles.previewRow}>
                  <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
                  <View style={styles.previewCopy}>
                    <Text style={styles.previewTitle}>Analyse terminée</Text>
                    <Text style={styles.previewText}>Budgetia ne conservera aucune copie après la fermeture.</Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.label}>Commerçant</Text>
              <TextInput
                accessibilityLabel="Commerçant"
                value={merchant}
                onChangeText={setMerchant}
                maxLength={80}
                placeholder="Ex. Carrefour City"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />

              <Text style={styles.label}>Catégorie de la dépense</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {props.categories.map((category) => {
                  const selected = category.id === categoryId;
                  return (
                    <Pressable
                      key={category.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setCategoryId(category.id)}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <View style={[styles.chipDot, { backgroundColor: category.color }]} />
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{category.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>Date</Text>
                  <TextInput
                    accessibilityLabel="Date du ticket au format année mois jour"
                    value={spentAt}
                    onChangeText={setSpentAt}
                    style={styles.input}
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.label}>Total imprimé</Text>
                  <View style={[styles.totalInput, !totalsMatch && printedTotal ? styles.totalMismatch : null]}>
                    <TextInput
                      accessibilityLabel="Total imprimé du ticket"
                      value={printedTotal}
                      onChangeText={setPrintedTotal}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      placeholderTextColor={colors.muted}
                      style={styles.totalInputText}
                    />
                    <Text style={styles.euro}>€</Text>
                  </View>
                </View>
              </View>

              <View style={styles.linesHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Lignes du ticket</Text>
                  <Text style={styles.sectionCopy}>{lines.length} ligne(s) · {formatMoney(lineTotal)}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setLines((current) => [...current, newLine()])}
                  style={styles.addLine}
                >
                  <Ionicons name="add" size={19} color={colors.mintDark} />
                  <Text style={styles.addLineText}>Ligne</Text>
                </Pressable>
              </View>

              {warnings.map((warning) => (
                <View key={warning} style={styles.warning}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.amber} />
                  <Text style={styles.warningText}>{warning}</Text>
                </View>
              ))}

              {lines.map((line, index) => {
                const definition = PRODUCT_GROUPS.find((group) => group.key === line.productGroup)!;
                const expanded = expandedLine === line.key;
                return (
                  <View key={line.key} style={styles.lineCard}>
                    <View style={styles.lineTop}>
                      <Text style={styles.lineNumber}>{index + 1}</Text>
                      <TextInput
                        accessibilityLabel={`Nom du produit, ligne ${index + 1}`}
                        value={line.label}
                        onChangeText={(value) => updateLine(line.key, { label: value })}
                        maxLength={120}
                        placeholder="Nom du produit"
                        placeholderTextColor={colors.muted}
                        style={styles.lineLabelInput}
                      />
                      <View style={styles.lineAmountBox}>
                        <TextInput
                          accessibilityLabel={`Montant du produit, ligne ${index + 1}`}
                          value={line.amount}
                          onChangeText={(value) => updateLine(line.key, { amount: value })}
                          keyboardType="decimal-pad"
                          placeholder="0,00"
                          placeholderTextColor={colors.muted}
                          style={styles.lineAmountInput}
                        />
                        <Text style={styles.lineEuro}>€</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Supprimer la ligne ${index + 1}`}
                        onPress={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                        hitSlop={8}
                        style={styles.removeLine}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.coral} />
                      </Pressable>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      onPress={() => setExpandedLine(expanded ? null : line.key)}
                      style={styles.groupButton}
                    >
                      <View style={[styles.groupDot, { backgroundColor: definition.color }]} />
                      <Text style={styles.groupButtonText}>{definition.label}</Text>
                      <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
                    </Pressable>
                    {expanded ? (
                      <View style={styles.groupGrid}>
                        {PRODUCT_GROUPS.map((group) => {
                          const selected = line.productGroup === group.key;
                          return (
                            <Pressable
                              key={group.key}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              onPress={() => {
                                updateLine(line.key, { productGroup: group.key });
                                setExpandedLine(null);
                              }}
                              style={[styles.groupChoice, selected && styles.groupChoiceSelected]}
                            >
                              <View style={[styles.groupDot, { backgroundColor: group.color }]} />
                              <Text style={[styles.groupChoiceText, selected && styles.groupChoiceTextSelected]}>{group.label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}

              <Text style={styles.label}>Note (facultative)</Text>
              <TextInput
                accessibilityLabel="Note du ticket"
                value={note}
                onChangeText={setNote}
                maxLength={160}
                placeholder="Ex. Courses de la semaine"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />

              <View style={[styles.reconciliation, totalsMatch ? styles.reconciliationOk : styles.reconciliationError]}>
                <Ionicons
                  name={totalsMatch ? "checkmark-circle" : "alert-circle"}
                  size={23}
                  color={totalsMatch ? colors.mintDark : colors.coral}
                />
                <View style={styles.reconciliationCopy}>
                  <Text style={styles.reconciliationTitle}>
                    {totalsMatch ? "Ticket équilibré" : "Vérification nécessaire"}
                  </Text>
                  <Text style={styles.reconciliationText}>
                    Total des lignes : {formatMoney(lineTotal)} · Total imprimé : {expectedTotal ? formatMoney(expectedTotal) : "à saisir"}
                  </Text>
                </View>
              </View>

              {error ? <ErrorBanner message={error} /> : null}
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void save()}
                style={({ pressed }) => [styles.primaryAction, (pressed || saving) && styles.pressed]}
              >
                {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons name="checkmark" size={22} color={colors.onPrimary} />}
                <Text style={styles.primaryActionText}>{saving ? "Enregistrement…" : "Enregistrer la dépense et ses détails"}</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.backdrop },
  sheet: {
    width: "100%",
    maxWidth: 620,
    maxHeight: "96%",
    minHeight: "58%",
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.canvas,
  },
  handle: { width: 42, height: 4, alignSelf: "center", marginTop: spacing.sm, borderRadius: radii.round, backgroundColor: colors.border },
  header: { minHeight: 88, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerCopy: { flex: 1, paddingRight: spacing.sm },
  title: { color: colors.ink, fontSize: 25, fontWeight: "900" },
  subtitle: { marginTop: 3, color: colors.muted, fontSize: 13 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, backgroundColor: colors.surface },
  captureContent: { gap: spacing.sm, paddingBottom: spacing.lg },
  privacyCard: { alignItems: "center", padding: spacing.xl, borderRadius: radii.lg, backgroundColor: colors.mintSoft },
  privacyIcon: { width: 58, height: 58, alignItems: "center", justifyContent: "center", borderRadius: radii.round, backgroundColor: colors.surface },
  privacyTitle: { marginTop: spacing.sm, color: colors.ink, fontSize: 18, fontWeight: "900" },
  privacyCopy: { marginTop: spacing.xs, color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center" },
  scanning: { minHeight: 170, alignItems: "center", justifyContent: "center" },
  scanningTitle: { marginTop: spacing.md, color: colors.ink, fontSize: 17, fontWeight: "800" },
  scanningCopy: { marginTop: spacing.xs, color: colors.muted, fontSize: 13 },
  primaryAction: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, marginTop: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, backgroundColor: colors.mintDark },
  primaryActionText: { color: colors.onPrimary, fontSize: 15, fontWeight: "900", textAlign: "center" },
  secondaryAction: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  secondaryActionText: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  manualAction: { alignItems: "center", padding: spacing.sm },
  manualText: { color: colors.mintDark, fontSize: 13, fontWeight: "800" },
  reviewContent: { paddingBottom: spacing.xl },
  previewRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface },
  preview: { width: 58, height: 70, borderRadius: radii.sm, backgroundColor: colors.border },
  previewCopy: { flex: 1 },
  previewTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  previewText: { marginTop: 3, color: colors.muted, fontSize: 12 },
  label: { marginTop: spacing.md, marginBottom: spacing.xs, color: colors.ink, fontSize: 13, fontWeight: "800" },
  input: { minHeight: 50, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface, color: colors.ink, fontSize: 15 },
  chips: { gap: spacing.xs, paddingRight: spacing.lg },
  chip: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, backgroundColor: colors.surface },
  chipSelected: { borderColor: colors.ink, backgroundColor: colors.mintSoft },
  chipDot: { width: 9, height: 9, borderRadius: radii.round },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  chipTextSelected: { color: colors.ink },
  fieldRow: { flexDirection: "row", gap: spacing.sm },
  fieldHalf: { flex: 1 },
  totalInput: { minHeight: 50, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface },
  totalMismatch: { borderColor: colors.coral },
  totalInputText: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"] },
  euro: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  linesHeader: { marginTop: spacing.xl, marginBottom: spacing.xs, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  sectionCopy: { marginTop: 3, color: colors.muted, fontSize: 12 },
  addLine: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: spacing.sm, borderRadius: radii.round, backgroundColor: colors.mintSoft },
  addLineText: { color: colors.mintDark, fontSize: 12, fontWeight: "800" },
  warning: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs, marginVertical: spacing.xs, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.surface },
  warningText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 17 },
  lineCard: { marginTop: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  lineTop: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  lineNumber: { width: 22, color: colors.muted, fontSize: 12, fontWeight: "800", textAlign: "center" },
  lineLabelInput: { flex: 1, minWidth: 80, minHeight: 42, color: colors.ink, fontSize: 14, fontWeight: "700" },
  lineAmountBox: { width: 82, height: 42, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.xs, borderRadius: radii.sm, backgroundColor: colors.canvas },
  lineAmountInput: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "800", textAlign: "right", fontVariant: ["tabular-nums"] },
  lineEuro: { marginLeft: 3, color: colors.muted, fontSize: 13 },
  removeLine: { width: 28, height: 42, alignItems: "center", justifyContent: "center" },
  groupButton: { alignSelf: "flex-start", minHeight: 34, flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.xs, paddingHorizontal: spacing.xs, borderRadius: radii.round, backgroundColor: colors.canvas },
  groupDot: { width: 9, height: 9, borderRadius: radii.round },
  groupButtonText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  groupGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  groupChoice: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.round },
  groupChoiceSelected: { borderColor: colors.ink, backgroundColor: colors.mintSoft },
  groupChoiceText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  groupChoiceTextSelected: { color: colors.ink },
  reconciliation: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, padding: spacing.md, borderWidth: 1, borderRadius: radii.md },
  reconciliationOk: { borderColor: colors.mintDark, backgroundColor: colors.mintSoft },
  reconciliationError: { borderColor: colors.coral, backgroundColor: colors.dangerSoft },
  reconciliationCopy: { flex: 1 },
  reconciliationTitle: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  reconciliationText: { marginTop: 3, color: colors.muted, fontSize: 12 },
  pressed: { opacity: 0.7 },
});

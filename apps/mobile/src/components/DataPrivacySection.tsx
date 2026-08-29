import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  deleteCurrentAccount,
  getAccountDeletionImpact,
  type AccountDeletionImpact,
  type BudgetApi,
} from "../api";
import { exportExpensesCsv } from "../export";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

const publicWebUrl = process.env.EXPO_PUBLIC_BUDGETIA_WEB_URL?.trim().replace(/\/+$/, "");

function publicLegalUrl(page: string): string | null {
  if (!publicWebUrl || !/^https:\/\/[^/]+/.test(publicWebUrl)) return null;
  return `${publicWebUrl}/legal/${page}`;
}

const privacyUrl = publicLegalUrl("privacy.html");
const termsUrl = publicLegalUrl("terms.html");
const supportUrl = publicLegalUrl("support.html");

export function DataPrivacySection(props: {
  api: BudgetApi;
  spaceName: string;
  onDeleted: () => void;
  onFeedback: (message: string | null, error: string | null) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [impact, setImpact] = useState<AccountDeletionImpact | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportData(): Promise<void> {
    setBusy(true);
    props.onFeedback(null, null);
    try {
      const expenses = await props.api.listAllExpenses();
      const fileName = await exportExpensesCsv(expenses, props.spaceName);
      props.onFeedback(`${expenses.length} dépense(s) exportée(s) dans ${fileName}.`, null);
    } catch (reason) {
      props.onFeedback(null, reason instanceof Error ? reason.message : "Export impossible.");
    } finally {
      setBusy(false);
    }
  }

  function openPublicPage(url: string | null): void {
    if (!url) {
      Alert.alert(
        "Page indisponible",
        "L’URL publique Budgetia doit être configurée par l’éditeur de cette version.",
      );
      return;
    }
    void Linking.openURL(url).catch(() => {
      Alert.alert("Page indisponible", "Impossible d’ouvrir cette page pour le moment.");
    });
  }

  async function prepareDeletion(): Promise<void> {
    setBusy(true);
    props.onFeedback(null, null);
    try {
      setImpact(await getAccountDeletionImpact());
    } catch (reason) {
      props.onFeedback(
        null,
        reason instanceof Error ? reason.message : "Préparation impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmDeletion(): void {
    Alert.alert(
      "Supprimer définitivement votre compte ?",
      "Votre budget personnel sera supprimé. Vos dépenses communes resteront anonymisées dans les budgets partagés.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => void deleteAccount(),
        },
      ],
    );
  }

  async function deleteAccount(): Promise<void> {
    setBusy(true);
    props.onFeedback(null, null);
    try {
      await deleteCurrentAccount();
      props.onDeleted();
    } catch (reason) {
      props.onFeedback(
        null,
        reason instanceof Error ? reason.message : "Suppression impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>Vos données</Text>
      <Text style={styles.copy}>
        Exportez le budget sélectionné au format CSV ou consultez les engagements Budgetia.
      </Text>
      <Pressable disabled={busy} onPress={() => void exportData()} style={styles.outlineButton}>
        <Ionicons name="download-outline" size={18} color={colors.mintDark} />
        <Text style={styles.outlineText}>Exporter « {props.spaceName} » en CSV</Text>
      </Pressable>
      <View style={styles.links}>
        <Pressable onPress={() => openPublicPage(privacyUrl)}><Text style={styles.link}>Confidentialité</Text></Pressable>
        <Pressable onPress={() => openPublicPage(termsUrl)}><Text style={styles.link}>Conditions</Text></Pressable>
        <Pressable onPress={() => openPublicPage(supportUrl)}><Text style={styles.link}>Support</Text></Pressable>
      </View>

      <View style={styles.dangerBox}>
        <Text style={styles.dangerTitle}>Supprimer mon compte</Text>
        {!impact ? (
          <Pressable disabled={busy} onPress={() => void prepareDeletion()} style={styles.prepareButton}>
            <Text style={styles.prepareText}>Voir les conséquences</Text>
          </Pressable>
        ) : (
          <>
            <Text style={styles.copy}>
              {impact.personalExpenseCount} dépense(s) personnelle(s) supprimée(s) · {impact.sharedMembershipCount} budget(s) commun(s) quitté(s) · {impact.sharedExpenseCountKept} dépense(s) commune(s) conservée(s) sans auteur.
            </Text>
            <Text style={styles.copy}>
              Saisissez SUPPRIMER pour confirmer.
            </Text>
            <TextInput
              accessibilityLabel="Confirmation de suppression du compte"
              value={confirmation}
              onChangeText={setConfirmation}
              autoCapitalize="characters"
              placeholder="SUPPRIMER"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Pressable
              disabled={busy || confirmation !== "SUPPRIMER"}
              onPress={confirmDeletion}
              style={({ pressed }) => [styles.deleteButton, (pressed || busy || confirmation !== "SUPPRIMER") && styles.disabled]}
            >
              <Text style={styles.deleteText}>Supprimer définitivement mon compte</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrapper: { gap: spacing.sm },
    title: { color: colors.ink, fontSize: 19, fontWeight: "900" },
    copy: { color: colors.muted, fontSize: 12, lineHeight: 18 },
    outlineButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.mint, borderRadius: radii.sm, backgroundColor: colors.surface },
    outlineText: { color: colors.mintDark, fontSize: 13, fontWeight: "900" },
    links: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    link: { color: colors.mintDark, fontSize: 12, fontWeight: "800", textDecorationLine: "underline" },
    dangerBox: { gap: spacing.xs, marginTop: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.dangerSoft },
    dangerTitle: { color: colors.coral, fontSize: 14, fontWeight: "900" },
    prepareButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.coral, borderRadius: radii.sm },
    prepareText: { color: colors.coral, fontSize: 12, fontWeight: "900" },
    input: { minHeight: 46, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.coral, borderRadius: radii.sm, backgroundColor: colors.surface, color: colors.ink },
    deleteButton: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, backgroundColor: colors.coral },
    deleteText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
    disabled: { opacity: 0.45 },
  });

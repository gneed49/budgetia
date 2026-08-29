import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  deleteAllCoachData,
  deleteCoachCredential,
  getCoachCredentialStatus,
  getCoachPreferences,
  registerCoachPushDevice,
  saveCoachCredential,
  updateCoachPreferences,
  type CoachCredentialStatus,
  type CoachAdviceKind,
  type CoachGuidanceStyle,
  type CoachPreferences,
} from "../coach";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

const styleChoices: Array<{ id: CoachGuidanceStyle; label: string }> = [
  { id: "cautious", label: "Prudent" },
  { id: "balanced", label: "Équilibré" },
  { id: "encouraging", label: "Encourageant" },
];

const adviceChoices: Array<{ id: CoachAdviceKind; label: string }> = [
  { id: "reduce_spending", label: "Réduire un poste" },
  { id: "review_subscription", label: "Revoir un abonnement" },
  { id: "protect_margin", label: "Protéger la marge" },
  { id: "plan_next_month", label: "Préparer le mois" },
  { id: "celebrate_progress", label: "Valoriser les progrès" },
];

const dayChoices = [
  { id: 1, label: "Lun" },
  { id: 5, label: "Ven" },
  { id: 7, label: "Dim" },
];

const hourChoices = [8, 9, 18, 20];

export function AiCoachSettings(props: {
  onFeedback: (message: string | null, error: string | null) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [preferences, setPreferences] = useState<CoachPreferences | null>(null);
  const [credential, setCredential] = useState<CoachCredentialStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setBusy(true);
    void Promise.all([getCoachPreferences(), getCoachCredentialStatus()])
      .then(([nextPreferences, nextCredential]) => {
        if (!active) return;
        setPreferences(nextPreferences);
        setCredential(nextCredential);
      })
      .catch((reason: unknown) => {
        if (active) {
          props.onFeedback(
            null,
            reason instanceof Error ? reason.message : "Réglages du Coach indisponibles.",
          );
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [props.onFeedback]);

  async function patchPreferences(values: Partial<CoachPreferences>): Promise<void> {
    setBusy(true);
    props.onFeedback(null, null);
    try {
      setPreferences(await updateCoachPreferences(values));
      props.onFeedback("Préférences du Coach enregistrées.", null);
    } catch (reason) {
      props.onFeedback(null, reason instanceof Error ? reason.message : "Réglage impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePush(enabled: boolean): Promise<void> {
    setBusy(true);
    props.onFeedback(null, null);
    try {
      if (enabled) await registerCoachPushDevice();
      setPreferences(await updateCoachPreferences({ pushNotificationsEnabled: enabled }));
      props.onFeedback(
        enabled ? "Notifications du Coach activées sur ce téléphone." : "Notifications du Coach désactivées.",
        null,
      );
    } catch (reason) {
      props.onFeedback(null, reason instanceof Error ? reason.message : "Activation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function saveKey(): Promise<void> {
    if (!apiKey.trim()) return;
    setBusy(true);
    props.onFeedback(null, null);
    try {
      setCredential(await saveCoachCredential(apiKey));
      setApiKey("");
      setShowKey(false);
      props.onFeedback("Clé validée puis chiffrée dans le coffre Supabase.", null);
    } catch (reason) {
      props.onFeedback(null, reason instanceof Error ? reason.message : "Clé non enregistrée.");
    } finally {
      setApiKey("");
      setBusy(false);
    }
  }

  function confirmDeleteKey(): void {
    Alert.alert(
      "Supprimer la clé OpenAI ?",
      "Les prochains bilans resteront disponibles en mode calcul vérifiable.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            void deleteCoachCredential()
              .then(() => {
                setCredential({
                  configured: false,
                  provider: null,
                  lastFour: null,
                  model: null,
                  status: null,
                  validatedAt: null,
                  lastUsedAt: null,
                  lastErrorCode: null,
                });
                props.onFeedback("Clé OpenAI supprimée du coffre.", null);
              })
              .catch((reason: unknown) =>
                props.onFeedback(null, reason instanceof Error ? reason.message : "Suppression impossible."),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  function confirmDeleteData(): void {
    Alert.alert(
      "Effacer les données du Coach ?",
      "Les bilans, conseils, notifications, préférences et la clé chiffrée seront supprimés. Vos dépenses restent intactes.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Tout effacer",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            void deleteAllCoachData()
              .then(async () => {
                const [nextPreferences, nextCredential] = await Promise.all([
                  getCoachPreferences(),
                  getCoachCredentialStatus(),
                ]);
                setPreferences(nextPreferences);
                setCredential(nextCredential);
                props.onFeedback("Toutes les données du Coach ont été supprimées.", null);
              })
              .catch((reason: unknown) =>
                props.onFeedback(null, reason instanceof Error ? reason.message : "Suppression impossible."),
              )
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Ionicons name="sparkles" size={21} color={colors.mintDark} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>Coach intelligent privé</Text>
          <Text style={styles.copy}>
            Aucun champ de prompt : l’agent analyse seulement des totaux structurés et des catégories anonymisées.
          </Text>
        </View>
      </View>

      {preferences ? (
        <View style={styles.options}>
          <SettingToggle
            label="Activer les analyses automatiques"
            value={preferences.enabled}
            disabled={busy}
            colors={colors}
            onChange={(value) =>
              void patchPreferences({
                enabled: value,
                ...(value
                  ? { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }
                  : {}),
              })
            }
          />
          <SettingToggle
            label="Bilan hebdomadaire"
            value={preferences.weeklyReportEnabled}
            disabled={busy || !preferences.enabled}
            colors={colors}
            onChange={(value) => void patchPreferences({ weeklyReportEnabled: value })}
          />
          <SettingToggle
            label="Bilan mensuel"
            value={preferences.monthlyReportEnabled}
            disabled={busy || !preferences.enabled}
            colors={colors}
            onChange={(value) => void patchPreferences({ monthlyReportEnabled: value })}
          />
          <SettingToggle
            label="Alertes de dépassement"
            value={preferences.thresholdNotificationsEnabled}
            disabled={busy || !preferences.enabled}
            colors={colors}
            onChange={(value) => void patchPreferences({ thresholdNotificationsEnabled: value })}
          />
          <SettingToggle
            label="Notifications sur ce téléphone"
            value={preferences.pushNotificationsEnabled}
            disabled={busy || !preferences.enabled}
            colors={colors}
            onChange={(value) => void togglePush(value)}
          />
          <View style={styles.styleBlock}>
            <Text style={styles.label}>Ton des conseils</Text>
            <View style={styles.styleChoices}>
              {styleChoices.map((choice) => (
                <Pressable
                  key={choice.id}
                  disabled={busy}
                  onPress={() => void patchPreferences({ guidanceStyle: choice.id })}
                  style={[
                    styles.styleChoice,
                    preferences.guidanceStyle === choice.id && styles.styleChoiceActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.styleChoiceText,
                      preferences.guidanceStyle === choice.id && styles.styleChoiceTextActive,
                    ]}
                  >
                    {choice.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.styleBlock}>
            <Text style={styles.label}>Bilan hebdomadaire</Text>
            <View style={styles.styleChoices}>
              {dayChoices.map((choice) => (
                <Pressable
                  key={choice.id}
                  disabled={busy}
                  onPress={() => void patchPreferences({ weeklyDay: choice.id })}
                  style={[
                    styles.styleChoice,
                    preferences.weeklyDay === choice.id && styles.styleChoiceActive,
                  ]}
                >
                  <Text style={[styles.styleChoiceText, preferences.weeklyDay === choice.id && styles.styleChoiceTextActive]}>
                    {choice.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.styleChoices}>
              {hourChoices.map((hour) => (
                <Pressable
                  key={hour}
                  disabled={busy}
                  onPress={() => void patchPreferences({ weeklyHour: hour })}
                  style={[
                    styles.styleChoice,
                    preferences.weeklyHour === hour && styles.styleChoiceActive,
                  ]}
                >
                  <Text style={[styles.styleChoiceText, preferences.weeklyHour === hour && styles.styleChoiceTextActive]}>
                    {hour} h
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.keyHint}>Fuseau : {preferences.timezone}</Text>
          </View>
          <View style={styles.styleBlock}>
            <Text style={styles.label}>Types de conseils masqués</Text>
            <View style={styles.adviceChoices}>
              {adviceChoices.map((choice) => {
                const hidden = preferences.hiddenAdviceTypes.includes(choice.id);
                return (
                  <Pressable
                    key={choice.id}
                    disabled={busy}
                    onPress={() =>
                      void patchPreferences({
                        hiddenAdviceTypes: hidden
                          ? preferences.hiddenAdviceTypes.filter((kind) => kind !== choice.id)
                          : [...preferences.hiddenAdviceTypes, choice.id],
                      })
                    }
                    style={[styles.adviceChoice, hidden && styles.adviceChoiceHidden]}
                  >
                    <Ionicons
                      name={hidden ? "eye-off-outline" : "eye-outline"}
                      size={15}
                      color={hidden ? colors.coral : colors.mintDark}
                    />
                    <Text style={[styles.adviceChoiceText, hidden && { color: colors.coral }]}>
                      {choice.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      ) : (
        <Text style={styles.copy}>{busy ? "Chargement…" : "Préférences indisponibles."}</Text>
      )}

      <View style={styles.keyBox}>
        <View style={styles.keyStatus}>
          <Ionicons
            name={credential?.configured ? "shield-checkmark" : "key-outline"}
            size={19}
            color={credential?.status === "invalid" ? colors.coral : colors.mintDark}
          />
          <View style={styles.keyStatusCopy}>
            <Text style={styles.label}>
              {credential?.configured ? `Clé OpenAI •••• ${credential.lastFour}` : "Clé OpenAI facultative"}
            </Text>
            <Text style={styles.keyHint}>
              {credential?.configured
                ? credential.status === "invalid"
                  ? "Clé refusée : remplacez-la pour réactiver les conseils IA."
                  : `Chiffrée côté serveur · modèle ${credential.model ?? "Budgetia"}`
                : "Sans clé, les bilans déterministes restent disponibles."}
            </Text>
          </View>
        </View>
        <View style={styles.keyInputRow}>
          <TextInput
            accessibilityLabel="Clé API OpenAI"
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry={!showKey}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="sk-…"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Pressable onPress={() => setShowKey((current) => !current)} hitSlop={8}>
            <Ionicons name={showKey ? "eye-off-outline" : "eye-outline"} size={21} color={colors.muted} />
          </Pressable>
        </View>
        <Pressable
          disabled={busy || !apiKey.trim()}
          onPress={() => void saveKey()}
          style={[styles.primaryButton, (busy || !apiKey.trim()) && styles.disabled]}
        >
          <Text style={styles.primaryButtonText}>Valider et chiffrer la clé</Text>
        </Pressable>
        {credential?.configured ? (
          <Pressable disabled={busy} onPress={confirmDeleteKey}>
            <Text style={styles.deleteKey}>Supprimer la clé enregistrée</Text>
          </Pressable>
        ) : null}
        <Text style={styles.legalHint}>
          La clé n’est jamais ajoutée au code ni conservée sur ce téléphone. Un abonnement ChatGPT ne comprend pas la facturation de l’API OpenAI.
        </Text>
      </View>

      <Pressable disabled={busy} onPress={confirmDeleteData} style={styles.deleteDataButton}>
        <Ionicons name="trash-outline" size={17} color={colors.coral} />
        <Text style={styles.deleteDataText}>Effacer mes données Coach et ma clé</Text>
      </Pressable>
    </View>
  );
}

function SettingToggle(props: {
  label: string;
  value: boolean;
  disabled: boolean;
  colors: ThemeColors;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={toggleStyles.row}>
      <Text style={[toggleStyles.label, { color: props.colors.ink }]}>{props.label}</Text>
      <Switch
        accessibilityLabel={props.label}
        value={props.value}
        disabled={props.disabled}
        onValueChange={props.onChange}
        trackColor={{ false: props.colors.border, true: props.colors.mintSoft }}
        thumbColor={props.value ? props.colors.mint : props.colors.muted}
      />
    </View>
  );
}

const toggleStyles = StyleSheet.create({
  row: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  label: { flex: 1, fontSize: 13, fontWeight: "700" },
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrapper: { gap: spacing.md },
    heading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    headingIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: radii.round, backgroundColor: colors.mintSoft },
    headingCopy: { flex: 1, gap: 3 },
    title: { color: colors.ink, fontSize: 19, fontWeight: "900" },
    copy: { color: colors.muted, fontSize: 12, lineHeight: 18 },
    options: { gap: 2, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
    styleBlock: { gap: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
    label: { color: colors.ink, fontSize: 13, fontWeight: "900" },
    styleChoices: { flexDirection: "row", gap: spacing.xs },
    styleChoice: { flex: 1, minHeight: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm },
    styleChoiceActive: { borderColor: colors.mint, backgroundColor: colors.mintSoft },
    styleChoiceText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
    styleChoiceTextActive: { color: colors.mintDark },
    adviceChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    adviceChoice: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, backgroundColor: colors.surface },
    adviceChoiceHidden: { borderColor: colors.coral, backgroundColor: colors.dangerSoft },
    adviceChoiceText: { color: colors.ink, fontSize: 9, fontWeight: "800" },
    keyBox: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surfaceRaised },
    keyStatus: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    keyStatusCopy: { flex: 1, gap: 2 },
    keyHint: { color: colors.muted, fontSize: 11, lineHeight: 16 },
    keyInputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    input: { flex: 1, minHeight: 48, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface, color: colors.ink },
    primaryButton: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, backgroundColor: colors.mint },
    primaryButtonText: { color: colors.onPrimary, fontSize: 12, fontWeight: "900" },
    deleteKey: { color: colors.coral, fontSize: 11, fontWeight: "800", textAlign: "center" },
    legalHint: { color: colors.muted, fontSize: 10, lineHeight: 15 },
    deleteDataButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.coral, borderRadius: radii.sm },
    deleteDataText: { color: colors.coral, fontSize: 11, fontWeight: "900" },
    disabled: { opacity: 0.45 },
  });

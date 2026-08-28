import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { type Category } from "@budgetia/domain";

import {
  acceptBudgetInvitation,
  BudgetApi,
  createSharedBudget,
  inviteBudgetMember,
  listBudgetInvitations,
  revokeBudgetInvitation,
  type BudgetInvitation,
  type BudgetSettings,
  type BudgetSpace,
  type CategoryUsage,
} from "../api";
import { CategoryManagerModal } from "../components/CategoryManagerModal";
import { DataPrivacySection } from "../components/DataPrivacySection";
import { ErrorBanner } from "../components/Feedback";
import { SharedBudgetManager } from "../components/SharedBudgetManager";
import { formatMoney } from "../format";
import { budgetiaMcpUrl } from "../supabase";
import {
  primaryChoices,
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

const extraCategoryColors = [
  "#93B29A",
  "#F46F61",
  "#F2C15D",
  "#26364D",
  "#7A77B9",
  "#4C8BBF",
];

export function SettingsScreen(props: {
  api: BudgetApi;
  userId: string;
  userEmail: string;
  categories: Category[];
  settings: BudgetSettings | null;
  spaces: BudgetSpace[];
  activeSpace: BudgetSpace;
  onSpacesChanged: (preferredSpaceId?: string) => Promise<void>;
  onMutated: () => void;
  onSignOut: () => void;
}) {
  const { colors, mode, primary, setMode, setPrimary } = useTheme();
  const styles = useThemeStyles(createStyles);
  const categoryColors = useMemo(
    () => [colors.mint, ...extraCategoryColors],
    [colors.mint],
  );
  const [budget, setBudget] = useState(
    props.settings ? String(props.settings.monthlyBudgetCents / 100) : "",
  );
  const [categoryName, setCategoryName] = useState("");
  const [categoryColor, setCategoryColor] = useState<string>(colors.mint);
  const [sharedName, setSharedName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitations, setInvitations] = useState<BudgetInvitation[]>([]);
  const [categoryUsage, setCategoryUsage] = useState<CategoryUsage[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [savingBudget, setSavingBudget] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingShare, setSavingShare] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshInvitations = useCallback(async () => {
    try {
      setInvitations(await listBudgetInvitations());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Invitations indisponibles.");
    }
  }, []);

  const refreshCategoryUsage = useCallback(async () => {
    try {
      setCategoryUsage(await props.api.listCategoryUsage());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Utilisation des catégories indisponible.",
      );
    }
  }, [props.api]);

  useEffect(() => {
    setBudget(
      props.settings ? String(props.settings.monthlyBudgetCents / 100) : "",
    );
  }, [props.settings]);

  useEffect(() => setCategoryColor(colors.mint), [colors.mint]);
  useEffect(() => void refreshInvitations(), [refreshInvitations]);
  useEffect(() => void refreshCategoryUsage(), [refreshCategoryUsage]);
  useEffect(() => setSelectedCategory(null), [props.activeSpace.id]);

  const usageByCategoryId = useMemo(
    () => new Map(categoryUsage.map((usage) => [usage.categoryId, usage])),
    [categoryUsage],
  );

  const normalizedEmail = props.userEmail.trim().toLocaleLowerCase();
  const receivedInvitations = invitations.filter(
    (invitation) => invitation.email.toLocaleLowerCase() === normalizedEmail,
  );
  const sentInvitations = invitations.filter(
    (invitation) => invitation.email.toLocaleLowerCase() !== normalizedEmail,
  );

  function clearFeedback(): void {
    setError(null);
    setMessage(null);
  }

  const handleFeedback = useCallback(
    (nextMessage: string | null, nextError: string | null) => {
      setMessage(nextMessage);
      setError(nextError);
    },
    [],
  );

  async function saveBudget(): Promise<void> {
    setSavingBudget(true);
    clearFeedback();
    try {
      const cents = await props.api.setMonthlyBudget(budget);
      setMessage(`Budget de « ${props.activeSpace.name} » défini à ${formatMoney(cents)}.`);
      props.onMutated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Budget invalide.");
    } finally {
      setSavingBudget(false);
    }
  }

  async function createCategory(): Promise<void> {
    setSavingCategory(true);
    clearFeedback();
    try {
      const category = await props.api.createCategory({
        name: categoryName,
        color: categoryColor,
      });
      setCategoryName("");
      setMessage(`La catégorie « ${category.name} » est prête dans ${props.activeSpace.name}.`);
      props.onMutated();
      void refreshCategoryUsage();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Création impossible.");
    } finally {
      setSavingCategory(false);
    }
  }

  function categorySaved(nextMessage: string): void {
    setSelectedCategory(null);
    setError(null);
    setMessage(nextMessage);
    props.onMutated();
    void refreshCategoryUsage();
  }

  async function createSpace(): Promise<void> {
    if (sharedName.trim().length < 2) return;
    setSavingShare(true);
    clearFeedback();
    try {
      const space = await createSharedBudget(sharedName);
      setSharedName("");
      await props.onSpacesChanged(space.id);
      setMessage(`Le budget partagé « ${space.name} » est prêt.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Création impossible.");
    } finally {
      setSavingShare(false);
    }
  }

  async function invite(): Promise<void> {
    if (props.activeSpace.kind !== "shared") return;
    setSavingShare(true);
    clearFeedback();
    try {
      const invitation = await inviteBudgetMember(props.activeSpace.id, inviteEmail);
      setInviteEmail("");
      await refreshInvitations();
      setMessage(
        `Invitation prête pour ${invitation.email}. Elle apparaîtra dans Budgetia lorsque cette personne se connectera avec cette adresse.`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Invitation impossible.");
    } finally {
      setSavingShare(false);
    }
  }

  async function acceptInvitation(invitation: BudgetInvitation): Promise<void> {
    setSavingShare(true);
    clearFeedback();
    try {
      const space = await acceptBudgetInvitation(invitation.id);
      await Promise.all([props.onSpacesChanged(space.id), refreshInvitations()]);
      setMessage(`Vous avez rejoint « ${space.name} ».`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Invitation indisponible.");
    } finally {
      setSavingShare(false);
    }
  }

  async function revokeInvitation(invitation: BudgetInvitation): Promise<void> {
    setSavingShare(true);
    clearFeedback();
    try {
      await revokeBudgetInvitation(invitation.id);
      await refreshInvitations();
      setMessage(`L’invitation envoyée à ${invitation.email} a été annulée.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Annulation impossible.");
    } finally {
      setSavingShare(false);
    }
  }

  return (
    <>
      <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text style={styles.title}>Réglages</Text>
        <Text style={styles.subtitle}>Apparence, budgets, catégories et connexion.</Text>
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      {message ? (
        <View style={styles.success}>
          <Ionicons name="checkmark-circle" size={20} color={colors.mintDark} />
          <Text style={styles.successText}>{message}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Apparence</Text>
        <Text style={styles.sectionCopy}>
          Le thème et la couleur principale sont mémorisés sur cet appareil.
        </Text>
        <View style={styles.modeControl}>
          {(["light", "dark"] as const).map((value) => {
            const active = mode === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setMode(value)}
                style={[styles.modeButton, active && styles.modeButtonActive]}
              >
                <Ionicons
                  name={value === "light" ? "sunny-outline" : "moon-outline"}
                  size={18}
                  color={active ? colors.mintDark : colors.muted}
                />
                <Text style={[styles.modeText, active && styles.modeTextActive]}>
                  {value === "light" ? "Clair" : "Sombre"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.primaryChoices}>
          {primaryChoices.map((choice) => {
            const active = primary === choice.id;
            return (
              <Pressable
                key={choice.id}
                accessibilityRole="button"
                accessibilityLabel={`Couleur principale ${choice.label}`}
                accessibilityState={{ selected: active }}
                onPress={() => setPrimary(choice.id)}
                style={[styles.primaryChoice, active && styles.primaryChoiceActive]}
              >
                <View style={[styles.primaryDot, { backgroundColor: choice.color }]} />
                <Text style={styles.primaryLabel}>{choice.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionIcon}>
            <Ionicons name="people-outline" size={21} color={colors.mintDark} />
          </View>
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.sectionTitle}>Budgets partagés</Text>
            <Text style={styles.sectionCopy}>
              Votre espace personnel reste privé. Un espace commun possède ses propres dépenses, catégories et limite mensuelle.
            </Text>
          </View>
        </View>

        <View style={styles.spaceList}>
          {props.spaces.map((space) => (
            <View key={space.id} style={styles.spaceRow}>
              <Ionicons
                name={space.kind === "personal" ? "person-outline" : "people-outline"}
                size={19}
                color={space.id === props.activeSpace.id ? colors.mintDark : colors.muted}
              />
              <Text style={styles.spaceName}>{space.name}</Text>
              <Text style={styles.spaceKind}>
                {space.kind === "personal" ? "Privé" : "Commun"}
              </Text>
            </View>
          ))}
        </View>

        <TextInput
          value={sharedName}
          onChangeText={setSharedName}
          placeholder="Ex. Budget du couple"
          placeholderTextColor={colors.muted}
          maxLength={50}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={savingShare || sharedName.trim().length < 2}
          onPress={() => void createSpace()}
          style={({ pressed }) => [
            styles.outlineButton,
            (pressed || savingShare || sharedName.trim().length < 2) && styles.disabled,
          ]}
        >
          <Ionicons name="add" size={20} color={colors.mintDark} />
          <Text style={styles.outlineButtonText}>Créer un budget commun</Text>
        </Pressable>

        {props.activeSpace.kind === "shared" && props.activeSpace.role === "owner" ? (
          <View style={styles.inviteBox}>
            <Text style={styles.label}>Inviter dans « {props.activeSpace.name} »</Text>
            <TextInput
              value={inviteEmail}
              onChangeText={setInviteEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="partenaire@exemple.fr"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={savingShare || !inviteEmail.includes("@")}
              onPress={() => void invite()}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || savingShare || !inviteEmail.includes("@")) && styles.disabled,
              ]}
            >
              <Ionicons name="paper-plane-outline" size={18} color={colors.onPrimary} />
              <Text style={styles.primaryButtonText}>Préparer l’invitation</Text>
            </Pressable>
          </View>
        ) : null}

        {receivedInvitations.length ? (
          <View style={styles.invitationList}>
            <Text style={styles.label}>Invitations reçues</Text>
            {receivedInvitations.map((invitation) => (
              <View key={invitation.id} style={styles.invitationRow}>
                <View style={styles.invitationCopy}>
                  <Text style={styles.invitationTitle}>{invitation.spaceName}</Text>
                  <Text style={styles.invitationMeta}>Budget commun à rejoindre</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={savingShare}
                  onPress={() => void acceptInvitation(invitation)}
                  style={styles.acceptButton}
                >
                  <Text style={styles.acceptButtonText}>Rejoindre</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {sentInvitations.length ? (
          <View style={styles.invitationList}>
            <Text style={styles.label}>Invitations envoyées</Text>
            {sentInvitations.map((invitation) => (
              <View key={invitation.id} style={styles.sentInvitationRow}>
                <Text style={styles.pendingCopy} numberOfLines={1}>{invitation.email}</Text>
                <Pressable
                  disabled={savingShare}
                  onPress={() => void revokeInvitation(invitation)}
                  style={styles.revokeButton}
                >
                  <Text style={styles.revokeText}>Annuler</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        {props.activeSpace.kind === "shared" ? (
          <SharedBudgetManager
            space={props.activeSpace}
            currentUserId={props.userId}
            onChanged={props.onSpacesChanged}
            onFeedback={handleFeedback}
          />
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Budget mensuel · {props.activeSpace.name}</Text>
        <Text style={styles.sectionCopy}>
          La limite s’applique uniquement à l’espace actuellement sélectionné.
        </Text>
        <View style={styles.inlineField}>
          <TextInput
            value={budget}
            onChangeText={setBudget}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="2000"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.flexInput]}
          />
          <Text style={styles.currency}>€</Text>
          <Pressable
            accessibilityRole="button"
            disabled={savingBudget}
            onPress={() => void saveBudget()}
            style={styles.smallButton}
          >
            <Text style={styles.smallButtonText}>{savingBudget ? "…" : "Enregistrer"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Catégories · {props.activeSpace.name}</Text>
        <Text style={styles.sectionCopy}>
          Touchez une catégorie pour la modifier, transférer ses dépenses ou la
          supprimer. « Non classée » reste toujours disponible comme secours.
        </Text>
        <View style={styles.categoryList}>
          {props.categories.map((category) => {
            const usage = usageByCategoryId.get(category.id);
            return (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              accessibilityLabel={`Gérer la catégorie ${category.name}`}
              onPress={() => setSelectedCategory(category)}
              style={({ pressed }) => [
                styles.categoryRow,
                pressed && styles.categoryRowPressed,
              ]}
            >
              <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
              <Ionicons
                name={category.icon as keyof typeof Ionicons.glyphMap}
                size={19}
                color={category.color}
              />
              <View style={styles.categoryCopy}>
                <View style={styles.categoryNameRow}>
                  <Text style={styles.categoryName}>{category.name}</Text>
                  {category.isFallback ? (
                    <Text style={styles.categoryFallback}>Secours</Text>
                  ) : null}
                </View>
                <Text style={styles.categoryUsage}>
                  {usage?.expenseCount ?? 0} dépense
                  {(usage?.expenseCount ?? 0) > 1 ? "s" : ""} · {formatMoney(
                    usage?.totalCents ?? 0,
                  )}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          );})}
        </View>
        <TextInput
          value={categoryName}
          onChangeText={setCategoryName}
          placeholder="Nom de la nouvelle catégorie"
          placeholderTextColor={colors.muted}
          maxLength={40}
          style={styles.input}
        />
        <View style={styles.colorChoices}>
          {categoryColors.map((color) => (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={`Couleur ${color}`}
              accessibilityState={{ selected: categoryColor === color }}
              onPress={() => setCategoryColor(color)}
              style={[
                styles.colorChoice,
                { backgroundColor: color },
                categoryColor === color && styles.colorChoiceActive,
              ]}
            />
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={savingCategory || categoryName.trim().length < 2}
          onPress={() => void createCategory()}
          style={({ pressed }) => [
            styles.outlineButton,
            (pressed || savingCategory || categoryName.trim().length < 2) && styles.disabled,
          ]}
        >
          <Ionicons name="add" size={20} color={colors.mintDark} />
          <Text style={styles.outlineButtonText}>
            {savingCategory ? "Création…" : "Créer la catégorie"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionIcon}>
            <Ionicons name="sparkles" size={21} color={colors.mintDark} />
          </View>
          <View style={styles.sectionHeadingCopy}>
            <Text style={styles.sectionTitle}>Compte & ChatGPT</Text>
            <Text style={styles.sectionCopy}>
              L’app mobile et le MCP utilisent le même compte Supabase protégé par RLS.
            </Text>
          </View>
        </View>
        <View style={styles.accountRow}>
          <Ionicons name="person-circle-outline" size={27} color={colors.mintDark} />
          <View style={styles.accountCopy}>
            <Text style={styles.label}>Compte connecté</Text>
            <Text style={styles.accountEmail}>{props.userEmail}</Text>
          </View>
        </View>
        <View style={styles.endpoint}>
          <Text style={styles.endpointLabel}>URL MCP pour ChatGPT</Text>
          <Text selectable style={styles.endpointValue}>{budgetiaMcpUrl}</Text>
          <Text style={styles.endpointHint}>
            ChatGPT peut lister vos espaces et cibler explicitement le budget personnel ou commun avant toute écriture.
          </Text>
        </View>
        <DataPrivacySection
          api={props.api}
          spaceName={props.activeSpace.name}
          onDeleted={props.onSignOut}
          onFeedback={handleFeedback}
        />
        <Pressable
          accessibilityRole="button"
          onPress={props.onSignOut}
          style={({ pressed }) => [styles.signOutButton, pressed && styles.disabled]}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.coral} />
          <Text style={styles.signOutText}>Se déconnecter</Text>
        </Pressable>
      </View>
      </ScrollView>
      <CategoryManagerModal
        visible={Boolean(selectedCategory)}
        api={props.api}
        category={selectedCategory}
        categories={props.categories}
        usage={
          selectedCategory
            ? usageByCategoryId.get(selectedCategory.id) ?? null
            : null
        }
        colors={categoryColors}
        onClose={() => setSelectedCategory(null)}
        onSaved={categorySaved}
      />
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.xl },
    title: { color: colors.ink, fontSize: 34, fontWeight: "900", letterSpacing: -1 },
    subtitle: { marginTop: 4, color: colors.muted, fontSize: 13 },
    success: { flexDirection: "row", alignItems: "center", gap: spacing.xs, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.mintSoft },
    successText: { flex: 1, color: colors.mintDark, fontSize: 13, fontWeight: "700" },
    section: { gap: spacing.sm, paddingTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border },
    sectionHeading: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
    sectionIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: radii.round, backgroundColor: colors.mintSoft },
    sectionHeadingCopy: { flex: 1, gap: 3 },
    sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: "900" },
    sectionCopy: { color: colors.muted, fontSize: 13, lineHeight: 19 },
    modeControl: { minHeight: 48, flexDirection: "row", gap: spacing.xxs, padding: spacing.xxs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
    modeButton: { flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radii.sm },
    modeButtonActive: { backgroundColor: colors.mintSoft },
    modeText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
    modeTextActive: { color: colors.mintDark, fontWeight: "900" },
    primaryChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
    primaryChoice: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.round, backgroundColor: colors.surface },
    primaryChoiceActive: { borderColor: colors.ink, borderWidth: 2 },
    primaryDot: { width: 16, height: 16, borderRadius: radii.round },
    primaryLabel: { color: colors.ink, fontSize: 12, fontWeight: "700" },
    spaceList: { gap: spacing.xxs },
    spaceRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: spacing.xs },
    spaceName: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "700" },
    spaceKind: { color: colors.muted, fontSize: 11, fontWeight: "700" },
    input: { minHeight: 50, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface, color: colors.ink, fontSize: 14 },
    inviteBox: { gap: spacing.xs, marginTop: spacing.xs, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.mintSoft },
    primaryButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderRadius: radii.sm, backgroundColor: colors.mintDark },
    primaryButtonText: { color: colors.onPrimary, fontSize: 13, fontWeight: "900" },
    invitationList: { gap: spacing.xs, marginTop: spacing.xs },
    invitationRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.mint, borderRadius: radii.md, backgroundColor: colors.surface },
    invitationCopy: { flex: 1, minWidth: 0 },
    invitationTitle: { color: colors.ink, fontSize: 14, fontWeight: "900" },
    invitationMeta: { marginTop: 3, color: colors.muted, fontSize: 11 },
    acceptButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.mintDark },
    acceptButtonText: { color: colors.onPrimary, fontSize: 12, fontWeight: "900" },
    pendingCopy: { color: colors.muted, fontSize: 11, lineHeight: 17 },
    sentInvitationRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: spacing.xs },
    revokeButton: { minHeight: 34, justifyContent: "center", paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.coral, borderRadius: radii.round },
    revokeText: { color: colors.coral, fontSize: 11, fontWeight: "900" },
    inlineField: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    flexInput: { flex: 1, fontVariant: ["tabular-nums"] },
    currency: { color: colors.ink, fontSize: 18, fontWeight: "800" },
    smallButton: { minHeight: 50, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.mintDark },
    smallButtonText: { color: colors.onPrimary, fontSize: 12, fontWeight: "800" },
    categoryList: { gap: spacing.xs },
    categoryRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface },
    categoryRowPressed: { opacity: 0.68 },
    categoryDot: { width: 8, height: 8, borderRadius: radii.round },
    categoryCopy: { flex: 1, minWidth: 0, gap: 3 },
    categoryNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    categoryName: { color: colors.ink, fontSize: 14, fontWeight: "800" },
    categoryFallback: { color: colors.mintDark, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
    categoryUsage: { color: colors.muted, fontSize: 11, fontVariant: ["tabular-nums"] },
    colorChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    colorChoice: { width: 32, height: 32, borderRadius: radii.round },
    colorChoiceActive: { borderWidth: 3, borderColor: colors.ink },
    outlineButton: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.mint, borderRadius: radii.sm, backgroundColor: colors.surface },
    outlineButtonText: { color: colors.mintDark, fontSize: 14, fontWeight: "800" },
    label: { color: colors.ink, fontSize: 12, fontWeight: "800" },
    accountRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    accountCopy: { flex: 1, gap: 3 },
    accountEmail: { color: colors.ink, fontSize: 14, fontWeight: "700" },
    endpoint: { gap: 5, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.mintSoft },
    endpointLabel: { color: colors.mintDark, fontSize: 11, fontWeight: "800" },
    endpointValue: { color: colors.ink, fontSize: 13, fontWeight: "700" },
    endpointHint: { color: colors.muted, fontSize: 11, lineHeight: 16 },
    signOutButton: { minHeight: 50, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface },
    signOutText: { color: colors.coral, fontSize: 14, fontWeight: "800" },
    disabled: { opacity: 0.5 },
  });

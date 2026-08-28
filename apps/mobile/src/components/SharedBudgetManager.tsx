import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  deleteSharedBudget,
  leaveSharedBudget,
  listBudgetSpaceMembers,
  removeBudgetMember,
  renameSharedBudget,
  transferBudgetOwnership,
  type BudgetSpace,
  type BudgetSpaceMember,
} from "../api";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

export function SharedBudgetManager(props: {
  space: BudgetSpace;
  currentUserId: string;
  onChanged: (preferredSpaceId?: string) => Promise<void>;
  onFeedback: (message: string | null, error: string | null) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [members, setMembers] = useState<BudgetSpaceMember[]>([]);
  const [name, setName] = useState(props.space.name);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      setMembers(await listBudgetSpaceMembers(props.space.id));
    } catch (reason) {
      props.onFeedback(
        null,
        reason instanceof Error ? reason.message : "Membres indisponibles.",
      );
    }
  }, [props.onFeedback, props.space.id]);

  useEffect(() => {
    setName(props.space.name);
    setDeleteConfirmation("");
    void loadMembers();
  }, [loadMembers, props.space.name]);

  async function run(action: () => Promise<void>, success: string): Promise<void> {
    setBusy(true);
    props.onFeedback(null, null);
    try {
      await action();
      props.onFeedback(success, null);
    } catch (reason) {
      props.onFeedback(
        null,
        reason instanceof Error ? reason.message : "Action impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  function confirm(title: string, message: string, action: () => Promise<void>): void {
    Alert.alert(title, message, [
      { text: "Annuler", style: "cancel" },
      { text: "Confirmer", style: "destructive", onPress: () => void action() },
    ]);
  }

  const isOwner = props.space.role === "owner";
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Gestion de « {props.space.name} »</Text>
      <View style={styles.memberList}>
        {members.map((member) => {
          const current = member.userId === props.currentUserId;
          return (
            <View key={member.userId} style={styles.memberRow}>
              <View style={styles.memberCopy}>
                <Text style={styles.memberEmail} numberOfLines={1}>
                  {member.email}{current ? " · vous" : ""}
                </Text>
                <Text style={styles.memberRole}>
                  {member.role === "owner" ? "Propriétaire" : "Membre"}
                </Text>
              </View>
              {isOwner && member.role === "editor" ? (
                <View style={styles.rowActions}>
                  <Pressable
                    disabled={busy}
                    onPress={() =>
                      confirm(
                        "Transférer la propriété",
                        `${member.email} deviendra propriétaire de ce budget.`,
                        () => run(async () => {
                          await transferBudgetOwnership(props.space.id, member.userId);
                          await props.onChanged(props.space.id);
                        }, "La propriété du budget a été transférée."),
                      )
                    }
                    style={styles.iconButton}
                  >
                    <Ionicons name="key-outline" size={18} color={colors.mintDark} />
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    onPress={() =>
                      confirm(
                        "Retirer ce membre",
                        `${member.email} perdra immédiatement l’accès au budget.`,
                        () => run(async () => {
                          await removeBudgetMember(props.space.id, member.userId);
                          await loadMembers();
                        }, "Le membre a été retiré."),
                      )
                    }
                    style={styles.iconButton}
                  >
                    <Ionicons name="person-remove-outline" size={18} color={colors.coral} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {isOwner ? (
        <>
          <View style={styles.inline}>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={50}
              placeholder="Nom du budget"
              placeholderTextColor={colors.muted}
              style={styles.input}
            />
            <Pressable
              disabled={busy || name.trim().length < 2 || name.trim() === props.space.name}
              onPress={() => void run(async () => {
                await renameSharedBudget(props.space, name);
                await props.onChanged(props.space.id);
              }, "Le budget a été renommé.")}
              style={({ pressed }) => [
                styles.smallButton,
                (pressed || busy || name.trim() === props.space.name) && styles.disabled,
              ]}
            >
              <Text style={styles.smallButtonText}>Renommer</Text>
            </Pressable>
          </View>
          <View style={styles.dangerBox}>
            <Text style={styles.dangerTitle}>Supprimer ce budget commun</Text>
            <Text style={styles.help}>
              Toutes ses dépenses et catégories seront supprimées. Saisissez exactement « {props.space.name} ».
            </Text>
            <TextInput
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              placeholder={props.space.name}
              placeholderTextColor={colors.muted}
              style={styles.inputFull}
            />
            <Pressable
              disabled={busy || deleteConfirmation.trim() !== props.space.name}
              onPress={() =>
                confirm(
                  "Supprimer définitivement le budget ?",
                  "Cette opération ne peut pas être annulée.",
                  () => run(async () => {
                    await deleteSharedBudget(props.space.id, deleteConfirmation);
                    await props.onChanged();
                  }, "Le budget commun a été supprimé."),
                )
              }
              style={({ pressed }) => [
                styles.dangerButton,
                (pressed || busy || deleteConfirmation.trim() !== props.space.name) && styles.disabled,
              ]}
            >
              <Text style={styles.dangerButtonText}>Supprimer le budget</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable
          disabled={busy}
          onPress={() =>
            confirm(
              "Quitter ce budget ?",
              "Les dépenses déjà enregistrées resteront dans le budget commun.",
              () => run(async () => {
                await leaveSharedBudget(props.space.id);
                await props.onChanged();
              }, "Vous avez quitté le budget commun."),
            )
          }
          style={styles.leaveButton}
        >
          <Ionicons name="exit-outline" size={18} color={colors.coral} />
          <Text style={styles.leaveText}>Quitter ce budget</Text>
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: { gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
    title: { color: colors.ink, fontSize: 15, fontWeight: "900" },
    memberList: { gap: spacing.xxs },
    memberRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
    memberCopy: { flex: 1, minWidth: 0 },
    memberEmail: { color: colors.ink, fontSize: 13, fontWeight: "800" },
    memberRole: { marginTop: 2, color: colors.muted, fontSize: 10, fontWeight: "700" },
    rowActions: { flexDirection: "row", gap: spacing.xxs },
    iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radii.round },
    inline: { flexDirection: "row", gap: spacing.xs },
    input: { flex: 1, minHeight: 46, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, color: colors.ink, backgroundColor: colors.canvas },
    inputFull: { minHeight: 46, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.coral, borderRadius: radii.sm, color: colors.ink, backgroundColor: colors.surface },
    smallButton: { minHeight: 46, justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.mintDark },
    smallButtonText: { color: colors.onPrimary, fontSize: 12, fontWeight: "900" },
    dangerBox: { gap: spacing.xs, marginTop: spacing.xs, padding: spacing.sm, borderRadius: radii.sm, backgroundColor: colors.dangerSoft },
    dangerTitle: { color: colors.coral, fontSize: 13, fontWeight: "900" },
    help: { color: colors.muted, fontSize: 11, lineHeight: 16 },
    dangerButton: { minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radii.sm, backgroundColor: colors.coral },
    dangerButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
    leaveButton: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: colors.coral, borderRadius: radii.sm },
    leaveText: { color: colors.coral, fontSize: 13, fontWeight: "900" },
    disabled: { opacity: 0.45 },
  });

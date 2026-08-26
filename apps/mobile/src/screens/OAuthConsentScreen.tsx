import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { ErrorBanner } from "../components/Feedback";
import { supabase } from "../supabase";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

function currentAuthorizationId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("authorization_id");
}

function redirectTo(url: string): void {
  if (typeof window !== "undefined") window.location.assign(url);
}

export function OAuthConsentScreen() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authorizationId = currentAuthorizationId();

  useEffect(() => {
    let active = true;
    async function load(): Promise<void> {
      if (!authorizationId) {
        if (active) {
          setError("Demande d’autorisation absente ou expirée.");
          setLoading(false);
        }
        return;
      }
      const { data, error: detailsError } =
        await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError || !data) {
        setError(detailsError?.message ?? "Demande d’autorisation invalide.");
      } else if ("redirect_url" in data) {
        redirectTo(data.redirect_url);
      } else {
        setDetails(data);
      }
      setLoading(false);
    }
    void load();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approved: boolean): Promise<void> {
    if (!authorizationId) return;
    setSubmitting(true);
    setError(null);
    const response = approved
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        });
    if (response.error || !response.data) {
      setError(response.error?.message ?? "Impossible de répondre à la demande.");
      setSubmitting(false);
      return;
    }
    redirectTo(response.data.redirect_url);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Ionicons name="sparkles" size={23} color={colors.onPrimary} />
          </View>
          <Text style={styles.brandName}>Budgetia</Text>
        </View>
        <Text style={styles.title}>Autoriser ChatGPT ?</Text>
        <Text style={styles.copy}>
          ChatGPT pourra ajouter une dépense et lire vos catégories, historiques et bilans Budgetia.
        </Text>

        {loading ? <ActivityIndicator color={colors.mintDark} /> : null}
        {error ? <ErrorBanner message={error} /> : null}
        {details ? (
          <>
            <View style={styles.client}>
              <Text style={styles.clientLabel}>Application demandeuse</Text>
              <Text style={styles.clientName}>{details.client.name || "ChatGPT"}</Text>
              <Text style={styles.account}>{details.user.email}</Text>
              <View style={styles.scopeRow}>
                {details.scope
                  .split(" ")
                  .filter(Boolean)
                  .map((scope) => (
                    <Text key={scope} style={styles.scope}>
                      {scope}
                    </Text>
                  ))}
              </View>
            </View>
            <Text style={styles.warning}>
              Chaque requête reste limitée aux espaces dont votre compte est membre par les règles RLS Supabase. Vous pourrez révoquer cet accès depuis vos autorisations de compte.
            </Text>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => void decide(false)}
                style={[styles.secondary, submitting && styles.disabled]}
              >
                <Text style={styles.secondaryText}>Refuser</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={submitting}
                onPress={() => void decide(true)}
                style={[styles.primary, submitting && styles.disabled]}
              >
                <Text style={styles.primaryText}>Autoriser</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.canvas,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    gap: spacing.md,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mark: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.mintDark,
  },
  brandName: { color: colors.ink, fontSize: 23, fontWeight: "900" },
  title: { color: colors.ink, fontSize: 29, fontWeight: "900", letterSpacing: -0.8 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  client: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.mintSoft,
  },
  clientLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  clientName: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  account: { color: colors.muted, fontSize: 12 },
  scopeRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 4 },
  scope: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: radii.round,
    color: colors.mintDark,
    backgroundColor: colors.surface,
    fontSize: 11,
    fontWeight: "800",
  },
  warning: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", gap: spacing.sm },
  primary: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
    backgroundColor: colors.mintDark,
  },
  primaryText: { color: colors.onPrimary, fontWeight: "800" },
  secondary: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
  },
  secondaryText: { color: colors.ink, fontWeight: "800" },
  disabled: { opacity: 0.5 },
});

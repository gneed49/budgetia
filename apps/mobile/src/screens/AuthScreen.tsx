import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ErrorBanner } from "../components/Feedback";
import { supabase, supabaseConfigurationError } from "../supabase";
import {
  radii,
  spacing,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "../theme";

export function AuthScreen(props: { oauthContinuation?: boolean }) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(supabaseConfigurationError);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (supabaseConfigurationError) {
      setError(supabaseConfigurationError);
      return;
    }
    if (!email.trim() || password.length < 8) {
      setError("Saisissez un e-mail valide et un mot de passe d’au moins 8 caractères.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "sign-in") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setMessage("Compte créé. Confirmez votre adresse e-mail, puis connectez-vous.");
          setMode("sign-in");
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <View style={styles.card}>
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Ionicons name="wallet" size={25} color={colors.onPrimary} />
          </View>
          <Text style={styles.brandName}>Budgetia</Text>
        </View>
        <Text style={styles.title}>
          {props.oauthContinuation
            ? "Connectez-vous pour autoriser ChatGPT"
            : mode === "sign-in"
              ? "Retrouvez votre budget"
              : "Créez votre espace privé"}
        </Text>
        <Text style={styles.copy}>
          Vos budgets personnels et partagés sont synchronisés avec Supabase et protégés par espace.
        </Text>

        {error ? <ErrorBanner message={error} /> : null}
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.message}>
            {message}
          </Text>
        ) : null}

        <Text style={styles.label}>Adresse e-mail</Text>
        <TextInput
          accessibilityLabel="Adresse e-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          placeholder="vous@exemple.fr"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <Text style={styles.label}>Mot de passe</Text>
        <TextInput
          accessibilityLabel="Mot de passe"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          secureTextEntry
          placeholder="8 caractères minimum"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.primary,
            (pressed || loading) && styles.pressed,
          ]}
        >
          {loading ? <ActivityIndicator color={colors.onPrimary} /> : null}
          <Text style={styles.primaryText}>
            {mode === "sign-in" ? "Se connecter" : "Créer mon compte"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
            setError(supabaseConfigurationError);
            setMessage(null);
          }}
          style={styles.switchButton}
        >
          <Text style={styles.switchText}>
            {mode === "sign-in"
              ? "Nouveau sur Budgetia ? Créer un compte"
              : "Déjà un compte ? Se connecter"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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
    maxWidth: 420,
    gap: spacing.sm,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  mark: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.mintDark,
  },
  brandName: { color: colors.ink, fontSize: 24, fontWeight: "900" },
  title: {
    marginTop: spacing.md,
    color: colors.ink,
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  copy: { marginBottom: spacing.sm, color: colors.muted, fontSize: 13, lineHeight: 19 },
  label: { marginTop: spacing.xs, color: colors.ink, fontSize: 12, fontWeight: "800" },
  input: {
    minHeight: 50,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    color: colors.ink,
    backgroundColor: colors.canvas,
  },
  primary: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.mintDark,
  },
  primaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: "800" },
  switchButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  switchText: { color: colors.mintDark, fontSize: 13, fontWeight: "700" },
  message: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    color: colors.mintDark,
    backgroundColor: colors.mintSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: { opacity: 0.65 },
});

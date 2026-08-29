import type { Session } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { BudgetApi, listBudgetSpaces, type BudgetSpace } from "./src/api";
import { AddExpenseModal } from "./src/components/AddExpenseModal";
import { BudgetSpaceBar } from "./src/components/BudgetSpaceBar";
import { ReceiptScannerModal } from "./src/components/ReceiptScannerModal";
import { useOverview } from "./src/hooks";
import { AnalyticsScreen } from "./src/screens/AnalyticsScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { CoachScreen } from "./src/screens/CoachScreen";
import { ExpensesScreen } from "./src/screens/ExpensesScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { OAuthConsentScreen } from "./src/screens/OAuthConsentScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { observeAppStateForAuth, supabase } from "./src/supabase";
import {
  spacing,
  ThemeProvider,
  type ThemeColors,
  useTheme,
  useThemeStyles,
} from "./src/theme";

type Tab = "home" | "analytics" | "coach" | "expenses" | "settings";

const tabs: Array<{
  id: Tab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}> = [
  { id: "home", label: "Accueil", icon: "home-outline", activeIcon: "home" },
  {
    id: "analytics",
    label: "Analyse",
    icon: "bar-chart-outline",
    activeIcon: "bar-chart",
  },
  {
    id: "coach",
    label: "Coach",
    icon: "sparkles-outline",
    activeIcon: "sparkles",
  },
  {
    id: "expenses",
    label: "Dépenses",
    icon: "receipt-outline",
    activeIcon: "receipt",
  },
  {
    id: "settings",
    label: "Réglages",
    icon: "settings-outline",
    activeIcon: "settings",
  },
];

function isOAuthConsentPath(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return window.location.pathname.replace(/\/+$/, "") === "/oauth/consent";
}

function LoadingScreen(props: { message?: string; error?: boolean } = {}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  return (
    <View style={styles.loading}>
      {props.error ? (
        <Ionicons name="alert-circle-outline" size={26} color={colors.coral} />
      ) : (
        <ActivityIndicator color={colors.mint} />
      )}
      <Text style={[styles.loadingText, props.error && { color: colors.coral }]}>
        {props.message ?? "Ouverture de Budgetia…"}
      </Text>
    </View>
  );
}

function BudgetiaWorkspace(props: {
  session: Session;
  spaces: BudgetSpace[];
  activeSpace: BudgetSpace;
  onSelectSpace: (spaceId: string) => void;
  onSpacesChanged: (preferredSpaceId?: string) => Promise<void>;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [tab, setTab] = useState<Tab>("home");
  const [addVisible, setAddVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const api = useMemo(
    () => new BudgetApi(props.activeSpace.id),
    [props.activeSpace.id],
  );
  const overview = useOverview(api);

  function refreshAll(): void {
    setRefreshVersion((current) => current + 1);
    overview.refresh();
  }

  let screen: React.ReactNode;
  if (tab === "home") {
    screen = (
      <HomeScreen
        api={api}
        categories={overview.categories}
        expenses={overview.expenses}
        settings={overview.settings}
        refreshVersion={refreshVersion}
        error={overview.error}
        onAdd={() => setAddVisible(true)}
        onRefresh={refreshAll}
        onOpenExpenses={() => setTab("expenses")}
      />
    );
  } else if (tab === "analytics") {
    screen = (
      <AnalyticsScreen
        api={api}
        categories={overview.categories}
        refreshVersion={refreshVersion}
      />
    );
  } else if (tab === "coach") {
    screen = (
      <CoachScreen
        api={api}
        categories={overview.categories}
        refreshVersion={refreshVersion}
        onMutated={refreshAll}
      />
    );
  } else if (tab === "expenses") {
    screen = (
      <ExpensesScreen
        api={api}
        categories={overview.categories}
        refreshVersion={refreshVersion}
        onAdd={() => setAddVisible(true)}
        onMutated={refreshAll}
      />
    );
  } else {
    screen = (
      <SettingsScreen
        api={api}
        userId={props.session.user.id}
        userEmail={props.session.user.email ?? "Compte Budgetia"}
        categories={overview.categories}
        settings={overview.settings}
        spaces={props.spaces}
        activeSpace={props.activeSpace}
        onSpacesChanged={props.onSpacesChanged}
        onMutated={refreshAll}
        onSignOut={() => void supabase.auth.signOut()}
      />
    );
  }

  return (
    <>
      <BudgetSpaceBar
        spaces={props.spaces}
        activeSpaceId={props.activeSpace.id}
        onSelect={props.onSelectSpace}
      />
      <View style={styles.screen}>{screen}</View>
      <View style={styles.tabBar}>
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(item.id)}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            >
              <Ionicons
                name={active ? item.activeIcon : item.icon}
                size={22}
                color={active ? colors.mintDark : colors.muted}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {item.label}
              </Text>
              {active ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
          );
        })}
      </View>
      <AddExpenseModal
        visible={addVisible}
        api={api}
        categories={overview.categories}
        onClose={() => setAddVisible(false)}
        onSaved={refreshAll}
        onScanReceipt={() => {
          setAddVisible(false);
          setReceiptVisible(true);
        }}
      />
      <ReceiptScannerModal
        visible={receiptVisible}
        api={api}
        categories={overview.categories}
        onClose={() => setReceiptVisible(false)}
        onSaved={refreshAll}
      />
    </>
  );
}

function BudgetiaApp(props: { session: Session }) {
  const [spaces, setSpaces] = useState<BudgetSpace[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const storageKey = `budgetia.active-space.${props.session.user.id}`;

  const applySpaces = useCallback(
    async (nextSpaces: BudgetSpace[], preferredSpaceId?: string | null) => {
      const nextActive =
        nextSpaces.find((space) => space.id === preferredSpaceId) ??
        nextSpaces.find((space) => space.kind === "personal") ??
        nextSpaces[0];
      setSpaces(nextSpaces);
      setActiveSpaceId(nextActive?.id ?? null);
      if (nextActive) await AsyncStorage.setItem(storageKey, nextActive.id);
    },
    [storageKey],
  );

  const reloadSpaces = useCallback(
    async (preferredSpaceId?: string) => {
      setError(null);
      try {
        const nextSpaces = await listBudgetSpaces();
        await applySpaces(nextSpaces, preferredSpaceId ?? activeSpaceId);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Budgets indisponibles.");
      }
    },
    [activeSpaceId, applySpaces],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([listBudgetSpaces(), AsyncStorage.getItem(storageKey)])
      .then(async ([nextSpaces, storedSpaceId]) => {
        if (active) await applySpaces(nextSpaces, storedSpaceId);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Budgets indisponibles.");
        }
      });
    return () => {
      active = false;
    };
  }, [applySpaces, storageKey]);

  const activeSpace = spaces.find((space) => space.id === activeSpaceId);
  if (!activeSpace) {
    return error ? <LoadingScreen message={error} error /> : <LoadingScreen />;
  }

  return (
    <BudgetiaWorkspace
      key={activeSpace.id}
      session={props.session}
      spaces={spaces}
      activeSpace={activeSpace}
      onSelectSpace={(spaceId) => {
        setActiveSpaceId(spaceId);
        void AsyncStorage.setItem(storageKey, spaceId);
      }}
      onSpacesChanged={reloadSpaces}
    />
  );
}

function AppContent() {
  const { mode } = useTheme();
  const styles = useThemeStyles(createStyles);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const consentPath = isOAuthConsentPath();

  useEffect(() => {
    const stopObserving = observeAppStateForAuth();
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      data.subscription.unsubscribe();
      stopObserving();
    };
  }, []);

  let content: React.ReactNode;
  if (session === undefined) content = <LoadingScreen />;
  else if (!session) content = <AuthScreen oauthContinuation={consentPath} />;
  else if (consentPath) content = <OAuthConsentScreen />;
  else content = <BudgetiaApp session={session} />;

  return (
    <View style={styles.page}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <View style={styles.app}>{content}</View>
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  page: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Platform.OS === "web" ? colors.border : colors.canvas,
  },
  app: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    paddingTop: Platform.OS === "android" ? 34 : Platform.OS === "web" ? 14 : 8,
    backgroundColor: colors.canvas,
    ...(Platform.OS === "web"
      ? {
          boxShadow: "0 10px 26px rgba(7, 20, 33, 0.1)",
        }
      : {}),
  },
  screen: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: { color: colors.muted, fontSize: 14 },
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: Platform.OS === "ios" ? 82 : 70,
    flexDirection: "row",
    paddingBottom: Platform.OS === "ios" ? 16 : 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  tabLabelActive: { color: colors.mintDark, fontWeight: "800" },
  tabIndicator: {
    position: "absolute",
    top: 0,
    width: 28,
    height: 3,
    backgroundColor: colors.mint,
  },
  pressed: { opacity: 0.6 },
});

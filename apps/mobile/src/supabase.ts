import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import "react-native-url-polyfill/auto";

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const configuredKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigurationError =
  !configuredUrl || !configuredKey
    ? "Renseignez EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    : null;

export const supabaseUrl = configuredUrl ?? "http://127.0.0.1:54321";

export const supabase = createClient(
  supabaseUrl,
  configuredKey ?? "sb_publishable_budgetia_not_configured",
  {
    auth: {
      ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === "web",
      storageKey: "budgetia-auth-v1",
    },
  },
);

export const budgetiaMcpUrl = `${supabaseUrl}/functions/v1/budgetia-mcp`;

export function observeAppStateForAuth(): () => void {
  if (Platform.OS === "web") return () => undefined;
  const subscription = AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
  return () => subscription.remove();
}

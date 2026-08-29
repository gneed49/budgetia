import { Platform } from "react-native";

import { supabase } from "./supabase";

export type CoachReportType = "weekly" | "monthly" | "manual";
export type CoachAdviceKind =
  | "reduce_spending"
  | "review_subscription"
  | "protect_margin"
  | "plan_next_month"
  | "celebrate_progress";
export type CoachGuidanceStyle = "cautious" | "balanced" | "encouraging";

export interface CoachRecommendation {
  kind: CoachAdviceKind;
  priority: 1 | 2 | 3;
  factIds: string[];
  categoryAliases: string[];
  action: string;
  explanation: string;
  confidence: number;
}

export interface CoachCategoryFact {
  alias: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  factId: string;
  spentCents: number;
  previousSpentCents: number;
  deltaCents: number;
  deltaPercentage: number | null;
}

export interface CoachFacts {
  period: {
    start: string;
    end: string;
    previousStart: string;
    previousEnd: string;
  };
  summary: {
    spentCents: number;
    previousSpentCents: number;
    monthlyBudgetCents: number;
    remainingCents: number;
  };
  facts: Array<Record<string, unknown> & { id: string }>;
  categories: CoachCategoryFact[];
}

export interface CoachReport {
  id: string;
  reportType: CoachReportType;
  periodStart: string;
  periodEnd: string;
  generatedBy: "deterministic" | "openai";
  facts: CoachFacts;
  advice: { version: 1; summary: string; recommendations: CoachRecommendation[] };
  helpful: boolean | null;
  readAt: string | null;
  dismissedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
}

export interface CoachPreferences {
  enabled: boolean;
  thresholdNotificationsEnabled: boolean;
  weeklyReportEnabled: boolean;
  monthlyReportEnabled: boolean;
  pushNotificationsEnabled: boolean;
  weeklyDay: number;
  weeklyHour: number;
  timezone: string;
  guidanceStyle: CoachGuidanceStyle;
  hiddenAdviceTypes: CoachAdviceKind[];
}

export interface CoachCredentialStatus {
  configured: boolean;
  provider: string | null;
  lastFour: string | null;
  model: string | null;
  status: "active" | "invalid" | "revoked" | null;
  validatedAt: string | null;
  lastUsedAt: string | null;
  lastErrorCode: string | null;
}

export interface CoachNotification {
  id: string;
  kind: "threshold" | CoachReportType;
  severity: "info" | "watch" | "alert" | "positive";
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

interface CoachReportRow {
  id: string;
  report_type: CoachReportType;
  period_start: string;
  period_end: string;
  generated_by: "deterministic" | "openai";
  facts: CoachFacts;
  advice: CoachReport["advice"];
  helpful: boolean | null;
  read_at: string | null;
  dismissed_at: string | null;
  snoozed_until: string | null;
  created_at: string;
}

interface CoachPreferenceRow {
  enabled: boolean;
  threshold_notifications_enabled: boolean;
  weekly_report_enabled: boolean;
  monthly_report_enabled: boolean;
  push_notifications_enabled: boolean;
  weekly_day: number;
  weekly_hour: number;
  timezone: string;
  guidance_style: CoachGuidanceStyle;
  hidden_advice_types: CoachAdviceKind[];
}

function mapReport(row: CoachReportRow): CoachReport {
  return {
    id: row.id,
    reportType: row.report_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    generatedBy: row.generated_by,
    facts: row.facts,
    advice: row.advice,
    helpful: row.helpful,
    readAt: row.read_at,
    dismissedAt: row.dismissed_at,
    snoozedUntil: row.snoozed_until,
    createdAt: row.created_at,
  };
}

function mapPreferences(row: CoachPreferenceRow): CoachPreferences {
  return {
    enabled: row.enabled,
    thresholdNotificationsEnabled: row.threshold_notifications_enabled,
    weeklyReportEnabled: row.weekly_report_enabled,
    monthlyReportEnabled: row.monthly_report_enabled,
    pushNotificationsEnabled: row.push_notifications_enabled,
    weeklyDay: Number(row.weekly_day),
    weeklyHour: Number(row.weekly_hour),
    timezone: row.timezone,
    guidanceStyle: row.guidance_style,
    hiddenAdviceTypes: row.hidden_advice_types ?? [],
  };
}

async function invokeCoach<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("budgetia-ai-coach", {
    body,
  });
  if (error) {
    let message = "Le Coach est temporairement indisponible.";
    const context = (error as { context?: Response }).context;
    if (context) {
      const payload = await context.clone().json().catch(() => null) as
        | { error?: { message?: string } }
        | null;
      if (payload?.error?.message) message = payload.error.message;
    }
    throw new Error(message);
  }
  if (data?.error?.message) throw new Error(String(data.error.message));
  return data as T;
}

export async function getCoachCredentialStatus(): Promise<CoachCredentialStatus> {
  const data = await invokeCoach<{ credential: CoachCredentialStatus }>({
    action: "credential.status",
  });
  return data.credential;
}

export async function saveCoachCredential(apiKey: string): Promise<CoachCredentialStatus> {
  const data = await invokeCoach<{ credential: CoachCredentialStatus }>({
    action: "credential.save",
    apiKey: apiKey.trim(),
  });
  return data.credential;
}

export async function deleteCoachCredential(): Promise<void> {
  await invokeCoach<{ deleted: boolean }>({ action: "credential.delete" });
}

export async function getCoachPreferences(): Promise<CoachPreferences> {
  const data = await invokeCoach<{ preferences: CoachPreferenceRow }>({
    action: "preferences.get",
  });
  return mapPreferences(data.preferences);
}

export async function updateCoachPreferences(
  values: Partial<CoachPreferences>,
): Promise<CoachPreferences> {
  const preferences: Record<string, unknown> = {};
  if (values.enabled !== undefined) preferences.enabled = values.enabled;
  if (values.thresholdNotificationsEnabled !== undefined) {
    preferences.threshold_notifications_enabled = values.thresholdNotificationsEnabled;
  }
  if (values.weeklyReportEnabled !== undefined) {
    preferences.weekly_report_enabled = values.weeklyReportEnabled;
  }
  if (values.monthlyReportEnabled !== undefined) {
    preferences.monthly_report_enabled = values.monthlyReportEnabled;
  }
  if (values.pushNotificationsEnabled !== undefined) {
    preferences.push_notifications_enabled = values.pushNotificationsEnabled;
  }
  if (values.weeklyDay !== undefined) preferences.weekly_day = values.weeklyDay;
  if (values.weeklyHour !== undefined) preferences.weekly_hour = values.weeklyHour;
  if (values.timezone !== undefined) preferences.timezone = values.timezone;
  if (values.guidanceStyle !== undefined) preferences.guidance_style = values.guidanceStyle;
  if (values.hiddenAdviceTypes !== undefined) {
    preferences.hidden_advice_types = values.hiddenAdviceTypes;
  }
  const data = await invokeCoach<{ preferences: CoachPreferenceRow }>({
    action: "preferences.update",
    preferences,
  });
  return mapPreferences(data.preferences);
}

export async function listCoachReports(spaceId: string): Promise<CoachReport[]> {
  const { data, error } = await supabase
    .from("ai_coach_reports")
    .select("id,report_type,period_start,period_end,generated_by,facts,advice,helpful,read_at,dismissed_at,snoozed_until,created_at")
    .eq("space_id", spaceId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(48);
  if (error) throw new Error("Impossible de charger les bilans du Coach.");
  const now = Date.now();
  return ((data ?? []) as unknown as CoachReportRow[])
    .map(mapReport)
    .filter((report) => !report.snoozedUntil || Date.parse(report.snoozedUntil) <= now)
    .slice(0, 24);
}

export async function listCoachNotifications(spaceId: string): Promise<CoachNotification[]> {
  const { data, error } = await supabase
    .from("ai_coach_notifications")
    .select("id,kind,severity,title,body,read_at,created_at")
    .eq("space_id", spaceId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error("Impossible de charger les alertes du Coach.");
  return (data ?? []).map((row) => ({
    id: String(row.id),
    kind: row.kind as CoachNotification["kind"],
    severity: row.severity as CoachNotification["severity"],
    title: String(row.title),
    body: String(row.body),
    readAt: row.read_at ? String(row.read_at) : null,
    createdAt: String(row.created_at),
  }));
}

export async function updateCoachNotification(
  notificationId: string,
  values: { read?: boolean; dismissed?: boolean },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (values.read !== undefined) update.read_at = values.read ? new Date().toISOString() : null;
  if (values.dismissed !== undefined) {
    update.dismissed_at = values.dismissed ? new Date().toISOString() : null;
  }
  const { error } = await supabase
    .from("ai_coach_notifications")
    .update(update)
    .eq("id", notificationId);
  if (error) throw new Error("Impossible de mettre à jour cette alerte.");
}

export async function generateCoachReport(
  spaceId: string,
  reportType: CoachReportType,
): Promise<CoachReport> {
  const data = await invokeCoach<{ report: CoachReportRow }>({
    action: "report.generate",
    spaceId,
    reportType,
  });
  return mapReport(data.report);
}

export async function updateCoachReport(
  reportId: string,
  values: { helpful?: boolean | null; read?: boolean; dismissed?: boolean; snoozeDays?: number },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (values.helpful !== undefined) update.helpful = values.helpful;
  if (values.read !== undefined) update.read_at = values.read ? new Date().toISOString() : null;
  if (values.dismissed !== undefined) {
    update.dismissed_at = values.dismissed ? new Date().toISOString() : null;
  }
  if (values.snoozeDays !== undefined) {
    update.snoozed_until = new Date(
      Date.now() + values.snoozeDays * 86_400_000,
    ).toISOString();
  }
  const { error } = await supabase.from("ai_coach_reports").update(update).eq("id", reportId);
  if (error) throw new Error("Impossible de mettre à jour ce bilan.");
}

export async function deleteAllCoachData(): Promise<void> {
  const { error } = await supabase.rpc("delete_my_ai_coach_data");
  if (error) throw new Error("Impossible de supprimer les données du Coach.");
}

export async function registerCoachPushDevice(): Promise<string> {
  if (Platform.OS === "web") {
    throw new Error("Les notifications push sont disponibles dans l’app Android ou iOS.");
  }
  const [{ default: Constants }, Device, Notifications] = await Promise.all([
    import("expo-constants"),
    import("expo-device"),
    import("expo-notifications"),
  ]);
  if (!Device.isDevice) {
    throw new Error("Les notifications nécessitent un téléphone physique.");
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("budget-coach", {
      name: "Coach budget",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#169B68",
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") {
    throw new Error("Autorisez les notifications pour recevoir les bilans Budgetia.");
  }
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    throw new Error("Ajoutez l’identifiant public du projet EAS au build de production.");
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.rpc("register_push_device", {
    p_expo_push_token: token,
    p_platform: Platform.OS,
  });
  if (error) throw new Error("Ce téléphone n’a pas pu être enregistré.");
  return token;
}

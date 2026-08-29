import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

import {
  DEFAULT_OPENAI_MODEL,
  ProviderError,
  buildDeterministicAdvice,
  buildModelPacket,
  privacySafeIdentifier,
  requestOpenAIAdvice,
  validateOpenAIKey,
  type AdviceKind,
  type CoachAdvice,
  type CoachFacts,
  type GuidanceStyle,
  type ReportType,
} from "../_shared/ai-coach.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-budgetia-scheduler-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedPreferenceKeys = new Set([
  "enabled",
  "threshold_notifications_enabled",
  "weekly_report_enabled",
  "monthly_report_enabled",
  "push_notifications_enabled",
  "weekly_day",
  "weekly_hour",
  "timezone",
  "guidance_style",
  "hidden_advice_types",
]);

interface UserIdentity {
  id: string;
}

interface CoachJob {
  id: string;
  user_id: string;
  space_id: string;
  report_type: ReportType;
  period_start: string;
  period_end: string;
  requested_by: "schedule" | "user" | "mcp";
}

interface CredentialRow {
  api_key: string;
  model: string;
  status: "active" | "invalid" | "revoked";
}

interface PreferenceRow {
  user_id: string;
  enabled: boolean;
  threshold_notifications_enabled: boolean;
  weekly_report_enabled: boolean;
  monthly_report_enabled: boolean;
  push_notifications_enabled: boolean;
  weekly_day: number;
  weekly_hour: number;
  timezone: string;
  guidance_style: GuidanceStyle;
  hidden_advice_types: AdviceKind[];
  created_at: string;
  updated_at: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function safeError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bodyAction(body: unknown): string {
  return isRecord(body) && typeof body.action === "string" ? body.action : "";
}

function asUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} invalide.`);
  }
  return value;
}

function modelName(): string {
  const configured = Deno.env.get("BUDGETIA_AI_MODEL")?.trim();
  return configured && configured.length <= 80 ? configured : DEFAULT_OPENAI_MODEL;
}

function errorCode(error: unknown): string {
  if (error instanceof ProviderError) return error.code;
  return "COACH_INTERNAL_ERROR";
}

async function authenticatedUser(req: Request, admin: any): Promise<UserIdentity | null> {
  const authorization = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return null;
  const { data, error } = await admin.auth.getUser(match[1]);
  if (error || !data?.user?.id) return null;
  return { id: data.user.id };
}

async function assertMembership(admin: any, userId: string, spaceId: string): Promise<void> {
  const { data, error } = await admin
    .from("budget_space_members")
    .select("space_id")
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) throw new Error("BUDGET_MEMBERSHIP_REQUIRED");
}

async function getPreferences(admin: any, userId: string): Promise<PreferenceRow> {
  const { data, error } = await admin
    .from("ai_coach_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("COACH_PREFERENCES_MISSING");
  return data as PreferenceRow;
}

function credentialStatusPayload(row: Record<string, unknown> | null) {
  return {
    configured: Boolean(row?.configured),
    provider: typeof row?.provider === "string" ? row.provider : null,
    lastFour: typeof row?.last_four === "string" ? row.last_four : null,
    model: typeof row?.model === "string" ? row.model : null,
    status: typeof row?.status === "string" ? row.status : null,
    validatedAt: typeof row?.validated_at === "string" ? row.validated_at : null,
    lastUsedAt: typeof row?.last_used_at === "string" ? row.last_used_at : null,
    lastErrorCode: typeof row?.last_error_code === "string" ? row.last_error_code : null,
  };
}

async function credentialStatus(admin: any, userId: string) {
  const { data, error } = await admin.rpc("get_ai_provider_credential_status_for_worker", {
    p_user_id: userId,
  });
  if (error) throw new Error("CREDENTIAL_STATUS_FAILED");
  const row = Array.isArray(data) ? data[0] : data;
  return credentialStatusPayload(isRecord(row) ? row : null);
}

async function saveCredential(admin: any, userId: string, body: Record<string, unknown>): Promise<Response> {
  const key = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!key.startsWith("sk-") || key.length < 20 || key.length > 500) {
    return safeError(400, "INVALID_API_KEY", "La clé OpenAI n’a pas un format valide.");
  }
  const model = modelName();
  try {
    await validateOpenAIKey(key, model);
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.invalidCredential ? 400 : 503;
      return safeError(
        status,
        error.code,
        error.invalidCredential
          ? "Cette clé ne permet pas d’utiliser le modèle Budgetia."
          : "OpenAI est temporairement indisponible. Réessayez plus tard.",
      );
    }
    return safeError(503, "PROVIDER_UNAVAILABLE", "OpenAI est temporairement indisponible.");
  }

  const { error } = await admin.rpc("upsert_ai_provider_credential_for_worker", {
    p_user_id: userId,
    p_secret: key,
    p_last_four: key.slice(-4),
    p_model: model,
  });
  if (error) return safeError(500, "CREDENTIAL_SAVE_FAILED", "La clé n’a pas pu être enregistrée.");
  return json({ credential: await credentialStatus(admin, userId) });
}

function periodFor(reportType: ReportType, now = new Date()): { start: string; end: string } {
  const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = utcDate.toISOString().slice(0, 10);
  const startDate = new Date(utcDate);
  if (reportType === "weekly") startDate.setUTCDate(startDate.getUTCDate() - 6);
  else startDate.setUTCDate(1);
  return { start: startDate.toISOString().slice(0, 10), end };
}

async function getCredential(admin: any, userId: string): Promise<CredentialRow | null> {
  const { data, error } = await admin.rpc("get_ai_provider_credential_for_worker", {
    p_user_id: userId,
  });
  if (error) throw new Error("CREDENTIAL_READ_FAILED");
  const row = Array.isArray(data) ? data[0] : data;
  return row?.api_key && row?.model ? (row as CredentialRow) : null;
}

function notificationCopy(reportType: ReportType): { title: string; pushBody: string } {
  if (reportType === "weekly") {
    return { title: "Votre bilan hebdomadaire", pushBody: "Votre bilan Budgetia de la semaine est prêt." };
  }
  if (reportType === "monthly") {
    return { title: "Votre bilan mensuel", pushBody: "Votre bilan Budgetia du mois est prêt." };
  }
  return { title: "Nouvelle analyse", pushBody: "Une nouvelle analyse Budgetia est prête." };
}

async function persistReport(
  admin: any,
  job: CoachJob,
  facts: CoachFacts,
  advice: CoachAdvice,
  provider: { generatedBy: "deterministic" | "openai"; model: string | null; inputTokens: number | null; outputTokens: number | null },
): Promise<string> {
  const { data, error } = await admin.rpc("save_ai_coach_report_for_worker", {
    p_user_id: job.user_id,
    p_space_id: job.space_id,
    p_report_type: job.report_type,
    p_period_start: job.period_start,
    p_period_end: job.period_end,
    p_generated_by: provider.generatedBy,
    p_facts: facts,
    p_advice: advice,
    p_model: provider.model,
    p_input_tokens: provider.inputTokens,
    p_output_tokens: provider.outputTokens,
  });
  if (error || typeof data !== "string") throw new Error("REPORT_SAVE_FAILED");
  return data;
}

async function processJob(admin: any, job: CoachJob): Promise<string> {
  const { data: factsData, error: factsError } = await admin.rpc("get_ai_coach_facts_for_worker", {
    p_user_id: job.user_id,
    p_space_id: job.space_id,
    p_period_start: job.period_start,
    p_period_end: job.period_end,
  });
  if (factsError || !factsData) throw new Error("FACTS_BUILD_FAILED");
  const facts = factsData as CoachFacts;
  const preferences = await getPreferences(admin, job.user_id);
  const deterministic = buildDeterministicAdvice(facts, preferences.hidden_advice_types ?? []);
  let advice = deterministic;
  let generatedBy: "deterministic" | "openai" = "deterministic";
  let usedModel: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  const credential = await getCredential(admin, job.user_id);
  if (credential?.status === "active") {
    try {
      const packet = buildModelPacket(
        facts,
        job.report_type,
        preferences.guidance_style,
        preferences.hidden_advice_types ?? [],
      );
      const result = await requestOpenAIAdvice({
        apiKey: credential.api_key,
        model: credential.model,
        safetyIdentifier: await privacySafeIdentifier(job.user_id),
        packet,
      });
      advice = result.advice;
      generatedBy = "openai";
      usedModel = credential.model;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      await admin.rpc("mark_ai_provider_credential_used_for_worker", {
        p_user_id: job.user_id,
        p_status: "active",
        p_error_code: null,
      });
    } catch (error) {
      const providerCode = errorCode(error);
      await admin.rpc("mark_ai_provider_credential_used_for_worker", {
        p_user_id: job.user_id,
        p_status: error instanceof ProviderError && error.invalidCredential ? "invalid" : "active",
        p_error_code: providerCode,
      });
    }
  }

  const reportId = await persistReport(admin, job, facts, advice, {
    generatedBy,
    model: usedModel,
    inputTokens,
    outputTokens,
  });
  const copy = notificationCopy(job.report_type);
  const { error: notificationError } = await admin.from("ai_coach_notifications").upsert(
    {
      user_id: job.user_id,
      space_id: job.space_id,
      report_id: reportId,
      kind: job.report_type,
      severity: "info",
      title: copy.title,
      body: advice.summary,
      dedupe_key: `report:${reportId}`,
      data: { reportId },
    },
    { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
  );
  if (notificationError) throw new Error("NOTIFICATION_SAVE_FAILED");
  const { error: completeError } = await admin.rpc("complete_ai_coach_job_for_worker", {
    p_job_id: job.id,
    p_report_id: reportId,
  });
  if (completeError) throw new Error("JOB_COMPLETE_FAILED");
  return reportId;
}

async function processClaimedJobs(admin: any, limit = 10): Promise<{ completed: number; failed: number }> {
  const { data, error } = await admin.rpc("claim_ai_coach_jobs_for_worker", { p_limit: limit });
  if (error) throw new Error("JOB_CLAIM_FAILED");
  let completed = 0;
  let failed = 0;
  for (const rawJob of data ?? []) {
    const job = rawJob as CoachJob;
    try {
      await processJob(admin, job);
      completed += 1;
    } catch (reason) {
      failed += 1;
      await admin.rpc("fail_ai_coach_job_for_worker", {
        p_job_id: job.id,
        p_error_code: errorCode(reason),
        p_retry: true,
      });
    }
  }
  return { completed, failed };
}

async function sendPendingPushes(admin: any): Promise<number> {
  const { data: notifications, error } = await admin
    .from("ai_coach_notifications")
    .select("id,user_id,space_id,report_id,kind,push_attempts")
    .is("pushed_at", null)
    .is("dismissed_at", null)
    .lt("push_attempts", 5)
    .order("created_at")
    .limit(100);
  if (error || !notifications?.length) return 0;
  let sent = 0;
  for (const notification of notifications) {
    const preferences = await getPreferences(admin, notification.user_id).catch(() => null);
    if (!preferences?.push_notifications_enabled) continue;
    const { data: devices } = await admin
      .from("push_devices")
      .select("id,expo_push_token")
      .eq("user_id", notification.user_id)
      .eq("enabled", true)
      .limit(10);
    if (!devices?.length) continue;
    const copy = notificationCopy(notification.kind as ReportType);
    const messages = devices.map((device: { id: string; expo_push_token: string }) => ({
      to: device.expo_push_token,
      sound: "default",
      title: "Budgetia",
      body: copy.pushBody,
      data: {
        notificationId: notification.id,
        reportId: notification.report_id,
        spaceId: notification.space_id,
      },
      channelId: "budget-coach",
    }));
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN")?.trim();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    }).catch(() => null);
    if (!response?.ok) {
      await admin
        .from("ai_coach_notifications")
        .update({ push_attempts: Number(notification.push_attempts ?? 0) + 1, push_error_code: "EXPO_UNAVAILABLE" })
        .eq("id", notification.id);
      continue;
    }
    const payload = await response.json().catch(() => null);
    const tickets = Array.isArray(payload?.data) ? payload.data : [payload?.data];
    let accepted = 0;
    for (let index = 0; index < devices.length; index += 1) {
      const ticket = tickets[index];
      if (ticket?.status === "ok" && typeof ticket.id === "string") {
        accepted += 1;
        await admin
          .from("push_devices")
          .update({ last_receipt_id: ticket.id, last_error_code: null })
          .eq("id", devices[index].id);
      } else if (ticket?.details?.error === "DeviceNotRegistered") {
        await admin
          .from("push_devices")
          .update({ enabled: false, last_error_code: "DEVICE_NOT_REGISTERED" })
          .eq("id", devices[index].id);
      } else {
        await admin
          .from("push_devices")
          .update({ last_error_code: "EXPO_TICKET_ERROR" })
          .eq("id", devices[index].id);
      }
    }
    if (!accepted) {
      await admin
        .from("ai_coach_notifications")
        .update({
          push_attempts: Number(notification.push_attempts ?? 0) + 1,
          push_error_code: "EXPO_TICKET_ERROR",
        })
        .eq("id", notification.id);
      continue;
    }
    await admin
      .from("ai_coach_notifications")
      .update({
        pushed_at: new Date().toISOString(),
        push_attempts: Number(notification.push_attempts ?? 0) + 1,
        push_error_code: null,
      })
      .eq("id", notification.id);
    sent += 1;
  }
  return sent;
}

async function checkPushReceipts(admin: any): Promise<number> {
  const { data: devices } = await admin
    .from("push_devices")
    .select("id,last_receipt_id")
    .eq("enabled", true)
    .not("last_receipt_id", "is", null)
    .limit(500);
  if (!devices?.length) return 0;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const accessToken = Deno.env.get("EXPO_ACCESS_TOKEN")?.trim();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers,
    body: JSON.stringify({ ids: devices.map((device: any) => device.last_receipt_id) }),
  }).catch(() => null);
  if (!response?.ok) return 0;
  const payload = await response.json().catch(() => null);
  const receipts = isRecord(payload?.data) ? payload.data : {};
  let checked = 0;
  for (const device of devices) {
    const receipt = receipts[device.last_receipt_id];
    if (!isRecord(receipt)) continue;
    checked += 1;
    if (receipt.status === "error" && isRecord(receipt.details) && receipt.details.error === "DeviceNotRegistered") {
      await admin
        .from("push_devices")
        .update({ enabled: false, last_receipt_id: null, last_error_code: "DEVICE_NOT_REGISTERED" })
        .eq("id", device.id);
    } else {
      await admin
        .from("push_devices")
        .update({ last_receipt_id: null, last_error_code: receipt.status === "ok" ? null : "EXPO_RECEIPT_ERROR" })
        .eq("id", device.id);
    }
  }
  return checked;
}

async function schedulerRun(req: Request, admin: any): Promise<Response> {
  const secret = req.headers.get("x-budgetia-scheduler-secret") ?? "";
  if (secret.length < 32 || secret.length > 256) return safeError(401, "UNAUTHORIZED", "Accès refusé.");
  const { data: verified, error } = await admin.rpc("verify_ai_scheduler_secret_for_worker", {
    p_secret: secret,
  });
  if (error || verified !== true) return safeError(401, "UNAUTHORIZED", "Accès refusé.");
  const { data: queued, error: enqueueError } = await admin.rpc("enqueue_due_ai_coach_jobs_for_worker", {
    p_now: new Date().toISOString(),
  });
  if (enqueueError) return safeError(500, "SCHEDULER_ENQUEUE_FAILED", "Planification indisponible.");
  const jobs = await processClaimedJobs(admin, 15);
  const receipts = await checkPushReceipts(admin);
  const pushes = await sendPendingPushes(admin);
  return json({ ok: true, queued: Number(queued ?? 0), ...jobs, pushes, receipts });
}

async function manualGenerate(admin: any, userId: string, body: Record<string, unknown>): Promise<Response> {
  const spaceId = asUuid(body.spaceId, "Budget");
  await assertMembership(admin, userId, spaceId);
  const reportType: ReportType = body.reportType === "weekly" || body.reportType === "monthly"
    ? body.reportType
    : "manual";
  const requestedBy = body.requestedBy === "mcp" ? "mcp" : "user";
  const period = periodFor(reportType);
  const { data: recent } = await admin
    .from("ai_coach_jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("space_id", spaceId)
    .in("requested_by", ["user", "mcp"])
    .gt("created_at", new Date(Date.now() - 15 * 60_000).toISOString())
    .limit(1);
  if (recent?.length) {
    return safeError(429, "COACH_RATE_LIMIT", "Une analyse a déjà été demandée récemment.");
  }
  const { data: job, error } = await admin
    .from("ai_coach_jobs")
    .insert({
      user_id: userId,
      space_id: spaceId,
      report_type: reportType,
      period_start: period.start,
      period_end: period.end,
      requested_by: requestedBy,
      status: "processing",
      attempts: 1,
      claimed_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !job) return safeError(500, "JOB_CREATE_FAILED", "L’analyse n’a pas pu démarrer.");
  try {
    const reportId = await processJob(admin, job as CoachJob);
    const { data: report } = await admin
      .from("ai_coach_reports")
      .select("*")
      .eq("id", reportId)
      .eq("user_id", userId)
      .single();
    return json({ report });
  } catch (reason) {
    await admin.rpc("fail_ai_coach_job_for_worker", {
      p_job_id: job.id,
      p_error_code: errorCode(reason),
      p_retry: false,
    });
    return safeError(500, "COACH_GENERATION_FAILED", "L’analyse n’a pas pu être terminée.");
  }
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return safeError(405, "METHOD_NOT_ALLOWED", "Méthode non autorisée.");
    let body: unknown;
    try {
      const length = Number(req.headers.get("content-length") ?? "0");
      if (length > 8_192) return safeError(413, "PAYLOAD_TOO_LARGE", "Requête trop volumineuse.");
      body = await req.json();
    } catch {
      return safeError(400, "INVALID_JSON", "Requête JSON invalide.");
    }
    const action = bodyAction(body);
    if (action === "scheduler.run") return schedulerRun(req, ctx.supabaseAdmin);

    const user = await authenticatedUser(req, ctx.supabaseAdmin);
    if (!user) return safeError(401, "AUTH_REQUIRED", "Reconnectez-vous à Budgetia.");
    if (!isRecord(body)) return safeError(400, "INVALID_REQUEST", "Requête invalide.");

    try {
      if (action === "credential.status") {
        return json({ credential: await credentialStatus(ctx.supabaseAdmin, user.id) });
      }
      if (action === "credential.save") {
        return saveCredential(ctx.supabaseAdmin, user.id, body);
      }
      if (action === "credential.delete") {
        const { data, error } = await ctx.supabaseAdmin.rpc("delete_ai_provider_credential_for_worker", {
          p_user_id: user.id,
        });
        if (error) return safeError(500, "CREDENTIAL_DELETE_FAILED", "La clé n’a pas pu être supprimée.");
        return json({ deleted: Boolean(data) });
      }
      if (action === "preferences.get") {
        return json({ preferences: await getPreferences(ctx.supabaseAdmin, user.id) });
      }
      if (action === "preferences.update") {
        if (!isRecord(body.preferences)) return safeError(400, "INVALID_PREFERENCES", "Préférences invalides.");
        const entries = Object.entries(body.preferences);
        if (!entries.length || entries.some(([key]) => !allowedPreferenceKeys.has(key))) {
          return safeError(400, "INVALID_PREFERENCES", "Préférences invalides.");
        }
        const update = Object.fromEntries(entries);
        const { data, error } = await ctx.supabaseAdmin
          .from("ai_coach_preferences")
          .update(update)
          .eq("user_id", user.id)
          .select("*")
          .single();
        if (error || !data) return safeError(400, "INVALID_PREFERENCES", "Préférences invalides.");
        return json({ preferences: data });
      }
      if (action === "report.generate") {
        return manualGenerate(ctx.supabaseAdmin, user.id, body);
      }
      return safeError(404, "UNKNOWN_ACTION", "Action inconnue.");
    } catch (reason) {
      if (reason instanceof Error && reason.message === "BUDGET_MEMBERSHIP_REQUIRED") {
        return safeError(403, "BUDGET_MEMBERSHIP_REQUIRED", "Vous n’avez pas accès à ce budget.");
      }
      return safeError(500, "COACH_INTERNAL_ERROR", "Le Coach est temporairement indisponible.");
    }
  }),
};

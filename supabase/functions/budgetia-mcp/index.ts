import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  formatMoney,
  normalizeCategoryName,
  parseAddExpense,
  parseCreateCategory,
  parseDeleteCategory,
  parseListExpenses,
  parseSpaceSelection,
  parseSummary,
  parseUpdateCategory,
  toolError,
  toolResult,
  tools,
  type JsonObject,
} from "../_shared/budgetia-mcp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PUBLIC_SUPABASE_URL =
  Deno.env.get("BUDGETIA_PUBLIC_SUPABASE_URL")?.replace(/\/+$/, "") ?? SUPABASE_URL;
const MCP_URL = `${PUBLIC_SUPABASE_URL}/functions/v1/budgetia-mcp`;
const AUTH_SERVER = `${PUBLIC_SUPABASE_URL}/auth/v1`;
const MODERN_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_PROTOCOL_VERSIONS = new Set(["2025-11-25", "2025-06-18", "2025-03-26"]);
const SERVER_INFO = { name: "budgetia", version: "0.4.0" };
const INSTRUCTIONS =
  "Budgetia gère les budgets personnels et partagés en euros du compte connecté. Appelez list_budget_spaces si le budget visé n’est pas certain, puis transmettez budget_space_id pour un budget partagé. Listez les catégories avant une écriture si le nom est ambigu. Une dépense sans catégorie utilise la catégorie permanente Non classée. N’ajoutez, ne modifiez ou ne supprimez une donnée qu’à la demande explicite de l’utilisateur ; confirmez toujours une suppression de catégorie et sa stratégie. Utilisez request_id pour sécuriser une nouvelle tentative. Les dates sont au format YYYY-MM-DD.";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-protocol-version, mcp-method, mcp-name",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface RpcRequest {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: JsonObject;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string;
  is_fallback: boolean;
}

interface ExpenseRow {
  id: string;
  amount_cents: number;
  note: string;
  spent_at: string;
  source: "mobile" | "chatgpt";
  category: { name: string } | Array<{ name: string }> | null;
}

interface BudgetSpaceRow {
  id: string;
  name: string;
  kind: "personal" | "shared";
  role: "owner" | "editor";
}

interface BudgetSpaceMemberRow {
  role: "owner" | "editor";
  space:
    | Omit<BudgetSpaceRow, "role">
    | Array<Omit<BudgetSpaceRow, "role">>
    | null;
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

function rpcError(id: unknown, code: number, message: string, status = 200) {
  return json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, status);
}

async function authenticatedClient(req: Request): Promise<SupabaseClient> {
  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new Error("UNAUTHORIZED");
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return client;
}

async function listBudgetSpaceRows(db: SupabaseClient): Promise<BudgetSpaceRow[]> {
  const { data, error } = await db
    .from("budget_space_members")
    .select(
      "role,space:budget_spaces!budget_space_members_space_id_fkey(id,name,kind)",
    )
    .order("joined_at");
  if (error) throw error;
  return ((data ?? []) as unknown as BudgetSpaceMemberRow[])
    .flatMap((membership) => {
      const space = Array.isArray(membership.space)
        ? membership.space[0]
        : membership.space;
      return space ? [{ ...space, role: membership.role }] : [];
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "personal" ? -1 : 1;
      return left.name.localeCompare(right.name, "fr");
    });
}

async function resolveBudgetSpace(
  db: SupabaseClient,
  budgetSpaceId: string | undefined,
): Promise<BudgetSpaceRow> {
  const spaces = await listBudgetSpaceRows(db);
  const space = budgetSpaceId
    ? spaces.find((candidate) => candidate.id === budgetSpaceId)
    : spaces.find((candidate) => candidate.kind === "personal");
  if (!space) {
    throw new Error(
      budgetSpaceId
        ? "Cet espace budgétaire n’est pas accessible. Appelez list_budget_spaces."
        : "Aucun budget personnel n’est disponible.",
    );
  }
  return space;
}

async function listCategoryRows(
  db: SupabaseClient,
  spaceId: string,
): Promise<CategoryRow[]> {
  const { data, error } = await db
    .from("categories")
    .select("id,name,color,icon,is_fallback")
    .eq("space_id", spaceId)
    .is("archived_at", null)
    .order("name");
  if (error) throw error;
  return (data ?? []) as CategoryRow[];
}

function findCategoryByName(
  categories: CategoryRow[],
  name: string,
): CategoryRow | undefined {
  const normalized = normalizeCategoryName(name);
  return categories.find(
    (candidate) => normalizeCategoryName(candidate.name) === normalized,
  );
}

function publicCategory(category: CategoryRow) {
  return {
    id: category.id,
    name: category.name,
    color: category.color,
    is_fallback: category.is_fallback,
  };
}

async function resolveCategoryIds(
  db: SupabaseClient,
  spaceId: string,
  names: string[] | undefined,
): Promise<string[] | undefined> {
  if (!names?.length) return undefined;
  const categories = await listCategoryRows(db, spaceId);
  return names.map((name) => {
    const normalized = normalizeCategoryName(name);
    const category = categories.find(
      (candidate) => normalizeCategoryName(candidate.name) === normalized,
    );
    if (!category) {
      throw new Error(
        `La catégorie « ${name} » n’existe pas. Catégories disponibles : ${categories.map((item) => item.name).join(", ")}.`,
      );
    }
    return category.id;
  });
}

function mapExpense(row: ExpenseRow) {
  const category = Array.isArray(row.category) ? row.category[0] : row.category;
  const amountCents = Number(row.amount_cents);
  return {
    id: row.id,
    amount: amountCents / 100,
    amount_formatted: formatMoney(amountCents),
    category: category?.name ?? "Autre",
    note: row.note,
    date: row.spent_at,
    source: row.source,
  };
}

function humanSummary(summary: JsonObject): JsonObject {
  const totalCents = Number(summary.totalCents ?? 0);
  const previousTotalCents = Number(summary.previousTotalCents ?? 0);
  const rawCategories = Array.isArray(summary.categoryTotals) ? summary.categoryTotals : [];
  const rawSeries = Array.isArray(summary.series) ? summary.series : [];
  return {
    period: summary.period,
    start_date: (summary.range as JsonObject | undefined)?.startDate,
    end_date: (summary.range as JsonObject | undefined)?.endDate,
    total: totalCents / 100,
    total_formatted: formatMoney(totalCents),
    transaction_count: Number(summary.transactionCount ?? 0),
    comparison_percentage: summary.comparisonPercentage ?? null,
    previous_total: previousTotalCents / 100,
    previous_total_formatted: formatMoney(previousTotalCents),
    categories: rawCategories.map((value) => {
      const category = value as JsonObject;
      const amountCents = Number(category.amountCents ?? 0);
      return {
        id: category.categoryId,
        name: category.name,
        amount: amountCents / 100,
        amount_formatted: formatMoney(amountCents),
        percentage: Number(category.percentage ?? 0),
      };
    }),
    timeline: rawSeries.map((value) => {
      const point = value as JsonObject;
      const amountCents = Number(point.amountCents ?? 0);
      return {
        key: point.key,
        label: point.label,
        start_date: point.startDate,
        end_date: point.endDate,
        amount: amountCents / 100,
        amount_formatted: formatMoney(amountCents),
      };
    }),
  };
}

async function callTool(db: SupabaseClient, name: string, rawArguments: unknown) {
  if (name === "list_budget_spaces") {
    parseSpaceSelection(rawArguments);
    const budgetSpaces = await listBudgetSpaceRows(db);
    return toolResult(
      { budget_spaces: budgetSpaces },
      `${budgetSpaces.length} budget${budgetSpaces.length > 1 ? "s" : ""} disponible${budgetSpaces.length > 1 ? "s" : ""} : ${budgetSpaces.map((space) => `${space.name} (${space.kind === "personal" ? "personnel" : "partagé"})`).join(", ")}.`,
    );
  }

  if (name === "list_categories") {
    const input = parseSpaceSelection(rawArguments);
    const space = await resolveBudgetSpace(db, input.budgetSpaceId);
    const categories = (await listCategoryRows(db, space.id)).map(publicCategory);
    return toolResult(
      { categories },
      `${categories.length} catégories disponibles dans « ${space.name} » : ${categories.map((item) => item.name).join(", ")}.`,
    );
  }

  if (name === "create_category") {
    const input = parseCreateCategory(rawArguments);
    const space = await resolveBudgetSpace(db, input.budgetSpaceId);
    const categories = await listCategoryRows(db, space.id);
    const existing = categories.find(
      (category) =>
        normalizeCategoryName(category.name) === normalizeCategoryName(input.name),
    );
    let category = existing;
    if (!category) {
      const { data, error } = await db
        .from("categories")
        .insert({
          space_id: space.id,
          name: input.name,
          color: input.color ?? "#52B788",
          icon: "wallet-outline",
        })
        .select("id,name,color,icon,is_fallback")
        .single();
      if (error) {
        if (error.code === "23505") {
          category = (await listCategoryRows(db, space.id)).find(
            (candidate) =>
              normalizeCategoryName(candidate.name) === normalizeCategoryName(input.name),
          );
        }
        if (!category) throw error;
      } else {
        category = data as CategoryRow;
      }
    }
    const result = publicCategory(category!);
    return toolResult(
      { category: result },
      `La catégorie « ${category!.name} » est prête dans « ${space.name} ».`,
    );
  }

  if (name === "update_category") {
    const input = parseUpdateCategory(rawArguments);
    const space = await resolveBudgetSpace(db, input.budgetSpaceId);
    const categories = await listCategoryRows(db, space.id);
    const source = findCategoryByName(categories, input.category);
    if (!source) {
      throw new Error(
        `La catégorie « ${input.category} » n’existe pas dans « ${space.name} ».`,
      );
    }
    const target = input.transferExpensesTo
      ? findCategoryByName(categories, input.transferExpensesTo)
      : undefined;
    if (input.transferExpensesTo && !target) {
      throw new Error(
        `La catégorie de destination « ${input.transferExpensesTo} » n’existe pas dans « ${space.name} ».`,
      );
    }
    if (target?.id === source.id) {
      throw new Error("La catégorie de destination doit être différente de la source.");
    }

    const { data, error } = await db.rpc("update_budget_category", {
      p_category_id: source.id,
      p_name: input.name ?? null,
      p_color: input.color ?? null,
      p_transfer_to_category_id: target?.id ?? null,
    });
    if (error || !data) throw error ?? new Error("Modification indisponible.");
    const rawResult = data as {
      category: CategoryRow;
      transferredExpenseCount: number;
    };
    const result = {
      category: publicCategory(rawResult.category),
      transferred_expense_count: Number(rawResult.transferredExpenseCount),
    };
    return toolResult(
      result,
      `La catégorie « ${source.name} » a été modifiée dans « ${space.name} »${result.transferred_expense_count > 0 ? ` et ${result.transferred_expense_count} dépense(s) ont été transférées` : ""}.`,
    );
  }

  if (name === "delete_category") {
    const input = parseDeleteCategory(rawArguments);
    const space = await resolveBudgetSpace(db, input.budgetSpaceId);
    const categories = await listCategoryRows(db, space.id);
    const source = findCategoryByName(categories, input.category);
    if (!source) {
      throw new Error(
        `La catégorie « ${input.category} » n’existe pas dans « ${space.name} ».`,
      );
    }
    const target = input.transferExpensesTo
      ? findCategoryByName(categories, input.transferExpensesTo)
      : undefined;
    if (input.transferExpensesTo && !target) {
      throw new Error(
        `La catégorie de destination « ${input.transferExpensesTo} » n’existe pas dans « ${space.name} ».`,
      );
    }
    if (target?.id === source.id) {
      throw new Error("La catégorie de destination doit être différente de la source.");
    }

    const { data, error } = await db.rpc("delete_budget_category", {
      p_category_id: source.id,
      p_strategy: input.strategy,
      p_transfer_to_category_id: target?.id ?? null,
    });
    if (error || !data) throw error ?? new Error("Suppression indisponible.");
    const rawResult = data as {
      deletedCategoryId: string;
      strategy: "transfer" | "delete_expenses";
      affectedExpenseCount: number;
      transferToCategoryId: string | null;
    };
    const result = {
      deleted_category_id: rawResult.deletedCategoryId,
      strategy: rawResult.strategy,
      affected_expense_count: Number(rawResult.affectedExpenseCount),
      transfer_to_category_id: rawResult.transferToCategoryId,
    };
    return toolResult(
      result,
      input.strategy === "transfer"
        ? `La catégorie « ${source.name} » a été supprimée de « ${space.name} » et ${result.affected_expense_count} dépense(s) ont été transférées vers « ${target!.name} ».`
        : `La catégorie « ${source.name} » et ${result.affected_expense_count} dépense(s) ont été supprimées de « ${space.name} ».`,
    );
  }

  if (name === "add_expense") {
    const input = parseAddExpense(rawArguments);
    const space = await resolveBudgetSpace(db, input.budgetSpaceId);
    const categories = await listCategoryRows(db, space.id);
    const category = input.category
      ? findCategoryByName(categories, input.category)
      : categories.find((candidate) => candidate.is_fallback);
    if (!category) {
      throw new Error(
        input.category
          ? `La catégorie « ${input.category} » n’existe pas. Catégories disponibles : ${categories.map((item) => item.name).join(", ")}.`
          : "La catégorie de secours Non classée est indisponible.",
      );
    }
    const { data: created, error: createError } = await db.rpc(
      "create_budgetia_expense",
      {
        p_amount_cents: input.amountCents,
        p_category_id: category.id,
        p_note: input.note,
        p_spent_at: input.date,
        p_source: "chatgpt",
        p_request_id: input.requestId ?? null,
        p_space_id: space.id,
      },
    );
    if (createError || !created) throw createError ?? new Error("Dépense introuvable.");
    const { data, error } = await db
      .from("expenses")
      .select(
        "id,amount_cents,note,spent_at,source,category:categories!expenses_space_category_fkey(name)",
      )
      .eq("space_id", space.id)
      .eq("id", created.id)
      .single();
    if (error) throw error;
    const expense = mapExpense(data as unknown as ExpenseRow);
    return toolResult(
      { expense },
      `Dépense enregistrée dans « ${space.name} » : ${expense.amount_formatted} en ${expense.category}${expense.note ? ` (${expense.note})` : ""}, le ${expense.date}.`,
    );
  }

  if (name === "list_expenses") {
    const input = parseListExpenses(rawArguments);
    const space = await resolveBudgetSpace(db, input.budgetSpaceId);
    const categoryIds = await resolveCategoryIds(db, space.id, input.categories);
    let query = db
      .from("expenses")
      .select(
        "id,amount_cents,note,spent_at,source,category:categories!expenses_space_category_fkey(name)",
      )
      .eq("space_id", space.id)
      .gte("spent_at", input.startDate)
      .lte("spent_at", input.endDate)
      .order("spent_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(input.limit);
    if (categoryIds?.length) query = query.in("category_id", categoryIds);
    const { data, error } = await query;
    if (error) throw error;
    const expenses = ((data ?? []) as unknown as ExpenseRow[]).map(mapExpense);
    const totalCents = expenses.reduce(
      (sum, expense) => sum + Math.round(expense.amount * 100),
      0,
    );
    return toolResult(
      {
        expenses,
        total: totalCents / 100,
        total_formatted: formatMoney(totalCents),
      },
      `${expenses.length} dépense${expenses.length > 1 ? "s" : ""} dans « ${space.name} », pour un total de ${formatMoney(totalCents)}.`,
    );
  }

  if (name === "get_spending_summary") {
    const input = parseSummary(rawArguments);
    const space = await resolveBudgetSpace(db, input.budgetSpaceId);
    const categoryIds = await resolveCategoryIds(db, space.id, input.categories);
    const [{ data: rawSummary, error: summaryError }, { data: settings, error: settingsError }] =
      await Promise.all([
        db.rpc("get_budgetia_spending_summary", {
          p_period: input.period,
          p_reference_date: input.referenceDate,
          p_category_ids: categoryIds ?? null,
          p_space_id: space.id,
        }),
        db
          .from("budget_settings")
          .select("monthly_budget_cents")
          .eq("space_id", space.id)
          .single(),
      ]);
    if (summaryError || !rawSummary) throw summaryError ?? new Error("Bilan indisponible.");
    if (settingsError) throw settingsError;
    const summary = humanSummary(rawSummary as JsonObject);
    const monthlyBudgetCents =
      input.period === "month" ? Number(settings.monthly_budget_cents) : null;
    const remainingBudgetCents =
      monthlyBudgetCents === null
        ? null
        : monthlyBudgetCents - Math.round(Number(summary.total ?? 0) * 100);
    return toolResult(
      {
        summary,
        monthly_budget:
          monthlyBudgetCents === null ? null : monthlyBudgetCents / 100,
        remaining_budget:
          remainingBudgetCents === null ? null : remainingBudgetCents / 100,
      },
      `Dans « ${space.name} » : ${summary.total_formatted} dépensés sur la période, avec ${summary.transaction_count} transaction(s).${remainingBudgetCents === null ? "" : ` Budget restant : ${formatMoney(remainingBudgetCents)}.`}`,
    );
  }

  throw new Error(`Outil inconnu : ${name}.`);
}

function isModernRequest(req: Request, request: RpcRequest): boolean {
  const headerVersion = req.headers.get("MCP-Protocol-Version");
  const meta = request.params?._meta as JsonObject | undefined;
  return (
    headerVersion === MODERN_PROTOCOL_VERSION ||
    meta?.["io.modelcontextprotocol/protocolVersion"] === MODERN_PROTOCOL_VERSION
  );
}

function validateModernHeaders(req: Request, request: RpcRequest): string | null {
  if (req.headers.get("MCP-Protocol-Version") !== MODERN_PROTOCOL_VERSION) {
    return "MCP-Protocol-Version manquant ou incompatible";
  }
  if (req.headers.get("Mcp-Method") !== request.method) {
    return "Mcp-Method ne correspond pas au corps JSON-RPC";
  }
  if (
    request.method === "tools/call" &&
    req.headers.get("Mcp-Name") !== String(request.params?.name ?? "")
  ) {
    return "Mcp-Name ne correspond pas au nom de l’outil";
  }
  return null;
}

function completeModernResult(result: JsonObject): JsonObject {
  return {
    resultType: "complete",
    ...result,
    _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  const pathname = new URL(req.url).pathname;
  if (pathname.endsWith("/.well-known/oauth-protected-resource")) {
    return json({
      resource: MCP_URL,
      authorization_servers: [AUTH_SERVER],
      scopes_supported: ["email"],
      bearer_methods_supported: ["header"],
    });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, { Allow: "POST" });
  }

  let db: SupabaseClient;
  try {
    db = await authenticatedClient(req);
  } catch {
    return json({ error: "authentication_required" }, 401, {
      "WWW-Authenticate": `Bearer resource_metadata="${MCP_URL}/.well-known/oauth-protected-resource", scope="email"`,
    });
  }

  let request: RpcRequest;
  try {
    request = await req.json();
  } catch {
    return rpcError(null, -32700, "JSON invalide", 400);
  }
  if (request.jsonrpc !== "2.0" || !request.method) {
    return rpcError(request.id, -32600, "Requête JSON-RPC invalide", 400);
  }
  if (request.id === undefined) {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  const modern = isModernRequest(req, request);
  if (modern) {
    const mismatch = validateModernHeaders(req, request);
    if (mismatch) return rpcError(request.id, -32020, mismatch, 400);
  }

  try {
    let result: JsonObject;
    if (request.method === "server/discover") {
      result = completeModernResult({
        supportedVersions: [MODERN_PROTOCOL_VERSION],
        capabilities: { tools: { listChanged: false } },
        instructions: INSTRUCTIONS,
        ttlMs: 3_600_000,
        cacheScope: "public",
      });
    } else if (request.method === "initialize") {
      const requested = String(request.params?.protocolVersion ?? "");
      result = {
        protocolVersion: LEGACY_PROTOCOL_VERSIONS.has(requested)
          ? requested
          : "2025-11-25",
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      };
    } else if (request.method === "ping") {
      result = modern ? completeModernResult({}) : {};
    } else if (request.method === "tools/list") {
      result = modern
        ? completeModernResult({
            tools: [...tools],
            ttlMs: 3_600_000,
            cacheScope: "public",
          })
        : { tools: [...tools] };
    } else if (request.method === "tools/call") {
      const toolCall = await callTool(
        db,
        String(request.params?.name ?? ""),
        request.params?.arguments,
      );
      result = modern ? completeModernResult(toolCall as JsonObject) : toolCall;
    } else {
      return rpcError(request.id, -32601, "Méthode MCP inconnue");
    }
    return json({ jsonrpc: "2.0", id: request.id, result });
  } catch (error) {
    const result = toolError(error);
    return json({
      jsonrpc: "2.0",
      id: request.id,
      result: modern ? completeModernResult(result as JsonObject) : result,
    });
  }
});

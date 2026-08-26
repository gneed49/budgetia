export type JsonObject = Record<string, unknown>;

const oauthSecurity = [{ type: "oauth2", scopes: ["email"] }] as const;
const compatibilitySecurity = { securitySchemes: oauthSecurity };

const budgetSpaceSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    kind: { type: "string", enum: ["personal", "shared"] },
    role: { type: "string", enum: ["owner", "editor"] },
  },
  required: ["id", "name", "kind", "role"],
  additionalProperties: false,
};

const budgetSpaceIdProperty = {
  type: "string",
  format: "uuid",
  description:
    "Budget space ID. Omit only for the personal budget; call list_budget_spaces before targeting a shared budget.",
};

const categorySchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string" },
    color: { type: "string" },
    is_fallback: { type: "boolean" },
  },
  required: ["id", "name", "color", "is_fallback"],
  additionalProperties: false,
};

const expenseSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    amount: { type: "number" },
    amount_formatted: { type: "string" },
    category: { type: "string" },
    note: { type: "string" },
    date: { type: "string", format: "date" },
    source: { type: "string", enum: ["mobile", "chatgpt"] },
  },
  required: [
    "id",
    "amount",
    "amount_formatted",
    "category",
    "note",
    "date",
    "source",
  ],
  additionalProperties: false,
};

export const tools = [
  {
    name: "list_budget_spaces",
    title: "Lister les budgets Budgetia",
    description:
      "Use this before reading or writing when the user may mean a shared budget. It lists the personal and shared budgets available to the connected account.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: { budget_spaces: { type: "array", items: budgetSpaceSchema } },
      required: ["budget_spaces"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity,
    _meta: compatibilitySecurity,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "list_categories",
    title: "Lister les catégories Budgetia",
    description:
      "Use this before adding or filtering an expense when the user's exact Budgetia category is unknown or ambiguous.",
    inputSchema: {
      type: "object",
      properties: { budget_space_id: budgetSpaceIdProperty },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { categories: { type: "array", items: categorySchema } },
      required: ["categories"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity,
    _meta: compatibilitySecurity,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "create_category",
    title: "Créer une catégorie Budgetia",
    description:
      "Use this only when the user explicitly asks to create a new budget category. Reusing an existing category is preferred.",
    inputSchema: {
      type: "object",
      properties: {
        budget_space_id: budgetSpaceIdProperty,
        name: { type: "string", minLength: 2, maxLength: 40 },
        color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { category: categorySchema },
      required: ["category"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity,
    _meta: compatibilitySecurity,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "update_category",
    title: "Modifier une catégorie Budgetia",
    description:
      "Use this only when the user explicitly asks to rename or recolor a category, or to transfer all of its expenses to another category. The source category remains available after this operation.",
    inputSchema: {
      type: "object",
      properties: {
        budget_space_id: budgetSpaceIdProperty,
        category: { type: "string", minLength: 2, maxLength: 40 },
        name: { type: "string", minLength: 2, maxLength: 40 },
        color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
        transfer_expenses_to: { type: "string", minLength: 2, maxLength: 40 },
      },
      required: ["category"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        category: categorySchema,
        transferred_expense_count: { type: "integer", minimum: 0 },
      },
      required: ["category", "transferred_expense_count"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity,
    _meta: compatibilitySecurity,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    },
  },
  {
    name: "delete_category",
    title: "Supprimer une catégorie Budgetia",
    description:
      "Use this only after the user explicitly confirms deletion. strategy=transfer preserves expenses by moving them to transfer_expenses_to; strategy=delete_expenses permanently deletes the category and all of its expenses. The fallback category cannot be deleted.",
    inputSchema: {
      type: "object",
      properties: {
        budget_space_id: budgetSpaceIdProperty,
        category: { type: "string", minLength: 2, maxLength: 40 },
        strategy: { type: "string", enum: ["transfer", "delete_expenses"] },
        transfer_expenses_to: { type: "string", minLength: 2, maxLength: 40 },
      },
      required: ["category", "strategy"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        deleted_category_id: { type: "string", format: "uuid" },
        strategy: { type: "string", enum: ["transfer", "delete_expenses"] },
        affected_expense_count: { type: "integer", minimum: 0 },
        transfer_to_category_id: { type: ["string", "null"], format: "uuid" },
      },
      required: [
        "deleted_category_id",
        "strategy",
        "affected_expense_count",
        "transfer_to_category_id",
      ],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity,
    _meta: compatibilitySecurity,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
      idempotentHint: false,
    },
  },
  {
    name: "add_expense",
    title: "Ajouter une dépense Budgetia",
    description:
      "Use this when the user explicitly asks to record one expense. Amount is in euros and date defaults to today. If category is omitted, use the permanent fallback category for an unclassified expense.",
    inputSchema: {
      type: "object",
      properties: {
        budget_space_id: budgetSpaceIdProperty,
        amount: { type: "number", exclusiveMinimum: 0, maximum: 100000000 },
        category: { type: "string", minLength: 2, maxLength: 40 },
        note: { type: "string", maxLength: 160 },
        date: { type: "string", format: "date" },
        request_id: {
          type: "string",
          minLength: 4,
          maxLength: 100,
          description: "Stable unique ID for a retry of the same requested expense.",
        },
      },
      required: ["amount"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: { expense: expenseSchema },
      required: ["expense"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity,
    _meta: compatibilitySecurity,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false,
    },
  },
  {
    name: "list_expenses",
    title: "Lister les dépenses Budgetia",
    description:
      "Use this when the user wants individual expenses for a date range or selected categories. Defaults to the current month.",
    inputSchema: {
      type: "object",
      properties: {
        budget_space_id: budgetSpaceIdProperty,
        start_date: { type: "string", format: "date" },
        end_date: { type: "string", format: "date" },
        categories: {
          type: "array",
          items: { type: "string", minLength: 2, maxLength: 40 },
          maxItems: 20,
        },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        expenses: { type: "array", items: expenseSchema },
        total: { type: "number" },
        total_formatted: { type: "string" },
      },
      required: ["expenses", "total", "total_formatted"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity,
    _meta: compatibilitySecurity,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_spending_summary",
    title: "Analyser les dépenses Budgetia",
    description:
      "Use this for totals, category breakdowns, timelines, budget remaining, or comparisons with the previous week, month, or year.",
    inputSchema: {
      type: "object",
      properties: {
        budget_space_id: budgetSpaceIdProperty,
        period: { type: "string", enum: ["week", "month", "year"], default: "month" },
        reference_date: { type: "string", format: "date" },
        categories: {
          type: "array",
          items: { type: "string", minLength: 2, maxLength: 40 },
          maxItems: 20,
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        summary: { type: "object", additionalProperties: true },
        monthly_budget: { type: ["number", "null"] },
        remaining_budget: { type: ["number", "null"] },
      },
      required: ["summary", "monthly_budget", "remaining_budget"],
      additionalProperties: false,
    },
    securitySchemes: oauthSecurity,
    _meta: compatibilitySecurity,
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
] as const;

function record(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Les paramètres doivent être un objet JSON.");
  }
  return value as JsonObject;
}

function onlyKeys(value: JsonObject, allowed: string[]): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw new Error(`Paramètre inconnu : ${unexpected}.`);
}

function textValue(
  value: unknown,
  name: string,
  options: { required?: boolean; min?: number; max: number },
): string | undefined {
  if (value === undefined || value === null) {
    if (options.required) throw new Error(`Le paramètre ${name} est requis.`);
    return undefined;
  }
  if (typeof value !== "string") throw new Error(`${name} doit être un texte.`);
  const result = value.trim();
  if (result.length < (options.min ?? 0) || result.length > options.max) {
    throw new Error(`${name} doit contenir entre ${options.min ?? 0} et ${options.max} caractères.`);
  }
  return result;
}

export function parseDate(value: unknown, name: string): string | undefined {
  const result = textValue(value, name, { max: 10 });
  if (result === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new Error(`${name} doit être au format AAAA-MM-JJ.`);
  }
  const parsed = new Date(`${result}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new Error(`${name} n’est pas une date valide.`);
  }
  return result;
}

function stringList(value: unknown, name: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20) {
    throw new Error(`${name} doit être une liste de 20 éléments maximum.`);
  }
  return value.map((item) => {
    const parsed = textValue(item, name, { required: true, min: 2, max: 40 });
    return parsed!;
  });
}

export interface CreateCategoryInput {
  name: string;
  color?: string;
  budgetSpaceId?: string;
}

export interface AddExpenseInput {
  amountCents: number;
  category?: string;
  note: string;
  date: string;
  requestId?: string;
  budgetSpaceId?: string;
}

export interface UpdateCategoryInput {
  category: string;
  name?: string;
  color?: string;
  transferExpensesTo?: string;
  budgetSpaceId?: string;
}

export interface DeleteCategoryInput {
  category: string;
  strategy: "transfer" | "delete_expenses";
  transferExpensesTo?: string;
  budgetSpaceId?: string;
}

export interface ListExpensesInput {
  startDate: string;
  endDate: string;
  categories?: string[];
  limit: number;
  budgetSpaceId?: string;
}

export interface SummaryInput {
  period: "week" | "month" | "year";
  referenceDate: string;
  categories?: string[];
  budgetSpaceId?: string;
}

export interface SpaceSelectionInput {
  budgetSpaceId?: string;
}

function uuidValue(value: unknown, name: string): string | undefined {
  const result = textValue(value, name, { max: 36 });
  if (result === undefined) return undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new Error(`${name} doit être un identifiant UUID valide.`);
  }
  return result.toLowerCase();
}

export function parseSpaceSelection(value: unknown): SpaceSelectionInput {
  const input = record(value ?? {});
  onlyKeys(input, ["budget_space_id"]);
  const budgetSpaceId = uuidValue(input.budget_space_id, "budget_space_id");
  return budgetSpaceId ? { budgetSpaceId } : {};
}

export function parseCreateCategory(value: unknown): CreateCategoryInput {
  const input = record(value ?? {});
  onlyKeys(input, ["budget_space_id", "name", "color"]);
  const name = textValue(input.name, "name", { required: true, min: 2, max: 40 })!;
  const color = textValue(input.color, "color", { max: 7 });
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error("color doit être au format #RRGGBB.");
  }
  const budgetSpaceId = uuidValue(input.budget_space_id, "budget_space_id");
  return {
    name,
    ...(color ? { color: color.toUpperCase() } : {}),
    ...(budgetSpaceId ? { budgetSpaceId } : {}),
  };
}

export function parseUpdateCategory(value: unknown): UpdateCategoryInput {
  const input = record(value ?? {});
  onlyKeys(input, [
    "budget_space_id",
    "category",
    "name",
    "color",
    "transfer_expenses_to",
  ]);
  const category = textValue(input.category, "category", {
    required: true,
    min: 2,
    max: 40,
  })!;
  const name = textValue(input.name, "name", { min: 2, max: 40 });
  const color = textValue(input.color, "color", { max: 7 });
  if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error("color doit être au format #RRGGBB.");
  }
  const transferExpensesTo = textValue(
    input.transfer_expenses_to,
    "transfer_expenses_to",
    { min: 2, max: 40 },
  );
  if (!name && !color && !transferExpensesTo) {
    throw new Error(
      "Indiquez name, color ou transfer_expenses_to pour modifier la catégorie.",
    );
  }
  const budgetSpaceId = uuidValue(input.budget_space_id, "budget_space_id");
  return {
    category,
    ...(name ? { name } : {}),
    ...(color ? { color: color.toUpperCase() } : {}),
    ...(transferExpensesTo ? { transferExpensesTo } : {}),
    ...(budgetSpaceId ? { budgetSpaceId } : {}),
  };
}

export function parseDeleteCategory(value: unknown): DeleteCategoryInput {
  const input = record(value ?? {});
  onlyKeys(input, [
    "budget_space_id",
    "category",
    "strategy",
    "transfer_expenses_to",
  ]);
  const category = textValue(input.category, "category", {
    required: true,
    min: 2,
    max: 40,
  })!;
  if (input.strategy !== "transfer" && input.strategy !== "delete_expenses") {
    throw new Error("strategy doit être transfer ou delete_expenses.");
  }
  const transferExpensesTo = textValue(
    input.transfer_expenses_to,
    "transfer_expenses_to",
    { min: 2, max: 40 },
  );
  if (input.strategy === "transfer" && !transferExpensesTo) {
    throw new Error("transfer_expenses_to est requis avec la stratégie transfer.");
  }
  if (input.strategy === "delete_expenses" && transferExpensesTo) {
    throw new Error(
      "transfer_expenses_to ne doit pas être fourni avec delete_expenses.",
    );
  }
  const budgetSpaceId = uuidValue(input.budget_space_id, "budget_space_id");
  return {
    category,
    strategy: input.strategy,
    ...(transferExpensesTo ? { transferExpensesTo } : {}),
    ...(budgetSpaceId ? { budgetSpaceId } : {}),
  };
}

export function parseAddExpense(value: unknown, today = todayISO()): AddExpenseInput {
  const input = record(value ?? {});
  onlyKeys(input, [
    "budget_space_id",
    "amount",
    "category",
    "note",
    "date",
    "request_id",
  ]);
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount)) {
    throw new Error("amount doit être un nombre en euros.");
  }
  const amountCents = Math.round((input.amount + Number.EPSILON) * 100);
  if (amountCents < 1 || amountCents > 10_000_000_000) {
    throw new Error("amount doit être compris entre 0,01 et 100 000 000 €.");
  }
  const category = textValue(input.category, "category", {
    min: 2,
    max: 40,
  });
  const note = textValue(input.note, "note", { max: 160 }) ?? "";
  const date = parseDate(input.date, "date") ?? today;
  const requestId = textValue(input.request_id, "request_id", { min: 4, max: 100 });
  const budgetSpaceId = uuidValue(input.budget_space_id, "budget_space_id");
  return {
    amountCents,
    ...(category ? { category } : {}),
    note,
    date,
    ...(requestId ? { requestId } : {}),
    ...(budgetSpaceId ? { budgetSpaceId } : {}),
  };
}

export function parseListExpenses(value: unknown, today = todayISO()): ListExpensesInput {
  const input = record(value ?? {});
  onlyKeys(input, ["budget_space_id", "start_date", "end_date", "categories", "limit"]);
  const defaults = currentMonthRange(today);
  const startDate = parseDate(input.start_date, "start_date") ?? defaults.startDate;
  const endDate = parseDate(input.end_date, "end_date") ?? defaults.endDate;
  if (startDate > endDate) throw new Error("start_date doit précéder end_date.");
  const categories = stringList(input.categories, "categories");
  const limit = input.limit === undefined ? 50 : input.limit;
  if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 200) {
    throw new Error("limit doit être un entier compris entre 1 et 200.");
  }
  const budgetSpaceId = uuidValue(input.budget_space_id, "budget_space_id");
  return {
    startDate,
    endDate,
    ...(categories?.length ? { categories } : {}),
    limit: Number(limit),
    ...(budgetSpaceId ? { budgetSpaceId } : {}),
  };
}

export function parseSummary(value: unknown, today = todayISO()): SummaryInput {
  const input = record(value ?? {});
  onlyKeys(input, ["budget_space_id", "period", "reference_date", "categories"]);
  const period = input.period ?? "month";
  if (period !== "week" && period !== "month" && period !== "year") {
    throw new Error("period doit être week, month ou year.");
  }
  const referenceDate = parseDate(input.reference_date, "reference_date") ?? today;
  const categories = stringList(input.categories, "categories");
  const budgetSpaceId = uuidValue(input.budget_space_id, "budget_space_id");
  return {
    period,
    referenceDate,
    ...(categories?.length ? { categories } : {}),
    ...(budgetSpaceId ? { budgetSpaceId } : {}),
  };
}

export function todayISO(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function currentMonthRange(referenceDate: string): {
  startDate: string;
  endDate: string;
} {
  const parsed = new Date(`${parseDate(referenceDate, "reference_date")}T12:00:00.000Z`);
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  return {
    startDate: `${year}-${String(month + 1).padStart(2, "0")}-01`,
    endDate: new Date(Date.UTC(year, month + 1, 0, 12)).toISOString().slice(0, 10),
  };
}

export function normalizeCategoryName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}

export function toolResult(structuredContent: unknown, text: string) {
  return { structuredContent, content: [{ type: "text", text }] };
}

export function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: message },
  };
}

import {
  getPeriodRange,
  normalizeCategoryName,
  parseMoneyToCents,
  type Category,
  type Expense,
  type Period,
  type ProductBreakdown,
  type ProductGroup,
  type ReceiptDetails,
  type ReceiptItemDraft,
  type SpendingSummary,
} from "@budgetia/domain";

import { supabase } from "./supabase";

export interface BudgetSettings {
  currency: "EUR";
  monthlyBudgetCents: number;
}

export interface BudgetSpace {
  id: string;
  name: string;
  kind: "personal" | "shared";
  role: "owner" | "editor";
  createdBy: string;
  createdAt: string;
}

export interface BudgetInvitation {
  id: string;
  spaceId: string;
  spaceName: string;
  email: string;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
}

export interface BudgetSpaceMember {
  userId: string;
  email: string;
  role: "owner" | "editor";
  joinedAt: string;
}

export interface AccountDeletionImpact {
  personalExpenseCount: number;
  sharedMembershipCount: number;
  ownedSharedSpaceCount: number;
  sharedExpenseCountKept: number;
}

export interface CategoryUsage {
  categoryId: string;
  expenseCount: number;
  totalCents: number;
}

export interface CategoryUpdateResult {
  category: Category;
  transferredExpenseCount: number;
}

export interface CategoryDeleteResult {
  deletedCategoryId: string;
  strategy: "transfer" | "delete_expenses";
  affectedExpenseCount: number;
  transferToCategoryId: string | null;
}

interface BudgetSpaceRow {
  id: string;
  name: string;
  kind: "personal" | "shared";
  created_by: string;
  created_at: string;
}

interface BudgetSpaceMemberRow {
  role: "owner" | "editor";
  space: BudgetSpaceRow | BudgetSpaceRow[] | null;
}

interface BudgetInvitationRow {
  id: string;
  space_id: string;
  email: string;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
  space_name: string;
}

interface BudgetSpaceMemberRpcRow {
  user_id: string;
  email: string;
  role: "owner" | "editor";
  joined_at: string;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  icon: string;
  is_fallback: boolean;
  created_at: string;
  archived_at: string | null;
}

interface ExpenseCategoryRow {
  name: string;
  color: string;
  icon: string;
}

interface ExpenseRow {
  id: string;
  amount_cents: number;
  category_id: string;
  note: string;
  spent_at: string;
  source: "mobile" | "chatgpt";
  created_at: string;
  updated_at: string;
  category: ExpenseCategoryRow | ExpenseCategoryRow[] | null;
  receipt?: { id: string } | Array<{ id: string }> | null;
}

interface ReceiptItemRow {
  id: string;
  label: string;
  amount_cents: number;
  product_group: ProductGroup;
  position: number;
}

interface ReceiptRow {
  id: string;
  expense_id: string;
  merchant: string;
  source: "mobile" | "chatgpt";
  created_at: string;
  items: ReceiptItemRow[] | null;
}

interface SupabaseFailure {
  code?: string;
  message: string;
}

interface CategoryUsageRow {
  category_id: string;
  expense_count: number;
  total_cents: number;
}

interface CategoryUpdateRpcRow {
  category: CategoryRow;
  transferredExpenseCount: number;
}

interface CategoryDeleteRpcRow {
  deletedCategoryId: string;
  strategy: "transfer" | "delete_expenses";
  affectedExpenseCount: number;
  transferToCategoryId: string | null;
}

const EXPENSE_COLUMNS =
  "id,amount_cents,category_id,note,spent_at,source,created_at,updated_at,category:categories!expenses_space_category_fkey(name,color,icon),receipt:receipts!receipts_space_expense_fkey(id)";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function toApiError(error: SupabaseFailure, fallback: string): ApiError {
  const message = error.message.toLowerCase();
  if (message.includes("jwt") || message.includes("authentication required")) {
    return new ApiError("Votre session a expiré. Reconnectez-vous.", 401);
  }
  if (error.code === "42501") {
    return new ApiError("Vous n’avez pas accès à ce budget.", 403);
  }
  if (error.code === "23505") {
    return new ApiError("Cette donnée existe déjà.", 409);
  }
  if (error.code === "23503") {
    return new ApiError("La catégorie choisie n’est plus disponible.", 409);
  }
  if (error.code === "23514" || error.code === "22023") {
    if (message.includes("receipt total")) {
      return new ApiError(
        "Le montant d’un ticket dépend de ses lignes. Ouvrez le détail du ticket pour le modifier.",
      );
    }
    return new ApiError("Les informations saisies ne sont pas valides.");
  }
  return new ApiError(fallback);
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    isFallback: row.is_fallback,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}

function mapExpense(row: ExpenseRow): Expense {
  const relation = Array.isArray(row.category) ? row.category[0] : row.category;
  return {
    id: row.id,
    amountCents: Number(row.amount_cents),
    categoryId: row.category_id,
    categoryName: relation?.name ?? "Autre",
    categoryColor: relation?.color ?? "#93B29A",
    categoryIcon: relation?.icon ?? "ellipsis-horizontal",
    note: row.note,
    spentAt: row.spent_at,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasReceipt: Array.isArray(row.receipt)
      ? row.receipt.length > 0
      : Boolean(row.receipt),
  };
}

function mapSpace(row: BudgetSpaceRow, role: "owner" | "editor"): BudgetSpace {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    role,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listBudgetSpaces(): Promise<BudgetSpace[]> {
  const { data, error } = await supabase
    .from("budget_space_members")
    .select(
      "role,space:budget_spaces!budget_space_members_space_id_fkey(id,name,kind,created_by,created_at)",
    )
    .order("joined_at");
  if (error) throw toApiError(error, "Impossible de charger vos budgets.");
  return ((data ?? []) as unknown as BudgetSpaceMemberRow[])
    .flatMap((membership) => {
      const space = Array.isArray(membership.space)
        ? membership.space[0]
        : membership.space;
      return space ? [mapSpace(space, membership.role)] : [];
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "personal" ? -1 : 1;
      return left.name.localeCompare(right.name, "fr");
    });
}

export async function createSharedBudget(name: string): Promise<BudgetSpace> {
  const { data, error } = await supabase.rpc("create_shared_budget", {
    p_name: name.trim(),
  });
  if (error || !data) {
    throw toApiError(
      error ?? { message: "missing shared budget" },
      "Impossible de créer le budget partagé.",
    );
  }
  return mapSpace(data as BudgetSpaceRow, "owner");
}

export async function listBudgetInvitations(): Promise<BudgetInvitation[]> {
  const { data, error } = await supabase.rpc("list_budget_invitations");
  if (error) throw toApiError(error, "Impossible de charger les invitations.");
  return ((data ?? []) as BudgetInvitationRow[]).map((row) => ({
      id: row.id,
      spaceId: row.space_id,
      spaceName: row.space_name,
      email: row.email,
      status: row.status,
      createdAt: row.created_at,
    }));
}

export async function inviteBudgetMember(
  spaceId: string,
  email: string,
): Promise<BudgetInvitation> {
  const { data, error } = await supabase.rpc("invite_budget_member", {
    p_space_id: spaceId,
    p_email: email.trim(),
  });
  if (error || !data) {
    throw toApiError(
      error ?? { message: "missing invitation" },
      "Impossible de créer l’invitation.",
    );
  }
  const row = data as Omit<BudgetInvitationRow, "space">;
  return {
    id: row.id,
    spaceId: row.space_id,
    spaceName: "Budget partagé",
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function acceptBudgetInvitation(
  invitationId: string,
): Promise<BudgetSpace> {
  const { data, error } = await supabase.rpc("accept_budget_invitation", {
    p_invitation_id: invitationId,
  });
  if (error || !data) {
    throw toApiError(
      error ?? { message: "missing invitation" },
      "Cette invitation n’est plus disponible.",
    );
  }
  return mapSpace(data as BudgetSpaceRow, "editor");
}

export async function listBudgetSpaceMembers(
  spaceId: string,
): Promise<BudgetSpaceMember[]> {
  const { data, error } = await supabase.rpc("list_budget_space_members", {
    p_space_id: spaceId,
  });
  if (error) throw toApiError(error, "Impossible de charger les membres du budget.");
  return ((data ?? []) as BudgetSpaceMemberRpcRow[]).map((row) => ({
    userId: row.user_id,
    email: row.email,
    role: row.role,
    joinedAt: row.joined_at,
  }));
}

export async function renameSharedBudget(
  space: BudgetSpace,
  name: string,
): Promise<BudgetSpace> {
  const { data, error } = await supabase.rpc("rename_shared_budget", {
    p_space_id: space.id,
    p_name: name.trim(),
  });
  if (error || !data) {
    throw toApiError(
      error ?? { message: "missing budget" },
      "Impossible de renommer le budget.",
    );
  }
  return mapSpace(data as BudgetSpaceRow, space.role);
}

export async function transferBudgetOwnership(
  spaceId: string,
  newOwnerUserId: string,
): Promise<void> {
  const { error } = await supabase.rpc("transfer_budget_space_ownership", {
    p_space_id: spaceId,
    p_new_owner_user_id: newOwnerUserId,
  });
  if (error) throw toApiError(error, "Impossible de transférer la propriété.");
}

export async function removeBudgetMember(
  spaceId: string,
  memberUserId: string,
): Promise<void> {
  const { error } = await supabase.rpc("remove_budget_space_member", {
    p_space_id: spaceId,
    p_member_user_id: memberUserId,
  });
  if (error) throw toApiError(error, "Impossible de retirer ce membre.");
}

export async function leaveSharedBudget(spaceId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_shared_budget", {
    p_space_id: spaceId,
  });
  if (error) throw toApiError(error, "Impossible de quitter ce budget.");
}

export async function deleteSharedBudget(
  spaceId: string,
  confirmation: string,
): Promise<void> {
  const { error } = await supabase.rpc("delete_shared_budget", {
    p_space_id: spaceId,
    p_confirmation: confirmation,
  });
  if (error) throw toApiError(error, "Impossible de supprimer ce budget.");
}

export async function revokeBudgetInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_budget_invitation", {
    p_invitation_id: invitationId,
  });
  if (error) throw toApiError(error, "Impossible d’annuler cette invitation.");
}

export async function getAccountDeletionImpact(): Promise<AccountDeletionImpact> {
  const { data, error } = await supabase.rpc("get_account_deletion_impact");
  if (error || !data) {
    throw toApiError(
      error ?? { message: "missing deletion impact" },
      "Impossible de préparer la suppression du compte.",
    );
  }
  const value = data as Record<string, unknown>;
  return {
    personalExpenseCount: Number(value.personalExpenseCount ?? 0),
    sharedMembershipCount: Number(value.sharedMembershipCount ?? 0),
    ownedSharedSpaceCount: Number(value.ownedSharedSpaceCount ?? 0),
    sharedExpenseCountKept: Number(value.sharedExpenseCountKept ?? 0),
  };
}

export async function deleteCurrentAccount(): Promise<AccountDeletionImpact> {
  const { data, error } = await supabase.functions.invoke("delete-account", {
    body: { confirmation: "SUPPRIMER" },
  });
  if (error || !data?.deleted) {
    throw new ApiError("La suppression du compte n’a pas pu être terminée.");
  }
  return data.impact as AccountDeletionImpact;
}

export class BudgetApi {
  constructor(readonly spaceId: string) {}

  async health(): Promise<void> {
    const { error } = await supabase
      .from("budget_settings")
      .select("space_id")
      .eq("space_id", this.spaceId)
      .limit(1);
    if (error) throw toApiError(error, "Supabase est indisponible.");
  }

  async listCategories(): Promise<Category[]> {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,color,icon,is_fallback,created_at,archived_at")
      .eq("space_id", this.spaceId)
      .is("archived_at", null)
      .order("name");
    if (error) throw toApiError(error, "Impossible de charger les catégories.");
    return ((data ?? []) as CategoryRow[]).map(mapCategory);
  }

  async createCategory(input: {
    name: string;
    color?: string;
    icon?: string;
  }): Promise<Category> {
    const name = input.name.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 40) {
      throw new ApiError("Le nom de catégorie doit contenir entre 2 et 40 caractères.");
    }
    const color = (input.color ?? "#52B788").toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(color)) {
      throw new ApiError("La couleur doit être au format #RRGGBB.");
    }

    const existing = (await this.listCategories()).find(
      (category) => normalizeCategoryName(category.name) === normalizeCategoryName(name),
    );
    if (existing) return existing;

    const { data, error } = await supabase
      .from("categories")
      .insert({
        space_id: this.spaceId,
        name,
        color,
        icon: input.icon?.trim() || "wallet-outline",
      })
      .select("id,name,color,icon,is_fallback,created_at,archived_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        const raced = (await this.listCategories()).find(
          (category) => normalizeCategoryName(category.name) === normalizeCategoryName(name),
        );
        if (raced) return raced;
      }
      throw toApiError(error, "Impossible de créer la catégorie.");
    }
    return mapCategory(data as CategoryRow);
  }

  async listCategoryUsage(): Promise<CategoryUsage[]> {
    const { data, error } = await supabase.rpc("get_budget_category_usage", {
      p_space_id: this.spaceId,
    });
    if (error) {
      throw toApiError(error, "Impossible de calculer l’utilisation des catégories.");
    }
    return ((data ?? []) as CategoryUsageRow[]).map((row) => ({
      categoryId: row.category_id,
      expenseCount: Number(row.expense_count),
      totalCents: Number(row.total_cents),
    }));
  }

  async updateCategory(input: {
    categoryId: string;
    name: string;
    color: string;
    transferToCategoryId?: string;
  }): Promise<CategoryUpdateResult> {
    const name = input.name.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 40) {
      throw new ApiError("Le nom de catégorie doit contenir entre 2 et 40 caractères.");
    }
    const color = input.color.toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(color)) {
      throw new ApiError("La couleur doit être au format #RRGGBB.");
    }
    if (input.transferToCategoryId === input.categoryId) {
      throw new ApiError("Choisissez une autre catégorie pour le transfert.");
    }

    const { data, error } = await supabase.rpc("update_budget_category", {
      p_category_id: input.categoryId,
      p_name: name,
      p_color: color,
      p_transfer_to_category_id: input.transferToCategoryId ?? null,
    });
    if (error || !data) {
      throw toApiError(
        error ?? { message: "missing category update" },
        "Impossible de modifier la catégorie.",
      );
    }
    const result = data as unknown as CategoryUpdateRpcRow;
    return {
      category: mapCategory(result.category),
      transferredExpenseCount: Number(result.transferredExpenseCount),
    };
  }

  async deleteCategory(input: {
    categoryId: string;
    strategy: "transfer" | "delete_expenses";
    transferToCategoryId?: string;
  }): Promise<CategoryDeleteResult> {
    if (input.strategy === "transfer" && !input.transferToCategoryId) {
      throw new ApiError("Choisissez une catégorie de destination.");
    }
    if (input.transferToCategoryId === input.categoryId) {
      throw new ApiError("Choisissez une autre catégorie pour le transfert.");
    }

    const { data, error } = await supabase.rpc("delete_budget_category", {
      p_category_id: input.categoryId,
      p_strategy: input.strategy,
      p_transfer_to_category_id: input.transferToCategoryId ?? null,
    });
    if (error || !data) {
      throw toApiError(
        error ?? { message: "missing category deletion" },
        "Impossible de supprimer la catégorie.",
      );
    }
    const result = data as unknown as CategoryDeleteRpcRow;
    return {
      deletedCategoryId: result.deletedCategoryId,
      strategy: result.strategy,
      affectedExpenseCount: Number(result.affectedExpenseCount),
      transferToCategoryId: result.transferToCategoryId,
    };
  }

  async listExpenses(input: {
    startDate?: string;
    endDate?: string;
    categoryIds?: string[];
    limit?: number;
  } = {}): Promise<Expense[]> {
    let query = supabase
      .from("expenses")
      .select(EXPENSE_COLUMNS)
      .eq("space_id", this.spaceId)
      .order("spent_at", { ascending: false })
      .order("created_at", { ascending: false });
    if (input.startDate) query = query.gte("spent_at", input.startDate);
    if (input.endDate) query = query.lte("spent_at", input.endDate);
    if (input.categoryIds?.length) query = query.in("category_id", input.categoryIds);
    query = query.limit(Math.min(input.limit ?? 100, 1000));
    const { data, error } = await query;
    if (error) throw toApiError(error, "Impossible de charger les dépenses.");
    return ((data ?? []) as unknown as ExpenseRow[]).map(mapExpense);
  }

  async listAllExpenses(): Promise<Expense[]> {
    const pageSize = 1000;
    const result: Expense[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("expenses")
        .select(EXPENSE_COLUMNS)
        .eq("space_id", this.spaceId)
        .order("spent_at", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw toApiError(error, "Impossible d’exporter les dépenses.");
      const page = ((data ?? []) as unknown as ExpenseRow[]).map(mapExpense);
      result.push(...page);
      if (page.length < pageSize) return result;
    }
  }

  private async getExpense(id: string): Promise<Expense> {
    const { data, error } = await supabase
      .from("expenses")
      .select(EXPENSE_COLUMNS)
      .eq("space_id", this.spaceId)
      .eq("id", id)
      .single();
    if (error) throw toApiError(error, "Dépense introuvable.");
    return mapExpense(data as unknown as ExpenseRow);
  }

  async addExpense(input: {
    amount: string;
    categoryId: string;
    note?: string;
    spentAt?: string;
    requestId?: string;
  }): Promise<Expense> {
    const spentAt = input.spentAt ?? new Date().toISOString().slice(0, 10);
    getPeriodRange("month", spentAt);
    const note = input.note?.trim() ?? "";
    if (note.length > 160) throw new ApiError("La note est limitée à 160 caractères.");
    const { data, error } = await supabase.rpc("create_budgetia_expense", {
      p_amount_cents: parseMoneyToCents(input.amount),
      p_category_id: input.categoryId,
      p_note: note,
      p_spent_at: spentAt,
      p_source: "mobile",
      p_request_id: input.requestId ?? null,
      p_space_id: this.spaceId,
    });
    if (error || !data) {
      throw toApiError(
        error ?? { message: "missing expense" },
        "Impossible d’enregistrer la dépense.",
      );
    }
    return this.getExpense((data as { id: string }).id);
  }

  async addReceiptExpense(input: {
    categoryId: string;
    merchant?: string;
    note?: string;
    spentAt: string;
    requestId?: string;
    items: ReceiptItemDraft[];
  }): Promise<Expense> {
    getPeriodRange("month", input.spentAt);
    if (!input.items.length || input.items.length > 100) {
      throw new ApiError("Un ticket doit contenir entre 1 et 100 lignes.");
    }
    const note = input.note?.trim() ?? "";
    if (note.length > 160) throw new ApiError("La note est limitée à 160 caractères.");
    const merchant = input.merchant?.trim() ?? "";
    if (merchant.length > 80) {
      throw new ApiError("Le nom du commerçant est limité à 80 caractères.");
    }
    const { data, error } = await supabase.rpc("create_budgetia_receipt_expense", {
      p_category_id: input.categoryId,
      p_items: input.items.map((item) => ({
        label: item.label.trim(),
        amount_cents: item.amountCents,
        product_group: item.productGroup,
      })),
      p_merchant: merchant,
      p_note: note,
      p_spent_at: input.spentAt,
      p_source: "mobile",
      p_request_id: input.requestId ?? null,
      p_space_id: this.spaceId,
    });
    if (error || !data) {
      throw toApiError(
        error ?? { message: "missing receipt" },
        "Impossible d’enregistrer le ticket.",
      );
    }
    return this.getExpense((data as { expenseId: string }).expenseId);
  }

  async getReceiptDetails(expenseId: string): Promise<ReceiptDetails> {
    const { data, error } = await supabase
      .from("receipts")
      .select(
        "id,expense_id,merchant,source,created_at,items:receipt_items(id,label,amount_cents,product_group,position)",
      )
      .eq("space_id", this.spaceId)
      .eq("expense_id", expenseId)
      .order("position", { referencedTable: "receipt_items", ascending: true })
      .single();
    if (error || !data) {
      throw toApiError(
        error ?? { message: "missing receipt" },
        "Détail du ticket indisponible.",
      );
    }
    const row = data as unknown as ReceiptRow;
    return {
      id: row.id,
      expenseId: row.expense_id,
      merchant: row.merchant,
      source: row.source,
      createdAt: row.created_at,
      items: (row.items ?? [])
        .map((item) => ({
          id: item.id,
          label: item.label,
          amountCents: Number(item.amount_cents),
          productGroup: item.product_group,
          position: Number(item.position),
        }))
        .sort((left, right) => left.position - right.position),
    };
  }

  async getProductBreakdown(input: {
    period: Period;
    referenceDate: string;
    categoryIds?: string[];
    productGroups?: ProductGroup[];
  }): Promise<ProductBreakdown> {
    const { data, error } = await supabase.rpc("get_budgetia_product_breakdown", {
      p_period: input.period,
      p_reference_date: input.referenceDate,
      p_category_ids: input.categoryIds?.length ? input.categoryIds : null,
      p_product_groups: input.productGroups?.length ? input.productGroups : null,
      p_space_id: this.spaceId,
    });
    if (error || !data) {
      throw toApiError(
        error ?? { message: "missing breakdown" },
        "Impossible d’analyser les pôles produit.",
      );
    }
    return data as ProductBreakdown;
  }

  async updateExpense(
    id: string,
    input: {
      amount: string;
      categoryId: string;
      note?: string;
      spentAt: string;
    },
  ): Promise<Expense> {
    getPeriodRange("month", input.spentAt);
    const note = input.note?.trim() ?? "";
    if (note.length > 160) throw new ApiError("La note est limitée à 160 caractères.");
    const { data, error } = await supabase
      .from("expenses")
      .update({
        amount_cents: parseMoneyToCents(input.amount),
        category_id: input.categoryId,
        note,
        spent_at: input.spentAt,
      })
      .eq("space_id", this.spaceId)
      .eq("id", id)
      .select("id")
      .single();
    if (error || !data) {
      throw toApiError(
        error ?? { message: "missing expense update" },
        "Impossible de modifier la dépense.",
      );
    }
    return this.getExpense(data.id as string);
  }

  async deleteExpense(id: string): Promise<void> {
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("space_id", this.spaceId)
      .eq("id", id);
    if (error) throw toApiError(error, "Impossible de supprimer la dépense.");
  }

  async getSummary(input: {
    period: Period;
    referenceDate: string;
    categoryIds?: string[];
  }): Promise<SpendingSummary> {
    const { data, error } = await supabase.rpc("get_budgetia_spending_summary", {
      p_period: input.period,
      p_reference_date: input.referenceDate,
      p_category_ids: input.categoryIds?.length ? input.categoryIds : null,
      p_space_id: this.spaceId,
    });
    if (error || !data) {
      throw toApiError(
        error ?? { message: "missing summary" },
        "Impossible de calculer l’analyse.",
      );
    }
    return data as SpendingSummary;
  }

  async getSettings(): Promise<BudgetSettings> {
    const { data, error } = await supabase
      .from("budget_settings")
      .select("currency,monthly_budget_cents")
      .eq("space_id", this.spaceId)
      .single();
    if (error) throw toApiError(error, "Impossible de charger le budget.");
    return {
      currency: "EUR",
      monthlyBudgetCents: Number(data.monthly_budget_cents),
    };
  }

  async setMonthlyBudget(amount: string): Promise<number> {
    const monthlyBudgetCents = parseMoneyToCents(amount);
    const { data, error } = await supabase
      .from("budget_settings")
      .update({ monthly_budget_cents: monthlyBudgetCents })
      .eq("space_id", this.spaceId)
      .select("monthly_budget_cents")
      .single();
    if (error) throw toApiError(error, "Impossible d’enregistrer le budget.");
    return Number(data.monthly_budget_cents);
  }
}

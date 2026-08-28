export type Period = "week" | "month" | "year";
export type ChartType = "donut" | "bar" | "line";

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  isFallback: boolean;
  createdAt: string;
  archivedAt: string | null;
}

export interface Expense {
  id: string;
  amountCents: number;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  note: string;
  spentAt: string;
  source: "mobile" | "chatgpt";
  createdAt: string;
  updatedAt: string;
  hasReceipt?: boolean;
}

export type ProductGroup =
  | "fruits_vegetables"
  | "meat_fish"
  | "dairy_eggs"
  | "bakery"
  | "pantry"
  | "drinks"
  | "snacks"
  | "hygiene"
  | "household"
  | "baby"
  | "pet"
  | "other";

export interface ProductGroupDefinition {
  key: ProductGroup;
  label: string;
  color: string;
}

export interface ReceiptItemDraft {
  label: string;
  amountCents: number;
  productGroup: ProductGroup;
}

export interface ReceiptAnalysis {
  merchant: string;
  detectedTotalCents: number | null;
  items: ReceiptItemDraft[];
  warnings: string[];
}

export interface ReceiptItem extends ReceiptItemDraft {
  id: string;
  position: number;
}

export interface ReceiptDetails {
  id: string;
  expenseId: string;
  merchant: string;
  source: "mobile" | "chatgpt";
  createdAt: string;
  items: ReceiptItem[];
}

export interface ProductGroupTotal {
  key: ProductGroup;
  label: string;
  amountCents: number;
  percentage: number;
}

export interface ProductBreakdown {
  range: DateRange;
  period: Period;
  totalCents: number;
  receiptCount: number;
  productGroups: ProductGroupTotal[];
}

export const PRODUCT_GROUPS: readonly ProductGroupDefinition[] = [
  { key: "fruits_vegetables", label: "Fruits et légumes", color: "#52B788" },
  { key: "meat_fish", label: "Viande et poisson", color: "#F46F61" },
  { key: "dairy_eggs", label: "Produits laitiers et œufs", color: "#78A6C8" },
  { key: "bakery", label: "Boulangerie", color: "#D79A53" },
  { key: "pantry", label: "Épicerie", color: "#A78B62" },
  { key: "drinks", label: "Boissons", color: "#4D96B8" },
  { key: "snacks", label: "Snacks et sucreries", color: "#C97AA6" },
  { key: "hygiene", label: "Hygiène", color: "#7A77B9" },
  { key: "household", label: "Entretien", color: "#93B29A" },
  { key: "baby", label: "Bébé", color: "#E9A6B5" },
  { key: "pet", label: "Animaux", color: "#8C7B6B" },
  { key: "other", label: "Autres produits", color: "#7C8798" },
] as const;

export interface DateRange {
  startDate: string;
  endDate: string;
}

export interface CategoryTotal {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  amountCents: number;
  percentage: number;
}

export interface SeriesPoint {
  key: string;
  label: string;
  amountCents: number;
  startDate: string;
  endDate: string;
}

export interface SpendingSummary {
  range: DateRange;
  period: Period;
  totalCents: number;
  transactionCount: number;
  categoryTotals: CategoryTotal[];
  series: SeriesPoint[];
  comparisonPercentage: number | null;
  previousTotalCents: number | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const WEEKDAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MONTH_LABELS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Juin",
  "Juil",
  "Août",
  "Sept",
  "Oct",
  "Nov",
  "Déc",
];

function parseISODate(date: string): Date {
  if (!ISO_DATE.test(date)) {
    throw new Error(`Date invalide: ${date}`);
  }
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || toISODate(parsed) !== date) {
    throw new Error(`Date invalide: ${date}`);
  }
  return parsed;
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayISO(now = new Date()): string {
  return toISODate(now);
}

export function addDays(date: string, days: number): string {
  const parsed = parseISODate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return toISODate(parsed);
}

export function addMonths(date: string, months: number): string {
  const parsed = parseISODate(date);
  const day = parsed.getUTCDate();
  parsed.setUTCDate(1);
  parsed.setUTCMonth(parsed.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  parsed.setUTCDate(Math.min(day, lastDay));
  return toISODate(parsed);
}

export function getPeriodRange(period: Period, referenceDate: string): DateRange {
  const reference = parseISODate(referenceDate);
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();

  if (period === "week") {
    const mondayOffset = (reference.getUTCDay() + 6) % 7;
    const startDate = addDays(referenceDate, -mondayOffset);
    return { startDate, endDate: addDays(startDate, 6) };
  }

  if (period === "month") {
    return {
      startDate: toISODate(new Date(Date.UTC(year, month, 1, 12))),
      endDate: toISODate(new Date(Date.UTC(year, month + 1, 0, 12))),
    };
  }

  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

export function getPreviousPeriodRange(
  period: Period,
  referenceDate: string,
): DateRange {
  const current = getPeriodRange(period, referenceDate);
  const days =
    Math.round(
      (parseISODate(current.endDate).getTime() -
        parseISODate(current.startDate).getTime()) /
        DAY_MS,
    ) + 1;
  const endDate = addDays(current.startDate, -1);
  return { startDate: addDays(endDate, -(days - 1)), endDate };
}

export function movePeriod(
  period: Period,
  referenceDate: string,
  direction: -1 | 1,
): string {
  if (period === "week") return addDays(referenceDate, direction * 7);
  if (period === "month") return addMonths(referenceDate, direction);
  return addMonths(referenceDate, direction * 12);
}

export function isDateInRange(date: string, range: DateRange): boolean {
  return date >= range.startDate && date <= range.endDate;
}

export function normalizeCategoryName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

function normalizeProductLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLocaleLowerCase("fr");
}

const PRODUCT_GROUP_KEYWORDS: ReadonlyArray<[
  ProductGroup,
  readonly string[],
]> = [
  ["baby", ["bebe", "couche", "lingette", "lait infantile", "petit pot"]],
  ["pet", ["chien", "chat", "croquette", "litiere", "patee"]],
  ["hygiene", ["shampo", "savon", "dentifrice", "deodor", "gel douche", "rasoir", "brosse a dent", "protection hygien"]],
  ["household", ["lessive", "nettoy", "javel", "eponge", "essuie tout", "papier toilette", "liquide vaisselle", "sac poubelle"]],
  ["fruits_vegetables", ["pomme", "banane", "orange", "citron", "fraise", "raisin", "tomate", "carotte", "salade", "legume", "fruit", "avocat", "courgette", "oignon", "poire"]],
  ["meat_fish", ["poulet", "boeuf", "steak", "jambon", "viande", "saumon", "thon", "poisson", "crevette", "dinde", "porc"]],
  ["dairy_eggs", ["lait", "yaourt", "fromage", "beurre", "creme", "oeuf", "mozzarella"]],
  ["bakery", ["pain", "baguette", "croissant", "brioche", "viennoiser", "tortilla"]],
  ["drinks", ["eau", "jus", "soda", "cola", "cafe", "the ", "biere", "vin", "boisson"]],
  ["snacks", ["biscuit", "chocolat", "bonbon", "chips", "gateau", "glace", "snack"]],
  ["pantry", ["pate", "riz", "farine", "sucre", "huile", "sel", "conserve", "sauce", "cereale", "epice", "soupe"]],
];

export function classifyProductGroup(label: string): ProductGroup {
  const normalized = ` ${normalizeProductLabel(label)} `;
  for (const [group, keywords] of PRODUCT_GROUP_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) return group;
  }
  return "other";
}

const RECEIPT_PRICE_AT_END = /(?:^|\s)(\d{1,7}[.,]\d{2})\s*(?:€|eur)?\s*$/i;
const RECEIPT_NOISE = /\b(?:sous[ -]?total|total|tva|taxe|carte|visa|mastercard|paiement|rendu|monnaie|especes|cb|ticket|caisse|terminal|montant|a payer|avoir)\b/i;
const RECEIPT_DATE_OR_CODE = /^(?:\d{1,2}[\/.:-]){2,}|^(?:siret|ape|tel|www\.|https?:|n°|no\s)/i;

function receiptAmount(line: string): number | null {
  const match = line.match(RECEIPT_PRICE_AT_END);
  if (!match?.[1]) return null;
  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return null;
  return Math.round(amount * 100);
}

function receiptLabel(line: string): string {
  return line
    .replace(RECEIPT_PRICE_AT_END, "")
    .replace(/^\s*[x*]?\s*\d+(?:[.,]\d+)?\s*[x×]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function parseReceiptText(rawText: string): ReceiptAnalysis {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 300);
  const warnings: string[] = [];
  let detectedTotalCents: number | null = null;

  for (const line of lines) {
    const amount = receiptAmount(line);
    if (amount !== null && /\btotal\b/i.test(line) && !/sous[ -]?total/i.test(line)) {
      detectedTotalCents = amount;
    }
  }

  const merchant =
    lines.slice(0, 10).find((line) => {
      const normalized = normalizeProductLabel(line);
      return normalized.length >= 3
        && /[a-z]/.test(normalized)
        && receiptAmount(line) === null
        && !RECEIPT_NOISE.test(normalized)
        && !RECEIPT_DATE_OR_CODE.test(normalized);
    })?.slice(0, 80) ?? "";

  const items: ReceiptItemDraft[] = [];
  let pendingLabel = "";
  for (const line of lines) {
    const amount = receiptAmount(line);
    const normalized = normalizeProductLabel(line);
    const isNoise = RECEIPT_NOISE.test(normalized) || RECEIPT_DATE_OR_CODE.test(normalized);
    if (amount === null) {
      if (!isNoise && /[a-z]/.test(normalized) && line !== merchant) {
        pendingLabel = receiptLabel(line);
      }
      continue;
    }
    if (isNoise) {
      pendingLabel = "";
      continue;
    }
    const inlineLabel = receiptLabel(line);
    const label = inlineLabel || pendingLabel;
    pendingLabel = "";
    if (!label || items.length >= 100) continue;
    items.push({ label, amountCents: amount, productGroup: classifyProductGroup(label) });
  }

  const itemTotal = items.reduce((sum, item) => sum + item.amountCents, 0);
  if (!items.length) {
    warnings.push("Aucune ligne de produit fiable n’a été détectée. Ajoutez les lignes manuellement.");
  }
  if (detectedTotalCents !== null && itemTotal !== detectedTotalCents) {
    const difference = detectedTotalCents - itemTotal;
    warnings.push(
      `Le total détecté diffère des lignes de ${Math.abs(difference) / 100} €. Vérifiez le ticket avant de l’enregistrer.`,
    );
  }
  if (lines.length >= 300) {
    warnings.push("Le texte du ticket était très long et a été tronqué pour l’analyse.");
  }
  return { merchant, detectedTotalCents, items, warnings };
}

export function parseMoneyToCents(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0 || value > 100_000_000) {
      throw new Error("Le montant doit être compris entre 0,01 et 100 000 000.");
    }
    return Math.round((value + Number.EPSILON) * 100);
  }
  const normalized = value
    .trim()
    .replace(/[€\s\u00a0]/g, "")
    .replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Le montant doit être un nombre positif avec deux décimales maximum.");
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    throw new Error("Le montant doit être compris entre 0,01 et 100 000 000.");
  }
  return Math.round(amount * 100);
}

function buildEmptySeries(period: Period, range: DateRange): SeriesPoint[] {
  if (period === "week") {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(range.startDate, index);
      const parsed = parseISODate(date);
      return {
        key: date,
        label: WEEKDAY_LABELS[parsed.getUTCDay()] ?? "",
        amountCents: 0,
        startDate: date,
        endDate: date,
      };
    });
  }

  if (period === "month") {
    const points: SeriesPoint[] = [];
    let cursor = range.startDate;
    let index = 1;
    while (cursor <= range.endDate) {
      const endDate = [addDays(cursor, 6), range.endDate].sort()[0] ?? range.endDate;
      points.push({
        key: cursor,
        label: `S${index}`,
        amountCents: 0,
        startDate: cursor,
        endDate,
      });
      cursor = addDays(endDate, 1);
      index += 1;
    }
    return points;
  }

  const year = Number(range.startDate.slice(0, 4));
  return Array.from({ length: 12 }, (_, month) => {
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDate = toISODate(new Date(Date.UTC(year, month + 1, 0, 12)));
    return {
      key: startDate.slice(0, 7),
      label: MONTH_LABELS[month] ?? "",
      amountCents: 0,
      startDate,
      endDate,
    };
  });
}

export function summarizeExpenses(options: {
  expenses: Expense[];
  categories: Category[];
  period: Period;
  referenceDate: string;
  categoryIds?: string[];
  previousExpenses?: Expense[];
}): SpendingSummary {
  const range = getPeriodRange(options.period, options.referenceDate);
  const allowed = options.categoryIds?.length
    ? new Set(options.categoryIds)
    : null;
  const expenses = options.expenses.filter(
    (expense) =>
      isDateInRange(expense.spentAt, range) &&
      (!allowed || allowed.has(expense.categoryId)),
  );
  const totalCents = expenses.reduce(
    (total, expense) => total + expense.amountCents,
    0,
  );

  const categoryById = new Map(options.categories.map((category) => [category.id, category]));
  const categoryAmounts = new Map<string, number>();
  for (const expense of expenses) {
    categoryAmounts.set(
      expense.categoryId,
      (categoryAmounts.get(expense.categoryId) ?? 0) + expense.amountCents,
    );
  }
  const categoryTotals = [...categoryAmounts]
    .map(([categoryId, amountCents]) => {
      const category = categoryById.get(categoryId);
      const fallbackExpense = expenses.find(
        (expense) => expense.categoryId === categoryId,
      );
      return {
        categoryId,
        name: category?.name ?? fallbackExpense?.categoryName ?? "Autre",
        color: category?.color ?? fallbackExpense?.categoryColor ?? "#93B29A",
        icon: category?.icon ?? fallbackExpense?.categoryIcon ?? "ellipsis-horizontal",
        amountCents,
        percentage: totalCents ? Math.round((amountCents / totalCents) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.amountCents - a.amountCents);

  const series = buildEmptySeries(options.period, range);
  for (const expense of expenses) {
    const point = series.find((candidate) =>
      isDateInRange(expense.spentAt, candidate),
    );
    if (point) point.amountCents += expense.amountCents;
  }

  const previousTotalCents = options.previousExpenses
    ? options.previousExpenses
        .filter((expense) => !allowed || allowed.has(expense.categoryId))
        .reduce((total, expense) => total + expense.amountCents, 0)
    : null;
  const comparisonPercentage =
    previousTotalCents === null || previousTotalCents === 0
      ? null
      : Math.round(((totalCents - previousTotalCents) / previousTotalCents) * 1000) / 10;

  return {
    range,
    period: options.period,
    totalCents,
    transactionCount: expenses.length,
    categoryTotals,
    series,
    comparisonPercentage,
    previousTotalCents,
  };
}

export function formatPeriodLabel(period: Period, referenceDate: string): string {
  const parsed = parseISODate(referenceDate);
  if (period === "year") return String(parsed.getUTCFullYear());
  if (period === "month") {
    const month = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(parsed);
    return month.charAt(0).toLocaleUpperCase("fr") + month.slice(1);
  }
  const range = getPeriodRange("week", referenceDate);
  const start = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseISODate(range.startDate));
  const end = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseISODate(range.endDate));
  return `${start} – ${end}`;
}

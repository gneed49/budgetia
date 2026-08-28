import { describe, expect, it } from "vitest";

import {
  classifyProductGroup,
  getPeriodRange,
  getPreviousPeriodRange,
  normalizeCategoryName,
  parseMoneyToCents,
  parseReceiptText,
  summarizeExpenses,
  type Category,
  type Expense,
} from "./index";

describe("receipt analysis", () => {
  it("extracts product lines, a merchant, a total and deterministic groups", () => {
    const result = parseReceiptText(`SUPER MARCHÉ\n26/08/2026 18:32\nPOMMES GOLDEN 3,20 €\nSHAMPOING DOUX 5,80\nTOTAL 9,00 EUR\nCB 9,00`);
    expect(result).toMatchObject({
      merchant: "SUPER MARCHÉ",
      detectedTotalCents: 900,
      items: [
        { label: "POMMES GOLDEN", amountCents: 320, productGroup: "fruits_vegetables" },
        { label: "SHAMPOING DOUX", amountCents: 580, productGroup: "hygiene" },
      ],
      warnings: [],
    });
  });

  it("associates an amount isolated on the following line", () => {
    expect(parseReceiptText("ÉPICERIE TEST\nBAGUETTE TRADITION\n1,20").items).toEqual([
      { label: "BAGUETTE TRADITION", amountCents: 120, productGroup: "bakery" },
    ]);
  });

  it("warns instead of inventing a reconciliation line", () => {
    const result = parseReceiptText("MAGASIN\nTOMATES 2,00\nTOTAL 3,00");
    expect(result.items).toHaveLength(1);
    expect(result.warnings[0]).toContain("diffère");
  });

  it("falls back to other for unknown labels", () => {
    expect(classifyProductGroup("Article spécial ZX42")).toBe("other");
  });
});

const categories: Category[] = [
  {
    id: "food",
    name: "Alimentation",
    color: "#169B68",
    icon: "basket-outline",
    isFallback: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "home",
    name: "Logement",
    color: "#93B29A",
    icon: "home-outline",
    isFallback: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
  },
];

function expense(
  id: string,
  amountCents: number,
  categoryId: string,
  spentAt: string,
): Expense {
  const category = categories.find((item) => item.id === categoryId)!;
  return {
    id,
    amountCents,
    categoryId,
    categoryName: category.name,
    categoryColor: category.color,
    categoryIcon: category.icon,
    note: "",
    spentAt,
    source: "mobile",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("money and category normalization", () => {
  it("parses French and dot-decimal amounts exactly", () => {
    expect(parseMoneyToCents("12,50 €")).toBe(1250);
    expect(parseMoneyToCents(4.2)).toBe(420);
    expect(parseMoneyToCents(126.4 + 3 * 2.15)).toBe(13285);
    expect(() => parseMoneyToCents("-4")).toThrow();
    expect(() => parseMoneyToCents("1,234")).toThrow();
  });

  it("normalizes accents and repeated whitespace", () => {
    expect(normalizeCategoryName("  Santé   & Bien-être ")).toBe(
      "sante & bien-etre",
    );
  });
});

describe("period ranges", () => {
  it("builds Monday-to-Sunday weeks and the matching previous range", () => {
    expect(getPeriodRange("week", "2026-08-26")).toEqual({
      startDate: "2026-08-24",
      endDate: "2026-08-30",
    });
    expect(getPreviousPeriodRange("week", "2026-08-26")).toEqual({
      startDate: "2026-08-17",
      endDate: "2026-08-23",
    });
  });

  it("handles leap-month boundaries", () => {
    expect(getPeriodRange("month", "2024-02-10")).toEqual({
      startDate: "2024-02-01",
      endDate: "2024-02-29",
    });
  });
});

describe("summarizeExpenses", () => {
  it("aggregates month weeks, categories, filters, and comparison", () => {
    const summary = summarizeExpenses({
      expenses: [
        expense("1", 2500, "food", "2026-08-02"),
        expense("2", 5000, "home", "2026-08-08"),
        expense("3", 1500, "food", "2026-08-09"),
        expense("outside", 9999, "food", "2026-07-31"),
      ],
      previousExpenses: [expense("previous", 4000, "food", "2026-07-08")],
      categories,
      period: "month",
      referenceDate: "2026-08-26",
    });

    expect(summary.totalCents).toBe(9000);
    expect(summary.transactionCount).toBe(3);
    expect(summary.categoryTotals.map(({ categoryId, amountCents }) => ({
      categoryId,
      amountCents,
    }))).toEqual([
      { categoryId: "home", amountCents: 5000 },
      { categoryId: "food", amountCents: 4000 },
    ]);
    expect(summary.series.map((point) => point.amountCents)).toEqual([
      2500,
      6500,
      0,
      0,
      0,
    ]);
    expect(summary.comparisonPercentage).toBe(125);
  });

  it("applies category filters before totals and comparison", () => {
    const summary = summarizeExpenses({
      expenses: [
        expense("1", 2500, "food", "2026-08-02"),
        expense("2", 5000, "home", "2026-08-08"),
      ],
      previousExpenses: [expense("previous", 2000, "food", "2026-07-08")],
      categories,
      period: "month",
      referenceDate: "2026-08-26",
      categoryIds: ["food"],
    });

    expect(summary.totalCents).toBe(2500);
    expect(summary.categoryTotals).toHaveLength(1);
    expect(summary.comparisonPercentage).toBe(25);
  });
});

import { describe, expect, it } from "vitest";

import type { Expense } from "@budgetia/domain";

import { expensesToCsv } from "./csv";

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    amountCents: 1234,
    categoryId: "category-1",
    categoryName: "Alimentation",
    categoryColor: "#52B788",
    categoryIcon: "basket-outline",
    note: "Marché",
    spentAt: "2026-08-28",
    source: "mobile",
    createdAt: "2026-08-28T10:00:00.000Z",
    updatedAt: "2026-08-28T10:00:00.000Z",
    ...overrides,
  };
}

describe("CSV expense export", () => {
  it("uses a UTF-8 BOM, stable columns and French decimal data", () => {
    expect(expensesToCsv([expense()])).toBe(
      "\uFEFFdate,montant_eur,categorie,note,source,identifiant\r\n" +
        "2026-08-28,12.34,Alimentation,Marché,mobile,expense-1\r\n",
    );
  });

  it("escapes commas, quotes and line breaks without spreadsheet formulas", () => {
    const csv = expensesToCsv([
      expense({
        categoryName: "Maison, travaux",
        note: '=HYPERLINK("https://example.test", "Vis inox")\nlot 2',
      }),
    ]);
    expect(csv).toContain('"Maison, travaux"');
    expect(csv).toContain(
      '"\'=HYPERLINK(""https://example.test"", ""Vis inox"")\nlot 2"',
    );
  });
});

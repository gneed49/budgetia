import { describe, expect, it } from "vitest";

import {
  currentMonthRange,
  normalizeCategoryName,
  parseAddExpense,
  parseDeleteCategory,
  parseListExpenses,
  parseSpaceSelection,
  parseSummary,
  parseUpdateCategory,
  tools,
} from "./budgetia-mcp";

describe("Budgetia MCP contract", () => {
  it("publishes a deterministic, OAuth-protected tool catalog", () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      "list_budget_spaces",
      "list_categories",
      "create_category",
      "update_category",
      "delete_category",
      "add_expense",
      "list_expenses",
      "get_spending_summary",
    ]);
    for (const tool of tools) {
      expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["email"] }]);
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
  });

  it("parses a precise and retry-safe expense", () => {
    expect(
      parseAddExpense({
        amount: 12.5,
        category: " Alimentation ",
        note: " Marché ",
        date: "2026-08-26",
        request_id: "chatgpt-1234",
        budget_space_id: "33333333-3333-4333-8333-333333333333",
      }),
    ).toEqual({
      amountCents: 1250,
      category: "Alimentation",
      note: "Marché",
      date: "2026-08-26",
      requestId: "chatgpt-1234",
      budgetSpaceId: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("allows an unclassified expense and validates category lifecycle actions", () => {
    expect(parseAddExpense({ amount: 4.5 }, "2026-08-26")).toEqual({
      amountCents: 450,
      note: "",
      date: "2026-08-26",
    });
    expect(
      parseUpdateCategory({
        category: "Transport",
        name: "Mobilité",
        transfer_expenses_to: "Non classée",
      }),
    ).toEqual({
      category: "Transport",
      name: "Mobilité",
      transferExpensesTo: "Non classée",
    });
    expect(
      parseDeleteCategory({
        category: "Mobilité",
        strategy: "transfer",
        transfer_expenses_to: "Non classée",
      }),
    ).toEqual({
      category: "Mobilité",
      strategy: "transfer",
      transferExpensesTo: "Non classée",
    });
    expect(() =>
      parseUpdateCategory({ category: "Transport" }),
    ).toThrow("name");
    expect(() =>
      parseDeleteCategory({ category: "Transport", strategy: "transfer" }),
    ).toThrow("transfer_expenses_to");
  });

  it("defaults expense lists to the current month and validates bounds", () => {
    expect(currentMonthRange("2024-02-15")).toEqual({
      startDate: "2024-02-01",
      endDate: "2024-02-29",
    });
    expect(parseListExpenses({}, "2026-08-26")).toMatchObject({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      limit: 50,
    });
    expect(() =>
      parseListExpenses({ start_date: "2026-08-20", end_date: "2026-08-01" }),
    ).toThrow("start_date");
  });

  it("normalizes category matching and rejects invalid summary periods", () => {
    expect(normalizeCategoryName("  Santé  ")).toBe("sante");
    expect(parseSummary({ categories: ["Santé"] }, "2026-08-26")).toEqual({
      period: "month",
      referenceDate: "2026-08-26",
      categories: ["Santé"],
    });
    expect(() => parseSummary({ period: "quarter" })).toThrow("period");
  });

  it("validates explicit shared budget selection", () => {
    expect(
      parseSpaceSelection({
        budget_space_id: "33333333-3333-4333-8333-333333333333",
      }),
    ).toEqual({ budgetSpaceId: "33333333-3333-4333-8333-333333333333" });
    expect(() => parseSpaceSelection({ budget_space_id: "not-an-id" })).toThrow(
      "UUID",
    );
  });
});

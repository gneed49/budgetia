import type { Expense } from "@budgetia/domain";

function csvCell(value: string | number): string {
  const text = String(value);
  const spreadsheetSafe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(spreadsheetSafe)
    ? `"${spreadsheetSafe.replace(/"/g, '""')}"`
    : spreadsheetSafe;
}

export function expensesToCsv(expenses: Expense[]): string {
  const rows = [
    ["date", "montant_eur", "categorie", "note", "source", "identifiant"],
    ...expenses.map((expense) => [
      expense.spentAt,
      (expense.amountCents / 100).toFixed(2),
      expense.categoryName,
      expense.note,
      expense.source,
      expense.id,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

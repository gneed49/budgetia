import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import type { Expense } from "@budgetia/domain";

import { expensesToCsv } from "./csv";

export { expensesToCsv } from "./csv";

export async function exportExpensesCsv(
  expenses: Expense[],
  spaceName: string,
): Promise<string> {
  const safeName = spaceName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase() || "budget";
  const fileName = `budgetia-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`;
  const content = expensesToCsv(expenses);

  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return fileName;
  }

  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Le partage de fichiers n’est pas disponible sur cet appareil.");
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text",
    dialogTitle: "Exporter les dépenses Budgetia",
  });
  return fileName;
}
